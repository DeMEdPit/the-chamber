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
// demoted and the read restarts there too, with no verdict on it; the five
// panels are bays whose headers carry one live line in the page's own words,
// open on a wide screen and closed on a phone, NOW PLAYING first there, the
// body one row that grows and shrinks (instant under reduced motion), a link
// into a closed bay opening it; the log folds a line said twice into one.
//
//   node machine/test/page.mjs
// Needs Playwright and Chromium (machine/test/pw.mjs finds them) and python3.

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from './pw.mjs';
import { start } from './serve.mjs';
import { makeD64 } from './make-d64.mjs';
import { makeCRT, PROBE, probe16K } from './make-crt.mjs';

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
  // the bays: every panel but the way out folds, its header the button and one live line, what is true now in the page's own words
  const lines = () => pg.evaluate(() => Object.fromEntries(Object.entries(window.machinePage.bays).map(([k, v]) => [k, v.line])));
  const lines0 = await lines();
  check(lines0.now === 'Tony: Born for Adventure (C64 demo) · PINNED · PURE' && lines0.chain === '67 programs · playing Tony: Born for Adventure (C64 demo)' && lines0.file === '.prg · .d64 · .crt' && lines0.keys === 'joystick 2 · AUTO · bare · sound on' && /^running Tony: Born for Adventure \(C64 demo\) · \d+ lines$/.test(lines0.log),
        `every bay's header line says what is true now: ${Object.values(lines0).join(' | ')}`);
  check(await pg.evaluate(() => Object.values(window.machinePage.bays).every((b) => b.open && b.element && !b.moving) && [...document.querySelectorAll('details.bay > summary')].every((s) => s.getAttribute('aria-expanded') === 'true') && document.querySelectorAll('details.bay').length === 5), 'on a wide screen the five bays start open, each header saying so');
  check(await pg.evaluate(() => [...document.querySelectorAll('details.bay > summary, details.fold > summary')].every((s) => { const b = document.getElementById(s.getAttribute('aria-controls') || ''); return b && b.parentElement === s.parentElement && b.classList.contains('bb'); })), 'every header names the body it opens (aria-controls), the bays and the folds alike');
  const fine = await pg.evaluate(() => ({ text: document.querySelector('.fine').textContent.trim(), href: (document.querySelector('.fine a') || {}).getAttribute && document.querySelector('.fine a').getAttribute('href'), target: !!document.getElementById('about-programs') }));
  check(/^It stays in this browser and is sent nowhere; .* NOW PLAYING says YOUR FILE, claiming nothing else: the formats and their limits\.$/.test(fine.text) && fine.href === '#about-programs' && fine.target, `the file door keeps one sentence and a link down to the account of the formats (${fine.text.length} characters)`);
  await pg.fill('#search', '5');
  const narrowed = await pg.evaluate(() => document.querySelectorAll('#rows .row').length);
  check(narrowed > 0 && narrowed < 67, `the search narrows the rows (${narrowed})`);
  check((await lines()).chain === `${narrowed} of 67 programs · playing Tony: Born for Adventure (C64 demo)`, `FROM THE CHAIN's line counts the narrowed rows (${(await lines()).chain})`);
  await pg.click('#rows .row[data-work="chamber"][data-token="5"] button.load');
  const running = await until(() => pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /The Chamber · 5/.test(document.getElementById('now').textContent)), 90000, 500);
  const stateText = await pg.evaluate(() => document.getElementById('state').textContent);
  check(!!running, `LOAD on Chamber token 5 reaches RUNNING (${stateText})`);
  const now = await pg.evaluate(() => document.getElementById('now').textContent);
  check(/PINNED/.test(now) && /CONTRACT-CONSISTENT/.test(now) && /block 4,999/.test(now) && /PURE/.test(now), 'NOW PLAYING: the program PINNED, the stamp CONTRACT-CONSISTENT at the block, the mode PURE');
  const lines5 = await lines();
  check(/^The Chamber · 5\b.* · CONTRACT-CONSISTENT · PURE$/.test(lines5.now) && /^\d+ of 67 programs · playing The Chamber · 5\b/.test(lines5.chain), `the lines carry the weakest word of the bytes' checks, never more: ${lines5.now} | ${lines5.chain}`);
  // NOW PLAYING in two groups, and its links: every one opens in a new tab and goes to the contract, the token, the block or the emulator's parts on the explorer
  const groups = await pg.evaluate(() => [...document.querySelectorAll('#now .grp')].map((g) => g.textContent).join('|'));
  check(groups === 'THE PROGRAM|THE MACHINE', `NOW PLAYING is two groups, the program and the machine (${groups})`);
  const links = await pg.evaluate(() => { const cat = window.machinePage.catalogue; const chamber = cat.works.find((w) => w.key === 'chamber').address; const p = window.machinePage.provenance();
    const rows = Object.fromEntries([...document.querySelectorAll('#now .nl')].map((r) => [r.querySelector('.k').textContent, [...r.querySelectorAll('a')].map((a) => ({ t: a.textContent, h: a.getAttribute('href'), ok: a.target === '_blank' && /\bnoopener\b/.test(a.rel) && /\bnoreferrer\b/.test(a.rel) }))]));
    return { rows, chamber, block: p.observation.block, parts: cat.machine.parts.map((x) => x.address), root: cat.machine.firmware.root }; });
  const every = Object.values(links.rows).flat();
  check(every.length === 7 && every.every((a) => a.ok), `every link in NOW PLAYING opens in a new tab with noopener noreferrer (${every.length} links)`);
  check(links.rows.PROGRAM.map((a) => a.h).join() === `https://etherscan.io/address/${links.chamber},https://etherscan.io/nft/${links.chamber}/5` && links.rows.PROGRAM.map((a) => a.t).join() === 'contract,token 5', `the program's contract and token 5 link to the explorer (${links.rows.PROGRAM.map((a) => a.t).join(', ')})`);
  check(links.rows.NODE.length === 1 && links.rows.NODE[0].h === `https://etherscan.io/block/${links.block}` && links.rows.NODE[0].t === `block ${links.block.toLocaleString('en-US')}`, `the block the read was made at links to the explorer (${links.rows.NODE.map((a) => a.t).join()})`);
  check(links.rows.EMULATOR.map((a) => a.h).join() === links.parts.map((a) => `https://etherscan.io/address/${a}`).join(), `the emulator's four contracts link to the explorer, in the catalogue's order (${links.rows.EMULATOR.map((a) => a.t).join(', ')})`);
  check(!links.rows.FIRMWARE.length && !links.rows.BYTES.length && !links.rows.STAMP.length && !links.rows.INPUT.length && !links.rows.MODE.length, 'no link on a hash, the firmware when off, the input or the mode');
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
  check(/MIND/.test(now2) && /CONTRACT-CONSISTENT/.test(now2) && /NODE-REPORTED/.test(now2) && /revision 2, the head \(NODE-REPORTED\)/.test(now2) && /2 lessons · saved at block 12,347 by 0x1111…1111/.test(now2), 'NOW PLAYING for a mind: MIND CONTRACT-CONSISTENT, the head NODE-REPORTED, its lessons, block and saver');
  // the revision picker: REVISIONS on the mind's row lists every mind it has held, genesis first in the record and last in
  // the list; any one loads, held to its record's hash, genesis to its pin as well; the address names a revision
  await pg.click('#rows .row[data-work="perception-canary"] button.more');
  const revList = await until(() => pg.evaluate(() => { const subs = [...document.querySelectorAll('#rows .row.sub')]; return subs.length === 3 ? subs.map((r) => r.dataset.revision + '|' + r.querySelector('.title').textContent + '|' + r.querySelector('.sub').textContent) : null; }), 20000, 200);
  check(!!revList && /^2\|revision 2 · the head\|2 lessons taught in all · saved at block 12,347 by 0x1111…1111 · hash [0-9a-f]{12}…$/.test(revList[0]) && /^1\|revision 1\|1 lesson taught in all · saved at block 12,346 by 0x1111…1111 · hash [0-9a-f]{12}…$/.test(revList[1]) && /^0\|revision 0 · genesis\|the blank slot the program ships · hash [0-9a-f]{12}…$/.test(revList[2]), `REVISIONS lists the mind's three revisions under its row, the head first and genesis last (${revList ? revList.map((l) => l.split('|')[1]).join('; ') : 'not listed'})`);
  const rowMarked = (sel) => pg.evaluate((q) => { const e = document.querySelector(q); return e ? e.classList.contains('now') : null; }, sel);
  check((await rowMarked('#rows .row.sub[data-revision="2"]')) === true && (await rowMarked('#rows .row.sub[data-revision="1"]')) === false, 'the head\'s row is marked while the head plays');
  await pg.click('#rows .row.sub[data-revision="1"] button.load');
  const rev1 = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /revision 1 of 2/.test(document.getElementById('now').textContent) ? document.getElementById('now').textContent : null)), 30000, 500);
  check(!!rev1 && /MIND\s*CONTRACT-CONSISTENT · revision 1 of 2 \(the head NODE-REPORTED\) · hash [0-9a-f]{12}… equals the record's · 1 lesson · saved at block 12,346 by 0x1111…1111/.test(rev1) && /PROGRAM\s*Perception Chamber Canary · 1 · revision 1 of 2/.test(rev1), 'revision 1 loads: its mind read from its blob, CONTRACT-CONSISTENT with its record, said with its lessons, block and saver');
  const provRev = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provRev && provRev.mind.revision === 1 && provRev.mind.head === 2 && provRev.mind.status === 'CONTRACT-CONSISTENT' && provRev.mind.record.savedAtBlock === 12346 && provRev.mind.record.educationCount === 1 && /^0x[0-9a-fA-F]{40}$/.test(provRev.mind.brainBlob) && provRev.program.status === 'PINNED' && provRev.reads.some((r) => /the code of 0x/.test(r)), 'the provenance names the revision, the head, the record and the blob read');
  check((await rowMarked('#rows .row.sub[data-revision="1"]')) === true && (await rowMarked('#rows .row.sub[data-revision="2"]')) === false && (await rowMarked('#rows .row[data-work="perception-canary"]:not(.sub)')) === true, 'the revision\'s row and the mind\'s row are marked, the head\'s no longer');
  await pg.click('#rows .row.sub[data-revision="0"] button.load');
  const rev0 = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /revision 0 of 2/.test(document.getElementById('now').textContent) ? document.getElementById('now').textContent : null)), 30000, 500);
  check(!!rev0 && /MIND\s*PINNED · revision 0 of 2 \(the head NODE-REPORTED\) · hash [0-9a-f]{12}… equals the record's and the pin · the blank slot the program ships/.test(rev0), 'genesis loads: the blank slot, PINNED against the catalogue as well as its record');
  await pg.click('#rows .row[data-work="perception-canary"] button.more');
  check(await pg.evaluate(() => document.querySelectorAll('#rows .row.sub').length === 0), 'a second press on REVISIONS folds the list');
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
  const linesF = await lines();
  check(linesF.now === 'hello.prg · YOUR FILE · PURE' && linesF.file === 'hello.prg · YOUR FILE' && /^\d+ of 67 programs$/.test(linesF.chain), `a file's lines: YOUR FILE, and the chain's line names no program (${linesF.now} | ${linesF.file} | ${linesF.chain})`);
  const wroteB = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 2)), 10000);
  check(!!wroteB, 'the file ran on the machine (screen code 2 at $0400)');
  const provFile = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provFile && provFile.program.status === 'YOUR FILE' && !('pins' in provFile.program) && provFile.node === null && provFile.observation === null && provFile.file && provFile.file.name === 'hello.prg' && provFile.file.size === 20 && provFile.program.load === 0x0801 && /^[0-9a-f]{64}$/.test(provFile.program.sha256) && provFile.machine.status === 'PINNED',
        `the provenance of a file claims nothing of the chain: YOUR FILE, no pins, no node, no observation; the machine still ${provFile && provFile.machine.status}`);
  check(requests.length === requestsBefore, `the file made no request of any kind (${requests.length - requestsBefore})`);
  check(await pg.evaluate(() => { const rows = [...document.querySelectorAll('#now .nl')]; const i = rows.findIndex((r) => r.querySelector('.k').textContent === 'EMULATOR'); return i > 0 && rows.slice(0, i).every((r) => !r.querySelector('a')); }), 'a file of yours gets no link: nothing is claimed of it');
  check(await pg.evaluate(() => !document.querySelector('#rows .row.now') && document.getElementById('door').dataset.state === 'ok' && /^hello\.prg · 20 bytes · running/.test(document.getElementById('door-text').textContent)), 'no row of the chain is marked while a file plays; the door says what it ran');
  const refusals = [
    ['two.prg', Buffer.from([0x01, 0x08]), 'PRG_TOO_SHORT', /two-byte load address/],
    ['big.prg', Buffer.alloc(65539, 1), 'FILE_TOO_LARGE', /65,539 bytes/],
    ['high.prg', Buffer.concat([Buffer.from([0x00, 0xff]), Buffer.alloc(512, 1)]), 'PRG_ADDRESS_OVERFLOW', /\$ff00/],
    ['notes.txt', Buffer.from('hello, machine\n'), 'KIND_UNSUPPORTED', /not a \.prg file \(15 bytes, beginning 68 65 6c 6c 6f 2c 20 6d\)/],
    ['disk.d64', Buffer.alloc(174848), 'D64_EMPTY', /no program in its directory \(0 entries, none PRG\)/],
    ['cart.crt', Buffer.concat([Buffer.from('C64 CARTRIDGE   '), Buffer.alloc(48)]), 'CRT_BAD_FILE', /too short to be a cartridge image/],
  ];
  for (const [name, buffer, code, words] of refusals) {
    await pg.setInputFiles('#file', { name, mimeType: 'application/octet-stream', buffer });
    const said = await until(() => pg.evaluate((n) => { const d = document.getElementById('door'); return d.dataset.state === 'refused' && d.textContent.includes(n) ? d.textContent : null; }, name), 10000, 100);
    check(!!said && said.includes(code) && words.test(said), `${name} is refused ${code} in words: ${said ? said.trim().slice(0, 120) : 'nothing said'}`);
  }
  check(await pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent)), 'a refused file leaves the running program alone');
  check((await lines()).file === 'cart.crt · REFUSED' && (await lines()).now === 'hello.prg · YOUR FILE · PURE', `the door's line says what was refused while NOW PLAYING's keeps what runs (${(await lines()).file})`);
  check(requests.length === requestsBefore, `the refusals made no request either (${requests.length - requestsBefore})`);
  // the disk door: a .d64 is opened and its directory listed, nothing run; a program picked from it runs, said as YOUR FILE
  // with the drive's absence said; the provenance names the disk and the entry; a paste runs the same way, hex or base64,
  // what is neither refused in words, the running program left alone
  const writes = (n) => Buffer.from([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0xa9, n, 0x8d, 0x00, 0x04, 0x60]);   // 10 SYS2061 : LDA #n ; STA $0400 ; RTS
  const multi = Buffer.from([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0x20, 0xba, 0xff, 0x20, 0xbd, 0xff, 0x20, 0xd5, 0xff, 0x60]);   // 10 SYS2061 : JSR SETLFS ; JSR SETNAM ; JSR LOAD ; RTS: a loader
  const image = makeD64({ name: 'CHAMBER TEST', id: 'C6', files: [{ name: 'FOUR', type: 'PRG', bytes: writes(4) }, { name: 'NOTES', type: 'SEQ', bytes: Buffer.from('HI') }, { name: 'LONG', type: 'PRG', bytes: Buffer.concat([Buffer.from([0x00, 0x20]), Buffer.alloc(600, 0xea)]) }, { name: 'MULTI', type: 'PRG', bytes: multi }] });
  const requestsBeforeDisk = requests.length;
  await pg.setInputFiles('#file', { name: 'games.d64', mimeType: 'application/octet-stream', buffer: Buffer.from(image) });
  const listed = await until(() => pg.evaluate(() => (document.getElementById('door').dataset.state === 'ok' && !document.getElementById('disk').hidden ? { door: document.getElementById('door-text').textContent, name: document.getElementById('disk-name').textContent, count: document.getElementById('disk-count').textContent, rows: [...document.querySelectorAll('#disk-rows .row')].map((r) => r.querySelector('.title').textContent + '|' + r.querySelector('.sub').textContent + '|' + !!r.querySelector('button')) } : null)), 10000, 100);
  check(!!listed && listed.door === 'games.d64 · CHAMBER TEST · 3 programs · pick one below' && listed.name === 'CHAMBER TEST · C6 2A' && listed.count === 'games.d64 · 35 tracks' && listed.rows.join(';') === 'FOUR|PRG · 1 block|true;NOTES|SEQ · 1 block · not a program|false;LONG|PRG · 3 blocks|true;MULTI|PRG · 1 block · loads more from the disk: stops at the drive here|true', `a .d64 is opened and its directory listed, LOAD on each program, a loader said to be one (${listed ? listed.rows.join('; ') : 'not listed'})`);
  check(await pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent)), 'opening a disk runs nothing: the program playing plays on');
  check((await lines()).file === 'games.d64 · 3 programs · pick one', `the door's line names the open disk and its programs (${(await lines()).file})`);
  await pg.click('#disk-rows .row[data-index="0"] button.load');
  const diskRan = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /FOUR from games\.d64/.test(document.getElementById('now').textContent) ? document.getElementById('now').textContent : null)), 30000, 500);
  check(!!diskRan && /YOUR FILE/.test(diskRan) && /the machine has no drive: a program that loads more from the disk stops there/.test(diskRan), 'a program picked from the disk runs, said as YOUR FILE, the drive\'s absence said in NOW PLAYING');
  check((await lines()).file === 'FOUR from games.d64 · YOUR FILE', `the door's line names the disk's program running (${(await lines()).file})`);
  check(!!(await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 4)), 10000)), 'the disk\'s program ran on the machine (screen code 4 at $0400)');
  const provDisk = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provDisk && provDisk.source === 'disk' && provDisk.file.name === 'games.d64' && provDisk.file.size === 174848 && provDisk.file.disk.name === 'CHAMBER TEST' && provDisk.file.disk.id === 'C6' && provDisk.file.disk.entry.name === 'FOUR' && provDisk.file.disk.entry.type === 'PRG' && provDisk.file.disk.entry.blocks === 1 && provDisk.program.status === 'YOUR FILE' && provDisk.program.bytes === 20 && provDisk.node === null && provDisk.pasted === null,
        'the provenance names the disk, its entry and no chain');
  check(await pg.evaluate(() => document.querySelector('#disk-rows .row.now') && document.querySelector('#disk-rows .row.now').dataset.index === '0' && !document.getElementById('disk').hidden && /^FOUR from games\.d64 · 20 bytes · running · no chain claim$/.test(document.getElementById('door-text').textContent)), 'the disk\'s row is marked, the directory stays, the door says what it ran');
  check(requests.length === requestsBeforeDisk, `the disk made no request of any kind (${requests.length - requestsBeforeDisk})`);
  await pg.click('#disk-rows .row[data-index="3"] button.load');
  const multiRan = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /MULTI from games\.d64/.test(document.getElementById('now').textContent) ? document.getElementById('now').textContent : null)), 90000, 500);
  check(!!multiRan && /this program loads more from a disk: it stops where it asks the drive/.test(multiRan) && /FIRMWARE.*on · OpenROMs pressing 1/.test(multiRan) && /loads more from a disk: stops at the drive$/.test(await pg.evaluate(() => document.getElementById('door-text').textContent)), 'a loader from the disk runs under the firmware and NOW PLAYING and the door say it stops where it asks the drive');
  // the paste
  const hex = Array.from(writes(5), (b) => b.toString(16).padStart(2, '0')).join(' ');
  await pg.click('#paste-door summary');
  await pg.fill('#paste', '0x' + hex);
  await pg.click('#run-paste');
  const pasted = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /PROGRAM\s*pasted hex/.test(document.getElementById('now').textContent) ? document.getElementById('paste-note').textContent : null)), 30000, 500);
  check(!!pasted && /^pasted hex · 20 bytes · running · no chain claim$/.test(pasted), `pasted hex runs, said at the paste (${pasted})`);
  check(await pg.evaluate(() => document.getElementById('door-text').textContent === 'games.d64 · CHAMBER TEST · 3 programs · pick one below' && !document.querySelector('#disk-rows .row.now')), 'the door rests at the disk\'s summary while the paste runs: only one thing says running');
  check(!!(await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 5)), 10000)), 'the paste ran on the machine (screen code 5 at $0400)');
  const provPaste = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provPaste && provPaste.source === 'paste' && provPaste.file === null && provPaste.pasted.format === 'hex' && provPaste.pasted.chars === 40 && provPaste.program.status === 'YOUR FILE' && provPaste.node === null, 'the provenance of a paste: no file, the format and the count, no chain');
  await pg.fill('#paste', Buffer.from(writes(6)).toString('base64'));
  await pg.click('#run-paste');
  const pasted64 = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /PROGRAM\s*pasted base64/.test(document.getElementById('now').textContent) ? true : null)), 30000, 500);
  check(!!pasted64 && !!(await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 6)), 10000)), 'pasted base64 runs too (screen code 6 at $0400)');
  await pg.fill('#paste', 'hello, machine!');   // 'zz zz' would be base64: four letters of its alphabet decode to three bytes, and the page would run them
  await pg.click('#run-paste');
  const badPaste = await until(() => pg.evaluate(() => (/^PASTE_/.test(document.getElementById('paste-note').textContent) ? document.getElementById('paste-note').textContent : null)), 10000, 100);
  check(!!badPaste && /^PASTE_NOT_HEX_OR_BASE64 · 14 characters that are neither hex nor base64$/.test(badPaste) && (await pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /pasted base64/.test(document.getElementById('now').textContent))), `a paste that is neither hex nor base64 is refused in words and the running program plays on (${badPaste})`);
  await pg.fill('#paste', 'abc');
  await pg.click('#run-paste');
  const oddPaste = await until(() => pg.evaluate(() => (/^PASTE_ODD_HEX/.test(document.getElementById('paste-note').textContent) ? document.getElementById('paste-note').textContent : null)), 10000, 100);
  check(!!oddPaste && /3 hex digits: an odd count/.test(oddPaste), `an odd count of hex digits is refused in words (${oddPaste})`);
  await pg.setInputFiles('#file', { name: 'hello.prg', mimeType: 'application/octet-stream', buffer: PRG_B });
  await until(() => pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent)), 30000, 500);
  check(await pg.evaluate(() => document.getElementById('disk').hidden), 'a .prg dropped after a disk closes the directory');
  // the cartridge door: a .crt is read as the machine reads it, given a machine of its own, run and said as YOUR FILE with
  // its type; RESET boots it again; anything after it starts a new machine; what the machine would trap on is refused at
  // the door in words, the running program left alone
  await pg.evaluate(() => { window.machinePage.machine.gateMark = 'before the cartridge'; });
  await pg.setInputFiles('#file', { name: 'probe.crt', mimeType: 'application/octet-stream', buffer: Buffer.from(probe16K()) });
  const cartRan = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /probe\.crt/.test(document.getElementById('now').textContent) ? document.getElementById('now').textContent : null)), 90000, 500);
  check(!!cartRan && /YOUR FILE/.test(cartRan) && /CARTRIDGE\s*Normal · 1 CHIP packet · 16,384 bytes of ROM · EXROM 0 · GAME 0 · "PROBE 16K"/.test(cartRan) && /it stays in the port/.test(cartRan) && /FIRMWARE\s*off · AUTO: no call into the KERNAL's table/.test(cartRan), 'a cartridge runs, said as YOUR FILE with its type, bare under AUTO, its stay in the port said');
  const crtWrote = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 3)), 15000);
  check(!!crtWrote && (await pg.evaluate(() => window.machinePage.cartridgeIn === true && window.machinePage.machine.gateMark === undefined)), 'the cartridge booted on a machine of its own (C at $0400)');
  const provCart = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provCart && provCart.source === 'cartridge' && provCart.cartridge.typeName === 'Normal' && provCart.cartridge.chips.length === 1 && provCart.cartridge.chips[0].size === 16384 && provCart.program.status === 'YOUR FILE' && provCart.program.load === null && provCart.node === null, 'the provenance names the cartridge and no chain');
  await pg.click('#reset');
  const cartAgain = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /probe\.crt/.test(document.getElementById('now').textContent) && /the cartridge in its port starts again/.test(window.machinePage.report()) ? true : null)), 10000, 200);
  check(!!cartAgain, 'RESET with a cartridge in the port: it starts again and stays NOW PLAYING');
  await pg.setInputFiles('#file', { name: 'hello.prg', mimeType: 'application/octet-stream', buffer: PRG_B });
  const afterCart = await until(() => pg.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent) && /a cartridge stays in the port for the life of a machine/.test(window.machinePage.report()) ? true : null)), 90000, 500);
  check(!!afterCart && !!(await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 2)), 15000)) && (await pg.evaluate(() => window.machinePage.cartridgeIn === false)), 'a .prg after the cartridge gets a new machine and runs (screen code 2 at $0400)');
  for (const [name, buffer, code, words] of [
    ['eight.crt', Buffer.from(makeCRT({ type: 0, chips: [{ bank: 0, load: 0x8000, size: 0x2000, data: PROBE }] })), 'CRT_8K_NORMAL', /8K Normal cartridge/],
    ['easy.crt', Buffer.from(makeCRT({ type: 32, chips: [{ bank: 0, load: 0x8000, size: 0x2000 }] })), 'CRT_TYPE_UNSUPPORTED', /EasyFlash/],
  ]) {
    await pg.setInputFiles('#file', { name, mimeType: 'application/octet-stream', buffer });
    const said = await until(() => pg.evaluate((n) => { const d = document.getElementById('door'); return d.dataset.state === 'refused' && d.textContent.includes(n) ? d.textContent : null; }, code), 10000, 100);
    check(!!said && words.test(said) && said.includes(name) && (await pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent))), `${name} is refused ${code} at the door, the running program left alone: ${said ? said.trim().slice(0, 110) : 'nothing said'}`);
  }
  // AUTO: the switch reads a file for what it needs. A file that calls the KERNAL gets the firmware, the machine rebuilt with
  // the pressing from the chain; a BASIC program is RUN under it; a file that needs nothing runs bare again; a program of
  // the chain runs bare, as on chain
  const nowText = () => pg.evaluate(() => document.getElementById('now').textContent);
  const whyText = () => pg.evaluate(() => document.getElementById('firmware-why').textContent);
  /** NOW PLAYING's text once the page says RUNNING and the panel names the program; null until then. */
  const playingNamed = (name) => pg.evaluate((n) => (document.getElementById('state').dataset.phase === 'running' && new RegExp(n).test(document.getElementById('now').textContent) ? document.getElementById('now').textContent : null), name);
  check(await pg.evaluate(() => document.getElementById('firmware').value === 'auto') && /^AUTO · bare · no call into a ROM$/.test(await whyText()), `the switch reads auto and its line says why the machine is bare for the file playing (${await whyText()})`);
  check(await pg.evaluate(() => /silent if the phone is/.test(document.getElementById('sound').parentElement.textContent) && /click the machine to give it your keys/.test(document.querySelector('.keys').textContent)), 'THE KEYS carries the sound and keyboard facts the sentence used to');
  const hintWords = await pg.evaluate(() => ({ hints: [...document.querySelectorAll('.keys .hint')].map((h) => h.innerText.trim()), fine: getComputedStyle(document.querySelector('.keys .fine-only')).display, account: document.getElementById('about-controls').nextElementSibling.nextElementSibling.textContent }));
  check(hintWords.hints.join('|') === "what the arrows feed; AUTO chooses from the file|other keys type; the series' programs read port 2|one direction suits the series; both for eight ways|Escape is RUN/STOP · Home is CLR/HOME · F1 to F7|starts on your first click or key|the machine starts over; READY under the firmware" && hintWords.fine === 'inline' && /Escape is RUN\/STOP and never leaves this page/.test(hintWords.account) && /takes both ports when it cannot tell/.test(hintWords.account),
        `the hints are one short line each and the edge cases live in the account below (${hintWords.hints.length} hints)`);
  const keys = await pg.evaluate(() => ({ groups: [...document.querySelectorAll('.keys .grp')].map((g) => g.textContent).join('|'), open: document.getElementById('how-auto').open, summary: document.querySelector('#how-auto summary').textContent, target: document.querySelector('#how-auto a').getAttribute('href'), targetExists: !!document.getElementById('about-controls'),
    diag: getComputedStyle(document.querySelector('dt.touch-only')).display, silent: getComputedStyle(document.querySelector('span.touch-only')).display, hints: [...document.querySelectorAll('.keys dd')].map((d) => d.querySelectorAll('.hint').length <= 1).every(Boolean),
    lede: document.querySelector('.lede').textContent, subheads: [...document.querySelectorAll('.about h3')].map((h) => h.id).join() }));
  check(keys.groups === 'PLAY|MACHINE', `THE KEYS is grouped: ${keys.groups.replace(/\|/g, ', ')}`);
  check(!keys.open && keys.summary === 'HOW AUTO DECIDES' && keys.target === '#about-controls' && keys.targetExists, 'the firmware\'s decision stays visible and the reasoning sits behind HOW AUTO DECIDES, closed, linking to the account below');
  check(keys.diag === 'none' && keys.silent === 'none' && keys.hints, 'on a fine pointer DIAGONALS and the phone note are not shown; every control has at most one line under it');
  check(/^\s*The Machine is the Commodore 64 emulator nopsta stored on Ethereum in 2022\. Rather than serving the machine and its programs from a server of its own, this page reads them from Ethereum, checks their cryptographic fingerprints against the ones it carries, and runs them in your browser\.\s*$/.test(keys.lede), 'the lede is the owner\'s paragraph, word for word');
  check(keys.subheads === 'about-machine,about-programs,about-words,about-controls', `the prose is under four subheads (${keys.subheads})`);
  await pg.selectOption('#input-mode', 'joystick1');
  const portOne = await until(() => pg.evaluate(() => (window.machinePage.input === 'joystick1' && /INPUT\s*joystick in port 1 · by the switch/.test(document.getElementById('now').textContent) ? true : null)), 5000, 100);
  check(!!portOne && (await pg.evaluate(() => document.getElementById('input-mode').options.length === 4 && [...document.getElementById('input-mode').options].map((o) => o.value).join() === 'joystick,joystick1,joysticks,keyboard')), 'INPUT offers port 2, port 1, both ports and the keyboard, and NOW PLAYING says which port the stick feeds');
  check(/^joystick 1 · AUTO · bare · sound on$/.test((await lines()).keys), `THE KEYS' line follows the switch (${(await lines()).keys})`);
  await pg.click('#sound');
  check(/· sound off$/.test((await lines()).keys) && (await pg.evaluate(() => document.getElementById('sound').textContent === 'SOUND OFF')), `and the sound (${(await lines()).keys})`);
  await pg.click('#sound');
  await pg.selectOption('#input-mode', 'joystick');
  await until(() => pg.evaluate(() => window.machinePage.input === 'joystick'), 5000, 100);
  const stub = (...code) => Buffer.from([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, ...code]);
  await pg.setInputFiles('#file', { name: 'kernal.prg', mimeType: 'application/octet-stream', buffer: stub(0xa9, 0x93, 0x20, 0xd2, 0xff, 0xa9, 0x43, 0x20, 0xd2, 0xff, 0x60) });   // LDA #147 ; JSR CHROUT ; LDA #'C' ; JSR CHROUT ; RTS
  const autoOn = await until(async () => { const t = await playingNamed('kernal\\.prg'); return t && /FIRMWARE.*on · OpenROMs pressing 1 \(contract · repository\) · PINNED · from ethereum.*AUTO: calls the KERNAL 2 times \(CHROUT\)/.test(t) ? t : null; }, 90000, 500);
  check(!!autoOn, 'AUTO: a file that calls the KERNAL gets the firmware, the machine rebuilt with the pressing from the chain, the reason in NOW PLAYING');
  const wroteC = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 3)), 15000);
  check(!!wroteC, 'the file ran under the firmware: CHROUT cleared the screen and wrote C at $0400');
  check(/SCAN.*loads at \$0801 to \$0817 · SYS 2061 in its stub · calls the KERNAL 2 times \(CHROUT\) · reads neither port 2 nor the matrix · no write to the SID/.test(await nowText()), 'NOW PLAYING carries the scan');
  check(await pg.evaluate(() => window.machinePage.input === 'joysticks' && document.getElementById('input-mode').value === 'joysticks') && /INPUT.*joystick in both ports · nothing reads a port or the matrix that the scan can see; one stick in each port/.test(await nowText()) && /^AUTO · on · calls the KERNAL 2 times \(CHROUT\)$/.test(await whyText()), `a program that runs by itself under the firmware gets a stick in each port, said why; the line under the switch (${await whyText()})`);
  const provAuto = JSON.parse(await pg.evaluate(() => document.getElementById('provenance-json').value) || 'null');
  check(provAuto && provAuto.firmware.mode === 'on' && provAuto.firmware.switch === 'auto' && provAuto.firmware.status === 'PINNED' && /CHROUT/.test(provAuto.firmware.why) && provAuto.scan.kernal.calls === 2 && provAuto.scan.kernal.names.join() === 'CHROUT' && provAuto.needs.firmware === true && provAuto.known === null && provAuto.inputWhy === 'nothing reads a port or the matrix that the scan can see; one stick in each port',
        'the provenance carries the switch, the decision and its reason, the scan and the needs');
  const screenHasLine = (want) => pg.evaluate((w) => window.machinePage.machine.request('screen').then((r) => (r.text.split('\n').some((l) => l.trim() === w) ? r.text : null)).catch(() => null), want);
  await pg.setInputFiles('#file', { name: 'hi.prg', mimeType: 'application/octet-stream', buffer: Buffer.from([0x01, 0x08, 0x0c, 0x08, 0x0a, 0x00, 0x99, 0x20, 0x22, 0x48, 0x49, 0x22, 0x00, 0x00, 0x00]) });   // 10 PRINT "HI"
  const basicRan = await until(async () => { const t = await playingNamed('hi\\.prg'); return t && /AUTO: a BASIC program of 1 line/.test(t) ? t : null; }, 90000, 500);
  check(!!basicRan, 'a BASIC program: AUTO keeps the firmware, the reason names the program');
  check(!!(await until(() => screenHasLine('HI'), 20000, 500)), 'the firmware RUN it: HI on the screen');
  await pg.setInputFiles('#file', { name: 'hello.prg', mimeType: 'application/octet-stream', buffer: PRG_B });
  const bareAgain = await until(async () => { const t = await playingNamed('hello\\.prg'); return t && /FIRMWARE.*off · AUTO: no call into a ROM/.test(t) ? t : null; }, 90000, 500);
  check(!!bareAgain, 'a file that needs nothing: AUTO rebuilds the machine bare and runs it');
  const wroteB2 = await until(() => pg.evaluate(() => window.machinePage.machine.request('peek', { addr: 1024 }).then((r) => r.value === 2)), 15000);
  check(!!wroteB2, 'it ran on the bare machine (screen code 2 at $0400, fresh memory)');
  check(await pg.evaluate(() => window.machinePage.input === 'joysticks') && /INPUT.*joystick in both ports · nothing reads a port or the matrix that the scan can see; one stick in each port/.test(await nowText()), 'a file that reads nothing the scan can see gets a stick in each port, said why');
  await pg.fill('#search', 'tony');
  await pg.click('#rows .row[data-work="tony"] button.load');
  const chainBare = await until(async () => { const t = await playingNamed('Tony: Born for Adventure'); return t && /FIRMWARE.*off · AUTO: a program of the chain runs bare, as it does on chain/.test(t) ? t : null; }, 90000, 500);
  check(!!chainBare, 'a program of the chain after a file: bare, as on chain, the reason said');
  // the firmware switch: on shows the firmware at READY, LOAD runs a program under it, RESET brings READY back, off is bare again
  const screenHasReady = () => pg.evaluate(() => window.machinePage.machine.request('screen').then((r) => (/READY\./.test(r.text) && /OPEN ROMS C64/.test(r.text) ? r.text : null)).catch(() => null));
  await pg.selectOption('#firmware', 'on');
  const fwOn = await until(() => pg.evaluate(() => document.getElementById('state').textContent === 'READY' && /FIRMWARE.*on · OpenROMs pressing 1 \(contract · repository\) · PINNED · from ethereum.*by the switch/.test(document.getElementById('now').textContent)), 90000, 500);
  check(!!fwOn, 'FIRMWARE on: the machine rebuilt with OpenROMs pressing 1 from the chain, PINNED, and the state is READY');
  check(await pg.evaluate(() => /EMULATOR.*PINNED · minimal64-2022 \(.*\) · from ethereum, through/.test(document.getElementById('now').textContent)), 'the emulator keeps its own source under the firmware (no "from undefined")');
  const fwLinks = await pg.evaluate(() => { const cat = window.machinePage.catalogue; const row = [...document.querySelectorAll('#now .nl')].find((r) => r.querySelector('.k').textContent === 'FIRMWARE'); return { links: [...row.querySelectorAll('a')].map((a) => `${a.textContent}=${a.getAttribute('href')}`), root: cat.machine.firmware.root }; });
  check(fwLinks.links.join() === `contract=https://etherscan.io/address/${fwLinks.root},repository=https://github.com/DeMEdPit/openroms-ethereum-pressing-1`, `the firmware on links to the pressing's contract and repository (${fwLinks.links.map((l) => l.split('=')[0]).join(', ')})`);
  check(!!(await until(screenHasReady, 15000, 500)), 'the OpenROMs banner and READY on the screen, no reset needed');
  check(await pg.evaluate(() => window.machinePage.input === 'keyboard' && document.getElementById('input-mode').value === 'keyboard'), 'the keyboard is the input under the firmware');
  check((await lines()).keys === 'keyboard · ON · sound on' && (await lines()).now === 'OpenROMs pressing 1 at READY · nothing playing', `the lines under the firmware, READY and nothing playing (${(await lines()).keys} | ${(await lines()).now})`);
  await pg.fill('#search', 'tony');
  await pg.click('#rows .row[data-work="tony"] button.load');
  const underFw = await until(() => pg.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /FIRMWARE.*on · OpenROMs pressing 1 \(contract · repository\) · PINNED · from ethereum/.test(document.getElementById('now').textContent)), 30000, 500);
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
  const running4 = await until(() => pg.evaluate(() => /FIRMWARE.*off · bare, as on chain · by the switch/.test(document.getElementById('now').textContent) && document.getElementById('state').dataset.phase === 'running' && document.getElementById('veil').hidden), 30000, 500);
  check(!!running4, 'a program runs bare again after the switch, the veil gone');
  await pg.click('#reset');
  const reset = await until(() => pg.evaluate(() => document.getElementById('state').textContent === 'RESET'), 5000);
  check(!!reset, 'RESET');
  check((await lines()).now === 'the machine is on and bare · nothing playing', `NOW PLAYING's line after RESET (${(await lines()).now})`);
  // the log folds a line said again into one with a count, so a repeated report is read once
  await pg.evaluate(() => { for (let i = 0; i < 3; i++) window.machinePage.say('the same thing, said again'); });
  const folded = await pg.evaluate(() => ({ last: document.querySelector('#log li:last-child').textContent, count: [...document.querySelectorAll('#log li')].filter((l) => /the same thing/.test(l.textContent)).length, report: window.machinePage.report().split('\n').filter((l) => /the same thing/.test(l)), line: window.machinePage.bays.log.line }));
  check(folded.last === 'the same thing, said again ×3' && folded.count === 1 && folded.report.length === 1 && /the same thing, said again ×3$/.test(folded.report[0]) && /^the same thing, said again ×3 · \d+ lines$/.test(folded.line), `a line said three times is one line with a count, in the panel, the copied log and the header (${folded.line})`);
  check(await pg.evaluate(() => window.machinePage.report().split('\n').filter((l) => /sound: waits for your first tap/.test(l)).length <= 1), 'the sound\'s waiting is said at most once');
  // a bay folds: the header is the whole button, the body one row that grows and shrinks in 240ms, the mark's upright collapsing with it
  const motion = await pg.evaluate(() => ({ body: getComputedStyle(document.querySelector('#bay-keys > .bb')).transitionDuration, mark: getComputedStyle(document.querySelector('#bay-keys .bm'), '::after').transitionDuration, marker: getComputedStyle(document.querySelector('#bay-keys > summary')).listStyleType, markOpen: getComputedStyle(document.querySelector('#bay-keys .bm'), '::after').transform }));
  check(/^0\.24s/.test(motion.body) && motion.mark === '0.24s' && motion.marker === 'none' && motion.markOpen === 'matrix(1, 0, 0, 0, 0, 0)', `the body and the mark move together in 240ms; open, the mark's upright is collapsed (${motion.body}; ${motion.markOpen})`);
  const keysLineBefore = (await lines()).keys;
  await pg.click('#bay-keys > summary');
  const closing = await pg.evaluate(() => { const b = window.machinePage.bays.keys; return { moving: b.moving, element: b.element, open: b.open }; });
  const closed = await until(() => pg.evaluate(() => { const b = window.machinePage.bays.keys; return !b.open && !b.element && !b.moving ? true : null; }), 3000, 50);
  const afterClose = await pg.evaluate(() => ({ hidden: document.querySelector('#bay-keys > .bb').getBoundingClientRect().height === 0 && !document.getElementById('input-mode').checkVisibility(), aria: document.querySelector('#bay-keys > summary').getAttribute('aria-expanded'), mark: getComputedStyle(document.querySelector('#bay-keys .bm'), '::after').transform, line: window.machinePage.bays.keys.line }));
  check(closing.moving && closing.element && !closing.open && !!closed && afterClose.hidden && afterClose.aria === 'false' && afterClose.mark === 'none' && afterClose.line === keysLineBefore && /^joystick 2 · OFF · sound on$/.test(afterClose.line), `THE KEYS closes on its header: the row shrinks first, the element closes when it has, the controls gone, the header saying closed with its line intact (${afterClose.line})`);
  await pg.click('#bay-keys > summary');
  const reopened = await until(() => pg.evaluate(() => { const b = window.machinePage.bays.keys; return b.open && b.element && !b.moving ? true : null; }), 3000, 50);
  check(!!reopened && (await pg.evaluate(() => document.getElementById('input-mode').checkVisibility() && document.querySelector('#bay-keys > .bb').getBoundingClientRect().height > 100 && document.querySelector('#bay-keys > summary').getAttribute('aria-expanded') === 'true')), 'and opens again on its header, the controls back');
  await pg.click('#bay-log > summary');
  check(await pg.evaluate(() => { const b = window.machinePage.bays.log; return b.open && b.element && !b.moving && getComputedStyle(document.querySelector('#bay-log .bm')).display === 'none'; }), 'on a wide screen the log is the stage\'s: its header is not a button and it does not fold');
  const fold = await pg.evaluate(() => ({ open: document.getElementById('how-auto').open, body: !!document.querySelector('#how-auto > .bb > .bi > p') }));
  await pg.click('#how-auto > summary');
  const foldOpen = await until(() => pg.evaluate(() => (document.getElementById('how-auto').open && document.getElementById('how-auto').classList.contains('is-open') && !document.getElementById('how-auto').classList.contains('moving') ? true : null)), 3000, 50);
  check(!fold.open && fold.body && !!foldOpen && (await pg.evaluate(() => document.querySelector('#how-auto > summary').getAttribute('aria-expanded') === 'true')), 'HOW AUTO DECIDES folds the same way, its body one row');
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
  const pr = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pr.goto(`${A.base}/machine/?work=perception-canary&token=1&revision=1`, { waitUntil: 'load' });
  const openedRev = await until(() => pr.evaluate(() => (document.getElementById('state').dataset.phase === 'running' && /revision 1 of 2/.test(document.getElementById('now').textContent) ? true : null)), 90000, 500);
  check(!!openedRev, 'the address names a revision and the page opens on it');
  await pr.goto(`${A.base}/machine/?work=perception-canary&token=1&revision=9`, { waitUntil: 'load' });
  const beyond = await until(() => pr.evaluate(() => (document.getElementById('state').dataset.phase === 'refused' ? document.getElementById('state').textContent + ' · ' + document.getElementById('now').textContent : null)), 90000, 500);
  check(!!beyond && /REFUSED · NO_SUCH_REVISION/.test(beyond) && /has revisions 0 to 2 at block/.test(beyond), `a revision beyond the head is refused in words (${beyond ? beyond.slice(0, 60) : 'no refusal'})`);
  await pr.close();

  // widths
  // the tiers the stylesheet sets by the window's height on a wide screen: the log gives up height first, then the machine gives up size
  const tier = (w, h) => w < 1140 ? { frame: null, log: 160, sticky: false } : h >= 870 ? { frame: 768, log: 160, sticky: true } : h >= 810 ? { frame: 768, log: 144, sticky: true } : h >= 765 ? { frame: 768, log: 104, sticky: true } : h >= 670 ? { frame: 576, log: 144, sticky: true } : h >= 630 ? { frame: 576, log: 104, sticky: true } : { frame: 768, log: 160, sticky: false };
  for (const [w, h] of [[390, 844], [1000, 900], [1440, 900], [1440, 800], [1440, 680]]) {   // a phone; one column wider than the frame; two columns on a tall window; a shorter one, where the log gives up height; a short one, where the machine gives up size and the stage still stays whole
    const pw = await b.newPage({ viewport: { width: w, height: h } });
    const t = tier(w, h), logWant = t.log;
    const stickyEl = '.stage';
    const errs = [];
    pw.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    pw.on('pageerror', (e) => errs.push(String(e)));
    await pw.goto(`${A.base}/machine/`, { waitUntil: 'load' });
    await until(() => pw.evaluate(() => document.querySelectorAll('#rows .row').length > 0), 10000);
    const bays0 = await pw.evaluate(() => { const b = window.machinePage.bays; const top = (sel) => document.querySelector(sel).getBoundingClientRect().top; const order = ['#bay-now', '#bay-chain', '#bay-file', '#bay-keys', '#bay-log', '.leave'].map(top); return { closed: Object.values(b).every((x) => !x.open && !x.element), open: Object.values(b).every((x) => x.open && x.element), aria: [...document.querySelectorAll('details.bay > summary')].map((s) => s.getAttribute('aria-expanded')).join(), ordered: order.every((t, i) => i === 0 || t > order[i - 1]), heights: ['now', 'chain', 'file', 'keys', 'log'].map((k) => Math.round(document.getElementById('bay-' + k).getBoundingClientRect().height)) }; });
    if (w < 1140) check(bays0.closed && bays0.aria === 'false,false,false,false,false' && bays0.ordered && bays0.heights.every((x) => x > 40 && x < 80), `at ${w} wide: the five bays start closed, two lines each (${bays0.heights.join(', ')}px), NOW PLAYING first under the pad, then the list, the file door, the keys, the log and the way out`);
    else check(bays0.open && bays0.aria === 'true,true,true,true,true', `at ${w} wide: the five bays start open`);
    if (w < 1140) await pw.evaluate(() => { for (const k of ['now', 'chain', 'file', 'keys', 'log']) window.machinePage.bay(k, true); });   // opened, instantly, for the shape checks below
    const frame = await pw.evaluate(() => { const f = document.getElementById('frame').getBoundingClientRect(); return { w: Math.round(f.width), h: Math.round(f.height), col: Math.round(document.querySelector('.machine').getBoundingClientRect().width), overflow: document.documentElement.scrollWidth > window.innerWidth, scrollY: window.scrollY }; });
    check(frame.w > 200 && (t.frame === null ? frame.w === frame.col : frame.w === t.frame) && !frame.overflow && noiseFree(errs).length === 0, `at ${w}x${h}: the frame ${frame.w}×${frame.h}${t.frame ? ` (${t.frame} wanted at this height)` : ` (the column's ${frame.col}, in one column)`}, no horizontal overflow, no errors (${noiseFree(errs).length})`);
    check(frame.scrollY === 0, `at ${w} wide: the page stays at the top on load (scrollY ${frame.scrollY})`);
    const listShows = await pw.evaluate(() => { const row = document.querySelector('#rows .row[data-work="tony"]'); const l = document.getElementById('rows').getBoundingClientRect(); const r = row.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; });
    check(listShows, `at ${w} wide: the list shows the loaded row inside itself`);
    check(await pw.evaluate(() => document.getElementById('file').type === 'file' && document.getElementById('door').getBoundingClientRect().height > 30), `at ${w} wide: the file door is there`);
    check(await pw.evaluate(() => document.getElementById('firmware').value === 'auto' && document.getElementById('firmware').options.length === 3), `at ${w} wide: the firmware switch reads auto, three positions`);
    const shape0 = await pw.evaluate(() => ({ rows: Math.round(document.getElementById('rows').getBoundingClientRect().height), log: Math.round(document.getElementById('log').getBoundingClientRect().height), now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent), badge: document.getElementById('link').getBoundingClientRect().width }));
    await until(() => pw.evaluate(() => document.getElementById('state').dataset.phase === 'running'), 90000, 500);
    const shapeRun = await pw.evaluate(() => ({ now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent), log: Math.round(document.getElementById('log').getBoundingClientRect().height) }));
    await pw.click('#reset');
    await until(() => pw.evaluate(() => document.getElementById('state').textContent === 'RESET'), 5000);
    const shapeIdle = await pw.evaluate(() => ({ now: Math.round(document.getElementById('now').getBoundingClientRect().height), labels: [...document.querySelectorAll('#now .k')].map((k) => k.textContent) }));
    check(shape0.rows >= 250 && shape0.log === logWant && shape0.log === shapeRun.log, `at ${w}x${h}: the list (${shape0.rows}) and the log (${shape0.log}, ${logWant} wanted at this height) are their full size before anything arrives`);
    // the first paint may already show the first program's rows when the rig is quick: either set is right, the five machine rows in both, the idle set exact after RESET
    const IDLE = 'PROGRAM,BYTES,CHECK,EMULATOR,FIRMWARE,INPUT,MODE,NODE', TAIL = 'EMULATOR,FIRMWARE,INPUT,MODE,NODE';
    check((shape0.labels.join() === IDLE || shape0.labels.slice(-5).join() === TAIL) && shapeIdle.labels.join() === IDLE && shapeRun.labels.slice(-5).join() === TAIL, `at ${w} wide: NOW PLAYING keeps its rows (${shape0.labels.length} at first paint, ${shapeRun.labels.length} running, ${shapeIdle.labels.length} idle)`);
    check(Math.abs(shape0.now - shapeRun.now) <= 48 && Math.abs(shapeIdle.now - shapeRun.now) <= 48, `at ${w} wide: NOW PLAYING holds its height, first paint ${shape0.now}, running ${shapeRun.now}, idle ${shapeIdle.now}`);
    const badge = await pw.evaluate(() => { const l = document.getElementById('link').getBoundingClientRect(), f = document.getElementById('frame').getBoundingClientRect(); return { right: f.right - l.right, left: l.left - f.left, block: document.getElementById('link-block').innerText }; });
    check(w < 1140 ? (badge.right >= 0 && badge.right < 40 && /^#\d+/.test(badge.block)) : (badge.left >= 0 && badge.left < 40 && /^block /.test(badge.block)), `at ${w} wide: the badge hangs from the frame's own corner, ${w < 1140 ? 'at the right in its short form' : 'at the left in its long form'} (${badge.block}; ${Math.round(w < 1140 ? badge.right : badge.left)}px in from the frame's edge)`);
    const badgeNow = await pw.evaluate(() => document.getElementById('link').getBoundingClientRect().width);
    check(Math.abs(badgeNow - shape0.badge) <= 1, `at ${w} wide: the badge keeps one width from first paint to a held read, in its ${w < 1140 ? 'short' : 'long'} form (${Math.round(shape0.badge)} then ${Math.round(badgeNow)})`);
    // the layout: on a wide screen the log sits under the machine and the column beside them, the stage sticky on a tall
    // window; in one column the panels keep the phone's order, the log after NOW PLAYING
    // measured at the top of the page: the click on RESET scrolled it, and on a short window the log has passed beneath the machine by then
    const lay = await pw.evaluate(async (sel) => {
      window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 150));
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const frame = r('frame'), log = document.querySelector('.logbox').getBoundingClientRect(), now = r('now'), rows = r('rows'), door = r('door'), fw = r('firmware'), leave = document.querySelector('.leave a').getBoundingClientRect();
      return { frame: { left: frame.left, right: frame.right, bottom: frame.bottom }, log: { left: log.left, top: log.top }, now: { left: now.left, top: now.top }, rows: rows.top, door: door.top, fw: fw.top, leave: leave.top,
               sticky: getComputedStyle(document.querySelector(sel)).position, hint: !!document.querySelector('.stage p.hint') };
    }, stickyEl);
    if (w >= 1140) check(Math.abs(lay.log.left - lay.frame.left) < 2 && lay.log.top >= lay.frame.bottom + 50 && lay.now.left > lay.frame.right && lay.sticky === 'sticky', `at ${w}x${h}: the log under the machine, NOW PLAYING beside it, the stage sticky (${lay.sticky})`);
    else check(lay.now.top < lay.rows && lay.rows < lay.door && lay.door < lay.fw && lay.fw < lay.log.top && lay.log.top < lay.leave && lay.sticky !== 'sticky', `at ${w} wide: one column in the phone's order: NOW PLAYING, the chain, a file, the keys, the log, the way out`);
    check(!lay.hint, `at ${w} wide: no sentence under the machine; its facts are in THE KEYS`);
    const head = await pw.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); const l = document.querySelector('.lede').getBoundingClientRect(); return { h1: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize), frameTop: document.getElementById('frame').getBoundingClientRect().top, lede: l.height, ledeW: l.width, main: document.querySelector('main').getBoundingClientRect().width, column: document.querySelector('.column').getBoundingClientRect().width }; });
    check(head.h1 <= 42 && head.lede < (w < 1140 ? 160 : 130) && head.ledeW <= Math.min(768, w) && head.frameTop < 300, `at ${w}x${h}: a compact header, the title ${head.h1}px, the lede a block ${Math.round(head.ledeW)} wide and ${Math.round(head.lede)}px tall, the machine ${Math.round(head.frameTop)}px from the top`);
    if (w >= 1140) check(head.main === Math.min(1300, w - 36) && head.column >= (w >= 1336 ? 500 : 300), `at ${w} wide: the page is ${head.main} wide, the player at 768 and the panel ${Math.round(head.column)}`);
    if (w >= 1140) {
      // the site scrolls smoothly, so the test scrolls instantly and reads settled positions
      const scrolled = await pw.evaluate(async () => { const wait = () => new Promise((r) => setTimeout(r, 150)); window.scrollTo({ top: 0, behavior: 'instant' }); await wait(); const before = document.getElementById('lab-now').getBoundingClientRect().top; window.scrollTo({ top: 700, behavior: 'instant' }); await wait(); const out = { frame: document.getElementById('frame').getBoundingClientRect().top, now: document.getElementById('lab-now').getBoundingClientRect().top, before }; window.scrollTo({ top: 0, behavior: 'instant' }); await wait(); return out; });
      check(scrolled.frame > 8 && scrolled.frame < 24 && scrolled.now < scrolled.before - 400, `at ${w}x${h}: scrolled 700px, the machine stays at the top (${Math.round(scrolled.frame)}px) while the column moves (${Math.round(scrolled.before)} to ${Math.round(scrolled.now)})`);
      const together = await pw.evaluate(async () => { const wait = () => new Promise((r) => setTimeout(r, 150)); window.scrollTo({ top: 700, behavior: 'instant' }); await wait(); const f = document.getElementById('frame').getBoundingClientRect(), l = document.querySelector('.logbox').getBoundingClientRect(); const out = { logTop: l.top, logBottom: l.bottom, frameBottom: f.bottom }; window.scrollTo({ top: 0, behavior: 'instant' }); await wait(); return out; });
      check(together.logTop > together.frameBottom + 40 && together.logBottom <= h + 1, `at ${w}x${h}: scrolled, the log stays with the machine (its top ${Math.round(together.logTop)} below the frame's bottom ${Math.round(together.frameBottom)}) and fits the window (its bottom ${Math.round(together.logBottom)} of ${h})`);
      const buttons = await pw.evaluate(() => { const lab = document.querySelector('.logbox .lab').getBoundingClientRect(), t = document.getElementById('copy-log').getBoundingClientRect(), left = document.getElementById('copy').getBoundingClientRect(), box = document.querySelector('.logbox').getBoundingClientRect(), log = document.getElementById('log').getBoundingClientRect(), line = document.querySelector('#sum-log .e').getBoundingClientRect(); return { inLabel: t.top >= lab.top - 6 && t.bottom <= lab.bottom + 30 && t.right <= box.right, lineBeside: Math.abs((line.top + line.bottom) / 2 - (lab.top + lab.bottom) / 2) < 4 && line.right <= left.left - 8 && line.width > 40, clear: log.top - t.bottom }; });
      check(buttons.inLabel && buttons.lineBeside && buttons.clear >= 3, `at ${w}x${h}: the COPY buttons sit in the log's label row, inside the panel, clear of the log's top rule by ${buttons.clear.toFixed(1)}px, the log's line beside its name and clear of them`);
    }
    // the panels keep their shape: the list and the log are their full size before anything arrives, and NOW PLAYING
    // shows the same rows, dashes or facts, so nothing below it moves when a program lands or leaves
    await pw.screenshot({ path: join(EVIDENCE, `page-${w}x${h}.png`), fullPage: true });
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
  const phoneHead = await pt.evaluate(() => { const b = window.machinePage.bays; const s = document.getElementById('sum-now').getBoundingClientRect(), e = document.querySelector('#sum-now .e'), last = document.querySelector('#sum-now .f:last-child').getBoundingClientRect(); return { closed: Object.values(b).every((x) => !x.open && !x.element), oneLine: s.height < 24, cut: e.scrollWidth > e.clientWidth, trustShown: last.right <= s.right + 0.5 && last.width > 60, line: b.now.line, keys: b.keys.line, state: document.getElementById('state').getBoundingClientRect().right <= document.querySelector('#bay-now > summary').getBoundingClientRect().right }; });
  check(phoneHead.closed && phoneHead.oneLine && phoneHead.cut && phoneHead.trustShown && phoneHead.line === 'Tony: Born for Adventure (C64 demo) · PINNED · PURE' && phoneHead.keys === 'joystick 2 · AUTO · bare · sound on' && phoneHead.state, `on the phone the bays are closed, each line one line tall, the name cut short and the trust words whole (${phoneHead.line})`);
  const rail = await pt.evaluate(() => ['now', 'chain', 'file', 'keys', 'log'].map((k) => { const p = document.getElementById('bay-' + k).getBoundingClientRect(), l = document.getElementById('sum-' + k).getBoundingClientRect(), m = document.querySelector('#bay-' + k + ' .bm').getBoundingClientRect(); return { gap: Math.round(m.left - l.right), inset: Math.round(p.right - m.right), centred: Math.abs((p.right - 16 - m.right) - (m.left - (l.right + 12))) }; }));
  check(rail.every((r) => r.gap >= 20 && r.inset >= 20 && r.centred <= 2), `the mark has a rail of its own on every card: the line ends ${rail.map((r) => r.gap).join('/')}px before it, the mark centred`);
  await pt.evaluate(() => window.machinePage.bay('keys', true));
  check(await pt.evaluate(() => getComputedStyle(document.querySelector('dt.touch-only')).display === 'block' && getComputedStyle(document.querySelector('dd.touch-only')).display === 'block' && getComputedStyle(document.querySelector('span.touch-only')).display === 'inline' && getComputedStyle(document.querySelector('.keys .fine-only')).display === 'none'), 'on a coarse pointer DIAGONALS and the phone note show in THE KEYS, the fine pointer\'s sound note not');
  const hintLines = await pt.evaluate(() => [...document.querySelectorAll('.keys .hint')].filter((h) => h.getClientRects().length).map((h) => ({ t: h.innerText.trim().slice(0, 30), h: Math.round(h.getBoundingClientRect().height) })));
  check(hintLines.length >= 6 && hintLines.every((h) => h.h < 24), `on the phone every hint under a control is one line tall (${hintLines.map((h) => h.h).join(', ')}px)`);
  const pad = await pt.evaluate(() => { const r = (sel) => document.querySelector(sel).getBoundingClientRect(); const f = r('#frame'), ring = r('#ring'), fire = r('#touch .fire'), first = r('#bay-now'), link = r('#link'); return { above: ring.top - f.bottom, below: first.top - ring.bottom, level: Math.abs((ring.top + ring.bottom) / 2 - (fire.top + fire.bottom) / 2), badgeClear: fire.top - link.bottom }; });
  check(Math.abs(pad.above - 25) < 1 && Math.abs(pad.below - 25) < 1 && pad.level < 1 && pad.badgeClear > 0, `the pad has the same air above and below the ring (${Math.round(pad.above)} and ${Math.round(pad.below)}), FIRE level with it, the badge clear of FIRE`);
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
  // a link into a closed bay opens it, and the fold inside it too, and the page goes there
  await pt.evaluate(() => { window.machinePage.bay('keys', false); location.hash = '#how-auto'; });
  const revealed = await until(() => pt.evaluate(() => { const k = window.machinePage.bays.keys, h = document.getElementById('how-auto'); return k.open && k.element && h.open && h.classList.contains('is-open') ? true : null; }), 3000, 50);
  await new Promise((r) => setTimeout(r, 700));   // the site scrolls smoothly
  const seen = await pt.evaluate(() => { const r = document.getElementById('how-auto').getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; });
  check(!!revealed && seen, 'a link into a closed bay opens the bay and the fold it names, and the page goes there');
  check(noiseFree(terrs).length === 0, `no errors on the touch page (${noiseFree(terrs).length})`);
  await pt.close(); await tc.close();
  // under reduced motion the bays open and close at once
  const pm = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await pm.emulateMedia({ reducedMotion: 'reduce' });
  await pm.goto(`${A.base}/machine/`, { waitUntil: 'load' });
  const still = await pm.evaluate(() => { const d = document.getElementById('bay-keys'); const before = getComputedStyle(d.querySelector(':scope > .bb')).transitionDuration; d.querySelector(':scope > summary').click(); const b = window.machinePage.bays.keys; return { before, moving: b.moving, element: b.element, open: b.open }; });
  check(/^0s/.test(still.before) && !still.moving && !still.element && !still.open, `under reduced motion nothing moves: the bay closes at once (${still.before})`);
  await pm.close();
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
