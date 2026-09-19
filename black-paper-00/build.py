#!/usr/bin/env python3
"""Build Black Paper 00 (The Chamber) from paper.md.

Generated: edit paper.md and re-run. Never hand-edit index.html.

    python3 black-paper-00/build.py
"""
import html as _html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from md import convert  # noqa: E402
from gallery import gallery, CSS as GAL_CSS  # noqa: E402
from footer import CSS as FOOT_CSS, footer  # noqa: E402

HERE = pathlib.Path(__file__).parent
SITE = "https://demedpit.github.io/the-chamber"
TITLE = "The Chamber — Black Paper 00"
DESC = ("Sixty-four rooms, one frozen Commodore 64 program, and a room the "
        "chain redraws at every read. The genesis of the Chamber series.")

# The room in the header banner is token 23's: a Dancer with a half wall, two
# bats and a lit candle. gallery.py points the Dancer's card at that same token.


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

    # Same as Black Paper 01: the opening line is a subtitle, not a pull-quote.
    # It stays a blockquote in paper.md and is lifted here into a plain lede,
    # without the green rule and the panel. ONLY the first - the pull-quote and
    # the two source quotations further down keep their bar.
    m = re.search(r"<blockquote>(.*?)</blockquote>", body, re.S)
    if not m:
        raise SystemExit("build: the opening line is gone from paper.md")
    body = (body[:m.start()]
            + '<p class="lede">' + re.sub(r"</?strong>", "", m.group(1)) + "</p>"
            + body[m.end():])

    # The eight characters close the behaviours section, so the ladder
    # introduces them as data and the cards show them as portraits. The live
    # token embed that used to sit here was removed: this collection's render
    # costs about 61M gas and public RPCs cap eth_call at 50M, so it could not
    # load. These thumbnails are files - no provider, no gas, no cap.
    anchor = "<h2>The dice came off the sound chip</h2>"
    assert anchor in body, "gallery anchor missing from paper.md"
    body = body.replace(anchor, gallery() + "\n" + anchor, 1)

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
.lede{{margin:0 0 34px;color:var(--muted);font-weight:450;line-height:1.4;
  font-size:clamp(1.15rem,4.2vw,1.45rem)}}
.room-banner img{{width:100%;height:auto;display:block;border:1px solid var(--line);
  border-radius:10px;background:#000;image-rendering:pixelated}}
{GAL_CSS}
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
