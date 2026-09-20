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
from stats import CSS as STATS_CSS, stats  # noqa: E402

HERE = pathlib.Path(__file__).parent
TITLE = "The Chamber — Architecture"
DESC = ("What we learned building Commodore 64 works that live on Ethereum: "
        "findings, each with the source that backs it.")
CURRENT = "arch"

# --------------------------------------------------------------- switches
# Each is one self-contained block of CSS, defined next to its own
# explanation below. Set to False and rebuild and the page is exactly what
# it was before that block existed; nothing else depends on either.
SCROLL_EDGE = True   # fade a panning drawing's edges, driven by scroll position
SCROLL_A11Y = True   # make a panning drawing keyboard-scrollable, and name it
BANNER = False       # the seams artwork as a header strip (OFF: it is the
                     # same picture as diagram 01 below it, without the labels,
                     # and two animations stacked read as noise)
STATS = True         # the apparatus block, in the black papers' place

# A diagram belongs to a seam, or to the two framing sections.
MAP = {
    "C64 ↔ Ethereum": [("05-where-the-program-lives.svg",
                        "The C64 address space beside our program")],
    "Process ↔ record — the learner": [
        ("03-a-save.svg", "A save, end to end"),
        ("04-three-implementations.svg", "One learner, written three times")],
}
LEDE = ("Two machines — a Commodore 64 from 1982 and Ethereum from 2015 — and "
        "the seams between them. Everything below was found by building, and "
        "every claim names the source that backs it.")

# The black papers open with a wide strip under the title - mindprint.svg is
# 1996x216, about 97px tall in this column. This is the same idea: 1600x320,
# so it lands nearer 180px. The 16:9 card would be 506px, which is a wall.
BANNER_CSS = """
.seams-banner{margin:26px 0 44px;padding:0}
.seams-banner img{width:100%;height:auto;display:block;border:1px solid var(--line);
  border-radius:10px;background:#080808}
"""

BANNER_HTML = ('<figure class="seams-banner">'
               '<img src="../diagrams/01-the-seams-banner.svg" '
               'alt="Eight frames nested one inside the next, a light travelling '
               'inward wall by wall until the smallest one fills with it and fades" '
               'width="1600" height="320" decoding="async"></figure>')

CSS = """
.arch-lede{font-size:1.24rem;line-height:1.55;color:var(--ink);max-width:54ch;margin:0 0 34px}
.seam{margin:62px 0 0}
.seam > h2{font-size:1.12rem;letter-spacing:.06em;text-transform:none;margin:0 0 6px;
  color:var(--accent2)}
.seam > .about{color:var(--muted);font-size:.94rem;margin:0 0 26px;max-width:62ch}
.fig{margin:0 0 30px}
.fig-pan object,.fig-pan img{width:100%;height:auto;display:block;
  border:1px solid var(--line);border-radius:6px;background:#0b0b0b;
  /* The same rule on every screen: never ENLARGED past the size it was drawn.
     05 is 440 wide - drawn narrow on purpose - and filling a 900px column
     with it was a 2x blow-up, which is why it read as much bigger than the
     rest. Shrinking to fit is fine; growing past the drawing is not. */
  max-width:var(--nat);margin-inline:auto}
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
/* A 920px drawing scaled to a phone's width is unreadable - the monospace
   inside it lands around 4px. So below 700px it pans at a legible size
   instead of shrinking to fit, and says so. WCAG 1.4.10 Reflow explicitly
   exempts diagrams from its ban on two-dimensional scrolling, so this is
   conformant - the page around the drawing still reflows.
   Never ENLARGED past the size it was drawn: min(680px, its own width). */
@media(max-width:700px){
  .arch-lede{font-size:1.06rem;max-width:none}
  .fig-pan{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .fig-pan object,.fig-pan img{min-width:min(680px,var(--nat))}
  .fig figcaption a::before{content:"— "}
}
"""

# --- SCROLL_A11Y ---------------------------------------------------------
# A scrollable region that cannot take focus cannot be scrolled by keyboard
# at all. axe calls this scrollable-region-focusable; it is a WCAG 2.1.1
# Level A failure, and the documented fix is exactly this: make it focusable,
# give it a name and a role, and show where the focus is.
# overscroll-behavior-x keeps a sideways swipe from turning into the
# browser's back gesture.
A11Y_CSS = """
.fig-pan{overscroll-behavior-x:contain}
.fig-pan:focus-visible{outline:2px solid var(--accent2);outline-offset:3px;
  border-radius:8px}
"""

# --- SCROLL_EDGE ---------------------------------------------------------
# The established pattern is Roman Komarov's scrolling shadows as Lea Verou
# implemented them: gradients with background-attachment: local, so the cue
# appears only where there IS more and vanishes at the end. Its virtue is
# not the fade - it is knowing where the end is; a permanent gradient claims
# there is more content where there is none.
#
# That technique needs the container's background to show through, and our
# drawings paint an opaque canvas over it. The equivalent that works over
# opaque content is a mask on the scroller, which fades the content itself.
# A static mask brings back the flaw the original avoids, so the fade
# distance is driven by scroll position instead - with no JavaScript, since
# the timeline is the scroller.
#
# Chrome/Edge 115+, Safari 26+. Firefox has not shipped scroll-driven
# animations, so this sits behind @supports and falls back to the plain hard
# edge, which is what is there today: no regression anywhere.
#
# An inactive timeline leaves both custom properties at their initial 0px,
# so a drawing that does not overflow gets no fade either.
EDGE_CSS = """
@property --edge-l{syntax:"<length>";inherits:false;initial-value:0px}
@property --edge-r{syntax:"<length>";inherits:false;initial-value:0px}
@media(max-width:700px){
  @supports (animation-timeline: scroll(self inline)){
    .fig-pan{
      mask-image:linear-gradient(to right,
        transparent 0, #000 var(--edge-l),
        #000 calc(100% - var(--edge-r)), transparent 100%);
      animation:figEdgeL linear both, figEdgeR linear both;
      animation-timeline:scroll(self inline);
    }
    @keyframes figEdgeL{0%{--edge-l:0px} 9%{--edge-l:26px} 100%{--edge-l:26px}}
    @keyframes figEdgeR{0%{--edge-r:26px} 91%{--edge-r:26px} 100%{--edge-r:0px}}
    @media(prefers-reduced-motion:reduce){.fig-pan{animation-duration:1ms}}
  }
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


def figure(src, caption):
    """An <object>, not an <img>.

    An SVG loaded through <img> is a flat picture: no hover, no tap, no
    script. Through <object> it is a live document, so the diagrams that
    carry interaction keep it - and because each object is its own document,
    two diagrams sharing element ids (01 and 07 share six) cannot collide,
    which inlining them both would have caused.

    The aspect ratio is read from the file so the box never has to be told
    twice and cannot drift from the drawing.
    """
    svg = (ROOT / "diagrams" / src).read_text(encoding="utf-8")
    w, h = DIM.search(svg).groups()
    cap = _html.escape(caption)
    # The focus attributes belong to SCROLL_A11Y, so they come and go with it.
    # The wrapper itself always exists: it is the scroller, and the caption
    # must sit outside it so it is neither panned nor faded with the drawing.
    a11y = (f' tabindex="0" role="group" aria-label="{cap} — pans sideways"'
            if SCROLL_A11Y else "")
    return (f'<figure class="fig">'
            f'<div class="fig-pan"{a11y}>'
            f'<object type="image/svg+xml" data="../diagrams/{src}" '
            f'style="aspect-ratio:{w}/{h};--nat:{w}px" aria-label="{cap}">'
            f'<img src="../diagrams/{src}" alt="{cap}" '
            f'style="--nat:{w}px" loading="lazy">'
            f'</object></div>'
            f'<figcaption>{_html.escape(caption)} '
            f'<a href="../diagrams/{src}" target="_blank" rel="noopener">open full size</a>'
            f'</figcaption></figure>')


def main():
    data = json.loads((HERE / "findings.json").read_text(encoding="utf-8"))
    css = (ROOT / "black-paper" / "paper.css").read_text(encoding="utf-8")

    parts = [f'<p class="arch-lede">{rich(LEDE)}</p>',
             figure("01-the-seams.svg",
                    "The seams: four machines, each inside the next"),
             figure("07-the-seams-chamber.svg",
                    "The same walls in the Chamber — one arrow instead of three")]

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
    parts.append(figure("02-the-layers.svg", "The eight layers: artwork and apparatus"))
    parts.append(figure("06-what-each-release-added.svg",
                        "What each release added, and what it carried forward"))
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
{CSS}{STATS_CSS if STATS else ""}{BANNER_CSS if BANNER else ""}{A11Y_CSS if SCROLL_A11Y else ""}{EDGE_CSS if SCROLL_EDGE else ""}
{FOOT_CSS}
</style>
</head>
<body>
<main>
<h1>Architecture</h1>
{BANNER_HTML if BANNER else ""}
{stats(data["apparatus"]) if STATS else ""}
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
