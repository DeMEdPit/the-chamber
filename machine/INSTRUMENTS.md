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
| `tint` | true for an instrument whose panel takes the picture's colours under SCENE (the page reads the picture only while one is live) |

## Rules

- An instrument reads RAM only, never an I/O register: a CPU read of some
  registers changes the machine.
- Nothing is read while an instrument is off or the mode is PURE.
- The sound's instruments read the buffer the page is playing now, kept
  by `audio.js` with its start time, and never ask the machine for
  samples of their own. While the page's audio clock is stopped (a
  phone's browser stops it when the page is left) there is no buffer
  sounding: the faces say the sound is paused rather than drawing a
  stale buffer, and the page asks for the clock back when it comes
  into view; a clock that says it runs while its time stands still is
  stalled, and the next tap builds a fresh one.
- A panel sits in one of the picture's four border bands (`top-left`,
  `top-right`, `bottom-left`, `bottom-right`): a work's own instrument
  where its page keeps it, an added one in the next free band; a visitor
  may drag it anywhere, and it stays there for the visit.
- The layer over the sandboxed frame takes no pointer events but on a
  panel's title bar; the machine never sees a panel.
- A panel over the picture is the token's chassis (`instruments/chassis.js`,
  the token's own drawing kept in the picture's pixels and scaled to the
  device): a rounded body in the panel colour under a soft shadow, a pad of
  2.25 picture pixels, the title in the C64's character ROM four picture
  pixels tall (`instruments/romfont.js`, from the pressing's ROM as the page
  holds it to its pin; a plain font stands in and the page says so; the
  glyph a whole number of device pixels per ROM pixel, as large as the
  title's room on the panel allows and never larger than the device's own,
  one size across the rack's panels, a title that does not fit even at one
  trimmed as the token trims its own; the green lamp before the title six
  tenths of the letters' height and never larger than the desktop's 4.5
  CSS pixels, a gap of 0.45 of the letters to the title, the same on every
  instrument's panel), the
  minus in the corner (a plus when folded to the title), and a rounded
  window in the ground with the instrument's face clipped inside. The
  green lamp before the title is the page's own. The scope's window shows
  the token's own wave (`scope.js` `wave`: the whole buffer at one point
  per pixel, raw amplitude, a thin line, no window, trigger, gain or
  grid); the card's readout beside the frame keeps the site's closer,
  windowed drawing. Either trace is stroked in the beam of its colour
  (`scope.js` `createBeam`): the ink at the midline, its paler tint at the
  top and the bottom, so a peak reads brighter as a phosphor beam does
  where it turns. The spectrum's bars climb the ladder of the ink over the
  ground (`colour.js` `ladder`), built the way colour scales are built
  professionally, in OKLab, the perceptually uniform space CSS Color 4
  standardised: three anchors, the ink darkened three quarters of the way
  to the ground, the ink itself, and the ink paled 60 percent towards
  white; ten rungs stepped evenly in OKLab lightness from the dark anchor
  to the light one, so every step is the same size to the eye; each rung's
  colour on the path dark, ink, light, mapped into the screen's gamut by
  giving up chroma alone; the bottom rung held at least 0.06 of lightness
  above an unlit segment, so a lit rung never reads as unlit. Below the
  ink this is close to a dimmed LED, the same colour at less light; above
  it the bloom of an overdriven one. Every segment solid, one tone a rung,
  in the chassis window and in the card. The tones are the ink's own and
  are not held to the C64's palette (the owner, 2026-09-24: a finer
  gradation, matched to the scene, the retro look kept in the rungs, his
  ladder B built in OKLab); the same ladder in the site's green over its
  ground fills the card's readout, and the beam's pale end is the ladder's
  light anchor. The node gate holds the evenness (every step within 12
  percent of the mean), the hue (where the ink has one every rung has it,
  under 2 degrees of drift) and the floor to numbers. An instrument's `window(ctx, x, y, w, h, data, rate, {colours,
  k})` draws it in the chassis; its `draw(cv, data, rate)` the card's
  readout. In the card a group's rows share their columns (the group a CSS
  grid and each row a subgrid of it), so the name column is as wide as the
  longest name and the readouts are one length (his ask, 2026-09-24); a
  browser without subgrid keeps each row's own grid.
- COLOUR, drawn with the group it governs. GREEN: the site's green as the
  ink on the token's default chassis (black window, the panel `#262626`).
  SCENE: the token's own colour rule (`instruments/scene.js`, the rule its
  page uses): from the machine document's `colours`, a count of the painted
  picture per colour that touches nothing in the emulator, the ground is
  the commonest colour, the ink the next with at least 256 pixels, the
  panel the ground shaded one step (darker when light, lighter when dark);
  a one-colour picture gives a contrast ink, white on dark and black on
  light, marked synthetic and never allowed to replace colours learned
  from the picture. The page reads about once a second while INSTRUMENTS
  is on and an instrument marked `tint` is live, and adopts a reading when
  two in a row agree; a new program starts from the token's defaults
  (white on black) and learns its picture. GREEN and PURE read nothing.
  The lamp stays green. A shared link carries the choice (`?colour=scene`);
  the provenance carries `colour`, `ink`, `ground`, `panel` and `from`
  (`site`, `picture`, `contrast` or `defaults`).
