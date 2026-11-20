import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_MENU_WIDTH,
  countBubbleLabel,
  measureArchiveMenuRoom,
  pickArchiveMenuTier,
  placeArchiveMenu,
  ptToPx,
  resolveArchiveMenuPt,
  resolveArchiveMenuWidth,
} from './archiveMenuLayout.js';

test('resolveArchiveMenuPt: 화면 글자를 따르되 9~12pt로 묶고, 잘못된 값은 10pt', () => {
  assert.deepEqual([6, 8, 9, 10, 11, 12, 13, 15].map(resolveArchiveMenuPt), [9, 9, 9, 10, 11, 12, 12, 12]);
  assert.equal(resolveArchiveMenuPt(NaN), 10);
  assert.equal(resolveArchiveMenuPt(undefined), 10);
  assert.equal(resolveArchiveMenuPt(0), 10);
  assert.equal(resolveArchiveMenuPt('11'), 11);
});

test('resolveArchiveMenuWidth: 14em을 176~224px로 묶는다 (실측 예산과 같은 값)', () => {
  assert.equal(resolveArchiveMenuWidth(9), 176); // 14 × 12px = 168 → 최소 176
  assert.equal(Math.round(resolveArchiveMenuWidth(10)), 187); // 14 × 13.33px
  assert.equal(resolveArchiveMenuWidth(12), 224); // 14 × 16px = 224
  assert.equal(resolveArchiveMenuWidth(20), ARCHIVE_MENU_WIDTH.max);
  // 정렬선 사이가 더 좁으면 그 폭에 맞춤(안전망)
  assert.equal(resolveArchiveMenuWidth(12, 200), 200);
  assert.equal(ptToPx(12), 16);
});

test('pickArchiveMenuTier: L→M→S 순서로 아래에 들어가는 단계, 없으면 위, 그래도 없으면 S를 아래로', () => {
  const heights = { l: 128, m: 97, s: 50 };
  assert.deepEqual(pickArchiveMenuTier({ heights, below: 300, above: 0 }), { tier: 'l', direction: 'down', clipped: false });
  assert.deepEqual(pickArchiveMenuTier({ heights, below: 128, above: 0 }), { tier: 'l', direction: 'down', clipped: false });
  assert.deepEqual(pickArchiveMenuTier({ heights, below: 110, above: 0 }), { tier: 'm', direction: 'down', clipped: false });
  assert.deepEqual(pickArchiveMenuTier({ heights, below: 60, above: 500 }), { tier: 's', direction: 'down', clipped: false });
  assert.deepEqual(pickArchiveMenuTier({ heights, below: 30, above: 200 }), { tier: 'l', direction: 'up', clipped: false });
  assert.deepEqual(pickArchiveMenuTier({ heights, below: 30, above: 70 }), { tier: 's', direction: 'up', clipped: false });
  assert.deepEqual(pickArchiveMenuTier({ heights, below: 20, above: 20 }), { tier: 's', direction: 'down', clipped: true });
});

test('measureArchiveMenuRoom: 꼭지 끝은 버튼 아래 3px와 도크 아래 2px 중 더 아래', () => {
  const anchor = { left: 180, right: 240, top: 100, bottom: 122 };
  const rail = { left: 10, right: 370, top: 95, bottom: 128 };
  const room = measureArchiveMenuRoom({ anchor, rail, viewportHeight: 500, nubPx: 6 });
  assert.equal(room.tipDown, 130); // 도크 아래 128 + 2 > 버튼 아래 122 + 3
  assert.equal(room.below, 500 - 8 - (130 + 6));
  assert.equal(room.tipUp, 93); // 도크 위 95 − 2 < 버튼 위 100 − 3
  assert.equal(room.above, 93 - 6 - 8);
  // 도크가 없으면 버튼 기준
  assert.equal(measureArchiveMenuRoom({ anchor, viewportHeight: 500, nubPx: 6 }).tipDown, 125);
  // 음수가 되지 않음
  assert.equal(measureArchiveMenuRoom({ anchor, rail, viewportHeight: 100, nubPx: 6 }).below, 0);
});

/** 도크 바깥 테두리 = 창 가장자리에서 10px */
const railOf = (/** @type {number} */ w) => ({ left: 10, right: w - 10, top: 90, bottom: 123 });
/** @param {number} w @param {number} l @param {number} r @param {number} width */
function place(w, l, r, width) {
  return placeArchiveMenu({
    anchor: { left: l, right: r, top: 96, bottom: 117 },
    rail: railOf(w),
    viewportWidth: w,
    width,
    height: 120,
    direction: 'down',
    tipDown: 125,
    tipUp: 88,
    nubPx: 6,
    nubInset: 20,
  });
}

test('placeArchiveMenu: 버튼 가운데 맞춤이 기본이고, 꼭지는 버튼 가운데를 가리킨다', () => {
  const a = place(380, 182, 242, 187); // 가운데 212
  assert.equal(a.left, 118.5);
  assert.equal(a.left + a.nubX, 212);
  assert.equal(a.top, 131);
  const b = place(460, 262, 322, 187);
  assert.equal(b.left, 198.5);
  assert.equal(b.nubX, 93.5);
});

test('placeArchiveMenu: 도크 바깥선 밖으로 나가지 않고, 선과 10px 안이면 그 선에 붙는다', () => {
  // 15pt · 250px: 가운데 맞춤이면 −3.5 → 왼쪽 선 10에 묶임
  const narrow = place(250, 93, 124, 224);
  assert.equal(narrow.left, 10);
  assert.equal(narrow.left + narrow.nubX, 108.5);
  // 오른쪽 선까지 6px → 붙임(오른쪽 끝 = 도크 오른쪽 끝선 240)
  const near = place(300, 175, 196, 187); // 가운데 맞춤 92, 최대 103 → 11px: 붙이지 않음
  assert.equal(near.left, 92);
  const nearer = place(300, 183, 204, 187); // 가운데 맞춤 100, 최대 103 → 3px: 붙임
  assert.equal(nearer.left, 103);
  assert.equal(nearer.left + 187, 290);
  // 꼭지는 그래도 버튼 가운데
  assert.equal(nearer.left + nearer.nubX, 193.5);
});

test('placeArchiveMenu: 꼭지는 둥근 모서리에 걸치지 않게 [inset, 폭 − inset]으로 묶인다', () => {
  // 버튼이 오른쪽 끝에 붙어 있는 경우
  const edge = place(300, 280, 300, 187);
  assert.equal(edge.left, 103);
  assert.equal(edge.nubX, 187 - 20);
  const leftEdge = place(300, 0, 12, 187);
  assert.equal(leftEdge.left, 10);
  assert.equal(leftEdge.nubX, 20);
});

test('placeArchiveMenu: 위로 열면 카드 아래 끝이 꼭지 위에 온다', () => {
  const up = placeArchiveMenu({
    anchor: { left: 182, right: 242, top: 96, bottom: 117 },
    rail: railOf(380),
    viewportWidth: 380,
    width: 187,
    height: 100,
    direction: 'up',
    tipDown: 125,
    tipUp: 88,
    nubPx: 6,
    nubInset: 20,
  });
  assert.equal(up.top, 88 - 6 - 100);
  assert.equal(up.direction, 'up');
});

test('placeArchiveMenu: 도크 정보가 없거나 창이 카드보다 좁아도 화면 안에 둔다', () => {
  const noRail = placeArchiveMenu({
    anchor: { left: 230, right: 250, top: 0, bottom: 20 }, viewportWidth: 250, width: 224, height: 50,
    direction: 'down', tipDown: 23, tipUp: 0, nubPx: 6, nubInset: 20,
  });
  assert.equal(noRail.left, 22); // 250 − 4 − 224
  const tiny = placeArchiveMenu({
    anchor: { left: 50, right: 70, top: 0, bottom: 20 }, rail: { left: 10, right: 150, top: 0, bottom: 20 },
    viewportWidth: 160, width: 176, height: 50, direction: 'down', tipDown: 23, tipUp: 0, nubPx: 6, nubInset: 20,
  });
  assert.equal(tiny.left, 4);
});

test('countBubbleLabel: 1~99는 숫자, 100 이상은 99+', () => {
  assert.deepEqual([0, 1, 12, 99, 100, 1234, -3, NaN].map(countBubbleLabel), ['0', '1', '12', '99', '99+', '99+', '0', '0']);
});
