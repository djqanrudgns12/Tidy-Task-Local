import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:420,height:500},deviceScaleFactor:2});
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
for(const orientation of ['horizontal','vertical']) {
 await page.goto('http://127.0.0.1:4189/?toolkit-preview=toolkit');
 await page.evaluate(o=>localStorage.setItem('tidy-toolkit-preview-v1',JSON.stringify({schemaVersion:1,toolkit:{orientation:o,visibleToolIds:['timer']}})),orientation);
 await page.reload(); await page.locator('.toolkit-platform-icon img').first().waitFor();
 assert.equal(await page.locator('.toolkit-platform-icon img').count(),2);
 assert(await page.locator('.toolkit-platform-icon img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth===1024)));
 const box=await page.locator('.toolkit-bar').boundingBox(); assert(box.x+box.width<=420);
 await page.evaluate(()=>{window.opened=[];window.open=(...args)=>window.opened.push(args);});
 for(const name of ['클래너','롤린썬더']) await page.getByRole('button',{name,exact:true}).click();
 const urls=await page.evaluate(()=>window.opened.map(a=>a[0]));
 assert.deepEqual(urls,['https://www.clanner.kr/?utm_source=tidy_task&utm_medium=referral&utm_campaign=toolkit','https://www.rollinthunder.net/?utm_source=tidy_task&utm_medium=referral&utm_campaign=toolkit']);
 await page.screenshot({path:`output/qa/toolkit/platforms-${orientation}.png`,clip:{x:0,y:0,width:Math.ceil(box.width+14),height:Math.ceil(box.height+14)}});
 await page.getByRole('button',{name:'타이머',exact:true}).click(); await page.locator('.toolkit-preview-menu').waitFor();
 await page.getByRole('button',{name:'툴킷 접기',exact:true}).click(); assert.equal(await page.locator('.toolkit-platform-icon').count(),0);
 console.log(orientation,box,'icons, URLs, timer menu, collapse PASS');
}
await page.goto('http://127.0.0.1:4189/?toolkit-preview=toolkit-settings');
await page.getByRole('switch',{name:'클래너 표시',exact:true}).click();
await page.getByRole('switch',{name:'타이머 표시',exact:true}).click();
await page.reload();
assert.equal(await page.getByRole('switch',{name:'클래너 표시',exact:true}).getAttribute('aria-checked'),'false');
assert.equal(await page.getByRole('switch',{name:'롤린썬더 표시',exact:true}).getAttribute('aria-checked'),'true');
assert.equal(await page.getByRole('switch',{name:'타이머 표시',exact:true}).getAttribute('aria-checked'),'false');
assert.deepEqual(errors,[]); console.log('settings persistence and independence PASS');
await browser.close();

