import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkitDragMachine, CLICK_SUPPRESS_GRACE_MS } from './dragMachine.js';

/** @param {{ native?: boolean }} [overrides] */
function createHarness(overrides = {}) {
  /** @type {Array<{ cmd: string, payload: any, resolve: (v: any) => void, reject: (e: any) => void }>} */
  const invokes = [];
  /** @type {Map<string, Array<(ev: { payload: any }) => void>>} */
  const listeners = new Map();
  /** @type {Array<{ id: number, fn: () => void, ms: number, cleared: boolean }>} */
  const timers = [];
  /** @type {Array<{ id: number, fn: () => void, cancelled: boolean }>} */
  const frames = [];
  let nextTimerId = 1;
  let nextFrameId = 1;
  let clock = 100;
  /** @type {Array<{ token: number, pointerType: string }>} */
  const starts = [];
  /** @type {Array<import('./dragMachine.js').DragEndEvent>} */
  const ends = [];
  /** @type {unknown[]} */
  const errors = [];

  const machine = createToolkitDragMachine({
    native: overrides.native ?? true,
    now: () => clock,
    invoke: (cmd, payload) =>
      new Promise((resolve, reject) => {
        invokes.push({ cmd, payload, resolve, reject });
      }),
    listen: async (event, cb) => {
      const list = listeners.get(event) || [];
      list.push(cb);
      listeners.set(event, list);
      return () => {
        const cur = listeners.get(event) || [];
        listeners.set(event, cur.filter((x) => x !== cb));
      };
    },
    setTimeout: (fn, ms) => {
      const entry = { id: nextTimerId++, fn, ms, cleared: false };
      timers.push(entry);
      return entry.id;
    },
    clearTimeout: (id) => {
      const t = timers.find((x) => x.id === id);
      if (t) t.cleared = true;
    },
    requestAnimationFrame: (fn) => {
      const entry = { id: nextFrameId++, fn, cancelled: false };
      frames.push(entry);
      return entry.id;
    },
    cancelAnimationFrame: (id) => {
      const f = frames.find((x) => x.id === id);
      if (f) f.cancelled = true;
    },
    onDragStart: (info) => starts.push(info),
    onDragEnd: (payload) => ends.push(payload),
    onError: (err) => errors.push(err),
  });

  /** @param {string} event @param {any} payload */
  function emit(event, payload) {
    for (const cb of listeners.get(event) || []) cb({ payload });
  }
  function flushTimers() {
    for (const t of [...timers]) {
      if (!t.cleared) {
        t.cleared = true;
        t.fn();
      }
    }
  }
  function flushFrames() {
    for (const f of [...frames]) {
      if (!f.cancelled) {
        f.cancelled = true;
        f.fn();
      }
    }
  }
  async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
  }

  return {
    machine,
    invokes,
    starts,
    ends,
    errors,
    timers,
    frames,
    emit,
    flushTimers,
    flushFrames,
    flushMicrotasks,
    /** @param {number} ms */
    advanceClock(ms) {
      clock += ms;
    },
  };
}

test('클릭 vs 드래그 경계: 마우스 5px 미만은 클릭 허용·IPC 0회, 6px 이상은 단일 IPC 진입 및 클릭 차단', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  // 1) pointerdown 시 IPC 0회, 5px 이동 후 pointerup → 클릭 통과
  assert.deepEqual(
    h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 2 }),
    { capture: true },
  );
  assert.equal(h.invokes.length, 0);
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 37, clientY: 36, screenX: 537, screenY: 336 }), // hypot(4,3)=5
    { releaseCapture: false, started: false },
  );
  assert.equal(h.invokes.length, 0);
  h.machine.onPointerEnd({ pointerId: 1, cancelled: false });
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: false });
  assert.equal(h.starts.length, 0);

  // 2) 6px 도달 → 마우스 포인터 캡처 해제 + toolkit_start_drag 정확히 1회
  h.machine.onPointerDown({ pointerId: 2, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 2 });
  h.advanceClock(12);
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 2, buttons: 1, clientX: 39, clientY: 33, screenX: 539, screenY: 333 }), // dist=6
    { releaseCapture: true, started: true },
  );
  assert.equal(h.invokes.length, 1);
  assert.equal(h.invokes[0].cmd, 'toolkit_start_drag');
  assert.equal(h.invokes[0].payload.args.token, 1);
  assert.equal(h.invokes[0].payload.args.grabX, 33);
  assert.equal(h.invokes[0].payload.args.grabY, 33);
  assert.equal(h.invokes[0].payload.args.dpr, 2);
  assert.equal(h.starts.length, 1);

  // 추가 이동에도 중복 invoke 0회
  h.machine.onPointerMove({ pointerId: 2, buttons: 1, clientX: 60, clientY: 33, screenX: 560, screenY: 333 });
  assert.equal(h.invokes.length, 1);

  // 종료 뒤 직후 버튼 위 합성 click은 1회 차단, 그다음 정상 클릭은 통과
  h.emit('toolkit-drag-end', { token: 1, moved: true, cancelled: false, reason: 'released', geometry: { physicalX: 600, physicalY: 300, outerWidth: 66, outerHeight: 66, scaleFactor: 1 } });
  assert.equal(h.ends.length, 1);
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: true });
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: false });
});

test('C1 토큰 경합: toolkit-drag-end 이벤트가 invoke 응답보다 먼저 도착해도 고착 없이 1회만 멱등 종료한다', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 30, clientY: 30, screenX: 530, screenY: 330, pointerType: 'mouse', dpr: 1 });
  h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 40, clientY: 30, screenX: 540, screenY: 330 });

  // invoke가 아직 pending인 상태에서 drag-end 이벤트가 먼저 도착!
  h.emit('toolkit-drag-end', {
    token: 1,
    moved: true,
    cancelled: false,
    reason: 'released',
    geometry: { physicalX: 610, physicalY: 300, outerWidth: 66, outerHeight: 66, scaleFactor: 1 },
  });
  assert.equal(h.ends.length, 1);
  assert.equal(h.machine.getState().activeToken, 0);
  assert.equal(h.machine.getState().dragging, false);

  // 뒤늦게 invoke 응답이 도착해도 중복 종료하거나 고착되지 않는다
  h.invokes[0].resolve({ token: 1, mode: 'direct', moved: false, geometry: null, initialLagPx: 10 });
  await h.flushMicrotasks();
  assert.equal(h.ends.length, 1);
  assert.equal(h.machine.getState().dragging, false);
});

test('C1 quick-release: 이벤트 없이 invoke 응답만으로 1회 완결·저장하고 뒤늦은 중복 이벤트는 무시한다', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 1 });
  h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 45, clientY: 33, screenX: 545, screenY: 333 });

  const geom = { physicalX: 720, physicalY: 410, outerWidth: 66, outerHeight: 66, scaleFactor: 1 };
  h.invokes[0].resolve({ token: 1, mode: 'quick-release', moved: true, geometry: geom, initialLagPx: 18 });
  await h.flushMicrotasks();

  assert.equal(h.ends.length, 1);
  assert.equal(h.ends[0].reason, 'quick-release');
  assert.equal(h.ends[0].moved, true);
  assert.deepEqual(h.ends[0].geometry, geom);

  // 같은 토큰의 중복 이벤트가 뒤늦게 와도 무시(멱등)
  h.emit('toolkit-drag-end', { token: 1, moved: true, cancelled: false, reason: 'released', geometry: geom });
  assert.equal(h.ends.length, 1);
});

test('C1 연속 드래그: 1번째 드래그의 늦은 이벤트가 2번째 드래그의 activeToken을 조기 해제하지 않는다', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  // 1번째 드래그 시작 (token=1)
  h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 1 });
  h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 45, clientY: 33, screenX: 545, screenY: 333 });
  assert.equal(h.machine.getState().activeToken, 1);

  // 2번째 드래그 즉시 시작 (token=2)
  h.machine.onPointerDown({ pointerId: 2, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 1 });
  h.machine.onPointerMove({ pointerId: 2, buttons: 1, clientX: 45, clientY: 33, screenX: 545, screenY: 333 });
  assert.equal(h.machine.getState().activeToken, 2);

  // 1번째 드래그의 늦은 drag-end 도착 → 무시되어야 함!
  h.emit('toolkit-drag-end', { token: 1, moved: true, cancelled: false, reason: 'released', geometry: null });
  assert.equal(h.ends.length, 0);
  assert.equal(h.machine.getState().activeToken, 2);

  // 2번째 드래그의 정상 drag-end 도착 → 종료!
  h.emit('toolkit-drag-end', { token: 2, moved: true, cancelled: false, reason: 'released', geometry: null });
  assert.equal(h.ends.length, 1);
  assert.equal(h.ends[0].token, 2);
});

test('키보드 클릭(detail===0)은 절대 억제하지 않고, 창 밖 릴리스 시 220ms 뒤 억제가 자동 해제된다', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 1 });
  h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 45, clientY: 33, screenX: 545, screenY: 333 });
  h.emit('toolkit-drag-end', { token: 1, moved: true, cancelled: false, reason: 'released', geometry: null });

  // 키보드 Enter/Space(detail === 0)는 suppress 중에도 통과
  assert.deepEqual(h.machine.onClick({ detail: 0 }), { prevent: false });
  assert.equal(h.machine.getState().suppressClick, true);

  // 창 밖에서 놓아 첫 click이 오지 않아도 220ms 유예 타이머 만료 후 자동 해제
  const graceTimer = h.timers.find((t) => !t.cleared && t.ms === CLICK_SUPPRESS_GRACE_MS);
  assert.ok(graceTimer, '220ms 억제 해제 타이머가 예약되어야 합니다');
  h.flushTimers();
  assert.equal(h.machine.getState().suppressClick, false);
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: false });
});

test('buttons === 0 잔여 제스처 정리 및 invoke 실패 시 isDragging 복구', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  // 눌린 뒤 pointerup 없이 buttons===0 움직임이 오면 제스처를 즉시 폐기해 드래그가 오발동하지 않음
  h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 1 });
  h.machine.onPointerMove({ pointerId: 1, buttons: 0, clientX: 80, clientY: 33, screenX: 580, screenY: 333 });
  assert.equal(h.invokes.length, 0);
  assert.equal(h.starts.length, 0);

  // invoke가 reject되면 고착되지 않고 onDragEnd(reason='error', cancelled=true)로 즉시 복구
  h.machine.onPointerDown({ pointerId: 2, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'mouse', dpr: 1 });
  h.machine.onPointerMove({ pointerId: 2, buttons: 1, clientX: 50, clientY: 33, screenX: 550, screenY: 333 });
  h.invokes[0].reject(new Error('IPC error'));
  await h.flushMicrotasks();
  assert.equal(h.errors.length, 1);
  assert.equal(h.ends.length, 1);
  assert.equal(h.ends[0].cancelled, true);
  assert.equal(h.ends[0].reason, 'error');
  assert.equal(h.machine.getState().dragging, false);
});

test('M3 터치/펜(direct-js-end): 10px 임계값, DOM 포인터 캡처 유지, rAF 병합 move, pointerup 시 toolkit_end_drag 호출', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  h.machine.onPointerDown({ pointerId: 7, button: 0, isPrimary: true, clientX: 33, clientY: 33, screenX: 533, screenY: 333, pointerType: 'touch', dpr: 1 });
  // 9px는 아직 임계값(10px) 미만
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 7, buttons: 1, clientX: 42, clientY: 33, screenX: 542, screenY: 333 }),
    { releaseCapture: false, started: false },
  );
  // 10px 통과: 터치는 releaseCapture === false로 캡처를 유지!
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 7, buttons: 1, clientX: 43, clientY: 33, screenX: 543, screenY: 333 }),
    { releaseCapture: false, started: true },
  );
  assert.equal(h.invokes[0].cmd, 'toolkit_start_drag');
  h.invokes[0].resolve({ token: 1, mode: 'direct-js-end', moved: false, geometry: null, initialLagPx: 0 });
  await h.flushMicrotasks();

  // 한 프레임 내 연속 move 2회는 최신 좌표 1회로 병합되어 toolkit_move_drag 전송
  h.machine.onPointerMove({ pointerId: 7, buttons: 1, clientX: 60, clientY: 40, screenX: 560, screenY: 340 });
  h.machine.onPointerMove({ pointerId: 7, buttons: 1, clientX: 90, clientY: 55, screenX: 590, screenY: 355 });
  h.flushFrames();
  const moves = h.invokes.filter((c) => c.cmd === 'toolkit_move_drag');
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].payload.args, { token: 1, screenX: 590, screenY: 355 });

  // pointerup 시 toolkit_end_drag(token=1) 호출
  h.machine.onPointerEnd({ pointerId: 7, cancelled: false });
  const endCalls = h.invokes.filter((c) => c.cmd === 'toolkit_end_drag');
  assert.equal(endCalls.length, 1);
  assert.deepEqual(endCalls[0].payload.args, { token: 1, cancelled: false });
});

test('대상별 커스텀 threshold(4px 배경·5px 카드·10px 도크)가 정확히 동작한다', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  // 1) 배경(threshold=4): 3px는 무시, 4px 도달 즉시 드래그 진입
  h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 20, clientY: 20, screenX: 120, screenY: 120, pointerType: 'mouse', dpr: 1, threshold: 4 });
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 23, clientY: 20, screenX: 123, screenY: 120 }),
    { releaseCapture: false, started: false },
  );
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 24, clientY: 20, screenX: 124, screenY: 120 }),
    { releaseCapture: true, started: true },
  );
  h.emit('toolkit-drag-end', { token: 1, moved: true, cancelled: false, reason: 'released', geometry: null });
  // 드래그 후 1회 클릭 차단
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: true });

  // 2) 중앙 버튼(threshold=5): 4px 이동 후 떼면 클릭 통과, 5px 도달 시 드래그 진입
  h.machine.onPointerDown({ pointerId: 2, button: 0, isPrimary: true, clientX: 100, clientY: 100, screenX: 200, screenY: 200, pointerType: 'mouse', dpr: 1, threshold: 5 });
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 2, buttons: 1, clientX: 104, clientY: 100, screenX: 204, screenY: 200 }),
    { releaseCapture: false, started: false },
  );
  h.machine.onPointerEnd({ pointerId: 2, cancelled: false });
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: false });

  h.machine.onPointerDown({ pointerId: 3, button: 0, isPrimary: true, clientX: 100, clientY: 100, screenX: 200, screenY: 200, pointerType: 'mouse', dpr: 1, threshold: 5 });
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 3, buttons: 1, clientX: 105, clientY: 100, screenX: 205, screenY: 200 }),
    { releaseCapture: true, started: true },
  );
  h.emit('toolkit-drag-end', { token: 2, moved: true, cancelled: false, reason: 'released', geometry: null });
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: true });

  // 3) 우측 상단 도크 버튼(threshold=10): 9px 이동 후 떼면 클릭 통과, 10px 도달 시 드래그 진입
  h.machine.onPointerDown({ pointerId: 4, button: 0, isPrimary: true, clientX: 200, clientY: 20, screenX: 300, screenY: 120, pointerType: 'mouse', dpr: 1, threshold: 10 });
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 4, buttons: 1, clientX: 209, clientY: 20, screenX: 309, screenY: 120 }),
    { releaseCapture: false, started: false },
  );
  h.machine.onPointerEnd({ pointerId: 4, cancelled: false });
  assert.deepEqual(h.machine.onClick({ detail: 1 }), { prevent: false });

  h.machine.onPointerDown({ pointerId: 5, button: 0, isPrimary: true, clientX: 200, clientY: 20, screenX: 300, screenY: 120, pointerType: 'mouse', dpr: 1, threshold: 10 });
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 5, buttons: 1, clientX: 210, clientY: 20, screenX: 310, screenY: 120 }),
    { releaseCapture: true, started: true },
  );
  assert.equal(h.starts.length, 3);
});

test('짧은 간격(50ms) 연속 빠른 재잡기가 누락 없이 매번 포착된다', async () => {
  const h = createHarness();
  await h.flushMicrotasks();

  // 1번째 빠른 튕기기 (quick-release)
  h.machine.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 50, clientY: 50, screenX: 150, screenY: 150, pointerType: 'mouse', dpr: 1, threshold: 4 });
  h.advanceClock(15);
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 1, buttons: 1, clientX: 56, clientY: 50, screenX: 156, screenY: 150 }),
    { releaseCapture: true, started: true },
  );
  const g1 = { physicalX: 180, physicalY: 150, outerWidth: 236, outerHeight: 256, scaleFactor: 1 };
  h.invokes[0].resolve({ token: 1, mode: 'quick-release', moved: true, geometry: g1, initialLagPx: 6 });
  await h.flushMicrotasks();
  assert.equal(h.ends.length, 1);

  // 50ms 뒤 즉시 두 번째 잡기 (기존 dragRegion의 detail>=2 가드 없이 정상 시작)
  h.advanceClock(50);
  h.machine.onPointerDown({ pointerId: 2, button: 0, isPrimary: true, clientX: 50, clientY: 50, screenX: 180, screenY: 150, pointerType: 'mouse', dpr: 1, threshold: 4 });
  h.advanceClock(12);
  assert.deepEqual(
    h.machine.onPointerMove({ pointerId: 2, buttons: 1, clientX: 55, clientY: 50, screenX: 185, screenY: 150 }),
    { releaseCapture: true, started: true },
  );
  assert.equal(h.invokes.length, 2);
  assert.equal(h.starts.length, 2);
  assert.equal(h.machine.getState().activeToken, 2);
});
