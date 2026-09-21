import test from 'node:test';
import assert from 'node:assert/strict';
import { randomIndex, shuffle, createSession, bucket, candidates, filterEntries, beginDraw, finishDraw, updateBucket, parseList } from './engine.js';
const entries = [{ id:'a', name:'같은이름', gender:'male' }, { id:'b', name:'같은이름', gender:'female' }, {id:'c',name:'미선택',gender:'unspecified'}];
test('rejection sampling rejects biased tail and handles boundaries', () => {
  let words = [0xffffffff, 0xfffffffe];
  assert.equal(randomIndex(3, () => words.shift() ?? 0), 2);
  assert.equal(randomIndex(1), 0);
  assert.throws(() => randomIndex(0));
  const counts = [0,0,0]; for (let i=0;i<300;i++) counts[randomIndex(3,()=>i)]++;
  assert.deepEqual(counts,[100,100,100]);
});
test('shuffle preserves each identity without mutating input', () => {
  const input=Array.from({length:500},(_,i)=>i); const result=shuffle(input,()=>0);
  assert.equal(new Set(result).size,500); assert.equal(input[0],0); assert.notDeepEqual(result,input);
});
test('draw locks, freezes winner and commits only once', () => {
  let s=beginDraw(createSession(),'class:a',entries,'claw',1,true,()=>0);
  const id=s.active?.id ?? ''; assert.throws(()=>beginDraw(s,'class:a',entries,'classic',1,true));
  assert.equal(Object.isFrozen(s.active?.winner),true);
  assert.equal(finishDraw(s,'wrong'),s);
  s=finishDraw(s,id); assert.equal(finishDraw(s,id),s);
  assert.equal(bucket(s,'class:a').history.length,1);
  assert.equal(candidates(filterEntries(entries,'male'),bucket(s,'class:a'),true).length,0);
  assert.equal(candidates(entries,bucket(s,'class:b'),true).length,3);
});
test('repeat off, undo and reset preserve correct exclusion and absence', () => {
  let s=createSession();
  for(let i=0;i<2;i++){ s=beginDraw(s,'k',entries,'classic',1,false,()=>0); s=finishDraw(s,s.active?.id ?? ''); }
  s=updateBucket(s,'k','undo'); assert.equal(candidates(entries,bucket(s,'k'),true).length,2);
  s=updateBucket(s,'k','exclude','c'); s=updateBucket(s,'k','reset');
  assert.deepEqual(candidates(entries,bucket(s,'k'),true).map(e=>e.id),['a','b']);
  assert.equal(candidates(entries,bucket(s,'k'),false).length,2);
});
test('all candidates exhausted, no implicit reset; distinct same names survive',()=>{
  let s=createSession(); for(let i=0;i<3;i++){s=beginDraw(s,'k',entries,'classic',1,true,()=>0);s=finishDraw(s,s.active?.id ?? '');}
  assert.throws(()=>beginDraw(s,'k',entries,'classic',1,true));
  assert.equal(new Set(bucket(s,'k').history.map(r=>r.winner.id)).size,3);
});
test('lists preserve punctuation, disclose duplicates and reject limits',()=>{
  assert.deepEqual(parseList(' A,B\n\n A,B \n C ').duplicates,['A,B']);
  assert.throws(()=>parseList(' ')); assert.throws(()=>parseList('a'.repeat(41)));
  assert.throws(()=>parseList(Array(501).fill('x').join('\n')));
});
