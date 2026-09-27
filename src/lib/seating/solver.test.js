import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,relations} from './model.js';
import {solve,score,violations,validAssignments} from './solver.js';

const students=Array.from({length:20},(_,i)=>({id:`p${i}`,number:i+1,name:`학생${i+1}`,gender:i%2?'female':'male',groupId:null}));

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
