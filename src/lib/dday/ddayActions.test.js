import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDdaySettings } from './ddayModel.js';
import {
  clearArchivedDdays,
  completeDdayItem,
  createNewDday,
  deleteDdayItem,
  pinTodoAsDday,
  reorderActiveDdays,
  restoreDdayItem,
  syncArchivedTodosDeletedToDdays,
  syncTodoDeadlineToDdays,
  syncTodoRestoredToDdays,
  syncTodosCompletedToDdays,
  syncTodosDeletedToDdays,
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
