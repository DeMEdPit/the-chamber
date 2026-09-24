// SPDX-License-Identifier: MIT
// SCOPE: the SID's output as a trace. It draws the buffer the page is
// playing now (audio.js `current()`) and asks the machine for nothing. Two
// drawings, one instrument. In the card's small readout, the workbench's
// recipe, learned over August and September 2026 (docs in the private
// repository; the site's study §11): a fixed window rather than the whole
// buffer, so a note is a few cycles and not a picket fence; a rising-edge
// trigger with hysteresis, so the trace does not jump sideways on every
// buffer; one vertex per pixel at a fractional stride up to six samples a
// pixel and the true extremes of each column beyond that; and a held scale,
// the largest peak of the last `hold` frames, so a quiet passage still reads
// as quiet and nothing pumps. The chain's machine has no voice state to fit
// a window to, so the window is a stated number of milliseconds. Over the
// picture, in the token's chassis, the token's own wave (`wave`, below).
// Either trace is stroked in a vertical gradient of its colour (`beam`):
// the ink at the midline, its paler tint at the top and the bottom, so a
// peak reads brighter as a phosphor beam does where it turns (the owner,
// 2026-09-24: a finer gradation, matched to the scene); the wave's recipe
// is untouched, the gradient is only what its line is drawn with.
import { pale } from './colour.js';

/**
 * The beam: a vertical gradient over a trace's rows, the colour at the midline, its paler tint at the extremes; one is
 * kept per context, colour and extent, so a frame builds nothing. A gradient is a value of the canvas, not a colour of
 * the palette; a white ink pales to white and its beam is one colour.
 */
export function createBeam() {
  let ctxFor = null, keyFor = '', gradient = null;
  return function beam(ctx, y, h, colour) {
    const key = `${colour}|${y}|${h}`;
    if (ctx !== ctxFor || key !== keyFor) {
      ctxFor = ctx; keyFor = key;
      gradient = ctx.createLinearGradient(0, y, 0, y + h);
      const tint = pale(colour);
      gradient.addColorStop(0, tint); gradient.addColorStop(0.5, colour); gradient.addColorStop(1, tint);
    }
    return gradient;
  };
}

export function createScope({ windowMs = 20, band = 0.08, hold = 150, stroke = '#39ff88', ground = '#050505', grid = '#181818', ink = '#aaa9a3' } = {}) {
  const peaks = new Float32Array(hold); let peakAt = 0, peakN = 0;
  const cardBeam = createBeam(), panelBeam = createBeam();

  /** Rising-edge trigger with hysteresis: arm below the midpoint less a band, fire above it plus the band, searched only across the slack the window leaves; silence locks onto nothing. */
  function trigger(data, win) {
    const slack = data.length - win;
    if (slack <= 1) return 0;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < data.length; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-9) return 0;
    const mid = (lo + hi) / 2, b = (hi - lo) * band;
    let armed = false;
    for (let j = 0; j < slack; j++) {
      if (!armed) { if (data[j] < mid - b) armed = true; } else if (data[j] > mid + b) return j;
    }
    return 0;
  }

  /** What the signal is: 'silent' when every sample is at rest, else 'signal'. */
  function judge(data) {
    if (!data) return 'waiting';
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i]) > 1e-4) return 'signal';
    return 'silent';
  }

  /** The held scale: the largest peak of the last `hold` frames, taken now. */
  function gainOf(data) {
    let mx = 0;
    for (let i = 0; i < data.length; i += 7) { const a = data[i] < 0 ? -data[i] : data[i]; if (a > mx) mx = a; }
    peaks[peakAt % hold] = mx; peakAt++; if (peakN < hold) peakN++;
    let pk = 0;
    for (let i = 0; i < peakN; i++) if (peaks[i] > pk) pk = peaks[i];
    if (!pk) pk = mx;
    return pk > 1e-9 ? 0.97 / pk : 1;
  }

  /**
   * The card's readout: draw into a canvas already sized in device pixels. `data` is the buffer sounding now or null;
   * `rate` its sample rate. Returns the state drawn: waiting, silent or signal. `words` false leaves the state unwritten.
   */
  function draw(cv, data, rate, { words = true, lineWidth = 2 } = {}) {
    const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.fillStyle = ground; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, Math.round(h / 2) + 0.5); ctx.lineTo(w, Math.round(h / 2) + 0.5);
    for (let k = 1; k < 4; k++) { const x = Math.round(w * k / 4) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    ctx.stroke();
    const state = judge(data);
    const mid = h / 2, amp = (h / 2) * 0.86;
    ctx.strokeStyle = cardBeam(ctx, 0, h, stroke); ctx.lineWidth = lineWidth; ctx.beginPath();
    if (state !== 'signal') {
      ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
    } else {
      const win = Math.max(2, Math.min(data.length, Math.round(rate * windowMs / 1000)));
      const off = trigger(data, win), end = Math.min(off + win, data.length), spp = (end - off) / w, gain = gainOf(data);
      if (spp > 6) {
        // far more samples than pixels: the true extremes of each column, the honest whole-window view
        for (let px = 0; px < w; px++) {
          const a = off + Math.floor(px * spp), b = Math.min(off + Math.floor((px + 1) * spp), end);
          let lo = Infinity, hi = -Infinity;
          for (let i = a; i < b; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
          if (lo > hi) continue;
          const y0 = mid - Math.max(-1, Math.min(1, hi * gain)) * amp;
          let y1 = mid - Math.max(-1, Math.min(1, lo * gain)) * amp;
          if (y1 - y0 < 0.7) y1 = y0 + 0.7;
          ctx.moveTo(px + 0.5, y0); ctx.lineTo(px + 0.5, y1);
        }
      } else {
        // one vertex per pixel at a fractional stride: clean slanted edges, drawn rather than plotted
        for (let px = 0; px <= w; px++) {
          let si = off + px * spp; if (si >= end) si = end - 1;
          const v = Math.max(-1, Math.min(1, data[Math.floor(si)] * gain)), y = mid - v * amp;
          if (px === 0) ctx.moveTo(0.5, y); else ctx.lineTo(px + 0.5, y);
        }
      }
      ctx.stroke();
    }
    if (words && w >= 240) {
      const fs = Math.max(9, Math.round(h * 0.16));
      ctx.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.fillStyle = ink; ctx.textBaseline = 'bottom';
      ctx.fillText(state === 'waiting' ? 'WAITING FOR SOUND' : state === 'silent' ? 'NO SIGNAL' : `${windowMs} MS · TRIG`, 6, h - 4);
    }
    return state;
  }

  /** The panel over the picture: the token's wave in the chassis window, the beam of the ink, `k` device pixels per picture pixel. */
  function window(ctx, x, y, w, h, data, rate, { colours, k = 4 }) {
    wave(ctx, x, y, w, h, data, panelBeam(ctx, y, h, colours.ink), Math.max(1, Math.round(k / 4)));
    return judge(data);
  }

  return { draw, window, judge, wave, get windowMs() { return windowMs; } };
}

/**
 * The token's own wave (the workbench's 83a-sid-face `sid_drawWave`, the pill-scale trace lifted onto the token's face):
 * one line through the whole buffer at one point per pixel of width, an integer stride, each sample clamped to ±1 at
 * 0.9 of the window's half height, a thin line at 0.85 alpha; no window, no trigger, no gain, no grid; a flat line
 * with no data. The midline is snapped to the pixel grid so a silent line is one crisp row. `lineWidth` in device
 * pixels; on the token it is one pixel of a canvas four times the picture. `stroke` is whatever the canvas takes as
 * one: the token's page gives a colour, this page the beam of the ink.
 */
export function wave(ctx, x, y, w, h, data, stroke, lineWidth = 1) {
  const n = data ? data.length : 0, mid = Math.round(y + h / 2) + (lineWidth % 2 ? 0.5 : 0);
  ctx.save();
  ctx.strokeStyle = stroke; ctx.globalAlpha = 0.85; ctx.lineWidth = lineWidth; ctx.beginPath();
  if (n) {
    const step = Math.max(1, Math.floor(n / w));
    for (let i = 0, px = 0; i < n; i += step, px++) {
      const v = Math.max(-1, Math.min(1, data[i])), yy = mid - v * (h / 2) * 0.9;
      if (px === 0) ctx.moveTo(x, yy); else ctx.lineTo(x + px, yy);
    }
  } else { ctx.moveTo(x, mid); ctx.lineTo(x + w, mid); }
  ctx.stroke();
  ctx.restore();
}
