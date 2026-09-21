import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
for (const [width,height] of [[1280,820],[1048,678],[900,650],[640,640],[360,740]]) {
 await page.setViewportSize({width,height});
 await page.goto('http://127.0.0.1:5173/?toolkit-preview=stopwatch');
 await page.getByRole('button',{name:'설정 보기'}).click();
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('.stopwatch-face img').evaluate(img=>img.decode());
 const bounds=await page.evaluate(()=>{
   const panel=document.querySelector('.stopwatch-settings');
   const pr=panel.getBoundingClientRect();
   const actions=[...panel.querySelectorAll('button')].every(e=>{const r=e.getBoundingClientRect();return r.left>=pr.left&&r.right<=pr.right&&r.bottom<=pr.bottom});
   const face=document.querySelector('.stopwatch-readout').getBoundingClientRect();
   const time=document.querySelector('.elapsed-time').getBoundingClientRect();
   return {overflow:panel.scrollWidth>panel.clientWidth,actions, timeFits:time.left>=face.left&&time.right<=face.right,bodyOverflow:document.body.scrollWidth>innerWidth};
 });
 console.log(width,bounds);
 if(bounds.overflow||!bounds.actions||!bounds.timeFits||bounds.bodyOverflow) throw Error('layout failed '+width);
 await page.screenshot({path:`output/qa/toolkit/stopwatch-face-${width}.png`,fullPage:true});
}
await page.getByRole('button',{name:'시작',exact:true}).click();
await page.waitForTimeout(250);
await page.getByRole('button',{name:'기록',exact:true}).click();
await page.getByRole('button',{name:'일시정지',exact:true}).click();
if(await page.locator('.elapsed-time').innerText()==='00:00.00') throw Error('clock did not advance');
const sw=page.getByRole('switch',{name:'시계음',exact:true});
const before=await sw.getAttribute('aria-checked'); await sw.click();
if(before===await sw.getAttribute('aria-checked')) throw Error('toggle failed');
await page.getByRole('button',{name:'시계음 미리 듣기'}).click();
console.log('interaction passed', errors);
await browser.close();
