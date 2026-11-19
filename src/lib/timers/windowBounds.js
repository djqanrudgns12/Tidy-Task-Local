// 타이머 창의 일반 ↔ 위젯 ↔ 전체화면 전환 시 다중 모니터 DPI 배율 왜곡 없이 좌표·크기를 적용하는 도우미입니다.
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { ensureWindowOnScreen, getMonitorGeometries } from '../windows/windowRegistry.js';
import { isPlausibleCoordinate, pickPrimaryMonitor, resolveSavedPosition } from '../windows/windowPlacement.js';
import { resolveNonOverlappingWidgetBounds } from './layout.js';
import { WIDGET_MIN_HEIGHT, WIDGET_MIN_WIDTH } from './timerDisplayPreferences.js';

/**
 * @typedef {{
 *   physicalX?: number | null,
 *   physicalY?: number | null,
 *   logicalX?: number | null,
 *   logicalY?: number | null,
 *   width: number,
 *   height: number
 * }} TimerWindowTarget
 */

/**
 * 지정한 물리 위치·논리 크기를 최소 크기 갱신 → 모니터 작업영역 제한 → 2회 적용 순서로 반영합니다.
 * 왜 2회 반복하는가(claude.md 3.2.2): 배율이 다른 모니터(4K 200% ↔ FHD 100%)로 이동하면 OS가
 * 첫 번째 이동 직후 배율에 맞춰 창 크기를 다시 계산하므로, 한 번 더 적용해야 정확한 크기로 안착합니다.
 * @param {import('@tauri-apps/api/window').Window} win
 * @param {TimerWindowTarget} target
 * @param {{ minWidth?: number, minHeight?: number }} [constraints]
 */
export async function applyTimerWindowBounds(
  win,
  target,
  { minWidth = WIDGET_MIN_WIDTH, minHeight = WIDGET_MIN_HEIGHT } = {},
) {
  const monitors = await getMonitorGeometries();
  await win.setMinSize(new LogicalSize(minWidth, minHeight));

  const resolvedPos = resolveSavedPosition(
    {
      physicalX: target.physicalX,
      physicalY: target.physicalY,
      logicalX: target.logicalX,
      logicalY: target.logicalY,
      width: target.width,
      height: target.height,
    },
    monitors,
  );

  let monitor = pickPrimaryMonitor(monitors);
  if (resolvedPos && monitors.length > 0) {
    monitor =
      monitors.find(
        (m) =>
          resolvedPos.x >= m.bounds.x &&
          resolvedPos.x < m.bounds.x + m.bounds.width &&
          resolvedPos.y >= m.bounds.y &&
          resolvedPos.y < m.bounds.y + m.bounds.height,
      ) ?? monitor;
  }

  const scale = monitor && monitor.scale > 0 ? monitor.scale : 1;
  const maxW = monitor ? Math.max(minWidth, Math.floor(monitor.work.width / scale - 16)) : target.width;
  const maxH = monitor ? Math.max(minHeight, Math.floor(monitor.work.height / scale - 16)) : target.height;
  const width = Math.max(minWidth, Math.round(Math.min(target.width, maxW)));
  const height = Math.max(minHeight, Math.round(Math.min(target.height, maxH)));

  for (let pass = 0; pass < 2; pass++) {
    if (resolvedPos) {
      await win.setPosition(new PhysicalPosition(resolvedPos.x, resolvedPos.y));
    }
    await win.setSize(new LogicalSize(width, height));
  }
  await ensureWindowOnScreen(win, monitors);
}

/**
 * 이미 떠 있는 다른 타이머 창들의 물리 영역을 읽어 위젯 배치 시 겹침을 피하는 데 씁니다.
 * @param {string} selfLabel
 * @returns {Promise<import('./layout.js').PhysicalRect[]>}
 */
export async function readOtherTimerRects(selfLabel) {
  /** @type {import('./layout.js').PhysicalRect[]} */
  const rects = [];
  try {
    const windows = await getAllWebviewWindows();
    for (const w of windows) {
      if (w.label === selfLabel || !w.label.startsWith('timer-')) continue;
      const minimized = await w.isMinimized().catch(() => true);
      const visible = await w.isVisible().catch(() => false);
      if (minimized || !visible) continue;
      const [pos, size] = await Promise.all([w.outerPosition(), w.outerSize()]);
      if (
        isPlausibleCoordinate(pos.x) &&
        isPlausibleCoordinate(pos.y) &&
        size.width > 0 &&
        size.height > 0
      ) {
        rects.push({ x: pos.x, y: pos.y, width: size.width, height: size.height });
      }
    }
  } catch {}
  return rects;
}

/**
 * 위젯 모드로 진입할 때 사용할 초기 위치와 크기를 계산합니다.
 * 마지막 저장 위치(savedWidgetBounds)가 유효하면 우선 쓰고, 없으면 현재 창이 속한 모니터 우측 상단에 놓습니다.
 * @param {{
 *   currentPos: { x: number, y: number } | null,
 *   currentSize: { width: number, height: number } | null,
 *   monitors: import('../windows/windowPlacement.js').MonitorGeometry[],
 *   existingRects: import('./layout.js').PhysicalRect[],
 *   savedWidgetBounds: import('./timerDisplayPreferences.js').TimerWidgetBounds | null
 * }} input
 * @returns {TimerWindowTarget}
 */
export function defaultWidgetPlacement({
  currentPos,
  currentSize,
  monitors,
  existingRects,
  savedWidgetBounds,
}) {
  if (!monitors || monitors.length === 0) {
    return {
      physicalX: null,
      physicalY: null,
      logicalX: null,
      logicalY: null,
      width: savedWidgetBounds?.width ?? 340,
      height: savedWidgetBounds?.height ?? 236,
    };
  }

  if (savedWidgetBounds) {
    const resolved = resolveSavedPosition(savedWidgetBounds, monitors);
    if (resolved) {
      const targetMonitor =
        monitors.find(
          (m) =>
            resolved.x >= m.bounds.x &&
            resolved.x < m.bounds.x + m.bounds.width &&
            resolved.y >= m.bounds.y &&
            resolved.y < m.bounds.y + m.bounds.height,
        ) ?? pickPrimaryMonitor(monitors);
      if (targetMonitor) {
        const scale = targetMonitor.scale > 0 ? targetMonitor.scale : 1;
        const w = Math.min(
          savedWidgetBounds.width,
          Math.max(WIDGET_MIN_WIDTH, Math.floor(targetMonitor.work.width / scale - 16)),
        );
        const h = Math.min(
          savedWidgetBounds.height,
          Math.max(WIDGET_MIN_HEIGHT, Math.floor(targetMonitor.work.height / scale - 16)),
        );
        const placed = resolveNonOverlappingWidgetBounds(
          {
            x: resolved.x,
            y: resolved.y,
            width: Math.round(w * scale),
            height: Math.round(h * scale),
          },
          existingRects,
          targetMonitor.work,
          Math.round(28 * scale),
        );
        return {
          physicalX: placed.x,
          physicalY: placed.y,
          logicalX: Math.round(placed.x / scale),
          logicalY: Math.round(placed.y / scale),
          width: w,
          height: h,
        };
      }
    }
  }

  const cx = currentPos && currentSize ? currentPos.x + currentSize.width / 2 : 0;
  const cy = currentPos && currentSize ? currentPos.y + currentSize.height / 2 : 0;
  const hostMonitor =
    (currentPos &&
      monitors.find(
        (m) =>
          cx >= m.bounds.x &&
          cx < m.bounds.x + m.bounds.width &&
          cy >= m.bounds.y &&
          cy < m.bounds.y + m.bounds.height,
      )) ??
    pickPrimaryMonitor(monitors) ??
    monitors[0];

  const scale = hostMonitor.scale > 0 ? hostMonitor.scale : 1;
  const w = Math.min(340, Math.max(WIDGET_MIN_WIDTH, Math.floor(hostMonitor.work.width / scale - 24)));
  const h = Math.min(236, Math.max(WIDGET_MIN_HEIGHT, Math.floor(hostMonitor.work.height / scale - 24)));
  const desiredX = hostMonitor.work.x + Math.max(0, hostMonitor.work.width - Math.round((w + 8) * scale));
  const desiredY = hostMonitor.work.y + Math.round(8 * scale);

  const placed = resolveNonOverlappingWidgetBounds(
    {
      x: desiredX,
      y: desiredY,
      width: Math.round(w * scale),
      height: Math.round(h * scale),
    },
    existingRects,
    hostMonitor.work,
    Math.round(28 * scale),
  );

  return {
    physicalX: placed.x,
    physicalY: placed.y,
    logicalX: Math.round(placed.x / scale),
    logicalY: Math.round(placed.y / scale),
    width: w,
    height: h,
  };
}
