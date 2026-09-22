// SPDX-License-Identifier: MIT
// The host's side of the bridge (machine/PROTOCOL.md, version 1).
//
// A host page creates the machine document in a frame sandboxed to scripts
// only, transfers one MessagePort into it, and from then on speaks to it by
// request and reply on that port. This module is that conversation: request
// ids, one timeout per request, a frame that is destroyed and rebuilt rather
// than recovered, and the site's own copies of the machine's bytes fetched
// and held to the pins in this file before they are handed over. It never
// touches the machine's DOM, and the machine cannot touch the host's. No
// dependencies.
//
//   import { createMachine, bootFromSite } from './bridge-client.js';
//   const m = createMachine({ container, onEvent: (e) => console.log(e) });
//   const hello = await m.hello;                 // capabilities, protocol
//   const ready = await bootFromSite(m);         // PINNED bytes from the site
//   await m.request('load', { kind: 'prg', bytes }, { transfer: [bytes] });
//   const { text } = await m.request('screen');
//   m.destroy();
//
// Fail closed: the frame is destroyed, and everything pending rejected with
// FRAME_GONE, when the document does not say hello in time (NO_HELLO), when
// any request goes unanswered within its timeout (TIMEOUT), when the
// document reports an uncaught error (MACHINE_ERROR), and on destroy(). A
// hung or crashed machine is never recovered; the host makes a new one.

export const PROTOCOL = 1;

// The trust vocabulary, frozen (docs/site-machine-study.md §10.1). Every
// program and every byte the page runs or shows carries exactly one of the
// first four; the fifth is reserved and, when used, always names the
// proposition proved and the verifier. "Verified" never means more than the
// mechanism establishes.
export const STATUS = Object.freeze({
  PINNED: 'PINNED',                           // the bytes match a commitment the page knew before it asked
  CONTRACT_CONSISTENT: 'CONTRACT-CONSISTENT', // the bytes match a commitment the same node reported in the same session
  NODE_REPORTED: 'NODE-REPORTED',             // a dynamic fact one node stated, taken as stated
  YOUR_FILE: 'YOUR FILE',                     // no chain claim made
  PROOF_VERIFIED: 'PROOF-VERIFIED',           // reserved: a named proposition under a named verifier
});

// The pins: the commitments this code knew before it asked for anything.
// The sha256 of the payload (the bytes after the data contract's STOP byte)
// of each of the four emulator parts nopsta stored on Ethereum in 2022 and
// of the three ROMs of OpenROMs pressing 1, with the addresses they were
// read from. A fetched copy is PINNED because its hash is here, in code;
// the manifest beside the copies is a record and must agree with these
// (MANIFEST_DRIFT if it does not), and the site check holds the manifest,
// the machine document's own pins and these to one another.
export const PINS = Object.freeze({
  chainId: 1,
  emulator: Object.freeze([
    Object.freeze({ file: 'gzip.bin', address: '0x1Cc49e603B4b205Be0E74f8833971Bea5beccEC9',
      sha256: 'ac9c3eaaa9bbb413b9e6826e12cfc685e69819811147c09e6bd9ec749443edae' }),
    Object.freeze({ file: 'm64-0.bin', address: '0xEF13021d5302c3fCe437A3C281A286479ba60008',
      sha256: '6124c18b000acfc4e986754f58c7ce4d212d220693e0f981ad4492a6afa5fc8d' }),
    Object.freeze({ file: 'm64-1.bin', address: '0x9A463234988C0F77ca1252Fc974DfD6b50AAA6Ba',
      sha256: '94250fe97b8c4cc957e36b7527cd19f60a17d5af6024692cb4de60ba8b75047f' }),
    Object.freeze({ file: 'm64-2.bin', address: '0xf6Fb8cefFff7239d9689acDF1FBF5376C9996dA5',
      sha256: '31f2789c39cbec739bf3cb5c911498ec8097f1623bc2c052f81b36a807ff6ad2' }),
  ]),
  firmware: Object.freeze({
    root: '0xE0a71d57FB514C8f5793e26937559935350b3406',
    romset: '0x3d5891c9a4a53ce8c0fcc2246ba3a666bc2c1259',
    kernal: Object.freeze({ file: 'kernal.rom', address: '0x15c7d51a1a409bf5511935a1a099ae70c2a4337f',
      sha256: '0f760a0a2da85fdcbf7327e52d89a9687ab62a0ab29bc9b2d764db444eaf80bf' }),
    basic: Object.freeze({ file: 'basic.rom', address: '0x5f92f10ba954eecd12981efcf07623006ceaecaa',
      sha256: '5965d0d937bb4a7013a79f541382a8a77cabded869cb8a68145b977b68e5323e' }),
    chargen: Object.freeze({ file: 'chargen.rom', address: '0xa99571c3afdd229b056b9965772a27d08e4d1348',
      sha256: '5e3451466841b93df7e01e4b635b07b8d8633351bae483b1961d96b3131186e7' }),
  }),
});
const ROM_NAMES = ['kernal', 'basic', 'chargen'];

export class MachineError extends Error {
  constructor(code, text) { super(text || code); this.code = code; }
}

export async function sha256Hex(buffer) {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new MachineError('HASH_UNAVAILABLE', 'this browser cannot compute SHA-256');
  const d = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A default timeout for a request: typing takes as long as the text. */
function defaultTimeout(type, body, base) {
  if (type === 'type' && typeof body.text === 'string') {
    const lines = (body.text.match(/\n/g) || []).length;
    return 2000 + 150 * body.text.length + 500 * lines;
  }
  return base;
}

/**
 * Create the machine document in `container` and open the bridge to it.
 * Returns { frame, hello, request, destroy, alive, intervened, reason }.
 */
export function createMachine({ container, src, onEvent = () => {}, timeout = 10000, helloTimeout = 20000 } = {}) {
  if (!container) throw new MachineError('BAD_HOST', 'createMachine needs a container element');
  const url = src || new URL('./core.html', import.meta.url).href;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('title', 'READY 64');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.style.cssText = 'display:block;border:0;width:100%;height:100%;background:#000';
  const pending = new Map();
  let port = null, alive = true, nextId = 1, intervened = false, helloTimer = null, reason = null;
  let rejectHello = null;

  function die(code, text) {
    if (!alive) return;
    alive = false;
    reason = { code, text };
    clearTimeout(helloTimer);
    if (rejectHello) rejectHello(new MachineError(code, text));
    for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new MachineError('FRAME_GONE', `the machine document is gone (${code}: ${text})`)); }
    pending.clear();
    if (port) { try { port.close(); } catch (e) { /* closed */ } port = null; }
    frame.remove();
  }

  const machine = {
    frame,
    get alive() { return alive; },
    get intervened() { return intervened; },
    get reason() { return reason; },
    hello: null,
    request(type, body = {}, opts = {}) {
      if (!alive) return Promise.reject(new MachineError('FRAME_GONE', `the machine document is gone (${reason ? reason.code : 'destroyed'})`));
      return machine.hello.then(() => new Promise((resolve, reject) => {
        if (!alive) { reject(new MachineError('FRAME_GONE', 'the machine document is gone')); return; }
        const id = nextId++;
        const msg = Object.assign({ v: PROTOCOL, type, id }, body);
        const ms = opts.timeout || defaultTimeout(type, body, timeout);
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new MachineError('TIMEOUT', `no reply to ${type} within ${ms} ms; the machine is destroyed`));
          die('TIMEOUT', `no reply to ${type} within ${ms} ms`);
        }, ms);
        pending.set(id, { resolve, reject, timer, type });
        try { port.postMessage(msg, opts.transfer || []); }
        catch (e) { clearTimeout(timer); pending.delete(id); reject(new MachineError('POST_FAILED', String(e && e.message || e))); }
      }));
    },
    destroy() { die('DESTROYED', 'destroyed by the host'); },
  };

  machine.hello = new Promise((resolve, reject) => {
    rejectHello = reject;
    helloTimer = setTimeout(() => die('NO_HELLO', `the machine document did not say hello within ${helloTimeout} ms`), helloTimeout);
    frame.addEventListener('load', () => {
      if (!alive) return;
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = (e) => {
        const m = e.data;
        if (!m || m.v !== PROTOCOL || typeof m.type !== 'string') return;
        if (m.id !== undefined && pending.has(m.id)) {
          const p = pending.get(m.id);
          pending.delete(m.id);
          clearTimeout(p.timer);
          if (m.type === 'refused') p.reject(new MachineError(m.code, m.text));
          else p.resolve(m);
          return;
        }
        if (m.type === 'hello') { clearTimeout(helloTimer); rejectHello = null; resolve(m); }
        if (m.type === 'intervened') intervened = true;
        try { onEvent(m); } catch (err) { /* the host's listener, not the bridge's business */ }
        if (m.type === 'error') die('MACHINE_ERROR', m.text || 'the machine document reported an error');
      };
      // The frame's origin is opaque, so the target origin must be '*'; the
      // message carries nothing but the port, and the port is the channel.
      frame.contentWindow.postMessage({ v: PROTOCOL, type: 'port' }, '*', [channel.port2]);
    }, { once: true });
  });
  machine.hello.catch(() => {});
  frame.src = url;
  container.appendChild(frame);
  return machine;
}

let siteCache = null;

/**
 * The site's own copies of the machine's bytes, each held to the pins in
 * this file before it is returned: status PINNED, because the commitment
 * was in this code before the fetch. The manifest beside the copies is
 * read as a record and must agree with the pins. Cached after the first
 * call.
 */
export async function partsFromSite(base) {
  if (siteCache) return siteCache;
  const root = base || new URL('./parts/', import.meta.url).href;
  const res0 = await fetch(root + 'MANIFEST.json', { cache: 'force-cache' });
  if (!res0.ok) throw new MachineError('SITE_COPY_MISSING', `MANIFEST.json: http ${res0.status}`);
  const manifest = await res0.json();
  if (manifest.version !== 1) throw new MachineError('MANIFEST_VERSION', `manifest version ${manifest.version}; this client knows 1`);
  const byFile = Object.fromEntries((manifest.parts || []).map((p) => [p.file, p]));
  async function pinned(pin) {
    const rec = byFile[pin.file];
    if (!rec || rec.sha256 !== pin.sha256 || (rec.chain || {}).address.toLowerCase() !== pin.address.toLowerCase()) {
      throw new MachineError('MANIFEST_DRIFT', `${pin.file}: the manifest does not agree with the pin in bridge-client.js`);
    }
    const res = await fetch(root + pin.file, { cache: 'force-cache' });
    if (!res.ok) throw new MachineError('SITE_COPY_MISSING', `${pin.file}: http ${res.status}`);
    const buf = await res.arrayBuffer();
    const h = await sha256Hex(buf);
    if (h !== pin.sha256) throw new MachineError('HASH_MISMATCH', `${pin.file}: sha256 ${h.slice(0, 12)}…, the pin is ${pin.sha256.slice(0, 12)}…`);
    return buf;
  }
  const parts = [];
  for (const pin of PINS.emulator) parts.push(await pinned(pin));
  const roms = {};
  for (const k of ROM_NAMES) roms[k] = await pinned(PINS.firmware[k]);
  siteCache = { manifest, parts, roms, status: STATUS.PINNED, source: 'the site\'s copies, held to the pins in bridge-client.js' };
  return siteCache;
}

/**
 * Hand a machine its bytes. Copies are transferred so a cache survives a
 * rebuild. The document checks the emulator against its own pins and
 * reports the firmware's hashes without a claim; this side compares those
 * with `expect` (the pressing 1 pins unless the caller says otherwise) and
 * destroys the machine if they differ. The returned `status` is the host's
 * statement about what is running.
 */
export async function bootMachine(machine, { parts, roms }, { firmware = true, timeout = 60000, expect = PINS.firmware, status = STATUS.PINNED } = {}) {
  const p = parts.map((b) => b.slice(0));
  const r = firmware ? { kernal: roms.kernal.slice(0), basic: roms.basic.slice(0), chargen: roms.chargen.slice(0) } : null;
  const transfer = r ? p.concat([r.kernal, r.basic, r.chargen]) : p;
  const ready = await machine.request('machine', { parts: p, roms: r }, { transfer, timeout });
  if (ready.emulatorStatus !== STATUS.PINNED) {
    machine.destroy();
    throw new MachineError('UNPINNED_EMULATOR', `the machine document reports its emulator as ${ready.emulatorStatus}, not PINNED`);
  }
  if (firmware && expect) {
    for (const k of ROM_NAMES) {
      if (!ready.firmwareSha256 || ready.firmwareSha256[k] !== expect[k].sha256) {
        machine.destroy();
        throw new MachineError('HASH_MISMATCH', `${k}: the machine measured ${String((ready.firmwareSha256 || {})[k]).slice(0, 12)}…, expected ${expect[k].sha256.slice(0, 12)}…`);
      }
    }
  }
  return Object.assign({}, ready, { status: { emulator: STATUS.PINNED, firmware: firmware ? status : null } });
}

/** The usual boot: the site's PINNED copies into a fresh machine. */
export async function bootFromSite(machine, opts = {}) {
  const got = await partsFromSite(opts.base);
  return bootMachine(machine, got, opts);
}
