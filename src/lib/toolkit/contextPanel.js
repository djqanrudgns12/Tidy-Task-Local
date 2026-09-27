import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { native } from './store.js';
import { getMonitorGeometries } from '../windows/windowRegistry.js';
import { menuPlacement } from './menuPlacement.js';
import { applyMenuPlacement, fitContextPanel } from './windows.js';

const PREFERRED_SIZE = { width: 340, height: 640 };
/** 상단 손잡이만 패널을 이동시킵니다. 도구 정렬/스위치와는 별개의 제스처입니다.
 * @param {HTMLElement} node
 * @param {{enabled:boolean, ondrag:(active:boolean)=>void}} options */
export function contextPanel(node, options) {
  let disposed = false;
  /** @type {{id:number, x:number, y:number, startX:number, startY:number, revision:number, grabX:number, grabY:number, active:boolean, monitors:import('../windows/windowPlacement.js').MonitorGeometry[], origin:Promise<void>}|null} */
  let gesture = null;
  let frame = 0;
  let sequence = Promise.resolve();
  let pending = false;
  let correcting = false;
  let ending = false;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  /** @type {(()=>void)[]} */ const offs = [];
  const viewportMonitors = () => [{ bounds: { x:0, y:0, width:window.innerWidth, height:window.innerHeight }, work: { x:0, y:0, width:window.innerWidth, height:window.innerHeight }, scale:1 }];
  /** @param {NonNullable<ReturnType<typeof menuPlacement>>} placement */
  function previewPlacement(placement) {
    Object.assign(node.style, { position:'fixed', left:`${placement.x}px`, top:`${placement.y}px`, width:`${placement.width}px`, height:`${placement.height}px`, margin:'0', zIndex:'100' });
  }
  async function correct() {
    if (disposed || !options.enabled || gesture?.active || ending || correcting) return;
    correcting = true;
    try {
      if (native) await fitContextPanel();
      else {
        const rect = node.getBoundingClientRect();
        const placement = menuPlacement({ point:{x:rect.left,y:rect.top}, position:{x:rect.left,y:rect.top}, size:PREFERRED_SIZE, monitors:viewportMonitors() });
        if (placement) previewPlacement(placement);
      }
    } catch (error) { console.warn('[Toolkit panel] 화면 보정 실패:', error); }
    finally { correcting = false; }
  }
  function scheduleCorrection() {
    if (correcting || disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void correct(), 160);
  }
  /** @param {NonNullable<typeof gesture>} current */
  async function move(current) {
    await current.origin;
    if (disposed) return;
    const point = native ? await cursorPosition() : { x:current.x, y:current.y };
    const monitors = native ? current.monitors : viewportMonitors();
    const screen = menuPlacement({ point, size:PREFERRED_SIZE, monitors });
    if (!screen) return;
    const placement = menuPlacement({ point, size:PREFERRED_SIZE, monitors, position:{ x:point.x-current.grabX*screen.scale, y:point.y-current.grabY*screen.scale } });
    if (!placement) return;
    if (native) {
      const win = getCurrentWindow();
      const size = await win.outerSize();
      if (size.width !== placement.width || size.height !== placement.height) await applyMenuPlacement(win, placement);
      else await win.setPosition(new PhysicalPosition(placement.x, placement.y));
    } else previewPlacement(placement);
  }
  function queueMove() {
    if (pending || disposed || !gesture?.active) return;
    pending = true;
    frame = requestAnimationFrame(() => {
      const current = gesture;
      if (!current?.active) { pending = false; return; }
      const revision = current.revision;
      sequence = sequence.catch(() => {}).then(() => move(current))
        .catch(error => console.warn('[Toolkit panel] 이동 실패:', error))
        .finally(() => {
          pending = false;
          if (gesture === current && current.revision !== revision) queueMove();
        });
    });
  }

  /** @param {PointerEvent} event */
  function down(event) {
    if (!options.enabled || event.button !== 0 || event.isPrimary === false || gesture || ending) return;
    if (!(event.target instanceof Element) || !event.target.closest('[data-panel-drag]')) return;
    event.preventDefault();
    const rect = node.getBoundingClientRect();
    const current = { id:event.pointerId, x:event.clientX, y:event.clientY, startX:event.clientX, startY:event.clientY, revision:0, grabX:event.clientX-rect.left, grabY:event.clientY-rect.top, active:false, monitors:viewportMonitors(), origin:Promise.resolve() };
    if (native) current.origin = Promise.all([getCurrentWindow().outerPosition(), getCurrentWindow().innerPosition(), getCurrentWindow().scaleFactor(), getMonitorGeometries()]).then(([outer,inner,scale,monitors]) => {
      current.grabX = (inner.x-outer.x)/scale + event.clientX;
      current.grabY = (inner.y-outer.y)/scale + event.clientY;
      current.monitors = monitors;
    }).catch(error => { current.monitors = []; console.warn('[Toolkit panel] 화면 정보 읽기 실패:', error); });
    gesture = current;
    node.setPointerCapture(event.pointerId);
  }
  /** @param {PointerEvent} event */
  function pointerMove(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture.x = event.clientX; gesture.y = event.clientY; gesture.revision++;
    if (!gesture.active) {
      if (Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY) < 4) return;
      gesture.active = true;
      options.ondrag(true);
    }
    queueMove();
  }
  /** @param {PointerEvent} [event] */
  function end(event) {
    const current = gesture;
    if (!current || event && event.pointerId !== current.id) return;
    if (event) { current.x=event.clientX; current.y=event.clientY; }
    gesture = null;
    cancelAnimationFrame(frame); pending = false;
    if (node.hasPointerCapture(current.id)) node.releasePointerCapture(current.id);
    if (!current.active) return;
    ending = true;
    sequence = sequence.catch(() => {}).then(async () => {
      try { await move(current); }
      finally { ending = false; options.ondrag(false); await correct(); }
    }).catch(error => console.warn('[Toolkit panel] 이동 마무리 실패:', error));
  }
  const cancel = () => end();
  node.addEventListener('pointerdown',down);
  node.addEventListener('pointermove',pointerMove);
  node.addEventListener('pointerup',end);
  node.addEventListener('pointercancel',end);
  node.addEventListener('lostpointercapture',end);
  window.addEventListener('blur',cancel);
  window.addEventListener('resize',scheduleCorrection);
  if (options.enabled) {
    if (!native) void correct();
    else {
      const register = (/** @type {()=>void} */ off) => disposed ? off() : offs.push(off);
      void getCurrentWindow().onMoved(scheduleCorrection).then(register);
      void getCurrentWindow().onResized(scheduleCorrection).then(register);
      void getCurrentWindow().onScaleChanged(scheduleCorrection).then(register);
    }
  }
  return {
    /** @param {typeof options} next */ update(next) { options = next; },
    destroy() {
      disposed = true; cancel(); clearTimeout(timer); cancelAnimationFrame(frame); offs.forEach(off => off());
      node.removeEventListener('pointerdown',down); node.removeEventListener('pointermove',pointerMove); node.removeEventListener('pointerup',end); node.removeEventListener('pointercancel',end); node.removeEventListener('lostpointercapture',end);
      window.removeEventListener('blur',cancel); window.removeEventListener('resize',scheduleCorrection);
    },
  };
}
