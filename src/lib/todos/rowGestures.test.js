// @ts-nocheck — 가짜 DOM·시간·간단한 고정 자료로 경계값을 검사하는 테스트라 타입 검사에서 뺍니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLICK_GUARD_SAFETY_MS,
  MOUSE_SORT_DISTANCE_Y,
  REMOVAL_GUARD_DISTANCE,
  REMOVAL_GUARD_MS,
  SORT_ACTIVATOR_ATTR,
  TOUCH_SORT_DELAY_MS,
  TOUCH_SORT_TOLERANCE,
  X_ARM_MS,
  createClickGuard,
  createRemovalGuard,
  findSortActivator,
  isXArmed,
  sortActivationFor,
} from './rowGestures.js';

// ── 아주 작은 가짜 DOM: closest()·contains()만 흉내 냅니다 ──
function node(name, { activator = false, parent = null } = {}) {
  const el = {
    name,
    parent,
    activator,
    closest(selector) {
      assert.equal(selector, `[${SORT_ACTIVATOR_ATTR}]`);
      for (let cur = el; cur; cur = cur.parent) if (cur.activator) return cur;
      return null;
    },
    contains(other) {
      for (let cur = other; cur; cur = cur.parent) if (cur === el) return true;
      return false;
    },
  };
  return el;
}

function rowFixture() {
  const row = node('row');
  const done = node('done', { activator: true, parent: row });
  const doneIcon = node('done-svg', { parent: done });
  const badge = node('badge', { activator: true, parent: row });
  const badgeIcon = node('badge-svg', { parent: badge });
  const text = node('text', { parent: row });
  const checkbox = node('checkbox', { parent: row });
  const flag = node('flag', { parent: row });
  const softX = node('x', { parent: row });
  const handle = node('kbd-handle', { parent: row });
  return { row, done, doneIcon, badge, badgeIcon, text, checkbox, flag, softX, handle };
}

test('잡기 버튼 찾기: 완료 버튼·날짜 알약과 그 안 아이콘만 끌기를 시작한다', () => {
  const r = rowFixture();
  assert.equal(findSortActivator(r.done, r.row), r.done);
  assert.equal(findSortActivator(r.doneIcon, r.row), r.done);
  assert.equal(findSortActivator(r.badge, r.row), r.badge);
  assert.equal(findSortActivator(r.badgeIcon, r.row), r.badge);
});

test('잡기 버튼 찾기: 글·체크박스·깃발·X·키보드 손잡이·줄 여백은 끌기를 시작하지 않는다', () => {
  const r = rowFixture();
  for (const target of [r.text, r.checkbox, r.flag, r.softX, r.handle, r.row]) {
    assert.equal(findSortActivator(target, r.row), null, target.name);
  }
});

test('잡기 버튼 찾기: 다른 줄의 버튼, 글자 노드, 빈 값은 무시한다', () => {
  const a = rowFixture();
  const b = rowFixture();
  assert.equal(findSortActivator(b.done, a.row), null);
  assert.equal(findSortActivator({ nodeType: 3 }, a.row), null);
  assert.equal(findSortActivator(null, a.row), null);
  assert.equal(findSortActivator(a.done, null), null);
});

test('시작 기준: 마우스·펜은 세로 거리, 터치는 길게 누르기, 모르는 값은 마우스와 같다', () => {
  assert.deepEqual(sortActivationFor('mouse'), { kind: 'distance', y: MOUSE_SORT_DISTANCE_Y });
  assert.deepEqual(sortActivationFor('pen'), { kind: 'distance', y: MOUSE_SORT_DISTANCE_Y });
  assert.deepEqual(sortActivationFor(''), { kind: 'distance', y: MOUSE_SORT_DISTANCE_Y });
  assert.deepEqual(sortActivationFor(undefined), { kind: 'distance', y: MOUSE_SORT_DISTANCE_Y });
  assert.deepEqual(sortActivationFor('touch'), { kind: 'delay', ms: TOUCH_SORT_DELAY_MS, tolerance: TOUCH_SORT_TOLERANCE });
  // 사용자 결정 값(2026-11-19)이 바뀌면 문서와 함께 고쳐야 하므로 숫자를 직접 고정합니다.
  assert.equal(MOUSE_SORT_DISTANCE_Y, 6);
  assert.equal(TOUCH_SORT_DELAY_MS, 400);
});

// ── 클릭 가드 ──
function fakeTimers() {
  let now = 0;
  let seq = 0;
  /** @type {Map<number, { at: number, fn: () => void }>} */
  const timers = new Map();
  return {
    setTimer(fn, ms) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) { timers.delete(id); t.fn(); }
      }
    },
    get pending() { return timers.size; },
  };
}

test('클릭 가드: 무장하기 전의 클릭은 그대로 통과한다', () => {
  const guard = createClickGuard(fakeTimers());
  guard.onPointerDown();
  guard.onPointerEnd();
  assert.equal(guard.takeClick(), false);
});

test('클릭 가드: 끌기가 시작된 누름의 클릭은 정확히 한 번만 버린다', () => {
  const guard = createClickGuard(fakeTimers());
  guard.onPointerDown();
  guard.arm();
  guard.onPointerEnd();
  assert.equal(guard.takeClick(), true);
  assert.equal(guard.takeClick(), false);
});

test('클릭 가드: 끄는 중 Esc(누른 채 키 입력)는 해제하지 않는다 — 그 뒤 버튼 위에서 떼도 마감되지 않음', () => {
  const guard = createClickGuard(fakeTimers());
  guard.onPointerDown();
  guard.arm();
  guard.onKeyDown();
  assert.equal(guard.armed, true);
  guard.onPointerEnd();
  assert.equal(guard.takeClick(), true);
});

test('클릭 가드: 뗀 뒤의 키 입력은 해제한다 — 키보드로 누르는 버튼은 정상', () => {
  const guard = createClickGuard(fakeTimers());
  guard.onPointerDown();
  guard.arm();
  guard.onPointerEnd();
  guard.onKeyDown();
  assert.equal(guard.takeClick(), false);
});

test('클릭 가드: 새 누름은 해제한다 — 끌기 뒤 다른 버튼 클릭은 정상', () => {
  const guard = createClickGuard(fakeTimers());
  guard.onPointerDown();
  guard.arm();
  guard.onPointerEnd();
  guard.onPointerDown();
  guard.onPointerEnd();
  assert.equal(guard.takeClick(), false);
});

test('클릭 가드: 뗀 뒤 클릭이 끝내 안 오면 안전 시간에 풀린다(경계값)', () => {
  const t = fakeTimers();
  const guard = createClickGuard(t);
  guard.onPointerDown();
  guard.arm();
  guard.onPointerEnd();
  t.advance(CLICK_GUARD_SAFETY_MS - 1);
  assert.equal(guard.armed, true);
  t.advance(1);
  assert.equal(guard.armed, false);
  assert.equal(guard.takeClick(), false);
});

test('클릭 가드: 누르고 있는 동안에는 시간이 흘러도 풀리지 않는다', () => {
  const t = fakeTimers();
  const guard = createClickGuard(t);
  guard.onPointerDown();
  guard.arm();
  t.advance(CLICK_GUARD_SAFETY_MS * 5);
  assert.equal(guard.armed, true);
  assert.equal(t.pending, 0);
});

test('클릭 가드: 버린 뒤·해제 뒤에는 남은 타이머가 없다', () => {
  const t = fakeTimers();
  const guard = createClickGuard(t);
  guard.onPointerDown();
  guard.arm();
  guard.onPointerEnd();
  assert.equal(t.pending, 1);
  guard.takeClick();
  assert.equal(t.pending, 0);
  guard.onPointerDown();
  guard.arm();
  guard.onPointerEnd();
  guard.destroy();
  assert.equal(t.pending, 0);
  assert.equal(guard.armed, false);
});

test('클릭 가드: 다시 무장하면 안전 시간을 처음부터 센다', () => {
  const t = fakeTimers();
  const guard = createClickGuard(t);
  guard.onPointerDown();
  guard.arm();
  guard.onPointerEnd();
  t.advance(CLICK_GUARD_SAFETY_MS - 100);
  guard.onPointerDown(); // 새 누름 → 해제
  guard.arm();           // 그 누름에서도 끌기 시작
  guard.onPointerEnd();
  t.advance(CLICK_GUARD_SAFETY_MS - 1);
  assert.equal(guard.armed, true);
  t.advance(1);
  assert.equal(guard.armed, false);
});

// ── 연타 보호 ──
test('연타 보호: 0.5초 안·4px 안의 누름을 막는다(경계값)', () => {
  let now = 1000;
  const guard = createRemovalGuard({ now: () => now });
  guard.start(100, 200);
  now += REMOVAL_GUARD_MS - 1;
  assert.equal(guard.active(100 + REMOVAL_GUARD_DISTANCE, 200), true);
  now += 1;
  assert.equal(guard.active(100, 200), false);
});

test('연타 보호: 4px 넘게 움직이면 바로 풀린다', () => {
  let now = 0;
  const guard = createRemovalGuard({ now: () => now });
  guard.start(10, 10);
  assert.equal(guard.onPointerMove(13, 12), false);
  assert.equal(guard.active(), true);
  assert.equal(guard.onPointerMove(15, 10), true);
  assert.equal(guard.active(), false);
});

test('연타 보호: 좌표를 주고 물으면 멀리 떨어진 누름은 통과', () => {
  let now = 0;
  const guard = createRemovalGuard({ now: () => now });
  guard.start(0, 0);
  assert.equal(guard.active(0, REMOVAL_GUARD_DISTANCE + 1), false);
});

test('연타 보호: 시작하지 않았으면 늘 통과, until은 끝나는 시각', () => {
  let now = 50;
  const guard = createRemovalGuard({ now: () => now });
  assert.equal(guard.active(), false);
  assert.equal(guard.until, null);
  guard.start(0, 0);
  assert.equal(guard.until, 50 + REMOVAL_GUARD_MS);
  guard.clear();
  assert.equal(guard.active(), false);
});

// ── X 무장 ──
test('X 무장: 줄에 들어온 지 0.15초가 안 된 누름은 거부한다(경계값)', () => {
  assert.equal(isXArmed(1000, 1000 + X_ARM_MS - 1), false);
  assert.equal(isXArmed(1000, 1000 + X_ARM_MS), true);
  assert.equal(X_ARM_MS, 150);
});

test('X 무장: 들어온 시각이 없으면(키보드 초점 등) 늘 무장', () => {
  assert.equal(isXArmed(null, 0), true);
  assert.equal(isXArmed(undefined, 0), true);
  assert.equal(isXArmed(Number.NaN, 0), true);
});
