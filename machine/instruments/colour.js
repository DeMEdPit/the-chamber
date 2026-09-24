// SPDX-License-Identifier: MIT
// Colour arithmetic for the instruments: a #rrggbb string parsed, its relative
// luminance (sRGB, as the contrast rules define it), a paler tint of it, one
// colour mixed towards another, the ladder of tones a meter climbs, and the
// token's own shade of a ground for a panel's body. The instruments' colours
// are not held to the C64's palette (the owner, 2026-09-24): the picture's
// ink and ground are what the token's rule gives, and the tones between them
// and around them are mixed here, so a meter climbs through the ink's own
// shades and a trace pales at its peaks, whatever the scene.
export function parse(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function hex(rgb) { return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
/** Relative luminance, 0 for black and 1 for white. */
export function luminance(h) {
  const c = parse(h); if (!c) return 0;
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
/** The same colour mixed towards white by `k` (0 the colour itself, 1 white). */
export function pale(h, k = 0.45) {
  const c = parse(h); if (!c) return h;
  return hex(c.map((v) => v + (255 - v) * k));
}
/** `a` mixed towards `b` by `t` (0 `a` itself, 1 `b`), channel by channel. */
export function mix(a, b, t) {
  const A = parse(a), B = parse(b); if (!A || !B) return a;
  return hex(A.map((v, k) => v + (B[k] - v) * t));
}
/**
 * The ladder a bar meter climbs, `n` tones from the bottom rung up, in the ink over the ground: the lowest rung the ink
 * darkened halfway to the ground, the ink itself three fifths of the way up, the top rung its paler tint, every rung
 * between mixed evenly along that path. A one-rung ladder is the ink. The site's green climbs from a deep green through
 * the green to its pale; a white ink on black from mid grey to white; the tones are the ink's own, never the palette's.
 */
export function ladder(ink, ground, n) {
  const count = Math.max(1, Math.floor(n) || 0), dark = mix(ink, ground, 0.5), light = pale(ink);
  if (count === 1) return [ink];
  const knee = Math.round((count - 1) * 0.6), out = [];
  for (let i = 0; i < count; i++) out.push(i <= knee ? mix(dark, ink, knee ? i / knee : 1) : mix(ink, light, (i - knee) / (count - 1 - knee)));
  return out;
}
/**
 * The token's shade of a ground for a panel's body (the workbench's 36-window-artcolours `rec_shade`): one step away
 * from the ground, darker (to 86 percent) when the ground is light and lighter (15 percent towards white) when it is
 * dark, so the panel reads as part of the picture and not as a competing shape. The lightness is the token's own
 * weighting, 0.3, 0.6 and 0.1, and the arithmetic is kept to the byte so the two pages agree.
 */
export function shade(h) {
  const c = parse(h); if (!c) return '#262626';
  let [r, g, b] = c;
  const lum = r * 0.3 + g * 0.6 + b * 0.1;
  if (lum > 127) { r = Math.round(r * 0.86); g = Math.round(g * 0.86); b = Math.round(b * 0.86); }
  else { r = Math.round(r + (255 - r) * 0.15); g = Math.round(g + (255 - g) * 0.15); b = Math.round(b + (255 - b) * 0.15); }
  return hex([r, g, b]);
}
