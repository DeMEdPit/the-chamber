// SPDX-License-Identifier: MIT
// The page plays the machine's sound. A browser lets sound start only on a
// gesture in the document that plays it; the page's buttons are here, the
// machine is in a sandboxed frame, so the frame hands its samples over the
// port (protocol: audio, samples) and this module schedules them on the
// page's own audio clock, pacing the pulls as nopsta's player does: one
// buffer ahead is scheduled whenever less than two are queued, a timer of
// empty quarter buffers keeps the pulls coming, and a stall re-syncs.
export function createAudio({ bufferSize = 4096, volume = 0.8, onStatus = () => {} } = {}) {
  let ctx = null, gain = null, machine = null, next = 0, lastPush = 0, pause = 0, timer = null, on = true, pulled = 0, inflight = 0;
  const dur = () => bufferSize / ctx.sampleRate;

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctx) {
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = on ? volume : 0;
      gain.connect(ctx.destination);
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return true;
  }

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
    machine = m;
    next = ctx.currentTime + 3 * dur();
    pause = 0; lastPush = ctx.currentTime;
    runTimer();
    if (!timer) timer = setInterval(push, 4);
    onStatus(`sound: ${Math.round(ctx.sampleRate)} Hz, ${bufferSize} samples a buffer`);
    return true;
  }

  function detach() { machine = null; }

  function push() {
    if (!machine || !machine.alive || !ctx || ctx.state !== 'running') return;
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
    machine.request('samples', {}, { timeout: 3000 }).then((r) => {
      inflight--;
      if (!ctx) return;
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      buf.getChannelData(0).set(new Float32Array(r.bytes));
      src.buffer = buf;
      src.connect(gain);
      src.addEventListener('ended', push);
      src.start(Math.max(at, ctx.currentTime));
      pulled++;
    }).catch(() => { inflight--; });
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

  return {
    unlock, attach, detach, settle,
    get ready() { return !!ctx && ctx.state === 'running'; },
    get attached() { return !!(machine && machine.alive); },
    get pulled() { return pulled; },
    get on() { return on; },
    setOn(v) { on = !!v; if (gain) gain.gain.value = on ? volume : 0; },
  };
}
