import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, parseDeadline, todayKey } from './dateUtils.js';

test('todayKey는 로컬 날짜를 YYYY-MM-DD로 만든다', () => {
  assert.equal(todayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(todayKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('YYYY-MM-DD 마감일은 로컬 자정으로 읽는다', () => {
  const d = parseDeadline('2026-09-20');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 20);
  assert.equal(d.getHours(), 0);
});

test('남은 날 수: 오늘 0, 내일 1, 어제 -1 (시각과 무관)', () => {
  const now = new Date(2026, 8, 16, 22, 30);
  assert.equal(daysUntil('2026-09-16', now), 0);
  assert.equal(daysUntil('2026-09-17', now), 1);
  assert.equal(daysUntil('2026-09-15', now), -1);
  assert.equal(daysUntil('2026-09-19', now), 3);
});

test('월말·윤년 경계', () => {
  assert.equal(daysUntil('2028-03-01', new Date(2028, 1, 28, 12)), 2); // 2028은 윤년(2/29 존재)
  assert.equal(daysUntil('2027-01-01', new Date(2026, 11, 31, 9)), 1);
});

test('날짜로 읽을 수 없으면 NaN', () => {
  assert.ok(Number.isNaN(daysUntil('다음 주', new Date())));
  assert.ok(Number.isNaN(daysUntil('', new Date())));
});
