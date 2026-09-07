import test from "node:test";
import assert from "node:assert/strict";

import {
  TINY_NOTE_DEFAULT_HEIGHT,
  TINY_NOTE_DEFAULT_WIDTH,
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
