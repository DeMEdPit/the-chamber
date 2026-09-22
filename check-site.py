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
5. The machine (machine/): the documents its page generates are reproduced
   too; the page's policy names only itself and the shared endpoints, allows
   no inline script and frames only itself; the site's copies of the emulator and the ROMs match their
   manifest offline; the source's pins equal the manifest's; the embedded
   document's policy lets it connect to data: URLs alone and its script has
   no network call; the
   licence gate holds (GPL and LGPL marks and texts present, LICENSES.md names
   the sources, README, LICENSE and the footer no longer say all of it is MIT);
   the catalogue parses and the public verifier's offline check passes
   against it and the copies.

    python3 check-site.py

Standard library only. Exit status 1 on any failure, with every failure named.
"""
import hashlib
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
from registry import SITE, PAGES, BUILDERS  # noqa: E402

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
        pairs += [(ROOT / g, pathlib.Path(tmp) / g) for b in BUILDERS for g in b.generates]
        pairs += [(ROOT / g, pathlib.Path(tmp) / g) for p in PAGES for g in p.generates]
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
    shared = ["html{scroll-behavior", "scroll-margin-top", ".kicker{", ".kicker a", ".site-foot{", "prefers-reduced-motion:no-preference"]
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
    for f in ("surface/surface.json", "architecture/findings.json", "machine/parts/MANIFEST.json", "machine/catalogue.json"):
        try:
            json.loads((ROOT / f).read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            fail(f"{f}: does not parse ({e})")


def check_machine():
    """The machine's own gate, on the committed tree, without building."""
    mdir = ROOT / "machine"
    try:
        man = json.loads((mdir / "parts" / "MANIFEST.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return                                        # named by check_inputs
    by_file = {}
    for part in man.get("parts", []):
        f = mdir / "parts" / part.get("file", "")
        for k in ("file", "bytes", "sha256", "licence", "source", "chain"):
            if not part.get(k):
                fail(f"machine/parts/MANIFEST.json: {part.get('file') or part.get('name')!r} lacks {k}")
        if not f.exists():
            fail(f"machine/parts/{part.get('file')}: named in the manifest but missing")
            continue
        b = f.read_bytes()
        if len(b) != part.get("bytes") or hashlib.sha256(b).hexdigest() != part.get("sha256"):
            fail(f"machine/parts/{part['file']}: does not match its manifest entry (bytes or sha256)")
        by_file[part["file"]] = part
    src = (mdir / "src" / "core.html").read_text(encoding="utf-8")
    pins = re.findall(r"sha256: '([0-9a-f]{64})'", src)
    want = [by_file[f]["sha256"] for f in man.get("emulator", []) if f in by_file]
    if pins != want:
        fail("machine/src/core.html: the emulator pins differ from machine/parts/MANIFEST.json")
    client = (mdir / "bridge-client.js").read_text(encoding="utf-8")
    cpins = re.findall(r"sha256: '([0-9a-f]{64})'", client)
    fw = man.get("firmware", {})
    cwant = want + [by_file[fw[k]]["sha256"] for k in ("kernal", "basic", "chargen") if fw.get(k) in by_file]
    if cpins != cwant:
        fail("machine/bridge-client.js: the pins in code differ from machine/parts/MANIFEST.json (the commitment lives in code; the manifest must agree)")
    for f in ("core.html", "standalone.html", "src/core.html"):
        if "SPDX-License-Identifier: GPL-2.0-only" not in (mdir / f).read_text(encoding="utf-8"):
            fail(f"machine/{f}: not marked GPL-2.0-only")
    emb = (mdir / "core.html").read_text(encoding="utf-8")
    connect = re.search(r"connect-src ([^;\"]*)", emb)
    if not connect or connect.group(1).strip() != "data:":
        fail("machine/core.html: the embedded document's policy must have connect-src data: and nothing else")
    for t in ("fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "EventSource"):
        if t in emb.split("<script>", 1)[-1]:
            fail(f"machine/core.html: the embedded document's script contains {t!r}")
    if "SPDX-License-Identifier: MIT" not in (mdir / "bridge-client.js").read_text(encoding="utf-8"):
        fail("machine/bridge-client.js: not marked MIT")
    for f in ("licenses/GPL-2.0.txt", "licenses/LGPL-3.0.txt", "licenses/GPL-3.0.txt", "LICENSES.md", "PROTOCOL.md", "README.md"):
        if not (mdir / f).exists():
            fail(f"machine/{f}: missing")
    lic = (mdir / "LICENSES.md").read_text(encoding="utf-8") if (mdir / "LICENSES.md").exists() else ""
    for s in ("GPL-2.0-only", "LGPL-3.0-or-later", "github.com/nopsta/minimal64", "github.com/MEGA65/open-roms",
              "ad178dbe4d48cd6a317737a8e0e7e662f7e33d32"):
        if s not in lic:
            fail(f"machine/LICENSES.md: does not name {s}")
    proto = re.search(r"var PROTOCOL = (\d+);", src)
    client = re.search(r"export const PROTOCOL = (\d+);", (mdir / "bridge-client.js").read_text(encoding="utf-8"))
    first = (mdir / "PROTOCOL.md").read_text(encoding="utf-8").split("\n", 1)[0] if (mdir / "PROTOCOL.md").exists() else ""
    if not (proto and client and proto.group(1) == client.group(1) and f"version {proto.group(1)}" in first):
        fail("the protocol version differs between machine/src/core.html, machine/bridge-client.js and machine/PROTOCOL.md")
    if "machine/LICENSES.md" not in (ROOT / "README.md").read_text(encoding="utf-8"):
        fail("README.md: does not point at machine/LICENSES.md")
    lic_root = (ROOT / "LICENSE").read_text(encoding="utf-8")
    if "GPL-2.0-only" not in lic_root or "machine/" not in lic_root:
        fail("LICENSE: does not say that machine/ is not under it")
    for f, words in (("LICENSE", lic_root), ("README.md", (ROOT / "README.md").read_text(encoding="utf-8")), ("footer.py", (ROOT / "footer.py").read_text(encoding="utf-8"))):
        if re.search(r"GPL-2\.0(?!-only)(?!\.txt)", words):
            fail(f"{f}: names the emulator's licence as GPL-2.0 without -only; one identifier everywhere")
    if "All of it MIT" in (ROOT / "footer.py").read_text(encoding="utf-8"):
        fail("footer.py: still says all of it is MIT")
    # the page: its policy names only the shared endpoints and itself, allows no inline script, frames only itself
    from registry import RPCS
    from urllib.parse import urlsplit
    host = (mdir / "index.html").read_text(encoding="utf-8") if (mdir / "index.html").exists() else ""
    pol = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)"', host)
    if not pol:
        fail("machine/index.html: no Content-Security-Policy")
    else:
        d = {}
        for part in pol.group(1).split(";"):
            bits = part.strip().split()
            if bits:
                d[bits[0]] = bits[1:]
        origins = sorted({f"{urlsplit(u).scheme}://{urlsplit(u).netloc}" for u in RPCS})
        if sorted(x for x in d.get("connect-src", []) if x != "'self'") != origins or "'self'" not in d.get("connect-src", []):
            fail("machine/index.html: connect-src is not 'self' plus exactly the registry's endpoint origins")
        if d.get("script-src") != ["'self'"]:
            fail("machine/index.html: script-src must be 'self' alone")
        if d.get("frame-src") != ["'self'"] or d.get("default-src") != ["'none'"]:
            fail("machine/index.html: frame-src must be 'self' and default-src 'none'")
    if re.search(r"<script(?![^>]*\bsrc=)", host):
        fail("machine/index.html: an inline script; the page's scripts are files under script-src 'self'")
    try:
        cat = json.loads((mdir / "catalogue.json").read_text(encoding="utf-8"))
        if list(cat.get("endpoints", [])) != list(RPCS):
            fail("machine/catalogue.json: the endpoints are not the registry's list")
    except Exception:  # noqa: BLE001
        pass                                          # named by check_inputs
    # the catalogue against itself and the site's copies, by the public verifier, without a network
    r = subprocess.run([sys.executable, str(mdir / "verify.py"), "--offline"], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        fail("machine/verify.py --offline failed:\n" + "\n".join("      " + l for l in (r.stdout + r.stderr).strip().split("\n")[-12:]))


def main():
    check_inputs()
    check_shared_rules()
    check_pages()
    check_machine()
    check_reproduces()
    if FAILS:
        print("check-site: FAILED")
        for m in FAILS:
            print("  - " + m)
        sys.exit(1)
    print(f"check-site: ok ({len(PAGES)} pages, {sum(len(p.aliases) for p in PAGES)} alias, "
          f"{sum(len(b.generates) for b in BUILDERS) + sum(len(p.generates) for p in PAGES)} generated documents, reproduced byte for byte, every link and anchor resolves, the machine's gate holds)")


if __name__ == "__main__":
    main()
