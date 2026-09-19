import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { native } from './store.js';
import { dismissMenu } from './windows.js';
/** @param {HTMLElement} node */
export function toolkitDrag(node) {
  /** @type {{id:number,x:number,y:number,screenX:number,screenY:number,lastX:number,lastY:number,dragging:boolean,threshold:number,capture:Element,origin:Promise<{x:number,y:number,scale:number}>|null}|null} */
  let gesture = null;
  let suppress = false;
  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0 || !e.isPrimary) return;
    suppress = false;
    const capture = e.target instanceof Element ? e.target.closest('button') || e.target : node;
    const origin = native
      ? Promise.all([getCurrentWindow().outerPosition(), getCurrentWindow().scaleFactor()]).then(
          ([p, scale]) => ({ x: p.x, y: p.y, scale }),
        )
      : null;
    gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      lastX: e.screenX,
      lastY: e.screenY,
      dragging: false,
      threshold: e.pointerType === 'touch' ? 10 : 6,
      capture,
      origin,
    };
    capture.setPointerCapture(e.pointerId);
  }
  /** @param {PointerEvent} e */
  function move(e) {
    if (!gesture || gesture.id !== e.pointerId) return;
    gesture.lastX = e.screenX;
    gesture.lastY = e.screenY;
    if (
      gesture.dragging ||
      Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < gesture.threshold
    )
      return;
    const current = gesture;
    current.dragging = true;
    suppress = true;
    if (current.capture.hasPointerCapture(e.pointerId))
      current.capture.releasePointerCapture(e.pointerId);
    void dismissMenu();
    if (native)
      void (async () => {
        const origin = await current.origin;
        if (!origin) return;
        const win = getCurrentWindow();
        await win.startDragging();
        // A very short gesture can release before WebView2 enters the OS move loop.
        // Preserve that gesture's final displacement if the OS did not move at all.
        const after = await win.outerPosition();
        if (after.x === origin.x && after.y === origin.y) {
          const dx = current.lastX - current.screenX,
            dy = current.lastY - current.screenY;
          if (Math.hypot(dx, dy) >= current.threshold)
            await win.setPosition(
              new PhysicalPosition(
                Math.round(origin.x + dx * origin.scale),
                Math.round(origin.y + dy * origin.scale),
              ),
            );
        }
      })().catch((error) => console.warn('Toolkit drag failed', error));
  }
  /** @param {PointerEvent} e */
  function end(e) {
    if (gesture) {
      gesture.lastX = e.screenX;
      gesture.lastY = e.screenY;
    }
    gesture = null;
  }
  function blur() {
    gesture = null;
  }
  /** @param {MouseEvent} e */
  function click(e) {
    if (suppress && e.detail !== 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppress = false;
    }
  }
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  node.addEventListener('click', click, true);
  window.addEventListener('blur', blur);
  return {
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      node.removeEventListener('click', click, true);
      window.removeEventListener('blur', blur);
    },
  };
}
