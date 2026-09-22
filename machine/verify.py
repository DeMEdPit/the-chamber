#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""The public verifier: every fact in the machine's catalogue, checked against Ethereum by anyone.

    python3 machine/verify.py --offline                    # the catalogue against itself and the site's copies; no network
    python3 machine/verify.py --rpc https://ethereum-rpc.publicnode.com            # against a node: a sample of tokens
    python3 machine/verify.py --rpc URL --tokens 1,55,64   # these Chamber tokens
    python3 machine/verify.py --rpc URL --all              # all sixty-four rows and programs (64 reads of 47 KB)
    python3 machine/verify.py --rpc URL --json out.json    # the findings as JSON as well

The catalogue (machine/catalogue.json) is produced by a private exporter; trust
never depends on it. This file, standard library only, is what makes every line
of it checkable: the emulator's parts and the firmware's ROMs by eth_getCode and
sha256; the release root and ROM set by eth_call; every Chamber row against
tableRow; the Chamber's base program against its pinned hashes and a token's
stamped program against the base, the row and the block it was stamped at;
Perception's frozen program against its pin and the head's slot against the
record; the two older tokens' programs against their pinned hashes; and every
selector against keccak of its signature.

Every finding carries one status of the frozen vocabulary (machine/PROTOCOL.md):
PINNED (matched a commitment this catalogue held before asking),
CONTRACT-CONSISTENT (matched a commitment the same node reported in the same
session), NODE-REPORTED (a dynamic fact, taken as stated), or FAIL with a stable
code. Exit status 1 on any FAIL. Reads are one-node and unadjudicated: what this
proves is that the node you asked agrees with the catalogue, not that the world
does. Ask two nodes if that matters to you.
"""
import argparse
import hashlib
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
CATALOGUE = HERE / "catalogue.json"
SCHEMA = "chamber-machine-catalogue"
VERSION = 1

# ------------------------------------------------------------------ keccak-256, standard library only
# keccak-f[1600] with rate 136 and the original 0x01 pad (not SHA3's 0x06, so hashlib cannot supply it).
_RC = [0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000, 0x000000000000808B,
       0x0000000080000001, 0x8000000080008081, 0x8000000000008009, 0x000000000000008A, 0x0000000000000088,
       0x0000000080008009, 0x000000008000000A, 0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
       0x8000000000008003, 0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
       0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]


def _f(A):
    M = 0xFFFFFFFFFFFFFFFF
    for rc in _RC:
        C = [A[x][0] ^ A[x][1] ^ A[x][2] ^ A[x][3] ^ A[x][4] for x in range(5)]
        D = [C[(x - 1) % 5] ^ (((C[(x + 1) % 5] << 1) | (C[(x + 1) % 5] >> 63)) & M) for x in range(5)]
        A = [[A[x][y] ^ D[x] for y in range(5)] for x in range(5)]
        B = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                r = _ROT[x][y]
                B[y][(2 * x + 3 * y) % 5] = ((A[x][y] << r) | (A[x][y] >> (64 - r))) & M if r else A[x][y]
        A = [[B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y]) for y in range(5)] for x in range(5)]
        A[0][0] ^= rc
    return A


def keccak(b):
    rate = 136
    padded = bytearray(b) + b"\x01"
    padded += b"\x00" * (-len(padded) % rate)
    padded[-1] |= 0x80
    A = [[0] * 5 for _ in range(5)]
    for off in range(0, len(padded), rate):
        for i in range(rate // 8):
            A[i % 5][i // 5] ^= int.from_bytes(padded[off + 8 * i:off + 8 * i + 8], "little")
        A = _f(A)
    return b"".join(A[i % 5][i // 5].to_bytes(8, "little") for i in range(4))


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def selector(sig):
    return "0x" + keccak(sig.encode()).hex()[:8]


# ------------------------------------------------------------------ ABI, the little that is needed
def word(n):
    return n.to_bytes(32, "big")


def enc_call(sig, *args):
    """Selector plus static uint256 arguments (ids and revision indexes)."""
    return selector(sig) + b"".join(word(int(a)) for a in args).hex()


def enc_call_bytes(sig, data):
    """Selector plus one dynamic bytes argument."""
    head = word(32)
    body = word(len(data)) + data + b"\x00" * (-len(data) % 32)
    return selector(sig) + (head + body).hex()


def dec_words(ret):
    b = bytes.fromhex(ret[2:] if ret.startswith("0x") else ret)
    return [b[i:i + 32] for i in range(0, len(b) - len(b) % 32, 32)]


def dec_uint(ret, i=0):
    return int.from_bytes(dec_words(ret)[i], "big")


def dec_addr(ret, i=0):
    return "0x" + dec_words(ret)[i][12:].hex()


def dec_bytes32(ret, i=0):
    return dec_words(ret)[i].hex()


def dec_bytes(ret):
    b = bytes.fromhex(ret[2:] if ret.startswith("0x") else ret)
    off = int.from_bytes(b[0:32], "big")
    n = int.from_bytes(b[off:off + 32], "big")
    return b[off + 32:off + 32 + n]


def same(a, b):
    return a.lower() == b.lower()


# ------------------------------------------------------------------ the node
class RpcError(Exception):
    pass


class Rpc:
    def __init__(self, url, timeout=60):
        self.url, self.timeout, self._id = url, timeout, 0

    def call(self, method, params):
        self._id += 1
        req = urllib.request.Request(self.url, data=json.dumps({"jsonrpc": "2.0", "id": self._id, "method": method, "params": params}).encode(),
                                     headers={"content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                j = json.loads(r.read().decode())
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise RpcError(f"RPC_UNAVAILABLE: {self.url}: {e}")
        if "error" in j:
            raise RpcError(f"{method}: {j['error'].get('message', j['error'])}")
        if j.get("result") is None:
            raise RpcError(f"{method}: empty result")
        return j["result"]

    def chain_id(self):
        return int(self.call("eth_chainId", []), 16)

    def block_number(self):
        return int(self.call("eth_blockNumber", []), 16)

    def block_hash(self, n):
        b = self.call("eth_getBlockByNumber", [hex(n), False])
        return b["hash"][2:]

    def code(self, addr):
        return bytes.fromhex(self.call("eth_getCode", [addr, "latest"])[2:])

    def eth_call(self, to, data, block="latest"):
        return self.call("eth_call", [{"to": to, "data": data}, block if isinstance(block, str) else hex(block)])


# ------------------------------------------------------------------ the Chamber's stamp, as the contract does it
def chamber_seed(block_hash_hex, token_id, row):
    """keccak256(abi.encodePacked(blockhash, id)) with the room's classes forced in; the Glitch's is not forced."""
    s = bytearray(keccak(bytes.fromhex(block_hash_hex) + word(token_id)))
    if row["behaviour"] == 7:
        return bytes(s)
    s[31] = (s[31] & 0xF8) | row["wall"]
    s[30] = (s[30] & 0xFC) | row["candle"]
    v = row["bats"]
    if row["bats"] == 1:
        v = 1 if ((s[27] >> 4) & 1) == 0 else 3
    s[27] = (s[27] & 0xF0) | v
    return bytes(s)


def stamp_of(program, off):
    b = program[off:off + 42]
    return {"seed": b[0:32].hex(), "digits": bytes(b[32:40]), "behaviour": b[40], "colour": b[41]}


def zero_window(program, off, n):
    p = bytearray(program)
    p[off:off + n] = b"\x00" * n
    return bytes(p)


# ------------------------------------------------------------------ findings
class Findings:
    def __init__(self, out=print):
        self.rows, self.failed, self.out = [], 0, out

    def _add(self, status, what, detail="", code=None):
        row = {"status": status, "what": what, "detail": detail}
        if code:
            row["code"] = code
        self.rows.append(row)
        if status == "FAIL":
            self.failed += 1
        self.out(f"{status:<20} {what}" + (f"  {detail}" if detail else ""))

    def pinned(self, what, detail=""):
        self._add("PINNED", what, detail)

    def consistent(self, what, detail=""):
        self._add("CONTRACT-CONSISTENT", what, detail)

    def reported(self, what, detail=""):
        self._add("NODE-REPORTED", what, detail)

    def fail(self, code, what, detail=""):
        self._add("FAIL", what, detail, code)

    def expect(self, ok, code, what, detail_ok="", detail_fail="", status="PINNED"):
        if ok:
            self._add(status, what, detail_ok)
        else:
            self.fail(code, what, detail_fail)
        return ok


# ------------------------------------------------------------------ offline: the catalogue against itself and the copies
def load_catalogue(path=CATALOGUE):
    cat = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if cat.get("schema") != SCHEMA or cat.get("version") != VERSION:
        raise SystemExit(f"verify: {path} is not a {SCHEMA} version {VERSION} catalogue")
    return cat


def offline(cat, root=HERE, out=print):
    f = Findings(out)
    # selectors: the catalogue's equal keccak of the signatures
    for w in cat["works"]:
        for sig, sel in w.get("selectors", {}).items():
            f.expect(selector(sig) == sel, "SELECTOR_MISMATCH", f"{w['key']}: {sig}", sel, f"catalogue {sel}, keccak {selector(sig)}")
    for name, sel in cat["machine"]["firmware"]["selectors"].items():
        sig = cat["machine"]["firmware"]["signatures"][name]
        f.expect(selector(sig) == sel, "SELECTOR_MISMATCH", f"firmware: {sig}", sel, f"catalogue {sel}, keccak {selector(sig)}")
    # the site's copies and the manifest against the catalogue's machine section
    parts_dir = pathlib.Path(root) / "parts"
    man = json.loads((parts_dir / "MANIFEST.json").read_text(encoding="utf-8"))
    by_file = {p["file"]: p for p in man["parts"]}
    for i, part in enumerate(cat["machine"]["parts"]):
        rec = by_file.get(man["emulator"][i])
        ok = rec and rec["sha256"] == part["sha256"] and same(rec["chain"]["address"], part["address"]) and rec["bytes"] == part["bytes"]
        f.expect(bool(ok), "CATALOGUE_MISMATCH", f"machine part {i} ({part['name']}) against the manifest", part["sha256"][:12] + "…", "the manifest and the catalogue disagree")
        data = (parts_dir / man["emulator"][i]).read_bytes()
        f.expect(sha256(data) == part["sha256"] and len(data) == part["bytes"], "HASH_MISMATCH", f"the site's copy {man['emulator'][i]}", f"{len(data)} bytes", "does not hash to the catalogue's pin")
    fw = cat["machine"]["firmware"]
    for k in ("kernal", "basic", "chargen"):
        rec = by_file.get(man["firmware"][k])
        ok = rec and rec["sha256"] == fw["roms"][k]["sha256"] and same(rec["chain"]["address"], fw["roms"][k]["address"]) and same(rec["chain"]["romset"], fw["romset"]) and same(rec["chain"]["root"], fw["root"])
        f.expect(bool(ok), "CATALOGUE_MISMATCH", f"firmware {k} against the manifest", fw["roms"][k]["sha256"][:12] + "…", "the manifest and the catalogue disagree")
        data = (parts_dir / man["firmware"][k]).read_bytes()
        f.expect(sha256(data) == fw["roms"][k]["sha256"] and len(data) == fw["roms"][k]["bytes"], "HASH_MISMATCH", f"the site's copy {man['firmware'][k]}", f"{len(data)} bytes", "does not hash to the catalogue's pin")
    # the Chamber's rows: sixty-four, every value in range, the tallies the contract asserts
    ch = next(w for w in cat["works"] if w["key"] == "chamber")
    rows = ch["rows"]
    f.expect(len(rows) == 64 and [r["id"] for r in rows] == list(range(1, 65)), "CATALOGUE_MISMATCH", "the Chamber's rows", "64, ids 1 to 64", f"{len(rows)} rows")
    ok = all(r["behaviour"] <= 7 and r["colour"] <= 15 and r["wall"] <= 7 and r["bats"] <= 15 and r["candle"] <= 3 for r in rows)
    ok = ok and all((r["behaviour"] == 7) == (r["id"] == 64) for r in rows)
    f.expect(ok, "CATALOGUE_MISMATCH", "every row's values within what the program accepts; the Glitch is 64", "", "a row is out of range or the Glitch is not 64")
    tallies = ch["tallies"]
    got = {"behaviour": [0] * 8, "wall": {}, "bats": {}, "candle": {}}
    for r in rows:
        got["behaviour"][r["behaviour"]] += 1
        for k in ("wall", "bats", "candle"):
            got[k][str(r[k])] = got[k].get(str(r[k]), 0) + 1
    f.expect(got == tallies, "CATALOGUE_MISMATCH", "the table's tallies", json.dumps(tallies["behaviour"]), f"computed {json.dumps(got)}")
    return f


# ------------------------------------------------------------------ against a node
def verify(cat, rpc, tokens=None, all_tokens=False, out=print):
    f = Findings(out)
    try:
        cid = rpc.chain_id()
    except RpcError as e:
        f.fail("RPC_UNAVAILABLE", "the node", str(e))
        return f
    if not f.expect(cid == cat["chainId"], "WRONG_CHAIN", "chain id", str(cid), f"{cid}, the catalogue is for {cat['chainId']}", status="NODE-REPORTED"):
        return f
    try:
        _verify_machine(cat, rpc, f)
        _verify_chamber(cat, rpc, f, tokens, all_tokens)
        _verify_perception(cat, rpc, f)
        _verify_whole(cat, rpc, f)
    except RpcError as e:
        f.fail("RPC_UNAVAILABLE", "a read failed", str(e))
    return f


def _payload(rpc, addr, what, f):
    code = rpc.code(addr)
    if len(code) < 2 or code[0] != 0:
        f.fail("NOT_A_DATA_CONTRACT", what, f"{addr}: no STOP prefix")
        return None
    return code[1:]


def _verify_machine(cat, rpc, f):
    for part in cat["machine"]["parts"]:
        data = _payload(rpc, part["address"], part["name"], f)
        if data is not None:
            f.expect(sha256(data) == part["sha256"] and len(data) == part["bytes"], "HASH_MISMATCH", f"machine: {part['name']} at {part['address']}", f"{len(data)} bytes, sha256 {part['sha256'][:12]}…", f"{len(data)} bytes hash to {sha256(data)[:12]}…")
    fw = cat["machine"]["firmware"]
    sel = fw["selectors"]
    romset = dec_addr(rpc.eth_call(fw["root"], sel["roms"]))
    f.expect(same(romset, fw["romset"]), "ROMSET_MISMATCH", f"firmware: Release.roms() on {fw['root']}", romset, f"{romset}, the catalogue pins {fw['romset']}")
    for k in ("kernal", "basic", "chargen"):
        addr = dec_addr(rpc.eth_call(romset, sel[k]))
        stated = dec_bytes32(rpc.eth_call(romset, sel[k + "Sha"]))
        pin = fw["roms"][k]
        f.expect(same(addr, pin["address"]), "ROM_ADDRESS_MISMATCH", f"firmware: ROMSet.{k}()", addr, f"{addr}, the catalogue pins {pin['address']}")
        data = _payload(rpc, addr, f"firmware {k}", f)
        if data is None:
            continue
        h = sha256(data)
        f.expect(h == pin["sha256"] and len(data) == pin["bytes"], "HASH_MISMATCH", f"firmware: {k} bytes against the catalogue's pin", f"{len(data)} bytes, {h[:12]}…", f"{h[:12]}…, the pin is {pin['sha256'][:12]}…")
        f.expect(h == stated, "HASH_MISMATCH", f"firmware: {k} bytes against the hash the ROM set states", stated[:12] + "…", f"the ROM set states {stated[:12]}…", status="CONTRACT-CONSISTENT")


def _verify_chamber(cat, rpc, f, tokens, all_tokens):
    w = next(x for x in cat["works"] if x["key"] == "chamber")
    S = w["selectors"]
    addr = w["address"]
    prog = w["program"]
    base_addr = dec_addr(rpc.eth_call(addr, S["base()"]))
    f.expect(same(base_addr, prog["base"]["address"]), "BASE_MISMATCH", "chamber: base()", base_addr, f"{base_addr}, the catalogue pins {prog['base']['address']}")
    stated = dec_bytes32(rpc.eth_call(base_addr, S["hash()"]))
    f.expect(stated == prog["base"]["keccak256"], "HASH_MISMATCH", "chamber: ChamberBase.hash() against the pin", stated[:12] + "…", f"{stated[:12]}…, the pin is {prog['base']['keccak256'][:12]}…")
    off = dec_uint(rpc.eth_call(base_addr, S["blockOffset()"]))
    size = dec_uint(rpc.eth_call(base_addr, S["size()"]))
    f.expect(off == prog["stamp"]["offset"] and size == prog["bytes"], "CATALOGUE_MISMATCH", "chamber: ChamberBase.blockOffset() and size()", f"{off}, {size}", f"{off}, {size}; the catalogue says {prog['stamp']['offset']}, {prog['bytes']}")
    base = dec_bytes(rpc.eth_call(base_addr, S["prg()"]))
    f.expect(keccak(base).hex() == prog["base"]["keccak256"] and sha256(base) == prog["base"]["sha256"] and len(base) == prog["bytes"], "HASH_MISMATCH", "chamber: the base program, ChamberBase.prg()", f"{len(base)} bytes, keccak256 {prog['base']['keccak256'][:12]}…", f"keccak256 {keccak(base).hex()[:12]}…")
    f.expect(sha256(zero_window(base, off, 42)) == prog["stamp"]["sha256WindowZeroed"], "HASH_MISMATCH", "chamber: the base with the stamp's 42 bytes zeroed", prog["stamp"]["sha256WindowZeroed"][:12] + "…", "the window-zeroed hash differs from the pin")
    rows = {r["id"]: r for r in w["rows"]}
    ids = list(range(1, 65)) if all_tokens else (tokens or [1, 55, 64])
    for tid in ids:
        row = rows[tid]
        got = [int.from_bytes(x, "big") for x in dec_words(rpc.eth_call(addr, enc_call("tableRow(uint256)", tid)))]
        want = [row["behaviour"], row["colour"], row["wall"], row["bats"], row["candle"]]
        f.expect(got == want, "ROW_MISMATCH", f"chamber: tableRow({tid})", f"{row['character']}, {want}", f"the contract says {got}, the catalogue {want}")
    # a token's stamped program at one block: N is the block the call runs in; the stamp is of N-1
    n = rpc.block_number()
    prev_hash = rpc.block_hash(n - 1)
    for tid in ids:
        row = rows[tid]
        p = dec_bytes(rpc.eth_call(addr, enc_call("prg(uint256)", tid), n))
        if not f.expect(len(p) == len(base) and zero_window(p, off, 42) == zero_window(base, off, 42), "HASH_MISMATCH", f"chamber: prg({tid}) outside its stamp equals the base", f"{len(p)} bytes", "the bytes outside the 42-byte window differ from the base"):
            continue
        st = stamp_of(p, off)
        digits = bytes(int(d) for d in f"{(n - 1) % 100000000:08d}")
        seed = chamber_seed(prev_hash, tid, row)
        ok = st["digits"] == digits and st["behaviour"] == row["behaviour"] and st["colour"] == row["colour"] and st["seed"] == seed.hex()
        f.expect(ok, "STAMP_INCONSISTENT", f"chamber: prg({tid})'s stamp at block {n} (digits of {n - 1}, the row, the seed from the node's block hash)",
                 f"digits {''.join(str(d) for d in st['digits'])}, behaviour {st['behaviour']}, colour {st['colour']}, seed {st['seed'][:12]}…",
                 f"digits {''.join(str(d) for d in st['digits'])} vs {(n - 1) % 100000000:08d}; behaviour {st['behaviour']} vs {row['behaviour']}; colour {st['colour']} vs {row['colour']}; seed {st['seed'][:12]}… vs {seed.hex()[:12]}…",
                 status="CONTRACT-CONSISTENT")


def _verify_perception(cat, rpc, f):
    w = next(x for x in cat["works"] if x["key"] == "perception-canary")
    S = w["selectors"]
    addr = w["address"]
    prog = w["program"]
    paddr = dec_addr(rpc.eth_call(addr, S["program()"]))
    f.expect(same(paddr, prog["address"]), "PROGRAM_MISMATCH", "perception: program()", paddr, f"{paddr}, the catalogue pins {prog['address']}")
    stated = dec_bytes32(rpc.eth_call(paddr, S["hash()"]))
    f.expect(stated == prog["sha256"], "HASH_MISMATCH", "perception: PerceptionProgram.hash() against the pin", stated[:12] + "…", f"{stated[:12]}…, the pin is {prog['sha256'][:12]}…")
    off = dec_uint(rpc.eth_call(paddr, S["brainOffset()"]))
    size = dec_uint(rpc.eth_call(paddr, S["size()"]))
    f.expect(off == prog["slot"]["offset"] and size == prog["bytes"], "CATALOGUE_MISMATCH", "perception: brainOffset() and size()", f"{off}, {size}", f"{off}, {size}; the catalogue says {prog['slot']['offset']}, {prog['bytes']}")
    frozen = dec_bytes(rpc.eth_call(addr, S["prg()"]))
    f.expect(sha256(frozen) == prog["sha256"] and len(frozen) == prog["bytes"], "HASH_MISMATCH", "perception: the frozen program, prg()", f"{len(frozen)} bytes, sha256 {prog['sha256'][:12]}…", f"sha256 {sha256(frozen)[:12]}…")
    f.expect(sha256(zero_window(frozen, off, 834)) == prog["slot"]["sha256WindowZeroed"], "HASH_MISMATCH", "perception: the program with the slot's 834 bytes zeroed", prog["slot"]["sha256WindowZeroed"][:12] + "…", "the window-zeroed hash differs from the pin")
    genesis = dec_bytes32(rpc.eth_call(addr, S["GENESIS_HASH()"]))
    f.expect(genesis == prog["genesis"]["sha256"], "HASH_MISMATCH", "perception: GENESIS_HASH()", genesis[:12] + "…", f"{genesis[:12]}…, the pin is {prog['genesis']['sha256'][:12]}…")
    mb = dec_uint(rpc.eth_call(addr, S["MAX_BATCH()"]))
    f.expect(mb == w["maxBatch"], "CATALOGUE_MISMATCH", "perception: MAX_BATCH()", str(mb), f"{mb}, the catalogue says {w['maxBatch']}")
    for tid in range(1, w["tokens"]["count"] + 1):
        head = dec_uint(rpc.eth_call(addr, enc_call("head(uint256)", tid)))
        f.reported(f"perception: head({tid})", f"revision {head}")
        p = dec_bytes(rpc.eth_call(addr, enc_call("prgWithBrain(uint256)", tid)))
        f.expect(len(p) == len(frozen) and zero_window(p, off, 834) == zero_window(frozen, off, 834), "HASH_MISMATCH", f"perception: prgWithBrain({tid}) outside its slot equals the frozen program", f"{len(p)} bytes", "the bytes outside the slot differ")
        slot = p[off:off + 834]
        rec = dec_words(rpc.eth_call(addr, enc_call("revision(uint256,uint32)", tid, head)))
        canonical = rec[7].hex()
        f.expect(sha256(slot) == canonical, "HASH_MISMATCH", f"perception: the head slot of token {tid} against revision({tid}, {head}).canonicalHash", canonical[:12] + "…", f"the slot hashes to {sha256(slot)[:12]}…, the record says {canonical[:12]}…", status="CONTRACT-CONSISTENT")
        stated = dec_bytes32(rpc.eth_call(addr, enc_call_bytes("canonicalHashOf(bytes)", slot)))
        f.expect(stated == sha256(slot), "HASH_MISMATCH", f"perception: canonicalHashOf(the head slot of token {tid})", stated[:12] + "…", "the contract's sha256 differs from this one's", status="CONTRACT-CONSISTENT")
        for r in range(0, head + 1):
            rec = dec_words(rpc.eth_call(addr, enc_call("revision(uint256,uint32)", tid, r)))
            brain, canonical = "0x" + rec[0][12:].hex(), rec[7].hex()
            data = _payload(rpc, brain, f"revision {r}'s brain blob", f)
            if data is None:
                continue
            if r == 0:
                f.expect(len(data) == 834 and sha256(data) == prog["genesis"]["sha256"] and canonical == prog["genesis"]["sha256"], "HASH_MISMATCH", f"perception: token {tid} revision 0, the genesis blob at {brain}", "834 bytes, the pinned genesis", "the genesis blob does not hash to the pin")
            else:
                f.expect(len(data) == 834 and sha256(data) == canonical, "HASH_MISMATCH", f"perception: token {tid} revision {r}, the blob at {brain} against its record", f"834 bytes, {canonical[:12]}…", f"the blob hashes to {sha256(data)[:12]}…, the record says {canonical[:12]}…", status="CONTRACT-CONSISTENT")


def _verify_whole(cat, rpc, f):
    for w in cat["works"]:
        if w["program"]["kind"] != "whole":
            continue
        S = w["selectors"]
        stated = dec_bytes32(rpc.eth_call(w["address"], S["prgHash()"]))
        f.expect(stated == w["program"]["keccak256"], "HASH_MISMATCH", f"{w['key']}: prgHash() against the pin", stated[:12] + "…", f"{stated[:12]}…, the pin is {w['program']['keccak256'][:12]}…")
        p = dec_bytes(rpc.eth_call(w["address"], S["prg()"]))
        h = keccak(p).hex()
        f.expect(h == w["program"]["keccak256"], "HASH_MISMATCH", f"{w['key']}: the program, prg(), against the pin", f"{len(p)} bytes, keccak256 {h[:12]}…", f"keccak256 {h[:12]}…, the pin is {w['program']['keccak256'][:12]}…")
        if w["program"].get("sha256"):
            f.expect(sha256(p) == w["program"]["sha256"] and len(p) == w["program"]["bytes"], "HASH_MISMATCH", f"{w['key']}: the program's sha256 and size", f"{len(p)} bytes", "differ from the catalogue")


# ------------------------------------------------------------------ the command
def main(argv=None):
    ap = argparse.ArgumentParser(description="check the machine's catalogue against itself, the site's copies, and an Ethereum node")
    ap.add_argument("--catalogue", default=str(CATALOGUE))
    ap.add_argument("--offline", action="store_true", help="no network: the catalogue against itself and the site's copies")
    ap.add_argument("--rpc", help="a JSON-RPC endpoint for Ethereum mainnet")
    ap.add_argument("--tokens", help="Chamber token ids to check, comma separated (default 1,55,64)")
    ap.add_argument("--all", action="store_true", help="every Chamber token")
    ap.add_argument("--json", help="write the findings here as JSON")
    a = ap.parse_args(argv)
    cat = load_catalogue(a.catalogue)
    if not a.offline and not a.rpc:
        ap.error("give --offline or --rpc URL")
    print(f"verify: catalogue generated {cat['generated']}, chain {cat['chainId']}, {len(cat['works'])} works")
    f = offline(cat, pathlib.Path(a.catalogue).resolve().parent)
    rows = f.rows
    failed = f.failed
    if a.rpc:
        g = verify(cat, Rpc(a.rpc), tokens=[int(t) for t in a.tokens.split(",")] if a.tokens else None, all_tokens=a.all)
        rows, failed = rows + g.rows, failed + g.failed
    if a.json:
        pathlib.Path(a.json).write_text(json.dumps({"catalogue": cat["generated"], "rpc": a.rpc, "findings": rows, "failed": failed}, indent=1) + "\n", encoding="utf-8")
    counts = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    print("verify: " + ("FAILED" if failed else "ok") + " " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
