import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:760}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const content=page.getByRole('textbox',{name:'알림장 내용'});
try {
 await page.goto('http://127.0.0.1:5194/?toolkit-preview=noticeboard');await content.waitFor();
 await content.fill('1. 내일 미술 준비물: 색연필, 풀\n2. 독서 기록장을 가져오세요.\n3. 횡단보도에서는 좌우를 살펴요.');
 await page.getByRole('button',{name:'저장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.nb-save-state')?.textContent?.trim()==='저장됨');
 const first=await content.innerText();
 await content.press('Control+End');await page.keyboard.insertText(' 안전하게!');await page.waitForTimeout(650);
 await page.reload();await content.waitFor();assert.match(await content.innerText(),/안전하게/);
 await content.press('Control+Home');await content.press('Control+Shift+End');await page.getByRole('button',{name:'굵게',exact:true}).click();assert(await content.locator('strong').count()>0);
 await content.press('Control+z');assert.equal(await content.locator('strong').count(),0);await content.press('Control+y');assert(await content.locator('strong').count()>0);
 await page.getByLabel('글자 크기',{exact:true}).fill('28');await page.getByLabel('글자 크기',{exact:true}).press('Enter');assert(await content.locator('[data-size="28"]').count()>0);
 await page.getByRole('button',{name:'글자색',exact:true}).click();await page.getByRole('button',{name:'파랑',exact:true}).click();
 await page.getByRole('button',{name:'저장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.nb-save-state')?.textContent?.trim()==='저장됨');
 await content.press('ArrowRight');await page.screenshot({path:'output/qa/noticeboard/normal-1100.png'});
 await page.locator('.nb-board-entry').click();await page.waitForSelector('.noticeboard-app.board');assert.equal(await page.locator('.nb-format').isVisible(),false);await page.screenshot({path:'output/qa/noticeboard/board-1100.png'});
 await page.getByRole('button',{name:'서식 도구 열기'}).click();assert(await page.locator('.nb-format').isVisible());await page.keyboard.press('Escape');await page.waitForSelector('.noticeboard-app:not(.board)');
 await page.getByRole('button',{name:'다음 날짜',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.nb-save-state')?.textContent?.trim()==='새 알림장');assert.equal((await content.innerText()).trim(),'');
 await page.getByRole('button',{name:'이전 날짜',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent?.includes('색연필'));assert(await content.locator('strong').count()>0);
 await page.getByRole('button',{name:'이 날짜 알림장 삭제'}).click();await page.getByRole('button',{name:'휴지통으로 이동',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.nb-save-state')?.textContent?.trim()==='새 알림장');
 await page.getByRole('button',{name:'휴지통 열기'}).click();await page.getByRole('button',{name:'복원',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent?.includes('색연필'));
 for(const width of [960,640,380]){await page.setViewportSize({width,height:680});await page.screenshot({path:`output/qa/noticeboard/normal-${width}.png`});assert(await page.evaluate(()=>document.querySelector('.noticeboard-app').scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log('Browser flow PASS: edit/save/draft reload/format/undo/redo/size/color/board/date/history/trash/restore/responsive');
}finally{await browser.close();}
