// SPDX-License-Identifier: MIT
// G2, the bridge gate, and the machine document's own refusals, in a real
// browser against the test server (machine/test/serve.mjs), which serves the
// site's files and a stand-in mainnet built from the site's copies.
//
// What it holds (every line is PASS or FAIL; the process exits 1 on any FAIL):
//   the handshake states the capabilities the machine has; the emulator it
//   was handed is PINNED by the document's own pins and the firmware's
//   hashes are reported and match the host's pins; the embedded document
//   makes no network request of any kind after its own load, its policy
//   forbids one, and it cannot reach the host's document; the firmware boots
//   to READY and a loaded PRG runs; the bare machine boots and runs the same
//   PRG; every refusal code is produced by exactly the input that should
//   produce it, an unknown field and a wrong type included; reads never need
//   LAB, a write does, and the first write is INTERVENED and stays so; a
//   document that cannot hash refuses to run; tampered machine bytes are
//   refused and nothing runs; wrong firmware is refused by the host; a
//   destroyed frame rejects what was pending, a timed-out request destroys
//   the frame, and a fresh one boots; the standalone build reads the
//   stand-in chain and reaches READY.
//
//   node machine/test/bridge.mjs
// Needs Playwright and Chromium (machine/test/pw.mjs finds them).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { makeCRT, PROBE, probe16K } from './make-crt.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from './pw.mjs';
import { start, ROMSET } from './serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(HERE, 'evidence');
const PORT = Number(process.env.PORT || 8261);
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };
const HEX64 = /^[0-9a-f]{64}$/;

// 10 SYS2061 : LDA #1 ; STA $0400 ; RTS  -> screen code 1 ('A') at row 0, column 0
const PRG = [0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0xa9, 0x01, 0x8d, 0x00, 0x04, 0x60];

async function until(fn, ms, step = 250) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

await mkdir(EVIDENCE, { recursive: true });
const server = await start(PORT);
const b = await browser();
const results = { when: new Date().toISOString() };
try {
  const pg = await b.newPage({ viewport: { width: 900, height: 700 } });
  const pageErrors = [], consoleErrors = [], requests = [];
  pg.on('pageerror', (e) => pageErrors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  pg.on('request', (q) => requests.push({ url: q.url(), main: q.frame() === pg.mainFrame(), nav: q.isNavigationRequest() }));
  await pg.goto(`${BASE}/machine/test/harness.html`, { waitUntil: 'load' });

  // 1. the handshake and the boot under firmware
  const boot = await pg.evaluate(() => window.harness.boot({ firmware: true }));
  check(!boot.error, `boot under firmware${boot.error ? ': ' + boot.error.code + ' ' + boot.error.text : ''}`);
  const h = boot.hello || {}, r = boot.ready || {};
  check(h.protocol === 1 && h.machine === 'minimal64-2022' && h.build === 'embedded', `hello: protocol ${h.protocol}, machine ${h.machine}, build ${h.build}`);
  const c = h.capabilities || {};
  check(Array.isArray(c.loads) && c.loads.includes('prg') && c.loads.includes('crt') && c.input.includes('keyboard') && c.input.includes('joystick2') && c.input.includes('joystick1') &&
        c.firmware === true && c.screenText === true && c.peek === true && c.poke === true && c.snapshots === false,
        `capabilities as stated: ${JSON.stringify(c)}`);
  check(h.phase === 'waiting', `the embedded document waits for the host (phase ${h.phase})`);
  check(r.type === 'ready' && r.emulatorStatus === 'PINNED' && r.firmware === true, `ready: emulator ${r.emulatorStatus}, firmware ${r.firmware}, ${r.ms} ms`);
  const fw = r.firmwareSha256 || {};
  const pins = await pg.evaluate(() => window.harness.PINS.firmware);
  check(HEX64.test(fw.kernal || '') && fw.kernal === pins.kernal.sha256 && fw.basic === pins.basic.sha256 && fw.chargen === pins.chargen.sha256,
        `the document reports the firmware's hashes and they equal the host's pins (kernal ${String(fw.kernal).slice(0, 12)}…)`);
  check(r.status && r.status.emulator === 'PINNED' && r.status.firmware === 'PINNED', `the host's statement: emulator ${r.status && r.status.emulator}, firmware ${r.status && r.status.firmware}`);
  check(r.hashes === undefined, 'no generic hashes field in ready');
  results.hello = h; results.ready = r;

  // 2. the embedded document's network: its own load and nothing else
  const frameReqs = requests.filter((q) => !q.main && /^https?:/.test(q.url));
  check(frameReqs.length === 1 && /\/machine\/core\.html$/.test(frameReqs[0].url) && frameReqs[0].nav,
        `the frame made ${frameReqs.length} request(s): ${frameReqs.map((q) => q.url).join(', ') || 'none'}`);
  const frame = pg.frames().find((f) => /\/machine\/core\.html$/.test(f.url()));
  check(!!frame, 'the machine frame is present');
  const policy = await frame.evaluate(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
  const connect = (policy.match(/connect-src ([^;]*)/) || [])[1] || '';
  check(connect.trim() === 'data:', `the frame's policy connects to data: alone (connect-src ${connect.trim() || 'absent'})`);
  const blocked = await frame.evaluate(() => fetch('/machine/parts/MANIFEST.json').then(() => 'allowed', () => 'blocked'));
  check(blocked === 'blocked', `a fetch from inside the frame is ${blocked}`);
  const parentAccess = await frame.evaluate(() => { try { return window.parent.document ? 'reachable' : 'empty'; } catch (e) { return 'blocked'; } });
  check(parentAccess === 'blocked', `the host's document from inside the frame: ${parentAccess}`);
  const secure = await frame.evaluate(() => window.isSecureContext);
  console.log(`info the frame is a secure context: ${secure}`);
  const afterBoot = requests.length;

  // 3. READY under the firmware, then a program runs
  const ready = await until(async () => { const s = await pg.evaluate(() => window.harness.request('screen')); return s.ok && /READY\./.test(s.r.text) ? s.r.text : null; }, 15000);
  check(!!ready && /OPEN ROMS C64/.test(ready), 'the firmware boots to READY with the OpenROMs banner');
  const bootScreen = JSON.parse(await readFile(join(HERE, '..', 'boot-screen.json'), 'utf8'));
  const readyRows = (ready || '').split('\n');
  check(readyRows.length === bootScreen.rows.length && bootScreen.rows.every((r, i) => readyRows[i] === r),
        'the READY screen is row for row what machine/boot-screen.json records, which the share card is drawn from');
  await pg.screenshot({ path: join(EVIDENCE, 'embedded-ready.png') });
  const loaded = await pg.evaluate((p) => window.harness.load(p, 'a test program'), PRG);
  check(loaded.ok && loaded.r.type === 'loaded' && loaded.r.load === 0x0801 && loaded.r.bytes === 20 && loaded.r.intervened === false,
        `loaded: ${JSON.stringify(loaded.r || loaded)}`);
  const ran = await until(async () => { const v = await pg.evaluate(() => window.harness.request('peek', { addr: 0x0400 })); return v.ok && v.r.value === 1 ? v.r : null; }, 8000);
  check(!!ran, 'the program ran: screen code 1 at $0400 (peek)');
  const scr = await pg.evaluate(() => window.harness.request('screen'));
  check(scr.ok && scr.r.text.split('\n')[0].startsWith('A'), `screenText row 0 starts with A: ${JSON.stringify((scr.r || {}).text || '').slice(0, 40)}`);
  await pg.screenshot({ path: join(EVIDENCE, 'embedded-program.png') });
  const range = await pg.evaluate(() => window.harness.request('peek', { addr: 0x0400, length: 4 }));
  check(range.ok && range.r.bytes.length === 4 && range.r.bytes[0] === 1, `peek with a length returns bytes: ${JSON.stringify(range.r && range.r.bytes)}`);

  // 4. refusals, each by exactly the input that should produce it
  const tooShort = await pg.evaluate(() => window.harness.load([0x01, 0x08], 'short'));
  check(!tooShort.ok && tooShort.code === 'PRG_TOO_SHORT', `two bytes: ${tooShort.code}`);
  const overflow = await pg.evaluate(() => window.harness.load([0xff, 0xff, 0x01, 0x02], 'overflow'));
  check(!overflow.ok && overflow.code === 'PRG_ADDRESS_OVERFLOW', `$FFFF + 2 bytes: ${overflow.code}`);
  const tooLarge = await pg.evaluate(() => window.harness.load(new Array(70000).fill(0), 'large'));
  check(!tooLarge.ok && tooLarge.code === 'FILE_TOO_LARGE', `70,000 bytes: ${tooLarge.code}`);
  const crt = await pg.evaluate((p) => window.harness.load(p, 'crt', 'crt'), PRG);
  check(!crt.ok && crt.code === 'CRT_BAD_FILE', `a PRG offered as a cartridge: ${crt.code}`);
  const unknown = await pg.evaluate(() => window.harness.request('nonsense'));
  check(!unknown.ok && unknown.code === 'UNKNOWN_MESSAGE', `an unknown request: ${unknown.code}`);
  const extra = await pg.evaluate(() => window.harness.request('screen', { extra: 1 }));
  check(!extra.ok && extra.code === 'BAD_MESSAGE', `a field outside the schema: ${extra.code}`);
  const wrongType = await pg.evaluate(() => window.harness.request('peek', { addr: '1024' }));
  check(!wrongType.ok && wrongType.code === 'BAD_MESSAGE', `a field of the wrong type: ${wrongType.code}`);
  const missing = await pg.evaluate(() => window.harness.request('poke', { addr: 1024 }));
  check(!missing.ok && missing.code === 'BAD_MESSAGE', `a required field missing: ${missing.code}`);
  const longLabel = await pg.evaluate((p) => window.harness.request('load', { kind: 'prg', bytes: new Uint8Array(p).buffer, label: 'x'.repeat(81) }), PRG);
  check(!longLabel.ok && longLabel.code === 'BAD_MESSAGE', `a label over 80 characters: ${longLabel.code}`);
  const badPeek = await pg.evaluate(() => window.harness.request('peek', { addr: 70000 }));
  check(!badPeek.ok && badPeek.code === 'BAD_MESSAGE', `peek out of range: ${badPeek.code}`);
  const badJoy = await pg.evaluate(() => window.harness.request('joystick', { bit: 3, down: true }));
  check(!badJoy.ok && badJoy.code === 'BAD_MESSAGE', `joystick bit 3: ${badJoy.code}`);

  // 5. reads never need LAB; a write does, and the first one is INTERVENED for good
  const poke0 = await pg.evaluate(() => window.harness.request('poke', { addr: 0x0400, value: 2 }));
  check(!poke0.ok && poke0.code === 'LAB_OFF', `poke with lab off: ${poke0.code}`);
  let st = await pg.evaluate(() => window.harness.request('state'));
  check(st.ok && st.r.intervened === false && st.r.lab === false && st.r.phase === 'running' && st.r.mode === 'firmware', `state before lab: ${JSON.stringify(st.r)}`);
  const lab = await pg.evaluate(() => window.harness.request('lab', { on: true }));
  check(lab.ok && lab.r.lab === true, 'lab on');
  const poke1 = await pg.evaluate(() => window.harness.request('poke', { addr: 0x0400, value: 2 }));
  check(poke1.ok && poke1.r.intervened === true, 'poke with lab on lands');
  const seen = await pg.evaluate(() => window.harness.request('peek', { addr: 0x0400 }));
  check(seen.ok && seen.r.value === 2, 'the write is visible to peek');
  const ev = await pg.evaluate(() => window.harness.events.filter((e) => e.type === 'intervened').length);
  check(ev === 1, `intervened event sent once (${ev})`);
  st = await pg.evaluate(() => window.harness.request('state'));
  check(st.ok && st.r.intervened === true, 'state says intervened');
  const again = await pg.evaluate((p) => window.harness.load(p, 'again'), PRG);
  check(again.ok && again.r.intervened === true, 'a later load in the same document still says intervened (sticky)');
  const noNet = requests.length === afterBoot || requests.slice(afterBoot).every((q) => q.main);
  check(noNet, `no request from the frame during the session (${requests.slice(afterBoot).filter((q) => !q.main).length})`);

  // 6. joystick, input and type answer
  const joy = await pg.evaluate(() => window.harness.request('joystick', { bit: 16, down: true }).then((a) => window.harness.request('joystick', { bit: 16, down: false }).then((b) => [a, b])));
  check(joy[0].ok && joy[1].ok, 'joystick press and release');
  const input = await pg.evaluate(() => window.harness.request('input', { mode: 'joystick' }));
  check(input.ok && input.r.input === 'joystick', 'input mode set');
  const typed = await pg.evaluate(() => window.harness.request('type', { text: 'X' }));
  check(typed.ok && typed.r.typed === true, 'type resolves when done');
  // 6a. under the stick the other keys still type: a real key press on the frame reaches the keyboard matrix (an arrow
  // is the stick's, proven on the port in 10b; at READY the firmware itself moves the cursor for a stick in port 2, so
  // the cursor is no test of it)
  // a key is held for a few frames, as a finger holds it: the KERNAL scans the matrix once a frame
  const hold = async (code) => { await pg.keyboard.down(code); await new Promise((r) => setTimeout(r, 90)); await pg.keyboard.up(code); await new Promise((r) => setTimeout(r, 90)); };
  await pg.evaluate(() => document.querySelector('iframe').focus());
  await hold('KeyA');
  const typedByKey = await until(() => pg.evaluate(() => window.harness.request('screen').then((r) => (r.ok && /XA/.test(r.r.text) ? r.r.text : null))), 5000, 100);
  check(!!typedByKey, 'under joystick input a letter key still types at the prompt (XA on the screen)');

  // 6b. the host takes the sound: samples come over the port, at the buffer size asked, and not before audio is on
  const early = await pg.evaluate(() => window.harness.request('samples'));
  check(!early.ok && early.code === 'AUDIO_OFF', `samples before audio: ${early.code}`);
  const audioOn = await pg.evaluate(() => window.harness.request('audio', { on: true, sampleRate: 44100, bufferSize: 2048 }));
  check(audioOn.ok && audioOn.r.audio === true && audioOn.r.bufferSize === 2048, `audio on: ${JSON.stringify(audioOn.r || audioOn)}`);
  const smp = await pg.evaluate(() => window.harness.request('samples'));
  check(smp.ok && smp.r.type === 'samples' && smp.r.count === 2048 && smp.r.bytes.length === 2048 * 4, `samples: ${smp.ok ? smp.r.count + ' floats, ' + smp.r.bytes.length + ' bytes' : smp.code}`);
  const badRate = await pg.evaluate(() => window.harness.request('audio', { on: true, sampleRate: 100 }));
  check(!badRate.ok && badRate.code === 'BAD_MESSAGE', `a sample rate out of range: ${badRate.code}`);
  const audioOff = await pg.evaluate(() => window.harness.request('audio', { on: false }));
  check(audioOff.ok && audioOff.r.audio === false, 'audio off');
  check(h.capabilities.audio === true, 'hello states audio');

  // 7. a destroyed frame rejects what is pending; a timed-out request destroys the frame; a fresh one boots
  const gone = await pg.evaluate(() => {
    const p = window.harness.request('type', { text: 'HELLO FROM THE HOST\n' }, { timeout: 20000 });
    setTimeout(() => window.harness.destroy(), 50);
    return p;
  });
  check(!gone.ok && gone.code === 'FRAME_GONE', `pending request after destroy: ${gone.code}`);
  check((await pg.evaluate(() => window.harness.frameCount())) === 0, 'no frame left after destroy');
  const reboot = await pg.evaluate(() => window.harness.boot({ firmware: true }));
  check(!reboot.error && reboot.ready.type === 'ready', 'a fresh machine boots after the destroy');
  const timedOut = await pg.evaluate(() => window.harness.request('type', { text: 'ABCDEFGHIJKLMNOP' }, { timeout: 60 }));
  check(!timedOut.ok && timedOut.code === 'TIMEOUT', `a request past its timeout: ${timedOut.code}`);
  const afterTimeout = await pg.evaluate(() => ({ alive: window.harness.alive(), frames: window.harness.frameCount(), reason: window.harness.reason() }));
  check(afterTimeout.alive === false && afterTimeout.frames === 0 && afterTimeout.reason && afterTimeout.reason.code === 'TIMEOUT',
        `the timeout destroyed the machine (alive ${afterTimeout.alive}, frames ${afterTimeout.frames}, reason ${afterTimeout.reason && afterTimeout.reason.code})`);
  const afterGone = await pg.evaluate(() => window.harness.request('screen'));
  check(!afterGone.ok && afterGone.code === 'FRAME_GONE', `a request to the destroyed machine: ${afterGone.code}`);

  // 8. tampered machine bytes are refused and nothing runs; wrong firmware is refused by the host
  const tam = await pg.evaluate(() => window.harness.bootTampered());
  check(!tam.ok && tam.code === 'HASH_MISMATCH', `a flipped byte in part 1: ${tam.code}`);
  const notReady = await pg.evaluate(() => window.harness.request('screen'));
  check(!notReady.ok && notReady.code === 'NOT_READY', `screen after the refusal: ${notReady.code}`);
  const wrongRoms = await pg.evaluate(() => window.harness.bootWrongRoms());
  check(!wrongRoms.ok && wrongRoms.code === 'HASH_MISMATCH' && wrongRoms.alive === false, `a flipped byte in a ROM: ${wrongRoms.code}, machine destroyed ${wrongRoms.alive === false}`);

  // 9. the protocol without the client: ids and schema
  const raw = await pg.evaluate(() => window.harness.raw([
    { v: 1, type: 'state', id: 'seven' },
    { v: 1, type: 'state', id: -1 },
    { v: 2, type: 'state', id: 1 },
    { v: 1, type: 'state', id: 2, extra: true },
    { v: 1, type: 'lab', id: 3, on: 'yes' },
    { v: 1, type: 'state', id: 4 },
    ['not', 'an', 'object'],
  ]));
  const rr = raw.replies;
  const noIdRefusals = rr.filter((m) => m.type === 'refused' && m.id === undefined);
  check(raw.hello && raw.hello.protocol === 1, 'a raw host gets hello');
  check(noIdRefusals.length === 3 && noIdRefusals.every((m) => m.code === 'BAD_MESSAGE'), `a string id, a negative id and a non-object each get an uncorrelated BAD_MESSAGE (${noIdRefusals.length})`);
  const byId = Object.fromEntries(rr.filter((m) => m.id !== undefined).map((m) => [m.id, m]));
  check(byId[1] && byId[1].code === 'BAD_MESSAGE', `v: 2 → ${byId[1] && byId[1].code}`);
  check(byId[2] && byId[2].code === 'BAD_MESSAGE', `an unknown field on state → ${byId[2] && byId[2].code}`);
  check(byId[3] && byId[3].code === 'BAD_MESSAGE', `lab with on: 'yes' → ${byId[3] && byId[3].code}`);
  check(byId[4] && byId[4].type === 'state' && byId[4].phase === 'waiting', `a well-formed state → ${byId[4] && byId[4].type} (${byId[4] && byId[4].phase})`);

  // 9b. an error from a script that is not the document's (a browser extension's, say) does not stop the machine; the machine's own does
  const fresh = await pg.evaluate(() => window.harness.boot({ firmware: false }));
  check(!fresh.error, 'a machine for the error cases');
  const mf = pg.frames().find((f) => /\/machine\/core\.html$/.test(f.url()));
  await mf.evaluate(() => { setTimeout(() => { throw new Error('Failed to connect to MetaMask'); }, 0); });
  await pg.waitForTimeout(600);
  const stillAlive = await pg.evaluate(() => ({ alive: window.harness.alive(), errors: window.harness.events.filter((e) => e.type === 'error').length }));
  check(stillAlive.alive && stillAlive.errors === 0, `a foreign script's error is ignored: alive ${stillAlive.alive}, error events ${stillAlive.errors}`);
  await mf.evaluate(() => { window.m64_update = () => { throw new Error('a fault inside the emulator'); }; });
  const died = await until(() => pg.evaluate(() => (!window.harness.alive() && window.harness.reason()) || null), 5000);
  const errEv = await pg.evaluate(() => window.harness.events.filter((e) => e.type === 'error').map((e) => e.text));
  check(died && died.code === 'MACHINE_ERROR' && errEv.some((t) => /frame loop/.test(t)), `the machine's own fault is fatal and destroys the frame (${died ? died.code : 'alive'}: ${errEv[0] || ''})`);

  // 10. the bare machine boots and runs the same program
  const bare = await pg.evaluate(() => window.harness.boot({ firmware: false }));
  check(!bare.error && bare.ready.type === 'ready' && bare.ready.firmware === false && bare.ready.firmwareSha256 === null && bare.ready.status.firmware === null,
        `bare machine ready, firmware ${(bare.ready || {}).firmware}${bare.error ? ': ' + bare.error.code : ''}`);
  const bareLoad = await pg.evaluate((p) => window.harness.load(p, 'bare test'), PRG);
  check(bareLoad.ok, 'the program loads on the bare machine');
  const bareRan = await until(async () => { const v = await pg.evaluate(() => window.harness.request('peek', { addr: 0x0400 })); return v.ok && v.r.value === 1 ? v.r : null; }, 8000);
  check(!!bareRan, 'the program ran on the bare machine (screen code 1 at $0400)');
  // 10b. the two joystick ports: a program mirrors $DC01 (port 1) to $0400 and $DC00 (port 2) to $0401; a push on a
  // port pulls its line low there and nowhere else; the port set by input is the one the joystick message feeds
  const MIRROR = [0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0xa9, 0xff, 0x8d, 0x00, 0xdc, 0xad, 0x01, 0xdc, 0x8d, 0x00, 0x04, 0xad, 0x00, 0xdc, 0x8d, 0x01, 0x04, 0x4c, 0x12, 0x08];
  const mirrorLoad = await pg.evaluate((p) => window.harness.load(p, 'ports'), MIRROR);
  const ports = () => pg.evaluate(() => Promise.all([window.harness.request('peek', { addr: 0x0400 }), window.harness.request('peek', { addr: 0x0401 })]).then(([a, b]) => (a.ok && b.ok ? [a.r.value, b.r.value] : null)));
  const portsAre = (a, b) => until(async () => { const v = await ports(); return v && v[0] === a && v[1] === b ? v : null; }, 8000, 50);
  check(mirrorLoad.ok && !!(await portsAre(0xff, 0xff)), 'the mirror program runs: both ports idle read $FF');
  await pg.evaluate(() => window.harness.request('joystick', { bit: 1, down: true, port: 1 }));
  check(!!(await portsAre(0xfe, 0xff)), 'up on port 1 pulls port 1\'s line low and leaves port 2 alone');
  await pg.evaluate(() => window.harness.request('joystick', { bit: 1, down: false, port: 1 }));
  await pg.evaluate(() => window.harness.request('joystick', { bit: 8, down: true }));
  check(!!(await portsAre(0xff, 0xf7)), 'right with no port named goes to port 2, the default');
  await pg.evaluate(() => window.harness.request('joystick', { bit: 8, down: false }));
  const inputOne = await pg.evaluate(() => window.harness.request('input', { mode: 'joystick', port: 1 }));
  await pg.evaluate(() => window.harness.request('joystick', { bit: 16, down: true }));
  check(inputOne.ok && inputOne.r.port === 1 && !!(await portsAre(0xef, 0xff)), `input names port 1 and fire with no port named goes there (${inputOne.ok ? 'port ' + inputOne.r.port : inputOne.code})`);
  await pg.evaluate(() => window.harness.request('joystick', { bit: 16, down: false }));
  await pg.evaluate(() => window.harness.request('joystick', { bit: 2, down: true, port: 0 }));
  check(!!(await portsAre(0xfd, 0xfd)), 'down on port 0 pulls the line low on both ports at once');
  await pg.evaluate(() => window.harness.request('joystick', { bit: 2, down: false, port: 0 }));
  check(!!(await portsAre(0xff, 0xff)), 'and releases both');
  const badPort = await pg.evaluate(() => window.harness.request('input', { mode: 'joystick', port: 3 }));
  const badPort2 = await pg.evaluate(() => window.harness.request('joystick', { bit: 1, down: true, port: 3 }));
  const stPort = await pg.evaluate(() => window.harness.request('state'));
  check(!badPort.ok && badPort.code === 'BAD_MESSAGE' && !badPort2.ok && badPort2.code === 'BAD_MESSAGE' && stPort.ok && stPort.r.port === 1, `a port other than 0, 1 or 2 is refused, and state says the port (${stPort.ok ? stPort.r.port : stPort.code})`);
  // 10c. a cartridge on the bare machine: the machine's own handshake boots it (C, R, T at $0400), it stays in the port
  // (a PRG after it refused, reset keeps it, state says so), and what the reader would trap on is refused before it is asked
  const eight = Array.from(makeCRT({ type: 0, chips: [{ bank: 0, load: 0x8000, size: 0x2000, data: PROBE }] }));
  const eightK = await pg.evaluate((p) => window.harness.load(p, 'eight', 'crt'), eight);
  check(!eightK.ok && eightK.code === 'CRT_8K_NORMAL', `an 8K Normal cartridge is refused before the emulator is asked: ${eightK.code}`);
  const cart = await pg.evaluate((p) => window.harness.load(p, 'probe', 'crt'), Array.from(probe16K()));
  check(cart.ok && cart.r.cartridge && cart.r.cartridge.name === 'Normal' && cart.r.cartridge.chips === 1 && cart.r.cartridge.size === 16384 && cart.r.load === null, `a 16K Normal cartridge loads: ${cart.ok ? JSON.stringify(cart.r.cartridge) : cart.code}`);
  const booted = await until(async () => { const v = await pg.evaluate(() => Promise.all([0x0400, 0x0401, 0x0402].map((a) => window.harness.request('peek', { addr: a })))); return v.every((x) => x.ok) && v.map((x) => x.r.value).join() === '3,18,20' ? v : null; }, 8000, 100);
  check(!!booted, 'the cartridge booted on the bare machine through its own handshake (C, R, T at $0400)');
  const afterCart = await pg.evaluate((p) => window.harness.load(p, 'after the cartridge'), PRG);
  const stCart = await pg.evaluate(() => window.harness.request('state'));
  check(!afterCart.ok && afterCart.code === 'CARTRIDGE_IN_PORT' && stCart.ok && stCart.r.cartridge === true && stCart.r.program && stCart.r.program.cartridge && stCart.r.program.cartridge.name === 'Normal', `a program after a cartridge is refused ${afterCart.code}; state says the cartridge is in`);
  const resetCart = await pg.evaluate(() => window.harness.request('reset'));
  const stReset = await pg.evaluate(() => window.harness.request('state'));
  check(resetCart.ok && stReset.ok && stReset.r.program && stReset.r.program.label === 'probe', 'reset keeps the cartridge in the port and NOW PLAYING it');
  await pg.screenshot({ path: join(EVIDENCE, 'embedded-bare.png') });
  await pg.evaluate(() => window.harness.destroy());

  // the two probes in 9b throw on purpose inside the frame; those lines are the proof, and the only page errors allowed
  const probeErrors = pageErrors.filter((t) => /Failed to connect to MetaMask|a fault inside the emulator/.test(t));
  const otherPageErrors = pageErrors.filter((t) => !probeErrors.includes(t));
  check(probeErrors.length >= 1, `the probes threw inside the frame (${probeErrors.length} line(s))`);
  check(otherPageErrors.length === 0, `no other page errors (${otherPageErrors.length})${otherPageErrors.length ? ': ' + otherPageErrors.join(' | ') : ''}`);
  // The probe in step 2 makes the browser log the policy's refusal; that line is the proof, and it is the only error allowed.
  const probeLines = consoleErrors.filter((t) => /MANIFEST\.json/.test(t) && /Content Security Policy/.test(t));
  const otherErrors = consoleErrors.filter((t) => !probeLines.includes(t));
  check(probeLines.length >= 1, `the policy logged its refusal of the probe (${probeLines.length} line(s))`);
  check(otherErrors.length === 0, `no other console errors (${otherErrors.length})${otherErrors.length ? ': ' + otherErrors.join(' | ').slice(0, 400) : ''}`);
  await pg.close();

  // 11. a document that cannot hash refuses to run (crypto.subtle removed inside the frame only)
  const nh = await b.newPage({ viewport: { width: 900, height: 700 } });
  await nh.addInitScript(() => {
    if (window !== window.top) Object.defineProperty(Crypto.prototype, 'subtle', { get() { return undefined; } });
  });
  await nh.goto(`${BASE}/machine/test/harness.html`, { waitUntil: 'load' });
  const noHash = await nh.evaluate(() => window.harness.boot({ firmware: true }));
  check(noHash.error && noHash.error.code === 'HASH_UNAVAILABLE', `without SHA-256 in the frame: ${noHash.error ? noHash.error.code : 'booted'}`);
  const noHashState = await nh.evaluate(() => window.harness.request('screen'));
  check(!noHashState.ok && noHashState.code === 'NOT_READY', `and nothing runs: ${noHashState.code}`);
  await nh.close();

  // 12. the standalone build reads the stand-in chain itself
  const sp = await b.newPage({ viewport: { width: 768, height: 544 } });
  const spErrors = [];
  sp.on('pageerror', (e) => spErrors.push(String(e)));
  await sp.goto(`${BASE}/machine/standalone.html?rpc=${encodeURIComponent(BASE + '/rpc')}`, { waitUntil: 'load' });
  await sp.waitForFunction(() => window.READY64 && (window.READY64.state.phase === 'running' || window.READY64.state.phase === 'failed'), null, { timeout: 60000 });
  const sst = await sp.evaluate(() => ({ phase: READY64.state.phase, error: READY64.state.error, build: READY64.state.build, fw: READY64.state.firmware, fetched: READY64.state.fetched, emu: READY64.state.emulatorStatus }));
  const spPolicy = await sp.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  check(spPolicy === false, 'the standalone carries no policy (it reads the chain)');
  check(sst.phase === 'running' && sst.build === 'standalone', `standalone running (${sst.fetched} bytes read)${sst.error ? ': ' + sst.error : ''}`);
  check(sst.fw && sst.fw.romset.toLowerCase() === ROMSET, 'standalone found the ROM set through the release root');
  check(sst.emu === 'PINNED' && sst.fw && sst.fw.status === 'CONTRACT-CONSISTENT', `standalone statuses: emulator ${sst.emu}, firmware ${sst.fw && sst.fw.status}`);
  const sReady = await until(async () => { const t = await sp.evaluate(() => READY64.screenText()); return /READY\./.test(t) ? t : null; }, 15000);
  check(!!sReady, 'standalone reaches READY');
  await sp.screenshot({ path: join(EVIDENCE, 'standalone-ready.png') });
  check(spErrors.length === 0, `standalone: no page errors (${spErrors.length})`);
  await sp.close();
} finally {
  await b.close();
  server.close();
}
results.failures = failures;
await writeFile(join(EVIDENCE, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
