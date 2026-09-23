import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, defaultPrefs, normalizePrefs, loadPrefs, savePrefs } from './preferences.js';

const memory = () => {
  /** @type {Map<string,string>} */ const data = new Map();
  return { data, getItem: (/** @type {string} */ k) => data.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => void data.set(k, v) };
};

test('defaults: one die, sound on, motion follows the OS', () => {
  assert.deepEqual(defaultPrefs(), { count: 1, sound: true, reduced: null });
  assert.deepEqual(loadPrefs(memory()).prefs, defaultPrefs());
  assert.deepEqual(loadPrefs(null).prefs, defaultPrefs());
});

test('saved choices survive a reload', () => {
  const storage = memory();
  assert.equal(savePrefs(storage, { count: 3, sound: false, reduced: true }), '');
  assert.deepEqual(loadPrefs(storage), { prefs: { count: 3, sound: false, reduced: true }, error: '' });
});

test('broken, foreign or future data falls back to defaults', () => {
  for (const text of ['{', '[]', '"x"', JSON.stringify({ version: 2, count: 3 })]) {
    const storage = memory();
    storage.data.set(STORAGE_KEY, text);
    assert.deepEqual(loadPrefs(storage).prefs, defaultPrefs(), text);
  }
  assert.deepEqual(normalizePrefs({ version: 1, count: '2', sound: 'yes', reduced: 0 }), defaultPrefs());
  assert.equal(normalizePrefs({ version: 1, count: 9 }).count, 3);
});

test('storage exceptions never escape', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  const loaded = loadPrefs(broken);
  assert.deepEqual(loaded.prefs, defaultPrefs());
  assert.ok(loaded.error);
  assert.ok(savePrefs(broken, defaultPrefs()));
});
