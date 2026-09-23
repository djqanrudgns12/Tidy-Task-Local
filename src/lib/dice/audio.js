/** 주사위 효과음 — 녹음 파일·네트워크 없이 그 자리에서 합성합니다.
 * 왜 AudioContext 시계로 예약하는가: setTimeout은 창이 바쁘면 밀려서 "톡"이 착지 장면과 어긋납니다. */
export function createDiceAudio() {
  /** @type {AudioContext|null} */ let ctx = null;
  let enabled = true;
  /** @type {Set<OscillatorNode>} */ const nodes = new Set();
  const stop = () => {
    for (const node of nodes) {
      try { node.stop(); } catch {}
    }
    nodes.clear();
  };
  /** @param {number} from @param {number} to @param {number} at @param {number} length @param {number} peak @param {OscillatorType} type */
  function tone(from, to, at, length, peak, type) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length * 0.7);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain);
    gain.connect(ctx.destination);
    nodes.add(osc);
    osc.onended = () => { nodes.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(at);
    osc.stop(at + length + 0.02);
  }
  return {
    /** @param {boolean} value */
    setEnabled(value) { enabled = value; if (!value) stop(); },
    /** 브라우저는 사용자가 누르기 전에는 소리를 막습니다. 던지기 클릭에서 풀어 둡니다. */
    async unlock() {
      try {
        ctx ??= new AudioContext();
        if (ctx.state !== 'running') await ctx.resume();
      } catch {}
    },
    /** @param {'land'|'total'|'triple'} cue @param {number} [afterMs] 지금부터 몇 ms 뒤에 낼지 */
    play(cue, afterMs = 0) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      const at = ctx.currentTime + Math.max(0, afterMs) / 1000;
      if (cue === 'land') {
        // 낮은 몸통 소리 + 짧고 높은 딸깍 — 나무 책상에 떨어지는 "톡"
        tone(320, 110, at, 0.09, 0.07, 'triangle');
        tone(1250, 700, at, 0.035, 0.022, 'sine');
        return;
      }
      // 합계 "딩"(두 음), 트리플은 세 음을 올려 더 반갑게 들리게 합니다.
      const notes = cue === 'triple' ? [660, 830, 990] : [660, 880];
      notes.forEach((f, i) => tone(f, f * 1.01, at + i * 0.085, 0.3, 0.05, 'sine'));
    },
    stop,
    dispose() {
      stop();
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
