import { chromium } from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const base = process.env.TIDY_PREVIEW_URL || 'http://127.0.0.1:5190';
const out = 'output/qa/release-5.5';
await fs.mkdir(out, { recursive: true });
const page = await browser.newPage({ viewport: { width: 740, height: 820 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(15000);
try {
  for (const [width,height] of [[740,820],[390,720],[320,460]]) {
    await page.setViewportSize({ width,height });
    await page.goto(`${base}/?toolkit-release-preview`);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
    for (const [i, name] of ['첫 만남','시간과 집중','함께하는 교실','나만의 도구함'].entries()) {
      await page.getByRole('button', {name,exact:false}).first().click();
      await page.locator('main img').evaluateAll(async imgs => { await Promise.all(imgs.map(img => img.decode())); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth),true);
      await page.screenshot({path:`${out}/notice-${width}-${i+1}.png`});
    }
  }
  for (const action of ['오늘 그만보기','더 이상 보지 않기','닫기']) {
    await page.goto(`${base}/?toolkit-release-preview`);
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('contentinfo').getByRole('button',{name:action,exact:true}).click();
    await page.getByText('공지를 닫았습니다.').waitFor();
    const value=await page.evaluate(()=>localStorage.getItem('update-notice:v5.5.0:toolkit:hidden-until'));
    if (action==='닫기') assert.equal(value,null);
    else if(action==='더 이상 보지 않기') assert.equal(Number(value),Number.MAX_SAFE_INTEGER);
    else { const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(0,0,0,0);assert.equal(Number(value),tomorrow.getTime()); }
  }
  await page.goto(`${base}/?toolkit-release-preview`);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('test storage failure')};});
  await page.getByRole('button',{name:'오늘 그만보기',exact:true}).click();
  assert.equal(await page.getByRole('alert').isVisible(),true);
  assert.equal(await page.getByRole('dialog').isVisible(),true);
  await page.keyboard.press('Escape');await page.getByText('공지를 닫았습니다.').waitFor();
  for(const width of [960,600,390]) {
    await page.setViewportSize({width,height:800});
    await page.goto(`${base}/help.html`);
    await page.locator('.content img').evaluateAll(async imgs => { await Promise.all(imgs.map(img => {img.loading='eager';return img.decode();})); });
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('.guide-nav a').count(),13);
    for(const link of await page.locator('.guide-nav a').all()) {
      const hash=await link.getAttribute('href');
      assert.equal(await page.locator(hash).count(),1);
    }
    await page.screenshot({path:`${out}/guide-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${out}/browser.json`,JSON.stringify({viewports:3,pages:4,imagesDecoded:true,dismissalChoices:true,storageFailure:true,escape:true,errors},null,2));
  console.log('PASS: 12 layouts, image loading, dismissal choices, failure recovery, Escape');
} finally { await browser.close(); }
