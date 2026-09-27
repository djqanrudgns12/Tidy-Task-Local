import test from 'node:test';
import assert from 'node:assert/strict';
import {alignSeats,compactSeats,numbers,viewPoint,guideEdges} from './geometry.js';
import {makeLayout,publicBoard,newDraft,resizeLayout} from './model.js';
test('small desk drift stays on the original line without changing identities',()=>{
 const seats=makeLayout(20).seats;seats[11].y+=.4;const fixed=alignSeats(seats);
 assert.equal(numbers(fixed).ys.length,4);assert.equal(fixed[11].y,fixed[6].y);
 assert.deepEqual(fixed.map(s=>s.id),seats.map(s=>s.id));
 assert.equal(seats[11].y,seats[6].y+.4);
});
test('regular layouts include visible empty places and preserve a moved vacancy',()=>{
 const layout=makeLayout(20,'pairs',6);assert.equal(layout.seats.length,24);assert.equal(layout.columns,6);assert.equal(layout.rows,4);
 const draft=newDraft(20),first=draft.layout.seats[0].id,lastSeat=draft.layout.seats.at(-1);assert.ok(lastSeat);const last=lastSeat.id;draft.assignments[first]='p';draft.assignments[last]=draft.assignments[first];delete draft.assignments[first];
 assert.equal(draft.assignments[first],undefined);assert.equal(draft.assignments[last],'p');
});
test('grid resize preserves occupied seat identities and refuses too few places',()=>{
 const draft=newDraft(20);for(let i=0;i<20;i++)draft.assignments[draft.layout.seats[i].id]=`p${i}`;
 const occupied=new Set(Object.keys(draft.assignments)),wider=resizeLayout(draft,'columns',1);assert.ok(wider);assert.equal(wider.layout.columns,7);assert.equal(wider.layout.seats.length,28);assert.deepEqual(new Set(Object.keys(wider.assignments)),occupied);
 assert.equal(resizeLayout(draft,'rows',-1),null);
});
test('compact layout keeps all students in distinct stable cells in both perspectives',()=>{
 for(const shape of ['pairs','single','groups'])for(const n of [1,20,28,40]){
  const seats=compactSeats(makeLayout(n,shape).seats);
  assert.equal(new Set(seats.map(s=>`${s.x}:${s.y}`)).size,seats.length);
  const size={width:Math.max(...seats.map(s=>s.x+1.55)),height:Math.max(...seats.map(s=>s.y+1.55))};
  for(const s of seats){const round=viewPoint(viewPoint(s,size,true),size,true);assert.ok(Math.abs(s.x-round.x)<1e-8);assert.ok(Math.abs(s.y-round.y)<1e-8);}
 }
});
test('grid boundaries sit between desks',()=>{assert.deepEqual(guideEdges([1,2.2],1),[.88,2.1,3.3200000000000003]);assert.deepEqual(guideEdges([],1),[]);});
test('name and appearance follow roster gender and props are removed',()=>{
 const draft=newDraft(1);draft.assignments[draft.layout.seats[0].id]='p';draft.appearances.p='female';draft.layout.props=[{id:'x',kind:'plant',x:1,y:1}];
 const board=publicBoard(draft,[{id:'p',name:'가상학생',number:1,gender:'male',groupId:null}],'체험');
 assert.equal(board.seats[0].gender,'male');assert.equal(board.seats[0].appearance,'male');assert.deepEqual(board.props,[]);assert.equal('rules' in board,false);
});
