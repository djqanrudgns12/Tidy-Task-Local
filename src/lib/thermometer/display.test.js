import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplay, goalCards, goalPanel, displaySetKey, isInMini, showInMini, hideInMini, savedGeometry } from './display.js';
import { makeThermometer } from './model.js';

test('열람판은 기존 자료에 자동 생성되지 않고 잘못된 위치를 복원하지 않는다', () => {
  assert.equal(normalizeDisplay(undefined).autoOpen, false);
  assert.equal(normalizeDisplay({ geometry: { x: NaN, y: 0, width: 300, height: 300 } }).geometry, null);
  assert.equal(normalizeDisplay({ geometry: { x: 0, y: 0, width: -1, height: 300 } }).geometry, null);
  const saved = { autoOpen: true, rememberPosition: true, geometry: { x: -1200, y: 40, width: 420, height: 550 }, hiddenIds: ['second'] };
  assert.deepEqual(normalizeDisplay(saved).geometry, saved.geometry);
  assert.deepEqual(normalizeDisplay(saved).hiddenIds, ['second']);
});

test('28도에서는 50도에 집중하고 80도와 최종 목표를 다음으로 표시한다', () => {
  const t = { ...makeThermometer(), value: 28, max: 100, stages: [20,50,80].map(at => ({ id:String(at), at, label:String(at), reached:at===20 })) };
  let goals = goalCards(t);
  assert.equal(goals.current.at, 50);
  assert.deepEqual(goals.upcoming.map(s => s.at), [80,100]);
  assert.deepEqual(goals.achieved.map(s => s.at), [20]);
  goals = goalCards({ ...t, value: 10 });
  assert.equal(goals.current.at, 50, '이미 받은 보상은 온도를 내려도 다시 목표로 나오지 않는다');
  assert.equal(goalCards({ ...t, value:100, goalReached:true }).current, null);
  assert.equal(goalCards({ ...t, mood:'negative', value:10 }).current.at, 20, '경고는 현재 온도를 따른다');
});

test('목표 패널: 지금 목표 → 다음 목표(최종 목표 뺌) → 이미 달성(최근 것부터)', () => {
  const stages = [20,50,80].map(at => ({ id:String(at), at, label:String(at), reached:at===20 }));
  const t = { ...makeThermometer(), value: 28, max: 100, stages };
  const p = goalPanel(t);
  assert.equal(p.focus.at, 50);
  assert.equal(p.finished, false);
  assert.equal(p.remain, 22);
  assert.equal(p.progress, 0.56);
  assert.deepEqual(p.next.map(s => s.at), [80], '최종 목표 100은 위쪽 띠가 보여 주므로 빠진다');
  assert.deepEqual(p.done.map(s => s.at), [20]);
  const many = goalPanel({ ...t, value: 60, stages: [10,20,30,50,80].map(at => ({ id:String(at), at, label:'', reached:false })) });
  assert.deepEqual(many.done.map(s => s.at), [50,30,20,10], '달성은 최근(높은) 것부터');
  assert.deepEqual(goalPanel({ ...t, stages: [] }).focus.id, 'final-goal', '단계가 없으면 최종 목표가 지금 목표');
  assert.equal(goalPanel({ ...t, value: -5 }).progress, 0, '영하여도 진행 막대는 0에서 멈춘다');
});

test('끝까지 가면 최종 목표를 달성 상태로 맨 위에 두고, 달성 목록에는 다시 넣지 않는다', () => {
  const stages = [20,50,80].map(at => ({ id:String(at), at, label:'', reached:true }));
  const p = goalPanel({ ...makeThermometer(), value: 100, max: 100, goalReached: true, stages });
  assert.equal(p.finished, true);
  assert.equal(p.focus.id, 'final-goal');
  assert.equal(p.progress, 1);
  assert.equal(p.remain, 0);
  assert.deepEqual(p.done.map(s => s.at), [80,50,20]);
  assert.deepEqual(p.next, []);
});

test('미니 온도계 토글은 창이 떠 있고 같은 반·숨기지 않은 온도계일 때만 켜짐이다', () => {
  const data = { sets: { a: {}, b: {} }, lastSetKey: 'b' };
  const prefs = normalizeDisplay({ setKey: 'a', autoOpen: true, hiddenIds: ['t2'] });
  assert.equal(isInMini(prefs, data, { open: true, setKey: 'a', id: 't1' }), true);
  assert.equal(isInMini(prefs, data, { open: false, setKey: 'a', id: 't1' }), false, '미니 창 ✕로 닫으면 자동 열기가 남아도 꺼짐');
  assert.equal(isInMini(prefs, data, { open: true, setKey: 'a', id: 't2' }), false, '숨긴 온도계는 꺼짐');
  assert.equal(isInMini(prefs, data, { open: true, setKey: 'b', id: 't1' }), false, '다른 반을 보여 주는 중이면 꺼짐');
  const lost = normalizeDisplay({ setKey: 'gone' });
  assert.equal(displaySetKey(lost, data), 'b', '지워진 반이면 마지막 반을 보여 준다');
  assert.equal(isInMini(lost, data, { open: true, setKey: 'b', id: 't1' }), true);
});

test('토글을 켜면 새로 띄울 때는 누른 온도계만, 이미 보이는 반이면 하나만 더 보인다', () => {
  const d = normalizeDisplay({ setKey: 'a', hiddenIds: ['x1', 't1'] });
  const fresh = showInMini(d, { setKey: 'b', id: 't1', ids: ['t1', 't2'], showingThisSet: false });
  assert.equal(fresh.setKey, 'b');
  assert.deepEqual(fresh.hiddenIds, ['x1', 't2'], '다른 반 숨김(x1)은 유지, 누르지 않은 t2는 숨김');
  const more = showInMini({ ...fresh, hiddenIds: ['x1', 't2'] }, { setKey: 'b', id: 't2', ids: ['t1', 't2'], showingThisSet: true });
  assert.deepEqual(more.hiddenIds, ['x1']);
});

test('미니 온도계를 띄워도 자동 열기는 저절로 켜지지 않고, 직접 켠 값은 그대로 둔다', () => {
  const target = { setKey: 'a', id: 't1', ids: ['t1', 't2'], showingThisSet: false };
  assert.equal(showInMini(normalizeDisplay(undefined), target).autoOpen, false, '처음 띄울 때');
  assert.equal(showInMini(normalizeDisplay({ autoOpen: false }), { ...target, showingThisSet: true }).autoOpen, false, '하나 더 띄울 때');
  assert.equal(showInMini(normalizeDisplay({ autoOpen: true }), target).autoOpen, true, '설정에서 직접 켠 값은 유지');
});

test('위치·크기는 "함께 열기"를 켠 동안에만 되돌린다(토글 하나)', () => {
  const geometry = { x: 40, y: 60, width: 400, height: 560 };
  assert.deepEqual(savedGeometry(normalizeDisplay({ autoOpen: true, geometry })), geometry);
  assert.equal(savedGeometry(normalizeDisplay({ autoOpen: false, geometry })), null, '꺼 두면 기본 자리');
  assert.equal(savedGeometry(normalizeDisplay({ autoOpen: true })), null, '아직 기억한 자리가 없음');
  assert.deepEqual(savedGeometry(normalizeDisplay({ autoOpen: true, rememberPosition: false, geometry })), geometry, '예전의 따로 있던 "위치 기억" 값은 보지 않는다');
  assert.equal('rememberPosition' in normalizeDisplay({ rememberPosition: true }), false);
});

test('앱 전체의 자동 실행 선택(windowsStart)은 미니 온도계 설정을 바꿔도 지워지지 않는다', () => {
  const target = { setKey: 'a', id: 't1', ids: ['t1'], showingThisSet: false };
  assert.equal(showInMini(normalizeDisplay({ windowsStart: false }), target).windowsStart, false);
  assert.equal(hideInMini(normalizeDisplay({ windowsStart: true }), { id: 't1', ids: ['t1'] }).next.windowsStart, true);
  assert.equal(normalizeDisplay({}).windowsStart, null, '고른 적 없음');
});

test('토글을 끄다 마지막 하나까지 끄면 창을 닫고 자동 열기도 끈다', () => {
  const d = normalizeDisplay({ setKey: 'a', autoOpen: true, hiddenIds: [] });
  const first = hideInMini(d, { id: 't1', ids: ['t1', 't2'] });
  assert.equal(first.close, false);
  assert.equal(first.next.autoOpen, true);
  assert.deepEqual(first.next.hiddenIds, ['t1']);
  const last = hideInMini(first.next, { id: 't2', ids: ['t1', 't2'] });
  assert.equal(last.close, true);
  assert.equal(last.next.autoOpen, false);
  assert.deepEqual(hideInMini(first.next, { id: 't1', ids: ['t1', 't2'] }).next.hiddenIds, ['t1'], '같은 id를 두 번 넣지 않는다');
});
