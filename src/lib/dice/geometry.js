/** 모서리가 둥근 정육면체(주사위 몸통) 한 덩어리의 꼭짓점 데이터 — DOM·WebGL 없이 숫자만 만듭니다.
 * 왜 면 6장이 아니라 한 덩어리인가: CSS로 둥근 면 6장을 세우면 둥근 모서리끼리 맞닿지 않아 꼭짓점에 구멍이 나고,
 * 그 틈을 메우는 심이 삐져나와 굴릴 때 띠·이중 테두리가 보였습니다. 한 덩어리 곡면은 어느 각도에서도 틈이 없습니다. */

/** 한 변을 2(중심에서 면까지 1)로 둔 좌표에서 모서리 반지름. 0.38 = 한 변의 19% — 예전 면 둥글기(21%)와 비슷하게 보이는 값. */
export const BEVEL = 0.38;

/** 면 배치(주사위 자체 좌표): 앞 1 / 뒤 6 / 위 2 / 아래 5 / 오른쪽 3 / 왼쪽 4. 마주보는 면의 합이 7입니다.
 * right·up은 그 면을 바깥에서 볼 때 그림의 오른쪽·위쪽입니다(right × up = normal). 결과 면이 정면에 올 때
 * 그림(하트·얼굴)이 똑바로 서도록 자세 계산이 이 표를 씁니다. */
export const FACE_FRAMES = Object.freeze({
  1: Object.freeze({ normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] }),
  6: Object.freeze({ normal: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] }),
  2: Object.freeze({ normal: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] }),
  5: Object.freeze({ normal: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] }),
  3: Object.freeze({ normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] }),
  4: Object.freeze({ normal: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] }),
});

/** 면 그림은 4×2 칸짜리 그림판 한 장에 모읍니다. 가로·세로가 2의 거듭제곱이어야 WebGL1에서도 밉맵(작게 볼 때 깨끗하게)이 됩니다. */
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 2;
/** @param {number} value 1~6 */
export const atlasCell = (value) => ({ column: (value - 1) % ATLAS_COLUMNS, row: Math.floor((value - 1) / ATLAS_COLUMNS) });

/** 한 축의 표본 위치(-1~1). 곡면(모서리)에 표본을 몰아 둥근 부분이 각지지 않게 하고, 평평한 가운데는 적게 둡니다.
 * @param {number} bevel @param {number} flatSegments @param {number} bevelSegments */
function samples(bevel, flatSegments, bevelSegments) {
  const inner = 1 - bevel;
  const out = [];
  for (let i = 0; i < bevelSegments; i++) out.push(-1 + (bevel * i) / bevelSegments);
  for (let i = 0; i < flatSegments; i++) out.push(-inner + (2 * inner * i) / flatSegments);
  for (let i = 0; i <= bevelSegments; i++) out.push(inner + (bevel * i) / bevelSegments);
  return out;
}

/** 둥근 정육면체. 정육면체 겉면의 점을 안쪽 상자로 끌어당긴 뒤 반지름만큼 밀어내면 모서리가 정확한 원기둥·구 조각이 됩니다.
 * 면이 바뀌는 경계의 점은 두 면에서 같은 위치·같은 법선이 나와 이음매가 보이지 않습니다.
 * @param {{bevel?: number, flatSegments?: number, bevelSegments?: number}} [options] */
export function roundedBox({ bevel = BEVEL, flatSegments = 6, bevelSegments = 8 } = {}) {
  const axis = samples(bevel, flatSegments, bevelSegments);
  const n = axis.length;
  const inner = 1 - bevel;
  const vertexCount = 6 * n * n;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(6 * (n - 1) * (n - 1) * 6);
  const clamp = (/** @type {number} */ v) => Math.max(-inner, Math.min(inner, v));
  let vertex = 0;
  let index = 0;
  for (const [key, frame] of Object.entries(FACE_FRAMES)) {
    const value = Number(key);
    const { column, row } = atlasCell(value);
    const base = vertex;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = axis[i];
        const b = axis[j];
        const p = [0, 1, 2].map((k) => frame.normal[k] + a * frame.right[k] + b * frame.up[k]);
        const c = p.map(clamp);
        const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const length = Math.hypot(d[0], d[1], d[2]) || 1;
        for (let k = 0; k < 3; k++) {
          normals[vertex * 3 + k] = d[k] / length;
          positions[vertex * 3 + k] = c[k] + (d[k] / length) * bevel;
        }
        // 그림판 좌표는 위가 0이라 up 방향(b)을 뒤집습니다.
        uvs[vertex * 2] = (column + (a + 1) / 2) / ATLAS_COLUMNS;
        uvs[vertex * 2 + 1] = (row + (1 - b) / 2) / ATLAS_ROWS;
        vertex++;
      }
    }
    // right·up 순서로 돌면 바깥에서 볼 때 반시계 방향 — WebGL 기본 앞면이라 뒷면 버리기가 맞게 동작합니다.
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const v0 = base + j * n + i;
        const v1 = v0 + 1;
        const v2 = v0 + n + 1;
        const v3 = v0 + n;
        indices.set([v0, v1, v2, v0, v2, v3], index);
        index += 6;
      }
    }
  }
  return { positions, normals, uvs, indices };
}
