# `machine/`: THE MACHINE

The site's page for running Commodore 64 programs from the chain and from a
visitor's own files, on READY 64: minimal64, the emulator nopsta stored on
Ethereum in 2022, with the OpenROMs firmware of pressing 1. The design and
its decisions are in the private study; what is public is here, all of it.

## What is in this folder

| path | what | licence |
|---|---|---|
| `src/core.html` | the one source of the machine document | GPL-2.0-only |
| `core.html` | built: the EMBEDDED machine document, fed every byte by a host over a `MessagePort`; its policy connects to `data:` alone (the emulator's own WebAssembly travels as a data URL; no network), and it has no network code | GPL-2.0-only |
| `standalone.html` | built: the STANDALONE machine document, which reads the chain itself and boots to READY (`?mode=bare`, `?prg=<hex>`, `?input=joystick`, `?rpc=<url>`). A harness and a copy-and-run surface: no policy, any RPC; the security boundary is the embedded build's alone | GPL-2.0-only |
| `build.py` | builds both from the source; refuses to build unless the copies match their manifest, the pins agree, and the licence gate holds | MIT |
| `index.html` | built: the page, THE MACHINE at `/machine/`: the frame, NOW PLAYING, FROM THE CHAIN, FROM A FILE, the keys, the log, the way out; every panel but the way out is a bay whose header carries one live line (what is true now, in the page's own words), open on a wide screen and closed on a phone; its policy allows scripts and frames from this site only and connections to this site and the shared endpoints only, nothing inline | MIT |
| `host.js` | the page's script: the search over the catalogue, the file door (a `.prg` of the visitor's, a program picked from a `.d64`'s directory, or hex or base64 pasted in, read in the browser and sent nowhere, judged for its shape only and said as YOUR FILE; what is not a program refused with a code and a sentence), the states, the provenance, the controls | MIT |
| `d64.js` | a `.d64` disk image read for its directory and for one file's bytes: the four sizes, the sector arithmetic, the chains; no drive, since the machine has none | MIT |
| `crt.js` | a `.crt` cartridge image read as the machine reads it, for the page's words and a refusal at the door: the four hardware types the 2022 build has, the packets and banks it can hold, the 8K Normal it traps on; the machine document checks again before the emulator is asked | MIT |
| `chain.js` | the page's reads from Ethereum and what each may claim: one node of the session, named; a program as one record with its statuses; a mismatch refused. Every read of one thing is one observation through one node at one block, the block's hash recorded; a node that contradicts a pin, the chain or a contract's own invariant is set aside for the visit, one that fails in transport is demoted and the read restarts elsewhere | MIT |
| `keccak.js` | keccak-256 for the page (a stamp's seed, the older tokens' pins, selectors) | MIT |
| `scan.js` | the scan of a program file: its range and stub, whether it is BASIC, its calls into the ROMs by name, its interrupt vectors, whether it banks the ROMs out, what it reads and whether it writes the SID; byte patterns only, said so; what the firmware switch decides by under AUTO | MIT |
| `audio.js` | the page plays the machine's sound: samples pulled over the port and scheduled on the page's audio clock, paced as nopsta's player paces them | MIT |
| `bridge-client.js` | the host's side of the bridge: the seven pins in code, request ids, timeouts, a frame destroyed and rebuilt rather than recovered, the site's copies held to the pins before they are handed over | MIT |
| `parts/` | the site's copies of the emulator's four parts and the three ROMs, with `MANIFEST.json` (bytes, sha256, chain address, licence, source) | GPL-2.0-only / LGPL-3.0-or-later |
| `catalogue.json` | every program the page can load from the chain, how to fetch each and what it must match; produced by a private exporter, checkable by anyone (`CATALOGUE.md` describes it) | data |
| `boot-screen.json` | the machine's screen at READY under the pressing's firmware, row by row, as the gate reads it | data |
| `card.png` | the page's share image: that boot screen drawn from the pressing's character ROM in the site's green, by `build.py`; the site check reproduces it byte for byte | generated |
| `verify.py` | the public verifier: every line of the catalogue against the site's copies (`--offline`) and against an Ethereum node (`--rpc URL`), standard library only | MIT |
| `licenses/` | the licence texts | |
| `PROTOCOL.md` | the bridge protocol, version 1: messages, refusal codes, the trust vocabulary | |
| `LICENSES.md` | what is under which licence, and where the corresponding source is | |
| `test/` | the headless gate (`bridge.mjs`), its server with a stand-in mainnet built from the copies (`serve.mjs`), the harness page; the scan's gate (`scan.mjs`, Node alone); the disk image reader's gate (`d64.mjs`) and its image maker (`make-d64.mjs`); the cartridge reader's gate (`crt.mjs`) and its maker with a 46-byte probe cartridge of our own (`make-crt.mjs`); the verifier's gate (`test_verify.py`) and its stand-in node (`mocknode.py`) | MIT |

## Build and check

```sh
python3 machine/build.py           # the two documents
python3 build-all.py               # the whole site, this included
python3 check-site.py              # the site check: reproduces everything, holds the licence gate, runs the verifier offline
python3 machine/verify.py --offline            # the catalogue against itself and the site's copies
python3 machine/verify.py --all                # the catalogue against mainnet, through the first public node that answers (a sample of tokens without --all; --rpc URL for a node of your own)
python3 machine/test/test_verify.py            # the verifier's refusals against synthetic bytes
node machine/test/bridge.mjs       # the bridge gate in headless Chromium (needs Playwright)
```

The gate: `npm install --no-save playwright@1.56.1 && npx playwright install --with-deps chromium`.
Evidence (screenshots, `results.json`) lands in `test/evidence/`, which is
not committed. The workflow `.github/workflows/machine.yml` runs the build,
the comparison with the committed documents and the gate whenever this
folder changes; `site.yml` runs the site check on every push.

## Where the bytes come from, and what is proven by whom

Chain first, the site's copies as the fallback, and the page says which.
The copies match the hashes recorded from the chain when they were made:
those hashes are pinned in code (the machine document's for the emulator,
`bridge-client.js`'s for the emulator and the firmware), the manifest is
the record beside the files, and `build.py` and `check-site.py` hold the
files, the manifest and both sets of pins to one another offline on every
build and every push. What that proves is that the site is consistent
with its own record. That the record matches Ethereum is proven by reading
the chain: the standalone document does so every time it boots, and the
public verifier that comes with the catalogue (`verify.py`) will let anyone
re-check every hash here against a node of their choosing.
