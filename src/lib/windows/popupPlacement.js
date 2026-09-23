// ═══════════════════════════════════════════════════════════════════
// [버튼에 붙어 뜨는 작은 창의 위치 규칙] 날짜 선택 창처럼 "버튼 옆에 뜨는 별도 창"의 자리를 정합니다. (순수 함수)
//
// 왜 메모 창 안(모달)이 아니라 별도 창인가:
//   메모 창은 최소 높이 210px까지 줄어드는데 달력은 약 230~280px입니다. 창 안에서는 어디에 두어도
//   잘렸습니다. 별도 창은 메모 창 밖(바탕화면 위)까지 나올 수 있으므로 "모니터 작업영역"만 기준으로 삼습니다.
//
// 규칙:
//   ① 모니터: 버튼 가운데가 있는 모니터 → 없으면(창이 화면 밖에 걸친 경우) 가장 가까운 모니터.
//   ② 세로: 선호 방향(기본 아래) → 반대 방향 → 둘 다 모자라면 버튼 옆(오른쪽 → 왼쪽)
//           → 그래도 모자라면 작업영역 안으로 밀어 넣어 겹쳐 놓습니다(잘려서 못 쓰는 것보다 낫습니다).
//   ③ 가로: 버튼 왼쪽 끝에 맞추고, 화면 끝에 닿으면 안쪽으로 당깁니다.
//   ④ 크기는 "목표 모니터"의 배율로 환산합니다. 배율이 다른 모니터(4K 200% + FHD 100%)에서
//      팝업이 지금 놓인 모니터의 배율로 계산하면 크기가 2배 또는 절반이 됩니다.
//
// 단위: anchor·monitors·결과 좌표는 물리 픽셀(윈도우 가상 화면 좌표), size·gap·edge·margin은 논리 px.
// ═══════════════════════════════════════════════════════════════════

/**
 * @typedef {import('./windowPlacement.js').Rect} Rect
 * @typedef {import('./windowPlacement.js').MonitorGeometry} MonitorGeometry
 * @typedef {'below' | 'above' | 'right' | 'left' | 'overlay'} PopupSide
 * @typedef {{
 *   anchor: Rect,
 *   size: { width: number, height: number },
 *   monitors: MonitorGeometry[],
 *   prefer?: 'below' | 'above',
 *   gap?: number,
 *   edge?: number,
 *   margin?: number,
 *   fallbackScale?: number,
 * }} PopupPlacementInput
 * @typedef {{ x: number, y: number, width: number, height: number, scale: number, side: PopupSide, card: Rect }} PopupPlacement
 *   x/y/width/height: 창 전체(투명 여백 포함) 물리 사각형, card: 눈에 보이는 카드의 물리 사각형
 */

// 버튼과 카드 사이 간격(논리 px) — 붙어 보이되 버튼 테두리를 가리지 않는 정도
export const DEFAULT_POPUP_GAP = 4;
// 카드가 화면 끝(작업 표시줄 포함)에 딱 붙지 않도록 남기는 여백(논리 px)
export const DEFAULT_POPUP_EDGE = 6;

/** @param {unknown} value @returns {value is number} */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** @param {Rect} rect */
function centerOf(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** @param {Rect} rect @param {{x:number,y:number}} point */
function containsPoint(rect, point) {
  return point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height;
}

/** @param {Rect} rect @param {{x:number,y:number}} point */
function distanceToRect(rect, point) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

// value를 [min, max] 안으로 가둡니다. 범위가 뒤집혔으면(카드가 영역보다 큼) 시작점(min)에 맞춥니다.
// 왜 min인가: 카드가 화면보다 크면 머리(월 이동·끌기 손잡이)가 보이는 쪽을 살려야 다시 옮길 수 있습니다.
/** @param {number} value @param {number} min @param {number} max */
function clampInto(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** @param {unknown} rect @returns {rect is Rect} */
function isRect(rect) {
  const r = /** @type {any} */ (rect);
  return Boolean(r) && isFiniteNumber(r.x) && isFiniteNumber(r.y)
    && isFiniteNumber(r.width) && isFiniteNumber(r.height);
}

/**
 * 사각형(버튼)이 속한 모니터를 고릅니다. 가운데가 들어 있는 모니터 → 없으면 가장 가까운 모니터.
 * @param {Rect} rect 물리 px
 * @param {MonitorGeometry[]} monitors
 * @returns {MonitorGeometry | null}
 */
export function pickMonitorForRect(rect, monitors) {
  const list = (monitors || []).filter((m) => m && isRect(m.bounds) && isRect(m.work));
  if (list.length === 0 || !isRect(rect)) return null;
  const center = centerOf(rect);
  const inside = list.find((m) => containsPoint(m.bounds, center));
  if (inside) return inside;
  return list.reduce((best, m) => (
    distanceToRect(m.bounds, center) < distanceToRect(best.bounds, center) ? m : best
  ));
}

/**
 * 버튼(anchor) 옆에 띄울 팝업 창의 물리 좌표·크기를 계산합니다.
 * @param {PopupPlacementInput} input
 * @returns {PopupPlacement}
 */
export function placePopup({
  anchor,
  size,
  monitors,
  prefer = 'below',
  gap = DEFAULT_POPUP_GAP,
  edge = DEFAULT_POPUP_EDGE,
  margin = 0,
  fallbackScale = 1,
}) {
  const monitor = pickMonitorForRect(anchor, monitors);
  const scale = monitor ? monitor.scale : (isFiniteNumber(fallbackScale) && fallbackScale > 0 ? fallbackScale : 1);
  const width = Math.max(1, Math.ceil(size.width * scale));
  const height = Math.max(1, Math.ceil(size.height * scale));
  const g = Math.round(gap * scale);
  const pad = Math.round(margin * scale);
  const anchorBottom = anchor.y + anchor.height;
  const anchorRight = anchor.x + anchor.width;

  /** @type {PopupSide} */
  let side = prefer;
  let x = anchor.x;
  let y = prefer === 'above' ? anchor.y - g - height : anchorBottom + g;

  if (monitor) {
    // 화면 끝 여백을 뺀 실제 놓을 수 있는 영역. 여백 때문에 영역이 없어지면(아주 작은 화면) 여백을 포기합니다.
    const inset = Math.round(edge * scale);
    const work = monitor.work;
    const area = work.width > inset * 2 && work.height > inset * 2
      ? { x: work.x + inset, y: work.y + inset, width: work.width - inset * 2, height: work.height - inset * 2 }
      : work;
    const areaRight = area.x + area.width;
    const areaBottom = area.y + area.height;

    const fits = {
      below: anchorBottom + g + height <= areaBottom,
      above: anchor.y - g - height >= area.y,
      right: anchorRight + g + width <= areaRight,
      left: anchor.x - g - width >= area.x,
    };
    const verticalOrder = prefer === 'above' ? /** @type {const} */ (['above', 'below']) : /** @type {const} */ (['below', 'above']);
    const vertical = verticalOrder.find((s) => fits[s]);

    if (vertical) {
      side = vertical;
      y = vertical === 'below' ? anchorBottom + g : anchor.y - g - height;
      x = clampInto(anchor.x, area.x, areaRight - width);
    } else if (fits.right || fits.left) {
      // 위아래 모두 모자라면(세로가 짧은 화면) 버튼을 가리지 않도록 옆에 둡니다.
      // 세로는 버튼 가운데에 맞추되 화면 안으로 가둡니다.
      side = fits.right ? 'right' : 'left';
      x = fits.right ? anchorRight + g : anchor.x - g - width;
      y = clampInto(Math.round(anchor.y + anchor.height / 2 - height / 2), area.y, areaBottom - height);
    } else {
      // 어디에도 온전히 들어가지 않으면 버튼 위에 겹치더라도 작업영역 안에 놓습니다.
      side = 'overlay';
      x = clampInto(anchor.x, area.x, areaRight - width);
      y = clampInto(prefer === 'above' ? anchor.y - g - height : anchorBottom + g, area.y, areaBottom - height);
    }
  }

  const card = { x: Math.round(x), y: Math.round(y), width, height };
  return {
    x: card.x - pad,
    y: card.y - pad,
    width: width + pad * 2,
    height: height + pad * 2,
    scale,
    side,
    card,
  };
}
