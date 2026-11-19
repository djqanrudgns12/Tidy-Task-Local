import test from 'node:test';
import assert from 'node:assert/strict';
import { DDAY_CONTROL_BOUNDS } from './ddayModel.js';
import {
  applyControlWindowLimits,
  clampSizeToMonitor,
  computeDoubleClickTarget,
  computeWidgetSidePlacement,
  resolveControlSizeLimits,
  snapWidgetRectToEdges,
} from './ddayWindowBounds.js';

const MONITORS = [
  {
    bounds: { x: 0, y: 0, width: 3840, height: 2160 },
    work: { x: 0, y: 0, width: 3840, height: 2080 },
    scale: 2,
  },
  {
    bounds: { x: 3840, y: 0, width: 1920, height: 1080 },
    work: { x: 3840, y: 0, width: 1920, height: 1040 },
    scale: 1,
  },
];

test('clampSizeToMonitor converts physical work area by target monitor DPI scale', () => {
  // Tiny 800x600 monitor -> maxWidth(580) & workMaxH(536) 이내로 제한
  const smallMonitor = {
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    work: { x: 0, y: 0, width: 800, height: 560 },
    scale: 1,
  };
  const clamped = clampSizeToMonitor(
    { width: 900, height: 700 },
    DDAY_CONTROL_BOUNDS,
    smallMonitor,
    24,
  );
  assert.equal(clamped.width, 580);
  assert.equal(clamped.height, 536);

  // 4K 200% monitor has logical work height 1040 -> 660 fits comfortably
  const hiDpi = clampSizeToMonitor({ width: 560, height: 660 }, DDAY_CONTROL_BOUNDS, MONITORS[0], 16);
  assert.deepEqual(hiDpi, { width: 560, height: 660 });
});

test('resolveControlSizeLimits & applyControlWindowLimits protect small/mixed-DPI screens without trapping oversized height', async () => {
  // 1366x768 @ 125%: 논리 작업영역 약 1093x582 -> 340..580 x 460..558
  const hd125 = { bounds: { x: 0, y: 0, width: 1366, height: 768 }, work: { x: 0, y: 0, width: 1366, height: 728 }, scale: 1.25 };
  assert.deepEqual(resolveControlSizeLimits(hd125, DDAY_CONTROL_BOUNDS, 24), {
    minWidth: 340,
    minHeight: 460,
    maxWidth: 580,
    maxHeight: 558,
  });

  // 1280x720 @ 150%: 논리 작업높이 448px < minHeight(460) -> effectiveMin이 작업영역 이내로 내려감
  const laptop150 = { bounds: { x: 0, y: 0, width: 1280, height: 720 }, work: { x: 0, y: 0, width: 1280, height: 672 }, scale: 1.5 };
  const smallLimits = resolveControlSizeLimits(laptop150, DDAY_CONTROL_BOUNDS, 24);
  assert.equal(smallLimits.minWidth, 340);
  assert.equal(smallLimits.minHeight, 424);
  assert.equal(smallLimits.maxWidth, 580);
  assert.equal(smallLimits.maxHeight, 424);

  const clampedLaptop = clampSizeToMonitor({ width: 380, height: 580 }, DDAY_CONTROL_BOUNDS, laptop150, 24);
  assert.deepEqual(clampedLaptop, { width: 380, height: 424 });

  // 4K @ 200%: 논리 작업영역 1920x1040 -> 340..580 x 460..860 정확 적용
  assert.deepEqual(resolveControlSizeLimits(MONITORS[0], DDAY_CONTROL_BOUNDS, 24), {
    minWidth: 340,
    minHeight: 460,
    maxWidth: 580,
    maxHeight: 860,
  });

  // applyControlWindowLimits: setMinSize + setMaxSize + setMaximizable(false) 동시 호출 검증
  /** @type {any[]} */
  const calls = [];
  const fakeWin = {
    setMinSize: async (/** @type {any} */ s) => calls.push(['min', s.width, s.height]),
    setMaxSize: async (/** @type {any} */ s) => calls.push(['max', s.width, s.height]),
    setMaximizable: async (/** @type {boolean} */ v) => calls.push(['maximizable', v]),
  };
  await applyControlWindowLimits(/** @type {any} */ (fakeWin), MONITORS[1], DDAY_CONTROL_BOUNDS, 24);
  assert.deepEqual(calls, [
    ['min', 340, 460],
    ['max', 580, 860],
    ['maximizable', false],
  ]);
});

test('computeDoubleClickTarget toggles default (380x580) <-> wide (560x660) inside work area', () => {
  // At 380x580 on 200% monitor -> physical size 760x1160 near right edge
  const toWide = computeDoubleClickTarget({
    currentPos: { x: 3000, y: 100 },
    currentSize: { width: 760, height: 1160 },
    currentScale: 2,
    monitors: MONITORS,
  });
  assert.equal(toWide.preset, 'wide');
  assert.equal(toWide.width, 560);
  assert.equal(toWide.height, 660);
  // Expanded window stays clamped within 3840 work width (560*2 = 1120px)
  assert.ok(toWide.physicalX !== null && toWide.physicalX + 1120 <= 3840);

  // Already wide -> returns to default preset
  const toDefault = computeDoubleClickTarget({
    currentPos: { x: 1000, y: 200 },
    currentSize: { width: 1120, height: 1320 },
    currentScale: 2,
    monitors: MONITORS,
  });
  assert.equal(toDefault.preset, 'default');
  assert.equal(toDefault.width, 380);
  assert.equal(toDefault.height, 580);
});

test('computeDoubleClickTarget: 버튼이 지정한 크기(forcePreset)로 간다 — 높이만 바꾼 창에서 [넓게 보기]가 줄어들지 않음', () => {
  // 380x620(기본보다 40 높음, 100% 모니터) — 지정이 없으면 기본 크기로 돌아가는 것이 더블클릭 규칙
  const base = { currentPos: { x: 4000, y: 100 }, currentSize: { width: 380, height: 620 }, currentScale: 1, monitors: MONITORS };
  assert.equal(computeDoubleClickTarget(base).preset, 'default');
  const wide = computeDoubleClickTarget({ ...base, forcePreset: 'wide' });
  assert.equal(wide.preset, 'wide');
  assert.equal(wide.width, 560);
  assert.equal(wide.height, 660);
  // 넓은 창에서 [기본 크기로 축소]
  const back = computeDoubleClickTarget({ ...base, currentSize: { width: 560, height: 700 }, forcePreset: 'default' });
  assert.equal(back.preset, 'default');
  assert.equal(back.width, 380);
  assert.equal(back.height, 580);
  // 모르는 값은 무시하고 원래 규칙을 따른다
  assert.equal(computeDoubleClickTarget({ ...base, forcePreset: /** @type {any} */ ('huge') }).preset, 'default');
});

test('snapWidgetRectToEdges snaps near edges with 8px gap and avoids micro jitter', () => {
  const nearRightBottom = snapWidgetRectToEdges(
    { x: 3840 + 1920 - 236 - 16, y: 1040 - 256 - 14, width: 236, height: 256 },
    [MONITORS[1]],
  );
  assert.equal(nearRightBottom.snapped, true);
  assert.equal(nearRightBottom.x, 3840 + 1920 - 236 - 8);
  assert.equal(nearRightBottom.y, 1040 - 256 - 8);

  // Already snapped -> delta < 2px, snapped: false prevents feedback loop
  const already = snapWidgetRectToEdges(
    { x: 3840 + 1920 - 236 - 8, y: 1040 - 256 - 8, width: 236, height: 256 },
    [MONITORS[1]],
  );
  assert.equal(already.snapped, false);
});

test('computeWidgetSidePlacement places new widget beside Control Tower without overlap', () => {
  const side = computeWidgetSidePlacement({
    controlPos: { x: 4200, y: 200 },
    controlSize: { width: 380, height: 580 },
    widgetSize: { width: 236, height: 256 },
    monitors: MONITORS,
  });
  assert.ok(side !== null);
  assert.equal(side.x, 4200 + 380 + 14);
  assert.equal(side.y, 200);

  // When right side lacks space, falls back to left side
  const left = computeWidgetSidePlacement({
    controlPos: { x: 3840 + 1920 - 390, y: 200 },
    controlSize: { width: 380, height: 580 },
    widgetSize: { width: 236, height: 256 },
    monitors: MONITORS,
  });
  assert.ok(left !== null);
  assert.equal(left.x, 3840 + 1920 - 390 - 236 - 14);
});
