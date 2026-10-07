#!/usr/bin/env python3
"""The play pages: a post's player card for a token of the series (an experiment, 2026-10-07).

A page like this has one job: to carry the tags a post on X reads (twitter:card
player and the Open Graph video tags) and to point the post's frame at the
machine page, already running the token's program from the chain, in its card
mode. It holds no artwork and no program; it is not a page of the site's shell
(it appears in no footer and changes no other page); it is a builder the
registry lists, so build-all writes it and check-site reproduces it byte for
byte. Isolated by the owner's word. Standard library only.

    python3 play/build.py
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from registry import SITE, SITE_NAME  # noqa: E402
from page import esc, out_root, card_version  # noqa: E402

# The card's frame: a width posts are shown at; for a card the machine's picture at that width (384 by 272) with one
# line under it, for the whole page a tall frame that holds the machine, the list of programs, the doors and the switches
WIDTH = 480
IMAGE = "/machine/card.png"   # the machine's own share card: its boot screen, held by the site check

PLAYS = (
    {
        "dir": "tony",
        "query": "work=tony&token=1",
        "card": True,
        "height": 400,
        "title": "Tony: Born for Adventure, from the chain",
        "description": "A Commodore 64 program read from Ethereum and run in your browser: the emulator nopsta stored on the chain in 2022, "
                       "the program from the token's own contract, held to its pins.",
        "line": "Tony: Born for Adventure (C64 demo), the first token of the series, read from Ethereum and run in your browser.",
    },
    {
        "dir": "machine",
        "query": "work=tony&token=1",
        "card": False,
        "height": 900,
        "title": "The Machine, from the chain",
        "description": "The Commodore 64 emulator nopsta stored on Ethereum in 2022, read from the chain and run in your browser: every program of "
                       "the series, a file of your own, the firmware from its pressing on chain.",
        "line": "The whole machine page in the post's frame: the programs of the series from the chain, a file of your own through the door, "
                "the firmware from OpenROMs pressing 1 on chain, the controls, the chain's words and the log.",
    },
)


def policy():
    return ("default-src 'none'; frame-src 'self'; img-src 'self'; style-src 'unsafe-inline'; "
            "base-uri 'none'; form-action 'none'")


def document(play):
    path = f"/play/{play['dir']}/"
    player = f"/machine/?{play['query']}" + ("&card=1" if play["card"] else "")
    image = f"{SITE}{IMAGE}{card_version(IMAGE)}"
    title, desc, HEIGHT = play["title"], play["description"], play["height"]
    assert len(title) <= 70 and len(desc) <= 200, "a post's title is at most 70 characters and its description 200"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{policy()}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="{SITE}{path}">

<meta property="og:type" content="video.other">
<meta property="og:site_name" content="{esc(SITE_NAME)}">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:video" content="{SITE}{esc(player)}">
<meta property="og:video:secure_url" content="{SITE}{esc(player)}">
<meta property="og:video:type" content="text/html">
<meta property="og:video:width" content="{WIDTH}">
<meta property="og:video:height" content="{HEIGHT}">

<meta name="twitter:card" content="player">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{image}">
<meta name="twitter:image:alt" content="READY 64 at its boot screen, in the site's green">
<meta name="twitter:player" content="{SITE}{esc(player)}">
<meta name="twitter:player:width" content="{WIDTH}">
<meta name="twitter:player:height" content="{HEIGHT}">

<meta name="theme-color" content="#39ff88">
<style>
:root{{--ink:#e8e8e3;--muted:#8f8f8a;--accent:#39ff88;--accent2:#9dffd0}}
html,body{{margin:0;background:#000;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{width:min({WIDTH}px,100%);margin:0 auto;padding:24px 0 60px}}
.kicker{{font:700 .76rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);letter-spacing:.16em;margin:0 16px 14px}}
.kicker a{{color:inherit;text-decoration:none}}
iframe{{display:block;width:100%;height:{HEIGHT}px;border:0;background:#000}}
p{{margin:14px 16px 0;font-size:.95rem;line-height:1.5;color:var(--muted)}}
a{{color:var(--accent2)}}
</style>
</head>
<body>
<main>
<p class="kicker"><a href="/">THE CHAMBER</a> · PLAY</p>
<iframe src="{esc(player)}" title="the machine, playing {esc(play['title'])}" allow="autoplay"></iframe>
<p>{esc(play['line'])}{" This is the post's player; " if play["card"] else " "}<a href="/machine/?{esc(play['query'])}">{"the whole page" if play["card"] else "Open it on its own page"}</a>{" has the controls, the chain's words and the log." if play["card"] else "."}</p>
</main>
</body>
</html>
"""


def main():
    for play in PLAYS:
        target = out_root() / "play" / play["dir"] / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        doc = document(play)
        target.write_text(doc, encoding="utf-8")
        print(f"play/{play['dir']}/index.html {len(doc):,} bytes")


if __name__ == "__main__":
    main()
