// ═══════════════════════════════════════════════════════════════════
// [할 일 날짜 뱃지 공통 규격·피팅·색상 순수 로직] docs/PRD-todo-deadline-badge.md §5~§7
//
// 하는 일
//   1. D-Day 뱃지와 공유하는 공통 규격 토큰(--tb-*) 및 UI 글자 크기(6~15pt) 비대칭 감쇠 스케일 산출
//   2. 창 내 동일 고정 슬롯 폭을 유지하면서 폰트별 Overflow-Zero 3중 방어 피팅(자간 → 단계 축소 → 슬롯 확장)
//   3. 마감일 5단계(지연·오늘·1~3일·4~7일·여유) + 미설정·오류(NaN) 의미·구간 보존 + WCAG AA(≥ 4.6:1) 정제 파스텔 톤 산출
//
// 왜 CSS light-dark()를 쓰지 않는가:
//   Vite 배포 빌드의 lightningcss에서 light-dark() 값이 사라질 수 있어 명시적 Hex 변수로 생성합니다.
// ═══════════════════════════════════════════════════════════════════

import { getTidyTheme } from '../themes.js';
import { contrastRatio, ensureContrast, mixHex } from '../dday/ddayBadge.js';

/** 날짜 뱃지·D-Day 뱃지 공통 규격 상수 (단일 진실 원천) */
export const TODO_BADGE_METRICS = Object.freeze({
  UI_FONT_BASE_PT: 10,
  UI_SCALE_MIN: 0.6,
  UI_SCALE_MAX: 1.5,
  DAMPING_DOWN: 0.45,
  DAMPING_UP: 0.55,
  BASE_HEIGHT_PX: 22,
  BASE_DATE_WIDTH_PX: 64,
  BASE_FONT_PX: 10.5,
  BASE_ICON_PX: 12.5,
  MIN_FONT_PX: 9.5,
  MIN_FITTED_FONT_PX: 8.5,
  MIN_H_PAD_PX: 4,
  BORDER_PX: 1,
  BASE_LETTER_SPACING_EM: -0.025,
  TIGHT_LETTER_SPACING_EM: -0.045,
  RADIUS_PX: 999,
  FIT_VERIFY_MAX_STEPS: 8,
  FIT_STEP_PX: 0.25,
  MIN_TEXT_CONTRAST: 4.6,
  MIN_ICON_CONTRAST: 3.0,
});

/** @typedef {'overdue' | 'today' | 'soon' | 'week' | 'later' | 'unset' | 'invalid'} DeadlineKind */

/** @type {readonly DeadlineKind[]} */
export const DEADLINE_KINDS = Object.freeze([
  'overdue',
  'today',
  'soon',
  'week',
  'later',
  'unset',
  'invalid',
]);

/**
 * 5단계 마감일 정제 문구 파스텔 명세.
 * 의미·잔여일수 판별 구간(<0, 0, <=3, <=7, >7)과 보라·빨강·주황·초록·파랑 계열은 100% 보존하고
 * ddayBadge.js와 같은 resolveTintBase + ensureContrast(4.6) 명도대로 다듬습니다.
 */
const DEADLINE_COLOR_SPECS = Object.freeze({
  overdue: {
    light: { primary: '#9333ea', ink: '#7e22ce', bgW: 0.11, borderW: 0.34 },
    dark: { primary: '#c084fc', ink: '#d8b4fe' },
  },
  today: {
    light: { primary: '#ef4444', ink: '#c41e1e', bgW: 0.08, borderW: 0.30 },
    dark: { primary: '#f87171', ink: '#fca5a5' },
  },
  soon: {
    light: { primary: '#ea580c', ink: '#b43e0f', bgW: 0.09, borderW: 0.30 },
    dark: { primary: '#fb923c', ink: '#fdba74' },
  },
  week: {
    light: { primary: '#059669', ink: '#047455', bgW: 0.12, borderW: 0.34 },
    dark: { primary: '#34d399', ink: '#6ee7b7' },
  },
  later: {
    light: { primary: '#3b82f6', ink: '#1d4ed8', bgW: 0.11, paperBgW: 0.14, borderW: 0.34 },
    dark: { primary: '#60a5fa', ink: '#93c5fd' },
  },
});

/**
 * UI 글자 크기(6~15pt)에 대응하는 날짜·D-Day 공통 치수를 비대칭 감쇠 곡선으로 계산합니다.
 * 왜 비대칭 감쇠인가: 6~15pt 전 구간에서 매 pt마다 정체 없이 반응하되(18~28px),
 * 15pt 큰 설정에서 도크 버튼(13.5px)보다 과도하게 팽창하거나 6pt에서 너무 작아지지 않게 합니다.
 * @param {unknown} uiFontSizePt
 * @returns {{
 *   uiFontSizePt: number,
 *   rawScale: number,
 *   badgeScale: number,
 *   heightPx: number,
 *   fontSizePx: number,
 *   slotWidthPx: number,
 *   iconSizePx: number,
 *   availWidthPx: number,
 *   radiusPx: number,
 * }}
 */
export function resolveTodoBadgeMetrics(uiFontSizePt = TODO_BADGE_METRICS.UI_FONT_BASE_PT) {
  const M = TODO_BADGE_METRICS;
  const parsed = Number(uiFontSizePt);
  const safePt = Number.isFinite(parsed) && parsed > 0 ? parsed : M.UI_FONT_BASE_PT;
  const rawScale = Math.max(M.UI_SCALE_MIN, Math.min(M.UI_SCALE_MAX, safePt / M.UI_FONT_BASE_PT));
  const k = rawScale < 1 ? M.DAMPING_DOWN : M.DAMPING_UP;
  const badgeScale = Math.round((1 + (rawScale - 1) * k) * 1000) / 1000;

  const heightPx = Math.round(M.BASE_HEIGHT_PX * badgeScale);
  const fontSizePx = Math.max(M.MIN_FONT_PX, Math.round(M.BASE_FONT_PX * badgeScale * 100) / 100);
  // 6~7pt에서 글자 크기 하한(9.5px, 0.905배)보다 슬롯 폭 비율이 작아져 2차 축소가 불필요하게 걸리지 않게 연동합니다.
  const slotWidthPx = Math.round(M.BASE_DATE_WIDTH_PX * Math.max(badgeScale, fontSizePx / M.BASE_FONT_PX));
  const iconSizePx = Math.round(M.BASE_ICON_PX * badgeScale * 2) / 2;
  const availWidthPx = slotWidthPx - (M.BORDER_PX + M.MIN_H_PAD_PX) * 2;

  return {
    uiFontSizePt: safePt,
    rawScale,
    badgeScale,
    heightPx,
    fontSizePx,
    slotWidthPx,
    iconSizePx,
    availWidthPx,
    radiusPx: M.RADIUS_PX,
  };
}

/**
 * 최장 표본 측정값(measuredBase)과 단계별 재측정 콜백(measureAt)으로
 * Overflow-Zero 3중 방어 피팅 결과를 계산합니다.
 * @param {{
 *   base: ReturnType<typeof resolveTodoBadgeMetrics>,
 *   measuredBase: number,
 *   measureAt: (fontPx: number, letterSpacingEm: number) => number,
 * }} input
 * @returns {{ fontPx: number, slotPx: number, letterSpacingEm: number, stage: 1 | 2 | 3 }}
 */
export function computeFittedDateBadge({ base, measuredBase, measureAt }) {
  const M = TODO_BADGE_METRICS;
  const availW = base.availWidthPx;
  const overhead = (M.BORDER_PX + M.MIN_H_PAD_PX) * 2;

  if (!Number.isFinite(measuredBase) || measuredBase <= 0 || measuredBase <= availW) {
    return {
      fontPx: base.fontSizePx,
      slotPx: base.slotWidthPx,
      letterSpacingEm: M.BASE_LETTER_SPACING_EM,
      stage: 1,
    };
  }

  const tightLs = M.TIGHT_LETTER_SPACING_EM;
  const measuredTight = measureAt(base.fontSizePx, tightLs);
  if (Number.isFinite(measuredTight) && measuredTight > 0 && measuredTight <= availW) {
    return {
      fontPx: base.fontSizePx,
      slotPx: base.slotWidthPx,
      letterSpacingEm: tightLs,
      stage: 2,
    };
  }

  const tightRef = Number.isFinite(measuredTight) && measuredTight > 0 ? measuredTight : measuredBase;
  let candidate = Math.max(
    M.MIN_FITTED_FONT_PX,
    Math.floor((base.fontSizePx * (availW / tightRef)) * 4) / 4,
  );

  // 비트맵 폴백·한글 힌팅 반올림으로 비선형 폭을 가지는 서체(굴림 등)를 위해 0.25px씩 실측 검증합니다.
  for (let step = 0; step < M.FIT_VERIFY_MAX_STEPS; step += 1) {
    const w = measureAt(candidate, tightLs);
    if (Number.isFinite(w) && w <= availW) {
      return {
        fontPx: candidate,
        slotPx: base.slotWidthPx,
        letterSpacingEm: tightLs,
        stage: 2,
      };
    }
    if (candidate <= M.MIN_FITTED_FONT_PX) break;
    candidate = Math.max(
      M.MIN_FITTED_FONT_PX,
      Math.round((candidate - M.FIT_STEP_PX) * 100) / 100,
    );
  }

  const measuredAtMin = measureAt(M.MIN_FITTED_FONT_PX, tightLs);
  if (Number.isFinite(measuredAtMin) && measuredAtMin <= availW) {
    return {
      fontPx: M.MIN_FITTED_FONT_PX,
      slotPx: base.slotWidthPx,
      letterSpacingEm: tightLs,
      stage: 2,
    };
  }

  // 3차 안전망: 글자 하한(8.5px)에서도 넘치는 초광폭 폰트는 창 내 모든 날짜 뱃지 폭을 함께 확장합니다.
  const minW = Number.isFinite(measuredAtMin) && measuredAtMin > 0 ? measuredAtMin : tightRef;
  return {
    fontPx: M.MIN_FITTED_FONT_PX,
    slotPx: Math.max(base.slotWidthPx, Math.ceil(minW + overhead)),
    letterSpacingEm: tightLs,
    stage: 3,
  };
}

/**
 * `'11/23(월)'` 형식을 본체 날짜와 요일 괄호로 나눕니다.
 * 단일 굵기 글꼴(메이플스토리 L 등)에서도 괄호 요일을 투명도로 구분하기 위함입니다.
 * @param {unknown} label
 * @returns {{ main: string, dow: string }}
 */
export function splitShortDateParts(label) {
  const text = typeof label === 'string' ? label : String(label ?? '');
  const match = text.match(/^(.*?)(\([^)]+\))$/);
  if (!match) return { main: text, dow: '' };
  return { main: match[1], dow: match[2] };
}

/**
 * 마감일 값과 잔여일수로 7상태(5색 + unset + invalid) 중 하나를 판별합니다.
 * @param {unknown} deadline
 * @param {number} diffDays
 * @returns {DeadlineKind}
 */
export function classifyDeadlineKind(deadline, diffDays) {
  if (!deadline) return 'unset';
  if (!Number.isFinite(diffDays)) return 'invalid';
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 3) return 'soon';
  if (diffDays <= 7) return 'week';
  return 'later';
}

/**
 * @param {{ id: string, group: string, bg: string }} theme
 * @param {boolean} dark
 * @returns {string}
 */
function resolveDeadlineTintBase(theme, dark) {
  if (dark) return theme.group === 'paper' ? '#26221e' : '#1f2430';
  if (theme.group === 'paper') return mixHex('#fffaf0', theme.bg, 0.58);
  if (theme.group === 'modern') return '#fffdf9';
  return '#ffffff';
}

/**
 * 15개 메모 테마 × 라이트/다크 30조합에 대한 마감일 뱃지 정제 팔레트를 생성합니다.
 * @param {string} [themeColor]
 * @param {boolean} [isDarkMode]
 * @returns {{
 *   themeId: string,
 *   dark: boolean,
 *   gloss: string,
 *   states: Record<DeadlineKind, {
 *     bg: string,
 *     hoverBg: string,
 *     border: string,
 *     hoverBorder: string,
 *     color: string,
 *     rim: string,
 *   }>,
 * }}
 */
export function resolveDeadlinePaletteSet(themeColor = 'amber', isDarkMode = false) {
  const M = TODO_BADGE_METRICS;
  const dark = Boolean(isDarkMode);
  const raw = /** @type {any} */ (getTidyTheme(themeColor));
  const tidy = raw?.tidy || {};
  const theme = {
    id: typeof raw?.id === 'string' ? raw.id : 'amber',
    group: typeof raw?.group === 'string' ? raw.group : 'classic',
    bg: typeof tidy.bg === 'string' ? tidy.bg : '#fdfaf3',
  };
  const isPaper = theme.group === 'paper';
  const tintBase = resolveDeadlineTintBase(theme, dark);
  const rim = dark ? '#12151c' : '';

  /** @type {Record<string, any>} */
  const states = {};

  for (const [kind, entry] of Object.entries(DEADLINE_COLOR_SPECS)) {
    if (dark) {
      const spec = entry.dark;
      const bg = mixHex(spec.primary, tintBase, 0.18);
      const hoverBg = mixHex(spec.primary, tintBase, 0.25);
      states[kind] = {
        bg,
        hoverBg,
        border: mixHex(spec.primary, tintBase, 0.38),
        hoverBorder: mixHex(spec.primary, tintBase, 0.52),
        color: ensureContrast(ensureContrast(spec.ink, bg, M.MIN_TEXT_CONTRAST), hoverBg, M.MIN_TEXT_CONTRAST),
        rim,
      };
    } else {
      const spec = entry.light;
      const bgW = isPaper && 'paperBgW' in spec ? spec.paperBgW : spec.bgW;
      const bg = mixHex(spec.primary, tintBase, bgW);
      const hoverBg = mixHex(spec.primary, tintBase, bgW + 0.06);
      states[kind] = {
        bg,
        hoverBg,
        border: mixHex(spec.primary, tintBase, spec.borderW),
        hoverBorder: mixHex(spec.primary, tintBase, Math.min(0.7, spec.borderW + 0.16)),
        color: ensureContrast(ensureContrast(spec.ink, bg, M.MIN_TEXT_CONTRAST), hoverBg, M.MIN_TEXT_CONTRAST),
        rim: mixHex(spec.primary, tintBase, 0.24),
      };
    }
  }

  // 미설정 상태(점선 + 회색 달력 아이콘): 비텍스트 대비 ≥ 3.0:1 보장
  if (dark) {
    const unsetHoverComposite = mixHex('#94a3b8', tintBase, 0.15);
    const unsetIcon = ensureContrast(
      ensureContrast('#7c8596', tintBase, M.MIN_ICON_CONTRAST + 0.15),
      unsetHoverComposite,
      M.MIN_ICON_CONTRAST + 0.1,
    );
    states.unset = {
      bg: 'rgba(148, 163, 184, 0.08)',
      hoverBg: 'rgba(148, 163, 184, 0.15)',
      border: 'rgba(148, 163, 184, 0.32)',
      hoverBorder: 'rgba(148, 163, 184, 0.52)',
      color: unsetIcon,
      rim: 'transparent',
    };
  } else {
    const unsetBase = isPaper ? '#7d848f' : '#8a919e';
    const unsetHoverComposite = mixHex('#64748b', tintBase, 0.11);
    const unsetIcon = ensureContrast(
      ensureContrast(unsetBase, tintBase, M.MIN_ICON_CONTRAST + 0.15),
      unsetHoverComposite,
      M.MIN_ICON_CONTRAST + 0.1,
    );
    states.unset = {
      bg: isPaper ? 'rgba(120, 113, 108, 0.06)' : 'rgba(100, 116, 139, 0.05)',
      hoverBg: isPaper ? 'rgba(120, 113, 108, 0.12)' : 'rgba(100, 116, 139, 0.11)',
      border: isPaper ? 'rgba(120, 113, 108, 0.36)' : 'rgba(100, 116, 139, 0.38)',
      hoverBorder: isPaper ? 'rgba(120, 113, 108, 0.56)' : 'rgba(100, 116, 139, 0.58)',
      color: unsetIcon,
      rim: 'transparent',
    };
  }

  // 잘못된 날짜 문자열(NaN): 파란 '여유'로 오분류하지 않고 중립 회색 점선 + ≥ 4.6:1 대비 유지
  const invalidBg = mixHex(dark ? '#94a3b8' : '#64748b', tintBase, dark ? 0.12 : 0.07);
  const invalidHoverBg = mixHex(dark ? '#94a3b8' : '#64748b', tintBase, dark ? 0.19 : 0.13);
  states.invalid = {
    bg: invalidBg,
    hoverBg: invalidHoverBg,
    border: mixHex(dark ? '#94a3b8' : '#64748b', tintBase, 0.34),
    hoverBorder: mixHex(dark ? '#94a3b8' : '#64748b', tintBase, 0.48),
    color: ensureContrast(
      ensureContrast(dark ? '#cbd5e1' : '#475569', invalidBg, M.MIN_TEXT_CONTRAST),
      invalidHoverBg,
      M.MIN_TEXT_CONTRAST,
    ),
    rim: 'transparent',
  };

  return {
    themeId: theme.id,
    dark,
    gloss: dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.60)',
    states: /** @type {any} */ (states),
  };
}

/**
 * 팔레트 세트를 `.todo-rows` 컨테이너 style 문자열로 직렬화합니다(행 단위 계산 제거 → O(1) 테마 전환).
 * @param {ReturnType<typeof resolveDeadlinePaletteSet>} set
 * @returns {string}
 */
export function deadlinePaletteSetToStyle(set) {
  /** @type {string[]} */
  const vars = [`--tb-gloss:${set.gloss}`];
  for (const kind of DEADLINE_KINDS) {
    const s = set.states[kind];
    vars.push(
      `--dl-${kind}-bg:${s.bg}`,
      `--dl-${kind}-hover-bg:${s.hoverBg}`,
      `--dl-${kind}-border:${s.border}`,
      `--dl-${kind}-hover-border:${s.hoverBorder}`,
      `--dl-${kind}-color:${s.color}`,
      `--dl-${kind}-rim:${s.rim}`,
    );
  }
  return vars.join(';');
}

export { contrastRatio };
