// 한국 표준시(KST) 계산과 표기.
// 화면(디지털·아날로그)과 테스트가 같은 규칙을 쓰도록 순수 함수로만 둡니다.

/** 한국은 1988년 이후 서머타임이 없어 UTC+9 고정이 정확합니다.
 * 왜 Intl(timeZone: 'Asia/Seoul')을 쓰지 않는가: PC의 시간대 설정이나 브라우저 시간대 데이터에 기대지 않고,
 * 매초 불러도 가볍게 하려는 것입니다. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** @typedef {{year:number,month:number,day:number,weekday:number,hours:number,minutes:number,seconds:number,milliseconds:number}} ClockParts */

/**
 * 유닉스 ms → 한국 시각의 각 자리.
 * @param {number} epochMs
 * @returns {ClockParts}
 */
export function clockParts(epochMs) {
  if (!Number.isFinite(epochMs)) throw new TypeError('시각이 올바르지 않습니다.');
  // UTC 기준 함수(getUTC*)로 읽어야 PC 시간대가 섞이지 않습니다.
  const shifted = new Date(epochMs + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
    milliseconds: shifted.getUTCMilliseconds(),
  };
}

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** @typedef {[number|null, number]} DigitPair 앞자리가 null이면 비워 둡니다(12시간제의 한 자리 시). */

/**
 * 화면에 그릴 시각.
 * 12시간제: 자정 = 오전 12시, 정오 = 오후 12시 (Windows 작업 표시줄 한국어 표기와 같음).
 * @param {ClockParts} parts
 * @param {{hour12?:boolean, showSeconds?:boolean}} [options]
 */
export function displayTime(parts, { hour12 = true, showSeconds = true } = {}) {
  const meridiem = hour12 ? (parts.hours < 12 ? '오전' : '오후') : null;
  const hour = hour12 ? parts.hours % 12 || 12 : parts.hours;
  /** @type {DigitPair} */
  const hourDigits =
    // 12시간제의 한 자리 시는 앞자리를 비웁니다(전광판처럼 " 9:05"). 24시간제는 "09:05".
    hour12 && hour < 10 ? [null, hour] : [Math.floor(hour / 10), hour % 10];
  /** @type {[number, number]} */
  const minuteDigits = [Math.floor(parts.minutes / 10), parts.minutes % 10];
  /** @type {[number, number]|null} */
  const secondDigits = showSeconds ? [Math.floor(parts.seconds / 10), parts.seconds % 10] : null;
  const clock = `${hour12 ? hour : pad(hour)}:${pad(parts.minutes)}${showSeconds ? `:${pad(parts.seconds)}` : ''}`;
  return {
    meridiem,
    hourDigits,
    minuteDigits,
    secondDigits,
    /** 보조 표시·화면 읽기용 글자 ("오전 9:05:07", "21:05") */
    text: meridiem ? `${meridiem} ${clock}` : clock,
  };
}

/**
 * "9월 23일 수요일". 주말은 달력처럼 색을 달리하도록 표시를 함께 줍니다.
 * @param {ClockParts} parts
 */
export function displayDate(parts) {
  return {
    text: `${parts.month}월 ${parts.day}일 ${WEEKDAYS[parts.weekday]}`,
    monthDay: `${parts.month}월 ${parts.day}일`,
    weekday: WEEKDAYS[parts.weekday],
    weekend: parts.weekday === 0 ? 'sun' : parts.weekday === 6 ? 'sat' : null,
    /** 날짜가 바뀌었는지 비교하는 열쇠 */
    key: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * 아날로그 바늘 각도(12시 방향 0°, 시계 방향).
 * 시침은 분·초에 따라, 분침은 초에 따라 이어서 움직입니다. 실제 시계와 같아야 수업에서 배운 대로 읽힙니다.
 * @param {ClockParts} parts
 */
export function handAngles(parts) {
  return {
    hour: (parts.hours % 12) * 30 + parts.minutes * 0.5 + parts.seconds / 120,
    minute: parts.minutes * 6 + parts.seconds * 0.1,
    second: parts.seconds * 6,
  };
}

/**
 * 바늘의 누적 회전값. CSS 회전은 359° → 0°를 "거꾸로 한 바퀴"로 옮기므로 앞으로만 늘려 갑니다.
 * - 조금 앞으로(기본 45° 이하): 누적값에 더하고 부드럽게 움직입니다.
 * - 크게 건너뛰거나 뒤로 가면(표준시 보정·절전 복귀): 돌리지 않고 제자리로 옮깁니다. 바늘이 빙빙 도는 것을 막습니다.
 * @param {number|null|undefined} previous 이전 누적 회전값
 * @param {number} target 0~360 목표 각도
 * @param {number} [maxStep]
 * @returns {{rotation:number, animate:boolean}}
 */
export function nextRotation(previous, target, maxStep = 45) {
  const aim = ((target % 360) + 360) % 360;
  if (previous == null || !Number.isFinite(previous)) return { rotation: aim, animate: false };
  const current = ((previous % 360) + 360) % 360;
  const forward = (((aim - current) % 360) + 360) % 360;
  // 부동소수 오차로 생긴 아주 작은 차이는 "그대로"로 봅니다.
  if (forward < 1e-6 || 360 - forward < 1e-6) return { rotation: previous, animate: false };
  if (forward <= maxStep) return { rotation: previous + forward, animate: true };
  // 누적값이 끝없이 커지지 않도록 제자리로 옮길 때 0~360으로 되돌립니다.
  return { rotation: aim, animate: false };
}
