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
