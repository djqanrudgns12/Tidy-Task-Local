import test from 'node:test';
import assert from 'node:assert/strict';
import { collectImminentTodos } from './reminderEngine.js';

const NOW = new Date(2026, 8, 16, 10, 0); // 2026-09-16

test('D-3 이내·지난 마감·날짜 오류만 모으고, 완료·마감일 없는 항목은 뺀다', () => {
  const { list } = collectImminentTodos([
    {
      label: 'main', title: '업무', todos: [
        { id: 'a', text: '오늘', deadline: '2026-09-16' },
        { id: 'b', text: 'D-3', deadline: '2026-09-19' },
        { id: 'c', text: 'D-4', deadline: '2026-09-20' },
        { id: 'd', text: '지남', deadline: '2026-09-10' },
        { id: 'e', text: '완료', deadline: '2026-09-16', completed: true },
        { id: 'f', text: '마감일 없음', deadline: '' },
        { id: 'g', text: '날짜 오류', deadline: '언젠가' },
      ],
    },
  ], NOW);

  assert.deepEqual(list.map((t) => t.id), ['d', 'a', 'b', 'g']);
  assert.deepEqual(list.map((t) => t.diffDays), [-6, 0, 3, Infinity]);
  assert.equal(list[0].sourceLabel, 'main');
  assert.equal(list[0].sourceTitle, '업무');
});

test('창 제목이 없으면 "제목 없음"', () => {
  const { list } = collectImminentTodos([{ label: 'note-1', todos: [{ id: 1, deadline: '2026-09-16' }] }], NOW);
  assert.equal(list[0].sourceTitle, '제목 없음');
});

test('서로 다른 창의 같은 ID 할 일은 둘 다 보여 준다 (창 이름:ID로 중복 판정)', () => {
  const { list } = collectImminentTodos([
    { label: 'main', todos: [{ id: '100', deadline: '2026-09-16' }] },
    { label: 'note-2', todos: [{ id: '100', deadline: '2026-09-17' }] },
  ], NOW);
  assert.equal(list.length, 2);
});

test('같은 창에 같은 항목이 두 번 있으면 한 번만', () => {
  const todo = { id: 'x', deadline: '2026-09-16' };
  const { list } = collectImminentTodos([{ label: 'main', todos: [todo, todo] }], NOW);
  assert.equal(list.length, 1);
});

test('오늘 아직 알리지 않은 항목의 위치를 돌려준다 (날짜 오류 항목은 알림 대상 아님)', () => {
  const { unnotified, today } = collectImminentTodos([
    { label: 'main', todos: [
      { id: 'a', deadline: '2026-09-16', lastNotified: '2026-09-16' },
      { id: 'b', deadline: '2026-09-17', lastNotified: '2026-09-15' },
      { id: 'c', deadline: 'bad' },
    ] },
    { label: 'tinynote-3', todos: [{ id: 'z', deadline: '2026-09-18' }] },
  ], NOW);
  assert.equal(today, '2026-09-16');
  assert.deepEqual(unnotified, [
    { label: 'main', index: 1, id: 'b' },
    { label: 'tinynote-3', index: 0, id: 'z' },
  ]);
});

test('빈 입력', () => {
  assert.deepEqual(collectImminentTodos([], NOW).list, []);
  assert.deepEqual(collectImminentTodos(undefined, NOW).list, []);
});
