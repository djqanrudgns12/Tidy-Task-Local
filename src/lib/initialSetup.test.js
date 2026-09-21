import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInitialSetupComplete,
  makeInitialSetupCompletion,
} from './initialSetup.js';

test('initial setup is incomplete until an explicit permanent completion exists', () => {
  for (const value of [null, false, {}, { completed: true }, { completionCount: 1 }]) {
    assert.equal(isInitialSetupComplete(value), false);
  }
  assert.equal(isInitialSetupComplete(true), true);
  assert.equal(isInitialSetupComplete({ completed: true, completionCount: 1 }), true);
});

test('completion is permanent across later app versions and stays counted once', () => {
  const first = /** @type {any} */ (makeInitialSetupCompletion(null, {
    mealStartup: true,
    toolkitEnabled: false,
    appVersion: '5.5.2',
  }, 100));
  const afterUpdate = /** @type {any} */ (makeInitialSetupCompletion(first, {
    mealStartup: false,
    toolkitEnabled: true,
    appVersion: '6.0.0',
  }, 200));
  assert.strictEqual(afterUpdate, first);
  assert.equal(afterUpdate.completionCount, 1);
  assert.equal(afterUpdate.appVersion, '5.5.2');
  assert.deepEqual(afterUpdate.choices, { mealStartup: true, toolkitEnabled: false });
});

test('completion stores only validated decisions', () => {
  const value = /** @type {any} */ (makeInitialSetupCompletion(null, {
    mealStartup: /** @type {any} */ ('yes'),
    toolkitEnabled: true,
    skipped: true,
  }, 123));
  assert.equal(value.completed, true);
  assert.equal(value.completionCount, 1);
  assert.equal(value.skipped, true);
  assert.deepEqual(value.choices, { mealStartup: null, toolkitEnabled: true });
});
