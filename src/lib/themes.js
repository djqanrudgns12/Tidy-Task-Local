export const DEFAULT_THEME_ID = 'amber';

export const THEME_GROUPS = Object.freeze([
  { id: 'classic', label: '클래식' },
  { id: 'modern', label: '모던' },
  { id: 'paper', label: '페이퍼' },
]);

// 테마를 사용하는 모든 창이 이 레지스트리 하나를 공유합니다.
// tinyNote가 없는 테마는 Tidy Task 전용이며 Tiny Note 순환에는 포함되지 않습니다.
export const TIDY_THEMES = Object.freeze([
  {
    id: 'white', label: '퓨어 프로스트', detail: '화이트', group: 'classic',
    tidy: { bg: '#ffffff', section: '#f4f5f7', border: '#e5e7eb', accent: '#475569', accentDark: '#94a3b8' },
    tinyNote: { light: '#f8fafc', dark: '#1e293b', tapeLight: 'rgba(0,0,0,0.04)', tapeDark: 'rgba(255,255,255,0.06)' },
  },
  {
    id: 'amber', label: '샴페인 앰버', group: 'classic',
    tidy: { bg: '#fdfaf3', section: '#f4ebce', border: '#e8ddb7', accent: '#d97706', accentDark: '#fbbf24' },
    tinyNote: { light: '#fef3c7', dark: '#78350f', tapeLight: 'rgba(0,0,0,0.06)', tapeDark: 'rgba(255,255,255,0.08)' },
  },
  {
    id: 'blue', label: '노르딕 블루', group: 'classic',
    tidy: { bg: '#f0f7ff', section: '#dceefb', border: '#c4e1f6', accent: '#2563eb', accentDark: '#60a5fa' },
    tinyNote: { light: '#dbeafe', dark: '#1e3a8a', tapeLight: 'rgba(0,0,0,0.05)', tapeDark: 'rgba(255,255,255,0.08)' },
  },
  {
    id: 'green', label: '세이지 가든', group: 'classic',
    tidy: { bg: '#f2fbf5', section: '#e0f5e7', border: '#c7ecd5', accent: '#059669', accentDark: '#34d399' },
    tinyNote: { light: '#dcfce7', dark: '#14532d', tapeLight: 'rgba(0,0,0,0.06)', tapeDark: 'rgba(255,255,255,0.08)' },
  },
  {
    id: 'rose', label: '더스티 로즈', group: 'classic',
    tidy: { bg: '#fff7f8', section: '#fae3e7', border: '#f2c9d1', accent: '#e11d48', accentDark: '#fb7185' },
    tinyNote: { light: '#ffe4e6', dark: '#881337', tapeLight: 'rgba(0,0,0,0.05)', tapeDark: 'rgba(255,255,255,0.08)' },
  },
  {
    id: 'purple', label: '라벤더 미스트', group: 'classic',
    tidy: { bg: '#f9f7ff', section: '#ede7fa', border: '#ddd3f5', accent: '#7c3aed', accentDark: '#a78bfa' },
    tinyNote: { light: '#f3e8ff', dark: '#4c1d95', tapeLight: 'rgba(0,0,0,0.05)', tapeDark: 'rgba(255,255,255,0.08)' },
  },
  {
    id: 'slate', label: '클라우디 슬레이트', group: 'classic',
    tidy: { bg: '#f8fafc', section: '#eef2f6', border: '#dce3ea', accent: '#475569', accentDark: '#94a3b8' },
    tinyNote: { light: '#f1f5f9', dark: '#334155', tapeLight: 'rgba(0,0,0,0.05)', tapeDark: 'rgba(255,255,255,0.08)' },
  },
  {
    id: 'sea-glass', label: '씨글라스 틸', group: 'modern',
    tidy: { bg: '#f2fbf9', section: '#dcf3ee', border: '#bfe4db', accent: '#0f766e', accentDark: '#5eead4' },
    tinyNote: { light: '#ddf5ee', dark: '#164e48', tapeLight: 'rgba(15,118,110,0.10)', tapeDark: 'rgba(153,246,228,0.10)' },
  },
  {
    id: 'apricot', label: '애프리콧 베일', group: 'modern',
    tidy: { bg: '#fff8f3', section: '#fbe8da', border: '#f2ceb8', accent: '#c2410c', accentDark: '#fdba74' },
    tinyNote: { light: '#fde7d7', dark: '#7c2d12', tapeLight: 'rgba(194,65,12,0.09)', tapeDark: 'rgba(254,215,170,0.10)' },
  },
  {
    id: 'pistachio', label: '피스타치오 밀크', group: 'modern',
    tidy: { bg: '#fafcef', section: '#ecf3d2', border: '#d6e2ab', accent: '#4d7c0f', accentDark: '#bef264' },
  },
  {
    id: 'periwinkle', label: '페리윙클 에어', group: 'modern',
    tidy: { bg: '#f6f7ff', section: '#e5e8fa', border: '#cdd2f1', accent: '#4f46e5', accentDark: '#a5b4fc' },
  },
  {
    id: 'mauve', label: '모브 헤이즈', group: 'modern',
    tidy: { bg: '#fcf8fb', section: '#f0e4ec', border: '#dfc9d7', accent: '#8b4662', accentDark: '#f0a6c2' },
  },
  {
    id: 'linen', label: '리넨 페이지', group: 'paper',
    tidy: { bg: '#fcfaf3', section: '#f1ebdb', border: '#d9cfb8', accent: '#6b5b3e', accentDark: '#d6c6a5' },
  },
  {
    id: 'kraft', label: '크라프트 메모어', group: 'paper',
    tidy: { bg: '#f7e9cf', section: '#e8d1a7', border: '#ceae78', accent: '#6f4a1f', accentDark: '#e4bd7d' },
    tinyNote: { light: '#eed8ae', dark: '#4a3422', tapeLight: 'rgba(111,74,31,0.12)', tapeDark: 'rgba(255,242,214,0.10)' },
  },
  {
    id: 'sepia', label: '세피아 저널', group: 'paper',
    tidy: { bg: '#f4ece2', section: '#e3d4c4', border: '#c8b29d', accent: '#6b4f3b', accentDark: '#d8b99f' },
  },
]);

const THEME_BY_ID = new Map(TIDY_THEMES.map((theme) => [theme.id, theme]));

export const TINY_NOTE_THEMES = Object.freeze(
  TIDY_THEMES.filter((theme) => Boolean(theme.tinyNote)),
);

// 기존 Tiny Note의 마지막 슬레이트 다크 색감을 독립 테마로 보존합니다.
// Tidy Task의 15개 테마나 Tiny Note의 10개 라이트 테마에는 섞지 않습니다.
export const TINY_NOTE_DARK_THEME = Object.freeze({
  id: 'tiny-dark',
  label: '미드나이트 슬레이트',
  group: 'dark',
  tinyNote: {
    light: '#334155',
    dark: '#334155',
    tapeLight: 'rgba(255,255,255,0.08)',
    tapeDark: 'rgba(255,255,255,0.08)',
  },
});

export const TINY_NOTE_THEME_SEQUENCE = Object.freeze([
  ...TINY_NOTE_THEMES,
  TINY_NOTE_DARK_THEME,
]);

const TINY_NOTE_THEME_BY_ID = new Map(
  TINY_NOTE_THEME_SEQUENCE.map((theme) => [theme.id, theme]),
);

export function getTidyTheme(themeId) {
  return THEME_BY_ID.get(themeId) || THEME_BY_ID.get(DEFAULT_THEME_ID);
}

export function getTinyNoteTheme(themeId) {
  return TINY_NOTE_THEME_BY_ID.get(themeId) || THEME_BY_ID.get(DEFAULT_THEME_ID);
}

export function getThemeAccent(themeId, isDarkMode = false) {
  const tokens = getTidyTheme(themeId).tidy;
  return isDarkMode ? tokens.accentDark : tokens.accent;
}

export function normalizeThemeId(themeId, surface = 'tidy') {
  return surface === 'tiny-note'
    ? getTinyNoteTheme(themeId).id
    : getTidyTheme(themeId).id;
}

export function isTinyNoteDarkTheme(themeId) {
  return themeId === TINY_NOTE_DARK_THEME.id;
}

export function nextTinyNoteThemeState(themeId, isDarkMode = false) {
  if (isDarkMode || isTinyNoteDarkTheme(themeId)) {
    return { themeId: TINY_NOTE_THEMES[0].id, isDarkMode: false };
  }

  const index = TINY_NOTE_THEMES.findIndex((theme) => theme.id === themeId);
  if (index < 0) {
    return { themeId: TINY_NOTE_THEMES[0].id, isDarkMode: false };
  }
  if (index === TINY_NOTE_THEMES.length - 1) {
    return { themeId: TINY_NOTE_DARK_THEME.id, isDarkMode: true };
  }
  return { themeId: TINY_NOTE_THEMES[index + 1].id, isDarkMode: false };
}
