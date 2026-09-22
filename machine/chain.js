// SPDX-License-Identifier: MIT
// The page's reads from Ethereum, and what each one is allowed to claim.
//
// One shared endpoint list (the catalogue's), tried in order; the first that
// answers for the catalogue's chain is the node of the session, and every
// provenance line names it. A program comes back as one record whatever its
// kind: the bytes, the work and token, the statuses of the vocabulary
// (PINNED where the bytes matched a commitment this catalogue held before
// asking; CONTRACT-CONSISTENT where they matched what the same node
// reported in the same session; NODE-REPORTED for a dynamic fact), and the
// facts a provenance line needs. A mismatch is a refusal with a code, never
// a program that runs.
import { keccak256, keccakHex, selector, hex, fromHex } from './keccak.js';
import { PINS, STATUS, MachineError, sha256Hex } from './bridge-client.js';

/**
 * The codes that set an endpoint aside for the visit: a contradiction of
 * something the page knew before it asked (a pin, the chain, a contract's own
 * invariant, a well-formed return). A timeout or a transient failure is not
 * one of these: it moves the read to another endpoint and demotes this one to
 * the end of the order, without a verdict on its honesty.
 */
export const QUARANTINE = new Set(['HASH_MISMATCH', 'NOT_A_DATA_CONTRACT', 'STAMP_INCONSISTENT', 'WRONG_CHAIN', 'BAD_RETURN']);
const hostOf = (url) => String(url).replace(/^https?:\/\//, '');

/**
 * One session: one endpoint, one block, that block's hash. Every read of one
 * logical observation goes through the same session, so the provenance can
 * name the node and the block that served all of it. A read that fails in
 * transport throws a MachineError marked `transport`, which the observation
 * treats as "try elsewhere", never as a verdict on the node.
 */
export class Session {
  constructor(node, url, block, blockHash) { this.node = node; this.url = url; this.block = block; this.blockHash = blockHash; }
  get host() { return hostOf(this.url); }
  get tag() { return '0x' + this.block.toString(16); }
  async call(method, params) {
    try { return await this.node._post(this.url, method, params); }
    catch (e) { const err = new MachineError('RPC_UNAVAILABLE', `${method} through ${this.host}: ${e.message}`); err.transport = true; throw err; }
  }
  /** The hash of block n, from this session's node. */
  async hashOf(n) {
    const b = await this.call('eth_getBlockByNumber', ['0x' + n.toString(16), false]);
    if (!b || typeof b.hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(b.hash)) throw new MachineError('BAD_RETURN', `block ${n} came back without a hash`);
    return b.hash.slice(2).toLowerCase();
  }
  /** A contract's code at this session's block. */
  code(addr) { return this.call('eth_getCode', [addr, this.tag]).then(fromHex); }
  /** A view call at this session's block. */
  ethCall(to, data) { return this.call('eth_call', [{ to, data }, this.tag]); }
  facts() { return { node: this.host, block: this.block, blockHash: this.blockHash }; }
}

export class Node {
  constructor(endpoints, chainId = 1, onStatus = () => {}) {
    this.endpoints = endpoints.slice();
    this.chainId = chainId;
    this.onStatus = onStatus;
    this.url = null;                 // the endpoint of the last session, for display
    this.quarantined = new Map();    // endpoint -> why it was set aside for this visit
    this.demoted = new Set();        // endpoints that failed in transport: tried last, not judged
    this._id = 0;
  }
  async _post(url, method, params) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this._id, method, params }) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'rpc error');
    if (j.result === undefined || j.result === null) throw new Error('empty result');
    return j.result;
  }
  /** The endpoints still in play, the demoted ones last. */
  get order() {
    const live = this.endpoints.filter((u) => !this.quarantined.has(u));
    return live.filter((u) => !this.demoted.has(u)).concat(live.filter((u) => this.demoted.has(u)));
  }
  quarantine(url, why) {
    if (!url || this.quarantined.has(url)) return;
    this.quarantined.set(url, why);
    if (this.url === url) this.url = null;
    this.onStatus(`node: ${hostOf(url)} set aside for this visit: ${why}`);
  }
  demote(url, why) {
    if (!url) return;
    this.demoted.add(url);
    if (this.url === url) this.url = null;
    this.onStatus(`node: ${hostOf(url)} did not answer (${why}); the next endpoint`);
  }
  /** The record of the visit's nodes, for the provenance. */
  facts() { return { setAside: [...this.quarantined].map(([u, why]) => ({ node: hostOf(u), why })), demoted: [...this.demoted].map(hostOf) }; }
  /**
   * Open a session: the first endpoint in the order that answers for the
   * chain, at its latest block, with that block's hash. An endpoint that
   * answers for another chain is set aside; one that does not answer is
   * demoted.
   */
  async session() {
    const errors = [];
    if (!this.order.length) {
      throw new MachineError('RPC_UNAVAILABLE', this.quarantined.size ? 'every endpoint has been set aside for this visit' : 'no endpoints');
    }
    for (const url of this.order) {
      try {
        const cid = parseInt(await this._post(url, 'eth_chainId', []), 16);
        if (cid !== this.chainId) { this.quarantine(url, `WRONG_CHAIN: answers for chain ${cid}, not ${this.chainId}`); errors.push(`${hostOf(url)}: chain ${cid}`); continue; }
        const block = parseInt(await this._post(url, 'eth_blockNumber', []), 16);
        if (!Number.isInteger(block) || block < 1) throw new Error('no block number');
        const b = await this._post(url, 'eth_getBlockByNumber', ['0x' + block.toString(16), false]);
        if (!b || typeof b.hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(b.hash)) throw new Error('no block hash');
        this.url = url;
        this.onStatus(`node: ${hostOf(url)} · block ${block.toLocaleString('en-US')}`);
        return new Session(this, url, block, b.hash.slice(2).toLowerCase());
      } catch (e) { errors.push(`${hostOf(url)}: ${e.message}`); this.demote(url, e.message); }
    }
    throw new MachineError('RPC_UNAVAILABLE', 'no endpoint answered: ' + errors.join('; '));
  }
  /**
   * One observation: fn(session), every read of it through one endpoint at
   * one block. A transport failure inside restarts the whole observation on
   * the next endpoint, the failing one demoted. A contradiction (a
   * QUARANTINE code) sets the endpoint aside for the visit and restarts too;
   * when no endpoint is left, the last contradiction is what is thrown, so a
   * refusal stays a refusal and does not become "no node".
   */
  async observe(fn) {
    let contradiction = null;
    for (let attempt = 0; attempt <= this.endpoints.length; attempt++) {
      let s;
      try { s = await this.session(); }
      catch (e) {
        if (contradiction) { contradiction.message += '; every endpoint that answered was set aside for this visit'; throw contradiction; }
        throw e;
      }
      try { return await fn(s); }
      catch (e) {
        if (e && e.transport) { this.demote(s.url, e.message); continue; }
        if (e instanceof MachineError && QUARANTINE.has(e.code)) { e.node = s.host; this.quarantine(s.url, `${e.code}: ${e.message}`); contradiction = e; continue; }
        throw e;
      }
    }
    if (contradiction) { contradiction.message += '; every endpoint that answered was set aside for this visit'; throw contradiction; }
    throw new MachineError('RPC_UNAVAILABLE', 'no endpoint completed the read');
  }
}

// ------------------------------------------------------------------ ABI, the little that is needed
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
export const encCall = (sig, ...args) => selector(sig) + args.map(word).join('');
export function decBytes(ret) {
  const b = fromHex(ret);
  const view = new DataView(b.buffer);
  const off = Number(view.getBigUint64(24, false));
  const n = Number(new DataView(b.buffer, off).getBigUint64(24, false));
  return b.subarray(off + 32, off + 32 + n);
}
export const decWords = (ret) => { const b = fromHex(ret); const out = []; for (let i = 0; i + 32 <= b.length; i += 32) out.push(b.subarray(i, i + 32)); return out; };
export const decUint = (ret, i = 0) => Number(BigInt('0x' + hex(decWords(ret)[i])));
export const decAddr = (ret, i = 0) => '0x' + hex(decWords(ret)[i].subarray(12));
export const decBytes32 = (ret, i = 0) => hex(decWords(ret)[i]);

// ------------------------------------------------------------------ the Chamber's stamp, as the contract does it
export function chamberSeed(blockHashHex, tokenId, row) {
  const s = keccak256(new Uint8Array([...fromHex(blockHashHex), ...fromHex(word(tokenId))]));
  if (row.behaviour === 7) return s;
  s[31] = (s[31] & 0xF8) | row.wall;
  s[30] = (s[30] & 0xFC) | row.candle;
  let v = row.bats;
  if (row.bats === 1) v = ((s[27] >> 4) & 1) === 0 ? 1 : 3;
  s[27] = (s[27] & 0xF0) | v;
  return s;
}
export function zeroWindow(bytes, off, n) { const p = new Uint8Array(bytes); p.fill(0, off, off + n); return p; }
const short = (h) => (h || '').slice(0, 12) + '…';

// ------------------------------------------------------------------ the machine's bytes: the chain first, the site's copies after
/** The four parts from the chain, held to the pins in bridge-client.js. */
export async function machineFromChain(node, onStatus = () => {}) {
  return node.observe(async (s) => {
    const parts = [];
    for (let i = 0; i < PINS.emulator.length; i++) {
      const pin = PINS.emulator[i];
      onStatus(`reading the machine from ethereum, ${i + 1} of ${PINS.emulator.length}`);
      const code = await s.code(pin.address);
      if (code.length < 2 || code[0] !== 0) throw new MachineError('NOT_A_DATA_CONTRACT', `${pin.address} is not a data contract`);
      const payload = code.slice(1);
      const h = await sha256Hex(payload);
      if (h !== pin.sha256) throw new MachineError('HASH_MISMATCH', `${pin.file}: the chain's bytes hash to ${short(h)}, the pin is ${short(pin.sha256)}`);
      parts.push(payload.buffer);
    }
    return { parts, roms: null, status: STATUS.PINNED, source: `ethereum, through ${s.host}`, observation: s.facts() };
  });
}

/**
 * Read the firmware, OpenROMs pressing 1, from the chain: the three ROM blobs
 * at the addresses pinned in bridge-client.js, each held to its pinned hash,
 * so the statement is PINNED, a commitment held before the node was asked.
 * The ROM set's own stated hashes are not consulted: the pin is the stronger
 * claim, and the standalone document is where the contract's word is read.
 */
export async function firmwareFromChain(node, onStatus = () => {}) {
  return node.observe(async (s) => {
    const roms = {};
    const names = ['kernal', 'basic', 'chargen'];
    for (let i = 0; i < names.length; i++) {
      const pin = PINS.firmware[names[i]];
      onStatus(`reading the firmware from ethereum, ${i + 1} of ${names.length}`);
      const code = await s.code(pin.address);
      if (code.length < 2 || code[0] !== 0) throw new MachineError('NOT_A_DATA_CONTRACT', `${pin.address} is not a data contract`);
      const payload = code.slice(1);
      const h = await sha256Hex(payload);
      if (h !== pin.sha256) throw new MachineError('HASH_MISMATCH', `${pin.file}: the chain's bytes hash to ${short(h)}, the pin is ${short(pin.sha256)}`);
      roms[names[i]] = payload.buffer;
    }
    return { roms, status: STATUS.PINNED, source: `ethereum, through ${s.host}`, observation: s.facts() };
  });
}

// ------------------------------------------------------------------ programs: one record whatever the source
/**
 * Read a program of the catalogue from the chain and hold it to its pins.
 * Returns {bytes, work, token, label, kind, statuses, facts} or throws a MachineError with a code.
 */
export async function programFromChain(node, catalogue, workKey, tokenId, onStatus = () => {}) {
  const work = catalogue.works.find((w) => w.key === workKey);
  if (!work) throw new MachineError('NO_SUCH_WORK', `the catalogue has no work ${workKey}`);
  const kind = work.program.kind;
  if (!['stamped', 'slotted', 'whole'].includes(kind)) throw new MachineError('KIND_UNSUPPORTED', `this page does not know programs of kind ${kind}`);
  const row = kind === 'stamped' ? work.rows.find((r) => r.id === tokenId) : null;
  if (kind === 'stamped' && !row) throw new MachineError('NO_SUCH_TOKEN', `${work.name} has no token ${tokenId}`);
  // a malformed return is the node's, not the page's: a BAD_RETURN sets it aside
  const decode = (what, f) => { try { return f(); } catch (e) { throw new MachineError('BAD_RETURN', `${what}: ${e.message}`); } };
  return node.observe(async (s) => {
    const facts = { work: work.key, workName: work.name, contract: work.address, token: tokenId, node: s.host, observation: s.facts(), reads: [] };
    const statuses = {};
    let bytes, label;
    if (kind === 'stamped') {
      const n = s.block;
      onStatus(`reading ${work.name} token ${tokenId} at block ${n.toLocaleString('en-US')}`);
      const pRaw = await s.ethCall(work.address, encCall('prg(uint256)', tokenId));
      const p = decode('prg', () => decBytes(pRaw));
      facts.reads.push(`prg(${tokenId}) at block ${n}`);
      const off = work.program.stamp.offset;
      onStatus('checking the program against its pin');
      const outside = await sha256Hex(zeroWindow(p, off, 42));
      if (p.length !== work.program.bytes || outside !== work.program.stamp.sha256WindowZeroed) {
        throw new MachineError('HASH_MISMATCH', `the program outside its stamp hashes to ${short(outside)}, the pin is ${short(work.program.stamp.sha256WindowZeroed)}`);
      }
      statuses.program = STATUS.PINNED;
      onStatus('checking the stamp against the row and the block');
      const prevHash = await s.hashOf(n - 1);
      facts.reads.push(`block ${n - 1}'s hash, through the same node`);
      const st = p.subarray(off, off + 42);
      const digits = Array.from(st.subarray(32, 40)).join('');
      const wantDigits = String((n - 1) % 100000000).padStart(8, '0');
      const seed = hex(st.subarray(0, 32));
      const wantSeed = hex(chamberSeed(prevHash, tokenId, row));
      if (digits !== wantDigits || st[40] !== row.behaviour || st[41] !== row.colour || seed !== wantSeed) {
        throw new MachineError('STAMP_INCONSISTENT', `the stamp says digits ${digits}, behaviour ${st[40]}, colour ${st[41]}, seed ${short(seed)}; the row and block ${n - 1} say ${wantDigits}, ${row.behaviour}, ${row.colour}, ${short(wantSeed)}`);
      }
      statuses.stamp = STATUS.CONTRACT_CONSISTENT;
      Object.assign(facts, { block: n, stampedAt: n - 1, prevHash, seed, digits, row, sha256: await sha256Hex(p),
        pins: { sha256WindowZeroed: work.program.stamp.sha256WindowZeroed, baseKeccak256: work.program.base.keccak256 } });
      bytes = p;
      label = `${work.name} · ${tokenId} · ${row.character}`;
    } else if (kind === 'slotted') {
      onStatus(`asking the node for the head of ${work.name} token ${tokenId}, at block ${s.block.toLocaleString('en-US')}`);
      const headRaw = await s.ethCall(work.address, encCall('head(uint256)', tokenId));
      const head = decode('head', () => decUint(headRaw));
      facts.reads.push(`head(${tokenId}) = ${head} at block ${s.block}`);
      statuses.head = STATUS.NODE_REPORTED;
      onStatus(`reading the program with the head mind, revision ${head}`);
      const pRaw = await s.ethCall(work.address, encCall('prgWithBrain(uint256)', tokenId));
      const p = decode('prgWithBrain', () => decBytes(pRaw));
      facts.reads.push(`prgWithBrain(${tokenId}) at block ${s.block}`);
      const off = work.program.slot.offset;
      onStatus('checking the program against its pin');
      const outside = await sha256Hex(zeroWindow(p, off, 834));
      if (p.length !== work.program.bytes || outside !== work.program.slot.sha256WindowZeroed) {
        throw new MachineError('HASH_MISMATCH', `the program outside its slot hashes to ${short(outside)}, the pin is ${short(work.program.slot.sha256WindowZeroed)}`);
      }
      statuses.program = STATUS.PINNED;
      onStatus(`checking the mind against revision ${head}'s record`);
      const recRaw = await s.ethCall(work.address, encCall('revision(uint256,uint32)', tokenId, head));
      const rec = decode('revision', () => decWords(recRaw));
      facts.reads.push(`revision(${tokenId}, ${head}) at block ${s.block}`);
      if (rec.length < 8) throw new MachineError('BAD_RETURN', `revision(${tokenId}, ${head}) came back with ${rec.length} words`);
      const canonical = hex(rec[7]);
      const slotHash = await sha256Hex(p.subarray(off, off + 834));
      // the same block served the mind and its record; a disagreement is the node's, so it sets the node aside
      if (slotHash !== canonical) throw new MachineError('HASH_MISMATCH', `the mind in the program hashes to ${short(slotHash)}, the record at the same block says ${short(canonical)}`);
      statuses.mind = STATUS.CONTRACT_CONSISTENT;
      Object.assign(facts, { head, canonicalHash: canonical, brainBlob: '0x' + hex(rec[0].subarray(12)), sha256: await sha256Hex(p),
        pins: { sha256WindowZeroed: work.program.slot.sha256WindowZeroed, frozenSha256: work.program.sha256 } });
      bytes = p;
      label = `${work.name} · ${tokenId} · revision ${head}`;
    } else {
      onStatus(`reading ${work.name} at block ${s.block.toLocaleString('en-US')}`);
      const pRaw = await s.ethCall(work.address, encCall('prg()'));
      const p = decode('prg', () => decBytes(pRaw));
      facts.reads.push(`prg() at block ${s.block}`);
      onStatus('checking the program against its pin');
      const k = keccakHex(p);
      if (k !== work.program.keccak256) throw new MachineError('HASH_MISMATCH', `the program hashes to ${short(k)}, the pin is ${short(work.program.keccak256)}`);
      statuses.program = STATUS.PINNED;
      Object.assign(facts, { keccak256: k, sha256: await sha256Hex(p), pins: { keccak256: work.program.keccak256 } });
      bytes = p;
      label = work.name;
    }
    return { bytes, work: work.key, token: tokenId, label, kind, statuses, facts, source: 'ethereum' };
  });
}
