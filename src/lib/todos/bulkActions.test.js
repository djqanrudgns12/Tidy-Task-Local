import test from 'node:test';
import assert from 'node:assert/strict';
import { describeArchiveResult, describeArchiveUndo, describeBulkDdayResult } from './bulkActions.js';
import { ARCHIVE_TITLE_MAX, pickSelectedTodos, todoToArchiveNote } from './todoArchive.js';

test('describeBulkDdayResult: 만든 개수와 건너뛴 이유를 함께 알린다', () => {
  assert.equal(describeBulkDdayResult({ created: [1, 2], alreadyLinked: 0, missingDate: 0 }), 'D-Day 2개를 만들었어요');
  assert.equal(
    describeBulkDdayResult({ created: [1], alreadyLinked: 1, missingDate: 2 }),
    'D-Day 1개를 만들었어요 (이미 D-Day 1개 · 날짜 없는 2개 제외)',
  );
  assert.equal(describeBulkDdayResult({ created: [], alreadyLinked: 3, missingDate: 0 }), '고른 할 일은 이미 모두 D-Day예요');
  assert.equal(describeBulkDdayResult({ created: [], alreadyLinked: 0, missingDate: 2 }), '만든 D-Day가 없어요 (날짜 없는 2개 제외)');
});

test('describeArchiveResult: 복사·옮김을 말로 구분하고, 실패하면 할 일을 지우지 않았다고 분명히 알린다', () => {
  assert.equal(describeArchiveResult(3, true, 'copy'), '할 일 3개를 아카이브에 복사했어요');
  assert.equal(describeArchiveResult(3, true, 'move'), '할 일 3개를 아카이브로 옮겼어요');
  assert.equal(describeArchiveResult(2, true), '할 일 2개를 아카이브로 옮겼어요');
  assert.match(describeArchiveResult(3, false, 'copy'), /그대로 두었어요/);
  assert.equal(describeArchiveUndo(3), '아카이브에서 카드 3개를 뺐어요');
});

test('pickSelectedTodos: 고른 순서가 아니라 목록 순서로 꺼내고, 없는 id는 무시한다', () => {
  const todos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(pickSelectedTodos(todos, ['c', 'x', 'a']).map((t) => t.id), ['a', 'c']);
  assert.deepEqual(pickSelectedTodos(todos, []), []);
});

test('todoToArchiveNote: 서식은 본문에 두고, 제목은 글자만 짧게, 마감일은 본문 아래 한 줄로 남긴다', () => {
  const note = todoToArchiveNote(
    { id: 't1', text: '<b>학습종합클리닉</b> 운영일지 제출', deadline: '2026-12-01' },
    { themeColor: 'periwinkle', isDarkMode: true, sourceLabel: 'note-2' },
  );
  assert.equal(note.title, '학습종합클리닉 운영일지 제출');
  assert.equal(note.content, '<div><b>학습종합클리닉</b> 운영일지 제출</div><div>📅 2026년 12/1(화) 마감</div>');
  assert.equal(note.themeColor, 'periwinkle');
  assert.equal(note.isDarkMode, true);
  assert.equal(note.sourceLabel, 'note-2');
});

test('todoToArchiveNote: 긴 제목은 자르고, 빈 글·잘못된 마감일도 안전하게 만든다', () => {
  const long = todoToArchiveNote({ id: 't', text: '가'.repeat(60), deadline: '2026-02-30' });
  assert.ok(long.title.length <= ARCHIVE_TITLE_MAX + 1, long.title);
  assert.equal(long.content, `<div>${'가'.repeat(60)}</div>`);
  assert.equal(long.themeColor, 'amber');
  const empty = todoToArchiveNote({ id: 'e', text: '' });
  assert.equal(empty.title, '할 일');
});
