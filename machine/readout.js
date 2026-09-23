// SPDX-License-Identifier: MIT
// A readout for a line cut short. When a bay's header line does not fit,
// the part that can be cut (the name, never the trust words beside it)
// slides left, far enough to show its end, rests, and slides back, the
// way the display of a 1990s stereo shows a long title. Nothing else
// moves. Two shapes: 'bounce', out and back at one slow pace, resting a
// moment at each end, for as long as the card is closed and in view (the
// owner's pick, 2026-09-23: the page is a tool and also art, and the
// motion is a nod to that era's gear); 'once', one pass with a quick
// return, then rest until the line changes. Either runs only on a narrow
// screen (a wide one has its bays open), only for a closed bay
// substantially in view, only when the text is actually cut, never under
// reduced motion and never while the tab is hidden; the lines start out
// of step so they drift apart; the whole text is always there for a
// screen reader and for anyone who opens the bay. One switch in host.js
// turns it off and one word picks the shape; this file is its whole body.
export function createReadout({ narrow, still, closed, mode = 'bounce', speed = 30, wait = 1000, hold = 1000, back = 300, stagger = 700 } = {}) {
  const tune = { mode, speed, wait, hold, back, stagger };   // pixels a second; the pauses in milliseconds
  const shown = new WeakMap();                // el -> the text last shown (the 'once' shape shows each text one time)
  const timers = new WeakMap();               // el -> the pending timer
  const inView = new WeakSet();               // the bays substantially in view
  const active = new Set();                   // the lines moving now
  const queue = [];                           // 'once': lines waiting their turn
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const e of entries) { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); }
        for (const e of entries) for (const el of e.target.querySelectorAll('.bs .e')) { if (e.isIntersecting) { if (!active.has(el)) schedule(el); } else reset(el); }
      }, { threshold: 0.6 })
    : null;
  const bayOf = (el) => el.closest('details');
  const canRun = (el) => narrow() && !still() && closed(bayOf(el)) && (io ? inView.has(bayOf(el)) : true) && document.visibilityState !== 'hidden';
  const lines = (root) => root.querySelectorAll('.bs .e');
  const place = (el) => [...lines(document)].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).indexOf(el);   // its place down the screen: the lines start out of step, the top one first

  function watch(bay) { if (io) io.observe(bay); else inView.add(bay); }
  /** A line is judged after a pause, and later by its place among the lines, so the lines start out of step. */
  function schedule(el) {
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => consider(el), tune.wait + (tune.mode === 'bounce' ? Math.max(0, place(el)) * tune.stagger : 0)));
  }
  /** The line changed: what was moving stops, and the new text is judged after the pause, so a line that changes again at once is not chased. */
  function update(el) {
    if (active.has(el)) reset(el);
    schedule(el);
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
    active.add(el);
    el.classList.add('reading');
    void el.offsetWidth;                                      // the class lands before the motion starts
    const ms = (over / tune.speed) * 1000;
    const slide = (to, then) => { el.style.transition = `text-indent ${(ms / 1000).toFixed(2)}s linear`; el.style.textIndent = to; timers.set(el, setTimeout(then, ms + tune.hold)); };
    const out = () => slide(`-${over}px`, tune.mode === 'bounce' ? home : quick);
    const home = () => slide('0px', again);
    const again = () => { if (tune.mode === 'bounce' && canRun(el) && el.textContent === text) out(); else finish(el); };
    const quick = () => { el.style.transition = `text-indent ${tune.back}ms ease`; el.style.textIndent = '0px'; timers.set(el, setTimeout(() => finish(el), tune.back + 20)); };
    out();
  }
  function finish(el) {
    el.style.transition = ''; el.style.textIndent = ''; el.classList.remove('reading');
    active.delete(el);
    if (tune.mode === 'once') { const next = queue.shift(); if (next) timers.set(next, setTimeout(() => consider(next), 250)); }
  }
  /** The bay opened, the window changed, or the text moved on: stop at once and rest. */
  function reset(el) {
    clearTimeout(timers.get(el));
    const i = queue.indexOf(el); if (i >= 0) queue.splice(i, 1);
    if (active.has(el)) finish(el);
  }
  function resetAll(root) { for (const el of lines(root)) reset(el); }
  /** A bay closed again, or the page came back: its lines are judged again after the pause. */
  function resume(root) { for (const el of lines(root)) { clearTimeout(timers.get(el)); timers.set(el, setTimeout(() => consider(el), tune.wait)); } }
  /** For the gate: show this line again whatever was shown before. */
  function replay(el) { shown.delete(el); reset(el); consider(el); }
  const state = (el) => ({ mode: tune.mode, active: active.has(el), queued: queue.includes(el), indent: el.style.textIndent || '0px', reading: el.classList.contains('reading'), shown: shown.get(el) === el.textContent, over: el.scrollWidth - el.clientWidth });
  window.addEventListener('resize', () => { for (const el of lines(document)) { reset(el); shown.delete(el); } resume(document); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') resetAll(document); else resume(document); });
  return { watch, update, reset, resetAll, resume, replay, state, tune };
}
