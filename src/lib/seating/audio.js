// One quiet acoustic palette for the seating room: a soft wood-like tap and a
// filtered paper roll. The same timbre is pitched and timed for each action.
// No remote files, downloads, or different UI sound packs are mixed together.

/** @typedef {'rearrange'|'count'|'curtainDrop'|'curtainLift'|'revealed'|'lock'|'unlock'|'grow'|'shrink'|'choose'|'move'} SeatingCue */

/** @param {()=>AudioContext} [createContext] */
export function createSeatingAudio(createContext = () => new AudioContext()) {
  /** @type {AudioContext|null} */ let context = null;
  /** @type {GainNode|null} */ let master = null;
  /** @type {AudioBuffer|null} */ let noise = null;
  /** @type {Set<AudioScheduledSourceNode>} */ const playing = new Set();
  /** @type {Map<SeatingCue,number>} */ const lastPlayed = new Map();
  let enabled = true;
  let disposed = false;

  function unlock() {
    if (disposed) return false;
    try {
      if (!context) {
        context = createContext();
        master = context.createGain();
        master.gain.value = 0.24;
        master.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * 1.4), context.sampleRate);
        const samples = noise.getChannelData(0);
        let seed = 0x4d595df4;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = (seed / 0xffffffff) * 2 - 1;
        }
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
      return true;
    } catch { return false; }
  }

  /** @param {AudioScheduledSourceNode} source @param {AudioNode[]} chain @param {number} at @param {number} duration */
  function start(source, chain, at, duration) {
    if (!master) return;
    let tail = /** @type {AudioNode} */ (source);
    for (const node of chain) { tail.connect(node); tail = node; }
    tail.connect(master);
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
      for (const node of chain) node.disconnect();
    };
    source.start(at);
    source.stop(at + duration);
  }

  /** @param {number} frequency @param {number} at @param {number} length @param {number} loudness */
  function wood(frequency, at, length = 0.11, loudness = 0.22) {
    if (!context) return;
    for (const [multiple, level, decay] of [[1, 1, 1], [2.37, 0.24, 0.57]]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency * multiple, at);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * multiple * 0.94, at + length);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(loudness * level, at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length * decay);
      start(oscillator, [gain], at, length + 0.005);
    }
  }

  /** @param {number} at @param {number} length @param {number} low @param {number} high @param {number} loudness @param {number} [attack] */
  function paper(at, length, low, high, loudness, attack = 0.13) {
    if (!context || !noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(low, at);
    filter.frequency.exponentialRampToValueAtTime(high, at + length);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(loudness, at + length * attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    start(source, [filter, gain], at, length + 0.005);
  }

  /** @param {SeatingCue} cue @param {number} at @param {{step?:number}} options */
  function voice(cue, at, options) {
    switch (cue) {
      case 'rearrange': wood(330, at, 0.12, 0.23); break;
      case 'count': wood(420, at, 0.16, 0.24 + Math.max(0, Math.min(2, options.step ?? 0)) * 0.025); break;
      case 'curtainDrop': paper(at, 0.56, 1550, 700, 0.13); wood(240, at + 0.52, 0.09, 0.1); break;
      case 'curtainLift': paper(at + 0.14, 1.02, 620, 1400, 0.11, 0.28); break;
      case 'revealed': wood(620, at, 0.3, 0.2); break;
      case 'lock': wood(410, at, 0.075, 0.16); wood(310, at + 0.055, 0.11, 0.18); break;
      case 'unlock': wood(310, at, 0.075, 0.14); wood(410, at + 0.055, 0.1, 0.16); break;
      case 'grow': wood(445, at, 0.095, 0.16); break;
      case 'shrink': wood(350, at, 0.095, 0.16); break;
      case 'choose': wood(440, at, 0.085, 0.13); break;
      case 'move': wood(310, at, 0.11, 0.13); break;
    }
  }

  return {
    /** @param {SeatingCue} cue @param {{step?:number}} [options] */
    play(cue, options = {}) {
      if (!enabled || !unlock() || !context) return;
      const now = performance.now();
      if (now - (lastPlayed.get(cue) ?? -Infinity) < 45) return;
      lastPlayed.set(cue, now);
      voice(cue, context.currentTime + 0.003, options);
    },
    /** @param {boolean} value */
    setEnabled(value) { enabled = value; if (!value) this.stop(); },
    stop() {
      for (const source of playing) { try { source.stop(); } catch {} }
      playing.clear();
    },
    dispose() {
      disposed = true;
      this.stop();
      void context?.close().catch(() => {});
      context = null;
    },
  };
}
