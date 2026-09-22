# SPDX-License-Identifier: MIT
"""A stand-in Ethereum node for the verifier's tests, standard library only.

A World holds data contracts (STOP || bytes) and callable functions keyed by
address and selector; a Server answers eth_chainId, eth_blockNumber,
eth_getBlockByNumber, eth_getCode and eth_call over HTTP at 127.0.0.1. The
install_* helpers build worlds shaped like the real contracts: the Chamber's
prg(id) stamps the base exactly as Chamber.sol does (the seed from the block
hash of the call's previous block with the room's classes forced in, the
digits, the row); Perception's prgWithBrain splices the head slot; the whole-
program tokens answer prg() and prgHash(). Nothing here is a test of the
chain: it is a test of the verifier against bytes whose truth is known.

The seed logic is shared with verify.py, so a mistake there would agree with
itself here; the check that breaks that circle is a run of verify.py against
a real node, which is what the audit does.
"""
import hashlib
import http.server
import json
import pathlib
import sys
import threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from verify import keccak, selector, word, chamber_seed  # noqa: E402


def ret_bytes(b):
    return "0x" + (word(32) + word(len(b)) + b + b"\x00" * (-len(b) % 32)).hex()


def ret_words(*vals):
    out = b""
    for v in vals:
        if isinstance(v, int):
            out += word(v)
        elif isinstance(v, str) and v.startswith("0x") and len(v) == 42:
            out += b"\x00" * 12 + bytes.fromhex(v[2:])
        elif isinstance(v, (bytes, bytearray)) and len(v) == 32:
            out += bytes(v)
        else:
            raise ValueError(f"cannot encode {v!r}")
    return "0x" + out.hex()


def arg_uint(data_hex, i):
    return int(data_hex[10 + 64 * i:10 + 64 * (i + 1)], 16)


def arg_bytes(data_hex, i=0):
    b = bytes.fromhex(data_hex[10:])
    off = int.from_bytes(b[32 * i:32 * i + 32], "big")
    n = int.from_bytes(b[off:off + 32], "big")
    return b[off + 32:off + 32 + n]


def create_address(deployer, nonce):
    """The address a contract gets from `deployer` at `nonce` (1..127): keccak(rlp([deployer, nonce]))[12:]."""
    d = bytes.fromhex(deployer[2:])
    rlp = bytes([0xd6, 0x94]) + d + (bytes([nonce]) if nonce else b"\x80")
    return "0x" + keccak(rlp)[12:].hex()


class World:
    def __init__(self, chain_id=1, block_number=1000):
        self.chain_id = chain_id
        self.block_number = block_number
        self.code = {}
        self.calls = {}
        self.block_hashes = {}

    def data_contract(self, address, payload):
        self.code[address.lower()] = b"\x00" + bytes(payload)

    def on(self, address, sig, fn):
        self.calls[(address.lower(), selector(sig))] = fn

    def block_hash(self, n):
        if n in self.block_hashes:
            return self.block_hashes[n]
        return hashlib.sha256(f"block {n}".encode()).hexdigest()

    def rpc(self, req):
        rid, method, params = req.get("id"), req.get("method"), req.get("params") or []
        ok = lambda r: {"jsonrpc": "2.0", "id": rid, "result": r}  # noqa: E731
        err = lambda m: {"jsonrpc": "2.0", "id": rid, "error": {"code": -32000, "message": m}}  # noqa: E731
        if method == "eth_chainId":
            return ok(hex(self.chain_id))
        if method == "eth_blockNumber":
            return ok(hex(self.block_number))
        if method == "eth_getBlockByNumber":
            n = self.block_number if params[0] in ("latest", "pending") else int(params[0], 16)
            return ok({"number": hex(n), "hash": "0x" + self.block_hash(n)})
        if method == "eth_getCode":
            return ok("0x" + self.code.get(str(params[0]).lower(), b"").hex())
        if method == "eth_call":
            to = str(params[0].get("to", "")).lower()
            data = str(params[0].get("data", ""))
            block = params[1] if len(params) > 1 else "latest"
            n = self.block_number if block in ("latest", "pending") else int(block, 16)
            fn = self.calls.get((to, data[:10].lower()))
            if fn is None:
                return err(f"execution reverted (mock: no {data[:10]} at {to})")
            try:
                return ok(fn(data, n))
            except Exception as e:  # noqa: BLE001
                return err(f"execution reverted (mock: {e})")
        return err(f"mock: method not served: {method}")


# ------------------------------------------------------------------ the shapes of the real contracts
def install_machine(world, parts, firmware):
    """parts: [(address, payload)] in order; firmware: {root, romset, roms: {kernal: (address, payload), ...}}."""
    for addr, payload in parts:
        world.data_contract(addr, payload)
    world.on(firmware["root"], "roms()", lambda d, n: ret_words(firmware["romset"]))
    for k, (addr, payload) in firmware["roms"].items():
        world.data_contract(addr, payload)
        world.on(firmware["romset"], f"{k}()", (lambda a: lambda d, n: ret_words(a))(addr))
        world.on(firmware["romset"], f"{k.upper()}_SHA256()", (lambda p: lambda d, n: "0x" + hashlib.sha256(p).hexdigest())(payload))


def install_chamber(world, address, base_address, base, block_offset, rows, stamp_faults=None):
    """rows: [{id, behaviour, colour, wall, bats, candle}] for ids 1..64. stamp_faults: a dict of deliberate faults for the tests."""
    faults = stamp_faults or {}
    by_id = {r["id"]: r for r in rows}
    world.on(address, "base()", lambda d, n: ret_words(base_address))
    world.on(base_address, "hash()", lambda d, n: "0x" + keccak(base).hex())
    world.on(base_address, "blockOffset()", lambda d, n: ret_words(block_offset))
    world.on(base_address, "size()", lambda d, n: ret_words(len(base)))
    world.on(base_address, "prg()", lambda d, n: ret_bytes(base))

    def table_row(d, n):
        r = dict(by_id[arg_uint(d, 0)])
        if "row" in faults and faults["row"][0] == r["id"]:
            r[faults["row"][1]] = faults["row"][2]
        return ret_words(r["behaviour"], r["colour"], r["wall"], r["bats"], r["candle"])
    world.on(address, "tableRow(uint256)", table_row)

    def prg(d, n):
        tid = arg_uint(d, 0)
        r = by_id[tid]
        prev = n - 1
        seed = chamber_seed(world.block_hash(prev), tid, r)
        p = bytearray(base)
        p[block_offset:block_offset + 32] = seed
        digits = prev if "digits" not in faults else faults["digits"]
        for i in range(8):
            p[block_offset + 39 - i] = digits % 10
            digits //= 10
        p[block_offset + 40] = r["behaviour"]
        p[block_offset + 41] = r["colour"] if "colour" not in faults else faults["colour"]
        if "outside" in faults:
            p[faults["outside"]] ^= 0x01
        return ret_bytes(bytes(p))
    world.on(address, "prg(uint256)", prg)
    world.on(address, "renderBlock()", lambda d, n: ret_words(bytes.fromhex(world.block_hash(n - 1)), n - 1))


def install_perception(world, address, program_address, program, offset, genesis, revisions, max_batch=32, blob_faults=None):
    """revisions: {token_id: [slot bytes for r = 1..head]}; genesis: the 834-byte blank slot."""
    faults = blob_faults or {}
    world.on(address, "program()", lambda d, n: ret_words(program_address))
    world.on(program_address, "hash()", lambda d, n: "0x" + hashlib.sha256(program).hexdigest())
    world.on(program_address, "brainOffset()", lambda d, n: ret_words(offset))
    world.on(program_address, "size()", lambda d, n: ret_words(len(program)))
    world.on(program_address, "prg()", lambda d, n: ret_bytes(program))
    world.on(address, "prg()", lambda d, n: ret_bytes(program))
    world.on(address, "GENESIS_HASH()", lambda d, n: "0x" + hashlib.sha256(genesis).hexdigest())
    world.on(address, "MAX_BATCH()", lambda d, n: ret_words(max_batch))
    genesis_blob = create_address(address, 1)
    world.data_contract(genesis_blob, genesis)
    blobs = {}
    for tid, slots in revisions.items():
        for r, slot in enumerate(slots, 1):
            a = create_address(address, 16 * tid + r)
            data = bytes(slot)
            if faults.get("blob") == (tid, r):
                data = bytes([data[0] ^ 1]) + data[1:]
            world.data_contract(a, data)
            blobs[(tid, r)] = a

    def head(d, n):
        return ret_words(len(revisions.get(arg_uint(d, 0), [])))
    world.on(address, "head(uint256)", head)

    def revision(d, n):
        tid, r = arg_uint(d, 0), arg_uint(d, 1)
        if r == 0:
            return ret_words(genesis_blob, 0, 0, 0, 1, "0x" + "00" * 20, 0, hashlib.sha256(genesis).digest(), "0x" + "00" * 20)
        slot = revisions[tid][r - 1]
        return ret_words(blobs[(tid, r)], r - 1, 1, r, 1, create_address(address, 100 + r), 12345 + r, hashlib.sha256(slot).digest(), "0x" + "11" * 20)
    world.on(address, "revision(uint256,uint32)", revision)

    def prg_with_brain(d, n):
        tid = arg_uint(d, 0)
        slots = revisions.get(tid, [])
        slot = slots[-1] if slots else genesis
        p = bytearray(program)
        p[offset:offset + 834] = slot
        return ret_bytes(bytes(p))
    world.on(address, "prgWithBrain(uint256)", prg_with_brain)
    world.on(address, "canonicalHashOf(bytes)", lambda d, n: "0x" + hashlib.sha256(arg_bytes(d)).hexdigest())


def install_whole(world, address, program):
    world.on(address, "prg()", lambda d, n: ret_bytes(program))
    world.on(address, "prgHash()", lambda d, n: "0x" + keccak(program).hex())


# ------------------------------------------------------------------ the server
class Server:
    def __init__(self, world, static_root=None):
        self.world, self.static_root = world, static_root
        w, root = world, static_root

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                n = int(self.headers.get("content-length", "0"))
                body = self.rfile.read(n)
                try:
                    j = json.loads(body)
                    out = [w.rpc(x) for x in j] if isinstance(j, list) else w.rpc(j)
                except ValueError:
                    out = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}}
                data = json.dumps(out).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if root is None:
                    self.send_response(404); self.end_headers(); return
                p = (pathlib.Path(root) / self.path.lstrip("/").split("?")[0]).resolve()
                if not str(p).startswith(str(pathlib.Path(root).resolve())) or not p.is_file():
                    self.send_response(404); self.end_headers(); return
                data = p.read_bytes()
                self.send_response(200)
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def url(self):
        return f"http://127.0.0.1:{self.httpd.server_address[1]}/rpc"

    def start(self):
        self.thread.start()
        return self.url

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
