import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceGate, createCombo, volumeGain, MERGE_MS, MAX_VOICES, COMBO_WINDOW_MS, COMBO_STEPS } from './audio.js';

test('same sound within 40ms is merged', () => {
  const gate = createVoiceGate();
  assert.ok(gate.allow('pop', 0, 100));
  assert.equal(gate.allow('pop', MERGE_MS - 1, 100), false);
  assert.ok(gate.allow('pop', MERGE_MS, 100));
  assert.ok(gate.allow('boop', MERGE_MS, 100));
});

test('at most four voices overlap', () => {
  const gate = createVoiceGate();
  const names = ['a', 'b', 'c', 'd', 'e'];
  const allowed = names.map((n) => gate.allow(n, 0, 1000));
  assert.deepEqual(allowed, [true, true, true, true, false]);
  assert.equal(allowed.filter(Boolean).length, MAX_VOICES);
  // 앞 소리가 끝나면 다시 낼 수 있습니다.
  assert.ok(gate.allow('e', 1001, 100));
});

test('combo climbs while tapping fast and resets after a pause', () => {
  const combo = createCombo();
  const steps = [0, 100, 200, 300, 400, 500, 600].map((t) => combo.next(t));
  assert.deepEqual(steps, [0, 1, 2, 3, 4, 4, 4]);
  assert.equal(Math.max(...steps), COMBO_STEPS - 1);
  assert.equal(combo.next(600 + COMBO_WINDOW_MS + 1), 0);
});

test('volume curve is perceptual and clamped', () => {
  assert.equal(volumeGain(0), 0);
  assert.equal(volumeGain(100), 1);
  assert.equal(volumeGain(50), 0.25);
  assert.equal(volumeGain(150), 1);
  assert.equal(volumeGain(-5), 0);
});
