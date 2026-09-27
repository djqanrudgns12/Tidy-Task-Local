/**
 * Fit names using the actual loaded font. Spend spare track width first, allow
 * at most a 16% reduction (never below 18px), then wrap greedily at full width.
 * If the readable text needs more height, grow the lanes instead of clipping it.
 * @param {HTMLElement} course
 * @param {string[]} names
 */
export function fitRaceNames(course, names) {
  let key = names.join('\u0000');
  let frame = 0;
  let disposed = false;
  let lastWidth = -1;
  const fit = () => {
    frame = 0;
    if (disposed || !course.clientWidth) return;
    course.style.removeProperty('--race-name');
    course.style.removeProperty('--race-row-min');
    const labels = [...course.querySelectorAll('.race-candidate b')];
    const first = course.querySelector('.vt-lane-label');
    const score = course.querySelector('.race-result');
    if (!first || !score || !labels.length) return;
    const baseWidth = first.getBoundingClientRect().width;
    const measured = labels.map((label) => {
      const node = /** @type {HTMLElement} */ (label);
      node.style.removeProperty('font-size');
      node.style.whiteSpace = 'nowrap';
      const size = parseFloat(getComputedStyle(node).fontSize);
      const range = document.createRange();
      range.selectNodeContents(node);
      const width = range.getBoundingClientRect().width;
      const cell = node.closest('.vt-lane-label');
      const inset = (cell?.getBoundingClientRect().width ?? baseWidth) - node.getBoundingClientRect().width;
      return { node, size, width, inset };
    });
    // Preserve a meaningful runway and a fixed, legible score column.
    const cap = Math.max(baseWidth, Math.min(course.clientWidth * .38, course.clientWidth - score.getBoundingClientRect().width - 220));
    const desired = Math.min(cap, Math.max(baseWidth, ...measured.map(m => m.width + m.inset + 2)));
    course.style.setProperty('--race-name', `${Math.ceil(desired)}px`);
    for (const { node, size, width } of measured) {
      const available = node.getBoundingClientRect().width;
      const floor = Math.max(18, size * .84);
      const single = Math.min(size, size * (available - 1) / Math.max(1, width));
      if (single >= floor) {
        node.style.fontSize = `${Math.floor(single * 4) / 4}px`;
      } else {
        node.style.whiteSpace = 'normal';
        // Prefer two generous lines; do not balance lines or break early.
        let fitted = size;
        node.style.fontSize = `${fitted}px`;
        while (fitted > floor && node.scrollHeight > parseFloat(getComputedStyle(node).lineHeight) * 2 + 1) {
          fitted = Math.max(floor, fitted - .5);
          node.style.fontSize = `${fitted}px`;
        }
      }
    }
    const minHeight = Math.max(...measured.map(({ node }) => {
      const cell = /** @type {HTMLElement} */ (node.closest('.vt-lane-label'));
      const style = getComputedStyle(cell);
      return (node.parentElement?.getBoundingClientRect().height ?? 0) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2;
    }));
    const baseHeight = course.closest('.dense') ? 36 : 62;
    course.style.setProperty('--race-row-min', `${Math.ceil(Math.max(baseHeight, minHeight))}px`);
    lastWidth = course.clientWidth;
  };
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(fit);
  };
  const observer = new ResizeObserver(() => {
    if (course.clientWidth !== lastWidth) schedule();
  });
  observer.observe(course);
  document.fonts.ready.then(schedule);
  document.fonts.addEventListener('loadingdone', schedule);
  schedule();
  return {
    /** @param {string[]} next */
    update(next) {
      const nextKey = next.join('\u0000');
      if (nextKey !== key) { key = nextKey; schedule(); }
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', schedule);
    },
  };
}
