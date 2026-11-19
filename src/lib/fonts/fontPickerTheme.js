// ═══════════════════════════════════════════════════════════════════
// [글꼴 선택 패널 테마 토큰 계산기] D1(에어리 포스트잇) 스킨용 42조합(Tidy 15×2 + Toolkit 6×2) 순수 함수.
//
// 왜 light-dark() / color-mix()를 쓰지 않는가:
//   배포 빌드의 lightningcss 및 인라인 color-scheme 조합에서 변수가 소실되는 회귀가 있었으므로(claude.md),
//   모든 색상을 명시적 6자리 Hex 및 rgba(r,g,b,a)로 직접 계산해 Zero-Halo 내측 림과 WCAG 대비를 보장합니다.
// ═══════════════════════════════════════════════════════════════════

import { getTidyTheme } from '../themes.js';
import { TOOLKIT_THEMES, toolkitColors } from '../toolkit/themes.js';
import { contrastRatio, ensureContrast, mixHex, parseHex } from '../dday/ddayBadge.js';

/**
 * @typedef {'tidy' | 'toolkit'} FontPickerThemeSource
 *
 * @typedef {{
 *   source: FontPickerThemeSource,
 *   themeId: string,
 *   dark: boolean,
 *   surface: string,
 *   catbar: string,
 *   edgeSolid: string,
 *   seam: string,
 *   ink: string,
 *   muted: string,
 *   accent: string,
 *   accentSolid: string,
 *   onAccent: string,
 *   accentInk: string,
 *   accentSoft: string,
 *   accentMed: string,
 *   accentLine: string,
 *   chipBg: string,
 *   line: string,
 *   scroll: string,
 *   scrollHover: string,
 *   fadeColor: string,
 * }} FontPickerThemeTokens
 */

/** @param {string} hex @param {number} alpha */
function rgba(hex, alpha) {
  const { r, g, b } = parseHex(hex);
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/** @param {string} ink @param {string[]} bgs @param {number} [minRatio] */
function ensureContrastAgainstAll(ink, bgs, minRatio = 4.6) {
  let current = ink;
  for (const bg of bgs) {
    current = ensureContrast(current, bg, minRatio);
  }
  return current;
}

/**
 * 툴킷 다크 모드에서 각 테마의 포인트 컬러를 읽기 좋은 파스텔 강조색으로 보정합니다.
 * @type {Record<string, string>}
 */
const TOOLKIT_DARK_ACCENTS = {
  sage: '#5eead4',
  ocean: '#7dd3fc',
  lavender: '#c4b5fd',
  rose: '#fda4af',
  amber: '#fcd34d',
  slate: '#94a3b8',
};

/**
 * Tidy Task(15종) 또는 Toolkit(6종) 테마 + 라이트/다크 조합에 대한 D1(에어리 포스트잇) 토큰을 계산합니다.
 * @param {{ source?: FontPickerThemeSource, themeId?: string, isDarkMode?: boolean }} [params]
 * @returns {FontPickerThemeTokens}
 */
export function resolveFontPickerTokens({
  source = 'tidy',
  themeId = 'amber',
  isDarkMode = false,
} = {}) {
  const dark = Boolean(isDarkMode);
  const resolvedSource = source === 'toolkit' ? 'toolkit' : 'tidy';

  let resolvedId = themeId;
  let baseBg = '#fdfaf3';
  let baseSection = '#f4ebce';
  let baseBorder = '#e8ddb7';
  let rawAccent = '#d97706';
  let rawAccentDark = '#fbbf24';
  let isPaper = false;
  let isNeutral = false;

  if (resolvedSource === 'toolkit') {
    const tkTheme = TOOLKIT_THEMES.find((t) => t.id === themeId) || TOOLKIT_THEMES[0];
    resolvedId = tkTheme.id;
    const tkLight = toolkitColors(tkTheme.id, false);
    baseBg = tkLight.bg;
    baseSection = tkLight.soft;
    baseBorder = tkLight.line;
    rawAccent = tkLight.accent;
    rawAccentDark = TOOLKIT_DARK_ACCENTS[tkTheme.id] || '#93c5fd';
    isNeutral = tkTheme.id === 'slate';
  } else {
    const tidyTheme = /** @type {any} */ (getTidyTheme(themeId));
    resolvedId = typeof tidyTheme?.id === 'string' ? tidyTheme.id : 'amber';
    const tidy = tidyTheme?.tidy || {
      bg: '#fdfaf3',
      section: '#f4ebce',
      border: '#e8ddb7',
      accent: '#d97706',
      accentDark: '#fbbf24',
    };
    baseBg = tidy.bg;
    baseSection = tidy.section;
    baseBorder = tidy.border;
    rawAccent = tidy.accent;
    rawAccentDark = tidy.accentDark;
    isPaper = tidyTheme?.group === 'paper';
    isNeutral = resolvedId === 'white' || resolvedId === 'slate';
  }

  const accent = isNeutral
    ? (dark ? '#93a8d4' : '#43568a')
    : (dark ? rawAccentDark : rawAccent);

  /** @type {string} */
  let surface;
  /** @type {string} */
  let catbar;
  /** @type {string} */
  let edgeSolid;

  if (dark) {
    const baseDark = isPaper ? '#24211d' : '#212530';
    surface = isNeutral ? baseDark : mixHex(accent, baseDark, 0.06);
    catbar = isNeutral ? '#1a1d26' : mixHex(accent, isPaper ? '#1c1916' : '#1a1e28', 0.07);
    edgeSolid = isNeutral ? '#3d4559' : mixHex(accent, '#363c4d', 0.28);
  } else {
    // D1 에어리 포스트잇: 테마의 은은한 색감을 품되 글꼴 가독성이 흐려지지 않도록 밝게 정제합니다.
    surface = isPaper
      ? mixHex('#fffdf7', baseBg, 0.54)
      : resolvedId === 'white'
        ? '#ffffff'
        : mixHex('#ffffff', baseBg, 0.68);
    catbar = resolvedId === 'white'
      ? '#f5f6f8'
      : mixHex(baseSection, '#ffffff', 0.56);
    edgeSolid = resolvedId === 'white'
      ? '#d6dce5'
      : mixHex(baseBorder, accent, 0.78);
  }

  const ink = dark
    ? (isPaper ? '#f3ede3' : '#e8edf5')
    : (isPaper ? '#292118' : '#1e293b');
  const muted = ensureContrastAgainstAll(
    dark ? '#9aa5b8' : '#5b677a',
    [surface, catbar],
    4.6,
  );

  // 호버/선택 행 배경의 실효 불투명 혼합색을 미리 구해 텍스트 대비(>= 4.6:1)를 보증합니다.
  const effectiveHoverBg = mixHex(accent, surface, dark ? 0.16 : 0.12);
  const effectiveSelectedBg = mixHex(accent, surface, dark ? 0.24 : 0.19);
  const accentInk = ensureContrastAgainstAll(
    accent,
    [surface, catbar, effectiveHoverBg, effectiveSelectedBg],
    4.6,
  );

  // 활성 탭·호버 칩 채움색: 다크 파스텔 위에는 어두운 글자, 라이트 강조색 위에는 흰 글자가 4.6:1 이상 나오게 보정
  const rawFill = dark
    ? ensureContrast(accent, '#141822', 4.8)
    : ensureContrast(accent, '#ffffff', 4.6);
  const onAccent = contrastRatio(rawFill, '#141822') >= contrastRatio(rawFill, '#ffffff')
    ? '#141822'
    : '#ffffff';
  const accentSolid = ensureContrast(rawFill, onAccent, 4.6);

  return {
    source: resolvedSource,
    themeId: resolvedId,
    dark,
    surface,
    catbar,
    edgeSolid,
    seam: rgba(accent, dark ? 0.44 : 0.36),
    ink,
    muted,
    accent,
    accentSolid,
    onAccent,
    accentInk,
    accentSoft: rgba(accent, dark ? 0.16 : 0.12),
    accentMed: rgba(accent, dark ? 0.24 : 0.19),
    accentLine: rgba(accent, dark ? 0.46 : 0.36),
    chipBg: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.05)',
    line: dark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.08)',
    scroll: rgba(accent, dark ? 0.32 : 0.26),
    scrollHover: rgba(accent, dark ? 0.56 : 0.50),
    fadeColor: surface,
  };
}

/**
 * 토큰 객체를 인라인 CSS 변수 문자열(`--fp-*`)로 직렬화합니다.
 * @param {FontPickerThemeTokens} t
 * @returns {string}
 */
export function fontPickerThemeToStyle(t) {
  return [
    `--fp-surface:${t.surface}`,
    `--fp-catbar:${t.catbar}`,
    `--fp-edge-solid:${t.edgeSolid}`,
    `--fp-seam:${t.seam}`,
    `--fp-ink:${t.ink}`,
    `--fp-muted:${t.muted}`,
    `--fp-accent:${t.accent}`,
    `--fp-accent-solid:${t.accentSolid}`,
    `--fp-on-accent:${t.onAccent}`,
    `--fp-accent-ink:${t.accentInk}`,
    `--fp-accent-soft:${t.accentSoft}`,
    `--fp-accent-med:${t.accentMed}`,
    `--fp-accent-line:${t.accentLine}`,
    `--fp-chip-bg:${t.chipBg}`,
    `--fp-line:${t.line}`,
    `--fp-scroll:${t.scroll}`,
    `--fp-scroll-hover:${t.scrollHover}`,
    `--fp-fade-color:${t.fadeColor}`,
  ].join(';');
}

/**
 * `--fp-*` CSS 변수 선언 문자열만 허용하고 외부 URL/괄호/중괄호 주입을 차단합니다.
 * @param {unknown} v
 * @returns {string}
 */
export function sanitizeFontPickerThemeStyle(v) {
  if (typeof v !== 'string' || !v.trim() || v.length > 4096) return '';
  if (/[{}<>\\]/.test(v)) return '';
  const safeParts = [];
  for (const decl of v.split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    if (/^--fp-[a-z0-9-]+:\s*(?:rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[0-9.]+)?\s*\)|#[0-9a-f]{3,8})$/i.test(trimmed)) {
      safeParts.push(trimmed);
    }
  }
  return safeParts.join(';');
}
