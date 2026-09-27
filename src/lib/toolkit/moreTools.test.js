import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, applySettingsPatch, TOOL_IDS } from './preferences.js';
import { moreTools } from './moreTools.js';

test('hidden tools move between toolbar and archive without duplication', () => {
  let settings = defaults();
  assert.equal(moreTools(settings.toolkit).length, 6);
  for (const id of TOOL_IDS) {
    settings = applySettingsPatch(settings, 'toolkit', { visibleToolIds: TOOL_IDS.filter((tool) => tool !== id) });
    assert.deepEqual(moreTools(settings.toolkit).map((tool) => tool.id), [id]);
    settings = applySettingsPatch(settings, 'toolkit', { visibleToolIds: TOOL_IDS });
    assert.deepEqual(moreTools(settings.toolkit), []);
  }
});

test('external group toggles preserve individually hidden tools', () => {
  let settings = applySettingsPatch(defaults(), 'toolkit', { hiddenPlatformIds: ['clanner'] });
  const platforms = () => moreTools(settings.toolkit).filter((tool) => tool.platform).map((tool) => tool.id);
  assert.deepEqual(platforms(), ['clanner']);
  settings = applySettingsPatch(settings, 'toolkit', { externalToolsEnabled: false });
  assert.deepEqual(platforms(), ['rollinthunder', 'clanner']);
  settings = applySettingsPatch(settings, 'toolkit', { externalToolsEnabled: true });
  assert.deepEqual(platforms(), ['clanner']);
});
