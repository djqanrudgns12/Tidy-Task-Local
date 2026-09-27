// 투표 창 배치 계산(순수 함수). 실제 창 조작은 windows.js가 합니다.

/** @typedef {import('../windows/windowPlacement.js').MonitorGeometry} MonitorGeometry */

/** 점(물리 px)이 들어 있는 모니터 번호. 없으면 0. @param {MonitorGeometry[]} monitors @param {{x:number,y:number}} point */
export function monitorIndexAt(monitors, point) {
  const i = monitors.findIndex((m) => point.x >= m.bounds.x && point.x < m.bounds.x + m.bounds.width && point.y >= m.bounds.y && point.y < m.bounds.y + m.bounds.height);
  return i < 0 ? 0 : i;
}

/**
 * 투표판을 옮길 때의 크기·위치: 작업 영역의 82%×88%(툴킷 WIDE 규칙과 같음), 760×560 이상, 1680×1040 이하, 가운데.
 * @param {MonitorGeometry} m @returns {{logical:{width:number,height:number}, physical:{x:number,y:number}}}
 */
export function boardPlacement(m) {
  const areaW = m.work.width / m.scale;
  const areaH = m.work.height / m.scale;
  const width = Math.round(Math.min(Math.max(areaW * 0.82, 760), 1680, areaW - 48));
  const height = Math.round(Math.min(Math.max(areaH * 0.88, 560), 1040, areaH - 32));
  const x = Math.round(m.work.x + (m.work.width - width * m.scale) / 2);
  const y = Math.round(m.work.y + (m.work.height - height * m.scale) / 2);
  return { logical: { width, height }, physical: { x, y } };
}

/**
 * 선생님 창 배치: 투표판이 없는 모니터(있으면)의 오른쪽 가장자리, 세로 가운데. 모니터가 하나면 같은 모니터 오른쪽.
 * @param {MonitorGeometry[]} monitors @param {{x:number,y:number}} boardCenter 투표판 가운데(물리 px)
 * @returns {{logical:{width:number,height:number}, physical:{x:number,y:number}, otherMonitor:boolean}|null}
 */
export function teacherPlacement(monitors, boardCenter) {
  if (!monitors.length) return null;
  const boardIndex = monitorIndexAt(monitors, boardCenter);
  const otherIndex = monitors.findIndex((_, i) => i !== boardIndex);
  const m = monitors[otherIndex >= 0 ? otherIndex : boardIndex];
  const areaH = m.work.height / m.scale;
  const width = 440;
  const height = Math.round(Math.min(760, areaH - 32));
  const x = Math.round(m.work.x + m.work.width - (width + 24) * m.scale);
  const y = Math.round(m.work.y + (m.work.height - height * m.scale) / 2);
  return { logical: { width, height }, physical: { x, y }, otherMonitor: otherIndex >= 0 };
}
