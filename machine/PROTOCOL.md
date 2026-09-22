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
from the host carries a non-negative integer `id`; the machine answers it
with exactly one reply carrying the same `id`. A request whose `id` is not
a non-negative integer gets a refusal that carries no `id` (the host cannot
correlate it, and should not have sent it). Every field of a request is in
its schema in the table below: an unknown field, a missing required one or
a field of the wrong type is refused `BAD_MESSAGE` before anything else is
looked at. Messages from the machine without an `id` are events.

**The standalone build is not this boundary.** `standalone.html` reads
whatever RPC it is pointed at and carries no policy; it is a harness and a
copy-and-run surface, and nothing said here of the embedded document is a
claim about it.

## The handshake

The machine sends `hello` as soon as it holds the port:

```json
{"v": 1, "type": "hello", "protocol": 1, "machine": "minimal64-2022",
 "build": "embedded", "phase": "waiting",
 "capabilities": {"loads": ["prg", "crt"], "input": ["keyboard", "joystick2", "joystick1"],
                  "firmware": true, "screenText": true, "peek": true,
                  "poke": true, "audio": true, "snapshots": false},
 "limits": {"prg": 65538, "crt": 525376, "text": 4096, "machine": 1048576, "peek": 65536}}
```

`phase` is `waiting` (the embedded build, before its bytes) or `running`
(a standalone build that a host attached to after it booted itself; do not
send `machine` to it). `loads` is `prg` and `crt`; a program picked off a
disk is a `prg`. A host offers only what it lists.

## Requests and replies

| request | fields | reply |
|---|---|---|
| `machine` | `parts`: four `ArrayBuffer`s, the emulator's parts in the manifest's order; `roms`: `{kernal, basic, chargen}` `ArrayBuffer`s (8192, 8192, 4096 bytes), `null` or absent for the bare machine | `ready {emulator, emulatorStatus, firmware, firmwareSha256, ms}` — `emulatorStatus` is `PINNED`: the document verified every part against the pins it carries, and it does not run otherwise (`HASH_UNAVAILABLE` when it cannot hash, `HASH_MISMATCH` when a part differs); `firmwareSha256` is `{kernal, basic, chargen}`, the sha256 of each ROM as received, or `null`. The document holds no pin for the firmware and claims nothing about it: the host compares these hashes with what it pinned before asking, and the host's provenance says PINNED or not |
| `load` | `kind`: one of `capabilities.loads`; `bytes`: `ArrayBuffer`; `label`: string of at most 80 characters, optional | `loaded {label, load, bytes, intervened, cartridge}` — `load` is the two-byte load address of a `prg` and `null` for a `crt`; `cartridge` is `null` for a `prg` and `{type, name, exrom, game, chips, size, title}` for a `crt`. A `crt` is a .crt image the machine reads: a 64-byte header, hardware type Normal (0, one CHIP of 4K or 16K; 8K refused, since the machine's reader traps on it), Ocean Type 1 (5), C64GS (15) or Magic Desk (19) (8K CHIP packets, banks within the machine's arrays). A cartridge stays in the port for the life of the document: the build attaches one and cannot remove it, its reset boots the cartridge again, and a `prg` after it is refused `CARTRIDGE_IN_PORT`; a host that wants the machine back starts a new document |
| `reset` | | `ok` |
| `input` | `mode`: `keyboard` or `joystick` (what the arrow keys feed); `port`: 1 or 2, optional, the port the keys feed as a joystick (2 until set: the port the programs of the series read; 1 for the games that read it, Boulder Dash among them) | `ok {input, port}` |
| `joystick` | `bit`: integer, 1 up, 2 down, 4 left, 8 right, 16 fire; `down`: boolean; `port`: 1 or 2, optional, else the port set by `input` | `ok` |
| `type` | `text`: string, typed through the keyboard matrix with human timing; `\n` is RETURN | `ok {typed}` when done |
| `screen` | | `screen {text}` — the 25 rows of screen memory as text |
| `peek` | `addr`: integer 0..65535; `length`: integer 1..65536, optional, default 1 | `value {addr, value, bytes}` — `bytes` an `ArrayBuffer` |
| `poke` | `addr`: integer 0..65535; `value`: integer 0..255 | `ok {intervened: true}`; refused `LAB_OFF` unless `lab` is on |
| `lab` | `on`: boolean | `ok {lab}` |
| `audio` | `on`: boolean; `sampleRate`: integer 8000..192000 (required when on); `bufferSize`: 512, 1024, 2048, 4096 or 8192, default 4096 | `ok {audio, bufferSize, sampleRate}`. On, the host takes the sound: the document plays nothing of its own, and hands its samples over on request. A browser lets sound start only on a gesture in the document that plays it, and a host's controls are not in this one, which is why the host plays |
| `samples` | | `samples {bytes, count}` — the next `bufferSize` samples as a transferred `ArrayBuffer` of 32-bit floats at the rate given; refused `AUDIO_OFF` until `audio` is on. The host asks once per buffer it schedules, at the pace of its own audio clock, as nopsta's player does |
| `state` | | `state {phase, build, mode, input, firmware, program, intervened, lab, error}` |

Any request may be answered with `refused {code, text}` instead. The text
may improve; the code is stable and is what tests and hosts read.

## Events

| event | when |
|---|---|
| `hello` | the port is held |
| `status {text}` | a line of progress, as the standalone shows at its foot |
| `intervened {addr}` | once, on the first write that lands through `poke` |
| `error {text, phase}` | an error of the machine's own: an uncaught error in the document's script or the emulator's, an exception in the frame loop, a WASM fault. Errors from scripts other parties inject into the frame (browser extensions do) are not the machine's and are ignored. The host destroys the frame and rebuilds it, never recovers it |

## Fail closed

The document does not run an emulator it could not check: without SHA-256
it refuses `HASH_UNAVAILABLE`, on a pin mismatch `HASH_MISMATCH`, and a
start that aborts is refused `START_FAILED` rather than left hanging. The
host's client (`bridge-client.js`) destroys the frame, and rejects
everything pending with `FRAME_GONE`, when the document does not say hello
in time (`NO_HELLO`), when any request goes unanswered within its timeout
(`TIMEOUT`; a `type` request's default timeout scales with its text), when
the document reports an `error` event (`MACHINE_ERROR`), and on
`destroy()`. A hung or crashed machine is never recovered. The client also
refuses to hand over bytes that do not match the pins in its own code, and
destroys a machine whose reported firmware hashes differ from them
(`HASH_MISMATCH`) or whose emulator is reported as anything but `PINNED`
(`UNPINNED_EMULATOR`).

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
| `HASH_UNAVAILABLE` | the document cannot compute SHA-256; the machine does not run |
| `HASH_MISMATCH` | a part whose sha256 is not its pin; the machine does not run |
| `START_FAILED` | the parts did not run as an emulator |
| `KIND_UNSUPPORTED` | a `load` whose `kind` is not in `capabilities.loads` |
| `FILE_TOO_LARGE` | bytes beyond the stated limit |
| `PRG_TOO_SHORT` | fewer than three bytes |
| `PRG_ADDRESS_OVERFLOW` | load address plus payload past 64K |
| `CRT_BAD_FILE` | not a cartridge image the machine can read: no signature, a header that is not 64 bytes, a CHIP packet missing, short or not ending the file where the reader strides |
| `CRT_TYPE_UNSUPPORTED` | a hardware type the machine does not have (named when known, EasyFlash among them) |
| `CRT_8K_NORMAL` | an 8K Normal cartridge: the machine's reader would trap; repack as 16K or single-bank Magic Desk |
| `CRT_BANKS` | a Normal cartridge that is not one CHIP of 4K or 16K, or a banked cartridge with a packet that is not 8K or a bank beyond the machine's arrays |
| `CARTRIDGE_IN_PORT` | a `prg` while a cartridge is in the port |
| `LAB_OFF` | a write without `lab` on |
| `BUSY` | `type` while a previous `type` is still being typed |
| `AUDIO_OFF` | `samples` before `audio {on: true}` |
| `INTERNAL` | an exception inside a handler |

Reserved for the host page and the catalogue, with the same stability:
`CRT_8K_NORMAL_UNSUPPORTED`, `CRT_TYPE_UNSUPPORTED`, `DISK_MULTILOAD_UNAVAILABLE`,
`DISK_CHAIN_INVALID`, `RPC_UNAVAILABLE`, `STAMP_INCONSISTENT`,
`ROM_INTERNAL_CALL_UNPINNED`. The host's bridge client adds `TIMEOUT`,
`FRAME_GONE`, `NO_HELLO`, `MACHINE_ERROR`, `DESTROYED`, `POST_FAILED`,
`SITE_COPY_MISSING`, `MANIFEST_VERSION`, `MANIFEST_DRIFT`,
`UNPINNED_EMULATOR`.

## The trust vocabulary

Every program and every byte a host runs or shows carries exactly one
status, held as constants in `bridge-client.js`. A commitment counts as
"known before the page asked" only when it is in the page's code (the
machine document's pins for the emulator; the client's pins for the
emulator and the firmware): a manifest or a catalogue fetched during the
session is a record that must agree with those pins, never the commitment
itself.

| status | meaning |
|---|---|
| `PINNED` | the bytes match a commitment the page knew before it asked |
| `CONTRACT-CONSISTENT` | the bytes match a commitment the same node reported in the same session |
| `NODE-REPORTED` | a dynamic fact one node stated, taken as stated |
| `YOUR FILE` | no chain claim made |
| `PROOF-VERIFIED` | reserved; when used it names the proposition proved and the verifier |

"Verified" never means more than the mechanism establishes.

## Limits

`prg` 65,538 bytes (a load address and 64K); `crt` 525,376 bytes (a header
and 64 CHIP packets of 8K, the machine's ROML banks); `text` 4,096 characters;
`machine` 1,048,576 bytes across the parts; `peek` 65,536 bytes. A host
should also keep a watchdog: a request that goes unanswered is a hung
frame, to be destroyed and rebuilt.
