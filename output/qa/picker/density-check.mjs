import {chromium} from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:960,height:720}});const report=[];
try{await p.goto('http://127.0.0.1:5193/?toolkit-preview=picker');await p.getByRole('heading',{name:'이번엔 누구일까요?'}).waitFor();
for(const n of [20,25,30]){
 await p.evaluate(async n=>{const r=await import('/src/lib/classroom/repository.js');let s=await r.readRoster();let a=await r.execute({type:'createClass',name:`${n}명 검증`},s.revision);const id=a.snapshot.classes.at(-1).id;await r.execute({type:'saveStudents',classId:id,students:Array.from({length:n},(_,i)=>({number:i+1,name:`학생${i+1}`,gender:i%2?'female':'male'})),deleteIds:[]},a.snapshot.revision);},n);
 await p.getByLabel('학급 선택',{exact:true}).selectOption({label:`${n}명 검증`});
 for(const mode of ['인형 뽑기','풍선 다트']){
  await p.getByRole('tab',{name:mode,exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.picker-draw').disabled);
  const selector=mode==='인형 뽑기'?'.picker-toy-slot':'.picker-balloon-slot';assert.equal(await p.locator(selector).count(),n);
  for(const v of [{width:640,height:520},{width:960,height:720},{width:1440,height:900}]){
   await p.setViewportSize(v);await p.mouse.move(0,0);await p.waitForTimeout(350);await p.screenshot({path:`output/qa/picker/density-${n}-${mode==='인형 뽑기'?'claw':'balloon'}-${v.width}.png`});
   const m=await p.evaluate(selector=>{const root=document.querySelector('.picker-app'),svg=document.querySelector('.picker-scene');const bounds=svg.getBoundingClientRect();const objects=[...document.querySelectorAll(selector)].map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});return {overflow:root.scrollWidth>innerWidth,objects,scene:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}};},selector);
   assert.equal(m.overflow,false);assert.equal(m.objects.length,n);report.push({n,mode,width:v.width,...m});
  }
 }
}
await p.setViewportSize({width:960,height:720});await p.getByRole('tab',{name:'클래식',exact:true}).click();
for(let i=0;i<30;i++){await p.locator('.picker-draw').click();await p.waitForFunction(i=>Number(document.querySelector('.picker-history-heading>button>span').textContent)===i+1,i);}
assert.equal(await p.locator('.picker-draw').isDisabled(),true);await p.locator('.picker-history-heading>button').click();assert.equal(await p.locator('.picker-history-items>span').count(),30);assert.equal(new Set(await p.locator('.picker-history-items>span').allTextContents()).size,30);
await fs.writeFile('output/qa/picker/density-report.json',JSON.stringify({layouts:report.length,thirtyUnique:true,cases:report},null,2));console.log(JSON.stringify({layouts:report.length,thirtyUnique:true}));
}finally{await b.close();}
