import test from 'node:test';
import assert from 'node:assert/strict';
import { newDraft } from './model.js';
import { checkRules, josa, seatLabeler } from './ruleCheck.js';

const students = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, number: i + 1, name: ['김하늘', '이서아', '박도윤', '최지우'][i % 4] + i, gender: 'unspecified', groupId: null }));
/** 둘씩 앉기 6열 × 4줄: 앞 두 줄은 앞쪽, 뒤 두 줄은 뒤쪽입니다. */
function setup() {
  // newDraft의 빈 rules 배열이 never[]로 잡히지 않게 Draft 타입을 붙입니다.
  const draft = /** @type {import('./types').Draft} */ (newDraft(students.length));
  const seat = (/** @type {number} */ row, /** @type {number} */ col) => draft.layout.seats[row * 6 + col].id;
  return { draft, seat };
}
const preset = (/** @type {string} */ studentId, /** @type {string} */ seatId) => ({ id: `zone-${studentId}`, kind: 'zone', students: [studentId], seatIds: [seatId] });

test('자리 이름은 배치도 가장자리 번호와 같게 "줄·번째"로 부릅니다', () => {
  const { draft, seat } = setup();
  assert.equal(seatLabeler(draft.layout)(seat(1, 2)), '2줄 3번째');
});

test('조사는 이름 끝 받침을 따릅니다', () => {
  assert.equal(josa('김하늘', '이', '가'), '김하늘이');
  assert.equal(josa('이서아', '이', '가'), '이서아가');
  assert.equal(josa('교실', '으로', '로'), '교실로');
  assert.equal(josa('Tom', '은', '는'), 'Tom는');
});

test('사전 지정 학생은 조건 목록의 지정 자리 묶음에 번호순으로 들어갑니다', () => {
  const { draft, seat } = setup();
  draft.rules.push(preset('p5', seat(0, 0)), preset('p1', seat(3, 5)), { id: 'lock', kind: 'fixed', students: ['p2'], seatId: seat(2, 2) });
  const { pins } = checkRules(draft, students);
  assert.deepEqual(pins.map(p => [p.studentId, p.source, p.label]), [['p1', 'preset', '4줄 6번째'], ['p5', 'preset', '1줄 1번째'], ['p2', 'fixed', '3줄 3번째']]);
});

test('앞쪽 조건: 지정 자리가 앞쪽이면 이미 지켜지고, 뒤쪽이면 부딪힙니다', () => {
  const { draft, seat } = setup();
  draft.rules.push(preset('p0', seat(0, 1)), preset('p1', seat(3, 1)),
    { id: 'f0', kind: 'front', students: ['p0'] }, { id: 'f1', kind: 'front', students: ['p1'] }, { id: 'f2', kind: 'front', students: ['p2'] });
  const { rules, conflictCount } = checkRules(draft, students);
  assert.equal(rules.get('f0')?.status, 'covered');
  assert.equal(rules.get('f1')?.status, 'conflict');
  assert.match(rules.get('f1')?.message || '', /사전 지정 자리\(4줄 2번째\)가 뒤쪽이라/);
  assert.equal(rules.get('f1')?.studentId, 'p1');
  assert.equal(rules.get('f2')?.status, 'free');
  assert.equal(conflictCount, 1);
});

test('두 학생이 모두 지정되면 지정 자리만 보고 판정합니다', () => {
  const { draft, seat } = setup();
  draft.rules.push(preset('p0', seat(0, 0)), preset('p1', seat(0, 1)), preset('p2', seat(3, 5)),
    { id: 'tog', kind: 'together', students: ['p0', 'p1'], distance: 'pair' },
    { id: 'apart', kind: 'apart', students: ['p0', 'p1'], distance: 'far' },
    { id: 'far', kind: 'apart', students: ['p0', 'p2'], distance: 'far' });
  const { rules } = checkRules(draft, students);
  assert.equal(rules.get('far')?.status, 'covered');
  // 짝끼리 함께 앉기와 떨어져 앉기는 조건끼리 모순이라 둘 다 표시합니다.
  assert.equal(rules.get('tog')?.status, 'conflict');
  assert.equal(rules.get('apart')?.status, 'conflict');
});

test('한 학생만 지정되면 다른 학생이 그 자리를 기준으로 앉고, 짝 자리가 막히면 부딪힙니다', () => {
  const { draft, seat } = setup();
  draft.rules.push(preset('p0', seat(0, 0)), { id: 'tog', kind: 'together', students: ['p0', 'p1'], distance: 'pair' });
  let result = checkRules(draft, students);
  assert.equal(result.rules.get('tog')?.status, 'anchored');
  assert.match(result.rules.get('tog')?.message || '', /^이서아1는 김하늘0의 사전 지정 자리\(1줄 1번째\) 곁에 짝으로 앉아요/);
  draft.rules.push(preset('p3', seat(0, 1)));
  result = checkRules(draft, students);
  assert.equal(result.rules.get('tog')?.status, 'conflict');
  assert.match(result.rules.get('tog')?.message || '', /짝으로 앉을 빈자리가 없어요/);
});

test('같은 조건을 두 번 넣으면 뒤의 것을 중복으로, 앞·뒤쪽을 함께 넣으면 모순으로 봅니다', () => {
  const { draft } = setup();
  draft.rules.push({ id: 'a', kind: 'apart', students: ['p0', 'p1'], distance: 'near' }, { id: 'b', kind: 'apart', students: ['p1', 'p0'], distance: 'near' },
    { id: 'f', kind: 'front', students: ['p4'] }, { id: 'k', kind: 'back', students: ['p4'] });
  const { rules } = checkRules(draft, students);
  assert.equal(rules.get('a')?.status, 'free');
  assert.equal(rules.get('b')?.status, 'duplicate');
  assert.equal(rules.get('f')?.status, 'conflict');
  assert.equal(rules.get('k')?.status, 'conflict');
});

test('모둠 기준 함께 앉기와 짝 기준 떨어져 앉기는 함께 지킬 수 있습니다', () => {
  const { draft } = setup();
  draft.rules.push({ id: 't', kind: 'together', students: ['p0', 'p1'], distance: 'group' }, { id: 'a', kind: 'apart', students: ['p0', 'p1'], distance: 'pair' });
  const { rules } = checkRules(draft, students);
  assert.equal(rules.get('t')?.status, 'free');
  assert.equal(rules.get('a')?.status, 'free');
});

test('사전 지정 자리를 다른 학생이 자리 유지로 차지하면 그 지정에 문제를 표시합니다', () => {
  const { draft, seat } = setup();
  draft.rules.push(preset('p0', seat(1, 1)), { id: 'lock', kind: 'fixed', students: ['p1'], seatId: seat(1, 1) });
  const { pins, conflictCount } = checkRules(draft, students);
  assert.match(pins.find(p => p.studentId === 'p0')?.issue || '', /^이서아1가 자리 유지로/);
  assert.equal(conflictCount, 1);
});

test('부딪히는 조건을 한 번 더 넣으면 사본은 중복으로만 보고, 부딪힘은 원본에 한 번만 셉니다', () => {
  const { draft, seat } = setup();
  draft.rules.push(preset('p0', seat(0, 0)), preset('p1', seat(0, 1)),
    { id: 'a', kind: 'together', students: ['p2', 'p0'], distance: 'pair' }, { id: 'b', kind: 'together', students: ['p2', 'p0'], distance: 'pair' });
  const { rules, conflictCount } = checkRules(draft, students);
  assert.equal(rules.get('a')?.status, 'conflict');
  assert.equal(rules.get('b')?.status, 'duplicate');
  assert.equal(conflictCount, 1);
});
