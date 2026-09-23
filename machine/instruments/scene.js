// SPDX-License-Identifier: MIT
// SCENE: the token's own colour rule, as its page has it (the workbench's
// 36-window-artcolours `rec_artColors` and `rec_shade`, and the adoption in
// 40-chrome-instruments `rec_drawScope`), so a picture gives the same three
// colours here as there. From a count of the picture's pixels per colour
// (the machine document's `colours`, the whole picture, border included):
// the ground is the commonest colour; the ink the next commonest with at
// least MIN_PIXELS behind it (the token samples every fourth pixel and asks
// for 64 samples, which is 256 pixels: dither noise is not an ink); the
// panel is the ground shaded one step. A one-colour picture gives a contrast
// ink, black on a light ground and white on a dark one, marked synthetic:
// invented, not observed, and never allowed to replace colours learned from
// the picture (a blank or fading frame must not repaint the panels). A
// reading is adopted only when two in a row agree, so a flicker frame
// changes nothing. GREEN is the site's green on the token's default chassis.
import { parse, shade } from './colour.js';

export const MIN_PIXELS = 256;
export const SITE = Object.freeze({ ink: '#39ff88', ground: '#000000', panel: '#262626', synthetic: false });
export const DEFAULTS = Object.freeze({ ink: '#ffffff', ground: '#000000', panel: '#262626', synthetic: false });

/** The token's pick from a count: `{ink, ground, panel, synthetic}`, or null when the count is empty. */
export function pickColours(colours, minPixels = MIN_PIXELS) {
  const seen = (Array.isArray(colours) ? colours : []).filter((c) => c && Number.isFinite(c.count) && c.count > 0 && parse(c.rgb)).sort((a, b) => b.count - a.count);
  if (!seen.length) return null;
  const ground = seen[0].rgb.toLowerCase();
  const figure = seen.slice(1).find((c) => c.count >= minPixels);
  let ink, synthetic = false;
  if (figure) ink = figure.rgb.toLowerCase();
  else { const [r, g, b] = parse(ground); ink = r * 0.3 + g * 0.6 + b * 0.1 > 128 ? '#000000' : '#ffffff'; synthetic = true; }
  return { ink, ground, panel: shade(ground), synthetic };
}

/** The adoption: two agreeing readings in a row change the colours; a synthetic pick never replaces learned ones. */
export function createAdoption() {
  let current = { ...DEFAULTS }, learned = false, pending = '';
  return {
    get current() { return current; },
    get learned() { return learned; },
    get pending() { return pending; },
    reset() { current = { ...DEFAULTS }; learned = false; pending = ''; },
    /** One reading offered. Returns true when the colours changed. */
    offer(pick) {
      if (!pick) return false;
      if (pick.synthetic && learned) { pending = ''; return false; }
      const key = pick.ink + pick.ground;
      if (key === current.ink + current.ground) { pending = ''; return false; }
      if (key === pending) { current = { ink: pick.ink, ground: pick.ground, panel: pick.panel, synthetic: !!pick.synthetic }; learned = !pick.synthetic; pending = ''; return true; }
      pending = key;
      return false;
    },
  };
}
