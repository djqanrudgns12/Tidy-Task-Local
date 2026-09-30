import test from 'node:test';
import assert from 'node:assert/strict';
import { newDraft, clone, reconcile, resizeLayout, reshapeLayout, makeLayout } from './model.js';
import { numbers } from './geometry.js';

const students=Array.from({length:21},(_,i)=>({id:`p${i}`,number:i+1,name:`학생${i+1}`,gender:'unspecified',groupId:null}));
const classroom={id:'c',name:'학급',revision:3,students,groups:[]};
function populated(){const d=newDraft(21);d.assignments=Object.fromEntries(d.layout.seats.slice(0,21).map((s,i)=>[s.id,students[i].id]));return d;}

test('reopening and roster synchronization preserve exact desk geometry, empty cells and settings',()=>{
  const d=populated(),last=d.layout.seats[23];
  d.assignments[last.id]=d.assignments[d.layout.seats[17].id];delete d.assignments[d.layout.seats[17].id];
  last.y+=.4;last.angle=90;last.locked=true;d.layout.seats[22].active=false;
  d.layout.props=[{id:'prop',kind:'plant',x:1,y:1}];d.excluded=['p20'];delete d.assignments[d.layout.seats[20].id];d.appearances.p0='female';
  d.rules=[{id:'zone',kind:'zone',students:['p0'],seatIds:[d.layout.seats[0].id,last.id]}];d.rosterRevision=classroom.revision;
  const before=clone(d);
  assert.deepEqual(reconcile(d,classroom),before);assert.deepEqual(d,before);
});

test('roster changes remove only obsolete student references and append seats only when needed',()=>{
  const d=populated(),before=clone(d.layout),c={...classroom,students:[...students.slice(1),{...students[0],id:'new'}]};
  d.excluded=['p0'];d.appearances={p0:'female',p1:'male'};d.rules=[{id:'r',kind:'front',students:['p0']}];
  const next=reconcile(d,c);
  assert.deepEqual(next.layout,before);assert.ok(!Object.values(next.assignments).includes('p0'));assert.deepEqual(next.rules,[]);assert.deepEqual(next.excluded,[]);assert.deepEqual(next.appearances,{p1:'male'});
  const more={...classroom,students:Array.from({length:29},(_,i)=>({...students[0],id:`p${i}`}))};
  const original=populated(),grown=reconcile(original,more);
  assert.equal(grown.layout.rows,5);
  for(const s of original.layout.seats)assert.deepEqual(grown.layout.seats.find(p=>p.id===s.id),s);
});

test('expanding each axis retains every seat at the same row and column with the same assignment and rules',()=>{
  for(const shape of ['pairs','single','groups']){
    const d=populated();d.layout=makeLayout(21,shape);d.assignments=Object.fromEntries(d.layout.seats.slice(0,21).map((s,i)=>[s.id,students[i].id]));
    d.rules=[{id:'f',kind:'fixed',students:['p12'],seatId:d.layout.seats[12].id},{id:'z',kind:'zone',students:['p1'],seatIds:[d.layout.seats[1].id]}];
    for(const axis of /** @type {const} */(['columns','rows'])){
      const grown=resizeLayout(d,axis,1);assert.ok(grown);const oldGrid=numbers(d.layout.seats),newGrid=numbers(grown.layout.seats);
      for(const seat of d.layout.seats){const kept=/** @type {import('./types').Seat|undefined} */(grown.layout.seats.find(s=>s.id===seat.id));assert.ok(kept);assert.deepEqual(kept,seat);assert.deepEqual(newGrid.at(kept),oldGrid.at(seat));}
      assert.deepEqual(grown.assignments,d.assignments);assert.deepEqual(grown.rules,d.rules);
      const roundTrip=resizeLayout(grown,axis,-1);assert.ok(roundTrip);assert.deepEqual(roundTrip,d);
    }
  }
});

test('shrinking relocates only students in removed cells and never silently relocates fixed or preset seats',()=>{
  const d=populated();
  const shrunk=resizeLayout(d,'columns',-1);assert.equal(shrunk,null);
  delete d.assignments[d.layout.seats[20].id];
  const next=resizeLayout(d,'columns',-1);assert.ok(next);assert.equal(Object.keys(next.assignments).length,20);assert.equal(new Set(Object.values(next.assignments)).size,20);
  for(const seat of d.layout.seats.filter(s=>numbers(d.layout.seats).at(s).x<6))assert.equal(next.assignments[seat.id],d.assignments[seat.id]||next.assignments[seat.id]);
  d.rules=[{id:'pin',kind:'zone',students:['p5'],seatIds:[d.layout.seats[5].id]}];
  assert.equal(resizeLayout(d,'columns',-1),null);
});

test('changing classroom shape retains seat identities and teacher constraints',()=>{
  const d=populated();d.rules=[{id:'fixed',kind:'fixed',students:['p0'],seatId:d.layout.seats[0].id}];
  const next=reshapeLayout(d,'groups',7,21);assert.ok(next);
  assert.deepEqual(next.assignments,d.assignments);assert.deepEqual(next.rules,d.rules);assert.equal(next.layout.shape,'groups');
  assert.equal(next.layout.seats.find(s=>s.id===d.layout.seats[0].id)?.angle,180);
});

test('a preset pointing to a disabled desk is retained for diagnosis instead of silently erased on reopen',()=>{
  const d=populated(),seat=d.layout.seats[23];seat.active=false;
  d.rules=[{id:'z',kind:'zone',students:['p0'],seatIds:[seat.id]}];
  assert.deepEqual(reconcile(d,classroom).rules,d.rules);
});
