"""The site's registry: its identity, its contracts and its pages, in one place.

Every builder, the footer, the breadcrumb, the canonical addresses and the
alias pages derive from this file. Adding a page is one entry here and one
folder with a builder. Nothing else on the site names a page's address.

This file is named registry, not site: Python's own `site` module is
imported at start-up and would shadow a local one.
"""
from dataclasses import dataclass

SITE = "https://chamber64.com"
SITE_NAME = "The Chamber"
REPO = "https://github.com/DeMEdPit/the-chamber"
ETHERSCAN = "https://etherscan.io/address"
CARD = "/card.png"

# The one shared list of public Ethereum endpoints, in the order a page tries
# them. Every reader on the site (the paper's live token, the machine page,
# the catalogue) takes it from here.
RPCS = ("https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com",
        "https://eth.drpc.org", "https://rpc.ankr.com/eth",
        "https://eth.merkle.io", "https://1rpc.io/eth")

# The two deployed, source-verified contracts.
CONTRACTS = {
    "chamber": "0x75FD5A9c4440c38561A0099B216F825b7C6db924",
    "perception": "0x6f54E1aAE0E9A679A52e5E733645cB11e0cE6127",
}


@dataclass(frozen=True)
class Page:
    key: str          # the permanent identity; survives a rename or a move
    path: str         # the canonical address, root-relative, with its trailing slash
    label: str        # the footer's words
    kind: str         # home | paper | reference
    kicker: str       # the breadcrumb's second word; "" on the home page
    dir: str          # the folder that builds it, "" for the root
    aliases: tuple = ()   # old addresses kept alive as redirects, for ever


PAGES = (
    Page("home", "/", "THE CHAMBER", "home", "", ""),
    Page("bp00", "/black-paper-00/", "BLACK PAPER 00 · THE CHAMBER", "paper", "BLACK PAPER 00", "black-paper-00"),
    Page("bp01", "/black-paper-01/", "BLACK PAPER 01 · PERCEPTION CHAMBER", "paper", "BLACK PAPER 01", "black-paper-01",
         aliases=("/black-paper/",)),
    Page("arch", "/architecture/", "ARCHITECTURE", "reference", "ARCHITECTURE", "architecture"),
    Page("surface", "/surface/", "WHAT IS ON CHAIN", "reference", "WHAT IS ON CHAIN", "surface"),
)
BY_KEY = {p.key: p for p in PAGES}


@dataclass(frozen=True)
class Builder:
    """A builder that writes documents which are not pages of the shell."""
    key: str
    script: str           # the builder, root-relative
    generates: tuple      # the files it writes, root-relative; check-site reproduces each


# build-all runs these after the pages; check-site rebuilds and compares every
# generated file, so a hand edit to a built document fails the check.
BUILDERS = (
    Builder("machine", "machine/build.py", ("machine/core.html", "machine/standalone.html")),
)


def page(key):
    return BY_KEY[key]


def url(key):
    return SITE + page(key).path
