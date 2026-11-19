// Tidy 툴킷 툴바 끌기 Svelte 액션 (DOM 어댑터).
// 실제 상태 전이·토큰 경합 방지·클릭 억제·터치 캡처 유지 규칙은 순수 모듈 `dragMachine.js`가 소유합니다.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { native } from './store.js';
import { createToolkitDragMachine } from './dragMachine.js';

/**
 * @typedef {{
 *   onDragStart?: (info: { token: number, pointerType: string }) => void,
 *   onDragEnd?: (payload: import('./dragMachine.js').DragEndEvent) => void,
 *   thresholdForTarget?: (target: Element | null, pointerType: string) => number | undefined,
 *   shouldIgnore?: (target: Element | null) => boolean,
 * }} ToolkitDragParams
 */

/**
 * @param {HTMLElement} node
 * @param {ToolkitDragParams | undefined} [params]
 */
export function toolkitDrag(node, params) {
  let onDragStart = params?.onDragStart;
  let onDragEnd = params?.onDragEnd;
  let thresholdForTarget = params?.thresholdForTarget;
  let shouldIgnore = params?.shouldIgnore;
  /** @type {{ el: Element, pointerId: number } | null} */
  let captured = null;

  const machine = createToolkitDragMachine({
    native,
    invoke,
    listen,
    requestAnimationFrame: (fn) => window.requestAnimationFrame(fn),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    onDragStart: (info) => onDragStart?.(info),
    onDragEnd: (payload) => {
      releaseCapture();
      onDragEnd?.(payload);
    },
  });

  function releaseCapture() {
    if (!captured) return;
    const { el, pointerId } = captured;
    captured = null;
    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    } catch {}
  }

  /** @param {PointerEvent} e */
  function down(e) {
    const elTarget = e.target instanceof Element ? e.target : null;
    if (shouldIgnore?.(elTarget)) return;
    const pointerType = e.pointerType || 'mouse';
    const threshold = thresholdForTarget?.(elTarget, pointerType);
    const res = machine.onPointerDown({
      pointerId: e.pointerId,
      button: e.button,
      isPrimary: e.isPrimary,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      pointerType,
      dpr: window.devicePixelRatio || 1,
      threshold,
    });
    if (!res.capture) return;
    const target = elTarget ? elTarget.closest('button') || elTarget : node;
    try {
      target.setPointerCapture(e.pointerId);
      captured = { el: target, pointerId: e.pointerId };
    } catch {
      captured = null;
    }
  }

  /** @param {PointerEvent} e */
  function move(e) {
    const res = machine.onPointerMove({
      pointerId: e.pointerId,
      buttons: e.buttons,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
    });
    if (res.releaseCapture) {
      releaseCapture();
    }
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (captured && captured.pointerId === e.pointerId) {
      releaseCapture();
    }
    machine.onPointerEnd({ pointerId: e.pointerId, cancelled: false });
  }

  /** @param {PointerEvent} e */
  function cancel(e) {
    if (captured && captured.pointerId === e.pointerId) {
      releaseCapture();
    }
    machine.onPointerEnd({ pointerId: e.pointerId, cancelled: true });
  }

  /** @param {PointerEvent} e */
  function lostCapture(e) {
    if (captured && captured.pointerId === e.pointerId) {
      captured = null;
    }
  }

  function blur() {
    releaseCapture();
    machine.onBlur();
  }

  /** @param {MouseEvent} e */
  function click(e) {
    if (machine.onClick({ detail: e.detail }).prevent) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('lostpointercapture', lostCapture);
  node.addEventListener('click', click, true);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', blur);

  return {
    /**
     * @param {ToolkitDragParams | undefined} next
     */
    update(next) {
      onDragStart = next?.onDragStart;
      onDragEnd = next?.onDragEnd;
      thresholdForTarget = next?.thresholdForTarget;
      shouldIgnore = next?.shouldIgnore;
    },
    destroy() {
      releaseCapture();
      machine.destroy();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('lostpointercapture', lostCapture);
      node.removeEventListener('click', click, true);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', blur);
    },
  };
}
