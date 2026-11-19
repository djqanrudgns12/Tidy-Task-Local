import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DDAY_WIDGET_LABEL,
  DDAY_WIDGET_STATE_EVENT,
  createDdayWidgetController,
} from './ddayWidgetWindow.js';

/**
 * @typedef {{
 *   calls: [string, ...any[]][],
 *   setPosition: (pos: any) => Promise<void>,
 *   unminimize: () => Promise<void>,
 *   show: () => Promise<void>,
 *   setFocus: () => Promise<void>,
 *   close: () => Promise<void>,
 *   destroy: () => Promise<void>,
 * }} MockWin
 */

/** @returns {MockWin} */
function createMockWin() {
  /** @type {[string, ...any[]][]} */
  const calls = [];
  return {
    calls,
    async setPosition(/** @type {any} */ pos) { calls.push(['setPosition', pos]); },
    async unminimize() { calls.push(['unminimize']); },
    async show() { calls.push(['show']); },
    async setFocus() { calls.push(['setFocus']); },
    async close() { calls.push(['close']); },
    async destroy() { calls.push(['destroy']); },
  };
}

test('toggleDdayWidget: 닫혀 있으면 dday 역할로 열고, 열려 있으면 destroy가 아닌 close로 닫는다', async () => {
  /** @type {{ activeWin: MockWin | null }} */
  const state = { activeWin: null };
  /** @type {string[]} */
  const openedRoles = [];

  const ctrl = createDdayWidgetController({
    isNative: () => true,
    getByLabel: async (label) => (label === DDAY_WIDGET_LABEL ? state.activeWin : null),
    openRole: async (role) => {
      openedRoles.push(role);
      if (!state.activeWin) state.activeWin = createMockWin();
    },
  });

  assert.equal(await ctrl.isDdayWidgetOpen(), false);

  // OFF -> ON
  const onRes = await ctrl.toggleDdayWidget();
  assert.deepEqual(onRes, { open: true, ok: true, changed: true });
  assert.deepEqual(openedRoles, ['dday']);
  assert.equal(await ctrl.isDdayWidgetOpen(), true);
  assert.ok(state.activeWin);
  assert.deepEqual(
    state.activeWin.calls.map((c) => c[0]),
    ['unminimize', 'show', 'setFocus'],
  );

  // ON -> OFF (반드시 close() 호출, destroy() 미호출)
  const closedWin = state.activeWin;
  closedWin.close = async () => {
    closedWin.calls.push(['close']);
    state.activeWin = null;
  };
  const offRes = await ctrl.toggleDdayWidget();
  assert.deepEqual(offRes, { open: false, ok: true, changed: true });
  assert.equal(await ctrl.isDdayWidgetOpen(), false);
  assert.ok(closedWin.calls.some((c) => c[0] === 'close'));
  assert.equal(closedWin.calls.some((c) => c[0] === 'destroy'), false);
});

test('openDdayWidget: 최초 실행이고 저장 위치가 없을 때만 호출 창 옆자리에 배치한다', async () => {
  /** @type {MockWin | null} */
  let activeWin = null;
  const monitors = [
    {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      work: { x: 0, y: 0, width: 1920, height: 1040 },
      scale: 1,
    },
  ];
  const anchorWin = {
    async outerPosition() { return { x: 400, y: 200 }; },
    async outerSize() { return { width: 380, height: 580 }; },
    async scaleFactor() { return 1; },
  };

  const ctrl = createDdayWidgetController({
    isNative: () => true,
    getByLabel: async () => activeWin,
    openRole: async () => { if (!activeWin) activeWin = createMockWin(); },
    getCurrentWin: () => anchorWin,
    getMonitors: async () => monitors,
    createPosition: (x, y) => ({ x, y }),
  });

  // 최초 열기 + 저장 위치 없음 -> 옆자리 배치 수행
  await ctrl.openDdayWidget({ preferSideOfCurrentWindow: true, hasSavedGeometry: false });
  assert.ok(activeWin);
  const firstWin = /** @type {MockWin} */ (activeWin);
  const posCall = firstWin.calls.find((c) => c[0] === 'setPosition');
  assert.ok(posCall, '최초 열기 시 setPosition이 호출되어야 함');
  assert.equal(posCall[1].x, 400 + 380 + 14);
  assert.equal(posCall[1].y, 200);

  // 이미 열려 있을 때 다시 호출 -> setPosition 재호출 안 함
  const countBefore = firstWin.calls.filter((c) => c[0] === 'setPosition').length;
  await ctrl.openDdayWidget({ preferSideOfCurrentWindow: true, hasSavedGeometry: false });
  const countAfter = firstWin.calls.filter((c) => c[0] === 'setPosition').length;
  assert.equal(countAfter, countBefore);

  // 저장 위치가 있을 때 최초 열기 -> setPosition 호출 안 함
  activeWin = null;
  await ctrl.openDdayWidget({ preferSideOfCurrentWindow: true, hasSavedGeometry: true });
  assert.ok(activeWin);
  const secondWin = /** @type {MockWin} */ (activeWin);
  assert.equal(secondWin.calls.some((c) => c[0] === 'setPosition'), false);
});

test('toggleDdayWidget: 동시 연타 시 진행 중인 작업을 공유해 중복 생성을 막는다', async () => {
  let openCalls = 0;
  /** @type {(() => void) | undefined} */
  let releaseOpen;
  /** @type {MockWin | null} */
  let activeWin = null;

  const ctrl = createDdayWidgetController({
    isNative: () => true,
    getByLabel: async () => activeWin,
    openRole: async () => {
      openCalls += 1;
      await new Promise((r) => { releaseOpen = () => r(undefined); });
      if (!activeWin) activeWin = createMockWin();
    },
  });

  const p1 = ctrl.toggleDdayWidget();
  const p2 = ctrl.toggleDdayWidget();
  await new Promise((r) => setTimeout(r, 10));
  releaseOpen?.();

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(openCalls, 1);
  assert.deepEqual(r1, { open: true, ok: true, changed: true });
  assert.deepEqual(r2, { open: true, ok: true, changed: true });
});

test('watchDdayWidgetOpen: 초기 조회·상태 방송·dispose 해제가 정확히 동작한다', async () => {
  /** @type {MockWin | null} */
  let activeWin = null;
  /** @type {{ fn: ((ev: { payload: unknown }) => void) | null }} */
  const hook = { fn: null };
  let unlistenCount = 0;
  let focusRemoveCount = 0;

  const ctrl = createDdayWidgetController({
    isNative: () => true,
    getByLabel: async () => activeWin,
    listenEvent: async (event, cb) => {
      assert.equal(event, DDAY_WIDGET_STATE_EVENT);
      hook.fn = cb;
      return () => { unlistenCount += 1; };
    },
    addWindowListener: () => () => { focusRemoveCount += 1; },
  });

  /** @type {boolean[]} */
  const seen = [];
  const watcher = ctrl.watchDdayWidgetOpen((open) => seen.push(open));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(seen, [false]);

  hook.fn?.({ payload: true });
  hook.fn?.({ payload: false });
  assert.deepEqual(seen, [false, true, false]);

  watcher.dispose();
  assert.equal(unlistenCount, 1);
  assert.equal(focusRemoveCount, 1);

  // dispose 이후에는 이벤트가 와도 콜백을 부르지 않음
  hook.fn?.({ payload: true });
  assert.deepEqual(seen, [false, true, false]);
});

test('watchDdayWidgetOpen: 비-Tauri 프리뷰 모드에서도 ON/OFF 상태가 동기화된다', async () => {
  /** @type {Set<(ev: { detail: boolean }) => void>} */
  const listeners = new Set();
  const ctrl = createDdayWidgetController({
    isNative: () => false,
    addWindowListener: (_type, cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispatchPreviewEvent: (open) => {
      for (const cb of listeners) cb({ detail: open });
    },
  });

  /** @type {boolean[]} */
  const seen = [];
  const watcher = ctrl.watchDdayWidgetOpen((open) => seen.push(open));
  assert.deepEqual(seen, [false]);

  const onRes = await ctrl.toggleDdayWidget();
  assert.deepEqual(onRes, { open: true, ok: true, changed: true });
  assert.deepEqual(seen, [false, true]);

  const offRes = await ctrl.toggleDdayWidget();
  assert.deepEqual(offRes, { open: false, ok: true, changed: true });
  assert.deepEqual(seen, [false, true, false]);

  watcher.dispose();
});
