import test from "node:test";
import assert from "node:assert/strict";

import {
  HEADER_CONTROLS_WIDTH,
  HEADER_LEADING_WIDTH,
  HEADER_OVERFLOW_WIDTH,
  HEADER_TOOL_WIDTH,
  resolveAvailableToolWidth,
  resolveVisibleToolCount,
} from "./headerOverflow.js";

test("폭이 넉넉하면 도구를 전부 펼치고 ⋯ 버튼은 쓰지 않는다", () => {
  assert.equal(
    resolveVisibleToolCount({ availableWidth: HEADER_TOOL_WIDTH * 4, toolCount: 4 }),
    4,
  );
  assert.equal(resolveVisibleToolCount({ availableWidth: 500, toolCount: 4 }), 4);
});

test("1px만 모자라도 ⋯ 자리를 먼저 확보한 뒤 개수를 다시 센다", () => {
  // 88px이면 딱 4개. 87px이면 ⋯(22px)을 빼고 65px → 2개만 남습니다.
  const available = HEADER_TOOL_WIDTH * 4 - 1;
  assert.equal(resolveVisibleToolCount({ availableWidth: available, toolCount: 4 }), 2);
});

test("접히는 순간 펼침 개수는 절대 toolCount를 채우지 않는다", () => {
  // ⋯ 버튼이 등장하면 최소 하나는 접혀 있어야 논리적으로 일관됩니다.
  for (let w = 1; w < HEADER_TOOL_WIDTH * 4; w++) {
    const n = resolveVisibleToolCount({ availableWidth: w, toolCount: 4 });
    assert.ok(n <= 3, `${w}px에서 ${n}개가 펼쳐짐 (3개 이하여야 함)`);
  }
});

test("자리가 아주 좁으면 ⋯ 버튼만 남긴다", () => {
  assert.equal(resolveVisibleToolCount({ availableWidth: 30, toolCount: 4 }), 0);
  assert.equal(
    resolveVisibleToolCount({ availableWidth: HEADER_OVERFLOW_WIDTH, toolCount: 4 }),
    0,
  );
});

test("폭이 넓어지면 접혔던 도구가 단조증가로 다시 펼쳐진다", () => {
  let prev = 0;
  for (let w = 0; w <= 200; w++) {
    const n = resolveVisibleToolCount({ availableWidth: w, toolCount: 4 });
    assert.ok(n >= prev || n === 4, `${w}px에서 개수가 거꾸로 줄어듦`);
    prev = Math.min(n, prev === 4 ? 4 : n);
  }
});

test("잘못된 입력은 0개로 안전하게 처리한다", () => {
  assert.equal(resolveVisibleToolCount({ availableWidth: Number.NaN, toolCount: 4 }), 0);
  assert.equal(resolveVisibleToolCount({ availableWidth: 100, toolCount: 0 }), 0);
  assert.equal(resolveVisibleToolCount({ availableWidth: -50, toolCount: 4 }), 0);
});

test("헤더 폭에서 좌측 영역과 창 제어 버튼을 제외한 값을 구한다", () => {
  const headerWidth = 300;
  assert.equal(
    resolveAvailableToolWidth(headerWidth),
    headerWidth - HEADER_LEADING_WIDTH - HEADER_CONTROLS_WIDTH,
  );
  // 음수가 나오면 0으로 막습니다.
  assert.equal(resolveAvailableToolWidth(50), 0);
  assert.equal(resolveAvailableToolWidth(Number.NaN), 0);
});

test("최소 너비 200px에서도 도구가 최소 1개는 펼쳐진다", () => {
  // 헤더 내부 폭 = 창 200px - 좌우 패딩 12px
  const available = resolveAvailableToolWidth(200 - 12);
  const visible = resolveVisibleToolCount({ availableWidth: available, toolCount: 4 });
  assert.ok(visible >= 1, `200px에서 ${visible}개만 펼쳐짐`);
});

test("250px에서는 도구 4개가 모두 펼쳐진다", () => {
  const available = resolveAvailableToolWidth(250 - 12);
  assert.equal(resolveVisibleToolCount({ availableWidth: available, toolCount: 4 }), 4);
});
