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
from page import render, write  # noqa: E402
from stats import CSS as STAT_CSS, stats, CHAMBER  # noqa: E402

HERE = pathlib.Path(__file__).parent
TITLE = "The Chamber — Black Paper 00"
DESC = ("Sixty-four rooms, one frozen Commodore 64 program, and a room the "
        "chain redraws at every read. The genesis of the Chamber series.")

# The room in the header banner is token 23's: a Dancer with a half wall, two
# bats and a lit candle. gallery.py points the Dancer's card at that same token.


CURRENT = "bp00"
KEY = CURRENT


def main():
    md = (HERE / "paper.md").read_text(encoding="utf-8")
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
            + stats(CHAMBER)
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

    page_css = f"""h1{{font-size:clamp(1.6rem,8vw,4.8rem);max-width:100%;overflow-wrap:break-word;margin-bottom:0}}
hr+h2{{border-top:0;padding-top:0;margin-top:30px}}
pre{{max-width:100%;overflow-x:auto}}
pre code{{display:inline-block;min-width:0;overflow-wrap:normal;word-break:normal}}
code{{overflow-wrap:anywhere;word-break:break-word}}
.room-banner{{margin:26px 0 44px;padding:0}}
{STAT_CSS}
.lede{{margin:0 0 34px;color:var(--muted);font-weight:450;line-height:1.4;
  font-size:clamp(1.15rem,4.2vw,1.45rem)}}
.room-banner img{{width:100%;height:auto;display:block;border:1px solid var(--line);
  border-radius:10px;background:#000;image-rendering:pixelated}}
{GAL_CSS}"""
    doc = render(KEY, f"""{body}""", title=TITLE, description=DESC, css=page_css,
                 image='/black-paper-00/card.png', image_alt='The Chamber — Black Paper 00')
    write(KEY, doc)


if __name__ == "__main__":
    main()
