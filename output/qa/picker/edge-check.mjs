import {chromium} from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true}),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const url='http://127.0.0.1:5193/?toolkit-preview=picker';
async function ready(p){await p.goto(url);await p.getByRole('heading',{name:'이번엔 누구일까요?'}).waitFor();}
async function list(p,n){await p.getByLabel('뽑기 대상',{exact:true}).selectOption('custom');await p.getByRole('button',{name:'목록 입력',exact:true}).click();await p.getByLabel('뽑기 목록 입력').fill(Array.from({length:n},(_,i)=>`항목${i+1}`).join('\n'));await p.getByRole('button',{name:'목록 확인',exact:true}).click();await p.getByRole('button',{name:'이 목록으로 뽑기',exact:true}).click();}
try{
 const p=await browser.newPage({viewport:{width:960,height:720}});await ready(p);await list(p,500);
 check('500 candidates retained',(await p.locator('.picker-count').innerText()).includes('대상 500개'));
 await p.getByRole('tab',{name:'풍선 다트',exact:true}).click();check('large list renders at most 30 balloons',await p.locator('.picker-balloon-slot').count()===30);
 await p.locator('.picker-draw').click();await p.locator('.picker-draw').dispatchEvent('keydown',{key:'Enter',code:'Enter',repeat:true});await p.waitForFunction(()=>!document.querySelector('.picker-draw').disabled);
 check('repeat key does not duplicate result',(await p.locator('.picker-history-heading>button>span').innerText())==='1');
 const frames=await p.evaluate(()=>new Promise(resolve=>{let last=performance.now(),d=[];function frame(t){d.push(t-last);last=t;if(d.length<120)requestAnimationFrame(frame);else resolve(d.slice(1).sort((a,b)=>a-b));}requestAnimationFrame(frame);}));
 await p.getByRole('button',{name:'목록 편집',exact:true}).click();await p.getByLabel('1번째 항목',{exact:true}).press('Space');check('input space never draws',(await p.locator('.picker-history-heading>button>span').innerText())==='1');await p.keyboard.press('Escape');
 await p.close();
 const q=await browser.newPage();await q.route('**/images/toolkit/picker/*.png',r=>r.abort());await ready(q);await list(q,3);await q.getByRole('tab',{name:'인형 뽑기',exact:true}).click();await q.getByText('인형 이미지를 불러오지 못했어요.',{exact:true}).waitFor();check('missing assets block claw draw',await q.locator('.picker-draw').isDisabled());await q.getByRole('tab',{name:'클래식',exact:true}).click();await q.locator('.picker-draw').click();await q.waitForFunction(()=>!document.querySelector('.picker-draw').disabled);check('classic recovers from missing assets',(await q.locator('.picker-history-heading>button>span').innerText())==='1');await q.close();
 const r=await browser.newPage();await ready(r);await r.evaluate(async()=>{const repo=await import('/src/lib/classroom/repository.js');let s=await repo.readRoster();let a=await repo.execute({type:'createClass',name:'변경 검증'},s.revision);await repo.execute({type:'saveStudents',classId:a.snapshot.classes[0].id,students:[{number:1,name:'변경 전',gender:'male'}],deleteIds:[]},a.snapshot.revision);});await r.getByLabel('학급 선택',{exact:true}).selectOption({label:'변경 검증'});await r.getByRole('tab',{name:'풍선 다트',exact:true}).click();await r.locator('.picker-draw').click();
 await r.evaluate(async()=>{const repo=await import('/src/lib/classroom/repository.js');const s=await repo.readRoster();const c=s.classes[0];await repo.execute({type:'saveStudents',classId:c.id,students:[{...c.students[0],name:'변경 후'}],deleteIds:[]},s.revision);});await r.waitForFunction(()=>document.querySelector('[data-testid="picker-result"]'));
 check('mid-animation rename preserves committed name',(await r.getByTestId('picker-result').innerText()).includes('변경 전'));
 await r.getByRole('button',{name:'직전 뽑기 취소',exact:true}).click();await r.getByRole('tab',{name:'클래식',exact:true}).click();await r.locator('.picker-draw').click();await r.getByTestId('picker-result').getByText('변경 후',{exact:true}).waitFor();check('next draw reflects repository rename',true);await r.close();
 await fs.writeFile('output/qa/picker/edge-report.json',JSON.stringify({checks,idle30BalloonFrameMs:{median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)]}},null,2));console.log(JSON.stringify({passed:checks.length}));
}finally{await browser.close();}
