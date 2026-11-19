import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWidgetPlacement } from './windowBounds.js';

const PRIMARY_4K = {
  bounds: { x: 0, y: 0, width: 3840, height: 2160 },
  work: { x: 0, y: 0, width: 3840, height: 2064 },
  scale: 2,
};

const SECONDARY_LEFT_FHD = {
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  work: { x: -1920, y: 40, width: 1920, height: 1040 }, // 상단 작업표시줄 40px
  scale: 1,
};

test('defaultWidgetPlacement restores saved physical coordinates on negative-X 100% secondary monitor', () => {
  const target = defaultWidgetPlacement({
    currentPos: { x: 100, y: 100 },
    currentSize: { width: 1920, height: 1360 },
    monitors: [PRIMARY_4K, SECONDARY_LEFT_FHD],
    existingRects: [],
    savedWidgetBounds: {
      physicalX: -360,
      physicalY: 60,
      logicalX: -360,
      logicalY: 60,
      width: 340,
      height: 236,
    },
  });

  assert.equal(target.physicalX, -360);
  assert.equal(target.physicalY, 60);
  assert.equal(target.logicalX, -360);
  assert.equal(target.logicalY, 60);
  assert.equal(target.width, 340);
  assert.equal(target.height, 236);
});

test('defaultWidgetPlacement places new widget with 8*scale edge gap respecting top taskbar', () => {
  const target = defaultWidgetPlacement({
    currentPos: { x: -1600, y: 120 },
    currentSize: { width: 960, height: 680 },
    monitors: [PRIMARY_4K, SECONDARY_LEFT_FHD],
    existingRects: [],
    savedWidgetBounds: null,
  });

  // work.x(-1920) + work.width(1920) - (340 + 8)*1 = -348, work.y(40) + 8*1 = 48
  assert.equal(target.physicalX, -348);
  assert.equal(target.physicalY, 48);
  assert.equal(target.width, 340);
  assert.equal(target.height, 236);

  // 4K 200% 주 모니터에서는 8*2 = 16px 물리 여백 적용
  const primaryTarget = defaultWidgetPlacement({
    currentPos: { x: 400, y: 200 },
    currentSize: { width: 1920, height: 1360 },
    monitors: [PRIMARY_4K, SECONDARY_LEFT_FHD],
    existingRects: [],
    savedWidgetBounds: null,
  });
  assert.equal(primaryTarget.physicalX, 3840 - (340 + 8) * 2);
  assert.equal(primaryTarget.physicalY, 8 * 2);
});

test('defaultWidgetPlacement cascades away from existing widgets scaled by DPI', () => {
  const firstRect = {
    x: 3840 - (340 + 8) * 2,
    y: 16,
    width: 340 * 2,
    height: 236 * 2,
  };
  const next = defaultWidgetPlacement({
    currentPos: { x: 400, y: 200 },
    currentSize: { width: 1920, height: 1360 },
    monitors: [PRIMARY_4K],
    existingRects: [firstRect],
    savedWidgetBounds: null,
  });

  // step = 28 * 2 = 56px 이상 벗어나 겹치지 않음
  assert.ok(typeof next.physicalY === 'number' && typeof next.physicalX === 'number');
  assert.ok(next.physicalY >= firstRect.y + 56 || next.physicalX !== firstRect.x);
  assert.equal(next.width, 340);
  assert.equal(next.height, 236);
});

test('defaultWidgetPlacement falls back safely when saved monitor is disconnected', () => {
  const target = defaultWidgetPlacement({
    currentPos: { x: 200, y: 200 },
    currentSize: { width: 1920, height: 1360 },
    monitors: [PRIMARY_4K],
    existingRects: [],
    savedWidgetBounds: {
      physicalX: 5200,
      physicalY: 120,
      logicalX: 2600,
      logicalY: 60,
      width: 340,
      height: 236,
    },
  });

  // 주 모니터(4K) 작업영역 우측 상단 안쪽으로 안전 안착
  assert.ok(typeof target.physicalX === 'number' && typeof target.physicalY === 'number');
  assert.ok(target.physicalX >= 0 && target.physicalX + 340 * 2 <= PRIMARY_4K.work.width);
  assert.ok(target.physicalY >= 0 && target.physicalY + 236 * 2 <= PRIMARY_4K.work.height);
});
