/** @typedef {import('../windows/windowPlacement.js').MonitorGeometry} Monitor */
/** @typedef {{x:number,y:number}} Point */

/** 작업 표시줄 위의 클릭과 음수 좌표 모니터도 올바른 화면에 연결합니다.
 * @param {Point} point @param {Monitor[]} monitors */
export function menuMonitor(point, monitors) {
  const distance = (/** @type {Monitor} */ m) => Math.hypot(
    Math.max(m.bounds.x - point.x, 0, point.x - (m.bounds.x + m.bounds.width - 1)),
    Math.max(m.bounds.y - point.y, 0, point.y - (m.bounds.y + m.bounds.height - 1)),
  );
  return [...monitors].sort((a, b) => distance(a) - distance(b))[0] ?? null;
}

/** 모든 계산은 물리 픽셀입니다. 크기는 목적지 화면의 배율로 계산합니다.
 * @param {{point:Point, size:{width:number,height:number}, monitors:Monitor[], top?:number, gap?:number, position?:Point}} input */
export function menuPlacement({ point, size, monitors, top = point.y, gap = 0, position }) {
  const monitor = menuMonitor(point, monitors);
  if (!monitor) return null;
  const { work, scale } = monitor;
  const pad = Math.max(0, Math.min(Math.round(4 * scale), Math.floor((Math.min(work.width, work.height) - 1) / 2)));
  const left = Math.ceil(work.x + pad), upper = Math.ceil(work.y + pad);
  const right = Math.floor(work.x + work.width - pad), bottom = Math.floor(work.y + work.height - pad);
  const width = Math.max(1, Math.min(Math.ceil(size.width * scale), right - left));
  const height = Math.max(1, Math.min(Math.ceil(size.height * scale), bottom - upper));
  const below = point.y + gap * scale;
  const wanted = position ?? { x: point.x, y: below + height <= bottom ? below : top - gap * scale - height };
  const x = Math.round(Math.max(left, Math.min(wanted.x, right - width)));
  const y = Math.round(Math.max(upper, Math.min(wanted.y, bottom - height)));
  return { x, y, width, height, scale, monitor };
}
