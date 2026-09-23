import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeSettings, applySettingsPatch } from './preferences.js';

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
  const allSix = ['timer', 'picker', 'noticeboard', 'tournament', 'focus-bell', 'roster'];
  const migrated = normalizeSettings({ schemaVersion: 6, toolkit: { visibleToolIds: allSix } });
  assert.equal(migrated.schemaVersion, 8);
  assert.deepEqual(migrated.toolkit.visibleToolIds, [...allSix, 'dice', 'clock']);
  assert.ok(defaults().toolkit.visibleToolIds.includes('dice'));
  const hidden = applySettingsPatch(migrated, 'toolkit', { visibleToolIds: ['timer'] });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(hidden))).toolkit.visibleToolIds, ['timer']);
  assert.throws(() => normalizeSettings({ schemaVersion: 9 }));
});

test('schema 8 adds the clock once, keeps dice, and validates clock preferences', () => {
  const migrated = normalizeSettings({ schemaVersion: 7, toolkit: { visibleToolIds: ['timer', 'dice'] } });
  assert.equal(migrated.schemaVersion, 8);
  assert.deepEqual(migrated.toolkit.visibleToolIds, ['timer', 'dice', 'clock']);
  assert.equal(defaults().toolkit.visibleToolIds[1], 'clock');
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
