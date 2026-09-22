#!/usr/bin/env python3
"""Build the reference page from the exported surface.

Generated: `surface.json` comes from the private repository's
`scripts/export-surface.py`, which reads the pinned compile's artifacts - the
verified ABI and the contracts' own `@notice` lines - and carries the commit it
was taken from. This renders it in two layers: first what a stranger can do
(at a glance, the verbs, the four recipes, who can change what, what is not
exposed), then the complete reference, every row from the ABI. Never hand-edit
index.html, and never edit surface.json: a wrong line is fixed at the source
and re-exported.

The verb lists below name functions. The build refuses to run if the JSON no
longer has one of them, so the overview cannot drift from the reference.
"""
import html as _html, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from footer import footer, CSS as FOOT_CSS  # noqa: E402

TITLE = "What is on chain"
DESC = ("What a stranger can read, run and rely on in the two deployed contracts, "
        "and every public function of both, from the verified ABI.")
CURRENT = "surface"
WORK_TAG = {"perception": "PERCEPTION", "chamber": "THE CHAMBER"}
ETHERSCAN_TX = "https://etherscan.io/tx/"

# The overview's verbs. Each names functions the reference has; held to the JSON at build time.
VERBS = [
    ("READ", "what is there", [("perception", "brain"), ("perception", "head"), ("perception", "education"),
                               ("perception", "revision"), ("chamber", "attributes"), ("chamber", "characterSentence")]),
    ("RUN", "make it compute, on the chain or off it", [("perception", "replay"), ("perception", "prg"),
                                                         ("perception", "prgWithBrain"), ("chamber", "prg"), ("perception", "page")]),
    ("VERIFY", "check a claim against the rules", [("perception", "canonicalHashOf"), ("perception", "requireAdmissible"),
                                                    ("perception", "revisionIdOf"), ("chamber", "tableRow"), ("chamber", "seedOf")]),
    ("WRITE", "change a work", [("perception", "saveMind"), ("chamber", "mint"), ("chamber", "lock")]),
]
TOC = [("glance", "AT A GLANCE"), ("use", "WHAT ANYONE CAN DO"), ("authority", "WHO CAN CHANGE WHAT"),
       ("not-exposed", "NOT EXPOSED"), ("perception", "PERCEPTION"), ("chamber", "THE CHAMBER"), ("about", "ABOUT THIS PAGE")]

MONO = "ui-monospace,SFMono-Regular,Menlo,monospace"
CSS = f"""
.lede{{margin:0 0 26px;color:var(--muted);font-weight:450;line-height:1.4;font-size:clamp(1.15rem,4.2vw,1.45rem)}}
.test{{margin:0 0 28px;padding:16px 18px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);max-width:70ch}}
.test .lab{{display:block;font:700 .66rem/1.2 {MONO};letter-spacing:.18em;color:var(--accent);margin:0 0 8px}}
.toc{{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-wrap:wrap;gap:8px 18px}}
.toc li{{margin:0}}
.toc a{{font:700 .68rem/1.4 {MONO};letter-spacing:.14em;color:var(--accent2);text-decoration:none;border:0}}
.toc a:hover,.toc a.here{{color:var(--accent)}}
.part{{margin:0}}
.part > h2 a{{color:inherit;text-decoration:none}}
.part > .intro{{max-width:70ch;margin:0 0 22px}}
.glance{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.card{{border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:18px 20px;min-width:0}}
.card h3{{margin:0 0 4px;font-size:1.15rem}}
.addr{{margin:0 0 6px;font:600 .72rem/1.6 {MONO};letter-spacing:.04em;color:var(--muted);overflow-wrap:anywhere}}
.addr a{{color:var(--accent2);text-decoration:none;border:0}}
.addr a:hover{{color:var(--accent)}}
.card dl{{margin:14px 0 0;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:.9rem;line-height:1.45}}
.card dt{{font:700 .62rem/1.8 {MONO};letter-spacing:.14em;text-transform:uppercase;color:var(--muted);white-space:nowrap}}
.card dd{{margin:0;min-width:0}}
.card dd code{{font-size:.8rem}}
.card .more{{display:inline-block;margin-top:14px;font:700 .66rem/1.4 {MONO};letter-spacing:.14em;color:var(--accent2);text-decoration:none;border:0}}
.card .more:hover{{color:var(--accent)}}
.verbs{{display:grid;grid-template-columns:repeat(5,1fr);gap:18px 14px;margin:0 0 40px}}
.verb{{min-width:0}}
.verb h3{{font:700 .72rem/1.2 {MONO};letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin:0 0 4px}}
.verb .sub{{margin:0 0 10px;font-size:.8rem;line-height:1.35;color:var(--muted)}}
.verb ul{{list-style:none;margin:0;padding:0}}
.verb li{{margin:0 0 6px;font:500 .78rem/1.45 {MONO};overflow-wrap:anywhere}}
.verb li a{{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line)}}
.verb li a:hover{{border-color:var(--accent)}}
.verb li .w{{display:block;font-size:.56rem;letter-spacing:.12em;color:var(--muted);font-weight:700}}
.verb.cannot h3{{color:var(--muted)}}
.verb.cannot li a{{color:var(--muted)}}
.recipe{{margin:26px 0 0}}
.recipe h3{{font-size:1.05rem;margin:0 0 6px}}
.recipe p{{margin:0 0 10px;max-width:70ch}}
pre{{max-width:100%;overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px;
  font:500 .78rem/1.55 {MONO}}}
pre code{{display:inline-block;min-width:0;overflow-wrap:normal;word-break:normal}}
.tag{{display:inline-block;font:700 .58rem/1.7 {MONO};letter-spacing:.14em;padding:0 6px;border:1px solid var(--line);border-radius:4px;
  color:var(--muted);vertical-align:middle;white-space:nowrap}}
.tag.write{{border-color:var(--accent);color:var(--accent)}}
.tag.hold{{border-color:var(--accent);color:#000;background:var(--accent)}}
.tag.spent{{border-style:dashed}}
.tag.w{{border:0;padding:0;margin-left:8px;vertical-align:baseline}}
.auth .one{{margin:26px 0 0}}
.auth h3{{margin:0 0 6px;font-size:1.15rem}}
.auth p{{max-width:70ch;margin:0 0 10px}}
.auth .rec{{list-style:none;margin:0;padding:0}}
.auth .rec li{{font-size:.85rem;line-height:1.5;color:var(--muted);margin:6px 0;padding-left:12px;border-left:2px solid var(--line);max-width:70ch}}
.auth .rec b{{color:var(--ink);font-weight:600}}
.auth .rec a{{color:var(--accent2);text-decoration:none;font-family:{MONO};font-size:.78rem}}
.auth .rec a:hover{{color:var(--accent)}}
.gap dt{{font-weight:700;margin:18px 0 4px}}
.gap dd{{margin:0;color:var(--ink);max-width:70ch}}
.legend{{margin:0 0 8px;font-size:.85rem;color:var(--muted);max-width:70ch}}
.legend .own{{display:inline-block;width:10px;height:10px;border-left:2px solid var(--accent);vertical-align:-1px;margin-right:6px}}
.work{{margin:44px 0 0}}
.work > h3{{font-size:1.4rem;letter-spacing:-.01em;margin:0 0 4px}}
.group{{margin:30px 0 0}}
.group > h4{{font:700 .72rem/1.2 {MONO};letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}}
table.surf{{width:100%;border-collapse:collapse}}
table.surf td{{vertical-align:top;padding:12px 12px 12px 0;border-top:1px solid var(--line)}}
table.surf tr:first-child td{{border-top:0}}
td.sig{{width:36%;font:500 .8rem/1.5 {MONO};overflow-wrap:anywhere}}
td.sig .ret{{display:block;color:var(--muted);font-weight:400}}
td.what{{font-size:.95rem;line-height:1.5}}
td.what.own{{border-left:2px solid var(--accent);padding-left:12px}}
td.who{{width:19%;font:500 .72rem/1.6 {MONO};color:var(--muted)}}
td.who .any{{opacity:.6}}
td.who .txt{{display:block;font-size:.68rem;line-height:1.45;margin-top:4px}}
.std{{margin:22px 0 0;font-size:.9rem;color:var(--muted);max-width:70ch}}
.std code{{font-size:.78rem}}
.about{{font-size:.9rem;color:var(--muted);max-width:70ch}}
.about code{{color:var(--ink);font-size:.8rem}}
@media(min-width:1340px){{
  .toc{{position:fixed;top:96px;left:calc(50% - 450px - 236px);width:196px;flex-direction:column;gap:10px;margin:0}}
}}
@media(max-width:900px){{.verbs{{grid-template-columns:repeat(3,1fr)}}}}
@media(max-width:700px){{
  .glance{{grid-template-columns:1fr}}
  .verbs{{grid-template-columns:repeat(2,1fr)}}
  .card dl{{grid-template-columns:1fr;gap:2px 0}}
  .card dd{{margin:0 0 8px}}
  table.surf,table.surf tbody,table.surf tr,table.surf td{{display:block;width:auto}}
  table.surf td{{border-top:0;padding:2px 0 8px}}
  table.surf td::before{{content:attr(data-l);display:block;font:700 .56rem/1.8 {MONO};letter-spacing:.16em;color:var(--muted)}}
  table.surf tr{{border-top:1px solid var(--line);padding:14px 0 6px}}
  table.surf tr:first-child{{border-top:0}}
  td.what.own{{padding-left:12px}}
  td.who{{width:auto}}
}}
@media(max-width:440px){{.verbs{{grid-template-columns:1fr}}}}
"""

SCRIPT = """<script>
(function(){var as=document.querySelectorAll('.toc a[href^="#"]');if(!as.length||!('IntersectionObserver' in window))return;
var by={};as.forEach(function(a){var s=document.getElementById(a.getAttribute('href').slice(1));if(s)by[s.id]=a;});
var cur=null;var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){if(cur)cur.classList.remove('here');
cur=by[e.target.id];if(cur)cur.classList.add('here');}});},{rootMargin:'-15% 0px -70% 0px'});
Object.keys(by).forEach(function(id){o.observe(document.getElementById(id));});})();
</script>"""


def esc(t):
    return _html.escape(str(t), quote=True)


def prose(t):
    """Escaped text with `identifiers` in backticks rendered as code, the way the notices write them."""
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", esc(t))


def rid(wkey, r):
    return f"{wkey}-{r['name']}"


def access(r):
    mut = r["mutability"]
    if mut in ("view", "pure"):
        return f'<span class="tag">{"PURE" if mut == "pure" else "READ"}</span> <span class="any">{esc(r["who"])}</span>'
    who = r["who"]
    tag = ('<span class="tag hold">HOLDER ONLY</span> ' if "holder" in who and not who.startswith("nobody")
           else '<span class="tag spent">SPENT</span> ' if who.startswith("nobody") else "")
    return f'<span class="tag write">WRITE</span> {tag}<span class="txt">{esc(who)}</span>'


def row(wkey, r):
    what = r["notice"] or r["hand"] or ""
    own = " own" if r["source"] == "notice" else ""
    ret = f'<span class="ret">&rarr; {esc(r["returns"])}</span>' if r["returns"] else ""
    return (f'<tr id="{rid(wkey, r)}"><td class="sig" data-l="FUNCTION"><code>{esc(r["name"])}({esc(r["params"])})</code>{ret}</td>'
            f'<td class="what{own}" data-l="WHAT">{prose(what)}</td><td class="who" data-l="ACCESS">{access(r)}</td></tr>')


def rows_of(w):
    return {r["name"]: r for g in w["groups"] for r in g["rows"]} | {r["name"]: r for r in w["ungrouped"]}


def card(w):
    rows = rows_of(w)
    order = w["authority"]["writes"]
    custom = sorted((s.split("(")[0] for s in w["custom_writes"]), key=lambda n: order.index(n) if n in order else len(order))
    whos = [rows[n]["who"] for n in custom]
    if all(x.startswith("nobody") for x in whos):
        writes = f'{len(custom)}, both spent: ' if len(custom) == 2 else f'{len(custom)}, all spent: '
        writes += ", ".join(f"<code>{esc(n)}</code>" for n in custom)
    else:
        writes = " · ".join(f"<code>{esc(n)}</code>, {esc(rows[n]['who'])}" for n in custom)
        writes = f"{len(custom)}: {writes}"
    shape = " &middot; ".join(f'{esc(g["title"])} {len(g["rows"])}' for g in w["groups"] if g["rows"])
    tokens = f'{w["tokens"]}, deployed {esc(w["deployed"])}' + (", locked" if w["key"] == "chamber" else "")
    return (f'<div class="card"><h3>{esc(w["name"])}</h3>'
            f'<p class="addr"><a href="{w["etherscan"]}" target="_blank" rel="noopener">{w["address"]}</a></p>'
            f'<dl><dt>functions</dt><dd>{w["counts"]["functions"]} public, {w["counts"]["reads"]} of them reads</dd>'
            f'<dt>writes to the work</dt><dd>{writes}</dd>'
            f'<dt>the standard</dt><dd>{len(w["erc721"])} ERC-721 functions: transfers and approvals, which move the token and nothing else</dd>'
            f'<dt>tokens</dt><dd>{tokens}</dd>'
            f'<dt>the surface</dt><dd>{shape}</dd></dl>'
            f'<a class="more" href="#{w["key"]}">THE REFERENCE &darr;</a></div>')


def verbs(d, by_key):
    out = []
    for verb, sub, names in VERBS:
        items = []
        for wkey, name in names:
            r = by_key[wkey].get(name)
            if r is None:
                raise SystemExit(f"the overview names {wkey}.{name}, which the JSON does not have: fix VERBS or the export")
            items.append(f'<li><a href="#{rid(wkey, r)}">{esc(name)}</a><span class="w">{WORK_TAG[wkey]}</span></li>')
        out.append(f'<div class="verb"><h3>{verb}</h3><p class="sub">{esc(sub)}</p><ul>{"".join(items)}</ul></div>')
    cannot = "".join(f'<li><a href="#not-exposed">{esc(g["what"])}</a></li>' for g in d["not_exposed"][:3])
    out.append(f'<div class="verb cannot"><h3>CANNOT</h3><p class="sub">not exposed, yet or ever</p><ul>{cannot}</ul></div>')
    return '<div class="verbs">' + "".join(out) + "</div>"


def authority(w):
    a = w["authority"]
    recs = []
    for r in a["receipts"]:
        link = (f' &middot; <a href="{ETHERSCAN_TX}{r["tx"]}" target="_blank" rel="noopener">tx {r["tx"][:10]}&hellip; block {r["block"]:,}</a>'
                if r.get("tx") else "")
        recs.append(f'<li><b>{esc(r["what"])}.</b> {esc(r["how"])}{link}</li>')
    return (f'<div class="one"><h3>{esc(w["name"])}</h3><p>{esc(a["summary"])}</p>'
            f'<ul class="rec">{"".join(recs)}</ul></div>')


def work(w):
    bits = [f'<section class="work" id="{w["key"]}"><h3>{esc(w["name"])}</h3>',
            f'<p class="addr"><a href="{w["etherscan"]}" target="_blank" rel="noopener">{w["address"]}</a> &middot; '
            f'deployed {esc(w["deployed"])} from <code>{esc(w["deploy_commit"])}</code> &middot; '
            f'{w["counts"]["functions"]} functions, {w["counts"]["reads"]} of them reads</p>']
    for g in w["groups"]:
        if not g["rows"]:
            continue
        bits.append(f'<div class="group"><h4>{esc(g["title"])}</h4><table class="surf"><tbody>'
                    + "".join(row(w["key"], r) for r in g["rows"]) + "</tbody></table></div>")
    if w["ungrouped"]:
        bits.append('<div class="group"><h4>also in the ABI</h4><table class="surf"><tbody>'
                    + "".join(row(w["key"], r) for r in w["ungrouped"]) + "</tbody></table></div>")
    std = ", ".join(f"<code>{esc(s.split('(')[0])}</code>" for s in w["erc721"])
    bits.append(f'<p class="std">And the ERC-721 standard set, for wallets and marketplaces: {std}.</p>')
    bits.append("</section>")
    return "".join(bits)


def part(pid, title, inner, intro=""):
    return (f'<section class="part" id="{pid}"><h2><a href="#{pid}">{esc(title)}</a></h2>'
            + (f'<p class="intro">{intro}</p>' if intro else "") + inner + "</section>")


def main():
    d = json.loads((HERE / "surface.json").read_text(encoding="utf-8"))
    css = (ROOT / "black-paper" / "paper.css").read_text(encoding="utf-8")
    by_key = {w["key"]: rows_of(w) for w in d["works"]}
    ids = [rid(w["key"], r) for w in d["works"] for r in rows_of(w).values()]
    if len(ids) != len(set(ids)):
        raise SystemExit("a row id repeats; the overview's links would be ambiguous")
    g = d["generated"]
    body = [f'<h1>{esc(TITLE)}</h1>',
            '<p class="lede">What a stranger can read, run and rely on, without asking us. '
            'First what the two contracts let anyone do; then every public function of both, from the verified ABI.</p>',
            f'<p class="test"><span class="lab">THE TEST</span>{esc(d["test"])}</p>',
            '<ul class="toc">' + "".join(f'<li><a href="#{pid}">{label}</a></li>' for pid, label in TOC) + "</ul>"]
    body.append(part("glance", "At a glance", '<div class="glance">' + "".join(card(w) for w in d["works"]) + "</div>",
                     "Two contracts, one shape: almost everything is a read, and each write says who may send it."))
    recipes = "".join(f'<div class="recipe"><h3>{esc(r["title"])}<span class="tag w">{WORK_TAG[r["work"]]}</span></h3>'
                      f'<p>{prose(r["text"])}</p><pre><code>{esc(r["code"])}</code></pre></div>' for r in d["recipes"])
    body.append(part("use", "What anyone can do", verbs(d, by_key) + '<h3 class="four">Four ways to use it</h3>' + recipes,
                     "The reference below is organised by the nouns the contracts keep. This is the same surface by what you "
                     "can do with it; every name links to its row. Then four of those things, as commands against any node."))
    body.append(part("authority", "Who can change what", '<div class="auth">' + "".join(authority(w) for w in d["works"]) + "</div>",
                     "Open is a claim about authority before it is a claim about functions. The two contracts answer it "
                     "differently, and both answers are checkable from the ABI and the chain."))
    body.append(part("not-exposed", "Not exposed",
                     '<dl class="gap">' + "".join(f'<dt>{esc(x["what"])}</dt><dd>{prose(x["why"])}</dd>' for x in d["not_exposed"]) + "</dl>",
                     "Where the surface stops. Each of these is a decision, recorded, not an oversight."))
    body.append(part("reference", "Contract reference",
                     '<p class="legend"><span class="own"></span>A line with the mark is the contract&rsquo;s own <code>@notice</code>, '
                     'from the verified source. The rest are ours. READ and PURE are the ABI&rsquo;s own words for a call that costs '
                     'nothing; PURE reads no chain state at all.</p>' + "".join(work(w) for w in d["works"]),
                     "Every public function of both contracts, from the verified ABI, grouped by what the contract keeps. "
                     "Nothing in this section is hand-maintained: a wrong line is fixed at the export and the page is rebuilt."))
    body.append(part("about", "About this page",
                     f'<p class="about">Generated, never hand-edited: from the pinned compile of the verified sources '
                     f'({esc(g["toolchain"])}), exported at <code>{esc(g["from"])}</code> on {esc(g["date"])} by <code>{esc(g["tool"])}</code>. '
                     'The rows are the ABI&rsquo;s. The groups, the verbs, the summaries, the gaps and the recipes are ours, and the build '
                     'is held to the same file, so this page cannot describe a function the contracts do not have. To check it, '
                     'compile the verified source from Etherscan with the toolchain above and compare the ABI.</p>'))
    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(TITLE)}</title>
<meta name="description" content="{esc(DESC)}">
<style>
{css}
{CSS}
{FOOT_CSS}
</style>
</head>
<body>
<main>
<p class="kicker"><a href="../">THE CHAMBER</a> · WHAT IS ON CHAIN</p>
{"".join(body)}
{footer(CURRENT)}
</main>
{SCRIPT}
</body>
</html>
"""
    (HERE / "index.html").write_text(doc, encoding="utf-8")
    print(f"surface/index.html {len(doc):,} bytes")


if __name__ == "__main__":
    main()
