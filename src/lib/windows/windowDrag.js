// 창의 아무 빈 곳이나 잡고 끌면 창 자체(네이티브)를 옮기는 Svelte 액션입니다. (툴킷 drag.js와 같은 방식)
// 왜 바로 startDragging하지 않고 몇 px 움직인 뒤에 시작하는가:
//   누르자마자 OS 끌기로 넘기면 그 자리의 버튼(월 이동·날짜 칸)이 클릭을 받지 못합니다.
//   살짝 움직였을 때만 끌기로 보고, 끌기 뒤에 따라오는 click은 버립니다.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { isTauri } from '@tauri-apps/api/core';

// 누를 수 있는 요소(버튼 등) 위에서 시작한 끌기는 더 많이 움직여야 시작합니다.
// 왜: 날짜 칸을 누르다 손이 조금 흔들렸을 때 창만 움직이고 날짜가 선택되지 않으면 답답합니다.
//   반대로 빈 곳(머리글·요일 줄·여백)은 조금만 움직여도 바로 끌리는 편이 자연스럽습니다.
const CONTROL_SELECTOR = 'button, a, input, select, textarea, [role="button"], [contenteditable="true"]';
const BACKGROUND_THRESHOLD = 4;
const CONTROL_THRESHOLD = 12;
const TOUCH_EXTRA = 6;

/**
 * @param {HTMLElement} node
 * @param {{ onstart?: () => void } | undefined} [params]
 */
export function windowDrag(node, params) {
  let onstart = params?.onstart;
  /** @type {{ id: number, x: number, y: number, screenX: number, screenY: number, lastX: number, lastY: number, dragging: boolean, threshold: number, capture: Element, origin: Promise<{ x: number, y: number, scale: number }> | null } | null} */
  let gesture = null;
  let suppressClick = false;
  const native = isTauri();

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0 || !e.isPrimary) return;
    suppressClick = false;
    const target = e.target instanceof Element ? e.target : node;
    const control = target.closest(CONTROL_SELECTOR);
    const capture = control || target;
    gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      lastX: e.screenX,
      lastY: e.screenY,
      dragging: false,
      threshold: (control ? CONTROL_THRESHOLD : BACKGROUND_THRESHOLD)
        + (e.pointerType === 'touch' ? TOUCH_EXTRA : 0),
      capture,
      // 아주 짧은 끌기 보정용 시작 위치. 누르는 순간 읽어 두어야 OS 끌기 전의 자리를 압니다.
      origin: native
        ? Promise.all([getCurrentWindow().outerPosition(), getCurrentWindow().scaleFactor()])
          .then(([p, scale]) => ({ x: p.x, y: p.y, scale }))
        : null,
    };
    capture.setPointerCapture(e.pointerId);
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!gesture || gesture.id !== e.pointerId) return;
    // OS 이동 모드에서는 마우스를 OS가 가져가 버튼을 놓는 순간(pointerup)이 웹뷰에 오지 않을 수 있습니다.
    // 버튼이 눌려 있지 않은 움직임이 보이면 그 손짓은 이미 끝난 것으로 봅니다.
    if (e.buttons === 0) {
      gesture = null;
      return;
    }
    gesture.lastX = e.screenX;
    gesture.lastY = e.screenY;
    if (gesture.dragging || Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < gesture.threshold) return;
    const current = gesture;
    current.dragging = true;
    suppressClick = true;
    if (current.capture.hasPointerCapture(e.pointerId)) current.capture.releasePointerCapture(e.pointerId);
    onstart?.();
    if (!native) return;
    void (async () => {
      const origin = await current.origin;
      if (!origin) return;
      const win = getCurrentWindow();
      await win.startDragging();
      // 버튼을 아주 빨리 놓으면 WebView2가 OS 이동 모드에 들어가기 전에 끝나 창이 움직이지 않습니다.
      // 그때는 손가락이 움직인 만큼 직접 옮겨 "끌었는데 안 움직임"을 막습니다.
      const after = await win.outerPosition();
      if (after.x === origin.x && after.y === origin.y) {
        const dx = current.lastX - current.screenX;
        const dy = current.lastY - current.screenY;
        if (Math.hypot(dx, dy) >= current.threshold) {
          await win.setPosition(new PhysicalPosition(
            Math.round(origin.x + dx * origin.scale),
            Math.round(origin.y + dy * origin.scale),
          ));
        }
      }
    })().catch((error) => console.warn('창을 옮기지 못했습니다:', error));
  }

  /** @param {PointerEvent} e */
  function end(e) {
    if (gesture) {
      gesture.lastX = e.screenX;
      gesture.lastY = e.screenY;
    }
    gesture = null;
  }

  function cancel() {
    gesture = null;
  }

  /** @param {MouseEvent} e */
  function click(e) {
    // e.detail === 0 은 키보드(Enter/Space)로 누른 클릭이라 끌기와 상관없습니다.
    if (suppressClick && e.detail !== 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    suppressClick = false;
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  node.addEventListener('click', click, true);
  window.addEventListener('blur', cancel);
  return {
    /** @param {{ onstart?: () => void } | undefined} next */
    update(next) {
      onstart = next?.onstart;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      node.removeEventListener('click', click, true);
      window.removeEventListener('blur', cancel);
    },
  };
}
