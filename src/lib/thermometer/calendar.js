/** 날짜 계산(자동 식힘·기한·기록). 날짜는 PC 현지 날짜의 'YYYY-MM-DD' 문자열로만 다룹니다.
 * 왜 문자열인가: 시간대·서머타임과 무관하게 "하루"를 셀 수 있고, 저장 파일에도 그대로 들어갑니다. */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** @param {Date} [d] */
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
/** @param {string} key @returns {Date} 그날 정오(현지) — 날짜 더하기가 서머타임에 흔들리지 않게 */
const noon = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
/** @param {unknown} key */
export const isDateKey = (key) => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(noon(key)) === key;
/** @param {string} key @param {number} days */
export function addDays(key, days) {
  const d = noon(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
/** 0=일 … 6=토 @param {string} key */
export const weekday = (key) => noon(key).getDay();
/** @param {string} a @param {string} b @returns {number} b - a (일) */
export const daysBetween = (a, b) => Math.round((noon(b).getTime() - noon(a).getTime()) / 86400000);

/** from 다음 날부터 to까지(포함) 센 날 수. weekdaysOnly면 월~금만.
 * @param {string} from @param {string} to @param {boolean} weekdaysOnly */
export function schoolDaysBetween(from, to, weekdaysOnly) {
  const total = daysBetween(from, to);
  if (total <= 0) return 0;
  if (!weekdaysOnly) return total;
  let count = 0;
  // 몇 년씩 꺼져 있었어도 느리지 않게 400일까지만 셉니다(그 이상은 어차피 0까지 식음).
  for (let i = 1; i <= Math.min(total, 400); i++) {
    const w = weekday(addDays(from, i));
    if (w !== 0 && w !== 6) count++;
  }
  return count;
}

/** from 다음 날부터 to까지 사이에 월요일이 있었는지 @param {string} from @param {string} to */
export function mondayPassed(from, to) {
  const total = daysBetween(from, to);
  if (total <= 0) return false;
  return total >= 7 || Array.from({ length: total }, (_, i) => weekday(addDays(from, i + 1))).includes(1);
}

/** 이번 주 월요일 @param {string} key */
export const weekStart = (key) => addDays(key, -((weekday(key) + 6) % 7));

/** 기한 빠른 칩: 오늘이 금요일이면 "이번 주 금요일" = 오늘, 토·일이면 다음 금요일.
 * @param {string} today */
export function deadlineChips(today) {
  const w = weekday(today);
  const thisFriday = addDays(today, (5 - w + 7) % 7);
  return [
    { id: 'this-friday', label: '이번 주 금요일', date: thisFriday },
    { id: 'next-friday', label: '다음 주 금요일', date: addDays(thisFriday, 7) },
    { id: 'two-weeks', label: '2주 뒤', date: addDays(today, 14) },
  ];
}

/** "금요일(9/26)까지 · 2일 남음". 결과가 났으면 결과를, 부정 무드면 "버티기"로 말합니다.
 * 왜 여기서 한꺼번에: 결과가 난 뒤에도 "기한이 지났어요"·"버티기 · 1일 남음"처럼 사실과 다른 문구가 남지 않게,
 * 기한 문구의 모든 경우를 한 곳에서 정합니다.
 * @param {string} deadline @param {string} today
 * @param {{mood?:'positive'|'negative', outcome?:null|'met'|'missed'|'kept'|'ended'}} [o] */
export function deadlineText(deadline, today, { mood = 'positive', outcome = null } = {}) {
  const left = daysBetween(today, deadline);
  const [, m, d] = deadline.split('-').map(Number);
  const label = `${WEEKDAYS[weekday(deadline)]}요일(${m}/${d})`;
  const hold = mood === 'negative' ? ' 버티기' : '';
  if (outcome === 'kept') return { text: `${label}까지 버텼어요!`, left, urgent: false, done: true };
  if (outcome === 'met') return { text: `${label} 기한 안에 달성!`, left, urgent: false, done: true };
  if (outcome === 'ended') return { text: `${label}까지 · 이번 기간 끝`, left, urgent: false, done: true };
  if (left < 0) return { text: `${label} 기한이 지났어요`, left, urgent: false, done: false };
  if (left === 0) return { text: `오늘까지${hold}!`, left, urgent: true, done: false };
  return { text: `${label}까지${hold} · ${left}일 남음`, left, urgent: left <= 1, done: false };
}

/** 짧은 요일 이름 @param {string} key */
export const weekdayLabel = (key) => WEEKDAYS[weekday(key)];
