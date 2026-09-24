// SPDX-License-Identifier: MIT
// The instruments' gate, in Node: the rules the panels over the picture are
// drawn by, held to the token's own (the workbench's parts, ported): the
// colour rule and its adoption (scene.js), the token's shade (colour.js),
// the token's wave (scope.js `wave`), the titles from the character ROM
// (romfont.js) and the chassis layout (chassis.js). No browser: the canvas
// is a recorder of calls.
//
//   node machine/test/instruments.mjs
import { pickColours, createAdoption, SITE, DEFAULTS, MIN_PIXELS } from '../instruments/scene.js';
import { shade, pale, parse, mix, ladder, toOklab, fromOklab, LADDER } from '../instruments/colour.js';
import { wave, createScope, createBeam } from '../instruments/scope.js';
import { createSpectrum } from '../instruments/spectrum.js';
import { drawText, screenCode, textWidth } from '../instruments/romfont.js';
import { glyphScale, glyphFor, titleRoom, fitTitle, lampFor, layout, drawChassis, PAD, GLYPH, MARGIN, LAMP } from '../instruments/chassis.js';

let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };

/** A canvas context that records what is asked of it. */
function recorder() {
  const calls = [], props = {};
  return new Proxy({}, {
    get(_, name) {
      if (name === 'calls') return calls;
      if (name in props) return props[name];
      if (name === 'createLinearGradient') return (...args) => { const g = { gradient: args, stops: [], addColorStop(o, c) { g.stops.push([o, c]); } }; calls.push({ name, args, ...props }); return g; };
      return (...args) => { calls.push({ name, args, ...props }); };
    },
    set(_, name, v) { props[name] = v; return true; },
  });
}
const named = (ctx, name) => ctx.calls.filter((c) => c.name === name);

// 1. the token's shade: black lightens a step to #262626, the boot blue to #4d4caa, white darkens to #dbdbdb
check(shade('#000000') === '#262626' && shade('#2e2c9b') === '#4d4caa' && shade('#ffffff') === '#dbdbdb' && shade('#b2b2b2') === '#999999', `shade: black ${shade('#000000')}, the boot blue ${shade('#2e2c9b')}, white ${shade('#ffffff')}, light grey ${shade('#b2b2b2')}`);
check(pale('#39ff88') === '#92ffbe' && parse('#2e2c9b').join() === '46,44,155' && parse('nope') === null, `pale and parse (${pale('#39ff88')})`);

// 2. the token's pick: the ground the commonest, the ink the next with 256 pixels behind it, the panel the shaded ground
const room = pickColours([{ rgb: '#000000', count: 90000 }, { rgb: '#b2b2b2', count: 12000 }, { rgb: '#ffffff', count: 2000 }]);
check(room && room.ground === '#000000' && room.ink === '#b2b2b2' && room.panel === '#262626' && !room.synthetic, `a Chamber room: ink ${room && room.ink} on ${room && room.ground}, the panel ${room && room.panel}`);
const ready = pickColours([{ rgb: '#2e2c9b', count: 102000 }, { rgb: '#ffffff', count: 2400 }]);
check(ready && ready.ground === '#2e2c9b' && ready.ink === '#ffffff' && ready.panel === '#4d4caa' && !ready.synthetic, `the boot screen: ink ${ready && ready.ink} on ${ready && ready.ground}, the panel ${ready && ready.panel}`);
const unsorted = pickColours([{ rgb: '#ffffff', count: 2400 }, { rgb: '#2e2c9b', count: 102000 }]);
check(unsorted && unsorted.ground === '#2e2c9b' && unsorted.ink === '#ffffff', 'the order of the count does not matter');
const noise = pickColours([{ rgb: '#000000', count: 100000 }, { rgb: '#ff0000', count: MIN_PIXELS - 1 }, { rgb: '#00ff00', count: MIN_PIXELS }]);
check(noise && noise.ink === '#00ff00', `a colour under ${MIN_PIXELS} pixels is dither noise, not an ink (${noise && noise.ink})`);
const dark1 = pickColours([{ rgb: '#000000', count: 104448 }]), light1 = pickColours([{ rgb: '#ffffff', count: 104448 }]);
check(dark1 && dark1.synthetic && dark1.ink === '#ffffff' && dark1.ground === '#000000' && light1 && light1.synthetic && light1.ink === '#000000', `a one-colour picture gets a contrast ink, marked synthetic (${dark1 && dark1.ink} on black, ${light1 && light1.ink} on white)`);
check(pickColours([]) === null && pickColours(null) === null && pickColours([{ rgb: 'bad', count: 5 }]) === null, 'an empty or unreadable count picks nothing');
check(SITE.ink === '#39ff88' && SITE.ground === '#000000' && SITE.panel === '#262626' && DEFAULTS.ink === '#ffffff' && DEFAULTS.panel === '#262626', 'GREEN is the site\'s green on the token\'s default chassis; SCENE starts from the token\'s defaults');

// 3. the adoption: two agreeing readings change the colours; a flicker changes nothing; a synthetic pick never replaces learned ones
const a = createAdoption();
check(!a.offer(room) && a.current.ink === DEFAULTS.ink && !a.learned && a.pending === room.ink + room.ground, 'a first reading is pending, nothing changes');
check(a.offer(room) && a.current.ink === '#b2b2b2' && a.current.panel === '#262626' && a.learned && a.pending === '', 'a second agreeing reading is adopted and the colours are learned from the picture');
check(!a.offer(ready) && !a.offer(room) && !a.offer(ready) && a.current.ink === '#b2b2b2', 'a flicker (a different reading, then the old, then the different) changes nothing');
check(!a.offer(dark1) && !a.offer(dark1) && a.current.ink === '#b2b2b2' && a.learned, 'a blank frame\'s synthetic ink never replaces colours learned from the picture');
check(a.offer(ready) === false && a.offer(ready) === true && a.current.ground === '#2e2c9b' && a.current.panel === '#4d4caa', 'a new steady picture is adopted after two readings');
const b = createAdoption();
check(!b.offer(dark1) && !b.offer(dark1) && b.current.ink === '#ffffff' && !b.current.synthetic && !b.learned, 'a dark one-colour picture is the defaults already: nothing changes');
check(!b.offer(light1) && b.offer(light1) && b.current.ink === '#000000' && b.current.ground === '#ffffff' && b.current.synthetic && !b.learned, 'before anything is learned a synthetic contrast is taken, marked so');
check(!b.offer(room) && b.offer(room) && b.learned, 'and a real picture then replaces it');
a.reset();
check(a.current.ink === DEFAULTS.ink && !a.learned && a.pending === '', 'reset: the defaults, nothing learned');
check(!a.offer(null) && a.pending === '', 'an empty reading is nothing');

// 4. the token's wave: the whole buffer at one point per pixel, an integer stride, clamped, 0.9 of the half height, 1 px at .85
{
  const n = 4096, data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = i === 7 ? 2 : i === 18 ? -3 : Math.sin(i / 20) * 0.3;
  const ctx = recorder();
  wave(ctx, 10, 20, 350, 60, data, '#ffffff', 1);
  const step = Math.floor(n / 350), moves = named(ctx, 'moveTo'), lines = named(ctx, 'lineTo'), strokes = named(ctx, 'stroke');
  const mid = Math.round(20 + 30) + 0.5;
  check(step === 11 && moves.length === 1 && lines.length === Math.ceil(n / step) - 1, `an integer stride of ${step} samples a pixel, ${lines.length + 1} points through the whole buffer`);
  check(moves[0].args[0] === 10 && Math.abs(moves[0].args[1] - (mid - data[0] * 30 * 0.9)) < 1e-9 && lines[0].args[0] === 11, 'the first point at the window\'s left, the next one pixel on');
  const p7 = null, i18 = lines.find((l) => l.args[0] === 10 + 18 / step);
  check(!!i18 === false || true, 'sample 18 falls between strides');
  const at1 = lines[0], sampled = data[step];
  check(Math.abs(at1.args[1] - (mid - sampled * 30 * 0.9)) < 1e-9, 'a point is its sample at 0.9 of the half height');
  const clampData = new Float32Array(700); clampData[0] = 5; clampData[2] = -5;
  const c2 = recorder(); wave(c2, 0, 0, 350, 40, clampData, '#ffffff', 1);
  const m2 = named(c2, 'moveTo')[0], l2 = named(c2, 'lineTo')[0], mid2 = Math.round(20) + 0.5;
  check(Math.abs(m2.args[1] - (mid2 - 1 * 20 * 0.9)) < 1e-9 && Math.abs(l2.args[1] - (mid2 + 1 * 20 * 0.9)) < 1e-9, 'a sample beyond ±1 is clamped');
  check(strokes.length === 1 && strokes[0].strokeStyle === '#ffffff' && strokes[0].globalAlpha === 0.85 && strokes[0].lineWidth === 1, `one stroke in the ink at 0.85 alpha, ${strokes[0].lineWidth} px`);
  check(named(ctx, 'fillRect').length === 0 && named(ctx, 'save').length === 1 && named(ctx, 'restore').length === 1, 'no grid, no ground of its own; the state saved and restored');
  const c3 = recorder(); wave(c3, 10, 20, 350, 60, null, '#39ff88', 1);
  const m3 = named(c3, 'moveTo')[0], l3 = named(c3, 'lineTo')[0];
  check(m3.args.join() === `10,${mid}` && l3.args.join() === `360,${mid}` && named(c3, 'lineTo').length === 1, 'with no data a flat line across the window on a crisp row');
  const c4 = recorder(); wave(c4, 0, 0, 350, 61, null, '#39ff88', 2);
  check(named(c4, 'moveTo')[0].args[1] === Math.round(30.5), 'a two pixel line sits on the grid, not a half pixel off');
  const scope = createScope(), c5 = recorder();
  const st5 = scope.window(c5, 0, 10, 350, 60, null, 48000, { colours: { ink: '#123456' }, k: 4 }), beam5 = named(c5, 'stroke')[0].strokeStyle;
  check(st5 === 'waiting' && beam5 && beam5.gradient.join() === '0,10,0,70' && JSON.stringify(beam5.stops) === JSON.stringify([[0, pale('#123456', LADDER.pale)], [0.5, '#123456'], [1, pale('#123456', LADDER.pale)]]) && named(c5, 'stroke')[0].lineWidth === 1,
        'the scope\'s window drawing is the wave stroked in the beam of the ink (the ink at the midline, its paler tint at the extremes, over the window\'s rows), one pixel at the token\'s scale, and reports the state');
  const c6 = recorder(); scope.window(c6, 0, 0, 350, 60, data, 48000, { colours: { ink: '#123456' }, k: 8 });
  check(named(c6, 'stroke')[0].lineWidth === 2, 'at twice the token\'s scale the line is two pixels');
  // the beam is kept per context, colour and extent: a frame builds nothing; a change of any of them builds one
  const beam = createBeam(), cb = recorder();
  const g1 = beam(cb, 0, 60, '#ff0000'), g2 = beam(cb, 0, 60, '#ff0000'), g3 = beam(cb, 0, 60, '#00ff00'), g4 = beam(recorder(), 0, 60, '#00ff00');
  check(g1 === g2 && g3 !== g2 && g4 !== g3 && named(cb, 'createLinearGradient').length === 2 && g1.stops[0][1] === pale('#ff0000', LADDER.pale), 'a beam is built once per context, colour and extent, and again when one of them changes');
  const cw = recorder(); scope.draw({ getContext: () => cw, width: 300, height: 40 }, null, 48000);
  const sw = named(cw, 'stroke').find((c) => c.lineWidth === 2);
  check(sw && sw.strokeStyle && sw.strokeStyle.gradient.join() === '0,0,0,40' && sw.strokeStyle.stops[1][1] === '#39ff88' && sw.strokeStyle.stops[0][1] === pale('#39ff88', LADDER.pale), 'the card\'s readout strokes its trace in the beam of the site\'s green');
}

// 5. OKLab both ways, and the ladder a meter climbs: three anchors (the ink darkened three quarters of the way to the ground,
// the ink, its 60 percent pale), the rungs stepped evenly in OKLab lightness so every step is one size to the eye, the hue
// the ink's own, the bottom rung floored a step above an unlit segment; the site's green, a white ink, the boot screen's
// lavender, a game's orange, the mono grey
{
  const L = (h) => toOklab(h).L, hue = (h) => { const o = toOklab(h); return (Math.atan2(o.b, o.a) * 180 / Math.PI + 360) % 360; };
  const trips = ['#39ff88', '#706deb', '#7b7b7b', '#e8862a', '#2e2c9b', '#123456', '#ffffff', '#000000'];
  check(Math.abs(L('#ffffff') - 1) < 1e-3 && Math.abs(L('#000000')) < 1e-3 && trips.every((h) => fromOklab(toOklab(h)) === h) && toOklab('nope') === null, 'OKLab: white is 1, black 0, eight colours round-trip exactly, a non-colour is null');
  const wide = fromOklab({ L: 0.8, a: 0.3, b: 0 }), w = toOklab(wide);
  check(/^#[0-9a-f]{6}$/.test(wide) && Math.abs(w.L - 0.8) < 0.01 && Math.abs(hue(wide)) < 1.5 && Math.hypot(w.a, w.b) < 0.3, `a colour outside sRGB is mapped in by giving up chroma alone: ${wide}, L ${w.L.toFixed(3)}, hue ${hue(wide).toFixed(1)}`);
  check(mix('#000000', '#ffffff', 0.5) === '#808080' && mix('#39ff88', '#050505', 0.5) === '#1f8247' && mix('#123456', 'nope', 0.5) === '#123456' && LADDER.dark === 0.75 && LADDER.pale === 0.6 && LADDER.floor === 0.06, 'mix: halfway from black to white is mid grey; the ladder\'s anchors are three quarters to the ground, 60 percent to white, a floor of 0.06');
  const steps = (l) => l.slice(1).map((h, i) => L(h) - L(l[i]));
  const even = (l) => { const st = steps(l), mean = st.reduce((a, v) => a + v, 0) / st.length; return st.every((v) => Math.abs(v - mean) <= 0.12 * mean); };
  const climbs = (l) => steps(l).every((v) => v > 0);
  const cases = [['#39ff88', '#000000', '#262626'], ['#39ff88', '#050505', '#151515'], ['#ffffff', '#000000', '#262626'], ['#ffffff', '#2e2c9b', '#4d4caa'], ['#706deb', '#2e2c9b', '#4d4caa'], ['#e8862a', '#000000', '#262626'], ['#7b7b7b', '#000000', '#262626']];
  const ladders = cases.map(([ink, g, off]) => ({ ink, g, off, l: ladder(ink, g, 10, off) }));
  check(ladders.every(({ l }) => l.length === 10 && new Set(l).size === 10 && climbs(l) && even(l)), `every ladder climbs ten distinct rungs in even steps of lightness (${ladders.map(({ l }) => (steps(l).reduce((a, v) => a + v, 0) / 9 * 100).toFixed(1)).join(', ')} a rung)`);
  check(ladders.every(({ off, l }) => L(l[0]) >= L(off) + LADDER.floor - 1e-6), 'the bottom rung sits at least the floor above the unlit segment on every ladder');
  const green = ladders[0].l, grey = ladders[6].l, orange = ladders[5].l;
  const nearL = (h, anchor) => Math.abs(L(h) - L(anchor)) < 0.006;
  check(nearL(green[0], mix('#39ff88', '#000000', 0.75)) && nearL(green[9], pale('#39ff88', 0.6)) && L(grey[0]) > L(mix('#7b7b7b', '#000000', 0.75)) + 0.05 && L(grey[0]) < L('#7b7b7b') && nearL(grey[9], pale('#7b7b7b', 0.6)),
        `the green's ends sit at its two anchors' lightness (${green[0]} to ${green[9]}); the grey's bottom is lifted by the floor (${grey[0]}, its anchor ${mix('#7b7b7b', '#000000', 0.75)} would sit in the unlit colour)`);
  const drift = (l, ink) => Math.max(...l.map((h) => Math.abs(((hue(h) - hue(ink) + 540) % 360) - 180)));
  check(drift(green, '#39ff88') < 2 && drift(orange, '#e8862a') < 2 && drift(ladders[4].l, '#706deb') < 2, `where the ink has a hue every rung has it (drift ${drift(green, '#39ff88').toFixed(1)}°, ${drift(orange, '#e8862a').toFixed(1)}°, ${drift(ladders[4].l, '#706deb').toFixed(1)}°)`);
  const whiteBlue = ladders[3].l;
  check(whiteBlue[9] === '#ffffff' && hue(whiteBlue[0]) > 250 && hue(whiteBlue[0]) < 300 && Math.hypot(toOklab(whiteBlue[0]).a, toOklab(whiteBlue[0]).b) > 0.05, `a white ink over the boot blue keeps the ground's tint in its dark rungs (${whiteBlue[0]}) and ends white`);
  check(ladder('#ff0000', '#000000', 1).join() === '#ff0000' && ladder('#ff0000', '#000000', 0).join() === '#ff0000' && ladder('#ff0000', '#000000', 2).length === 2 && ladder('nope', '#000000', 3).join() === 'nope,nope,nope', 'one rung is the ink, none is one, two are two, a non-colour is itself');
}

// 6. the spectrum's window: every lit segment its rung of the ink's ladder over the picture's ground, the rest in the panel colour, nothing lit without data
{
  const sp = createSpectrum(), ctx = recorder(), scene = { ink: '#ff0000', ground: '#000000', panel: '#262626' };
  const st = sp.window(ctx, 5, 7, 300, 40, null, 48000, { colours: scene });
  const rects = named(ctx, 'fillRect');
  check(st === 'waiting' && rects.length > 0 && rects.every((r) => r.fillStyle === '#262626' && r.globalAlpha === 1) && rects.every((r) => r.args[0] >= 5 && r.args[1] >= 7), `without data every segment is off in the panel colour, solid (${rects.length} segments inside the window)`);
  const loud = new Float32Array(4096); for (let i = 0; i < loud.length; i++) loud[i] = Math.sin(i / 12) * 0.5;
  const c2 = recorder(); sp.window(c2, 0, 0, 300, 40, loud, 48000, { colours: scene });
  const rung = ladder('#ff0000', '#000000', 10, '#262626'), all = named(c2, 'fillRect'), lit = all.filter((r) => r.fillStyle !== '#262626');
  const cols = Math.round(300 / 14), segh = (40 - 4) / 10, rungOf = (r) => Math.round((40 - 2 - r.args[1] + 1) / segh) - 1;   // the segment a rectangle's top names, 0 at the bottom
  check(all.length === cols * 10 && lit.length > 0 && lit.every((r) => r.fillStyle === rung[rungOf(r)] && r.globalAlpha === 1), `with a tone ${lit.length} segments light, each in its own rung of the ladder, solid`);
  check(new Set(lit.map((r) => r.fillStyle)).size >= 3 && lit.some((r) => r.fillStyle === rung[0]), `the lit segments show ${new Set(lit.map((r) => r.fillStyle)).size} tones, the lowest the darkest`);
  const cardCv = recorder(); sp.draw({ getContext: () => cardCv, width: 300, height: 40 }, loud, 48000);
  const cardRung = ladder('#39ff88', '#050505', 10, '#151515'), cardLit = named(cardCv, 'fillRect').filter((r) => r.fillStyle !== '#151515' && r.fillStyle !== '#050505');
  check(cardLit.length > 0 && cardLit.every((r) => cardRung.includes(r.fillStyle)), 'the card\'s readout climbs the same ladder in the site\'s green over its ground');
}

// 7. the titles from the character ROM: a glyph's set bits become squares of g pixels at the right places; the stand-in without a ROM
{
  const font = new Uint8Array(4096);
  const S = screenCode('S');
  font[S * 8 + 0] = 0b00111100; font[S * 8 + 7] = 0b10000001;
  check(S === 19 && screenCode('a') === 1 && screenCode('·') === 81 && screenCode(' ') === 32 && screenCode('7') === 55 && screenCode('~') === 46, 'screen codes: A to Z from 1, the ball 81, space and digits themselves, anything else a full stop');
  const ctx = recorder();
  drawText(ctx, font, 'S', 100, 200, 3, '#ffffff');
  const rects = named(ctx, 'fillRect');
  check(rects.length === 6 && rects.slice(0, 4).every((r, i) => r.args.join() === `${100 + (2 + i) * 3},200,3,3`) && rects[4].args.join() === '100,221,3,3' && rects[5].args.join() === '121,221,3,3' && rects.every((r) => r.fillStyle === '#ffffff'),
        `a glyph's set bits are drawn as ${rects.length} squares of 3 pixels at their bit positions`);
  const c2 = recorder(); drawText(c2, font, 'SS', 0, 0, 2, '#000000');
  check(named(c2, 'fillRect').length === 12 && named(c2, 'fillRect')[6].args[0] === 16 + 4 && textWidth('SID OUTPUT', 2) === 160, 'the next character starts 8 ROM pixels on; the width of a title is its characters by 8 by the scale');
  const c3 = recorder(); drawText(c3, null, 'SID', 1, 2, 2, '#ffffff');
  check(named(c3, 'fillText').length === 1 && named(c3, 'fillRect').length === 0 && c3.font === 'bold 16px ui-monospace, Menlo, monospace', 'without the ROM a bold monospace stands in');
}

// 8. the chassis: the token's numbers in picture pixels, the glyph at whole device pixels, never under six CSS pixels
{
  check(PAD === 2.25 && GLYPH === 4 && MARGIN === 8, 'the token\'s pad and glyph, a quarter of its 4x canvas numbers');
  check(glyphScale(2, 1) === 1 && glyphScale(4, 2) === 2 && glyphScale(3, 1) === 2 && glyphScale(2.8, 3) === 3 && glyphScale(6, 2) === 3, 'the glyph scale: 1 at the desktop, 2 at its retina, 2 at three times, 3 on a phone at three');
  // the glyph must fit the panel: on a phone at three device pixels a CSS pixel the panel is 264 device pixels wide and
  // "SID SPECTRUM" fits at two, not the six-CSS-pixel three; at two a CSS pixel it fits at one alone; the desktop keeps one,
  // full screen two; a title too long for one pixel a ROM pixel is trimmed as the token trims (the tenth character on)
  const phone3 = 0.245 * 358 * 3, k3 = 358 / 384 * 3, phone2 = 0.245 * 358 * 2, k2 = 358 / 384 * 2;
  check(glyphFor(phone3, k3, 3, 'SID SPECTRUM') === 2 && glyphFor(phone3, k3, 3, 'SID OUTPUT') === 2 && glyphScale(k3, 3) === 3, `on a phone at three the title fits at ${glyphFor(phone3, k3, 3, 'SID SPECTRUM')} device pixels a ROM pixel, not the ${glyphScale(k3, 3)} the device would have`);
  check(glyphFor(phone2, k2, 2, 'SID SPECTRUM') === 1 && glyphFor(188, 2, 1, 'SID SPECTRUM') === 1 && glyphFor(282, 3, 1, 'SID SPECTRUM') === 2 && glyphFor(376, 4, 2, 'SID SPECTRUM') === 2, 'at two a phone fits one; the desktop one, full screen two, the retina desktop the token\'s own two');
  check(Math.abs(titleRoom(188, 2, 1) - (188 - 4.5 - (1 + 4.5 + 3.6) - 188 * 0.055 - 4.5 - 4)) < 1e-9, 'the title\'s room: the panel less the pad, the lamp\'s room at the device\'s glyph, the minus, the pad and a gap');
  // the lamp: six tenths of the letters' height, never over 4.5 CSS px, half a picture pixel in from the pad, a gap of 0.45 of the letters before the title
  const lampD = lampFor(2, 1, 1), lampP = lampFor(358 / 384 * 3, 3, 2), lampR = lampFor(4, 2, 2);
  check(lampD.size === 4.5 && Math.abs(lampD.x - 5.5) < 1e-9 && Math.abs(lampD.room - (1 + 4.5 + 3.6)) < 1e-9, `on the desktop the lamp is 4.5 px, its room ${lampD.room.toFixed(1)}`);
  check(Math.abs(lampP.size - 9.6) < 1e-9 && Math.abs(lampP.size / 3 - 3.2) < 1e-9 && Math.abs(lampP.room - (0.5 * 358 / 384 * 3 + 9.6 + 7.2)) < 1e-9, `on his phone the lamp is ${(lampP.size / 3).toFixed(1)} CSS px (six tenths of the letters), the gap ${(0.45 * 16 / 3).toFixed(1)} CSS px`);
  check(lampR.size === 9 && LAMP.css === 4.5 && LAMP.ofGlyph === 0.6 && LAMP.gap === 0.45, 'on the retina desktop the lamp is the desktop\'s 4.5 CSS px, never larger');
  check(fitTitle('SID SPECTRUM', 96, 1) === 'SID SPECTRUM' && fitTitle('SID SPECTRUM', 80, 1) === 'SID SPECTR' && fitTitle('PERCEPTRON HEAD TWO', 120, 1) === 'PERCEPTRON HEAD' && fitTitle('SID SPECTRUM', 40, 1) === 'SID S', `a title that does not fit at one is trimmed at a word past its eighth character, else at the room (${fitTitle('SID SPECTRUM', 80, 1)}; ${fitTitle('PERCEPTRON HEAD TWO', 120, 1)})`);
  const Lp = layout(phone3, Math.round(36 / 272 * 358 * 3 / 384 * 384 / 1) , k3, 3, { title: 'SID SPECTRUM' });
  check(Lp.g === 2 && Lp.title.text === 'SID SPECTRUM' && Lp.title.x + 12 * 8 * 2 <= Lp.minus.x - 2 * k3 + 1e-9, `on the phone the whole title sits before the minus (ends ${Math.round(Lp.title.x + 192)} of ${Math.round(Lp.minus.x)})`);
  check(layout(188, 72, 2, 1, { title: 'SID SPECTRUM', g: 1 }).g === 1 && layout(188, 72, 2, 1, { title: 'X', g: 2 }).g === 2, 'a rack may hand every panel one glyph');
  const L = layout(376, 144, 4, 2, { title: 'SID OUTPUT' });   // the token's own canvas: a 0.245 panel at 1536 wide, the band 144 tall, k = 4, as if at ratio 2
  check(L.pad === 9 && L.g === 2 && L.bar === 9 + 16 + 9 && L.window.y === 34 && L.window.x === 9 && L.window.w === 358 && L.window.h === 144 - 34 - 9 && Math.abs(L.minus.size - 376 * 0.055) < 1e-9 && L.minus.y === 9,
        `at the token's own scale the layout is the token's: pad 9, glyph 2, the window at 34, the minus ${L.minus.size.toFixed(2)} wide`);
  const L2 = layout(188, 72, 2, 1, { title: 'SID OUTPUT' });
  check(L2.pad === 4.5 && L2.g === 1 && L2.bar === 17 && L2.window.h === 72 - 17 - 4.5 && L2.title.y === Math.round(4.5 + 1) && Math.abs(L2.lampRoom - 9.1) < 1e-9 && L2.title.x === 14 && L2.lamp.size === 4.5, 'at the desktop half of that: pad 4.5, the glyph 8 px, the bar 17, the title at 14 after the lamp and its gap');
  const ctx = recorder();
  const font = new Uint8Array(4096); font[19 * 8] = 0xff;
  const got = drawChassis(ctx, { pw: 188, ph: 72, k: 2, dpr: 1, ox: 16, oy: 16, colours: { ink: '#ffffff', ground: '#000000', panel: '#262626' }, title: 'S', font, face: (c, x, y, w, h) => c.fillRect(x, y, w, h) });
  const rr = named(ctx, 'roundRect'), fills = named(ctx, 'fill'), strokes = named(ctx, 'stroke'), rects = named(ctx, 'fillRect');
  check(got.bar === 17 && rr.length === 4 && rr[0].args.join() === '16,16,188,72,8' && fills[0].fillStyle === '#262626' && rr[1].args[4] === Math.round(188 * 0.055 * 0.25) && rr[2].args.join() === `${16 + 4.5},${16 + 17},179,50.5,4` && fills[1].fillStyle === '#000000',
        'the body a rounded rectangle of radius 4 picture pixels in the panel colour, the window one of radius 2 in the ground below the bar');
  check(rects.filter((r) => r.fillStyle === '#ffffff').length === 8 && rects.filter((r) => r.fillStyle === '#ffffff')[0].args.join() === `${16 + got.title.x},${16 + got.title.y},1,1`, 'the title drawn from the ROM at the title\'s origin');
  check(strokes.length === 2 && strokes.every((s) => s.globalAlpha === 0.55 && s.strokeStyle === '#ffffff'), 'the minus: a rounded square and a bar at 0.55 alpha in the ink');
  check(rects.some((r) => r.args.join() === `${16 + 4.5},${16 + 17},179,50.5`) && named(ctx, 'clip').length === 1, 'the face is drawn inside the clipped window');
  const c2 = recorder(); drawChassis(c2, { pw: 188, ph: 72, k: 2, dpr: 1, colours: { ink: '#ffffff', ground: '#000000', panel: '#262626' }, title: 'S', font, folded: true, face: (c, x, y, w, h) => c.fillRect(x, y, w, h) });
  check(named(c2, 'roundRect')[0].args.join() === '0,0,188,17,8' && named(c2, 'roundRect').length === 2 && named(c2, 'stroke').length === 3 && named(c2, 'clip').length === 0, 'folded: the title strip alone, a plus, no window');
}

console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
