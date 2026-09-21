// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLKIT_THEMES, toolkitColors } from './themes.js';
import { defaults, normalizeSettings, applySettingsPatch } from './preferences.js';

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + .05) / (lo + .05);
}
test('all theme text and filled buttons meet 4.5:1 contrast', () => {
  assert.equal(TOOLKIT_THEMES.length, 6);
  for (const theme of TOOLKIT_THEMES) for (const dark of [false, true]) {
    const c = toolkitColors(theme.id, dark);
    for (const fg of ['ink', 'muted', 'accent']) for (const bg of ['bg', 'panel', 'soft']) {
      assert.ok(contrast(c[fg], c[bg]) >= 4.5, `${theme.id}/${dark}: ${fg}/${bg}`);
    }
    assert.ok(contrast(c['on-action'], c.action) >= 4.5);
    assert.ok(contrast(c['display-ink'], c['display-bg']) >= 4.5);
    assert.ok(contrast(c.danger, c['danger-soft']) >= 4.5);
  }
});
test('dark mode is identical for every saved color theme', () => {
  for (const theme of TOOLKIT_THEMES) {
    assert.deepEqual(toolkitColors(theme.id, true), toolkitColors('sage', true));
  }
});
test('toggle and reload preserve the selected light theme and other settings', () => {
  let s = applySettingsPatch(defaults(), 'toolkit', { theme: 'rose', orientation: 'vertical' });
  s = applySettingsPatch(s, 'toolkit', { darkMode: true });
  s = normalizeSettings(JSON.parse(JSON.stringify(s)));
  assert.equal(s.toolkit.darkMode, true);
  s = applySettingsPatch(s, 'toolkit', { darkMode: false });
  assert.equal(s.toolkit.theme, 'rose');
  assert.equal(s.toolkit.orientation, 'vertical');
});
test('existing and malformed appearance settings use safe defaults', () => {
  for (const toolkit of [{}, { theme: 'missing', darkMode: 'true' }]) {
    const s = normalizeSettings({ schemaVersion: 6, toolkit });
    assert.equal(s.toolkit.theme, 'sage');
    assert.equal(s.toolkit.darkMode, false);
  }
});
