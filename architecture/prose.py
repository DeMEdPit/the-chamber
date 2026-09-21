#!/usr/bin/env python3
"""The architecture page's reader-facing prose. Content, not code.

WHY THIS FILE EXISTS. Findings come from one private evidentiary source -
the notebook, via export-public.py, receipted and hash-pinned. The framing
around them is written for a reader and belongs on the public side, in one
place, where it can be edited and rebuilt in seconds without an export.
build.py assembles the page; this file is what the page says.

THE HOUSE STYLE, which every string below is held to:

 1. Open cold. The first sentence is the thing, never a promise to explain
    the thing.
 2. Orient, do not summarise. An introduction gives the reader the lens.
    The findings give them the discoveries.
 3. A section intro ends before its first finding becomes predictable.
 4. Define in motion - six words at first contact, then keep going.
 5. One conceptual move per paragraph.
 6. Prefer oppositions to categories. One machine rations address space;
    the other rations computation.
 7. Name the physical thing before the concept inferred from it. 42 bytes
    before "state". A hole in a PRG before "mutability".
 8. Say what it cannot do. The limit is part of the description, not a
    disclaimer bolted on the end.
 9. No absolutes for rhythm. "Nobody", "every", "nothing" are promises the
    page then has to keep two screens later.
10. Never sound impressed with yourself. The evidence is sitting right
    there; it does not need adjectives.
11. Banned: simply, just, of course, essentially, interestingly,
    importantly.

TODO markers are deliberate and visible. A paragraph that has not been
written should look unwritten on the page, not merely be absent.
"""

TODO = "TODO"


def todo(what):
    return (TODO, what)


# --------------------------------------------------------------- act 1
# Two paragraphs, not three. On a phone, three substantial paragraphs
# before the first visual break is too long a walk - and the fix is fewer
# words, never smaller type.
#
# The opening NAMES seams. The system DEFINES one. That division stops the
# two saying the same thing a short scroll apart, and it keeps the word in
# the reader's hands before the stat block says SEAMS 5.
#
# Cut from here and owed to the Ethereum ↔ browser seam, where browser
# change over time is the actual subject: "A browser has no reason to
# preserve the behaviour of either."
OPENING = """
A Commodore 64 program, a Commodore 64 recreated in software to run it,
and the page you look at both through are all held in Ethereum contracts. Ask for
one of these tokens and those pieces are assembled at the moment you ask.
Nothing we control is needed off the chain to put them back together.

That arrangement puts several systems inside one another, and each has
rules the others have never heard of. A Commodore 64 — the home computer of
1982 — has no concept of a transaction. Ethereum has no concept of a raster
line. Almost everything on this page was found at a border between two of
them. We call those borders seams, and the page is arranged around them.
"""

# --------------------------------------------------------------- act 2
SYSTEM_TITLE = "The system"
SYSTEM = """
Four systems, one inside the next. Ethereum on the outside; then the
browser; then the Commodore 64 the browser starts. At the centre, inside
the program running on that machine, sits whatever the collection put in
the gap left open for it.

A seam is a border in that picture: the place where one system hands
something to another, and the rules change.
"""

COMPARE_LABEL = "Compare with the Chamber"
# Descriptive, not interpretive. What changed and what it does to the paths
# is orientation; what the change MEANS belongs to The series, later.
COMPARE = """
The outer arrangement is almost unchanged. What differs is the centre, and
what the centre does to the ways in and out. The Chamber's gap holds a
stamp, and there is one path to it: a read. Perception's holds a learner,
and there are three.
"""

# --------------------------------------------------------------- act 3
SEAMS_TITLE = "The seams"
# None. "The following five sections are seams" adds nothing that the first
# heading and its tension line do not already say. The style sheet allows
# one sentence or none; this is the none.
SEAMS_INTRO = None

# Per seam: a tension line, then the orientation. The tension line is the
# thing the eye lands on under the heading - it replaced "4 findings.",
# which occupied that position and said nothing.
SEAM = {
    "C64 ↔ Ethereum": {
        "tension": "One machine rations address space. The other rations computation.",
        "body": """
A Commodore 64 has sixty-four kilobytes of address space and a memory map
that was settled in 1982. Whatever you want the machine to do has to fit
inside that, and the machine's own operating system is already living
there.

Ethereum's ceiling is not space but work. Every operation a contract
performs costs *gas*, and only so much of it fits in a transaction or a
call. Ask for too much at once and nothing happens at all.

Put one piece of work across both and the question "does it fit?" stops
having a single answer.
""",
    },
    "C64 ↔ browser": {
        "tension": "One was finished in 2022 and cannot be edited. "
                   "The other is rebuilt with every work.",
        "body": """
The Commodore 64 here is nopsta's emulator, written in 2022 and stored in
Ethereum contracts. That is the whole of it — there is no later version and
no patch. Whatever it does and does not do, it will do and not do for as
long as the contracts exist.

The page that starts it is ours, and a new one goes out with every work.
The two sides of this border age differently, and most of what we learned
here came from finding out what the 2022 machine can actually be asked to
do.
""",
    },
    "Ethereum ↔ browser": {
        "tension": "The page is frozen the day it ships. "
                   "The browser it opens in is not.",
        "body": """
A page stored in a contract is finished the day it goes out. The browser it
will be opened in is not: browsers change, conventions move, and something
safe today may not be in ten years. A browser has no reason to preserve the
behaviour of a machine from 1982, or of a page written in 2026.

So the question at this border is which of those dependencies are actually
dangerous — and it is easy to worry about the wrong ones.
""",
    },
    "Ethereum ↔ reader": {
        "tension": "Two ways to ask a contract a question. "
                   "The same contract answers both.",
        "body": """
Asking a contract for a token's artwork costs nothing and happens at once.
Saving something to that contract costs gas and has to be mined. The same
contract answers both, which is why most descriptions of on-chain art treat
them as one thing.
""",
    },
    "Process ↔ record — the learner": {
        "tension": "Teaching is something that happens. "
                   "A revision is something that is recorded.",
        "body": """
Someone sits at a keyboard and teaches a small learner inside the running
program. That is an event: it takes time, it happens in one browser, and
nobody else is present for it. What ends up on Ethereum is not that event.
It is a record — a starting state, a list of lessons, and a claim about
what they produced.

The chain was not there. It could not have been. Everything at this border
is about what can be established afterwards, from the record alone, by
someone who was not in the room.
""",
    },
}

# --------------------------------------------------------------- act 4
METHOD_TITLE = "The method"
METHOD = """
Not every discovery sat on a border. Some came from the way the work was
built and checked — decisions about tooling, about what to refuse, and
about how a fact gets from one place to another without changing on the
way.

They are gathered here rather than forced into a seam. The seam idea is
more useful for being allowed not to explain everything.
"""

SERIES_TITLE = "The series"
SERIES = """
Five things have gone to mainnet, each carrying something the ones before
it did not have. That sequence is not a seam either. It is chronology, and
inheritance: what was built new, what was carried forward unchanged, and
what was built a second time because the first version was not worth
reusing.
"""

# --------------------------------------------------------------- act 5
APPARATUS_TITLE = "The apparatus"
# Spare. The page has demonstrated the rigour for several thousand pixels
# by now and does not need to celebrate it. This returns to F-019 rather
# than restating it.
APPARATUS = """
Three of the layers above make the work. Most of the rest exist so that
claims about those three can be checked by someone who was not here when
they were built.

That ratio is what F-019 is about, and it is invisible from outside. It is
most of the reason this page exists.
"""

# --------------------------------------------------------- figure captions
#
# A caption says what the picture is. The description beneath it - which
# assistive technology reads in place of the picture - says what the
# RELATIONSHIP is, not what every label says. A transcript of the labels
# helps nobody.
FIG = {
    "01-the-seams.svg": {
        "caption": "The seams, in Perception",
        "desc": "Ethereum holds the work. The browser starts the Commodore 64 "
                "emulator. The Commodore 64 runs the program. Inside the "
                "program sits the perceptron. A person reads from the chain, "
                "teaches locally, and can submit a save back to it.",
    },
    "07-the-seams-chamber.svg": {
        "caption": "The same walls, in the Chamber",
        "desc": "The same four nested systems. Inside the program sits a "
                "42-byte stamp rather than a learner, and there is one way "
                "in rather than three: a read. Nothing writes.",
    },
    "05-where-the-program-lives.svg": {
        "caption": "The Commodore 64 address space, beside our program",
        "desc": "Two columns at the same scale. On the left, what the chip "
                "puts at each address. On the right, where the program sits "
                "across the same range, including the parts that fall under "
                "the ROM and I/O windows.",
    },
    "03-a-save.svg": {
        "caption": "A save, end to end",
        "desc": "Two lanes. On the left, off chain in one browser: a person "
                "teaches, lessons accumulate, and one envelope is built. On "
                "the right, on chain: nine checks in order, of which the "
                "fifth and sixth replay the lessons and compare the result "
                "to the claim. Either the head advances or the transaction "
                "reverts.",
    },
    "04-three-implementations.svg": {
        "caption": "One learner, written three times",
        "desc": "Three independent implementations - 6510 assembly inside "
                "the program, Python at build time, Solidity on chain - held "
                "to the same packaged vectors and producing the same 834 "
                "bytes.",
    },
    "06-what-each-release-added.svg": {
        "caption": "What each release added, and what it carried forward",
        "desc": "A table. One capability per row, one release per column. A "
                "named cell is where that capability first appeared or was "
                "built again; a dot is where it was carried forward "
                "unchanged.",
    },
    "02-the-layers.svg": {
        "caption": "The eight layers: artwork and apparatus",
        "desc": "Eight numbered layers from nopsta's 2022 emulator at the "
                "bottom to the written record at the top, each marked as "
                "artwork, apparatus, both, or not ours.",
    },
}
