export const SOUNDS = Object.freeze([
  { id: 'bell', label: '종소리', description: '맑고 힘차게, 딸랑!', url: '/audio/toolkit/focus-bell/bell.wav', gain: 1 },
  { id: 'bomb', label: '폭탄', description: '한 번에 시선 집중!', url: '/audio/toolkit/focus-bell/bomb.wav', gain: 1 },
  { id: 'fart', label: '방구', description: '웃으며 집중해요', url: '/audio/toolkit/focus-bell/fart.wav', gain: 1 },
  { id: 'siren', label: '사이렌', description: '삐뽀삐뽀, 여기 봐요!', url: '/audio/toolkit/focus-bell/siren.wav', gain: 1 },
]);

/** @param {unknown} value */
export function normalizeVolume(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 40;
}

/**
 * Each click owns a generation. A stopped/superseded decode must never start playback.
 * @param {(state: {status:string, id?:string, duration?:number})=>void} notify
 * @param {{context?:()=>AudioContext, fetch?:typeof fetch}} [dependencies]
 */
export function createFocusAudio(notify, dependencies = {}) {
  /** @type {AudioContext|undefined} */ let context;
  /** @type {GainNode|undefined} */ let gain;
  /** @type {AudioBufferSourceNode|undefined} */ let active;
  const buffers = new Map();
  let generation = 0, disposed = false, volume = 40, muted = false, clipGain = 1;
  function release() {
    if (active) {
      active.onended = null;
      try { active.stop(); } catch { /* Source may already have ended. */ }
      active.disconnect(); active = undefined;
    }
  }
  function stop() {
    generation++; release();
    if (!disposed) notify({ status: 'idle' });
  }
  function updateGain() {
    if (!gain || !context) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(muted ? 0 : volume / 100 * clipGain, context.currentTime, .008);
  }
  /** @param {number} nextVolume @param {boolean} nextMuted */
  function setVolume(nextVolume, nextMuted) {
    volume = normalizeVolume(nextVolume); muted = nextMuted; updateGain();
  }
  /** @param {string} id */
  async function play(id) {
    if (disposed) return;
    const sound = SOUNDS.find(s => s.id === id);
    if (!sound) return;
    stop(); const ticket = generation;
    notify({ status: 'loading', id });
    try {
      context ||= (dependencies.context || (() => new AudioContext()))();
      const ctx = context;
      if (!gain) { gain = ctx.createGain(); gain.connect(ctx.destination); }
      clipGain = sound.gain;
      gain.gain.setValueAtTime(muted ? 0 : volume / 100 * clipGain, ctx.currentTime);
      // resume() is invoked directly during the user's click, before awaiting decoding.
      const resume = ctx.resume();
      if (!buffers.has(id)) {
        const promise = (dependencies.fetch || fetch)(sound.url)
          .then(r => { if (!r.ok) throw Error('Audio unavailable'); return r.arrayBuffer(); })
          .then(bytes => ctx.decodeAudioData(bytes))
          .catch(error => { buffers.delete(id); throw error; });
        buffers.set(id, promise);
      }
      const [, buffer] = await Promise.all([resume, buffers.get(id)]);
      if (disposed || ticket !== generation) return;
      const node = ctx.createBufferSource();
      active = node; node.buffer = buffer; node.connect(gain);
      node.onended = () => {
        node.disconnect();
        if (!disposed && ticket === generation) { active = undefined; notify({ status: 'idle' }); }
      };
      node.start();
      notify({ status: 'playing', id, duration: buffer.duration });
    } catch {
      if (!disposed && ticket === generation) { release(); notify({ status: 'error', id }); }
    }
  }
  function dispose() {
    disposed = true; generation++; release(); buffers.clear();
    gain?.disconnect(); void context?.close().catch(() => {});
  }
  return { play, stop, setVolume, dispose };
}
