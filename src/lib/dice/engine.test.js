import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COUNT, clampCount, rollFace, rollValues, formatResult, matchKind, spokenResult } from './engine.js';

test('count is clamped to 1..3 and junk falls back to the default of 1', () => {
  assert.equal(DEFAULT_COUNT, 1);
  assert.equal(clampCount(0), 1);
  assert.equal(clampCount(1), 1);
  assert.equal(clampCount(3), 3);
  assert.equal(clampCount(4), 3);
  assert.equal(clampCount(2.4), 2);
  assert.equal(clampCount(-7), 1);
  for (const junk of ['2', NaN, Infinity, null, undefined, {}]) assert.equal(clampCount(junk), 1);
});

test('every face 1..6 is reachable with equal share and the biased tail is rejected', () => {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 600; i++) counts[rollFace(() => i) - 1]++;
  assert.deepEqual(counts, [100, 100, 100, 100, 100, 100]);
  // 2^32 - 1은 6의 배수 경계를 넘으므로 버리고 다음 값(0 → 1)을 씁니다.
  const words = [0xffffffff, 0xfffffffc, 0];
  assert.equal(rollFace(() => words.shift() ?? 0), 1);
});

test('rollValues returns one value per die in 1..6', () => {
  assert.equal(rollValues(0).length, 1);
  assert.equal(rollValues(3).length, 3);
  assert.equal(rollValues(9).length, 3);
  for (let i = 0; i < 200; i++) for (const v of rollValues(3)) assert.ok(v >= 1 && v <= 6);
});

test('one die shows a single number; two or three show the sum expression', () => {
  assert.deepEqual(formatResult([5]), { terms: [5], total: 5, text: '5' });
  assert.deepEqual(formatResult([5, 2]), { terms: [5, 2], total: 7, text: '5 + 2 = 7' });
  assert.equal(formatResult([4, 2, 1]).text, '4 + 2 + 1 = 7');
  assert.equal(formatResult([6, 6, 6]).total, 18);
});

test('double needs both of two dice; triple needs all three; a pair among three is not special', () => {
  assert.equal(matchKind([3]), null);
  assert.equal(matchKind([3, 3]), 'double');
  assert.equal(matchKind([3, 4]), null);
  assert.equal(matchKind([2, 2, 2]), 'triple');
  assert.equal(matchKind([2, 2, 5]), null);
  assert.equal(matchKind([5, 2, 2]), null);
});

test('screen reader sentence reads count, terms, total and match once', () => {
  assert.equal(spokenResult([5]), '주사위 1개, 5');
  assert.equal(spokenResult([5, 2]), '주사위 2개, 5 더하기 2, 합계 7');
  assert.equal(spokenResult([4, 4]), '주사위 2개, 4 더하기 4, 합계 8, 더블');
  assert.equal(spokenResult([1, 1, 1]), '주사위 3개, 1 더하기 1 더하기 1, 합계 3, 트리플');
});
