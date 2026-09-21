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
import prose  # noqa: E402

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
# Which diagram belongs inside which seam. 01 and 07 open the page, 06
# belongs to the series and 02 to the apparatus, so they are placed by act
# rather than listed here.
MAP = {
    "C64 ↔ Ethereum": [("05-where-the-program-lives.svg", None)],
    "Process ↔ record — the learner": [
        ("03-a-save.svg", None),
        ("04-three-implementations.svg", None)],
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
/* FIVE ACTS. H2 is an act - THE SEAMS, THE METHOD, THE APPARATUS - and
   reads as a label rather than a title. H3 is a seam inside the third act.
   They used to be the same level, which said the method was a seam. */
.act{margin:76px 0 0}
.act > h2 a,.seam > h3 a{color:inherit;border:0;text-decoration:none}
.act > h2 a:hover,.seam > h3 a:hover,
.act > h2 a:focus-visible,.seam > h3 a:focus-visible{color:var(--accent)}
.seam > h3 a:hover,.seam > h3 a:focus-visible{color:var(--ink)}
.act > h2{font:700 .82rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.2em;text-transform:uppercase;color:var(--muted);
  margin:0 0 22px;padding-bottom:13px;border-bottom:1px solid var(--line);
  display:flex;justify-content:space-between;align-items:baseline;gap:18px}
.seam{margin:52px 0 0}
.seam > h3{font-size:1.2rem;font-weight:700;letter-spacing:-.01em;margin:0 0 12px;
  color:var(--accent2);display:flex;justify-content:space-between;
  align-items:baseline;gap:18px}
/* the finding count is metadata. It used to be the only thing under the
   heading, in the exact position where a reader needs to know why the
   section matters. */
.count{font:700 .6rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.15em;text-transform:uppercase;color:var(--muted);
  white-space:nowrap;flex:none}
/* the opposition. The thing the eye lands on under a seam heading. */
/* text-wrap:balance is for exactly this: two or three lines that should
   break evenly rather than leaving one word alone on the last line. */
.tension{font-size:1.08rem;line-height:1.5;color:var(--ink);max-width:56ch;
  margin:0 0 18px;text-wrap:balance}
.arch-p{max-width:68ch;margin:0 0 15px;line-height:1.62}
/* Dense technical prose is unreadable at full column width. Claims get an
   editorial measure; receipts may run wider because code paths demand it. */
.find .claim{max-width:70ch}
.find .meta{max-width:88ch}
/* The second seams diagram is a comparison, not a second prerequisite. */
.fig-lead{font:700 .64rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.17em;text-transform:uppercase;color:var(--muted);margin:38px 0 10px}
/* Subordinated by spacing, border and label - NOT by scale. Shrinking a
   text-heavy drawing to 76% takes its 11px labels to about 8.5px, which is
   the same mistake the phone rule made with the memory map. */
.fig-sub .fig-pan object,.fig-sub .fig-pan img{border-color:#1a1a1a;opacity:.92}
.fig-sub figcaption{color:#7c7b76}
/* What assistive technology gets instead of the picture. */
.fig-desc{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;
  overflow:hidden;clip-path:inset(50%);white-space:nowrap}
/* Unwritten copy should LOOK unwritten. */
.todo{max-width:68ch;margin:0 0 15px;padding:13px 15px;border-radius:8px;
  border:1px dashed #4d3c12;background:#14100405;color:#c9a227;
  font:.84rem/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
.todo::before{content:"TO WRITE — ";letter-spacing:.12em;font-weight:700}
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
/* Arriving from a shared link should not park the heading against the top
   edge of the window. */
.find,.act,.seam{scroll-margin-top:28px}
@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
/* :is(h3,h4) because a finding's heading level depends on where it sits -
   h4 inside a seam, h3 under the method or the series. These rules were
   scoped to h3 alone, so every finding inside a seam lost its ID spacing
   and fell back to the page's default link styling: a bright underlined
   title that looked like it went somewhere. */
.find :is(h3,h4){font-size:1.02rem;margin:0 0 10px;line-height:1.35;font-weight:700}
/* The ID is the permalink. The padding is not decoration: the visible
   string is about 11px tall, and a touch target needs to be at least 24px
   (WCAG 2.5.8). Negative margins cancel it so nothing moves. */
.find :is(h3,h4) a.fid{color:var(--accent);
  font:700 .74rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.09em;vertical-align:.1em;text-decoration:none;border:0;
  padding:7px 6px;margin:-7px 4px -7px -6px;border-radius:4px;
  transition:background .15s,color .15s}
.find :is(h3,h4) a.fid:hover,
.find :is(h3,h4) a.fid:focus-visible{background:#11241a;color:var(--accent2)}
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
  .act > h2,.seam > h3{display:block}
  .count{display:block;margin-top:5px}
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


def card(f, level=3):
    """One finding. `level` is its depth in the outline, not its styling.

    Inside a seam a finding is a child of that seam (h2 act > h3 seam > h4
    finding). Under the method or the series it sits directly beneath the
    act, so it is an h3 there. They were all h3 before, which told a screen
    reader that F-001 was a sibling of "C64 ↔ Ethereum" rather than part of
    it.
    """
    anchor = f["id"].lower()
    # The ID is the permalink, not the title. F-012 is not a place on a page
    # - it is a citation handle for a claim that carries a receipt and a
    # falsifier, and it already reads as one. Making it the link introduces
    # no new visual vocabulary, and a reader who meets "see F-012" elsewhere
    # knows what to reach for. The title is plain text: two links to one
    # destination in one heading is one too many.
    label = _html.escape(f"Permalink to {f['id']}: {f['title']}", quote=True)
    bits = [f'<article class="find" id="{anchor}">',
            f'<h{level}><a class="fid" href="#{anchor}" aria-label="{label}">'
            f'{f["id"]}</a>{rich(f["title"])}</h{level}>',
            f'<p class="claim">{rich(f["claim"])}</p>']
    if f.get("receipt"):
        bits.append(f'<p class="meta"><b>Receipt.</b> {rich(f["receipt"])}</p>')
    if f.get("falsified"):
        bits.append(f'<p class="meta"><b>Falsified by.</b> {rich(f["falsified"])}</p>')
    for k, v in (f.get("extra") or {}).items():
        bits.append(f'<p class="meta"><b>{_html.escape(k)}.</b> {rich(v)}</p>')
    bits.append("</article>")
    return "\n".join(bits)


DIM = re.compile(r'width="(\d+)" height="(\d+)"')


def slug(text):
    """A stable, typeable fragment for a section heading.

    "C64 ↔ Ethereum" becomes "c64-ethereum" - the arrow and the spaces are
    not things anyone wants in a URL they are about to paste somewhere.
    """
    out = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return out or "section"


def para(value, cls="arch-p"):
    """A paragraph of prose, or a visible admission that it is not written.

    Unwritten copy should LOOK unwritten on the page. Absent copy is
    invisible in a build and invisible in review; a marker is neither.
    """
    if isinstance(value, tuple) and value and value[0] == prose.TODO:
        return f'<p class="todo">{_html.escape(value[1])}</p>'
    return "".join(f'<p class="{cls}">{rich(b)}</p>'
                   for b in value.strip().split("\n\n"))


def figure(src, caption=None, sub=False):
    """An <object>, not an <img>.

    An SVG loaded through <img> is a flat picture: no hover, no tap, no
    script. Through <object> it is a live document, so the diagrams that
    carry interaction keep it - and because each object is its own document,
    two diagrams sharing element ids (01 and 07 share six) cannot collide,
    which inlining them both would have caused.

    The aspect ratio is read from the file so the box never has to be told
    twice and cannot drift from the drawing.
    """
    meta = prose.FIG.get(src, {})
    caption = caption or meta.get("caption", src)
    # The description is what assistive technology gets INSTEAD of the
    # picture, so it describes the relationship rather than transcribing the
    # labels. Visually hidden - the caption is the visible line. Flip
    # .fig-desc to a normal block to put it on the page for everyone.
    desc = (f'<span class="fig-desc">{_html.escape(meta["desc"])}</span>'
            if meta.get("desc") else "")
    svg = (ROOT / "diagrams" / src).read_text(encoding="utf-8")
    w, h = DIM.search(svg).groups()
    cap = _html.escape(caption)
    # The focus attributes belong to SCROLL_A11Y, so they come and go with it.
    # The wrapper itself always exists: it is the scroller, and the caption
    # must sit outside it so it is neither panned nor faded with the drawing.
    a11y = (f' tabindex="0" role="group" aria-label="{cap} — pans sideways"'
            if SCROLL_A11Y else "")
    return (f'<figure class="fig{" fig-sub" if sub else ""}">'
            f'<div class="fig-pan"{a11y}>'
            f'<object type="image/svg+xml" data="../diagrams/{src}" '
            f'style="aspect-ratio:{w}/{h};--nat:{w}px" aria-label="{cap}">'
            f'<img src="../diagrams/{src}" alt="{cap}" '
            f'style="--nat:{w}px" loading="lazy">'
            f'</object></div>'
            f'<figcaption>{_html.escape(caption)} '
            f'<a href="../diagrams/{src}" target="_blank" rel="noopener">open full size</a>'
            f'{desc}</figcaption></figure>')


def unwritten():
    """Every prose slot still carrying a TODO marker."""
    out = []

    def walk(name, v):
        if isinstance(v, tuple) and v and v[0] == prose.TODO:
            out.append(name)
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(f"{name}.{k}", x)

    for name in dir(prose):
        if not name.startswith("_") and name.isupper() or name == "SEAM":
            walk(name, getattr(prose, name))
    return out


def main():
    data = json.loads((HERE / "findings.json").read_text(encoding="utf-8"))
    css = (ROOT / "black-paper" / "paper.css").read_text(encoding="utf-8")

    # FIVE ACTS. The object, the map, the seams, what is not a seam, the
    # apparatus. The reader learns, in order: what is this thing, what is a
    # seam, where are they, what happened at each one, what did we learn
    # that was not at a seam, and how would you know any of it is true.
    #
    # The page used to open with six unexplained numbers, a single thesis
    # sentence, and then two near-duplicate diagrams at equal weight - two
    # full screens before the first finding.
    def sect(kind):
        return [x["name"] for x in data["sections"] if x["kind"] == kind]

    def findings_of(name):
        return [f for f in data["findings"] if f["seam"] == name]

    parts = [para(prose.OPENING, "arch-lede")]
    if STATS:
        parts.append(stats(data["apparatus"]))

    # --- act 2: the map. 01 establishes the model; 07 is a comparison, and
    # is subordinated rather than given a second full-strength slot.
    parts.append(f'<section class="act" id="{slug(prose.SYSTEM_TITLE)}">'
                 f'<h2><a href="#{slug(prose.SYSTEM_TITLE)}">'
                 f'{_html.escape(prose.SYSTEM_TITLE)}</a></h2>')
    parts.append(para(prose.SYSTEM))
    parts.append(figure("01-the-seams.svg"))
    parts.append(f'<p class="fig-lead">{_html.escape(prose.COMPARE_LABEL)}</p>')
    parts.append(para(prose.COMPARE))
    parts.append(figure("07-the-seams-chamber.svg", sub=True))
    parts.append("</section>")

    # --- act 3: the five real seams
    parts.append(f'<section class="act" id="{slug(prose.SEAMS_TITLE)}">'
                 f'<h2><a href="#{slug(prose.SEAMS_TITLE)}">'
                 f'{_html.escape(prose.SEAMS_TITLE)}</a></h2>')
    if prose.SEAMS_INTRO:
        parts.append(para(prose.SEAMS_INTRO))
    for name in sect("seam"):
        rows = findings_of(name)
        copy = prose.SEAM.get(name, {})
        parts.append(f'<section class="seam" id="{slug(name)}">')
        parts.append(f'<h3><a href="#{slug(name)}">{_html.escape(name)}</a>'
                     f'<span class="count">{len(rows)} finding'
                     f'{"" if len(rows) == 1 else "s"}</span></h3>')
        t = copy.get("tension")
        parts.append(para(t, "tension") if t else "")
        parts.append(para(copy.get("body", ("", ""))) if copy.get("body") else "")
        for src, _cap in MAP.get(name, []):
            parts.append(figure(src))
        parts.extend(card(f, level=4) for f in rows)
        parts.append("</section>")
    parts.append("</section>")

    # --- act 4: the two categories the notebook says are NOT seams
    for kind, title, copy, figs in (
            ("method", prose.METHOD_TITLE, prose.METHOD, []),
            ("series", prose.SERIES_TITLE, prose.SERIES,
             ["06-what-each-release-added.svg"])):
        for name in sect(kind):
            rows = findings_of(name)
            parts.append(f'<section class="act" id="{slug(title)}">'
                         f'<h2><a href="#{slug(title)}">{_html.escape(title)}</a>'
                         f'<span class="count">{len(rows)} finding'
                         f'{"" if len(rows) == 1 else "s"}</span></h2>')
            parts.append(para(copy))
            for src in figs:
                parts.append(figure(src))
            parts.extend(card(f) for f in rows)
            parts.append("</section>")

    # --- act 5: the ending. Every finding is behind the reader now; this is
    # the machinery that makes them worth anything.
    parts.append(f'<section class="act" id="{slug(prose.APPARATUS_TITLE)}">'
                 f'<h2><a href="#{slug(prose.APPARATUS_TITLE)}">'
                 f'{_html.escape(prose.APPARATUS_TITLE)}</a></h2>')
    parts.append(figure("02-the-layers.svg"))
    parts.append(para(prose.APPARATUS))
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
{"".join(parts)}
{footer(CURRENT)}
</main>
</body>
</html>
"""
    (HERE / "index.html").write_text(doc, encoding="utf-8")
    todos = unwritten()
    print(f"architecture/index.html {len(doc):,} bytes, "
          f"{data['counts']['public']} findings, {len(data['seams'])} seams"
          + (f", {len(todos)} unwritten" if todos else ""))
    # Absence must never be read as completion. --strict is what a release
    # runs; the default is drafting mode, where an unwritten paragraph shows
    # on the page in amber and says so.
    if todos and "--strict" in sys.argv:
        sys.exit("refusing: prose not written —\n  " + "\n  ".join(todos))


if __name__ == "__main__":
    main()
