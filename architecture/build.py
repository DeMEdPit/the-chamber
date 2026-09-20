#!/usr/bin/env python3
"""Build the architecture page from the notebook's exported findings.

Generated: `findings.json` comes from the private notebook by
`notebook/export-public.py`, and carries the commit it was taken from. This
renders it. Never hand-edit index.html, and never edit findings.json - a
claim exists in one place, and this page is a view of it.

    python3 architecture/build.py
"""
import html as _html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from footer import CSS as FOOT_CSS, footer, SITE  # noqa: E402

HERE = pathlib.Path(__file__).parent
TITLE = "The Chamber — Architecture"
DESC = ("What we learned building Commodore 64 works that live on Ethereum: "
        "findings, each with the source that backs it.")
CURRENT = "arch"

# A diagram belongs to a seam, or to the two framing sections.
# The diagrams are HTML now - boxes with labels in them, which is what HTML
# is - so they are inlined and they reflow. The one exception is 05: its bar
# heights are proportional to real addresses, which is a drawing.
MAP = {
    "C64 ↔ Ethereum": [("05-where-the-program-lives.svg",
                        "The C64 address space beside our program")],
    "Process ↔ record — the learner": [
        ("03-a-save.html", None),
        ("04-three-implementations.html", None)],
}
LEDE = ("Two machines — a Commodore 64 from 1982 and Ethereum from 2015 — and "
        "the seams between them. Everything below was found by building, and "
        "every claim names the source that backs it.")

CSS = """
.arch-lede{font-size:1.24rem;line-height:1.55;color:var(--ink);max-width:54ch;margin:0 0 34px}
.seam{margin:62px 0 0}
.seam > h2{font-size:1.12rem;letter-spacing:.06em;text-transform:none;margin:0 0 6px;
  color:var(--accent2)}
.seam > .about{color:var(--muted);font-size:.94rem;margin:0 0 26px;max-width:62ch}
.fig{margin:0 0 30px}
.fig object,.fig img{width:100%;height:auto;display:block;border:1px solid var(--line);
  border-radius:6px;background:#0b0b0b}
.fig figcaption{color:var(--muted);font-size:.8rem;margin-top:8px}
.fig figcaption a{color:var(--accent2);font-size:.78rem}
.find{border-top:1px solid var(--line);padding:22px 0 6px}
.find h3{font-size:1.02rem;margin:0 0 10px;line-height:1.35;font-weight:700}
.find h3 .fid{color:var(--accent);font:700 .74rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.09em;margin-right:10px;vertical-align:.1em}
.find h3 a.anchor{color:inherit;border:0;text-decoration:none}
.find h3 a.anchor:hover{color:var(--accent2)}
.find p{margin:0 0 12px}
.find .meta{color:var(--muted);font-size:.86rem;margin:0 0 6px}
.find .meta b{color:var(--ink);font-weight:400}
.find code{font-size:.8rem;word-break:break-word}
.asof{margin:70px 0 0;padding-top:22px;border-top:1px solid var(--line);
  color:var(--muted);font-size:.84rem}
.asof code{font-size:.8rem}
/* .fig is the one remaining drawing (05). A 920px drawing scaled to a phone
   is unreadable - the monospace lands around 4px - so below 700px it scrolls
   sideways at a legible size instead of shrinking to fit, and says so. The
   HTML diagrams need none of this: they reflow. */
@media(max-width:700px){
  .arch-lede{font-size:1.06rem;max-width:none}
  .fig{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .fig object,.fig img{min-width:680px}
  .fig figcaption a::before{content:"— "}
}
"""

INLINE = re.compile(r"`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*")


def rich(t):
    """Markdown's three inline forms, escaped everywhere else."""
    out, i = [], 0
    for m in INLINE.finditer(t):
        out.append(_html.escape(t[i:m.start()]))
        if m.group(1) is not None:
            out.append(f"<code>{_html.escape(m.group(1))}</code>")
        elif m.group(2) is not None:
            out.append(f"<strong>{_html.escape(m.group(2))}</strong>")
        else:
            out.append(f"<em>{_html.escape(m.group(3))}</em>")
        i = m.end()
    out.append(_html.escape(t[i:]))
    return "".join(out)


def card(f):
    anchor = f["id"].lower()
    bits = [f'<article class="find" id="{anchor}">',
            f'<h3><span class="fid">{f["id"]}</span>'
            f'<a class="anchor" href="#{anchor}">{rich(f["title"])}</a></h3>',
            f'<p>{rich(f["claim"])}</p>']
    if f.get("receipt"):
        bits.append(f'<p class="meta"><b>Receipt.</b> {rich(f["receipt"])}</p>')
    if f.get("falsified"):
        bits.append(f'<p class="meta"><b>Falsified by.</b> {rich(f["falsified"])}</p>')
    for k, v in (f.get("extra") or {}).items():
        bits.append(f'<p class="meta"><b>{_html.escape(k)}.</b> {rich(v)}</p>')
    bits.append("</article>")
    return "\n".join(bits)


DIM = re.compile(r'width="(\d+)" height="(\d+)"')


def diagram_css():
    """diagrams.css, plus any stylesheet a generated diagram brings with it.

    Read from the exported files rather than listed here, so a new diagram
    that needs its own rules cannot arrive without them.
    """
    d = ROOT / "diagrams"
    parts = [(d / "diagrams.css").read_text(encoding="utf-8")]
    parts += [p.read_text(encoding="utf-8") for p in sorted(d.glob("[0-9][0-9]-*.css"))]
    return "\n".join(parts)


def figure(src, caption=None):
    """Inline the fragment. It is HTML; there is nothing to embed it in.

    This was an <object> around an SVG, which was the right answer to the
    wrong question. An SVG is a drawing at a fixed size: shrink it to a phone
    and twelve-pixel monospace lands at four pixels, and every fix for that -
    panning, a full-size link, a sparser redraw - was a workaround for the
    format. These diagrams are boxes with labels in them, so they are boxes
    with labels in them, and they reflow. Inlining is also what makes them
    inherit this page's palette instead of carrying their own copy of it.

    05 is still a drawing - its bars are proportional to real addresses - and
    still goes through <object>, which keeps it a live document and keeps its
    element ids out of this page's namespace.
    """
    if src.endswith(".html"):
        return (ROOT / "diagrams" / src).read_text(encoding="utf-8")
    svg = (ROOT / "diagrams" / src).read_text(encoding="utf-8")
    w, h = DIM.search(svg).groups()
    return (f'<figure class="fig">'
            f'<object type="image/svg+xml" data="../diagrams/{src}" '
            f'style="aspect-ratio:{w}/{h}" aria-label="{_html.escape(caption)}">'
            f'<img src="../diagrams/{src}" alt="{_html.escape(caption)}" loading="lazy">'
            f'</object>'
            f'<figcaption>{_html.escape(caption)} '
            f'<a href="../diagrams/{src}" target="_blank" rel="noopener">open full size</a>'
            f'</figcaption></figure>')


def main():
    data = json.loads((HERE / "findings.json").read_text(encoding="utf-8"))
    css = (ROOT / "black-paper" / "paper.css").read_text(encoding="utf-8")
    DIAGRAM_CSS = diagram_css()

    parts = [f'<p class="arch-lede">{rich(LEDE)}</p>',
             figure("01-the-seams.html"),
             figure("07-the-seams-chamber.html")]

    for seam in data["seams"]:
        rows = [f for f in data["findings"] if f["seam"] == seam]
        parts.append(f'<section class="seam"><h2>{_html.escape(seam)}</h2>')
        parts.append(f'<p class="about">{len(rows)} finding'
                     f'{"" if len(rows) == 1 else "s"}.</p>')
        for src, cap in MAP.get(seam, []):
            parts.append(figure(src, cap))
        parts.extend(card(f) for f in rows)
        parts.append("</section>")

    parts.append('<section class="seam"><h2>How it is built</h2>'
                 '<p class="about">The parts, and what each release added.</p>')
    parts.append(figure("02-the-layers.html"))
    parts.append(figure("06-what-each-release-added.html"))
    parts.append("</section>")

    sha = data["source_commit"]
    parts.append(
        f'<p class="asof">These findings are generated from a private working '
        f'notebook, as of <code>{sha[:7]}</code> on {_html.escape(data["generated"])}. '
        f'{data["counts"]["public"]} of {data["counts"]["total"]} are published; '
        f'the rest are held back or still being checked. Nothing here is '
        f'transcribed by hand — if a claim and its source ever disagree, the '
        f'source wins.</p>')

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_html.escape(TITLE)}</title>
<meta name="description" content="{_html.escape(DESC)}">
<link rel="canonical" href="{SITE}/architecture/">

<meta property="og:type" content="article">
<meta property="og:site_name" content="The Chamber">
<meta property="og:url" content="{SITE}/architecture/">
<meta property="og:title" content="{_html.escape(TITLE)}">
<meta property="og:description" content="{_html.escape(DESC)}">
<meta property="og:image" content="{SITE}/card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{_html.escape(TITLE)}">
<meta name="twitter:description" content="{_html.escape(DESC)}">
<meta name="twitter:image" content="{SITE}/card.png">

<meta name="theme-color" content="#39ff88">
<style>
{css}
h1{{font-size:clamp(1.9rem,8vw,3.4rem);margin-bottom:16px}}
{CSS}
{DIAGRAM_CSS}
{FOOT_CSS}
</style>
</head>
<body>
<main>
<h1>Architecture</h1>
{"".join(parts)}
{footer(CURRENT)}
</main>
</body>
</html>
"""
    (HERE / "index.html").write_text(doc, encoding="utf-8")
    print(f"architecture/index.html {len(doc):,} bytes, "
          f"{data['counts']['public']} findings, {len(data['seams'])} seams")


if __name__ == "__main__":
    main()
