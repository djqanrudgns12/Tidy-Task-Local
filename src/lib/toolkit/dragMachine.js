// Tidy 툴킷 드래그 순수 상태 기계(DOM·Tauri 전역 비의존).
// 왜 drag.js와 분리했는가:
//   `npm test`는 jsdom 없는 Node 24 환경(`node --test`)이라 DOM 전역(`Element`, `PointerEvent`)과
//   import 시점의 `isTauri()`에 기대면 IPC 토큰 경합·클릭 억제·터치 캡처 유지 로직을 단위 테스트할 수 없습니다.
//   이 모듈은 순수 JS 상태 전이만 소유하고, drag.js가 DOM 이벤트와 포인터 캡처를 연결합니다.

/**
 * @typedef {{
 *   physicalX: number,
 *   physicalY: number,
 *   outerWidth: number,
 *   outerHeight: number,
 *   scaleFactor: number,
 * }} DragGeometry
 *
 * @typedef {{
 *   token: number,
 *   moved: boolean,
 *   cancelled: boolean,
 *   reason: string,
 *   geometry: DragGeometry | null,
 *   durationMs?: number,
 *   frames?: number,
 *   maxLagPx?: number,
 * }} DragEndEvent
 */

/** 드래그 종료 뒤 버튼 위 합성 click을 차단할 유예 시간(ms).
 * 왜 220ms인가: 0px 추적 특성상 마우스를 놓는 순간 커서가 방금 잡은 버튼 위에 있어 직후(0~50ms)
 *   브라우저가 합성 click을 보냅니다. 반대로 창 밖에서 떼면 click이 오지 않으므로, 220ms 뒤 자동 해제해
 *   이후의 정상 클릭이 막히지 않게 합니다. (드문 220ms 이내 창 밖 릴리스→즉시 재클릭 1회는 허용 범위로 차단) */
export const CLICK_SUPPRESS_GRACE_MS = 220;

/**
 * @param {{
 *   native: boolean,
 *   invoke: (cmd: string, payload?: Record<string, unknown>) => Promise<any>,
 *   listen: (event: string, cb: (event: { payload: any }) => void) => Promise<() => void>,
 *   now?: () => number,
 *   setTimeout?: (fn: () => void, ms: number) => any,
 *   clearTimeout?: (id: any) => void,
 *   requestAnimationFrame?: (fn: () => void) => any,
 *   cancelAnimationFrame?: (id: any) => void,
 *   onDragStart?: (info: { token: number, pointerType: string }) => void,
 *   onDragEnd?: (payload: DragEndEvent) => void,
 *   onError?: (error: unknown) => void,
 * }} deps
 */
export function createToolkitDragMachine(deps) {
  const {
    native,
    invoke,
    listen,
    now = () => performance.now(),
    setTimeout: scheduleTimeout = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: cancelTimeout = (id) => globalThis.clearTimeout(id),
    requestAnimationFrame: scheduleFrame = (fn) => scheduleTimeout(fn, 16),
    cancelAnimationFrame: cancelFrame = (id) => cancelTimeout(id),
    onDragStart = () => {},
    onDragEnd = () => {},
    onError = (err) => console.warn('Toolkit drag failed', err),
  } = deps;

  /** @type {{
   *   id: number,
   *   x: number,
   *   y: number,
   *   screenX: number,
   *   screenY: number,
   *   dpr: number,
   *   pointerType: string,
   *   threshold: number,
   *   downAt: number,
   *   dragging: boolean,
   *   token: number,
   *   jsEndMode: boolean,
   * } | null} */
  let gesture = null;
  let nextToken = 0;
  let activeToken = 0;
  let suppressClick = false;
  /** @type {any} */
  let suppressTimer;
  let disposed = false;
  /** @type {(() => void) | null} */
  let unlistenEnd = null;

  // 터치/펜(direct-js-end) rAF 이동 병합 상태
  /** @type {{ token: number, screenX: number, screenY: number } | null} */
  let pendingTouchMove = null;
  /** @type {any} */
  let touchMoveFrame = null;

  function clearTouchMoveFrame() {
    if (touchMoveFrame !== null) {
      cancelFrame(touchMoveFrame);
      touchMoveFrame = null;
    }
    pendingTouchMove = null;
  }

  function flushTouchMove() {
    touchMoveFrame = null;
    const move = pendingTouchMove;
    pendingTouchMove = null;
    if (!move || disposed || move.token !== activeToken) return;
    void invoke('toolkit_move_drag', { args: move }).catch(() => {});
  }

  /**
   * 토큰 기준 멱등 종료 처리.
   * 왜 멱등이어야 하는가 (C1): `toolkit-drag-end` 이벤트와 `invoke` 응답은 IPC/eval 통로가 달라
   *   도착 순서가 바뀔 수 있습니다. 이미 종료된 토큰이나 이전 세대 토큰은 무시해 영구 고착·조기 해제를 막습니다.
   * @param {number} token
   * @param {Omit<DragEndEvent, 'token'>} payload
   */
  function finishDrag(token, payload) {
    if (!token || token !== activeToken) return;
    activeToken = 0;
    clearTouchMoveFrame();
    if (gesture && gesture.token === token) {
      gesture = null;
    }
    cancelTimeout(suppressTimer);
    if (suppressClick) {
      suppressTimer = scheduleTimeout(() => {
        suppressClick = false;
      }, CLICK_SUPPRESS_GRACE_MS);
    }
    onDragEnd({ token, ...payload });
  }

  // 네이티브 환경에서는 dragMachine이 `toolkit-drag-end`의 단일 수신 주체가 됩니다(M4).
  if (native) {
    void Promise.resolve(
      listen('toolkit-drag-end', (event) => {
        if (disposed) return;
        const p = event?.payload;
        if (!p || typeof p.token !== 'number') return;
        finishDrag(p.token, {
          moved: Boolean(p.moved),
          cancelled: Boolean(p.cancelled),
          reason: typeof p.reason === 'string' ? p.reason : 'released',
          geometry: p.geometry ?? null,
          durationMs: p.durationMs,
          frames: p.frames,
          maxLagPx: p.maxLagPx,
        });
      }),
    )
      .then((off) => {
        if (disposed) off?.();
        else unlistenEnd = off;
      })
      .catch(() => {});
  }

  /**
   * @param {{
   *   pointerId: number,
   *   button: number,
   *   isPrimary: boolean,
   *   clientX: number,
   *   clientY: number,
   *   screenX: number,
   *   screenY: number,
   *   pointerType?: string,
   *   dpr?: number,
   *   threshold?: number,
   * }} e
   * @returns {{ capture: boolean }}
   */
  function onPointerDown(e) {
    if (e.button !== 0 || !e.isPrimary) return { capture: false };
    cancelTimeout(suppressTimer);
    suppressClick = false;
    const pointerType = e.pointerType || 'mouse';
    const customThreshold =
      typeof e.threshold === 'number' && Number.isFinite(e.threshold) && e.threshold >= 0
        ? e.threshold
        : null;
    gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      dpr: typeof e.dpr === 'number' && Number.isFinite(e.dpr) && e.dpr > 0 ? e.dpr : 1,
      pointerType,
      threshold: customThreshold ?? (pointerType === 'touch' ? 10 : 6),
      downAt: now(),
      dragging: false,
      token: 0,
      jsEndMode: false,
    };
    return { capture: true };
  }

  /**
   * @param {{
   *   pointerId: number,
   *   buttons: number,
   *   clientX: number,
   *   clientY: number,
   *   screenX: number,
   *   screenY: number,
   * }} e
   * @returns {{ releaseCapture: boolean, started: boolean }}
   */
  function onPointerMove(e) {
    if (!gesture || gesture.id !== e.pointerId) return { releaseCapture: false, started: false };
    // OS가 포인터를 가져가 pointerup이 웹뷰에 오지 않은 뒤 버튼이 풀린 채 움직이면 잔여 제스처를 즉시 정리합니다.
    if (e.buttons === 0) {
      const stale = gesture;
      gesture = null;
      if (stale.dragging && stale.jsEndMode && stale.token === activeToken) {
        clearTouchMoveFrame();
        void invoke('toolkit_end_drag', { args: { token: stale.token, cancelled: false } }).catch(() => {
          finishDrag(stale.token, { moved: false, cancelled: false, reason: 'error', geometry: null });
        });
      }
      return { releaseCapture: false, started: false };
    }

    if (gesture.dragging) {
      // 터치/펜(direct-js-end)은 DOM 포인터 캡처를 유지한 채 rAF마다 최신 화면 좌표를 전달합니다.
      if (native && gesture.jsEndMode && gesture.token === activeToken) {
        pendingTouchMove = { token: gesture.token, screenX: e.screenX, screenY: e.screenY };
        if (touchMoveFrame === null) {
          touchMoveFrame = scheduleFrame(flushTouchMove);
        }
      }
      return { releaseCapture: false, started: false };
    }

    const dist = Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y);
    if (dist < gesture.threshold) return { releaseCapture: false, started: false };

    const current = gesture;
    const token = ++nextToken;
    current.dragging = true;
    current.token = token;
    // 터치/펜은 66×66 창 밖에서도 pointerup을 받아야 하므로 DOM 포인터 캡처를 해제하지 않습니다(M3).
    const isMouse = current.pointerType === 'mouse';
    current.jsEndMode = !isMouse;
    activeToken = token;
    suppressClick = true;
    cancelTimeout(suppressTimer);
    onDragStart({ token, pointerType: current.pointerType });

    if (native) {
      const downToThresholdMs = Math.max(0, +(now() - current.downAt).toFixed(2));
      const thresholdDistPx = +dist.toFixed(1);
      void invoke('toolkit_start_drag', {
        args: {
          token,
          grabX: current.x,
          grabY: current.y,
          dpr: current.dpr,
          pointerType: current.pointerType,
          startScreenX: current.screenX,
          startScreenY: current.screenY,
          curScreenX: e.screenX,
          curScreenY: e.screenY,
          downToThresholdMs,
          thresholdDistPx,
        },
      })
        .then((res) => {
          if (disposed || !res) return;
          if (res.mode === 'quick-release') {
            // 초고속 튕기기: Rust가 이벤트 없이 응답에 최종 기하를 담아 돌려주므로 즉시 완결합니다(C1).
            finishDrag(token, {
              moved: Boolean(res.moved),
              cancelled: false,
              reason: 'quick-release',
              geometry: res.geometry ?? null,
            });
          } else if (res.mode === 'os-fallback') {
            // 비Windows/비대화형 폴백: OS 루프에 맡기고 onMoved 저장 경로를 다시 엽니다.
            finishDrag(token, {
              moved: false,
              cancelled: false,
              reason: 'os-fallback',
              geometry: null,
            });
          } else if (res.mode === 'direct-js-end') {
            current.jsEndMode = true;
            // 시작 IPC 왕복 중에 이미 pointerup이 와서 제스처가 끝났으면 즉시 종료를 알립니다.
            if (!gesture || gesture.token !== token) {
              void invoke('toolkit_end_drag', { args: { token, cancelled: false } }).catch(() => {
                finishDrag(token, { moved: false, cancelled: false, reason: 'error', geometry: null });
              });
            }
          }
        })
        .catch((error) => {
          onError(error);
          finishDrag(token, {
            moved: false,
            cancelled: true,
            reason: 'error',
            geometry: null,
          });
        });
    }

    return { releaseCapture: isMouse, started: true };
  }

  /**
   * @param {{ pointerId?: number, cancelled?: boolean }} [e]
   */
  function onPointerEnd(e) {
    if (!gesture) return;
    if (e?.pointerId != null && gesture.id !== e.pointerId) return;
    const ended = gesture;
    gesture = null;
    if (!ended.dragging) return;
    if (!native) {
      finishDrag(ended.token, {
        moved: false,
        cancelled: Boolean(e?.cancelled),
        reason: e?.cancelled ? 'cancelled' : 'released',
        geometry: null,
      });
      return;
    }
    if (ended.jsEndMode && ended.token === activeToken) {
      clearTouchMoveFrame();
      void invoke('toolkit_end_drag', {
        args: { token: ended.token, cancelled: Boolean(e?.cancelled) },
      }).catch(() => {
        finishDrag(ended.token, {
          moved: false,
          cancelled: Boolean(e?.cancelled),
          reason: 'error',
          geometry: null,
        });
      });
    }
  }

  function onBlur() {
    onPointerEnd({ cancelled: false });
  }

  /**
   * @param {{ detail: number }} e
   * @returns {{ prevent: boolean }}
   */
  function onClick(e) {
    // e.detail === 0은 키보드(Enter/Space) 클릭이므로 끌기와 무관하게 통과시킵니다.
    if (suppressClick && e.detail !== 0) {
      suppressClick = false;
      cancelTimeout(suppressTimer);
      return { prevent: true };
    }
    return { prevent: false };
  }

  function destroy() {
    disposed = true;
    clearTouchMoveFrame();
    cancelTimeout(suppressTimer);
    if (unlistenEnd) {
      unlistenEnd();
      unlistenEnd = null;
    }
    gesture = null;
    activeToken = 0;
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onBlur,
    onClick,
    destroy,
    getState() {
      return {
        activeToken,
        suppressClick,
        dragging: Boolean(gesture?.dragging || activeToken !== 0),
      };
    },
  };
}
