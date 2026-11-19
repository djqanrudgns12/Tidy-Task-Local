// D-Day 컨트롤 패널 전 뷰(목록·카드·배너·편집·설정·보관·빠른메뉴)용 15종 테마 및 UI 글꼴 해석 엔진 (순수 함수)
// CSS light-dark()는 lightningcss 빌드에서 변수가 소실될 수 있으므로 명시적 6자리 Hex 값만 생성합니다.

import { BUILTIN_FONTS } from '../builtinFonts.js';
import { getTidyTheme } from '../themes.js';
import { contrastRatio, ensureContrast, mixHex } from './ddayBadge.js';

const DEFAULT_FONT_NAME = '메이플스토리 L';
const DEFAULT_FONT_STACK = '"메이플스토리 L", "Malgun Gothic", sans-serif';

/**
 * 여러 배경색 위에서 전경색이 모두 최소 대비율을 넘도록 순차 보정합니다.
 * @param {string} inkHex
 * @param {string[]} backgrounds
 * @param {number} [minRatio]
 * @returns {string}
 */
function ensureContrastAgainstAll(inkHex, backgrounds, minRatio = 4.6) {
  let current = inkHex;
  for (const bg of backgrounds) {
    current = ensureContrast(current, bg, minRatio);
  }
  return current;
}

/**
 * CSS font-family 리스트 안의 개별 글꼴 이름을 안전하게 큰따옴표로 감쌉니다.
 * @param {string} familyName
 * @returns {string}
 */
function quoteCssFontName(familyName) {
  const escaped = String(familyName).replace(/["\\]/g, '\\$&');
  return `"${escaped}"`;
}

/**
 * 스냅샷에 저장된 글꼴 이름(`uiFontFamily`)을 실제 CSS font-family 스택으로 변환합니다.
 * - 시스템 기본 글꼴 10종('맑은고딕' 등)은 BUILTIN_FONTS의 name → family 매핑을 정확히 따릅니다.
 * - 사용자 등록 커스텀 글꼴은 창별 registerFontFace 등록 이름과 일치시킵니다.
 * - 삭제되었거나 알 수 없는 이름은 내장 기본 스택으로 안전 폴백합니다.
 * @param {string | null | undefined} fontName
 * @param {ReadonlyArray<{ name: string, family: string }>} [builtinFonts]
 * @param {ReadonlyArray<{ name: string, path?: string }>} [customFonts]
 * @returns {string}
 */
export function resolveUiFontStack(fontName, builtinFonts = BUILTIN_FONTS, customFonts = []) {
  const clean = typeof fontName === 'string' ? fontName.trim() : '';
  if (!clean) return DEFAULT_FONT_STACK;

  const builtin = (builtinFonts || []).find((f) => f?.name === clean);
  if (builtin?.family) return builtin.family;

  const custom = (customFonts || []).find((f) => f?.name === clean);
  if (custom?.name) {
    return `${quoteCssFontName(custom.name)}, "Malgun Gothic", sans-serif`;
  }

  return DEFAULT_FONT_STACK;
}

/**
 * @typedef {{
 *   themeId: string,
 *   themeGroup: string,
 *   dark: boolean,
 *   bg: string,
 *   section: string,
 *   surface: string,
 *   surfaceHover: string,
 *   surfaceMuted: string,
 *   footBg: string,
 *   border: string,
 *   line: string,
 *   ink: string,
 *   sub: string,
 *   muted: string,
 *   accent: string,
 *   accentInk: string,
 *   accentFill: string,
 *   onAccent: string,
 *   accentSoft: string,
 *   accentBorder: string,
 *   toastBg: string,
 *   toastInk: string,
 *   scrollThumb: string,
 *   scrollTrack: string,
 *   headerAccent: string,
 *   headerTint: string,
 *   headerLine: string,
 *   previewStage: string,
 * }} ControlThemeTokens
 */

/**
 * 15개 메모 테마 × 라이트/다크 30조합에 대한 컨트롤 패널 전체 CSS 토큰을 계산합니다.
 * @param {string} [themeColor]
 * @param {boolean} [dark]
 * @returns {ControlThemeTokens}
 */
export function resolveControlThemeTokens(themeColor = 'amber', dark = false) {
  const isDark = Boolean(dark);
  const rawTheme = /** @type {any} */ (getTidyTheme(themeColor));
  const themeId = typeof rawTheme?.id === 'string' ? rawTheme.id : 'amber';
  const themeGroup = typeof rawTheme?.group === 'string' ? rawTheme.group : 'classic';
  const tidy = rawTheme?.tidy || {
    bg: '#fdfaf3',
    section: '#f4ebce',
    border: '#e8ddb7',
    accent: '#d97706',
    accentDark: '#fbbf24',
  };

  const isPaper = themeGroup === 'paper';
  const isNeutral = themeId === 'white' || themeId === 'slate';

  /** @type {string} */
  let bg;
  /** @type {string} */
  let section;
  /** @type {string} */
  let surface;
  /** @type {string} */
  let surfaceHover;
  /** @type {string} */
  let surfaceMuted;
  /** @type {string} */
  let footBg;
  /** @type {string} */
  let border;
  /** @type {string} */
  let line;

  if (isDark) {
    const darkBase = isPaper ? '#23201c' : '#1b1f29';
    bg = isNeutral ? darkBase : mixHex(tidy.accentDark, darkBase, 0.04);
    section = isPaper ? '#181512' : mixHex(bg, '#000000', 0.22);
    surface = isPaper ? '#2d2823' : (isNeutral ? '#242834' : mixHex(tidy.accentDark, '#242834', 0.04));
    surfaceHover = isPaper ? '#36302a' : mixHex('#ffffff', surface, 0.06);
    surfaceMuted = isPaper ? '#3d362f' : mixHex('#ffffff', surface, 0.09);
    border = isPaper ? '#453e37' : (isNeutral ? '#363d4f' : mixHex(tidy.accentDark, '#363d4f', 0.14));
    line = mixHex(border, bg, 0.50);
    footBg = mixHex(section, bg, 0.55);
  } else {
    bg = tidy.bg;
    section = tidy.section;
    surface = isPaper
      ? mixHex('#fffcf4', bg, 0.72)
      : themeGroup === 'modern'
        ? '#fffefd'
        : '#ffffff';
    surfaceHover = isPaper
      ? mixHex('#fffef8', bg, 0.50)
      : themeId === 'white'
        ? '#f4f6f9'
        : mixHex(bg, '#ffffff', 0.45);
    surfaceMuted = themeId === 'white' ? '#f1f3f6' : mixHex(section, surface, 0.48);
    border = themeId === 'white' ? '#d7dce3' : tidy.border;
    line = mixHex(border, bg, 0.55);
    footBg = mixHex(section, bg, 0.38);
  }

  const allSurfaces = [bg, section, surface, surfaceHover, surfaceMuted, footBg];
  const ink = isDark
    ? (isPaper ? '#f5f0e8' : '#eef2f9')
    : (isPaper ? '#292118' : '#1e2430');
  const sub = ensureContrastAgainstAll(mixHex(ink, bg, isDark ? 0.68 : 0.62), allSurfaces, 4.6);
  const muted = ensureContrastAgainstAll(mixHex(ink, bg, isDark ? 0.52 : 0.48), allSurfaces, 4.6);

  const accent = isNeutral
    ? (isDark ? '#9fb3e6' : '#43568a')
    : (isDark ? tidy.accentDark : tidy.accent);
  const accentInk = ensureContrastAgainstAll(accent, [bg, section, surface, footBg, surfaceMuted], 4.6);

  // 다크 모드에서는 파스텔/밝은 강조색 위에서 어두운 잉크(#111827)가 대비율을 높게 확보하도록 정규화합니다.
  const rawFill = isDark
    ? ensureContrast(accent, '#111827', 4.8)
    : ensureContrast(accent, '#ffffff', 4.8);
  const onAccent = contrastRatio(rawFill, '#111827') >= contrastRatio(rawFill, '#ffffff')
    ? '#111827'
    : '#ffffff';
  const accentFill = ensureContrast(rawFill, onAccent, 4.6);

  const accentSoft = mixHex(accent, surface, isDark ? 0.22 : 0.13);
  const accentBorder = mixHex(accentInk, surface, isDark ? 0.46 : 0.36);

  const toastBg = isDark ? (isPaper ? '#f7f1e5' : '#f8fafc') : ink;
  const toastInk = isDark ? (isPaper ? '#241c13' : '#0f172a') : '#ffffff';

  const scrollThumb = isDark
    ? mixHex('#ffffff', bg, 0.24)
    : mixHex(border, ink, 0.22);
  const scrollTrack = 'transparent';

  const previewStage = isDark
    ? '#11131a'
    : (isPaper ? mixHex(section, bg, 0.55) : '#ece7db');

  return {
    themeId,
    themeGroup,
    dark: isDark,
    bg,
    section,
    surface,
    surfaceHover,
    surfaceMuted,
    footBg,
    border,
    line,
    ink,
    sub,
    muted,
    accent,
    accentInk,
    accentFill,
    onAccent,
    accentSoft,
    accentBorder,
    toastBg,
    toastInk,
    scrollThumb,
    scrollTrack,
    headerAccent: accentInk,
    headerTint: accentSoft,
    headerLine: line,
    previewStage,
  };
}

/**
 * ControlThemeTokens 객체를 .ctrl-shell 인라인 스타일 문자열로 직렬화합니다.
 * @param {ControlThemeTokens} t
 * @returns {string}
 */
export function controlThemeToStyle(t) {
  return [
    `--dd-ctrl-bg:${t.bg}`,
    `--dd-ctrl-section:${t.section}`,
    `--dd-ctrl-surface:${t.surface}`,
    `--dd-ctrl-surface-hover:${t.surfaceHover}`,
    `--dd-ctrl-surface-muted:${t.surfaceMuted}`,
    `--dd-ctrl-foot-bg:${t.footBg}`,
    `--dd-ctrl-border:${t.border}`,
    `--dd-ctrl-line:${t.line}`,
    `--dd-ctrl-ink:${t.ink}`,
    `--dd-ctrl-sub:${t.sub}`,
    `--dd-ctrl-muted:${t.muted}`,
    `--dd-accent:${t.accent}`,
    `--dd-accent-ink:${t.accentInk}`,
    `--dd-accent-fill:${t.accentFill}`,
    `--dd-on-accent:${t.onAccent}`,
    `--dd-accent-soft:${t.accentSoft}`,
    `--dd-accent-border:${t.accentBorder}`,
    `--dd-toast-bg:${t.toastBg}`,
    `--dd-toast-ink:${t.toastInk}`,
    `--dd-scroll-thumb:${t.scrollThumb}`,
    `--dd-scroll-track:${t.scrollTrack}`,
    `--header-accent:${t.headerAccent}`,
    `--header-tint:${t.headerTint}`,
    `--header-line:${t.headerLine}`,
    `--dd-preview-stage:${t.previewStage}`,
  ].join(';');
}

export { DEFAULT_FONT_NAME };
