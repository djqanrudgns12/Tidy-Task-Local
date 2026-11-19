// D-Day 컨트롤 패널·바탕화면 위젯의 다중 모니터 DPI 2-pass 배치, 더블클릭 토글, 자석 스냅을 담당합니다.
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { ensureWindowOnScreen, getMonitorGeometries } from '../windows/windowRegistry.js';
import { isPlausibleCoordinate, pickPrimaryMonitor, resolveSavedPosition } from '../windows/windowPlacement.js';
import {
  DDAY_CONTROL_BOUNDS,
  normalizeBoundedGeometry,
  normalizeControlGeometry,
} from './ddayModel.js';
import { clamp } from './ddayLayout.js';

/**
 * 물리 좌표를 포함하는 모니터를 찾고, 없으면 주 모니터를 돌려줍니다.
 * @param {number | null | undefined} x
 * @param {number | null | undefined} y
 * @param {import('../windows/windowPlacement.js').MonitorGeometry[]} monitors
 */
export function findMonitorAtPoint(x, y, monitors) {
  const list = (monitors || []).filter(Boolean);
  if (list.length === 0) return null;
  if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
    const found = list.find(
      (m) => x >= m.bounds.x && x < m.bounds.x + m.bounds.width && y >= m.bounds.y && y < m.bounds.y + m.bounds.height,
    );
    if (found) return found;
  }
  return pickPrimaryMonitor(list);
}

/**
 * 대상 모니터의 논리 작업영역에 맞춰 실효 최소·최대 창 크기를 계산합니다.
 * 왜 workMax가 bounds.min보다 작을 때 min을 낮추는가:
 *   1280×720@150%(작업높이 448px) 등 작은 화면에서 setMinSize(460)를 강제하면
 *   창이 작업영역보다 커져 작업표시줄 뒤로 가리고 사용자가 줄일 수도 없게 되기 때문입니다.
 * @param {import('../windows/windowPlacement.js').MonitorGeometry | null | undefined} monitor
 * @param {{ minWidth: number, minHeight: number, maxWidth: number, maxHeight: number }} [bounds]
 * @param {number} [margin]
 * @returns {{ minWidth: number, minHeight: number, maxWidth: number, maxHeight: number }}
 */
export function resolveControlSizeLimits(monitor, bounds = DDAY_CONTROL_BOUNDS, margin = 24) {
  const scale = monitor && monitor.scale > 0 ? monitor.scale : 1;
  const workMaxW = monitor
    ? Math.max(260, Math.floor(monitor.work.width / scale - margin))
    : bounds.maxWidth;
  const workMaxH = monitor
    ? Math.max(260, Math.floor(monitor.work.height / scale - margin))
    : bounds.maxHeight;

  const minWidth = Math.min(bounds.minWidth, workMaxW);
  const minHeight = Math.min(bounds.minHeight, workMaxH);
  const maxWidth = Math.max(minWidth, Math.min(bounds.maxWidth, workMaxW));
  const maxHeight = Math.max(minHeight, Math.min(bounds.maxHeight, workMaxH));
  return { minWidth, minHeight, maxWidth, maxHeight };
}

/**
 * 논리 창 크기를 대상 모니터 작업영역과 실효 하네스 경계 이내로 안전하게 제한합니다.
 * @param {{ width: number, height: number }} size
 * @param {{ minWidth: number, minHeight: number, maxWidth: number, maxHeight: number }} bounds
 * @param {import('../windows/windowPlacement.js').MonitorGeometry | null} monitor
 * @param {number} [margin]
 */
export function clampSizeToMonitor(size, bounds, monitor, margin = 16) {
  const limits = resolveControlSizeLimits(monitor, bounds, margin);
  const width = Math.round(clamp(size.width, limits.minWidth, limits.maxWidth));
  const height = Math.round(clamp(size.height, limits.minHeight, limits.maxHeight));
  return { width, height };
}

/**
 * 컨트롤 패널 창에 대상 모니터 기준 실효 min/max 크기 제한과 최대화 금지를 적용합니다.
 * @param {Pick<import('@tauri-apps/api/window').Window, 'setMinSize' | 'setMaxSize' | 'setMaximizable'>} win
 * @param {import('../windows/windowPlacement.js').MonitorGeometry | null | undefined} monitor
 * @param {{ minWidth: number, minHeight: number, maxWidth: number, maxHeight: number }} [bounds]
 * @param {number} [margin]
 */
export async function applyControlWindowLimits(win, monitor, bounds = DDAY_CONTROL_BOUNDS, margin = 24) {
  const limits = resolveControlSizeLimits(monitor, bounds, margin);
  await win.setMinSize(new LogicalSize(limits.minWidth, limits.minHeight)).catch(() => {});
  await win.setMaxSize?.(new LogicalSize(limits.maxWidth, limits.maxHeight)).catch?.(() => {});
  await win.setMaximizable?.(false).catch?.(() => {});
  return limits;
}

/**
 * 컨트롤 타워 헤더 더블클릭(또는 크기 토글 버튼) 시 전환할 기본 ↔ 와이드 목표를 계산합니다.
 * 현재 창 중심을 유지하되 모니터 작업영역 밖으로 튀어나가지 않게 보정합니다.
 * @param {{
 *   currentPos: { x: number, y: number } | null,
 *   currentSize: { width: number, height: number } | null,
 *   currentScale?: number,
 *   monitors: import('../windows/windowPlacement.js').MonitorGeometry[],
 *   forcePreset?: 'wide' | 'default' | null,
 * }} input
 * forcePreset: 크기 토글 "버튼"은 자기 글자(넓게 보기 / 기본 크기로 축소)대로 가야 합니다.
 *   "기본 크기에 가까운가"로만 고르면 높이만 조금 바꾼 창에서 [넓게 보기]가 오히려 기본 크기로 줄어
 *   눌러도 안 되는 것처럼 보였습니다(6.0.0 출시 전 실제 앱에서 확인). 헤더 더블클릭은 지정하지 않습니다.
 * @returns {{ width: number, height: number, physicalX: number | null, physicalY: number | null, preset: 'wide' | 'default' }}
 */
export function computeDoubleClickTarget({
  currentPos,
  currentSize,
  currentScale = 1,
  monitors,
  forcePreset = null,
}) {
  const cx = currentPos && currentSize ? currentPos.x + currentSize.width / 2 : null;
  const cy = currentPos && currentSize ? currentPos.y + currentSize.height / 2 : null;
  const monitor = findMonitorAtPoint(cx, cy, monitors);
  const scale = monitor && monitor.scale > 0 ? monitor.scale : currentScale > 0 ? currentScale : 1;

  const defSize = clampSizeToMonitor(
    { width: DDAY_CONTROL_BOUNDS.defaultWidth, height: DDAY_CONTROL_BOUNDS.defaultHeight },
    DDAY_CONTROL_BOUNDS,
    monitor,
    36,
  );
  const wideSize = clampSizeToMonitor(
    { width: DDAY_CONTROL_BOUNDS.wideWidth, height: DDAY_CONTROL_BOUNDS.wideHeight },
    DDAY_CONTROL_BOUNDS,
    monitor,
    32,
  );

  const curLogW = currentSize ? currentSize.width / scale : defSize.width;
  const curLogH = currentSize ? currentSize.height / scale : defSize.height;
  const isNearDefault =
    Math.abs(curLogW - defSize.width) <= 18 && Math.abs(curLogH - defSize.height) <= 18;

  /** @type {'wide' | 'default'} */
  const preset = forcePreset === 'wide' || forcePreset === 'default'
    ? forcePreset
    : isNearDefault ? 'wide' : 'default';
  const targetSize = preset === 'wide' ? wideSize : defSize;

  let physicalX = null;
  let physicalY = null;
  if (monitor && currentPos && currentSize) {
    const newPhysW = Math.round(targetSize.width * scale);
    const newPhysH = Math.round(targetSize.height * scale);
    const centerX = currentPos.x + currentSize.width / 2;
    const centerY = currentPos.y + currentSize.height / 2;
    const pad = Math.round(8 * scale);
    const minX = monitor.work.x + pad;
    const maxX = Math.max(minX, monitor.work.x + monitor.work.width - newPhysW - pad);
    const minY = monitor.work.y + pad;
    const maxY = Math.max(minY, monitor.work.y + monitor.work.height - newPhysH - pad);

    physicalX = Math.round(clamp(centerX - newPhysW / 2, minX, maxX));
    physicalY = Math.round(clamp(centerY - newPhysH / 2, minY, maxY));
  }

  return {
    width: targetSize.width,
    height: targetSize.height,
    physicalX,
    physicalY,
    preset,
  };
}

/**
 * 위젯 창이 모니터 작업영역 가장자리에 가까우면 일정 간격(8px)으로 자석처럼 정렬합니다.
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {import('../windows/windowPlacement.js').MonitorGeometry[]} monitors
 * @param {{ snapThresholdLogical?: number, edgeGapLogical?: number }} [options]
 * @returns {{ x: number, y: number, snapped: boolean }}
 */
export function snapWidgetRectToEdges(
  rect,
  monitors,
  { snapThresholdLogical = 14, edgeGapLogical = 8 } = {},
) {
  if (!rect || !Array.isArray(monitors) || monitors.length === 0) {
    return { x: rect?.x ?? 0, y: rect?.y ?? 0, snapped: false };
  }
  const monitor = findMonitorAtPoint(rect.x + rect.width / 2, rect.y + rect.height / 2, monitors);
  if (!monitor) return { x: rect.x, y: rect.y, snapped: false };

  const scale = monitor.scale > 0 ? monitor.scale : 1;
  const threshold = snapThresholdLogical * scale;
  const gap = Math.round(edgeGapLogical * scale);
  const { work } = monitor;

  let x = rect.x;
  let y = rect.y;

  const leftEdge = work.x + gap;
  const rightEdge = work.x + work.width - rect.width - gap;
  if (Math.abs(rect.x - leftEdge) <= threshold) {
    x = Math.round(leftEdge);
  } else if (Math.abs(rect.x - rightEdge) <= threshold) {
    x = Math.round(rightEdge);
  }

  const topEdge = work.y + gap;
  const bottomEdge = work.y + work.height - rect.height - gap;
  if (Math.abs(rect.y - topEdge) <= threshold) {
    y = Math.round(topEdge);
  } else if (Math.abs(rect.y - bottomEdge) <= threshold) {
    y = Math.round(bottomEdge);
  }

  const movedEnough = Math.abs(x - rect.x) >= 2 || Math.abs(y - rect.y) >= 2;
  return { x, y, snapped: movedEnough };
}

/**
 * 컨트롤 타워에서 [위젯 띄우기] 실행 시 저장 위치가 없는 위젯이 컨트롤 창 뒤에 가려지지 않게 옆자리를 계산합니다.
 * @param {{
 *   controlPos: { x: number, y: number },
 *   controlSize: { width: number, height: number },
 *   widgetSize: { width: number, height: number },
 *   monitors: import('../windows/windowPlacement.js').MonitorGeometry[],
 * }} input
 * @returns {{ x: number, y: number } | null}
 */
export function computeWidgetSidePlacement({ controlPos, controlSize, widgetSize, monitors }) {
  const monitor = findMonitorAtPoint(
    controlPos.x + controlSize.width / 2,
    controlPos.y + controlSize.height / 2,
    monitors,
  );
  if (!monitor) return null;
  const scale = monitor.scale > 0 ? monitor.scale : 1;
  const gap = Math.round(14 * scale);
  const pad = Math.round(12 * scale);
  const { work } = monitor;

  const minX = work.x + pad;
  const maxX = Math.max(minX, work.x + work.width - widgetSize.width - pad);
  const minY = work.y + pad;
  const maxY = Math.max(minY, work.y + work.height - widgetSize.height - pad);
  const y = Math.round(clamp(controlPos.y, minY, maxY));

  const rightX = controlPos.x + controlSize.width + gap;
  if (rightX <= maxX) {
    return { x: Math.round(rightX), y };
  }

  const leftX = controlPos.x - widgetSize.width - gap;
  if (leftX >= minX) {
    return { x: Math.round(leftX), y };
  }

  return { x: Math.round(maxX), y: Math.round(minY) };
}

/**
 * 저장된 기하학(물리·논리 듀얼 좌표)을 최소/최대 크기 → 모니터 작업영역 클램프 → 2-pass 순서로 적용합니다.
 * 왜 2회 적용하는가: 배율이 다른 모니터(4K 200% ↔ FHD 100%)로 이동 시 OS가 첫 이동 직후 창 크기를 재계산하기 때문입니다.
 * @param {import('@tauri-apps/api/window').Window} win
 * @param {import('./ddayModel.js').DdayGeometry | { physicalX?: number | null, physicalY?: number | null, logicalX?: number | null, logicalY?: number | null, width: number, height: number }} target
 * @param {{ minWidth: number, minHeight: number, maxWidth: number, maxHeight: number }} bounds
 * @param {{ enforceMaxSize?: boolean, disableMaximize?: boolean }} [options]
 */
export async function applyDdayWindowBounds(win, target, bounds, options = {}) {
  const monitors = await getMonitorGeometries();
  const resolvedPos = resolveSavedPosition(
    {
      physicalX: target.physicalX ?? /** @type {any} */ (target).x,
      physicalY: target.physicalY ?? /** @type {any} */ (target).y,
      logicalX: target.logicalX,
      logicalY: target.logicalY,
      width: target.width,
      height: target.height,
    },
    monitors,
  );

  const monitor = resolvedPos ? findMonitorAtPoint(resolvedPos.x, resolvedPos.y, monitors) : pickPrimaryMonitor(monitors);
  const limits = resolveControlSizeLimits(monitor, bounds);
  await win.setMinSize(new LogicalSize(limits.minWidth, limits.minHeight)).catch(() => {});
  if (options.enforceMaxSize) {
    await win.setMaxSize?.(new LogicalSize(limits.maxWidth, limits.maxHeight)).catch?.(() => {});
  }
  if (options.disableMaximize) {
    await win.setMaximizable?.(false).catch?.(() => {});
  }

  const clamped = clampSizeToMonitor({ width: target.width, height: target.height }, bounds, monitor);

  for (let pass = 0; pass < 2; pass++) {
    if (resolvedPos) {
      await win.setPosition(new PhysicalPosition(resolvedPos.x, resolvedPos.y)).catch(() => {});
    }
    await win.setSize(new LogicalSize(clamped.width, clamped.height)).catch(() => {});
  }
  await ensureWindowOnScreen(win, monitors);
}

/**
 * 최소화·최대화·전체화면 상태가 아닐 때만 현재 창 기하학을 안전하게 캡처합니다.
 * @param {import('@tauri-apps/api/window').Window} win
 * @param {{ minWidth: number, minHeight: number, maxWidth: number, maxHeight: number }} bounds
 * @param {{ clampSize?: boolean }} [options]
 * @returns {Promise<import('./ddayModel.js').DdayGeometry | null>}
 */
export async function captureWindowGeometry(win, bounds, options = {}) {
  const [minimized, maximized, fullscreen] = await Promise.all([
    win.isMinimized().catch(() => false),
    win.isMaximized().catch(() => false),
    win.isFullscreen().catch(() => false),
  ]);
  if (minimized || maximized || fullscreen) return null;

  const [pos, size, scale] = await Promise.all([
    win.outerPosition(),
    win.innerSize(),
    win.scaleFactor(),
  ]);
  if (!isPlausibleCoordinate(pos.x) || !isPlausibleCoordinate(pos.y)) return null;
  const factor = Number(scale) > 0 ? Number(scale) : 1;
  const rawGeometry = {
    x: pos.x,
    y: pos.y,
    physicalX: pos.x,
    physicalY: pos.y,
    logicalX: Math.round(pos.x / factor),
    logicalY: Math.round(pos.y / factor),
    width: Math.round(size.width / factor),
    height: Math.round(size.height / factor),
  };

  return options.clampSize
    ? normalizeControlGeometry(rawGeometry, bounds)
    : normalizeBoundedGeometry(rawGeometry, bounds);
}
