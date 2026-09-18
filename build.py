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

HERE = pathlib.Path(__file__).parent
SITE = "https://demedpit.github.io/the-chamber"
TITLE = "The Chamber"
DESC = ("A series of Commodore 64 works that live on Ethereum, built one "
        "capability at a time.")

ETHERSCAN = "https://etherscan.io/address/"


def main():
    md = (HERE / "README.md").read_text(encoding="utf-8")
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
        '<p class="cta">'
        f'<a class="cta-main" href="{SITE}/black-paper/">READ THE BLACK PAPER</a>'
        f'<a class="cta-alt" href="{ETHERSCAN}0x6f54E1aAE0E9A679A52e5E733645cB11e0cE6127" '
        'target="_blank" rel="noopener">THE CANARY ON CHAIN</a>'
        "</p>"
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
.lead{{font-size:1.3rem;line-height:1.5;color:var(--ink);max-width:30ch;margin:0 0 30px}}
.cta{{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 8px}}
.cta a{{font:700 .76rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;
  border-radius:6px;padding:15px 22px;border:1px solid var(--line);text-decoration:none}}
.cta-main{{background:var(--accent);color:#050505;border-color:var(--accent)}}
.cta-main:hover{{background:var(--accent2);border-color:var(--accent2)}}
.cta-alt{{color:var(--ink);background:#0b0b0b}}
.cta-alt:hover{{border-color:#3d3d3d}}
h3{{font-size:1.28rem;margin-top:40px}}
.addr{{border:0}}
.addr code{{font-size:.82rem;word-break:break-all}}
.addr:hover code{{border-color:var(--accent);color:var(--accent2)}}
blockquote{{font-size:1.06rem}}
@media(max-width:700px){{
  .lead{{font-size:1.06rem;max-width:none}}
  .cta{{flex-direction:column}}
  .cta a{{text-align:center}}
}}
</style>
</head>
<body>
<main>
{hero}
<hr>
{body}
</main>
</body>
</html>
"""
    (HERE / "index.html").write_text(doc, encoding="utf-8")
    print(f"index.html {len(doc):,} bytes")


if __name__ == "__main__":
    main()
