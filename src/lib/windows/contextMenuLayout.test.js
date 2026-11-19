import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDdayBannerMeta,
  nextBannerToggleMode,
  rememberVisibleBannerMode,
  resolveMenuWidth,
} from './contextMenuLayout.js';

test('resolveMenuWidth: 3단계 폭 티어와 uiFontSize(9~14pt) 상한을 정확히 지킨다', () => {
  // Tier S (todo, dday-banner, text, tiny, ctrl-ctx)
  for (const type of ['todo', 'dday-banner', 'text', 'tiny', 'ctrl-ctx']) {
    assert.equal(resolveMenuWidth(type, 9), 220);
    assert.equal(resolveMenuWidth(type, 10), 220);
    assert.equal(resolveMenuWidth(type, 11), 226);
    assert.equal(resolveMenuWidth(type, 12), 236);
    assert.equal(resolveMenuWidth(type, 13), 236);
    assert.equal(resolveMenuWidth(type, 14), 244);
    assert.equal(resolveMenuWidth(type, 20), 244);
  }

  // Tier M (bar)
  assert.equal(resolveMenuWidth('bar', 9), 236);
  assert.equal(resolveMenuWidth('bar', 10), 236);
  assert.equal(resolveMenuWidth('bar', 11), 242);
  assert.equal(resolveMenuWidth('bar', 12), 252);
  assert.equal(resolveMenuWidth('bar', 14), 260);
  assert.equal(resolveMenuWidth('bar', 18), 260);

  // Tier L (dw-menu, td-menu)
  assert.equal(resolveMenuWidth('dw-menu', 10), 256);
  assert.equal(resolveMenuWidth('td-menu', 12), 264);
  assert.equal(resolveMenuWidth('dw-menu', 14), 268);

  // 잘못된 폰트 크기는 10pt 기본값으로 안전하게 처리
  assert.equal(resolveMenuWidth('bar', Number.NaN), 236);
});

test('rememberVisibleBannerMode / nextBannerToggleMode: 배너 숨김 후 기존 2열 모드를 복원한다', () => {
  assert.equal(rememberVisibleBannerMode('bento', 'single'), 'bento');
  assert.equal(rememberVisibleBannerMode('single', 'bento'), 'single');
  assert.equal(rememberVisibleBannerMode('hidden', 'bento'), 'bento');
  assert.equal(rememberVisibleBannerMode('hidden', 'single'), 'single');

  assert.equal(nextBannerToggleMode('bento', 'bento'), 'hidden');
  assert.equal(nextBannerToggleMode('single', 'single'), 'hidden');
  assert.equal(nextBannerToggleMode('hidden', 'bento'), 'bento');
  assert.equal(nextBannerToggleMode('hidden', 'single'), 'single');
});

test('buildDdayBannerMeta: 활성 D-Day 메타를 계산하고 아카이브/빈 항목은 null을 돌려준다', () => {
  const sample = {
    id: 'dd-1',
    title: 'AI 분야 동아리 운영일지 및 강사비 기안 제출 마감',
    date: '2026-11-25',
    startDate: '2026-11-01',
    countMode: /** @type {const} */ ('countdown'),
    repeatYearly: false,
    icon: /** @type {const} */ ('flag'),
    tone: /** @type {const} */ ('accent'),
    status: /** @type {const} */ ('active'),
    completedAt: null,
    linkedTodoId: 'todo-9',
    showInTodo: true,
    showInBanner: true,
    showInWidget: false,
    order: 0,
  };

  const meta = buildDdayBannerMeta(sample, {
    todayKey: '2026-11-19',
    accent: '#4f46e5',
    bannerMode: 'bento',
    bannerCount: 3,
  });

  assert.ok(meta);
  assert.equal(meta.id, 'dd-1');
  assert.equal(meta.counterLabel, 'D-6');
  assert.equal(meta.shortDate, '11.25');
  assert.equal(meta.linkedTodoId, 'todo-9');
  assert.equal(meta.showInTodo, true);
  assert.equal(meta.showInBanner, true);
  assert.equal(meta.showInWidget, false);
  assert.equal(meta.bannerMode, 'bento');
  assert.equal(meta.bannerCount, 3);
  assert.ok(meta.title.length <= 25);

  assert.equal(buildDdayBannerMeta({ ...sample, status: 'archived' }), null);
  assert.equal(buildDdayBannerMeta(null), null);
});
