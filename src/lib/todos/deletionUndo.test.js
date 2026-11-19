// @ts-nocheck — 가짜 DOM·시간·간단한 고정 자료로 경계값을 검사하는 테스트라 타입 검사에서 뺍니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDdaySettings } from '../dday/ddayModel.js';
import {
  pinTodoAsDday,
  syncArchivedTodosDeletedToDdays,
  syncTodosDeletedToDdays,
} from '../dday/ddayActions.js';
import { TITLE_PREVIEW_CHARS, captureDeletion, previewTitle, restoreDeletions } from './deletionUndo.js';

const TODAY = '2026-11-19';

/** @param {string[]} ids @param {string} [prefix] */
function todos(ids, prefix = '할 일') {
  return ids.map((id) => ({ id, text: `${prefix} ${id}`, completed: false, deadline: '' }));
}

/** appState.deleteTodo와 같은 순서로 지우고 기록을 만듭니다. */
function deleteActive(state, id, settings = normalizeDdaySettings(undefined)) {
  const before = structuredClone(state);
  const removed = { ...state, todos: state.todos.filter((t) => t.id !== id) };
  const synced = syncTodosDeletedToDdays(removed, [id], settings);
  const after = { ...removed, ddayItems: synced.state.ddayItems };
  return { after, record: captureDeletion({ before, after, kind: 'todo', ids: [id] }), synced };
}

function deleteArchived(state, ids) {
  const before = structuredClone(state);
  const idSet = ids ? new Set(ids) : null;
  const removed = { ...state, archivedTodos: idSet ? state.archivedTodos.filter((t) => !idSet.has(t.id)) : [] };
  const after = { ...removed, ddayItems: syncArchivedTodosDeletedToDdays(removed, ids).ddayItems };
  const recordIds = ids ?? state.archivedTodos.map((t) => t.id);
  return { after, record: captureDeletion({ before, after, kind: 'archived', ids: recordIds }) };
}

const ids = (list) => list.map((t) => t.id).join(',');
const base = () => ({ todos: todos(['a', 'b', 'c', 'd', 'e']), archivedTodos: [], ddayItems: [] });

test('가운데 하나를 지우고 되돌리면 지우기 전과 똑같다', () => {
  const start = base();
  const { after, record } = deleteActive(start, 'c');
  assert.equal(ids(after.todos), 'a,b,d,e');
  const { state, restoredIds, skippedIds } = restoreDeletions(after, [record]);
  assert.deepEqual(state.todos, start.todos);
  assert.deepEqual(restoredIds, ['c']);
  assert.deepEqual(skippedIds, []);
});

test('첫째·마지막을 지우고 되돌려도 제자리', () => {
  for (const id of ['a', 'e']) {
    const start = base();
    const { after, record } = deleteActive(start, id);
    assert.equal(ids(restoreDeletions(after, [record]).state.todos), 'a,b,c,d,e', id);
  }
});

test('지운 뒤 순서를 바꿔도 원래 앞 이웃 바로 뒤로 돌아온다', () => {
  const { after, record } = deleteActive(base(), 'c');
  const moved = { ...after, todos: [after.todos[2], after.todos[0], after.todos[3], after.todos[1]] }; // d,a,e,b
  assert.equal(ids(moved.todos), 'd,a,e,b');
  assert.equal(ids(restoreDeletions(moved, [record]).state.todos), 'd,a,e,b,c');
});

test('앞 이웃이 없어졌으면 뒤 이웃 앞, 둘 다 없으면 원래 번호(넘치면 끝)', () => {
  const { after, record } = deleteActive(base(), 'c');
  const noPrev = { ...after, todos: after.todos.filter((t) => t.id !== 'b') }; // a,d,e
  assert.equal(ids(restoreDeletions(noPrev, [record]).state.todos), 'a,c,d,e');
  const neither = { ...after, todos: todos(['x', 'y', 'z', 'w']) };
  assert.equal(ids(restoreDeletions(neither, [record]).state.todos), 'x,y,c,z,w');
  const short = { ...after, todos: todos(['x']) };
  assert.equal(ids(restoreDeletions(short, [record]).state.todos), 'x,c');
});

test('A를 지우고 A의 앞 이웃 B를 지운 묶음은 원래 순서대로 돌아온다', () => {
  const first = deleteActive(base(), 'c');       // a,b,d,e
  const second = deleteActive(first.after, 'b'); // a,d,e
  const result = restoreDeletions(second.after, [first.record, second.record]);
  assert.equal(ids(result.state.todos), 'a,b,c,d,e');
  assert.deepEqual(result.restoredIds.sort(), ['b', 'c']);
});

test('A를 지우고 A의 뒤 이웃을 지운 묶음도 원래 순서대로', () => {
  const first = deleteActive(base(), 'c');
  const second = deleteActive(first.after, 'd');
  assert.equal(ids(restoreDeletions(second.after, [first.record, second.record]).state.todos), 'a,b,c,d,e');
});

test('이미 있는 id는 건너뛴다(할 일·마감된 일 양쪽을 본다)', () => {
  const { after, record } = deleteActive(base(), 'c');
  const back = { ...after, todos: [...after.todos, { id: 'c', text: '전역 되돌리기로 이미 돌아옴', completed: false }] };
  const r1 = restoreDeletions(back, [record]);
  assert.deepEqual(r1.restoredIds, []);
  assert.deepEqual(r1.skippedIds, ['c']);
  assert.equal(r1.state.todos.filter((t) => t.id === 'c').length, 1);
  const archivedBack = { ...after, archivedTodos: [{ id: 'c', text: '마감된 쪽에 있음', completed: true }] };
  assert.deepEqual(restoreDeletions(archivedBack, [record]).skippedIds, ['c']);
});

test('되돌림은 그사이 고친 다른 할 일의 글을 덮지 않는다', () => {
  const { after, record } = deleteActive(base(), 'c');
  const edited = { ...after, todos: after.todos.map((t) => (t.id === 'a' ? { ...t, text: '고친 글' } : t)) };
  const { state } = restoreDeletions(edited, [record]);
  assert.equal(state.todos.find((t) => t.id === 'a').text, '고친 글');
  assert.equal(state.todos.find((t) => t.id === 'c').text, '할 일 c');
});

test('되돌림은 입력을 바꾸지 않고, 남아 있는 항목 객체는 그대로 재사용한다', () => {
  const { after, record } = deleteActive(base(), 'c');
  const frozen = JSON.stringify(after);
  const { state } = restoreDeletions(after, [record]);
  assert.equal(JSON.stringify(after), frozen);
  assert.equal(state.todos[0], after.todos[0]);
  // 기록 속 사본을 다시 넣으므로, 되돌린 뒤 고쳐도 기록이 오염되지 않습니다.
  state.todos[2].text = '되돌린 뒤 고침';
  assert.equal(record.items[0].todo.text, '할 일 c');
});

test('마감된 일 전체 삭제를 되돌리면 모두 원래 순서로 돌아온다', () => {
  const start = { todos: todos(['a']), archivedTodos: todos(['x', 'y', 'z'], '마감'), ddayItems: [] };
  const { after, record } = deleteArchived(start, null);
  assert.equal(after.archivedTodos.length, 0);
  const { state, restoredByKind } = restoreDeletions(after, [record]);
  assert.deepEqual(state.archivedTodos, start.archivedTodos);
  assert.deepEqual(restoredByKind, { todo: [], archived: ['x', 'y', 'z'] });
});

test('할 일과 마감된 일이 섞인 묶음도 각자 제자리로', () => {
  const start = { todos: todos(['a', 'b']), archivedTodos: todos(['x', 'y'], '마감'), ddayItems: [] };
  const one = deleteActive(start, 'b');
  const two = deleteArchived(one.after, ['x']);
  const { state } = restoreDeletions(two.after, [one.record, two.record]);
  assert.equal(ids(state.todos), 'a,b');
  assert.equal(ids(state.archivedTodos), 'x,y');
});

test('지운 것이 없으면 기록을 만들지 않는다', () => {
  const start = base();
  assert.equal(captureDeletion({ before: start, after: start, kind: 'todo', ids: ['nope'] }), null);
});

// ── D-Day 연동 ──
function withLinkedDday() {
  const settings = normalizeDdaySettings(undefined);
  let state = {
    todos: [
      { id: 'a', text: '수학 퍼즐', completed: false, deadline: '2026-11-23' },
      { id: 'b', text: '강사비 기안', completed: false, deadline: '2026-11-25' },
      { id: 'c', text: '보고서', completed: false, deadline: '2026-11-30' },
    ],
    archivedTodos: [],
    ddayItems: [],
  };
  for (const id of ['a', 'b', 'c']) state = pinTodoAsDday(state, id, settings, TODAY).state;
  return state;
}

test('D-Day "함께 삭제": 되돌리면 D-Day도 돌아오고 순서·연결이 원래대로', () => {
  const start = withLinkedDday();
  const settings = { ...normalizeDdaySettings(undefined), deleteWithTodo: true };
  const { after, record, synced } = deleteActive(start, 'b', settings);
  assert.equal(synced.deletedCount, 1);
  assert.equal(after.ddayItems.length, 2);
  const { state } = restoreDeletions(after, [record]);
  assert.deepEqual(state.ddayItems, start.ddayItems);
});

test('D-Day "남김": 되돌리면 남겨 둔 D-Day가 다시 그 할 일에 연결된다', () => {
  const start = withLinkedDday();
  const settings = { ...normalizeDdaySettings(undefined), deleteWithTodo: false };
  const { after, record, synced } = deleteActive(start, 'b', settings);
  assert.equal(synced.keptCount, 1);
  const kept = after.ddayItems.find((d) => d.title === '강사비 기안');
  assert.equal(kept.linkedTodoId, null);
  const { state } = restoreDeletions(after, [record]);
  assert.deepEqual(state.ddayItems, start.ddayItems);
});

test('D-Day "남김" 뒤 사용자가 그 D-Day를 바꿨으면 되돌림이 덮지 않는다', () => {
  const start = withLinkedDday();
  const settings = { ...normalizeDdaySettings(undefined), deleteWithTodo: false };
  const { after, record } = deleteActive(start, 'b', settings);
  const changed = { ...after, ddayItems: after.ddayItems.map((d) => (d.linkedTodoId === null ? { ...d, title: '사용자가 바꾼 이름' } : d)) };
  const { state, restoredIds } = restoreDeletions(changed, [record]);
  assert.deepEqual(restoredIds, ['b']);
  const dday = state.ddayItems.find((d) => d.title === '사용자가 바꾼 이름');
  assert.equal(dday.linkedTodoId, null);
});

test('이미 돌아온 할 일에 딸린 D-Day는 건드리지 않는다', () => {
  const start = withLinkedDday();
  const settings = { ...normalizeDdaySettings(undefined), deleteWithTodo: false };
  const { after, record } = deleteActive(start, 'b', settings);
  const back = { ...after, todos: [...after.todos, start.todos[1]] };
  const { state, skippedIds } = restoreDeletions(back, [record]);
  assert.deepEqual(skippedIds, ['b']);
  assert.deepEqual(state.ddayItems, after.ddayItems);
});

test('마감된 일 전체 삭제로 끊긴 D-Day 연결도 되돌린다', () => {
  const settings = normalizeDdaySettings(undefined);
  let start = withLinkedDday();
  // b를 마감(마감된 일로 이동) — 연결은 D-Day 쪽에 남아 있는 상태를 흉내 냅니다.
  start = { ...start, todos: start.todos.filter((t) => t.id !== 'b'), archivedTodos: [{ ...start.todos[1], completed: true }] };
  void settings;
  const { after, record } = deleteArchived(start, null);
  assert.ok(after.ddayItems.every((d) => d.linkedTodoId !== 'b'));
  const { state } = restoreDeletions(after, [record]);
  assert.deepEqual(state.ddayItems, start.ddayItems);
  assert.deepEqual(state.archivedTodos, start.archivedTodos);
});

// ── 제목 미리보기 ──
test('제목 미리보기: HTML·공백 정리, 14자에서 말줄임', () => {
  assert.equal(TITLE_PREVIEW_CHARS, 14);
  assert.equal(previewTitle('<b>수학</b>   퍼즐&nbsp;페스티벌'), '수학 퍼즐 페스티벌');
  // 14글자(띄어쓰기 포함)까지 보이고, 잘린 끝의 띄어쓰기는 지운 뒤 말줄임표를 붙입니다.
  assert.equal(previewTitle('기초학력 강사비 품의 기안 올리기'), '기초학력 강사비 품의 기안…');
  assert.equal(previewTitle('기초학력 강사비 품의 기 안'), '기초학력 강사비 품의 기…');
  assert.equal(previewTitle('가나다라마바사아자차카타파하'), '가나다라마바사아자차카타파하');
});

test('제목 미리보기: 이모지·조합 글자를 반쪽으로 자르지 않고, 빈 글은 "빈 할 일"', () => {
  const family = '👨‍👩‍👧‍👦';
  assert.equal(previewTitle(`${family.repeat(15)}`), `${family.repeat(14)}…`);
  assert.equal(previewTitle(''), '빈 할 일');
  assert.equal(previewTitle('<br><div> </div>'), '빈 할 일');
  assert.equal(previewTitle(undefined), '빈 할 일');
});
