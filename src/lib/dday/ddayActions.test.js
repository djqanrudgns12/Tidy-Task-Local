import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDdaySettings } from './ddayModel.js';
import {
  clearArchivedDdays,
  completeDdayItem,
  createNewDday,
  deleteDdayItem,
  pinTodoAsDday,
  pinTodosAsDdays,
  planBulkDdayPin,
  reorderActiveDdays,
  restoreDdayItem,
  syncArchivedTodosDeletedToDdays,
  syncTodoDeadlineToDdays,
  syncTodoRestoredToDdays,
  syncTodosCompletedToDdays,
  syncTodosDeletedToDdays,
  restoreDdaysForTodos,
  updateDdayItem,
} from './ddayActions.js';

const TODAY = '2026-11-18';
const SETTINGS = normalizeDdaySettings(undefined);

test('pinTodoAsDday links todo once, preserves html source, and avoids duplicate pinning', () => {
  const initial = {
    todos: [{ id: 't1', text: '<b>수학</b> 퍼즐 페스티벌', completed: false, deadline: '2026-11-23' }],
    archivedTodos: [],
    ddayItems: [],
  };
  const first = pinTodoAsDday(initial, 't1', SETTINGS, TODAY);
  assert.equal(first.created, true);
  assert.equal(first.item?.title, '수학 퍼즐 페스티벌');
  assert.equal(first.item?.showInTodo, true);
  assert.equal(first.item?.showInBanner, true);
  assert.equal(first.item?.showInWidget, true);

  const second = pinTodoAsDday(first.state, 't1', SETTINGS, TODAY);
  assert.equal(second.created, false);
  assert.equal(second.state.ddayItems.length, 1);
});

test('createNewDday respects configurable defaultChannelsFromNew and supports Todo export toggle', () => {
  const empty = { todos: [], archivedTodos: [], ddayItems: [] };
  const created = createNewDday(empty, { title: '겨울방학', date: '2026-12-24' }, SETTINGS, TODAY);
  assert.equal(created.state.todos.length, 0);
  assert.equal(created.item?.showInTodo, false);
  assert.equal(created.item?.linkedTodoId, null);

  // Toggling showInTodo ON exports to TodoList and binds linkedTodoId
  const exported = updateDdayItem(created.state, created.item.id, { showInTodo: true, title: '겨울방학 (최종)' }, TODAY);
  assert.equal(exported.state.todos.length, 1);
  assert.equal(exported.state.todos[0].deadline, '2026-12-24');
  assert.equal(exported.item?.showInTodo, true);
  assert.equal(exported.item?.linkedTodoId, exported.state.todos[0].id);

  // Toggling showInTodo OFF removes from TodoList while keeping D-Day intact
  const hiddenFromTodo = updateDdayItem(exported.state, created.item.id, { showInTodo: false }, TODAY);
  assert.equal(hiddenFromTodo.state.todos.length, 0);
  assert.equal(hiddenFromTodo.state.ddayItems.length, 1);
  assert.equal(hiddenFromTodo.item?.linkedTodoId, null);
});

test('editing linked D-Day alias keeps original Todo HTML text untouched while syncing date', () => {
  const initial = {
    todos: [{ id: 't1', text: '<span>긴 원본 할 일 설명</span>', completed: false, deadline: '2026-11-23' }],
    archivedTodos: [],
    ddayItems: [],
  };
  const pinned = pinTodoAsDday(initial, 't1', SETTINGS, TODAY);
  assert.ok(pinned.item);
  const edited = updateDdayItem(pinned.state, pinned.item.id, { title: '짧은 배너 별칭', date: '2026-11-25' }, TODAY);
  assert.equal(edited.item?.title, '짧은 배너 별칭');
  assert.equal(edited.state.todos[0].text, '<span>긴 원본 할 일 설명</span>');
  assert.equal(edited.state.todos[0].deadline, '2026-11-25');
});

test('todo deletion keeps D-Day by default (deleteWithTodo=false) and deletes when toggled ON', () => {
  const initial = {
    todos: [{ id: 't1', text: '성찰보고서', completed: false, deadline: '2026-11-20' }],
    archivedTodos: [],
    ddayItems: [],
  };
  const pinned = pinTodoAsDday(initial, 't1', SETTINGS, TODAY);

  const safeDel = syncTodosDeletedToDdays(
    { ...pinned.state, todos: [] },
    ['t1'],
    SETTINGS,
  );
  assert.equal(safeDel.keptCount, 1);
  assert.equal(safeDel.state.ddayItems.length, 1);
  assert.equal(safeDel.state.ddayItems[0].linkedTodoId, null);
  assert.equal(safeDel.state.ddayItems[0].showInTodo, false);

  const cascadeSettings = normalizeDdaySettings({ deleteWithTodo: true });
  const pinned2 = pinTodoAsDday(initial, 't1', SETTINGS, TODAY);
  const cascadeDel = syncTodosDeletedToDdays(
    { ...pinned2.state, todos: [] },
    ['t1'],
    cascadeSettings,
  );
  assert.equal(cascadeDel.deletedCount, 1);
  assert.equal(cascadeDel.state.ddayItems.length, 0);
});

test('linked completion archives both and smart restore handles both present and purged archived todos', () => {
  const initial = {
    todos: [{ id: 't1', text: '연수 신청', completed: false, deadline: '2026-11-21' }],
    archivedTodos: [],
    ddayItems: [],
  };
  const pinned = pinTodoAsDday(initial, 't1', SETTINGS, TODAY);
  assert.ok(pinned.item);
  const completed = completeDdayItem(pinned.state, pinned.item.id, SETTINGS, TODAY);
  assert.equal(completed.completedTodo, true);
  assert.equal(completed.state.todos.length, 0);
  assert.equal(completed.state.archivedTodos.length, 1);
  assert.equal(completed.state.ddayItems[0].status, 'archived');

  // Case A: archived todo still exists -> restore brings todo back cleanly
  const restoredA = restoreDdayItem(completed.state, pinned.item.id);
  assert.equal(restoredA.restoredTodo, true);
  assert.equal(restoredA.state.todos.length, 1);
  assert.equal(restoredA.state.archivedTodos.length, 0);
  assert.equal(restoredA.state.ddayItems[0].status, 'active');
  assert.equal(restoredA.state.ddayItems[0].showInTodo, true);

  // Case B: user purged archived todos first -> restore safely promotes to D-Day 전용
  const syncedTodoComplete = syncTodosCompletedToDdays(
    { todos: [], archivedTodos: [{ id: 't1', text: '연수 신청', completed: true }], ddayItems: restoredA.state.ddayItems },
    ['t1'],
    SETTINGS,
    TODAY,
  );
  const afterPurge = syncArchivedTodosDeletedToDdays(
    { ...syncedTodoComplete.state, archivedTodos: [] },
    null,
  );
  const restoredB = restoreDdayItem(afterPurge, pinned.item.id);
  assert.equal(restoredB.restoredTodo, false);
  assert.equal(restoredB.state.todos.length, 0);
  assert.equal(restoredB.state.ddayItems[0].status, 'active');
  assert.equal(restoredB.state.ddayItems[0].linkedTodoId, null);
  assert.equal(restoredB.state.ddayItems[0].showInTodo, false);
});

test('todo restore, deadline removal, reorder, deleteDdayItem, and clearArchivedDdays maintain invariants', () => {
  const state = {
    todos: [
      { id: 't1', text: '일정 A', completed: false, deadline: '2026-11-22' },
      { id: 't2', text: '일정 B', completed: false, deadline: '2026-11-29' },
    ],
    archivedTodos: [],
    ddayItems: [],
  };
  let cur = pinTodoAsDday(state, 't1', SETTINGS, TODAY).state;
  const second = pinTodoAsDday(cur, 't2', SETTINGS, TODAY);
  assert.ok(second.item);
  const secondId = second.item.id;
  cur = second.state;

  const reordered = reorderActiveDdays(cur, [secondId, cur.ddayItems[0].id]);
  assert.equal(reordered.ddayItems[0].id, secondId);
  assert.equal(reordered.ddayItems[0].order, 0);

  // Clearing Todo deadline detaches link without losing D-Day target date
  const clearedDeadline = syncTodoDeadlineToDdays(reordered, 't2', '');
  assert.equal(clearedDeadline.changed, true);
  const detached = clearedDeadline.state.ddayItems.find((d) => d.id === secondId);
  assert.equal(detached?.linkedTodoId, null);
  assert.equal(detached?.date, '2026-11-29');

  // Archive & clear removes archived D-Days only
  const archived = completeDdayItem(clearedDeadline.state, secondId, SETTINGS, TODAY).state;
  const wipedArchive = clearArchivedDdays(archived);
  assert.equal(wipedArchive.ddayItems.length, 1);

  // Completing via todo and restoring via todo
  const compByTodo = syncTodosCompletedToDdays({ ...wipedArchive, todos: [], archivedTodos: [state.todos[0]] }, ['t1'], SETTINGS, TODAY).state;
  const restByTodo = syncTodoRestoredToDdays({ ...compByTodo, todos: [state.todos[0]], archivedTodos: [] }, 't1', SETTINGS);
  assert.equal(restByTodo.restoredCount, 1);
  assert.equal(restByTodo.state.ddayItems[0].status, 'active');

  // Deleting D-Day keeps linked todo when deleteLinkedTodo=false
  const removed = deleteDdayItem(restByTodo.state, restByTodo.state.ddayItems[0].id, { deleteLinkedTodo: false });
  assert.equal(removed.ddayItems.length, 0);
  assert.equal(removed.todos.length, 1);
});

// ── 삭제 되돌리기용 D-Day 복원 (docs/PRD-todo-row-gestures.md §7.8) ──
// 복원 규칙만 보는 테스트라 D-Day의 나머지 필드는 생략합니다(any).
/** @param {string} id @param {number} order @param {Record<string, any>} [extra] @returns {any} */
const dd = (id, order, extra = {}) => ({ id, title: id, status: 'active', order, linkedTodoId: null, showInTodo: false, ...extra });

test('restoreDdaysForTodos: 함께 지워진 D-Day를 원래 자리·순서로 다시 넣는다', () => {
  const before = [dd('a', 0), dd('b', 1, { linkedTodoId: 't' }), dd('c', 2)];
  const after = [dd('a', 0), dd('c', 1)];
  const changes = [
    { before: before[1], after: null, index: 1 },
    { before: before[2], after: after[1], index: 2 },
  ];
  const result = restoreDdaysForTodos(after, changes);
  assert.equal(result.changed, true);
  assert.deepEqual(result.items, before);
});

test('restoreDdaysForTodos: 남겨 둔 뒤 사용자가 지웠거나 고쳤으면 건너뛴다', () => {
  const before = dd('b', 0, { linkedTodoId: 't', showInTodo: true });
  const after = dd('b', 0);
  assert.equal(restoreDdaysForTodos([], [{ before, after, index: 0 }]).changed, false);
  const edited = { ...after, title: '바꾼 이름' };
  const result = restoreDdaysForTodos([edited], [{ before, after, index: 0 }]);
  assert.equal(result.changed, false);
  assert.equal(result.items[0], edited);
});

test('restoreDdaysForTodos: 키 순서만 다른 것은 그대로로 본다', () => {
  const before = dd('b', 0, { linkedTodoId: 't', showInTodo: true });
  const after = dd('b', 0);
  const reordered = /** @type {any} */ (Object.fromEntries(Object.entries(after).reverse()));
  const result = restoreDdaysForTodos([reordered], [{ before, after, index: 0 }]);
  assert.deepEqual(result.items, [before]);
});

test('restoreDdaysForTodos: 그사이 새 D-Day가 생겨 순서가 겹치면 되돌린 것이 앞', () => {
  const before = dd('old', 0, { linkedTodoId: 't' });
  const current = [dd('new', 0)];
  const result = restoreDdaysForTodos(current, [{ before, after: null, index: 0 }]);
  assert.deepEqual(result.items.map((d) => [d.id, d.order]), [['old', 0], ['new', 1]]);
});

// ── 다중 선택 [D-Day] 일괄 고정 ──
const BULK = () => ({
  todos: [
    { id: 'a', text: '수학 퍼즐', completed: false, deadline: '2026-11-23' },
    { id: 'b', text: '<b>운영일지</b>', completed: false, deadline: '' },
    { id: 'c', text: '강사비 기안', completed: false, deadline: '2026-12-09' },
    { id: 'd', text: '이미 고정', completed: false, deadline: '2026-11-30' },
  ],
  archivedTodos: [{ id: 'z', text: '마감된 일', completed: true, deadline: '2026-11-01' }],
  ddayItems: [],
});

test('planBulkDdayPin: 바로 고정 · 날짜 필요 · 이미 고정을 목록 순서대로 나누고, 목록에 없는 id는 세지 않는다', () => {
  const base = BULK();
  const pinned = pinTodoAsDday(base, 'd', SETTINGS, TODAY).state;
  const plan = planBulkDdayPin(pinned, ['c', 'z', 'b', 'a', 'd', 'gone']);
  assert.deepEqual(plan, { ready: ['a', 'c'], needDate: ['b'], alreadyLinked: ['d'] });
});

test('pinTodosAsDdays: 날짜 없이 누르면 마감일 있는 것만 만들고, 날짜 없는 것은 건너뛴 수로 알려 준다', () => {
  const res = pinTodosAsDdays(BULK(), ['a', 'b', 'c'], SETTINGS, TODAY);
  assert.deepEqual(res.created.map((d) => d.title), ['수학 퍼즐', '강사비 기안']);
  assert.equal(res.missingDate, 1);
  assert.equal(res.alreadyLinked, 0);
  assert.deepEqual(res.state.ddayItems.map((d) => d.linkedTodoId), ['a', 'c']);
  // 활성 D-Day 순서(order)는 0부터 빈틈없이 매겨집니다.
  assert.deepEqual(res.state.ddayItems.map((d) => d.order), [0, 1]);
});

test('pinTodosAsDdays: 달력에서 고른 날은 마감일 없는 할 일에만 쓰고, 그 할 일의 마감일로도 정한다', () => {
  const res = pinTodosAsDdays(BULK(), ['a', 'b'], SETTINGS, TODAY, { fallbackDate: '2026-12-01' });
  assert.equal(res.missingDate, 0);
  const byTodo = Object.fromEntries(res.state.ddayItems.map((d) => [d.linkedTodoId, d.date]));
  assert.deepEqual(byTodo, { a: '2026-11-23', b: '2026-12-01' });
  assert.equal(res.state.todos.find((t) => t.id === 'b')?.deadline, '2026-12-01');
  assert.equal(res.state.todos.find((t) => t.id === 'a')?.deadline, '2026-11-23');
  // HTML 서식은 제목에서만 벗기고 할 일 원문은 그대로 둡니다.
  assert.equal(res.created.find((d) => d.linkedTodoId === 'b')?.title, '운영일지');
  assert.equal(res.state.todos.find((t) => t.id === 'b')?.text, '<b>운영일지</b>');
});

test('pinTodosAsDdays: 이미 이어진 할 일은 다시 만들지 않고, 두 번 눌러도 D-Day가 늘지 않는다', () => {
  const once = pinTodosAsDdays(BULK(), ['a', 'c', 'd'], SETTINGS, TODAY);
  assert.equal(once.created.length, 3);
  const twice = pinTodosAsDdays(once.state, ['a', 'c', 'd'], SETTINGS, TODAY);
  assert.equal(twice.created.length, 0);
  assert.equal(twice.alreadyLinked, 3);
  assert.equal(twice.state.ddayItems.length, 3);
});

test('pinTodosAsDdays: 잘못된 날짜는 고른 날로 보지 않고, "할 일에도 보이기"가 꺼져 있으면 할 일 목록에서 빠진다', () => {
  const invalid = pinTodosAsDdays(BULK(), ['b'], SETTINGS, TODAY, { fallbackDate: '2026-02-30' });
  assert.equal(invalid.created.length, 0);
  assert.equal(invalid.missingDate, 1);

  const hideTodo = normalizeDdaySettings({
    defaultChannelsFromTodo: { showInTodo: false, showInBanner: true, showInWidget: true },
  });
  const moved = pinTodosAsDdays(BULK(), ['a', 'c'], hideTodo, TODAY);
  assert.equal(moved.created.length, 2);
  // 남은 할 일은 한 개씩 고정할 때와 같이 마감일 순으로 다시 놓입니다(마감일 없는 것은 맨 뒤).
  assert.deepEqual(moved.state.todos.map((t) => t.id), ['d', 'b']);
  assert.ok(moved.created.every((d) => d.linkedTodoId === null && d.showInTodo === false));
});
