// SPDX-License-Identifier: MIT
// THE MACHINE, the page: one machine in a frame, a search over the catalogue,
// the states beside the frame, NOW PLAYING with its provenance, the keys, and
// the way out. Nothing runs until a LOAD is pressed. The machine document is
// sandboxed and fed over the bridge (bridge-client.js); every read from the
// chain and every claim about it is chain.js's; this file is the page.
import { createMachine, bootMachine, partsFromSite, sha256Hex, STATUS } from './bridge-client.js';
import { Node, machineFromChain, firmwareFromChain, programFromChain, revisionsOf, zeroWindow } from './chain.js';
import { keccakHex } from './keccak.js';
import { scanProgram, needsOf, inputOf, scanWords, loadsMore, hex4, scanCartridge, needsOfCartridge, cartridgeWords } from './scan.js';
import { parseD64, readFile as readDiskFile, D64_SIZES } from './d64.js';
import { readCRT, isCRT } from './crt.js';
import { createAudio } from './audio.js';

const PAGE = 'machine/2b';
const $ = (id) => document.getElementById(id);
const els = {
  frame: $('frame'), veil: $('veil'), veilText: $('veil-text'), search: $('search'), rows: $('rows'),
  state: $('state'), log: $('log'), now: $('now'), json: $('provenance-json'), copy: $('copy'), copied: $('copied'),
  input: $('input-mode'), reset: $('reset'), retry: $('retry'), touch: $('touch'), copyLog: $('copy-log'),
  sound: $('sound'), ring: $('ring'), ways: $('ways'), firmware: $('firmware'), firmwareWhy: $('firmware-why'),
  door: $('door'), doorText: $('door-text'), file: $('file'), disk: $('disk'), diskName: $('disk-name'), diskCount: $('disk-count'), diskRows: $('disk-rows'),
  paste: $('paste'), runPaste: $('run-paste'), pasteNote: $('paste-note'),
  link: $('link'), linkChain: $('link-chain'), linkState: $('link-state'), linkNode: $('link-node'), linkBlock: $('link-block'), linkEndpoints: $('link-endpoints'),
};
const audio = createAudio({ onStatus: (t) => say(t) });

let catalogue = null, node = null, machine = null, machineFacts = null, playing = null, lastAsk = null;
let busy = false, pendingAsk = null, pendingFirmware = null;
let inputMode = 'joystick', inputWhy = 'the programs of the series read port 2';   // 'joystick' is port 2, 'joystick1' port 1, 'joysticks' both ports, 'keyboard' the matrix
const joyPort = () => (inputMode === 'joystick1' ? 1 : inputMode === 'joysticks' ? 0 : 2);
const inputAsk = () => ({ mode: inputMode === 'keyboard' ? 'keyboard' : 'joystick', port: joyPort() });
let firmwareMode = 'auto';   // the switch: 'auto' decides per program; 'off' bare, as the programs of the series run on chain; 'on' OpenROMs pressing 1, READY first
let firmwareOn = false;      // the machine as built: with the ROMs, or bare
let firmwareWhy = 'a program of the chain runs bare, as it does on chain';   // what decided the build, for the words
const FIRMWARE_NAME = 'OpenROMs pressing 1';
const PRESSING_REPO = 'https://github.com/DeMEdPit/openroms-ethereum-pressing-1';   // the pressing's public repository: its source, its build and its record
// the explorer the links open, by the catalogue's chain: a second source for every claim NOW PLAYING makes; an unknown chain gets no links
const EXPLORERS = { 1: 'https://etherscan.io', 11155111: 'https://sepolia.etherscan.io' };
const explorer = () => (catalogue && EXPLORERS[catalogue.chainId]) || null;
const state = { phase: 'off' };
const LOG_LINES = 14;
const fullLog = [];
const SHORT = (h) => (h ? h.slice(0, 12) + '…' : '');
const num = (n) => Number(n).toLocaleString('en-US');

let lastSaid = null;   // the newest line: the same thing said again is counted on it, not written again
function say(text) {
  if (lastSaid && lastSaid.text === text) {
    lastSaid.n++;
    lastSaid.li.textContent = `${text} ×${lastSaid.n}`;
    fullLog[fullLog.length - 1] = `${lastSaid.stamp} ${text} ×${lastSaid.n}`;
  } else {
    const stamp = new Date().toISOString().slice(11, 23);
    fullLog.push(`${stamp} ${text}`);
    const li = document.createElement('li');
    li.textContent = text;
    els.log.appendChild(li);
    while (els.log.children.length > LOG_LINES) els.log.removeChild(els.log.firstChild);
    lastSaid = { text, n: 1, li, stamp };
  }
  bayLines();
}
/** Everything a report needs, as one block: the page, the browser, the state, the provenance, the whole log. */
function report() {
  return [
    `THE MACHINE · ${PAGE} · ${new Date().toISOString()}`,
    `browser: ${navigator.userAgent}`,
    `state: ${state.phase} · ${els.state.textContent}`,
    `machine: ${machine ? (machine.alive ? 'alive' : 'destroyed (' + (machine.reason ? machine.reason.code + ': ' + machine.reason.text : 'no reason') + ')') : 'none'}`,
    `provenance: ${els.json.value ? els.json.value.replace(/\s+/g, ' ') : 'none'}`,
    'log:',
    ...fullLog.map((l) => '  ' + l),
  ].join('\n');
}
function setState(phase, text) {
  state.phase = phase;
  els.state.textContent = text;
  els.state.dataset.phase = phase;
  document.body.dataset.phase = phase;
  els.retry.hidden = phase !== 'failed';
}
function veil(text) {
  els.veil.hidden = !text;
  if (text) els.veilText.textContent = text;
}

// ------------------------------------------------------------------ the link: an instrument on the node's own state
const LINK_WORDS = { off: 'OFF', seeking: 'SEEKING', reading: 'READING', held: 'HELD', refused: 'REFUSED', lost: 'LOST' };
/** The badge names the chain it reads, from the catalogue's chain id, so the word stays true if another chain ever appears. */
const CHAIN_NAMES = { 1: 'ETHEREUM', 11155111: 'SEPOLIA' };
const chainName = (id) => CHAIN_NAMES[id] || `CHAIN ${id}`;
/** The distinctive part of a node's name for the badge (publicnode, llamarpc, drpc, ankr, merkle, 1rpc); the whole name stays in the title and in NOW PLAYING. */
const shortHost = (h) => { const host = String(h).replace(/^https?:\/\//, '').split('/')[0]; const parts = host.split('.'); return parts.length >= 2 ? parts[parts.length - 2] : h; };
function renderLink(st) {
  els.link.dataset.phase = st.phase;
  els.linkState.textContent = LINK_WORDS[st.phase] || st.phase.toUpperCase();
  // two forms of the words: short for the badge on a phone, long where the desktop leaves room; CSS shows one
  const pair = (el, short, long) => { el.textContent = ''; for (const [cls, text] of [['s', short], ['l', long]]) { const b = document.createElement('span'); b.className = cls; b.textContent = text; el.appendChild(b); } };
  const none = st.phase === 'off' ? 'no node yet' : 'no node';
  pair(els.linkNode, st.host ? shortHost(st.host) : none, st.host || none);
  // both forms keep one width, on fixed columns: while a read is in flight the reads take the place of the block
  // number (short form) or of the block's hash (long form), and a node set aside shows as its red cell; the words
  // for it are in the badge's title and in NOW PLAYING
  const reading = st.phase === 'reading' && st.reads ? `${st.reads} read${st.reads === 1 ? '' : 's'}` : null;
  pair(els.linkBlock, reading || (st.block ? `#${st.block}` : ''), st.block ? `block ${num(st.block)} · ${reading || SHORT(st.blockHash)}` : (reading || ''));
  const chain = catalogue ? `${chainName(catalogue.chainId)} (chain ${catalogue.chainId})` : 'the chain';
  const aside = st.setAside ? ` · ${st.setAside} set aside this visit` : '';
  els.link.title = (st.host ? `${chain} · ${st.host}${st.block ? ` · block ${num(st.block)} · ${st.blockHash}` : ''}` : `${chain} · no node yet`) + aside;
  els.linkEndpoints.textContent = '';
  for (const e of st.endpoints) {
    const i = document.createElement('i');
    i.dataset.state = e.state;
    i.title = `${e.host}: ${e.state === 'set-aside' ? 'set aside for this visit, ' + e.why : e.state === 'demoted' ? 'did not answer; tried last' : e.state === 'in-use' ? 'serving this read' : e.state === 'held' ? 'served the last read' : 'live'}`;
    els.linkEndpoints.appendChild(i);
  }
}

// ------------------------------------------------------------------ the catalogue and the rows
function rowsOf(cat) {
  const out = [];
  for (const w of cat.works) {
    if (w.program.kind === 'stamped') {
      for (const r of w.rows) {
        out.push({ work: w.key, token: r.id, title: `${r.id} · ${r.character}`, sub: `${r.colourName.toLowerCase()} · ${r.wallName.toLowerCase()} wall · ${r.batsName.toLowerCase()} ${r.batsName === 'One' ? 'bat' : 'bats'} · ${r.candleName.toLowerCase()}`,
          group: w.name, words: `${w.name} ${w.key} ${r.id} ${r.character} ${r.colourName} ${r.wallName} ${r.batsName} ${r.candleName} ${r.behaviour === 7 ? 'blackout' : ''}`.toLowerCase(),
          note: 'stamped with the block you load it at' });
      }
    } else if (w.program.kind === 'slotted') {
      for (let id = 1; id <= w.tokens.count; id++) {
        out.push({ work: w.key, token: id, title: `${id} · the head mind`, sub: 'the frozen program with the mind the chain holds now; REVISIONS lists every mind it has held', group: w.name,
          words: `${w.name} ${w.key} perception ${id} mind brain head canary revision revisions genesis`.toLowerCase(), note: 'the head revision is read when you load it', revisions: true });
      }
    } else {
      out.push({ work: w.key, token: 1, title: w.name, sub: 'one whole program, pinned by its hash', group: w.name,
        words: `${w.name} ${w.key} ${w.key === 'ready64' ? 'ready 64 console basic' : 'tony demo born for adventure'}`.toLowerCase(), note: '' });
    }
  }
  return out;
}
let allRows = [], countText = '';
function renderRows(filter) {
  const q = (filter || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = allRows.filter((r) => q.every((t) => r.words.includes(t)));
  els.rows.textContent = '';
  let group = null;
  for (const r of shown) {
    if (r.group !== group) {
      group = r.group;
      const h = document.createElement('div');
      h.className = 'g';
      h.textContent = group;
      els.rows.appendChild(h);
    }
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.work = r.work; row.dataset.token = String(r.token);
    row.innerHTML = `<div class="t"><span class="title"></span><span class="sub"></span></div>${r.revisions ? '<button class="more" type="button">REVISIONS</button>' : ''}<button class="load" type="button">LOAD</button>`;
    row.querySelector('.title').textContent = r.title;
    row.querySelector('.sub').textContent = r.sub;
    row.querySelector('button:last-child').addEventListener('click', () => load(r.work, r.token));
    if (r.revisions) row.querySelector('.more').addEventListener('click', () => listRevisions(r.work, r.token, row));
    els.rows.appendChild(row);
    if (r.revisions && revisionRows.has(`${r.work}/${r.token}`)) for (const sub of revisionRows.get(`${r.work}/${r.token}`)) els.rows.appendChild(sub);
  }
  countText = shown.length === allRows.length ? `${allRows.length} programs` : `${shown.length} of ${allRows.length} programs`;
  bayLines();
}

// ------------------------------------------------------------------ the revisions of a mind
// REVISIONS on a mind's row reads its head and every record through one node at one block and lists them under the
// row: genesis first, the blank slot the program ships, then each save with its lessons, its block and who saved it.
// The list is the node's word (NODE-REPORTED); a revision is held to its hash when it is loaded.
const revisionRows = new Map();   // work/token -> the rows listed, kept across a re-render of the list
const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
async function listRevisions(work, token, row) {
  const key = `${work}/${token}`;
  if (revisionRows.has(key)) { for (const sub of revisionRows.get(key)) sub.remove(); revisionRows.delete(key); return; }   // a second press folds the list
  const more = row.querySelector('.more');
  more.disabled = true; more.textContent = 'READING';
  try {
    if (!catalogue) throw Object.assign(new Error('the catalogue has not loaded'), { code: 'NO_CATALOGUE' });
    node = node || new Node(catalogue.endpoints, catalogue.chainId, say, renderLink);
    const { head, revisions, observation } = await revisionsOf(node, catalogue, work, token, say);
    say(`${revisions.length} revisions of token ${token}'s mind, 0 to ${head}, from ${observation.node} at block ${num(observation.block)}: NODE-REPORTED until one is loaded`);
    const subs = [];
    for (const rec of revisions.slice().reverse()) {
      const sub = document.createElement('div');
      sub.className = 'row sub';
      sub.dataset.work = work; sub.dataset.token = String(token); sub.dataset.revision = String(rec.r);
      sub.innerHTML = `<div class="t"><span class="title"></span><span class="sub"></span></div><button class="load" type="button">LOAD</button>`;
      sub.querySelector('.title').textContent = `revision ${rec.r}${rec.r === head ? ' · the head' : rec.r === 0 ? ' · genesis' : ''}`;
      sub.querySelector('.sub').textContent = rec.r === 0 ? `the blank slot the program ships · hash ${SHORT(rec.canonicalHash)}`
        : `${rec.educationCount} lesson${rec.educationCount === 1 ? '' : 's'} taught in all · saved at block ${num(rec.savedAtBlock)} by ${shortAddr(rec.savedBy)} · hash ${SHORT(rec.canonicalHash)}`;
      sub.querySelector('button').addEventListener('click', () => load(work, token, rec.r));
      subs.push(sub);
    }
    revisionRows.set(key, subs);
    let after = row;
    for (const sub of subs) { after.insertAdjacentElement('afterend', sub); after = sub; }
    if (playing && playing.program.facts.work === work && playing.program.facts.token === token) markOffered(work, token, playing.program.facts.revision);
  } catch (e) {
    say(`the revisions could not be listed (${e.code || 'FAILED'}): ${e.message}`);
  } finally {
    more.disabled = false; more.textContent = 'REVISIONS';
  }
}

// ------------------------------------------------------------------ the file door
// A file of the visitor's becomes the same record a chain program is, judged for its shape and for nothing else:
// the status is YOUR FILE and no chain claim is made. It is read in this browser and sent nowhere. What is not a
// program the machine loads is refused with a code and a sentence that names what the file is.
const FILE_LIMIT = 65538;   // a two-byte load address and at most 64K after it: the machine document's own limit (PROTOCOL.md)
const refuse = (code, text) => { throw Object.assign(new Error(text), { code }); };
/** The same record for bytes from anywhere: a .prg, a program picked off a disk, a paste. The shape is checked (a load
 *  address, a size that fits), the bytes read for what they need, recognised if they are the series' own; no chain claim. */
async function programFromBytes(bytes, meta) {
  const name = meta.name, size = bytes.length;
  if (size < 3) refuse('PRG_TOO_SHORT', `${name} is ${size} byte${size === 1 ? '' : 's'}; a program file carries a two-byte load address and at least one byte after it`);
  if (size > FILE_LIMIT) refuse('FILE_TOO_LARGE', `${name} is ${num(size)} bytes; a program is at most 65,536 bytes after its load address`);
  const load = bytes[0] | (bytes[1] << 8);
  if (load + size - 2 > 0x10000) refuse('PRG_ADDRESS_OVERFLOW', `${name} loads at ${hex4(load)} and its ${num(size - 2)} bytes would run past 64K`);
  const sha256 = await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const scan = scanProgram(bytes), needs = needsOf(scan), known = await recognise(bytes);
  return { kind: 'file', label: meta.label.slice(0, 80), bytes, statuses: { program: STATUS.YOUR_FILE },
    facts: { work: 'file', workName: 'your file', contract: null, token: null, name, size, source: meta.source, file: meta.file || null, pasted: meta.pasted || null,
      load, sha256, scan, needs, known, node: null, observation: null, reads: [] } };
}
const fileFacts = (file) => ({ name: file.name || 'a file', size: file.size, type: file.type || '', modified: Number.isFinite(file.lastModified) ? new Date(file.lastModified).toISOString() : null });
const isDiskFile = (file) => !!D64_SIZES[file.size] || /\.d64$/i.test(file.name || '');
/** A .prg of the visitor's: what is not one is refused with a code and a sentence that names what the file is. */
async function programFromFile(file) {
  const name = file.name || 'a file', size = file.size;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const first = Array.from(head.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join(' ');
  if (isCRT(head)) return programFromCartridge(file, new Uint8Array(await file.arrayBuffer()));
  if (!/\.prg$/i.test(name)) refuse('KIND_UNSUPPORTED', `${name} is not a .prg file (${num(size)} bytes${first ? ', beginning ' + first : ''}); this page loads .prg files, .d64 disk images, .crt cartridges and pasted hex`);
  if (size > FILE_LIMIT) refuse('FILE_TOO_LARGE', `${name} is ${num(size)} bytes; a program is at most 65,536 bytes after its load address`);
  return programFromBytes(new Uint8Array(await file.arrayBuffer()), { name, label: name, source: 'file', file: fileFacts(file) });
}
// A cartridge: read as the machine reads it and refused at the door with the machine's own code if the machine would refuse
// or, worse, trap; its banks scanned as a program is, for AUTO and the words. The machine can attach a cartridge but not
// remove it, so a cartridge gets a fresh machine and everything after it starts another.
async function programFromCartridge(file, bytes) {
  const name = file.name || 'a cartridge';
  let c;
  try { c = readCRT(bytes); } catch (e) { refuse(e.code || 'CRT_BAD_FILE', `${name}: ${e.message}`); }
  const sha256 = await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const scan = scanCartridge(c.chips), needs = needsOfCartridge(scan);
  return { kind: 'file', cart: true, label: name.slice(0, 80), bytes, statuses: { program: STATUS.YOUR_FILE },
    facts: { work: 'file', workName: 'your file', contract: null, token: null, name, size: bytes.length, source: 'cartridge', file: fileFacts(file), pasted: null,
      load: null, sha256, scan, needs, known: null, cartridge: { title: c.title, type: c.type, typeName: c.typeName, exrom: c.exrom, game: c.game, chips: c.chips.map(({ bank, load, size }) => ({ bank, load, size })), size: c.size },
      node: null, observation: null, reads: [] } };
}
// A disk: opened, its directory listed, nothing run until a program is picked. The machine has no drive (nopsta's build
// has nothing behind its serial bus), so a program of a disk runs alone, and one that loads more from the disk stops there.
let disk = null;   // the open disk: { file, image, dir }
async function openDisk(file) {
  const name = file.name || 'a disk';
  fileLine = { name, state: 'busy' };
  door('busy', `reading ${name}`);
  try {
    const image = new Uint8Array(await file.arrayBuffer());
    const dir = parseD64(image);
    const programs = dir.entries.filter((e) => e.typeName === 'PRG');
    if (!programs.length) refuse('D64_EMPTY', `${name}${dir.name ? ` ("${dir.name}")` : ''}: no program in its directory (${dir.entries.length} ${dir.entries.length === 1 ? 'entry' : 'entries'}, none PRG)`);
    // each program read and scanned now, so its row says what would stop it on this machine before LOAD is pressed
    for (const e of programs) {
      try {
        const bytes = readDiskFile(image, e, FILE_LIMIT);
        if (bytes.length < 3) { e.note = 'too short to be a program'; continue; }
        const scan = scanProgram(bytes);
        const notes = [];
        if (loadsMore(scan)) notes.push('loads more from the disk: stops at the drive here');
        if (scan.kernal.internal && scan.kernal.table) notes.push(`may call the KERNAL's internals (${scan.kernal.internal} candidate${scan.kernal.internal === 1 ? '' : 's'}), which OpenROMs need not match`);
        e.note = notes.join(' · ');
      } catch (err) { e.note = `unreadable: ${err.message}`; e.unreadable = true; }
    }
    disk = { file: fileFacts(file), image, dir, summary: `${name} · ${dir.name || 'unnamed'} · ${programs.length} program${programs.length === 1 ? '' : 's'} · pick one below` };
    renderDisk();
    fileLine = { name, state: 'disk' };
    door('ok', disk.summary);
    say(`your disk ${name}: ${num(image.length)} bytes, ${dir.tracks} tracks${dir.errorBytes ? ' with error bytes' : ''}, "${dir.name}" ${dir.id} ${dir.dos}, ${dir.entries.length} entries, ${programs.length} PRG; read in this browser, sent nowhere; the machine has no drive, so a program of it runs alone`);
  } catch (e) {
    const code = e.code || 'FAILED';
    disk = null; els.disk.hidden = true;
    fileLine = { name, state: 'refused' };
    door('refused', `${code} · ${e.message}`);
    say(`your disk was refused (${code}): ${e.message}`);
  }
}
function renderDisk() {
  const { file, dir } = disk;
  els.diskName.textContent = `${dir.name || 'unnamed'} · ${dir.id}${dir.dos ? ' ' + dir.dos : ''}`;
  els.diskCount.textContent = `${file.name} · ${dir.tracks} tracks`;
  els.diskRows.textContent = '';
  for (const e of dir.entries) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.index = String(e.index);
    const prg = e.typeName === 'PRG';
    row.innerHTML = `<div class="t"><span class="title"></span><span class="sub"></span></div>`;
    row.querySelector('.title').textContent = e.name || `(entry ${e.index + 1})`;
    row.querySelector('.sub').textContent = `${e.typeName} · ${e.blocks} block${e.blocks === 1 ? '' : 's'}${e.locked ? ' · locked' : ''}${prg ? '' : ' · not a program'}${e.note ? ' · ' + e.note : ''}`;
    if (prg && !e.unreadable) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'load'; b.textContent = 'LOAD';
      b.addEventListener('click', () => run({ disk, entry: e }));
      row.appendChild(b);
    }
    els.diskRows.appendChild(row);
  }
  els.disk.hidden = false;
}
function programFromDisk(d, entry) {
  const bytes = readDiskFile(d.image, entry, FILE_LIMIT);
  const label = `${entry.name || 'entry ' + (entry.index + 1)} from ${d.file.name}`;
  return programFromBytes(bytes, { name: `${entry.name || 'entry ' + (entry.index + 1)} (${d.file.name})`, label, source: 'disk',
    file: { ...d.file, disk: { name: d.dir.name, id: d.dir.id, dos: d.dir.dos, tracks: d.dir.tracks, errorBytes: d.dir.errorBytes, entry: { index: entry.index, name: entry.name, type: entry.typeName, track: entry.track, sector: entry.sector, blocks: entry.blocks } } } });
}
/** A paste: hex with or without 0x, or base64, whitespace anywhere; the bytes are a program file's, its load address first. */
async function programFromText(text) {
  let t = String(text || '').replace(/\s+/g, '');
  if (/^0x/i.test(t)) t = t.slice(2);
  if (!t) refuse('PASTE_EMPTY', 'nothing pasted: a program as hex or base64, its load address first');
  let bytes, format;
  if (/^[0-9a-f]+$/i.test(t)) {
    if (t.length % 2) refuse('PASTE_ODD_HEX', `${num(t.length)} hex digits: an odd count, and each byte needs two`);
    bytes = new Uint8Array(t.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(t.substr(i * 2, 2), 16);
    format = 'hex';
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length % 4 === 0) {
    let bin;
    try { bin = atob(t); } catch (e) { refuse('PASTE_BAD_BASE64', 'the paste looks like base64 but does not decode'); }
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    format = 'base64';
  } else refuse('PASTE_NOT_HEX_OR_BASE64', `${num(t.length)} characters that are neither hex nor base64`);
  return programFromBytes(bytes, { name: `pasted ${format}`, label: `pasted ${format}`, source: 'paste', pasted: { format, chars: t.length } });
}
/** A file that is one of the series' own programs is recognised by the catalogue's pins: the Chamber's outside its 42-byte
 *  stamp, the Perception Chamber's outside its mind, the two older tokens whole. No node is asked, and what sits inside the
 *  stamp or the slot is not checked against anything. */
async function recognise(bytes) {
  for (const w of catalogue.works) {
    const p = w.program;
    if (bytes.length !== p.bytes) continue;
    if (p.kind === 'stamped' && await sha256Hex(zeroWindow(bytes, p.stamp.offset, p.stamp.bytes)) === p.stamp.sha256WindowZeroed) {
      return { work: w.key, name: w.name, words: `${w.name}'s program: outside its ${p.stamp.bytes}-byte stamp it equals the pinned base; the stamp inside is not checked against the chain` };
    }
    if (p.kind === 'slotted' && await sha256Hex(zeroWindow(bytes, p.slot.offset, p.slot.bytes)) === p.slot.sha256WindowZeroed) {
      const mind = await sha256Hex(bytes.slice(p.slot.offset, p.slot.offset + p.slot.bytes));
      return { work: w.key, name: w.name, words: `${w.name}'s program with a mind: outside the ${p.slot.bytes}-byte slot it equals the frozen program; the mind inside hashes to ${SHORT(mind)} and is not checked against any record` };
    }
    if (p.kind === 'whole' && keccakHex(bytes) === p.keccak256) return { work: w.key, name: w.name, words: `${w.name}: the whole program equals the pinned one` };
  }
  return null;
}
/** What the machine should be for a program, and which input: from the switch, or under AUTO from the program itself. A
 *  program of the chain runs bare, as it does on chain; a file is read for what it needs; a file recognised as one of the
 *  series' programs runs as they do. */
function decide(program) {
  const file = program && program.kind === 'file' ? program : null;
  const series = { input: 'joystick', inputWhy: 'the programs of the series read port 2' };
  if (!file) {
    if (firmwareMode === 'auto') return { on: false, ...series, why: 'a program of the chain runs bare, as it does on chain' };
    return { on: firmwareMode === 'on', ...series, why: `${firmwareMode} by the switch` };
  }
  const f = file.facts;
  if (firmwareMode === 'auto' && f.known) return { on: false, ...series, why: `${f.known.name}: a program of the series runs bare, as on chain` };
  const on = firmwareMode === 'auto' ? f.needs.firmware : firmwareMode === 'on';
  const inp = inputOf(f.scan, on);
  return { on, cart: !!file.cart, input: inp.input, inputWhy: inp.why, why: firmwareMode === 'auto' ? f.needs.why : `${firmwareMode} by the switch` };
}
let cartridgeIn = false;   // a cartridge was put into the machine now running: it stays in its port for the machine's life
const DOOR_IDLE = 'drop a .prg, a .d64 or a .crt here, or choose one';
function door(state, text) { els.door.dataset.state = state; els.doorText.textContent = state === 'idle' ? DOOR_IDLE : text; bayLines(); }
let fileLine = { name: '', state: 'idle' };   // the door's last answer, for the header line: what was brought, and what became of it
/** The door at rest: the open disk's summary, or the invitation. */
function doorRest() { if (disk) door('ok', disk.summary); else door('idle', ''); }
/** Where an ask is answered: the paste's own note for a paste, the door for a file or a disk's program; on a run, the other rests. */
function told(ask, state, text) {
  fileLine = { name: ask.text !== undefined ? 'the paste' : ask.entry ? ask.entry.name || `entry ${ask.entry.index + 1}` : ask.file.name || 'a file', state };
  if (ask.text !== undefined) { els.pasteNote.textContent = state === 'idle' ? '' : text; if (state === 'ok') doorRest(); else bayLines(); }
  else { door(state, text); if (state === 'ok') els.pasteNote.textContent = ''; }
}

// ------------------------------------------------------------------ the machine
async function ensureMachine(d) {
  const fresh = cartridgeIn || !!d.cart;   // a cartridge gets a machine of its own, and the machine that held one is not reused
  if (machine && machine.alive && firmwareOn === d.on && !fresh) { firmwareWhy = d.why; return; }
  if (machine) {
    say(fresh ? (cartridgeIn ? 'starting a new machine: a cartridge stays in the port for the life of a machine' : 'starting a new machine for the cartridge: it will stay in its port for the life of that machine')
      : d.on ? `rebuilding the machine with ${FIRMWARE_NAME}: ${d.why}` : `rebuilding the machine bare: ${d.why}`);
    audio.detach(); machine.destroy(); machine = null; playing = null;
  }
  cartridgeIn = false;
  firmwareOn = d.on; firmwareWhy = d.why;
  veil(d.on ? `STARTING THE MACHINE WITH ${FIRMWARE_NAME.toUpperCase()}` : 'STARTING THE MACHINE');
  machine = createMachine({
    container: els.frame,
    onEvent: (e) => {
      if (e.type === 'status' && e.text) say(`machine: ${e.text}`);
      if (e.type === 'error') { setState('failed', 'THE MACHINE STOPPED'); say(`the machine document reported an error and was destroyed: ${e.text}`); veil('THE MACHINE STOPPED · press LOAD to start it again'); playing = null; renderNow(); }
      if (e.type === 'intervened') { if (playing) { playing.intervened = true; renderNow(); } }
    },
  });
  await machine.hello;
  let bytes;
  try {
    bytes = await machineFromChain(node, say);
    say(`the machine matched its pins: PINNED, from the chain through ${bytes.observation.node} at block ${num(bytes.observation.block)}`);
  } catch (e) {
    say(`no endpoint gave the machine (${e.code}: ${e.message}); the site's copies instead`);
    bytes = await partsFromSite();
    say('the site\'s copies matched their pins: PINNED');
  }
  let firmware = { mode: 'off' };
  if (firmwareOn) {
    let fw;
    try {
      fw = await firmwareFromChain(node, say);
      say(`the firmware matched its pins: ${fw.status}, from the chain through ${fw.observation.node} at block ${num(fw.observation.block)}`);
    } catch (e) {
      say(`no endpoint gave the firmware (${e.code}: ${e.message}); the site's copies instead`);
      const site = await partsFromSite();
      fw = { roms: site.roms, status: site.status, source: site.source };
      say('the site\'s copies of the firmware matched their pins: PINNED');
    }
    bytes = { parts: bytes.parts, roms: fw.roms, status: bytes.status, source: bytes.source };   // the emulator's own source stays its own
    firmware = { mode: 'on', name: FIRMWARE_NAME, status: fw.status, source: fw.source, observation: fw.observation || null };
  }
  const ready = await bootMachine(machine, bytes, { firmware: firmwareOn, status: firmware.status });
  machineFacts = { name: ready.emulator, status: ready.status.emulator, source: bytes.source, observation: bytes.observation || null, firmware };
  await machine.request('input', inputAsk());
  await attachSound();
  veil('');
}
/** The firmware switch: on rebuilds the machine with the ROMs and shows READY, LOAD running a program under it; off
 *  rebuilds it bare and runs again what was playing; auto decides per program, so the machine changes only when the
 *  program playing needs it to. */
async function setFirmware(mode) {
  if (mode === firmwareMode) return;
  if (busy) { pendingFirmware = mode; return; }
  busy = true;
  firmwareMode = mode;
  els.firmware.value = mode;
  const was = playing ? (playing.file ? { file: playing.file } : { work: playing.program.facts.work, token: playing.program.facts.token }) : null;
  try {
    const d = decide(playing ? playing.program : null);
    if (!machine || !machine.alive) {
      firmwareOn = d.on; firmwareWhy = d.why;
      say(mode === 'on' ? `firmware on: the machine will boot ${FIRMWARE_NAME} when it starts` : mode === 'off' ? 'firmware off: the machine will start bare' : 'firmware auto: decided by the program when it loads');
      renderNow();
      return;
    }
    if (firmwareOn === d.on && mode !== 'on') {
      firmwareWhy = d.why;
      say(`firmware ${mode}: the machine stays as it is (${d.why})`);
      renderNow();
      return;
    }
    if (firmwareOn === d.on && mode === 'on' && playing) {
      // already under the firmware and playing: the switch only names what is so
      firmwareWhy = d.why; say(`firmware on: ${FIRMWARE_NAME} is already in the machine; the program plays on`); renderNow();
      return;
    }
    setState('reading', 'REBUILDING');
    node = node || new Node(catalogue.endpoints, catalogue.chainId, say, renderLink);
    await ensureMachine(d);
    if (mode === 'on') {
      // the switch shows the firmware: READY, and LOAD runs a program under it
      inputMode = 'keyboard'; inputWhy = 'READY wants typing'; els.input.value = inputMode;
      await machine.request('input', inputAsk());
      setState('idle', 'READY'); say(`${FIRMWARE_NAME} is at READY; LOAD runs a program under it`); renderNow(); markOffered(null, null);
    } else if (was) {
      pendingAsk = was;   // as the program needs, or bare: what was playing runs again
    } else {
      setState('idle', 'THE MACHINE IS ON'); veil('BARE · press LOAD to run a program'); renderNow(); markOffered(null, null);
    }
  } catch (e) {
    setState('failed', 'THE MACHINE DID NOT START');
    say(`the machine did not start under the firmware switch (${e.code || 'FAILED'}: ${e.message})`);
    veil('THE MACHINE STOPPED · press LOAD to start it again');
    renderNow(e.code || 'FAILED', e.message);
  } finally {
    busy = false;
    if (pendingFirmware !== null) { const m = pendingFirmware; pendingFirmware = null; setFirmware(m); }
    else if (pendingAsk) { const next = pendingAsk; pendingAsk = null; run(next); }
  }
}
/** The page plays the machine's sound once a gesture has unlocked the page's audio; until then the next tap does it. */
let attachingSound = null;
async function attachSound() {
  if (!machine || !machine.alive || audio.attached) return;
  if (attachingSound) return attachingSound;   // one tap raises three events; they share one attempt
  attachingSound = (async () => {
    if (!audio.ready) await audio.settle();     // a gesture's resume is asynchronous: it is waited for before the page judges
    if (!audio.ready) { say('sound: waits for your first tap or key on this page'); return; }
    try { await audio.attach(machine); } catch (e) { say(`sound: the machine did not take the audio request (${e.code || e.message})`); }
  })().finally(() => { attachingSound = null; });
  return attachingSound;
}
for (const ev of ['pointerup', 'click', 'keydown', 'touchend']) {
  document.addEventListener(ev, () => { if (audio.unlock() && machine && machine.alive && !audio.attached && state.phase === 'running') attachSound(); }, { capture: true, passive: true });
}

/** One ask, whichever door it came through: {work, token} from the chain, {file} from the visitor's own files. A file
 *  is judged before the machine is asked for, so a wrong file costs nothing and leaves whatever is playing alone. */
async function run(ask) {
  if (ask.file && isDiskFile(ask.file)) { await openDisk(ask.file); return; }   // a disk is opened and listed; a program of it is a later ask
  if (busy) { pendingAsk = ask; return; }
  busy = true;
  lastAsk = ask;
  els.copied.textContent = '';
  const fromFile = !!(ask.file || ask.entry || ask.text !== undefined);
  let program = null;
  const row = fromFile ? null : allRows.find((r) => r.work === ask.work && r.token === ask.token);
  asking = fromFile ? (ask.file ? ask.file.name : ask.entry ? ask.entry.name : 'the paste') : row ? (row.group === row.title ? row.title : `${row.group} · ${row.title}`) : `${ask.work} ${ask.token}`;
  refusal = null;
  bayLines();
  try {
    if (!catalogue) throw Object.assign(new Error('the catalogue has not loaded'), { code: 'NO_CATALOGUE' });
    if (ask.file) { disk = null; els.disk.hidden = true; told(ask, 'busy', `reading ${ask.file.name}`); program = await programFromFile(ask.file); }
    else if (ask.entry) { told(ask, 'busy', `reading ${ask.entry.name} from ${ask.disk.file.name}`); program = await programFromDisk(ask.disk, ask.entry); }
    else if (ask.text !== undefined) { told(ask, 'busy', 'reading the paste'); program = await programFromText(ask.text); }
    const d = decide(program);   // a program of the chain is decided before it is read: bare under AUTO
    setState('reading', 'READING');
    node = node || new Node(catalogue.endpoints, catalogue.chainId, say, renderLink);
    await ensureMachine(d);
    renderNow();   // the machine's rows fill as soon as it is up, while the program is read
    if (!fromFile) program = await programFromChain(node, catalogue, ask.work, ask.token, say, ask.revision);
    setState('checking', 'CHECKING');
    for (const [k, v] of Object.entries(program.statuses)) say(`${k}: ${v}`);
    if (fromFile) {
      const f = program.facts;
      say(`your ${f.source === 'paste' ? 'paste' : f.source === 'disk' ? 'disk\'s program' : f.source === 'cartridge' ? 'cartridge' : 'file'} ${program.label}: ${num(program.bytes.length)} bytes, sha256 ${SHORT(f.sha256)}; read in this browser, sent nowhere, no chain claim${loadsMore(f.scan) ? '; it loads more from a disk, and the machine has no drive: it will stop where it asks' : f.source === 'disk' ? '; the machine has no drive, so what it loads from the disk stops there' : ''}`);
      if (program.cart) say(`the cartridge: ${f.cartridge.typeName}${f.cartridge.title ? ` "${f.cartridge.title}"` : ''}, EXROM ${f.cartridge.exrom}, GAME ${f.cartridge.game}; it stays in the port for the life of this machine`);
      say(`the scan: ${program.cart ? cartridgeWords(f.scan) : scanWords(f.scan)}`);
      if (f.known) say(`recognised: ${f.known.words}`);
      say(`firmware ${firmwareOn ? 'on' : 'off'} (${firmwareMode === 'auto' ? 'AUTO: ' + d.why : d.why}); input ${d.input} (${d.inputWhy})`);
      if (firmwareOn && f.load !== 0x0801) say(`the firmware starts only a program at $0801: type SYS ${f.load} at READY to start this one`);
    }
    inputMode = d.input; inputWhy = d.inputWhy; els.input.value = inputMode;
    await machine.request('input', inputAsk());
    const buf = program.bytes.slice().buffer;
    const loaded = await machine.request('load', { kind: program.cart ? 'crt' : 'prg', bytes: buf, label: program.label.slice(0, 80) }, { transfer: [buf] });
    if (program.cart) cartridgeIn = true;
    playing = { program, loaded, at: new Date().toISOString(), intervened: !!loaded.intervened, file: ask.file || null };
    veil('');
    setState('running', 'RUNNING');
    say(`running ${program.label}`);
    renderNow();
    markOffered(fromFile ? null : ask.work, fromFile ? null : ask.token, fromFile ? null : program.facts.revision);
    markDiskRow(ask.entry ? ask.entry.index : null);
    if (fromFile) told(ask, 'ok', `${program.label} · ${num(program.bytes.length)} bytes · running · no chain claim${loadsMore(program.facts.scan) ? ' · loads more from a disk: stops at the drive' : ''}`); else { doorRest(); els.pasteNote.textContent = ''; }
  } catch (e) {
    const code = e.code || 'FAILED';
    refusal = { code, text: e.message };
    if (fromFile) told(ask, 'refused', `${code} · ${e.message}`);
    if (fromFile && !program) {
      // not a program the machine loads: said at the door and in the log; what was playing plays on
      say(`your file was refused (${code}): ${e.message}`);
    } else if (code === 'RPC_UNAVAILABLE') {
      setState('failed', 'NO NODE ANSWERED');
      say(`no endpoint answered (${e.message}); RETRY, or read the contract on Etherscan`);
      playing = null;
      renderNow(code, e.message);
    } else {
      setState('refused', `REFUSED · ${code}`);
      say(`refused: ${e.message}`);
      playing = null;
      renderNow(code, e.message);
    }
  } finally {
    busy = false;
    if (pendingFirmware !== null) { const m = pendingFirmware; pendingFirmware = null; setFirmware(m); }
    else if (pendingAsk) { const next = pendingAsk; pendingAsk = null; run(next); }
  }
}
function load(work, token, revision) { return run(revision === undefined ? { work, token } : { work, token, revision }); }
let asking = '', refusal = null;   // what was asked for last, and the refusal or failure that answered it, for the header line

function markOffered(work, token, revision) {
  // the work's row is marked for any of its revisions; a revision's own row only for itself
  for (const row of els.rows.querySelectorAll('.row')) row.classList.toggle('now', row.dataset.work === work && row.dataset.token === String(token) && (row.dataset.revision === undefined || row.dataset.revision === String(revision)));
}
function markDiskRow(index) {
  for (const row of els.diskRows.querySelectorAll('.row')) row.classList.toggle('now', index !== null && row.dataset.index === String(index));
}
/** Bring a row into view inside the list only: the page itself must never move, least of all on a phone where the list sits below the machine. */
function revealRow(row) {
  if (!row) return;
  const list = els.rows.getBoundingClientRect(), r = row.getBoundingClientRect();
  if (r.top < list.top || r.bottom > list.bottom) els.rows.scrollTop += r.top - list.top - 28;
}

// ------------------------------------------------------------------ NOW PLAYING
function provenance() {
  if (!playing) return null;
  const p = playing.program, f = p.facts;
  if (p.kind === 'file') {
    return {
      page: PAGE, at: playing.at, work: f.workName, workKey: f.work, contract: null, token: null, label: p.label,
      program: { bytes: p.bytes.length, sha256: f.sha256, status: p.statuses.program, load: f.load },
      source: f.source, file: f.file, pasted: f.pasted, cartridge: f.cartridge || null,
      claim: 'none: a file of yours, read in this browser and sent nowhere, checked for its shape only',
      scan: f.scan, needs: f.needs, known: f.known ? { work: f.known.work, name: f.known.name, words: f.known.words } : null,
      node: null, observation: null, reads: [], nodes: node ? node.facts() : null,
      machine: machineFacts, firmware: { ...machineFacts.firmware, switch: firmwareMode, why: firmwareWhy }, input: inputMode, inputWhy, mode: 'PURE', intervened: playing.intervened,
    };
  }
  const out = {
    page: PAGE, at: playing.at, work: f.workName, workKey: f.work, contract: f.contract, token: f.token, label: p.label,
    program: { bytes: p.bytes.length, sha256: f.sha256, status: p.statuses.program, pins: f.pins },
    node: f.node, observation: f.observation, reads: f.reads, nodes: node ? node.facts() : null,
    machine: machineFacts, firmware: { ...machineFacts.firmware, switch: firmwareMode, why: firmwareWhy }, input: inputMode, inputWhy, mode: 'PURE', intervened: playing.intervened,
  };
  if (p.kind === 'stamped') out.stamp = { status: p.statuses.stamp, block: f.block, stampedAt: f.stampedAt, previousBlockHash: f.prevHash, digits: f.digits, seed: f.seed, row: f.row };
  if (p.kind === 'slotted') out.mind = { status: p.statuses.mind, revision: f.revision, head: f.head, headStatus: p.statuses.head, canonicalHash: f.canonicalHash, brainBlob: f.brainBlob, record: f.record };
  return out;
}
/** A row: the key, then the value as text or as parts, a part being text or a link {text, href} that opens in a new tab so the machine plays on. */
function line(k, v, cls) {
  const d = document.createElement('div');
  d.className = 'nl' + (cls ? ' ' + cls : '');
  const a = document.createElement('span'); a.className = 'k'; a.textContent = k;
  const b = document.createElement('span'); b.className = 'v';
  for (const part of Array.isArray(v) ? v : [v]) {
    if (part && typeof part === 'object') {
      const l = document.createElement('a');
      l.href = part.href; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.textContent = part.text;
      b.appendChild(l);
    } else b.appendChild(document.createTextNode(String(part)));
  }
  d.append(a, b);
  return d;
}
/** A link part when there is somewhere to link to, the text alone when there is not. */
const link = (text, href) => (href ? { text, href } : text);
/** A group's heading inside NOW PLAYING. */
function heading(text) { const d = document.createElement('div'); d.className = 'grp'; d.textContent = text; return d; }
/** Links joined by a separator, as parts. */
const joined = (parts, sep = ' · ') => parts.flatMap((x, i) => (i ? [sep, x] : [x]));
const DASH = '—';
/** The machine's rows, present from the first paint and filled as the facts arrive, so the panel keeps its shape. */
function machineRows() {
  const mf = machineFacts, fw = mf && mf.firmware, ex = explorer();
  const sw = firmwareMode === 'auto' ? `AUTO: ${firmwareWhy}` : 'by the switch';
  // the emulator's four contracts and, when the firmware is on, the pressing's contract and repository: where the bytes live, for anyone to compare
  const parts = catalogue && catalogue.machine && catalogue.machine.parts ? catalogue.machine.parts : [];
  const partLinks = ex ? joined(parts.map((pt) => link(pt.name.replace(/^minimal64 /, ''), `${ex}/address/${pt.address}`))) : [];
  const emulator = mf ? [`${mf.status} · ${mf.name}`, ...(partLinks.length ? [' (', ...partLinks, ')'] : []), ` · from ${mf.source}`] : `${DASH} · the machine starts with the first LOAD`;
  const root = catalogue && catalogue.machine && catalogue.machine.firmware && catalogue.machine.firmware.root;
  const pressing = [FIRMWARE_NAME, ...(ex && root ? [' (', link('contract', `${ex}/address/${root}`), ' · ', link('repository', PRESSING_REPO), ')'] : [])];
  let firmware;
  if (fw && fw.mode === 'on') firmware = ['on · ', ...pressing, ` · ${fw.status} · from ${fw.source} · ${sw}`];
  else if (!mf && firmwareMode === 'on') firmware = ['on · ', ...pressing, ' boots first when the machine starts'];
  else if (!mf) firmware = firmwareMode === 'auto' ? 'AUTO · decided by the program when it loads' : 'off · bare, as on chain · by the switch';
  else firmware = firmwareMode === 'auto' ? `off · ${sw}` : 'off · bare, as on chain · by the switch';
  const obs = playing && playing.program.facts.observation;
  const aside = node && node.quarantined.size ? ` · ${node.quarantined.size} set aside this visit` : '';
  const host = obs ? [`${obs.node} · read at `, link(`block ${num(obs.block)}`, ex ? `${ex}/block/${obs.block}` : null), ` · hash ${SHORT(obs.blockHash)}`, aside]
    : node && node.url ? [node.url.replace(/^https?:\/\//, ''), aside] : null;
  return [
    ['EMULATOR', emulator, mf ? '' : 'muted'],
    ['FIRMWARE', firmware, ''],
    ['INPUT', (inputMode === 'keyboard' ? 'keyboard · the C64 matrix' : inputMode === 'joysticks' ? 'joystick in both ports' : `joystick in port ${joyPort()}`) + (inputWhy ? ` · ${inputWhy}` : ''), ''],
    ['MODE', playing && playing.intervened ? 'INTERVENED · a write reached the machine from outside' : 'PURE · nothing on this page reaches into the machine', ''],
    ['NODE', host || DASH, host ? '' : 'muted'],
  ];
}
/** The program's rows: what is playing, what was refused, or the dashes of nothing yet; always the same shape. */
function programRows(code, text) {
  if (playing) {
    const p = playing.program, f = p.facts, ex = explorer();
    // the program's contract and its token on the explorer: the same bytes, read by anyone; a file of yours links nowhere, since nothing is claimed of it
    const where = p.kind !== 'file' && ex ? [' (', link('contract', `${ex}/address/${f.contract}`), ' · ', link(`token ${f.token}`, `${ex}/nft/${f.contract}/${f.token}`), ')'] : [];
    const rows = [['PROGRAM', [p.label, ...where], '']];
    if (p.kind === 'stamped') {
      rows.push(['ROOM', `${f.row.colourName.toLowerCase()} · ${f.row.wallName.toLowerCase()} wall · ${f.row.batsName.toLowerCase()} ${f.row.batsName === 'One' ? 'bat' : 'bats'} · ${f.row.candleName.toLowerCase()}`, '']);
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · outside the stamp equal to the pinned base · sha256 ${SHORT(f.sha256)}`, '']);
      rows.push(['STAMP', `${p.statuses.stamp} · block ${num(f.stampedAt)} · the character, the colour, the digits and the seed agree with the node's block hash`, '']);
    } else if (p.kind === 'slotted') {
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · outside the mind equal to the frozen program · sha256 ${SHORT(f.sha256)}`, '']);
      const rec = f.record || {};
      const which = f.revision === f.head ? `revision ${f.head}, the head (${p.statuses.head})` : `revision ${f.revision} of ${f.head} (the head ${p.statuses.head})`;
      const saved = f.revision === 0 ? 'the blank slot the program ships' : `${rec.educationCount} lesson${rec.educationCount === 1 ? '' : 's'} · saved at block ${num(rec.savedAtBlock)} by ${shortAddr(rec.savedBy)}`;
      rows.push(['MIND', `${p.statuses.mind} · ${which} · hash ${SHORT(f.canonicalHash)} equals the record's${f.revision === 0 ? ' and the pin' : ''} · ${saved}`, '']);
    } else if (p.kind === 'file' && p.cart) {
      const c = f.cartridge;
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · sha256 ${SHORT(f.sha256)}`, '']);
      rows.push(['CARTRIDGE', `${c.typeName} · ${c.chips.length} CHIP packet${c.chips.length === 1 ? '' : 's'} · ${num(c.size)} bytes of ROM · EXROM ${c.exrom} · GAME ${c.game}${c.title ? ` · "${c.title}"` : ''}`, '']);
      rows.push(['SCAN', cartridgeWords(f.scan), '']);
      rows.push(['CHECK', 'no chain claim · read in this browser and sent nowhere · its shape checked: a header and CHIP packets this machine reads · it stays in the port: LOAD anything else and a new machine starts', '']);
    } else if (p.kind === 'file') {
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · sha256 ${SHORT(f.sha256)}`, '']);
      rows.push(['SCAN', scanWords(f.scan), '']);
      if (f.known) rows.push(['KNOWN', f.known.words, '']);
      const start = firmwareOn && f.load !== 0x0801 ? ` · the firmware starts only a program at $0801: type SYS ${f.load} at READY` : !firmwareOn && !f.scan.entry ? ' · a bare machine starts nothing without a SYS in a BASIC stub: switch FIRMWARE on' : '';
      const drive = loadsMore(f.scan) ? ' · the machine has no drive, and this program loads more from a disk: it stops where it asks the drive'
        : f.source === 'disk' ? ' · the machine has no drive: a program that loads more from the disk stops there' : '';
      rows.push(['CHECK', 'no chain claim · read in this browser and sent nowhere · its shape checked: a load address and a size within 64K' + start + drive, '']);
    } else {
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes`, '']);
      rows.push(['PIN', `keccak256 ${SHORT(f.keccak256)} equals the pin`, '']);
    }
    return rows;
  }
  if (code) {
    const noNode = code === 'RPC_UNAVAILABLE';
    return [
      ['PROGRAM', noNode ? 'NO NODE ANSWERED' : `REFUSED · ${code}`, 'bad'],
      ['BYTES', text, 'bad'],
      ['CHECK', noNode ? 'RETRY, or read the contract on Etherscan' : 'the bytes did not match what the catalogue pinned, so they did not run', 'muted'],
    ];
  }
  const atReady = state.phase === 'idle' && firmwareOn;
  return [
    ['PROGRAM', atReady ? `READY · ${FIRMWARE_NAME} is at its prompt · type at it, or LOAD a program` : `${DASH} · choose a program; nothing runs until you press LOAD`, 'muted'],
    ['BYTES', DASH, 'muted'],
    ['CHECK', DASH, 'muted'],
  ];
}
function renderNow(code, text) {
  els.firmwareWhy.textContent = firmwareMode !== 'auto' ? `${firmwareMode.toUpperCase()} by the switch` : !machineFacts ? 'AUTO · decides when a program loads' : `AUTO · ${firmwareOn ? 'on' : 'bare'} · ${firmwareWhy}`;
  els.now.textContent = '';
  els.now.appendChild(heading('THE PROGRAM'));
  for (const [k, v, cls] of programRows(code, text)) els.now.appendChild(line(k, v, cls));
  els.now.appendChild(heading('THE MACHINE'));
  for (const [k, v, cls] of machineRows()) els.now.appendChild(line(k, v, cls));
  els.json.value = playing ? JSON.stringify(provenance(), null, 1) : '';
  bayLines();
}

// ------------------------------------------------------------------ the bays
// Every panel but the way out folds. Its header is the whole button and carries one live line, what is true now in
// the page's own words: the thing in ink, its qualifiers muted, the thing the only part that can be cut short, so
// the trust words always show. Open, the controls and the record; the account under the page is the third depth.
// Closed on a phone, open on a wide screen, where the log is the stage's and does not fold; a link into a closed bay
// opens it; nothing is remembered between visits. The body is one grid row, 0fr to 1fr, and the mark's upright
// collapses into its bar in the same time; under reduced motion both are instant.
const BAY_KEYS = ['now', 'chain', 'file', 'keys', 'log'];
const bays = Object.fromEntries(BAY_KEYS.map((k) => [k, $('bay-' + k)]));
const NARROW = matchMedia('(max-width:1139px)');
const STILL = matchMedia('(prefers-reduced-motion: reduce)');
const bayFixed = (d) => d === bays.log && !NARROW.matches;   // the log is part of the stage on a wide screen
const bayOpen = (d) => d.classList.contains('is-open');
function setBay(d, open, instant) {
  const s = d.querySelector(':scope > summary'), body = d.querySelector(':scope > .bb');
  if (d.open === open && bayOpen(d) === open) return;
  if (instant || STILL.matches || !body) {
    d.classList.remove('moving');
    d.open = open; d.classList.toggle('is-open', open);
  } else if (open) {
    d.open = true;                           // rendered at 0fr first, so the row has somewhere to grow from
    d.classList.add('moving');
    requestAnimationFrame(() => requestAnimationFrame(() => { if (d.classList.contains('moving')) d.classList.add('is-open'); }));
  } else {
    d.classList.add('moving');
    d.classList.remove('is-open');           // the row shrinks; the element closes when the shrink has ended
  }
  if (s) s.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open && s && d.contains(document.activeElement) && document.activeElement !== s) s.focus({ preventScroll: true });
  clearTimeout(d.settleTimer);
  if (d.classList.contains('moving')) d.settleTimer = setTimeout(() => { if (d.classList.contains('moving')) settleBay(d); }, 600);   // a transition that never ends (the tab hidden, the element gone) still settles
}
function settleBay(d) {
  d.classList.remove('moving');
  if (!bayOpen(d)) d.open = false;
}
for (const d of document.querySelectorAll('details.bay, details.fold')) {
  const s = d.querySelector(':scope > summary'), body = d.querySelector(':scope > .bb');
  s.addEventListener('click', (e) => { e.preventDefault(); if (bayFixed(d)) return; setBay(d, !bayOpen(d)); });
  if (body) body.addEventListener('transitionend', (e) => { if (e.target === body && e.propertyName === 'grid-template-rows') settleBay(d); });
}
/** A link into a closed bay or fold opens it, then the page goes there. */
function revealHash() {
  const id = location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : '';
  const t = id ? document.getElementById(id) : null;
  if (!t) return;
  let opened = false;
  for (let d = t.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) {
    if (!bayOpen(d)) { setBay(d, true, true); opened = true; }
  }
  if (opened) t.scrollIntoView({ block: 'start' });
}
function bayInit() {
  const id = location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : '';
  const t = id ? document.getElementById(id) : null;
  for (const k of BAY_KEYS) setBay(bays[k], !NARROW.matches || !!(t && bays[k].contains(t)), true);
  for (const d of document.querySelectorAll('details.fold')) if (t && d.contains(t)) setBay(d, true, true);
}
NARROW.addEventListener('change', () => { if (!NARROW.matches) setBay(bays.log, true, true); });   // a wide window has the log open: it is the stage's there
window.addEventListener('hashchange', revealHash);
/** The verdict on a program of the chain: the weakest word among its checks, so the line never claims more than the record. */
const RANK = { [STATUS.PINNED]: 0, [STATUS.CONTRACT_CONSISTENT]: 1, [STATUS.NODE_REPORTED]: 2 };
function verdictOf(p) {
  if (p.kind === 'file') return STATUS.YOUR_FILE;
  let worst = null;   // the bytes' own words: the program, and the stamp or the mind inside it; the head's status is the node's word on which revision is the head, not a verdict on bytes
  for (const v of [p.statuses.program, p.statuses.stamp, p.statuses.mind].filter(Boolean)) { if (!(v in RANK)) return v; if (worst === null || RANK[v] > RANK[worst]) worst = v; }
  return worst || STATUS.NODE_REPORTED;
}
/** The five lines, recomputed whole whenever anything they say could have changed. */
function bayLines() {
  const put = (k, a, e, c) => { const s = $('sum-' + k); if (!s) return; s.children[0].textContent = a; s.children[1].textContent = e; s.children[2].textContent = c; };
  const reading = state.phase === 'reading' || state.phase === 'checking';
  if (reading) put('now', '', asking || 'the machine', '');
  else if (playing) put('now', '', playing.program.label, ` · ${verdictOf(playing.program)} · ${playing.intervened ? 'INTERVENED' : 'PURE'}`);
  else if (state.phase === 'refused') put('now', '', asking, ' · REFUSED');
  else if (state.phase === 'failed') put('now', '', asking || 'nothing', refusal ? ` · ${refusal.text}` : '');
  else if (state.phase === 'off') put('now', '', 'nothing yet', '');
  else if (state.phase === 'idle') put('now', '', firmwareOn ? `${FIRMWARE_NAME} at READY` : 'the machine is on and bare', ' · nothing playing');
  else put('now', '', asking, '');
  const chainAsk = lastAsk && !(lastAsk.file || lastAsk.entry || lastAsk.text !== undefined);
  const busyChain = reading && chainAsk, fromChain = !busyChain && playing && playing.program.kind !== 'file';
  put('chain', countText + (busyChain ? ' · reading ' : fromChain ? ' · playing ' : ''), busyChain ? asking : fromChain ? playing.program.label : '', '');
  const fileRunning = playing && playing.program.kind === 'file';
  const programs = disk ? disk.dir.entries.filter((e) => e.typeName === 'PRG').length : 0;
  if (fileLine.state === 'refused') put('file', '', fileLine.name, ' · REFUSED');
  else if (fileLine.state === 'busy') put('file', 'reading ', fileLine.name, '');
  else if (disk && fileLine.state === 'disk') put('file', '', disk.file.name, ` · ${programs} program${programs === 1 ? '' : 's'} · pick one`);   // a disk just opened: the door waits on a pick, whatever plays
  else if (fileRunning) put('file', '', playing.program.label, ` · ${STATUS.YOUR_FILE}`);
  else if (disk) put('file', '', disk.file.name, ` · ${programs} program${programs === 1 ? '' : 's'} · pick one`);
  else put('file', '.prg · .d64 · .crt', '', '');
  const fw = firmwareMode === 'auto' ? (machineFacts ? `AUTO · ${firmwareOn ? 'on' : 'bare'}` : 'AUTO') : firmwareMode.toUpperCase();
  put('keys', '', inputMode === 'keyboard' ? 'keyboard' : inputMode === 'joysticks' ? 'both joysticks' : `joystick ${joyPort()}`, ` · ${fw} · sound ${audio.on ? 'on' : 'off'}`);   // the short forms, so the line fits a phone whole
  const last = els.log.lastElementChild;
  put('log', `${fullLog.length} line${fullLog.length === 1 ? '' : 's'}${last ? ' · ' : ''}`, last ? last.textContent : 'nothing yet', '');
}

// ------------------------------------------------------------------ controls
els.search.addEventListener('input', () => renderRows(els.search.value));
els.copy.addEventListener('click', async () => {
  const text = els.json.value;
  if (!text) { els.copied.textContent = 'nothing playing'; return; }
  try { await navigator.clipboard.writeText(text); els.copied.textContent = 'copied as JSON'; }
  catch (e) { els.json.hidden = false; els.json.select(); els.copied.textContent = 'select and copy'; }
});
els.copyLog.addEventListener('click', async () => {
  const text = report();
  try { await navigator.clipboard.writeText(text); els.copied.textContent = `copied the log (${fullLog.length} lines)`; }
  catch (e) { els.json.hidden = false; els.json.value = text; els.json.select(); els.copied.textContent = 'select and copy'; }
});
els.input.addEventListener('change', async () => {
  inputMode = ['keyboard', 'joystick1', 'joysticks'].includes(els.input.value) ? els.input.value : 'joystick';
  inputWhy = 'by the switch';
  if (machine && machine.alive) { try { await machine.request('input', inputAsk()); } catch (e) { /* the machine is gone; the next load sets it */ } }
  if (playing) renderNow(); else bayLines();
});
els.reset.addEventListener('click', async () => {
  if (!machine || !machine.alive) return;
  try { await machine.request('reset'); } catch (e) { return; }
  if (playing && playing.program.cart) { say('the machine was reset; the cartridge in its port starts again'); renderNow(); return; }
  playing = null;
  setState('idle', firmwareOn ? 'READY' : 'RESET');
  say(firmwareOn ? `the machine was reset; ${FIRMWARE_NAME} is at READY` : 'the machine was reset; it is on and bare');
  if (!firmwareOn) veil('BARE · press LOAD to run a program');
  renderNow();
  markOffered(null, null);
});
els.firmware.addEventListener('change', () => { setFirmware(['on', 'off', 'auto'].includes(els.firmware.value) ? els.firmware.value : 'auto'); });
els.retry.addEventListener('click', () => { if (lastAsk) run(lastAsk); });
// the file door: the picker and the drop zone are one control; a file dropped anywhere else must not take the visitor away
els.file.addEventListener('change', () => { const f = els.file.files && els.file.files[0]; els.file.value = ''; if (f) run({ file: f }); });
els.runPaste.addEventListener('click', () => run({ text: els.paste.value }));
els.door.addEventListener('dragover', (e) => { e.preventDefault(); els.door.classList.add('over'); });
els.door.addEventListener('dragleave', () => els.door.classList.remove('over'));
els.door.addEventListener('drop', (e) => { e.preventDefault(); els.door.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) run({ file: f }); });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());
// ------------------------------------------------------------------ the touch controls
// The ring is read as an ANGLE from its centre, so every part of it outside the
// hole is live and a thumb slides between directions without lifting; the hole
// is rest. It reads a diagonal two ways, chosen in THE KEYS:
//   one direction (the default): the programs of the series stand still when two
//     directions are pressed together (measured on the Perception page, whose
//     ring settled the split): left and right take 120 degrees each, up and
//     down 60, so a diagonal is read as the nearer of left and right;
//   both directions: eight sectors of 45 degrees and a diagonal pushes two
//     bits, as nopsta's touch stick does, for programs that steer eight ways.
// The wedge under the thumb lights; when it feeds a neighbour, the neighbour
// lights as the direction sent and the wedge marks itself half. FIRE is a
// button of its own, so one finger holds a direction while another fires. The
// browser's own touch behaviours over the pad (selecting words, zooming on a
// double tap, a callout on a long press) are switched off.
const RING_HOLE = 40 / 96;   // the hole's radius over the ring's: the numbers build.py draws
const WEDGES = [
  { bits: 1, from: -112.5, to: -67.5 }, { bits: 9, from: -67.5, to: -22.5 }, { bits: 8, from: -22.5, to: 22.5 }, { bits: 10, from: 22.5, to: 67.5 },
  { bits: 2, from: 67.5, to: 112.5 }, { bits: 6, from: 112.5, to: 157.5 }, { bits: 4, from: 157.5, to: -157.5 }, { bits: 5, from: -157.5, to: -112.5 },
];
const FOLD = [{ bits: 8, from: -60, to: 60 }, { bits: 2, from: 60, to: 120 }, { bits: 4, from: 120, to: -120 }, { bits: 1, from: -120, to: -60 }];
const within = (ang, s) => (s.from < s.to ? ang >= s.from && ang < s.to : ang >= s.from || ang < s.to);
let ways = 4, ringHeld = 0, ringPointer = null;
const wedgeEls = new Map([...els.ring.querySelectorAll('.d')].map((g) => [Number(g.dataset.bits), g]));
function joy(bit, down) { if (machine && machine.alive) machine.request('joystick', { bit, down, port: joyPort() }).catch(() => {}); }
function aim(e) {
  const r = els.ring.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < RING_HOLE * r.width / 2) return null;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const wedge = WEDGES.find((w) => within(ang, w)).bits;
  return { wedge, bits: ways === 8 ? wedge : FOLD.find((d) => within(ang, d)).bits };
}
function setRing(a) {
  const bits = a ? a.bits : 0;
  for (const bit of [1, 2, 4, 8]) if ((ringHeld & bit) && !(bits & bit)) joy(bit, false);
  for (const bit of [1, 2, 4, 8]) if (!(ringHeld & bit) && (bits & bit)) joy(bit, true);
  ringHeld = bits;
  for (const [b, g] of wedgeEls) {
    const on = !!a && b === bits, half = !!a && !on && b === a.wedge;
    g.classList.toggle('on', on); g.classList.toggle('half', half);
    if (on && g !== els.ring.lastElementChild) els.ring.appendChild(g);   // the lit outline drawn over its neighbours'
  }
}
for (const ev of ['touchstart', 'touchmove', 'contextmenu', 'dblclick', 'selectstart']) {
  els.touch.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
els.ring.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (ringPointer !== null) return;   // the first finger on the ring drives it
  ringPointer = e.pointerId;
  try { els.ring.setPointerCapture(e.pointerId); } catch (x) { /* a mouse without capture is fine */ }
  setRing(aim(e));
});
els.ring.addEventListener('pointermove', (e) => { if (e.pointerId !== ringPointer) return; e.preventDefault(); setRing(aim(e)); });
const ringRelease = (e) => { if (e.pointerId !== ringPointer) return; ringPointer = null; setRing(null); };
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) els.ring.addEventListener(ev, ringRelease);
for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, ringRelease);   // when capture was refused
els.ways.addEventListener('change', () => {
  ways = els.ways.value === '8' ? 8 : 4;
  els.touch.dataset.ways = String(ways);
  if (ringPointer === null) setRing(null);
});
for (const b of els.touch.querySelectorAll('button[data-bit]')) {
  const bit = Number(b.dataset.bit);
  const press = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* a mouse without capture is fine */ } b.classList.add('down'); joy(bit, true); };
  const release = (e) => { e.preventDefault(); if (!b.classList.contains('down')) return; b.classList.remove('down'); joy(bit, false); };
  b.addEventListener('pointerdown', press);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, release);
}
els.sound.addEventListener('click', () => {
  audio.setOn(!audio.on);
  els.sound.textContent = audio.on ? 'SOUND ON' : 'SOUND OFF';
  bayLines();
  if (audio.on && machine && machine.alive && !audio.attached) attachSound();
});

// ------------------------------------------------------------------ start
async function start() {
  els.firmware.value = firmwareMode; els.input.value = inputMode;   // a browser may restore a form's values on reload; the page's state is the page's
  bayInit();
  setState('off', 'THE MACHINE IS OFF');
  renderNow();
  try {
    const res = await fetch('catalogue.json');
    if (!res.ok) throw new Error(`http ${res.status}`);
    catalogue = await res.json();
    if (catalogue.schema !== 'chamber-machine-catalogue' || catalogue.version !== 1) throw new Error('not a version 1 catalogue');
  } catch (e) {
    setState('failed', 'THE CATALOGUE DID NOT LOAD');
    say(`the catalogue did not load: ${e.message}`);
    return;
  }
  allRows = rowsOf(catalogue);
  renderRows('');
  els.linkChain.textContent = chainName(catalogue.chainId);
  renderLink({ phase: 'off', host: null, block: null, blockHash: null, reads: 0, setAside: 0, endpoints: catalogue.endpoints.map((u) => ({ host: u.replace(/^https?:\/\//, ''), state: 'live', why: null })) });
  say(`catalogue of ${catalogue.generated.slice(0, 10)}: ${allRows.length} programs, ${catalogue.endpoints.length} endpoints`);
  // the machine starts on a program: the one the address names, or the Tony demo, the first token of the series
  const q = new URLSearchParams(location.search);
  let work = q.get('work'), token = parseInt(q.get('token') || '1', 10);
  const revision = q.has('revision') && /^\d+$/.test(q.get('revision')) ? parseInt(q.get('revision'), 10) : undefined;
  if (!(work && allRows.some((r) => r.work === work && r.token === token))) { work = 'tony'; token = 1; }
  if (!allRows.some((r) => r.work === work && r.token === token)) { work = allRows[0].work; token = allRows[0].token; }
  revealRow(els.rows.querySelector(`.row[data-work="${work}"][data-token="${token}"]`));
  load(work, token, allRows.find((r) => r.work === work && r.token === token).revisions ? revision : undefined);
}
window.machinePage = { get machine() { return machine; }, get playing() { return playing; }, get catalogue() { return catalogue; }, get audio() { return { ready: audio.ready, attached: audio.attached, pulled: audio.pulled, on: audio.on }; }, get pad() { return { held: ringHeld, ways, pressed: ringPointer !== null }; }, get firmware() { return { switch: firmwareMode, on: firmwareOn, why: firmwareWhy }; }, get input() { return inputMode; }, get cartridgeIn() { return cartridgeIn; }, get nodes() { return node ? node.facts() : { setAside: [], demoted: [] }; }, provenance, report, STATUS,
  get bays() { return Object.fromEntries(BAY_KEYS.map((k) => [k, { open: bayOpen(bays[k]), element: bays[k].open, moving: bays[k].classList.contains('moving'), line: $('sum-' + k).textContent }])); }, bay(k, open) { setBay(bays[k], open, true); }, say };
start();
