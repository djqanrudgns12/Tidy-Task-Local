import test from 'node:test';
import assert from 'node:assert/strict';
import { BEVEL, FACE_FRAMES, roundedBox, atlasCell, ATLAS_COLUMNS, ATLAS_ROWS } from './geometry.js';
import { fromRows, toMat3, mul, axisAngle, slerp, angleBetween, rotate } from './rotation.js';

test('face frames are right-handed (right × up = normal)', () => {
  for (const [value, { normal, right, up }] of Object.entries(FACE_FRAMES)) {
    const cross = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
    assert.deepEqual(cross.map((c) => c + 0), normal.map((c) => c + 0), `face ${value}`);
  }
});

test('rounded box is one closed smooth body: inside the cube, unit normals, rounded corners', () => {
  const { positions, normals, uvs, indices } = roundedBox();
  const count = positions.length / 3;
  assert.ok(count < 65536, 'Uint16 색인 범위');
  for (let i = 0; i < count; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    assert.ok(p.every((c) => Math.abs(c) <= 1 + 1e-6));
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5);
    // 곡면 위의 점: 안쪽 상자까지 거리가 정확히 반지름
    const inner = p.map((c) => Math.max(-(1 - BEVEL), Math.min(1 - BEVEL, c)));
    assert.ok(Math.abs(Math.hypot(p[0] - inner[0], p[1] - inner[1], p[2] - inner[2]) - BEVEL) < 1e-5);
    assert.ok(uvs[i * 2] >= 0 && uvs[i * 2] <= 1 && uvs[i * 2 + 1] >= 0 && uvs[i * 2 + 1] <= 1);
  }
  // 모든 삼각형이 바깥에서 볼 때 반시계(법선과 같은 쪽) — 뒷면 버리기가 앞면을 지우지 않게
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map((k) => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const area = Math.hypot(...cross);
    if (area > 1e-9) assert.ok(cross[0] * centre[0] + cross[1] * centre[1] + cross[2] * centre[2] > 0, `triangle ${i / 3}`);
  }
  // 꼭짓점 쪽은 구 조각: (1,1,1) 방향 가장 먼 점이 모서리 없이 둥급니다.
  let far = 0;
  for (let i = 0; i < count; i++) far = Math.max(far, (positions[i * 3] + positions[i * 3 + 1] + positions[i * 3 + 2]) / Math.sqrt(3));
  assert.ok(Math.abs(far - (Math.sqrt(3) * (1 - BEVEL) + BEVEL)) < 1e-3);
});

test('face seams share positions, so no cracks open between faces', () => {
  const { positions } = roundedBox();
  const key = (/** @type {number} */ i) => [0, 1, 2].map((k) => positions[i * 3 + k].toFixed(5)).join(',');
  const seen = new Map();
  for (let i = 0; i < positions.length / 3; i++) seen.set(key(i), (seen.get(key(i)) ?? 0) + 1);
  // 면 경계의 점은 두 면(꼭짓점은 세 면)에 똑같이 있어야 합니다.
  const shared = [...seen.values()].filter((n) => n > 1).length;
  assert.ok(shared > 0);
  assert.ok([...seen.values()].every((n) => n <= 3));
});

test('atlas cells are distinct and inside the 4×2 sheet', () => {
  const cells = [1, 2, 3, 4, 5, 6].map(atlasCell);
  assert.equal(new Set(cells.map((c) => `${c.column}:${c.row}`)).size, 6);
  assert.ok(cells.every((c) => c.column < ATLAS_COLUMNS && c.row < ATLAS_ROWS));
});

test('quaternion helpers agree with rotation matrices', () => {
  const q = mul(axisAngle([0, 1, 0], 30), axisAngle([1, 0, 0], -50));
  const m = toMat3(q);
  const back = fromRows([m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]);
  assert.ok(angleBetween(q, back) < 1e-6);
  assert.ok(Math.abs(angleBetween(slerp(q, back, 0.5), q)) < 1e-6);
  const v = rotate(axisAngle([0, 0, 1], 90), [1, 0, 0]);
  assert.ok(Math.abs(v[0]) < 1e-9 && Math.abs(v[1] - 1) < 1e-9);
  assert.ok(Math.abs(angleBetween(axisAngle([0, 1, 0], 0), axisAngle([0, 1, 0], 120)) - 120) < 1e-9);
});
