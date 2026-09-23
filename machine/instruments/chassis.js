// SPDX-License-Identifier: MIT
// THE CHASSIS: a panel over the picture drawn as the token's own page draws
// its instruments (the workbench's 35-film-geometry `flm_panelBody` and
// `flm_title`, 40-chrome-instruments `pnl_drawMinimise`), so the two pages
// agree. The token draws on a canvas four times the picture (1,536 by 1,088);
// its numbers are kept here in the picture's own pixels, a quarter of the
// token's, and scaled to the device: the body a rounded rectangle of radius 4
// in the panel colour under a soft shadow; a pad of 2.25; the title in the
// character ROM, four picture pixels tall, at (pad, pad + 0.5) after the
// lamp's room; the minus a rounded square 0.055 of the panel's width in the
// corner at 0.55 alpha (a plus when the panel is folded to its title); the
// window a rounded rectangle of radius 2 in the ground, from pad + glyph +
// pad down to pad above the bottom, the face clipped inside it. The glyph is
// drawn at a whole number of device pixels per ROM pixel, as near the token's
// four picture pixels as that allows and at least six CSS pixels where the
// panel has the room, so the letters stay sharp on every screen; on a narrow
// panel (a phone's) the glyph is as large as the title's room allows, and a
// title that does not fit even at one pixel a ROM pixel is trimmed as the
// token trims its own (40-chrome-instruments): at a word where one falls in
// the room, never past the room.
import { drawText } from './romfont.js';

export const PAD = 2.25, GLYPH = 4, BODY_R = 4, WINDOW_R = 2, LAMP_ROOM = 5, MARGIN = 8;
export const SHADOW = { blur: 5, offset: 2, colour: 'rgba(0,0,0,0.35)' };
export const MINUS = { min: 2.5, share: 0.055, alpha: 0.55 };

/** The glyph the device would have: the token's four picture pixels as whole device pixels allow, at least six CSS pixels. */
export function glyphScale(k, dpr) { return Math.max(1, Math.round(GLYPH / 8 * k), Math.ceil(0.75 * dpr)); }
/** The room a title has on a panel `pw` wide, in device pixels: between the lamp's room and the minus, less a gap of two picture pixels. */
export function titleRoom(pw, k, dpr) {
  const pad = PAD * k, lampRoom = Math.max(LAMP_ROOM * k, 6 * dpr), size = Math.max(MINUS.min * k, pw * MINUS.share);
  return pw - pad - lampRoom - size - pad - 2 * k;
}
/** The glyph a title fits at on a panel: the device's, or fewer device pixels a ROM pixel when the title would run into the minus; never under one. */
export function glyphFor(pw, k, dpr, title) {
  const fit = Math.floor(titleRoom(pw, k, dpr) / (8 * Math.max(1, String(title || '').length)));
  return Math.max(1, Math.min(glyphScale(k, dpr), fit));
}
/** A title trimmed to its room at scale `g` as the token trims its own: at the last word that falls in the room past its eighth character, else at the room. */
export function fitTitle(title, room, g) {
  const text = String(title || ''), maxChars = Math.max(1, Math.floor(room / (8 * g)));
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf(' ', maxChars);
  return text.slice(0, cut > 8 ? cut : maxChars);
}

/** The layout in device pixels for a body `pw` by `ph` at `k` device pixels per picture pixel; `g` overrides the glyph (a rack shares one across its panels). */
export function layout(pw, ph, k, dpr, { title = '', g = null } = {}) {
  const pad = PAD * k, gg = g || glyphFor(pw, k, dpr, title), bar = pad + 8 * gg + pad, lampRoom = Math.max(LAMP_ROOM * k, 6 * dpr);
  const size = Math.max(MINUS.min * k, pw * MINUS.share), room = titleRoom(pw, k, dpr);
  return { pad, g: gg, bar, lampRoom, room, title: { x: Math.round(pad + lampRoom), y: Math.round(pad + 0.5 * k), text: fitTitle(title, room, gg) },
    minus: { x: pw - pad - size, y: pad, size }, window: { x: pad, y: bar, w: pw - pad * 2, h: ph - bar - pad } };
}

/**
 * Draw the chassis at (ox, oy) on `ctx`: the body (the title strip alone when folded), the title, the minus or plus,
 * the window and, through `face(ctx, x, y, w, h)`, what the instrument shows in it. Returns the layout used.
 */
export function drawChassis(ctx, { pw, ph, k, dpr, ox = 0, oy = 0, colours, title, font = null, folded = false, face = null, g = null }) {
  const L = layout(pw, ph, k, dpr, { title, g }), h = folded ? L.bar : ph;
  ctx.save();
  ctx.shadowColor = SHADOW.colour; ctx.shadowBlur = SHADOW.blur * k; ctx.shadowOffsetY = SHADOW.offset * k;
  ctx.fillStyle = colours.panel; ctx.beginPath(); ctx.roundRect(ox, oy, pw, h, BODY_R * k); ctx.fill();
  ctx.restore();
  drawText(ctx, font, L.title.text, ox + L.title.x, oy + L.title.y, L.g, colours.ink);
  const m = L.minus, bx = ox + m.x, by = oy + m.y, sz = m.size;
  ctx.save();
  ctx.globalAlpha = MINUS.alpha; ctx.strokeStyle = colours.ink; ctx.lineWidth = Math.max(1, Math.round(sz * 0.09));
  ctx.beginPath(); ctx.roundRect(bx, by, sz, sz, Math.round(sz * 0.25)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx + sz * 0.26, by + sz * 0.5); ctx.lineTo(bx + sz * 0.74, by + sz * 0.5); ctx.stroke();
  if (folded) { ctx.beginPath(); ctx.moveTo(bx + sz * 0.5, by + sz * 0.26); ctx.lineTo(bx + sz * 0.5, by + sz * 0.74); ctx.stroke(); }
  ctx.restore();
  if (!folded) {
    const w = L.window;
    ctx.save();
    ctx.fillStyle = colours.ground; ctx.beginPath(); ctx.roundRect(ox + w.x, oy + w.y, w.w, w.h, WINDOW_R * k); ctx.fill();
    ctx.beginPath(); ctx.roundRect(ox + w.x, oy + w.y, w.w, w.h, WINDOW_R * k); ctx.clip();
    if (face) face(ctx, ox + w.x, oy + w.y, w.w, w.h);
    ctx.restore();
  }
  return L;
}
