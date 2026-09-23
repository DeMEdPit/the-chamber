// SPDX-License-Identifier: MIT
// A readout for a line cut short. When a bay's header line does not fit,
// the part that can be cut (the name, never the trust words beside it)
// slides left once, far enough to show its end, holds, and returns, the
// way a CD player's display shows a long title. Nothing else moves. It
// runs only on a narrow screen (a wide one cuts nothing), only for a
// closed bay that is in view, only when the text is actually cut, once
// for each text the line shows, one line at a time, and never under
// reduced motion; the whole text is always there for a screen reader and
// for anyone who opens the bay. One switch in host.js turns it off; this
// file is its whole body.
export function createReadout({ narrow, still, closed, speed = 30, wait = 1000, hold = 800, back = 300 } = {}) {
  const tune = { speed, wait, hold, back };   // pixels a second; the pauses in milliseconds
  const shown = new WeakMap();                // el -> the text last revealed, or judged to fit
  const timers = new WeakMap();               // el -> the pending timer
  const inView = new WeakSet();               // the bays substantially in view
  const queue = [];                           // lines waiting their turn
  let current = null;                         // the one line moving now
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const e of entries) { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); }
        for (const e of entries) if (e.isIntersecting) for (const el of e.target.querySelectorAll('.bs .e')) consider(el);
      }, { threshold: 0.6 })
    : null;
  const bayOf = (el) => el.closest('details');
  const canRun = (el) => narrow() && !still() && closed(bayOf(el)) && (io ? inView.has(bayOf(el)) : true) && document.visibilityState !== 'hidden';

  function watch(bay) { if (io) io.observe(bay); else inView.add(bay); }
  /** The line changed: judge it after a pause, so a line that changes again at once is not chased. */
  function update(el) {
    clearTimeout(timers.get(el));
    if (current === el) reset(el);
    timers.set(el, setTimeout(() => consider(el), tune.wait));
  }
  function consider(el) {
    if (current === el) return;
    const text = el.textContent;
    if (shown.get(el) === text) return;
    if (!canRun(el)) return;
    if (current) { if (!queue.includes(el)) queue.push(el); return; }   // one line at a time: the next waits its turn
    const over = el.scrollWidth - el.clientWidth;
    shown.set(el, text);
    if (over <= 2) return;
    run(el, over);
  }
  /** One pass: slide left by exactly the hidden width, hold, return; then the cut and its mark come back. */
  function run(el, over) {
    current = el;
    el.classList.add('reading');
    void el.offsetWidth;                                      // the class lands before the motion starts
    el.style.transition = `text-indent ${(over / tune.speed).toFixed(2)}s linear`;
    el.style.textIndent = `-${over}px`;
    timers.set(el, setTimeout(() => {
      el.style.transition = `text-indent ${tune.back}ms ease`;
      el.style.textIndent = '0px';
      timers.set(el, setTimeout(() => finish(el), tune.back + 20));
    }, (over / tune.speed) * 1000 + tune.hold));
  }
  function finish(el) {
    el.style.transition = ''; el.style.textIndent = ''; el.classList.remove('reading');
    if (current === el) current = null;
    const next = queue.shift();
    if (next) timers.set(next, setTimeout(() => consider(next), 250));
  }
  /** The bay opened, the window changed, or the text moved on: stop at once and rest. */
  function reset(el) {
    clearTimeout(timers.get(el));
    const i = queue.indexOf(el); if (i >= 0) queue.splice(i, 1);
    if (current === el) finish(el);
  }
  function resetAll(root) { for (const el of root.querySelectorAll('.bs .e')) reset(el); }
  /** For the gate: show this line again whatever was shown before. */
  function replay(el) { shown.delete(el); reset(el); consider(el); }
  const state = (el) => ({ active: current === el, queued: queue.includes(el), indent: el.style.textIndent || '0px', reading: el.classList.contains('reading'), shown: shown.get(el) === el.textContent, over: el.scrollWidth - el.clientWidth });
  window.addEventListener('resize', () => { for (const el of document.querySelectorAll('.bs .e')) { reset(el); shown.delete(el); } });
  return { watch, update, reset, resetAll, replay, state, tune };
}
