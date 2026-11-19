import test from 'node:test';
import assert from 'node:assert/strict';
import { DDAY_CONTROL_BOUNDS } from './ddayModel.js';
import {
  clampSizeToMonitor,
  computeDoubleClickTarget,
  computeWidgetSidePlacement,
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
  // Tiny 800x600 monitor -> limits max dimensions safely inside work area
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
  assert.equal(clamped.width, 776);
  assert.equal(clamped.height, 536);

  // 4K 200% monitor has logical work height 1040 -> 640 fits comfortably
  const hiDpi = clampSizeToMonitor({ width: 560, height: 640 }, DDAY_CONTROL_BOUNDS, MONITORS[0], 16);
  assert.deepEqual(hiDpi, { width: 560, height: 640 });
});

test('computeDoubleClickTarget toggles default (380x580) <-> wide (560x640) inside work area', () => {
  // At 380x580 on 200% monitor -> physical size 760x1160 near right edge
  const toWide = computeDoubleClickTarget({
    currentPos: { x: 3000, y: 100 },
    currentSize: { width: 760, height: 1160 },
    currentScale: 2,
    monitors: MONITORS,
  });
  assert.equal(toWide.preset, 'wide');
  assert.equal(toWide.width, 560);
  assert.equal(toWide.height, 640);
  // Expanded window stays clamped within 3840 work width (560*2 = 1120px)
  assert.ok(toWide.physicalX !== null && toWide.physicalX + 1120 <= 3840);

  // Already wide -> returns to default preset
  const toDefault = computeDoubleClickTarget({
    currentPos: { x: 1000, y: 200 },
    currentSize: { width: 1120, height: 1280 },
    currentScale: 2,
    monitors: MONITORS,
  });
  assert.equal(toDefault.preset, 'default');
  assert.equal(toDefault.width, 380);
  assert.equal(toDefault.height, 580);
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
