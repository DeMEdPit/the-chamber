// SPDX-License-Identifier: MIT
// THE MACHINE, the page: one machine in a frame, a search over the catalogue,
// the states beside the frame, NOW PLAYING with its provenance, the keys, and
// the way out. Nothing runs until a LOAD is pressed. The machine document is
// sandboxed and fed over the bridge (bridge-client.js); every read from the
// chain and every claim about it is chain.js's; this file is the page.
import { createMachine, bootMachine, partsFromSite, sha256Hex, STATUS } from './bridge-client.js';
import { Node, machineFromChain, firmwareFromChain, programFromChain, zeroWindow } from './chain.js';
import { keccakHex } from './keccak.js';
import { scanProgram, needsOf, inputOf, scanWords, hex4 } from './scan.js';
import { createAudio } from './audio.js';

const PAGE = 'machine/2b';
const $ = (id) => document.getElementById(id);
const els = {
  frame: $('frame'), veil: $('veil'), veilText: $('veil-text'), search: $('search'), rows: $('rows'), count: $('count'),
  state: $('state'), log: $('log'), now: $('now'), json: $('provenance-json'), copy: $('copy'), copied: $('copied'),
  input: $('input-mode'), reset: $('reset'), retry: $('retry'), touch: $('touch'), copyLog: $('copy-log'),
  sound: $('sound'), ring: $('ring'), ways: $('ways'), firmware: $('firmware'), firmwareWhy: $('firmware-why'),
  door: $('door'), doorText: $('door-text'), file: $('file'),
  link: $('link'), linkChain: $('link-chain'), linkState: $('link-state'), linkNode: $('link-node'), linkBlock: $('link-block'), linkEndpoints: $('link-endpoints'),
};
const audio = createAudio({ onStatus: (t) => say(t) });

let catalogue = null, node = null, machine = null, machineFacts = null, playing = null, lastAsk = null;
let busy = false, pendingAsk = null, pendingFirmware = null;
let inputMode = 'joystick', inputWhy = 'the programs of the series read port 2';
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

function say(text) {
  fullLog.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
  const li = document.createElement('li');
  li.textContent = text;
  els.log.appendChild(li);
  while (els.log.children.length > LOG_LINES) els.log.removeChild(els.log.firstChild);
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
        out.push({ work: w.key, token: id, title: `${id} · the head mind`, sub: 'the frozen program with the mind the chain holds now', group: w.name,
          words: `${w.name} ${w.key} perception ${id} mind brain head canary`.toLowerCase(), note: 'the head revision is read when you load it' });
      }
    } else {
      out.push({ work: w.key, token: 1, title: w.name, sub: 'one whole program, pinned by its hash', group: w.name,
        words: `${w.name} ${w.key} ${w.key === 'ready64' ? 'ready 64 console basic' : 'tony demo born for adventure'}`.toLowerCase(), note: '' });
    }
  }
  return out;
}
let allRows = [];
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
    row.innerHTML = `<div class="t"><span class="title"></span><span class="sub"></span></div><button class="load" type="button">LOAD</button>`;
    row.querySelector('.title').textContent = r.title;
    row.querySelector('.sub').textContent = r.sub;
    row.querySelector('button').addEventListener('click', () => load(r.work, r.token));
    els.rows.appendChild(row);
  }
  els.count.textContent = shown.length === allRows.length ? `${allRows.length} programs on the chain` : `${shown.length} of ${allRows.length}`;
}

// ------------------------------------------------------------------ the file door
// A file of the visitor's becomes the same record a chain program is, judged for its shape and for nothing else:
// the status is YOUR FILE and no chain claim is made. It is read in this browser and sent nowhere. What is not a
// program the machine loads is refused with a code and a sentence that names what the file is.
const D64_SIZES = new Set([174848, 175531, 196608, 197376]);   // a disk image: 35 tracks, with error bytes; 40 tracks, with error bytes
const FILE_LIMIT = 65538;   // a two-byte load address and at most 64K after it: the machine document's own limit (PROTOCOL.md)
async function programFromFile(file) {
  const refuse = (code, text) => { throw Object.assign(new Error(text), { code }); };
  const name = file.name || 'a file', size = file.size;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const first = Array.from(head.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join(' ');
  if (head.length === 16 && String.fromCharCode(...head) === 'C64 CARTRIDGE   ') refuse('KIND_UNSUPPORTED', `${name} is a cartridge image (${num(size)} bytes); the cartridge door comes in a later phase of this page`);
  if (D64_SIZES.has(size)) refuse('KIND_UNSUPPORTED', `${name} is a disk image (${num(size)} bytes); the disk door comes in a later phase of this page`);
  if (!/\.prg$/i.test(name)) refuse('KIND_UNSUPPORTED', `${name} is not a .prg file (${num(size)} bytes${first ? ', beginning ' + first : ''}); this page loads .prg files`);
  if (size < 3) refuse('PRG_TOO_SHORT', `${name} is ${size} byte${size === 1 ? '' : 's'}; a program file carries a two-byte load address and at least one byte after it`);
  if (size > FILE_LIMIT) refuse('FILE_TOO_LARGE', `${name} is ${num(size)} bytes; a program is at most 65,536 bytes after its load address`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const load = bytes[0] | (bytes[1] << 8);
  if (load + bytes.length - 2 > 0x10000) refuse('PRG_ADDRESS_OVERFLOW', `${name} loads at ${hex4(load)} and its ${num(bytes.length - 2)} bytes would run past 64K`);
  const sha256 = await sha256Hex(bytes.buffer);
  const scan = scanProgram(bytes), needs = needsOf(scan), known = await recognise(bytes);
  return { kind: 'file', label: name.slice(0, 80), bytes, statuses: { program: STATUS.YOUR_FILE },
    facts: { work: 'file', workName: 'your file', contract: null, token: null, name, size, type: file.type || '', modified: Number.isFinite(file.lastModified) ? new Date(file.lastModified).toISOString() : null, load, sha256, scan, needs, known, node: null, observation: null, reads: [] } };
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
  return { on, input: inp.input, inputWhy: inp.why, why: firmwareMode === 'auto' ? f.needs.why : `${firmwareMode} by the switch` };
}
const DOOR_IDLE = 'drop a .prg here, or choose one';
function door(state, text) { els.door.dataset.state = state; els.doorText.textContent = state === 'idle' ? DOOR_IDLE : text; }

// ------------------------------------------------------------------ the machine
async function ensureMachine(d) {
  if (machine && machine.alive && firmwareOn === d.on) { firmwareWhy = d.why; return; }
  if (machine) {
    say(d.on ? `rebuilding the machine with ${FIRMWARE_NAME}: ${d.why}` : `rebuilding the machine bare: ${d.why}`);
    audio.detach(); machine.destroy(); machine = null; playing = null;
  }
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
  await machine.request('input', { mode: inputMode });
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
      await machine.request('input', { mode: inputMode });
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
async function attachSound() {
  if (!machine || !machine.alive || audio.attached) return;
  if (!audio.ready) { say('sound: waits for your first tap or key on this page'); return; }
  try { await audio.attach(machine); } catch (e) { say(`sound: the machine did not take the audio request (${e.code || e.message})`); }
}
for (const ev of ['pointerup', 'click', 'keydown', 'touchend']) {
  document.addEventListener(ev, () => { if (audio.unlock() && machine && machine.alive && !audio.attached && state.phase === 'running') attachSound(); }, { capture: true, passive: true });
}

/** One ask, whichever door it came through: {work, token} from the chain, {file} from the visitor's own files. A file
 *  is judged before the machine is asked for, so a wrong file costs nothing and leaves whatever is playing alone. */
async function run(ask) {
  if (busy) { pendingAsk = ask; return; }
  busy = true;
  lastAsk = ask;
  els.copied.textContent = '';
  const fromFile = !!ask.file;
  let program = null;
  try {
    if (!catalogue) throw Object.assign(new Error('the catalogue has not loaded'), { code: 'NO_CATALOGUE' });
    if (fromFile) { door('busy', `reading ${ask.file.name}`); program = await programFromFile(ask.file); }
    const d = decide(program);   // a program of the chain is decided before it is read: bare under AUTO
    setState('reading', 'READING');
    node = node || new Node(catalogue.endpoints, catalogue.chainId, say, renderLink);
    await ensureMachine(d);
    renderNow();   // the machine's rows fill as soon as it is up, while the program is read
    if (!fromFile) program = await programFromChain(node, catalogue, ask.work, ask.token, say);
    setState('checking', 'CHECKING');
    for (const [k, v] of Object.entries(program.statuses)) say(`${k}: ${v}`);
    if (fromFile) {
      const f = program.facts;
      say(`your file ${program.label}: ${num(program.bytes.length)} bytes, sha256 ${SHORT(f.sha256)}; read in this browser, sent nowhere, no chain claim`);
      say(`the scan: ${scanWords(f.scan)}`);
      if (f.known) say(`recognised: ${f.known.words}`);
      say(`firmware ${firmwareOn ? 'on' : 'off'} (${firmwareMode === 'auto' ? 'AUTO: ' + d.why : d.why}); input ${d.input} (${d.inputWhy})`);
      if (firmwareOn && f.load !== 0x0801) say(`the firmware starts only a program at $0801: type SYS ${f.load} at READY to start this one`);
    }
    inputMode = d.input; inputWhy = d.inputWhy; els.input.value = inputMode;
    await machine.request('input', { mode: inputMode });
    const buf = program.bytes.slice().buffer;
    const loaded = await machine.request('load', { kind: 'prg', bytes: buf, label: program.label.slice(0, 80) }, { transfer: [buf] });
    playing = { program, loaded, at: new Date().toISOString(), intervened: !!loaded.intervened, file: ask.file || null };
    veil('');
    setState('running', 'RUNNING');
    say(`running ${program.label}`);
    renderNow();
    markOffered(fromFile ? null : ask.work, fromFile ? null : ask.token);
    door(fromFile ? 'ok' : 'idle', fromFile ? `${program.label} · ${num(program.bytes.length)} bytes · running · no chain claim` : '');
  } catch (e) {
    const code = e.code || 'FAILED';
    if (fromFile) door('refused', `${code} · ${e.message}`);
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
function load(work, token) { return run({ work, token }); }

function markOffered(work, token) {
  for (const row of els.rows.querySelectorAll('.row')) row.classList.toggle('now', row.dataset.work === work && row.dataset.token === String(token));
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
      file: { name: f.name, size: f.size, type: f.type, modified: f.modified },
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
  if (p.kind === 'slotted') out.mind = { status: p.statuses.mind, head: f.head, headStatus: p.statuses.head, canonicalHash: f.canonicalHash, brainBlob: f.brainBlob };
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
    ['INPUT', (inputMode === 'joystick' ? 'joystick in port 2' : 'keyboard · the C64 matrix') + (inputWhy ? ` · ${inputWhy}` : ''), ''],
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
      rows.push(['MIND', `${p.statuses.mind} · revision ${f.head} (${p.statuses.head}) · hash ${SHORT(f.canonicalHash)} equals the record's`, '']);
    } else if (p.kind === 'file') {
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · sha256 ${SHORT(f.sha256)}`, '']);
      rows.push(['SCAN', scanWords(f.scan), '']);
      if (f.known) rows.push(['KNOWN', f.known.words, '']);
      const start = firmwareOn && f.load !== 0x0801 ? ` · the firmware starts only a program at $0801: type SYS ${f.load} at READY` : !firmwareOn && !f.scan.entry ? ' · a bare machine starts nothing without a SYS in a BASIC stub: switch FIRMWARE on' : '';
      rows.push(['CHECK', 'no chain claim · read in this browser and sent nowhere · its shape checked: a load address and a size within 64K' + start, '']);
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
  inputMode = els.input.value === 'keyboard' ? 'keyboard' : 'joystick';
  inputWhy = 'by the switch';
  if (machine && machine.alive) { try { await machine.request('input', { mode: inputMode }); } catch (e) { /* the machine is gone; the next load sets it */ } }
  if (playing) renderNow();
});
els.reset.addEventListener('click', async () => {
  if (!machine || !machine.alive) return;
  try { await machine.request('reset'); } catch (e) { return; }
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
function joy(bit, down) { if (machine && machine.alive) machine.request('joystick', { bit, down }).catch(() => {}); }
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
  if (audio.on && machine && machine.alive && !audio.attached) attachSound();
});

// ------------------------------------------------------------------ start
async function start() {
  els.firmware.value = firmwareMode; els.input.value = inputMode;   // a browser may restore a form's values on reload; the page's state is the page's
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
  if (!(work && allRows.some((r) => r.work === work && r.token === token))) { work = 'tony'; token = 1; }
  if (!allRows.some((r) => r.work === work && r.token === token)) { work = allRows[0].work; token = allRows[0].token; }
  revealRow(els.rows.querySelector(`.row[data-work="${work}"][data-token="${token}"]`));
  load(work, token);
}
window.machinePage = { get machine() { return machine; }, get playing() { return playing; }, get catalogue() { return catalogue; }, get audio() { return { ready: audio.ready, attached: audio.attached, pulled: audio.pulled, on: audio.on }; }, get pad() { return { held: ringHeld, ways, pressed: ringPointer !== null }; }, get firmware() { return { switch: firmwareMode, on: firmwareOn, why: firmwareWhy }; }, get input() { return inputMode; }, get nodes() { return node ? node.facts() : { setAside: [], demoted: [] }; }, provenance, report, STATUS };
start();
