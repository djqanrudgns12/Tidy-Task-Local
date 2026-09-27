import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeSettings, applySettingsPatch, DEFAULT_TOOL_ORDER, DEFAULT_VISIBLE_TOOL_IDS, TOOL_IDS, DEFAULT_UI_FONT, UI_FONT_NAME_MAX, isValidUiFontName } from './preferences.js';

test('custom order survives reload while toggled tools join the end of their new section', () => {
  const order = ['roster', 'external', ...DEFAULT_TOOL_ORDER.filter((id) => id !== 'roster' && id !== 'external')];
  const saved = applySettingsPatch(defaults(), 'toolkit', { toolOrderIds: order });
  const hidden = applySettingsPatch(saved, 'toolkit', { visibleToolIds: saved.toolkit.visibleToolIds.filter((id) => id !== 'roster') });
  const shown = applySettingsPatch(hidden, 'toolkit', { visibleToolIds: [...hidden.toolkit.visibleToolIds, 'roster'] });
  assert.equal(hidden.toolkit.toolOrderIds.at(-1), 'roster');
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(shown))).toolkit.toolOrderIds,
    ['external', 'timer', 'picker', 'noticeboard', 'vote', 'seating', 'roster', ...DEFAULT_TOOL_ORDER.slice(7)]);
  assert.deepEqual(normalizeSettings({ schemaVersion: 11, toolkit: {} }).toolkit.toolOrderIds, DEFAULT_TOOL_ORDER);
  assert.deepEqual(normalizeSettings({ schemaVersion: 11, toolkit: { toolOrderIds: ['roster', 'roster', 'unknown'] } }).toolkit.toolOrderIds,
    ['roster', ...DEFAULT_TOOL_ORDER.filter((id) => id !== 'roster')]);
});

test('new defaults and untouched legacy defaults use the recommended order and six hidden tools', () => {
  assert.deepEqual(defaults().toolkit.visibleToolIds, DEFAULT_VISIBLE_TOOL_IDS);
  assert.deepEqual(DEFAULT_TOOL_ORDER, ['timer', 'picker', 'noticeboard', 'vote', 'seating', 'roster', 'external', 'focus-bell', 'clock', 'scoreboard', 'dice', 'thermometer', 'tournament']);
  const legacy = normalizeSettings({ schemaVersion: 11, toolkit: {
    visibleToolIds: [...TOOL_IDS], toolOrderIds: [...TOOL_IDS.slice(0, -1), 'external', 'roster'],
  } });
  assert.deepEqual(legacy.toolkit.visibleToolIds, DEFAULT_VISIBLE_TOOL_IDS);
  assert.deepEqual(legacy.toolkit.toolOrderIds, DEFAULT_TOOL_ORDER);
  // 업데이트 뒤에 모두 표시를 선택하면, 다시 읽어도 새 기본값으로 돌아가지 않습니다.
  const all = applySettingsPatch(legacy, 'toolkit', { visibleToolIds: [...TOOL_IDS] });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(all))).toolkit.visibleToolIds, TOOL_IDS);
});

test('custom legacy visibility and ordering are preserved within each section', () => {
  const migrated = normalizeSettings({ schemaVersion: 11, toolkit: {
    visibleToolIds: ['roster', 'timer', 'clock'], externalToolsEnabled: false, hiddenPlatformIds: ['clanner'],
    toolOrderIds: ['roster', 'dice', 'clock', 'timer', 'external'],
  } });
  assert.deepEqual(migrated.toolkit.visibleToolIds, ['roster', 'timer', 'clock']);
  assert.deepEqual(migrated.toolkit.toolOrderIds.slice(0, 5), ['roster', 'clock', 'timer', 'dice', 'external']);
  assert.deepEqual(migrated.toolkit.hiddenPlatformIds, ['clanner']);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(migrated))), migrated);
});

test('disabled tools append in toggle order, re-enabled tools append above the divider and reload preserves both', () => {
  let saved = defaults();
  for (const id of ['picker', 'timer', 'vote']) {
    saved = applySettingsPatch(saved, 'toolkit', { visibleToolIds: saved.toolkit.visibleToolIds.filter((tool) => tool !== id) });
    assert.equal(saved.toolkit.toolOrderIds.at(-1), id);
  }
  assert.deepEqual(saved.toolkit.toolOrderIds.slice(-3), ['picker', 'timer', 'vote']);
  saved = applySettingsPatch(saved, 'toolkit', { externalToolsEnabled: false });
  assert.equal(saved.toolkit.toolOrderIds.at(-1), 'external');
  saved = applySettingsPatch(saved, 'toolkit', { visibleToolIds: [...saved.toolkit.visibleToolIds, 'timer'] });
  assert.deepEqual(saved.toolkit.toolOrderIds.slice(0, 4), ['noticeboard', 'seating', 'roster', 'timer']);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(saved))), saved);
  const empty = applySettingsPatch(saved, 'toolkit', { visibleToolIds: [] });
  assert.equal(empty.toolkit.toolOrderIds.length, DEFAULT_TOOL_ORDER.length);
  assert.equal(new Set(empty.toolkit.toolOrderIds).size, DEFAULT_TOOL_ORDER.length);
});

test('toolbar size defaults to normal for existing and invalid settings', () => {
  for (const toolbarSize of [undefined, null, -1, 5, 1.5, '2', NaN]) {
    assert.equal(normalizeSettings({ schemaVersion: 6, toolkit: { toolbarSize } }).toolkit.toolbarSize, 2);
  }
});

test('all five toolbar sizes survive saving, reloading and direction changes', () => {
  for (let toolbarSize = 0; toolbarSize <= 4; toolbarSize++) {
    const saved = applySettingsPatch(defaults(), 'toolkit', { toolbarSize });
    const changed = applySettingsPatch(saved, 'toolkit', { orientation: 'vertical', collapsed: true });
    assert.equal(normalizeSettings(JSON.parse(JSON.stringify(changed))).toolkit.toolbarSize, toolbarSize);
  }
});

test('external group toggle survives reload and preserves individual choices', () => {
  const selected = applySettingsPatch(defaults(), 'toolkit', { hiddenPlatformIds: ['clanner'] });
  const disabled = normalizeSettings(JSON.parse(JSON.stringify(
    applySettingsPatch(selected, 'toolkit', { externalToolsEnabled: false }),
  )));
  assert.equal(disabled.toolkit.externalToolsEnabled, false);
  assert.deepEqual(disabled.toolkit.hiddenPlatformIds, ['clanner']);
  const enabled = applySettingsPatch(disabled, 'toolkit', { externalToolsEnabled: true });
  assert.deepEqual(enabled.toolkit.hiddenPlatformIds, ['clanner']);
});

test('existing settings retain external tools and individual hidden choices', () => {
  const migrated = normalizeSettings({ schemaVersion: 6, toolkit: { hiddenPlatformIds: ['rollinthunder'] } });
  assert.equal(migrated.toolkit.externalToolsEnabled, true);
  assert.deepEqual(migrated.toolkit.hiddenPlatformIds, ['rollinthunder']);
});

test('schema 7 adds the dice tool once and later hiding sticks', () => {
  // 토너먼트를 숨긴 기존 선택은 이전 기본값으로 취급하지 않습니다.
  const existing = ['timer', 'picker', 'noticeboard', 'focus-bell', 'roster'];
  const migrated = normalizeSettings({ schemaVersion: 6, toolkit: { visibleToolIds: existing } });
  assert.equal(migrated.schemaVersion, 12);
  assert.deepEqual(migrated.toolkit.visibleToolIds, [...existing, 'dice', 'clock', 'scoreboard', 'thermometer', 'vote', 'seating']);
  assert.ok(!defaults().toolkit.visibleToolIds.includes('dice'));
  const hidden = applySettingsPatch(migrated, 'toolkit', { visibleToolIds: ['timer'] });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(hidden))).toolkit.visibleToolIds, ['timer']);
  assert.throws(() => normalizeSettings({ schemaVersion: 13 }));
});

test('schema 8 adds the clock once, keeps dice, and validates clock preferences', () => {
  const migrated = normalizeSettings({ schemaVersion: 7, toolkit: { visibleToolIds: ['timer', 'dice'] } });
  assert.equal(migrated.schemaVersion, 12);
  assert.deepEqual(migrated.toolkit.visibleToolIds, ['timer', 'dice', 'clock', 'scoreboard', 'thermometer', 'vote', 'seating']);
  assert.ok(!defaults().toolkit.visibleToolIds.includes('clock'));
  const hidden = applySettingsPatch(migrated, 'toolkit', { visibleToolIds: ['timer', 'dice'] });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(hidden))).toolkit.visibleToolIds, ['timer', 'dice']);
  // 시계 설정: 저장·다시 읽기, 다른 도구 설정은 그대로
  const saved = applySettingsPatch(hidden, 'clock', { face: 'analog', title: '3학년 2반', hour12: false });
  const reloaded = normalizeSettings(JSON.parse(JSON.stringify(saved)));
  const clock = /** @type {any} */ (reloaded.preferences.clock);
  assert.equal(clock.face, 'analog');
  assert.equal(clock.title, '3학년 2반');
  assert.equal(clock.hour12, false);
  assert.equal(clock.standardTimeSync, true);
  assert.equal(reloaded.preferences.digital.tickEnabled, true);
  assert.equal(saved.revision, hidden.revision + 1);
  // Rust와 같이 잘못된 항목이 하나라도 있으면 통째로 거부합니다.
  assert.throws(() => applySettingsPatch(saved, 'clock', { title: '가'.repeat(31) }));
  assert.throws(() => applySettingsPatch(saved, 'clock', { face: 'analog', offsetMs: 2600 }));
  assert.throws(() => applySettingsPatch(saved, 'clock', {}));
  // 파일에 잘못 들어간 값은 기본값으로 읽습니다.
  const broken = normalizeSettings({ schemaVersion: 8, preferences: { clock: { face: 7, showSeconds: false } } });
  assert.equal(/** @type {any} */ (broken.preferences.clock).face, 'digital');
  assert.equal(/** @type {any} */ (broken.preferences.clock).showSeconds, false);
});

test('schema 10 adds class vote once and keeps it hidden afterwards', () => {
  // 스키마 9 설정에는 학급 투표가 한 번만 들어가고, 선생님이 숨기면 다시 읽어도 숨김이 유지됩니다.
  const migrated = normalizeSettings({ schemaVersion: 9, toolkit: { visibleToolIds: ['timer', 'roster'] } });
  assert.deepEqual(migrated.toolkit.visibleToolIds, ['timer', 'roster', 'vote', 'seating']);
  const hidden = applySettingsPatch(migrated, 'toolkit', { visibleToolIds: ['timer', 'roster'] });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(hidden))).toolkit.visibleToolIds, ['timer', 'roster']);
  // 기본 활성화 목록에서는 알림장 다음·자리 배치 앞에 놓입니다.
  const ids = defaults().toolkit.visibleToolIds;
  assert.equal(ids.indexOf('vote'), ids.indexOf('noticeboard') + 1);
  assert.equal(ids.at(-1), 'roster');
});

test('toolkit UI font is stored separately, survives reload and rejects bad names', () => {
  // 예전 설정(글꼴 없음)은 Tidy Task 글꼴을 따라가지 않고 툴킷 기본 글꼴로 시작합니다.
  assert.equal(normalizeSettings({ schemaVersion: 11, toolkit: {} }).toolkit.uiFontFamily, DEFAULT_UI_FONT);
  const longest = '가'.repeat(UI_FONT_NAME_MAX);
  for (const font of ['배달의민족 주아', '내가 등록한 글꼴', longest]) {
    const saved = applySettingsPatch(defaults(), 'toolkit', { uiFontFamily: font });
    assert.equal(normalizeSettings(JSON.parse(JSON.stringify(saved))).toolkit.uiFontFamily, font);
    // 테마를 바꿔도 글꼴은 그대로 남아야 합니다.
    assert.equal(applySettingsPatch(saved, 'toolkit', { theme: 'ocean' }).toolkit.uiFontFamily, font);
  }
  // 이모지처럼 두 칸짜리 글자도 코드포인트 하나로 셉니다(Rust chars().count()와 같게).
  assert.equal(isValidUiFontName('😀'.repeat(UI_FONT_NAME_MAX)), true);
  for (const bad of ['', '   ', '줄\n바꿈', '탭\t', '가'.repeat(UI_FONT_NAME_MAX + 1), 3, null, undefined, {}]) {
    assert.equal(isValidUiFontName(bad), false);
    assert.equal(normalizeSettings({ schemaVersion: 11, toolkit: { uiFontFamily: bad } }).toolkit.uiFontFamily, DEFAULT_UI_FONT);
  }
});
