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
| `bridge-client.js` | the host's side of the bridge: the seven pins in code, request ids, timeouts, a frame destroyed and rebuilt rather than recovered, the site's copies held to the pins before they are handed over | MIT |
| `parts/` | the site's copies of the emulator's four parts and the three ROMs, with `MANIFEST.json` (bytes, sha256, chain address, licence, source) | GPL-2.0-only / LGPL-3.0-or-later |
| `licenses/` | the licence texts | |
| `PROTOCOL.md` | the bridge protocol, version 1: messages, refusal codes, the trust vocabulary | |
| `LICENSES.md` | what is under which licence, and where the corresponding source is | |
| `test/` | the headless gate (`bridge.mjs`), its server with a stand-in mainnet built from the copies (`serve.mjs`), the harness page | MIT |

## Build and check

```sh
python3 machine/build.py        # the two documents
python3 build-all.py            # the whole site, this included
python3 check-site.py           # the site check: reproduces everything and holds the licence gate
node machine/test/bridge.mjs    # the bridge gate in headless Chromium (needs Playwright)
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
