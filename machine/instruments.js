// SPDX-License-Identifier: MIT
// THE INSTRUMENTS: the rack. The build renders the card from
// instruments.json (one row an instrument, in its groups, with the MODE
// control on top); this module wires the rows, keeps the mode and every
// switch, lays the instruments that are on over the machine's picture as
// panels, and draws each from the data the page already holds. Two tiers
// (the machine study §11, the instruments study): PURE, nothing on this
// page reads or reaches into the machine and the picture is the machine's
// alone; INSTRUMENTS, read-only layers named in NOW PLAYING and the
// provenance. The default follows the work (the owner, 2026-09-23): a work
// whose own page shows instruments shows them here on arrival, at the
// places its page keeps them, from the catalogue's facts; anything else
// starts PURE. The address carries a mode when shared (`?mode=`); nothing
// is remembered across visits; the switches keep their positions for the
// visit and are gated under PURE. THE CHAIN STRIP is a status instrument
// over the page, not a read of the machine: visible under PURE, its switch
// visibility alone. An instrument never writes to the machine; the ones
// here read only the sound the page plays (INSTRUMENTS.md).
import { createScope } from './instruments/scope.js';
import { createSpectrum } from './instruments/spectrum.js';

// the picture's own geometry: 384 by 272 with the C64's border, 32 px at the sides and 36 above and below, which
// is where a token's own page keeps its panels (the top band) and where an added one goes (the next free band)
const SIDE = 32 / 384, BAND = 36 / 272, EDGE_R = 352 / 384;
const FACE_W = { quarter: 0.245, wide: (352 - 32) / 384 - 0.245 - 0.005 };
const BAR_H = 16;   // the title bar's height in CSS pixels

export function createRack({ frame, layer, card, audio, badge, say = () => {}, onChange = () => {} }) {
  const rows = [...card.querySelectorAll('.irow')].map((el) => ({
    id: el.dataset.inst, el, name: el.querySelector('.iname').textContent.trim(), title: el.dataset.title || null, group: el.dataset.group,
    needs: el.dataset.needs || null, requires: el.dataset.requires || null, module: el.dataset.module || null, face: el.dataset.face || null,
    host: el.dataset.host === '1', compact: el.querySelector('canvas.icv'), sw: el.querySelector('.isw'), where: el.querySelector('.iwhere'),
  }));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const bands = (card.dataset.bands || 'top-left,top-right,bottom-left,bottom-right').split(',');
  const modeButtons = [...card.querySelectorAll('#mode button')];
  const why = card.querySelector('#mode-why'), hint = card.querySelector('#mode-hint');
  const drawers = { scope: createScope(), spectrum: createSpectrum() };

  const state = {
    mode: 'pure', chosen: false,                    // the mode, and whether the visitor or the address chose it (else the work decides)
    on: Object.fromEntries(rows.map((r) => [r.id, r.host])),   // each switch's position, kept for the visit; the strip starts on
    available: {},                                   // what the machine and the loaded program allow; the sound's two need only the machine
    own: {},                                         // id -> band: the loaded work's own instruments and where its page keeps them
    program: null, catalogue: null, faceState: {},
  };
  for (const r of rows) state.available[r.id] = meets(r, { instruments: [], kind: null });
  const panels = {};    // id -> { el, cv, pos: {x, y} fractions or null (its band), band }
  let raf = 0, dpr = window.devicePixelRatio || 1;

  // ---- what a program allows
  function factsOf(program) {
    if (!program) return { instruments: [], kind: null };
    const f = program.facts || {};
    let own = Array.isArray(f.instruments) ? f.instruments : null;
    if (!own && f.known && state.catalogue) {   // a file recognised as a work of the series: the work's own facts
      const w = (state.catalogue.works || []).find((x) => x.key === f.known.work);
      own = w && w.program && Array.isArray(w.program.instruments) ? w.program.instruments : [];
    }
    return { instruments: own || [], kind: program.kind || null };
  }
  function meets(r, facts) {
    if (r.host) return true;
    if (r.needs === 'audio' && !audio) return false;
    if (r.requires === 'brain025') return facts.kind === 'slotted';
    if (r.requires === 'chamber-stamp') return facts.kind === 'stamped';
    return true;
  }

  /** A program was loaded (or none): availability and the work's own instruments; the default follows the work unless chosen. */
  function programChanged(program) {
    state.program = program;
    const facts = factsOf(program);
    state.own = {};
    for (const x of facts.instruments) if (x && byId[x.id] && bands.includes(x.place)) state.own[x.id] = x.place;
    for (const r of rows) state.available[r.id] = meets(r, facts);
    const ownIds = Object.keys(state.own);
    if (!state.chosen) state.mode = ownIds.length ? 'instruments' : 'pure';
    for (const id of ownIds) state.on[id] = true;   // the work's own come on, in either case
    if (program) say(ownIds.length ? `instruments: ${state.mode === 'instruments' ? 'on' : 'off (PURE, your choice)'}: this work's own page shows ${ownIds.join(' and ')}` : 'instruments: none of this program\'s own; PURE unless you switch');
    render();
  }

  function setMode(mode, chosen) {
    if (mode !== 'pure' && mode !== 'instruments') return;
    const was = state.mode;
    state.mode = mode; if (chosen) state.chosen = true;
    if (mode === 'instruments' && chosen && !rows.some((r) => !r.host && state.on[r.id])) for (const r of rows) if (!r.host && state.available[r.id]) state.on[r.id] = true;   // asked for instruments with none on: all that fit
    if (was !== mode) say(mode === 'instruments' ? `instruments: INSTRUMENTS · ${layers().join(', ') || 'nothing on yet'} · reads only, nothing written` : 'instruments: PURE · nothing on this page reads or reaches into the machine');
    render();
  }
  function toggle(id) {
    const r = byId[id]; if (!r) return;
    if (!r.host && state.mode === 'pure') return;   // gated
    state.on[id] = !state.on[id];
    if (r.host) say(state.on[id] ? 'the chain strip is shown again' : 'the chain strip is hidden; the page reads and records as before');
    else say(`${r.name.toLowerCase()}: ${state.on[id] ? 'on' : 'off'}${state.on[id] && !state.available[id] ? ' · nothing to show for this program' : ''}`);
    render();
  }
  const live = (r) => !r.host && state.mode === 'instruments' && state.on[r.id] && state.available[r.id];
  const layers = () => rows.filter(live).map((r) => r.id);

  // ---- the panels over the picture
  function bandOf(id) {
    if (state.own[id]) return state.own[id];
    const taken = new Set(Object.entries(panels).filter(([k]) => k !== id).map(([, p]) => p.band));
    for (const b of bands) if (!taken.has(b)) return b;
    return bands[bands.length - 1];
  }
  function place(p, W, H) {
    const w = FACE_W[byId[p.id].face] || FACE_W.quarter, h = BAND;
    let x, y;
    if (p.pos) { x = p.pos.x; y = p.pos.y; } else {
      x = p.band.endsWith('left') ? SIDE : EDGE_R - w;
      y = p.band.startsWith('top') ? 0 : 1 - h;
    }
    Object.assign(p.el.style, { left: `${x * W}px`, top: `${y * H}px`, width: `${w * W}px`, height: p.el.classList.contains('folded') ? '' : `${h * H}px` });
    const cw = Math.max(1, Math.round(w * W * dpr)), ch = Math.max(1, Math.round((h * H - BAR_H) * dpr));
    if (p.cv.width !== cw || p.cv.height !== ch) { p.cv.width = cw; p.cv.height = ch; }
    p.cv.style.height = `${h * H - BAR_H}px`;
  }
  function makePanel(r) {
    const el = document.createElement('div');
    el.className = 'ipanel'; el.dataset.inst = r.id;
    el.innerHTML = `<div class="ibar"><span class="lamp" aria-hidden="true"></span><span class="ititle">${r.title || r.name}</span><button type="button" class="ifold" aria-label="fold ${r.name} to its title">–</button></div><canvas class="iface" aria-hidden="true"></canvas>`;
    const p = { id: r.id, el, cv: el.querySelector('canvas'), pos: null, band: bandOf(r.id) };
    el.dataset.band = p.band;
    const bar = el.querySelector('.ibar');
    // the drag: from the pointer's own movement since it went down, so no rectangle is trusted. While a panel is dragged
    // the layer itself takes the pointer (`dragging`), so the moves and the release land on this page and never on the
    // machine's frame beneath, whose document is another origin and hears nothing of ours; the pointer is captured by
    // the bar as well, and the window listens too
    let drag = null;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const lw = layer.clientWidth, lh = layer.clientHeight;
      const x = clamp(drag.x0 + (e.clientX - drag.px), 0, Math.max(0, lw - el.offsetWidth)), y = clamp(drag.y0 + (e.clientY - drag.py), 0, Math.max(0, lh - el.offsetHeight));
      if (Math.abs(x - drag.x0) + Math.abs(y - drag.y0) > 2) drag.moved = true;
      if (drag.moved) { p.pos = { x: x / lw, y: y / lh }; el.style.left = `${x}px`; el.style.top = `${y}px`; }
    };
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.moved) { el.dataset.band = 'dragged'; say(`${r.name.toLowerCase()} moved; it stays there for this visit`); }
      drag = null; layer.classList.remove('dragging');
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
    };
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ifold') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x0: el.offsetLeft, y0: el.offsetTop, px: e.clientX, py: e.clientY, moved: false };
      layer.classList.add('dragging');
      try { bar.setPointerCapture(e.pointerId); } catch (_) { /* the window listeners carry it */ }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      e.preventDefault();
    });
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
    el.querySelector('.ifold').addEventListener('click', () => { el.classList.toggle('folded'); el.querySelector('.ifold').textContent = el.classList.contains('folded') ? '+' : '–'; layout(); });
    return p;
  }
  function layout() {
    const W = frame.clientWidth, H = frame.clientHeight;
    if (!W || !H) return;
    for (const p of Object.values(panels)) place(p, W, H);
    for (const r of rows) if (r.compact) { const cw = Math.round(r.compact.clientWidth * dpr), ch = Math.round(r.compact.clientHeight * dpr); if (cw && ch && (r.compact.width !== cw || r.compact.height !== ch)) { r.compact.width = cw; r.compact.height = ch; } }
  }

  // ---- the drawing, every frame while anything is on
  function tick() {
    raf = 0;
    const cur = audio ? audio.current() : null, data = cur ? cur.data : null, rate = audio ? audio.sampleRate || 48000 : 48000;
    let any = false;
    for (const r of rows) {
      if (r.host || !r.module) continue;
      const d = drawers[r.module]; if (!d) continue;
      const on = live(r), p = panels[r.id];
      if (on && r.compact && r.compact.width) { state.faceState[r.id] = d.draw(r.compact, data, rate, { segments: 10 }); any = true; }
      if (on && p && !p.el.classList.contains('folded')) { d.draw(p.cv, data, rate, { words: false, lineWidth: Math.max(1.5, 1.6 * dpr), segments: 8 }); any = true; }
      if (on && r.where) r.where.textContent = words(r);
    }
    if (any) raf = requestAnimationFrame(tick);
  }
  function words(r) {
    const fs = state.faceState[r.id];
    const where = panels[r.id] ? (state.own[r.id] ? `the work's own · ${panels[r.id].el.dataset.band.replace('-', ' ')}` : `${panels[r.id].el.dataset.band === 'dragged' ? 'where you put it' : panels[r.id].el.dataset.band.replace('-', ' ')}`) : '';
    const sound = fs === 'waiting' ? 'waiting for your first tap or key' : fs === 'silent' ? 'no signal' : fs === 'signal' ? 'signal' : '';
    return [where, sound].filter(Boolean).join(' · ');
  }

  function render() {
    // the rows
    for (const r of rows) {
      const on = r.host ? state.on[r.id] : live(r);
      r.el.classList.toggle('on', on);
      r.el.classList.toggle('gated', !r.host && state.mode === 'pure');
      r.el.classList.toggle('idle', !r.host && state.mode === 'instruments' && state.on[r.id] && !state.available[r.id]);
      r.sw.textContent = state.on[r.id] ? 'ON' : 'OFF';
      r.sw.setAttribute('aria-pressed', state.on[r.id] ? 'true' : 'false');
      r.sw.disabled = !r.host && state.mode === 'pure';
      if (r.where && !on) r.where.textContent = r.host ? '' : state.mode === 'pure' ? 'off under PURE' : !state.available[r.id] && state.on[r.id] ? 'nothing to show for this program' : '';
    }
    for (const b of modeButtons) { const is = b.dataset.mode === state.mode; b.classList.toggle('on', is); b.setAttribute('aria-checked', is ? 'true' : 'false'); }
    if (why) why.textContent = state.mode === 'instruments' ? 'INSTRUMENTS · the page reads the machine and writes nothing · the run stays PURE' : 'PURE · nothing on this page reads or reaches into the machine';
    if (hint) hint.textContent = Object.keys(state.own).length ? (state.mode === 'instruments' ? 'on for this work: its own page shows these' : 'your choice; INSTRUMENTS brings the work\'s own back') : 'a fresh visit follows the work · a link carries it';   // one line on a phone
    // the strip
    if (badge) badge.hidden = !state.on.chain;
    // the panels: one per instrument that is on, made when it comes on, removed when it goes off
    for (const r of rows) {
      if (r.host || !r.face) continue;
      const want = live(r);
      if (want && !panels[r.id]) { panels[r.id] = makePanel(r); layer.appendChild(panels[r.id].el); }
      else if (!want && panels[r.id]) { panels[r.id].el.remove(); delete panels[r.id]; }
    }
    layer.dataset.mode = state.mode;
    layout();
    if (!raf && layers().length) raf = requestAnimationFrame(tick);
    onChange();
  }

  // ---- the wiring
  for (const b of modeButtons) b.addEventListener('click', () => setMode(b.dataset.mode, true));
  for (const r of rows) r.sw.addEventListener('click', () => toggle(r.id));
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { dpr = window.devicePixelRatio || 1; layout(); }).observe(frame);
  window.addEventListener('resize', () => { dpr = window.devicePixelRatio || 1; layout(); });

  /** For the header line: what is on, in the page's own words. */
  function line() { return state.mode === 'instruments' ? `${layers().join(' · ') || 'nothing on'} · INSTRUMENTS` : 'off · PURE'; }
  /** For NOW PLAYING and the provenance. */
  function record() { return { mode: state.mode === 'instruments' ? 'INSTRUMENTS' : 'PURE', layers: layers() }; }
  function modeWords() { const l = layers(); return state.mode === 'instruments' ? `INSTRUMENTS · ${l.length ? l.join(', ') : 'nothing on'} · reads only, nothing written` : 'PURE · nothing on this page reaches into the machine'; }
  /** For the gate. */
  function snapshot() {
    return { mode: state.mode, chosen: state.chosen, on: { ...state.on }, available: { ...state.available }, own: { ...state.own }, layers: layers(), faces: { ...state.faceState },
      panels: Object.fromEntries(Object.entries(panels).map(([k, p]) => [k, { band: p.el.dataset.band, pill: p.el.classList.contains('folded'), left: p.el.offsetLeft, top: p.el.offsetTop, width: p.el.offsetWidth, height: p.el.offsetHeight }])) };
  }

  render();
  return { programChanged, setMode, toggle, line, record, modeWords, snapshot, layout, set catalogue(c) { state.catalogue = c; }, get mode() { return state.mode; } };
}
