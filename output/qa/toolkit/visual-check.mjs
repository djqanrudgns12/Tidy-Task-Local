const {chromium}=await import('file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:960,height:680}});
page.on('pageerror',e=>console.error(e));
for(const kind of ['digital','analog','hourglass','stopwatch','toolkit']){
 await page.goto('http://127.0.0.1:5173/?toolkit-preview='+kind); await page.waitForTimeout(800);await page.screenshot({path:'output/qa/toolkit/'+kind+'.png'});
 console.log(kind,await page.locator('body').innerText());
}
await browser.close();
