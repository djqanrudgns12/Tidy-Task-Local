import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ROLL_MS, REDUCED_MS, SIZE_MAX, SIZE_MIN, GAP_PER_SIZE, SQUINT_MS, RESULT_WIDTH, RESULT_MIN_PX, HINT_EM,
  createRng, rollPlan, restQuat, supportHeight, frontFace, timeline, buildRoll, poseAt, restPose,
  rollEndsAt, readableAt, impactsOf, fitDieSize, slotOffset, equationUnits, fitResultSize,
} from './motion.js';
import { FACE_FRAMES } from './geometry.js';
import { rotate, angleBetween, axisAngle, mul } from './rotation.js';

const close3 = (/** @type {number[]} */ a, /** @type {number[]} */ b, eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < eps);
const VALUES = [1, 2, 3, 4, 5, 6];

test('each value lands face-front with its picture upright, even with a small resting yaw', () => {
  for (const value of VALUES) {
    const frame = FACE_FRAMES[/** @type {1} */ (value)];
    const q = restQuat(value, 0);
    assert.ok(close3(rotate(q, /** @type {any} */ (frame.normal)), [0, 0, 1]), `face ${value} front`);
    assert.ok(close3(rotate(q, /** @type {any} */ (frame.up)), [0, 1, 0]), `face ${value} upright`);
    assert.equal(frontFace(restQuat(value, 4)), value);
    assert.equal(frontFace(restQuat(value, -4)), value);
  }
  assert.throws(() => restQuat(7));
});

test('opposite faces sum to seven, like a real die', () => {
  for (const value of [1, 2, 3]) {
    const a = FACE_FRAMES[/** @type {1} */ (value)].normal;
    const b = FACE_FRAMES[/** @type {1} */ (7 - value)].normal;
    assert.ok(close3(a, b.map((x) => -x)), `${value} vs ${7 - value}`);
  }
});

test('support height: flat = 1, on an edge and on a corner the centre rises', () => {
  assert.ok(Math.abs(supportHeight(restQuat(3, 0)) - 1) < 1e-9);
  const edge = supportHeight(axisAngle([1, 0, 0], 45));
  const corner = supportHeight(mul(axisAngle([1, 0, 0], 35.264), axisAngle([0, 0, 1], 45)));
  assert.ok(edge > 1.2 && edge < 1.3, `edge ${edge}`);
  assert.ok(corner > edge && corner < 1.5, `corner ${corner}`);
});

/** 여러 씨앗·출발 면·결과 면 조합의 대본 */
function* scripts(count = 240) {
  const rng = createRng(11);
  for (let i = 0; i < count; i++) {
    const [plan] = rollPlan(1, rng, false);
    const from = restQuat((i % 6) + 1, (i % 9) - 4);
    const value = ((i * 5) % 6) + 1;
    yield { plan, from, value, script: buildRoll(from, value, plan) };
  }
}

test('a roll starts exactly where the die rests and ends exactly on the chosen face', () => {
  for (const { from, value, script, plan } of scripts()) {
    const start = poseAt(script, 0);
    const end = poseAt(script, script.total);
    assert.ok(angleBetween(start.q, from) < 1e-4);
    assert.ok(angleBetween(end.q, restQuat(value, plan.restYaw)) < 1e-4, `value ${value}`);
    assert.equal(frontFace(end.q), value);
    assert.ok(Math.abs(end.y - 0.5) < 1e-9 && end.sx === 1 && end.sy === 1 && end.x === 0);
    // 결과 칩을 채우는 순간(마지막으로 누운 순간)에도 이미 결과 면이 정면입니다.
    assert.equal(frontFace(poseAt(script, script.tl.readable).q), value);
  }
});

test('motion is continuous: no teleporting between segments, and it keeps tumbling hard in the air', () => {
  for (const { script } of scripts(80)) {
    let prev = poseAt(script, 0);
    let fastest = 0;
    for (let t = 1; t <= script.total; t++) {
      const pose = poseAt(script, t);
      const turn = angleBetween(prev.q, pose.q);
      fastest = Math.max(fastest, turn);
      assert.ok(turn < 4, `turned ${turn.toFixed(2)}° in 1ms at ${t}ms`);
      assert.ok(Math.abs(pose.y - prev.y) < 0.02, `jumped ${(pose.y - prev.y).toFixed(3)} at ${t}ms`);
      prev = pose;
    }
    // 첫 비행은 초당 1000° 이상 — "더 구르는" 느낌의 기준
    assert.ok(fastest > 1, `fastest ${fastest}`);
  }
});

test('the die never sinks into the floor, touches it at every impact and flies at a sensible height', () => {
  for (const { script } of scripts(80)) {
    let highest = 0;
    for (let t = 0; t <= script.total; t += 2) {
      const pose = poseAt(script, t);
      assert.ok(pose.y >= supportHeight(pose.q) / 2 - 1e-9, `below floor at ${t}`);
      highest = Math.max(highest, pose.y);
    }
    for (const hit of script.tl.impacts) {
      const pose = poseAt(script, hit.at);
      assert.ok(Math.abs(pose.y - supportHeight(pose.q) / 2) < 0.02, `not touching at ${hit.at}`);
    }
    // 무대 높이(한 변의 2.3배) 안: 바닥 여백 0.26 + 중심 높이 + 중심에서 꼭짓점까지 최대 0.75
    assert.ok(highest > 0.9 && 0.26 + highest + 0.75 < 2.3, `highest ${highest}`);
  }
});

test('squint shows only while crouching; squash settles back to the true shape', () => {
  const [{ script }] = scripts(1);
  assert.equal(poseAt(script, 0).squint, true);
  assert.equal(poseAt(script, SQUINT_MS + 1).squint, false);
  const crouch = poseAt(script, 100);
  assert.ok(crouch.sy < 0.9 && crouch.sx > 1.05);
  const afterFirstHit = poseAt(script, script.tl.impacts[0].at + 50);
  assert.ok(afterFirstHit.sy < 0.9);
});

test('impacts get softer, the result is readable before it stops, and three dice stop within the limit', () => {
  for (let seed = 0; seed < 500; seed++) {
    const plans = rollPlan(3, createRng(seed), false);
    assert.ok(rollEndsAt(plans) <= MAX_ROLL_MS, `seed ${seed}: ${rollEndsAt(plans)}`);
    for (const plan of plans) {
      const hits = impactsOf(plan);
      assert.ok(hits.length >= 4);
      for (let i = 1; i < hits.length; i++) assert.ok(hits[i].at > hits[i - 1].at);
      for (let i = 1; i < 3; i++) assert.ok(hits[i].strength < hits[i - 1].strength);
      assert.ok(hits.at(-1)?.at === readableAt(plan));
      assert.ok(timeline(plan).total >= 1250, '예전(1.05초)보다 조금 길게');
    }
  }
  const reduced = rollPlan(3, createRng(1), true);
  assert.equal(rollEndsAt(reduced), REDUCED_MS);
  assert.ok(reduced.every((p) => p.delay === 0 && impactsOf(p).length === 0));
});

test('reduced mode swaps the face at the midpoint without moving', () => {
  const [plan] = rollPlan(1, createRng(5), true);
  const from = restQuat(2, 0);
  const script = buildRoll(from, 6, plan);
  assert.ok(angleBetween(poseAt(script, 0).q, from) < 1e-4);
  assert.equal(frontFace(poseAt(script, REDUCED_MS / 2 + 1).q), 6);
  assert.ok(poseAt(script, REDUCED_MS / 2).opacity < 0.5);
  assert.deepEqual(poseAt(script, REDUCED_MS), { ...restPose(script.final), squint: false });
});

test('same seed gives the same plan; dice start one after another', () => {
  assert.deepEqual(rollPlan(3, createRng(42), false), rollPlan(3, createRng(42), false));
  const [a, b, c] = rollPlan(3, createRng(42), false);
  assert.ok(a.delay < b.delay && b.delay < c.delay);
  // 좌우로 흩어지는 방향은 한 번 던질 때 모두 같습니다(이웃과 엇갈리지 않게).
  assert.ok(Math.sign(a.drift) === Math.sign(b.drift) && Math.sign(b.drift) === Math.sign(c.drift));
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

test('result panel keeps "a + b + c = total" on one line at every window width', () => {
  const w = RESULT_WIDTH;
  assert.equal(equationUnits(1), w.total);
  assert.ok(Math.abs(equationUnits(3) - (3 * w.chip + 3 * w.op + w.total + 6 * w.gap)) < 1e-12);
  for (let width = 440; width <= 2600; width += 7) {
    for (const count of [1, 2, 3]) {
      const size = fitDieSize(count, width, 600);
      const { total, panel, hint } = fitResultSize(count, width, size);
      const inner = (equationUnits(count) + 2 * w.pad) * total + 2;
      assert.ok(inner <= panel + 1e-9, `${count}개 ${width}px: 수식 ${inner} > 패널 ${panel}`);
      assert.ok(panel <= width, `${count}개 ${width}px: 패널 ${panel} > 창 ${width}`);
      assert.ok(HINT_EM * hint + 2 * w.pad * total + 2 <= panel + 1e-9, '안내 문구도 한 줄');
      assert.ok(total <= Math.max(RESULT_MIN_PX, size * 0.55));
    }
  }
  // 최소 창에서도 합계가 교실 뒤에서 읽힐 크기
  assert.ok(fitResultSize(3, 488, fitDieSize(3, 488, 330)).total >= RESULT_MIN_PX);
  // 넓은 창에서는 주사위 크기에 비례(0.55배)
  assert.equal(fitResultSize(1, 1400, 200).total, 110);
});
