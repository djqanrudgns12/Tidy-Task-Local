import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1040,height:720}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5185/?toolkit-preview=roster');
 await page.getByRole('button',{name:'첫 학급 만들기'}).click();
 await page.getByRole('textbox',{name:'학급 추가',exact:true}).fill('5학년 2반');
 await page.getByRole('button',{name:'확인',exact:true}).click();
 for(const name of ['김하늘','이바다','박나무']){await page.getByLabel('새 학생 이름',{exact:true}).fill(name);await page.getByLabel('새 학생 이름',{exact:true}).press('Enter');await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent==='저장됨');}
 assert.equal(await page.locator('.student-table tbody tr').count(),3);
 await page.getByLabel('2번 이름',{exact:true}).fill('이푸른');await page.getByLabel('2번 이름',{exact:true}).press('Tab');
 await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent==='저장됨');
 await page.getByRole('button',{name:'모둠 구성',exact:true}).click();
 await page.getByRole('button',{name:'모둠 만들기',exact:true}).click();await page.getByRole('textbox',{name:'모둠 만들기',exact:true}).fill('3');await page.getByRole('button',{name:'확인',exact:true}).click();
 await page.locator('.group-members label').first().click();await page.getByLabel('이동할 모둠').selectOption({label:'1모둠'});await page.getByRole('button',{name:'이동',exact:true}).click();
 assert.equal(await page.locator('.group-card').nth(1).locator('.group-members label').count(),1);
 await page.screenshot({path:'output/qa/classroom/groups-1040.png'});
 await page.getByRole('button',{name:'학생 명단',exact:true}).click();
 await page.getByRole('button',{name:'파일 가져오기',exact:true}).click();await page.getByLabel('또는 이름·표 붙여넣기').fill('최구름\n한여름');await page.getByRole('button',{name:'명단 확인',exact:true}).click();await page.getByRole('button',{name:'2명 반영',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('dialog.import-dialog'));
 assert.equal(await page.locator('.student-table tbody tr').count(),5);
 for(const width of [1040,880,640]){await page.setViewportSize({width,height:720});await page.screenshot({path:`output/qa/classroom/students-${width}.png`});const overflow=await page.evaluate(()=>document.querySelector('.roster-app').scrollWidth>innerWidth);assert.equal(overflow,false);}
 await page.getByLabel('학생 검색').fill('최구름');await page.getByLabel('검색 결과 전체 선택').check();await page.getByRole('button',{name:'삭제',exact:true}).click();
 await page.getByLabel('학생 검색').fill('');assert.equal(await page.locator('.student-table tbody tr').count(),4);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await page.locator('.student-table tbody tr').count(),5);
 await page.setViewportSize({width:1040,height:720});
 // A invalid edit remains visible, never deletes a student, and Escape cancels it.
 await page.getByLabel('1번 이름',{exact:true}).fill('');await page.getByLabel('1번 이름',{exact:true}).press('Tab');
 await page.getByRole('alert').waitFor();assert.equal(await page.locator('.student-table tbody tr').count(),5);
 await page.getByLabel('1번 이름',{exact:true}).press('Escape');
 // Save while focused must not reorder the edited row.
 await page.getByLabel('정렬',{exact:true}).selectOption('name');
 const input=page.getByLabel('1번 이름',{exact:true});await input.fill('하늘김');await page.waitForTimeout(650);
 assert.equal(await input.evaluate(e=>e===document.activeElement),true);await input.press('Tab');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'데이터 내보내기',exact:true}).click();
 const download=await downloadPromise;await download.saveAs('output/qa/classroom/synthetic-backup.json');
 const backup=JSON.parse(await fs.readFile('output/qa/classroom/synthetic-backup.json','utf8'));assert.equal(backup.data.classes[0].students.length,5);
 // Native-like drag gesture uses the same assignment command as the accessible buttons.
 await page.getByRole('button',{name:'모둠 구성',exact:true}).click();await page.locator('.group-card').first().locator('.group-members label').first().dragTo(page.locator('.group-card').nth(2));
 assert.equal(await page.locator('.group-card').nth(2).locator('.group-members label').count(),1);
 // Tool binding stays fixed after a default switch; draw snapshots are immutable.
 const contextCheck=await page.evaluate(async()=>{
   const repo=await import('/src/lib/classroom/repository.js');const {createClassContext,captureCandidates}=await import('/src/lib/classroom/context.js');
   let seed=await repo.readRoster();if(!seed.classes.length)seed=(await repo.execute({type:'createClass',name:'연동 검증'},seed.revision)).snapshot;const first=seed.classes[0];const reports=[];const ctx=await createClassContext(v=>reports.push(v),first.id,repo);const frozen=captureCandidates(first);
   let s=await repo.readRoster();s=(await repo.execute({type:'createClass',name:'다른 학급'},s.revision)).snapshot;
   await repo.execute({type:'setDefault',classId:s.classes[1].id},s.revision);await ctx.refresh();
   const bound=ctx.classId===first.id&&reports.at(-1).classroom.id===first.id;
   s=await repo.readRoster();await repo.execute({type:'deleteClass',classId:first.id},s.revision);await ctx.refresh();
   const deleted=reports.at(-1).deleted;ctx.dispose();return {bound,deleted,frozen:Object.isFrozen(frozen.students)};
 });assert.deepEqual(contextCheck,{bound:true,deleted:true,frozen:true});
 // Restore UX reuses original IDs after explicit confirmation.
 await page.locator('.sidebar-bottom input[type=file][accept=".json"]').setInputFiles('output/qa/classroom/synthetic-backup.json');
 await page.getByRole('button',{name:'삭제 / 확인',exact:true}).click();
 await page.getByRole('button',{name:'학생 명단',exact:true}).click();assert.equal(await page.locator('.student-table tbody tr').count(),5);
 // Same actual PDF parser as the app; report counts only, never names.
 const dir='.local-fixtures/student';const filename=(await fs.readdir(dir)).find(f=>f.endsWith('.pdf'));
 if(filename){const bytes=[...await fs.readFile(`${dir}/${filename}`)];const result=await page.evaluate(async bytes=>{const {extractPdfRows}=await import('/src/lib/classroom/pdf.js');const {projectRows}=await import('/src/lib/classroom/import.js');const tables=await projectRows(await extractPdfRows(new Uint8Array(bytes)));return tables.map(t=>({count:t.students.length,numbers:t.students.map(s=>Number(s.number))}));},bytes);assert.equal(result[0].count,21);assert.equal(result[0].numbers.includes(7),false);console.log('PDF sample: 21 students; missing 7 preserved');}
 assert.deepEqual(errors,[]);console.log('Browser CRUD, paste import, assignment, undo, 3 widths: PASS');
}catch(e){await page.screenshot({path:'output/qa/classroom/failure.png'});console.log('Failure URL',page.url(),'rows',await page.locator('.student-table tbody tr').count(),'groups',await page.locator('.group-card').count(),'errors',errors);throw e;}finally{await browser.close();}
