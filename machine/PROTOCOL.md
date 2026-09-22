# The bridge protocol, version 1

The machine document (`machine/core.html`, built from `machine/src/core.html`)
runs in a frame sandboxed to scripts only. A host page speaks to it over one
`MessagePort`. This is the whole conversation. It is a Commodore 64 protocol
(PRG files, ROM sets, joystick bits) and claims nothing more general.

**The rule of growth.** A new capability is a new entry in `hello` and a new
message. An existing message never changes meaning, a refusal code never
changes meaning, and a host that knows only version 1 keeps working against
a later machine document. A host renders its controls from `hello`, never
from assumptions.

## Transport

1. The host creates the frame with `sandbox="allow-scripts"` and the machine
   document as `src`. The document's origin is opaque, so it cannot read the
   host's storage or DOM, and its own policy (`connect-src data:`, nothing
   else: the emulator fetches its WebAssembly from a data URL inside its own
   script, and a data URL reaches no network) forbids every connection to a
   network.
2. On the frame's `load`, the host creates a `MessageChannel` and posts
   `{v: 1, type: 'port'}` to the frame's window with one port transferred,
   target origin `*` (the message carries only the port). The machine
   accepts the first port it is given, from its parent only.
3. Everything after runs on the port. Bytes travel as `ArrayBuffer`s,
   transferred, never interpolated into markup or script.

Every message is a plain object with `v: 1` and a string `type`. A request
from the host carries an integer `id`; the machine answers it with exactly
one reply carrying the same `id`. Messages from the machine without an `id`
are events.

## The handshake

The machine sends `hello` as soon as it holds the port:

```json
{"v": 1, "type": "hello", "protocol": 1, "machine": "minimal64-2022",
 "build": "embedded", "phase": "waiting",
 "capabilities": {"loads": ["prg"], "input": ["keyboard", "joystick2"],
                  "firmware": true, "screenText": true, "peek": true,
                  "poke": true, "snapshots": false},
 "limits": {"prg": 65538, "text": 4096, "machine": 1048576, "peek": 65536}}
```

`phase` is `waiting` (the embedded build, before its bytes) or `running`
(a standalone build that a host attached to after it booted itself; do not
send `machine` to it). `loads` grows in a later phase (`crt`, `d64prg`); a
host offers only what it lists.

## Requests and replies

| request | fields | reply |
|---|---|---|
| `machine` | `parts`: four `ArrayBuffer`s, the emulator's parts in the manifest's order; `roms`: `{kernal, basic, chargen}` `ArrayBuffer`s (8192, 8192, 4096 bytes) or `null` for the bare machine | `ready {emulator, hashes, firmware, ms}` — `hashes` is `checked` when the document verified every part against its own pins, `unchecked` when it had no `crypto.subtle` |
| `load` | `kind`: one of `capabilities.loads`; `bytes`: `ArrayBuffer`; `label`: string | `loaded {label, load, bytes, intervened}` — `load` is the two-byte load address |
| `reset` | | `ok` |
| `input` | `mode`: `keyboard` or `joystick` (what the arrow keys feed) | `ok {input}` |
| `joystick` | `bit`: 1 up, 2 down, 4 left, 8 right, 16 fire; `down`: boolean; port 2 | `ok` |
| `type` | `text`: string, typed through the keyboard matrix with human timing; `\n` is RETURN | `ok {typed}` when done |
| `screen` | | `screen {text}` — the 25 rows of screen memory as text |
| `peek` | `addr`: 0..65535; `length`: 1..65536, default 1 | `value {addr, value, bytes}` — `bytes` an `ArrayBuffer` |
| `poke` | `addr`, `value` | `ok {intervened: true}`; refused `LAB_OFF` unless `lab` is on |
| `lab` | `on`: boolean | `ok {lab}` |
| `state` | | `state {phase, build, mode, input, firmware, program, intervened, lab, error}` |

Any request may be answered with `refused {code, text}` instead. The text
may improve; the code is stable and is what tests and hosts read.

## Events

| event | when |
|---|---|
| `hello` | the port is held |
| `status {text}` | a line of progress, as the standalone shows at its foot |
| `intervened {addr}` | once, on the first write that lands through `poke` |
| `error {text, phase}` | an uncaught error in the document, a WASM fault included; the host should destroy the frame and rebuild it, never recover it |

## Reads, writes and INTERVENED

Reads (`screen`, `peek`, `state`) are always allowed: an instrument reads
and never writes. A write (`poke`) is refused with `LAB_OFF` until the host
sends `lab {on: true}`. The first write that lands makes the document
INTERVENED for its whole life: `loaded`, `state` and the `intervened` event
say so, and a run reached through such a state is not the program's own
run. The way back is a fresh frame.

## Refusal codes

| code | produced by |
|---|---|
| `BAD_MESSAGE` | a message that is not `{v: 1, type, ...}` or a field outside its schema |
| `UNKNOWN_MESSAGE` | a `type` this version does not have |
| `NOT_READY` | a request that needs a running machine before there is one |
| `ALREADY_STARTED` | a second `machine` |
| `HASH_MISMATCH` | a part whose sha256 is not its pin; the machine does not run |
| `START_FAILED` | the parts did not run as an emulator |
| `KIND_UNSUPPORTED` | a `load` whose `kind` is not in `capabilities.loads` |
| `FILE_TOO_LARGE` | bytes beyond the stated limit |
| `PRG_TOO_SHORT` | fewer than three bytes |
| `PRG_ADDRESS_OVERFLOW` | load address plus payload past 64K |
| `LAB_OFF` | a write without `lab` on |
| `BUSY` | `type` while a previous `type` is still being typed |
| `INTERNAL` | an exception inside a handler |

Reserved for the host page and the catalogue, with the same stability:
`CRT_8K_NORMAL_UNSUPPORTED`, `CRT_TYPE_UNSUPPORTED`, `DISK_MULTILOAD_UNAVAILABLE`,
`DISK_CHAIN_INVALID`, `RPC_UNAVAILABLE`, `STAMP_INCONSISTENT`,
`ROM_INTERNAL_CALL_UNPINNED`. The host's bridge client adds `TIMEOUT`,
`FRAME_GONE`, `NO_HELLO`, `POST_FAILED`, `SITE_COPY_MISSING`,
`MANIFEST_VERSION`, `MANIFEST_INCOMPLETE`.

## The trust vocabulary

Every program and every byte a host runs or shows carries exactly one
status, held as constants in `bridge-client.js`:

| status | meaning |
|---|---|
| `PINNED` | the bytes match a commitment the page knew before it asked |
| `CONTRACT-CONSISTENT` | the bytes match a commitment the same node reported in the same session |
| `NODE-REPORTED` | a dynamic fact one node stated, taken as stated |
| `YOUR FILE` | no chain claim made |
| `PROOF-VERIFIED` | reserved; when used it names the proposition proved and the verifier |

"Verified" never means more than the mechanism establishes.

## Limits

`prg` 65,538 bytes (a load address and 64K); `text` 4,096 characters;
`machine` 1,048,576 bytes across the parts; `peek` 65,536 bytes. A host
should also keep a watchdog: a request that goes unanswered is a hung
frame, to be destroyed and rebuilt.
