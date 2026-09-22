// SPDX-License-Identifier: MIT
// THE MACHINE, the page: one machine in a frame, a search over the catalogue,
// the states beside the frame, NOW PLAYING with its provenance, the keys, and
// the way out. Nothing runs until a LOAD is pressed. The machine document is
// sandboxed and fed over the bridge (bridge-client.js); every read from the
// chain and every claim about it is chain.js's; this file is the page.
import { createMachine, bootMachine, partsFromSite, STATUS } from './bridge-client.js';
import { Node, machineFromChain, firmwareFromChain, programFromChain } from './chain.js';
import { createAudio } from './audio.js';

const PAGE = 'machine/1c';
const $ = (id) => document.getElementById(id);
const els = {
  frame: $('frame'), veil: $('veil'), veilText: $('veil-text'), search: $('search'), rows: $('rows'), count: $('count'),
  state: $('state'), log: $('log'), now: $('now'), json: $('provenance-json'), copy: $('copy'), copied: $('copied'),
  input: $('input-mode'), reset: $('reset'), retry: $('retry'), touch: $('touch'), copyLog: $('copy-log'),
  sound: $('sound'), ring: $('ring'), ways: $('ways'), firmware: $('firmware'),
  link: $('link'), linkState: $('link-state'), linkNode: $('link-node'), linkBlock: $('link-block'), linkEndpoints: $('link-endpoints'),
};
const audio = createAudio({ onStatus: (t) => say(t) });

let catalogue = null, node = null, machine = null, machineFacts = null, playing = null, lastAsk = null;
let busy = false, pendingAsk = null, pendingFirmware = null;
let inputMode = 'joystick';
let firmwareMode = 'off';   // 'off': the machine bare, as the programs of the series run on chain; 'on': OpenROMs pressing 1, READY first
const FIRMWARE_NAME = 'OpenROMs pressing 1';
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
/** The distinctive part of a node's name for the badge (publicnode, llamarpc, drpc, ankr, merkle, 1rpc); the whole name stays in the title and in NOW PLAYING. */
const shortHost = (h) => { const host = String(h).replace(/^https?:\/\//, '').split('/')[0]; const parts = host.split('.'); return parts.length >= 2 ? parts[parts.length - 2] : h; };
function renderLink(st) {
  els.link.dataset.phase = st.phase;
  els.linkState.textContent = LINK_WORDS[st.phase] || st.phase.toUpperCase();
  els.linkNode.textContent = st.host ? shortHost(st.host) : (st.phase === 'off' ? 'no node yet' : 'no node');
  const bits = [];
  if (st.block) bits.push(`#${st.block}`);
  if (st.phase === 'reading' && st.reads) bits.push(`${st.reads} read${st.reads === 1 ? '' : 's'}`);
  if (st.setAside) bits.push(`${st.setAside} set aside`);
  els.linkBlock.textContent = bits.join(' · ');
  els.link.title = st.host ? `${st.host}${st.block ? ` · block ${num(st.block)} · ${st.blockHash}` : ''}` : 'no node yet';
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

// ------------------------------------------------------------------ the machine
async function ensureMachine() {
  if (machine && machine.alive) return;
  veil('STARTING THE MACHINE');
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
  if (firmwareMode === 'on') {
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
  const ready = await bootMachine(machine, bytes, { firmware: firmwareMode === 'on', status: firmware.status });
  machineFacts = { name: ready.emulator, status: ready.status.emulator, source: bytes.source, observation: bytes.observation || null, firmware };
  await machine.request('input', { mode: inputMode });
  await attachSound();
  veil('');
}
/** The firmware switch: the machine is rebuilt with or without the ROMs, and what was playing is read and run again. */
async function setFirmware(mode) {
  if (mode === firmwareMode) return;
  if (busy) { pendingFirmware = mode; return; }
  busy = true;
  firmwareMode = mode;
  els.firmware.value = mode;
  // a READY prompt wants the keyboard; a program of the series wants the stick
  inputMode = mode === 'on' ? 'keyboard' : 'joystick';
  els.input.value = inputMode;
  const was = playing ? { work: playing.program.facts.work, token: playing.program.facts.token } : null;
  try {
    if (machine) {
      say(mode === 'on' ? `firmware on: rebuilding the machine with ${FIRMWARE_NAME}` : 'firmware off: rebuilding the machine bare');
      audio.detach();
      machine.destroy();
      machine = null;
      playing = null;
      setState('reading', 'REBUILDING');
      node = node || new Node(catalogue.endpoints, catalogue.chainId, say, renderLink);
      await ensureMachine();
      if (mode === 'on') {
        // the switch shows the firmware: READY, and LOAD runs a program under it
        setState('idle', 'READY'); say(`${FIRMWARE_NAME} is at READY; LOAD runs a program under it`); renderNow(); markOffered(null, null);
      } else if (was) {
        pendingAsk = was;   // bare again, as on chain: the program that was playing runs again
      } else {
        setState('idle', 'THE MACHINE IS ON'); veil('BARE · press LOAD to run a program'); renderNow(); markOffered(null, null);
      }
    } else {
      say(mode === 'on' ? `firmware on: the machine will boot ${FIRMWARE_NAME} when it starts` : 'firmware off: the machine will start bare');
    }
  } catch (e) {
    setState('failed', 'THE MACHINE DID NOT START');
    say(`the machine did not start under the firmware switch (${e.code || 'FAILED'}: ${e.message})`);
    veil('THE MACHINE STOPPED · press LOAD to start it again');
    renderNow(e.code || 'FAILED', e.message);
  } finally {
    busy = false;
    if (pendingFirmware !== null) { const m = pendingFirmware; pendingFirmware = null; setFirmware(m); }
    else if (pendingAsk) { const next = pendingAsk; pendingAsk = null; load(next.work, next.token); }
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

async function load(work, token) {
  if (busy) { pendingAsk = { work, token }; return; }
  busy = true;
  lastAsk = { work, token };
  els.copied.textContent = '';
  try {
    if (!catalogue) throw Object.assign(new Error('the catalogue has not loaded'), { code: 'NO_CATALOGUE' });
    setState('reading', 'READING');
    node = node || new Node(catalogue.endpoints, catalogue.chainId, say, renderLink);
    await ensureMachine();
    renderNow();   // the machine's rows fill as soon as it is up, while the program is read
    const program = await programFromChain(node, catalogue, work, token, say);
    setState('checking', 'CHECKING');
    for (const [k, v] of Object.entries(program.statuses)) say(`${k}: ${v}`);
    const buf = program.bytes.slice().buffer;
    const loaded = await machine.request('load', { kind: 'prg', bytes: buf, label: program.label.slice(0, 80) }, { transfer: [buf] });
    playing = { program, loaded, at: new Date().toISOString(), intervened: !!loaded.intervened };
    veil('');
    setState('running', 'RUNNING');
    say(`running ${program.label}`);
    renderNow();
    markOffered(work, token);
  } catch (e) {
    const code = e.code || 'FAILED';
    if (code === 'RPC_UNAVAILABLE') {
      setState('failed', 'NO NODE ANSWERED');
      say(`no endpoint answered (${e.message}); RETRY, or read the contract on Etherscan`);
    } else {
      setState('refused', `REFUSED · ${code}`);
      say(`refused: ${e.message}`);
    }
    playing = null;
    renderNow(code, e.message);
  } finally {
    busy = false;
    if (pendingFirmware !== null) { const m = pendingFirmware; pendingFirmware = null; setFirmware(m); }
    else if (pendingAsk) { const next = pendingAsk; pendingAsk = null; load(next.work, next.token); }
  }
}

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
  const out = {
    page: PAGE, at: playing.at, work: f.workName, workKey: f.work, contract: f.contract, token: f.token, label: p.label,
    program: { bytes: p.bytes.length, sha256: f.sha256, status: p.statuses.program, pins: f.pins },
    node: f.node, observation: f.observation, reads: f.reads, nodes: node ? node.facts() : null,
    machine: machineFacts, firmware: machineFacts.firmware, input: inputMode, mode: 'PURE', intervened: playing.intervened,
  };
  if (p.kind === 'stamped') out.stamp = { status: p.statuses.stamp, block: f.block, stampedAt: f.stampedAt, previousBlockHash: f.prevHash, digits: f.digits, seed: f.seed, row: f.row };
  if (p.kind === 'slotted') out.mind = { status: p.statuses.mind, head: f.head, headStatus: p.statuses.head, canonicalHash: f.canonicalHash, brainBlob: f.brainBlob };
  return out;
}
function line(k, v, cls) {
  const d = document.createElement('div');
  d.className = 'nl' + (cls ? ' ' + cls : '');
  const a = document.createElement('span'); a.className = 'k'; a.textContent = k;
  const b = document.createElement('span'); b.className = 'v'; b.textContent = v;
  d.append(a, b);
  return d;
}
const DASH = '—';
/** The machine's rows, present from the first paint and filled as the facts arrive, so the panel keeps its shape. */
function machineRows() {
  const mf = machineFacts, fw = mf && mf.firmware;
  let firmware;
  if (fw && fw.mode === 'on') firmware = `on · ${FIRMWARE_NAME} · ${fw.status} · from ${fw.source} · a program of the series runs the same, it banks the ROMs out as it starts`;
  else if (!mf && firmwareMode === 'on') firmware = `on · ${FIRMWARE_NAME} boots first when the machine starts`;
  else firmware = 'off · the program runs bare, as it does on chain';
  const obs = playing && playing.program.facts.observation;
  const host = obs ? `${obs.node} · read at block ${num(obs.block)} · hash ${SHORT(obs.blockHash)}` : (node && node.url ? node.url.replace(/^https?:\/\//, '') : null);
  const aside = node && node.quarantined.size ? ` · ${node.quarantined.size} set aside this visit` : '';
  return [
    ['MACHINE', mf ? `${mf.status} · ${mf.name} · from ${mf.source}` : `${DASH} · READY 64 starts with the first LOAD`, mf ? '' : 'muted'],
    ['FIRMWARE', firmware, ''],
    ['INPUT', inputMode === 'joystick' ? 'joystick in port 2 · arrows, Z, X or space' : 'keyboard · the C64 matrix', ''],
    ['MODE', playing && playing.intervened ? 'INTERVENED · a write reached the machine from outside' : 'PURE · nothing on this page reaches into the machine', ''],
    ['NODE', (host || DASH) + aside, host ? '' : 'muted'],
  ];
}
/** The program's rows: what is playing, what was refused, or the dashes of nothing yet; always the same shape. */
function programRows(code, text) {
  if (playing) {
    const p = playing.program, f = p.facts;
    const rows = [['PROGRAM', p.label, '']];
    if (p.kind === 'stamped') {
      rows.push(['ROOM', `${f.row.colourName.toLowerCase()} · ${f.row.wallName.toLowerCase()} wall · ${f.row.batsName.toLowerCase()} bats · ${f.row.candleName.toLowerCase()}`, '']);
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · outside the stamp equal to the pinned base · sha256 ${SHORT(f.sha256)}`, '']);
      rows.push(['STAMP', `${p.statuses.stamp} · block ${num(f.stampedAt)} · the row's character and colour, the block's digits and the seed from the node's block hash all agree`, '']);
    } else if (p.kind === 'slotted') {
      rows.push(['BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · outside the mind equal to the frozen program · sha256 ${SHORT(f.sha256)}`, '']);
      rows.push(['MIND', `${p.statuses.mind} · revision ${f.head} (${p.statuses.head}) · hash ${SHORT(f.canonicalHash)} equals the record's`, '']);
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
  const atReady = state.phase === 'idle' && machineFacts && machineFacts.firmware.mode === 'on';
  return [
    ['PROGRAM', atReady ? `READY · ${FIRMWARE_NAME} is at its prompt · type at it, or LOAD a program` : `${DASH} · choose a program; nothing runs until you press LOAD`, 'muted'],
    ['BYTES', DASH, 'muted'],
    ['CHECK', DASH, 'muted'],
  ];
}
function renderNow(code, text) {
  els.now.textContent = '';
  for (const [k, v, cls] of programRows(code, text).concat(machineRows())) els.now.appendChild(line(k, v, cls));
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
  if (machine && machine.alive) { try { await machine.request('input', { mode: inputMode }); } catch (e) { /* the machine is gone; the next load sets it */ } }
  if (playing) renderNow();
});
els.reset.addEventListener('click', async () => {
  if (!machine || !machine.alive) return;
  try { await machine.request('reset'); } catch (e) { return; }
  playing = null;
  setState('idle', firmwareMode === 'on' ? 'READY' : 'RESET');
  say(firmwareMode === 'on' ? `the machine was reset; ${FIRMWARE_NAME} is at READY` : 'the machine was reset; it is on and bare');
  if (firmwareMode !== 'on') veil('BARE · press LOAD to run a program');
  renderNow();
  markOffered(null, null);
});
els.firmware.addEventListener('change', () => { setFirmware(els.firmware.value === 'on' ? 'on' : 'off'); });
els.retry.addEventListener('click', () => { if (lastAsk) load(lastAsk.work, lastAsk.token); });
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
window.machinePage = { get machine() { return machine; }, get playing() { return playing; }, get catalogue() { return catalogue; }, get audio() { return { ready: audio.ready, attached: audio.attached, pulled: audio.pulled, on: audio.on }; }, get pad() { return { held: ringHeld, ways, pressed: ringPointer !== null }; }, get firmware() { return firmwareMode; }, get input() { return inputMode; }, get nodes() { return node ? node.facts() : { setAside: [], demoted: [] }; }, provenance, report, STATUS };
start();
