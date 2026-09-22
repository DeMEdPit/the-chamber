#!/usr/bin/env python3
"""Build THE MACHINE: the two machine documents from one source, and the page around them.

    python3 machine/build.py                 # machine/core.html, machine/standalone.html, machine/index.html
    SITE_OUT=/tmp/site python3 machine/build.py   # elsewhere, for check-site's comparison

One source, `machine/src/core.html`, carries regions marked on their own lines:

    <!--@EMBEDDED-->  ...  <!--@END-EMBEDDED-->       /*@EMBEDDED*/  ...  /*@END-EMBEDDED*/
    <!--@STANDALONE-->  ...  <!--@END-STANDALONE-->   /*@STANDALONE*/  ...  /*@END-STANDALONE*/

The EMBEDDED build keeps the first kind and drops the second; the STANDALONE
build the reverse; both drop the marker lines. Nothing decides at run time.

Before writing anything the build holds, and stops on the first failure:
  - every file under machine/parts/ has the bytes and the sha256 its
    MANIFEST.json states (the site's copies match the record);
  - the four emulator pins in the source and the seven pins in the host's
    bridge-client.js equal the manifest's, in order, so the document, the
    client and the copies cannot drift apart;
  - the source is marked GPL-2.0-only, the licence texts and machine/LICENSES.md
    are present, and every part in the manifest names its licence and source;
  - the embedded build carries a policy whose connect-src is data: alone (the
    emulator fetches its WebAssembly from a data URL inside its own script, and
    a data URL reaches no network) and no network call of any kind; the
    standalone build carries no policy.
The page is rendered through the site's shell with its own policy: scripts
only from this site, connections only to this site and the shared endpoints,
frames only from this site, nothing inline. Standard library only.
"""
import hashlib
import json
import math
import os
import pathlib
import re
import sys
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from page import out_root, render, write  # noqa: E402
from registry import RPCS, CONTRACTS  # noqa: E402

HERE = ROOT / "machine"
SRC = HERE / "src" / "core.html"
MANIFEST = HERE / "parts" / "MANIFEST.json"
OUTPUTS = {"EMBEDDED": "machine/core.html", "STANDALONE": "machine/standalone.html"}
MARK = re.compile(r"^\s*(?:<!--@|/\*@)(END-)?(EMBEDDED|STANDALONE)(?:-->|\*/)\s*$")
NETWORK_TOKENS = ("fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "EventSource", "import(", "navigator.")
SPDX = "SPDX-License-Identifier: GPL-2.0-only"
KEY = "machine"
TITLE = "The Machine"
DESC = ("READY 64 in the page: the Commodore 64 emulator nopsta stored on Ethereum in 2022, running any program of "
        "the series straight from the chain, every byte checked against its pin before it runs.")
MONO = "ui-monospace,SFMono-Regular,Menlo,monospace"


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


# ------------------------------------------------------------------ the page
def policy():
    origins = sorted({f"{urlsplit(u).scheme}://{urlsplit(u).netloc}" for u in RPCS})
    return ("default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; "
            "connect-src 'self' " + " ".join(origins) + "; frame-src 'self'; child-src 'self'; "
            "base-uri 'none'; form-action 'none'; object-src 'none'")


PAGE_CSS = f"""
main{{width:min(1180px,calc(100% - 36px))}}
h1{{font-size:clamp(2.2rem,9vw,5.6rem);margin-bottom:14px}}
.lede{{margin:0 0 26px;color:var(--muted);font-weight:450;line-height:1.4;font-size:clamp(1.05rem,3.6vw,1.3rem);max-width:70ch}}
.lede b{{color:var(--ink);font-weight:600}}
.machine{{display:grid;grid-template-columns:768px 1fr;gap:22px;align-items:start}}
.stage{{min-width:0}}
.frame{{position:relative;width:100%;aspect-ratio:384/272;background:#000;border:1px solid var(--line);border-radius:6px;overflow:hidden}}
.frame iframe{{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#000}}
.frame:focus-within{{outline:2px solid var(--accent);outline-offset:2px}}
.veil{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;
  background:rgba(0,0,0,.72);color:var(--ink);font:700 .8rem/1.6 {MONO};letter-spacing:.16em;pointer-events:none}}
.veil[hidden]{{display:none}}
.hint{{margin:10px 0 0;font-size:.85rem;color:var(--muted)}}
.touch{{display:none;margin:14px 0 0;grid-template-columns:auto auto;justify-content:space-between;gap:16px;align-items:center;touch-action:none;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none}}
.touch .ring{{width:184px;height:184px;display:block;touch-action:none}}
.touch .ring .w{{fill:var(--panel);stroke:#333;stroke-width:1.5;vector-effect:non-scaling-stroke}}
.touch .ring .g{{fill:#4d4d48}}
.touch .ring .d.half .w{{fill:#0a110d}}
.touch .ring .d.on .w{{fill:#0f1a14;stroke:var(--accent)}}
.touch .ring .d.on .g,.touch .ring .d.half .g{{fill:var(--accent)}}
.touch[data-ways="4"] .ring .diag .g{{opacity:.4}}
.touch button{{font:700 .72rem/1 {MONO};letter-spacing:.1em;color:var(--ink);background:var(--panel);border:1px solid #333;border-radius:8px;
  touch-action:none;user-select:none;-webkit-user-select:none}}
.touch button.down{{border-color:var(--accent);color:var(--accent);background:#0f1a14}}
.touch .fire{{width:120px;height:120px;border-radius:50%;font-size:.9rem;margin-right:8px}}
@media(pointer:coarse){{.touch{{display:grid}}}}
@media(max-width:360px){{.touch .ring{{width:160px;height:160px}}.touch .fire{{width:104px;height:104px}}}}
.column{{min-width:0;display:flex;flex-direction:column;gap:14px}}
.panel{{padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}}
.panel .lab{{display:flex;justify-content:space-between;gap:12px;font:700 .66rem/1.2 {MONO};letter-spacing:.18em;color:var(--accent);margin:0 0 10px}}
.panel .lab .n{{color:var(--muted);letter-spacing:.06em;font-weight:500;text-transform:none}}
.search{{width:100%;box-sizing:border-box;margin:0 0 10px;padding:9px 10px;font:500 .9rem/1.3 {MONO};color:var(--ink);background:#050505;border:1px solid #333;border-radius:6px}}
.search:focus{{outline:0;border-color:var(--accent)}}
.rows{{max-height:330px;overflow:auto;border-top:1px solid var(--line)}}
.rows .g{{position:sticky;top:0;background:var(--panel);font:700 .6rem/2.2 {MONO};letter-spacing:.16em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line)}}
.row{{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #161616}}
.row .t{{display:flex;flex-direction:column;min-width:0}}
.row .title{{font-size:.92rem;color:var(--ink)}}
.row .sub{{font-size:.74rem;color:var(--muted);line-height:1.35}}
.row.now .title{{color:var(--accent)}}
button.load,button.b{{flex:none;font:700 .66rem/1 {MONO};letter-spacing:.14em;color:var(--accent2);background:transparent;border:1px solid #2c3f36;border-radius:6px;padding:8px 12px;cursor:pointer}}
button.load:hover,button.b:hover,button.load:focus-visible,button.b:focus-visible{{border-color:var(--accent);color:var(--accent);outline:0}}
.state{{font:700 .8rem/1.4 {MONO};letter-spacing:.16em;color:var(--ink);margin:0 0 10px}}
.state[data-phase="running"]{{color:var(--accent)}}
.state[data-phase="refused"],.state[data-phase="failed"]{{color:#ff9d9d}}
.playing{{display:flex;flex-direction:column;gap:6px;margin:0 0 12px}}
.nl{{display:grid;grid-template-columns:84px 1fr;gap:10px;font-size:.84rem;line-height:1.45}}
.nl .k{{font:700 .6rem/1.9 {MONO};letter-spacing:.16em;color:var(--muted)}}
.nl .v{{color:var(--ink);overflow-wrap:anywhere}}
.nl.bad .v{{color:#ff9d9d}}
.nl.muted .v{{color:var(--muted)}}
.log{{list-style:none;margin:0 0 10px;padding:8px 0 0;border-top:1px solid var(--line);font:500 .72rem/1.5 {MONO};color:var(--muted);max-height:160px;overflow:auto}}
.log li{{margin:0;overflow-wrap:anywhere}}
.tools{{display:flex;flex-wrap:wrap;gap:8px;align-items:center}}
.tools .copied{{font:500 .72rem/1 {MONO};color:var(--muted)}}
textarea.json{{width:100%;box-sizing:border-box;margin:10px 0 0;height:120px;font:500 .7rem/1.4 {MONO};color:var(--muted);background:#050505;border:1px solid #222;border-radius:6px}}
.keys{{margin:0;font-size:.85rem;color:var(--ink);line-height:1.5}}
.keys dt{{font:700 .6rem/1.9 {MONO};letter-spacing:.16em;color:var(--muted);margin-top:6px}}
.keys dd{{margin:0}}
select.mode{{max-width:100%;box-sizing:border-box;font:500 .84rem/1.3 {MONO};color:var(--ink);background:#050505;border:1px solid #333;border-radius:6px;padding:6px 8px}}
.leave a{{display:inline-block;font:700 .72rem/1.4 {MONO};letter-spacing:.14em;color:var(--accent2);text-decoration:none;border:1px solid #2c3f36;border-radius:6px;padding:10px 14px}}
.leave a:hover{{border-color:var(--accent);color:var(--accent)}}
.about{{margin:44px 0 0;max-width:70ch}}
.about h2{{margin-top:44px}}
.about p{{font-size:.95rem;color:#deded9}}
.about code{{font-size:.8rem}}
@media(max-width:1139px){{.machine{{grid-template-columns:1fr}}.frame{{max-width:768px}}}}
@media(max-width:700px){{main{{width:calc(100% - 32px)}}.rows{{max-height:260px}}.nl{{grid-template-columns:1fr;gap:0}}}}
"""


def ring_svg():
    """The ring of the touch controls: eight wedges of 45 degrees on an annulus,
    centred on the eight directions, each carrying the joystick bits it stands
    for (up 1, down 2, left 4, right 8; a diagonal both) and a glyph pointing
    its way. The hole is the rest position. host.js reads the ring by angle
    with the same numbers (RING_HOLE = 40 / 96), so the drawing is the rule."""
    outer, inner = 96.0, 40.0
    dirs = (("u", 1, -90), ("ur", 9, -45), ("r", 8, 0), ("dr", 10, 45), ("d", 2, 90), ("dl", 6, 135), ("l", 4, 180), ("ul", 5, 225))

    def n(v):
        t = ("%.2f" % (v + 0.0)).rstrip("0").rstrip(".")
        return "0" if t in ("-0", "") else t

    def pt(radius, deg):
        a = math.radians(deg)
        return f"{n(radius * math.cos(a))} {n(radius * math.sin(a))}"

    out = []
    for name, bits, a in dirs:
        a1, a2 = a - 22.5, a + 22.5
        d = (f"M{pt(outer, a1)}A{n(outer)} {n(outer)} 0 0 1 {pt(outer, a2)}"
             f"L{pt(inner, a2)}A{n(inner)} {n(inner)} 0 0 0 {pt(inner, a1)}Z")
        diag = len(name) == 2
        glyph = "M0 -73L4.5 -65L-4.5 -65Z" if diag else "M0 -75L6 -64L-6 -64Z"
        out.append(f'<g class="d {"diag" if diag else "card"}" data-bits="{bits}"><path class="w" d="{d}"/>'
                   f'<path class="g" d="{glyph}" transform="rotate({a + 90})"/></g>')
    return '<svg class="ring" id="ring" viewBox="-100 -100 200 200" aria-label="the direction ring">' + "".join(out) + "</svg>"


def page_body():
    chamber, perception = CONTRACTS["chamber"], CONTRACTS["perception"]
    return f"""<h1>The Machine</h1>
<p class="lede"><b>READY 64</b>, in this page: minimal64, the Commodore 64 emulator nopsta stored on Ethereum in 2022,
read off the chain and checked against its pins before it runs. It starts on Tony: Born for Adventure, the first
token of the series, read from its contract and checked the same way; choose any other program below.</p>
<div class="machine">
  <div class="stage">
    <div class="frame" id="frame" aria-label="READY 64, the machine">
      <div class="veil" id="veil"><span id="veil-text">THE MACHINE IS OFF</span></div>
    </div>
    <div class="touch" id="touch" aria-label="joystick" data-ways="4">
      {ring_svg()}
      <button type="button" class="fire" data-bit="16">FIRE</button>
    </div>
    <p class="hint">Sound starts with your first tap or key on this page; a phone on silent stays silent. Click the machine to give it your keys. Escape is RUN/STOP on a Commodore 64 and never leaves this page.</p>
  </div>
  <aside class="column">
    <section class="panel" aria-labelledby="lab-chain">
      <div class="lab"><span id="lab-chain">FROM THE CHAIN</span><span class="n" id="count"></span></div>
      <input class="search" id="search" type="search" placeholder="a number, a character, a colour, a room word, a work" aria-label="search the programs on the chain" autocomplete="off">
      <div class="rows" id="rows" aria-live="polite"></div>
    </section>
    <section class="panel" aria-labelledby="lab-now">
      <div class="lab"><span id="lab-now">NOW PLAYING</span></div>
      <p class="state" id="state" aria-live="polite">THE MACHINE IS OFF</p>
      <div class="playing" id="now"></div>
      <ul class="log" id="log" aria-label="what the page read and checked; the last lines, the whole log copies"></ul>
      <div class="tools">
        <button type="button" class="b" id="copy">COPY PROVENANCE</button>
        <button type="button" class="b" id="copy-log">COPY THE LOG</button>
        <button type="button" class="b" id="retry" hidden>RETRY</button>
        <span class="copied" id="copied"></span>
      </div>
      <textarea class="json" id="provenance-json" readonly aria-label="the provenance as JSON" hidden></textarea>
    </section>
    <section class="panel" aria-labelledby="lab-keys">
      <div class="lab"><span id="lab-keys">THE KEYS</span></div>
      <dl class="keys">
        <dt>INPUT</dt><dd><select class="mode" id="input-mode" aria-label="what the arrow keys feed"><option value="joystick" selected>joystick in port 2</option><option value="keyboard">the keyboard</option></select></dd>
        <dt>JOYSTICK</dt><dd>arrows move; Z, X or space is FIRE. The programs of the series read port 2.</dd>
        <dt>DIAGONALS</dt><dd><select class="mode" id="ways" aria-label="how the ring reads a diagonal"><option value="4" selected>one direction</option><option value="8">both directions, eight ways</option></select> <span class="hint">on a touch screen the ring is read by angle, and the hole is rest. The programs of the series stand still when two directions are pressed together, so a diagonal is read as one direction, left or right first, until you say otherwise.</span></dd>
        <dt>KEYBOARD</dt><dd>your keys are the C64's; Escape is RUN/STOP, Home is CLR/HOME, the function keys are F1 to F7.</dd>
        <dt>SOUND</dt><dd><button type="button" class="b" id="sound">SOUND ON</button> <span class="hint">the page plays what the machine's sound chip makes</span></dd>
        <dt>FIRMWARE</dt><dd>off: the programs of the series run bare, as they do on chain.</dd>
        <dt>RESET</dt><dd><button type="button" class="b" id="reset">RESET THE MACHINE</button></dd>
      </dl>
    </section>
    <section class="panel leave" aria-labelledby="lab-leave">
      <div class="lab"><span id="lab-leave">LEAVE THE MACHINE</span></div>
      <a href="/">BACK TO THE CHAMBER</a>
    </section>
  </aside>
</div>
<section class="about">
  <h2>What this page does, and does not</h2>
  <p>The machine is the emulator nopsta stored on Ethereum in 2022, in four data contracts: <a href="https://etherscan.io/address/0x1Cc49e603B4b205Be0E74f8833971Bea5beccEC9" target="_blank" rel="noopener">the gunzip helper</a> and <a href="https://etherscan.io/address/0xEF13021d5302c3fCe437A3C281A286479ba60008" target="_blank" rel="noopener">three parts of minimal64</a>. The page reads them from the chain first; if no node answers, it uses the site's own copies of the same bytes; either way each part must hash to the pin the page carries, or it does not run, and NOW PLAYING says which source it was.</p>
  <p>A program is read from its contract the way anyone can read it: <a href="https://etherscan.io/address/{chamber}#readContract" target="_blank" rel="noopener">the Chamber's</a> <code>prg(id)</code>, stamped with the block you load it at, is held to the pinned base outside its 42-byte stamp and to the row and the block inside it; <a href="https://etherscan.io/address/{perception}#readContract" target="_blank" rel="noopener">the Perception Chamber Canary's</a> <code>prgWithBrain(1)</code> is held to the frozen program outside its mind and to the head revision's record inside it; the two older tokens are held to their pinned hashes. The words on the provenance line mean what they say: <b>PINNED</b>, the bytes matched a commitment this page held before it asked; <b>CONTRACT-CONSISTENT</b>, they matched what the same node reported in the same session; <b>NODE-REPORTED</b>, a fact one node stated. One node is asked, and it is named. The pins are in <a href="catalogue.json">the catalogue</a>, which <a href="verify.py">a public script</a> checks against the chain for anyone who runs it (<a href="CATALOGUE.md">how</a>).</p>
  <p>The machine runs in a frame that cannot reach this page, the network or your storage; the page speaks to it over one port, by <a href="PROTOCOL.md">a written protocol</a>. Nothing on this page reaches into the machine: the mode is PURE, and the provenance would say INTERVENED if anything ever did. A public node sees the address you read from and the contracts you ask for, nothing else; to use a node of your own, open <a href="standalone.html">the standalone machine</a> with <code>?rpc=</code> and your endpoint.</p>
  <p>The machine document is GPL-2.0-only, nopsta's licence; the page around it is MIT; <a href="LICENSES.md">what is what</a>. Your own files come in the next phase of this page.</p>
</section>"""


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
        print(f"machine/build.py: {rel} ({len(docs[b].encode('utf-8')) } bytes)")
    head = '<link rel="alternate" type="application/json" href="catalogue.json" title="the catalogue">'
    doc = render(KEY, page_body(), title=TITLE, description=DESC, css=PAGE_CSS, csp=policy(), head=head,
                 script='<script type="module" src="host.js"></script>')
    write(KEY, doc)


if __name__ == "__main__":
    build()
