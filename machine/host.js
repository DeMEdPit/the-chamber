// SPDX-License-Identifier: MIT
// THE MACHINE, the page: one machine in a frame, a search over the catalogue,
// the states beside the frame, NOW PLAYING with its provenance, the keys, and
// the way out. Nothing runs until a LOAD is pressed. The machine document is
// sandboxed and fed over the bridge (bridge-client.js); every read from the
// chain and every claim about it is chain.js's; this file is the page.
import { createMachine, bootMachine, partsFromSite, STATUS } from './bridge-client.js';
import { Node, machineFromChain, programFromChain } from './chain.js';

const PAGE = 'machine/1c';
const $ = (id) => document.getElementById(id);
const els = {
  frame: $('frame'), veil: $('veil'), veilText: $('veil-text'), search: $('search'), rows: $('rows'), count: $('count'),
  state: $('state'), log: $('log'), now: $('now'), json: $('provenance-json'), copy: $('copy'), copied: $('copied'),
  input: $('input-mode'), reset: $('reset'), retry: $('retry'), touch: $('touch'), offered: $('offered'),
};

let catalogue = null, node = null, machine = null, machineFacts = null, playing = null, lastAsk = null;
let inputMode = 'joystick';
const state = { phase: 'off' };
const LOG_LINES = 14;
const SHORT = (h) => (h ? h.slice(0, 12) + '…' : '');
const num = (n) => Number(n).toLocaleString('en-US');

function say(text) {
  const li = document.createElement('li');
  li.textContent = text;
  els.log.appendChild(li);
  while (els.log.children.length > LOG_LINES) els.log.removeChild(els.log.firstChild);
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
    say('the machine matched its pins: PINNED, from the chain');
  } catch (e) {
    say(`the chain did not give the machine (${e.code}: ${e.message}); the site's copies instead`);
    bytes = await partsFromSite();
    say('the site\'s copies matched their pins: PINNED');
  }
  const ready = await bootMachine(machine, bytes, { firmware: false });
  machineFacts = { name: ready.emulator, status: ready.status.emulator, source: bytes.source, firmware: false };
  await machine.request('input', { mode: inputMode });
  veil('');
}

async function load(work, token) {
  lastAsk = { work, token };
  els.copied.textContent = '';
  try {
    if (!catalogue) throw Object.assign(new Error('the catalogue has not loaded'), { code: 'NO_CATALOGUE' });
    setState('reading', 'READING');
    node = node || new Node(catalogue.endpoints, catalogue.chainId, say);
    await ensureMachine();
    const program = await programFromChain(node, catalogue, work, token, say);
    setState('checking', 'CHECKING');
    for (const [k, v] of Object.entries(program.statuses)) say(`${k}: ${v}`);
    const buf = program.bytes.slice().buffer;
    const loaded = await machine.request('load', { kind: 'prg', bytes: buf, label: program.label.slice(0, 80) }, { transfer: [buf] });
    playing = { program, loaded, at: new Date().toISOString(), intervened: !!loaded.intervened };
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
  }
}

function markOffered(work, token) {
  for (const row of els.rows.querySelectorAll('.row')) row.classList.toggle('now', row.dataset.work === work && row.dataset.token === String(token));
}

// ------------------------------------------------------------------ NOW PLAYING
function provenance() {
  if (!playing) return null;
  const p = playing.program, f = p.facts;
  const out = {
    page: PAGE, at: playing.at, work: f.workName, workKey: f.work, contract: f.contract, token: f.token, label: p.label,
    program: { bytes: p.bytes.length, sha256: f.sha256, status: p.statuses.program, pins: f.pins },
    node: f.node, reads: f.reads,
    machine: machineFacts, firmware: false, input: inputMode, mode: 'PURE', intervened: playing.intervened,
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
function renderNow(code, text) {
  els.now.textContent = '';
  if (!playing) {
    if (code) {
      els.now.appendChild(line(code === 'RPC_UNAVAILABLE' ? 'NO NODE' : 'REFUSED', text, 'bad'));
      if (code !== 'RPC_UNAVAILABLE') els.now.appendChild(line('WHAT THAT MEANS', 'the bytes did not match what the catalogue pinned, so they did not run', 'muted'));
    } else {
      els.now.appendChild(line('NOTHING', 'choose a program; nothing runs until you press LOAD', 'muted'));
    }
    els.json.value = '';
    return;
  }
  const p = playing.program, f = p.facts;
  els.now.appendChild(line('PROGRAM', p.label));
  if (p.kind === 'stamped') {
    els.now.appendChild(line('ROOM', `${f.row.colourName.toLowerCase()} · ${f.row.wallName.toLowerCase()} wall · ${f.row.batsName.toLowerCase()} bats · ${f.row.candleName.toLowerCase()}`));
    els.now.appendChild(line('BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · outside the stamp equal to the pinned base · sha256 ${SHORT(f.sha256)}`));
    els.now.appendChild(line('STAMP', `${p.statuses.stamp} · block ${num(f.stampedAt)} · the row's character and colour, the block's digits and the seed from the node's block hash all agree`));
  } else if (p.kind === 'slotted') {
    els.now.appendChild(line('BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · outside the mind equal to the frozen program · sha256 ${SHORT(f.sha256)}`));
    els.now.appendChild(line('MIND', `${p.statuses.mind} · revision ${f.head} (${p.statuses.head}) · hash ${SHORT(f.canonicalHash)} equals the record's`));
  } else {
    els.now.appendChild(line('BYTES', `${p.statuses.program} · ${num(p.bytes.length)} bytes · keccak256 ${SHORT(f.keccak256)} equals the pin`));
  }
  els.now.appendChild(line('MACHINE', `${machineFacts.status} · ${machineFacts.name} · from ${machineFacts.source}`));
  els.now.appendChild(line('FIRMWARE', 'off · the program runs bare, as it does on chain'));
  els.now.appendChild(line('INPUT', inputMode === 'joystick' ? 'joystick in port 2 · arrows, Z, X or space' : 'keyboard · the C64 matrix'));
  els.now.appendChild(line('MODE', playing.intervened ? 'INTERVENED · a write reached the machine from outside' : 'PURE · nothing on this page reaches into the machine'));
  els.now.appendChild(line('NODE', f.node || '—'));
  els.json.value = JSON.stringify(provenance(), null, 1);
}

// ------------------------------------------------------------------ controls
els.search.addEventListener('input', () => renderRows(els.search.value));
els.copy.addEventListener('click', async () => {
  const text = els.json.value;
  if (!text) { els.copied.textContent = 'nothing playing'; return; }
  try { await navigator.clipboard.writeText(text); els.copied.textContent = 'copied as JSON'; }
  catch (e) { els.json.hidden = false; els.json.select(); els.copied.textContent = 'select and copy'; }
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
  setState('idle', 'RESET');
  say('the machine was reset; it is on and bare');
  renderNow();
  markOffered(null, null);
});
els.retry.addEventListener('click', () => { if (lastAsk) load(lastAsk.work, lastAsk.token); });
for (const b of els.touch.querySelectorAll('button[data-bit]')) {
  const bit = Number(b.dataset.bit);
  const send = (down) => { if (machine && machine.alive) machine.request('joystick', { bit, down }).catch(() => {}); };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); send(true); });
  for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, (e) => { e.preventDefault(); send(false); });
}

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
  say(`catalogue of ${catalogue.generated.slice(0, 10)}: ${allRows.length} programs, ${catalogue.endpoints.length} endpoints`);
  const q = new URLSearchParams(location.search);
  const work = q.get('work'), token = parseInt(q.get('token') || '1', 10);
  if (work && allRows.some((r) => r.work === work && r.token === token)) {
    els.search.value = work === 'chamber' ? String(token) : work;
    renderRows(els.search.value);
    const row = els.rows.querySelector(`.row[data-work="${work}"][data-token="${token}"]`);
    if (row) { row.classList.add('offered'); row.scrollIntoView({ block: 'nearest' }); }
    els.offered.textContent = `offered by the address: ${allRows.find((r) => r.work === work && r.token === token).title}. Press LOAD to run it.`;
    els.offered.hidden = false;
  }
}
window.machinePage = { get machine() { return machine; }, get playing() { return playing; }, get catalogue() { return catalogue; }, provenance, STATUS };
start();
