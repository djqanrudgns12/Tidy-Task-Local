import test from 'node:test';
import assert from 'node:assert/strict';
import {createSuspense,suspensePose,sceneLayout,clawPose,dartPose} from './designs.js';
test('suspense varies routes and duration without visiting removed candidates',()=>{
 const routes=new Set();
 for(let n=1;n<=30;n++){
  let seed=n;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const plan=createSuspense([0,3,7],3,rng);assert.ok(plan.duration>=1900&&plan.duration<3200);
  assert.ok(plan.visits.length>=3&&plan.visits.length<=5);assert.ok(plan.visits.every(v=>[0,7].includes(v.slot)));
  routes.add(JSON.stringify(plan));
  for(const kind of /** @type {const} */ (['claw','balloon'])){
   const slots=sceneLayout(21,kind).slots,end=kind==='claw'?{x:330,y:95}:{x:500,y:180};
   assert.deepEqual(suspensePose(plan,plan.duration,slots,kind,end),end);
   for(let ms=0;ms<plan.duration;ms+=50){const p=suspensePose(plan,ms,slots,kind,end);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));}
  }
 }
 assert.equal(routes.size,30);
});
test('one remaining candidate still supports suspense and the final contact is exact',()=>{
 const plan=createSuspense([0],0,()=>.5),slots=sceneLayout(1,'claw').slots;
 assert.ok(plan.visits.every(v=>v.slot===0));assert.equal(clawPose(1900,0,slots).x,slots[0].x);
 const hit={x:317,y:229},dart=dartPose(1700,hit);assert.equal(dart.x,hit.x);assert.equal(dart.y,hit.y);
});
