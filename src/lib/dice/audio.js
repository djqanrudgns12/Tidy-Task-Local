/** 주사위 효과음 — 녹음 파일·네트워크 없이 그 자리에서 합성합니다.
 * 왜 AudioContext 시계로 예약하는가: setTimeout은 창이 바쁘면 밀려서 "톡"이 착지 장면과 어긋납니다.
 *
 * 소리 종류
 *  - throw: 던지는 순간. 손 안에서 주사위끼리 부딪히는 "달그락" 몇 번 + 손을 떠나는 "휙". 착지 소리와 섞여도 구별되도록
 *           높고 짧은 딸깍과 부드러운 바람 소리로 만듭니다.
 *  - land:  바닥에 부딪힐 때. 세기(0~1)가 작을수록 작고 조금 높게 — 첫 착지 "톡!", 튈 때 "톡", 구를 때 "딱".
 *  - total / triple: 합계가 나올 때 "딩". */
export function createDiceAudio() {
  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {AudioBuffer|null} */ let noise = null;
  let enabled = true;
  /** @type {Set<AudioScheduledSourceNode>} */ const nodes = new Set();
  const stop = () => {
    for (const node of nodes) {
      try { node.stop(); } catch {}
    }
    nodes.clear();
  };

  /** @param {AudioScheduledSourceNode} source @param {AudioNode[]} chain @param {number} at @param {number} end */
  function start(source, chain, at, end) {
    if (!ctx) return;
    let node = /** @type {AudioNode} */ (source);
    for (const next of chain) {
      node.connect(next);
      node = next;
    }
    node.connect(ctx.destination);
    nodes.add(source);
    source.onended = () => {
      nodes.delete(source);
      source.disconnect();
      for (const next of chain) next.disconnect();
    };
    source.start(at);
    source.stop(end);
  }

  /** @param {number} from @param {number} to @param {number} at @param {number} length @param {number} peak @param {OscillatorType} type */
  function tone(from, to, at, length, peak, type) {
    if (!ctx || peak <= 0) return;
    at = Math.max(ctx.currentTime, at); // 과거 시각을 예약하면 예외가 나서 뒤따르는 소리까지 모두 빠집니다.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length * 0.7);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    start(osc, [gain], at, at + length + 0.02);
  }

  /** 걸러 낸 잡음 한 토막. 딸깍(짧고 좁은 대역)과 바람(길고 주파수가 올라가는 대역) 모두 이것으로 만듭니다.
   * @param {number} at @param {number} length @param {number} peak @param {number} fromHz @param {number} toHz @param {number} q @param {number} attack */
  function hiss(at, length, peak, fromHz, toHz, q, attack) {
    if (!ctx || !noise || peak <= 0) return;
    at = Math.max(ctx.currentTime, at);
    const source = ctx.createBufferSource();
    source.buffer = noise;
    // 같은 잡음 조각이 반복되면 귀에 걸리므로 시작 위치를 흩뜨립니다.
    const offset = Math.random() * Math.max(0, noise.duration - length - 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(fromHz, at);
    filter.frequency.exponentialRampToValueAtTime(toHz, at + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    nodes.add(source);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      nodes.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(at, offset);
    source.stop(at + length + 0.02);
  }

  /** @param {number} at */
  function playThrow(at) {
    // 달그락: 불규칙한 간격의 높은 딸깍 4번(손 안에서 흔들림). 마지막 휙은 주사위가 뜨는 순간(움츠림 0.11초 뒤)에 맞춥니다.
    const clicks = [0, 0.027, 0.058, 0.084];
    clicks.forEach((offset, i) => {
      const jitter = Math.random() * 0.008;
      const pitch = 2300 + Math.random() * 900;
      hiss(at + offset + jitter, 0.028, 0.05 - i * 0.006, pitch, pitch * 0.8, 4, 0.001);
      tone(pitch * 0.62, pitch * 0.5, at + offset + jitter, 0.022, 0.006, 'triangle');
    });
    hiss(at + 0.09, 0.26, 0.05, 420, 1900, 0.9, 0.07);
  }

  /** @param {number} at @param {number} strength */
  function playLand(at, strength) {
    const s = Math.min(1, Math.max(0.1, strength));
    // 세게 부딪힐수록 낮고 크게, 살살 구를수록 짧고 높게 — 나무 책상에 떨어지는 소리
    const lift = 1 + 0.35 * (1 - s);
    tone(320 * lift, 110 * lift, at, 0.05 + 0.04 * s, 0.075 * s, 'triangle');
    tone(1250 * lift, 700 * lift, at, 0.035, 0.022 * (0.4 + 0.6 * s), 'sine');
    hiss(at, 0.018 + 0.012 * s, 0.035 * s, 1900 * lift, 1300 * lift, 2.5, 0.0015);
  }

  return {
    /** @param {boolean} value */
    setEnabled(value) { enabled = value; if (!value) stop(); },
    /** 브라우저는 사용자가 누르기 전에는 소리를 막습니다. 던지기 클릭에서 풀어 둡니다. */
    async unlock() {
      try {
        ctx ??= new AudioContext();
        if (!noise) {
          noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.6), ctx.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        if (ctx.state !== 'running') await ctx.resume();
      } catch {}
    },
    /** @param {'throw'|'land'|'total'|'triple'} cue @param {number} [afterMs] 지금부터 몇 ms 뒤에 낼지 @param {number} [strength] 착지 세기 0~1 */
    play(cue, afterMs = 0, strength = 1) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      const at = ctx.currentTime + Math.max(0, afterMs) / 1000;
      if (cue === 'throw') return playThrow(at);
      if (cue === 'land') return playLand(at, strength);
      // 합계 "딩"(두 음), 트리플은 세 음을 올려 더 반갑게 들리게 합니다.
      const notes = cue === 'triple' ? [660, 830, 990] : [660, 880];
      notes.forEach((f, i) => tone(f, f * 1.01, at + i * 0.085, 0.3, 0.05, 'sine'));
    },
    stop,
    dispose() {
      stop();
      void ctx?.close().catch(() => {});
      ctx = null;
      noise = null;
    },
  };
}
