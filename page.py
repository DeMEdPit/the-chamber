"""The shell every page shares: head, breadcrumb, main, footer, the stylesheet.

A builder supplies its body and its own CSS and calls `render(key, body, ...)`;
everything common comes from here and from the registry, so no page can
invent a sixth version of the site's chrome. `write(key, doc)` puts the page
where the registry says, under an output root that `SITE_OUT` may override,
which is how a check builds the whole site into a temporary directory and
compares it with the committed copy.

    python3 page.py        # build the alias pages the registry declares
"""
import html as _html
import os
import pathlib

from registry import SITE, SITE_NAME, CARD, PAGES, page as _page
from footer import footer, CSS as FOOT_CSS

ROOT = pathlib.Path(__file__).resolve().parent
SITE_CSS = (ROOT / "site.css").read_text(encoding="utf-8")


def esc(t):
    return _html.escape(str(t), quote=True)


def render(key, body, *, title, description, css="", image=CARD, image_alt=SITE_NAME, og_type=None, script=""):
    p = _page(key)
    og_type = og_type or ("website" if p.kind == "home" else "article")
    kicker = "" if not p.kicker else f'<p class="kicker"><a href="../">THE CHAMBER</a> · {p.kicker}</p>\n'
    tail = f"{script}\n" if script else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{SITE}{p.path}">

<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{esc(SITE_NAME)}">
<meta property="og:url" content="{SITE}{p.path}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:image" content="{SITE}{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc(image_alt)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(description)}">
<meta name="twitter:image" content="{SITE}{image}">

<meta name="theme-color" content="#39ff88">
<style>
{SITE_CSS}
{css}
{FOOT_CSS}
</style>
</head>
<body>
<main>
{kicker}{body}
{footer(key)}
</main>
{tail}</body>
</html>
"""


def out_root():
    return pathlib.Path(os.environ.get("SITE_OUT") or ROOT)


def write(key, doc):
    p = _page(key)
    target = out_root() / p.dir / "index.html" if p.dir else out_root() / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(doc, encoding="utf-8")
    print(f"{p.dir + '/' if p.dir else ''}index.html {len(doc):,} bytes")
    return target


def alias_html(p, old_path):
    """A page kept at an old address for ever: it names the new one and goes there."""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(p.label.title())}</title>
<link rel="canonical" href="{SITE}{p.path}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url={p.path}">
<style>html,body{{background:#000}}body{{margin:0;color:#f4f4ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(900px,calc(100% - 36px));margin:auto;padding:72px 0}}a{{color:#9dffd0}}</style>
<script>location.replace("{p.path}" + location.search + location.hash);</script>
</head>
<body>
<main><p>This page now lives at <a href="{p.path}">{SITE}{p.path}</a>. The old address stays, and brings you here.</p></main>
</body>
</html>
"""


def build_aliases():
    for p in PAGES:
        for old in p.aliases:
            target = out_root() / old.strip("/") / "index.html"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(alias_html(p, old), encoding="utf-8")
            print(f"{old.strip('/')}/index.html -> {p.path} (alias)")


if __name__ == "__main__":
    build_aliases()
