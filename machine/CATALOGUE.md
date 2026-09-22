# The catalogue: `machine/catalogue.json`

Every program THE MACHINE can load from Ethereum, how to fetch each one, and
what it must match. It is data, versioned, produced by a private exporter
from the deployment records and the frozen bytes; trust never depends on the
exporter, because `machine/verify.py` checks every line of the file against
the chain for anyone who runs it (no flag: the first of `endpoints` that
answers; `--rpc URL`: a node of your own), and against the site's own
copies without a network (`--offline`, which the site check runs on every
push). Schema `chamber-machine-catalogue`, version 1; a reader refuses any
other.

## The shape

| field | what |
|---|---|
| `schema`, `version`, `generated`, `chainId` | the identity of the file; `chainId` is 1, mainnet |
| `endpoints` | the site's one shared list of public JSON-RPC endpoints, in the order a page tries them |
| `machine.parts[]` | nopsta's four data contracts: `name`, `address`, `bytes`, `sha256` of the payload after the STOP byte |
| `machine.firmware` | OpenROMs pressing 1: the release `root`, the `romset` it names, each ROM's `address`, `bytes` and `sha256`; the `signatures` and `selectors` of the calls that find them |
| `works[]` | one entry per work: `key` (permanent), `name`, `contract`, `address`, `deployed`, `tokens`, `program`, the recipe(s), `selectors` (signature to selector, recomputable by keccak) |

Three kinds of program, told apart by `program.kind`:

- **`stamped`** (the Chamber): `prg(id)` returns the frozen `base` with 42
  bytes written at `stamp.offset`, the block you read it at. Outside the
  window the bytes are the base's: `sha256` of the fetched program with the
  window zeroed must equal `stamp.sha256WindowZeroed` (PINNED). Inside it:
  the last two bytes are the token's `rows[id]` behaviour and colour, the
  eight before them are the low eight decimal digits of the previous
  block's number, and the first 32 are `keccak256(previous block hash,
  id)` with the room's classes forced in as `stamp.layout` says
  (CONTRACT-CONSISTENT, because the same node supplies the block hash).
  `rows` are the sixty-four table rows the contract serves as
  `tableRow(id)`; `tallies` are the counts the contract asserts at deploy.
- **`slotted`** (Perception): `prg()` is the frozen program (PINNED against
  `sha256`); `prgWithBrain(id)` is the same bytes with the head brain in the
  834-byte `slot` (outside it, PINNED against `slot.sha256WindowZeroed`;
  inside it, CONTRACT-CONSISTENT against `revision(id, head(id)).canonicalHash`).
  A past revision is its blob's bytes spliced at the slot; revision 0 is
  the `genesis` slot, PINNED.
- **`whole`** (the Tony token, READY 64): `prg()` is the whole program,
  PINNED against `keccak256`, which `prgHash()` also states.

## What is proven by whom

The catalogue's pins are commitments known before a page asks. A host
page holding this file verifies bytes against them and shows the status
the vocabulary gives (`machine/PROTOCOL.md`); `verify.py` does the same
from the command line and adds what only a node can answer. The exporter
refuses to write a catalogue whose pins differ from the private records,
and runs this same verifier against a stand-in node built from the real
bytes before writing; the public test (`machine/test/test_verify.py`)
holds the verifier's every refusal code to synthetic bytes whose truth is
known. None of that is a substitute for a run against a real node, which
is the audit's, and the reason this file is public.
