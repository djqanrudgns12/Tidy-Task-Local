import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTodoOrder, moveTodoOrder } from './order.js';

test('first/last and reverse moves preserve every id without mutating input', () => {
  const original = ['a', 'b', 'c', 'd'];
  const down = moveTodoOrder(original, 'a', 'd');
  assert.deepEqual(down, ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveTodoOrder(down, 'a', 'b'), original);
  assert.deepEqual(original, ['a', 'b', 'c', 'd']);
  assert.equal(moveTodoOrder(original, 'missing', 'b'), original);
  assert.equal(moveTodoOrder(original, 'a', 'a'), original);
});

test('committing uses latest objects, preserving edits and deadline changes made during drag', () => {
  const current = [{ id: 'a', text: '수정한 내용', deadline: '2026-10-01' }, { id: 'b', text: '둘째', deadline: '' }];
  const next = applyTodoOrder(current, ['a', 'b'], ['b', 'a']);
  assert.equal(next?.[1], current[0]);
  assert.equal(next?.[0], current[1]);
  assert.deepEqual(current.map(t => t.id), ['a', 'b']);
});

test('changed membership/order or invalid permutations cannot overwrite canonical todos', () => {
  const current = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  for (const ids of [['a', 'b'], ['a', 'b', 'c', 'd'], ['c', 'b', 'a']]) {
    assert.equal(applyTodoOrder(current, ids, ['b', 'a', 'c']), null);
  }
  for (const ids of [['b', 'b', 'a'], ['a', 'b'], ['b', 'a', 'd'], ['b', 'a', 'c', 'd']]) {
    assert.equal(applyTodoOrder(current, ['a', 'b', 'c'], ids), null);
  }
  assert.equal(applyTodoOrder([{ id: 'a' }, { id: 'a' }], ['a', 'a'], ['a', 'b']), null);
});

test('unchanged order, empty list and single item produce no save candidate', () => {
  assert.equal(applyTodoOrder([], [], []), null);
  assert.equal(applyTodoOrder([{ id: 'a' }], ['a'], ['a']), null);
  assert.equal(applyTodoOrder([{ id: 'a' }, { id: 'b' }], ['a', 'b'], ['a', 'b']), null);
});
