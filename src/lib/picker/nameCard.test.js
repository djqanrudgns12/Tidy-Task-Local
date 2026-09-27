import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingPlan, rollingStep, largestFit, ROLL_HOLD } from './nameCard.js';
import { DURATION } from './engine.js';

/** 시험마다 같은 순서가 나오도록 고정한 난수 */
const seeded = (seed = 7) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('이름 카드는 당첨자에서 멈추고, 멈춘 뒤 같은 시간만큼 쉰다', () => {
  for (const count of [2, 3, 5, 20, 30, 500]) for (const winner of [0, count - 1, Math.floor(count / 2)]) {
    const plan = rollingPlan(count, winner, DURATION.classic, seeded(count + winner));
    assert.equal(plan[0].at, 0);
    assert.equal(plan.at(-1)?.index, winner);
    assert.equal(plan.at(-1)?.at, DURATION.classic - ROLL_HOLD);
    assert.notEqual(plan.at(-2)?.index, winner, '멈추기 직전 장은 당첨자가 아니어야 멈춘 순간이 보입니다');
    for (let i = 1; i < plan.length; i++) {
      assert.ok(plan[i].at > plan[i - 1].at);
      assert.notEqual(plan[i].index, plan[i - 1].index, '같은 이름이 두 번 연속 나오면 안 됩니다');
      assert.ok(plan[i].index >= 0 && plan[i].index < count);
    }
  }
});

test('처음엔 빠르게, 끝에 갈수록 느리게 넘긴다', () => {
  const plan = rollingPlan(20, 4, DURATION.classic, seeded());
  const gaps = plan.slice(1).map((p, i) => p.at - plan[i].at);
  assert.ok(plan.length >= 12, `넘기는 장 수가 너무 적습니다: ${plan.length}`);
  assert.ok(gaps[0] < 80);
  assert.ok(/** @type {number} */ (gaps.at(-1)) > gaps[0] * 3);
});

test('적은 인원에서도 한 사람만 반복해 비치지 않는다', () => {
  const plan = rollingPlan(3, 0, DURATION.classic, seeded(3));
  const shown = new Set(plan.slice(0, -1).map((p) => p.index));
  assert.equal(shown.size, 3);
  assert.deepEqual(rollingPlan(1, 0, DURATION.classic).map((p) => p.index).filter((i) => i !== 0), []);
});

test('경과 시간으로 지금 보여 줄 장을 찾는다', () => {
  const plan = [{ at: 0, index: 3 }, { at: 100, index: 1 }, { at: 250, index: 2 }];
  assert.equal(rollingStep(plan, 0), 0);
  assert.equal(rollingStep(plan, 99), 0);
  assert.equal(rollingStep(plan, 100), 1);
  assert.equal(rollingStep(plan, 9999), 2);
});

test('글자 크기 맞춤은 들어가는 가장 큰 비율을 고르고, 끝까지 넘치면 알린다', () => {
  assert.deepEqual(largestFit(() => true), { scale: 1, fits: true });
  const found = largestFit((s) => s <= 0.62);
  assert.ok(found.fits && found.scale <= 0.62 && found.scale > 0.6);
  assert.deepEqual(largestFit(() => false), { scale: 0.3, fits: false });
});
