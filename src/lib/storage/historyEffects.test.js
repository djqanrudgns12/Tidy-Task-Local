import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryEffects } from './historyEffects.js';

test('attach: 새 기록 칸이 생겼을 때만 붙인다', () => {
  const fx = createHistoryEffects();
  const a = {};
  const b = {};
  const effect = { undo() {}, redo() {} };
  assert.equal(fx.attach(a, a, effect), false, '기록이 남지 않으면(같은 칸) 붙이지 않는다');
  assert.equal(fx.attach(a, undefined, effect), false);
  assert.equal(fx.attach(a, b, undefined), false);
  assert.equal(fx.attach(a, b, effect), true);
  assert.equal(fx.attach(undefined, b, effect), true, '첫 기록 칸에도 붙일 수 있다');
});

test('run: Ctrl+Z는 undo, Ctrl+Y는 redo를 부르고, 붙은 것이 없는 칸은 아무것도 하지 않는다', async () => {
  const fx = createHistoryEffects();
  /** @type {string[]} */
  const log = [];
  const snap = {};
  fx.attach({}, snap, { undo: async () => { log.push('카드 빼기'); }, redo: async () => { log.push('카드 다시 넣기'); } });
  assert.equal(await fx.run(snap, 'undo'), true);
  assert.equal(await fx.run(snap, 'redo'), true);
  assert.equal(await fx.run({}, 'undo'), false);
  assert.equal(await fx.run(undefined, 'redo'), false);
  assert.deepEqual(log, ['카드 빼기', '카드 다시 넣기']);
});

test('run: 딸린 일이 실패해도 예외를 밖으로 던지지 않는다(되돌리기 자체는 끝나야 함)', async () => {
  const fx = createHistoryEffects();
  const snap = {};
  fx.attach(undefined, snap, { undo: () => { throw new Error('disk'); }, redo() {} });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await fx.run(snap, 'undo'), false);
  } finally {
    console.error = originalError;
  }
});
