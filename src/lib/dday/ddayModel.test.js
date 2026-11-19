import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DDAY_TITLE_MAX,
  computeDdayCounter,
  computeProgressPercent,
  normalizeDdayItem,
  normalizeDdayList,
  normalizeDdaySettings,
  normalizeDdayWidgetPrefs,
  resolveEffectiveTargetDate,
  savedDdayGeometry,
  stripHtmlToTitle,
} from './ddayModel.js';

test('stripHtmlToTitle strips markup cleanly and clamps to 30 codepoints including emojis', () => {
  const html = '<div><b>과학&amp;탐구</b> 페스티벌 &nbsp;안내\u200B</div>';
  assert.equal(stripHtmlToTitle(html), '과학&탐구 페스티벌 안내');
  const thirtyOnes = '가'.repeat(DDAY_TITLE_MAX) + '나';
  assert.equal([...stripHtmlToTitle(thirtyOnes)].length, DDAY_TITLE_MAX);
});

test('countdown and since mode compute local calendar days without timezone drift', () => {
  assert.deepEqual(
    computeDdayCounter({ date: '2026-11-23', countMode: 'countdown', repeatYearly: false }, '2026-11-18'),
    { label: 'D-5', diff: 5, state: 'week', effectiveDate: '2026-11-23' },
  );
  assert.deepEqual(
    computeDdayCounter({ date: '2026-11-18', countMode: 'countdown', repeatYearly: false }, '2026-11-18'),
    { label: 'D-Day', diff: 0, state: 'today', effectiveDate: '2026-11-18' },
  );
  assert.deepEqual(
    computeDdayCounter({ date: '2026-11-15', countMode: 'countdown', repeatYearly: false }, '2026-11-18'),
    { label: 'D+3', diff: -3, state: 'overdue', effectiveDate: '2026-11-15' },
  );
  // since mode counts start date as +1일
  assert.equal(
    computeDdayCounter({ date: '2026-11-18', countMode: 'since', repeatYearly: false }, '2026-11-18').label,
    '+1일',
  );
  assert.equal(
    computeDdayCounter({ date: '2026-11-10', countMode: 'since', repeatYearly: false }, '2026-11-18').label,
    '+9일',
  );
});

test('repeatYearly advances passed dates and adjusts Feb 29 on non-leap years', () => {
  // 2024-02-29 recurring checked in late 2026 -> 2027-02-28 (non-leap year)
  assert.equal(resolveEffectiveTargetDate('2024-02-29', true, 'countdown', '2026-11-18'), '2027-02-28');
  // checked after 2027-02-28 -> next leap year 2028-02-29
  assert.equal(resolveEffectiveTargetDate('2024-02-29', true, 'countdown', '2027-03-01'), '2028-02-29');
});

test('computeProgressPercent clamps between 8 and 96 while countdown is active', () => {
  const pct = computeProgressPercent(
    { date: '2026-11-28', startDate: '2026-11-08', countMode: 'countdown', repeatYearly: false },
    '2026-11-18',
  );
  assert.equal(pct, 52);
  assert.equal(
    computeProgressPercent({ date: '2026-11-18', startDate: '2026-11-01', countMode: 'countdown', repeatYearly: false }, '2026-11-18'),
    100,
  );
});

test('normalizeDdayItem enforces linkedTodoId invariant and normalizes active ordering', () => {
  const brokenTodoLink = normalizeDdayItem({
    id: 'a',
    title: '방학식',
    date: '2026-12-24',
    linkedTodoId: null,
    showInTodo: true,
  });
  assert.equal(brokenTodoLink?.showInTodo, false);

  const list = normalizeDdayList([
    { id: 'x', title: 'X', date: '2026-12-01', order: 5, status: 'active' },
    { id: 'y', title: 'Y', date: '2026-12-05', order: 1, status: 'archived', completedAt: '2026-11-18' },
    { id: 'z', title: 'Z', date: '2026-12-02', order: 2, status: 'active' },
  ]);
  assert.equal(list.find((d) => d.id === 'z')?.order, 0);
  assert.equal(list.find((d) => d.id === 'x')?.order, 1);
});

test('settings and widget prefs sanitize malformed values cleanly', () => {
  const s = normalizeDdaySettings({ completeWithTodo: false, deleteWithTodo: true, defaultChannelsFromNew: { showInTodo: true } });
  assert.equal(s.completeWithTodo, false);
  assert.equal(s.deleteWithTodo, true);
  assert.equal(s.defaultChannelsFromNew.showInTodo, true);
  assert.equal(s.defaultChannelsFromNew.showInBanner, true);

  const wOff = normalizeDdayWidgetPrefs({
    autoOpen: false,
    geometry: { x: 100, y: 120, width: 240, height: 260 },
  });
  assert.equal(savedDdayGeometry(wOff), null);

  const wMin = normalizeDdayWidgetPrefs({
    skin: 'w4',
    autoOpen: true,
    geometry: { x: -32000, y: -32000, width: 240, height: 260 },
  });
  assert.equal(wMin.skin, 'w4');
  assert.equal(wMin.geometry, null);
});
