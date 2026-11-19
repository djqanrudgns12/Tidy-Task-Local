// D-Day 컨트롤 패널 카드 드래그 판별(상호작용 기본 차단 + 제목 허용) 및 비동기 IPC 표시 순서 오버레이 리듀서
// rowGestures.js와 order.js의 검증된 상수·순열 규칙을 재사용해 TodoList와 동일한 조작 일관성을 지킵니다.

import {
  CLICK_GUARD_SAFETY_MS,
  MOUSE_SORT_DISTANCE_Y,
  REMOVAL_GUARD_DISTANCE,
  REMOVAL_GUARD_MS,
  TOUCH_SORT_DELAY_MS,
  TOUCH_SORT_TOLERANCE,
  createClickGuard,
  createRemovalGuard,
  sortActivationFor,
} from '../todos/rowGestures.js';
import { applyTodoOrder, moveTodoOrder, sameTodoOrder } from '../todos/order.js';

export const DDAY_SORTABLE_ATTR = 'data-dday-sortable';
export const DDAY_NO_SORT_ATTR = 'data-dday-no-sort';

export const INTERACTIVE_BLOCK_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[contenteditable]',
  '[role="button"]',
  `[${DDAY_NO_SORT_ATTR}]`,
].join(', ');

/**
 * 포인터 누름 지점에서 D-Day 카드 순서 드래그를 시작할 수 있는지 판별합니다.
 * 상호작용 요소(완료·편집·캡슐 그룹·기타 버튼)는 기본 차단(deny-by-default)하고,
 * 제목 버튼([data-dday-sortable])과 카드 비버튼 영역(여백·아이콘·뱃지·메타)만 허용합니다.
 * @param {unknown} target
 * @param {{ contains: (node: any) => boolean } | null | undefined} cardEl
 * @returns {boolean}
 */
export function canStartDdaySort(target, cardEl) {
  if (!cardEl || !target || typeof (/** @type {any} */ (target).closest) !== 'function') return false;
  const node = /** @type {Element} */ (target);
  if (!cardEl.contains(node)) return false;

  const blockedAncestor = node.closest(INTERACTIVE_BLOCK_SELECTOR);
  if (!blockedAncestor || !cardEl.contains(blockedAncestor)) {
    return true;
  }

  if (
    typeof blockedAncestor.hasAttribute === 'function' &&
    blockedAncestor.hasAttribute(DDAY_SORTABLE_ATTR) &&
    !blockedAncestor.hasAttribute(DDAY_NO_SORT_ATTR)
  ) {
    const noSortAncestor = blockedAncestor.closest?.(`[${DDAY_NO_SORT_ATTR}]`);
    if (!noSortAncestor || !cardEl.contains(noSortAncestor)) {
      return true;
    }
  }
  return false;
}

/**
 * @typedef {{
 *   label: string,
 *   ids: string[],
 *   token: number,
 *   inFlight: boolean,
 * }} OrderOverlayEntry
 */

/**
 * @typedef {{
 *   seq: number,
 *   byLabel: Record<string, OrderOverlayEntry>,
 * }} OrderOverlayState
 */

/** @returns {OrderOverlayState} */
export function createOrderOverlayState() {
  return { seq: 0, byLabel: {} };
}

/**
 * 권위 스냅샷(activeItems)에 창별 오버레이 순서(overlayIds)를 비변이 합성합니다.
 * 드래그·저장 대기 중 새 항목이 추가되거나 기존 항목이 삭제·완료돼도 누락/충돌 없이 반영합니다.
 * @template {{ id: string }} T
 * @param {readonly T[]} activeItems
 * @param {readonly string[] | null | undefined} overlayIds
 * @returns {T[]}
 */
export function projectActiveDdays(activeItems, overlayIds) {
  const list = Array.isArray(activeItems) ? activeItems : [];
  if (!Array.isArray(overlayIds) || overlayIds.length === 0 || list.length <= 1) {
    return [...list];
  }
  const rank = new Map();
  overlayIds.forEach((id, idx) => {
    if (!rank.has(id)) rank.set(id, idx);
  });
  return [...list].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : 9999;
    const rb = rank.has(b.id) ? rank.get(b.id) : 9999;
    return ra - rb;
  });
}

/**
 * 스냅샷의 활성 ID 순서가 오버레이의 생존 ID 부분열 순서와 일치하는지 검사합니다.
 * @param {readonly string[]} snapshotActiveIds
 * @param {readonly string[] | null | undefined} overlayIds
 * @returns {boolean}
 */
export function isOverlayAligned(snapshotActiveIds, overlayIds) {
  if (!Array.isArray(overlayIds) || overlayIds.length === 0) return true;
  const snapSet = new Set(snapshotActiveIds);
  const survivingOverlay = overlayIds.filter((id) => snapSet.has(id));
  const overlaySet = new Set(survivingOverlay);
  const snapCovered = snapshotActiveIds.filter((id) => overlaySet.has(id));
  return sameTodoOrder(snapCovered, survivingOverlay);
}

/**
 * 드롭 확정 순간 해당 창에 새 표시 순서 오버레이와 단조 증가 토큰을 발급합니다.
 * @param {OrderOverlayState} state
 * @param {string} label
 * @param {readonly string[]} nextIds
 * @returns {{ state: OrderOverlayState, token: number }}
 */
export function beginOrderOverlay(state, label, nextIds) {
  const token = state.seq + 1;
  return {
    token,
    state: {
      seq: token,
      byLabel: {
        ...state.byLabel,
        [label]: {
          label,
          ids: [...nextIds],
          token,
          inFlight: true,
        },
      },
    },
  };
}

/**
 * dday:window-updated 도착 시 오버레이 합의 여부를 정산합니다.
 * - 스냅샷 순서가 이미 오버레이와 일치하면 오버레이를 해제(권위 스냅샷 승격).
 * - 아직 inFlight 중이고 순서가 옛날이면 오버레이를 유지해 1프레임 되튐을 차단합니다.
 * @param {OrderOverlayState} state
 * @param {string} label
 * @param {readonly string[]} snapshotActiveIds
 * @returns {OrderOverlayState}
 */
export function reconcileOverlayWithSnapshot(state, label, snapshotActiveIds) {
  const entry = state.byLabel[label];
  if (!entry) return state;
  if (isOverlayAligned(snapshotActiveIds, entry.ids)) {
    const nextMap = { ...state.byLabel };
    delete nextMap[label];
    return { ...state, byLabel: nextMap };
  }
  return state;
}

/**
 * command('reorder') IPC 응답을 정산합니다.
 * - token 불일치: 이미 더 최신 드래그(#2)로 대체됐으므로 늦은 ack를 무시합니다.
 * - ok === true 이면서 스냅샷 순서가 요청과 실제 일치: 정상 확정(오버레이 제거).
 * - ok === false(타임아웃) 또는 ok === true이지만 스냅샷이 옛 순서(isUpdateFrozen 등 명령 무시):
 *   옛 배열 롤백 대신 오버레이만 제거해 권위 스냅샷의 다른 동시 편집(채널 토글 등)을 보존합니다.
 * @param {OrderOverlayState} state
 * @param {{ label: string, token: number, ok: boolean, ackActiveIds?: readonly string[] | null }} ack
 * @returns {{ state: OrderOverlayState, status: 'stale' | 'committed' | 'reverted', notifyFailure: boolean }}
 */
export function settleOrderOverlay(state, { label, token, ok, ackActiveIds }) {
  const entry = state.byLabel[label];
  if (!entry || entry.token !== token) {
    return { state, status: 'stale', notifyFailure: false };
  }
  const nextMap = { ...state.byLabel };
  delete nextMap[label];
  const nextState = { ...state, byLabel: nextMap };

  if (ok && Array.isArray(ackActiveIds) && isOverlayAligned(ackActiveIds, entry.ids)) {
    return { state: nextState, status: 'committed', notifyFailure: false };
  }
  return { state: nextState, status: 'reverted', notifyFailure: true };
}

export {
  CLICK_GUARD_SAFETY_MS,
  MOUSE_SORT_DISTANCE_Y,
  REMOVAL_GUARD_DISTANCE,
  REMOVAL_GUARD_MS,
  TOUCH_SORT_DELAY_MS,
  TOUCH_SORT_TOLERANCE,
  applyTodoOrder,
  createClickGuard,
  createRemovalGuard,
  moveTodoOrder,
  sameTodoOrder,
  sortActivationFor,
};
