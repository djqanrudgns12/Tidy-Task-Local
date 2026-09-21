import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:960,height:720},recordVideo:{dir:'output/qa/picker/video',size:{width:960,height:720}}});
const page=await context.newPage();const errors=[];const checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
const count=async()=>Number(await page.locator('.picker-history-heading>button>span').innerText());
const draw=async()=>{const n=await count();await page.locator('.picker-draw').click();await page.waitForFunction(n=>Number(document.querySelector('.picker-history-heading>button>span').textContent)===n+1,n);};
async function inputList(type,text){await page.getByLabel('뽑기 대상',{exact:true}).selectOption(type);await page.getByRole('button',{name:'목록 입력',exact:true}).click();await page.getByLabel('뽑기 목록 입력').fill(text);await page.getByRole('button',{name:'목록 확인',exact:true}).click();await page.getByRole('button',{name:'이 목록으로 뽑기',exact:true}).click();}
try{
 await page.goto('http://127.0.0.1:5193/?toolkit-preview=picker');await page.getByRole('heading',{name:'이번엔 누구일까요?'}).waitFor();
 check('empty roster blocks draw',await page.locator('.picker-draw').isDisabled());
 // Browser-only test data through the actual repository commands; no user data.
 const ids=await page.evaluate(async()=>{const r=await import('/src/lib/classroom/repository.js');let s=await r.readRoster();let a=await r.execute({type:'createClass',name:'검증 학급 A'},s.revision);const id=a.snapshot.classes[0].id;let b=await r.execute({type:'saveStudents',classId:id,students:[{number:1,name:'같은이름',gender:'male'},{number:3,name:'같은이름',gender:'female'},{number:5,name:'학생다',gender:'male'},{number:7,name:'학생라',gender:'unspecified'}],deleteIds:[]},a.snapshot.revision);const c=await r.execute({type:'createClass',name:'검증 학급 B'},b.snapshot.revision);return c.snapshot.classes.map(c=>c.id);});
 await page.getByLabel('학급 선택',{exact:true}).selectOption(ids[0]);
 check('all includes unspecified gender',(await page.locator('.picker-count').innerText()).includes('대상 4명'));
 await draw();const first=await page.getByTestId('picker-result').innerText();check('classic completes once',await count()===1);
 await page.getByRole('tab',{name:'인형 뽑기',exact:true}).click();check('mode preserves history',await count()===1);
 await page.getByLabel('뽑기 대상',{exact:true}).selectOption('male');check('male count two',(await page.locator('.picker-count').innerText()).includes('대상 2명'));
 await page.getByLabel('학급 선택',{exact:true}).selectOption(ids[1]);check('class histories isolated',await count()===0);
 await page.getByLabel('학급 선택',{exact:true}).selectOption(ids[0]);check('return class restores history',await count()===1);
 await page.getByLabel('뽑기 대상',{exact:true}).selectOption('all');
 await page.getByRole('button',{name:'직전 뽑기 취소',exact:true}).click();check('undo restores pool',(await page.locator('.picker-count').innerText()).includes('남은 4명'));
 await page.getByRole('button',{name:'대상 관리',exact:true}).click();await page.locator('.picker-target-list input').first().uncheck();check('temporary exclusion subtracts once',(await page.locator('.picker-count').innerText()).includes('남은 3명'));
 await page.getByLabel('대상 검색').fill('학생다');check('search does not alter candidates',(await page.locator('.picker-count').innerText()).includes('남은 3명'));
 await page.getByRole('button',{name:'대상 관리',exact:true}).click();
 await inputList('groups','초록 모둠\n하늘 모둠\n노랑 모둠\n보라 모둠\n분홍 모둠\n주황 모둠');
 await page.getByRole('button',{name:'목록 저장',exact:true}).click();await page.getByText('목록을 저장했어요. 추첨 기록은 저장하지 않아요.').waitFor();
 await page.waitForFunction(()=>!document.querySelector('.picker-draw').disabled);await page.screenshot({path:'output/qa/picker/claw-960.png'});
 await page.locator('.picker-draw').click();await page.waitForTimeout(1800);await page.screenshot({path:'output/qa/picker/claw-contact.png'});check('mode locked during animation',await page.getByRole('tab',{name:'클래식',exact:true}).isDisabled());
 await page.waitForFunction(()=>Number(document.querySelector('.picker-history-heading>button>span').textContent)===1);
 await page.getByRole('button',{name:'설정',exact:true}).click();
 for(const name of ['토끼','곰','고양이','강아지','펭귄','병아리']){
  await page.locator('.picker-design-grid').getByRole('button',{name,exact:true}).click();
  for(let i=0;i<3;i++){if(await page.locator('.picker-draw').isDisabled()){await page.getByRole('button',{name:'다시 시작',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();}await draw();}
 }
 check('all six toys each completed three draws',true);
 await page.locator('.picker-design-grid').getByRole('button',{name:'다양하게',exact:true}).click();
 await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('tab',{name:'풍선 다트',exact:true}).click();
 await page.getByRole('switch',{name:'뽑힌 대상 제외',exact:true}).click();
 await page.getByRole('button',{name:'설정',exact:true}).click();
 for(const name of ['둥근 풍선','긴 풍선','별 풍선','하트 풍선','꽃 풍선','곰 풍선']){
  await page.locator('.picker-design-grid').getByRole('button',{name,exact:true}).click();
  for(let i=0;i<3;i++)await draw();
 }
 check('all six balloon silhouettes each completed three draws',true);
 await page.locator('.picker-design-grid').getByRole('button',{name:'다양하게',exact:true}).click();await page.getByRole('button',{name:'설정',exact:true}).click();
 await page.locator('.picker-draw').click();await page.waitForTimeout(1300);await page.screenshot({path:'output/qa/picker/balloon-960.png'});await page.waitForFunction(()=>!document.querySelector('.picker-draw').disabled);
 for(const viewport of [{width:640,height:520},{width:960,height:720},{width:1440,height:900}]){await page.setViewportSize(viewport);await page.screenshot({path:`output/qa/picker/result-${viewport.width}.png`});check(`no horizontal overflow ${viewport.width}`,await page.evaluate(()=>document.querySelector('.picker-app').scrollWidth<=innerWidth));}
 await page.setViewportSize({width:960,height:720});await page.getByRole('tab',{name:'클래식',exact:true}).click();
 const before=await count();for(let i=0;i<30;i++)await draw();check('thirty repeated draws complete',await count()===before+30);
 await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('switch',{name:'연출 줄이기',exact:true}).click();await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('tab',{name:'인형 뽑기',exact:true}).click();const t=Date.now();await draw();check('reduced motion under one second',Date.now()-t<1000);
 await page.reload();await page.getByLabel('뽑기 대상',{exact:true}).selectOption('groups');check('new window session has no history',await count()===0);await page.getByRole('button',{name:'불러오기',exact:true}).click();await page.locator('.picker-library-row').getByRole('button').first().click();check('explicit saved list survives reload',(await page.locator('.picker-count').innerText()).includes('대상 6개'));
 await page.getByRole('button',{name:'목록 편집',exact:true}).click();await page.getByLabel('1번째 항목',{exact:true}).fill('수정 모둠');await page.getByRole('button',{name:'이 목록으로 뽑기',exact:true}).click();check('edit applied',(await page.locator('.picker-count').innerText()).includes('대상 6개'));
 check('no browser exceptions',errors.length===0);
 await fs.writeFile('output/qa/picker/browser-report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
}finally{await context.close();await browser.close();}
