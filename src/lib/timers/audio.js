// Long-lived AudioContext scheduling keeps tick/warning playback independent of UI frames.
/** @typedef {{url:string, minimumLoopSeconds?:number}} SoundFile */
const LEGACY_FILES = {
  tick: { url: '/audio/toolkit/tick.wav', minimumLoopSeconds: 1 },
  warning: { url: '/audio/toolkit/warning.wav', minimumLoopSeconds: 1 },
  end: { url: '/audio/toolkit/end.wav' },
};
/** @type {Record<string, Record<string, SoundFile>>} */
const PROFILES = {
  digital: {
    tick: { url: '/audio/toolkit/digital/tick-t01.wav' },
    warning: { url: '/audio/toolkit/digital/warning-w05-1s.wav' },
    end: { url: '/audio/toolkit/digital/end-e08.wav' },
  },
  analog: {
    tick: LEGACY_FILES.tick,
    warning: { url: '/audio/toolkit/analog/warning-w09.wav' },
    end: { url: '/audio/toolkit/analog/end-e09.wav' },
  },
  hourglass: {
    tick: { url: '/audio/toolkit/hourglass/tick-ht04.wav' },
    warning: { url: '/audio/toolkit/hourglass/warning-hw09.wav' },
    end: { url: '/audio/toolkit/hourglass/end-he09.wav' },
  },
  stopwatch: { tick: { url: '/audio/toolkit/stopwatch/tick-st04.wav' } },
};
/** @param {(message:string)=>void} [onError] @param {string} [kind] */
export function createTimerAudio(onError = () => {}, kind = 'digital') {
  const files = PROFILES[kind] || LEGACY_FILES;
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
      Object.entries(files).map(async ([name, file]) => {
        const response = await fetch(file.url);
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
    if (!(name in files) || !buffers[name]) return;
    const source = context.createBufferSource();
    const clip = buffers[name];
    const minimumLoopSeconds = files[name].minimumLoopSeconds;
    if (loop && minimumLoopSeconds && clip.duration < minimumLoopSeconds) {
      const frames = Math.ceil(minimumLoopSeconds * context.sampleRate);
      const padded = context.createBuffer(clip.numberOfChannels, frames, context.sampleRate);
      for (let channel = 0; channel < clip.numberOfChannels; channel++) {
        padded.copyToChannel(clip.getChannelData(channel), channel);
      }
      source.buffer = padded;
    } else source.buffer = clip;
    source.loop = loop;
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
    if ((await ready()) && context && name in files) {
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
