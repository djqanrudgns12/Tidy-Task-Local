import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeThermometer } from './model.js';
import { adjustMini } from './miniActions.js';
import { normalizeDisplay } from './display.js';

const when = { today: '2026-09-28', now: 1790553600000, logId: 'mini-click' };
test('mini respects independent steps and records actual changes', () => {
  const t = { ...makeThermometer(), value: 4, upStep: 3, downStep: 2, linkSteps: false };
  const up = adjustMini(t, 1, when);
  assert.equal(up.value, 7);
  assert.equal(up.log.at(-1)?.id, when.logId);
  assert.equal(up.daily[when.today].up, 3);
  const down = adjustMini(up, -1, { ...when, logId: 'down' });
  assert.equal(down.value, 5);
  assert.equal(down.daily[when.today].down, 2);
  assert.equal(t.value, 4);
});
test('mini reaches a goal and stamps only once across repeated crossings', () => {
  let t = { ...makeThermometer(), value: 9, stages: [{ id: 's', at: 5, label: '함께', reached: false }] };
  t = adjustMini(t, 1, when);
  assert.equal(t.goalReached, true);
  assert.equal(t.stamps.count, 1);
  assert.equal(t.stages[0].reached, true);
  t = adjustMini(adjustMini(t, -1, when), 1, when);
  assert.equal(t.stamps.count, 1);
  assert.equal(adjustMini(t, 1, when).value, 10);
  assert.equal(adjustMini({ ...t, value: 0, allowBelowZero: false }, -1, when).value, 0);
  assert.equal(adjustMini({ ...t, value: 0, allowBelowZero: true }, -1, when).value, -1);
});
test('mini catches up an overdue reset before applying the teacher action', () => {
  const t = { ...makeThermometer(), value: 7, lastCooledOn: '2026-09-25', autoCool: { mode: /** @type {const} */ ('daily-reset'), amount: 1, weekdaysOnly: true } };
  const next = adjustMini(t, 1, when);
  assert.equal(next.value, 1);
  assert.equal(next.daily[when.today].up, 1);
});
test('pin defaults on and preserves explicit off when reopening', () => {
  assert.equal(normalizeDisplay(undefined).alwaysOnTop, true);
  assert.equal(normalizeDisplay({ alwaysOnTop: false }).alwaysOnTop, false);
});
