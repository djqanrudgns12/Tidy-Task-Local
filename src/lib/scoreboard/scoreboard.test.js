import test from 'node:test';
import assert from 'node:assert/strict';
import { ranks, badges, newLeaders } from './ranking.js';
import { fitGrid, densityOf, cardMetrics, fitClusters } from './layout.js';
import { parseStep, chipsFor, signed, scoreText } from './steps.js';
import { parseItems, itemIssues, TEMPLATES } from './items.js';
import { cardsFor, clusters } from './personal.js';
import {
  personalAdjust, personalReset, personalUndo, groupAdjust, setGroupCount, removeGroup, updateGroup,
  createBoard, deleteBoard, duplicateBoard, setBoardItems, boardAdjust, boardReset, customUndo, openBoard,
} from './boards.js';
import { normalizeGroup, normalizeCustom, normalizePersonal, normalizeShared, defaultCustom, clampScore, LIMITS } from './model.js';

test('competition ranks share places', () => {
  assert.deepEqual(ranks([5, 3, 3, 1]), [1, 2, 2, 4]);
});

test('badges follow PRD 6.4 table', () => {
  assert.deepEqual(badges(Array(30).fill(0)), Array(30).fill(0));
  const oneAhead = [1, ...Array(29).fill(0)];
  assert.deepEqual(badges(oneAhead), [1, ...Array(29).fill(0)]);
  assert.deepEqual(badges([5, 3, 3, 0, 0]), [1, 2, 2, 0, 0]);
  const crowded = [...Array(20).fill(5), ...Array(10).fill(4)];
  assert.deepEqual(badges(crowded), Array(30).fill(0));
  assert.deepEqual(badges([7]), [0]);
  assert.deepEqual(badges([4, 2, 9, 1]), [2, 3, 1, 0]);
  assert.deepEqual(newLeaders(['a', 'b'], [1, 2], [2, 1]), ['b']);
});

test('grid picks the biggest cards (PRD 6.1 expectations)', () => {
  const pick = (/** @type {number} */ n) => { const g = fitGrid(n, 1400, 760); return `${g.cols}x${g.rows}`; };
  assert.equal(pick(6), '3x2');
  assert.equal(pick(4), '2x2');
  assert.equal(pick(12), '4x3');
  assert.equal(pick(30), '6x5');
  assert.equal(pick(40), '8x5');
  assert.equal(pick(1), '1x1');
  assert.equal(fitGrid(40, 1400, 760).scroll, false);
  const many = fitGrid(120, 700, 400);
  assert.equal(many.scroll, true);
  assert.equal(many.cardH, 96);
});

test('score digits stay big enough to read from the back of the room', () => {
  // 1440×888 창: 판 크기 약 1400×760
  const g30 = fitGrid(30, 1400, 760);
  const m30 = cardMetrics(g30.cardW, g30.cardH, densityOf(g30.cardH), 2);
  assert.equal(m30.mode, 'side');
  assert.ok(m30.scoreFont >= 56, `30명 ${m30.scoreFont}px`);
  const g6 = fitGrid(6, 1400, 760);
  const m6 = cardMetrics(g6.cardW, g6.cardH, densityOf(g6.cardH), 2);
  assert.equal(m6.mode, 'bottom');
  assert.ok(m6.scoreFont >= 160, `6모둠 ${m6.scoreFont}px`);
  // 긴 수는 폭에 맞춰 줄어듭니다.
  assert.ok(cardMetrics(160, 140, 'normal', 6).scoreFont < cardMetrics(160, 140, 'normal', 2).scoreFont);
  // 모아 보기: 묶음 제목 자리를 빼고도 스크롤 없이
  const c = fitClusters([5, 5, 5, 5, 5, 4], 1400, 760);
  assert.equal(c.scroll, false);
  assert.ok(c.cols >= 5);
});

test('density switches with hysteresis', () => {
  assert.equal(densityOf(221), 'wide');
  assert.equal(densityOf(215, 'wide'), 'wide');
  assert.equal(densityOf(210, 'wide'), 'normal');
  assert.equal(densityOf(135, 'tight'), 'tight');
  assert.equal(densityOf(140, 'tight'), 'normal');
  assert.equal(densityOf(100), 'tight');
});

test('steps parse and render', () => {
  assert.equal(parseStep('15'), 15);
  assert.equal(parseStep('５'), 5);
  for (const bad of ['0', '1000', '3.5', '-2', '', 'a']) assert.equal(parseStep(bad), null);
  assert.deepEqual(chipsFor(15), [1, 2, 5, 10, 15]);
  assert.deepEqual(chipsFor(5), [1, 2, 5, 10]);
  assert.equal(signed(-3), '−3');
  assert.equal(scoreText(-12), '−12');
  assert.equal(scoreText(7), '7');
});

test('items parse from lines, a tab row, or commas', () => {
  assert.deepEqual(parseItems('청팀\n백팀\r\n\n  홍팀 '), ['청팀', '백팀', '홍팀']);
  assert.deepEqual(parseItems('1모둠\t2모둠\t3모둠'), ['1모둠', '2모둠', '3모둠']);
  assert.deepEqual(parseItems('가, 나 ,다'), ['가', '나', '다']);
  assert.deepEqual(parseItems('   \n'), []);
  const issues = itemIssues(['가'.repeat(17), '나', '나', ...Array.from({ length: 40 }, (_, i) => `${i}`)]);
  assert.equal(issues.errors.length, 1);
  assert.deepEqual(issues.long, [0]);
  assert.deepEqual(issues.duplicates, ['나']);
  assert.equal(itemIssues([]).errors.length, 1);
  assert.equal(TEMPLATES.find((t) => t.id === 'numbers')?.make(3).join(','), '1번,2번,3번');
});

const classroom = {
  id: 'c1',
  name: '3학년 2반',
  groups: [{ id: 'g1', name: '1모둠' }, { id: 'g2', name: '2모둠' }],
  students: [
    { id: 's3', number: 3, name: '김하나', groupId: 'g2' },
    { id: 's1', number: 1, name: '김하나', groupId: 'g1' },
    { id: 's2', number: 2, name: '이두리', groupId: null },
  ],
};

test('personal cards follow roster order, ids and groups', () => {
  const cards = cardsFor(classroom, { s1: 5, gone: 9 }, { showNumber: false, groupColors: true });
  assert.deepEqual(cards.map((c) => c.id), ['s1', 's2', 's3']);
  assert.deepEqual(cards.map((c) => c.score), [5, 0, 0]);
  // 동명이인은 번호 표시를 꺼도 번호를 붙입니다.
  assert.deepEqual(cards.map((c) => c.showNumber), [true, false, true]);
  assert.deepEqual(cards.map((c) => c.color), ['strawberry', null, 'peach']);
  const renamed = { ...classroom, students: classroom.students.map((s) => (s.id === 's1' ? { ...s, name: '새이름' } : s)) };
  assert.equal(cardsFor(renamed, { s1: 5 }, { showNumber: true, groupColors: true })[0].score, 5);
  const grouped = clusters(cards, classroom.groups);
  assert.deepEqual(grouped.map((g) => g.name), ['1모둠', '2모둠', '모둠 없음']);
  assert.deepEqual(cardsFor(null, {}, { showNumber: true, groupColors: true }), []);
});

test('personal scores adjust, reset and undo per class', () => {
  let d = normalizePersonal(undefined);
  d = personalAdjust(d, 'c1', ['s1', 's2'], 5);
  d = personalAdjust(d, 'c2', ['x'], -3);
  assert.deepEqual(d.classes.c1.scores, { s1: 5, s2: 5 });
  const undo = personalUndo('c1');
  const before = undo.pick(d);
  const reset = personalReset(d, 'c1');
  assert.deepEqual(reset.classes.c1.scores, {});
  assert.deepEqual(reset.classes.c2.scores, { x: -3 });
  assert.deepEqual(undo.put(reset, before).classes.c1.scores, { s1: 5, s2: 5 });
  assert.equal(personalAdjust(d, 'c1', ['s1'], 10 ** 9).classes.c1.scores.s1, LIMITS.score);
});

test('group count grows with free names/colors and shrinks from the end', () => {
  let d = normalizeGroup(undefined);
  assert.equal(d.groups.length, 6);
  d = removeGroup(d, d.groups[2].id);
  assert.deepEqual(d.groups.map((g) => g.name), ['1모둠', '2모둠', '4모둠', '5모둠', '6모둠']);
  d = setGroupCount(d, 6);
  assert.equal(d.groups[5].name, '3모둠');
  assert.equal(new Set(d.groups.map((g) => g.color)).size, 6);
  assert.equal(new Set(d.groups.map((g) => g.symbol)).size, 6);
  assert.equal(setGroupCount(d, 1).groups.length, 2);
  assert.equal(setGroupCount(d, 99).groups.length, 12);
  d = groupAdjust(d, [d.groups[0].id], 3);
  assert.equal(d.groups[0].score, 3);
  d = updateGroup(d, d.groups[0].id, { name: '  ', color: 'mint', symbol: 'nope' });
  assert.equal(d.groups[0].name, '1모둠');
  assert.equal(d.groups[0].color, 'mint');
  assert.equal(d.groups[0].symbol, 'star');
  const two = setGroupCount(d, 2);
  assert.equal(removeGroup(two, two.groups[0].id).groups.length, 2);
});

test('custom boards: create, keep scores by id, delete and undo in place', () => {
  let d = defaultCustom();
  d = createBoard(d, { title: '퀴즈 대회', names: ['청팀', '백팀'], startScore: 10 }, 1);
  const board = d.boards[0];
  assert.equal(d.lastBoardId, board.id);
  assert.deepEqual(board.items.map((i) => i.score), [10, 10]);
  d = boardAdjust(d, board.id, [board.items[1].id], 5);
  // 순서 바꾸고 새 항목 추가 → 기존 점수 유지, 새 항목은 시작 점수
  d = setBoardItems(d, board.id, [{ id: board.items[1].id, name: '백팀' }, { name: '홍팀' }, { id: board.items[0].id, name: '파랑팀' }]);
  assert.deepEqual(d.boards[0].items.map((i) => [i.name, i.score]), [['백팀', 15], ['홍팀', 10], ['파랑팀', 10]]);
  d = createBoard(d, { title: '', names: ['가'], startScore: 0 }, 2);
  assert.equal(d.boards[1].title, '새 점수판');
  const undo = customUndo(board.id);
  const snap = undo.pick(d);
  const gone = deleteBoard(d, board.id);
  assert.equal(gone.boards.length, 1);
  assert.equal(gone.lastBoardId, d.boards[1].id);
  const back = undo.put(gone, snap);
  assert.deepEqual(back.boards.map((/** @type {any} */ b) => b.id), d.boards.map((b) => b.id));
  assert.equal(back.lastBoardId, board.id);
  assert.deepEqual(boardReset(back, board.id).boards[0].items.map((/** @type {any} */ i) => i.score), [10, 10, 10]);
  const dup = duplicateBoard(back, board.id, 3);
  assert.equal(dup.boards.length, 3);
  assert.notEqual(dup.boards[2].items[0].id, back.boards[0].items[0].id);
  assert.equal(openBoard(dup, 'nope'), dup);
  // 12개 제한
  let full = defaultCustom();
  for (let i = 0; i < 13; i++) full = createBoard(full, { title: `${i}`, names: ['a'], startScore: 0 }, i);
  assert.equal(full.boards.length, LIMITS.boards);
});

test('normalize repairs bad values and keeps good ones', () => {
  const group = normalizeGroup({ groups: [{ id: 'a', name: 'x'.repeat(30), color: 'plaid', score: 1e9 }, { id: 'a' }] });
  assert.equal(group.groups.length, 2);
  assert.equal(group.groups[0].name.length, 10);
  assert.equal(group.groups[0].color, 'strawberry');
  assert.equal(group.groups[0].score, LIMITS.score);
  const custom = normalizeCustom({ lastBoardId: 'gone', boards: [{ id: 'b', title: '판', items: [{ id: 'i', name: '가', score: 'x' }] }, { id: 'e', items: [] }] });
  assert.equal(custom.boards.length, 1);
  assert.equal(custom.lastBoardId, 'b');
  assert.equal(custom.boards[0].items[0].score, 0);
  assert.deepEqual(normalizeShared({ volume: 300, sound: 'yes' }), { sound: true, volume: 70, reduced: false });
  assert.equal(clampScore(-1e9), -LIMITS.score);
  const personal = normalizePersonal({ prefs: { step: 0, showNumber: false }, classes: { c: { scores: { s: 3, bad: 'x' } } } });
  assert.equal(personal.prefs.step, 1);
  assert.equal(personal.prefs.showNumber, false);
  assert.deepEqual(personal.classes.c.scores, { s: 3 });
});
