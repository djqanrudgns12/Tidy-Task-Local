import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimer,
  sampleTimer,
  transitionTimer as step,
  formatTime,
  sandFraction,
  MAX_MS,
} from './engine.js';
import { createAlarmTracker, alarmPlan } from './alarmPlan.js';
import { advanceAngle, sandHeights, sectorPath } from './geometry.js';
import {
  defaults,
  defaultPreferences,
  applySettingsPatch,
  normalizeSettings,
} from '../toolkit/preferences.js';

test('countdown uses elapsed clock time despite delayed renders', () => {
  const state = step(createTimer('digital', 60000), { type: 'start' }, 1000);
  assert.equal(sampleTimer(state, 12500).remainingMs, 48500);
  assert.equal(sampleTimer(state, 70000).phase, 'completed');
  assert.equal(sampleTimer(state, 70000).remainingMs, 0);
});
test('pause/resume excludes paused duration and keeps one run', () => {
  let s = step(createTimer('analog', 60000), { type: 'start' }, 1000);
  s = step(s, { type: 'pause' }, 21000);
  assert.equal(s.remainingMs, 40000);
  s = step(s, { type: 'start' }, 100000);
  assert.equal(s.runId, 1);
  assert.equal(sampleTimer(s, 110000).remainingMs, 30000);
});
test('adjustment samples first, clamps at 60min, and leaves reset duration alone', () => {
  let s = step(createTimer('digital', 300000), { type: 'start' }, 0);
  s = step(s, { type: 'adjust', ms: 60000 }, 10000);
  assert.equal(s.remainingMs, 350000);
  s = step(s, { type: 'adjust', ms: MAX_MS }, 11000);
  assert.equal(s.remainingMs, MAX_MS);
  s = step(s, { type: 'adjust', ms: -MAX_MS }, 12000);
  assert.equal(s.phase, 'completed');
  s = step(s, { type: 'reset' }, 13000);
  assert.equal(s.remainingMs, 300000);
  assert.equal(s.phase, 'ready');
});
test('ready adjustment changes original duration; paused adjustment does not resume', () => {
  let s = step(createTimer('hourglass'), { type: 'adjust', ms: 60000 }, 0);
  assert.equal(s.initialMs, 360000);
  s = step(s, { type: 'start' }, 0);
  s = step(s, { type: 'pause' }, 1000);
  s = step(s, { type: 'set', ms: 120000 }, 2000);
  assert.equal(s.phase, 'paused');
  assert.equal(s.initialMs, 360000);
});
test('completed countdown starts a new run only through restart', () => {
  let s = step(createTimer('digital', 1000), { type: 'start' }, 0);
  s = step(s, { type: 'start' }, 2000);
  assert.equal(s.phase, 'completed');
  s = step(s, { type: 'restart' }, 3000);
  assert.equal(s.runId, 2);
  assert.equal(s.remainingMs, 1000);
});
test('stopwatch laps contain cumulative and split times across pause', () => {
  let s = step(createTimer('stopwatch'), { type: 'start' }, 100);
  s = step(s, { type: 'record' }, 2100);
  s = step(s, { type: 'pause' }, 3100);
  s = step(s, { type: 'start' }, 10100);
  s = step(s, { type: 'record' }, 12100);
  assert.deepEqual(
    s.laps.map((l) => [l.elapsedMs, l.splitMs]),
    [
      [2000, 2000],
      [5000, 3000],
    ],
  );
  assert.equal(step(s, { type: 'reset' }, 12100).laps.length, 0);
});
test('independent windows have independent runtime and no restart restoration', () => {
  const a = step(createTimer('stopwatch'), { type: 'start' }, 0);
  const b = createTimer('stopwatch');
  assert.equal(sampleTimer(a, 5000).elapsedMs, 5000);
  assert.equal(sampleTimer(b, 5000).elapsedMs, 0);
  assert.equal(createTimer('stopwatch').laps.length, 0);
});
test('countdown rounds up; stopwatch truncates hundredths and supports hours', () => {
  assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(1001), '00:02');
  assert.equal(formatTime(3600129, true), '1:00:00.12');
});
test('hourglass conserves sand area and remaining fraction follows adjustments', () => {
  for (const f of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    const h = sandHeights(f);
    assert.ok(
      Math.abs(
        (7 * (h.upper / 108) + 75 * (h.upper / 108) ** 2 - 25 * (h.upper / 108) ** 3) / 57 - f,
      ) < 1e-8,
    );
    assert.ok(Math.abs((82 * (h.lower / 108) - 25 * (h.lower / 108) ** 3) / 57 - (1 - f)) < 1e-8);
  }
  assert.equal(sandFraction({ ...createTimer('hourglass'), elapsedMs: 300000 }), 0.5);
});
test('analog drag crosses twelve without jumping between empty and full', () => {
  assert.equal(advanceAngle(358, 358, 2), 360);
  assert.equal(advanceAngle(2, 2, 358), 0);
  assert.equal(advanceAngle(360, 2, 358), 356);
  assert.equal(sectorPath(0), '');
  assert.match(sectorPath(1), /A115/);
});
test('warning and end are scheduled from remaining time, not render count', () => {
  const tracker = createAlarmTracker(),
    prefs = defaultPreferences('digital');
  const s = step(createTimer('digital', 10000), { type: 'start' }, 0);
  assert.deepEqual(alarmPlan(s, prefs, tracker), {
    tick: true,
    endIn: 10,
    end: true,
    warningIn: 5,
    warningFor: 5,
  });
  assert.equal(alarmPlan(sampleTimer(s, 6000), prefs, tracker)?.warningFor, 4);
});
test('finite warning does not restart after pause or unrelated preference changes', () => {
  const t = createAlarmTracker(),
    p = { ...defaultPreferences('digital'), warningDurationSeconds: 2 };
  let s = step(createTimer('digital', 10000), { type: 'start' }, 0);
  alarmPlan(s, p, t);
  s = step(s, { type: 'pause' }, 6500);
  assert.equal(alarmPlan(s, p, t), null);
  s = step(s, { type: 'start' }, 20000);
  assert.equal(alarmPlan(s, p, t)?.warningFor, 0.5);
  assert.equal(alarmPlan(sampleTimer(s, 21000), { ...p, tickEnabled: false }, t)?.warningIn, null);
});
test('adding above threshold rearms warning; disabled sounds stay disabled', () => {
  const t = createAlarmTracker(),
    p = defaultPreferences('digital');
  let s = step(createTimer('digital', 4000), { type: 'start' }, 0);
  alarmPlan(s, p, t);
  s = step(s, { type: 'adjust', ms: 10000 }, 1000);
  assert.equal(alarmPlan(s, p, t)?.warningIn, 8);
  const plan = alarmPlan(
    s,
    { ...p, warningEnabled: false, endEnabled: false, tickEnabled: false },
    t,
  );
  assert.ok(plan);
  assert.equal(plan.warningIn, null);
  assert.equal(plan.end, false);
  assert.equal(plan.tick, false);
});
test('stopwatch has no warning/end schedule', () => {
  const s = step(createTimer('stopwatch'), { type: 'start' }, 0);
  assert.deepEqual(alarmPlan(s, defaultPreferences('stopwatch'), createAlarmTracker()), {
    tick: true,
    endIn: null,
    warningIn: null,
    warningFor: 0,
    end: false,
  });
});
test('preference patches merge only changed fields and isolate kinds', () => {
  let s = applySettingsPatch(defaults(), 'analog', { dialRangeMinutes: 30 });
  s = applySettingsPatch(s, 'analog', { tickEnabled: false });
  assert.equal(s.preferences.analog.dialRangeMinutes, 30);
  assert.equal(s.preferences.analog.tickEnabled, false);
  assert.equal(s.preferences.digital.tickEnabled, true);
  assert.equal(s.revision, 2);
  const snapshot = { ...s.preferences.analog };
  s = applySettingsPatch(s, 'analog', { tickEnabled: true });
  assert.equal(snapshot.tickEnabled, false);
});
test('persistent schema excludes all session data and refuses future versions', () => {
  for (const key of ['laps', 'remainingMs', 'title', 'alwaysOnTop'])
    assert.throws(() => applySettingsPatch(defaults(), 'digital', { [key]: 123 }));
  assert.throws(() => normalizeSettings({ schemaVersion: 2 }));
  assert.deepEqual(Object.keys(defaults().preferences.stopwatch), ['tickEnabled']);
});
