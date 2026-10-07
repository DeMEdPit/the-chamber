// SPDX-License-Identifier: MIT
// The play pages' gate: the machine page inside a post's frame, at the card's size, on a synthetic chain.
// What it holds: the built play page carries the tags a post reads (a player card, a secure player address on this
// site, its size, a PNG image on this site with its stamp, a title and a description within X's limits); inside a
// stand-in post's frame of the card's size the machine page comes up in its card mode with the machine first and the
// rest hidden, boots the real machine off the stand-in chain and runs the program; a tap on the page's own line starts
// the sound; a click on the machine gives it keys, which its own port proves; on a touch screen the ring is there and
// holds a direction. Nothing posts anything.
//
//   node play/test/frame.mjs
// Needs Playwright and Chromium (machine/test/pw.mjs finds them) and python3.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from '../../machine/test/pw.mjs';
import { start } from '../../machine/test/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), MACHINE_TEST = join(ROOT, 'machine', 'test');
let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };
function synthetic(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('python3', [join(MACHINE_TEST, 'synthetic.py'), '--serve', ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = '';
    p.stdout.on('data', (c) => { buf += c; const i = buf.indexOf('\n'); if (i >= 0 && !p.ready) { p.ready = true; resolve(Object.assign(JSON.parse(buf.slice(0, i)), { proc: p })); } });
    p.on('exit', (code) => { if (!p.ready) reject(new Error('synthetic.py exited ' + code)); });
  });
}
const until = async (fn, ms, step = 250) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. the tags of the built pages, as a post's crawler reads them
const site = 'https://chamber64.com';
const tagsOf = (dir) => { const html = readFileSync(join(ROOT, 'play', dir, 'index.html'), 'utf8'); const meta = {}; for (const m of html.matchAll(/<meta (?:name|property)="([^"]+)" content="([^"]*)">/g)) meta[m[1]] = m[2].replace(/&amp;/g, '&'); return { html, meta }; };
for (const [dir, player, height] of [['tony', `${site}/machine/?work=tony&token=1&card=1`, '400'], ['machine', `${site}/machine/?work=tony&token=1`, '900']]) {
  const { html, meta } = tagsOf(dir);
  check(meta['twitter:card'] === 'player' && meta['twitter:player'] === player && meta['twitter:player:width'] === '480' && meta['twitter:player:height'] === height,
    `play/${dir}: a player card whose player is ${dir === 'tony' ? 'the machine page in its card mode' : 'the whole machine page'} at 480 by ${height} (${meta['twitter:player']})`);
  check(meta['og:video'] === meta['twitter:player'] && meta['og:video:secure_url'] === meta['twitter:player'] && meta['og:video:type'] === 'text/html' && meta['og:video:width'] === '480' && meta['og:video:height'] === height && meta['og:type'] === 'video.other',
    `play/${dir}: the Open Graph video tags say the same player, an HTML page, at the same size`);
  const img = meta['twitter:image'] || '', imgPath = img.replace(site, '').split('?')[0], imgFile = join(ROOT, imgPath.replace(/^\//, ''));
  let png = null; try { png = readFileSync(imgFile); } catch (_) { png = null; }
  check(img.startsWith(site + '/') && png && png.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && meta['og:image'] === img && /\?v=[0-9a-f]{8}$/.test(img),
    `play/${dir}: the fallback image is a PNG on this site with its stamp (${imgPath})`);
  check((meta['twitter:title'] || '').length > 0 && meta['twitter:title'].length <= 70 && (meta['twitter:description'] || '').length > 0 && meta['twitter:description'].length <= 200 && meta['twitter:title'] === meta['og:title'],
    `play/${dir}: the title is within 70 characters and the description within 200 (${meta['twitter:title'].length}, ${meta['twitter:description'].length})`);
  const framed = player.replace(site, '').replace(/&/g, '&amp;');
  check(/<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">/.test(html) && !/<script/.test(html) && html.includes(`<iframe src="${framed}"`),
    `play/${dir}: the page runs no script of its own, frames only this site, and frames the same player address it names`);
}

// 2. inside a stand-in post's frame
const s = await synthetic(['--real-machine']);
const port = Number(process.env.PORT || 8341), base = `http://127.0.0.1:${port}`;
const server = await start(port, { catalogue: s.catalogue, rpcUpstreams: { '/rpc': s.rpc }, faults: {} });
const b = await browser();
try {
  for (const [name, ctxOpts] of [['desktop', { viewport: { width: 600, height: 760 }, deviceScaleFactor: 1 }], ['touch', { viewport: { width: 600, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }]]) {
    const ctx = await b.newContext(ctxOpts), pg = await ctx.newPage();
    const errors = []; pg.on('pageerror', (e) => errors.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await pg.goto(`${base}/play/tony/`, { waitUntil: 'load' });   // the play page itself is the frame's holder, as a post would be
    const fr = await until(() => pg.frames().find((f) => f.url().includes('/machine/?')), 10000, 200);
    check(!!fr && /card=1/.test(fr.url()), `${name}: the play page frames the machine page in its card mode (${fr ? fr.url().split('?')[1] : 'no frame'})`);
    const running = await until(() => fr.evaluate(() => document.getElementById('state') && document.getElementById('state').dataset.phase === 'running').catch(() => false), 90000, 500);
    const lay = await fr.evaluate(() => { const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { top: Math.round(b.top), height: Math.round(b.height), width: Math.round(b.width), shown: cs.display !== 'none' && b.height > 0 }; };
      return { card: document.documentElement.classList.contains('card'), frame: r('#frame'), h1: r('h1'), lede: r('.lede'), column: r('.column'), log: r('#bay-log'), foot: r('.site-foot'), bar: r('#cardbar'), ring: r('#ring'), open: document.getElementById('cardbar-open').getAttribute('href'), playing: window.machinePage.playing && window.machinePage.playing.program.label, status: window.machinePage.playing && window.machinePage.playing.status, framed: window.top !== window.self, w: innerWidth, h: innerHeight }; });
    check(running && lay.card && lay.framed && lay.playing === 'Tony: Born for Adventure (C64 demo)', `${name}: inside the frame the machine boots off the chain and runs the token's program (${lay.playing}, ${lay.status})`);
    check(lay.frame && lay.frame.top <= 1 && lay.frame.width === lay.w && lay.frame.height + (lay.bar ? lay.bar.height : 0) <= 400 && lay.bar && lay.bar.shown && lay.bar.top < 400,
      `${name}: the machine comes first and whole in a 480 by 400 frame with the line under it (the picture ${lay.frame && lay.frame.width} by ${lay.frame && lay.frame.height} from ${lay.frame && lay.frame.top}, the line at ${lay.bar && lay.bar.top})`);
    check([lay.h1, lay.lede, lay.column, lay.log, lay.foot].every((x) => x && !x.shown) && lay.open === '/machine/?work=tony&token=1', `${name}: the heading, the lede, the panels, the log and the footer are hidden; the way out names the same program on the whole page (${lay.open})`);
    // the sound: a tap on the page's own line, delivered through the frame as a finger or a pointer would land
    if (ctxOpts.hasTouch) await fr.locator('#cardbar').tap({ position: { x: 20, y: 10 } }); else await fr.locator('#cardbar').click({ position: { x: 20, y: 10 } });
    const sound = await until(() => fr.evaluate(() => { const a = window.machinePage.audio; return a.attached && a.pulled > 3 ? a.pulled : null; }), 15000, 200);
    check(!!sound, `${name}: a tap on the line under the machine starts the sound (${sound || 0} buffers pulled)`);
    if (!ctxOpts.hasTouch) {
      // the keys: a click on the machine, then a held arrow read from the machine's own port (port 2, right is bit 8)
      await fr.locator('#frame').click(); await wait(300);
      await pg.keyboard.down('ArrowRight'); await wait(400);
      const held = await fr.evaluate(() => window.machinePage.machine.request('peek', { addr: 0xdc00 }).then((r) => r.value));
      await pg.keyboard.up('ArrowRight'); await wait(400);
      const up = await fr.evaluate(() => window.machinePage.machine.request('peek', { addr: 0xdc00 }).then((r) => r.value));
      check(held === 127 - 8 && up === 127, `${name}: a click on the machine gives it the keys: right held reads ${held} on the port, released ${up}`);
    } else {
      // the ring, held as the page gate holds it: the pointer down on its east and read while down
      await fr.evaluate(() => document.getElementById('ring').scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(200);
      const ringBox = await fr.locator('#ring').boundingBox();
      await fr.locator('#ring').hover({ position: { x: ringBox.width * 0.9, y: ringBox.height / 2 } }); await pg.mouse.down(); await wait(200);
      const held = await fr.evaluate(() => window.machinePage.pad.held);
      const portHeld = await fr.evaluate(() => window.machinePage.machine.request('peek', { addr: 0xdc00 }).then((r) => r.value));
      await pg.mouse.up(); await wait(200);
      check(lay.ring && lay.ring.shown && held === 8 && portHeld === 127 - 8, `${name}: the ring is there under the machine and a finger on its right holds right (${held}, the port ${portHeld})`);
    }
    check(errors.length === 0, `${name}: no page or console error (${errors.length ? errors[0].slice(0, 120) : 'none'})`);
    await pg.close(); await ctx.close();
  }
  // 3. the whole machine page inside a tall frame: not the card mode; the list of programs, the doors and the switches are
  // in the frame and work there: a token of the Chamber loaded from the chain, a file of your own through the door
  try {
    const ctx = await b.newContext({ viewport: { width: 600, height: 1000 }, deviceScaleFactor: 1 }), pg = await ctx.newPage();
    const errors = []; pg.on('pageerror', (e) => errors.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await pg.goto(`${base}/play/machine/`, { waitUntil: 'load' });
    const fr = await until(() => pg.frames().find((f) => f.url().includes('/machine/?')), 10000, 200);
    const running = await until(() => fr.evaluate(() => document.getElementById('state') && document.getElementById('state').dataset.phase === 'running').catch(() => false), 90000, 500);
    const whole = await fr.evaluate(() => ({ card: document.documentElement.classList.contains('card'), h1: !!document.querySelector('h1') && getComputedStyle(document.querySelector('h1')).display !== 'none', rows: document.querySelectorAll('#rows .row').length, file: !!document.getElementById('file'), paste: !!document.getElementById('paste'), firmware: !!document.getElementById('firmware'), playing: window.machinePage.playing && window.machinePage.playing.program.label, h: innerHeight, w: innerWidth }));
    check(running && !whole.card && whole.h1 && whole.rows > 60 && whole.file && whole.paste && whole.firmware && whole.playing === 'Tony: Born for Adventure (C64 demo)',
      `whole: the machine page as it is, in a frame of 480 by 900: the heading, ${whole.rows} programs listed, the file and paste doors, the FIRMWARE switch, Tony playing from the chain`);
    await fr.evaluate(() => { window.machinePage.bay('chain', true); window.machinePage.bay('file', true); });   // at this width the bays start closed, as on a phone; a viewer opens them with a tap
    await fr.fill('#search', '5'); await fr.click('#rows .row[data-work="chamber"][data-token="5"] button.load');
    const chamber = await until(() => fr.evaluate(() => { const p = window.machinePage.playing; return p && /Chamber/.test(p.program.label) && document.getElementById('state').dataset.phase === 'running' ? { label: p.program.label, status: p.status } : null; }), 90000, 500);
    check(!!chamber, `whole: a Chamber token loads from the chain inside the frame and runs (${chamber ? chamber.label + ' · ' + chamber.status : 'did not load'})`);
    const PRG_B = Buffer.from([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0xa9, 0x02, 0x8d, 0x00, 0x04, 0x60]);   // 10 SYS2061 : LDA #2 ; STA $0400 ; RTS
    await fr.setInputFiles('#file', { name: 'hello.prg', mimeType: 'application/octet-stream', buffer: PRG_B });
    const fileRan = await until(() => fr.evaluate(() => document.getElementById('state').dataset.phase === 'running' && /hello\.prg/.test(document.getElementById('now').textContent) && /YOUR FILE/.test(document.getElementById('now').textContent)), 30000, 500);
    check(!!fileRan, 'whole: a .prg of your own through the door runs inside the frame and is said as YOUR FILE');
    check(errors.length === 0, `whole: no page or console error (${errors.length ? errors[0].slice(0, 120) : 'none'})`);
    await pg.close(); await ctx.close();
  } catch (e) { check(false, `whole: the frame test did not run to its end (${String(e.message || e).split('\n')[0].slice(0, 160)})`); }
} finally { await b.close(); server.close(); s.proc.stdin.end(); s.proc.kill(); }
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
