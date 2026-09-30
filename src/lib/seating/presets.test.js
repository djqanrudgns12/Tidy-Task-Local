import test from 'node:test';
import assert from 'node:assert/strict';
import { newDraft, resizeLayout, clone } from './model.js';
import { setPreset, loadPresets } from './presets.js';

test('moving one preset onto another swaps their places instead of silently deleting the other student',()=>{
  const original=newDraft(4),[a,b]=original.layout.seats;
  const first=setPreset(original,'p0',a.id);assert.ok(first);const d=setPreset(first,'p1',b.id);assert.ok(d);
  const before=clone(d),next=setPreset(d,'p0',b.id);assert.ok(next);
  assert.deepEqual(next.rules.find(r=>r.students[0]==='p0')?.seatIds,[b.id]);
  assert.deepEqual(next.rules.find(r=>r.students[0]==='p1')?.seatIds,[a.id]);assert.deepEqual(d,before);
});

test('presets reject disabled seats and locked students or seats; toggling removes duplicate legacy pins',()=>{
  const d=newDraft(4),[a,b]=d.layout.seats;
  a.active=false;assert.equal(setPreset(d,'p0',a.id),null);
  d.rules=[{id:'fixed',kind:'fixed',students:['p0'],seatId:b.id}];
  assert.equal(setPreset(d,'p1',b.id),null);assert.equal(setPreset(d,'p0',d.layout.seats[2].id),null);
  d.rules=[{id:'z1',kind:'zone',students:['p0'],seatIds:[b.id]},{id:'z2',kind:'zone',students:['p0'],seatIds:[b.id]}];
  const next=setPreset(d,'p0',d.layout.seats[2].id);assert.ok(next);assert.equal(next.rules.filter(r=>r.students[0]==='p0').length,1);
});

test('loading presets after widening maps actual seat identities instead of old array indices',()=>{
  const source=newDraft(20);source.assignments=Object.fromEntries(source.layout.seats.slice(0,20).map((s,i)=>[s.id,`p${i}`]));
  const wider=resizeLayout(source,'columns',1);assert.ok(wider);
  const loaded=loadPresets(wider,source,Object.values(source.assignments));assert.equal(loaded.count,20);
  for(const [seat,student] of Object.entries(source.assignments))assert.deepEqual(loaded.draft.rules.find(r=>r.students[0]===student)?.seatIds,[seat]);
});

test('loading a layout with different ids maps by row and column and respects locks',()=>{
  const source=newDraft(20),current=newDraft(20);
  source.assignments={[source.layout.seats[6].id]:'p0',[source.layout.seats[7].id]:'p1'};
  const wider=resizeLayout(current,'columns',1);assert.ok(wider);
  wider.rules=[{id:'f',kind:'fixed',students:['p2'],seatId:current.layout.seats[7].id}];
  const loaded=loadPresets(wider,source,['p0','p1','p2']);assert.equal(loaded.count,1);
  assert.deepEqual(loaded.draft.rules.find(r=>r.kind==='zone')?.seatIds,[current.layout.seats[6].id]);
});
