"""The markdown subset both pages are generated from.

Shared so the site and the paper can never render the same source two
different ways. Standard library only.
"""
import html as _html
import re


def inline(t):
    """Inline markdown: code, bold, italic, links, bare URLs.

    Links are lifted out FIRST. The code-span split below cuts the string on
    backticks, so a link whose text contains `code` would otherwise be torn
    into three pieces and never match its own pattern.
    """
    links = []

    def _stash(m):
        links.append((m.group(1), m.group(2)))
        return "\x00L%d\x00" % (len(links) - 1)

    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", _stash, t)
    out, parts = [], re.split(r"(`[^`]+`)", t)
    for part in parts:
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            out.append("<code>" + _html.escape(part[1:-1]) + "</code>")
            continue
        p = _html.escape(part)
        # <https://...> autolinks, written out by the time we see them escaped
        p = re.sub(r"&lt;(https?://[^\s&]+)&gt;",
                   r'<a href="\1" target="_blank" rel="noopener">\1</a>', p)
        # [text](target); an external target opens in a new tab, a relative one does not
        p = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
                   r'<a href="\2" target="_blank" rel="noopener">\1</a>', p)
        p = re.sub(r"\[([^\]]+)\]\((?!https?://)([^)\s]+)\)", r'<a href="\2">\1</a>', p)
        p = re.sub(r"(?<![\"=>])\b(https?://[^\s<)]+)",
                   r'<a href="\1" target="_blank" rel="noopener">\1</a>', p)
        p = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", p)
        p = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", p)
        out.append(p)
    html = "".join(out)
    for i, (text, href) in enumerate(links):
        ext = href.startswith("http")
        tag = ('<a href="%s"%s>%s</a>'
               % (_html.escape(href, quote=True),
                  ' target="_blank" rel="noopener"' if ext else "",
                  inline(text)))
        html = html.replace("\x00L%d\x00" % i, tag)
    return html


def convert(md, fence=None):
    """`fence(n, text)` may return HTML for the n-th code block; None keeps <pre>."""
    lines, out, i = md.split("\n"), [], 0
    fence_seen = 0
    while i < len(lines):
        ln = lines[i]

        if ln.startswith("```"):
            fence_seen += 1
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            custom = fence(fence_seen, "\n".join(buf)) if fence else None
            out.append(custom if custom is not None
                       else "<pre><code>" + _html.escape("\n".join(buf)) + "</code></pre>")
            continue

        if ln.startswith("#"):
            lvl = len(ln) - len(ln.lstrip("#"))
            out.append(f"<h{lvl}>{inline(ln[lvl:].strip())}</h{lvl}>")
            i += 1
            continue

        if ln.strip() == "---":
            out.append("<hr>"); i += 1; continue

        if ln.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip(">").strip()); i += 1
            out.append("<blockquote>" + inline(" ".join(buf).strip()) + "</blockquote>")
            continue

        m = re.match(r"^(\d+)\.\s+(.*)", ln)
        if ln.startswith("- ") or m:
            ordered = bool(m)
            tag = "ol" if ordered else "ul"
            items = []
            nums = []
            while i < len(lines):
                cur = lines[i]
                mm = re.match(r"^(\d+)\.\s+(.*)", cur)
                if cur.startswith("- "):
                    items.append([cur[2:].rstrip()]); nums.append(None); i += 1
                elif mm and ordered:
                    # keep the source's own number. Blank-line-separated items
                    # each become their own <ol>, and an <ol> restarts at 1, so
                    # without this a seven-entry reference list renders 1,1,1...
                    items.append([mm.group(2).rstrip()]); nums.append(mm.group(1)); i += 1
                elif cur.startswith("   ") and cur.strip() and items:
                    # a continuation line: its own line within the item. Kept as a
                    # separate part and joined AFTER inlining, because a <br> put in
                    # before would be escaped into visible text
                    items[-1].append(cur.strip()); i += 1
                else:
                    break
            body = "".join(
                ("<li value=\"%s\">" % n if n else "<li>")
                + "<br>".join(inline(part) for part in x) + "</li>"
                for x, n in zip(items, nums))
            out.append(f"<{tag}>{body}</{tag}>")
            continue

        if not ln.strip():
            i += 1; continue

        buf = []
        # CommonMark's rule, and the reason it exists: a numbered list may only
        # interrupt a paragraph when it starts at 1. Without it a sentence whose
        # line happens to begin "2022. Could that machine..." is read as a list
        # item, the paragraph breaks, and the year renders as a phantom "1."
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(
                ("#", ">", "- ", "```", "---")) and not re.match(r"^1\.\s", lines[i]):
            buf.append(lines[i].strip()); i += 1
        out.append("<p>" + inline(" ".join(buf)) + "</p>")
    return "\n".join(out)


