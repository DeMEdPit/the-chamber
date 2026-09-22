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

export class Node {
  constructor(endpoints, chainId = 1, onStatus = () => {}) {
    this.endpoints = endpoints.slice();
    this.chainId = chainId;
    this.url = null;
    this.onStatus = onStatus;
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
  /** Find the node of the session: the first endpoint that answers for the chain. */
  async open() {
    if (this.url) return this.url;
    const errors = [];
    for (const url of this.endpoints) {
      try {
        const cid = parseInt(await this._post(url, 'eth_chainId', []), 16);
        if (cid !== this.chainId) { errors.push(`${url}: chain ${cid}`); continue; }
        this.url = url;
        this.onStatus(`node: ${url.replace(/^https?:\/\//, '')}`);
        return url;
      } catch (e) { errors.push(`${url}: ${e.message}`); }
    }
    throw new MachineError('RPC_UNAVAILABLE', 'no endpoint answered: ' + errors.join('; '));
  }
  async call(method, params) {
    await this.open();
    try { return await this._post(this.url, method, params); }
    catch (e) {
      // one failover: the next endpoint that answers; the provenance names the node that served the read
      const rest = this.endpoints.filter((u) => u !== this.url);
      for (const url of rest) {
        try { const r = await this._post(url, method, params); this.url = url; this.onStatus(`node: ${url.replace(/^https?:\/\//, '')} (after ${e.message})`); return r; }
        catch (e2) { /* next */ }
      }
      throw new MachineError('RPC_UNAVAILABLE', `${method}: ${e.message}, and no other endpoint answered`);
    }
  }
  blockNumber() { return this.call('eth_blockNumber', []).then((h) => parseInt(h, 16)); }
  blockHash(n) { return this.call('eth_getBlockByNumber', ['0x' + n.toString(16), false]).then((b) => b.hash.slice(2)); }
  code(addr) { return this.call('eth_getCode', [addr, 'latest']).then(fromHex); }
  ethCall(to, data, block = 'latest') { return this.call('eth_call', [{ to, data }, typeof block === 'number' ? '0x' + block.toString(16) : block]); }
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
  const parts = [];
  for (let i = 0; i < PINS.emulator.length; i++) {
    const pin = PINS.emulator[i];
    onStatus(`reading the machine from ethereum, ${i + 1} of ${PINS.emulator.length}`);
    const code = await node.code(pin.address);
    if (code.length < 2 || code[0] !== 0) throw new MachineError('NOT_A_DATA_CONTRACT', `${pin.address} is not a data contract`);
    const payload = code.slice(1);
    const h = await sha256Hex(payload);
    if (h !== pin.sha256) throw new MachineError('HASH_MISMATCH', `${pin.file}: the chain's bytes hash to ${short(h)}, the pin is ${short(pin.sha256)}`);
    parts.push(payload.buffer);
  }
  return { parts, roms: null, status: STATUS.PINNED, source: `ethereum, through ${node.url.replace(/^https?:\/\//, '')}` };
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
  const facts = { work: work.key, workName: work.name, contract: work.address, token: tokenId, node: node.url ? node.url.replace(/^https?:\/\//, '') : null, reads: [] };
  const statuses = {};
  let bytes, label;
  if (kind === 'stamped') {
    const row = work.rows.find((r) => r.id === tokenId);
    if (!row) throw new MachineError('NO_SUCH_TOKEN', `${work.name} has no token ${tokenId}`);
    onStatus(`asking the node for the block`);
    const n = await node.blockNumber();
    onStatus(`reading ${work.name} token ${tokenId} at block ${n.toLocaleString()}`);
    const p = decBytes(await node.ethCall(work.address, encCall('prg(uint256)', tokenId), n));
    facts.reads.push(`prg(${tokenId}) at block ${n}`);
    const off = work.program.stamp.offset;
    onStatus('checking the program against its pin');
    const outside = await sha256Hex(zeroWindow(p, off, 42));
    if (p.length !== work.program.bytes || outside !== work.program.stamp.sha256WindowZeroed) {
      throw new MachineError('HASH_MISMATCH', `the program outside its stamp hashes to ${short(outside)}, the pin is ${short(work.program.stamp.sha256WindowZeroed)}`);
    }
    statuses.program = STATUS.PINNED;
    onStatus('checking the stamp against the row and the block');
    const prevHash = await node.blockHash(n - 1);
    facts.reads.push(`block ${n - 1}'s hash`);
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
    onStatus(`asking the node for the head of ${work.name} token ${tokenId}`);
    const head = decUint(await node.ethCall(work.address, encCall('head(uint256)', tokenId)));
    facts.reads.push(`head(${tokenId}) = ${head}`);
    statuses.head = STATUS.NODE_REPORTED;
    onStatus(`reading the program with the head mind, revision ${head}`);
    const p = decBytes(await node.ethCall(work.address, encCall('prgWithBrain(uint256)', tokenId)));
    facts.reads.push(`prgWithBrain(${tokenId})`);
    const off = work.program.slot.offset;
    onStatus('checking the program against its pin');
    const outside = await sha256Hex(zeroWindow(p, off, 834));
    if (p.length !== work.program.bytes || outside !== work.program.slot.sha256WindowZeroed) {
      throw new MachineError('HASH_MISMATCH', `the program outside its slot hashes to ${short(outside)}, the pin is ${short(work.program.slot.sha256WindowZeroed)}`);
    }
    statuses.program = STATUS.PINNED;
    onStatus(`checking the mind against revision ${head}'s record`);
    const rec = decWords(await node.ethCall(work.address, encCall('revision(uint256,uint32)', tokenId, head)));
    facts.reads.push(`revision(${tokenId}, ${head})`);
    const canonical = hex(rec[7]);
    const slotHash = await sha256Hex(p.subarray(off, off + 834));
    if (slotHash !== canonical) throw new MachineError('HASH_MISMATCH', `the mind in the program hashes to ${short(slotHash)}, the record says ${short(canonical)}`);
    statuses.mind = STATUS.CONTRACT_CONSISTENT;
    Object.assign(facts, { head, canonicalHash: canonical, brainBlob: '0x' + hex(rec[0].subarray(12)), sha256: await sha256Hex(p),
      pins: { sha256WindowZeroed: work.program.slot.sha256WindowZeroed, frozenSha256: work.program.sha256 } });
    bytes = p;
    label = `${work.name} · ${tokenId} · revision ${head}`;
  } else if (kind === 'whole') {
    onStatus(`reading ${work.name}`);
    const p = decBytes(await node.ethCall(work.address, encCall('prg()')));
    facts.reads.push('prg()');
    onStatus('checking the program against its pin');
    const k = keccakHex(p);
    if (k !== work.program.keccak256) throw new MachineError('HASH_MISMATCH', `the program hashes to ${short(k)}, the pin is ${short(work.program.keccak256)}`);
    statuses.program = STATUS.PINNED;
    Object.assign(facts, { keccak256: k, sha256: await sha256Hex(p), pins: { keccak256: work.program.keccak256 } });
    bytes = p;
    label = work.name;
  } else {
    throw new MachineError('KIND_UNSUPPORTED', `this page does not know programs of kind ${kind}`);
  }
  return { bytes, work: work.key, token: tokenId, label, kind, statuses, facts, source: 'ethereum' };
}
