// SPDX-License-Identifier: MIT
// Colour arithmetic for the instruments: a #rrggbb string parsed, its relative
// luminance (sRGB, as the contrast rules define it), a paler tint of it, one
// colour mixed towards another, OKLab both ways, the ladder of tones a meter
// climbs, and the token's own shade of a ground for a panel's body. The
// instruments' colours are not held to the C64's palette (the owner,
// 2026-09-24): the picture's ink and ground are what the token's rule gives,
// and the tones between them and around them are made here, so a meter
// climbs through the ink's own shades and a trace pales at its peaks,
// whatever the scene. The ladder is built the way colour scales are built
// professionally (his ask the same day): in OKLab, the perceptually uniform
// space CSS Color 4 standardised, so every rung is the same step to the eye.
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
// ---- OKLab (Björn Ottosson, 2020; CSS Color 4's `oklab()`), the perceptually uniform space: equal distances are equal
// to the eye, so a scale stepped evenly in its lightness reads as even. Two fixed matrices and a cube root each way.
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const gam = (v) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
/** A colour as OKLab `{L, a, b}`: L from 0 (black) to 1 (white), a and b the chroma axes; null for anything but #rrggbb. */
export function toOklab(h) {
  const c = parse(h); if (!c) return null;
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s };
}
function linearOf(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
/**
 * OKLab to #rrggbb. A colour the screen cannot show is mapped into sRGB the way CSS does it: the lightness and the hue
 * are kept and the chroma alone is given up, by halving until the colour fits.
 */
export function fromOklab({ L, a, b }) {
  L = Math.max(0, Math.min(1, L));
  const out = (k) => hex(linearOf(L, a * k, b * k).map((v) => gam(v) * 255));
  if (inGamut(linearOf(L, a, b))) return out(1);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(linearOf(L, a * mid, b * mid))) lo = mid; else hi = mid; }
  return out(lo);
}
/** The ladder's three anchors and its floor: how far the bottom rung goes towards the ground, how far the top goes towards white, and the least lightness the bottom rung keeps above an unlit segment. */
export const LADDER = Object.freeze({ dark: 0.75, pale: 0.6, floor: 0.06 });
/**
 * The ladder a bar meter climbs, `n` tones from the bottom rung up, in the ink over the ground (the owner's B of
 * 2026-09-24, built the professional way): three anchors, the ink darkened three quarters of the way to the ground, the
 * ink itself, and the ink paled 60 percent towards white; the rungs stepped evenly in OKLab lightness from the dark
 * anchor to the light one, so every step is the same size to the eye; the colour of each rung found on the path dark,
 * ink, light in OKLab, then mapped into the screen's gamut by giving up chroma alone. Below the ink this is close to a
 * dimmed LED, the same colour at less light; above it the bloom of an overdriven one. Where the ink has a hue every rung
 * has that hue exactly; a white ink over a coloured ground keeps the ground's tint in its dark rungs. With `off`, the colour of an unlit segment, the bottom rung is held at least
 * `LADDER.floor` of lightness above it, so a lit rung never reads as unlit; the ink itself is never lifted. A one-rung
 * ladder is the ink; the tones are the ink's own, never the palette's.
 */
export function ladder(ink, ground, n, off = null) {
  const count = Math.max(1, Math.floor(n) || 0), I = toOklab(ink);
  if (!I) return Array(count).fill(ink);
  if (count === 1) return [ink];
  const D = toOklab(mix(ink, ground, LADDER.dark)) || I, P = toOklab(pale(ink, LADDER.pale)) || I, O = off ? toOklab(off) : null;
  const C = Math.hypot(I.a, I.b);
  if (C > 0.02) {   // the ink has a hue: both anchors take it exactly, keeping their own chroma (a mix in sRGB drifts a few degrees); a neutral ink leaves the dark anchor the ground's tint
    for (const A of [D, P]) { const c = Math.hypot(A.a, A.b); A.a = I.a / C * c; A.b = I.b / C * c; }
  }
  let lo = D.L; if (O) lo = Math.max(lo, O.L + LADDER.floor); lo = Math.min(lo, I.L);
  const hi = Math.max(P.L, I.L);
  const at = (L) => {   // the colour on the path dark -> ink -> light at this lightness
    if (L <= I.L) { const t = I.L > D.L ? Math.max(0, Math.min(1, (L - D.L) / (I.L - D.L))) : 1; return { L, a: D.a + (I.a - D.a) * t, b: D.b + (I.b - D.b) * t }; }
    const t = P.L > I.L ? Math.max(0, Math.min(1, (L - I.L) / (P.L - I.L))) : 1; return { L, a: I.a + (P.a - I.a) * t, b: I.b + (P.b - I.b) * t };
  };
  const out = [];
  for (let i = 0; i < count; i++) out.push(fromOklab(at(lo + (hi - lo) * i / (count - 1))));
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
