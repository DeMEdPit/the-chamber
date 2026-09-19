#!/usr/bin/env python3
"""The eight characters of The Chamber, as a gallery of on-chain thumbnails.

The eight SVGs in black-paper-00/characters/ are the bytes the contract
returns from `svg(behaviour)`. They were copied from the frozen record that
`ChamberImage`'s constructor checks against: each file's sha256 matches
tokens-record.json, and that record's keccak256 values are the constants in
ChamberImageRecord.sol which the constructor requires the deployed bytes to
equal. So these files ARE the on-chain artwork, not a rendering of it.

SENTENCES are `Chamber.characterSentence(beh)` verbatim - the contract's own
words, not a paraphrase. Do not edit them here; they are on chain.
COUNTS and IDS come from the sixty-four-row table constant.

The card links to a representative token on OpenSea. That URL shape
(/assets/ethereum/<contract>/<id>) is the durable one; trait-filter URLs are
not, so the gallery does not use them.
"""
import html as _html

CONTRACT = "0x75FD5A9c4440c38561A0099B216F825b7C6db924"

# name, file slug, colour (for alt text), supply, representative token id
#
# The Dancer's representative is 23 on purpose: the room in this page's header
# banner is token 23's room, so the header and the gallery point at one token.
CHARACTERS = [
    ("The Shadow", "the-shadow", "blue", 12, 4,
     "Tony's blue double keeps his distance, faces you, and jumps and crouches when you do."),
    ("The Wanderer", "the-wanderer", "green", 12, 2,
     "Tony's green double lives here and ignores you: he strolls, pauses, sits and jumps now and then, on dice seeded from the block."),
    ("The Sleeper", "the-sleeper", "purple", 12, 5,
     "Tony's purple double dozes crouched until you come close, follows a while, and dozes off again."),
    ("The Echo", "the-echo", "yellow", 8, 6,
     "Tony's yellow double replays you exactly, four seconds behind: every step, jump and duck."),
    ("The Mirror", "the-mirror", "light blue", 8, 10,
     "Tony's light blue double is your reflection about the room's centre line: he crouches while you jump and bounces while you crouch."),
    ("The Shy", "the-shy", "light red", 8, 1,
     "Tony's light red double runs when you come close, cowers at the pillar, bolts past you when you are almost on him, and creeps back when you leave."),
    ("The Dancer", "the-dancer", "cyan", 3, 23,
     "Tony's cyan double dances to the tune: he steps with the bass line and bounces on the hits, read from the sound chip."),
    ("The Glitch", "the-glitch", "cycling colour", 1, 64,
     "Tony's double will not hold still: he wears one of the seven characters at a time and teleports into the next, cycles their colours, and blinks and jitters in bursts."),
]

CSS = """
.ch-wrap{margin:34px 0 44px;padding:22px;border:1px solid var(--line);
  background:linear-gradient(180deg,#0d0d0d,#050505);border-radius:12px}
.ch-head{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;margin-bottom:16px}
.ch-label{font:700 .72rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.14em;color:var(--accent)}
.ch-note{color:var(--muted);font-size:.84rem}
.ch-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:900px){.ch-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.ch-grid{grid-template-columns:repeat(2,1fr)}}
.ch-card{display:flex;flex-direction:column;gap:5px;padding:13px;border:1px solid #232323;
  border-radius:10px;background:#060606;text-decoration:none;color:inherit;
  transition:border-color .15s,transform .15s}
.ch-card:hover,.ch-card:focus-visible{border-color:var(--accent);transform:translateY(-2px)}
.ch-card img{width:100%;height:auto;display:block;border-radius:6px;background:#000;margin-bottom:5px}
.ch-name{font-weight:700;font-size:.86rem;letter-spacing:.02em;color:var(--ink)}
.ch-card:hover .ch-name,.ch-card:focus-visible .ch-name{color:var(--accent2)}
.ch-count{font:700 .64rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.12em;color:var(--accent)}
.ch-say{color:var(--muted);font-size:.75rem;line-height:1.45}
.ch-foot{margin:18px 0 0;color:var(--muted);font-size:.84rem}
.ch-foot a{color:var(--ink)}
.ch-foot a:hover{color:var(--accent2)}
@media(max-width:700px){
  .ch-wrap{margin-inline:calc(50% - 50vw);padding:18px;border-left:0;border-right:0;border-radius:0}
  .ch-grid{gap:10px}
  .ch-card{padding:10px}
}
"""


def gallery(base="characters", label="THE EIGHT",
            note="one program, eight authored behaviours"):
    """The eight character cards. `base` is the image path prefix, so the
    same gallery can be dropped on a page at another depth."""
    cards = []
    for name, slug, colour, count, rep, say in CHARACTERS:
        alt = f"{name}: Tony's double in {colour}, doing the game's idle dance"
        cards.append(
            f'<a class="ch-card" href="https://opensea.io/assets/ethereum/{CONTRACT}/{rep}"'
            ' target="_blank" rel="noopener noreferrer">'
            f'<img src="{base}/{slug}.svg" alt="{_html.escape(alt)}"'
            ' width="48" height="48" loading="lazy" decoding="async">'
            f'<span class="ch-name">{_html.escape(name)}</span>'
            f'<span class="ch-count">{count} of 64</span>'
            f'<span class="ch-say">{_html.escape(say)}</span>'
            "</a>")
    return (
        '<section class="ch-wrap" aria-label="The eight characters">'
        f'<div class="ch-head"><span class="ch-label">{_html.escape(label)}</span>'
        f'<span class="ch-note">{_html.escape(note)}</span></div>'
        f'<div class="ch-grid">{"".join(cards)}</div>'
        '<p class="ch-foot">Every image here is the bytes the contract returns '
        f'from <code>svg(behaviour)</code> &mdash; not a screenshot of it. '
        f'Each card opens a token of that character. '
        f'<a href="https://opensea.io/assets/ethereum/{CONTRACT}" '
        'target="_blank" rel="noopener noreferrer">All sixty-four</a> &middot; '
        f'<a href="https://etherscan.io/address/{CONTRACT}#readContract" '
        'target="_blank" rel="noopener noreferrer">the contract</a>.</p>'
        "</section>")
