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
// four picture pixels as that allows and never under six CSS pixels, so the
// letters stay sharp on every screen.
import { drawText } from './romfont.js';

export const PAD = 2.25, GLYPH = 4, BODY_R = 4, WINDOW_R = 2, LAMP_ROOM = 5, MARGIN = 8;
export const SHADOW = { blur: 5, offset: 2, colour: 'rgba(0,0,0,0.35)' };
export const MINUS = { min: 2.5, share: 0.055, alpha: 0.55 };

/** Device pixels per ROM pixel for `k` device pixels per picture pixel at the device's ratio `dpr`. */
export function glyphScale(k, dpr) { return Math.max(1, Math.round(GLYPH / 8 * k), Math.ceil(0.75 * dpr)); }

/** The layout in device pixels for a body `pw` by `ph` at `k` device pixels per picture pixel. */
export function layout(pw, ph, k, dpr) {
  const pad = PAD * k, g = glyphScale(k, dpr), bar = pad + 8 * g + pad, lampRoom = Math.max(LAMP_ROOM * k, 6 * dpr);
  const size = Math.max(MINUS.min * k, pw * MINUS.share);
  return { pad, g, bar, lampRoom, title: { x: Math.round(pad + lampRoom), y: Math.round(pad + 0.5 * k) },
    minus: { x: pw - pad - size, y: pad, size }, window: { x: pad, y: bar, w: pw - pad * 2, h: ph - bar - pad } };
}

/**
 * Draw the chassis at (ox, oy) on `ctx`: the body (the title strip alone when folded), the title, the minus or plus,
 * the window and, through `face(ctx, x, y, w, h)`, what the instrument shows in it. Returns the layout used.
 */
export function drawChassis(ctx, { pw, ph, k, dpr, ox = 0, oy = 0, colours, title, font = null, folded = false, face = null }) {
  const L = layout(pw, ph, k, dpr), h = folded ? L.bar : ph;
  ctx.save();
  ctx.shadowColor = SHADOW.colour; ctx.shadowBlur = SHADOW.blur * k; ctx.shadowOffsetY = SHADOW.offset * k;
  ctx.fillStyle = colours.panel; ctx.beginPath(); ctx.roundRect(ox, oy, pw, h, BODY_R * k); ctx.fill();
  ctx.restore();
  drawText(ctx, font, title, ox + L.title.x, oy + L.title.y, L.g, colours.ink);
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
