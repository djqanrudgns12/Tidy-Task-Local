// ═══════════════════════════════════════════════════════════════════
// [다중 선택 인셋 도크 순수 로직] docs/PRD-bulk-select-dock.md §6, §7, §8
//
// 하는 일
//   1. 전체 선택 체크 토글의 4상태(empty / none / partial / all)와 스티커 카운트 핍(99+ 캡) 판정
//   2. 2축 정밀 정렬(체크 축 23px · 날짜 뱃지 정중앙 축)의 정렬 캡슐 위치·안전 클램프·꼬리점 가시성 계산
//   3. 15개 메모 테마 × 라이트/다크 30조합의 명시적 색상·WCAG AA(≥ 4.5:1) 대비 토큰 생성
//
// 왜 순수 함수로 분리하는가:
//   DOM 없이도 경계 폭·글자 크기·30개 테마 대비율을 단위 테스트로 전수 검증하기 위함입니다.
//   CSS light-dark()는 배포 빌드의 lightningcss에서 값이 사라질 수 있어 쓰지 않습니다.
// ═══════════════════════════════════════════════════════════════════

import { getTidyTheme } from '../themes.js';
import { contrastRatio, ensureContrast, mixHex } from '../dday/ddayBadge.js';
import { resolveTodoBadgeMetrics } from './todoBadgeMetrics.js';

/** 다중 선택 인셋 도크 치수·임계 상수 (한곳 정의) */
export const BULK_DOCK_METRICS = Object.freeze({
  DOCK_OUTER_GUTTER_PX: 10,
  DOCK_RADIUS_PX: 11,
  CHECK_SIZE_PX: 16,
  CHECK_RADIUS_PX: 6,
  CHECK_LOCAL_LEFT_PX: 4,
  PIP_CLEARANCE_PX: 12,
  CAPSULE_WIDTH_PX: 36,
  CAPSULE_HALF_PX: 18,
  CAPSULE_THUMB_WIDTH_PX: 15,
  ACTIONS_MIN_GAP_PX: 8,
  NOTCH_HIDE_TOLERANCE_PX: 8,
  FALLBACK_BADGE_START_LOCAL_X: 48,
  FALLBACK_BADGE_FONT_FACTOR: 2.35,
  FALLBACK_HALF_MIN_PX: 19,
  FALLBACK_HALF_MAX_PX: 56,
  COUNT_PIP_CAP: 99,
  MIN_CONTRAST_RATIO: 4.5,
});

/**
 * @typedef {'empty' | 'none' | 'partial' | 'all'} SelectAllMode
 *
 * @typedef {{
 *   mode: SelectAllMode,
 *   disabled: boolean,
 *   ariaChecked: 'false' | 'mixed' | 'true',
 *   pipText: string,
 *   title: string,
 *   ariaLabel: string,
 * }} SelectAllState
 *
 * @typedef {{
 *   dockLeft: number,
 *   dockBorderLeft?: number,
 *   badgeCenterClientX?: number | null,
 *   actionsLeftClientX?: number | null,
 *   globalFontSizePt?: number,
 *   uiFontSizePt?: number,
 *   dateSlotPx?: number,
 *   hasVisibleRows?: boolean,
 * }} SortCapsulePositionInput
 *
 * @typedef {{
 *   targetCx: number,
 *   clampedCx: number,
 *   capsuleLeftPx: number,
 *   driftPx: number,
 *   isClamped: boolean,
 *   showNotch: boolean,
 * }} SortCapsulePositionResult
 *
 * @typedef {{
 *   themeId: string,
 *   themeGroup: string,
 *   dark: boolean,
 *   accent: string,
 *   accentFill: string,
 *   accentText: string,
 *   onAccent: string,
 *   dockBg: string,
 *   dockBorder: string,
 *   dockRim: string,
 *   dockGloss: string,
 *   pillBg: string,
 *   pillRim: string,
 *   trackBg: string,
 *   thumbBg: string,
 *   chkBg: string,
 *   chkBorder: string,
 *   partialBg: string,
 *   softBg: string,
 *   softHoverBg: string,
 *   softBorder: string,
 *   softHoverBorder: string,
 *   primaryRim: string,
 *   disabledBg: string,
 *   disabledInk: string,
 *   ink: string,
 *   muted: string,
 *   eraserInk: string,
 *   eraserHoverBg: string,
 *   eraserHoverInk: string,
 * }} BulkDockPalette
 */

/**
 * 스티커 카운트 핍 표시 문자열을 만듭니다. 100 이상은 가로 폭 보호를 위해 '99+'로 캡합니다.
 * @param {number} count
 * @returns {string}
 */
export function formatCountPip(count) {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return '';
  if (n > BULK_DOCK_METRICS.COUNT_PIP_CAP) return `${BULK_DOCK_METRICS.COUNT_PIP_CAP}+`;
  return String(n);
}

/**
 * 전체 선택 체크 토글의 상태(4단계)와 접근성 문구를 계산합니다.
 * - 검색 필터로 선택된 항목이 잠시 가려져 visibleSelectedCount === 0 이어도
 *   totalSelectedCount > 0 이면 partial로 알려 사용자가 1클릭으로 모두 해제할 수 있게 합니다.
 * @param {{ totalCount: number, visibleSelectedCount: number, totalSelectedCount: number }} input
 * @returns {SelectAllState}
 */
export function resolveSelectAllState({ totalCount, visibleSelectedCount, totalSelectedCount }) {
  const total = Math.max(0, Math.floor(Number(totalCount) || 0));
  const visSel = Math.max(0, Math.floor(Number(visibleSelectedCount) || 0));
  const allSel = Math.max(0, Math.floor(Number(totalSelectedCount) || 0));
  const pipText = formatCountPip(allSel);

  if (total === 0 && allSel === 0) {
    return {
      mode: 'empty',
      disabled: true,
      ariaChecked: 'false',
      pipText: '',
      title: '선택할 할 일이 없어요',
      ariaLabel: '선택할 할 일이 없어요',
    };
  }

  if (allSel === 0) {
    return {
      mode: 'none',
      disabled: false,
      ariaChecked: 'false',
      pipText: '',
      title: `모두 선택 (${total}개)`,
      ariaLabel: `모두 선택 (${total}개)`,
    };
  }

  if (total > 0 && visSel >= total) {
    return {
      mode: 'all',
      disabled: false,
      ariaChecked: 'true',
      pipText,
      title: `전체 선택됨 (${allSel}/${total}) · 클릭해 모두 해제`,
      ariaLabel: `전체 선택됨 (${allSel}개), 클릭해 모두 해제`,
    };
  }

  return {
    mode: 'partial',
    disabled: false,
    ariaChecked: 'mixed',
    pipText,
    title: `${allSel}개 선택됨 · 클릭해 모두 해제`,
    ariaLabel: `${allSel}개 선택됨, 클릭해 모두 해제`,
  };
}

/**
 * 0.5px 단위로 스냅합니다(100%/150%/200% 배율에서 서브픽셀 번짐 최소화).
 * @param {number} value
 * @returns {number}
 */
function snapHalfPx(value) {
  return Math.round(value * 2) / 2;
}

/**
 * 날짜 인덱스 슬라이딩 정렬 캡슐의 도크 내부 좌측 위치(px)와 꼬리점 가시성을 계산합니다.
 * - 날짜 뱃지 DOM 실측값(badgeCenterClientX)이 있으면 그 정중앙을 목표로 삼습니다.
 * - 좌측 체크박스+핍, 우측 4개 일괄 버튼과 절대 겹치지 않도록 [minCx, maxCx]로 클램프합니다.
 * - 클램프로 실제 뱃지 중앙에서 NOTCH_HIDE_TOLERANCE_PX를 초과 이탈하거나 목록이 비어 있으면
 *   엉뚱한 열을 가리키지 않도록 하단 꼬리점(showNotch)을 숨깁니다.
 * @param {SortCapsulePositionInput} input
 * @returns {SortCapsulePositionResult}
 */
export function computeSortCapsulePosition(input) {
  const M = BULK_DOCK_METRICS;
  const dockLeft = Number.isFinite(input?.dockLeft) ? input.dockLeft : 0;
  const dockBorderLeft = Number.isFinite(input?.dockBorderLeft) ? /** @type {number} */ (input.dockBorderLeft) : 1;
  const dockInnerLeft = dockLeft + dockBorderLeft;
  const hasVisibleRows = Boolean(input?.hasVisibleRows);

  const hasDateSlot = typeof input?.dateSlotPx === 'number' && Number.isFinite(input.dateSlotPx) && input.dateSlotPx > 0;
  const hasUiFontPt = typeof input?.uiFontSizePt === 'number' && Number.isFinite(input.uiFontSizePt) && input.uiFontSizePt > 0;
  let estHalfBadge;
  if (hasDateSlot) {
    estHalfBadge = /** @type {number} */ (input.dateSlotPx) / 2;
  } else if (hasUiFontPt) {
    estHalfBadge = resolveTodoBadgeMetrics(input.uiFontSizePt).slotWidthPx / 2;
  } else {
    const fontPt = Number.isFinite(input?.globalFontSizePt) && /** @type {number} */ (input.globalFontSizePt) > 0
      ? /** @type {number} */ (input.globalFontSizePt)
      : 10;
    const fontPx = Math.max(6, fontPt) * (4 / 3);
    estHalfBadge = Math.min(
      M.FALLBACK_HALF_MAX_PX,
      Math.max(M.FALLBACK_HALF_MIN_PX, fontPx * M.FALLBACK_BADGE_FONT_FACTOR),
    );
  }
  const fallbackTargetCx = M.FALLBACK_BADGE_START_LOCAL_X + estHalfBadge;

  const hasMeasuredBadge =
    typeof input?.badgeCenterClientX === 'number' && Number.isFinite(input.badgeCenterClientX);
  const targetCx = hasMeasuredBadge
    ? /** @type {number} */ (input.badgeCenterClientX) - dockInnerLeft
    : fallbackTargetCx;

  const minCx = M.CHECK_LOCAL_LEFT_PX + M.CHECK_SIZE_PX + M.PIP_CLEARANCE_PX + M.CAPSULE_HALF_PX;

  let maxCx = Infinity;
  if (typeof input?.actionsLeftClientX === 'number' && Number.isFinite(input.actionsLeftClientX)) {
    const actionsLocalLeft = input.actionsLeftClientX - dockInnerLeft;
    maxCx = Math.max(minCx, actionsLocalLeft - M.ACTIONS_MIN_GAP_PX - M.CAPSULE_HALF_PX);
  }

  const clampedCx = snapHalfPx(Math.min(maxCx, Math.max(minCx, targetCx)));
  const capsuleLeftPx = snapHalfPx(clampedCx - M.CAPSULE_HALF_PX);
  const driftPx = Math.round(Math.abs(clampedCx - targetCx) * 100) / 100;
  const isClamped = driftPx > M.NOTCH_HIDE_TOLERANCE_PX;
  const showNotch = hasVisibleRows && !isClamped;

  return {
    targetCx: snapHalfPx(targetCx),
    clampedCx,
    capsuleLeftPx,
    driftPx,
    isClamped,
    showNotch,
  };
}

/**
 * 15개 메모 테마 × 라이트/다크 30조합에 대한 인셋 도크 색상 토큰을 생성합니다.
 * - 강조 채움 버튼([마감]·체크·핍)과 보조 버튼([아카이브]·[D-Day]) 모두 WCAG AA(≥ 4.5:1)를 만족합니다.
 * @param {string} [themeColor]
 * @param {boolean} [isDarkMode]
 * @returns {BulkDockPalette}
 */
export function resolveBulkDockPalette(themeColor = 'amber', isDarkMode = false) {
  const dark = Boolean(isDarkMode);
  const rawTheme = /** @type {any} */ (getTidyTheme(themeColor));
  const themeId = typeof rawTheme?.id === 'string' ? rawTheme.id : 'amber';
  const themeGroup = typeof rawTheme?.group === 'string' ? rawTheme.group : 'classic';
  const isPaper = themeGroup === 'paper';
  const tidy = rawTheme?.tidy || {
    bg: '#fdfaf3',
    section: '#f4ebce',
    border: '#e8ddb7',
    accent: '#d97706',
    accentDark: '#fbbf24',
  };

  const minRatio = BULK_DOCK_METRICS.MIN_CONTRAST_RATIO;

  if (dark) {
    const baseBg = '#23272e';
    const accent = tidy.accentDark || '#fbbf24';
    const onAccent = '#111827';
    // 다크 파스텔 강조색 위 #111827 잉크가 항상 4.5:1 이상이 되도록 보정합니다.
    const accentFill = contrastRatio(accent, onAccent) >= minRatio
      ? accent
      : ensureContrast(accent, onAccent, minRatio);
    const dockBg = mixHex(accent, baseBg, 0.09);
    const pillBg = mixHex('#ffffff', dockBg, 0.08);
    const softBg = mixHex(accent, pillBg, 0.14);
    const softHoverBg = mixHex(accent, pillBg, 0.23);
    const accentText = ensureContrast(accent, softBg, minRatio);

    return {
      themeId,
      themeGroup,
      dark: true,
      accent,
      accentFill,
      accentText,
      onAccent,
      dockBg,
      dockBorder: mixHex(accent, '#353c48', 0.24),
      dockRim: 'rgba(0, 0, 0, 0.26)',
      dockGloss: 'rgba(255, 255, 255, 0.06)',
      pillBg,
      pillRim: 'rgba(0, 0, 0, 0.36)',
      trackBg: mixHex('#ffffff', dockBg, 0.065),
      thumbBg: mixHex(accent, '#343a46', 0.26),
      chkBg: '#262b34',
      chkBorder: '#64748b',
      partialBg: mixHex(accent, '#262b34', 0.20),
      softBg,
      softHoverBg,
      softBorder: mixHex(accent, dockBg, 0.36),
      softHoverBorder: mixHex(accent, dockBg, 0.56),
      primaryRim: mixHex('#000000', accentFill, 0.36),
      disabledBg: mixHex('#94a3b8', dockBg, 0.16),
      disabledInk: '#8d99ab',
      ink: '#e2e8f0',
      muted: '#9aa6b8',
      eraserInk: 'rgba(203, 213, 225, 0.64)',
      eraserHoverBg: 'rgba(251, 113, 133, 0.16)',
      eraserHoverInk: '#fb7185',
    };
  }

  const accent = tidy.accent || '#d97706';
  const onAccent = '#ffffff';
  // 라이트 앰버(#d97706)를 단순 흑색 혼합으로 어둡히면 탁한 갈색이 되므로, 채도를 살린 앰버-700(#b45309, 5.02:1)으로 보정합니다.
  const preferredLightFill = themeId === 'amber' ? '#b45309' : accent;
  // 라이트 모드 강조색이 흰 글자와 4.5:1 이상을 넘도록 명도를 정밀 보정합니다.
  const accentFill = contrastRatio(preferredLightFill, onAccent) >= minRatio
    ? preferredLightFill
    : ensureContrast(preferredLightFill, onAccent, minRatio);

  const dockBg = mixHex(accent, tidy.bg, isPaper ? 0.075 : 0.065);
  const dockBorder = mixHex(accent, tidy.border, 0.22);
  const pillBg = isPaper ? '#fffdf7' : '#ffffff';
  const trackBg = mixHex('#1f2937', pillBg, 0.048);
  const softBg = mixHex(accent, pillBg, 0.10);
  const softHoverBg = mixHex(accent, pillBg, 0.18);
  const accentText = ensureContrast(accent, softBg, minRatio);

  return {
    themeId,
    themeGroup,
    dark: false,
    accent,
    accentFill,
    accentText,
    onAccent,
    dockBg,
    dockBorder,
    dockRim: mixHex(accent, dockBg, 0.16),
    dockGloss: 'rgba(255, 255, 255, 0.62)',
    pillBg,
    pillRim: mixHex(accent, '#cbd5e1', 0.24),
    trackBg,
    thumbBg: pillBg,
    chkBg: pillBg,
    chkBorder: isPaper ? mixHex(accent, '#b6bcc7', 0.30) : '#b4bac6',
    partialBg: mixHex(accent, pillBg, 0.15),
    softBg,
    softHoverBg,
    softBorder: mixHex(accent, dockBg, 0.30),
    softHoverBorder: mixHex(accent, dockBg, 0.48),
    primaryRim: mixHex('#000000', accentFill, 0.34),
    disabledBg: mixHex('#606976', dockBg, 0.16),
    disabledInk: '#6b7280',
    ink: '#1f2937',
    muted: '#606976',
    eraserInk: 'rgba(51, 65, 85, 0.56)',
    eraserHoverBg: 'rgba(225, 29, 72, 0.11)',
    eraserHoverInk: '#e11d48',
  };
}

/**
 * 팔레트 객체를 컴포넌트 인라인 style 문자열로 직렬화합니다.
 * @param {BulkDockPalette} p
 * @returns {string}
 */
export function bulkDockPaletteToStyle(p) {
  return [
    `--bd-accent:${p.accent}`,
    `--bd-accent-fill:${p.accentFill}`,
    `--bd-accent-text:${p.accentText}`,
    `--bd-on-accent:${p.onAccent}`,
    `--bd-dock-bg:${p.dockBg}`,
    `--bd-dock-border:${p.dockBorder}`,
    `--bd-dock-rim:${p.dockRim}`,
    `--bd-dock-gloss:${p.dockGloss}`,
    `--bd-pill-bg:${p.pillBg}`,
    `--bd-pill-rim:${p.pillRim}`,
    `--bd-track-bg:${p.trackBg}`,
    `--bd-thumb-bg:${p.thumbBg}`,
    `--bd-chk-bg:${p.chkBg}`,
    `--bd-chk-border:${p.chkBorder}`,
    `--bd-partial-bg:${p.partialBg}`,
    `--bd-soft-bg:${p.softBg}`,
    `--bd-soft-hover-bg:${p.softHoverBg}`,
    `--bd-soft-border:${p.softBorder}`,
    `--bd-soft-hover-border:${p.softHoverBorder}`,
    `--bd-primary-rim:${p.primaryRim}`,
    `--bd-disabled-bg:${p.disabledBg}`,
    `--bd-disabled-ink:${p.disabledInk}`,
    `--bd-ink:${p.ink}`,
    `--bd-muted:${p.muted}`,
    `--bd-eraser-ink:${p.eraserInk}`,
    `--bd-eraser-hover-bg:${p.eraserHoverBg}`,
    `--bd-eraser-hover-ink:${p.eraserHoverInk}`,
  ].join(';');
}
