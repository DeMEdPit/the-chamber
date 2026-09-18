# The Chamber

> **Sixty-four rooms. One program. No learning at all — on purpose.**

**The Chamber** is the first collection in the Chamber series: sixty-four
ERC-721 tokens over one frozen Commodore 64 program, deployed to Ethereum
mainnet on 8 September 2026 and locked. Each token is a room with a
character in it. The program is the same for all sixty-four. What differs is
who stands in the room, and what the room looks like when you open it.

It began as a question about two machines. nopsta stored a working
Commodore 64 — the emulator **minimal64** — inside Ethereum contracts in
2022. Could that machine and the chain it sits on be one work rather than
two? Not a C64 hosted on Ethereum, and not a picture of a C64 with chain
data pasted beside it, but a token that **runs a real Commodore 64 and reads
the chain at the same time**, with the chain's answer visible on the screen.

The Chamber is that experiment, and it is deliberately the simplest version
of it: behaviour that a person wrote, running on a machine that boots from
chain state, in a room the chain redraws at every read.

---

## A room that is never the same twice

Nothing about a Chamber token is stored per render, and nothing is fetched.
When someone calls `tokenURI(id)`, the contract takes the previous block's
hash, mixes it with the token id, and stamps the result into the running
program's parameter block before the machine boots.

So the room is drawn from the chain, every time, and it is never quite the
same twice: the pattern of the back wall, where the bats hang, where the
candle stands.

And yet the token's **traits never change**. Three bytes of that seed are
forced to values fixed in the contract at deployment — the token's wall, its
bats, its candle. A token that says *dense wall, two bats, lit* shows a dense
wall with two bats and a lit candle, on any block, for ever. Only the
arrangement moves.

> **The room is never the same twice, and the metadata never lies.**

That distinction is the whole trick, and it is the reason the block can be
allowed anywhere near the artwork at all.

---

## Eight behaviours, not one

Sixty-four tokens run one program, but they do not all do the same thing.
Eight authored behaviour systems are distributed across the collection as a
ladder rather than a matrix:

```text
the Shadow    12        the Echo      8        the Dancer   3
the Wanderer  12        the Mirror    8        the Glitch   1
the Sleeper   12        the Shy       8
```

Colour is bound to the character, not rolled separately, so a Dancer is
always cyan. The Glitch is the only one that cycles.

Two rules were applied to the table by hand, and they are the kind of thing
that only matters if you care: **the darkest ordinary room — dense wall, no
bats, dim — exists exactly once in the collection, and it belongs to a
Dancer. No two Dancers share a wall.** A token without a candle is a dim
room for life.

The Glitch is one of one: a blackout wall, no bats, no candle, a colour that
will not settle, and it is the only character that plays the intro tune.

---

## The dice came off the sound chip

This is the part worth telling, because it is where the two machines met and
one of them had to give way.

The Commodore 64 has a standard source of randomness, and nearly every C64
game that needs one uses it. Register `$D41B` is read-only and returns the
top eight bits of the SID's **voice three oscillator**. Set voice three to
noise at a high frequency and every read hands you a fresh byte. Bit 7 of
`$D418` silences that voice while leaving its oscillator running, so the
classic arrangement is: voice three muted, read once a frame for the dice,
and the music written for two voices.

Both facts are reproduced faithfully by the emulator on chain, quirks
included — if voice three is routed through the filter, the mute does
nothing and it sounds anyway.

The Wanderer and the Glitch, the two characters that need to keep moving,
were rolling on exactly that. Which meant a choice: keep the dice and write
the music for two voices, or keep three voices and find the randomness
somewhere else.

They found it somewhere else. **The dice come off the sound chip.** `$D41B`
is now read nowhere in the program. The shift register is seeded instead
from four bytes of the seed the contract stamps in — bytes 3, 15, 20 and 28,
which the contract deliberately leaves untouched when it forces the trait
bytes.

Those four bytes come from the block hash.

> So the two characters who cannot hold still take their randomness from
> Ethereum, and the SID gets all three of its voices back.

That was not the plan at the start. It is the answer the two machines
arrived at, and it is a better one than the plan.

---

## The machine stays open

A Chamber token is a real Commodore 64, not a rendering of one. Hold the
right place on the page and a door opens: the machine will take a `.prg`
from your own disk and run it. Drag and drop works too. Neither is
advertised on the page, because the artwork is the room, not the loader —
but the machine underneath was never closed.

That capability is inherited rather than invented. **READY 64**, released
alongside the proof-of-concept token in August 2026, is a Commodore 64
assembled entirely from Ethereum with the keyboard handed to you. The
Chamber keeps the door and shuts the front of it.

It is also the boundary between the first collection and the second: the
Perception Chamber's page carries no loader at all, on purpose. That
mechanic is the Chamber's and stays here.

---

## Authored, not learned

There is no learner in The Chamber. Nothing is trained, nothing adapts,
nothing remembers a viewer. The Shadow does what a person wrote the Shadow
to do, and will do it identically in a hundred years.

That is not a limitation the collection is apologising for. It is the
**baseline the series is measured against.** The Chamber establishes what an
authored behaviour system on this stack looks like when it is done
carefully: deterministic, inspectable, complete, and finished the day it was
locked.

The Perception Chamber is the departure. Same machine, same discipline, but
its Tony has a mind that a person teaches and the chain replays, and its
weights change. Reading the two together, the question the series is actually
asking becomes visible — **what is the difference between behaviour that was
written and behaviour that was learned, when both are running on the same
frozen machine?**

The Chamber is the before.

---

## What is on chain

The program lives in data contracts and is reassembled at render, its hash
asserted at deployment. The eight images are stored the same way, each
refusing to deploy unless its bytes match a recorded size and hash. The
sixty-four-row table is a constant in the contract, so the collection is the
same collection row for row wherever it is deployed. The emulator is
nopsta's, read in place from his 2022 contracts.

Every token was minted in the constructor and the collection is **locked**:
no owner, no minter, no setter, no upgrade, no path by which any of it can
be repointed or taken down.

`0x75FD5A9c4440c38561A0099B216F825b7C6db924` — mainnet, 8 September 2026.

---

## Credits and licences

**Tony: Born for Adventure** — game code Maciej Małecki, graphics Rafał
Dudek, music Sami Juntunen. MIT.
<https://github.com/maciejmalecki/tony-demo>

**minimal64** — the C64 emulator, by nopsta. GPL-2.0.
<https://github.com/nopsta/minimal64>

**Character set** — the OpenROMs character ROM, LGPL-3.0-or-later.
<https://github.com/MEGA65/open-roms>

None of this would exist without **nopsta**, who stored the machine on
Ethereum in 2022 and has since passed away. The Chamber series was created
independently afterward, as an exploration of—and tribute to—the open
computational infrastructure he left for others to use.

The Chamber series, its contracts and its pages are by CypherDAO, 2026,
under the MIT licence.
