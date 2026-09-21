/** Keep the whole floating toolbar inside the nearest monitor's work area.
 * All coordinates are physical pixels, including on mixed-DPI desktops.
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @param {import('../windows/windowPlacement.js').MonitorGeometry[]} monitors
 */
export function fitToolbarPosition(rect, monitors) {
  // Use the leading edge so expanding a dock does not move it to another screen.
  const distance = (/** @type {import('../windows/windowPlacement.js').MonitorGeometry} */ m) =>
    Math.hypot(Math.max(m.work.x - rect.x, 0, rect.x - (m.work.x + m.work.width - 1)),
      Math.max(m.work.y - rect.y, 0, rect.y - (m.work.y + m.work.height - 1)));
  const monitor = [...monitors].sort((a, b) => distance(a) - distance(b))[0];
  if (!monitor) return null;
  const { work } = monitor;
  return {
    x: Math.round(Math.max(work.x, Math.min(rect.x, work.x + work.width - rect.width))),
    y: Math.round(Math.max(work.y, Math.min(rect.y, work.y + work.height - rect.height))),
  };
}
/** 우클릭 메뉴 "좌표 초기화" — 툴바를 지금 보고 있는 모니터 작업영역 한가운데로 옮깁니다.
 * 왜 주 모니터가 아닌가: 우클릭했다는 건 툴바가 눈앞에 있다는 뜻이라, 프로젝터 쪽 화면에서
 *   누른 사람의 툴바가 다른 화면으로 사라지면 "없어졌다"고 느낍니다. 모니터는 툴바 중심과 가장 가까운 곳입니다.
 * @param {{x:number,y:number,width:number,height:number}} rect 물리 좌표
 * @param {import('../windows/windowPlacement.js').MonitorGeometry[]} monitors
 */
export function centerToolbarPosition(rect, monitors) {
  const cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2;
  const distance = (/** @type {import('../windows/windowPlacement.js').MonitorGeometry} */ m) =>
    Math.hypot(Math.max(m.work.x - cx, 0, cx - (m.work.x + m.work.width - 1)),
      Math.max(m.work.y - cy, 0, cy - (m.work.y + m.work.height - 1)));
  const monitor = [...monitors].sort((a, b) => distance(a) - distance(b))[0];
  if (!monitor) return null;
  const { work } = monitor;
  // 작업영역보다 큰 툴바는 왼쪽 위를 맞춰 손잡이(아이콘)가 화면 밖으로 나가지 않게 합니다.
  return {
    x: Math.round(work.x + Math.max(0, (work.width - rect.width) / 2)),
    y: Math.round(work.y + Math.max(0, (work.height - rect.height) / 2)),
  };
}
