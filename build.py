#!/usr/bin/env python3
"""Build the site's front door, index.html, from README.md.

One source: what GitHub shows on the repository page and what the site
shows are the same words, so they cannot drift. Run after editing
README.md; never hand-edit index.html.

    python3 build.py

Standard library only.
"""
import html as _html
import pathlib
import re

from md import convert
from page import render, write  # noqa: E402
from papers import (ARCH_CSS, CSS as PAPER_CSS, arch_block,  # noqa: E402
                    papers)

# ------------------------------------------------------------- switch
# One self-contained block: a section, a CSS block in papers.py, and one
# image. False and rebuild puts the page back exactly as it was.
ARCH_BLOCK = True

HERE = pathlib.Path(__file__).parent
TITLE = "The Chamber"
DESC = ("A series of Commodore 64 works that live on Ethereum, built one "
        "capability at a time.")

ETHERSCAN = "https://etherscan.io/address/"


CURRENT = "home"
KEY = CURRENT


def main():
    md = (HERE / "README.md").read_text(encoding="utf-8")
    # a github-only block: the links back to this site belong on the repo
    # page, not on the site they point at, where the footer already has them
    md = re.sub(r"<!-- github-only -->.*?<!-- /github-only -->\s*", "", md, flags=re.S)

    # the first heading and the two paragraphs under it become the hero;
    # the rest of the README is the body
    intro, rest = (md.split("\n---\n", 1) + [""])[:2]
    paras = [x.strip() for x in intro.split("\n\n") if x.strip()]
    lead = paras[1] if len(paras) > 1 else ""          # paras[0] is the H1
    body = convert("\n\n".join(paras[2:]) + "\n\n" + rest)

    # every 40-hex address in the prose becomes a link to the chain
    body = re.sub(r"<code>(0x[0-9a-fA-F]{40})</code>",
                  r'<a class="addr" href="' + ETHERSCAN +
                  r'\1" target="_blank" rel="noopener"><code>\1</code></a>', body)

    hero = (
        '<p class="kicker">THE CHAMBER</p>\n'
        "<h1>The Chamber</h1>\n"
        '<p class="lead">' + convert(lead).replace("<p>", "").replace("</p>", " ") + "</p>\n"
        # No hero buttons. The cards below ARE the call to action, and unlike
        # a button they say what you are choosing between: "read the black
        # paper" stopped meaning anything once there were two of them, and
        # the canary's chain link belongs in its own card's DETAILS row.
        + papers()
        + (arch_block() if ARCH_BLOCK else "")
    )

    page_css = f"""h1{{font-size:clamp(2.2rem,11vw,5.6rem);margin-bottom:18px}}
.lead{{font-size:1.3rem;line-height:1.5;color:var(--ink);max-width:46ch;margin:0 0 30px}}
h3{{font-size:1.28rem;margin-top:40px}}
.addr{{border:0}}
.addr code{{font-size:.82rem;word-break:break-all}}
.addr:hover code{{border-color:var(--accent);color:var(--accent2)}}
blockquote{{font-size:1.06rem}}
@media(max-width:700px){{
  .lead{{font-size:1.06rem;max-width:none}}
}}
{PAPER_CSS}{ARCH_CSS if ARCH_BLOCK else ''}"""
    doc = render(KEY, f"""{hero}
<hr>
{body}""", title=TITLE, description=DESC, css=page_css,
                 image='/card.png', image_alt='The Chamber', og_type="website")
    write(KEY, doc)


if __name__ == "__main__":
    main()
