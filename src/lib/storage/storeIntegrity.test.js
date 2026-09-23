import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStoreMatchesDisk } from './storeIntegrity.js';

test('allows a genuinely empty first run', () => {
  assert.doesNotThrow(() => assertStoreMatchesDisk({ exists: false, keys: [], parse_ok: false }, []));
});

test('detects a missing main window even when other keys loaded', () => {
  assert.throws(
    () => assertStoreMatchesDisk({ exists: true, keys: ['main', 'updateState'], parse_ok: true }, ['updateState']),
    /main/,
  );
});

test('does not reject unsaved in-memory keys that are not on disk yet', () => {
  assert.doesNotThrow(() => assertStoreMatchesDisk(
    { exists: true, keys: ['main'], parse_ok: true },
    ['main', 'note-1'],
  ));
});

test('fails closed when disk health is unreadable or unavailable', () => {
  assert.throws(() => assertStoreMatchesDisk(null, []));
  assert.throws(() => assertStoreMatchesDisk({ exists: true, keys: [], parse_ok: false }, []));
});
