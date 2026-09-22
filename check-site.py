#!/usr/bin/env python3
"""The site's check: what must be true of the committed pages before they are published.

1. A clean build reproduces the published HTML: the whole site is built into a
   temporary directory and every page, alias included, is compared byte for
   byte with the committed copy. A hand edit, or a forgotten rebuild, fails here.
2. Every registered page exists, parses, has exactly one h1, a title, a
   description and the canonical address the registry gives it; every
   non-home page carries the breadcrumb; the footer lists every page.
3. Ids are unique per document; every in-page anchor resolves; every link
   and asset reference within the site resolves to a file in the repository.
   Links to other sites are not fetched: internal integrity is a hard
   failure, external reachability is not this check's business.
4. No builder carries a private copy of a rule that is the shared
   stylesheet's or the footer's; the JSON inputs of the generated pages parse.

    python3 check-site.py

Standard library only. Exit status 1 on any failure, with every failure named.
"""
import html.parser
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from registry import SITE, PAGES  # noqa: E402

FAILS = []


def fail(msg):
    FAILS.append(msg)


def page_file(p):
    return ROOT / p.dir / "index.html" if p.dir else ROOT / "index.html"


def alias_files():
    return [(old, ROOT / old.strip("/") / "index.html", p) for p in PAGES for old in p.aliases]


class Doc(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.dup = set(), []
        self.h1 = 0
        self.title = ""
        self._in_title = False
        self.description = None
        self.canonical = None
        self.fragments, self.links, self.assets = [], [], []
        self.kicker = False
        self.footer_labels = []
        self._in_foot = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            (self.dup if a["id"] in self.ids else self.ids).append(a["id"]) if a["id"] in self.ids else self.ids.add(a["id"])
        if tag == "h1":
            self.h1 += 1
        if tag == "title":
            self._in_title = True
        if tag == "meta" and a.get("name") == "description":
            self.description = a.get("content")
        if tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href")
        if tag == "p" and "kicker" in (a.get("class") or ""):
            self.kicker = True
        if tag == "footer":
            self._in_foot = 1
        if tag == "a" and a.get("href") is not None:
            h = a["href"]
            if h.startswith("#"):
                self.fragments.append(h[1:])
            else:
                self.links.append(h)
        for k in ("src", "poster", "data"):
            if k in a:
                self.assets.append(a[k])

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "footer":
            self._in_foot = 0

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_foot and data.strip():
            self.footer_labels.append(data.strip())


def resolve(base_dir, ref):
    """A site-internal reference to a repository file, or None if it leaves the site."""
    ref = ref.split("#", 1)[0].split("?", 1)[0]
    if not ref:
        return None
    if ref.startswith(SITE):
        ref = ref[len(SITE):] or "/"
    u = urllib.parse.urlparse(ref)
    if u.scheme or u.netloc:
        return None                                   # another site: not checked here
    if ref.startswith("/"):
        target = ROOT / ref.lstrip("/")
    else:
        target = (base_dir / ref)
    target = pathlib.Path(os.path.normpath(target))
    if target.is_dir() or ref.endswith("/"):
        target = target / "index.html"
    return target


def check_reproduces():
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ, SITE_OUT=tmp)
        r = subprocess.run([sys.executable, str(ROOT / "build-all.py")], cwd=ROOT, env=env, capture_output=True, text=True)
        if r.returncode != 0:
            fail("the build failed in a temporary directory:\n" + r.stdout + r.stderr)
            return
        pairs = [(page_file(p), pathlib.Path(tmp) / p.dir / "index.html" if p.dir else pathlib.Path(tmp) / "index.html") for p in PAGES]
        pairs += [(f, pathlib.Path(tmp) / old.strip("/") / "index.html") for old, f, _ in alias_files()]
        for committed, built in pairs:
            rel = committed.relative_to(ROOT)
            if not committed.exists():
                fail(f"{rel}: not committed")
            elif not built.exists():
                fail(f"{rel}: the build did not produce it")
            elif committed.read_bytes() != built.read_bytes():
                fail(f"{rel}: the committed page differs from a clean build (rebuild with build-all.py, or a hand edit slipped in)")


def check_pages():
    labels = {p.label for p in PAGES}
    for p in PAGES:
        f = page_file(p)
        if not f.exists():
            fail(f"{p.key}: {f.relative_to(ROOT)} missing")
            continue
        d = Doc()
        d.feed(f.read_text(encoding="utf-8"))
        rel = f.relative_to(ROOT)
        if d.h1 != 1:
            fail(f"{rel}: {d.h1} h1 elements, wanted 1")
        if not d.title.strip():
            fail(f"{rel}: no title")
        if not d.description:
            fail(f"{rel}: no description")
        if d.canonical != SITE + p.path:
            fail(f"{rel}: canonical is {d.canonical!r}, the registry says {SITE + p.path!r}")
        if p.kind != "home" and not d.kicker:
            fail(f"{rel}: no breadcrumb")
        missing_labels = labels - set(d.footer_labels)
        if missing_labels:
            fail(f"{rel}: the footer lacks {sorted(missing_labels)}")
        if d.dup:
            fail(f"{rel}: repeated ids {sorted(set(d.dup))}")
        for frag in d.fragments:
            if frag and frag not in d.ids:
                fail(f"{rel}: anchor #{frag} has no target")
        for ref in d.links + d.assets:
            t = resolve(f.parent, ref)
            if t is not None and not t.exists():
                fail(f"{rel}: {ref} -> {t.relative_to(ROOT) if t.is_relative_to(ROOT) else t} does not exist")
    for old, f, p in alias_files():
        if not f.exists():
            fail(f"alias {old}: {f.relative_to(ROOT)} missing")
        else:
            d = Doc(); d.feed(f.read_text(encoding="utf-8"))
            if d.canonical != SITE + p.path:
                fail(f"alias {old}: canonical is {d.canonical!r}, wanted {SITE + p.path!r}")


def check_shared_rules():
    shared = ["html{scroll-behavior", ".kicker{", ".kicker a", ".site-foot{", "prefers-reduced-motion:no-preference"]
    for p in PAGES:
        b = ROOT / p.dir / "build.py" if p.dir else ROOT / "build.py"
        src = b.read_text(encoding="utf-8")
        for s in shared:
            if s in src:
                fail(f"{b.relative_to(ROOT)}: carries a private copy of a shared rule ({s}); it belongs in site.css or footer.py")
    for extra in ("papers.py", "stats.py", "gallery.py", "token_embed.py"):
        src = (ROOT / extra).read_text(encoding="utf-8")
        for s in shared:
            if s in src:
                fail(f"{extra}: carries a private copy of a shared rule ({s})")


def check_inputs():
    for f in ("surface/surface.json", "architecture/findings.json"):
        try:
            json.loads((ROOT / f).read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            fail(f"{f}: does not parse ({e})")


def main():
    check_inputs()
    check_shared_rules()
    check_pages()
    check_reproduces()
    if FAILS:
        print("check-site: FAILED")
        for m in FAILS:
            print("  - " + m)
        sys.exit(1)
    print(f"check-site: ok ({len(PAGES)} pages, {sum(len(p.aliases) for p in PAGES)} alias, reproduced byte for byte, every link and anchor resolves)")


if __name__ == "__main__":
    main()
