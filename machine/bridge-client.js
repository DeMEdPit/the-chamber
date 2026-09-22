// SPDX-License-Identifier: MIT
// The host's side of the bridge (machine/PROTOCOL.md, version 1).
//
// A host page creates the machine document in a frame sandboxed to scripts
// only, transfers one MessagePort into it, and from then on speaks to it by
// request and reply on that port. This module is that conversation: request
// ids, one timeout per request, a disposable frame, and the site's own
// copies of the machine's bytes fetched and proven against their manifest
// before they are handed over. It never touches the machine's DOM, and the
// machine cannot touch the host's. No dependencies.
//
//   import { createMachine, bootFromSite } from './bridge-client.js';
//   const m = createMachine({ container, onEvent: (e) => console.log(e) });
//   const hello = await m.hello;                 // capabilities, protocol
//   const ready = await bootFromSite(m);         // PINNED bytes from the site
//   await m.request('load', { kind: 'prg', bytes }, { transfer: [bytes] });
//   const { text } = await m.request('screen');
//   m.destroy();                                 // a crash or a hang: rebuild, never recover

export const PROTOCOL = 1;

// The trust vocabulary, frozen (docs/site-machine-study.md §10.1). Every
// program and every byte the page runs or shows carries exactly one of the
// first four; the fifth is reserved and, when used, always names the
// proposition proved and the verifier. "Verified" never means more than the
// mechanism establishes.
export const STATUS = Object.freeze({
  PINNED: 'PINNED',                         // the bytes match a commitment the page knew before it asked
  CONTRACT_CONSISTENT: 'CONTRACT-CONSISTENT', // the bytes match a commitment the same node reported in the same session
  NODE_REPORTED: 'NODE-REPORTED',           // a dynamic fact one node stated, taken as stated
  YOUR_FILE: 'YOUR FILE',                   // no chain claim made
  PROOF_VERIFIED: 'PROOF-VERIFIED',         // reserved: a named proposition under a named verifier
});

export class MachineError extends Error {
  constructor(code, text) { super(text || code); this.code = code; }
}

export async function sha256Hex(buffer) {
  const d = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create the machine document in `container` and open the bridge to it.
 * Returns { frame, hello, request, destroy, alive, intervened }.
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
  let port = null, alive = true, nextId = 1, intervened = false, helloTimer = null;

  const machine = {
    frame,
    get alive() { return alive; },
    get intervened() { return intervened; },
    hello: null,
    request(type, body = {}, opts = {}) {
      if (!alive) return Promise.reject(new MachineError('FRAME_GONE', 'the machine document is gone'));
      return machine.hello.then(() => new Promise((resolve, reject) => {
        const id = nextId++;
        const msg = Object.assign({ v: PROTOCOL, type, id }, body);
        const ms = opts.timeout || timeout;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new MachineError('TIMEOUT', `no reply to ${type} within ${ms} ms`));
        }, ms);
        pending.set(id, { resolve, reject, timer, type });
        try { port.postMessage(msg, opts.transfer || []); }
        catch (e) { clearTimeout(timer); pending.delete(id); reject(new MachineError('POST_FAILED', String(e && e.message || e))); }
      }));
    },
    destroy() {
      if (!alive) return;
      alive = false;
      clearTimeout(helloTimer);
      for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new MachineError('FRAME_GONE', 'the machine document was destroyed')); }
      pending.clear();
      if (port) { try { port.close(); } catch (e) { /* closed */ } port = null; }
      frame.remove();
    },
  };

  machine.hello = new Promise((resolve, reject) => {
    helloTimer = setTimeout(() => reject(new MachineError('NO_HELLO', `the machine document did not say hello within ${helloTimeout} ms`)), helloTimeout);
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
        if (m.type === 'hello') { clearTimeout(helloTimer); resolve(m); }
        if (m.type === 'intervened') intervened = true;
        try { onEvent(m); } catch (err) { /* the host's listener, not the bridge's business */ }
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
 * The site's own copies of the machine's bytes, each proven against the
 * manifest's sha256 before it is returned. Status PINNED: the hashes were
 * known before the fetch. Cached after the first call.
 */
export async function partsFromSite(base) {
  if (siteCache) return siteCache;
  const root = base || new URL('./parts/', import.meta.url).href;
  const manifest = await (await fetch(root + 'MANIFEST.json', { cache: 'force-cache' })).json();
  if (manifest.version !== 1) throw new MachineError('MANIFEST_VERSION', `manifest version ${manifest.version}; this client knows 1`);
  const byFile = Object.fromEntries(manifest.parts.map((p) => [p.file, p]));
  async function proven(file) {
    const p = byFile[file];
    if (!p) throw new MachineError('MANIFEST_INCOMPLETE', `the manifest has no entry for ${file}`);
    const res = await fetch(root + file, { cache: 'force-cache' });
    if (!res.ok) throw new MachineError('SITE_COPY_MISSING', `${file}: http ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== p.bytes) throw new MachineError('HASH_MISMATCH', `${file}: ${buf.byteLength} bytes, the manifest says ${p.bytes}`);
    const h = await sha256Hex(buf);
    if (h !== p.sha256) throw new MachineError('HASH_MISMATCH', `${file}: sha256 ${h.slice(0, 12)}…, the manifest says ${p.sha256.slice(0, 12)}…`);
    return buf;
  }
  const parts = [];
  for (const f of manifest.emulator) parts.push(await proven(f));
  const roms = {};
  for (const [k, f] of Object.entries(manifest.firmware)) roms[k] = await proven(f);
  siteCache = { manifest, parts, roms, status: STATUS.PINNED, source: 'the site\'s copies, proven against machine/parts/MANIFEST.json' };
  return siteCache;
}

/** Hand a machine its bytes. Copies are transferred so the cache survives a rebuild. */
export function bootMachine(machine, { parts, roms }, { firmware = true, timeout = 60000 } = {}) {
  const p = parts.map((b) => b.slice(0));
  const r = firmware ? { kernal: roms.kernal.slice(0), basic: roms.basic.slice(0), chargen: roms.chargen.slice(0) } : null;
  const transfer = r ? p.concat([r.kernal, r.basic, r.chargen]) : p;
  return machine.request('machine', { parts: p, roms: r }, { transfer, timeout });
}

/** The usual boot: the site's PINNED copies into a fresh machine. */
export async function bootFromSite(machine, opts = {}) {
  const got = await partsFromSite(opts.base);
  return bootMachine(machine, got, opts);
}
