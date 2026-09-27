/** 점수판·학급 온도계 효과음 — 녹음 파일 없이 그 자리에서 합성합니다(주사위·토너먼트와 같은 방식).
 * 왜 합성인가: 라이선스 걱정이 없고, 누르는 순간 지연 없이 나며, 높이(음)를 연타에 맞춰 바꿀 수 있습니다.
 *
 * 규칙(PRD 11.1)
 *  - 같은 소리가 40ms 안에 또 오면 합칩니다(여러 카드를 한꺼번에 바꿔도 한 번만).
 *  - 동시에 최대 4개까지만 냅니다(연타해도 시끄럽게 쌓이지 않음).
 *  - 음량 슬라이더 v(0~100)는 (v/100)²로 바꿉니다. 사람 귀에 고르게 커지는 곡선입니다.
 *  - 부정(경고) 무드 소리는 낮고 짧게, 긍정보다 20% 작게 냅니다(격주지 않게). */

export const MERGE_MS = 40;
export const MAX_VOICES = 4;
export const COMBO_WINDOW_MS = 800;
export const COMBO_STEPS = 5;

/** @param {number} volume 0~100 */
export const volumeGain = (volume) => Math.max(0, Math.min(1, volume / 100)) ** 2;

/** 같은 소리 합치기 + 동시 발음 제한. 시각(ms)을 받아 판단만 하므로 테스트할 수 있습니다. */
export function createVoiceGate() {
  /** @type {Map<string, number>} */ const last = new Map();
  /** @type {number[]} */ let ends = [];
  return {
    /** @param {string} name @param {number} now @param {number} length 소리 길이(ms) */
    allow(name, now, length) {
      if (now - (last.get(name) ?? -Infinity) < MERGE_MS) return false;
      ends = ends.filter((end) => end > now);
      if (ends.length >= MAX_VOICES) return false;
      last.set(name, now);
      ends.push(now + length);
      return true;
    },
  };
}

/** 연타할수록 한 음씩 올라가는 "뽁" — 0.8초 안에 다시 누르면 다음 단계, 5단계에서 멈춥니다. */
export function createCombo() {
  let step = 0;
  let at = -Infinity;
  return {
    /** @param {number} now */
    next(now) {
      step = now - at <= COMBO_WINDOW_MS ? Math.min(COMBO_STEPS - 1, step + 1) : 0;
      at = now;
      return step;
    },
  };
}

// 소리마다 대략의 길이(ms). 동시 발음 계산에만 씁니다.
const LENGTH = /** @type {Record<string, number>} */ ({
  pop: 140, boop: 170, chord: 320, fanfare3: 520, rewind: 220, sweep: 420, tick: 40, toc: 90,
  bubble: 260, whistle: 280, chime3: 620, fanfare: 2000, ice: 420, thud: 120,
  heartbeat: 360, relief: 460, beepboop: 300, alarm: 1000, calmChime: 700, stamp: 260, stampBoard: 1400,
});

/** @param {()=>AudioContext} [createContext] */
export function createScoreAudio(createContext = () => new AudioContext()) {
  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {GainNode|null} */ let master = null;
  /** @type {AudioBuffer|null} */ let noise = null;
  let enabled = true;
  let volume = 70;
  let disposed = false;
  const gate = createVoiceGate();
  const combo = createCombo();
  /** @type {Set<AudioScheduledSourceNode>} */ const nodes = new Set();

  async function unlock() {
    if (disposed) return false;
    try {
      if (!ctx) {
        ctx = createContext();
        master = ctx.createGain();
        master.gain.value = volumeGain(volume);
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const ch = noise.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      }
      if (ctx.state !== 'running') await ctx.resume();
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  /** @param {AudioScheduledSourceNode} src @param {AudioNode[]} chain @param {number} at @param {number} end */
  function run(src, chain, at, end) {
    if (!ctx || !master) return;
    let node = /** @type {AudioNode} */ (src);
    for (const next of chain) {
      node.connect(next);
      node = next;
    }
    node.connect(master);
    nodes.add(src);
    src.onended = () => {
      nodes.delete(src);
      src.disconnect();
      chain.forEach((n) => n.disconnect());
    };
    src.start(at);
    src.stop(end);
  }

  /** 음 하나. @param {number} from @param {number} to @param {number} at 시작(초, ctx 기준) @param {number} len 초 @param {number} peak @param {OscillatorType} [type] */
  function tone(from, to, at, len, peak, type = 'sine') {
    if (!ctx || peak <= 0) return;
    at = Math.max(ctx.currentTime, at);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + len * 0.8);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + Math.min(0.012, len / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    run(osc, [gain], at, at + len + 0.03);
  }

  /** 종처럼 맑은 음(기음 + 배음). @param {number} f @param {number} at @param {number} len @param {number} peak */
  function bell(f, at, len, peak) {
    tone(f, f, at, len, peak, 'sine');
    tone(f * 2.01, f * 2.01, at, len * 0.6, peak * 0.28, 'sine');
    tone(f * 3.0, f * 3.0, at, len * 0.3, peak * 0.1, 'sine');
  }

  /** 걸러 낸 잡음. @param {number} at @param {number} len @param {number} peak @param {number} fromHz @param {number} toHz @param {BiquadFilterType} [type] */
  function hiss(at, len, peak, fromHz, toHz, type = 'bandpass') {
    if (!ctx || !noise || peak <= 0) return;
    at = Math.max(ctx.currentTime, at);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fromHz, at);
    filter.frequency.exponentialRampToValueAtTime(toHz, at + len);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + len * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    run(src, [filter, gain], at, at + len + 0.03);
  }

  const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568, B5 = 987.77, D6 = 1174.7;

  /** @type {Record<string, (t:number, o:{step:number})=>void>} */
  const VOICES = {
    // 점수판
    pop: (t, { step }) => { const f = 740 * 2 ** ((step * 2) / 12); tone(f, f * 1.5, t, 0.12, 0.34); },
    boop: (t) => tone(430, 290, t, 0.16, 0.28, 'triangle'),
    chord: (t) => { bell(C6, t, 0.3, 0.2); bell(E6, t + 0.05, 0.3, 0.18); },
    fanfare3: (t) => { tone(C5, C5, t, 0.1, 0.22, 'triangle'); tone(E5, E5, t + 0.1, 0.1, 0.22, 'triangle'); tone(G5, G5, t + 0.2, 0.1, 0.22, 'triangle'); bell(C6, t + 0.3, 0.22, 0.26); },
    rewind: (t) => { hiss(t, 0.18, 0.12, 3200, 600); tone(900, 420, t, 0.16, 0.14, 'triangle'); },
    sweep: (t) => hiss(t, 0.4, 0.16, 4200, 380),
    tick: (t) => tone(1800, 1600, t, 0.035, 0.12, 'square'),
    toc: (t) => tone(880, 620, t, 0.08, 0.18),
    // 온도계 — 긍정
    bubble: (t) => [520, 660, 840].forEach((f, i) => tone(f, f * 1.25, t + i * 0.06, 0.09, 0.22)),
    whistle: (t) => tone(880, 520, t, 0.26, 0.16),
    chime3: (t) => [E6, G6, C6 * 2].forEach((f, i) => bell(f, t + i * 0.12, 0.4, 0.2)),
    fanfare: (t) => {
      [C5, E5, G5].forEach((f, i) => tone(f, f, t + i * 0.12, 0.14, 0.22, 'triangle'));
      [C5, E5, G5, C6].forEach((f) => tone(f, f, t + 0.42, 1.5, 0.1, 'triangle'));
      bell(C6 * 2, t + 0.42, 1.2, 0.14);
    },
    ice: (t) => { bell(2400, t, 0.4, 0.12); bell(3000, t + 0.05, 0.3, 0.08); },
    thud: (t) => tone(180, 120, t, 0.1, 0.3, 'triangle'),
    // 온도계 — 부정(경고): 낮고 짧게
    heartbeat: (t) => { tone(95, 70, t, 0.12, 0.34, 'sine'); tone(90, 66, t + 0.17, 0.14, 0.26, 'sine'); },
    relief: (t) => { hiss(t, 0.45, 0.1, 1400, 260, 'lowpass'); tone(700, 420, t + 0.05, 0.36, 0.1); },
    beepboop: (t) => { tone(740, 740, t, 0.12, 0.14, 'triangle'); tone(560, 560, t + 0.15, 0.12, 0.14, 'triangle'); },
    alarm: (t) => { for (let i = 0; i < 4; i++) tone(i % 2 ? 560 : 740, i % 2 ? 560 : 740, t + i * 0.24, 0.2, 0.12, 'triangle'); },
    calmChime: (t) => [G5, B5, D6].forEach((f, i) => bell(f, t + i * 0.14, 0.45, 0.16)),
    // 도장
    stamp: (t) => { tone(160, 90, t, 0.12, 0.34, 'triangle'); tone(1200, 900, t + 0.02, 0.05, 0.08, 'square'); },
    stampBoard: (t) => { VOICES.stamp(t, { step: 0 }); VOICES.fanfare3(t + 0.25, { step: 0 }); VOICES.chime3(t + 0.8, { step: 0 }); },
  };
  // 경고 무드 소리는 긍정보다 20% 작게(격주지 않도록)
  const QUIET = new Set(['heartbeat', 'relief', 'beepboop', 'alarm', 'calmChime']);

  return {
    unlock,
    /** @param {string} name @param {{combo?:boolean}} [opts] */
    play(name, opts = {}) {
      const voice = VOICES[name];
      if (!enabled || disposed || !voice) return;
      const now = performance.now();
      if (!gate.allow(name, now, LENGTH[name] ?? 200)) return;
      const step = opts.combo ? combo.next(now) : 0;
      void unlock().then((ok) => {
        if (!ok || !ctx || !master) return;
        if (QUIET.has(name)) {
          // 무드별 크기 차이는 마스터가 아닌 이 소리에만 적용합니다.
          const scale = ctx.createGain();
          scale.gain.value = 0.8;
          const saved = master;
          scale.connect(saved);
          master = scale;
          voice(ctx.currentTime + 0.005, { step });
          master = saved;
          setTimeout(() => scale.disconnect(), (LENGTH[name] ?? 500) + 400);
        } else voice(ctx.currentTime + 0.005, { step });
      });
    },
    /** @param {boolean} value */
    setEnabled(value) {
      enabled = value;
      if (!value) this.stop();
    },
    /** @param {number} value 0~100 */
    setVolume(value) {
      volume = value;
      if (master && ctx) master.gain.setTargetAtTime(volumeGain(value), ctx.currentTime, 0.02);
    },
    stop() {
      for (const n of nodes) {
        try { n.stop(); } catch {}
      }
      nodes.clear();
    },
    dispose() {
      disposed = true;
      this.stop();
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
