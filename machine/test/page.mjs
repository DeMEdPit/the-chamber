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
// page boots it from the site's copies and says so.
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
    const frame = await pw.evaluate(() => { const f = document.getElementById('frame').getBoundingClientRect(); return { w: Math.round(f.width), h: Math.round(f.height), overflow: document.documentElement.scrollWidth > window.innerWidth }; });
    check(frame.w > 200 && !frame.overflow && noiseFree(errs).length === 0, `at ${w} wide: the frame ${frame.w}×${frame.h}, no horizontal overflow, no errors (${noiseFree(errs).length})`);
    await pw.screenshot({ path: join(EVIDENCE, `page-${w}.png`), fullPage: true });
    await pw.close();
  }
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
