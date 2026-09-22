#!/usr/bin/env python3
"""Build every page of the site, in one fixed order, into one place.

    python3 build-all.py               # into the working tree, as published
    SITE_OUT=/tmp/site python3 build-all.py   # elsewhere, for a comparison

The order is the registry's; the alias pages come last. Each builder is run
as its own process so that it sees exactly what a person running it by hand
would see. Standard library only.
"""
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from registry import PAGES  # noqa: E402


def builders():
    """One builder per registered page, in the registry's order."""
    out = []
    for p in PAGES:
        b = ROOT / p.dir / "build.py" if p.dir else ROOT / "build.py"
        if not b.exists():
            raise SystemExit(f"build-all: the registry lists {p.key} at {p.path} but {b} does not exist")
        out.append((p.key, b))
    return out


def main():
    env = dict(os.environ)
    for key, b in builders():
        r = subprocess.run([sys.executable, str(b)], cwd=ROOT, env=env)
        if r.returncode != 0:
            raise SystemExit(f"build-all: {key} failed ({b})")
    r = subprocess.run([sys.executable, str(ROOT / "page.py")], cwd=ROOT, env=env)
    if r.returncode != 0:
        raise SystemExit("build-all: the alias pages failed")


if __name__ == "__main__":
    main()
