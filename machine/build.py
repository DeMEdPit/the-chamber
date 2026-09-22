#!/usr/bin/env python3
"""Build the two machine documents from one source, and refuse what the pins or the licence gate do not allow.

    python3 machine/build.py                 # writes machine/core.html and machine/standalone.html
    SITE_OUT=/tmp/site python3 machine/build.py   # elsewhere, for check-site's comparison

One source, `machine/src/core.html`, carries regions marked on their own lines:

    <!--@EMBEDDED-->  ...  <!--@END-EMBEDDED-->       /*@EMBEDDED*/  ...  /*@END-EMBEDDED*/
    <!--@STANDALONE-->  ...  <!--@END-STANDALONE-->   /*@STANDALONE*/  ...  /*@END-STANDALONE*/

The EMBEDDED build keeps the first kind and drops the second; the STANDALONE
build the reverse; both drop the marker lines. Nothing decides at run time.

Before writing anything the build holds, and stops on the first failure:
  - every file under machine/parts/ has the bytes and the sha256 its
    MANIFEST.json states (the site's copies are proven, not assumed);
  - the four emulator pins in the source and the seven pins in the host's
    bridge-client.js equal the manifest's, in order, so the document, the
    client and the copies cannot drift apart;
  - the source is marked GPL-2.0-only, the licence texts and machine/LICENSES.md
    are present, and every part in the manifest names its licence and source;
  - the embedded build carries a policy whose connect-src is data: alone (the
    emulator fetches its WebAssembly from a data URL inside its own script, and
    a data URL reaches no network) and no network call of any kind; the
    standalone build carries no policy.
Standard library only.
"""
import hashlib
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from page import out_root  # noqa: E402

HERE = ROOT / "machine"
SRC = HERE / "src" / "core.html"
MANIFEST = HERE / "parts" / "MANIFEST.json"
OUTPUTS = {"EMBEDDED": "machine/core.html", "STANDALONE": "machine/standalone.html"}
MARK = re.compile(r"^\s*(?:<!--@|/\*@)(END-)?(EMBEDDED|STANDALONE)(?:-->|\*/)\s*$")
NETWORK_TOKENS = ("fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "EventSource", "import(", "navigator.")
SPDX = "SPDX-License-Identifier: GPL-2.0-only"


def die(msg):
    raise SystemExit(f"machine/build.py: {msg}")


def manifest():
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if m.get("version") != 1:
        die(f"MANIFEST.json version {m.get('version')!r}; this build knows version 1")
    for k in ("emulator", "firmware", "parts"):
        if k not in m:
            die(f"MANIFEST.json lacks {k}")
    return m


def check_parts(m):
    by_file = {}
    for p in m["parts"]:
        for k in ("name", "file", "bytes", "sha256", "chain", "licence", "author", "source"):
            if not p.get(k):
                die(f"MANIFEST.json: part {p.get('file') or p.get('name')!r} lacks {k}")
        f = HERE / "parts" / p["file"]
        if not f.exists():
            die(f"{f.relative_to(ROOT)} is named in the manifest but missing")
        b = f.read_bytes()
        if len(b) != p["bytes"]:
            die(f"{p['file']}: {len(b)} bytes, the manifest says {p['bytes']}")
        h = hashlib.sha256(b).hexdigest()
        if h != p["sha256"]:
            die(f"{p['file']}: sha256 {h}, the manifest says {p['sha256']}")
        by_file[p["file"]] = p
    for f in m["emulator"] + list(m["firmware"].values()):
        if f not in by_file:
            die(f"MANIFEST.json names {f} without a part entry")
    return by_file


def check_pins(src, m, by_file):
    pins = re.findall(r"sha256: '([0-9a-f]{64})'", src)
    want = [by_file[f]["sha256"] for f in m["emulator"]]
    if pins != want:
        die("the source's emulator pins do not equal the manifest's, in order:\n  source   " +
            " ".join(p[:12] for p in pins) + "\n  manifest " + " ".join(p[:12] for p in want))
    client = (HERE / "bridge-client.js").read_text(encoding="utf-8")
    cpins = re.findall(r"sha256: '([0-9a-f]{64})'", client)
    cwant = want + [by_file[m["firmware"][k]]["sha256"] for k in ("kernal", "basic", "chargen")]
    if cpins != cwant:
        die("bridge-client.js's pins do not equal the manifest's (four emulator parts, then kernal, basic, chargen):\n  client   " +
            " ".join(p[:12] for p in cpins) + "\n  manifest " + " ".join(p[:12] for p in cwant))
    caddr = [a.lower() for a in re.findall(r"address: '(0x[0-9a-fA-F]{40})'", client)]
    maddr = [by_file[f]["chain"]["address"].lower() for f in m["emulator"]] + [by_file[m["firmware"][k]]["chain"]["address"].lower() for k in ("kernal", "basic", "chargen")]
    if caddr != maddr:
        die("bridge-client.js's addresses do not equal the manifest's")


def check_licence(src, m):
    if SPDX not in src:
        die(f"the source does not carry '{SPDX}'")
    for f in ("licenses/GPL-2.0.txt", "licenses/LGPL-3.0.txt", "licenses/GPL-3.0.txt", "LICENSES.md", "PROTOCOL.md"):
        if not (HERE / f).exists():
            die(f"machine/{f} is missing; the licence gate refuses to build without it")
    lic = (HERE / "LICENSES.md").read_text(encoding="utf-8")
    for s in ("GPL-2.0-only", "LGPL-3.0-or-later", "github.com/nopsta/minimal64", "github.com/MEGA65/open-roms"):
        if s not in lic:
            die(f"machine/LICENSES.md does not name {s}")
    for p in m["parts"]:
        if p["licence"].startswith("LGPL") and "commit" not in p["source"]:
            die(f"{p['file']}: an LGPL part must name the source commit it was built from")


def select(source, build):
    out, stack = [], []
    for n, line in enumerate(source.split("\n"), 1):
        mk = MARK.match(line)
        if mk:
            end, which = mk.group(1), mk.group(2)
            if end:
                if not stack or stack[-1][0] != which:
                    die(f"source line {n}: END-{which} without its opening marker")
                stack.pop()
            else:
                stack.append((which, which == build))
            continue
        if all(keep for _, keep in stack):
            out.append(line)
    if stack:
        die(f"an unclosed region: {stack[-1][0]}")
    return "\n".join(out)


def stamp(doc, build):
    note = (f"<!-- generated by machine/build.py from machine/src/core.html: the {build} build. "
            f"Do not edit; edit the source and rebuild. -->")
    return doc.replace("<!doctype html>\n", "<!doctype html>\n" + note + "\n", 1)


def check_outputs(docs):
    emb, sta = docs["EMBEDDED"], docs["STANDALONE"]
    policy = re.search(r'content="([^"]*)"', emb.split("Content-Security-Policy", 1)[1] if "Content-Security-Policy" in emb else "")
    connect = re.search(r"connect-src ([^;\"]*)", policy.group(1)) if policy else None
    if not connect or connect.group(1).strip() != "data:":
        die("the embedded build's policy must have connect-src data: and nothing else (a data URL reaches no network)")
    body = emb.split("<script>", 1)[1]
    for t in NETWORK_TOKENS:
        if t in body:
            die(f"the embedded build's script contains {t!r}; the embedded machine makes no connection of any kind")
    if "Content-Security-Policy" in sta:
        die("the standalone build carries a policy; it must read the chain")
    if "fetch(" not in sta:
        die("the standalone build lost its fetch path")
    for d in docs.values():
        if SPDX not in d:
            die("a build lost the licence mark")
        if MARK.search(d):
            die("a marker line survived the build")
    proto = re.search(r"var PROTOCOL = (\d+);", emb)
    doc = (HERE / "PROTOCOL.md").read_text(encoding="utf-8")
    if not proto or f"version {proto.group(1)}" not in doc.split("\n", 1)[0]:
        die("PROTOCOL.md's first line does not state the protocol version the source carries")


def build():
    src = SRC.read_text(encoding="utf-8")
    m = manifest()
    by_file = check_parts(m)
    check_pins(src, m, by_file)
    check_licence(src, m)
    docs = {b: stamp(select(src, b), b.lower()) for b in OUTPUTS}
    check_outputs(docs)
    for b, rel in OUTPUTS.items():
        out = out_root() / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(docs[b], encoding="utf-8")
        print(f"machine/build.py: {rel} ({len(docs[b].encode('utf-8'))} bytes)")


if __name__ == "__main__":
    build()
