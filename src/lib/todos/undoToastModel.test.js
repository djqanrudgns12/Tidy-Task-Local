// @ts-nocheck — 가짜 DOM·시간·간단한 고정 자료로 경계값을 검사하는 테스트라 타입 검사에서 뺍니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNDO_DONE_MS,
  UNDO_TOAST_MS,
  UNDO_TOAST_RESUME_MIN_MS,
  createUndoToastModel,
  describeToast,
} from './undoToastModel.js';

function harness() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const changes = [];
  const model = createUndoToastModel({
    now: () => now,
    setTimer(fn, ms) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer(id) { timers.delete(id); },
    onChange: (s) => changes.push(s),
  });
  return {
    model,
    changes,
    get pending() { return timers.size; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

const entry = (over = {}) => ({ record: { id: Math.random() }, kind: 'todo', count: 1, title: '숙제', ddayEffect: null, ...over });

test('뜨면 6초 뒤 사라진다(경계값)', () => {
  const h = harness();
  h.model.offer(entry());
  assert.equal(h.model.state.phase, 'shown');
  h.advance(UNDO_TOAST_MS - 1);
  assert.equal(h.model.state.phase, 'shown');
  h.advance(1);
  assert.equal(h.model.state.phase, 'hidden');
  assert.equal(h.model.state.entries.length, 0);
  assert.equal(h.pending, 0);
});

test('떠 있는 중 또 지우면 합치고 시간을 처음부터 센다', () => {
  const h = harness();
  h.model.offer(entry());
  const group = h.model.state.group;
  h.advance(5000);
  h.model.offer(entry({ title: '두 번째' }));
  assert.equal(h.model.state.group, group);
  assert.equal(h.model.state.bump, 1);
  assert.equal(h.model.records().length, 2);
  h.advance(UNDO_TOAST_MS - 1);
  assert.equal(h.model.state.phase, 'shown');
  h.advance(1);
  assert.equal(h.model.state.phase, 'hidden');
});

test('멈췄다가 다시 갈 때 남은 시간이 짧으면 최소 2초를 보장한다', () => {
  const h = harness();
  h.model.offer(entry());
  h.advance(5000);
  h.model.pause('hover');
  assert.equal(h.model.state.paused, true);
  assert.equal(h.model.state.remainingMs, 1000);
  h.advance(60_000);
  assert.equal(h.model.state.phase, 'shown');
  h.model.resume('hover');
  h.advance(UNDO_TOAST_RESUME_MIN_MS - 1);
  assert.equal(h.model.state.phase, 'shown');
  h.advance(1);
  assert.equal(h.model.state.phase, 'hidden');
});

test('남은 시간이 넉넉하면 그만큼 이어서 간다', () => {
  const h = harness();
  h.model.offer(entry());
  h.advance(1000);
  h.model.pause('focus');
  h.model.resume('focus');
  h.advance(UNDO_TOAST_MS - 1000 - 1);
  assert.equal(h.model.state.phase, 'shown');
  h.advance(1);
  assert.equal(h.model.state.phase, 'hidden');
});

test('멈춤 이유가 여럿이면 모두 풀려야 다시 간다', () => {
  const h = harness();
  h.model.offer(entry());
  h.model.pause('hover');
  h.model.pause('hidden');
  h.model.resume('hover');
  h.advance(UNDO_TOAST_MS * 3);
  assert.equal(h.model.state.phase, 'shown');
  h.model.resume('hidden');
  h.advance(UNDO_TOAST_MS);
  assert.equal(h.model.state.phase, 'hidden');
});

test('없던 이유로 resume해도 아무 일 없다', () => {
  const h = harness();
  h.model.offer(entry());
  h.model.resume('hover');
  assert.equal(h.model.state.paused, false);
  h.advance(UNDO_TOAST_MS);
  assert.equal(h.model.state.phase, 'hidden');
});

test('마우스를 올린 채 알림이 사라져도 다음 알림은 멈추지 않고 간다', () => {
  const h = harness();
  h.model.offer(entry());
  h.model.pause('hover');
  h.model.dismiss();
  h.model.offer(entry());
  assert.equal(h.model.state.paused, false);
  h.advance(UNDO_TOAST_MS);
  assert.equal(h.model.state.phase, 'hidden');
});

test('창이 숨은 동안 뜬 알림은 멈춘 채로 기다린다', () => {
  const h = harness();
  h.model.pause('hidden');
  h.model.offer(entry());
  assert.equal(h.model.state.paused, true);
  h.advance(UNDO_TOAST_MS * 2);
  assert.equal(h.model.state.phase, 'shown');
  h.model.resume('hidden');
  h.advance(UNDO_TOAST_MS);
  assert.equal(h.model.state.phase, 'hidden');
});

test('되돌림: 1.4초 보여 준 뒤 닫히고, 그사이 새 삭제는 새 묶음', () => {
  const h = harness();
  h.model.offer(entry());
  const group = h.model.state.group;
  h.model.markRestored({ restored: 1, skipped: 0 });
  assert.equal(h.model.state.phase, 'restored');
  h.advance(UNDO_DONE_MS - 1);
  assert.equal(h.model.state.phase, 'restored');
  h.model.offer(entry());
  assert.equal(h.model.state.phase, 'shown');
  assert.equal(h.model.state.group, group + 1);
  assert.equal(h.model.records().length, 1);
});

test('되돌림은 떠 있을 때만, 두 번 눌러도 한 번', () => {
  const h = harness();
  h.model.markRestored({ restored: 1, skipped: 0 });
  assert.equal(h.model.state.phase, 'hidden');
  h.model.offer(entry());
  h.model.markRestored({ restored: 1, skipped: 0 });
  const after = h.changes.length;
  h.model.markRestored({ restored: 1, skipped: 0 });
  assert.equal(h.changes.length, after);
  h.advance(UNDO_DONE_MS);
  assert.equal(h.model.state.phase, 'hidden');
});

test('dismiss는 즉시 닫고 타이머를 남기지 않는다', () => {
  const h = harness();
  h.model.offer(entry());
  h.model.dismiss();
  assert.equal(h.model.state.phase, 'hidden');
  assert.equal(h.pending, 0);
});

// ── 문구 ──
const shown = (entries) => ({ phase: 'shown', entries, result: null });

test('문구: 한 개는 제목만 따옴표로, 여러 개는 개수', () => {
  assert.deepEqual(describeToast(shown([entry({ title: '숙제' })])), { title: '지웠어요', sub: null, quoted: '숙제' });
  assert.equal(describeToast(shown([entry(), entry(), entry()])).title, '할 일 3개를 지웠어요');
  assert.equal(describeToast(shown([entry({ kind: 'archived' }), entry({ kind: 'archived' })])).title, '마감된 일 2개를 지웠어요');
  assert.equal(describeToast(shown([entry(), entry({ kind: 'archived' })])).title, '2개를 지웠어요');
  assert.equal(describeToast(shown([entry({ kind: 'archived', title: '끝난 일' })])).quoted, '끝난 일');
});

test('문구: 마감된 일 전체 비우기', () => {
  assert.equal(describeToast(shown([entry({ kind: 'archived-all', count: 9 })])).title, '마감된 일 9개를 비웠어요');
  assert.equal(describeToast(shown([entry({ kind: 'archived-all', count: 9 }), entry({ kind: 'archived' })])).title, '마감된 일 10개를 지웠어요');
  assert.equal(describeToast(shown([entry({ kind: 'archived-all', count: 2 }), entry()])).title, '3개를 지웠어요');
});

test('문구: D-Day 둘째 줄 — 함께 지움이 남김보다 우선', () => {
  assert.equal(describeToast(shown([entry({ ddayEffect: 'kept' })])).sub, 'D-Day는 컨트롤 타워에 남겨 뒀어요');
  assert.equal(describeToast(shown([entry({ ddayEffect: 'deleted' })])).sub, '연결된 D-Day도 함께 지웠어요');
  assert.equal(describeToast(shown([entry({ ddayEffect: 'kept' }), entry({ ddayEffect: 'deleted' })])).sub, '연결된 D-Day도 함께 지웠어요');
});

test('문구: 되돌림 결과', () => {
  const restored = (r) => describeToast({ phase: 'restored', entries: [], result: r });
  assert.equal(restored({ restored: 1, skipped: 0 }).title, '되돌렸어요!');
  assert.deepEqual(restored({ restored: 1, skipped: 2 }), { title: '3개 중 1개를 되돌렸어요', sub: '나머지는 이미 돌아와 있어요', quoted: null });
  assert.equal(restored({ restored: 0, skipped: 1 }).title, '이미 돌아와 있어요');
});
