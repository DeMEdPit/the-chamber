// SPDX-License-Identifier: MIT
// Colour arithmetic for the instruments: a #rrggbb string parsed, its relative
// luminance (sRGB, as the contrast rules define it) and a paler tint of it.
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
