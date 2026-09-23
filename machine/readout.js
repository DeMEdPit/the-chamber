// SPDX-License-Identifier: MIT
// A readout for a line cut short. When a bay's header line does not fit,
// the part that can be cut (the name, never the trust words beside it)
// slides left, far enough to show its end, rests, and slides back, the
// way the display of a 1990s stereo shows a long title. Nothing else
// moves. Two shapes: 'bounce', out and back at one slow pace with a rest
// at each end, for as long as the card is closed and in view (the owner's
// pick, 2026-09-23: the page is a tool and also art, and the motion is a
// nod to that era's gear); 'once', one pass with a quick return, then
// rest until the line changes. Either runs only on a narrow screen (a
// wide one has its bays open), only for a closed bay substantially in
// view, only when the text is actually cut, never under reduced motion
// and never while the tab is hidden; the lines start out of step, the top
// one first, so they drift apart. Nothing ever snaps: a line whose card
// leaves the view finishes its pass and stops; a card opening or a line
// changing glides the text home; a resize that only changes the height
// (a phone's address bar) is ignored. The text moves by a transform on an
// inner span, off the main thread, and the cut is marked by a fade at the
// edge (the stylesheet's, on the host's `cut` class), so the machine's
// own work never makes it stutter. The whole text is always there for a
// screen reader and for anyone who opens the bay. One switch in host.js
// turns it off and one word picks the shape; this file is its whole body.
export function createReadout({ narrow, still, closed, mode = 'bounce', speed = 30, wait = 1000, rewait = 300, hold = 900, back = 300, glide = 260, stagger = 700 } = {}) {
  const tune = { mode, speed, wait, rewait, hold, back, glide, stagger };   // pixels a second; the pauses in milliseconds
  const EASE = 'cubic-bezier(.45,0,.55,1)';   // the same curve out and back: soft at both ends, one pace between
  const shown = new WeakMap();                // el -> the text last shown (the 'once' shape shows each text one time)
  const timers = new WeakMap();               // el -> the pending timer
  const inView = new WeakSet();               // the bays substantially in view
  const active = new Set();                   // the lines moving now
  const queue = [];                           // 'once': lines waiting their turn
  let width = window.innerWidth;
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const e of entries) { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); }
        const entering = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);   // top down, out of step
        entering.forEach((e, i) => { for (const el of e.target.querySelectorAll('.bs .e')) if (!active.has(el)) schedule(el, tune.rewait + (tune.mode === 'bounce' ? i * tune.stagger : 0)); });
      }, { threshold: 0.6 })
    : null;
  const bayOf = (el) => el.closest('details');
  const inner = (el) => el.firstElementChild;
  const canRun = (el) => narrow() && !still() && closed(bayOf(el)) && (io ? inView.has(bayOf(el)) : true) && document.visibilityState !== 'hidden';
  const lines = (root) => root.querySelectorAll('.bs .e');
  const place = (el) => [...lines(document)].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).indexOf(el);   // its place down the screen

  function watch(bay) { if (io) io.observe(bay); else inView.add(bay); }
  /** A line is judged after a pause; the first time, later by its place down the screen, so the lines start out of step. */
  function schedule(el, ms) {
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => consider(el), ms));
  }
  /** The line changed: what was moving glides home, and the new text is judged after the pause, so a line that changes again at once is not chased. */
  function update(el) {
    const first = !shown.has(el);
    if (active.has(el)) stop(el);
    schedule(el, tune.wait + (first && tune.mode === 'bounce' ? Math.max(0, place(el)) * tune.stagger : 0));
  }
  function consider(el) {
    if (active.has(el)) return;
    const text = el.textContent;
    if (tune.mode === 'once' && shown.get(el) === text) return;
    if (!canRun(el)) return;
    if (tune.mode === 'once' && active.size) { if (!queue.includes(el)) queue.push(el); return; }   // once: one line at a time
    const over = el.scrollWidth - el.clientWidth;
    shown.set(el, text);
    if (over <= 2) return;
    run(el, over, text);
  }
  /** Out by exactly the hidden width, rest; then back at the same pace and again ('bounce'), or a quick return and rest ('once'). */
  function run(el, over, text) {
    const t = inner(el);
    if (!t) return;
    active.add(el);
    el.classList.add('reading');
    t.style.transform = 'translateX(0px)';
    void t.offsetWidth;                                       // the start lands before the motion begins
    const ms = (over / tune.speed) * 1000;
    const slide = (x, then) => { t.style.transition = `transform ${(ms / 1000).toFixed(2)}s ${EASE}`; t.style.transform = `translateX(${x}px)`; timers.set(el, setTimeout(then, ms + tune.hold)); };
    const out = () => slide(-over, tune.mode === 'bounce' ? home : quick);
    const home = () => slide(0, again);
    const again = () => { if (tune.mode === 'bounce' && canRun(el) && el.textContent === text) out(); else finish(el); };
    const quick = () => { t.style.transition = `transform ${tune.back}ms ease`; t.style.transform = 'translateX(0px)'; timers.set(el, setTimeout(() => finish(el), tune.back + 20)); };
    out();
  }
  function finish(el) {
    const t = inner(el);
    if (t) { t.style.transition = ''; t.style.transform = ''; }
    el.classList.remove('reading');
    active.delete(el);
    if (tune.mode === 'once') { const next = queue.shift(); if (next) schedule(next, 250); }
  }
  /** A moving line comes home in a short glide, then rests. */
  function stop(el) {
    clearTimeout(timers.get(el));
    const i = queue.indexOf(el); if (i >= 0) queue.splice(i, 1);
    if (!active.has(el)) return;
    const t = inner(el);
    t.style.transition = `transform ${tune.glide}ms ease`; t.style.transform = 'translateX(0px)';
    timers.set(el, setTimeout(() => finish(el), tune.glide + 20));
  }
  /** At once, with no glide: for a hidden tab. */
  function reset(el) { clearTimeout(timers.get(el)); const i = queue.indexOf(el); if (i >= 0) queue.splice(i, 1); if (active.has(el)) finish(el); }
  function stopAll(root) { for (const el of lines(root)) stop(el); }
  function resetAll(root) { for (const el of lines(root)) reset(el); }
  /** A bay closed again, or the page came back: its lines are judged again after a short pause. */
  function resume(root) { for (const el of lines(root)) if (!active.has(el)) schedule(el, tune.rewait); }
  /** For the gate: show this line again whatever was shown before. */
  function replay(el) { shown.delete(el); reset(el); consider(el); }
  const state = (el) => { const t = inner(el); const m = t && /translateX\((-?[\d.]+)px\)/.exec(t.style.transform || ''); return { mode: tune.mode, active: active.has(el), queued: queue.includes(el), offset: m ? Number(m[1]) : 0, reading: el.classList.contains('reading'), shown: shown.get(el) === el.textContent, over: el.scrollWidth - el.clientWidth }; };
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return;                // a phone's address bar changes the height alone: nothing to re-judge
    width = window.innerWidth;
    for (const el of lines(document)) { reset(el); shown.delete(el); }
    resume(document);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') resetAll(document); else resume(document); });
  return { watch, update, stop, stopAll, reset, resetAll, resume, replay, state, tune };
}
