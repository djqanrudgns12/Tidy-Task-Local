import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME_ID,
  TIDY_THEMES,
  TINY_NOTE_DARK_THEME,
  TINY_NOTE_THEME_SEQUENCE,
  TINY_NOTE_THEMES,
  getTidyTheme,
  getTinyNoteTheme,
  nextTinyNoteThemeState,
  normalizeThemeId,
} from './themes.js';

const LEGACY_IDS = ['white', 'amber', 'blue', 'green', 'rose', 'purple', 'slate'];
const NEW_IDS = ['sea-glass', 'apricot', 'pistachio', 'periwinkle', 'mauve', 'linen', 'kraft', 'sepia'];

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255);
  const [r, g, b] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('Tidy Task는 기존 7종과 신규 8종을 합쳐 정확히 15종이다', () => {
  assert.equal(TIDY_THEMES.length, 15);
  assert.deepEqual(TIDY_THEMES.slice(0, 7).map((theme) => theme.id), LEGACY_IDS);
  assert.deepEqual(TIDY_THEMES.slice(7).map((theme) => theme.id), NEW_IDS);
  assert.equal(new Set(TIDY_THEMES.map((theme) => theme.id)).size, 15);
});

test('Tiny Note는 기존 7종에 씨글라스, 애프리콧, 크라프트만 추가한다', () => {
  assert.deepEqual(
    TINY_NOTE_THEMES.map((theme) => theme.id),
    [...LEGACY_IDS, 'sea-glass', 'apricot', 'kraft'],
  );
});

test('기존 Tiny Note 테마의 색상과 순서는 그대로 유지한다', () => {
  assert.deepEqual(
    TINY_NOTE_THEMES.map((theme) => [theme.id, theme.tinyNote.light, theme.tinyNote.dark]),
    [
      ['white', '#f8fafc', '#1e293b'],
      ['amber', '#fef3c7', '#78350f'],
      ['blue', '#dbeafe', '#1e3a8a'],
      ['green', '#dcfce7', '#14532d'],
      ['rose', '#ffe4e6', '#881337'],
      ['purple', '#f3e8ff', '#4c1d95'],
      ['slate', '#f1f5f9', '#334155'],
      ['sea-glass', '#ddf5ee', '#164e48'],
      ['apricot', '#fde7d7', '#7c2d12'],
      ['kraft', '#eed8ae', '#4a3422'],
    ],
  );
});

test('미드나이트 슬레이트는 Tiny Note 전용 마지막 테마이다', () => {
  assert.equal(TIDY_THEMES.some((theme) => theme.id === TINY_NOTE_DARK_THEME.id), false);
  assert.equal(TINY_NOTE_THEMES.some((theme) => theme.id === TINY_NOTE_DARK_THEME.id), false);
  assert.equal(TINY_NOTE_THEME_SEQUENCE.at(-1), TINY_NOTE_DARK_THEME);
  assert.equal(getTinyNoteTheme(TINY_NOTE_DARK_THEME.id), TINY_NOTE_DARK_THEME);
  assert.equal(normalizeThemeId(TINY_NOTE_DARK_THEME.id, 'tiny-note'), TINY_NOTE_DARK_THEME.id);
});

test('모든 테마는 렌더링에 필요한 Tidy 토큰을 갖는다', () => {
  for (const theme of TIDY_THEMES) {
    assert.ok(theme.label);
    assert.ok(['classic', 'modern', 'paper'].includes(theme.group));
    for (const key of ['bg', 'section', 'border', 'accent', 'accentDark']) {
      assert.match(theme.tidy[key], /^#[0-9a-f]{6}$/i, `${theme.id}.${key}`);
    }
  }
});

test('알 수 없는 저장값은 화면별 기본 앰버로 안전하게 복구한다', () => {
  assert.equal(getTidyTheme('missing').id, DEFAULT_THEME_ID);
  assert.equal(getTinyNoteTheme('pistachio').id, DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId('missing'), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId('sepia', 'tiny-note'), DEFAULT_THEME_ID);
});

test('Tiny Note 순환은 10개 라이트 테마 뒤 다크 모드를 거쳐 처음으로 돌아온다', () => {
  let state = { themeId: 'white', isDarkMode: false };
  const visited = [state.themeId];

  for (let index = 1; index < TINY_NOTE_THEMES.length; index += 1) {
    state = nextTinyNoteThemeState(state.themeId, state.isDarkMode);
    visited.push(state.themeId);
    assert.equal(state.isDarkMode, false);
  }

  assert.deepEqual(visited, TINY_NOTE_THEMES.map((theme) => theme.id));
  state = nextTinyNoteThemeState(state.themeId, state.isDarkMode);
  assert.deepEqual(state, { themeId: TINY_NOTE_DARK_THEME.id, isDarkMode: true });
  state = nextTinyNoteThemeState(state.themeId, state.isDarkMode);
  assert.deepEqual(state, { themeId: 'white', isDarkMode: false });
});

test('신규 강조색은 흰색 버튼 글자와 WCAG AA 4.5:1 이상 대비된다', () => {
  for (const id of NEW_IDS) {
    const theme = getTidyTheme(id);
    assert.ok(
      contrastRatio('#ffffff', theme.tidy.accent) >= 4.5,
      `${theme.label} 강조색 대비가 부족합니다`,
    );
  }
});
