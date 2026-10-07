# The play pages (an experiment, 2026-10-07)

A post on X can carry a player: a page that declares `twitter:card` `player`
and names a secure page for the post's frame. These pages are that, one per
token, pointing the frame at [the machine page](../machine/) in its card
mode (`?card=1`: the machine first and alone, one line under it, everything
else hidden), already running the token's program from the chain. They hold
no artwork and no program.

What is on chain and read live: the emulator (nopsta's four 2022 contracts),
the firmware when asked, and the program. What is not: this page and its
domain (GitHub Pages), the machine page's own scripts, the public RPC
endpoints, and X's crawler, frame, cache and any approval of its own.

Isolated by design: a builder that is not a page of the site's shell, so it
appears in no footer and changes no other page; `check-site.py` reproduces
it byte for byte. Its gate, `test/frame.mjs`, frames the machine page at the
card's size inside a stand-in post on a synthetic chain and proves the
machine boots, the sound starts on a tap on the page, keys reach the
machine, and the ring works on a touch screen. The workflow
`.github/workflows/play.yml` runs it.

To try it: post the address of a play page from an account you can afford
to test with (a fresh query string on each attempt, since X caches a link's
card), expand the post on the desktop web, and tap the card in the phone
app. Nothing here posts anything.

    python3 play/build.py
    node play/test/frame.mjs
