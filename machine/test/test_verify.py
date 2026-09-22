#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""G1 and G4 for the verifier, with synthetic bytes whose truth is known.

    python3 machine/test/test_verify.py

Against a stand-in node built from synthetic programs shaped like the real
contracts: a consistent world passes with the statuses the vocabulary
promises; every refusal code is produced by exactly the fault that should
produce it (a tampered emulator part, a tampered base, a program altered
outside its stamp, a wrong stamp, a wrong row, a wrong ROM, a revision blob
that does not match its record, a tampered whole program, a wrong chain, a
node that does not answer); the offline check holds the committed catalogue
to the site's copies and refuses a tampered copy; a wrong selector is caught.
No real program bytes are in this repository: the real catalogue is checked
against a real node by `verify.py --rpc`, which is the audit's run.
"""
import hashlib
import json
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import verify  # noqa: E402
from mocknode import World, Server, install_machine, install_chamber, install_perception, install_whole  # noqa: E402

failures = 0


def check(cond, what):
    global failures
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        failures += 1


def det(name, n):
    """Deterministic bytes: sha256 blocks of a name."""
    out = b""
    i = 0
    while len(out) < n:
        out += hashlib.sha256(f"{name}:{i}".encode()).digest()
        i += 1
    return out[:n]


def addr(name):
    return "0x" + hashlib.sha256(name.encode()).hexdigest()[:40]


# ------------------------------------------------------------------ the synthetic world (machine/test/synthetic.py)
from synthetic import build  # noqa: E402


def run(faults=None, tokens=(1, 5, 64)):
    w, cat = build([k for k, v in (faults or {}).items() if v])
    s = Server(w)
    url = s.start()
    lines = []
    try:
        f = verify.verify(cat, verify.Rpc(url), tokens=list(tokens), out=lines.append)
    finally:
        s.stop()
    codes = [r.get("code") for r in f.rows if r["status"] == "FAIL"]
    return f, codes, lines


# ------------------------------------------------------------------ the cases
f, codes, lines = run()
statuses = {}
for r in f.rows:
    statuses[r["status"]] = statuses.get(r["status"], 0) + 1
check(f.failed == 0, f"a consistent world: 0 FAIL ({statuses})")
check(statuses.get("PINNED", 0) >= 20 and statuses.get("CONTRACT-CONSISTENT", 0) >= 6 and statuses.get("NODE-REPORTED", 0) >= 1,
      "the statuses: PINNED for pins, CONTRACT-CONSISTENT for the stamps and the slots, NODE-REPORTED for the head")
check(any("prg(5)'s stamp" in r["what"] and r["status"] == "CONTRACT-CONSISTENT" for r in f.rows), "a token's stamp recomputed from the node's block hash agrees")
check(any("revision 2" in r["what"] and r["status"] == "CONTRACT-CONSISTENT" for r in f.rows), "a revision's blob agrees with its record")
check(any("revision 0" in r["what"] and r["status"] == "PINNED" for r in f.rows), "the genesis blob is PINNED")

for fault, code, what in (("part", "HASH_MISMATCH", "a tampered emulator part"),
                          ("rom", "HASH_MISMATCH", "a ROM whose bytes are not what the ROM set states"),
                          ("base", "HASH_MISMATCH", "a tampered base program"),
                          ("outside", "HASH_MISMATCH", "a token's program altered outside its stamp"),
                          ("digits", "STAMP_INCONSISTENT", "a stamp with the wrong block digits"),
                          ("row", "ROW_MISMATCH", "a row the contract states differently"),
                          ("blob", "HASH_MISMATCH", "a revision blob that does not match its record"),
                          ("whole", "HASH_MISMATCH", "a tampered whole program")):
    f, codes, lines = run({fault: True})
    check(code in codes, f"{what}: {code} ({', '.join(sorted(set(codes))) or 'no FAIL'})")

f, codes, lines = run({"chain": 11155111})
check(codes == ["WRONG_CHAIN"], f"the wrong chain: {codes}")

dead = verify.verify(build()[1], verify.Rpc("http://127.0.0.1:9/rpc", timeout=3), out=lambda s: None)
check([r.get("code") for r in dead.rows] == ["RPC_UNAVAILABLE"], "a node that does not answer: RPC_UNAVAILABLE")

# the stamp's own arithmetic: one bat keeps the hash's side; the Glitch's seed is not forced
seed_bats1 = verify.chamber_seed("ab" * 32, 3, {"behaviour": 1, "wall": 5, "bats": 1, "candle": 1})
check(seed_bats1[27] & 0x0F in (1, 3) and seed_bats1[31] & 7 == 5 and seed_bats1[30] & 3 == 1, "the forced bytes: wall, candle, one bat left or right by the hash")
raw = verify.keccak(bytes.fromhex("ab" * 32) + verify.word(64))
check(verify.chamber_seed("ab" * 32, 64, {"behaviour": 7, "wall": 0, "bats": 0, "candle": 0}) == raw, "the Glitch's seed is the bare keccak")

# ------------------------------------------------------------------ offline: the committed catalogue against the site's copies
cat_path = HERE.parent / "catalogue.json"
check(cat_path.exists(), "machine/catalogue.json is committed")
if cat_path.exists():
    cat = verify.load_catalogue(cat_path)
    off = verify.offline(cat, HERE.parent, out=lambda s: None)
    check(off.failed == 0, f"offline: the committed catalogue against itself and the site's copies ({len(off.rows)} findings)")
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copytree(HERE.parent / "parts", pathlib.Path(tmp) / "parts")
        p = pathlib.Path(tmp) / "parts" / "m64-1.bin"
        b = bytearray(p.read_bytes()); b[7] ^= 1; p.write_bytes(bytes(b))
        bad = verify.offline(cat, tmp, out=lambda s: None)
        check(any(r.get("code") == "HASH_MISMATCH" and "m64-1.bin" in r["what"] for r in bad.rows), "offline: a tampered copy is HASH_MISMATCH")
    wrong = json.loads(json.dumps(cat))
    wrong["works"][0]["selectors"]["prg(uint256)"] = "0x00000000"
    bad = verify.offline(wrong, HERE.parent, out=lambda s: None)
    check(any(r.get("code") == "SELECTOR_MISMATCH" for r in bad.rows), "offline: a wrong selector is SELECTOR_MISMATCH")

print(f"{failures} check(s) failed" if failures else "all checks passed")
sys.exit(1 if failures else 0)
