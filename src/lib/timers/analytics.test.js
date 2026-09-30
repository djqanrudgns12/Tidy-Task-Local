import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, transitionTimer } from './engine.js';
import { timerAnalyticsEvents } from './analytics.js';

test('timer lifecycle counts real transitions, not repeated starts or samples', () => {
  let state = createTimer('digital', 1000);
  /** @param {string} type @param {number} now @param {string[]} expected @param {number} [ms] */
  const step = (type, now, expected, ms) => {
    const next = transitionTimer(state, { type, ms }, now);
    assert.deepEqual(timerAnalyticsEvents(state, next), expected);
    state = next;
  };
  step('start', 0, ['timer_started']);
  step('start', 100, []);
  step('pause', 200, ['timer_paused']);
  step('pause', 300, []);
  step('start', 400, ['timer_resumed']);
  step('sample', 1200, ['timer_completed']);
  step('sample', 1300, []);
  step('restart', 1400, ['timer_started']);
  step('adjust', 1500, ['timer_completed'], -1000);
  step('reset', 1600, []);
});

test('zero duration does not start; stopwatch does not complete', () => {
  const empty = createTimer('analog', 0);
  assert.deepEqual(timerAnalyticsEvents(empty, transitionTimer(empty, { type: 'start' }, 0)), []);
  const watch = transitionTimer(createTimer('stopwatch'), { type: 'start' }, 0);
  assert.deepEqual(timerAnalyticsEvents(watch, transitionTimer(watch, { type: 'sample' }, 86400000)), []);
  assert.deepEqual(timerAnalyticsEvents(watch, transitionTimer(watch, { type: 'record' }, 1000)), []);
});
