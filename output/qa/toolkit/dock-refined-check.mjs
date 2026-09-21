import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:360,height:400},deviceScaleFactor:2});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
for (const orientation of ['horizontal','vertical']) {
 await page.goto('http://127.0.0.1:5174/?toolkit-preview=toolkit');
 await page.evaluate(o=>localStorage.setItem('tidy-toolkit-preview-v1',JSON.stringify({schemaVersion:1,revision:1,toolkit:{enabled:true,orientation:o,collapsed:false,visibleToolIds:['timer'],position:null},preferences:{}})),orientation);
 await page.reload();
 const bar=page.locator('.toolkit-bar'); await bar.waitFor(); await page.evaluate(()=>document.fonts.ready);
 const box=await bar.boundingBox(); assert(box.width<230);
 assert.equal(await bar.evaluate(e=>getComputedStyle(e,'::after').content),'none');
 await page.screenshot({path:`output/qa/toolkit/dock-refined-${orientation}.png`,clip:{x:0,y:0,width:Math.ceil(box.width+14),height:Math.ceil(box.height+14)}});
 await page.getByRole('button',{name:'타이머',exact:true}).click(); await page.locator('.toolkit-preview-menu').waitFor();
 const mb=await page.locator('.toolkit-preview-menu').boundingBox(); assert(mb.y>=box.y+box.height);
 await page.getByRole('button',{name:'툴킷 접기',exact:true}).click(); assert.equal(await page.locator('.toolkit-preview-menu').count(),0);
 await page.getByRole('button',{name:'툴킷 펼치기',exact:true}).waitFor();
 await page.getByRole('button',{name:'툴킷 펼치기',exact:true}).press('Enter');
 await page.getByRole('button',{name:'타이머',exact:true}).waitFor();
 console.log(orientation,box,'menu, collapse, keyboard restore PASS');
}
assert.deepEqual(errors,[]); await browser.close();
