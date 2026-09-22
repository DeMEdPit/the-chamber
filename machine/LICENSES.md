# Licences in `machine/`

This folder is the one place on the site that is not MIT. What is what:

## GPL-2.0-only: the machine document and the emulator

- `src/core.html`, and the two documents built from it, `core.html` and
  `standalone.html`. The player glue (binding, video, audio, keyboard
  matrix, typing, program injection) derives from nopsta's own GPL example
  player (`minimal64/example/`) by way of the READY 64 launcher core, so it
  carries the same licence. Each file is marked
  `SPDX-License-Identifier: GPL-2.0-only`.
- `parts/gzip.bin`, `parts/m64-0.bin`, `parts/m64-1.bin`, `parts/m64-2.bin`:
  minimal64, the Commodore 64 emulator nopsta stored on Ethereum in 2022,
  copied byte for byte from the four contracts named in `parts/MANIFEST.json`
  (the payload after each contract's STOP byte) and redistributed unchanged.
  The build proves each copy against its sha256 before it writes anything.

The text is `licenses/GPL-2.0.txt`. nopsta's LICENSE file is the GPL-2.0
text with no statement of his own about later versions, so the derived work
is marked `GPL-2.0-only`, the conservative reading.

Corresponding source: the emulator's source is
<https://github.com/nopsta/minimal64>. The bytes on chain are his 2022 build
of it (Emscripten to WebAssembly and JavaScript, gzipped, base64 in a data
URI for the gunzip helper). We did not build them and do not alter them; we
read them in place. The machine document's own source is `src/core.html`
in this repository.

## LGPL-3.0-or-later: the firmware

- `parts/kernal.rom`, `parts/basic.rom`, `parts/chargen.rom`: OpenROMs, the
  free Commodore 64 ROM replacement by the MEGA65 project,
  <https://github.com/MEGA65/open-roms>, at commit
  `ad178dbe4d48cd6a317737a8e0e7e662f7e33d32`, assembled with the project's
  ACME fork (<https://github.com/MEGA65/acme>, commit
  `dbddab48a1eaaeee41333178a8964aec23e84961`), configuration
  `src/,,config_c64.s`, by
  `make build/kernal_c64.rom build/basic_c64.rom build/chargen_openroms.rom`.
  These are the bytes of **OpenROMs pressing 1** on Ethereum (release root
  `0xE0a71d57FB514C8f5793e26937559935350b3406`, 2026-09-03), whose ROM set
  contract states the same three sha256 values; the manifest names the
  blob each one was read from.

The texts are `licenses/LGPL-3.0.txt` and, because the LGPL is a set of
permissions on top of it, `licenses/GPL-3.0.txt`.

Corresponding source: on chain, the pressing's full source archive under the
release root (its README explains the offline rebuild); on GitHub,
<https://github.com/DeMEdPit/openroms-ethereum-pressing-1> and the upstream
repository at the commit above.

## MIT: the host side

`build.py`, `bridge-client.js`, `test/`, `README.md`, `PROTOCOL.md` and
this file, and the site's page that will host the machine, are the site's
own work under the repository's MIT licence. They talk to the machine
document over a port and are not derived from it.

## What the site says

The site's footer and README say: MIT, except the machine document
(GPL-2.0) and the firmware it loads (LGPL-3.0-or-later). The site check
refuses a build in which any of this is missing.
