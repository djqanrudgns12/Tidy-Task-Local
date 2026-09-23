// 표준시 맞춤: "표준시 − PC 시각"(보정값)을 받아 두고 지켜 내는 곳.
//
// 화면이 보여 주는 시각 = PC 시각 + 보정값. 표준시를 매초 받아 오지 않는 이유는, 그러면 인터넷이 끊기는 순간
// 시계가 멈추기 때문입니다. 받은 보정값은 아래 규칙으로 계속 믿을 만하게 지킵니다.
// - 1시간마다 다시 잽니다. 실패하면 30초 → 1분 → 2분 → 5분 → 10분 → 30분 간격으로 다시 시도합니다.
// - PC 시각이 바뀌면(Windows 자동 맞춤, 사용자가 변경) 1분 안에 알아채고, 바뀐 만큼 보정값에서 빼 화면을 이어 갑니다.
//   그래서 인터넷이 끊긴 상태에서 PC 시각이 바뀌어도 표준시가 흔들리지 않습니다.
// - 절전 복귀·오래 숨어 있던 창은 다시 잽니다.
// - 새 값이 지금 값과 측정 오차 안에서만 다르면 바꾸지 않습니다. 숫자가 오락가락하지 않게 하려는 것입니다.
import { clockParts, displayTime } from './clockTime.js';

export const RESYNC_MS = 60 * 60 * 1000;
export const RETRY_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000];
/** 자동으로 다시 잴 때의 최소 간격. 틱 이상이 연달아 와도 서버에 몰려 묻지 않게 합니다. */
export const MIN_GAP_MS = 10_000;
export const SKEW_POLL_MS = 60_000;
/** (PC 시각 − 부팅 후 경과 시간)이 이만큼 변하면 PC 시각이 바뀐 것으로 봅니다. */
export const WALL_STEP_MS = 300;
/** 마지막 확인이 이보다 오래되면 "n시간 전 확인"을 함께 보여 줍니다. */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
/** 한 곳의 답만으로는 믿지 않는 큰 차이(Rust clock_time.rs의 LARGE_OFFSET_MS와 같은 값). */
export const LARGE_OFFSET_MS = 12 * 60 * 60 * 1000;

/**
 * @typedef {{offsetMs:number, uncertaintyMs:number, source:'ntp'|'https'|'http', server:string, agreeing:number, responded:number, wallSkewMs?:number|null}} Measurement
 * @typedef {{enabled:boolean, checking:boolean, offsetMs:number, measurement:Measurement|null, checkedAt:number|null, error:string|null}} SyncState
 * `checkedAt`은 마지막으로 확인한 순간의 "표준시"입니다. PC 시각이 바뀌어도 경과 시간을 바르게 셀 수 있습니다.
 */

/** @param {unknown} value @returns {Measurement} */
export function validateMeasurement(value) {
  const m = /** @type {any} */ (value);
  if (
    !m ||
    !Number.isFinite(m.offsetMs) ||
    !Number.isFinite(m.uncertaintyMs) ||
    m.uncertaintyMs < 0 ||
    !['ntp', 'https', 'http'].includes(m.source)
  )
    throw new Error('측정 결과가 올바르지 않아요.');
  if (Math.abs(m.offsetMs) > LARGE_OFFSET_MS && !(m.agreeing >= 2))
    throw new Error('차이가 너무 커서 한 곳의 답만으로는 믿지 않아요.');
  return m;
}

/**
 * @param {{
 *   measure: () => Promise<unknown>,
 *   readSkew?: (() => Promise<number|null|undefined>) | null,
 *   wallNow?: () => number,
 *   monotonic?: () => number,
 *   setTimer?: (callback: () => void, ms: number) => unknown,
 *   clearTimer?: (id: any) => void,
 *   onChange?: (state: SyncState) => void,
 *   enabled?: boolean,
 * }} options
 * `readSkew`는 (PC 시각 − 부팅 후 경과 시간)을 돌려줍니다. 없으면(브라우저 미리보기) PC 시각 변경을 따로 구분하지 않습니다.
 */
export function createTimeSync({
  measure,
  readSkew = null,
  wallNow = () => Date.now(),
  monotonic = () => performance.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (id) => clearTimeout(id),
  onChange = () => {},
  enabled = true,
}) {
  let offsetMs = 0;
  /** @type {Measurement|null} */
  let measurement = null;
  /** @type {number|null} */
  let checkedAt = null;
  /** @type {string|null} */
  let error = null;
  let checking = false;
  let failures = 0;
  let lastAttempt = -Infinity;
  let stopped = true;
  /** @type {Promise<void>|null} */
  let inflight = null;
  /** @type {unknown} */
  let nextTimer = null;
  /** @type {unknown} */
  let pollTimer = null;
  /** @type {number|null} */
  let skewBaseline = null;
  /** @type {Promise<boolean>|null} */
  let stepCheck = null;
  // 측정마다 번호를 매겨, 끄기·다시 켜기 뒤에 늦게 도착한 옛 결과가 끼어들지 않게 합니다.
  let generation = 0;

  /** @returns {SyncState} */
  const snapshot = () => ({ enabled, checking, offsetMs, measurement, checkedAt, error });
  const notify = () => {
    try {
      onChange(snapshot());
    } catch {
      // 화면 쪽 오류가 측정 흐름을 멈추게 하지 않습니다.
    }
  };

  /** @param {number} ms */
  function schedule(ms) {
    if (nextTimer != null) clearTimer(nextTimer);
    nextTimer = stopped || !enabled ? null : setTimer(() => void sync('scheduled'), ms);
  }

  /** @param {Measurement} result */
  function accept(result) {
    // 측정 오차 안의 흔들림이면 지금 값을 그대로 둡니다.
    if (measurement == null || Math.abs(result.offsetMs - offsetMs) > result.uncertaintyMs)
      offsetMs = result.offsetMs;
    measurement = result;
    checkedAt = wallNow() + offsetMs;
    if (Number.isFinite(result.wallSkewMs)) skewBaseline = /** @type {number} */ (result.wallSkewMs);
  }

  /**
   * 표준시를 다시 잽니다.
   * @param {string} reason
   * @param {{force?: boolean}} [options] force: 최소 간격을 무시합니다(사용자가 눌렀을 때, PC 시각이 바뀌었을 때).
   */
  function sync(reason, { force = false } = {}) {
    if (stopped || !enabled) return Promise.resolve();
    if (inflight) return inflight;
    const sinceLast = monotonic() - lastAttempt;
    if (!force && sinceLast < MIN_GAP_MS) {
      schedule(MIN_GAP_MS - sinceLast);
      return Promise.resolve();
    }
    lastAttempt = monotonic();
    if (nextTimer != null) clearTimer(nextTimer);
    nextTimer = null;
    checking = true;
    notify();
    const run = generation;
    inflight = (async () => {
      try {
        const result = validateMeasurement(await measure());
        if (run !== generation) return;
        accept(result);
        failures = 0;
        error = null;
        schedule(RESYNC_MS);
      } catch (cause) {
        if (run !== generation) return;
        failures++;
        error = cause instanceof Error ? cause.message : String(cause || '표준시를 받아 오지 못했어요.');
        schedule(RETRY_MS[Math.min(failures, RETRY_MS.length) - 1]);
      } finally {
        if (run === generation) {
          checking = false;
          inflight = null;
          notify();
        }
      }
    })();
    return inflight;
  }

  /**
   * PC 시각이 바뀌었는지 확인하고, 바뀌었으면 보정값을 고쳐 화면을 이어 갑니다.
   * @returns {Promise<boolean>} 바뀌었으면 true
   */
  function checkWallStep() {
    if (!readSkew || stopped || !enabled) return Promise.resolve(false);
    if (stepCheck) return stepCheck;
    const reader = readSkew;
    const run = generation;
    stepCheck = (async () => {
      try {
        const skew = await reader();
        if (run !== generation || !Number.isFinite(skew)) return false;
        const current = /** @type {number} */ (skew);
        if (skewBaseline == null) {
          skewBaseline = current;
          return false;
        }
        const step = current - skewBaseline;
        skewBaseline = current;
        if (Math.abs(step) < WALL_STEP_MS) return false;
        // PC 시각이 step만큼 움직였어도 표준시는 그대로입니다. 보정값에서 빼면 화면 시각이 끊기지 않습니다.
        if (measurement) offsetMs -= step;
        notify();
        void sync('wall-step', { force: true });
        return true;
      } catch {
        return false;
      } finally {
        stepCheck = null;
      }
    })();
    return stepCheck;
  }

  function startPolling() {
    if (pollTimer != null) clearTimer(pollTimer);
    const poll = () => {
      pollTimer = stopped || !enabled ? null : setTimer(() => {
        void checkWallStep().finally(poll);
      }, SKEW_POLL_MS);
    };
    poll();
  }

  function stopTimers() {
    if (nextTimer != null) clearTimer(nextTimer);
    if (pollTimer != null) clearTimer(pollTimer);
    nextTimer = pollTimer = null;
  }

  function reset() {
    generation++;
    offsetMs = 0;
    measurement = null;
    checkedAt = null;
    error = null;
    checking = false;
    failures = 0;
    inflight = null;
    stepCheck = null;
    lastAttempt = -Infinity;
  }

  return {
    /** 화면에 보여 줄 시각(유닉스 ms). */
    now: () => wallNow() + offsetMs,
    snapshot,
    start() {
      if (!stopped) return;
      stopped = false;
      if (!enabled) {
        notify();
        return;
      }
      // 기준점을 먼저 잡아 두어야 첫 측정 전에 바뀐 PC 시각도 알아챕니다.
      void checkWallStep();
      startPolling();
      void sync('start', { force: true });
    },
    /** 사용자가 "다시 맞추기"를 눌렀을 때. */
    syncNow: () => sync('manual', { force: true }),
    /**
     * 시계 틱이 이상할 때(늦은 틱·PC 시각 점프). PC 시각이 바뀐 것인지 먼저 가리고, 아니면 다시 잽니다.
     * @param {string} reason
     */
    async disturbance(reason) {
      if (stopped || !enabled) return;
      const stepped = await checkWallStep();
      if (!stepped) await sync(reason);
    },
    /** @param {boolean} value */
    setEnabled(value) {
      if (value === enabled) return;
      enabled = value;
      stopTimers();
      reset();
      if (enabled && !stopped) {
        void checkWallStep();
        startPolling();
        void sync('enabled', { force: true });
      }
      notify();
    },
    stop() {
      stopped = true;
      stopTimers();
      // 진행 중이던 측정의 결과는 버립니다(다시 시작하면 새로 잽니다).
      generation++;
      inflight = null;
      stepCheck = null;
      checking = false;
    },
  };
}

/** @param {number} ms */
export function formatDuration(ms) {
  const abs = Math.abs(ms);
  if (abs < 10_000) return `${(Math.round(abs / 100) / 10).toFixed(1)}초`;
  const seconds = Math.round(abs / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes}분 ${seconds % 60}초` : `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}시간 ${minutes % 60}분` : `${hours}시간`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}일 ${hours % 24}시간` : `${days}일`;
}

/** @param {number} offsetMs 표준시 − PC 시각 */
export function describeDifference(offsetMs) {
  if (Math.abs(offsetMs) < 50) return 'PC 시각과 같아요';
  return `PC 시각이 ${formatDuration(offsetMs)} ${offsetMs > 0 ? '느려요' : '빨라요'}`;
}

/** @param {Measurement} measurement */
export function sourceName(measurement) {
  const server = measurement.server || '';
  const name = server.endsWith('kriss.re.kr')
    ? '한국표준과학연구원'
    : server === 'time.google.com'
      ? 'Google 시간 서버'
      : server === 'time.windows.com'
        ? 'Microsoft 시간 서버'
        : server.includes('cloudflare')
          ? 'Cloudflare 응답 시각'
          : 'Google 응답 시각';
  return measurement.source === 'http' ? `${name}(보안 연결 없이)` : name;
}

/**
 * 숫자판 구석의 출처 칩 문구.
 * @param {SyncState} state
 * @param {number} standardNow 지금 보여 주는 시각
 * @returns {{tone:'ok'|'stale'|'busy'|'local'|'off', label:string, detail:string}}
 */
export function describeSync(state, standardNow) {
  if (!state.enabled)
    return { tone: 'off', label: 'PC 시각', detail: '표준시 맞춤이 꺼져 있어 PC 시각을 그대로 보여 줘요.' };
  const m = state.measurement;
  if (!m) {
    if (state.checking)
      return { tone: 'busy', label: '표준시 확인 중', detail: '한국표준과학연구원 시간 서버에 묻고 있어요.' };
    return {
      tone: 'local',
      label: 'PC 시각',
      detail: '표준시를 받아 오지 못해 PC 시각을 보여 줘요. 인터넷 연결을 확인해 주세요. 누르면 다시 시도해요.',
    };
  }
  const age = state.checkedAt == null ? 0 : Math.max(0, standardNow - state.checkedAt);
  const stale = age >= STALE_AFTER_MS;
  const checked =
    state.checkedAt == null
      ? ''
      : ` · ${displayTime(clockParts(state.checkedAt), { hour12: true, showSeconds: false }).text} 확인`;
  return {
    tone: stale ? 'stale' : 'ok',
    label: stale ? `표준시 · ${formatDuration(age).replace(/ \d+(초|분)$/, '')} 전 확인` : '표준시',
    detail: `${describeDifference(state.offsetMs)} · ${sourceName(m)}${checked}${state.checking ? ' · 다시 맞추는 중' : ''}`,
  };
}
