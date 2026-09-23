import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACE_ANGLES, FACE_PLACEMENT, MAX_ROLL_MS, REDUCED_MS, SIZE_MAX, SIZE_MIN, GAP_PER_SIZE,
  createRng, rollPlan, nextAngles, spinKeyframes, hopKeyframes, squashKeyframes, shadowKeyframes,
  restTransform, spinTransform, rollEndsAt, readableAt, landingAt, fitDieSize, slotOffset,
} from './motion.js';

// CSS 회전 행렬(y축이 아래를 향하는 CSS 좌표계). 변환 목록은 왼쪽부터 곱합니다.
const rad = (/** @type {number} */ d) => (d * Math.PI) / 180;
/** @type {Record<string,(a:number)=>number[][]>} */
const ROT = {
  rotateX: (a) => [[1, 0, 0], [0, Math.cos(rad(a)), -Math.sin(rad(a))], [0, Math.sin(rad(a)), Math.cos(rad(a))]],
  rotateY: (a) => [[Math.cos(rad(a)), 0, Math.sin(rad(a))], [0, 1, 0], [-Math.sin(rad(a)), 0, Math.cos(rad(a))]],
  rotateZ: (a) => [[Math.cos(rad(a)), -Math.sin(rad(a)), 0], [Math.sin(rad(a)), Math.cos(rad(a)), 0], [0, 0, 1]],
};
const mul = (/** @type {number[][]} */ m, /** @type {number[]} */ v) => m.map((row) => row.reduce((s, c, i) => s + c * v[i], 0));
/** 변환 문자열의 회전만 적용합니다(translateZ는 방향과 무관). @param {string} css @param {number[]} v */
function applyRotations(css, v) {
  const parts = [...css.matchAll(/(rotate[XYZ])\((-?[\d.]+)deg\)/g)];
  return parts.reduceRight((acc, [, fn, angle]) => mul(ROT[fn](Number(angle)), acc), v);
}
const close = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
const FRONT = [0, 0, 1];

test('each face placement and its landing angle bring that face to the front', () => {
  for (const value of [1, 2, 3, 4, 5, 6]) {
    const normal = applyRotations(FACE_PLACEMENT[/** @type {1} */ (value)], FRONT);
    assert.ok(close(applyRotations(restTransform(value, 0), normal), FRONT), `face ${value}`);
  }
});

test('opposite faces sum to seven, like a real die', () => {
  for (const value of [1, 2, 3]) {
    const a = applyRotations(FACE_PLACEMENT[/** @type {1} */ (value)], FRONT);
    const b = applyRotations(FACE_PLACEMENT[/** @type {1} */ (7 - value)], FRONT);
    assert.ok(close(a, b.map((x) => -x)), `${value} vs ${7 - value}`);
  }
});

test('rolls always continue forward from the last face and land on the chosen face', () => {
  const rng = createRng(7);
  for (let i = 0; i < 300; i++) {
    const from = { ...FACE_ANGLES[/** @type {1} */ ((i % 6) + 1)] };
    const value = ((i * 5) % 6) + 1;
    const [plan] = rollPlan(1, rng, false);
    const to = nextAngles(from, value, plan);
    assert.ok(to.x - from.x >= plan.turnsX * 360 && to.x - from.x < (plan.turnsX + 1) * 360);
    const dy = (to.y - from.y) * plan.dirY;
    assert.ok(dy >= plan.turnsY * 360 && dy < (plan.turnsY + 1) * 360);
    const normal = applyRotations(FACE_PLACEMENT[/** @type {1} */ (value)], FRONT);
    const at = `rotateX(${to.x}deg) rotateY(${to.y}deg)`;
    assert.ok(close(applyRotations(at, normal), FRONT), `value ${value}`);
  }
  assert.throws(() => nextAngles({ x: 0, y: 0 }, 7, rollPlan(1, rng, false)[0]));
});

test('same seed gives the same plan; plans differ per die', () => {
  assert.deepEqual(rollPlan(3, createRng(42), false), rollPlan(3, createRng(42), false));
  const [a, b, c] = rollPlan(3, createRng(42), false);
  assert.ok(a.delay < b.delay && b.delay < c.delay);
});

test('the last of three dice settles within 1.3s; reduced mode is a 200ms swap', () => {
  for (let seed = 0; seed < 500; seed++) {
    const plans = rollPlan(3, createRng(seed), false);
    assert.ok(rollEndsAt(plans) <= MAX_ROLL_MS);
    for (const p of plans) assert.ok(landingAt(p) < readableAt(p));
  }
  const reduced = rollPlan(3, createRng(1), true);
  assert.equal(rollEndsAt(reduced), REDUCED_MS);
  assert.ok(reduced.every((p) => p.delay === 0 && p.turnsX === 0));
});

test('keyframes are well formed and keep one transform function list', () => {
  const rng = createRng(3);
  for (const reduced of [false, true]) {
    const [plan] = rollPlan(1, rng, reduced);
    const from = { ...FACE_ANGLES[1], yaw: 0 };
    const to = nextAngles(from, 4, plan);
    const sets = [spinKeyframes(from, to, plan), hopKeyframes(plan, 180), squashKeyframes(plan), shadowKeyframes(plan, 180)];
    for (const frames of sets) {
      assert.equal(frames[0].offset, 0);
      assert.equal(frames.at(-1)?.offset, 1);
      for (let i = 1; i < frames.length; i++) assert.ok(frames[i].offset >= frames[i - 1].offset);
      const shapes = new Set(frames.map((f) => String(f.transform).replace(/\([^)]*\)/g, '()')));
      assert.equal(shapes.size, 1, [...shapes].join(' | '));
    }
    const spin = sets[0];
    assert.equal(spin.at(-1)?.transform, spinTransform(to.yaw, to.x, to.y, 0));
  }
});

test('die size fits the smallest window and never exceeds the cap', () => {
  // 최소 창(520×480)에서 제목줄·조작줄을 뺀 영역 ≈ 488×330
  for (const count of [1, 2, 3]) {
    const s = fitDieSize(count, 488, 330);
    assert.ok(s >= SIZE_MIN);
    assert.ok(count * s + (count - 1) * s * GAP_PER_SIZE <= 488 - 24);
  }
  assert.equal(fitDieSize(1, 1600, 1000), SIZE_MAX);
  assert.equal(fitDieSize(3, 10, 10), SIZE_MIN);
  assert.deepEqual([0, 1, 2].map((i) => slotOffset(i, 3, 100)), [-138, 0, 138]);
  assert.equal(slotOffset(0, 1, 100), 0);
});
