import test from 'node:test';
import assert from 'node:assert/strict';
import { springAt, springLinear, staggerDelay, DURATION } from './motion.js';

test('spring starts at 0, ends at 1 and overshoots only a little', () => {
  assert.equal(springAt(0), 0);
  assert.equal(springAt(1), 1);
  let peak = 0;
  for (let i = 1; i < 100; i++) peak = Math.max(peak, springAt(i / 100));
  assert.ok(peak > 1 && peak < 1.35, `peak=${peak}`);
  assert.ok(Math.abs(springAt(0.95) - 1) < 0.05);
  // 튀지 않게 하면 넘치지 않습니다.
  for (let i = 1; i < 100; i++) assert.ok(springAt(i / 100, { bounce: 0, settle: 8 }) <= 1.0001);
});

test('linear() string is well formed', () => {
  const css = springLinear(undefined, 20);
  assert.match(css, /^linear\(0, .*, 1\)$/);
  assert.equal(css.split(',').length, 21);
});

test('stagger keeps the whole wave within the budget', () => {
  assert.equal(staggerDelay(0, 1), 0);
  assert.ok(staggerDelay(39, 40) + DURATION.bump <= DURATION.wave);
  assert.equal(staggerDelay(3, 4), 90);
});
