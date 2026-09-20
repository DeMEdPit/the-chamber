#!/usr/bin/env python3
"""The black papers, as cards on the front door.

The rows come from stats.py, the same table the papers themselves print, so
the card and the page it opens cannot disagree about a number. CONTRACTS is
the one slot left off - least interesting of the six at a glance - and
DETAILS, which the papers do not have, is added here.

Two layout notes worth keeping:

* The card is NOT a link. DETAILS holds links, and an anchor inside an
  anchor is invalid and breaks keyboard navigation. The button is the link
  and the card is a plain container.
* The data block is pinned to the bottom (margin-top:auto). Equal-height
  cards with uneven descriptions leave slack somewhere; pinned, it falls
  between the description and the table, where it reads as spacing rather
  than as an empty foot.
"""
import html as _html
import pathlib
import re

from stats import CHAMBER, PERCEPTION

HERE = pathlib.Path(__file__).parent


def lede(paper):
    """A paper's thesis line, read from its own source.

    It was copied here once and drifted within the hour: the Genesis line
    changed in paper.md and the card went on printing the old one. The card
    now reads the first blockquote out of the markdown, the same line the
    build lifts into the page's subtitle, so the two cannot disagree.
    """
    src = (HERE / paper / "paper.md").read_text(encoding="utf-8")
    m = re.search(r"^> \*\*(.+?)\*\*\s*$", src, re.M)
    if not m:
        raise SystemExit("papers: no thesis line in %s/paper.md" % paper)
    return m.group(1)

ROWS = ["On chain", "Tokens", "The program", "Written in", "One render"]
ETHERSCAN = "https://etherscan.io/address/"
OPENSEA = "https://opensea.io/assets/ethereum/"

PAPERS = [
    {
        "n": "01", "title": "Perception Chamber", "href": "black-paper/",
        "img": "black-paper/mindprint-square.svg",
        "alt": "A mindprint: a field of cells, each one a learned weight of the "
               "canary's perceptron",
        "line": lede("black-paper"),
        "stats": PERCEPTION,
        "addr": "0x6f54E1aAE0E9A679A52e5E733645cB11e0cE6127", "token": "1",
    },
    {
        "n": "00", "title": "The Chamber", "href": "black-paper-00/",
        "img": "black-paper-00/room-square.svg",
        "alt": "A Chamber room, close: the lit candle at the centre, bricks "
               "around it",
        "line": lede("black-paper-00"),
        "stats": CHAMBER,
        "addr": "0x75FD5A9c4440c38561A0099B216F825b7C6db924", "token": "",
    },
]

CSS = """
.papers{margin:52px 0 0;display:grid;gap:22px;
  grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.paper{display:flex;flex-direction:column;padding:22px;border:1px solid var(--line);
  border-radius:14px;background:linear-gradient(180deg,#0d0d0d,#060606)}
.paper>img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;border:1px solid var(--line);
  border-radius:10px;background:#000;margin-bottom:18px}
.paper-kicker{font:700 .66rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.16em;color:var(--accent)}
.paper h3{margin:9px 0 8px;font-size:1.45rem;letter-spacing:-.02em;font-weight:700}
.paper-line{margin:0 0 22px;color:var(--muted);font-size:.98rem;line-height:1.45}
.paper-rows{margin:auto 0 0;border-top:1px solid var(--line)}
.paper-row{display:flex;gap:12px;justify-content:space-between;align-items:baseline;
  padding:9px 0;border-bottom:1px solid var(--line)}
.paper-row dt{font:700 .64rem/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.13em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.paper-row dd{margin:0;text-align:right;font:600 .8rem/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--ink);overflow-wrap:anywhere}
.paper-row dd a{color:var(--ink);border-bottom:1px solid #35545b}
.paper-row dd a:hover{color:var(--accent2)}
.paper-go{display:inline-block;margin-top:20px;align-self:flex-start;
  font:700 .72rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;
  color:#050505;background:var(--accent);border-radius:7px;padding:13px 20px;
  text-decoration:none}
.paper-go:hover,.paper-go:focus-visible{background:var(--accent2)}
.paper-next{opacity:.72}
.paper-blank{width:100%;aspect-ratio:16/9;border:1px dashed #262626;border-radius:10px;
  background:repeating-linear-gradient(135deg,#080808 0 9px,#0b0b0b 9px 18px);
  margin-bottom:18px}
.paper-next .paper-kicker{color:var(--muted)}
/* IN RESEARCH is a label, not a control. .paper-go:hover is a class plus a
   pseudo-class and so outranked .paper-go-off on specificity, which is why
   it lit up green on hover and on a tap. pointer-events:none makes it inert
   - no hover, no tap highlight, no focus - and the explicit overrides below
   hold even if something re-enables pointer events later. */
.paper-go-off{background:#151515;color:var(--muted);cursor:default;
  pointer-events:none;-webkit-tap-highlight-color:transparent;
  -webkit-user-select:none;user-select:none}
.paper-go-off:hover,.paper-go-off:focus,.paper-go-off:focus-visible,
.paper-go-off:active{background:#151515;color:var(--muted)}
@media(max-width:700px){
  .papers{gap:16px;margin-top:40px}
  .paper{padding:16px}
  .paper h3{font-size:1.25rem}
  .paper-line{font-size:.92rem;margin-bottom:18px}
}
"""


def _rows(p):
    look = dict(p["stats"])
    out = []
    for label in ROWS:
        v = look.get(label)
        if v:
            out.append((label, _html.escape(v)))
    sea = OPENSEA + p["addr"] + ("/" + p["token"] if p["token"] else "")
    out.append(("Details",
                '<a href="%s%s" target="_blank" rel="noopener">Etherscan</a> · '
                '<a href="%s" target="_blank" rel="noopener">OpenSea</a>'
                % (ETHERSCAN, p["addr"], sea)))
    return "".join(
        '<div class="paper-row"><dt>%s</dt><dd>%s</dd></div>' % (_html.escape(k), v)
        for k, v in out)


NEXT = {
    "kicker": "NEXT",
    "title": "More chambers",
    "line": "Each generation isolates a single capability the ones before it "
            "deliberately do not have.",
    "rows": [("On chain", "not yet"), ("Tokens", "&mdash;"),
             ("The program", "&mdash;"), ("Written in", "&mdash;"),
             ("One render", "&mdash;"),
             # a dash, not "n/a": four rows above already use it, and a
             # second vocabulary for the same idea would read as two things
             ("Details", "&mdash;")],
}


def _next_card():
    """The series is not finished, and the honest way to show that is a card
    whose numbers are all dashes. It names nothing, because nothing is real
    yet."""
    rows = "".join('<div class="paper-row"><dt>%s</dt><dd>%s</dd></div>' % (k, v)
                   for k, v in NEXT["rows"])
    return ('<article class="paper paper-next">'
            '<div class="paper-blank" aria-hidden="true"></div>'
            '<span class="paper-kicker">%s</span><h3>%s</h3>'
            '<p class="paper-line">%s</p>'
            '<dl class="paper-rows">%s</dl>'
            '<span class="paper-go paper-go-off">IN RESEARCH</span>'
            "</article>") % (NEXT["kicker"], NEXT["title"], NEXT["line"], rows)


def papers():
    cards = []
    for p in PAPERS:
        cards.append(
            '<article class="paper">'
            + '<img src="%s" alt="%s" loading="lazy" decoding="async">'
              % (p["img"], _html.escape(p["alt"]))
            + '<span class="paper-kicker">BLACK PAPER %s</span>' % p["n"]
            + "<h3>%s</h3>" % _html.escape(p["title"])
            + '<p class="paper-line">%s</p>' % _html.escape(p["line"])
            + '<dl class="paper-rows">%s</dl>' % _rows(p)
            + '<a class="paper-go" href="%s">READ THE BLACK PAPER &rarr;</a>' % p["href"]
            + "</article>")
    cards.append(_next_card())
    return '<section class="papers" aria-label="The series">%s</section>' % "".join(cards)
