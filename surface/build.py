#!/usr/bin/env python3
"""Build the reference page from the exported surface.

Generated: `surface.json` comes from the private repository's
`scripts/export-surface.py`, which reads the pinned compile's artifacts - the
verified ABI and the contracts' own `@notice` lines - and carries the commit it
was taken from. This renders it. Never hand-edit index.html, and never edit
surface.json: a wrong line is fixed at the source and re-exported.
"""
import html as _html, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from footer import footer, CSS as FOOT_CSS  # noqa: E402

TITLE = "What is on chain"
DESC = ("Every public function of the two deployed contracts, from the verified ABI, "
        "with each one's own notice where the source has one.")
CURRENT = "surface"

CSS = """
.lede{margin:0 0 30px;color:var(--muted);font-weight:450;line-height:1.4;font-size:clamp(1.15rem,4.2vw,1.45rem)}
.test{margin:0 0 44px;padding:16px 18px;border:1px solid var(--line);border-radius:10px;background:var(--panel);
  color:var(--ink);max-width:70ch}
.work{margin:56px 0 0}
.work > h2{font-size:1.5rem;letter-spacing:-.01em;margin:0 0 4px}
.addr{margin:0 0 26px;font:600 .74rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;color:var(--muted)}
.addr a{color:var(--accent2);text-decoration:none;border:0}
.addr a:hover{color:var(--accent)}
.group{margin:30px 0 0}
.group > h3{font:700 .72rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;
  text-transform:uppercase;color:var(--muted);margin:0 0 12px}
table.surf{width:100%;border-collapse:collapse}
table.surf td{vertical-align:top;padding:12px 12px 12px 0;border-top:1px solid var(--line)}
table.surf tr:first-child td{border-top:0}
td.sig{width:36%;font:500 .8rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
td.sig .ret{display:block;color:var(--muted);font-weight:400}
td.what{font-size:.95rem;line-height:1.5}
td.what.own{border-left:2px solid var(--accent);padding-left:12px}
td.who{width:19%;font:500 .72rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.legend{margin:16px 0 0;font-size:.82rem;color:var(--muted)}
.legend .own{display:inline-block;width:10px;height:10px;border-left:2px solid var(--accent);vertical-align:-1px;margin-right:6px}
.std{margin:22px 0 0;font-size:.9rem;color:var(--muted)}
.std code{font-size:.78rem}
.gap dt{font-weight:700;margin:18px 0 4px}
.gap dd{margin:0;color:var(--ink);max-width:70ch}
.recipe{margin:26px 0 0}
.recipe h3{font-size:1.05rem;margin:0 0 6px}
.recipe p{margin:0 0 10px;max-width:70ch}
pre{max-width:100%;overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px;
  font:500 .78rem/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
pre code{display:inline-block;min-width:0;overflow-wrap:normal;word-break:normal}
.gen{margin:56px 0 0;font-size:.8rem;color:var(--muted)}
@media(max-width:700px){
  table.surf,table.surf tbody,table.surf tr,table.surf td{display:block;width:auto}
  table.surf td{border-top:0;padding:4px 0}
  table.surf tr{border-top:1px solid var(--line);padding:12px 0}
  table.surf tr:first-child{border-top:0}
  td.what.own{padding-left:12px}
}
"""


def esc(t):
    return _html.escape(t, quote=True)


def row(r):
    what = r["notice"] or r["hand"] or ""
    own = " own" if r["source"] == "notice" else ""
    ret = f'<span class="ret">&rarr; {esc(r["returns"])}</span>' if r["returns"] else ""
    return (f'<tr><td class="sig"><code>{esc(r["name"])}({esc(r["params"])})</code>{ret}</td>'
            f'<td class="what{own}">{esc(what)}</td><td class="who">{esc(r["who"])}</td></tr>')


def work(w):
    bits = [f'<section class="work" id="{w["key"]}"><h2>{esc(w["name"])}</h2>',
            f'<p class="addr"><a href="{w["etherscan"]}" target="_blank" rel="noopener">{w["address"]}</a> &middot; '
            f'deployed {w["deployed"]} from <code>{w["deploy_commit"]}</code> &middot; '
            f'{w["counts"]["functions"]} functions, {w["counts"]["reads"]} of them reads</p>']
    for g in w["groups"]:
        if not g["rows"]:
            continue
        bits.append(f'<div class="group"><h3>{esc(g["title"])}</h3><table class="surf"><tbody>'
                    + "".join(row(r) for r in g["rows"]) + "</tbody></table></div>")
    if w["ungrouped"]:
        bits.append('<div class="group"><h3>also in the ABI</h3><table class="surf"><tbody>'
                    + "".join(row(r) for r in w["ungrouped"]) + "</tbody></table></div>")
    std = ", ".join(f"<code>{esc(s.split('(')[0])}</code>" for s in w["erc721"])
    bits.append(f'<p class="std">And the ERC-721 standard set, for wallets and marketplaces: {std}.</p>')
    bits.append("</section>")
    return "".join(bits)


def main():
    d = json.loads((HERE / "surface.json").read_text(encoding="utf-8"))
    css = (ROOT / "black-paper" / "paper.css").read_text(encoding="utf-8")
    body = [f'<h1>{esc(TITLE)}</h1>',
            f'<p class="lede">{esc(DESC)} What a stranger can read, run and rely on &mdash; and what is not exposed yet.</p>',
            f'<p class="test">{esc(d["test"])}</p>',
            f'<p class="legend"><span class="own"></span>A line with the mark is the contract&rsquo;s own <code>@notice</code>, from the verified source. The rest are ours.</p>']
    body += [work(w) for w in d["works"]]
    body.append('<section class="work" id="not-exposed"><h2>Not exposed</h2><dl class="gap">'
                + "".join(f'<dt>{esc(g["what"])}</dt><dd>{esc(g["why"])}</dd>' for g in d["not_exposed"]) + "</dl></section>")
    body.append('<section class="work" id="use"><h2>Four ways to use it</h2>'
                + "".join(f'<div class="recipe"><h3>{esc(r["title"])}</h3><p>{esc(r["text"])}</p><pre><code>{esc(r["code"])}</code></pre></div>' for r in d["recipes"])
                + "</section>")
    g = d["generated"]
    body.append(f'<p class="gen">Generated, never hand-edited: from the pinned compile of the verified sources '
                f'({esc(g["toolchain"])}), at <code>{esc(g["from"])}</code>, {esc(g["date"])}.</p>')
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
</body>
</html>
"""
    (HERE / "index.html").write_text(doc, encoding="utf-8")
    print(f"surface/index.html {len(doc):,} bytes")


if __name__ == "__main__":
    main()
