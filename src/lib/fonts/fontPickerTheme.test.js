import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDY_THEMES } from '../themes.js';
import { TOOLKIT_THEMES } from '../toolkit/themes.js';
import { contrastRatio } from '../dday/ddayBadge.js';
import {
  fontPickerThemeToStyle,
  resolveFontPickerTokens,
  sanitizeFontPickerThemeStyle,
} from './fontPickerTheme.js';

const HEX6 = /^#[0-9a-f]{6}$/i;

test('Tidy 15종 × 라이트/다크 30조합 + Toolkit 6종 × 라이트/다크 12조합 전수 대비 및 형식 검증', () => {
  const cases = [
    ...TIDY_THEMES.flatMap((t) => [
      { source: /** @type {const} */ ('tidy'), themeId: t.id, isDarkMode: false },
      { source: /** @type {const} */ ('tidy'), themeId: t.id, isDarkMode: true },
    ]),
    ...TOOLKIT_THEMES.flatMap((t) => [
      { source: /** @type {const} */ ('toolkit'), themeId: t.id, isDarkMode: false },
      { source: /** @type {const} */ ('toolkit'), themeId: t.id, isDarkMode: true },
    ]),
  ];
  assert.equal(cases.length, 42);

  for (const input of cases) {
    const t = resolveFontPickerTokens(input);
    const tag = `${input.source}:${input.themeId}:${input.isDarkMode ? 'dark' : 'light'}`;

    for (const key of /** @type {const} */ (['surface', 'catbar', 'edgeSolid', 'ink', 'muted', 'accent', 'accentSolid', 'onAccent', 'accentInk', 'fadeColor'])) {
      assert.match(t[key], HEX6, `${tag} ${key}가 6자리 Hex여야 함: ${t[key]}`);
    }

    assert.ok(contrastRatio(t.ink, t.surface) >= 7.0, `${tag} ink/surface 대비 부족`);
    assert.ok(contrastRatio(t.muted, t.surface) >= 4.5, `${tag} muted/surface 대비 부족`);
    assert.ok(contrastRatio(t.muted, t.catbar) >= 4.5, `${tag} muted/catbar 대비 부족`);
    assert.ok(contrastRatio(t.accentInk, t.surface) >= 4.5, `${tag} accentInk/surface 대비 부족`);
    assert.ok(contrastRatio(t.onAccent, t.accentSolid) >= 4.5, `${tag} onAccent/accentSolid 대비 부족`);

    const css = fontPickerThemeToStyle(t);
    assert.ok(!css.includes('light-dark('), `${tag} light-dark() 금지 위반`);
    assert.ok(!css.includes('color-mix('), `${tag} color-mix() 금지 위반`);
    assert.equal(sanitizeFontPickerThemeStyle(css), css, `${tag} 직렬화 스타일이 새니타이저를 그대로 통과해야 함`);
  }
});

test('sanitizeFontPickerThemeStyle은 외부 CSS 주입을 차단한다', () => {
  assert.equal(sanitizeFontPickerThemeStyle('--fp-surface:#ffffff; background:url(javascript:alert(1))'), '--fp-surface:#ffffff');
  assert.equal(sanitizeFontPickerThemeStyle('--fp-surface:#ffffff; } body { display:none }'), '');
});
