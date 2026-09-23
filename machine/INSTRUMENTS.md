# The instruments

An instrument is a read-only layer the page can lay over the machine's
picture and show in THE INSTRUMENTS card. It reads data the page already
holds, or reads the machine through the bridge, and never writes to it:
a run with instruments on stays PURE, and NOW PLAYING and the provenance
name the layers that are on. This document is the open part: anyone can
build one against it and the protocol (`PROTOCOL.md`), and one enters the
page by pull request under MIT, listed in `instruments.json`.

## The two modes

- **PURE**: nothing on this page reads or reaches into the machine beyond
  what is needed to show it; the picture is the machine's alone.
- **INSTRUMENTS**: the instruments that are on read and draw; nothing is
  written. The provenance carries `mode` and `layers`.

A work whose own page shows instruments shows them here on arrival, at
the places its page keeps them, from the catalogue's facts (`program.
instruments`, a list of `{id, place}`); anything else starts PURE. A
shared link carries a mode (`?mode=pure`, `?mode=instruments`); nothing
is remembered across visits. Each instrument has its own switch, kept for
the visit and gated under PURE.

THE CHAIN STRIP is a status instrument over the page's own chain session,
not a read of the machine; it may stay visible under PURE, and its switch
is visibility alone: hiding it never changes what is read, verified or
recorded.

## The manifest (`instruments.json`)

| field | meaning |
|---|---|
| `id` | a lowercase word, the instrument's key |
| `name`, `title` | the row's name in the card; the panel's title over the picture |
| `group` | what it reads from: `sound`, `program`, `chain` |
| `needs` | what it needs of the machine: `audio` (the sound already on), `peek` (a read of memory), or nothing |
| `requires` | what it requires of the program: `brain025`, `chamber-stamp`, or nothing |
| `module` | the module under `instruments/` that draws it |
| `face` | the panel's size over the picture: `quarter` or `wide` of the picture's width, one band tall |
| `compact` | whether the card's row carries a readout |
| `reads` | one line, in the page's words, of what it reads and that it writes nothing |
| `host` | true for a status instrument over the page itself |

## Rules

- An instrument reads RAM only, never an I/O register: a CPU read of some
  registers changes the machine.
- Nothing is read while an instrument is off or the mode is PURE.
- The sound's instruments read the buffer the page is playing now, kept
  by `audio.js` with its start time, and never ask the machine for
  samples of their own.
- A panel sits in one of the picture's four border bands (`top-left`,
  `top-right`, `bottom-left`, `bottom-right`): a work's own instrument
  where its page keeps it, an added one in the next free band; a visitor
  may drag it anywhere, and it stays there for the visit.
- The layer over the sandboxed frame takes no pointer events but on a
  panel's title bar; the machine never sees a panel.
