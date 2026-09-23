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
import struct
import sys
import zlib
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
main{{width:min(1300px,calc(100% - 36px))}}   /* wider than the site's pages: the player stays at twice the C64's picture and the panel beside it gets about 510 */
h1{{font-size:clamp(1.9rem,5vw,2.6rem);margin:0 0 6px}}   /* compact on this page: the machine sits in the first screen, as a player page has it */
.lede{{margin:0 0 18px;color:var(--muted);font-weight:450;line-height:1.4;font-size:clamp(.95rem,2.6vw,1.05rem);max-width:768px;text-wrap:balance}}   /* a block under the title as wide as the player, wrapping at the gap between the columns, not a band across the page; its lines evened where the browser can (the owner's eye on the phone's rag) */
.lede p{{margin:0 0 8px;font-size:inherit;color:inherit}}
.lede p:last-child{{margin-bottom:0}}
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
.screen{{position:relative;margin-bottom:40px}}   /* the badge hangs 40px below the frame; what follows clears it */
.link{{position:absolute;top:100%;right:10px;margin-top:-1px;display:grid;grid-template-columns:auto auto auto;grid-template-rows:auto auto;column-gap:9px;row-gap:0;
  align-items:center;padding:4px 9px 5px;border:1px solid var(--line);border-top:0;border-radius:0 0 6px 6px;background:var(--panel);
  font:600 .58rem/1.5 {MONO};letter-spacing:.1em;text-transform:uppercase;color:var(--muted);max-width:calc(100% - 20px);white-space:nowrap}}
.link .lk{{grid-column:1;grid-row:1;color:var(--accent)}}
.link .ls{{grid-column:2;grid-row:1;color:var(--ink)}}
.link .ln{{grid-column:1;grid-row:2;color:var(--ink);text-transform:none;letter-spacing:.03em}}
.link .lb{{grid-column:2;grid-row:2;text-transform:none;letter-spacing:.03em}}
.link .le{{grid-column:3;grid-row:1/3;display:inline-flex;gap:4px;margin-left:2px}}
.link .ls::before{{content:"";display:inline-block;width:6px;height:6px;margin:0 6px 1px 0;border-radius:50%;background:#333;vertical-align:middle}}
.link[data-phase="seeking"] .ls::before,.link[data-phase="reading"] .ls::before{{background:var(--accent);animation:linkPulse .9s ease-in-out infinite}}
.link[data-phase="held"] .ls::before{{background:var(--accent)}}
.link[data-phase="refused"] .ls::before,.link[data-phase="lost"] .ls::before{{background:#ff9d9d}}
.link[data-phase="refused"] .ls,.link[data-phase="lost"] .ls{{color:#ff9d9d}}
.link .le i{{display:block;width:8px;height:8px;border:1px solid #3a3a3a;border-radius:2px;background:var(--panel)}}
.link .le i[data-state="in-use"]{{background:var(--accent);border-color:var(--accent)}}
.link .le i[data-state="held"]{{background:#0f1a14;border-color:var(--accent)}}
.link .le i[data-state="demoted"]{{border-color:#555;background:#161616}}
.link .le i[data-state="set-aside"]{{border-color:#ff9d9d;background:#2a1414}}
@keyframes linkPulse{{0%,100%{{opacity:.25}}50%{{opacity:1}}}}
@media(prefers-reduced-motion:reduce){{.link .ls::before{{animation:none}}}}
.link .l{{display:none}}
.link .ln,.link .lb{{overflow:hidden;text-overflow:ellipsis}}
@media(max-width:1139px){{.link{{grid-template-columns:11ch 9.5ch auto}}}}
@media(min-width:1140px){{.link{{left:10px;right:auto;grid-template-columns:29ch 34.5ch auto}}.link .s{{display:none}}.link .l{{display:inline}}}}   /* fixed columns: the longest endpoint name, and a block with its short hash; the box never grows */
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
@media(pointer:coarse){{.touch{{display:grid}}.screen{{margin-bottom:0}}}}   /* on a touch screen the badge sits over the pad's empty corner, as designed */
@media(max-width:360px){{.touch .ring{{width:160px;height:160px}}.touch .fire{{width:104px;height:104px}}}}
.column{{min-width:0;display:flex;flex-direction:column;gap:14px}}
.logbox{{margin-top:52px}}   /* collapses with the screen's 40: the log's panel clears the badge with the air the old sentence had */
/* on a wide screen the stage (the frame, the badge, the log) stays while the column scrolls past it, whenever the
   window is tall enough for the stage to fit: the log gives up height first, and on a short window the machine gives
   up size, 1.5 times the C64's picture instead of 2 (a whole number of device pixels on a high-density screen); under
   630 pixels the page scrolls whole. Measured: the stage is 14 + 544 + 52 + 47 + the log's height at full size, the
   COPY buttons being in the label row on a wide screen. The
   log's rules carry two names so they outrank its own rule below whatever the order */
@media(min-width:1140px) and (min-height:630px){{.stage{{position:sticky;top:14px}}}}
@media(min-width:1140px) and (min-height:810px) and (max-height:869px){{.logbox .log{{height:144px}}}}
@media(min-width:1140px) and (min-height:765px) and (max-height:809px){{.logbox .log{{height:104px}}}}
@media(min-width:1140px) and (min-height:630px) and (max-height:764px){{.machine{{grid-template-columns:576px 1fr}}.logbox .log{{height:144px}}}}
@media(min-width:1140px) and (min-height:630px) and (max-height:669px){{.logbox .log{{height:104px}}}}
/* on a wide screen the COPY buttons sit in the log's label row, out of the flow, so every tier's log is 44 pixels
   taller for the same stage; the label's note gives them the room, and they are shorter there so they clear the log's
   top rule (measured: the row's rule sits 37 pixels under the panel's edge) */
@media(min-width:1140px){{.logbox{{position:relative}}.bay.logbox>summary{{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"lab sum";cursor:default}}.bay.logbox>summary .bs{{font-size:.7rem;line-height:1.2;padding-right:290px}}.bay.logbox>summary .bm{{display:none}}.logbox>.bb>.bi{{overflow:visible}}.logbox .tools{{position:absolute;top:10px;right:16px;flex-direction:row-reverse}}.logbox .tools .b{{padding:5px 10px}}.logbox .tools #copy{{order:1}}.logbox .tools #copy-log{{order:0}}.logbox .tools .copied{{order:2}}.logbox .log{{margin-bottom:0}}}}   /* read left to right: the name, the line, COPY PROVENANCE, COPY THE LOG */
.panel{{padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:var(--panel);min-width:0}}   /* a grid item's minimum is its content's: the firmware switch's longest option made THE KEYS, and so the column and the frame, 6px wider than the phone's page */
.panel .lab{{display:flex;justify-content:space-between;gap:12px;font:700 .66rem/1.2 {MONO};letter-spacing:.18em;color:var(--accent);margin:0 0 10px}}
.panel .lab>span:first-child{{flex:none}}
/* a bay: a panel that folds. Its header is the whole button: the name, and one live line, what is true now in the page's
   own words, the thing in ink and its qualifiers muted, the thing the only part that can be cut short (the trust words are
   never cut); the mark a drawn plus whose upright falls onto the bar as the drawer opens, and rises as it closes.
   Open, the controls and the record; the account under the page is the third depth. Closed on a phone, open on a wide
   screen, where the log is the stage's and does not fold. The body is one grid row from 0fr to 1fr, so the drawer
   opens as one object; the inner box clips it and carries the panel's bottom air, so the closed row is truly empty */
.panel.bay{{padding:0}}
.bay>summary{{list-style:none;cursor:pointer;padding:14px 16px 10px;display:grid;grid-template-columns:minmax(0,1fr) 32px;grid-template-areas:"lab mark" "sum mark";column-gap:12px;row-gap:4px;align-items:center;border-radius:10px;-webkit-tap-highlight-color:transparent}}   /* the mark's rail: a column of its own, 44 with the gap, the mark centred in it, so the longest line ends well before it */
.bay>summary::-webkit-details-marker{{display:none}}
.bay>summary::marker{{content:""}}
.bay>summary:focus-visible{{outline:2px solid var(--accent);outline-offset:-2px}}
.bay>summary .lab{{grid-area:lab;margin:0;min-width:0}}
.bay>summary .bs{{grid-area:sum;display:flex;min-width:0;font:500 .74rem/1.45 {MONO};color:var(--muted)}}
.bs>span{{white-space:pre}}
.bs .e{{overflow:hidden;min-width:0;flex:0 1 auto;color:var(--ink)}}
/* a line that does not fit fades out at its edge (the host marks it `cut`); while the readout (readout.js) moves it, both edges fade;
   the text moves as a transform on its own span, so the machine's work on the main thread never makes it stutter */
.bs .e.cut{{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 16px),transparent)}}
.bs .e.cut.reading{{-webkit-mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 16px),transparent)}}
.bs .e .t{{display:inline-block;white-space:pre}}
.bs .e.reading .t{{will-change:transform}}
.bs .f{{flex:none}}
.bs>span:empty{{display:none}}
.bm{{grid-area:mark;position:relative;width:12px;height:12px;align-self:center;justify-self:center}}
.bm::before,.bm::after{{content:"";position:absolute;background:var(--accent2);border-radius:1px}}
.bm::before{{left:0;top:5px;width:12px;height:2px}}
.bm::after{{left:5px;top:0;width:2px;height:12px;transform-origin:50% 50%;transition:transform 320ms cubic-bezier(.45,0,.55,1)}}   /* the upright falls a quarter turn onto the bar as the card opens, and rises as it closes: one soft motion, a little longer than the drawer (the owner's ask, 2026-09-23, after a site whose plus falls into a minus) */
.bay.is-open>summary .bm::after{{transform:rotate(90deg)}}
.bb{{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows 240ms cubic-bezier(.2,.8,.2,1),opacity 180ms ease}}
.is-open>.bb{{grid-template-rows:1fr;opacity:1}}
.bi{{min-height:0;overflow:hidden}}
.bay>.bb>.bi{{margin:0 16px}}
.bay>.bb>.bi::after{{content:"";display:block;height:14px}}
@media(prefers-reduced-motion:reduce){{.bb,.bm::before,.bm::after{{transition:none}}}}
.search{{width:100%;box-sizing:border-box;margin:0 0 10px;padding:9px 10px;font:500 .9rem/1.3 {MONO};color:var(--ink);background:#050505;border:1px solid #333;border-radius:6px}}
.search:focus{{outline:0;border-color:var(--accent)}}
.rows{{height:330px;box-sizing:border-box;overflow:auto;border-top:1px solid var(--line)}}
.door{{display:block;position:relative;padding:16px 12px;border:1px dashed #333;border-radius:6px;background:#050505;color:var(--muted);font:500 .84rem/1.4 {MONO};text-align:center;cursor:pointer;overflow-wrap:anywhere}}
.door:hover,.door.over,.door:focus-within{{border-color:var(--accent);color:var(--ink)}}
.door input{{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}}
.door[data-state="busy"]{{color:var(--ink)}}
.door[data-state="ok"]{{border-style:solid;border-color:#2c3f36;color:var(--accent)}}
.door[data-state="refused"]{{border-style:solid;border-color:#5a2a2a;color:#ff9d9d}}
.fine{{margin:10px 0 0;font-size:.74rem;line-height:1.45;color:var(--muted)}}
/* a disk's directory under the door: the disk's name and id, its entries as rows, LOAD on each program */
.disk{{margin:10px 0 0}}
.disk .dh{{display:flex;justify-content:space-between;gap:12px;font:700 .6rem/2.2 {MONO};letter-spacing:.16em;text-transform:uppercase;color:var(--accent2)}}
.disk .dh .n{{color:var(--muted);letter-spacing:.06em;font-weight:500;text-transform:none;text-align:right}}
.disk .rows{{height:auto;max-height:224px}}
/* a fold: a small mono summary with a plus, the rest muted; its body opens as a bay's does */
.fold{{font-size:.78rem;line-height:1.45;color:var(--muted)}}
.fold summary{{cursor:pointer;list-style:none;font:700 .6rem/1.9 {MONO};letter-spacing:.16em;color:var(--accent2)}}
.fold summary::-webkit-details-marker{{display:none}}
.fold summary::before{{content:"+ "}}
.fold.is-open summary::before{{content:"− "}}
.paste{{margin:10px 0 0}}
.paste textarea.json{{height:72px;margin:6px 0 0;color:var(--ink)}}
.paste .tools{{margin-top:8px}}
.rows .g{{position:sticky;top:0;background:var(--panel);font:700 .6rem/2.2 {MONO};letter-spacing:.16em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line)}}
.row{{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #161616}}
.row .t{{display:flex;flex-direction:column;min-width:0}}
.row .title{{font-size:.92rem;color:var(--ink)}}
.row .sub{{font-size:.74rem;color:var(--muted);line-height:1.35}}
.row.now .title{{color:var(--accent)}}
/* a mind's revisions, listed under its row: indented, the title smaller, the head and genesis said in the title */
.row.sub{{padding-left:18px;border-left:2px solid #1f2b25}}
.row.sub .title{{font-size:.84rem}}
button.more{{color:var(--muted);border-color:#2a2a2a;margin-right:6px}}
button.more:disabled{{opacity:.6;cursor:default}}
button.load,button.b,button.more{{flex:none;font:700 .66rem/1 {MONO};letter-spacing:.14em;color:var(--accent2);background:transparent;border:1px solid #2c3f36;border-radius:6px;padding:8px 12px;cursor:pointer}}
button.load:hover,button.b:hover,button.more:hover,button.load:focus-visible,button.b:focus-visible,button.more:focus-visible{{border-color:var(--accent);color:var(--accent);outline:0}}
.lab .state{{margin:0;font:700 .66rem/1.2 {MONO};letter-spacing:.16em;color:var(--ink);text-align:right;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.state[data-phase="running"]{{color:var(--accent)}}
.state[data-phase="refused"],.state[data-phase="failed"]{{color:#ff9d9d}}
.playing{{display:flex;flex-direction:column;gap:6px;margin:0;min-height:404px}}   /* the height of a Chamber room's rows, measured: the panel keeps its size from the first paint */
.nl{{display:grid;grid-template-columns:84px 1fr;gap:10px;font-size:.84rem;line-height:1.45}}
.nl .k{{font:700 .6rem/1.9 {MONO};letter-spacing:.16em;color:var(--muted)}}
.nl .v{{color:var(--ink);overflow-wrap:anywhere}}
.nl.bad .v{{color:#ff9d9d}}
.nl.muted .v{{color:var(--muted)}}
.nl .v a{{color:var(--accent2);border-bottom-color:#2c3f36}}
.nl .v a:hover{{color:var(--accent);border-bottom-color:var(--accent)}}
/* a group's heading, in NOW PLAYING and THE KEYS alike: the word and a rule to the edge */
.grp{{display:flex;align-items:center;gap:10px;margin:10px 0 2px;font:700 .58rem/1.6 {MONO};letter-spacing:.22em;color:var(--accent2);text-transform:uppercase}}
.grp::after{{content:"";flex:1;border-top:1px solid var(--line)}}
.playing .grp:first-child,.lab+.grp{{margin-top:0}}
.log{{list-style:none;margin:0 0 10px;padding:8px 0 0;border-top:1px solid var(--line);font:500 .72rem/1.5 {MONO};color:var(--muted);height:160px;box-sizing:border-box;overflow:auto}}
.log li{{margin:0;overflow-wrap:anywhere}}
.tools{{display:flex;flex-wrap:wrap;gap:8px;align-items:center}}
.tools .copied{{font:500 .72rem/1 {MONO};color:var(--muted)}}
textarea.json{{width:100%;box-sizing:border-box;margin:10px 0 0;height:120px;font:500 .7rem/1.4 {MONO};color:var(--muted);background:#050505;border:1px solid #222;border-radius:6px}}
.keys{{margin:0;font-size:.85rem;color:var(--ink);line-height:1.5}}
/* every control has the same anatomy: the label, then the control or the legend, then one muted line */
.keys dt{{font:700 .6rem/1.9 {MONO};letter-spacing:.16em;color:var(--muted);margin-top:8px}}
.keys dd{{margin:0}}
.keys .hint{{display:block;margin:3px 0 0;font-size:.78rem;line-height:1.45;color:var(--muted)}}
.keys .why{{display:block;font:600 .66rem/1.6 {MONO};letter-spacing:.06em;color:var(--accent2);margin:4px 0 0}}
.keys .how{{margin:4px 0 0}}
.keys .how p{{margin:2px 0 4px;font-size:inherit;line-height:inherit;color:inherit}}   /* the site's paragraph rule would size it as prose */
.keys .touch-only{{display:none}}   /* DIAGONALS governs the ring, and the note about a phone on silent is for a phone: shown where the ring shows; the sound's hint has a form for each */
@media(pointer:coarse){{.keys dt.touch-only,.keys dd.touch-only{{display:block}}.keys span.touch-only{{display:inline}}.keys .fine-only{{display:none}}}}
select.mode{{max-width:100%;box-sizing:border-box;font:500 .84rem/1.3 {MONO};color:var(--ink);background:#050505;border:1px solid #333;border-radius:6px;padding:6px 8px}}
.about{{margin:44px 0 0;max-width:70ch}}
.about h2{{margin-top:44px}}
.about p{{font-size:.95rem;color:#deded9}}
.about code{{font-size:.8rem}}
/* one column: the two wrappers dissolve and the panels take the phone's order, NOW PLAYING first under the pad (what is
   running, and how far to trust it, read without opening anything: the owner's word, 2026-09-23), then the list, the
   file door, the keys and the log (LEAVE THE MACHINE went on 2026-09-23, the owner's word: the kicker at the top and the
   footer are the way back); the frame fills the column as the phone's does, the badge hung from its
   corner (the owner's word, 2026-09-22: the picture is scaled by the width there, whole multiples kept for two columns,
   where the frame is 768 again) */
@media(max-width:1139px){{.machine{{grid-template-columns:1fr;row-gap:14px}}.stage,.column{{display:contents}}.screen{{order:1}}.touch{{order:2;margin:11px 0}}.now{{order:3}}.chain{{order:4}}.file{{order:5}}.keys{{order:6}}.logbox{{order:7;margin:0}}}}
@media(max-width:700px){{main{{width:calc(100% - 32px)}}.rows{{height:260px}}.nl{{grid-template-columns:1fr;gap:0}}.playing{{min-height:510px}}}}
"""


# ---------------------------------------------------------------- the share card
CARD = "machine/card.png"
BOOT_SCREEN = HERE / "boot-screen.json"
CARD_SIZE = (2400, 1260)          # twice 1200 x 630, the shape share previews take
CARD_SCALE = 6                    # one screen pixel is six card pixels
CARD_GREEN = (0x39, 0xFF, 0x88)   # the site's accent, site.css --accent


def png_1bit(width, height, rows, palette):
    """A PNG with a two-colour palette, one bit per pixel, its deflate stream
    written as stored blocks by this function: no compressor is involved, so
    the bytes never depend on a zlib version and the site check reproduces
    the card byte for byte on any machine."""
    raw = b"".join(b"\x00" + bytes(r) for r in rows)      # filter type 0 before each row
    z = bytearray(b"\x78\x01")                             # zlib header: deflate, 32K window, no preset
    for i in range(0, len(raw), 65535):
        block = raw[i:i + 65535]
        final = 1 if i + 65535 >= len(raw) else 0
        z += bytes([final]) + struct.pack("<HH", len(block), len(block) ^ 0xFFFF) + block
    z += struct.pack(">I", zlib.adler32(raw) & 0xFFFFFFFF)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 1, 3, 0, 0, 0))
            + chunk(b"PLTE", bytes(palette)) + chunk(b"IDAT", bytes(z)) + chunk(b"IEND", b""))


def screen_codes(rows, cursor):
    """The screen codes of the boot screen's text: the inverse of the machine
    document's screenText (A to Z are 1 to 26, @ is 0, space and the
    punctuation of 0x20 to 0x3F are themselves). The cursor cell is a reverse
    space, the block the machine blinks there."""
    grid = [[0x20] * 40 for _ in range(25)]
    for r, line in enumerate(rows):
        if r >= 25 or len(line) > 40:
            die("boot-screen.json: a row is outside the 40 by 25 screen")
        for c, ch in enumerate(line):
            if ch == "@":
                code = 0
            elif "A" <= ch <= "Z":
                code = ord(ch) - 64
            elif 0x20 <= ord(ch) <= 0x3F:
                code = ord(ch)
            else:
                die(f"boot-screen.json: {ch!r} is not a character the card can draw")
            grid[r][c] = code
    if cursor:
        grid[cursor[0]][cursor[1]] = 0xA0
    return grid


def card(chargen):
    """The page's share image: the machine's boot screen, drawn glyph by glyph
    from the pressing's character ROM (the uppercase set, as the machine
    boots), in the site's green on black, the used rows of the screen centred
    on the card."""
    boot = json.loads(BOOT_SCREEN.read_text(encoding="utf-8"))
    if boot.get("charset") != "uppercase" or len(chargen) != 4096:
        die("boot-screen.json or the character ROM is not what the card expects")
    grid = screen_codes(boot["rows"], boot.get("cursor"))
    shown = int(boot["rowsShown"])
    width, height = CARD_SIZE
    sw, sh = 40 * 8 * CARD_SCALE, shown * 8 * CARD_SCALE
    if sw > width or sh > height:
        die("the boot screen does not fit the card")
    x0, y0 = (width - sw) // 2, (height - sh) // 2
    rows = [bytearray(width // 8) for _ in range(height)]
    for r in range(shown):
        for c in range(40):
            code = grid[r][c]
            glyph = chargen[(code & 0x7F) * 8:(code & 0x7F) * 8 + 8]
            rev = 1 if code & 0x80 else 0
            for gy in range(8):
                byte = glyph[gy]
                for gx in range(8):
                    if ((byte >> (7 - gx)) & 1) ^ rev:
                        px, py = x0 + (c * 8 + gx) * CARD_SCALE, y0 + (r * 8 + gy) * CARD_SCALE
                        for yy in range(py, py + CARD_SCALE):
                            row = rows[yy]
                            for xx in range(px, px + CARD_SCALE):
                                row[xx >> 3] |= 0x80 >> (xx & 7)
    return png_1bit(width, height, rows, [0, 0, 0, *CARD_GREEN])


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
<div class="lede">
  <p>The Machine is the Commodore 64 emulator nopsta stored on Ethereum in 2022. Rather than serving the machine and its programs from a server of its own, this page reads them from Ethereum, checks their cryptographic fingerprints against the ones it carries, and runs them in your browser.</p>
</div>
<div class="machine">
  <div class="stage">
    <div class="screen">
      <div class="frame" id="frame" aria-label="the machine">
        <div class="veil" id="veil"><span id="veil-text">THE MACHINE IS OFF</span></div>
      </div>
      <div class="link" id="link" data-phase="off" aria-live="polite" aria-label="the link to the chain" title="no node yet">
        <span class="lk" id="link-chain">ETHEREUM</span><span class="ls" id="link-state">OFF</span>
        <span class="ln" id="link-node">no node yet</span><span class="lb" id="link-block"></span>
        <span class="le" id="link-endpoints" aria-label="the endpoints, in the order they are tried"></span>
      </div>
    </div>
    <div class="touch" id="touch" aria-label="joystick" data-ways="4">
      {ring_svg()}
      <button type="button" class="fire" data-bit="16">FIRE</button>
    </div>
    <details class="panel bay logbox is-open" id="bay-log" open aria-labelledby="lab-log">
      <summary class="bh" aria-expanded="true" aria-controls="bay-log-body"><span class="lab"><span id="lab-log">THE LOG</span></span><span class="bs" id="sum-log"><span class="f"></span><span class="e"><span class="t"></span></span><span class="f"></span></span><span class="bm" aria-hidden="true"></span></summary>
      <div class="bb" id="bay-log-body"><div class="bi">
      <ul class="log" id="log" aria-label="what the page read and checked; the last lines, the whole log copies"></ul>
      <div class="tools">
        <button type="button" class="b" id="copy">COPY PROVENANCE</button>
        <button type="button" class="b" id="copy-log">COPY THE LOG</button>
        <span class="copied" id="copied"></span>
      </div>
      <textarea class="json" id="provenance-json" readonly aria-label="the provenance as JSON" hidden></textarea>
      </div></div>
    </details>
  </div>
  <aside class="column">
    <details class="panel bay chain is-open" id="bay-chain" open aria-labelledby="lab-chain">
      <summary class="bh" aria-expanded="true" aria-controls="bay-chain-body"><span class="lab"><span id="lab-chain">FROM THE CHAIN</span></span><span class="bs" id="sum-chain"><span class="f"></span><span class="e"><span class="t"></span></span><span class="f"></span></span><span class="bm" aria-hidden="true"></span></summary>
      <div class="bb" id="bay-chain-body"><div class="bi">
      <input class="search" id="search" type="search" placeholder="a number, a character, a colour, a room word, a work" aria-label="search the programs on the chain" autocomplete="off">
      <div class="rows" id="rows" aria-live="polite"></div>
      </div></div>
    </details>
    <details class="panel bay file is-open" id="bay-file" open aria-labelledby="lab-file">
      <summary class="bh" aria-expanded="true" aria-controls="bay-file-body"><span class="lab"><span id="lab-file">FROM A FILE</span></span><span class="bs" id="sum-file"><span class="f"></span><span class="e"><span class="t"></span></span><span class="f"></span></span><span class="bm" aria-hidden="true"></span></summary>
      <div class="bb" id="bay-file-body"><div class="bi">
      <label class="door" id="door" data-state="idle"><input type="file" id="file" accept=".prg,.d64,.crt" aria-label="choose a program file, a disk image or a cartridge image"><span id="door-text">drop a .prg, a .d64 or a .crt here, or choose one</span></label>
      <div class="disk" id="disk" hidden aria-label="the disk's directory">
        <div class="dh"><span id="disk-name"></span><span class="n" id="disk-count"></span></div>
        <div class="rows" id="disk-rows"></div>
      </div>
      <details class="fold paste" id="paste-door"><summary aria-expanded="false" aria-controls="paste-door-body">OR PASTE</summary><div class="bb" id="paste-door-body"><div class="bi">
        <textarea class="json" id="paste" spellcheck="false" autocomplete="off" aria-label="a program as hex or base64" placeholder="a program as hex or base64, its load address first"></textarea>
        <div class="tools"><button type="button" class="b" id="run-paste">RUN</button><span class="copied" id="paste-note"></span></div>
      </div></div></details>
      <p class="fine">It stays in this browser and is sent nowhere; the page checks its shape, reads it for what it needs, and NOW PLAYING says YOUR FILE, claiming nothing else: <a href="#about-programs">the formats and their limits</a>.</p>
      </div></div>
    </details>
    <details class="panel bay now is-open" id="bay-now" open aria-labelledby="lab-now">
      <summary class="bh" aria-expanded="true" aria-controls="bay-now-body"><span class="lab"><span id="lab-now">NOW PLAYING</span><span class="state" id="state" aria-live="polite">THE MACHINE IS OFF</span></span><span class="bs" id="sum-now"><span class="f"></span><span class="e"><span class="t"></span></span><span class="f"></span></span><span class="bm" aria-hidden="true"></span></summary>
      <div class="bb" id="bay-now-body"><div class="bi">
      <button type="button" class="b" id="retry" hidden>RETRY</button>
      <div class="playing" id="now"></div>
      </div></div>
    </details>
    <details class="panel bay keys is-open" id="bay-keys" open aria-labelledby="lab-keys">
      <summary class="bh" aria-expanded="true" aria-controls="bay-keys-body"><span class="lab"><span id="lab-keys">THE KEYS</span></span><span class="bs" id="sum-keys"><span class="f"></span><span class="e"><span class="t"></span></span><span class="f"></span></span><span class="bm" aria-hidden="true"></span></summary>
      <div class="bb" id="bay-keys-body"><div class="bi">
      <p class="grp">PLAY</p>
      <dl class="keys">
        <dt>INPUT</dt><dd><select class="mode" id="input-mode" aria-label="what the arrow keys feed" autocomplete="off"><option value="joystick" selected>joystick in port 2</option><option value="joystick1">joystick in port 1</option><option value="joysticks">joystick in both ports</option><option value="keyboard">the keyboard</option></select> <span class="hint">what the arrows feed; AUTO chooses from the file</span></dd>
        <dt>JOYSTICK</dt><dd>arrows move · Z, X or space FIRE <span class="hint">other keys type; the series' programs read port 2</span></dd>
        <dt class="touch-only">DIAGONALS</dt><dd class="touch-only"><select class="mode" id="ways" aria-label="how the ring reads a diagonal" autocomplete="off"><option value="4" selected>one direction</option><option value="8">both directions, eight ways</option></select> <span class="hint">one direction suits the series; both for eight ways</span></dd>
        <dt>KEYBOARD</dt><dd>click the machine to give it your keys <span class="hint">Escape is RUN/STOP · Home is CLR/HOME · F1 to F7</span></dd>
        <dt>SOUND</dt><dd><button type="button" class="b" id="sound">SOUND ON</button> <span class="hint"><span class="fine-only">starts on your first click or key</span><span class="touch-only">starts on your first tap; silent if the phone is</span></span></dd>
      </dl>
      <p class="grp">MACHINE</p>
      <dl class="keys">
        <dt>FIRMWARE</dt><dd><select class="mode" id="firmware" aria-label="the firmware" autocomplete="off"><option value="auto" selected>auto: as the program needs</option><option value="off">off: bare, as on chain</option><option value="on">on: OpenROMs pressing 1, READY first</option></select> <span class="why" id="firmware-why">AUTO · decides when a program loads</span>
          <details class="fold how" id="how-auto"><summary aria-expanded="false" aria-controls="how-auto-body">HOW AUTO DECIDES</summary><div class="bb" id="how-auto-body"><div class="bi"><p>A program of the chain runs bare, as it does on chain. A file of yours is read for what it needs: one that calls the KERNAL or BASIC, hooks its vectors, is BASIC itself or has no stub a bare machine can start gets the on-chain OpenROMs and READY first; one that needs none of that runs bare. The scan reads byte patterns and can miss a dependency, so the switch stays yours: <a href="#about-controls">the whole account</a>.</p></div></div></details></dd>
        <dt>RESET</dt><dd><button type="button" class="b" id="reset">RESET THE MACHINE</button> <span class="hint">the machine starts over; READY under the firmware</span></dd>
      </dl>
      </div></div>
    </details>
  </aside>
</div>
<section class="about">
  <h2>What this page does, and does not</h2>
  <h3 id="about-machine">The machine</h3>
  <p>The machine is the emulator nopsta stored on Ethereum in 2022, in four data contracts: <a href="https://etherscan.io/address/0x1Cc49e603B4b205Be0E74f8833971Bea5beccEC9" target="_blank" rel="noopener">the gunzip helper</a> and <a href="https://etherscan.io/address/0xEF13021d5302c3fCe437A3C281A286479ba60008" target="_blank" rel="noopener">three parts of minimal64</a>. The page reads them from the chain first; if no node answers, it uses the site's own copies of the same bytes; either way each part must hash to the pin the page carries, or it does not run, and NOW PLAYING says which source it was.</p>
  <p>The machine runs in a frame that cannot reach this page, the network or your storage; the page speaks to it over one port, by <a href="PROTOCOL.md">a written protocol</a>. Nothing on this page reaches into the machine: the mode is PURE, and the provenance would say INTERVENED if anything ever did. The machine document is GPL-2.0-only, nopsta's licence; the page around it is MIT; <a href="LICENSES.md">what is what</a>.</p>
  <h3 id="about-programs">The programs</h3>
  <p>The page starts on Tony: Born for Adventure, the proof-of-concept token from before the series and the demo its programs are built on, read from its contract and checked the same way; any other program is one LOAD away in the list.</p>
  <p>A program is read from its contract the way anyone can read it: <a href="https://etherscan.io/address/{chamber}#readContract" target="_blank" rel="noopener">the Chamber's</a> <code>prg(id)</code>, stamped with the block you load it at, is held to the pinned base outside its 42-byte stamp and to the row and the block inside it; <a href="https://etherscan.io/address/{perception}#readContract" target="_blank" rel="noopener">the Perception Chamber Canary's</a> <code>prgWithBrain(1)</code> is held to the frozen program outside its mind and to the head revision's record inside it, and any earlier revision of that mind, REVISIONS on its row, is read from the blob its record names and held to the record's hash, genesis to its pin as well; the two older tokens are held to their pinned hashes. The pins are in <a href="catalogue.json">the catalogue</a>, which <a href="verify.py">a public script</a> checks against the chain for anyone who runs it (<a href="CATALOGUE.md">how</a>).</p>
  <p>A program of your own runs here too, through FROM A FILE: a .prg, a program picked from the directory of a .d64, or hex or base64 pasted in. It stays in this browser, the page checks only its shape and reads it for what it needs, and NOW PLAYING says YOUR FILE. The machine has no drive, nopsta's build having nothing behind its serial bus, so a program of a disk runs alone, and one that loads more from the disk stops there. A .crt cartridge runs in the four formats the machine has, Normal, Ocean Type 1, C64GS and Magic Desk; an 8K Normal image trips a fault in the machine's reader and is refused, repackable as 16K or Magic Desk. The machine can attach a cartridge but not remove it, so a cartridge stays in the port for the life of a machine, and anything loaded after it starts a new one.</p>
  <h3 id="about-words">What the words mean</h3>
  <p>The words on the provenance line mean what they say: <b>PINNED</b>, the bytes matched a commitment this page held before it asked; <b>CONTRACT-CONSISTENT</b>, they matched what the same node reported in the same session; <b>NODE-REPORTED</b>, a fact one node stated; <b>YOUR FILE</b>, a file of yours, about which the page claims nothing. One node is asked, and it is named. The links in NOW PLAYING open the same contracts, tokens and blocks on Etherscan, in a new tab, so every claim can be checked against a second source while the machine runs on.</p>
  <h3 id="about-controls">Controls and boundaries</h3>
  <p>The firmware is a switch. The programs of the series run bare, as they do on chain, and run the same with the firmware present, because they bank it out as they start. AUTO reads a file of yours for what it needs: a program that calls the KERNAL or BASIC, hooks the KERNAL's interrupt vectors, is BASIC itself or has no stub a bare machine can start it by gets the on-chain OpenROMs and READY first; one that needs none of that runs bare, and a program that banks the ROMs out and sets its own interrupt vectors is read as bare whatever its data looks like. The scan reads byte patterns, and a program can hide a dependency from it, so the switch stays yours: on boots to READY and RESET brings the prompt back; off is bare.</p>
  <p>INPUT says what the arrows and letters feed: a joystick in port 2, the port the programs of the series read; in port 1; in both ports at once; or the keyboard. AUTO reads a file of yours for what it reads and takes both ports when it cannot tell. Under joystick input the arrows and Z, X and space are the stick and every other key still types, so a game that wants a key on one screen and the stick on the next has both. On a phone the ring is read by angle and its hole is rest; the programs of the series stand still with two directions held, so a diagonal counts as one direction unless DIAGONALS says both. Escape is RUN/STOP and never leaves this page, Home is CLR/HOME, and F1 to F7 are the function keys. The sound starts with your first tap or key on the page, and a phone on silent stays silent. RESET starts the machine over; under the firmware, READY comes back.</p>
  <p>A public node sees the address you read from and the contracts you ask for, nothing else; to use a node of your own, open <a href="standalone.html">the standalone machine</a> with <code>?rpc=</code> and your endpoint.</p>
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
    chargen = (MANIFEST.parent / m["firmware"]["chargen"]).read_bytes()   # proven against the manifest by check_parts
    png = card(chargen)
    out = out_root() / CARD
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(png)
    print(f"machine/build.py: {CARD} ({len(png)} bytes, the boot screen from the pressing's character ROM)")
    head = '<link rel="alternate" type="application/json" href="catalogue.json" title="the catalogue">'
    doc = render(KEY, page_body(), title=TITLE, description=DESC, css=PAGE_CSS, csp=policy(), head=head,
                 script='<script type="module" src="host.js"></script>',
                 image="/" + CARD, image_alt="READY 64 at its boot screen: the pressing's banner and READY, in the site's green")
    write(KEY, doc)


if __name__ == "__main__":
    build()
