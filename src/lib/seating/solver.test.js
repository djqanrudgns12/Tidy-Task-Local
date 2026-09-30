import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,relations,resizeLayout,clone} from './model.js';
import {solve,score,violations,validAssignments,allowsAssignmentChange} from './solver.js';

const students=Array.from({length:20},(_,i)=>({id:`p${i}`,number:i+1,name:`학생${i+1}`,gender:i%2?'female':'male',groupId:null}));

test('manual repairs can resolve new presets one at a time while keeping every already satisfied rule',()=>{
  const before=newDraft(20);before.assignments=Object.fromEntries(before.layout.seats.slice(0,20).map((s,i)=>[s.id,students[i].id]));
  const seats=before.layout.seats;
  before.rules=[{id:'z0',kind:'zone',students:['p0'],seatIds:[seats[22].id]},{id:'z1',kind:'zone',students:['p1'],seatIds:[seats[23].id]},{id:'fixed',kind:'fixed',students:['p2'],seatId:seats[2].id}];
  const first=clone(before);first.assignments[seats[22].id]='p0';delete first.assignments[seats[0].id];
  assert.ok(allowsAssignmentChange(before,first));assert.equal(validAssignments(first,students,true),false);
  const second=clone(first);second.assignments[seats[23].id]='p1';delete second.assignments[seats[1].id];
  assert.ok(allowsAssignmentChange(first,second));assert.ok(validAssignments(second,students,true));
  const broken=clone(first);broken.assignments[seats[20].id]='p2';delete broken.assignments[seats[2].id];
  assert.equal(allowsAssignmentChange(first,broken),false);
});

test('rearrangement preserves a customized footprint and vacancies across repeated solves and grid expansions',()=>{
  let draft=newDraft(20);
  draft.assignments=Object.fromEntries(draft.layout.seats.slice(0,20).map((s,i)=>[s.id,students[i].id]));
  draft.assignments[draft.layout.seats[22].id]=draft.assignments[draft.layout.seats[17].id];delete draft.assignments[draft.layout.seats[17].id];
  const footprint=Object.keys(draft.assignments).sort(),before=clone(draft.layout);
  for(const seed of [2,5,9,17]){
    const result=solve({draft,students,seed,budget:260});assert.ok(result.candidates.length);
    for(const candidate of result.candidates){assert.deepEqual(Object.keys(candidate.assignments).sort(),footprint);assert.ok(validAssignments({...draft,assignments:candidate.assignments},students,true));}
    assert.deepEqual(draft.layout,before);draft.assignments=result.candidates[0].assignments;
  }
  for(const axis of /** @type {const} */(['columns','rows'])){
    const grown=resizeLayout(draft,axis,1);assert.ok(grown);const result=solve({draft:grown,students,seed:7,budget:260});assert.ok(result.candidates.length);
    for(const candidate of result.candidates)assert.deepEqual(Object.keys(candidate.assignments).sort(),footprint);
  }
});

test('overlapping preset domains report impossible quickly without exponential reservation',()=>{
  const draft=newDraft(20),zone=draft.layout.seats.slice(0,8).map(s=>s.id);
  draft.rules=students.slice(0,9).map(p=>({id:`zone-${p.id}`,kind:'zone',students:[p.id],seatIds:zone}));
  const start=performance.now(),result=solve({draft,students,budget:260});
  assert.equal(result.status,'impossible');assert.ok(performance.now()-start<150);
});

test('partial rearrangement preserves every unselected student even at the back of the grid',()=>{
  const draft=newDraft(20);draft.assignments=Object.fromEntries(draft.layout.seats.slice(4).map((s,i)=>[s.id,students[i].id]));
  const result=solve({draft,students,only:['p0','p1','p2'],seed:3,budget:260});assert.ok(result.candidates.length);
  for(const candidate of result.candidates)for(const [seat,p] of Object.entries(draft.assignments))if(!['p0','p1','p2'].includes(p))assert.equal(candidate.assignments[seat],p);
});

test('a complete formation is kept when a new preset cannot fit it; failure never moves desks',()=>{
  const draft=newDraft(20);draft.assignments=Object.fromEntries(draft.layout.seats.slice(0,20).map((s,i)=>[s.id,students[i].id]));
  draft.rules=[{id:'z',kind:'zone',students:['p0'],seatIds:[draft.layout.seats[23].id]}];
  const before=clone(draft),result=solve({draft,students,budget:260});
  assert.equal(result.status,'impossible');assert.deepEqual(draft,before);assert.match(result.message,/대형/);
});

test('all proposed arrangements fill from the front and finish quickly',()=>{
  const draft=newDraft(students.length),started=performance.now();
  const result=solve({draft,students,seed:7,budget:260});
  assert.equal(result.candidates.length,3);
  const front=draft.layout.seats.slice(0,students.length).map(s=>s.id).sort();
  for(const candidate of result.candidates)assert.deepEqual(Object.keys(candidate.assignments).sort(),front);
  for(let i=0;i<result.candidates.length;i++)for(let j=i+1;j<result.candidates.length;j++){
    const changed=front.filter(seat=>result.candidates[i].assignments[seat]!==result.candidates[j].assignments[seat]).length;
    assert.ok(changed>=6,`배치 ${i+1}과 ${j+1} 사이에 ${changed}명만 달라졌어요.`);
  }
  assert.ok(performance.now()-started<700);
});

test('front filling still reserves a required seat',()=>{
  const draft=newDraft(students.length),last=draft.layout.seats.at(-1);
  assert.ok(last);draft.rules.push({id:'fixed',kind:'fixed',students:['p0'],seatId:last.id});
  const result=solve({draft,students,seed:11,budget:260});
  assert.ok(result.candidates.length);assert.equal(result.candidates[0].assignments[last.id],'p0');
});

test('a preset seat gives one recommendation and a student lock survives rearrangement',()=>{
  const draft=newDraft(students.length),preset=draft.layout.seats[0],locked=draft.layout.seats[1];
  draft.assignments[locked.id]='p1';
  draft.rules.push(
    {id:'preset',kind:'zone',students:['p0'],seatIds:[preset.id]},
    {id:'lock',kind:'fixed',students:['p1'],seatId:locked.id}
  );
  const result=solve({draft,students,seed:19,budget:260});
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].assignments[preset.id],'p0');
  assert.equal(result.candidates[0].assignments[locked.id],'p1');
});

test('diverse arrangements all keep new and previously optional teacher rules',()=>{
  const draft=newDraft(students.length);
  draft.rules.push(
    {id:'together',kind:'together',students:['p0','p1'],distance:'pair'},
    {id:'apart',kind:'apart',students:['p2','p3'],hard:false,distance:'near'},
    {id:'front',kind:'front',students:['p4']}
  );
  const result=solve({draft,students,seed:23,budget:260});
  assert.equal(result.candidates.length,3);
  for(const candidate of result.candidates)assert.deepEqual(violations({...draft,assignments:candidate.assignments}),[]);
});

test('a previously optional rule blocks manual completion and impossible rearrangements',()=>{
  const draft=newDraft(2);
  draft.rules.push({id:'apart',kind:'apart',students:['p0','p1'],hard:false,distance:'pair'});
  draft.assignments=Object.fromEntries(draft.layout.seats.slice(0,2).map((seat,i)=>[seat.id,students[i].id]));
  assert.deepEqual(violations(draft).map(rule=>rule.id),['apart']);
  assert.equal(validAssignments(draft,students.slice(0,2),true),false);
  draft.rules.push({id:'together',kind:'together',students:['p0','p1'],distance:'pair'});
  const result=solve({draft,students:students.slice(0,2),seed:9,budget:260});
  assert.equal(result.status,'impossible');
  assert.deepEqual(result.candidates,[]);
});

test('a rule cannot be silently skipped when its student is excluded',()=>{
  const draft=newDraft(2);
  draft.excluded=['p0'];
  draft.rules.push({id:'front',kind:'front',students:['p0']});
  assert.equal(validAssignments(draft,students.slice(0,2),true),false);
  assert.equal(solve({draft,students:students.slice(0,2),budget:260}).status,'impossible');
});

test('comparison uses the selected saved seat or the latest saved seat by default',()=>{
  const draft=newDraft(4),seats=draft.layout.seats;
  draft.assignments=Object.fromEntries(seats.map((seat,i)=>[seat.id,`p${i}`]));
  const other={...draft,assignments:Object.fromEntries(seats.map((seat,i)=>[seat.id,`p${[0,2,1,3][i]}`]))};
  const archives=[
    {id:'older',used:true,draft,relations:relations(draft),date:'2026-09-24',createdAt:1,title:'이전 자리',students:students.slice(0,4)},
    {id:'latest',used:true,draft:other,relations:relations(other),date:'2026-09-25',createdAt:2,title:'직전 자리',students:students.slice(0,4)}
  ];
  assert.equal(score(draft,students.slice(0,4),archives).repeated,0);
  assert.equal(score({...draft,comparisonArchiveId:'older'},students.slice(0,4),archives).repeated,relations(draft).pairs.length);
  assert.equal(score({...draft,comparisonArchiveId:'deleted',recent:20,groupPolicy:'keep'},students.slice(0,4),archives).repeated,0);
});
