import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DDAY_ICON_META,
  DDAY_ICONS,
  DDAY_TITLE_MAX,
  computeDdayCounter,
  computeProgressPercent,
  normalizeControlGeometry,
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

test('stripHtmlToTitle keeps emoji joiners (ZWJ) so family emojis do not split apart', () => {
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  assert.equal(stripHtmlToTitle(`<b>${family}</b> 소풍`), `${family} 소풍`);
  // 폭 없는 띄어쓰기·ZWNJ·BOM은 예전처럼 공백으로 정리합니다.
  assert.equal(stripHtmlToTitle('가​나‌다﻿라'), '가 나 다 라');
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

  // 기존 settings JSON에 controlGeometry / controlAlwaysOnTop 필드가 없어도 무손실 보완
  assert.equal(s.controlGeometry, null);
  assert.equal(s.controlAlwaysOnTop, true);

  // normalizeControlGeometry 경계·위치 보존 클램프 및 듀얼 좌표 검증
  assert.deepEqual(
    normalizeControlGeometry({ x: 100, y: 120, width: 299, height: 400 }),
    { x: 100, y: 120, physicalX: 100, physicalY: 120, width: 340, height: 460 },
  );
  assert.deepEqual(
    normalizeControlGeometry({ x: 140, y: 160, logicalX: 70, logicalY: 80, width: 900, height: 1000 }),
    { x: 140, y: 160, physicalX: 140, physicalY: 160, logicalX: 70, logicalY: 80, width: 580, height: 860 },
  );
  assert.equal(normalizeControlGeometry({ x: -32000, y: 100, width: 380, height: 580 }), null);
  assert.equal(normalizeControlGeometry({ x: 100, y: 100, width: 0, height: 580 }), null);
  assert.equal(normalizeControlGeometry({ x: 100, y: 100, width: 380, height: Number.NaN }), null);
  assert.deepEqual(
    normalizeControlGeometry({ physicalX: 240.4, physicalY: 180.6, logicalX: 120, logicalY: 90, width: 560, height: 660 }),
    { x: 240, y: 181, physicalX: 240, physicalY: 181, logicalX: 120, logicalY: 90, width: 560, height: 660 },
  );

  // 기존 사용자의 범위 밖 controlGeometry(300×400)도 위치를 보존하고 크기만 최소 경계(340×460)로 보정
  const sWithGeom = normalizeDdaySettings({
    controlAlwaysOnTop: false,
    controlGeometry: { x: 400, y: 200, width: 300, height: 400 },
  });
  assert.equal(sWithGeom.controlAlwaysOnTop, false);
  assert.equal(sWithGeom.controlGeometry?.x, 400);
  assert.equal(sWithGeom.controlGeometry?.y, 200);
  assert.equal(sWithGeom.controlGeometry?.width, 340);
  assert.equal(sWithGeom.controlGeometry?.height, 460);
});

test('DDAY_ICONS 21종 카탈로그는 기존 8종 하위 호환과 메타·SVG 1:1 정합성을 보장한다', () => {
  const legacyIds = ['flag', 'puzzle', 'snow', 'sparkle', 'sprout', 'star', 'trophy', 'cal'];
  assert.equal(DDAY_ICONS.length, 21);
  assert.equal(new Set(DDAY_ICONS).size, DDAY_ICONS.length);

  for (const legacyId of legacyIds) {
    assert.ok(DDAY_ICONS.includes(/** @type {any} */ (legacyId)), `기존 아이콘 ID 누락: ${legacyId}`);
  }

  const stickerSvgSource = readFileSync(
    new URL('../../components/dday/DdayStickerSvg.svelte', import.meta.url),
    'utf8',
  );

  for (const iconId of DDAY_ICONS) {
    const meta = DDAY_ICON_META[iconId];
    assert.ok(meta && meta.label.trim().length > 0 && meta.category.trim().length > 0, `메타 누락: ${iconId}`);

    const normalized = normalizeDdayItem({
      id: `test-${iconId}`,
      title: '테스트 일정',
      date: '2026-12-01',
      icon: iconId,
    });
    assert.equal(normalized?.icon, iconId);

    assert.ok(
      stickerSvgSource.includes(`resolvedIcon === '${iconId}'`),
      `DdayStickerSvg.svelte에 아이콘 분기 누락: ${iconId}`,
    );
  }

  assert.deepEqual(Object.keys(DDAY_ICON_META).sort(), [...DDAY_ICONS].sort());

  // 알 수 없는 아이콘 ID는 기본값 flag로 안전 폴백
  const fallback = normalizeDdayItem({
    id: 'unknown-icon-item',
    title: '미지원 아이콘',
    date: '2026-12-01',
    icon: 'non-existent-icon',
  });
  assert.equal(fallback?.icon, 'flag');
});
