import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_FIELDS,
  WINDOW_FIELDS,
  decodeWindowData,
  encodeWindowData,
  hasWindowContent,
  htmlHasText,
  pickSnapshot,
  restoreSnapshotValue,
} from './windowDataCodec.js';

// 5.0.0이 저장하던 창 데이터 한 칸 (모든 필드가 채워진 정상 값)
const FULL_V500 = Object.freeze({
  todos: [{ id: '1', text: '<b>보고서</b>', completed: false, deadline: '2026-09-20', lastNotified: '2026-09-16' }],
  archivedTodos: [{ id: '2', text: '끝난 일', completed: true, deadline: '' }],
  notes: '<div>메모</div>',
  themeColor: 'blue',
  opacity: 0.8,
  reminderOpacity: 0.6,
  fontFamily: '리디바탕',
  uiFontFamily: '배달의민족 주아',
  fontSize: 12,
  uiFontSize: 11,
  letterSpacing: 0.05,
  isPinned: true,
  title: '업무',
  isDarkMode: true,
  showArchived: false,
  showNotes: false,
  showReminders: false,
  reminderSuppressUntil: 1789000000000,
  windowPosX: 120,
  windowPosY: 80,
  windowWidth: 400,
  windowHeight: 600,
  isFullscreen: false,
  todoHeight: 145,
  notesHeight: 180,
  isNotesLocked: true,
  globalMuteSound: true,
  isRolledUp: false,
  previousHeight: 300,
  isVerticalSnapped: true,
  preSnapPosY: 40,
  preSnapHeight: 500,
});

const MAIN = { label: 'main', globalMuteSound: true };

test('필드 표는 5.0.0 저장 키 순서와 개수를 그대로 유지한다', () => {
  // 5.0.5에서 추가된 필드는 항상 "끝에만" 붙입니다 (기존 키 순서 보존).
  assert.deepEqual(WINDOW_FIELDS.map((f) => f.name), [...Object.keys(FULL_V500), 'windowPhysX', 'windowPhysY', 'headerDesign']);
  assert.deepEqual(
    SNAPSHOT_FIELDS,
    ['todos', 'archivedTodos', 'notes', 'themeColor', 'opacity', 'fontFamily', 'uiFontFamily',
      'fontSize', 'uiFontSize', 'letterSpacing', 'isDarkMode', 'showArchived', 'showNotes',
      'showReminders', 'reminderSuppressUntil', 'title'],
  );
  // 스냅샷 필드는 모두 저장 필드이기도 해야 합니다 (규칙 2).
  const persisted = new Set(WINDOW_FIELDS.map((f) => f.name));
  for (const name of SNAPSHOT_FIELDS) assert.ok(persisted.has(name), name);
  // 표의 snapshot 표시와 스냅샷 목록이 서로 어긋나지 않아야 합니다.
  assert.deepEqual(
    WINDOW_FIELDS.filter((f) => f.snapshot).map((f) => f.name).sort(),
    [...SNAPSHOT_FIELDS].sort(),
  );
});

test('정상 데이터는 복원 → 저장 왕복 후 한 글자도 바뀌지 않는다', () => {
  const decoded = decodeWindowData(structuredClone(FULL_V500), MAIN);
  const encoded = encodeWindowData((name) => decoded[name]);
  // 5.0.5에서 추가된 물리 좌표는 예전 데이터에 없으므로 undefined → JSON에서 빠져, 파일 내용이 한 글자도 바뀌지 않습니다.
  assert.equal(JSON.stringify(encoded), JSON.stringify(FULL_V500));
  assert.deepEqual(JSON.parse(JSON.stringify(encoded)), FULL_V500);
});

test('빈 데이터는 5.0.0 init()과 같은 기본값으로 복원된다', () => {
  const d = decodeWindowData(undefined, { label: 'main' });
  assert.deepEqual(d.todos, []);
  assert.deepEqual(d.archivedTodos, []);
  assert.equal(d.notes, '');
  assert.equal(d.themeColor, 'amber');
  assert.equal(d.opacity, 1.0);
  assert.equal(d.reminderOpacity, 1.0);
  assert.equal(d.fontFamily, '메이플스토리 L');
  assert.equal(d.uiFontFamily, '메이플스토리 L');
  assert.equal(d.fontSize, 10);
  assert.equal(d.uiFontSize, 10);
  assert.equal(d.letterSpacing, 0);
  assert.equal(d.isPinned, false);
  assert.equal(d.title, '');
  assert.equal(d.isDarkMode, false);
  assert.equal(d.showArchived, true);
  assert.equal(d.showNotes, true);
  assert.equal(d.showReminders, true);
  assert.equal(d.reminderSuppressUntil, 0);
  assert.equal(d.windowPosX, undefined);
  assert.equal(d.windowWidth, undefined);
  assert.equal(d.isFullscreen, false);
  assert.equal(d.todoHeight, 145);
  assert.equal(d.notesHeight, 140);
  assert.equal(d.isNotesLocked, false);
  assert.equal(d.globalMuteSound, false);
  assert.equal(d.isRolledUp, false);
  assert.equal(d.previousHeight, 280);
  assert.equal(d.isVerticalSnapped, false);
  assert.equal(d.preSnapPosY, null);
  assert.equal(d.preSnapHeight, null);
});

test('`||` 규칙 필드는 0·빈 문자열을 기본값으로 바꾼다 (5.0.0 동작 보존)', () => {
  const d = decodeWindowData({ fontSize: 0, uiFontSize: 0, previousHeight: 0, title: '', fontFamily: '' }, MAIN);
  assert.equal(d.fontSize, 10);
  assert.equal(d.uiFontSize, 10);
  assert.equal(d.previousHeight, 280);
  assert.equal(d.title, '');
  assert.equal(d.fontFamily, '메이플스토리 L');
});

test('`??` 규칙 필드는 0·false를 그대로 유지한다 (5.0.0 동작 보존)', () => {
  const d = decodeWindowData({
    letterSpacing: 0, showArchived: false, showNotes: false, showReminders: false,
    todoHeight: 0, notesHeight: 0, reminderOpacity: 0, preSnapPosY: 0,
  }, MAIN);
  assert.equal(d.letterSpacing, 0);
  assert.equal(d.showArchived, false);
  assert.equal(d.showNotes, false);
  assert.equal(d.showReminders, false);
  assert.equal(d.todoHeight, 0);
  assert.equal(d.notesHeight, 0);
  assert.equal(d.reminderOpacity, 0);
  assert.equal(d.preSnapPosY, 0);
});

test('불투명도가 0.1 미만이거나 숫자가 아니면 1.0으로 되돌린다', () => {
  assert.equal(decodeWindowData({ opacity: 0.05 }, MAIN).opacity, 1.0);
  assert.equal(decodeWindowData({ opacity: '0.5' }, MAIN).opacity, 1.0);
  assert.equal(decodeWindowData({ opacity: 0.1 }, MAIN).opacity, 0.1);
});

test('테마는 창 종류에 맞게 정규화되고, Tiny Note 다크 테마는 다크 모드를 강제한다', () => {
  // Tidy 전용 테마(pistachio)는 Tiny Note에서 기본(amber)으로 바뀝니다.
  assert.equal(decodeWindowData({ themeColor: 'pistachio' }, { label: 'main' }).themeColor, 'pistachio');
  assert.equal(decodeWindowData({ themeColor: 'pistachio' }, { label: 'tinynote-1' }).themeColor, 'amber');
  // 알 수 없는 테마는 기본값으로
  assert.equal(decodeWindowData({ themeColor: 'nope' }, { label: 'note-2' }).themeColor, 'amber');
  // Tiny Note 다크 테마
  const dark = decodeWindowData({ themeColor: 'tiny-dark', isDarkMode: false }, { label: 'tinynote-3' });
  assert.equal(dark.themeColor, 'tiny-dark');
  assert.equal(dark.isDarkMode, true);
  // Tidy 창에서는 tiny-dark가 유효하지 않으므로 amber + 저장된 다크 모드 값
  const tidy = decodeWindowData({ themeColor: 'tiny-dark', isDarkMode: false }, { label: 'main' });
  assert.equal(tidy.themeColor, 'amber');
  assert.equal(tidy.isDarkMode, false);
});

test('무음 모드는 창 데이터가 아니라 전역 키 값을 따른다', () => {
  assert.equal(decodeWindowData({ globalMuteSound: true }, { label: 'main', globalMuteSound: false }).globalMuteSound, false);
  assert.equal(decodeWindowData({}, { label: 'main', globalMuteSound: true }).globalMuteSound, true);
});

test('저장 시 undefined 필드는 JSON에서 빠진다 (창 위치가 없던 창의 5.0.0 동작)', () => {
  const decoded = decodeWindowData({ todos: [{ id: 'a', text: 'x', completed: false }] }, { label: 'note-1' });
  const json = JSON.parse(JSON.stringify(encodeWindowData((n) => decoded[n])));
  assert.equal('windowPosX' in json, false);
  assert.equal('windowWidth' in json, false);
  assert.equal(json.preSnapPosY, null);
});

test('모르는 키는 복원 결과에 섞이지 않는다 (저장 파일의 다른 키는 별도 경로로 보존)', () => {
  const decoded = decodeWindowData({ futureFeature: 1 }, MAIN);
  assert.equal('futureFeature' in decoded, false);
});

test('스냅샷은 16개 필드만 담고, 되돌릴 때 옛 스냅샷의 빈 필드를 보정한다', () => {
  const decoded = decodeWindowData(FULL_V500, MAIN);
  const snap = pickSnapshot((n) => decoded[n]);
  assert.deepEqual(Object.keys(snap), [...SNAPSHOT_FIELDS]);
  assert.equal(restoreSnapshotValue('letterSpacing', undefined), 0);
  assert.equal(restoreSnapshotValue('showReminders', undefined), true);
  assert.equal(restoreSnapshotValue('reminderSuppressUntil', undefined), 0);
  assert.equal(restoreSnapshotValue('title', '제목'), '제목');
});

test('빈 창 판정: 태그·&nbsp;·폭 없는 공백만 있으면 비어 있다', () => {
  assert.equal(htmlHasText(''), false);
  assert.equal(htmlHasText('<div><br></div>'), false);
  assert.equal(htmlHasText('<p>&nbsp;</p>'), false);
  assert.equal(htmlHasText('​'), false);
  assert.equal(htmlHasText('<span>a</span>'), true);
  assert.equal(htmlHasText('A &amp; B'), true);

  assert.equal(hasWindowContent(null), false);
  assert.equal(hasWindowContent({}), false);
  assert.equal(hasWindowContent({ todos: [], archivedTodos: [], notes: '<br>' }), false);
  assert.equal(hasWindowContent({ todos: [{ id: 1 }] }), true);
  assert.equal(hasWindowContent({ archivedTodos: [{ id: 1 }] }), true);
  assert.equal(hasWindowContent({ notes: '<div>메모</div>' }), true);
});

test('5.0.5 데이터: 물리 좌표도 복원 → 저장 왕복 후 그대로다', () => {
  const v502 = { ...structuredClone(FULL_V500), windowPhysX: 4500, windowPhysY: -8 };
  const decoded = decodeWindowData(structuredClone(v502), MAIN);
  assert.equal(decoded.windowPhysX, 4500);
  assert.equal(decoded.windowPhysY, -8);
  const encoded = encodeWindowData((name) => decoded[name]);
  assert.equal(JSON.stringify(encoded), JSON.stringify(v502));
});


test('상단 디자인은 클래식 기본값이며 새 디자인 선택만 저장하고 Undo에 섞지 않는다', () => {
  for (const value of [undefined, null, '', 'invalid', 'classic']) {
    const state = decodeWindowData({ headerDesign: value }, MAIN);
    assert.equal(state.headerDesign, 'classic');
    assert.equal(encodeWindowData(name => state[name]).headerDesign, undefined);
  }
  const original = { ...FULL_V500, headerDesign: 'modern' };
  const restored = decodeWindowData(original, MAIN);
  const encoded = encodeWindowData(name => restored[name]);
  assert.equal(encoded.headerDesign, 'modern');
  assert.deepEqual(encoded.todos, FULL_V500.todos);
  assert.equal(Object.hasOwn(pickSnapshot(name => restored[name]), 'headerDesign'), false);
});
