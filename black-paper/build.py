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

HERE = pathlib.Path(__file__).parent
SITE = "https://demedpit.github.io/the-chamber"

TITLE = "Perception Chamber — Black Paper 01"
DESC = ("A human teaches a perceptron inside a Commodore 64 program; Ethereum "
        "replays the same lessons and accepts the new mind only if the bytes agree.")


def inline(t):
    """Inline markdown: code, bold, italic, links, bare URLs."""
    out, parts = [], re.split(r"(`[^`]+`)", t)
    for part in parts:
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            out.append("<code>" + _html.escape(part[1:-1]) + "</code>")
            continue
        p = _html.escape(part)
        p = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)",
                   r'<a href="\2" target="_blank" rel="noopener">\1</a>', p)
        p = re.sub(r"(?<![\"=>])\b(https?://[^\s<)]+)",
                   r'<a href="\1" target="_blank" rel="noopener">\1</a>', p)
        p = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", p)
        p = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", p)
        out.append(p)
    return "".join(out)


def convert(md):
    lines, out, i = md.split("\n"), [], 0
    fence_seen = 0
    while i < len(lines):
        ln = lines[i]

        if ln.startswith("```"):
            fence_seen += 1
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            # the cross-runtime tree is shipped as the designed figure instead
            if fence_seen == 1:
                out.append((HERE / "conformance.html").read_text(encoding="utf-8"))
            else:
                out.append("<pre><code>" + _html.escape("\n".join(buf)) + "</code></pre>")
            continue

        if ln.startswith("#"):
            lvl = len(ln) - len(ln.lstrip("#"))
            out.append(f"<h{lvl}>{inline(ln[lvl:].strip())}</h{lvl}>")
            i += 1
            continue

        if ln.strip() == "---":
            out.append("<hr>"); i += 1; continue

        if ln.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip(">").strip()); i += 1
            out.append("<blockquote>" + inline(" ".join(buf).strip()) + "</blockquote>")
            continue

        m = re.match(r"^(\d+)\.\s+(.*)", ln)
        if ln.startswith("- ") or m:
            ordered = bool(m)
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines):
                cur = lines[i]
                mm = re.match(r"^(\d+)\.\s+(.*)", cur)
                if cur.startswith("- "):
                    items.append(cur[2:].rstrip()); i += 1
                elif mm and ordered:
                    items.append(mm.group(2).rstrip()); i += 1
                elif cur.startswith("   ") and cur.strip() and items:
                    items[-1] += "<br>" + cur.strip(); i += 1
                else:
                    break
            body = "".join("<li>" + inline(x) + "</li>" for x in items)
            out.append(f"<{tag}>{body}</{tag}>")
            continue

        if not ln.strip():
            i += 1; continue

        buf = []
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(
                ("#", ">", "- ", "```", "---")) and not re.match(r"^\d+\.\s", lines[i]):
            buf.append(lines[i].strip()); i += 1
        out.append("<p>" + inline(" ".join(buf)) + "</p>")
    return "\n".join(out)


def main():
    md = (HERE / "paper.md").read_text(encoding="utf-8")
    css = (HERE / "paper.css").read_text(encoding="utf-8")
    body = convert(md)

    # the banner: the owner's original mindprint field, kept at his direction
    # (2026-09-18). It is the decorative grid, not a rendering of this token's
    # weights, so nothing here claims that it is. Served as its own cacheable
    # file rather than inlined, which keeps the document itself small.
    banner = (
        '<figure class="mindprint-banner">'
        '<img src="mindprint.svg" alt="The Perception Chamber mindprint: a field '
        'of cells flashing and settling" width="2004" height="220" decoding="async">'
        '</figure>'
    )
    # place it directly after the opening h1/h2 pair
    body = re.sub(r"(</h2>)", r"\1\n" + banner.replace("\\", "\\\\"), body, count=1)

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
<meta property="og:image" content="{SITE}/card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Perception Chamber — Black Paper 01">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{_html.escape(TITLE)}">
<meta name="twitter:description" content="{_html.escape(DESC)}">
<meta name="twitter:image" content="{SITE}/card.png">

<meta name="theme-color" content="#39ff88">
<style>
{css}
.mindprint-banner{{margin:26px 0 44px;padding:0}}
h1{{font-size:clamp(1.6rem,8vw,4.8rem);max-width:100%;overflow-wrap:break-word}}
hr+h2{{border-top:0;padding-top:0;margin-top:30px}}
pre{{max-width:100%;overflow-x:auto}}
pre code{{display:inline-block;min-width:0;overflow-wrap:normal;word-break:normal}}
code{{overflow-wrap:anywhere;word-break:break-word}}
.mindprint-banner img{{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:10px;background:#0a0a0a}}
.mindprint-banner figcaption{{margin-top:12px;color:var(--muted);font-size:.86rem}}
</style>
</head>
<body>
<main>
<p class="kicker">THE CHAMBER · BLACK PAPER 01</p>
{body}
</main>
</body>
</html>
"""
    (HERE / "index.html").write_text(doc, encoding="utf-8")
    print(f"index.html {len(doc):,} bytes")


if __name__ == "__main__":
    main()
