import test from "node:test";
import assert from "node:assert/strict";

import {
  TINY_NOTE_DEFAULT_HEIGHT,
  TINY_NOTE_DEFAULT_WIDTH,
  TINY_NOTE_MIN_HEIGHT,
  TINY_NOTE_MIN_WIDTH,
  clampTinyNoteSize,
  resolveTinyNoteExpandedHeight,
  resolveTinyNoteWidth,
  shouldPersistTinyNoteBounds,
} from "./tinyNoteWindow.js";

test("normal Tiny Note bounds win over rolled-up legacy values", () => {
  assert.equal(resolveTinyNoteExpandedHeight(420, 280, 35), 420);
  assert.equal(resolveTinyNoteWidth(360, 160), 360);
});

test("the pre-rollup height repairs a legacy 35px saved height", () => {
  assert.equal(resolveTinyNoteExpandedHeight(35, 340, 35), 340);
});

test("invalid dimensions fall back to safe Tiny Note defaults", () => {
  assert.equal(resolveTinyNoteExpandedHeight(null, 0, Number.NaN), TINY_NOTE_DEFAULT_HEIGHT);
  assert.equal(resolveTinyNoteWidth(undefined, 20), TINY_NOTE_DEFAULT_WIDTH);
});

test("only stable expanded windows persist normal bounds", () => {
  assert.equal(shouldPersistTinyNoteBounds({ isFullscreen: false, isRolledUp: false, isTransitioning: false }), true);
  assert.equal(shouldPersistTinyNoteBounds({ isFullscreen: true, isRolledUp: false, isTransitioning: false }), false);
  assert.equal(shouldPersistTinyNoteBounds({ isFullscreen: false, isRolledUp: true, isTransitioning: false }), false);
  assert.equal(shouldPersistTinyNoteBounds({ isFullscreen: false, isRolledUp: false, isTransitioning: true }), false);
});

test("최대화된 크기로 저장된 창은 작업영역 안으로 되돌아온다", () => {
  // 전체화면/최대화 경합으로 1920x1040 이 정상 크기로 저장된 상황
  const fixed = clampTinyNoteSize(1920, 1040, { width: 1536, height: 824 });
  assert.deepEqual(fixed, { width: 1536, height: 824 });
});

test("정상 범위 크기는 클램프가 건드리지 않는다", () => {
  assert.deepEqual(
    clampTinyNoteSize(250, 280, { width: 1536, height: 824 }),
    { width: 250, height: 280 },
  );
});

test("작업영역 값을 신뢰할 수 없으면 원본 크기를 유지한다", () => {
  assert.deepEqual(clampTinyNoteSize(400, 500, {}), { width: 400, height: 500 });
  assert.deepEqual(
    clampTinyNoteSize(400, 500, { width: Number.NaN, height: null }),
    { width: 400, height: 500 },
  );
});

test("클램프 결과는 절대 최소 크기 아래로 내려가지 않는다", () => {
  const tiny = clampTinyNoteSize(10, 10, { width: 1536, height: 824 });
  assert.equal(tiny.width, TINY_NOTE_MIN_WIDTH);
  assert.equal(tiny.height, TINY_NOTE_MIN_HEIGHT);
});
