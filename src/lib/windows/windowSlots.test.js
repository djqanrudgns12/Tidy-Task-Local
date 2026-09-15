import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archivedNoteToWindowData,
  countOpenSlots,
  findSlot,
  isSlotLimitReached,
  noteWindowOptions,
  tinyNoteWindowOptions,
} from './windowSlots.js';

const store = (map) => async (label) => map[label];

test('새 창: 내용이 남은 닫힌 슬롯을 먼저 되살린다', async () => {
  const label = await findSlot({
    prefix: 'note-',
    openLabels: ['main', 'note-1'],
    getData: store({ 'note-3': { notes: '<div>남은 메모</div>' } }),
    mode: 'reuse-data-first',
  });
  assert.equal(label, 'note-3');
});

test('새 창: 되살릴 슬롯이 없으면 번호가 가장 작은 빈 슬롯', async () => {
  const label = await findSlot({
    prefix: 'tinynote-',
    openLabels: ['tinynote-1'],
    getData: store({ 'tinynote-2': { notes: '<br>' } }), // 빈 HTML은 내용 없음
    mode: 'reuse-data-first',
  });
  assert.equal(label, 'tinynote-2');
});

test('꺼내기: 내용이 있는 슬롯은 절대 고르지 않는다', async () => {
  const data = { 'tinynote-1': { todos: [{ id: 'a' }] }, 'tinynote-2': { notes: '메모' } };
  const label = await findSlot({ prefix: 'tinynote-', openLabels: ['tinynote-3'], getData: store(data), mode: 'empty-only' });
  assert.equal(label, 'tinynote-4');
});

test('꺼내기: 모든 닫힌 슬롯에 내용이 있으면 null', async () => {
  const data = {};
  for (let i = 1; i <= 10; i++) data[`tinynote-${i}`] = { notes: `메모 ${i}` };
  const label = await findSlot({ prefix: 'tinynote-', openLabels: [], getData: store(data), mode: 'empty-only' });
  assert.equal(label, null);
});

test('열린 창 10개면 한도 도달', () => {
  const open = Array.from({ length: 10 }, (_, i) => `note-${i + 1}`);
  assert.equal(countOpenSlots('note-', open), 10);
  assert.equal(isSlotLimitReached('note-', open), true);
  assert.equal(isSlotLimitReached('tinynote-', open), false);
});

test('노트 창 옵션: 저장값 우선, 위치가 없으면 중앙 배치 (5.0.0 값 유지)', () => {
  assert.deepEqual(noteWindowOptions('note-2', undefined), {
    url: 'index.html', title: 'Tidy Task Note 2', width: 380, height: 500,
    decorations: false, transparent: true, visible: false, center: true,
  });
  const saved = noteWindowOptions('note-7', { windowWidth: 410.6, windowHeight: 520.2, windowPosX: 10.4, windowPosY: 20.6 });
  assert.equal(saved.width, 411);
  assert.equal(saved.height, 520);
  assert.equal(saved.x, 10);
  assert.equal(saved.y, 21);
  assert.equal('center' in saved, false);
});

test('Tiny Note 옵션: 롤업이면 높이 35, 최소 폭 200 (5.0.0 값 유지)', () => {
  const normal = tinyNoteWindowOptions('tinynote-1', undefined);
  assert.equal(normal.width, 250);
  assert.equal(normal.height, 280);
  assert.equal(normal.minWidth, 200);
  assert.equal(normal.minHeight, 45);
  assert.equal(normal.maximizable, false);
  assert.equal('x' in normal, false);

  const rolled = tinyNoteWindowOptions('tinynote-2', { isRolledUp: true, windowWidth: 260, windowHeight: 400 });
  assert.equal(rolled.width, 260);
  assert.equal(rolled.height, 35);
  assert.equal(rolled.minHeight, 35);
});

test('꺼낸 메모 데이터: 테마 정규화 + 기본 크기 명시', () => {
  const data = archivedNoteToWindowData({ title: 't', content: '<b>x</b>', themeColor: 'pistachio', isDarkMode: false });
  assert.equal(data.themeColor, 'amber'); // Tiny Note에 없는 테마는 기본값
  assert.equal(data.windowWidth, 250);
  assert.equal(data.windowHeight, 280);
  assert.deepEqual(data.todos, []);
  assert.equal(archivedNoteToWindowData({ themeColor: 'tiny-dark' }).isDarkMode, true);
});
