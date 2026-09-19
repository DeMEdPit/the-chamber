#!/usr/bin/env python3
"""Build index.html from paper.md.

The paper is GENERATED. Edit paper.md and re-run this; never hand-edit
index.html. The first version of this document drifted from its source in
five places, including a missing attribution, which is the whole reason
this script exists.

    python3 black-paper/build.py

Standard library only.
"""
import html as _html
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from md import convert, inline  # noqa: E402
from token_embed import embed  # noqa: E402
from footer import CSS as FOOT_CSS, footer  # noqa: E402

HERE = pathlib.Path(__file__).parent
SITE = "https://demedpit.github.io/the-chamber"

TITLE = "Perception Chamber — Black Paper 01"
DESC = ("A human teaches a perceptron inside a Commodore 64 program; Ethereum "
        "replays the same lessons and accepts the new mind only if the bytes agree.")


CURRENT = "bp01"


def main():
    md = (HERE / "paper.md").read_text(encoding="utf-8")
    css = (HERE / "paper.css").read_text(encoding="utf-8")
    # the cross-runtime tree ships as the designed figure instead of a <pre>
    def fence(n, _text):
        if n == 1:
            return (HERE / "conformance.html").read_text(encoding="utf-8")
        return None

    body = convert(md, fence)

    # the banner: the owner's original mindprint field, kept at his direction
    # (2026-09-18). It is the decorative grid, not a rendering of this token's
    # weights, so nothing here claims that it is. Served as its own cacheable
    # file rather than inlined, which keeps the document itself small.
    banner = (
        '<figure class="mindprint-banner">'
        '<img src="mindprint.svg" alt="The Perception Chamber mindprint: a field '
        'of cells flashing and settling" width="1996" height="216" decoding="async">'
        '</figure>'
    )
    # the live token, at the end of "The mainnet canary": the section states the
    # address and claims the token was deployed, taught and saved, so the machine
    # that proves it belongs directly under the claim. Loads only on a press.
    token = embed(
        "0x6f54E1aAE0E9A679A52e5E733645cB11e0cE6127", 1,
        "Perception Chamber Canary, live from Ethereum",
        "read from Ethereum mainnet at the moment you reach it",
        "About 580 KB: the emulator, the program and the current mind, assembled "
        "from chain state. Nothing is fetched from a server.",
        "You can play and teach Tony here. <strong>You cannot save from this frame"
        "</strong> &mdash; a browser wallet cannot reach inside it, so teaching done "
        "here is not written to the chain. Saving happens on the token&rsquo;s own page.",
        auto=True)
    h = body.find("<h2>The mainnet canary</h2>")
    if h == -1:
        raise SystemExit("build: the mainnet canary section is gone; token embed has no home")
    cut = body.find("<hr>", h)
    if cut == -1:
        raise SystemExit("build: no section end found after the mainnet canary")
    body = body[:cut] + token + "\n" + body[cut:]

    # place it directly after the opening h1/h2 pair
    body = re.sub(r"(</h1>)", r"\1\n" + banner.replace("\\", "\\\\"), body, count=1)

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_html.escape(TITLE)}</title>
<meta name="description" content="{_html.escape(DESC)}">
<link rel="canonical" href="{SITE}/black-paper/">

<meta property="og:type" content="article">
<meta property="og:site_name" content="The Chamber">
<meta property="og:url" content="{SITE}/black-paper/">
<meta property="og:title" content="{_html.escape(TITLE)}">
<meta property="og:description" content="{_html.escape(DESC)}">
<meta property="og:image" content="{SITE}/black-paper/card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Perception Chamber — Black Paper 01">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{_html.escape(TITLE)}">
<meta name="twitter:description" content="{_html.escape(DESC)}">
<meta name="twitter:image" content="{SITE}/black-paper/card.png">

<meta name="theme-color" content="#39ff88">
<style>
{css}
.mindprint-banner{{margin:26px 0 44px;padding:0}}
h1{{font-size:clamp(1.6rem,8vw,4.8rem);max-width:100%;overflow-wrap:break-word;margin-bottom:0}}
hr+h2{{border-top:0;padding-top:0;margin-top:30px}}
.token-live{{margin:34px 0 44px;padding:22px;border:1px solid var(--line);background:linear-gradient(180deg,#0d0d0d,#050505);border-radius:12px}}
.token-head{{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;margin-bottom:16px}}
.token-label{{font:700 .72rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;color:var(--accent)}}
.token-note{{color:var(--muted);font-size:.84rem}}
.token-stage{{min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;border:1px solid #232323;border-radius:10px;background:#060606;padding:26px 20px}}
.token-load{{font:700 .8rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;color:#050505;background:var(--accent);border:0;border-radius:6px;padding:14px 26px;cursor:pointer}}
.token-load:hover{{background:var(--accent2)}}
.token-load:disabled{{background:#2a2a2a;color:var(--muted);cursor:default}}
.token-sub{{margin:0;max-width:52ch;text-align:center;color:var(--muted);font-size:.84rem}}
/* The page inside sizes the machine from the AVAILABLE HEIGHT, not the width -
   measured across three frames, content width stays about 0.68 of frame height -
   and it top-aligns, so a short frame starves it and leaves a void underneath.
   Desktop therefore gives the iframe far more height than it shows and clips the
   remainder: --frame-h grows the machine, --show-h is how much is kept. Tune the
   two independently. Mobile keeps its own rules below. */
/* Deriving --lift from --show-h was tried and is wrong: what the page centres
   is a content box TALLER than the visible machine, because it carries its own
   padding below the controls. Centring the window on the iframe therefore
   centres that box, not the machine, and leaves the void under the buttons.
   So the two are set by eye instead: --lift is where the machine starts (the
   owner approved 105), --show-h must clear the controls with REAL margin, not a calculated
   hair. Anything below an overflow:hidden boundary is unclickable as well as
   invisible, so a window sized to just reach the buttons makes their lower
   half dead - which is what "TRAIN does not always register" was. The floor
   lands at 450 and the buttons run about 85px below it, so they end near 535;
   600 leaves ~65px of clearance under them. Never trim this to fit.
   --frame-h sizes the machine; the other two frame it. */
.token-stage{{--frame-h:960px;--lift:105px;--show-h:600px}}
.token-frame{{width:min(100%,680px);height:var(--frame-h);margin-inline:auto;
  border:0;border-radius:8px;display:block;background:#000}}
@media(min-width:701px){{
  .token-stage:not(:has(.token-load)){{height:var(--show-h);padding:0;overflow:hidden;
    display:block;position:relative}}
  .token-stage:not(:has(.token-load)) .token-frame{{border-radius:10px;
    margin-top:calc(-1 * var(--lift))}}
}}
.token-foot{{margin:16px 0 0;color:var(--muted);font-size:.84rem}}
.token-out{{font:700 .74rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.11em;color:var(--ink);background:#0b0b0b;border:1px solid var(--line);border-radius:6px;padding:13px 20px;text-decoration:none}}
.token-out:hover{{border-color:var(--accent);color:var(--accent2)}}
@media(max-width:700px){{
  /* the machine gets the whole width of the phone: the figure escapes the text
     column and both rings of padding come off the frame, which was costing it
     about 80 of 390 pixels */
  /* One rule opens the block; the section's own <hr> below closes it. The rest
     were lines drawn twice. Full-bleed gives the stage the same width as the
     figure, so the stage's border ran 16px inside the figure's, top and
     bottom, fencing nothing - and the figure's bottom border sat a hundred
     pixels above the section rule that already ends the section. Five lines
     become two. Head, stage and foot still read apart by tone: the figure is
     #0d0d0d fading to #050505, the stage is #060606. Desktop keeps every
     border, because there the figure is an inset card with 22px of padding and
     the inner box reads as a bezel rather than a repeat. */
  .token-live{{margin-inline:calc(50% - 50vw);padding:8px 0;border:0;
    border-top:1px solid var(--line);border-radius:0}}
  .token-head{{padding-inline:18px;margin-bottom:10px}}
  .token-foot{{padding-inline:18px;margin-top:10px}}
  .token-stage{{padding:0;border:0;border-radius:0;min-height:0}}
  .token-stage:has(.token-load){{padding:26px 18px;min-height:210px}}
  /* 68vh, not 78: the C64 and its controls do not fill a taller box, and the
     remainder reads as dead space under the buttons */
  .token-frame{{aspect-ratio:auto;height:68vh;max-height:680px}}
  /* the subtitle runs to three lines at desktop size. 16px gives two balanced
     lines and stays above body-text size; one line would need 11px, which is
     smaller than the body and fills the column with no slack */
}}
pre{{max-width:100%;overflow-x:auto}}
pre code{{display:inline-block;min-width:0;overflow-wrap:normal;word-break:normal}}
code{{overflow-wrap:anywhere;word-break:break-word}}
.mindprint-banner img{{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:10px;background:#0a0a0a}}
.mindprint-banner figcaption{{margin-top:12px;color:var(--muted);font-size:.86rem}}
{FOOT_CSS}
</style>
</head>
<body>
<main>
<p class="kicker">THE CHAMBER · BLACK PAPER 01</p>
{body}
{footer(CURRENT)}
</main>
</body>
</html>
"""
    (HERE / "index.html").write_text(doc, encoding="utf-8")
    print(f"index.html {len(doc):,} bytes")


if __name__ == "__main__":
    main()
