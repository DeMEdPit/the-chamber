// SPDX-License-Identifier: MIT
// The page's gate (G5, and the chain door's part of G1), in a real browser
// against a synthetic chain: machine/test/synthetic.py serves a stand-in node
// whose programs are synthetic and whose machine is the site's real copies at
// their real addresses; serve.mjs serves the site with that catalogue in
// place of the committed one and forwards /rpc to the stand-in.
//
// What it holds: the page loads at 390, 1180 and 1440 wide with no console
// error and the frame present; its policy is the strict one; no request
// leaves the test host; the search narrows the rows; LOAD on a Chamber token
// reads the program, holds it to its pins (PINNED outside the stamp,
// CONTRACT-CONSISTENT inside it), boots the real machine off the stand-in
// chain (PINNED, from the chain) and runs the program, which the machine's
// screen proves; the provenance copies as JSON with those statuses; the
// Perception head and a whole program load; RESET works; an address offers a
// program and never runs it; a program altered outside its stamp is REFUSED
// HASH_MISMATCH and never runs; when the chain does not give the machine, the
// page boots it from the site's copies and says so; on a coarse pointer the
// ring reads by angle (one direction or both) and FIRE beside it, the machine's
// own port proving what they hold; every read of the chain is at a block and the
// provenance names the node, the block and its hash (the read session); on a
// two-node rig, an endpoint that contradicts a pin is set aside for the visit
// and the read restarts whole on the next, while one that fails in transport is
// demoted and the read restarts there too, with no verdict on it.
//
//   node machine/test/page.mjs
// Needs Playwright and Chromium (machine/test/pw.mjs finds them) and python3.

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from './pw.mjs';
import { start } from './serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(HERE, 'evidence');
let nextPort = Number(process.env.PORT || 8271);
let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };

function synthetic(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('python3', [join(HERE, 'synthetic.py'), '--serve', ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = '';
    p.stdout.on('data', (c) => { buf += c; const i = buf.indexOf('\n'); if (i >= 0 && !p.ready) { p.ready = true; resolve(Object.assign(JSON.parse(buf.slice(0, i)), { proc: p })); } });
    p.on('exit', (code) => { if (!p.ready) reject(new Error('synthetic.py exited ' + code)); });
  });
}
async function world(args, extra = {}) {
  const s = await synthetic(args);
  const s2 = extra.second ? await synthetic(extra.second) : null;   // a second stand-in, served at /rpc2
  const port = nextPort++;
  const server = await start(port, { catalogue: s.catalogue, rpcUpstreams: Object.assign({ '/rpc': s.rpc }, s2 ? { '/rpc2': s2.rpc } : {}), faults: extra.faults || {} });
  return { base: `http://127.0.0.1:${port}`, log: server.log, close() { server.close(); for (const x of [s, s2]) { if (x) { x.proc.stdin.end(); x.proc.kill(); } } } };
}
async function until(fn, ms, step = 250) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); }
}
const noiseFree = (errs) => errs.filter((t) => !/favicon/.test(t));

await mkdir(EVIDENCE, { recursive: true });
const b = await browser();
try {
  // A. the page, and a program from the chain
  const A = await world(['--real-machine']);
  const pg = await b.newPage({ viewport: { width: 1180, height: 900 } });
  const pageErrors = [], consoleErrors = [], requests = [];
  pg.on('pageerror', (e) => pageErrors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  pg.on('request', (q) => requests.push(q.url()));
  await pg.goto(`${A.base}/machine/`, { waitUntil: 'load' });
  const rows = await until(() => pg.evaluate(() => document.querySelectorAll('#rows .row').length), 10000);
  check(rows === 67, `the catalogue's rows render (${rows})`);
  const policy = await pg.evaluate(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
  check(/script-src 'self';/.test(policy) && /connect-src 'self' /.test(policy) && /frame-src 'self'/.test(policy), 'the page carries the strict policy');
  check(!(await pg.evaluate(() => Array.from(document.scripts).some((s) => !s.src))), 'no inline script on the page');
  const opening = await until(() => pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /Tony: Born for Adventure/.test(document.getElementById('now').textContent)), 90000, 500);
  check(!!opening, 'the page opens on the Tony demo, running');
  await pg.fill('#search', '5');
  const narrowed = await pg.evaluate(() => document.querySelectorAll('#rows .row').length);
  check(narrowed > 0 && narrowed < 67, `the search narrows the rows (${narrowed})`);
  await pg.click('#rows .row[data-work="chamber"][data-token="5"] button.load');
  const running = await until(() => pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /The Chamber · 5/.test(document.getElementById('now').textContent)), 90000, 500);
  const stateText = await pg.evaluate(() => document.getElementById('state').textContent);
  check(!!running, `LOAD on Chamber token 5 reaches RUNNING (${stateText})`);
  const now = await pg.evaluate(() => document.getElementById('now').textContent);
  check(/PINNED/.test(now) && /CONTRACT-CONSISTENT/.test(now) && /block 4,999/.test(now) && /PURE/.test(now), 'NOW PLAYING: the program PINNED, the stamp CONTRACT-CONSISTENT at the block, the mode PURE');
  const prov = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(prov && prov.program.status === 'PINNED' && prov.stamp.status === 'CONTRACT-CONSISTENT' && prov.stamp.stampedAt === 4999 && prov.machine.status === 'PINNED' && /ethereum/.test(prov.machine.source) && prov.mode === 'PURE' && prov.intervened === false,
        `the provenance as JSON: ${prov ? JSON.stringify({ program: prov.program.status, stamp: prov.stamp.status, machine: prov.machine.source }) : 'none'}`);
  // at 1180 wide the badge sits at the left in its long form; innerText reads the form that is shown
  const linkA = await pg.evaluate(() => ({ phase: document.getElementById('link').dataset.phase, state: document.getElementById('link-state').innerText, node: document.getElementById('link-node').innerText, block: document.getElementById('link-block').innerText, cells: [...document.querySelectorAll('#link-endpoints i')].map((i) => i.dataset.state), left: document.getElementById('link').getBoundingClientRect().left - document.getElementById('frame').getBoundingClientRect().left }));
  check(linkA.phase === 'held' && linkA.state === 'HELD' && linkA.node === '/rpc' && /^block [\d,]+ · [0-9a-f]{12}…$/.test(linkA.block) && linkA.cells.join() === 'held' && linkA.left < 40, `THE CHAIN badge on the desktop, at the left in its long form: ${linkA.state} · ${linkA.node} · ${linkA.block} · cells ${linkA.cells.join()} · ${Math.round(linkA.left)}px from the frame's left`);
  check(await pg.evaluate(() => /^ETHEREUM \(chain 1\) · \/rpc · block [\d,]+ · [0-9a-f]{64}$/.test(document.getElementById('link').title)), 'the badge\'s title carries the chain\'s name, the whole node name, the block and its full hash');
  check(await pg.evaluate(() => document.getElementById('link-chain').textContent === 'ETHEREUM'), 'the badge names the chain from the catalogue: ETHEREUM for chain 1');
  const readsA = A.log.filter((r) => ['eth_call', 'eth_getCode'].includes(r.method));
  check(readsA.length > 0 && readsA.every((r) => /^0x[0-9a-f]+$/.test(String(r.params[1]))), `every contract read is at a block, none at latest (${readsA.length} reads)`);
  const lastCall = readsA.filter((r) => r.method === 'eth_call').pop();
  check(prov && prov.observation && prov.observation.node === '/rpc' && Number.isInteger(prov.observation.block) && /^[0-9a-f]{64}$/.test(prov.observation.blockHash) && parseInt(lastCall.params[1], 16) === prov.observation.block, `the provenance names the observation: node ${prov && prov.observation && prov.observation.node}, block ${prov && prov.observation && prov.observation.block}, its hash`);
  const ran = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 1)), 10000);
  check(!!ran, 'the program ran on the machine (screen code 1 at $0400)');
  const sound = await until(() => pg.evaluate(() => { const a = window.machinePage.audio; return a.attached && a.pulled > 3 ? a : null; }), 8000);
  check(!!sound, `the page plays the machine's sound: attached ${sound ? sound.attached : false}, ${sound ? sound.pulled : 0} buffers pulled`);
  const outside = requests.filter((u) => !u.startsWith(A.base));
  check(outside.length === 0, `no request left the test host (${outside.length})`);
  await pg.screenshot({ path: join(EVIDENCE, 'page-1180.png'), fullPage: true });
  const nowRow = await pg.evaluate(() => document.querySelector('#rows .row.now') && document.querySelector('#rows .row.now').dataset.token);
  check(nowRow === '5', 'the playing row is marked');
  await pg.fill('#search', 'perception');
  await pg.click('#rows .row[data-work="perception-canary"] button.load');
  const running2 = await until(() => pg.evaluate(() => /revision 2/.test(document.getElementById('now').textContent) && document.getElementById('state').dataset.phase === 'running'), 30000, 500);
  check(!!running2, 'the Perception head loads: revision 2, the mind CONTRACT-CONSISTENT');
  const now2 = await pg.evaluate(() => document.getElementById('now').textContent);
  check(/MIND/.test(now2) && /CONTRACT-CONSISTENT/.test(now2) && /NODE-REPORTED/.test(now2), 'NOW PLAYING for a mind: MIND CONTRACT-CONSISTENT, the head NODE-REPORTED');
  await pg.fill('#search', 'tony');
  await pg.click('#rows .row[data-work="tony"] button.load');
  const running3 = await until(() => pg.evaluate(() => /keccak256/.test(document.getElementById('now').textContent) && document.getElementById('state').dataset.phase === 'running'), 30000, 500);
  check(!!running3, 'a whole program loads: PINNED by keccak256');
  // the file door: a .prg of your own runs and is said as YOUR FILE with no chain claim; what is not a program is
  // refused in words at the door, and the running program is left alone
  const PRG_B = Buffer.from([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0xa9, 0x02, 0x8d, 0x00, 0x04, 0x60]);   // 10 SYS2061 : LDA #2 ; STA $0400 ; RTS
  const requestsBefore = requests.length;
  await pg.setInputFiles('#file', { name: 'hello.prg', mimeType: 'application/octet-stream', buffer: PRG_B });
  const fileRan = await until(() => pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent) && /YOUR FILE/.test(document.getElementById('now').textContent)), 30000, 500);
  check(!!fileRan, 'a .prg of your own runs: NOW PLAYING names the file and says YOUR FILE');
  const wroteB = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 2)), 10000);
  check(!!wroteB, 'the file ran on the machine (screen code 2 at $0400)');
  const provFile = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provFile && provFile.program.status === 'YOUR FILE' && !('pins' in provFile.program) && provFile.node === null && provFile.observation === null && provFile.file && provFile.file.name === 'hello.prg' && provFile.file.size === 20 && provFile.program.load === 0x0801 && /^[0-9a-f]{64}$/.test(provFile.program.sha256) && provFile.machine.status === 'PINNED',
        `the provenance of a file claims nothing of the chain: YOUR FILE, no pins, no node, no observation; the machine still ${provFile && provFile.machine.status}`);
  check(requests.length === requestsBefore, `the file made no request of any kind (${requests.length - requestsBefore})`);
  check(await pg.evaluate(() => !document.querySelector('#rows .row.now') && document.getElementById('door').dataset.state === 'ok' && /^hello\.prg · 20 bytes · running/.test(document.getElementById('door-text').textContent)), 'no row of the chain is marked while a file plays; the door says what it ran');
  const refusals = [
    ['two.prg', Buffer.from([0x01, 0x08]), 'PRG_TOO_SHORT', /two-byte load address/],
    ['big.prg', Buffer.alloc(65539, 1), 'FILE_TOO_LARGE', /65,539 bytes/],
    ['high.prg', Buffer.concat([Buffer.from([0x00, 0xff]), Buffer.alloc(512, 1)]), 'PRG_ADDRESS_OVERFLOW', /\$ff00/],
    ['notes.txt', Buffer.from('hello, machine\n'), 'KIND_UNSUPPORTED', /not a \.prg file \(15 bytes, beginning 68 65 6c 6c 6f 2c 20 6d\)/],
    ['disk.d64', Buffer.alloc(174848), 'KIND_UNSUPPORTED', /a disk image \(174,848 bytes\)/],
    ['cart.crt', Buffer.concat([Buffer.from('C64 CARTRIDGE   '), Buffer.alloc(48)]), 'KIND_UNSUPPORTED', /a cartridge image/],
  ];
  for (const [name, buffer, code, words] of refusals) {
    await pg.setInputFiles('#file', { name, mimeType: 'application/octet-stream', buffer });
    const said = await until(() => pg.evaluate((n) => { const d = document.getElementById('door'); return d.dataset.state === 'refused' && d.textContent.includes(n) ? d.textContent : null; }, name), 10000, 100);
    check(!!said && said.includes(code) && words.test(said), `${name} is refused ${code} in words: ${said ? said.trim().slice(0, 120) : 'nothing said'}`);
  }
  check(await pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent)), 'a refused file leaves the running program alone');
  check(requests.length === requestsBefore, `the refusals made no request either (${requests.length - requestsBefore})`);
  // AUTO: the switch reads a file for what it needs. A file that calls the KERNAL gets the firmware, the machine rebuilt with
  // the pressing from the chain; a BASIC program is RUN under it; a file that needs nothing runs bare again; a program of
  // the chain runs bare, as on chain
  const nowText = () => pg.evaluate(() => document.getElementById('now').textContent);
  const whyText = () => pg.evaluate(() => document.getElementById('firmware-why').textContent);
  /** NOW PLAYING's text once the page says RUNNING and the panel names the program; null until then. */
  const playingNamed = (name) => pg.evaluate((n) => (document.getElementById('state').dataset.phase === 'running' && new RegExp(n).test(document.getElementById('now').textContent) ? document.getElementById('now').textContent : null), name);
  check(await pg.evaluate(() => document.getElementById('firmware').value === 'auto') && /^AUTO · bare · no call into a ROM$/.test(await whyText()), `the switch reads auto and its line says why the machine is bare for the file playing (${await whyText()})`);
  const stub = (...code) => Buffer.from([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, ...code]);
  await pg.setInputFiles('#file', { name: 'kernal.prg', mimeType: 'application/octet-stream', buffer: stub(0xa9, 0x93, 0x20, 0xd2, 0xff, 0xa9, 0x43, 0x20, 0xd2, 0xff, 0x60) });   // LDA #147 ; JSR CHROUT ; LDA #'C' ; JSR CHROUT ; RTS
  const autoOn = await until(async () => { const t = await playingNamed('kernal\\.prg'); return t && /FIRMWARE.*on · OpenROMs pressing 1 · PINNED · from ethereum.*AUTO: calls the KERNAL 2 times \(CHROUT\)/.test(t) ? t : null; }, 90000, 500);
  check(!!autoOn, 'AUTO: a file that calls the KERNAL gets the firmware, the machine rebuilt with the pressing from the chain, the reason in NOW PLAYING');
  const wroteC = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 3)), 15000);
  check(!!wroteC, 'the file ran under the firmware: CHROUT cleared the screen and wrote C at $0400');
  check(/SCAN.*loads at \$0801 to \$0817 · SYS 2061 in its stub · calls the KERNAL 2 times \(CHROUT\) · reads neither port 2 nor the matrix · no write to the SID/.test(await nowText()), 'NOW PLAYING carries the scan');
  check(await pg.evaluate(() => window.machinePage.input === 'keyboard' && document.getElementById('input-mode').value === 'keyboard') && /INPUT.*keyboard · the C64 matrix · READY wants typing/.test(await nowText()) && /^AUTO · on · calls the KERNAL 2 times \(CHROUT\)$/.test(await whyText()), `the keyboard is the input, said why; the line under the switch (${await whyText()})`);
  const provAuto = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provAuto && provAuto.firmware.mode === 'on' && provAuto.firmware.switch === 'auto' && provAuto.firmware.status === 'PINNED' && /CHROUT/.test(provAuto.firmware.why) && provAuto.scan.kernal.calls === 2 && provAuto.scan.kernal.names.join() === 'CHROUT' && provAuto.needs.firmware === true && provAuto.known === null && provAuto.inputWhy === 'READY wants typing',
        'the provenance carries the switch, the decision and its reason, the scan and the needs');
  const screenHasLine = (want) => pg.evaluate((w) => window.machinePage.machine.request('screen').then((r) => (r.text.split('\n').some((l) => l.trim() === w) ? r.text : null)).catch(() => null), want);
  await pg.setInputFiles('#file', { name: 'hi.prg', mimeType: 'application/octet-stream', buffer: Buffer.from([0x01, 0x08, 0x0c, 0x08, 0x0a, 0x00, 0x99, 0x20, 0x22, 0x48, 0x49, 0x22, 0x00, 0x00, 0x00]) });   // 10 PRINT "HI"
  const basicRan = await until(async () => { const t = await playingNamed('hi\\.prg'); return t && /AUTO: a BASIC program of 1 line/.test(t) ? t : null; }, 90000, 500);
  check(!!basicRan, 'a BASIC program: AUTO keeps the firmware, the reason names the program');
  check(!!(await until(() => screenHasLine('HI'), 20000, 500)), 'the firmware RUN it: HI on the screen');
  await pg.setInputFiles('#file', { name: 'hello.prg', mimeType: 'application/octet-stream', buffer: PRG_B });
  const bareAgain = await until(async () => { const t = await playingNamed('hello\\.prg'); return t && /FIRMWARE.*off · the program runs bare, as it does on chain · AUTO: no call into a ROM/.test(t) ? t : null; }, 90000, 500);
  check(!!bareAgain, 'a file that needs nothing: AUTO rebuilds the machine bare and runs it');
  const wroteB2 = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 2)), 15000);
  check(!!wroteB2, 'it ran on the bare machine (screen code 2 at $0400, fresh memory)');
  check(await pg.evaluate(() => window.machinePage.input === 'joystick') && /INPUT.*joystick in port 2.*nothing reads port 2 or the matrix; the stick, as for the series/.test(await nowText()), 'the stick is the input for a file that reads nothing, said why');
  await pg.fill('#search', 'tony');
  await pg.click('#rows .row[data-work="tony"] button.load');
  const chainBare = await until(async () => { const t = await playingNamed('Tony: Born for Adventure'); return t && /FIRMWARE.*off · the program runs bare, as it does on chain · AUTO: a program of the chain runs bare, as it does on chain/.test(t) ? t : null; }, 90000, 500);
  check(!!chainBare, 'a program of the chain after a file: bare, as on chain, the reason said');
  // the firmware switch: on shows the firmware at READY, LOAD runs a program under it, RESET brings READY back, off is bare again
  const screenHasReady = () => pg.evaluate(() => window.machinePage.machine.request('screen').then((r) => (/READY\./.test(r.text) && /OPEN ROMS C64/.test(r.text) ? r.text : null)).catch(() => null));
  await pg.selectOption('#firmware', 'on');
  const fwOn = await until(() => pg.evaluate(() => document.getElementById('state').textContent === 'READY' && /FIRMWARE.*on · OpenROMs pressing 1 · PINNED · from ethereum/.test(document.getElementById('now').textContent)), 90000, 500);
  check(!!fwOn, 'FIRMWARE on: the machine rebuilt with OpenROMs pressing 1 from the chain, PINNED, and the state is READY');
  check(await pg.evaluate(() => /MACHINE.*PINNED · minimal64-2022 · from ethereum, through/.test(document.getElementById('now').textContent)), 'the emulator keeps its own source under the firmware (no "from undefined")');
  check(!!(await until(screenHasReady, 15000, 500)), 'the OpenROMs banner and READY on the screen, no reset needed');
  check(await pg.evaluate(() => window.machinePage.input === 'keyboard' && document.getElementById('input-mode').value === 'keyboard'), 'the keyboard is the input under the firmware');
  await pg.fill('#search', 'tony');
  await pg.click('#rows .row[data-work="tony"] button.load');
  const underFw = await until(() => pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /FIRMWARE.*on · OpenROMs pressing 1 · PINNED · from ethereum/.test(document.getElementById('now').textContent)), 30000, 500);
  check(!!underFw, 'LOAD under the firmware: the program runs, NOW PLAYING says firmware on, PINNED, from the chain');
  const fwProv = await pg.evaluate(() => { const p = window.machinePage.provenance(); return p && p.firmware && p.firmware.mode === 'on' && p.firmware.status === 'PINNED' && /ethereum/.test(p.firmware.source); });
  check(fwProv, 'the provenance says firmware on, PINNED, from ethereum');
  await pg.click('#reset');
  const readyAgain = await until(async () => (await screenHasReady()) && (await pg.evaluate(() => document.getElementById('state').textContent === 'READY')), 15000, 500);
  check(!!readyAgain, 'RESET under the firmware: READY again, the state READY');
  await pg.selectOption('#firmware', 'off');
  const fwOff = await until(() => pg.evaluate(() => document.getElementById('state').textContent === 'THE MACHINE IS ON' && window.machinePage.input === 'joystick' && !document.getElementById('veil').hidden), 90000, 500);
  check(!!fwOff, 'FIRMWARE off with nothing playing: the machine rebuilt bare, the veil says so, the stick the input again');
  await pg.fill('#search', 'tony');
  await pg.click('#rows .row[data-work="tony"] button.load');
  const running4 = await until(() => pg.evaluate(() => /FIRMWARE.*off · the program runs bare/.test(document.getElementById('now').textContent) && document.getElementById('state').dataset.phase === 'running' && document.getElementById('veil').hidden), 30000, 500);
  check(!!running4, 'a program runs bare again after the switch, the veil gone');
  await pg.click('#reset');
  const reset = await until(() => pg.evaluate(() => document.getElementById('state').textContent === 'RESET'), 5000);
  check(!!reset, 'RESET');
  check(pageErrors.length === 0, `no page errors (${pageErrors.length})${pageErrors.length ? ': ' + pageErrors.join(' | ').slice(0, 300) : ''}`);
  const ce = noiseFree(consoleErrors);
  check(ce.length === 0, `no console errors (${ce.length})${ce.length ? ': ' + ce.join(' | ').slice(0, 400) : ''}`);
  await pg.close();

  // an address opens on the program it names
  const pa = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pa.goto(`${A.base}/machine/?work=chamber&token=7`, { waitUntil: 'load' });
  const named = await until(() => pa.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /The Chamber · 7/.test(document.getElementById('now').textContent)), 90000, 500);
  const marked = await pa.evaluate(() => !!document.querySelector('#rows .row.now[data-token="7"]'));
  check(!!named && marked, 'an address opens on the program it names, token 7, running and marked');
  await pa.close();

  // widths
  for (const w of [390, 1000, 1440]) {   // a phone; one column wider than the frame (the badge once hung from the column's corner); two columns
    const pw = await b.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
    const errs = [];
    pw.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    pw.on('pageerror', (e) => errs.push(String(e)));
    await pw.goto(`${A.base}/machine/`, { waitUntil: 'load' });
    await until(() => pw.evaluate(() => document.querySelectorAll('#rows .row').length > 0), 10000);
    const frame = await pw.evaluate(() => { const f = document.getElementById('frame').getBoundingClientRect(); return { w: Math.round(f.width), h: Math.round(f.height), overflow: document.documentElement.scrollWidth > window.innerWidth, scrollY: window.scrollY }; });
    check(frame.w > 200 && !frame.overflow && noiseFree(errs).length === 0, `at ${w} wide: the frame ${frame.w}×${frame.h}, no horizontal overflow, no errors (${noiseFree(errs).length})`);
    check(frame.scrollY === 0, `at ${w} wide: the page stays at the top on load (scrollY ${frame.scrollY})`);
    const listShows = await pw.evaluate(() => { const row = document.querySelector('#rows .row[data-work="tony"]'); const l = document.getElementById('rows').getBoundingClientRect(); const r = row.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; });
    check(listShows, `at ${w} wide: the list shows the loaded row inside itself`);
    check(await pw.evaluate(() => document.getElementById('file').type === 'file' && document.getElementById('door').getBoundingClientRect().height > 30), `at ${w} wide: the file door is there`);
    check(await pw.evaluate(() => document.getElementById('firmware').value === 'auto' && document.getElementById('firmware').options.length === 3), `at ${w} wide: the firmware switch reads auto, three positions`);
    // the panels keep their shape: the list and the log are their full size before anything arrives, and NOW PLAYING
    // shows the same rows, dashes or facts, so nothing below it moves when a program lands or leaves
    const shape0 = await pw.evaluate(() => ({ rows: Math.round(document.getElementById('rows').getBoundingClientRect().height), log: Math.round(document.getElementById('log').getBoundingClientRect().height), now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent), badge: document.getElementById('link').getBoundingClientRect().width }));
    await until(() => pw.evaluate(() => document.getElementById('state').dataset.phase === 'running'), 90000, 500);
    const shapeRun = await pw.evaluate(() => ({ now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent), log: Math.round(document.getElementById('log').getBoundingClientRect().height) }));
    await pw.click('#reset');
    await until(() => pw.evaluate(() => document.getElementById('state').textContent === 'RESET'), 5000);
    const shapeIdle = await pw.evaluate(() => ({ now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent) }));
    check(shape0.rows >= 250 && shape0.log >= 150 && shape0.log === shapeRun.log, `at ${w} wide: the list (${shape0.rows}) and the log (${shape0.log}) are their full size before anything arrives`);
    check(shape0.labels.join() === 'PROGRAM,BYTES,CHECK,MACHINE,FIRMWARE,INPUT,MODE,NODE' && shapeIdle.labels.join() === shape0.labels.join() && shapeRun.labels.slice(-5).join() === 'MACHINE,FIRMWARE,INPUT,MODE,NODE', `at ${w} wide: NOW PLAYING keeps its rows (${shapeIdle.labels.length} idle, ${shapeRun.labels.length} running)`);
    check(Math.abs(shape0.now - shapeRun.now) <= 48 && Math.abs(shapeIdle.now - shapeRun.now) <= 48, `at ${w} wide: NOW PLAYING holds its height, first paint ${shape0.now}, running ${shapeRun.now}, idle ${shapeIdle.now}`);
    const badge = await pw.evaluate(() => { const l = document.getElementById('link').getBoundingClientRect(), f = document.getElementById('frame').getBoundingClientRect(); return { right: f.right - l.right, left: l.left - f.left, block: document.getElementById('link-block').innerText }; });
    check(w < 1140 ? (badge.right >= 0 && badge.right < 40 && /^#\d+/.test(badge.block)) : (badge.left >= 0 && badge.left < 40 && /^block /.test(badge.block)), `at ${w} wide: the badge hangs from the frame's own corner, ${w < 1140 ? 'at the right in its short form' : 'at the left in its long form'} (${badge.block}; ${Math.round(w < 1140 ? badge.right : badge.left)}px in from the frame's edge)`);
    const badgeNow = await pw.evaluate(() => document.getElementById('link').getBoundingClientRect().width);
    check(Math.abs(badgeNow - shape0.badge) <= 1, `at ${w} wide: the badge keeps one width from first paint to a held read, in its ${w < 1140 ? 'short' : 'long'} form (${Math.round(shape0.badge)} then ${Math.round(badgeNow)})`);
    await pw.screenshot({ path: join(EVIDENCE, `page-${w}.png`), fullPage: true });
    await pw.close();
  }

  // the ring and FIRE, on a coarse pointer: read by angle, the hole rest, one
  // direction by the Perception page's split or both by the switch, the
  // machine's own port ($DC00, active low, 127 idle) proving what it holds
  const tc = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pt = await tc.newPage();
  const terrs = [];
  pt.on('console', (m) => { if (m.type() === 'error') terrs.push(m.text()); });
  pt.on('pageerror', (e) => terrs.push(String(e)));
  await pt.goto(`${A.base}/machine/`, { waitUntil: 'load' });
  const tRunning = await until(() => pt.evaluate(() => document.getElementById('state').dataset.phase === 'running'), 90000, 500);
  const shown = await pt.evaluate(() => matchMedia('(pointer:coarse)').matches && getComputedStyle(document.getElementById('touch')).display === 'grid');
  check(!!tRunning && shown, 'on a coarse pointer the ring and FIRE show, the machine running');
  // the ring is brought fully into view before it is pressed: the strip above it pushed its lower half past a phone's viewport
  // the site scrolls smoothly, so the scroll is asked for instantly and the rect read after it has settled
  const ringRect = async () => { await pt.evaluate(() => document.getElementById('ring').scrollIntoView({ block: 'center', behavior: 'instant' })); await new Promise((r) => setTimeout(r, 150)); return pt.evaluate(() => { const r = document.getElementById('ring').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2, top: r.top }; }); };
  let c = await ringRect();
  const at = (deg, k = 0.8) => [c.x + k * c.R * Math.cos(deg * Math.PI / 180), c.y + k * c.R * Math.sin(deg * Math.PI / 180)];
  const settle = () => new Promise((r) => setTimeout(r, 120));
  const held = () => pt.evaluate(() => window.machinePage.pad.held);
  const port = () => pt.evaluate(() => window.machinePage.machine.request('peek', { addr: 0xdc00 }).then((r) => r.value));
  const lit = () => pt.evaluate(() => [...document.querySelectorAll('#ring .d.on')].map((g) => g.dataset.bits).join(',') + '/' + [...document.querySelectorAll('#ring .d.half')].map((g) => g.dataset.bits).join(','));
  await pt.mouse.move(...at(0)); await pt.mouse.down(); await settle();
  check(await held() === 8 && await port() === 127 - 8 && await lit() === '8/', `east: right held, the port reads it (${await port()}), the wedge lit (${await lit()})`);
  await pt.mouse.move(...at(40)); await settle();
  check(await held() === 8 && await port() === 127 - 8 && await lit() === '8/10', `40 degrees, one direction: still right, the diagonal wedge half (${await lit()})`);
  await pt.mouse.move(...at(80)); await settle();
  check(await held() === 2 && await port() === 127 - 2 && await lit() === '2/', `80 degrees: down, right released (${await port()})`);
  await pt.mouse.move(...at(200, 0.2)); await settle();
  check(await held() === 0 && await port() === 127, `the hole is rest (${await port()})`);
  await pt.mouse.move(...at(200, 1.3)); await settle();
  check(await held() === 4 && await port() === 127 - 4, `beyond the rim still counts: left (${await port()})`);
  await pt.mouse.up(); await settle();
  check(await held() === 0 && await port() === 127 && await lit() === '/', `lifted: nothing held, nothing lit (${await port()})`);
  await pt.selectOption('#ways', '8');
  c = await ringRect();   // the select scrolled the page; the ring is brought back and its place on screen read again
  await pt.mouse.move(...at(45)); await pt.mouse.down(); await settle();
  check(await held() === 10 && await port() === 127 - 10 && await lit() === '10/', `45 degrees, both directions: down and right together (${await port()}), the diagonal wedge lit`);
  await pt.evaluate(() => { const f = document.querySelector('#touch .fire'); const r = f.getBoundingClientRect(); f.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: false, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true })); });
  await settle();
  const fireDown = await pt.evaluate(() => document.querySelector('#touch .fire').classList.contains('down'));
  check(await held() === 10 && await port() === 127 - 26 && fireDown, `a second finger on FIRE while the ring is held: all three bits (${await port()}), FIRE lit`);
  await pt.screenshot({ path: join(EVIDENCE, 'ring-390.png'), clip: { x: 0, y: Math.max(0, c.top - 40), width: 390, height: 260 } });
  await pt.evaluate(() => document.querySelector('#touch .fire').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: false, bubbles: true })));
  await pt.mouse.up(); await settle();
  check(await held() === 0 && await port() === 127 && !(await pt.evaluate(() => document.querySelector('#touch .fire').classList.contains('down'))), `both lifted: the port idle (${await port()})`);
  check(noiseFree(terrs).length === 0, `no errors on the touch page (${noiseFree(terrs).length})`);
  await pt.close(); await tc.close();
  A.close();

  // B. a program altered outside its stamp is refused and never runs
  const B = await world(['--real-machine', '--fault', 'outside']);
  const pb = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pb.goto(`${B.base}/machine/`, { waitUntil: 'load' });
  await until(() => pb.evaluate(() => document.querySelectorAll('#rows .row').length > 0), 10000);
  await until(() => pb.evaluate(() => document.getElementById('state').dataset.phase === 'running'), 90000, 500);
  await pb.fill('#search', '5');
  await pb.click('#rows .row[data-work="chamber"][data-token="5"] button.load');
  const refused = await until(() => pb.evaluate(() => document.getElementById('state').dataset.phase === 'refused' && document.getElementById('state').textContent), 90000, 500);
  check(refused && /HASH_MISMATCH/.test(refused), `a tampered program: ${refused || 'not refused'}`);
  const playing = await pb.evaluate(() => window.machinePage.playing);
  check(playing === null, 'nothing is playing after the refusal');
  const nodesB = await pb.evaluate(() => window.machinePage.nodes);
  check(nodesB.setAside.length === 1 && nodesB.setAside[0].node === '/rpc' && /HASH_MISMATCH/.test(nodesB.setAside[0].why), `the endpoint that contradicted the pin is set aside for the visit (${JSON.stringify(nodesB.setAside)})`);
  await pb.fill('#search', 'tony');
  await pb.click('#rows .row[data-work="tony"] button.load');
  const noNode = await until(() => pb.evaluate(() => document.getElementById('state').textContent === 'NO NODE ANSWERED' && /set aside for this visit/.test(window.machinePage.report())), 30000, 500);
  check(!!noNode, 'nothing more is read through it: the next LOAD says NO NODE, with the reason in the log');
  await pb.close();
  B.close();

  // C. when the chain does not give the machine, the site's copies do, and the page says so
  const C = await world(['--real-machine', '--fault', 'part']);
  const pc = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pc.goto(`${C.base}/machine/`, { waitUntil: 'load' });
  await until(() => pc.evaluate(() => document.querySelectorAll('#rows .row').length > 0), 10000);
  await pc.fill('#search', '5');
  await pc.click('#rows .row[data-work="chamber"][data-token="5"] button.load');
  const noNodeC = await until(() => pc.evaluate(() => document.getElementById('state').textContent === 'NO NODE ANSWERED'), 90000, 500);
  const logC = await pc.evaluate(() => window.machinePage.report());
  const nodesC = await pc.evaluate(() => window.machinePage.nodes);
  const machineC = await pc.evaluate(() => !!(window.machinePage.machine && window.machinePage.machine.alive));
  check(!!noNodeC && machineC && /site's copies instead/.test(logC) && /set aside for this visit: HASH_MISMATCH/.test(logC) && nodesC.setAside.length === 1,
        `the only endpoint contradicted the machine's pin: the machine from the site's copies, the endpoint set aside, and programs not read through it (NO NODE)`);
  check(/every endpoint has been set aside/.test(logC), 'the log says why no node is left');
  await pc.close();
  C.close();

  // E. two endpoints, the first contradicting the machine's pin: set aside, the second serves everything
  const E = await world(['--real-machine', '--fault', 'part', '--endpoints', '/rpc,/rpc2'], { second: ['--real-machine'] });
  const pe = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pe.goto(`${E.base}/machine/`, { waitUntil: 'load' });
  const runningE = await until(() => pe.evaluate(() => document.getElementById('state').dataset.phase === 'running'), 90000, 500);
  const provE = JSON.parse(await pe.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  const nodesE = await pe.evaluate(() => window.machinePage.nodes);
  check(!!runningE && provE && provE.machine.source === 'ethereum, through /rpc2' && provE.machine.status === 'PINNED' && provE.node === '/rpc2' && provE.observation.node === '/rpc2',
        `quarantine: the machine and the program from the chain through the second endpoint (${provE ? provE.machine.source : 'no provenance'}; program via ${provE && provE.node})`);
  check(nodesE.setAside.length === 1 && nodesE.setAside[0].node === '/rpc' && /HASH_MISMATCH/.test(nodesE.setAside[0].why) && nodesE.demoted.length === 0,
        `the first endpoint is set aside for the visit, not merely demoted (${JSON.stringify(nodesE)})`);
  check(await pe.evaluate(() => /1 set aside this visit/.test(document.getElementById('now').textContent)), 'NOW PLAYING says one endpoint is set aside');
  const linkE = await pe.evaluate(() => ({ phase: document.getElementById('link').dataset.phase, node: document.getElementById('link-node').innerText, block: document.getElementById('link-block').innerText, title: document.getElementById('link').title, cells: [...document.querySelectorAll('#link-endpoints i')].map((i) => i.dataset.state) }));
  check(linkE.phase === 'held' && linkE.node === '/rpc2' && /^block [\d,]+ · [0-9a-f]{12}…$/.test(linkE.block) && /1 set aside this visit$/.test(linkE.title) && linkE.cells.join() === 'set-aside,held', `the badge shows the first cell set aside and the second holding, the words in its title (${linkE.cells.join()}; ${linkE.block}; ${linkE.title})`);
  const readsE = E.log.filter((r) => r.path === '/rpc' && r.method === 'eth_call');
  check(readsE.length === 0, `no contract call went to the set-aside endpoint after its contradiction (${readsE.length})`);
  await pe.close();
  E.close();

  // F. two endpoints, the first failing in transport on eth_call: demoted, the read restarted whole on the second, no verdict on the first
  const F = await world(['--real-machine', '--endpoints', '/rpc,/rpc2'], { second: ['--real-machine'], faults: { '/rpc': { eth_call: 500 } } });
  const pf = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pf.goto(`${F.base}/machine/`, { waitUntil: 'load' });
  await until(() => pf.evaluate(() => document.getElementById('state').dataset.phase === 'running'), 90000, 500);
  await pf.click('#rows .row[data-work="chamber"][data-token="5"] button.load');
  const runningF = await until(() => pf.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /The Chamber · 5/.test(document.getElementById('now').textContent)), 90000, 500);
  const provF = JSON.parse(await pf.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  const nodesF = await pf.evaluate(() => window.machinePage.nodes);
  check(!!runningF && provF && provF.machine.source === 'ethereum, through /rpc' && provF.node === '/rpc2' && provF.observation.node === '/rpc2',
        `failover: the machine came through the first endpoint, the program through the second (${provF && provF.machine.source}; program via ${provF && provF.node})`);
  check(nodesF.setAside.length === 0 && nodesF.demoted.includes('/rpc'), `the failing endpoint is demoted, not set aside (${JSON.stringify(nodesF)})`);
  const linkF = await pf.evaluate(() => ({ phase: document.getElementById('link').dataset.phase, node: document.getElementById('link-node').innerText, cells: [...document.querySelectorAll('#link-endpoints i')].map((i) => i.dataset.state) }));
  check(linkF.phase === 'held' && linkF.node === '/rpc2' && linkF.cells.join() === 'demoted,held', `THE CHAIN strip shows the first cell demoted and the second holding (${linkF.cells.join()})`);
  const obsF = F.log.filter((r) => r.path === '/rpc2' && ['eth_call', 'eth_getBlockByNumber'].includes(r.method));
  const prgCalls = obsF.filter((r) => r.method === 'eth_call');
  const blockTags = new Set(prgCalls.map((r) => r.params[1]));
  const prevHashRead = provF && obsF.find((r) => r.method === 'eth_getBlockByNumber' && parseInt(r.params[0], 16) === provF.observation.block - 1);
  check(prgCalls.length > 0 && blockTags.size === 1 && provF && parseInt([...blockTags][0], 16) === provF.observation.block && !!prevHashRead,
        `one endpoint, one block: the program at block ${provF && provF.observation.block} and the previous block's hash, both through /rpc2`);
  await pf.close();
  F.close();
} finally {
  await b.close();
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
