#!/usr/bin/env python3
"""The stat block at the top of each black paper.

Six slots, identical across papers, so the two can be read against each
other at a glance. Row four is the one that carries the series' argument:
42 bytes of facts about the chain against 834 bytes the chain computed.

EVERY NUMBER HERE MUST BE CHECKABLE BY A READER. Sources are given per
value below; both collections are source-verified on Etherscan, so anyone
can confirm these in a browser. A figure nobody can check is decoration and
does not belong in this block.

No JavaScript. The block is static markup - the page it sits on carries no
script at all, and a count-up animation would have been the only thing on
the site written in the visual language of a product page.
"""
import html as _html

# ---------------------------------------------------------------- the numbers
#
# The Chamber, 0x75FD5A9c...db924
#   tokens, contracts  chamber/deployments/mainnet/RECORD.md ("the sixteen
#                      contracts, as read back from the transactions")
#   program            46,877 bytes, the frozen base
#   written in         42 bytes at marker + 8 (ChamberBase.BLOCK_BYTES)
#   one render         409 KB at ~61M gas (chamber-v2/study/K-reuse-audit.md;
#                      docs/chamber-architecture.md "about 61M gas")
#   on chain           8 September 2026, locked the same night
#
# Perception Chamber Canary, 0x6f54E1aA...E6127
#   contracts          17 transactions (chamber-v2/rehearsal/mainnet/MAINNET.md)
#   program            52,104 bytes, tony-b025-a-vis4.prg
#   written in         834 bytes, the BRAIN025 slot, at program.brainOffset()
#   one render         tokenURI(1) = 579,393 bytes, VERIFIED on mainnet by the
#                      read-only verifier. Gas is given to two figures on
#                      purpose: the exact measurement predates the W4 tail fix
#                      and has not been re-measured from a node since.
#   on chain           17 September 2026

CHAMBER = [
    ("Tokens", "64"),
    ("Contracts", "16"),
    ("The program", "46,877 B"),
    ("Written in", "42 B"),
    ("One render", "409 KB · ~61M gas"),
    ("On chain", "8 Sep 2026"),
]

PERCEPTION = [
    ("Tokens", "1"),
    ("Contracts", "17"),
    ("The program", "52,104 B"),
    ("Written in", "834 B"),
    ("One render", "566 KB · ~31M gas"),
    ("On chain", "17 Sep 2026"),
]

CSS = """
.stats{margin:0 0 40px;padding:18px 20px;border:1px solid var(--line);
  border-radius:10px;background:linear-gradient(180deg,#0c0c0c,#060606);
  display:grid;grid-template-columns:repeat(3,1fr);gap:18px 24px}
.stat{display:flex;flex-direction:column;gap:3px;min-width:0}
.stat dt{font:700 .62rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
.stat dd{margin:0;font:600 .95rem/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--ink);overflow-wrap:anywhere}
@media(max-width:700px){
  .stats{grid-template-columns:repeat(2,1fr);gap:16px 18px;padding:16px}
  .stat dd{font-size:.86rem}
}
"""


def stats(rows):
    """The block, as a definition list - labels and values, not a table."""
    cells = "".join(
        '<div class="stat"><dt>%s</dt><dd>%s</dd></div>'
        % (_html.escape(k), _html.escape(v).replace("&#x27;", "'"))
        for k, v in rows)
    return '<dl class="stats" aria-label="At a glance">%s</dl>' % cells
