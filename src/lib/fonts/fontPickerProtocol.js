// ═══════════════════════════════════════════════════════════════════
// [글꼴 선택 팝업 창 ↔ 호스트 창 약속] 'font-picker' 독립 팝업의 이벤트·규격·배치 순수 로직입니다.
//
// 왜 date-picker와 별도의 placeFontPicker를 두는가:
//   ① 드롭다운은 버튼 바로 아래/위에 "착 달라붙은 느낌"이 핵심입니다.
//      기존 placePopup은 높이가 1px만 모자라도 곧바로 버튼 오른쪽/왼쪽으로 튕겨 드롭다운 느낌이 깨졌습니다.
//      placeFontPicker는 가용 높이가 MIN_SNAP_HEIGHT(200px) 이상이면 옆으로 튕기지 않고
//      높이만 유연하게 맞춰 버튼에 붙은 채 내부 세로 스크롤로 표시합니다.
//   ② 이동 불가(Non-Draggable) + Zero-Halo Flush Edge(투명 여백 0px, gap 2px)로
//      버튼 하단에 정확히 밀착됩니다.
// ═══════════════════════════════════════════════════════════════════

import { pickMonitorForRect } from '../windows/popupPlacement.js';

// 비데이터 임시 창 라벨. Rust tray.rs::TRANSIENT_LABELS 및 analytics.rs::window_kind에 함께 등록합니다.
export const FONT_PICKER_LABEL = 'font-picker';

export const FONT_PICKER_EVENTS = Object.freeze({
  open: 'font-picker:open',
  close: 'font-picker:close',
  ping: 'font-picker:ping',
  ready: 'font-picker:ready',
  opened: 'font-picker:opened',
  closed: 'font-picker:closed',
  requesterDestroyed: 'font-picker:requester-destroyed',
});

export const FONT_PICKER_CLOSE_REASONS = Object.freeze([
  'select',
  'escape',
  'blur',
  'outside',
  'toggle',
  'superseded',
  'host-moved',
  'host-resized',
  'host-scrolled',
  'host-closed',
  'anchor-removed',
  'context-menu',
  'frozen',
  'requester',
  'error',
]);

/** @param {string} reason */
export const changesValue = (reason) => reason === 'select';
/** @param {string} reason */
export const returnsFocus = (reason) => reason === 'select' || reason === 'escape';

// ── 픽셀 규격 상수 (논리 px) ──────────────────────────────────────
// 252px: 내부 가용 218px에 5칩(페이퍼로지)·광폭 3칩(잘난체)·7탭 1줄이 모두 잘림 없이 수납되는 황금 폭.
export const STANDARD_WIDTH = 252;
export const MAX_WIDTH = 288;
// 332px: 상단 H3 탭 바(34px) + 약 9.5개 패밀리 행(반 행 걸침으로 스크롤 암시).
export const STANDARD_HEIGHT = 332;
// 200px: 상단 탭(34px) + 5.5행 확보 시 옆으로 튕기지 않고 버튼 아래/위에 밀착 유지.
export const MIN_SNAP_HEIGHT = 200;
// 트리거 하단선과 패널 상단 내측 림 사이의 초밀착 간격.
export const ANCHOR_GAP = 2;
// 모니터 작업영역 끝 여백.
export const EDGE_PADDING = 6;

export const FONT_PICKER_WINDOW_OPTIONS = Object.freeze({
  url: 'index.html',
  title: 'Tidy Task 글꼴 선택',
  width: STANDARD_WIDTH,
  height: STANDARD_HEIGHT,
  decorations: false,
  transparent: true,
  shadow: false,
  resizable: false,
  maximizable: false,
  minimizable: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  visible: false,
  focus: false,
});

/** @param {unknown} v @returns {v is number} */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v @param {number} max */
const shortText = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/** @param {number} value @param {number} min @param {number} max */
function clampInto(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * 트리거 너비에 따른 최적 팝업 논리 너비를 계산합니다.
 * 좁은 툴바 트리거는 STANDARD_WIDTH(252px), 넓은 설정 트리거는 최대 MAX_WIDTH(288px)까지 1:1로 맞춥니다.
 * @param {number} [triggerLogicalWidth]
 * @returns {number}
 */
export function resolvePickerWidth(triggerLogicalWidth = 0) {
  if (!isFiniteNumber(triggerLogicalWidth) || triggerLogicalWidth <= STANDARD_WIDTH) {
    return STANDARD_WIDTH;
  }
  return Math.min(MAX_WIDTH, Math.round(triggerLogicalWidth));
}

/**
 * @typedef {'below' | 'above' | 'right' | 'left' | 'overlay'} FontPickerSide
 * @typedef {{
 *   anchor: { x: number, y: number, width: number, height: number },
 *   width?: number,
 *   idealHeight?: number,
 *   minSnapHeight?: number,
 *   align?: 'start' | 'end',
 *   gap?: number,
 *   edge?: number,
 *   monitors: import('../windows/windowPlacement.js').MonitorGeometry[],
 *   fallbackScale?: number,
 * }} FontPickerPlacementInput
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   logicalWidth: number,
 *   logicalHeight: number,
 *   scale: number,
 *   side: FontPickerSide,
 * }} FontPickerPlacement
 */

/**
 * 높이 적응형 수직 밀착 배치 알고리즘.
 * 우선순위: ① 아래 정사이즈 → ② 위 정사이즈 → ③ 아래/위 중 넓은 쪽 높이 압축(≥ minSnapHeight) → ④ 좌/우 → ⑤ overlay
 * @param {FontPickerPlacementInput} input
 * @returns {FontPickerPlacement}
 */
export function placeFontPicker({
  anchor,
  width = STANDARD_WIDTH,
  idealHeight = STANDARD_HEIGHT,
  minSnapHeight = MIN_SNAP_HEIGHT,
  align = 'start',
  gap = ANCHOR_GAP,
  edge = EDGE_PADDING,
  monitors,
  fallbackScale = 1,
}) {
  const monitor = pickMonitorForRect(anchor, monitors);
  const scale = monitor && monitor.scale > 0
    ? monitor.scale
    : isFiniteNumber(fallbackScale) && fallbackScale > 0
      ? fallbackScale
      : 1;

  const targetLogicalW = clampInto(Math.round(width), 200, MAX_WIDTH);
  const targetLogicalH = Math.max(160, Math.round(idealHeight));
  const minLogicalH = Math.min(targetLogicalH, Math.max(120, Math.round(minSnapHeight)));

  const g = Math.round(gap * scale);
  let physW = Math.max(1, Math.ceil(targetLogicalW * scale));
  const idealPhysH = Math.max(1, Math.ceil(targetLogicalH * scale));
  const minPhysH = Math.max(1, Math.ceil(minLogicalH * scale));

  const anchorBottom = anchor.y + anchor.height;
  const anchorRight = anchor.x + anchor.width;

  /** @type {FontPickerSide} */
  let side = 'below';
  let x = align === 'end' ? anchorRight - physW : anchor.x;
  let y = anchorBottom + g;
  let physH = idealPhysH;

  if (monitor) {
    const inset = Math.round(edge * scale);
    const work = monitor.work;
    const area = work.width > inset * 2 && work.height > inset * 2
      ? { x: work.x + inset, y: work.y + inset, width: work.width - inset * 2, height: work.height - inset * 2 }
      : work;
    const areaRight = area.x + area.width;
    const areaBottom = area.y + area.height;

    physW = Math.min(physW, Math.max(1, area.width));
    const preferredX = align === 'end' ? anchorRight - physW : anchor.x;
    const clampedX = clampInto(preferredX, area.x, areaRight - physW);

    const availBelow = Math.floor(areaBottom - (anchorBottom + g));
    const availAbove = Math.floor((anchor.y - g) - area.y);
    const availRight = Math.floor(areaRight - (anchorRight + g));
    const availLeft = Math.floor((anchor.x - g) - area.x);

    if (availBelow >= idealPhysH) {
      side = 'below';
      x = clampedX;
      y = anchorBottom + g;
      physH = idealPhysH;
    } else if (availAbove >= idealPhysH) {
      side = 'above';
      x = clampedX;
      y = anchor.y - g - idealPhysH;
      physH = idealPhysH;
    } else if (Math.max(availBelow, availAbove) >= minPhysH) {
      // 가용 공간이 200~331px이면 옆으로 튕기지 않고 버튼 바로 아래/위에 밀착한 채 높이만 맞춥니다.
      if (availBelow >= availAbove) {
        side = 'below';
        physH = Math.min(idealPhysH, availBelow);
        x = clampedX;
        y = anchorBottom + g;
      } else {
        side = 'above';
        physH = Math.min(idealPhysH, availAbove);
        x = clampedX;
        y = anchor.y - g - physH;
      }
    } else if (availRight >= physW || availLeft >= physW) {
      side = availRight >= physW ? 'right' : 'left';
      physH = Math.min(idealPhysH, Math.max(1, area.height));
      x = side === 'right' ? anchorRight + g : anchor.x - g - physW;
      y = clampInto(Math.round(anchor.y), area.y, areaBottom - physH);
    } else {
      side = 'overlay';
      physH = Math.min(idealPhysH, Math.max(1, area.height));
      x = clampedX;
      y = clampInto(anchorBottom + g, area.y, areaBottom - physH);
    }
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(physW),
    height: Math.round(physH),
    logicalWidth: Math.round(physW / scale),
    logicalHeight: Math.round(physH / scale),
    scale,
    side,
  };
}

/**
 * @typedef {{ value: string, label: string, note?: string }} ExtraFontOption
 * @typedef {{
 *   requestId: string,
 *   requester: string,
 *   value: string,
 *   align: 'start' | 'end',
 *   preferredWidth: number,
 *   viaKeyboard: boolean,
 *   anchor: { x: number, y: number, width: number, height: number },
 *   theme: { source: 'tidy' | 'toolkit', themeId: string, isDarkMode: boolean },
 *   customFonts: Array<{ name: string, path: string }>,
 *   extraOptions: ExtraFontOption[],
 * }} FontPickerOpenRequest
 */

/**
 * open 페이로드를 검증·정규화합니다. 잘못된 형식이면 null.
 * @param {unknown} payload
 * @returns {FontPickerOpenRequest | null}
 */
export function normalizeOpenPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {any} */ (payload);
  const requestId = shortText(p.requestId, 120);
  const requester = shortText(p.requester, 80);
  const a = p.anchor;
  if (!requestId || !requester || !a || typeof a !== 'object') return null;
  if (![a.x, a.y, a.width, a.height].every(isFiniteNumber)) return null;

  const themeObj = p.theme && typeof p.theme === 'object' ? p.theme : {};
  const source = themeObj.source === 'toolkit' ? 'toolkit' : 'tidy';
  const themeId = shortText(themeObj.themeId, 40) || (source === 'toolkit' ? 'sage' : 'amber');
  const isDarkMode = themeObj.isDarkMode === true;

  const customFonts = Array.isArray(p.customFonts)
    ? p.customFonts
        .slice(0, 100)
        .map((/** @type {any} */ cf) => {
          const name = shortText(cf?.name, 120);
          const path = shortText(cf?.path, 1024);
          return name && path ? { name, path } : null;
        })
        .filter((/** @type {any} */ x) => x !== null)
    : [];

  const extraOptions = Array.isArray(p.extraOptions)
    ? p.extraOptions
        .slice(0, 5)
        .map((/** @type {any} */ opt) => {
          const value = shortText(opt?.value, 60);
          const label = shortText(opt?.label, 60);
          const note = shortText(opt?.note, 40) || undefined;
          return value && label ? (note ? { value, label, note } : { value, label }) : null;
        })
        .filter((/** @type {any} */ x) => x !== null)
    : [];

  const rawWidth = Number(p.preferredWidth);
  const preferredWidth = isFiniteNumber(rawWidth)
    ? clampInto(Math.round(rawWidth), STANDARD_WIDTH, MAX_WIDTH)
    : STANDARD_WIDTH;

  return {
    requestId,
    requester,
    value: typeof p.value === 'string' && p.value.length <= 120 ? p.value : '',
    align: p.align === 'end' ? 'end' : 'start',
    preferredWidth,
    viaKeyboard: p.viaKeyboard === true,
    anchor: {
      x: Math.round(a.x),
      y: Math.round(a.y),
      width: Math.max(0, Math.round(a.width)),
      height: Math.max(0, Math.round(a.height)),
    },
    theme: { source, themeId, isDarkMode },
    customFonts,
    extraOptions,
  };
}

/**
 * closed 페이로드를 검증·정규화합니다.
 * @param {unknown} payload
 * @returns {{ requestId: string, reason: string, value: string } | null}
 */
export function normalizeClosedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {any} */ (payload);
  const requestId = shortText(p.requestId, 120);
  const reason = FONT_PICKER_CLOSE_REASONS.includes(p.reason) ? p.reason : null;
  if (!requestId || !reason) return null;
  if (reason === 'select') {
    const val = shortText(p.value, 120);
    if (!val) return null;
    return { requestId, reason, value: val };
  }
  return { requestId, reason, value: '' };
}
