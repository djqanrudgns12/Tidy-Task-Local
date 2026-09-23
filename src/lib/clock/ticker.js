// 초가 바뀌는 순간에 맞춰 시계를 다시 그리는 예약기.
//
// 왜 setInterval(1000)을 쓰지 않는가: 조금씩 늦게 깨어난 만큼 밀림이 쌓이고, 밀리는 도중 초가 건너뛰거나 두 번 보입니다.
// 매 틱마다 "다음 초까지 남은 시간"을 새로 계산해 다시 예약하면 밀림이 쌓이지 않습니다.
// 매 틱마다 시각을 새로 읽으므로, 절전 복귀·PC 시각 변경 뒤에도 다음 틱에서 저절로 맞습니다.

/** 초 경계 바로 뒤에 깨도록 더하는 여유(ms). 타이머가 경계보다 조금 일찍 깨면 같은 초를 한 번 더 그리게 되기 때문입니다. */
export const BOUNDARY_LEAD_MS = 12;
/** 예약보다 이만큼 늦게 깨면 절전·창 숨김 억제 등이 있었다고 봅니다. */
export const LATE_TICK_MS = 2000;
/** 두 틱 사이에 (PC 시각 − 단조 시계)가 이만큼 변하면 PC 시각이 바뀌었을 수 있습니다. */
export const WALL_JUMP_MS = 300;

/**
 * @param {number} epochMs 지금 보여 줄 시각
 * @param {number} [lead]
 */
export function delayToNextSecond(epochMs, lead = BOUNDARY_LEAD_MS) {
  const intoSecond = ((epochMs % 1000) + 1000) % 1000;
  return 1000 - intoSecond + lead;
}

/**
 * @typedef {'late'|'wall-jump'} Disturbance
 * @param {{
 *   now: () => number,
 *   onTick: (epochMs: number) => void,
 *   onDisturbance?: (reason: Disturbance, amountMs: number) => void,
 *   onError?: (error: unknown) => void,
 *   wallNow?: () => number,
 *   monotonic?: () => number,
 *   setTimer?: (callback: () => void, ms: number) => unknown,
 *   clearTimer?: (id: any) => void,
 * }} options
 * `now`는 화면에 보여 줄 시각(표준시 보정 포함), `wallNow`는 PC 시각, `monotonic`은 되돌아가지 않는 시계입니다.
 */
export function createTicker({
  now,
  onTick,
  onDisturbance = () => {},
  onError = () => {},
  wallNow = () => Date.now(),
  monotonic = () => performance.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  /** @type {unknown} */
  let timer = null;
  /** @type {number|null} */
  let expectedAt = null;
  /** @type {number|null} */
  let lastSkew = null;
  let running = false;

  function tick() {
    timer = null;
    if (!running) return;
    const mono = monotonic();
    let shown = NaN;
    try {
      if (expectedAt != null && mono - expectedAt > LATE_TICK_MS)
        onDisturbance('late', mono - expectedAt);
      const skew = wallNow() - mono;
      if (lastSkew != null && Math.abs(skew - lastSkew) > WALL_JUMP_MS)
        onDisturbance('wall-jump', skew - lastSkew);
      lastSkew = skew;
      shown = now();
      onTick(shown);
    } catch (error) {
      onError(error);
    } finally {
      // 그리기에서 오류가 나도 다음 틱은 반드시 예약합니다. 시계가 멈추는 것이 가장 나쁜 실패입니다.
      if (running) {
        const delay = delayToNextSecond(Number.isFinite(shown) ? shown : wallNow());
        expectedAt = mono + delay;
        timer = setTimer(tick, delay);
      }
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick();
    },
    /** 지금 바로 다시 그리고 초 경계에 다시 맞춥니다(창이 다시 보일 때, 보정값이 바뀌었을 때). */
    refresh() {
      if (!running) return;
      if (timer != null) clearTimer(timer);
      // 기다리던 틱을 취소했으므로 "늦은 틱"으로 잘못 보지 않게 합니다.
      expectedAt = null;
      tick();
    },
    stop() {
      running = false;
      if (timer != null) clearTimer(timer);
      timer = null;
    },
  };
}
