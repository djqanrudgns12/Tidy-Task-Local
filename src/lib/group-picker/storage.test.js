import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clipStr,
  normalizePrefs,
  normalizeClasses,
  normalizeCustom,
  toHistoryEntry,
  SAFE_CLASSES_BYTES,
  MAX_RECENT_HISTORY,
  MAX_CLASSES,
  buildReplaceGroupsCommand,
} from './storage.js';

/** Rust scores.rs::check_data 재귀 검사기 미러(깊이 10, 문자열 200자, 배열 1000개).
 * @param {unknown} value @param {number} [depth] */
function assertScoresRsLimits(value, depth = 0) {
  assert.ok(depth <= 10, `depth ${depth} > 10`);
  if (typeof value === 'string') {
    assert.ok([...value].length <= 200, `string > 200 chars: ${value.length}`);
  } else if (Array.isArray(value)) {
    assert.ok(value.length <= 1000, `array > 1000 items: ${value.length}`);
    for (const item of value) assertScoresRsLimits(item, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) assertScoresRsLimits(v, depth + 1);
  }
}

test('normalized group-picker stores respect Rust scores.rs depth, string, array and byte limits', () => {
  const prefs = normalizePrefs({ lastMode: 'unknown', volume: 999, keepTotal: 'bad' });
  assert.equal(prefs.lastMode, 'train');
  assert.equal(prefs.volume, 60);
  assert.equal(prefs.keepTotal, false);
  assertScoresRsLimits(prefs);

  /** @type {Record<string, any>} */
  const overLongClasses = {};
  for (let c = 0; c < 65; c++) {
    overLongClasses[`class-${c}`] = {
      updatedAt: c,
      excludedIds: Array.from({ length: 60 }, (_, i) => `s-${i}`),
      recentHistory: Array.from({ length: 12 }, () => [
        Array.from({ length: 30 }, (_, i) => `s-${i}`),
        Array.from({ length: 20 }, (_, i) => `s-${i + 30}`),
      ]),
    };
  }
  const normalized = normalizeClasses({ items: overLongClasses });
  assert.equal(Object.keys(normalized.items).length, MAX_CLASSES);
  for (const entry of Object.values(normalized.items)) {
    assert.ok(entry.recentHistory.length <= MAX_RECENT_HISTORY);
  }
  assert.ok(JSON.stringify(normalized).length <= SAFE_CLASSES_BYTES);
  assertScoresRsLimits(normalized);

  const longLine = '가'.repeat(350);
  const custom = normalizeCustom({
    name: '나'.repeat(80),
    lines: Array.from({ length: 600 }, () => longLine),
  });
  assert.equal(clipStr(custom.name, 40).length, 40);
  assert.equal(custom.lines.length, 500);
  assertScoresRsLimits(custom);
});

test('buildReplaceGroupsCommand & toHistoryEntry preserve compact ID-only contract', () => {
  const groups = [
    { name: '해바라기모둠', studentIds: ['a', 'b'] },
    { name: '달빛모둠', studentIds: ['c', 'd'] },
  ];
  assert.deepEqual(toHistoryEntry(groups), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(buildReplaceGroupsCommand('cls-1', groups), {
    type: 'replaceGroups',
    classId: 'cls-1',
    groups: [
      { name: '해바라기모둠', studentIds: ['a', 'b'] },
      { name: '달빛모둠', studentIds: ['c', 'd'] },
    ],
  });
});
