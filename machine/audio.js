// SPDX-License-Identifier: MIT
// The page plays the machine's sound. A browser lets sound start only on a
// gesture in the document that plays it; the page's buttons are here, the
// machine is in a sandboxed frame, so the frame hands its samples over the
// port (protocol: audio, samples) and this module schedules them on the
// page's own audio clock, pacing the pulls as nopsta's player does: one
// buffer ahead is scheduled whenever less than two are queued, a timer of
// empty quarter buffers keeps the pulls coming, and a stall re-syncs. The
// last few buffers are kept with their start times, so an instrument can
// draw the buffer that is sounding now rather than the one just scheduled,
// which starts about three buffer-lengths later (the workbench's scope ran
// that far ahead of its sound; instruments.js reads `current()`).
//
// THE CLOCK CAN STOP. A phone's browser suspends the page's audio context
// when the page is left (a switch to another app or tab, a lock), and the
// context stays suspended, or on iOS "interrupted", when the page comes
// back: the pulls stop with it, and until now only a gesture resumed it,
// which is why the instruments sat frozen on the owner's phone until he
// tapped (2026-09-23). And a context can lie: after an interruption a
// phone's browser may say the context runs while its clock stands still
// and nothing sounds (his second report the same evening: no music, the
// faces stuck, a tap doing nothing, because a tap only resumed a context
// that said it was stopped). So the clock itself is watched, not the
// state: a context that says it runs while its time has not moved for a
// second is stalled, and the next gesture builds a fresh clock (a new
// context made in a gesture starts running) and tells the machine the rate
// again, rather than asking the old one. When the page comes back into
// view it asks for the clock back (`wake`, allowed without a gesture once
// one has unlocked the context), waits to see the clock move, and says in
// the log whether it did; the schedule is re-synced whenever the context
// runs again; and `current()` offers no buffer while the clock is stopped
// or stalled, so an instrument says the sound is paused rather than
// drawing a stale buffer as sounding. One more lie no watch can see: on an
// iPhone, Safari can keep a context running, its clock advancing, and
// produce silence after an interruption. So a context is SUSPECT from the
// moment the page is hidden or its state leaves running while the sound is
// attached; on a browser that answers the return honestly the suspicion
// clears when the clock is seen to move again, but on an iPhone it stays,
// and the first gesture after the return builds a fresh clock whatever the
// old one says of itself.
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function createAudio({ bufferSize = 4096, volume = 0.8, onStatus = () => {} } = {}) {
  let ctx = null, gain = null, machine = null, next = 0, lastPush = 0, pause = 0, timer = null, on = true, pulled = 0, inflight = 0, wasRunning = false;
  let stalled = false, suspect = false, seenTime = -1, frozenSince = 0, rebuilt = 0;
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden && machine) suspect = true; });
  const recent = [];   // { at, data }: the buffers scheduled, newest last, the last six kept
  const dur = () => bufferSize / ctx.sampleRate;

  /** The schedule from now: after the clock stops and starts again, the old times are in the past. */
  function resync() {
    if (!ctx || !machine || !machine.alive) return;
    next = ctx.currentTime + dur(); lastPush = ctx.currentTime; pause = 0;
    runTimer();
  }
  function onState() {
    const running = ctx.state === 'running';
    if (!running && machine) suspect = true;            // it stopped while attached: what it says of itself afterwards is not trusted
    if (running && !wasRunning && machine) resync();   // the clock is back: the pulls start again from now
    wasRunning = running;
  }
  function makeContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    gain = ctx.createGain();
    gain.gain.value = on ? volume : 0;
    gain.connect(ctx.destination);
    ctx.addEventListener('statechange', onState);
    seenTime = -1; frozenSince = 0; stalled = false; suspect = false;
    return true;
  }
  /** The clock watched: a context that says it runs while its time has stood still for a second, the page in view, is stalled. */
  function watch() {
    if (!ctx || ctx.state !== 'running' || document.hidden) { seenTime = -1; frozenSince = 0; return; }
    const t = ctx.currentTime, w = performance.now();
    if (t !== seenTime) { seenTime = t; frozenSince = 0; return; }
    if (!frozenSince) frozenSince = w;
    else if (w - frozenSince > 1000 && !stalled) { stalled = true; onStatus('sound: the browser stalled the clock · tap to resume'); }
  }
  /** Does the clock move within `ms`? */
  function advances(ms) {
    if (!ctx) return Promise.resolve(false);
    const t0 = ctx.currentTime, started = performance.now();
    return new Promise((resolve) => { const look = () => { if (!ctx) resolve(false); else if (ctx.currentTime > t0) resolve(true); else if (performance.now() - started > ms) resolve(false); else setTimeout(look, 100); }; look(); });
  }
  /**
   * A fresh clock, made in a gesture (a new context starts running then): the old one closed, the machine told the rate
   * again, the schedule from now. The way back from a context that says it runs and does not, or one that will not resume.
   */
  function rebuild() {
    const old = ctx;
    if (!makeContext()) return;
    try { old.close().catch(() => {}); } catch (e) { /* already closed */ }
    recent.length = 0; wasRunning = true; inflight = 0; rebuilt++;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (machine && machine.alive) {
      const m = machine;
      m.request('audio', { on: true, sampleRate: Math.round(ctx.sampleRate), bufferSize }).then(() => {
        if (machine !== m || !ctx) return;
        next = ctx.currentTime + 3 * dur(); lastPush = ctx.currentTime; pause = 0;
        runTimer();
        onStatus('sound: restarted on a fresh clock');
      }).catch(() => {});
    }
  }

  /** A gesture: the context made or resumed; a stalled or suspect clock rebuilt instead, since asking it proves nothing. */
  function unlock() {
    if (!ctx) return makeContext();
    if (stalled || suspect) { rebuild(); return true; }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return true;
  }

  /**
   * The page came back into view, or the gate asks: if the sound is attached, see that the clock moves, asking the
   * context to resume when it says it is stopped (allowed without a gesture once one has unlocked it). Silent when all
   * is well; says in the log when the clock came back, or that it did not and a tap is needed. Resolves true when it moves.
   */
  async function wake() {
    if (!ctx || !machine || !machine.alive) return false;
    const wasStopped = ctx.state !== 'running';
    if (wasStopped) { try { await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 1000))]); } catch (e) { /* refused: a gesture is needed */ } }
    const ok = ctx.state === 'running' && await advances(800);
    if (ok) {
      if (!IOS) suspect = false;                       // an honest return: the clock moves; an iPhone's may move and stay silent, so its suspicion stands for the next tap
      if (wasStopped || stalled) { stalled = false; seenTime = -1; frozenSince = 0; onStatus(IOS ? 'sound: resumed after the page came back · your next tap makes it sure' : 'sound: resumed after the page came back'); }
    }
    else if (!stalled) { stalled = true; onStatus('sound: the browser kept the clock stopped while the page was away · tap to resume'); }
    return ok;
  }
  /** For the gate: stop the clock as a phone's browser does when the page is left; and mark it stalled as the watch would. */
  function suspend() { return ctx ? ctx.suspend() : Promise.resolve(); }
  function stall() { if (ctx) { stalled = true; onStatus('sound: the browser stalled the clock · tap to resume'); } }

  let attaching = null;
  /** Attach to a machine once: a mouse click raises two gestures at once, and a second call while the first is still
   *  awaiting the machine shares its promise rather than starting a second timer chain. */
  function attach(m) {
    if (machine === m && m.alive) return Promise.resolve(true);
    if (attaching) return attaching;
    attaching = attachTo(m).finally(() => { attaching = null; });
    return attaching;
  }
  async function attachTo(m) {
    if (!ctx) return false;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* needs a gesture */ } }
    if (ctx.state !== 'running') return false;
    await m.request('audio', { on: true, sampleRate: Math.round(ctx.sampleRate), bufferSize });
    machine = m; wasRunning = true;
    next = ctx.currentTime + 3 * dur();
    pause = 0; lastPush = ctx.currentTime;
    runTimer();
    if (!timer) timer = setInterval(push, 4);
    onStatus(`sound: ${Math.round(ctx.sampleRate)} Hz, ${bufferSize} samples a buffer`);
    return true;
  }

  function detach() { machine = null; }

  function push() {
    watch();
    if (!machine || !machine.alive || !ctx || ctx.state !== 'running' || stalled) return;
    const d = dur();
    if (ctx.currentTime - lastPush > 2 * d) { lastPush = ctx.currentTime; pause = 10; return; }
    lastPush = ctx.currentTime;
    if (pause > 0) { pause--; return; }
    if (ctx.currentTime + 2 * d < next) return;
    if (inflight > 1) return;
    if (next < ctx.currentTime) next = ctx.currentTime + d;        // a stall: start again just ahead of now
    const at = next;
    next += d;
    inflight++;
    const forCtx = ctx;
    machine.request('samples', {}, { timeout: 3000 }).then((r) => {
      inflight = Math.max(0, inflight - 1);
      if (!ctx || ctx !== forCtx) return;   // a buffer for a clock that has since been replaced
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = new Float32Array(r.bytes);
      buf.getChannelData(0).set(data);
      src.buffer = buf;
      src.connect(gain);
      src.addEventListener('ended', push);
      const start = Math.max(at, ctx.currentTime);
      src.start(start);
      recent.push({ at: start, data });
      while (recent.length > 6) recent.shift();
      pulled++;
    }).catch(() => { inflight = Math.max(0, inflight - 1); });
  }

  function runTimer() {
    if (!machine || !machine.alive || !ctx) return;
    push();
    const src = ctx.createBufferSource();
    src.addEventListener('ended', runTimer);
    src.connect(ctx.destination);
    src.buffer = ctx.createBuffer(1, bufferSize / 4, ctx.sampleRate);
    src.start(ctx.currentTime);
  }

  /** Resolves once the context runs, or after a short wait if it will not: a gesture's resume is asynchronous. */
  function settle(ms = 400) {
    if (!ctx || ctx.state === 'running') return Promise.resolve(!!ctx && ctx.state === 'running');
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (done) return; done = true; ctx.removeEventListener('statechange', fin); resolve(ctx.state === 'running'); };
      ctx.addEventListener('statechange', fin);
      setTimeout(fin, ms);
    });
  }

  /**
   * The buffer sounding now by the page's own audio clock: the newest whose start is past; null before any has started,
   * while the clock is stopped, or when the newest ended more than two buffers ago (a stall): nothing is sounding then.
   */
  function current() {
    if (!ctx || !recent.length || ctx.state !== 'running' || stalled) return null;
    const now = ctx.currentTime, last = recent[recent.length - 1];
    if (now > last.at + 3 * dur()) return null;
    let cur = null;
    for (const r of recent) if (r.at <= now) cur = r;
    return cur;
  }

  return {
    unlock, attach, detach, settle, current, wake, suspend, stall,
    get sampleRate() { return ctx ? ctx.sampleRate : 0; },
    get ready() { return !!ctx && ctx.state === 'running' && !stalled; },
    get state() { return ctx ? ctx.state : 'off'; },
    get stalled() { return stalled; },
    get suspect() { return suspect; },
    get rebuilt() { return rebuilt; },
    get ios() { return IOS; },
    get attached() { return !!(machine && machine.alive); },
    get pulled() { return pulled; },
    get on() { return on; },
    setOn(v) { on = !!v; if (gain) gain.gain.value = on ? volume : 0; },
  };
}
