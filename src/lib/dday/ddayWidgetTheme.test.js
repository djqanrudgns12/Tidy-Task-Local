import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDY_THEMES } from '../themes.js';
import { DDAY_APPEARANCE_MODES, DDAY_TONES } from './ddayModel.js';
import { contrastRatio } from './ddayBadge.js';
import {
  resolveExplicitToneHex,
  resolveWidgetThemeSource,
  resolveWidgetThemeTokens,
  widgetThemeToStyle,
} from './ddayWidgetTheme.js';

const HEX6 = /^#[0-9a-f]{6}$/i;

test('all 15 themes × 3 appearanceModes × 2 dark states × 6 tones meet opaque border and WCAG AA contrast rules', () => {
  for (const theme of TIDY_THEMES) {
    for (const appearanceMode of DDAY_APPEARANCE_MODES) {
      for (const isDarkMode of [false, true]) {
        for (const itemTone of DDAY_TONES) {
          const t = resolveWidgetThemeTokens({
            themeColor: theme.id,
            isDarkMode,
            appearanceMode,
            itemTone,
          });
          const label = `${theme.id}/${appearanceMode}/dark=${isDarkMode}/${itemTone}`;

          // 외곽 테두리·표면 토큰은 모두 불투명 6자리 Hex여야 모서리 반투명 번짐이 없다.
          for (const key of /** @type {const} */ ([
            'cardBg', 'cardSection', 'cardSurface', 'w4FrameBg', 'border', 'highlight',
            'ink', 'muted', 'accent', 'accentInk', 'accentFill', 'onAccent',
            'tone', 'toneInk', 'imminentInk', 'overdueInk', 'matDateBg', 'matDateInk',
            'menuBg', 'menuHeadBg', 'menuSecBg', 'menuWarnBg', 'menuWarnInk',
          ])) {
            assert.match(t[key], HEX6, `${label}: ${key} (${t[key]}) is not 6-digit hex`);
          }

          for (const bg of [t.cardBg, t.cardSection, t.cardSurface, t.w4FrameBg]) {
            assert.ok(contrastRatio(t.ink, bg) >= 7.0, `${label}: ink contrast on ${bg}`);
            assert.ok(contrastRatio(t.muted, bg) >= 4.5, `${label}: muted contrast on ${bg}`);
          }
          for (const bg of [t.cardBg, t.cardSection, t.cardSurface]) {
            assert.ok(contrastRatio(t.accentInk, bg) >= 4.5, `${label}: accentInk contrast on ${bg}`);
          }
          assert.ok(contrastRatio(t.onAccent, t.accentFill) >= 4.5, `${label}: onAccent on accentFill`);

          for (const bg of [t.cardSurface, t.matStart, t.matEnd, t.cardBg]) {
            assert.ok(contrastRatio(t.toneInk, bg) >= 4.5, `${label}: toneInk contrast on ${bg}`);
            assert.ok(contrastRatio(t.imminentInk, bg) >= 4.5, `${label}: imminentInk contrast on ${bg}`);
            assert.ok(contrastRatio(t.overdueInk, bg) >= 4.5, `${label}: overdueInk contrast on ${bg}`);
          }
          assert.ok(contrastRatio(t.matDateInk, t.matDateBg) >= 4.5, `${label}: matDateInk on matDateBg`);
          assert.ok(contrastRatio(t.menuWarnInk, t.menuWarnBg) >= 4.5, `${label}: menuWarnInk on menuWarnBg`);

          const css = widgetThemeToStyle(t);
          assert.equal(css.includes('light-dark('), false, `${label}: forbidden light-dark()`);
        }
      }
    }
  }
});

test('auto appearanceMode reflects memo theme colors (periwinkle, kraft, amber) and isolates from toolkit dark mode', () => {
  const periwinkleLight = resolveWidgetThemeTokens({
    themeColor: 'periwinkle',
    isDarkMode: false,
    appearanceMode: 'auto',
    itemTone: 'accent',
  });
  assert.equal(periwinkleLight.effectiveDark, false);
  assert.equal(periwinkleLight.cardBg, '#f6f7ff');
  assert.equal(periwinkleLight.accent, '#4f46e5');

  const kraftLight = resolveWidgetThemeTokens({
    themeColor: 'kraft',
    isDarkMode: false,
    appearanceMode: 'auto',
    itemTone: 'accent',
  });
  assert.equal(kraftLight.cardBg, '#f7e9cf');
  assert.equal(kraftLight.accent, '#6f4a1f');
  assert.notEqual(periwinkleLight.cardBg, kraftLight.cardBg);

  // auto 모드에서는 소스 창이 다크일 때만 다크가 된다.
  const periwinkleDark = resolveWidgetThemeTokens({
    themeColor: 'periwinkle',
    isDarkMode: true,
    appearanceMode: 'auto',
    itemTone: 'accent',
  });
  assert.equal(periwinkleDark.effectiveDark, true);
  assert.equal(periwinkleDark.accent, '#a5b4fc');
  assert.notEqual(periwinkleDark.cardBg, periwinkleLight.cardBg);

  // 크림(light) · 더스크(dark) 수동 고정은 소스 창 다크 여부와 무관하며 테마 강조색 정체성은 유지한다.
  const pinnedCream = resolveWidgetThemeTokens({
    themeColor: 'periwinkle',
    isDarkMode: true,
    appearanceMode: 'light',
    itemTone: 'accent',
  });
  assert.equal(pinnedCream.effectiveDark, false);
  assert.equal(pinnedCream.cardBg, '#fffdf8');
  assert.equal(pinnedCream.accent, '#4f46e5');

  const pinnedDusk = resolveWidgetThemeTokens({
    themeColor: 'periwinkle',
    isDarkMode: false,
    appearanceMode: 'dark',
    itemTone: 'accent',
  });
  assert.equal(pinnedDusk.effectiveDark, true);
  assert.equal(pinnedDusk.cardBg, '#212531');
  assert.equal(pinnedDusk.accent, '#a5b4fc');
});

test('resolveWidgetThemeSource tracks explicit scope first, then active entry window in all scope, then main fallback', () => {
  const windows = [
    { label: 'main', themeColor: 'amber', isDarkMode: false, uiFontFamily: '맑은고딕', uiFontSize: 10 },
    { label: 'note-1', themeColor: 'periwinkle', isDarkMode: false, uiFontFamily: 'Pretendard', uiFontSize: 12 },
    { label: 'note-2', themeColor: 'sea-glass', isDarkMode: true },
  ];

  // all 범위에서는 현재 표시 중인 D-Day 소속 창을 따른다.
  const fromEntry = resolveWidgetThemeSource(windows, 'all', { windowLabel: 'note-2' });
  assert.equal(fromEntry.sourceLabel, 'note-2');
  assert.equal(fromEntry.themeColor, 'sea-glass');
  assert.equal(fromEntry.isDarkMode, true);
  assert.equal(fromEntry.uiFontFamily, '메이플스토리 L');
  assert.equal(fromEntry.uiFontSize, 10);

  // 항목이 없으면 main 창으로 폴백
  const noEntry = resolveWidgetThemeSource(windows, 'all', null);
  assert.equal(noEntry.sourceLabel, 'main');
  assert.equal(noEntry.themeColor, 'amber');

  // 특정 창 범위 고정 시 현재 항목과 무관하게 선택 창 테마를 따른다.
  const scoped = resolveWidgetThemeSource(windows, 'note-1', { windowLabel: 'note-2' });
  assert.equal(scoped.sourceLabel, 'note-1');
  assert.equal(scoped.themeColor, 'periwinkle');
  assert.equal(scoped.uiFontFamily, 'Pretendard');
  assert.equal(scoped.uiFontSize, 12);

  // 창 목록이 비어 있어도 안전한 기본값 반환
  const empty = resolveWidgetThemeSource([], 'all', null);
  assert.equal(empty.themeColor, 'amber');
  assert.equal(empty.isDarkMode, false);

  assert.equal(resolveExplicitToneHex('rose', '#4f46e5', false), '#e11d48');
  assert.equal(resolveExplicitToneHex('accent', '#4f46e5', false), '#4f46e5');
});
