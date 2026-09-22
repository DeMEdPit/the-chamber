#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""A synthetic world shaped like the real contracts, for the verifier's gate and the page's.

    python3 machine/test/synthetic.py --serve [--fault NAME]... [--real-machine]

Programs whose truth is known and whose bytes are not the series': a 3,000-byte
Chamber base that is a real, tiny C64 program (10 SYS2061: screen code 1 at the
top left) with the stamp marker at offset 1,000; a 4,000-byte Perception program
with a genesis slot at 2,000 and two revisions; two whole programs. With
--real-machine the emulator's parts and the ROMs are the site's real copies at
their real addresses, so a page can boot the real machine off the stand-in and
run the tiny program. --serve starts the stand-in node, writes the matching
catalogue to a temporary file, prints one JSON line {"rpc", "catalogue"} and
waits until its stdin closes. Faults, for the refusal cases: part, rom, base,
outside, digits, row, blob, whole, chain.
"""
import argparse
import hashlib
import json
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import verify  # noqa: E402
from mocknode import World, Server, install_machine, install_chamber, install_perception, install_whole  # noqa: E402

# 10 SYS2061 : LDA #1 ; STA $0400 ; RTS
PRG_A = bytes([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0xa9, 0x01, 0x8d, 0x00, 0x04, 0x60])


def det(name, n):
    out, i = b"", 0
    while len(out) < n:
        out += hashlib.sha256(f"{name}:{i}".encode()).digest()
        i += 1
    return out[:n]


def addr(name):
    return "0x" + hashlib.sha256(name.encode()).hexdigest()[:40]


def rows64():
    rows = []
    for i in range(1, 65):
        beh = 7 if i == 64 else (i % 7)
        rows.append({"id": i, "character": f"Character {beh}", "behaviour": beh, "colour": (i * 3) % 16, "colourName": f"Colour {(i * 3) % 16}",
                     "wall": [0, 5, 7][i % 3], "wallName": ["Sparse", "Half", "Dense"][i % 3], "bats": [0, 1, 8][(i // 3) % 3],
                     "batsName": ["None", "One", "Two"][(i // 3) % 3], "candle": i % 2, "candleName": "Lit" if i % 2 else "Dim"})
    return rows


def tallies(rows):
    t = {"behaviour": [0] * 8, "wall": {}, "bats": {}, "candle": {}}
    for r in rows:
        t["behaviour"][r["behaviour"]] += 1
        for k in ("wall", "bats", "candle"):
            t[k][str(r[k])] = t[k].get(str(r[k]), 0) + 1
    return t


def base_program():
    p = bytearray(3000)
    p[:len(PRG_A)] = PRG_A
    p[1000:1008] = b"MURAL02\x00"
    return bytes(p)


def build(faults=None, real_machine=False, endpoints=()):
    faults = set(faults or [])
    w = World(chain_id=11155111 if "chain" in faults else 1, block_number=5000)
    if real_machine:
        parts_dir = HERE.parent / "parts"
        man = json.loads((parts_dir / "MANIFEST.json").read_text(encoding="utf-8"))
        by = {p["file"]: p for p in man["parts"]}
        parts = [(by[f]["chain"]["address"], (parts_dir / f).read_bytes()) for f in man["emulator"]]
        roms = {k: (by[f]["chain"]["address"], (parts_dir / f).read_bytes()) for k, f in man["firmware"].items()}
        fw = {"root": by[man["firmware"]["kernal"]]["chain"]["root"], "romset": by[man["firmware"]["kernal"]]["chain"]["romset"], "roms": roms}
        machine_name = "minimal64-2022"
    else:
        parts = [(addr(f"part{i}"), det(f"part{i}", 300 + i)) for i in range(4)]
        roms = {k: (addr(k), det(k, n)) for k, n in (("kernal", 8192), ("basic", 8192), ("chargen", 4096))}
        fw = {"root": addr("root"), "romset": addr("romset"), "roms": roms}
        machine_name = "synthetic"
    served_parts = list(parts)
    if "part" in faults:
        served_parts[1] = (parts[1][0], parts[1][1][:-1] + bytes([parts[1][1][-1] ^ 0xff]))
    install_machine(w, served_parts, fw)
    if "rom" in faults:
        w.data_contract(roms["basic"][0], roms["basic"][1][:-1] + bytes([roms["basic"][1][-1] ^ 1]))
    base = base_program()
    rows = rows64()
    stamp_faults = {}
    if "digits" in faults:
        stamp_faults["digits"] = 12345678
    if "row" in faults:
        stamp_faults["row"] = (5, "colour", (rows[4]["colour"] + 1) % 16)
    if "outside" in faults:
        stamp_faults["outside"] = 10
    served_base = base if "base" not in faults else base[:-1] + bytes([base[-1] ^ 1])
    install_chamber(w, addr("chamber"), addr("chamberbase"), served_base, 1008, rows, stamp_faults)
    program = bytearray(det("program", 4000))
    genesis = bytearray(834)
    genesis[0:8] = b"BRAIN025"
    program[2000:2834] = genesis
    program = bytes(program)
    slots = [det(f"slot{r}", 834) for r in (1, 2)]
    install_perception(w, addr("perception"), addr("program"), program, 2000, bytes(genesis), {1: slots}, 32,
                       {"blob": (1, 2)} if "blob" in faults else None)
    tony = det("tony", 500)
    ready = det("ready", 300)
    install_whole(w, addr("tony"), tony if "whole" not in faults else tony[:-1] + b"\x00")
    install_whole(w, addr("ready64"), ready)
    cat = {
        "schema": verify.SCHEMA, "version": verify.VERSION, "generated": "synthetic", "chainId": 1, "endpoints": list(endpoints),
        "machine": {
            "name": machine_name, "parts": [{"name": f"part {i}", "address": a, "bytes": len(p), "sha256": hashlib.sha256(p).hexdigest()} for i, (a, p) in enumerate(parts)],
            "firmware": {"root": fw["root"], "romset": fw["romset"],
                         "roms": {k: {"address": a, "bytes": len(p), "sha256": hashlib.sha256(p).hexdigest()} for k, (a, p) in roms.items()},
                         "signatures": {"roms": "roms()", "kernal": "kernal()", "basic": "basic()", "chargen": "chargen()",
                                        "kernalSha": "KERNAL_SHA256()", "basicSha": "BASIC_SHA256()", "chargenSha": "CHARGEN_SHA256()"},
                         "selectors": {}},
        },
        "works": [
            {"key": "chamber", "name": "The Chamber", "address": addr("chamber"), "tokens": {"count": 64},
             "program": {"kind": "stamped", "bytes": len(base), "base": {"address": addr("chamberbase"), "keccak256": verify.keccak(base).hex(), "sha256": hashlib.sha256(base).hexdigest()},
                         "stamp": {"offset": 1008, "bytes": 42, "sha256WindowZeroed": hashlib.sha256(verify.zero_window(base, 1008, 42)).hexdigest()}},
             "rows": rows, "tallies": tallies(rows),
             "selectors": {s: verify.selector(s) for s in ("prg(uint256)", "tableRow(uint256)", "renderBlock()", "base()", "prg()", "hash()", "blockOffset()", "size()")}},
            {"key": "perception-canary", "name": "Perception Chamber Canary", "address": addr("perception"), "tokens": {"count": 1}, "maxBatch": 32,
             "program": {"kind": "slotted", "address": addr("program"), "bytes": len(program), "sha256": hashlib.sha256(program).hexdigest(),
                         "slot": {"offset": 2000, "bytes": 834, "sha256WindowZeroed": hashlib.sha256(verify.zero_window(program, 2000, 834)).hexdigest()},
                         "genesis": {"sha256": hashlib.sha256(bytes(genesis)).hexdigest()}},
             "selectors": {s: verify.selector(s) for s in ("prg()", "prgWithBrain(uint256)", "head(uint256)", "revision(uint256,uint32)", "canonicalHashOf(bytes)", "program()", "hash()", "brainOffset()", "size()", "GENESIS_HASH()", "MAX_BATCH()")}},
            {"key": "tony", "name": "Tony: Born for Adventure (C64 demo)", "address": addr("tony"), "tokens": {"count": 1},
             "program": {"kind": "whole", "keccak256": verify.keccak(tony).hex(), "sha256": hashlib.sha256(tony).hexdigest(), "bytes": len(tony)},
             "selectors": {s: verify.selector(s) for s in ("prg()", "prgHash()")}},
            {"key": "ready64", "name": "READY 64", "address": addr("ready64"), "tokens": {"count": 1},
             "program": {"kind": "whole", "keccak256": verify.keccak(ready).hex()},
             "selectors": {s: verify.selector(s) for s in ("prg()", "prgHash()")}},
        ],
    }
    cat["machine"]["firmware"]["selectors"] = {k: verify.selector(v) for k, v in cat["machine"]["firmware"]["signatures"].items()}
    return w, cat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--fault", action="append", default=[])
    ap.add_argument("--real-machine", action="store_true")
    ap.add_argument("--endpoints", default="/rpc", help="the endpoints the catalogue lists, comma-separated (the gate maps each to a stand-in)")
    a = ap.parse_args()
    if not a.serve:
        ap.error("--serve")
    w, cat = build(a.fault, a.real_machine, endpoints=[e.strip() for e in a.endpoints.split(",") if e.strip()])
    s = Server(w)
    url = s.start()
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="synthetic-")) / "catalogue.json"
    tmp.write_text(json.dumps(cat), encoding="utf-8")
    print(json.dumps({"rpc": url, "catalogue": str(tmp)}), flush=True)
    try:
        sys.stdin.read()
    finally:
        s.stop()


if __name__ == "__main__":
    main()
