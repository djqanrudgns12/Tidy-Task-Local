import { getTidyTheme } from '../themes.js';
import {
  calendarDiffDays,
  computeDdayCounter,
  formatDotDate,
  resolveEffectiveTargetDate,
} from './ddayModel.js';
import { parseDateKey } from '../datePicker/calendarModel.js';

/**
 * @typedef {import('./ddayModel.js').DdayItem} DdayItem
 * @typedef {import('./ddayModel.js').DdayToneId} DdayToneId
 * @typedef {'countdown-upcoming' | 'countdown-week' | 'countdown-imminent' | 'countdown-today' | 'countdown-overdue' | 'since-counting' | 'since-scheduled'} DdayBadgeKind
 * @typedef {'hourglass-mini' | 'bell-spark' | 'star-burst' | 'clock-past' | 'loop-mini' | 'sprout-mini' | 'seed-plus'} DdayBadgeGlyph
 * @typedef {'normal' | 'imminent' | 'today' | 'muted' | 'soft'} DdayBadgeEmphasis
 *
 * @typedef {{
 *   bg: string,
 *   hoverBg: string,
 *   border: string,
 *   hoverBorder: string,
 *   rim: string,
 *   ink: string,
 *   iconPrimary: string,
 *   iconSecondary: string,
 *   focus: string,
 *   solid: boolean,
 *   dashed: boolean,
 * }} DdayBadgePalette
 *
 * @typedef {{
 *   badgeKind: DdayBadgeKind,
 *   glyph: DdayBadgeGlyph,
 *   isRepeat: boolean,
 *   label: string,
 *   dashed: boolean,
 *   emphasis: DdayBadgeEmphasis,
 *   title: string,
 *   ariaLabel: string,
 *   palette: DdayBadgePalette,
 * }} DdayTodoBadgeModel
 *
 * @typedef {'idle' | 'countdown' | 'since'} DdayControlGlyphMode
 * @typedef {'none' | 'normal' | 'imminent' | 'today' | 'overdue' | 'counting' | 'scheduled'} DdayControlGlyphUrgency
 *
 * @typedef {{
 *   bodyFill: string,
 *   headerFill: string,
 *   stroke: string,
 *   letter: string,
 *   dotColor: string,
 *   dotRing: string,
 *   showDot: boolean,
 *   sparkleDot: boolean,
 * }} DdayControlGlyphPalette
 *
 * @typedef {{
 *   mode: DdayControlGlyphMode,
 *   sign: '-' | '+',
 *   badgeText: 'D-' | 'D+',
 *   urgency: DdayControlGlyphUrgency,
 *   tone: DdayToneId,
 *   activeCount: number,
 *   topBadge: DdayTodoBadgeModel | null,
 *   palette: DdayControlGlyphPalette,
 * }} DdayControlGlyphState
 */

/** @type {readonly DdayBadgeKind[]} */
export const DDAY_BADGE_KINDS = Object.freeze([
  'countdown-upcoming',
  'countdown-week',
  'countdown-imminent',
  'countdown-today',
  'countdown-overdue',
  'since-counting',
  'since-scheduled',
]);

/** @type {Record<string, { light: { primary: string, ink: string, soft: string }, dark: { primary: string, ink: string, soft: string } }>} */
const EXPLICIT_TONE_SPECS = {
  emerald: {
    light: { primary: '#059669', ink: '#047857', soft: '#a7f3d0' },
    dark: { primary: '#34d399', ink: '#6ee7b7', soft: '#14533c' },
  },
  sky: {
    light: { primary: '#2563eb', ink: '#1d4ed8', soft: '#bfdbfe' },
    dark: { primary: '#60a5fa', ink: '#93c5fd', soft: '#1d3a68' },
  },
  lilac: {
    light: { primary: '#7c3aed', ink: '#6d28d9', soft: '#ddd6fe' },
    dark: { primary: '#a78bfa', ink: '#c4b5fd', soft: '#3a246b' },
  },
  rose: {
    light: { primary: '#e11d48', ink: '#be123c', soft: '#fecdd3' },
    dark: { primary: '#fb7185', ink: '#fda4af', soft: '#5f1d2e' },
  },
  gold: {
    light: { primary: '#b45309', ink: '#854d0e', soft: '#fde68a' },
    dark: { primary: '#fbbf24', ink: '#fde68a', soft: '#543c12' },
  },
};

/** @param {number} n */
function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * #rgb 또는 #rrggbb 16진수 색상을 RGB 객체로 파싱합니다.
 * @param {unknown} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function parseHex(hex) {
  const raw = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : '';
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return { r: 71, g: 85, b: 105 };
}

/**
 * RGB 객체를 #rrggbb 소문자 16진수 문자열로 바꿉니다.
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {string}
 */
export function rgbToHex({ r, g, b }) {
  const toHex = (/** @type {number} */ v) => clampByte(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 두 색상을 전경 가중치(fgWeight: 0..1)로 선형 sRGB 혼합합니다.
 * @param {string} fgHex
 * @param {string} bgHex
 * @param {number} fgWeight
 * @returns {string}
 */
export function mixHex(fgHex, bgHex, fgWeight) {
  const w = Math.max(0, Math.min(1, Number(fgWeight) || 0));
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  return rgbToHex({
    r: fg.r * w + bg.r * (1 - w),
    g: fg.g * w + bg.g * (1 - w),
    b: fg.b * w + bg.b * (1 - w),
  });
}

/**
 * WCAG 2.1 상대 휘도(0..1)를 계산합니다.
 * @param {string} hex
 * @returns {number}
 */
export function relativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  const toLinear = (/** @type {number} */ c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * 두 16진수 색상의 WCAG 대비율(1..21)을 반환합니다.
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * 배경색(bgHex) 위에서 전경색(inkHex)이 최소 대비율(minRatio)을 넘도록 명도를 단계 보정합니다.
 * 왜 필요한가: 노란 계열(amber·gold·pistachio·linen)이나 다크 파스텔은 단순 혼합만으로 4.5:1에 못 미칠 수 있어
 * 15테마×6톤×7상태 전 조합에서 읽기 쉬운 대비를 자동으로 보장하기 위함입니다.
 * @param {string} inkHex
 * @param {string} bgHex
 * @param {number} [minRatio]
 * @returns {string}
 */
export function ensureContrast(inkHex, bgHex, minRatio = 4.5) {
  const start = rgbToHex(parseHex(inkHex));
  if (contrastRatio(start, bgHex) >= minRatio) return start;

  const darkPole = '#0f172a';
  const lightPole = '#ffffff';
  const pole = contrastRatio(darkPole, bgHex) >= contrastRatio(lightPole, bgHex) ? darkPole : lightPole;

  for (let step = 1; step <= 50; step += 1) {
    const candidate = mixHex(pole, start, step / 50);
    if (contrastRatio(candidate, bgHex) >= minRatio) return candidate;
  }
  return pole;
}

/**
 * @param {string} themeColor
 * @returns {{ id: string, group: string, bg: string, accent: string, accentDark: string }}
 */
function readThemeMeta(themeColor) {
  const raw = /** @type {any} */ (getTidyTheme(themeColor));
  const tidy = raw?.tidy || {};
  return {
    id: typeof raw?.id === 'string' ? raw.id : 'amber',
    group: typeof raw?.group === 'string' ? raw.group : 'classic',
    bg: typeof tidy.bg === 'string' ? tidy.bg : '#fdfaf3',
    accent: typeof tidy.accent === 'string' ? tidy.accent : '#d97706',
    accentDark: typeof tidy.accentDark === 'string' ? tidy.accentDark : '#fbbf24',
  };
}

/**
 * 테마 그룹과 다크 모드에 맞는 칩 혼합 바탕색(tintBase)을 계산합니다.
 * 왜 분기하는가: 페이퍼 테마군(linen·kraft·sepia)에 순백을 섞으면 칩만 차갑게 떠 보이므로 따뜻한 종이 크림을 씁니다.
 * @param {{ id: string, group: string, bg: string }} theme
 * @param {boolean} dark
 * @returns {string}
 */
function resolveTintBase(theme, dark) {
  if (dark) {
    return theme.group === 'paper' ? '#26221e' : '#1f2430';
  }
  if (theme.group === 'paper') {
    return mixHex('#fffaf0', theme.bg, 0.58);
  }
  if (theme.group === 'modern') {
    return '#fffdf9';
  }
  return '#ffffff';
}

/**
 * 사용자 선택 톤(accent 포함)에 대한 기본 색상 트리오(primary/ink/soft)를 도출합니다.
 * 무채색 테마(white·slate)는 기한 지남(overdue) 회색과 겹치지 않도록 쿨 슬레이트-인디고 포인트를 줍니다.
 * @param {{ id: string, group: string, bg: string, accent: string, accentDark: string }} theme
 * @param {unknown} tone
 * @param {boolean} dark
 * @param {string} tintBase
 * @returns {{ primary: string, ink: string, soft: string }}
 */
function resolveToneSpec(theme, tone, dark, tintBase) {
  const toneKey = typeof tone === 'string' ? tone : 'accent';
  if (toneKey !== 'accent' && EXPLICIT_TONE_SPECS[toneKey]) {
    return dark ? EXPLICIT_TONE_SPECS[toneKey].dark : EXPLICIT_TONE_SPECS[toneKey].light;
  }

  if (theme.id === 'white' || theme.id === 'slate') {
    return dark
      ? { primary: '#9fb3e6', ink: '#d8e2fc', soft: '#323e5c' }
      : { primary: '#43568a', ink: '#2c3a57', soft: '#c7d5f2' };
  }

  if (dark) {
    const primary = theme.accentDark;
    return {
      primary,
      ink: mixHex(primary, '#ffffff', 0.72),
      soft: mixHex(primary, tintBase, 0.30),
    };
  }

  const primary = theme.accent;
  return {
    primary,
    ink: mixHex(primary, '#111827', 0.80),
    soft: mixHex(primary, tintBase, 0.24),
  };
}

/**
 * 15개 메모 테마 × 6개 D-Day 톤 × 라이트/다크 × 7종 상태 조합의 고대비 칩 팔레트를 생성합니다.
 * CSS `light-dark()`를 쓰지 않고 명시적 Hex 문자열을 반환합니다.
 * @param {{ themeColor?: string, tone?: unknown, badgeKind?: DdayBadgeKind, dark?: boolean }} [params]
 * @returns {DdayBadgePalette}
 */
export function resolveBadgePalette({
  themeColor = 'amber',
  tone = 'accent',
  badgeKind = 'countdown-upcoming',
  dark = false,
} = {}) {
  const theme = readThemeMeta(themeColor);
  const tintBase = resolveTintBase(theme, dark);
  const toneKey = typeof tone === 'string' && (tone === 'accent' || EXPLICIT_TONE_SPECS[tone]) ? tone : 'accent';
  const toneSpec = resolveToneSpec(theme, toneKey, dark, tintBase);

  if (badgeKind === 'countdown-overdue') {
    if (theme.group === 'paper') {
      if (dark) {
        const bg = '#2c2926';
        const hoverBg = '#35312d';
        return {
          bg,
          hoverBg,
          border: '#4f4942',
          hoverBorder: '#665e56',
          rim: '#151311',
          ink: ensureContrast(ensureContrast('#d6d3d1', bg, 4.6), hoverBg, 4.6),
          iconPrimary: '#a8a29e',
          iconSecondary: '#44403c',
          focus: '#a8a29e',
          solid: false,
          dashed: false,
        };
      }
      const bg = mixHex('#78716c', tintBase, 0.11);
      const hoverBg = mixHex('#78716c', tintBase, 0.17);
      return {
        bg,
        hoverBg,
        border: mixHex('#78716c', tintBase, 0.29),
        hoverBorder: mixHex('#78716c', tintBase, 0.42),
        rim: mixHex('#78716c', tintBase, 0.22),
        ink: ensureContrast(ensureContrast('#57534e', bg, 4.6), hoverBg, 4.6),
        iconPrimary: '#78716c',
        iconSecondary: mixHex('#78716c', tintBase, 0.24),
        focus: '#78716c',
        solid: false,
        dashed: false,
      };
    }

    if (dark) {
      const bg = '#262b36';
      const hoverBg = '#2e3442';
      return {
        bg,
        hoverBg,
        border: '#424b5d',
        hoverBorder: '#58647b',
        rim: '#12151c',
        ink: ensureContrast(ensureContrast('#cbd5e1', bg, 4.6), hoverBg, 4.6),
        iconPrimary: '#94a3b8',
        iconSecondary: '#3b4354',
        focus: '#94a3b8',
        solid: false,
        dashed: false,
      };
    }
    const bg = '#f1f5f9';
    const hoverBg = '#e8eef5';
    return {
      bg,
      hoverBg,
      border: '#cbd5e1',
      hoverBorder: '#94a3b8',
      rim: '#cbd5e1',
      ink: ensureContrast(ensureContrast('#475569', bg, 4.6), hoverBg, 4.6),
      iconPrimary: '#64748b',
      iconSecondary: '#cbd5e1',
      focus: '#64748b',
      solid: false,
      dashed: false,
    };
  }

  if (badgeKind === 'countdown-today') {
    if (dark) {
      const bg = ensureContrast(toneSpec.primary, '#111827', 5.0);
      return {
        bg,
        hoverBg: mixHex(bg, '#ffffff', 0.88),
        border: mixHex(bg, '#ffffff', 0.78),
        hoverBorder: '#ffffff',
        rim: mixHex(bg, '#000000', 0.58),
        ink: '#111827',
        iconPrimary: '#111827',
        iconSecondary: '#fffdf8',
        focus: bg,
        solid: true,
        dashed: false,
      };
    }
    const bg = ensureContrast(toneSpec.primary, '#ffffff', 4.6);
    return {
      bg,
      hoverBg: mixHex(bg, '#000000', 0.90),
      border: mixHex(bg, '#000000', 0.84),
      hoverBorder: mixHex(bg, '#000000', 0.74),
      rim: mixHex(bg, '#000000', 0.68),
      ink: '#ffffff',
      iconPrimary: '#fef08a',
      iconSecondary: '#ffffff',
      focus: bg,
      solid: true,
      dashed: false,
    };
  }

  if (badgeKind === 'countdown-imminent') {
    const coralPrimary = dark ? '#fb7185' : '#e11d48';
    if (toneKey === 'accent') {
      const bg = mixHex(coralPrimary, tintBase, dark ? 0.22 : 0.12);
      const hoverBg = mixHex(coralPrimary, tintBase, dark ? 0.29 : 0.18);
      const baseInk = dark ? '#fda4af' : '#be123c';
      return {
        bg,
        hoverBg,
        border: mixHex(coralPrimary, tintBase, dark ? 0.50 : 0.42),
        hoverBorder: mixHex(coralPrimary, tintBase, dark ? 0.68 : 0.60),
        rim: dark ? '#11131a' : mixHex(coralPrimary, tintBase, 0.28),
        ink: ensureContrast(ensureContrast(baseInk, bg, 4.6), hoverBg, 4.6),
        iconPrimary: coralPrimary,
        iconSecondary: dark ? '#5f1d2e' : '#fecdd3',
        focus: coralPrimary,
        solid: false,
        dashed: false,
      };
    }

    // 사용자가 5개 톤을 직접 지정했을 때는 톤 바탕·글자색을 지키고 테두리·종 아이콘에 코랄 경고를 결합합니다.
    const bg = mixHex(toneSpec.primary, tintBase, dark ? 0.20 : 0.12);
    const hoverBg = mixHex(toneSpec.primary, tintBase, dark ? 0.27 : 0.18);
    const coralBorderMix = mixHex(dark ? '#fb7185' : '#f43f5e', toneSpec.primary, 0.45);
    return {
      bg,
      hoverBg,
      border: mixHex(coralBorderMix, tintBase, dark ? 0.52 : 0.46),
      hoverBorder: mixHex(coralBorderMix, tintBase, dark ? 0.68 : 0.62),
      rim: dark ? '#12151c' : mixHex(coralBorderMix, tintBase, 0.28),
      ink: ensureContrast(ensureContrast(toneSpec.ink, bg, 4.6), hoverBg, 4.6),
      iconPrimary: coralPrimary,
      iconSecondary: toneSpec.soft,
      focus: coralPrimary,
      solid: false,
      dashed: false,
    };
  }

  if (badgeKind === 'since-scheduled') {
    const bg = mixHex(toneSpec.primary, tintBase, dark ? 0.14 : 0.08);
    const hoverBg = mixHex(toneSpec.primary, tintBase, dark ? 0.21 : 0.13);
    return {
      bg,
      hoverBg,
      border: mixHex(toneSpec.primary, tintBase, dark ? 0.42 : 0.36),
      hoverBorder: mixHex(toneSpec.primary, tintBase, dark ? 0.58 : 0.52),
      rim: dark ? '#12151c' : mixHex(toneSpec.primary, tintBase, 0.16),
      ink: ensureContrast(ensureContrast(toneSpec.ink, bg, 4.6), hoverBg, 4.6),
      iconPrimary: toneSpec.primary,
      iconSecondary: toneSpec.soft,
      focus: toneSpec.primary,
      solid: false,
      dashed: true,
    };
  }

  const weightBg =
    badgeKind === 'since-counting'
      ? dark
        ? 0.22
        : 0.13
      : badgeKind === 'countdown-week'
        ? dark
          ? 0.21
          : 0.12
        : dark
          ? 0.18
          : 0.10;
  const weightBorder = badgeKind === 'countdown-upcoming' ? (dark ? 0.36 : 0.28) : dark ? 0.42 : 0.34;
  const bg = mixHex(toneSpec.primary, tintBase, weightBg);
  const hoverBg = mixHex(toneSpec.primary, tintBase, weightBg + 0.06);

  return {
    bg,
    hoverBg,
    border: mixHex(toneSpec.primary, tintBase, weightBorder),
    hoverBorder: mixHex(toneSpec.primary, tintBase, Math.min(0.7, weightBorder + 0.16)),
    rim: dark ? '#12151c' : mixHex(toneSpec.primary, tintBase, 0.24),
    ink: ensureContrast(ensureContrast(toneSpec.ink, bg, 4.6), hoverBg, 4.6),
    iconPrimary: toneSpec.primary,
    iconSecondary: toneSpec.soft,
    focus: toneSpec.primary,
    solid: false,
    dashed: false,
  };
}

/**
 * 팔레트 객체를 Svelte style 속성용 CSS 변수 문자열로 직렬화합니다.
 * @param {DdayBadgePalette} palette
 * @returns {string}
 */
export function badgePaletteToStyle(palette) {
  return [
    `--dd-bg: ${palette.bg}`,
    `--dd-hover-bg: ${palette.hoverBg}`,
    `--dd-border: ${palette.border}`,
    `--dd-hover-border: ${palette.hoverBorder}`,
    `--dd-rim: ${palette.rim}`,
    `--dd-ink: ${palette.ink}`,
    `--dd-icon: ${palette.iconPrimary}`,
    `--dd-icon-soft: ${palette.iconSecondary}`,
    `--dd-focus: ${palette.focus}`,
  ].join('; ');
}

/**
 * 할 일 줄·모던 헤더용 스마트 D-Day 칩 모델을 산출합니다.
 * @param {Pick<DdayItem, 'date' | 'countMode' | 'repeatYearly' | 'tone'> & { title?: string }} item
 * @param {string} todayKey
 * @param {{ themeColor?: string, dark?: boolean }} [options]
 * @returns {DdayTodoBadgeModel}
 */
export function resolveTodoBadgeModel(item, todayKey, options = {}) {
  const themeColor = options.themeColor ?? 'amber';
  const dark = Boolean(options.dark);
  const countMode = item?.countMode === 'since' ? 'since' : 'countdown';
  const counter = computeDdayCounter(
    {
      date: item?.date || '',
      countMode,
      repeatYearly: Boolean(item?.repeatYearly),
    },
    todayKey,
  );
  const effectiveLabelDate = parseDateKey(counter.effectiveDate)
    ? formatDotDate(counter.effectiveDate)
    : '';

  if (countMode === 'since') {
    const rawDiff = calendarDiffDays(item?.date || '', todayKey);
    const isScheduled = Number.isFinite(rawDiff) && rawDiff < 0;

    if (isScheduled) {
      const absDays = Math.abs(rawDiff);
      const badgeKind = /** @type {const} */ ('since-scheduled');
      const datePhrase = effectiveLabelDate ? ` (${effectiveLabelDate})` : '';
      return {
        badgeKind,
        glyph: 'seed-plus',
        isRepeat: false,
        label: counter.label,
        dashed: true,
        emphasis: 'soft',
        title: `추산식 · ${absDays}일 뒤 카운트 시작${datePhrase} · D-Day 컨트롤 보기`,
        ariaLabel: `D-Day ${absDays}일 뒤 시작 예정, D-Day 컨트롤 열기`,
        palette: resolveBadgePalette({ themeColor, tone: item?.tone, badgeKind, dark }),
      };
    }

    const badgeKind = /** @type {const} */ ('since-counting');
    const dayCount = Number.isFinite(rawDiff) ? rawDiff + 1 : 1;
    const startPhrase = effectiveLabelDate ? ` (시작 ${effectiveLabelDate})` : '';
    return {
      badgeKind,
      glyph: 'sprout-mini',
      isRepeat: false,
      label: counter.label,
      dashed: false,
      emphasis: 'normal',
      title: `추산식 · 시작일 포함 ${dayCount}일째${startPhrase} · D-Day 컨트롤 보기`,
      ariaLabel: `D-Day 날짜 수 세기 ${dayCount}일째, D-Day 컨트롤 열기`,
      palette: resolveBadgePalette({ themeColor, tone: item?.tone, badgeKind, dark }),
    };
  }

  const repeatYearly = Boolean(item?.repeatYearly);
  const effectiveDate = resolveEffectiveTargetDate(item?.date || '', repeatYearly, 'countdown', todayKey);
  const diff = calendarDiffDays(todayKey, effectiveDate);
  const datePhrase = effectiveLabelDate || '목표일';
  const repeatTag = repeatYearly ? ' · 매년 반복' : '';

  /** @type {DdayBadgeKind} */
  let badgeKind = 'countdown-upcoming';
  /** @type {DdayBadgeGlyph} */
  let glyph = repeatYearly ? 'loop-mini' : 'hourglass-mini';
  /** @type {DdayBadgeEmphasis} */
  let emphasis = 'normal';
  let title = `차감식 · ${datePhrase}까지 ${Number.isFinite(diff) ? diff : 0}일 남음${repeatTag} · D-Day 컨트롤 보기`;
  let ariaLabel = `D-Day 차감식 ${counter.label}${repeatYearly ? ', 매년 반복' : ''}, D-Day 컨트롤 열기`;

  if (counter.state === 'today') {
    badgeKind = 'countdown-today';
    glyph = 'star-burst';
    emphasis = 'today';
    title = `차감식 · 오늘이 D-Day입니다! (${datePhrase})${repeatTag} · D-Day 컨트롤 보기`;
    ariaLabel = `오늘이 D-Day입니다${repeatYearly ? ', 매년 반복' : ''}, D-Day 컨트롤 열기`;
  } else if (counter.state === 'overdue') {
    badgeKind = 'countdown-overdue';
    glyph = 'clock-past';
    emphasis = 'muted';
    const absDays = Math.abs(counter.diff);
    title = `차감식 · 예정일(${datePhrase})로부터 ${absDays}일 지남 · D-Day 컨트롤 보기`;
    ariaLabel = `D-Day 기한 ${absDays}일 지남, D-Day 컨트롤 열기`;
  } else if (counter.state === 'imminent') {
    badgeKind = 'countdown-imminent';
    glyph = 'bell-spark';
    emphasis = 'imminent';
    title = `차감식 · 마감 임박 ${counter.label} (${datePhrase})${repeatTag} · D-Day 컨트롤 보기`;
    ariaLabel = `D-Day 마감 임박 ${counter.label}${repeatYearly ? ', 매년 반복' : ''}, D-Day 컨트롤 열기`;
  } else if (counter.state === 'week') {
    badgeKind = 'countdown-week';
    glyph = repeatYearly ? 'loop-mini' : 'hourglass-mini';
    emphasis = 'normal';
    title = `차감식 · 1주 이내 (${datePhrase})${repeatTag} · D-Day 컨트롤 보기`;
    ariaLabel = `D-Day 1주 이내 ${counter.label}${repeatYearly ? ', 매년 반복' : ''}, D-Day 컨트롤 열기`;
  }

  return {
    badgeKind,
    glyph,
    isRepeat: repeatYearly && badgeKind !== 'countdown-overdue',
    label: counter.label,
    dashed: false,
    emphasis,
    title,
    ariaLabel,
    palette: resolveBadgePalette({ themeColor, tone: item?.tone, badgeKind, dark }),
  };
}

/**
 * 노트 도구 메뉴·툴바·컨트롤 모달 헤더의 `D-` / `D+` 컨트롤 글리프 상태를 계산합니다.
 * @param {readonly DdayItem[] | null | undefined} activeDdays
 * @param {string} todayKey
 * @param {{ themeColor?: string, dark?: boolean }} [options]
 * @returns {DdayControlGlyphState}
 */
export function resolveControlGlyphState(activeDdays, todayKey, options = {}) {
  const themeColor = options.themeColor ?? 'amber';
  const dark = Boolean(options.dark);
  const theme = readThemeMeta(themeColor);
  const tintBase = resolveTintBase(theme, dark);
  const accentSpec = resolveToneSpec(theme, 'accent', dark, tintBase);
  const bodyFill = dark ? '#232836' : theme.group === 'paper' ? '#fffaf0' : '#fffdf8';

  const list = Array.isArray(activeDdays) ? activeDdays.filter((d) => d && d.status === 'active') : [];
  if (list.length === 0) {
    return {
      mode: 'idle',
      sign: '-',
      badgeText: 'D-',
      urgency: 'none',
      tone: 'accent',
      activeCount: 0,
      topBadge: null,
      palette: {
        bodyFill,
        headerFill: mixHex(accentSpec.primary, bodyFill, dark ? 0.24 : 0.20),
        stroke: dark ? '#94a3b8' : theme.group === 'paper' ? '#78716c' : '#64748b',
        letter: ensureContrast(dark ? '#cbd5e1' : theme.group === 'paper' ? '#57534e' : '#475569', bodyFill, 4.6),
        dotColor: accentSpec.primary,
        dotRing: bodyFill,
        showDot: false,
        sparkleDot: false,
      },
    };
  }

  const top = list[0];
  const topBadge = resolveTodoBadgeModel(top, todayKey, { themeColor, dark });
  const mode = top.countMode === 'since' ? 'since' : 'countdown';
  const sign = mode === 'since' ? '+' : '-';
  const badgeText = mode === 'since' ? 'D+' : 'D-';

  /** @type {DdayControlGlyphUrgency} */
  let urgency = 'normal';
  if (mode === 'since') {
    urgency = topBadge.badgeKind === 'since-scheduled' ? 'scheduled' : 'counting';
  } else if (topBadge.badgeKind === 'countdown-today') {
    urgency = 'today';
  } else if (topBadge.badgeKind === 'countdown-imminent') {
    urgency = 'imminent';
  } else if (topBadge.badgeKind === 'countdown-overdue') {
    urgency = 'overdue';
  }

  let headerFill = mixHex(topBadge.palette.iconPrimary, bodyFill, dark ? 0.36 : 0.26);
  if (urgency === 'today') {
    headerFill = topBadge.palette.bg;
  } else if (urgency === 'imminent') {
    headerFill = mixHex(dark ? '#fb7185' : '#e11d48', bodyFill, dark ? 0.42 : 0.28);
  } else if (urgency === 'overdue') {
    headerFill = dark ? '#384050' : theme.group === 'paper' ? '#e7e2da' : '#e2e8f0';
  } else if (urgency === 'scheduled') {
    headerFill = mixHex(topBadge.palette.iconPrimary, bodyFill, dark ? 0.24 : 0.16);
  }

  const stroke =
    urgency === 'overdue'
      ? dark
        ? '#94a3b8'
        : '#64748b'
      : ensureContrast(topBadge.palette.iconPrimary, bodyFill, 3.2);

  const letterSource =
    urgency === 'today'
      ? ensureContrast(topBadge.palette.bg, bodyFill, 4.6)
      : urgency === 'overdue'
        ? dark
          ? '#cbd5e1'
          : '#475569'
        : topBadge.palette.ink;
  const letter = ensureContrast(letterSource, bodyFill, 4.6);

  let dotColor = topBadge.palette.iconPrimary;
  if (urgency === 'today') {
    dotColor = dark ? '#fde047' : '#f59e0b';
  } else if (urgency === 'imminent') {
    dotColor = dark ? '#fb7185' : '#e11d48';
  } else if (urgency === 'scheduled') {
    dotColor = mixHex(topBadge.palette.iconPrimary, bodyFill, 0.58);
  } else if (urgency === 'overdue') {
    dotColor = dark ? '#64748b' : '#94a3b8';
  }

  return {
    mode,
    sign,
    badgeText,
    urgency,
    tone: top.tone,
    activeCount: list.length,
    topBadge,
    palette: {
      bodyFill,
      headerFill,
      stroke,
      letter,
      dotColor,
      dotRing: bodyFill,
      showDot: urgency !== 'overdue',
      sparkleDot: urgency === 'today',
    },
  };
}
