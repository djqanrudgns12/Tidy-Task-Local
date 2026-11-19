/** 모둠원 뽑기 하이브리드 2-버스 SFX 오디오 엔진(PRD §6).
 *  1) 마운트 직후 requestIdleCallback 으로 가공된 무음-컷 WAV(/audio/toolkit/group-picker/) 사전 패치.
 *  2) 첫 unlock() 시 병렬 decodeAudioData(buf.slice(0)); 미완료/실패 시 절차적 Web Audio 즉시 폴백.
 *  3) resume() 진행 중 ≤150ms 큐 대기열 + P0(클라이맥스 1슬롯 예약) / P1 / P2 우선순위 게이트.
 *  4) stageBus / uiBus 2-버스 + DynamicsCompressor + 빙하 6Hz 롤링 차임 + 무클릭 setTargetAtTime. */
import audioManifestJson from './audioManifest.json' with { type: 'json' };
import { volumeGain } from '../scores/audio.js';

export const AUDIO_MANIFEST = audioManifestJson.samples ?? {};

const MAX_VOICES = 4;
const RESERVED_P0_SLOTS = 1;
const MERGE_MS = 40;
const ROLLING_WINDOW_MS = 180; // 6Hz 상한(167~180ms)

/** 큐별 버스·우선순위·샘플 매핑 (PRD §6 기준). */
const CUE_SPEC = Object.freeze(/** @type {Record<string, { bus:'stage'|'ui', priority:0|1|2, fallbackMs:number, rolling?:boolean }>} */ ({
  trainArrive:       { bus: 'stage', priority: 1, fallbackMs: 320 },
  whistle:           { bus: 'stage', priority: 1, fallbackMs: 420 },
  chug:              { bus: 'stage', priority: 2, fallbackMs: 90 },
  doorSlide:         { bus: 'stage', priority: 1, fallbackMs: 140 },
  boardJump:         { bus: 'stage', priority: 2, fallbackMs: 120 },
  revealPop:         { bus: 'stage', priority: 1, fallbackMs: 130 },
  ticketPop:         { bus: 'stage', priority: 2, fallbackMs: 140, rolling: true },
  ticketLand:        { bus: 'stage', priority: 2, fallbackMs: 140, rolling: true },
  glacierRumble:     { bus: 'stage', priority: 1, fallbackMs: 280 },
  iceCrack:          { bus: 'stage', priority: 1, fallbackMs: 160 },
  glacierJump:       { bus: 'stage', priority: 0, fallbackMs: 240 },
  splashJump:        { bus: 'stage', priority: 0, fallbackMs: 240 },
  elevatorTick:      { bus: 'stage', priority: 1, fallbackMs: 65 },
  tick:              { bus: 'stage', priority: 2, fallbackMs: 55 },
  dingDong:          { bus: 'stage', priority: 1, fallbackMs: 360 },
  dingDongClimax:    { bus: 'stage', priority: 0, fallbackMs: 420 },
  suspenseHeartbeat: { bus: 'stage', priority: 0, fallbackMs: 460 },
  waitPop:           { bus: 'stage', priority: 0, fallbackMs: 260 },
  fanfare:           { bus: 'ui',    priority: 0, fallbackMs: 900 },
  swap:              { bus: 'ui',    priority: 1, fallbackMs: 90 },
  lock:              { bus: 'ui',    priority: 1, fallbackMs: 120 },
  error:             { bus: 'ui',    priority: 1, fallbackMs: 180 },
}));

/** 테스트 및 런타임 공용 3단계 우선순위 보이스 게이트.
 *  - P0 클라이맥스 전용 1슬롯 예약 (일반 P1/P2는 activeCount < 3 일 때만 진입)
 *  - P0 진입 시 꽉 찼으면 가장 오래된 P2(없으면 P1)를 25ms 페이드아웃 회수. */
export function createPriorityVoiceGate() {
  /** @type {Map<string, number>} */
  const lastByCue = new Map();
  /** @type {{ id:number, cue:string, priority:0|1|2, startedAt:number, endsAt:number, preempt?:()=>void }[]} */
  let active = [];
  let seq = 1;
  let rollingCombo = 0;
  let lastRollingAt = -Infinity;

  return {
    /** @param {string} cue @param {number} nowMs @param {number} lengthMs @param {0|1|2} priority @param {{rolling?:boolean, onPreempt?:()=>void}} [opt] */
    admit(cue, nowMs, lengthMs, priority, opt = {}) {
      active = active.filter((v) => v.endsAt > nowMs);

      if (opt.rolling && nowMs - lastRollingAt < ROLLING_WINDOW_MS) {
        // 빙하 확정 물결 폭주 억제: 180ms 미만 중복은 재생 추가 대신 다음 음 피치만 누적 (6Hz)
        rollingCombo = Math.min(8, rollingCombo + 1);
        return { allowed: false, rollingRate: 1 };
      }

      if (nowMs - (lastByCue.get(cue) ?? -Infinity) < MERGE_MS) {
        return { allowed: false, rollingRate: 1 };
      }

      if (priority > 0) {
        const cap = MAX_VOICES - RESERVED_P0_SLOTS;
        if (active.length >= cap) return { allowed: false, rollingRate: 1 };
      } else if (active.length >= MAX_VOICES) {
        // 가장 오래된 P2 먼저 회수, 없으면 가장 오래된 P1 회수
        const victimIdx = active.findIndex((v) => v.priority === 2);
        const fallbackIdx = victimIdx >= 0 ? victimIdx : active.findIndex((v) => v.priority === 1);
        if (fallbackIdx < 0) return { allowed: false, rollingRate: 1 };
        const [victim] = active.splice(fallbackIdx, 1);
        victim.preempt?.();
      }

      let rollingRate = 1;
      if (opt.rolling) {
        rollingCombo = nowMs - lastRollingAt < 450 ? Math.min(8, rollingCombo + 1) : 0;
        lastRollingAt = nowMs;
        rollingRate = 1 + rollingCombo * 0.055;
      }

      lastByCue.set(cue, nowMs);
      const handle = {
        id: seq++,
        cue,
        priority,
        startedAt: nowMs,
        endsAt: nowMs + lengthMs,
        preempt: opt.onPreempt,
      };
      active.push(handle);
      return { allowed: true, handleId: handle.id, rollingRate };
    },
    release(/** @type {number} */ id) {
      active = active.filter((v) => v.id !== id);
    },
    activeCount() {
      return active.length;
    },
  };
}

/** @param {()=>AudioContext} [createContext] */
export function createGroupPickerAudio(createContext = () => new AudioContext()) {
  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {GainNode|null} */ let master = null;
  /** @type {GainNode|null} */ let stageBus = null;
  /** @type {GainNode|null} */ let uiBus = null;
  /** @type {DynamicsCompressorNode|null} */ let compressor = null;
  /** @type {AudioBuffer|null} */ let noise = null;

  /** @type {Map<string, ArrayBuffer>} */ const rawBuffers = new Map();
  /** @type {Map<string, AudioBuffer>} */ const decodedBuffers = new Map();
  /** @type {Map<string, { cue:string, queuedAt:number, opt:any }>} */ const resumeQueue = new Map();
  /** @type {Set<{ src:AudioScheduledSourceNode, bus:'stage'|'ui', gain?:GainNode }>} */ const activeVoices = new Set();

  let enabled = true;
  let volume = 60; // 기본 볼륨 60 (교사 음성 60~65dBA 보호)
  let disposed = false;
  let prefetchStarted = false;
  let unlockingPromise = /** @type {Promise<boolean>|null} */ (null);
  let lastStageStopAt = 0;

  const gate = createPriorityVoiceGate();

  function syncMaster() {
    if (!master || !ctx) return;
    const t = ctx.currentTime;
    const target = enabled ? volumeGain(volume) : 0;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(target, t, 0.012);
  }

  /** 마운트 직후 유휴 시간에 11종 WAV ArrayBuffer 사전 패치(AudioContext 무생성). */
  function prefetchSamples() {
    if (prefetchStarted || disposed || typeof fetch !== 'function') return;
    prefetchStarted = true;
    const entries = Object.entries(AUDIO_MANIFEST);
    const loadAll = () => {
      for (const [id, meta] of entries) {
        if (!meta?.url || rawBuffers.has(id)) continue;
        fetch(meta.url)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((ab) => {
            if (ab && !disposed) rawBuffers.set(id, ab);
          })
          .catch(() => {});
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(loadAll, { timeout: 600 });
    else setTimeout(loadAll, 20);
  }

  async function decodeCachedWavs() {
    if (!ctx || disposed) return;
    const entries = Object.entries(AUDIO_MANIFEST);
    await Promise.all(
      entries.map(async ([id, meta]) => {
        if (decodedBuffers.has(id)) return;
        let raw = rawBuffers.get(id);
        if (!raw && typeof fetch === 'function' && meta?.url) {
          try {
            const res = await fetch(meta.url);
            if (res.ok) {
              raw = await res.arrayBuffer();
              rawBuffers.set(id, raw);
            }
          } catch {}
        }
        if (!raw || !ctx || disposed) return;
        try {
          const decoded = await ctx.decodeAudioData(raw.slice(0));
          if (!disposed) decodedBuffers.set(id, decoded);
        } catch {}
      }),
    );
  }

  async function unlock() {
    if (disposed || !enabled) return false;
    if (unlockingPromise) return unlockingPromise;
    unlockingPromise = (async () => {
      try {
        if (!ctx) {
          ctx = createContext();
          compressor = ctx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-18, ctx.currentTime);
          compressor.knee.setValueAtTime(6, ctx.currentTime);
          compressor.ratio.setValueAtTime(4, ctx.currentTime);
          compressor.attack.setValueAtTime(0.003, ctx.currentTime);
          compressor.release.setValueAtTime(0.12, ctx.currentTime);

          master = ctx.createGain();
          master.gain.setValueAtTime(enabled ? volumeGain(volume) : 0, ctx.currentTime);

          stageBus = ctx.createGain();
          stageBus.gain.setValueAtTime(1, ctx.currentTime);
          uiBus = ctx.createGain();
          uiBus.gain.setValueAtTime(1, ctx.currentTime);

          stageBus.connect(compressor);
          uiBus.connect(compressor);
          compressor.connect(master);
          master.connect(ctx.destination);

          noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          const ch = noise.getChannelData(0);
          for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        }

        if (ctx.state !== 'running') await ctx.resume();
        void decodeCachedWavs();

        // resume 대기 중 150ms 이내 도착한 큐 플러시
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const queued = [...resumeQueue.values()];
        resumeQueue.clear();
        for (const q of queued) {
          if (nowMs - q.queuedAt <= 150) play(q.cue, q.opt);
        }
        return ctx.state === 'running';
      } catch {
        return false;
      } finally {
        unlockingPromise = null;
      }
    })();
    return unlockingPromise;
  }

  /** @param {AudioScheduledSourceNode} src @param {AudioNode[]} chain @param {'stage'|'ui'} bus @param {number} startAt @param {number} stopAt @param {GainNode} [voiceGain] */
  function attach(src, chain, bus, startAt, stopAt, voiceGain) {
    if (!ctx || !stageBus || !uiBus) return;
    let node = /** @type {AudioNode} */ (src);
    for (const next of chain) {
      node.connect(next);
      node = next;
    }
    node.connect(bus === 'ui' ? uiBus : stageBus);
    const entry = { src, bus, gain: voiceGain };
    activeVoices.add(entry);
    src.onended = () => {
      activeVoices.delete(entry);
      src.disconnect();
      chain.forEach((n) => n.disconnect());
    };
    src.start(startAt);
    src.stop(stopAt);
  }

  /** @param {string} sampleId @param {'stage'|'ui'} bus @param {number} gainVal @param {number} rate @param {number} [delay] @param {GainNode[]} [outVoiceGains] */
  function playSample(sampleId, bus, gainVal = 1, rate = 1, delay = 0, outVoiceGains) {
    if (!ctx) return false;
    const buf = decodedBuffers.get(sampleId);
    if (!buf) return false;
    const t0 = Math.max(ctx.currentTime, ctx.currentTime + delay);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t0);
    outVoiceGains?.push(g);
    attach(src, [g], bus, t0, t0 + buf.duration / Math.max(0.25, rate) + 0.02, g);
    return true;
  }

  /** @param {number} f0 @param {number} f1 @param {'stage'|'ui'} bus @param {number} at @param {number} dur @param {number} peak @param {OscillatorType} [type] @param {GainNode[]} [outVoiceGains] */
  function tone(f0, f1, bus, at, dur, peak, type = 'sine', outVoiceGains) {
    if (!ctx || peak <= 0) return;
    const t0 = Math.max(ctx.currentTime, at);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur * 0.85);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.014, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    outVoiceGains?.push(g);
    attach(osc, [g], bus, t0, t0 + dur + 0.03, g);
  }

  /** @param {number} at @param {number} dur @param {number} freq @param {number} q @param {number} peak @param {'stage'|'ui'} [bus] @param {GainNode[]} [outVoiceGains] */
  function puff(at, dur, freq, q, peak, bus = 'stage', outVoiceGains) {
    if (!ctx || !noise || peak <= 0) return;
    const t0 = Math.max(ctx.currentTime, at);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.setValueAtTime(q, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    outVoiceGains?.push(g);
    attach(src, [filter, g], bus, t0, t0 + dur + 0.02, g);
  }

  /** @param {string} cue @param {{ pitchRate?: number, rolling?: boolean }} [opt] */
  function play(cue, opt = {}) {
    if (!enabled || disposed || (typeof document !== 'undefined' && document.hidden)) return;
    if (!ctx || ctx.state !== 'running') {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      resumeQueue.set(cue, { cue, queuedAt: nowMs, opt });
      void unlock();
      return;
    }

    const spec = CUE_SPEC[cue] ?? { bus: 'stage', priority: 2, fallbackMs: 150 };
    if (spec.bus === 'stage' && performance.now() - lastStageStopAt < 95) return;

    const sampleGateMs = (/** @type {string} */ name) =>
      /** @type {Record<string, any>} */ (AUDIO_MANIFEST)[name]?.gateMs ?? spec.fallbackMs;
    const estLen = cue === 'ticketPop' || cue === 'ticketLand'
      ? Math.min(sampleGateMs('soft-ding'), sampleGateMs('kalimba'))
      : spec.fallbackMs;

    /** @type {GainNode[]} */
    const voiceGains = [];
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const { allowed, rollingRate } = gate.admit(cue, nowMs, estLen, spec.priority, {
      rolling: Boolean(opt.rolling),
      onPreempt: () => {
        if (!ctx) return;
        const ct = ctx.currentTime;
        for (const vg of voiceGains) {
          try {
            vg.gain.cancelScheduledValues(ct);
            vg.gain.setValueAtTime(vg.gain.value, ct);
            vg.gain.linearRampToValueAtTime(0.0001, ct + 0.025);
          } catch {}
        }
      },
    });
    if (!allowed) return;

    const t = ctx.currentTime;
    const bus = spec.bus;
    const rate = opt.pitchRate ?? rollingRate ?? 1;

    switch (cue) {
      case 'trainArrive':
      case 'chug':
        if (!playSample('woodblock', bus, 0.72, cue === 'trainArrive' ? 0.92 : 1.04, 0, voiceGains)) {
          puff(t, 0.09, 650, 1.8, 0.08, bus, voiceGains);
        }
        if (cue === 'trainArrive') {
          playSample('woodblock', bus, 0.52, 0.98, 0.11, voiceGains);
        }
        break;
      case 'whistle':
        // C-E-G 하모닉 기적 + 부드러운 증기 퍼프
        tone(523.25, 534, bus, t, 0.28, 0.09, 'triangle', voiceGains);
        tone(659.25, 672, bus, t + 0.03, 0.28, 0.08, 'sine', voiceGains);
        tone(783.99, 792, bus, t + 0.08, 0.32, 0.07, 'sine', voiceGains);
        puff(t, 0.18, 920, 1.4, 0.04, bus, voiceGains);
        break;
      case 'doorSlide':
        playSample('soft-tap', bus, 0.65, 0.85, 0, voiceGains);
        puff(t, 0.22, 640, 1.4, 0.055, bus, voiceGains);
        break;
      case 'boardJump':
      case 'ticketPop':
      case 'ticketLand': {
        const hit = cue === 'boardJump'
          ? playSample('kalimba', bus, 0.75, 1.06 * rate, 0, voiceGains)
          : playSample('soft-ding', bus, 0.72, rate, 0, voiceGains);
        if (!hit) tone(523.25 * rate, 783.99 * rate, bus, t, 0.11, 0.12, 'sine', voiceGains);
        break;
      }
      case 'revealPop': {
        const hit = playSample('soft-ding', bus, 0.56, 1.32, 0, voiceGains);
        tone(hit ? 659.25 : 523.25, 987.77, bus, t, 0.085, hit ? 0.065 : 0.11, 'sine', voiceGains);
        break;
      }
      case 'glacierRumble':
        tone(95, 74, bus, t, 0.32, 0.13, 'triangle', voiceGains);
        puff(t, 0.24, 240, 1.8, 0.06, bus, voiceGains);
        break;
      case 'iceCrack':
        playSample('glass-tink', bus, 0.78, 0.82, 0, voiceGains);
        playSample('glass-tink', bus, 0.65, 1.15, 0.045, voiceGains);
        puff(t, 0.12, 2400, 3.0, 0.06, bus, voiceGains);
        break;
      case 'glacierJump':
      case 'splashJump':
        playSample('kalimba', bus, 0.82, 1.18, 0, voiceGains);
        playSample('glass-tink', bus, 0.65, 1.24, 0.07, voiceGains);
        break;
      case 'elevatorTick':
      case 'tick':
        if (!playSample('hurry-tick', bus, 0.68, 0.92, 0, voiceGains)) {
          tone(960, 720, bus, t, 0.045, 0.08, 'triangle', voiceGains);
        }
        break;
      case 'dingDong':
      case 'dingDongClimax':
        if (!playSample('doorbell', bus, 0.84, cue === 'dingDongClimax' ? 1.06 : 1.04, 0, voiceGains)) {
          tone(659.25, 659.25, bus, t, 0.22, 0.15, 'sine', voiceGains);
          tone(523.25, 523.25, bus, t + 0.18, 0.34, 0.14, 'sine', voiceGains);
        }
        break;
      case 'suspenseHeartbeat':
        if (!playSample('heartbeat', bus, 0.88, 1.0, 0, voiceGains)) {
          tone(78, 52, bus, t, 0.14, 0.18, 'sine', voiceGains);
          tone(74, 48, bus, t + 0.22, 0.16, 0.15, 'sine', voiceGains);
        }
        break;
      case 'waitPop':
        if (!playSample('music-box', bus, 0.82, 1.12, 0, voiceGains)) {
          tone(587.33, 880, bus, t, 0.1, 0.14, 'triangle', voiceGains);
          tone(880, 1046.5, bus, t + 0.09, 0.14, 0.12, 'sine', voiceGains);
        }
        break;
      case 'fanfare': {
        const s1 = playSample('xylophone-finish', bus, 0.85, 1.0, 0, voiceGains);
        const s2 = playSample('celebration', bus, 0.72, 1.0, 0.12, voiceGains);
        if (!s1 && !s2) {
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            tone(freq, freq, bus, t + i * 0.09, 0.42 - i * 0.04, 0.14, 'triangle', voiceGains);
          });
        }
        break;
      }
      case 'swap':
        if (!playSample('soft-tap', bus, 0.78, 1.15, 0, voiceGains)) {
          tone(440, 587.33, bus, t, 0.1, 0.11, 'sine', voiceGains);
        }
        break;
      case 'lock':
        tone(392, 523.25, bus, t, 0.09, 0.1, 'triangle', voiceGains);
        break;
      case 'error':
        tone(220, 145, bus, t, 0.15, 0.11, 'triangle', voiceGains);
        break;
      default:
        break;
    }
  }

  /** Skip 시 무대 버스(stageBus)만 15ms 시상수로 무클릭 페이드아웃 후 정지하고 uiBus(fanfare)는 보존합니다. */
  function stopStageAudio() {
    lastStageStopAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    resumeQueue.clear();
    if (!ctx || !stageBus) return;
    const t = ctx.currentTime;
    stageBus.gain.cancelScheduledValues(t);
    stageBus.gain.setTargetAtTime(0, t, 0.015);
    const toStop = [...activeVoices].filter((v) => v.bus === 'stage');
    setTimeout(() => {
      for (const v of toStop) {
        try { v.src.stop(); } catch {}
      }
      if (ctx && stageBus && !disposed) {
        const t2 = ctx.currentTime;
        stageBus.gain.cancelScheduledValues(t2);
        stageBus.gain.setValueAtTime(1, t2);
      }
    }, 85);
  }

  return {
    prefetchSamples,
    unlock,
    play,
    stopStageAudio,
    setEnabled(/** @type {boolean} */ v) {
      enabled = Boolean(v);
      syncMaster();
    },
    setVolume(/** @type {number} */ v) {
      volume = Math.max(0, Math.min(100, Number(v) || 0));
      syncMaster();
    },
    dispose() {
      disposed = true;
      activeVoices.forEach((v) => {
        try { v.src.stop(); } catch {}
      });
      activeVoices.clear();
      if (ctx) {
        void ctx.close().catch(() => {});
        ctx = null;
      }
    },
  };
}
