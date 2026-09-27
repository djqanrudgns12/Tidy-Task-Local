import { tick } from 'svelte';

// 변환 중인 화면 좌표 대신 목록의 실제 자리 좌표를 써서 왕복 흔들림을 막습니다.
/** @param {string[]} order @param {string} id @param {number} center @param {Map<string, number>} centers @param {number} [deadband] */
export function orderAtCenter(order, id, center, centers, deadband = 6) {
  const next = [...order];
  let index = next.indexOf(id);
  if (index < 0) return next;
  while (index + 1 < next.length && center > (centers.get(next[index + 1]) ?? Infinity) + deadband) {
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    index++;
  }
  while (index > 0 && center < (centers.get(next[index - 1]) ?? -Infinity) - deadband) {
    [next[index], next[index - 1]] = [next[index - 1], next[index]];
    index--;
  }
  return next;
}

/** 다른 표시 영역으로 넘어가지 않도록 같은 영역의 행끼리만 이동합니다.
 * @param {string[]} order @param {string} id @param {number} center @param {Map<string, number>} centers @param {string[][]} [groups] */
export function groupedOrderAtCenter(order, id, center, centers, groups) {
  const group = groups?.find((ids) => ids.includes(id));
  if (!group) return orderAtCenter(order, id, center, centers);
  const moved = orderAtCenter(order.filter((item) => group.includes(item)), id, center, centers);
  let index = 0;
  return order.map((item) => group.includes(item) ? moved[index++] : item);
}

/** @typedef {{order:string[], groups?:string[][], disabled?:boolean, onpreview:(order:string[]|null)=>void, onactive:(id:string)=>void, oncommit:(order:string[])=>Promise<boolean>}} SortOptions */
/** @typedef {{id:string, row:HTMLElement, order:string[], initial:string[], pointerId:number, startX:number, startY:number, x:number, y:number, active:boolean, top:number, height:number, offset:number, lastFrame:number, lastPreview:number}} DragState */
/**
 * @param {HTMLElement} list
 * @param {SortOptions} options
 */
export function sortToolRows(list, options) {
  const body = /** @type {HTMLElement} */ (list.closest('[data-tool-scroll], .tk-settings-body'));
  /** @type {DragState|null} */ let drag = null;
  /** @type {HTMLElement|null} */ let ghost = null;
  let frame = 0;
  let finishing = false;
  let destroyed = false;
  const rows = () => [.../** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('[data-tool-order-id]'))];
  /** @param {string[]} a @param {string[]} b */
  const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
  /** @param {number} pointerId */
  const release = (pointerId) => {
    if (list.hasPointerCapture(pointerId)) list.releasePointerCapture(pointerId);
  };
  function clean() {
    cancelAnimationFrame(frame);
    ghost?.remove();
    ghost = null;
    if (!destroyed) {
      options.onactive('');
      options.onpreview(null);
    }
    finishing = false;
  }
  function start() {
    if (!drag) return;
    const row = drag.row;
    const rect = row.getBoundingClientRect();
    drag.top = rect.top;
    drag.height = rect.height;
    drag.offset = drag.startY - rect.top;
    drag.active = true;
    ghost = /** @type {HTMLElement} */ (row.cloneNode(true));
    ghost.removeAttribute('style');
    ghost.removeAttribute('data-tool-order-id');
    ghost.classList.add('tool-order-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    for (const child of ghost.querySelectorAll('[id]')) child.removeAttribute('id');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    body.append(ghost);
    if (row.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement)?.blur();
    options.onactive(drag.id);
    options.onpreview(drag.order);
    drag.lastFrame = performance.now();
    drag.lastPreview = drag.lastFrame;
    frame = requestAnimationFrame(step);
  }
  /** @param {number} now */
  function step(now) {
    if (!drag?.active || !ghost) return;
    const bounds = body.getBoundingClientRect();
    const elapsed = Math.min(32, now - drag.lastFrame);
    drag.lastFrame = now;
    const insideX = drag.x >= bounds.left - 24 && drag.x <= bounds.right + 24;
    if (insideX) {
      const edge = Math.min(48, bounds.height / 4);
      const speed = drag.y < bounds.top + edge ? -Math.min(480, (bounds.top + edge - drag.y) * 12)
        : drag.y > bounds.bottom - edge ? Math.min(480, (drag.y - bounds.bottom + edge) * 12) : 0;
      body.scrollTop += speed * elapsed / 1000;
    }
    const y = Math.max(bounds.top + 2, Math.min(drag.y - drag.offset, bounds.bottom - drag.height - 2));
    ghost.style.transform = `translate3d(0, ${y - drag.top}px, 0)`;
    if (insideX) {
      const listTop = list.getBoundingClientRect().top;
      const centers = new Map(rows().map((row) => [row.dataset.toolOrderId ?? '', listTop + row.offsetTop + row.offsetHeight / 2]));
      // 행 그림은 창 안에 유지하되, 끝자리 판정은 포인터 좌표로 해서 첫째·마지막 자리에도 닿게 합니다.
      const next = groupedOrderAtCenter(drag.order, drag.id, drag.y - drag.offset + drag.height / 2, centers, options.groups);
      if (!same(next, drag.order)) {
        drag.order = next;
        options.onpreview(next);
        drag.lastPreview = now;
      }
    }
    // 설정 창이 갑자기 닫혀도 툴바의 임시 순서가 남지 않도록 만료 시간을 갱신합니다.
    if (now - drag.lastPreview > 500) {
      options.onpreview(drag.order);
      drag.lastPreview = now;
    }
    frame = requestAnimationFrame(step);
  }
  /** @param {boolean} commit */
  async function finish(commit) {
    if (!drag || finishing) return;
    const current = drag;
    drag = null;
    finishing = true;
    cancelAnimationFrame(frame);
    release(current.pointerId);
    if (!current.active) { clean(); return; }
    if (!commit) options.onpreview(current.initial);
    await tick();
    if (destroyed) return;
    const land = () => {
      const target = rows().find((row) => row.dataset.toolOrderId === current.id);
      const destination = target?.getBoundingClientRect().top ?? current.top;
      if (!ghost || document.visibilityState !== 'visible') return Promise.resolve();
      const from = getComputedStyle(ghost).transform;
      // 취소·저장 실패로 다시 이동할 때 이전 정착 모션의 fill 값이 남지 않게 합니다.
      for (const animation of ghost.getAnimations()) animation.cancel();
      return ghost.animate([{ transform: from }, { transform: `translate3d(0, ${destination - current.top}px, 0)` }], { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }).finished.catch(() => {});
    };
    const saving = commit && !same(current.initial, current.order)
      ? Promise.resolve().then(() => options.oncommit(current.order)).catch(() => false)
      : Promise.resolve(true);
    try {
      const [, saved] = await Promise.all([land(), saving]);
      if (!saved && !destroyed) {
        options.onpreview(current.initial);
        await tick();
        if (!destroyed) await land();
      }
    }
    finally { clean(); }
  }
  /** @param {PointerEvent} event */
  function down(event) {
    if (event.button !== 0 || event.isPrimary === false || drag || finishing || options.disabled) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button:not(.tool-order-grip), input, [role="switch"], .external-tool-options')) return;
    const row = /** @type {HTMLElement|null} */ (target.closest('[data-tool-order-id]'));
    if (!row || !list.contains(row)) return;
    const id = row.dataset.toolOrderId;
    if (!id) return;
    event.preventDefault();
    list.setPointerCapture(event.pointerId);
    const order = [...options.order];
    drag = { id, row, order, initial: order, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, top: 0, height: 0, offset: 0, lastFrame: 0, lastPreview: 0 };
  }
  /** @param {PointerEvent} event */
  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5) start();
  }
  /** @param {PointerEvent} event */
  function up(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.active) {
      cancelAnimationFrame(frame);
      step(performance.now());
    }
    const bounds = body.getBoundingClientRect();
    void finish(event.clientX >= bounds.left - 24 && event.clientX <= bounds.right + 24 && event.clientY >= bounds.top - 32 && event.clientY <= bounds.bottom + 32);
  }
  const cancel = () => void finish(false);
  /** @param {PointerEvent} event */
  const pointerCancel = (event) => { if (event.pointerId === drag?.pointerId) cancel(); };
  /** @param {KeyboardEvent} event */
  const key = (event) => { if (event.key === 'Escape' && drag) { event.preventDefault(); cancel(); } };
  const visibility = () => { if (document.hidden) cancel(); };
  list.addEventListener('pointerdown', down);
  list.addEventListener('lostpointercapture', pointerCancel);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', pointerCancel);
  window.addEventListener('keydown', key);
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
  document.addEventListener('visibilitychange', visibility);
  return {
    /** @param {SortOptions} next */
    update(next) { options = next; },
    destroy() {
      destroyed = true;
      if (drag) { const id = drag.pointerId; drag = null; release(id); }
      clean();
      options.onpreview(null);
      list.removeEventListener('pointerdown', down);
      list.removeEventListener('lostpointercapture', pointerCancel);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
