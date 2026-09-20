"""The footer every page carries, so the site is navigable from anywhere.

One definition, shared. `current` names the page so it can mark itself rather
than link to itself.

SITE lives here too, and every build imports it. It was copied into four
files until 2026-09-20, which would have drifted the first time the domain
moved - and the first time the domain moved is when it was found.
"""

SITE = "https://chamber64.com"
REPO = "https://github.com/DeMEdPit/the-chamber"

PAGES = [
    ("home", "THE CHAMBER", f"{SITE}/"),
    ("bp00", "BLACK PAPER 00 · THE CHAMBER", f"{SITE}/black-paper-00/"),
    ("bp01", "BLACK PAPER 01 · PERCEPTION CHAMBER", f"{SITE}/black-paper/"),
]

CSS = """
.site-foot{margin:72px 0 0;padding-top:26px;border-top:1px solid var(--line)}
.site-foot ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.site-foot li{margin:0}
.site-foot a,.site-foot span{font:700 .72rem/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.11em;text-decoration:none;border:0}
.site-foot a{color:var(--accent2)}
.site-foot a:hover{color:var(--accent)}
.site-foot .here{color:var(--muted)}
.site-foot .here::before{content:"\\2014\\00a0"}
.site-foot .repo{margin-top:18px;color:var(--muted);font-size:.82rem;letter-spacing:0;font-weight:400}
.site-foot .repo a{font:inherit;letter-spacing:0;color:var(--accent2)}
"""


def footer(current):
    rows = []
    for key, label, href in PAGES:
        if key == current:
            rows.append(f'<li><span class="here">{label}</span></li>')
        else:
            rows.append(f'<li><a href="{href}">{label}</a></li>')
    return (
        '<footer class="site-foot"><ul>' + "".join(rows) + "</ul>"
        '<p class="repo">Everything here — the contracts, the pages and these '
        f'papers — is open on <a href="{REPO}" target="_blank" rel="noopener">'
        "GitHub</a>, MIT.</p></footer>"
    )
