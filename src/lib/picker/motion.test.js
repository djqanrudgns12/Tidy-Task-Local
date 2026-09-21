import test from 'node:test';
import assert from 'node:assert/strict';
import {TOYS,BALLOONS,clawPose,toySlots,sceneLayout,balloonPosition,dartPose} from './designs.js';
test('six real silhouettes per collection, grip and flight contacts stay connected',()=>{
  assert.equal(new Set(TOYS.map(x=>x.src)).size,6); assert.equal(new Set(BALLOONS.map(x=>x.path)).size,6);
  for(let i=0;i<4;i++){const p=clawPose(1900,i);assert.equal(p.x,toySlots[i].x);assert.equal(p.y,270);assert.equal(p.held,true);}
  for(let i=0;i<8;i++){const hit=balloonPosition(i,12000,3);const dart=dartPose(1700,hit);assert.equal(dart.x,hit.x);assert.equal(dart.y,hit.y);}
  assert.equal(clawPose(4300,2).released,true);
});
test('20, 25, 30 candidates adapt density and preserve every contact',()=>{
  for(const count of [1,8,20,25,30])for(const kind of ['claw','balloon']){
    const l=sceneLayout(count,kind);assert.equal(l.slots.length,count);assert.ok(l.size>=50);
    for(const [i,p] of l.slots.entries()){
      assert.ok(p.x-l.size/2>60&&p.x+l.size/2<750);
      assert.ok(p.y-l.size/2>60&&p.y+l.size/2<350);
      if(kind==='claw'){const grip=clawPose(1900,i,l.slots);assert.equal(grip.x,p.x);assert.equal(grip.y,p.y);}
      else{const pos=balloonPosition(i,8000,2,false,count);const hit=dartPose(1700,pos);assert.equal(hit.x,pos.x);assert.equal(hit.y,pos.y);}
    }
  }
  assert.ok(sceneLayout(30,'claw').size<sceneLayout(20,'claw').size);
  assert.equal(sceneLayout(500,'balloon').count,30);
});
