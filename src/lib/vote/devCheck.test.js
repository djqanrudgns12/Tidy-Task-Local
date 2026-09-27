import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_DEFAULTS, CHECK_PRESETS, createCheckEntry } from './devCheck.js';
import { TYPES, VISIBILITIES, availableModes, normalizeSession } from './model.js';
import { blockingProblems } from './validate.js';
import { tallyItems, tallyYesNo } from './tally.js';
import { normalizeArchive, restoreEntry } from './archive.js';
import { createSection } from '../scores/section.js';

test('completed dev checks persist across reloads; replay keeps one record and new checks stay distinct', async () => {
  let persisted = { revision: 0, data: normalizeArchive(undefined) };
  const adapter = {
    readStore: async () => ({ sections: { archive: structuredClone(persisted) } }),
    /** @param {string} _store @param {string} _section @param {number} revision @param {ReturnType<typeof normalizeArchive>} data */
    writeSection: async (_store, _section, revision, data) => {
      assert.equal(revision, persisted.revision);
      persisted = { revision: revision + 1, data: structuredClone(data) };
      return persisted.revision;
    },
  };
  const open = () => createSection({ store: 'vote', section: 'archive', normalize: normalizeArchive, adapter });
  const archive = open();
  await archive.load();
  const entries = TYPES.map(type => createCheckEntry({ ...CHECK_DEFAULTS, type }, 'same-seed'));
  const reopenedCheck = createCheckEntry(CHECK_DEFAULTS, 'same-seed');
  assert.deepEqual(reopenedCheck.ballots, entries[0].ballots);
  assert.equal(new Set([...entries, reopenedCheck].map(e => e.id)).size, 4);
  for (const entry of [...entries, reopenedCheck]) {
    assert.equal(await archive.mutateAndConfirm(restoreEntry(entry, 0), a => a.entries.some(e => e.id === entry.id)), 'saved');
    assert.equal(await archive.mutateAndConfirm(restoreEntry(entry, 0), () => true), 'rejected');
  }
  await archive.settle();
  archive.dispose();
  const reloaded = open();
  await reloaded.load();
  assert.equal(reloaded.data.entries.length, 4);
  for (const entry of [...entries, reopenedCheck]) {
    const saved = reloaded.data.entries.find(e => e.id === entry.id);
    assert.ok(saved);
    assert.deepEqual(saved.ballots, entry.ballots);
    assert.deepEqual(saved.config.rules, entry.config.rules);
    assert.deepEqual(saved.config.reveal, entry.config.reveal);
    assert.deepEqual(saved.runoffs, []);
  }
  reloaded.dispose();
});

test('all supported type/disclosure/counting combinations create valid ballots at limits', () => {
  for (const type of TYPES) for (const visibility of VISIBILITIES[type]) for (const mode of availableModes(type, visibility)) {
    for (const voters of [2, 25, 60]) for (const repeat of [false, true]) for (const scenario of ['random', 'tie', 'equal', 'abstain', 'landslide', 'boundary', 'mixed']) {
      const e = createCheckEntry({ type, visibility, mode, voters, count: type === 'yesno' ? 5 : 9, votes: 5, repeat, scenario, longNames: true });
      assert.deepEqual(blockingProblems(e.config), []);
      assert.equal(e.config.reveal.mode, mode);
      assert.equal(e.config.reveal.visibility, visibility);
      const s = normalizeSession({ ...e.config, ballots: e.ballots, phase: 'voting' });
      assert.ok('ballots' in s);
      assert.equal(s.ballots.length, voters);
      if (type !== 'yesno') {
        const t = tallyItems(e.config, e.ballots);
        assert.equal(t.totalVotes + t.abstain, voters * e.config.rules.votesPerVoter);
      }
    }
  }
});

test('scenario presets produce their promised outcomes', () => {
  const entries = CHECK_PRESETS.map(p => createCheckEntry({ ...CHECK_DEFAULTS, ...p.patch }));
  const tie = tallyItems(entries[2].config, entries[2].ballots);
  assert.deepEqual(tie.tied, ['i1', 'i2']);
  const boundary = tallyItems(entries[3].config, entries[3].ballots);
  assert.deepEqual(boundary.rows.map(r => r.count), [12, 6, 6]);
  assert.deepEqual(boundary.winners, ['i1']);
  assert.deepEqual(boundary.tied, ['i2', 'i3']);
  assert.equal(new Set(tallyItems(entries[4].config, entries[4].ballots).rows.map(r => r.count)).size, 1);
  assert.equal(tallyItems(entries[5].config, entries[5].ballots).noneVoted, true);
  assert.equal(tallyItems(entries[6].config, entries[6].ballots).counts.i1, 120);
  const yesno = tallyYesNo(entries[7].config, entries[7].ballots);
  assert.equal(yesno[0].yes, 24);
  assert.equal(yesno[1].no, 24);
  assert.equal(yesno[2].tie, true);
  assert.equal(yesno[3].abstain, 24);
  assert.equal(yesno[4].yes, 13);
});

test('odd totals still make exact ties, and pass thresholds include the boundary', () => {
  for (const scenario of ['tie', 'equal']) {
    const e = createCheckEntry({ voters: 25, count: 9, votes: 5, scenario });
    const t = tallyItems(e.config, e.ballots);
    if (scenario === 'tie') assert.equal(t.counts.i1, t.counts.i2);
    else assert.equal(new Set(Object.values(t.counts)).size, 1);
  }
  for (const passRule of ['majority', 'twoThirds']) {
    const e = createCheckEntry({ type: 'yesno', voters: 25, scenario: 'threshold', passRule });
    const results = tallyYesNo(e.config, e.ballots);
    assert.ok(results.every(a => a.passed));
    assert.equal(results[0].yes, passRule === 'majority' ? 13 : 17);
  }
});
