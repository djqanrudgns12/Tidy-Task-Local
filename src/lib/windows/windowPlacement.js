// ═══════════════════════════════════════════════════════════════════
// [창 위치 복원 규칙] 여러 모니터 + 서로 다른 화면 배율에서도 창이 화면 안에 나타나게 합니다. (순수 함수)
//
// 왜 필요한가 (실제로 확인된 원인):
//   4K 모니터(배율 200%)와 FHD 모니터(배율 100%)를 함께 쓰면 "논리 좌표"(물리 픽셀 ÷ 배율)의 기준이
//   모니터마다 달라집니다. FHD 모니터의 물리 x=4500에 둔 창은 논리 좌표 4500으로 저장되는데,
//   다음 실행 때 창은 주 모니터(배율 2)에서 만들어지므로 4500 × 2 = 9000(물리)으로 옮겨져
//   모든 모니터 밖에 놓였습니다. 트레이의 "좌표 초기화"를 눌러야만 창이 보이던 이유입니다.
//
// 규칙:
//   ① 5.0.5부터 물리 좌표(windowPhysX/Y)를 함께 저장하고, 복원은 물리 좌표를 우선합니다.
//   ② 예전 데이터(논리 좌표만 있음)는 "각 모니터의 배율로 되돌렸을 때 바로 그 모니터 안에 보이는가"로 해석합니다.
//   ③ 그래도 제목줄을 잡을 수 없는 위치라면 주 모니터 작업영역 가운데로 옮깁니다.
//   모든 좌표·크기는 물리 픽셀(윈도우 가상 화면 좌표) 기준입니다.
// ═══════════════════════════════════════════════════════════════════

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {{ bounds: Rect, work: Rect, scale: number }} MonitorGeometry
 */

// 창을 끌어 옮기려면 제목줄이 최소한 이만큼(논리 px) 작업영역 안에 보여야 합니다.
export const MIN_GRAB_WIDTH = 80;
export const MIN_GRAB_HEIGHT = 24;
// 제목줄(드래그 영역)로 보는 창 윗부분의 높이(논리 px)
export const TITLE_STRIP_HEIGHT = 32;
// 저장된 크기가 없을 때 가정하는 창 크기(논리 px) — tauri.conf.json의 main 기본 크기
const DEFAULT_LOGICAL_WIDTH = 350;
const DEFAULT_LOGICAL_HEIGHT = 500;

/** @param {unknown} value @returns {value is number} */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// 최소화된 창은 윈도우가 (-32000, -32000)으로 옮겨 두므로, 그런 값은 "위치"로 보지 않습니다.
/** @param {unknown} value @returns {value is number} */
export function isPlausibleCoordinate(value) {
  return isFiniteNumber(value) && value > -10000 && value < 100000;
}

/**
 * Tauri의 Monitor 객체를 물리 픽셀 사각형으로 바꿉니다.
 * @param {any} monitor
 * @returns {MonitorGeometry | null}
 */
export function toMonitorGeometry(monitor) {
  if (!monitor || !monitor.position || !monitor.size) return null;
  const bounds = {
    x: monitor.position.x,
    y: monitor.position.y,
    width: monitor.size.width,
    height: monitor.size.height,
  };
  const area = monitor.workArea;
  const work = area && area.position && area.size
    ? { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height }
    : bounds;
  const scale = Number(monitor.scaleFactor) > 0 ? Number(monitor.scaleFactor) : 1;
  return { bounds, work, scale };
}

/** @param {Rect} a @param {Rect} b */
function overlap(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/**
 * 창의 제목줄이 이 모니터 작업영역 안에서 "잡을 수 있을 만큼" 보이는지 판단합니다.
 * @param {Rect} windowRect 물리 픽셀 창 사각형
 * @param {MonitorGeometry} monitor
 */
export function isTitleStripVisible(windowRect, monitor) {
  const stripHeight = Math.min(windowRect.height, TITLE_STRIP_HEIGHT * monitor.scale);
  const strip = { x: windowRect.x, y: windowRect.y, width: windowRect.width, height: stripHeight };
  const hit = overlap(strip, monitor.work);
  const needWidth = Math.min(MIN_GRAB_WIDTH * monitor.scale, windowRect.width);
  const needHeight = Math.min(MIN_GRAB_HEIGHT * monitor.scale, stripHeight);
  return hit.width >= needWidth && hit.height >= needHeight;
}

/** @param {unknown} value @param {number} fallback */
function logicalSizeOr(value, fallback) {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

/**
 * 저장된 좌표를 지금 연결된 모니터 기준의 물리 좌표로 해석합니다.
 * @param {{ physicalX?: unknown, physicalY?: unknown, logicalX?: unknown, logicalY?: unknown, width?: unknown, height?: unknown }} saved
 *   width/height는 저장된 논리 크기(windowWidth/Height)
 * @param {MonitorGeometry[]} monitors
 * @returns {{ x: number, y: number } | null} 쓸 수 없으면 null (기본 위치에 두고 화면 안 검사에 맡김)
 */
export function resolveSavedPosition(saved, monitors) {
  const list = (monitors || []).filter(Boolean);
  if (list.length === 0 || !saved) return null;

  const logicalWidth = logicalSizeOr(saved.width, DEFAULT_LOGICAL_WIDTH);
  const logicalHeight = logicalSizeOr(saved.height, DEFAULT_LOGICAL_HEIGHT);
  /** @param {number} x @param {number} y @param {MonitorGeometry} m */
  const rectOn = (x, y, m) => ({ x, y, width: logicalWidth * m.scale, height: logicalHeight * m.scale });

  // ① 물리 좌표: 모니터 배율과 무관하므로 그대로 씁니다 (어느 모니터에서든 제목줄이 보이면 채택)
  if (isPlausibleCoordinate(saved.physicalX) && isPlausibleCoordinate(saved.physicalY)) {
    const x = Math.round(saved.physicalX);
    const y = Math.round(saved.physicalY);
    if (list.some((m) => isTitleStripVisible(rectOn(x, y, m), m))) return { x, y };
  }

  // ② 논리 좌표(예전 데이터): 모니터마다 "그 모니터의 배율로 저장됐다"고 가정해 되돌려 보고,
  //    되돌린 위치가 바로 그 모니터 안에 보이는 경우만 정답으로 인정합니다.
  if (isPlausibleCoordinate(saved.logicalX) && isPlausibleCoordinate(saved.logicalY)) {
    for (const m of list) {
      const x = Math.round(saved.logicalX * m.scale);
      const y = Math.round(saved.logicalY * m.scale);
      if (isTitleStripVisible(rectOn(x, y, m), m)) return { x, y };
    }
  }

  return null;
}

// 주 모니터: 윈도우에서는 가상 화면 좌표 (0, 0)을 포함하는 모니터입니다.
/** @param {MonitorGeometry[]} monitors */
export function pickPrimaryMonitor(monitors) {
  const list = (monitors || []).filter(Boolean);
  const primary = list.find((m) => m.bounds.x <= 0 && m.bounds.y <= 0
    && m.bounds.x + m.bounds.width > 0 && m.bounds.y + m.bounds.height > 0);
  return primary || list[0] || null;
}

/**
 * 창이 어느 모니터에서도 제목줄을 잡을 수 없는 위치라면, 주 모니터 작업영역 가운데 좌표를 돌려줍니다.
 * @param {Rect} windowRect 물리 픽셀 창 사각형 (outerPosition + outerSize)
 * @param {MonitorGeometry[]} monitors
 * @returns {{ x: number, y: number } | null} 옮길 필요가 없거나 판단할 수 없으면 null
 */
export function findVisiblePlacement(windowRect, monitors) {
  const list = (monitors || []).filter(Boolean);
  if (list.length === 0 || !windowRect) return null;
  if (list.some((m) => isTitleStripVisible(windowRect, m))) return null;

  const target = pickPrimaryMonitor(list);
  if (!target) return null;
  const { work } = target;
  return {
    x: Math.round(work.x + Math.max(0, (work.width - windowRect.width) / 2)),
    y: Math.round(work.y + Math.max(0, (work.height - windowRect.height) / 2)),
  };
}
