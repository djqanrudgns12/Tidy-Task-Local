/**
 * 실제 입력과 프레임을 관찰합니다. 검수용 출력만 만들며 드래그 이벤트·좌표는 조작하지 않습니다.
 * @param {HTMLElement} root
 * @param {() => string[]} getIds
 * @param {() => number} getSaves
 * @param {(report: object) => void} report
 */
export function observeTodoSort(root, getIds, getSaves, report) {
  /** @type {any} */ let run = null;
  let frame = 0;
  function sample() {
    if (!run) return;
    const ghost = root.querySelector('[data-dnd-dragging]');
    const active = ghost && !ghost.hasAttribute('data-dnd-dropping');
    if (ghost) {
      const rect = ghost.getBoundingClientRect();
      run.frames++;
      run.maxHorizontalError = Math.max(run.maxHorizontalError, Math.abs(rect.left - run.left));
      run.maxWidthError = Math.max(run.maxWidthError, Math.abs(rect.width - run.width));
      run.yMin = Math.min(run.yMin, rect.top);
      run.yMax = Math.max(run.yMax, rect.top);
      if (active && !run.released && getIds().join(',') !== run.initialOrder) run.canonicalChangedDuringDrag = true;
      if (active && !run.released && getSaves() !== run.initialSaves) run.savedDuringDrag = true;
      run.sawGhost = true;
      if (run.samples.length < 160) run.samples.push({ x: rect.left, y: rect.top, width: rect.width, dropping: ghost.hasAttribute('data-dnd-dropping'), translate: getComputedStyle(ghost).translate, scale: getComputedStyle(ghost).scale });
    }
    for (const row of root.querySelectorAll('.todo-row:not([data-dnd-dragging])')) {
      for (const animation of row.getAnimations()) {
        if (animation.effect instanceof KeyframeEffect && animation.effect.getKeyframes().some(key => 'translate' in key || 'transform' in key)) {
          run.sawAdjacentAnimation = true;
          run.animationDuration = animation.effect.getTiming().duration;
        }
      }
    }
    if (run.sawGhost && !ghost) {
      report({ ...run, finalOrder: getIds().join(','), saves: getSaves() - run.initialSaves });
      run = null;
      return;
    }
    frame = requestAnimationFrame(sample);
  }
  /** @param {Event} event */
  function start(event) {
    const target = /** @type {Element} */ (event.target);
    if (!target.closest('.todo-drag-handle') || run) return;
    const row = target.closest('.todo-row');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    run = { left: rect.left, width: rect.width, frames: 0, maxHorizontalError: 0, maxWidthError: 0,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      yMin: rect.top, yMax: rect.top, initialOrder: getIds().join(','), initialSaves: getSaves(),
      canonicalChangedDuringDrag: false, savedDuringDrag: false, sawAdjacentAnimation: false,
      released: false, sawGhost: false, samples: [] };
    frame = requestAnimationFrame(sample);
  }
  const release = () => {
    if (!run) return;
    run.released = true;
    // 단순 클릭에는 드래그가 시작되지 않으므로 관찰도 끝냅니다.
    setTimeout(() => { if (run && !run.sawGhost) { cancelAnimationFrame(frame); run = null; } }, 100);
  };
  const key = (/** @type {KeyboardEvent} */ event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      if (run) { if (run.sawGhost) release(); }
      else start(event);
    }
    if (event.code === 'Escape') release();
  };
  root.addEventListener('pointerdown', start, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('keydown', key, true);
  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener('pointerdown', start, true);
    document.removeEventListener('pointerup', release, true);
    document.removeEventListener('keydown', key, true);
  };
}
