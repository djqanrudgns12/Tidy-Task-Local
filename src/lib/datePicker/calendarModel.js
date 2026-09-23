// ═══════════════════════════════════════════════════════════════════
// [달력 계산] 마감일 달력이 쓰는 날짜 규칙을 한곳에 모읍니다. (순수 함수)
//
// 왜 날짜를 'YYYY-MM-DD' 문자열(키)로 다루는가:
//   할 일의 deadline이 이 형식으로 저장됩니다. new Date('2026-09-30')은 "영국 기준 자정"으로 해석되어
//   시간대에 따라 하루가 밀리므로, 문자열을 직접 읽고 로컬 날짜로만 계산합니다. (dateUtils.parseDeadline과 같은 기준)
// ═══════════════════════════════════════════════════════════════════
import { todayKey as toKey } from '../dateUtils.js';

export const WEEKDAY_LABELS = Object.freeze(['일', '월', '화', '수', '목', '금', '토']);
// 달력은 늘 6줄(42칸)입니다. 왜: 달마다 5줄/6줄이 바뀌면 팝업 창 높이가 달을 넘길 때마다 출렁입니다.
export const GRID_CELL_COUNT = 42;

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD'를 연·월(0부터)·일로 읽습니다. 달력에 없는 날(2월 30일 등)이면 null.
 * @param {unknown} key
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseDateKey(key) {
  if (typeof key !== 'string') return null;
  const match = key.match(KEY_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return { year, month, day };
}

/** @param {unknown} key @returns {key is string} */
export function isDateKey(key) {
  return parseDateKey(key) !== null;
}

// 연·월·일로 키를 만듭니다. 넘치는 값(13월, 0일 등)은 Date가 알아서 앞뒤 달로 넘겨 줍니다.
/** @param {number} year @param {number} month 0부터 @param {number} day */
export function toDateKey(year, month, day) {
  return toKey(new Date(year, month, day));
}

/** @param {string} key @returns {Date} */
function keyToDate(key) {
  const parts = parseDateKey(key);
  if (!parts) throw new Error(`날짜 형식이 아닙니다: ${key}`);
  return new Date(parts.year, parts.month, parts.day);
}

// 며칠 뒤(앞)의 키. 왜 setDate 방식인가: 밀리초를 더하면 서머타임이 있는 지역에서 하루가 23/25시간이라 날짜가 어긋납니다.
/** @param {string} key @param {number} days */
export function addDays(key, days) {
  const d = keyToDate(key);
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

// 몇 달 뒤(앞)의 같은 날. 그 달에 없는 날이면 말일로 맞춥니다. (1월 31일 + 1달 → 2월 28/29일)
/** @param {string} key @param {number} months */
export function addMonths(key, months) {
  const d = keyToDate(key);
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toDateKey(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), lastDay));
}

/** @param {string} key 0=일 … 6=토 */
export function weekdayOf(key) {
  return keyToDate(key).getDay();
}

// 뱃지·버튼에 쓰는 짧은 표기: '9/30(수)'. 날짜가 아니면 빈 문자열.
/** @param {unknown} key */
export function formatShortDate(key) {
  const parts = parseDateKey(key);
  if (!parts) return '';
  const weekday = new Date(parts.year, parts.month, parts.day).getDay();
  return `${parts.month + 1}/${parts.day}(${WEEKDAY_LABELS[weekday]})`;
}

/**
 * @typedef {{
 *   key: string, day: number, weekday: number,
 *   inMonth: boolean, isToday: boolean, isSelected: boolean,
 * }} CalendarCell
 */

/**
 * 한 달치 달력 칸(항상 42칸, 일요일 시작)을 만듭니다.
 * @param {number} year
 * @param {number} month 0부터
 * @param {{ todayKey?: string, selectedKey?: string }} [marks]
 * @returns {CalendarCell[]}
 */
export function buildMonthGrid(year, month, { todayKey = '', selectedKey = '' } = {}) {
  const lead = new Date(year, month, 1).getDay();
  /** @type {CalendarCell[]} */
  const cells = [];
  for (let i = 0; i < GRID_CELL_COUNT; i += 1) {
    const date = new Date(year, month, 1 - lead + i);
    const key = toKey(date);
    cells.push({
      key,
      day: date.getDate(),
      weekday: i % 7,
      inMonth: date.getMonth() === ((month % 12) + 12) % 12,
      isToday: key === todayKey,
      isSelected: key === selectedKey,
    });
  }
  return cells;
}

// 보이는 달을 앞뒤로 넘깁니다. (연도 경계 포함)
/** @param {{ year: number, month: number }} view @param {number} delta */
export function shiftMonth(view, delta) {
  const d = new Date(view.year, view.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * @typedef {{ id: 'today' | 'tomorrow' | 'friday' | 'next-monday', label: string, key: string, hint: string }} QuickDate
 */

/**
 * 빠른 선택 버튼 네 개: 오늘 · 내일 · 이번 주 금 · 다음 주 월.
 * 왜 한 주를 월~일로 보는가: 한국어의 "이번 주/다음 주"는 월요일에 시작합니다.
 *   (달력 칸은 일요일부터 그리지만, 말로 부르는 주는 월~일입니다)
 * 토·일요일에는 이번 주 금요일이 이미 지났으므로 "다음 주 금"(다가오는 금요일)으로 바꿉니다.
 * @param {string} todayKey
 * @returns {QuickDate[]}
 */
export function quickDates(todayKey) {
  const fromMonday = (weekdayOf(todayKey) + 6) % 7; // 월=0 … 일=6
  let friday = addDays(todayKey, 4 - fromMonday);
  const fridayPassed = friday < todayKey;
  if (fridayPassed) friday = addDays(friday, 7);
  const nextMonday = addDays(todayKey, 7 - fromMonday);
  const tomorrow = addDays(todayKey, 1);
  return [
    { id: 'today', label: '오늘', key: todayKey, hint: formatShortDate(todayKey) },
    { id: 'tomorrow', label: '내일', key: tomorrow, hint: formatShortDate(tomorrow) },
    { id: 'friday', label: fridayPassed ? '다음 주 금' : '이번 주 금', key: friday, hint: formatShortDate(friday) },
    { id: 'next-monday', label: '다음 주 월', key: nextMonday, hint: formatShortDate(nextMonday) },
  ];
}

/**
 * @typedef {'prev-day' | 'next-day' | 'prev-week' | 'next-week' | 'prev-month' | 'next-month'
 *   | 'prev-year' | 'next-year' | 'week-start' | 'week-end'} CursorMove
 */

/**
 * 키보드 커서를 옮깁니다. 주의 시작·끝은 달력 칸과 같은 일요일·토요일입니다.
 * @param {string} key
 * @param {CursorMove} move
 */
export function moveCursor(key, move) {
  switch (move) {
    case 'prev-day': return addDays(key, -1);
    case 'next-day': return addDays(key, 1);
    case 'prev-week': return addDays(key, -7);
    case 'next-week': return addDays(key, 7);
    case 'prev-month': return addMonths(key, -1);
    case 'next-month': return addMonths(key, 1);
    case 'prev-year': return addMonths(key, -12);
    case 'next-year': return addMonths(key, 12);
    case 'week-start': return addDays(key, -weekdayOf(key));
    case 'week-end': return addDays(key, 6 - weekdayOf(key));
    default: return key;
  }
}

/**
 * 키보드 이벤트를 커서 이동으로 바꿉니다. 해당 없으면 null.
 * @param {{ key: string, shiftKey?: boolean }} event
 * @returns {CursorMove | null}
 */
export function cursorMoveForKey({ key, shiftKey = false }) {
  switch (key) {
    case 'ArrowLeft': return 'prev-day';
    case 'ArrowRight': return 'next-day';
    case 'ArrowUp': return 'prev-week';
    case 'ArrowDown': return 'next-week';
    case 'PageUp': return shiftKey ? 'prev-year' : 'prev-month';
    case 'PageDown': return shiftKey ? 'next-year' : 'next-month';
    case 'Home': return 'week-start';
    case 'End': return 'week-end';
    default: return null;
  }
}
