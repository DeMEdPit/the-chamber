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
// own port proving what they hold.
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
async function world(args) {
  const s = await synthetic(args);
  const port = nextPort++;
  const server = await start(port, { catalogue: s.catalogue, rpcUpstream: s.rpc });
  return { base: `http://127.0.0.1:${port}`, close() { server.close(); s.proc.stdin.end(); s.proc.kill(); } };
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
  for (const w of [390, 1440]) {
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
    // the panels keep their shape: the list and the log are their full size before anything arrives, and NOW PLAYING
    // shows the same rows, dashes or facts, so nothing below it moves when a program lands or leaves
    const shape0 = await pw.evaluate(() => ({ rows: Math.round(document.getElementById('rows').getBoundingClientRect().height), log: Math.round(document.getElementById('log').getBoundingClientRect().height), now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent) }));
    await until(() => pw.evaluate(() => document.getElementById('state').dataset.phase === 'running'), 90000, 500);
    const shapeRun = await pw.evaluate(() => ({ now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent), log: Math.round(document.getElementById('log').getBoundingClientRect().height) }));
    await pw.click('#reset');
    await until(() => pw.evaluate(() => document.getElementById('state').textContent === 'RESET'), 5000);
    const shapeIdle = await pw.evaluate(() => ({ now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent) }));
    check(shape0.rows >= 250 && shape0.log >= 150 && shape0.log === shapeRun.log, `at ${w} wide: the list (${shape0.rows}) and the log (${shape0.log}) are their full size before anything arrives`);
    check(shape0.labels.join() === 'PROGRAM,BYTES,CHECK,MACHINE,FIRMWARE,INPUT,MODE,NODE' && shapeIdle.labels.join() === shape0.labels.join() && shapeRun.labels.slice(-5).join() === 'MACHINE,FIRMWARE,INPUT,MODE,NODE', `at ${w} wide: NOW PLAYING keeps its rows (${shapeIdle.labels.length} idle, ${shapeRun.labels.length} running)`);
    check(Math.abs(shape0.now - shapeRun.now) <= 48 && Math.abs(shapeIdle.now - shapeRun.now) <= 48, `at ${w} wide: NOW PLAYING holds its height, first paint ${shape0.now}, running ${shapeRun.now}, idle ${shapeIdle.now}`);
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
  const c = await pt.evaluate(() => { const r = document.getElementById('ring').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2, top: r.top }; });
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
  await pb.close();
  B.close();

  // C. when the chain does not give the machine, the site's copies do, and the page says so
  const C = await world(['--real-machine', '--fault', 'part']);
  const pc = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pc.goto(`${C.base}/machine/`, { waitUntil: 'load' });
  await until(() => pc.evaluate(() => document.querySelectorAll('#rows .row').length > 0), 10000);
  await pc.fill('#search', '5');
  await pc.click('#rows .row[data-work="chamber"][data-token="5"] button.load');
  const runningC = await until(() => pc.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /The Chamber · 5/.test(document.getElementById('now').textContent)), 90000, 500);
  const provC = JSON.parse(await pc.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  const logC = await pc.evaluate(() => window.machinePage.report());
  check(!!runningC && provC && /copies/.test(provC.machine.source) && provC.machine.status === 'PINNED' && /site's copies instead/.test(logC), `the machine from the site's copies when the chain's part is wrong (${provC ? provC.machine.source : 'no provenance'})`);
  await pc.close();
  C.close();
} finally {
  await b.close();
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
