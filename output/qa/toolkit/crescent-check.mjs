import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true}); const p=await b.newPage({viewport:{width:360,height:400},deviceScaleFactor:2});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
for(const orientation of ['horizontal','vertical']){
for(const visible of [true,false]){
await p.goto('http://127.0.0.1:5174/?toolkit-preview=toolkit');
await p.evaluate(({orientation,visible})=>localStorage.setItem('tidy-toolkit-preview-v1',JSON.stringify({schemaVersion:1,revision:1,toolkit:{enabled:true,orientation,collapsed:false,visibleToolIds:visible?['timer']:[],position:null},preferences:{}})),{orientation,visible});await p.reload();
const bar=p.locator('.toolkit-bar');await bar.waitFor();await p.evaluate(()=>document.fonts.ready);const box=await bar.boundingBox();assert(box.width<210);assert(box.height<180);
assert.equal(await p.locator('.toolkit-settings').count(),1);
if(visible){await p.screenshot({path:`output/qa/toolkit/crescent-${orientation}.png`,clip:{x:0,y:0,width:Math.ceil(box.width+14),height:Math.ceil(box.height+14)}});await p.locator('.toolkit-tool').click();await p.locator('.toolkit-preview-menu').waitFor();const mb=await p.locator('.toolkit-preview-menu').boundingBox();assert(mb.y>=box.y+box.height);}
await p.locator('.toolkit-home').click();assert.equal(await p.locator('.toolkit-crescent').count(),0);assert.equal(await p.locator('.toolkit-preview-menu').count(),0);const collapsed=await bar.boundingBox();assert.equal(collapsed.width,52);assert.equal(collapsed.height,52);
await p.locator('.toolkit-home').press('Enter');await p.locator('.toolkit-settings').waitFor();
console.log(orientation,visible?'timer':'settings only',box,'PASS');
}}
assert.deepEqual(errors,[]);await b.close();
