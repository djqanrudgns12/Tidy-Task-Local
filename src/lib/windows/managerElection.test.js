import test from 'node:test';
import assert from 'node:assert/strict';
import { MANAGER_PRIORITY, pickManager } from './managerElection.js';

test('main이 열려 있으면 항상 main이 매니저다', () => {
  assert.equal(pickManager(['tinynote-1', 'note-3', 'main', 'reminder']), 'main');
});

test('main이 없으면 열린 note 중 번호가 가장 작은 창이 매니저다 (닫힌 창은 후보 아님)', () => {
  // note-1은 명부에만 있고 닫혀 있는 상황 → 열린 목록에 없으므로 note-2가 됩니다.
  assert.equal(pickManager(['note-5', 'note-2', 'settings']), 'note-2');
  assert.equal(pickManager(['note-10', 'note-9']), 'note-9');
});

test('Tiny Note만 남아도 매니저가 선출된다', () => {
  assert.equal(pickManager(['tinynote-4', 'tinynote-2', 'archive']), 'tinynote-2');
});

test('곧 닫힐 창은 후보에서 제외한다', () => {
  assert.equal(pickManager(['main', 'note-1'], { exclude: 'main' }), 'note-1');
  assert.equal(pickManager(['note-1', 'tinynote-1'], { exclude: 'note-1' }), 'tinynote-1');
});

test('데이터 창이 하나도 없으면 null', () => {
  assert.equal(pickManager(['settings', 'ctx-menu', 'reminder', 'welcome', 'archive']), null);
  assert.equal(pickManager([]), null);
  assert.equal(pickManager(undefined), null);
});

test('우선순위 표는 main, note-1..10, tinynote-1..10 순서다', () => {
  assert.equal(MANAGER_PRIORITY.length, 21);
  assert.equal(MANAGER_PRIORITY[0], 'main');
  assert.equal(MANAGER_PRIORITY[1], 'note-1');
  assert.equal(MANAGER_PRIORITY[10], 'note-10');
  assert.equal(MANAGER_PRIORITY[11], 'tinynote-1');
  assert.equal(MANAGER_PRIORITY[20], 'tinynote-10');
});
