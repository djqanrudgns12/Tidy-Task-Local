import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldReportActivity } from './analyticsActivity.js';

test('activity throttles bursts but preserves minute and Korean midnight boundaries', () => {
  assert.equal(shouldReportActivity(-Infinity, 59000), true);
  assert.equal(shouldReportActivity(59000, 59999), false);
  assert.equal(shouldReportActivity(59000, 60000), true);
  assert.equal(shouldReportActivity(60000, 75000), true);
  const midnight = Date.parse('2026-09-18T00:00:00+09:00');
  assert.equal(shouldReportActivity(midnight - 1, midnight), true);
  assert.equal(shouldReportActivity(75000, 60000), true);
});
