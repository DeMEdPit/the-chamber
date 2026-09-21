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
OPENING = todo(
    "Two short paragraphs, 120-180 words. Three jobs and no others: what "
    "this system physically consists of, what a seam is, and why the page "
    "is arranged around seams. Then the numbers, which now read as evidence "
    "about something the reader has just met.")

# --------------------------------------------------------------- act 2
SYSTEM_TITLE = "The system"
SYSTEM = todo(
    "The moment the idea becomes spatial. Four nested systems; the borders "
    "between them are the seams. Enough to read the diagram below, and not "
    "one sentence more.")

COMPARE_LABEL = "Compare with the Chamber"
COMPARE = todo(
    "One or two sentences. The outer architecture barely changes between "
    "the two collections; what changes is the path by which behaviour "
    "enters the work. That is the series' argument, and it is the only "
    "reason this second diagram is here.")

# --------------------------------------------------------------- act 3
SEAMS_TITLE = "The seams"
SEAMS_INTRO = todo("One sentence or none, setting up the five that follow.")

# Per seam: a tension line, then the orientation. The tension line is the
# thing the eye lands on under the heading - it replaced "4 findings.",
# which occupied that position and said nothing.
SEAM = {
    "C64 ↔ Ethereum": {
        "tension": "One machine rations address space. The other rations computation.",
        "body": todo("60-140 words. The two ceilings, in the reader's terms. "
                     "Stop before F-001's discovery that the binding one flips."),
    },
    "C64 ↔ browser": {
        "tension": todo("the opposition, one line"),
        "body": todo("What the browser is to the machine, and why a runtime "
                     "that can never be patched changes who has to be careful."),
    },
    "Ethereum ↔ browser": {
        "tension": todo("the opposition, one line"),
        "body": todo("A page frozen on chain meets a browser that keeps moving."),
    },
    "Ethereum ↔ reader": {
        "tension": todo("the opposition, one line"),
        "body": todo("Two ways to ask a contract a question, and only one of "
                     "them is adjudicated. Stop before F-012 says which."),
    },
    "Process ↔ record — the learner": {
        "tension": todo("the opposition, one line"),
        "body": todo("Teaching is something that happens. A revision is "
                     "something that is recorded. The gap between them is "
                     "what the chain has to close without having been there."),
    },
}

# --------------------------------------------------------------- act 4
METHOD_TITLE = "The method"
METHOD = todo(
    "These came from the way the work was built and checked, rather than "
    "from a boundary between systems. Say that plainly - it is what keeps "
    "the seam idea honest, by letting it not explain everything.")

SERIES_TITLE = "The series"
SERIES = todo(
    "Not a seam either: chronology and inheritance. What each release "
    "added, what it carried forward, and what it deliberately did not do.")

# --------------------------------------------------------------- act 5
APPARATUS_TITLE = "The apparatus"
APPARATUS = todo(
    "The ending. The reader has now seen every finding; this is the "
    "machinery that makes them trustworthy, and F-019 is its claim. Roughly "
    "half the project is the proof of the other half - and that ratio is "
    "invisible from outside, which is the reason this page exists.")

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
