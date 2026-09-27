import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.js';
import { broadcastSnapshot } from './broadcast.js';
import { stepCount, autoDelay } from './reveal.js';

const base = () => { const s = fixture('counting-broadcast').session; assert.ok(s); return s; };
/** @param {string[][]} picks */
function planned(picks) {
  const s = base();
  s.ballots = picks.map((p,i) => ({id:`b${i}`,p,a:p.length ? 0 : 1}));
  s.counting = { order:s.ballots.map(/** @param {import("./model.js").Ballot} b */ b=>b.id), cursor:0,agenda:0,revealed:[] };
  return s;
}

test('unpublished ballots never affect the broadcast headline or counts', () => {
  const s = base(), first = broadcastSnapshot(s,1);
  const hidden = new Set(s.counting.order.slice(first.shown));
  const changed = {...s,ballots:s.ballots.map(/** @param {import("./model.js").Ballot} b */ b=>hidden.has(b.id)?{...b,p:['c5'],a:0}:b)};
  assert.deepEqual(broadcastSnapshot(changed,1),first);
});
test('deltas are reproducible on resume and sum to new valid selections', () => {
  const s=base();
  for(let c=1;c<=stepCount(s);c++) {
    const now=broadcastSnapshot(s,c), before=broadcastSnapshot(s,c-1);
    assert.equal(now.rows.reduce((sum,r)=>sum+r.delta,0),now.valid-before.valid);
    assert.equal(now.batch,now.shown-before.shown);
    assert.equal(now.remaining+now.shown,now.total);
  }
});
test('ties include every leader, and zero counts never become leaders', () => {
  const s=planned([['c1'],['c2']]);
  assert.equal(broadcastSnapshot(s,0).leaders.length,0);
  const v=broadcastSnapshot(s,stepCount(s));
  assert.equal(v.leaders.length,2); assert.equal(v.gap,0);
  assert.match(v.headline,/공동 선두/);
});
test('all-abstain and empty sessions do not fabricate a leader or percentage', () => {
  for(const s of [planned([[],[]]),planned([])]) {
    const v=broadcastSnapshot(s,stepCount(s));
    assert.equal(v.valid,0); assert.equal(v.leaders.length,0); assert.equal(v.denominator,0);
    assert.ok(Number.isFinite(v.batch));
  }
});
test('a changed unique leader is reported without confusing ties for a takeover', () => {
  const s=planned([['c1'],['c2','c2']]);
  s.rules.allowRepeat=true; s.rules.votesPerVoter=2;
  assert.equal(broadcastSnapshot(s,2).changed,true);
  s.ballots[1].p=['c2'];
  assert.equal(broadcastSnapshot(s,2).changed,false);
});
test('multiple selections use valid votes, not ballot count as denominator', () => {
  const s=planned([['c1','c2'],['c1','c1'],[]]);
  const v=broadcastSnapshot(s,stepCount(s));
  assert.equal(v.shown,3); assert.equal(v.denominator,4); assert.equal(v.abstain,1);
});
test('yes/no denominator includes abstentions and each agenda starts fresh', () => {
  const s=fixture('counting-broadcast-yesno').session; assert.ok(s);
  for(let a=0;a<s.agendas.length;a++) {
    const v=broadcastSnapshot(s,stepCount(s),a);
    assert.equal(v.denominator,v.total); assert.equal(v.valid+v.abstain,v.total);
    const reset=broadcastSnapshot(s,0,a);
    assert.equal(reset.valid,0); assert.equal(reset.batch,0);
  }
});
test('broadcast late steps slow down even at fast speed and remain readable', () => {
  assert.ok(autoDelay('broadcast',10,12,'normal')>autoDelay('broadcast',2,12,'normal'));
  assert.ok(autoDelay('broadcast',2,12,'fast')>=1200);
});
