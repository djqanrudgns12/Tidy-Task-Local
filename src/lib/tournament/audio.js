// Original synthesized brass fanfare. No remote assets or playback permission
// requests: unlock runs directly inside the user's click, before saving results.
export const REVEAL_DELAY_MS = 1900;
export const CELEBRATION_END_MS = 6500;

/** @param {()=>AudioContext} [createContext] */
export function createTournamentAudio(
  createContext = () => new AudioContext(),
) {
  /** @type {AudioContext|null} */ let context = null;
  /** @type {GainNode|null} */ let master = null;
  /** @type {AudioScheduledSourceNode[]} */ let sources = [];
  /** @type {AudioNode[]} */ let tails = [];
  /** @type {AudioScheduledSourceNode[]} */ let cueSources = [];
  /** @type {AudioNode[]} */ let cueNodes = [];
  let disposed = false;
  async function unlock() {
    if (disposed) return false;
    try {
      context ??= createContext();
      if (context.state !== "running") await context.resume();
      return context.state === "running";
    } catch {
      return false;
    }
  }
  function stopFanfare() {
    if (context && master) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0, context.currentTime, 0.015);
    }
    for (const source of sources) {
      try {
        source.stop();
      } catch {}
    }
    sources = [];
    for (const node of tails) node.disconnect();
    tails = [];
    master?.disconnect();
    master = null;
  }
  function stopCue() {
    for (const source of cueSources) {
      try {
        source.stop();
      } catch {}
    }
    cueSources = [];
    for (const node of cueNodes) node.disconnect();
    cueNodes = [];
  }
  function stop() {
    stopFanfare();
    stopCue();
  }

  /**
   * A short, original classroom-friendly mallet cue.
   * @param {'select'|'cancel'} [kind]
   */
  function playSelection(kind = "select") {
    stopCue();
    if (!context || context.state !== "running" || disposed) return false;
    const activeContext = context;
    const start = activeContext.currentTime + 0.008;
    const output = activeContext.createGain();
    const filter = activeContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5200;
    output.gain.value = 0.34;
    filter.connect(output);
    output.connect(activeContext.destination);
    cueNodes = [filter, output];
    const notes = kind === "cancel" ? [659.25, 523.25] : [659.25, 987.77];
    notes.forEach((frequency, index) => {
      const at = start + index * 0.075;
      const gain = activeContext.createGain();
      const osc = activeContext.createOscillator();
      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(
        index === 0 ? 0.38 : 0.28,
        at + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(at);
      osc.stop(at + 0.2);
      cueSources.push(osc);
      cueNodes.push(gain);
    });
    return true;
  }
  /** @param {number} frequency @param {number} at @param {number} duration @param {number} volume */
  function brass(frequency, at, duration, volume) {
    if (!context || !master) return;
    const gain = context.createGain(),
      filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(950, at);
    filter.frequency.exponentialRampToValueAtTime(3800, at + 0.055);
    filter.frequency.exponentialRampToValueAtTime(1700, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.035);
    gain.gain.setValueAtTime(volume * 0.8, at + duration * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.2);
    filter.connect(gain);
    gain.connect(master);
    for (const detune of [-5, 5]) {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + duration + 0.22);
      sources.push(osc);
    }
  }
  /** @param {number} at @param {number} duration @param {number} volume @param {boolean} [crash] */
  function percussion(at, duration, volume, crash = false) {
    if (!context || !master) return;
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * duration),
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    noise.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = crash ? 4300 : 1300;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start(at);
    noise.stop(at + duration);
    sources.push(noise);
    if (!crash) {
      const drum = context.createOscillator(),
        body = context.createGain();
      drum.frequency.setValueAtTime(165, at);
      drum.frequency.exponentialRampToValueAtTime(65, at + 0.12);
      body.gain.setValueAtTime(volume * 0.8, at);
      body.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      drum.connect(body);
      body.connect(master);
      drum.start(at);
      drum.stop(at + 0.18);
      sources.push(drum);
    }
  }
  /** @param {boolean} [short] */
  function play(short = false) {
    stopFanfare();
    if (!context || context.state !== "running" || disposed) return false;
    master = context.createGain();
    master.gain.value = 0.56;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    master.connect(compressor);
    compressor.connect(context.destination);
    // A little room echo gives the horns a stage without obscuring the melody.
    const delay = context.createDelay(0.5),
      echo = context.createGain();
    delay.delayTime.value = 0.13;
    echo.gain.value = 0.17;
    master.connect(delay);
    delay.connect(echo);
    echo.connect(compressor);
    tails = [delay, echo, compressor];
    const start = context.currentTime + 0.025;
    const reveal = start + (short ? 0 : REVEAL_DELAY_MS / 1000);
    if (!short)
      for (let i = 0; i < 22; i++)
        percussion(start + i * 0.08, 0.14, 0.045 + i * 0.004);
    // Ta-ta-ta TAA! Rising trumpet motif, warm C-major chord and cymbal burst.
    const notes = [
      [0, 523.25, 0.16],
      [0.2, 523.25, 0.16],
      [0.4, 523.25, 0.16],
      [0.64, 783.99, 0.45],
      [1.18, 659.25, 0.21],
      [1.46, 783.99, 0.22],
      [1.78, 1046.5, 1.35],
    ];
    for (const [offset, frequency, duration] of notes)
      brass(frequency, reveal + offset, duration, 0.09);
    for (const offset of [0, 0.64, 1.78]) {
      percussion(reveal + offset, 0.22, 0.24);
      percussion(reveal + offset, offset === 1.78 ? 1.8 : 0.65, 0.26, true);
      for (const frequency of [130.81, 261.63, 329.63, 392])
        brass(frequency, reveal + offset, offset === 1.78 ? 1.6 : 0.42, 0.026);
    }
    return true;
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    const old = context;
    context = null;
    await old?.close();
  }
  return { unlock, play, playSelection, stop, dispose };
}
