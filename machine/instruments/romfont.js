// SPDX-License-Identifier: MIT
// The titles in the machine's own letters: the C64 character ROM's 8 by 8
// glyphs drawn pixel by pixel (the workbench's 37-romfont `rec_drawText`),
// from the pressing's character ROM as the page holds it to its pin
// (bridge-client.js): the same font every program on this machine draws its
// text with. Without the ROM a plain bold monospace stands in, and the page
// says so.
/** A character's screen code in the uppercase set: A to Z are 1 to 26, "·" the PETSCII ball, digits and punctuation themselves. */
export function screenCode(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return c - 64;
  if (c >= 97 && c <= 122) return c - 96;
  if (c === 183) return 81;
  if (c >= 32 && c <= 63) return c;
  return 46;
}
/** Draw `text` at (x, y) with `g` device pixels per ROM pixel; `font` the 4,096 ROM bytes, or null for the stand-in. */
export function drawText(ctx, font, text, x, y, g, colour) {
  ctx.fillStyle = colour;
  if (!font) { ctx.font = `bold ${8 * g}px ui-monospace, Menlo, monospace`; ctx.textBaseline = 'top'; ctx.fillText(text, x, y); return; }
  for (let i = 0; i < text.length; i++) {
    const sc = screenCode(text[i]);
    for (let r = 0; r < 8; r++) {
      const bits = font[sc * 8 + r];
      for (let b = 0; b < 8; b++) if (bits & (128 >> b)) ctx.fillRect(x + i * 8 * g + b * g, y + r * g, g, g);
    }
  }
}
export function textWidth(text, g) { return text.length * 8 * g; }
