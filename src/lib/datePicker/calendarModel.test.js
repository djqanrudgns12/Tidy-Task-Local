import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  cursorMoveForKey,
  formatShortDate,
  GRID_CELL_COUNT,
  isDateKey,
  moveCursor,
  parseDateKey,
  quickDates,
  shiftMonth,
  toDateKey,
} from './calendarModel.js';

test('날짜 키를 읽고, 달력에 없는 날은 거부한다', () => {
  assert.deepEqual(parseDateKey('2026-09-30'), { year: 2026, month: 8, day: 30 });
  assert.equal(parseDateKey('2026-02-30'), null);
  assert.equal(parseDateKey('2026-9-3'), null);
  assert.equal(parseDateKey(''), null);
  assert.equal(parseDateKey(null), null);
  assert.equal(isDateKey('2028-02-29'), true);
  assert.equal(isDateKey('2027-02-29'), false);
});

test('넘치는 연·월·일은 앞뒤 달로 넘긴다', () => {
  assert.equal(toDateKey(2026, 12, 1), '2027-01-01');
  assert.equal(toDateKey(2026, 0, 0), '2025-12-31');
});

test('날짜 더하기는 월·연 경계를 넘는다', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('달 더하기는 없는 날을 말일로 맞춘다', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-05-10', -12), '2025-05-10');
});

test('짧은 표기는 월/일(요일)이고, 날짜가 아니면 빈 문자열', () => {
  assert.equal(formatShortDate('2026-09-30'), '9/30(수)');
  assert.equal(formatShortDate('2026-10-04'), '10/4(일)');
  assert.equal(formatShortDate(''), '');
  assert.equal(formatShortDate(undefined), '');
});

test('달력은 늘 42칸, 일요일부터 시작하고 오늘·선택 표시를 붙인다', () => {
  // 2026년 9월 1일은 화요일 → 앞에 8월 30, 31일 두 칸
  const cells = buildMonthGrid(2026, 8, { todayKey: '2026-09-22', selectedKey: '2026-09-30' });
  assert.equal(cells.length, GRID_CELL_COUNT);
  assert.deepEqual(cells.slice(0, 3).map((c) => [c.key, c.inMonth, c.weekday]), [
    ['2026-08-30', false, 0], ['2026-08-31', false, 1], ['2026-09-01', true, 2],
  ]);
  assert.equal(cells.find((c) => c.isToday)?.key, '2026-09-22');
  assert.equal(cells.find((c) => c.isSelected)?.key, '2026-09-30');
  assert.equal(cells.at(-1)?.key, '2026-10-10');
  assert.equal(cells.filter((c) => c.inMonth).length, 30);
});

test('1일이 일요일인 달도 앞 칸 없이 42칸을 채운다', () => {
  // 2026년 2월 1일은 일요일
  const cells = buildMonthGrid(2026, 1);
  assert.equal(cells[0].key, '2026-02-01');
  assert.equal(cells.length, 42);
});

test('보이는 달 넘기기는 연도 경계를 넘는다', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
});

/** @param {string} today */
const quick = (today) => Object.fromEntries(quickDates(today).map((q) => [q.id, [q.label, q.key]]));

test('빠른 선택: 평일(화)에는 이번 주 금요일과 다음 주 월요일', () => {
  assert.deepEqual(quick('2026-09-22'), {
    today: ['오늘', '2026-09-22'],
    tomorrow: ['내일', '2026-09-23'],
    friday: ['이번 주 금', '2026-09-25'],
    'next-monday': ['다음 주 월', '2026-09-28'],
  });
});

test('빠른 선택: 금요일의 "이번 주 금"은 오늘, 월요일의 "다음 주 월"은 7일 뒤', () => {
  assert.deepEqual(quick('2026-09-25').friday, ['이번 주 금', '2026-09-25']);
  assert.deepEqual(quick('2026-09-21')['next-monday'], ['다음 주 월', '2026-09-28']);
});

test('빠른 선택: 토·일요일에는 지난 금요일 대신 "다음 주 금"', () => {
  assert.deepEqual(quick('2026-09-26').friday, ['다음 주 금', '2026-10-02']);
  assert.deepEqual(quick('2026-09-27').friday, ['다음 주 금', '2026-10-02']);
  // 일요일의 "다음 주 월"은 내일입니다 (한 주 = 월~일)
  assert.deepEqual(quick('2026-09-27')['next-monday'], ['다음 주 월', '2026-09-28']);
});

test('빠른 선택은 연말도 넘어간다', () => {
  assert.deepEqual(quick('2026-12-31')['next-monday'], ['다음 주 월', '2027-01-04']);
});

test('키보드: 방향키는 하루·한 주, PageUp/Down은 한 달(Shift는 1년), Home/End는 그 주 일·토', () => {
  const at = '2026-09-22'; // 화
  const move = (/** @type {string} */ key, shiftKey = false) => {
    const m = cursorMoveForKey({ key, shiftKey });
    return m ? moveCursor(at, m) : null;
  };
  assert.equal(move('ArrowLeft'), '2026-09-21');
  assert.equal(move('ArrowRight'), '2026-09-23');
  assert.equal(move('ArrowUp'), '2026-09-15');
  assert.equal(move('ArrowDown'), '2026-09-29');
  assert.equal(move('PageUp'), '2026-08-22');
  assert.equal(move('PageDown'), '2026-10-22');
  assert.equal(move('PageDown', true), '2027-09-22');
  assert.equal(move('Home'), '2026-09-20');
  assert.equal(move('End'), '2026-09-26');
  assert.equal(move('Enter'), null);
});
