// @ts-nocheck: 실제 브라우저 타입 대신 필요한 포인터 동작만 갖춘 DOM 대역을 사용합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderAtCenter, groupedOrderAtCenter, sortToolRows } from './sortTools.js';

test('dragging is confined to its visibility section even beyond the divider', () => {
  const order = ['timer', 'picker', 'external', 'clock', 'dice'];
  const groups = [order.slice(0, 3), order.slice(3)];
  const centers = new Map(order.map((id, index) => [id, 30 + index * 54]));
  assert.deepEqual(groupedOrderAtCenter(order, 'timer', 999, centers, groups), ['picker', 'external', 'timer', 'clock', 'dice']);
  assert.deepEqual(groupedOrderAtCenter(order, 'dice', -999, centers, groups), ['timer', 'picker', 'external', 'dice', 'clock']);
  assert.deepEqual(order, ['timer', 'picker', 'external', 'clock', 'dice']);
});

test('drag crosses several rows in one frame in either direction', () => {
  const ids = ['timer', 'clock', 'external', 'roster'];
  const centers = new Map([['timer', 26], ['clock', 80], ['external', 190], ['roster', 300]]);
  assert.deepEqual(orderAtCenter(ids, 'timer', 320, centers), ['clock', 'external', 'roster', 'timer']);
  assert.deepEqual(orderAtCenter(ids, 'roster', 10, centers), ['roster', 'timer', 'clock', 'external']);
  assert.deepEqual(ids, ['timer', 'clock', 'external', 'roster']);
});

test('pointer jitter near a row midpoint does not keep swapping the rows', () => {
  const ids = ['timer', 'clock', 'roster'];
  const before = new Map([['timer', 26], ['clock', 80], ['roster', 134]]);
  for (const y of [77, 80, 83, 85]) assert.deepEqual(orderAtCenter(ids, 'timer', y, before), ids);
  const moved = orderAtCenter(ids, 'timer', 88, before);
  assert.deepEqual(moved, ['clock', 'timer', 'roster']);
  const after = new Map([['clock', 26], ['timer', 80], ['roster', 134]]);
  for (const y of [83, 80, 77, 30]) assert.deepEqual(orderAtCenter(moved, 'timer', y, after), moved);
  assert.deepEqual(orderAtCenter(moved, 'timer', 18, after), ids);
});

test('unavailable rows and a missing dragged ID cannot corrupt the order', () => {
  const ids = ['timer', 'clock'];
  assert.deepEqual(orderAtCenter(ids, 'missing', 100, new Map()), ids);
  assert.deepEqual(orderAtCenter(ids, 'timer', 100, new Map()), ids);
});

// 노드 환경에서 포인터 수명과 저장 시점을 검증하는 작은 DOM 대역입니다.
async function withList(run, saved = true) {
  const frames = new Map();
  let frameId = 0;
  let now = performance.now();
  let order = ['timer', 'clock', 'external', 'roster'];
  const initial = [...order];
  const previews = [];
  const commits = [];
  let active = '';
  let ghost;
  class Row extends EventTarget {
    constructor(id, height = 54) { super(); this.dataset = { toolOrderId: id }; this.offsetHeight = height; this.style = {}; this.classList = { add() {} }; this.inert = false; }
    get offsetTop() { return order.slice(0, order.indexOf(this.dataset.toolOrderId)).reduce((sum, id) => sum + items.get(id).offsetHeight, 0); }
    getBoundingClientRect() { const top = 100 - body.scrollTop + this.offsetTop; return { top, bottom: top + this.offsetHeight, left: 20, right: 320, width: 300, height: this.offsetHeight }; }
    closest(selector) { return selector === '[data-tool-order-id]' ? this : null; }
    contains() { return false; }
    getAttribute() { return this.dataset.toolOrderId; }
    removeAttribute() {}
    setAttribute() {}
    querySelectorAll() { return []; }
    cloneNode() { return new Row(this.dataset.toolOrderId, this.offsetHeight); }
    animate() { return { finished: Promise.resolve() }; }
    getAnimations() { return []; }
    remove() { ghost = undefined; }
  }
  const items = new Map(order.map(id => [id, new Row(id, id === 'external' ? 110 : 54)]));
  const body = { scrollTop: 0, getBoundingClientRect: () => ({ top: 100, bottom: 500, left: 0, right: 340, height: 400 }), append: (row) => { ghost = row; } };
  const list = Object.assign(new EventTarget(), {
    closest: () => body, querySelectorAll: () => order.map(id => items.get(id)),
    getBoundingClientRect: () => ({ top: 100 - body.scrollTop }), contains: () => true,
    capture: null, setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; },
    releasePointerCapture() { this.capture = null; },
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible', activeElement: null });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: win, document: doc, Element: Row, getComputedStyle: row => row.style, requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id) })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const options = {
    order,
    onactive: id => { active = id; },
    onpreview: ids => { previews.push(ids && [...ids]); order = [...(ids ?? order)]; action.update({ ...options, order }); },
    oncommit: async ids => { commits.push([...ids]); if (saved === 'throws') throw new Error('저장 실패'); return saved; },
  };
  const action = sortToolRows(list, options);
  function pointer(type, id, x, y, target = items.get('timer')) {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'target', { value: target });
    (type === 'pointerdown' ? list : win).dispatchEvent(event);
  }
  function frame() { const pending = [...frames.values()]; frames.clear(); now += 16; for (const fn of pending) fn(now); }
  const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  try {
    await run({ pointer, frame, settle, win, list, body, initial, previews, commits, get order() { return order; }, get ghost() { return ghost; }, get active() { return active; } });
  } finally {
    action.destroy();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('held row follows pointer and previews multiple slots before a single drop save', async () => {
  await withList(async h => {
    h.pointer('pointerdown', 1, 35, 127);
    h.pointer('pointermove', 1, 35, 290);
    h.frame();
    assert.equal(h.active, 'timer');
    assert.deepEqual(h.order, ['clock', 'external', 'timer', 'roster']);
    assert.equal(h.ghost.style.transform, 'translate3d(0, 163px, 0)');
    assert.equal(h.commits.length, 0);
    h.pointer('pointermove', 1, 35, 385);
    h.frame();
    assert.deepEqual(h.order, ['clock', 'external', 'roster', 'timer']);
    assert.equal(h.commits.length, 0);
    assert.equal(h.list.capture, 1);
    h.pointer('pointerup', 1, 35, 385);
    await h.settle();
    assert.deepEqual(h.commits, [['clock', 'external', 'roster', 'timer']]);
    assert.equal(h.ghost, undefined);
    assert.equal(h.active, '');
    assert.equal(h.list.capture, null);
    assert.equal(h.previews.at(-1), null);
  });
});

test('Escape, cancellation and an outside drop restore the initial order without saving', async () => {
  for (const cancel of ['Escape', 'pointercancel', 'outside']) await withList(async h => {
    h.pointer('pointerdown', 1, 35, 127);
    h.pointer('pointermove', 1, 35, 290);
    h.frame();
    h.pointer('pointercancel', 2, 35, 290);
    assert.equal(h.active, 'timer');
    if (cancel === 'Escape') h.win.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
    else if (cancel === 'outside') h.pointer('pointerup', 1, 410, 290);
    else h.pointer('pointercancel', 1, 35, 290);
    await h.settle();
    assert.deepEqual(h.order, h.initial);
    assert.equal(h.commits.length, 0);
    assert.equal(h.ghost, undefined);
    assert.equal(h.active, '');
    assert.equal(h.list.capture, null);
  });
});

test('a click and returning to the original slot do not persist, while edge dragging scrolls', async () => {
  await withList(async h => {
    h.pointer('pointerdown', 1, 35, 127);
    h.pointer('pointerup', 1, 35, 127);
    await h.settle();
    assert.equal(h.previews.some(ids => ids !== null), false);
    h.pointer('pointerdown', 1, 35, 127);
    h.pointer('pointermove', 1, 35, 290);
    h.frame();
    h.pointer('pointermove', 1, 35, 105);
    h.frame();
    assert.deepEqual(h.order, h.initial);
    h.pointer('pointerup', 1, 35, 127);
    await h.settle();
    assert.equal(h.commits.length, 0);
    h.pointer('pointerdown', 1, 35, 127);
    h.pointer('pointermove', 1, 35, 490);
    h.frame();
    assert.ok(h.body.scrollTop > 0);
  });
});

test('a failed save animates back, clears the temporary order and releases capture', async () => {
  for (const failure of [false, 'throws']) await withList(async h => {
    h.pointer('pointerdown', 1, 35, 127);
    h.pointer('pointermove', 1, 35, 290);
    h.frame();
    h.pointer('pointerup', 1, 35, 290);
    await h.settle();
    assert.equal(h.commits.length, 1);
    assert.deepEqual(h.order, h.initial);
    assert.equal(h.previews.at(-1), null);
    assert.equal(h.ghost, undefined);
    assert.equal(h.list.capture, null);
  }, failure);
});
