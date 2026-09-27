/** 주사위 자세 계산용 최소 도구 — 쿼터니언 [x, y, z, w]와 3×3 회전 행렬(행 우선).
 * 왜 오일러 각이 아니라 쿼터니언인가: 튀었다 굴렀다 하는 여러 구간을 이어 붙일 때, 오일러 각은 축이 겹치는 자세에서
 * 회전이 뒤틀리고 구간 경계에서 자세가 튑니다. 쿼터니언은 곱하기·보간이 어느 자세에서도 매끄럽습니다. */

const RAD = Math.PI / 180;

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {[number, number, number, number]} Quat */

/** @param {Vec3} v @returns {Vec3} */
export function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** 축(월드 기준)을 중심으로 deg만큼 도는 회전. 오른손 법칙(축이 나를 향하면 반시계). @param {Vec3} axis @param {number} deg @returns {Quat} */
export function axisAngle(axis, deg) {
  const [x, y, z] = normalize3(axis);
  const half = (deg * RAD) / 2;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
}

/** a·b — b를 먼저, 그다음 a를 적용한 회전. @param {Quat} a @param {Quat} b @returns {Quat} */
export function mul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** 두 자세 사이를 가장 짧은 길로 보간합니다. @param {Quat} a @param {Quat} b @param {number} t @returns {Quat} */
export function slerp(a, b, t) {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    // q와 -q는 같은 자세입니다. 반대편으로 돌아가는 먼 길을 피합니다.
    cos = -cos;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let wa = 1 - t;
  let wb = t;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    wa = Math.sin((1 - t) * angle) / sin;
    wb = Math.sin(t * angle) / sin;
  }
  const out = /** @type {Quat} */ ([wa * a[0] + wb * bx, wa * a[1] + wb * by, wa * a[2] + wb * bz, wa * a[3] + wb * bw]);
  const length = Math.hypot(...out) || 1;
  return /** @type {Quat} */ (out.map((c) => c / length));
}

/** 회전 행렬(행 우선 9개). 월드 = M · 주사위 자체 좌표. @param {Quat} q */
export function toMat3(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** @param {Quat} q @param {Vec3} v @returns {Vec3} */
export function rotate(q, v) {
  const m = toMat3(q);
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** 세 행으로 된 회전 행렬 → 쿼터니언. 행 = 주사위 자체 좌표의 어느 방향이 월드 x·y·z로 가는지.
 * @param {Vec3} row0 @param {Vec3} row1 @param {Vec3} row2 @returns {Quat} */
export function fromRows(row0, row1, row2) {
  const [m00, m01, m02] = row0;
  const [m10, m11, m12] = row1;
  const [m20, m21, m22] = row2;
  const trace = m00 + m11 + m22;
  /** @type {Quat} */ let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  const length = Math.hypot(...q) || 1;
  return /** @type {Quat} */ (q.map((c) => c / length));
}

/** 두 자세가 몇 도 차이 나는지(0~180). @param {Quat} a @param {Quat} b */
export function angleBetween(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot))) / RAD;
}
