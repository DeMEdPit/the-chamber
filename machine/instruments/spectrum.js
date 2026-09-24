// SPDX-License-Identifier: MIT
// SPECTRUM: the same sound by frequency, the display of a 1990s stereo.
// It draws the buffer the page is playing now and asks the machine for
// nothing; it is the picture of the sound, not the state of the chip, and
// it cannot tell which voice a peak is. The recipe is the workbench's
// (the site's study §11): the whole buffer, so the bins are about 11 Hz
// and a bass line moves; a Hann window, or every buffer boundary smears
// across all bins; log-spaced bands from 40 to 8,000 Hz, each answering
// for its whole band with its loudest bin; a slowly decaying reference
// level rather than a per-frame peak, so silence stays quiet; decibels
// over a 55 dB range; the transform once per buffer and cached; and
// ballistics at draw time only, a bar rising at once and falling a little
// each frame, the measurement never altered. The same bars draw in the
// card's readout (the site's colours) and in the token's chassis window
// over the picture (the chassis colours). A lit segment's colour is its
// rung of the ladder (colour.js `ladder`): from the ink darkened three
// quarters of the way to the ground, through the ink, to its pale, the
// rungs stepped evenly in OKLab lightness so every step is one size to the
// eye, one tone a rung (the owner, 2026-09-24: a finer gradation, matched
// to the scene, not held to the C64's palette, built the way colour scales
// are built); an unlit segment is the off colour, the panel's on the
// chassis, and the bottom rung is held a step of lightness above it.
import { ladder } from './colour.js';

export function createSpectrum({ fmin = 40, fmax = 8000, range = 55, fall = 0.022, decay = 0.992, lit = '#39ff88', off = '#151515', ground = '#050505' } = {}) {
  let re = null, im = null, ref = 1e-6, lastData = null, lastCols = 0, mags = null, disp = null, rungsFor = '', rungs = null;

  function fft(r, i) {
    const n = r.length;
    for (let a = 1, j = 0; a < n; a++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (a < j) { let t = r[a]; r[a] = r[j]; r[j] = t; t = i[a]; i[a] = i[j]; i[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let s = 0; s < n; s += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const ur = r[s + k], ui = i[s + k], xr = r[s + k + half], xi = i[s + k + half];
          const vr = xr * cr - xi * ci, vi = xr * ci + xi * cr;
          r[s + k] = ur + vr; i[s + k] = ui + vi; r[s + k + half] = ur - vr; i[s + k + half] = ui - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  /** One column of magnitudes per band, 0..1, computed once per buffer and cached. */
  function magnitudes(data, rate, cols) {
    if (data === lastData && cols === lastCols) return mags;
    let n = 1; while (n * 2 <= data.length) n *= 2;   // the largest power of two the buffer holds: the whole of a 4,096 buffer
    if (!re || re.length !== n) { re = new Float32Array(n); im = new Float32Array(n); }
    for (let k = 0; k < n; k++) { re[k] = data[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / (n - 1))); im[k] = 0; }
    fft(re, im);
    const out = new Float32Array(cols);
    let frameMax = 0;
    for (let x = 0; x < cols; x++) {
      const f0 = fmin * Math.pow(fmax / fmin, x / cols), f1 = fmin * Math.pow(fmax / fmin, (x + 1) / cols);
      const b0 = Math.max(1, Math.floor(f0 * n / rate)), b1 = Math.min(n / 2, Math.max(b0 + 1, Math.ceil(f1 * n / rate)));
      let m = 0;
      for (let b = b0; b < b1; b++) { const mm = Math.sqrt(re[b] * re[b] + im[b] * im[b]); if (mm > m) m = mm; }
      out[x] = m; if (m > frameMax) frameMax = m;
    }
    ref = frameMax > ref ? frameMax : Math.max(frameMax, ref * decay);
    const peak = Math.max(ref, 1e-6);
    for (let x = 0; x < cols; x++) { const db = 20 * Math.log10(out[x] / peak + 1e-9); out[x] = Math.max(0, Math.min(1, (db + range) / range)); }
    lastData = data; lastCols = cols; mags = out;
    return out;
  }

  /** Ballistics at draw time: a bar rises at once and falls a little each frame; the measurement is never written back. */
  function ballistics(m) {
    if (!disp || disp.length !== m.length) disp = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) disp[i] = m[i] > disp[i] ? m[i] : Math.max(0, disp[i] - fall);
    return disp;
  }

  /** The ladder for this ink over this ground with this many rungs, floored above the off colour, kept until one of them changes. */
  function tones(ink, over, segments, offC) {
    const key = `${ink}|${over}|${segments}|${offC}`;
    if (key !== rungsFor) { rungsFor = key; rungs = ladder(ink, over, segments, offC); }
    return rungs;
  }

  /**
   * The bars in a rectangle of `ctx`, in device pixels: a lit segment in its rung of the ladder from `ink` over `over`
   * (the ground it climbs from), an unlit one in `offC`, every segment solid. Returns the state.
   */
  function bars(ctx, x, y, w, h, data, rate, { segments = 10, ink = lit, over = ground, offC = off } = {}) {
    const cols = Math.max(12, Math.min(48, Math.round(w / 14)));
    const gapx = Math.max(1, Math.round(w / 220)), bw = (w - gapx * (cols + 1)) / cols, segh = (h - 4) / segments, rung = tones(ink, over, segments, offC);
    let state = 'waiting', d = null;
    if (data) {
      let any = false;
      for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i]) > 1e-4) { any = true; break; }
      state = any ? 'signal' : 'silent';
      d = ballistics(any ? magnitudes(data, rate, cols) : new Float32Array(cols));
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < cols; i++) {
      const level = d ? d[i] : 0, n = Math.round(level * segments);
      for (let s = 0; s < segments; s++) {
        ctx.fillStyle = s < n ? rung[s] : offC;
        ctx.fillRect(x + gapx + i * (bw + gapx), y + h - 2 - (s + 1) * segh + 1, Math.max(1, bw), Math.max(1, segh - 2));
      }
    }
    return state;
  }

  /** The card's readout: a canvas sized in device pixels, the site's colours (the ladder from the site's green over its ground). Returns the state: waiting, silent or signal. */
  function draw(cv, data, rate, { segments = 10 } = {}) {
    const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.fillStyle = ground; ctx.fillRect(0, 0, w, h);
    return bars(ctx, 0, 0, w, h, data, rate, { segments });
  }

  /** The panel over the picture: the bars in the chassis window, ten rungs of the ink's ladder over the picture's ground, the panel colour off. */
  function window(ctx, x, y, w, h, data, rate, { colours }) {
    return bars(ctx, x, y, w, h, data, rate, { segments: 10, ink: colours.ink, over: colours.ground, offC: colours.panel });
  }

  return { draw, window, bars };
}
