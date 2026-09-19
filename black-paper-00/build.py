#!/usr/bin/env python3
"""Build Black Paper 00 (The Chamber) from paper.md.

Generated: edit paper.md and re-run. Never hand-edit index.html.

    python3 black-paper-00/build.py
"""
import html as _html
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from md import convert  # noqa: E402
from token_embed import embed  # noqa: E402
from footer import CSS as FOOT_CSS, footer  # noqa: E402

HERE = pathlib.Path(__file__).parent
SITE = "https://demedpit.github.io/the-chamber"
TITLE = "The Chamber — Black Paper 00"
DESC = ("Sixty-four rooms, one frozen Commodore 64 program, and a room the "
        "chain redraws at every read. The genesis of the Chamber series.")

# token 23 is a Dancer with a half wall, two bats and a lit candle - the room
# in the header is that room, so the live token is the same one
TOKEN = "0x75FD5A9c4440c38561A0099B216F825b7C6db924"
TOKEN_ID = 23


CURRENT = "bp00"


def main():
    md = (HERE / "paper.md").read_text(encoding="utf-8")
    css = (ROOT / "black-paper" / "paper.css").read_text(encoding="utf-8")
    body = convert(md)

    banner = (
        '<figure class="room-banner">'
        '<img src="room.svg" alt="A Chamber room: stone pillars either side, a '
        'brick back wall, and a lit candle at the centre" '
        'width="320" height="66" decoding="async">'
        "</figure>"
    )
    body = body.replace("</h1>", "</h1>\n" + banner, 1)

    token = embed(
        TOKEN, TOKEN_ID, "The Chamber #23, live from Ethereum",
        "read from Ethereum mainnet at the moment you press it",
        "The emulator, the program and this room, assembled from chain state. "
        "The wall, the bats and the candle are drawn from the current block, so "
        "this arrangement has never existed before and will not again.",
        "The machine is real. Hold the centre of the screen and it will take a "
        "<code>.prg</code> from your own disk and run it.")
    anchor = "<h2>What is on chain</h2>"
    body = body.replace(anchor, token + "\n" + anchor, 1)

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_html.escape(TITLE)}</title>
<meta name="description" content="{_html.escape(DESC)}">
<link rel="canonical" href="{SITE}/black-paper-00/">

<meta property="og:type" content="article">
<meta property="og:site_name" content="The Chamber">
<meta property="og:url" content="{SITE}/black-paper-00/">
<meta property="og:title" content="{_html.escape(TITLE)}">
<meta property="og:description" content="{_html.escape(DESC)}">
<meta property="og:image" content="{SITE}/black-paper-00/card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Chamber — Black Paper 00">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{_html.escape(TITLE)}">
<meta name="twitter:description" content="{_html.escape(DESC)}">
<meta name="twitter:image" content="{SITE}/black-paper-00/card.png">

<meta name="theme-color" content="#39ff88">
<style>
{css}
h1{{font-size:clamp(1.6rem,8vw,4.8rem);max-width:100%;overflow-wrap:break-word;margin-bottom:0}}
hr+h2{{border-top:0;padding-top:0;margin-top:30px}}
pre{{max-width:100%;overflow-x:auto}}
pre code{{display:inline-block;min-width:0;overflow-wrap:normal;word-break:normal}}
code{{overflow-wrap:anywhere;word-break:break-word}}
.room-banner{{margin:26px 0 44px;padding:0}}
.room-banner img{{width:100%;height:auto;display:block;border:1px solid var(--line);
  border-radius:10px;background:#000;image-rendering:pixelated}}
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
   owner approved 105), --show-h ends just past the controls: the floor lands at 450, the
   buttons run about 85px below it at this frame size, so 560 clears them
   with a small margin.
   --frame-h sizes the machine; the other two frame it. */
.token-stage{{--frame-h:960px;--lift:105px;--show-h:560px}}
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
  .token-live{{margin-inline:calc(50% - 50vw);padding:8px 0;border-left:0;border-right:0;border-radius:0}}
  .token-head{{padding-inline:18px;margin-bottom:10px}}
  .token-foot{{padding-inline:18px;margin-top:10px}}
  .token-stage{{padding:0;border-left:0;border-right:0;border-radius:0;min-height:0}}
  .token-stage:has(.token-load){{padding:26px 18px;min-height:210px}}
  .token-frame{{aspect-ratio:auto;height:68vh;max-height:680px}}
}}
{FOOT_CSS}
</style>
</head>
<body>
<main>
<p class="kicker">THE CHAMBER · BLACK PAPER 00</p>
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
