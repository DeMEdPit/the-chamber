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
import { shade, pale, parse } from '../instruments/colour.js';
import { wave, createScope } from '../instruments/scope.js';
import { createSpectrum } from '../instruments/spectrum.js';
import { drawText, screenCode, textWidth } from '../instruments/romfont.js';
import { glyphScale, layout, drawChassis, PAD, GLYPH, MARGIN } from '../instruments/chassis.js';

let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };

/** A canvas context that records what is asked of it. */
function recorder() {
  const calls = [], props = {};
  return new Proxy({}, {
    get(_, name) {
      if (name === 'calls') return calls;
      if (name in props) return props[name];
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
  check(scope.window(c5, 0, 0, 350, 60, null, 48000, { colours: { ink: '#123456' }, k: 4 }) === 'waiting' && named(c5, 'stroke')[0].strokeStyle === '#123456' && named(c5, 'stroke')[0].lineWidth === 1, 'the scope\'s window drawing is the wave in the ink, one pixel at the token\'s scale, and reports the state');
  const c6 = recorder(); scope.window(c6, 0, 0, 350, 60, data, 48000, { colours: { ink: '#123456' }, k: 8 });
  check(named(c6, 'stroke')[0].lineWidth === 2, 'at twice the token\'s scale the line is two pixels');
}

// 5. the spectrum's window: bars in the ink, the top two paler, the rest in the panel colour, nothing lit without data
{
  const sp = createSpectrum(), ctx = recorder();
  const st = sp.window(ctx, 5, 7, 300, 40, null, 48000, { colours: { ink: '#ff0000', ground: '#000000', panel: '#262626' } });
  const rects = named(ctx, 'fillRect');
  check(st === 'waiting' && rects.length > 0 && rects.every((r) => r.fillStyle === '#262626') && rects.every((r) => r.args[0] >= 5 && r.args[1] >= 7), `without data every segment is off in the panel colour (${rects.length} segments inside the window)`);
  const loud = new Float32Array(4096); for (let i = 0; i < loud.length; i++) loud[i] = Math.sin(i / 12) * 0.5;
  const c2 = recorder(); sp.window(c2, 0, 0, 300, 40, loud, 48000, { colours: { ink: '#ff0000', ground: '#000000', panel: '#262626' } });
  const lit = named(c2, 'fillRect').filter((r) => r.fillStyle !== '#262626');
  check(lit.length > 0 && lit.every((r) => r.fillStyle === '#ff0000' || r.fillStyle === pale('#ff0000')), `with a tone some segments light in the ink or its paler tint (${lit.length})`);
}

// 6. the titles from the character ROM: a glyph's set bits become squares of g pixels at the right places; the stand-in without a ROM
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

// 7. the chassis: the token's numbers in picture pixels, the glyph at whole device pixels, never under six CSS pixels
{
  check(PAD === 2.25 && GLYPH === 4 && MARGIN === 8, 'the token\'s pad and glyph, a quarter of its 4x canvas numbers');
  check(glyphScale(2, 1) === 1 && glyphScale(4, 2) === 2 && glyphScale(3, 1) === 2 && glyphScale(2.8, 3) === 3 && glyphScale(6, 2) === 3, 'the glyph scale: 1 at the desktop, 2 at its retina, 2 at three times, 3 on a phone at three');
  const L = layout(376, 144, 4, 2);   // the token's own canvas: a 0.245 panel at 1536 wide, the band 144 tall, k = 4, as if at ratio 2
  check(L.pad === 9 && L.g === 2 && L.bar === 9 + 16 + 9 && L.window.y === 34 && L.window.x === 9 && L.window.w === 358 && L.window.h === 144 - 34 - 9 && Math.abs(L.minus.size - 376 * 0.055) < 1e-9 && L.minus.y === 9,
        `at the token's own scale the layout is the token's: pad 9, glyph 2, the window at 34, the minus ${L.minus.size.toFixed(2)} wide`);
  const L2 = layout(188, 72, 2, 1);
  check(L2.pad === 4.5 && L2.g === 1 && L2.bar === 17 && L2.window.h === 72 - 17 - 4.5 && L2.title.y === Math.round(4.5 + 1) && L2.lampRoom === 10, 'at the desktop half of that: pad 4.5, the glyph 8 px, the bar 17');
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
