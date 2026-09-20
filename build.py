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
from footer import CSS as FOOT_CSS, footer  # noqa: E402
from papers import CSS as PAPER_CSS, papers  # noqa: E402

HERE = pathlib.Path(__file__).parent
SITE = "https://demedpit.github.io/the-chamber"
TITLE = "The Chamber"
DESC = ("A series of Commodore 64 works that live on Ethereum, built one "
        "capability at a time.")

ETHERSCAN = "https://etherscan.io/address/"


CURRENT = "home"


def main():
    md = (HERE / "README.md").read_text(encoding="utf-8")
    # a github-only block: the links back to this site belong on the repo
    # page, not on the site they point at, where the footer already has them
    md = re.sub(r"<!-- github-only -->.*?<!-- /github-only -->\s*", "", md, flags=re.S)
    css = (HERE / "black-paper" / "paper.css").read_text(encoding="utf-8")

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
    )

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_html.escape(TITLE)}</title>
<meta name="description" content="{_html.escape(DESC)}">
<link rel="canonical" href="{SITE}/">

<meta property="og:type" content="website">
<meta property="og:site_name" content="The Chamber">
<meta property="og:url" content="{SITE}/">
<meta property="og:title" content="{_html.escape(TITLE)}">
<meta property="og:description" content="{_html.escape(DESC)}">
<meta property="og:image" content="{SITE}/card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Chamber">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{_html.escape(TITLE)}">
<meta name="twitter:description" content="{_html.escape(DESC)}">
<meta name="twitter:image" content="{SITE}/card.png">

<meta name="theme-color" content="#39ff88">
<style>
{css}
h1{{font-size:clamp(2.2rem,11vw,5.6rem);margin-bottom:18px}}
.lead{{font-size:1.3rem;line-height:1.5;color:var(--ink);max-width:46ch;margin:0 0 30px}}
h3{{font-size:1.28rem;margin-top:40px}}
.addr{{border:0}}
.addr code{{font-size:.82rem;word-break:break-all}}
.addr:hover code{{border-color:var(--accent);color:var(--accent2)}}
blockquote{{font-size:1.06rem}}
@media(max-width:700px){{
  .lead{{font-size:1.06rem;max-width:none}}
}}
{PAPER_CSS}
{FOOT_CSS}
</style>
</head>
<body>
<main>
{hero}
<hr>
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
