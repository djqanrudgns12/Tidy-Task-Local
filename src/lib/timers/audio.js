// Long-lived AudioContext scheduling keeps tick/warning playback independent of UI frames.
const FILES = {
  tick: '/audio/toolkit/tick.wav',
  warning: '/audio/toolkit/warning.wav',
  end: '/audio/toolkit/end.wav',
};
/** @param {(message:string)=>void} [onError] */
export function createTimerAudio(onError = () => {}) {
  /** @type {AudioContext|undefined} */ let context;
  /** @type {Record<string,AudioBuffer>|undefined} */ let buffers;
  /** @type {Promise<void>|null} */ let loading = null;
  let disposed = false;
  const sources = new Set(/** @type {AudioBufferSourceNode[]} */ ([]));
  async function ready() {
    if (disposed) return false;
    context ||= new AudioContext();
    const ctx = context;
    const resumed = ctx.resume();
    loading ||= Promise.all(
      Object.entries(FILES).map(async ([name, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('효과음 파일을 불러오지 못했어요.');
        return [name, await ctx.decodeAudioData(await response.arrayBuffer())];
      }),
    )
      .then((entries) => {
        buffers = Object.fromEntries(entries);
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
    try {
      await Promise.all([resumed, loading]);
      return !disposed;
    } catch {
      onError('소리를 재생하지 못했어요. 미리 듣기로 다시 시도해 주세요.');
      return false;
    }
  }
  function stopAll() {
    for (const source of sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    sources.clear();
  }
  /** @param {string} name @param {number} when @param {number|null} [duration] @param {boolean} [loop] */
  function play(name, when, duration = null, loop = false) {
    if (!context || !buffers || disposed) return;
    const source = context.createBufferSource();
    if (loop) {
      const clip = buffers[name],
        frames = context.sampleRate;
      const padded = context.createBuffer(1, frames, context.sampleRate);
      padded.copyToChannel(clip.getChannelData(0).subarray(0, frames), 0);
      source.buffer = padded;
      source.loop = true;
    } else source.buffer = buffers[name];
    source.connect(context.destination);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
    };
    source.start(when);
    if (duration != null) source.stop(when + Math.max(0.001, duration));
  }
  /** @param {import("./alarmPlan.js").AlarmPlan|null} plan */
  function schedule(plan) {
    stopAll();
    if (!plan || !context || !buffers || disposed) return;
    const now = context.currentTime + 0.01;
    if (plan.tick) play('tick', now, plan.endIn, true);
    if (plan.warningIn != null) play('warning', now + plan.warningIn, plan.warningFor, true);
    if (plan.end && plan.endIn != null) play('end', now + plan.endIn);
  }
  /** @param {string} name */
  async function preview(name) {
    if ((await ready()) && context && name in FILES) {
      stopAll();
      play(name, context.currentTime);
    }
  }
  function dispose() {
    disposed = true;
    stopAll();
    void context?.close();
  }
  return { ready, schedule, stopAll, preview, dispose };
}
