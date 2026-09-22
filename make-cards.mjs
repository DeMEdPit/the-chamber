// SPDX-License-Identifier: MIT
// The share cards of the text pages, composed from each page's own words.
//
// A share card that is a screenshot of a page goes stale whenever the page's
// top moves. These cards are composed instead from three things the page
// already states: its breadcrumb, its heading and its description, in the
// site's colours, so a card changes only when the words do. cards.json
// records the words each card was made from and the card's hash; check-site
// compares that record to the built pages on every push, so a stale card
// fails the check instead of being noticed in a preview.
//
// The machine page (its boot screen, drawn by machine/build.py) and the
// architecture page (its seams diagram) keep cards of their own subject.
//
//   node make-cards.mjs          # after build-all.py; then build-all.py again, since the addresses carry the cards' stamps
// Needs Playwright and Chromium (machine/test/pw.mjs finds them).
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from './machine/test/pw.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const COMPOSED = ['', 'black-paper-00', 'black-paper-01', 'surface'];   // the pages whose card is their words
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
const text = (html) => unescape(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function wordsOf(html) {
  const kicker = (html.match(/<p class="kicker">([\s\S]*?)<\/p>/) || [])[1];
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const description = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1];
  if (!kicker || !h1 || description === undefined) throw new Error('a page without a breadcrumb, a heading or a description');
  return { kicker: text(kicker), title: text(h1), description: unescape(description) };
}

function card({ kicker, title, description }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#000;width:1200px;height:630px;position:relative;overflow:hidden;color:#f4f4ef;
  font-family:Inter,"DejaVu Sans",ui-sans-serif,system-ui,sans-serif}
.k{font:700 21px/1.2 "DejaVu Sans Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;color:#39ff88;text-transform:uppercase}
.t{font-weight:700;font-size:${title.length > 16 ? 84 : 100}px;line-height:1.04;letter-spacing:-.03em;margin:26px 0 28px}
.d{font-size:33px;line-height:1.38;color:#aaa9a3;max-width:930px}
.w{position:absolute;left:110px;right:110px;top:0;bottom:96px;display:flex;flex-direction:column;justify-content:center}
.r{position:absolute;left:110px;right:110px;bottom:78px;border-top:1px solid #262626}
.s{position:absolute;right:110px;bottom:38px;font:600 17px/1 "DejaVu Sans Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;color:#aaa9a3}
</style></head><body>
<div class="w"><div class="k">${esc(kicker)}</div><div class="t">${esc(title)}</div><div class="d">${esc(description)}</div></div>
<div class="r"></div><div class="s">CHAMBER64.COM</div>
</body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const b = await browser();
  const record = { what: 'The share cards composed from each page\'s words by make-cards.mjs; check-site holds the built pages and the card files to this record.', cards: {} };
  try {
    for (const dir of COMPOSED) {
      const page = join(ROOT, dir, 'index.html');
      const words = wordsOf(await readFile(page, 'utf8'));
      const pg = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
      await pg.setContent(card(words), { waitUntil: 'load' });
      const out = join(ROOT, dir, 'card.png');
      await pg.screenshot({ path: out });
      await pg.close();
      const bytes = await readFile(out);
      record.cards[dir ? dir + '/index.html' : 'index.html'] = { file: dir ? dir + '/card.png' : 'card.png', ...words, sha256: createHash('sha256').update(bytes).digest('hex') };
      console.log(`${dir || '.'}/card.png: ${words.kicker} | ${words.title} (${bytes.length} bytes)`);
    }
    await writeFile(join(ROOT, 'cards.json'), JSON.stringify(record, null, 2) + '\n');
  } finally { await b.close(); }
}
