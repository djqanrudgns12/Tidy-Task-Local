// D-Day 데스크톱 위젯 & 독립 설정 팝업 공용 15종 테마 토큰 엔진 (순수 함수)
// CSS light-dark()는 빌드(lightningcss) 시 변수가 지워질 수 있으므로 명시적 6자리 Hex 값만 생성합니다.

import { getTidyTheme, normalizeThemeId } from '../themes.js';
import { ensureContrast, mixHex } from './ddayBadge.js';

/** @typedef {import('./ddayModel.js').DdayAppearanceMode} DdayAppearanceMode */
/** @typedef {import('./ddayModel.js').DdayToneId} DdayToneId */

/** @type {Readonly<Record<string, Readonly<{ light: string, dark: string }>>>} */
const EXPLICIT_TONE_HEX = Object.freeze({
  emerald: Object.freeze({ light: '#059669', dark: '#34d399' }),
  sky: Object.freeze({ light: '#2563eb', dark: '#60a5fa' }),
  lilac: Object.freeze({ light: '#7c3aed', dark: '#c084fc' }),
  rose: Object.freeze({ light: '#e11d48', dark: '#fb7185' }),
  gold: Object.freeze({ light: '#b45309', dark: '#fbbf24' }),
});

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
 * @typedef {{
 *   sourceLabel: string,
 *   themeColor: string,
 *   isDarkMode: boolean,
 *   uiFontFamily: string,
 *   uiFontSize: number,
 * }} WidgetThemeSource
 */

/**
 * 위젯의 표시 범위(`displayScope`)와 현재 카드(`currentEntry`)에 따라 연동할 메모 창 테마 원천을 고릅니다.
 * - 특정 창 선택: 해당 창 우선
 * - 'all' 선택: 현재 화면에 보이는 D-Day 항목의 소속 메모 창 → main → windows[0] → 기본('amber' 라이트)
 * - 툴킷 다크 모드(`systemDark`)는 섞지 않고 오직 메모 창의 `(themeColor, isDarkMode)`만 따릅니다.
 * @param {ReadonlyArray<{ label?: string, themeColor?: string, isDarkMode?: boolean, uiFontFamily?: string, uiFontSize?: number }>} windows
 * @param {string} [displayScope]
 * @param {{ windowLabel?: string } | null} [currentEntry]
 * @returns {WidgetThemeSource}
 */
export function resolveWidgetThemeSource(windows, displayScope = 'all', currentEntry = null) {
  const list = Array.isArray(windows) ? windows.filter(Boolean) : [];
  const mainWin = list.find((w) => w.label === 'main') || list[0] || null;
  let picked = null;

  if (typeof displayScope === 'string' && displayScope && displayScope !== 'all') {
    picked = list.find((w) => w.label === displayScope) || null;
  } else if (currentEntry?.windowLabel) {
    picked = list.find((w) => w.label === currentEntry.windowLabel) || null;
  }

  const resolved = picked || mainWin;
  const rawSize = Number(resolved?.uiFontSize);

  return {
    sourceLabel: typeof resolved?.label === 'string' && resolved.label ? resolved.label : 'main',
    themeColor: normalizeThemeId(resolved?.themeColor || 'amber'),
    isDarkMode: Boolean(resolved?.isDarkMode),
    uiFontFamily:
      typeof resolved?.uiFontFamily === 'string' && resolved.uiFontFamily.trim()
        ? resolved.uiFontFamily.trim()
        : '메이플스토리 L',
    uiFontSize: Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 10,
  };
}

/**
 * 6종 D-Day 톤에 맞는 명시적 6자리 Hex 색상을 반환합니다 (`accent`는 테마 강조색 사용).
 * @param {unknown} tone
 * @param {string} themeAccent
 * @param {boolean} dark
 * @returns {string}
 */
export function resolveExplicitToneHex(tone, themeAccent, dark) {
  if (typeof tone === 'string' && tone !== 'accent' && EXPLICIT_TONE_HEX[tone]) {
    return dark ? EXPLICIT_TONE_HEX[tone].dark : EXPLICIT_TONE_HEX[tone].light;
  }
  return themeAccent;
}

/**
 * @typedef {{
 *   effectiveDark: boolean,
 *   themeId: string,
 *   themeGroup: string,
 *   cardBg: string,
 *   cardSection: string,
 *   cardSurface: string,
 *   w4FrameBg: string,
 *   border: string,
 *   highlight: string,
 *   ink: string,
 *   muted: string,
 *   accent: string,
 *   accentInk: string,
 *   accentFill: string,
 *   onAccent: string,
 *   accentSoft: string,
 *   accentLine: string,
 *   tone: string,
 *   toneInk: string,
 *   toneSoft: string,
 *   toneLine: string,
 *   imminentInk: string,
 *   overdueInk: string,
 *   matStart: string,
 *   matEnd: string,
 *   matDot: string,
 *   matBorder: string,
 *   matDateBg: string,
 *   matDateInk: string,
 *   stack1: string,
 *   stack2: string,
 *   ringStroke: string,
 *   ringHighlight: string,
 *   ringHole: string,
 *   tapeFill: string,
 *   tapeStripe: string,
 *   dockBg: string,
 *   dockLine: string,
 *   navBg: string,
 *   navHoverBg: string,
 *   flapTop: string,
 *   flapBottom: string,
 *   hingeLine: string,
 *   menuBg: string,
 *   menuHeadBg: string,
 *   menuSecBg: string,
 *   menuSecBorder: string,
 *   menuTrack: string,
 *   menuHover: string,
 *   menuKnobOff: string,
 *   menuWarnBg: string,
 *   menuWarnBorder: string,
 *   menuWarnInk: string,
 * }} WidgetThemeTokens
 */

/**
 * 15종 테마 × 3종 배경 모드(auto/light/dark) × 라이트/다크 × 6종 D-Day 톤 조합의 위젯 색상 토큰을 계산합니다.
 * @param {{
 *   themeColor?: string,
 *   isDarkMode?: boolean,
 *   appearanceMode?: DdayAppearanceMode | string,
 *   itemTone?: DdayToneId | string,
 *   previewDarkOverride?: boolean | null,
 * }} [input]
 * @returns {WidgetThemeTokens}
 */
export function resolveWidgetThemeTokens({
  themeColor = 'amber',
  isDarkMode = false,
  appearanceMode = 'auto',
  itemTone = 'accent',
  previewDarkOverride = null,
} = {}) {
  const mode = appearanceMode === 'light' || appearanceMode === 'dark' ? appearanceMode : 'auto';
  const effectiveDark =
    typeof previewDarkOverride === 'boolean'
      ? previewDarkOverride
      : mode === 'dark'
        ? true
        : mode === 'light'
          ? false
          : Boolean(isDarkMode);

  const themeObj = /** @type {any} */ (getTidyTheme(themeColor));
  const themeId = typeof themeObj?.id === 'string' ? themeObj.id : 'amber';
  const themeGroup = typeof themeObj?.group === 'string' ? themeObj.group : 'classic';
  const tidy = themeObj?.tidy || {
    bg: '#fdfaf3',
    section: '#f4ebce',
    border: '#e8ddb7',
    accent: '#d97706',
    accentDark: '#fbbf24',
  };

  /** @type {string} */
  let cardBg;
  /** @type {string} */
  let cardSection;
  /** @type {string} */
  let cardSurface;
  /** @type {string} */
  let w4FrameBg;
  /** @type {string} */
  let border;
  /** @type {string} */
  let highlight;

  if (mode === 'light') {
    cardBg = '#fffdf8';
    cardSection = '#f5eee0';
    cardSurface = '#ffffff';
    w4FrameBg = '#fffdf8';
    border = '#dfd5c0';
    highlight = '#ffffff';
  } else if (mode === 'dark') {
    cardBg = '#212531';
    cardSection = '#282d3c';
    cardSurface = '#2a3040';
    w4FrameBg = '#212531';
    border = '#3c4356';
    highlight = '#313749';
  } else if (effectiveDark) {
    const baseDark = themeGroup === 'paper' ? '#25211c' : '#1f2431';
    cardBg = mixHex(tidy.accentDark, baseDark, 0.05);
    cardSection = mixHex(tidy.accentDark, baseDark, 0.11);
    cardSurface = mixHex('#ffffff', cardBg, 0.06);
    w4FrameBg = mixHex(tidy.accentDark, baseDark, 0.06);
    border = mixHex('#ffffff', cardBg, 0.17);
    highlight = mixHex('#ffffff', cardBg, 0.10);
  } else {
    cardBg = tidy.bg;
    cardSection = tidy.section;
    cardSurface = themeGroup === 'paper' ? mixHex('#ffffff', cardBg, 0.58) : '#ffffff';
    w4FrameBg = themeGroup === 'paper' ? mixHex('#fffaf0', cardBg, 0.42) : mixHex('#ffffff', cardBg, 0.36);
    border = themeId === 'white' ? '#d7dce3' : mixHex(tidy.border, '#0f172a', 0.94);
    highlight = mixHex('#ffffff', cardBg, 0.85);
  }

  const isNeutral = themeId === 'white' || themeId === 'slate';
  const accent = isNeutral
    ? effectiveDark
      ? '#9fb3e6'
      : '#43568a'
    : effectiveDark
      ? tidy.accentDark
      : tidy.accent;

  const accentInk = ensureContrastAgainstAll(accent, [cardBg, cardSection, cardSurface], 4.6);
  const accentFill = effectiveDark
    ? ensureContrast(accent, '#111827', 5.0)
    : ensureContrast(accent, '#ffffff', 4.6);
  const onAccent = effectiveDark ? '#111827' : '#ffffff';
  const accentSoft = mixHex(accent, cardSurface, effectiveDark ? 0.20 : 0.12);
  const accentLine = mixHex(accent, cardSurface, effectiveDark ? 0.44 : 0.34);

  const tone = resolveExplicitToneHex(itemTone, accent, effectiveDark);
  const toneSoft = mixHex(tone, cardSurface, effectiveDark ? 0.22 : 0.12);
  const toneLine = mixHex(tone, cardSurface, effectiveDark ? 0.40 : 0.28);

  const matStart = effectiveDark ? mixHex(tone, cardBg, 0.26) : mixHex(tone, cardSection, 0.22);
  const matEnd = effectiveDark ? mixHex(tone, cardBg, 0.10) : mixHex(tone, cardSurface, 0.09);
  const matDot = mixHex(tone, matStart, effectiveDark ? 0.36 : 0.24);
  const matBorder = mixHex(tone, border, 0.35);
  const matDateBg = effectiveDark
    ? mixHex('#0f172a', cardBg, 0.52)
    : mixHex('#ffffff', cardSurface, 0.88);

  const toneInk = ensureContrastAgainstAll(tone, [cardSurface, matStart, matEnd, cardBg], 4.6);
  const imminentInk = ensureContrastAgainstAll(
    effectiveDark ? '#fda4af' : '#be123c',
    [cardSurface, matStart, matEnd, cardBg],
    4.6,
  );
  const overdueInk = ensureContrastAgainstAll(
    effectiveDark ? '#cbd5e1' : '#475569',
    [cardSurface, matStart, matEnd, cardBg],
    4.6,
  );

  const ink = ensureContrastAgainstAll(
    effectiveDark ? '#f1f5f9' : '#1e2430',
    [cardBg, cardSection, cardSurface, w4FrameBg],
    7.0,
  );
  const muted = ensureContrastAgainstAll(
    effectiveDark ? '#a8b3c7' : '#526074',
    [cardBg, cardSection, cardSurface, w4FrameBg],
    4.6,
  );
  const matDateInk = ensureContrast(effectiveDark ? '#e2e8f0' : '#334155', matDateBg, 4.6);

  const stack1 = mixHex(border, cardBg, 0.55);
  const stack2 = mixHex(border, cardBg, 0.82);
  const ringStroke = effectiveDark ? '#94a3b8' : '#64748b';
  const ringHighlight = effectiveDark ? '#e2e8f0' : '#ffffff';
  const ringHole = effectiveDark ? '#12151e' : mixHex(border, '#334155', 0.55);

  const tapeFill =
    mode === 'light'
      ? '#f7d469'
      : mode === 'dark'
        ? '#b87a24'
        : effectiveDark
          ? mixHex(tone, '#1e2430', 0.55)
          : mixHex(tone, '#ffffff', 0.38);
  const tapeStripe = effectiveDark
    ? mixHex('#ffffff', tapeFill, 0.16)
    : mixHex('#ffffff', tapeFill, 0.42);

  const dockBg = effectiveDark ? 'rgba(24, 28, 38, 0.86)' : 'rgba(255, 255, 255, 0.88)';
  const dockLine = effectiveDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.11)';

  const navBg = effectiveDark
    ? mixHex('#ffffff', cardBg, 0.09)
    : mixHex('#0f172a', cardBg, 0.06);
  const navHoverBg = effectiveDark
    ? mixHex('#ffffff', cardBg, 0.16)
    : mixHex('#0f172a', cardBg, 0.12);

  const flapTop = effectiveDark
    ? mixHex(tone, cardSurface, 0.18)
    : mixHex(tone, cardSurface, 0.09);
  const flapBottom = effectiveDark
    ? mixHex('#0f172a', cardSurface, 0.18)
    : mixHex(cardSection, cardSurface, 0.42);
  const hingeLine = effectiveDark
    ? mixHex('#000000', cardSurface, 0.36)
    : mixHex('#0f172a', cardSurface, 0.10);

  const menuBg = cardBg;
  const menuHeadBg = cardSection;
  const menuSecBg = effectiveDark
    ? mixHex('#ffffff', cardBg, 0.045)
    : mixHex('#ffffff', cardBg, 0.76);
  const menuSecBorder = mixHex(border, cardBg, 0.65);
  const menuTrack = effectiveDark
    ? mixHex('#ffffff', cardBg, 0.08)
    : mixHex('#0f172a', cardBg, 0.06);
  const menuHover = effectiveDark
    ? mixHex('#ffffff', cardBg, 0.09)
    : mixHex('#0f172a', cardBg, 0.06);
  const menuKnobOff = effectiveDark ? '#475569' : mixHex('#64748b', cardBg, 0.42);
  const menuWarnBg = effectiveDark ? '#3f2e17' : '#fef3c7';
  const menuWarnBorder = effectiveDark ? '#92400e' : '#f59e0b';
  const menuWarnInk = ensureContrast(effectiveDark ? '#fcd34d' : '#92400e', menuWarnBg, 4.6);

  return {
    effectiveDark,
    themeId,
    themeGroup,
    cardBg,
    cardSection,
    cardSurface,
    w4FrameBg,
    border,
    highlight,
    ink,
    muted,
    accent,
    accentInk,
    accentFill,
    onAccent,
    accentSoft,
    accentLine,
    tone,
    toneInk,
    toneSoft,
    toneLine,
    imminentInk,
    overdueInk,
    matStart,
    matEnd,
    matDot,
    matBorder,
    matDateBg,
    matDateInk,
    stack1,
    stack2,
    ringStroke,
    ringHighlight,
    ringHole,
    tapeFill,
    tapeStripe,
    dockBg,
    dockLine,
    navBg,
    navHoverBg,
    flapTop,
    flapBottom,
    hingeLine,
    menuBg,
    menuHeadBg,
    menuSecBg,
    menuSecBorder,
    menuTrack,
    menuHover,
    menuKnobOff,
    menuWarnBg,
    menuWarnBorder,
    menuWarnInk,
  };
}

/**
 * 토큰 객체를 위젯·팝업 루트에 붙일 인라인 `--dw-*` CSS 변수 문자열로 직렬화합니다.
 * @param {WidgetThemeTokens} t
 * @returns {string}
 */
export function widgetThemeToStyle(t) {
  return [
    `--dw-card-bg:${t.cardBg}`,
    `--dw-card-section:${t.cardSection}`,
    `--dw-card-surface:${t.cardSurface}`,
    `--dw-w4-frame:${t.w4FrameBg}`,
    `--dw-border:${t.border}`,
    `--dw-highlight:${t.highlight}`,
    `--dw-ink:${t.ink}`,
    `--dw-muted:${t.muted}`,
    `--dw-accent:${t.accent}`,
    `--dw-accent-ink:${t.accentInk}`,
    `--dw-accent-fill:${t.accentFill}`,
    `--dw-on-accent:${t.onAccent}`,
    `--dw-accent-soft:${t.accentSoft}`,
    `--dw-accent-line:${t.accentLine}`,
    `--dw-tone:${t.tone}`,
    `--dw-tone-ink:${t.toneInk}`,
    `--dw-tone-soft:${t.toneSoft}`,
    `--dw-tone-line:${t.toneLine}`,
    `--dw-imminent-ink:${t.imminentInk}`,
    `--dw-overdue-ink:${t.overdueInk}`,
    `--dw-mat-start:${t.matStart}`,
    `--dw-mat-end:${t.matEnd}`,
    `--dw-mat-dot:${t.matDot}`,
    `--dw-mat-border:${t.matBorder}`,
    `--dw-mat-date-bg:${t.matDateBg}`,
    `--dw-mat-date-ink:${t.matDateInk}`,
    `--dw-stack-1:${t.stack1}`,
    `--dw-stack-2:${t.stack2}`,
    `--dw-ring-stroke:${t.ringStroke}`,
    `--dw-ring-highlight:${t.ringHighlight}`,
    `--dw-ring-hole:${t.ringHole}`,
    `--dw-tape-fill:${t.tapeFill}`,
    `--dw-tape-stripe:${t.tapeStripe}`,
    `--dw-dock-bg:${t.dockBg}`,
    `--dw-dock-line:${t.dockLine}`,
    `--dw-nav-bg:${t.navBg}`,
    `--dw-nav-hover-bg:${t.navHoverBg}`,
    `--dw-flap-top:${t.flapTop}`,
    `--dw-flap-bottom:${t.flapBottom}`,
    `--dw-hinge-line:${t.hingeLine}`,
    `--dw-menu-bg:${t.menuBg}`,
    `--dw-menu-head-bg:${t.menuHeadBg}`,
    `--dw-menu-sec-bg:${t.menuSecBg}`,
    `--dw-menu-sec-border:${t.menuSecBorder}`,
    `--dw-menu-track:${t.menuTrack}`,
    `--dw-menu-hover:${t.menuHover}`,
    `--dw-menu-knob-off:${t.menuKnobOff}`,
    `--dw-menu-warn-bg:${t.menuWarnBg}`,
    `--dw-menu-warn-border:${t.menuWarnBorder}`,
    `--dw-menu-warn-ink:${t.menuWarnInk}`,
  ].join(';');
}
