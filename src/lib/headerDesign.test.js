import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHeaderDesignChoice } from './headerDesign.js';

test('live header choice updates only the target note and saves without undo history', async () => {
  /** @type {boolean[]} */
  const saved = [];
  const state = { headerDesign: 'classic', themeColor: 'amber', notes: 'keep', saveNow: async (/** @type {boolean} */ history) => { saved.push(history); } };
  const result = applyHeaderDesignChoice(state, { targetWindow: 'note-2', headerDesign: 'modern', themeColor: 'blue' }, 'note-2');
  assert.equal(state.headerDesign, 'modern');
  assert.equal(await result, true);
  assert.deepEqual(saved, [false]);
  assert.equal(state.themeColor, 'amber');
  assert.equal(state.notes, 'keep');
});

test('other windows and invalid design events do not change or save preferences', async () => {
  const state = { headerDesign: 'classic', saveNow: async () => { assert.fail('must not save'); } };
  for (const payload of [null, { targetWindow: 'other', headerDesign: 'modern' }, { targetWindow: 'main', headerDesign: 'invalid' }]) {
    assert.equal(await applyHeaderDesignChoice(state, payload, 'main'), false);
  }
  assert.equal(state.headerDesign, 'classic');
});
