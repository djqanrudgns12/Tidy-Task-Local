// 할 일 줄 조작 규칙 — 끌기 시작 판정, 클릭 가드, 연타 보호, X 무장
// 설계: docs/PRD-todo-row-gestures.md
//
// 왜 한 파일에 모았는가:
//   "누름이 클릭인가 끌기인가"를 가르는 숫자와 규칙이 여러 컴포넌트(할 일·마감된 일)와
//   끌기 엔진(verticalSort.js)에 흩어지면, 한쪽만 고쳐 클릭과 끌기가 섞이는 사고가 납니다.
//   여기는 DOM·시간에 직접 기대지 않는 순수 로직이라 node --test로 경계값을 검사합니다.

/** 끌기를 시작할 수 있는 버튼(완료 버튼·날짜 알약)에 붙이는 표시 */
export const SORT_ACTIVATOR_ATTR = 'data-sort-activator';

/** 마우스·펜: 세로로 이만큼(px, CSS 픽셀) "넘게" 움직여야 끌기가 시작됩니다. 클릭 흔들림은 보통 0~3px입니다. */
export const MOUSE_SORT_DISTANCE_Y = 6;
/** 터치: 이만큼 길게 눌러야 끌기가 시작됩니다. 그보다 먼저 움직이면 목록 스크롤로 넘깁니다. */
export const TOUCH_SORT_DELAY_MS = 400;
/** 터치로 길게 누르는 동안 허용하는 흔들림(px). 넘으면 끌기를 포기합니다. */
export const TOUCH_SORT_TOLERANCE = 6;
/** 끌기 뒤 클릭이 끝내 오지 않았을 때 클릭 가드를 푸는 안전 시간(뗀 뒤부터) */
export const CLICK_GUARD_SAFETY_MS = 1000;
/** 줄에 들어온 뒤 X가 눌리기 시작하는 시간. 그보다 빠른 누름은 X가 생기기 전부터 그 자리(글 끝)를 노린 것입니다. */
export const X_ARM_MS = 150;
/** 줄이 사라진 뒤 같은 자리 연타를 무시하는 시간(Windows 기본 더블클릭 간격) */
export const REMOVAL_GUARD_MS = 500;
/** 연타 보호를 푸는 포인터 이동 거리(px) */
export const REMOVAL_GUARD_DISTANCE = 4;

/**
 * 누른 지점이 이 줄의 잡기 버튼 안이면 그 버튼을, 아니면 null을 돌려줍니다.
 * 버튼 속 아이콘(SVG)을 눌러도 조상을 거슬러 올라가 같은 버튼을 찾습니다.
 * @param {unknown} target 포인터 이벤트의 target
 * @param {{ contains: (node: any) => boolean } | null | undefined} row 그 Sortable의 줄 요소
 * @returns {Element | null}
 */
export function findSortActivator(target, row) {
  if (!row || !target || typeof (/** @type {any} */ (target).closest) !== 'function') return null;
  const activator = /** @type {Element} */ (target).closest(`[${SORT_ACTIVATOR_ATTR}]`);
  if (!activator || !row.contains(activator)) return null;
  return activator;
}

/**
 * 입력 종류별 끌기 시작 기준. 라이브러리 객체가 아니라 평범한 값으로 돌려줘 테스트할 수 있게 합니다.
 * 펜은 마우스처럼 올림 상태가 있어 같은 규칙을 씁니다.
 * @param {string | undefined} pointerType
 * @returns {{ kind: 'distance', y: number } | { kind: 'delay', ms: number, tolerance: number }}
 */
export function sortActivationFor(pointerType) {
  if (pointerType === 'touch') {
    return { kind: 'delay', ms: TOUCH_SORT_DELAY_MS, tolerance: TOUCH_SORT_TOLERANCE };
  }
  return { kind: 'distance', y: MOUSE_SORT_DISTANCE_Y };
}

/**
 * 클릭 가드 — 끌기가 한 번이라도 시작된 누름에서 생기는 클릭을 버립니다.
 *
 * 왜 필요한가: 끌기 라이브러리는 클릭의 "기본 동작"만 막고 버튼 자체의 클릭 처리기는 막지 않습니다.
 *   그래서 완료 버튼을 잡고 끌다가 Esc로 취소한 뒤 버튼 위에서 떼면 할 일이 마감됐습니다.
 *
 * 해제 조건(먼저 오는 것): 클릭 1번을 버림 · 새 누름 · 이미 뗀 뒤의 키 입력 · 뗀 뒤 안전 시간.
 * 누르고 있는 동안의 키 입력(Esc 취소)은 해제하지 않습니다 — 그 뒤 버튼 위에서 뗄 수 있기 때문입니다.
 *
 * @param {{ setTimer: (fn: () => void, ms: number) => any, clearTimer: (handle: any) => void }} timers
 */
export function createClickGuard({ setTimer, clearTimer }) {
  let armed = false;
  let held = false;
  /** @type {any} */
  let safetyTimer = null;

  function stopTimer() {
    if (safetyTimer !== null) {
      clearTimer(safetyTimer);
      safetyTimer = null;
    }
  }

  function disarm() {
    armed = false;
    stopTimer();
  }

  function scheduleSafety() {
    stopTimer();
    safetyTimer = setTimer(() => {
      safetyTimer = null;
      armed = false;
    }, CLICK_GUARD_SAFETY_MS);
  }

  return {
    get armed() { return armed; },
    get held() { return held; },
    /** 포인터로 끌기가 시작된 순간 */
    arm() {
      armed = true;
      // 끌기는 누른 채로만 시작되지만, 혹시 뗀 뒤에 무장되면 바로 안전 시간을 겁니다.
      if (held) stopTimer();
      else scheduleSafety();
    },
    /** 주 포인터를 누름(어느 버튼이든). 새 누름의 클릭은 정상이어야 합니다. */
    onPointerDown() {
      disarm();
      held = true;
    },
    /** 주 포인터를 떼거나 취소됨 */
    onPointerEnd() {
      held = false;
      if (armed) scheduleSafety();
    },
    /** 키 입력. 이미 뗀 뒤라면 키보드로 누르는 버튼 클릭은 정상입니다. */
    onKeyDown() {
      if (armed && !held) disarm();
    },
    /** 클릭이 왔을 때. true면 이 클릭을 버려야 합니다. */
    takeClick() {
      if (!armed) return false;
      disarm();
      return true;
    },
    destroy() {
      disarm();
      held = false;
    },
  };
}

/**
 * 연타 보호 — 줄이 사라진 직후, 같은 자리로 올라온 다음 줄의 버튼을 실수로 누르지 않게 합니다.
 * 기억한 좌표에서 REMOVAL_GUARD_DISTANCE 넘게 움직이거나 REMOVAL_GUARD_MS가 지나면 풀립니다.
 * @param {{ now: () => number }} clock
 */
export function createRemovalGuard({ now }) {
  /** @type {{ x: number, y: number, until: number } | null} */
  let origin = null;

  /** @param {number} x @param {number} y */
  function movedAway(x, y) {
    if (!origin) return true;
    return Math.hypot(x - origin.x, y - origin.y) > REMOVAL_GUARD_DISTANCE;
  }

  return {
    /** 포인터 클릭으로 줄이 사라진 순간의 화면 좌표 @param {number} x @param {number} y */
    start(x, y) {
      origin = { x, y, until: now() + REMOVAL_GUARD_MS };
    },
    /** 포인터가 움직임 @param {number} x @param {number} y @returns {boolean} 이번 움직임으로 풀렸는지 */
    onPointerMove(x, y) {
      if (!origin) return false;
      if (movedAway(x, y)) {
        origin = null;
        return true;
      }
      return false;
    },
    /**
     * 지금 보호 중인가. 좌표를 주면 그 좌표가 멀리 떨어졌는지도 함께 봅니다.
     * @param {number} [x] @param {number} [y]
     */
    active(x, y) {
      if (!origin) return false;
      if (now() >= origin.until) {
        origin = null;
        return false;
      }
      if (x !== undefined && y !== undefined && movedAway(x, y)) {
        origin = null;
        return false;
      }
      return true;
    },
    /** 보호가 끝나는 시각(없으면 null) — 화면 표시를 정확히 그때 풀기 위해 씁니다. */
    get until() { return origin ? origin.until : null; },
    clear() { origin = null; },
  };
}

/**
 * X를 누른 순간이 무장된 뒤인가.
 * hoverSince가 없으면(키보드 초점으로 닿은 경우 등) 늘 무장 상태입니다.
 * @param {number | null | undefined} hoverSince 포인터가 그 줄에 들어온 시각
 * @param {number} pressedAt 누른 시각
 */
export function isXArmed(hoverSince, pressedAt) {
  if (hoverSince === null || hoverSince === undefined || !Number.isFinite(hoverSince)) return true;
  return pressedAt - hoverSince >= X_ARM_MS;
}
