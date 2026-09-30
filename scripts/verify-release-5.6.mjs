import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const runtime=process.env.TIDY_RUNTIME_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=createRequire(path.join(runtime,'package.json'))('playwright');
const base=process.env.TIDY_PREVIEW_URL||'http://127.0.0.1:5196';
const out='output/qa/release-5.6';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul'});
const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const tabs=['5.6.3 새 소식','툴킷 전체','지난 업데이트','롤링 썬더'];
const results=[];
try {
  for(const [width,height] of [[600,1040],[600,768],[683,420],[390,720],[360,420]]) {
    await page.setViewportSize({width,height});
    await page.goto(`${base}/?release-news-preview`);
    await page.getByRole('tab',{name:tabs[0],exact:false}).waitFor();
    for(const [index,tab] of tabs.entries()) {
      await page.getByRole('tab',{name:tab,exact:false}).click();
      await page.locator('.rn-scroll img').evaluateAll(async images=>{await Promise.all(images.map(img=>{img.loading='eager';return img.decode();}));});
      await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width} document overflow`);
      assert.equal(await page.locator('.rn-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth),true,`${width} panel overflow`);
      if(index===1){assert.equal(await page.locator('[data-tool-id]').count(),12);assert.equal(await page.locator('.rn-tool-stats b').first().innerText(),'12가지');}
      const footer=await page.locator('.rn-footer').boundingBox();assert.ok(footer&&footer.y+footer.height<=height+1);
      assert.ok(!await page.getByText('[개발자의 말]',{exact:true}).count());
      await page.screenshot({path:`${out}/news-${width}-${height}-${index}.png`});
      results.push({width,height,tab,overflow:false});
    }
  }
  await page.setViewportSize({width:600,height:1040});
  await page.goto(`${base}/?release-news-preview`);
  await page.getByRole('button',{name:'학급 투표 실제 화면 크게 보기',exact:true}).click();
  await page.locator('.rn-lightbox[open]').waitFor();
  await page.screenshot({path:`${out}/lightbox.png`});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.rn-lightbox').count(),0);
  assert.equal(await page.locator('.release-news').isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'학급 투표 실제 화면 크게 보기',exact:true}).evaluate(el=>document.activeElement===el),true);
  await page.getByRole('tab',{name:tabs[0],exact:false}).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:tabs[1],exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:tabs[3],exact:true}).getAttribute('aria-selected'),'true');
  for(const action of ['닫기','오늘 그만보기','이 공지 그만보기']) {
    await page.goto(`${base}/?release-news-preview`);await page.evaluate(()=>localStorage.clear());
    await page.locator('.rn-footer').getByRole('button',{name:action,exact:true}).click();
    await page.getByText('공지를 닫았습니다.',{exact:true}).waitFor();
    const hidden=await page.evaluate(()=>localStorage.getItem('update-notice:v5.6.3:hidden-until'));
    if(action==='닫기')assert.equal(hidden,null);
    else if(action==='이 공지 그만보기')assert.equal(Number(hidden),Number.MAX_SAFE_INTEGER);
    else assert.equal(Number(hidden),await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);d.setHours(0,0,0,0);return d.getTime();}));
    // 직접 다시 열기: 저장된 숨김 값을 삭제하지 않고도 내용이 보입니다.
    await page.reload();await page.locator('.release-news').waitFor({state:'visible'});
  }
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('QA storage failure');};});
  await page.getByRole('button',{name:'이 공지 그만보기',exact:true}).click();
  assert.equal(await page.getByRole('alert').isVisible(),true);assert.equal(await page.locator('.release-news').isVisible(),true);
  await page.keyboard.press('Escape');await page.getByText('공지를 닫았습니다.',{exact:true}).waitFor();
  for(const [width,height] of [[600,780],[390,720],[360,500]]) {
    await page.setViewportSize({width,height});await page.goto(`${base}/?initial-setup-preview`);await page.evaluate(()=>localStorage.clear());await page.reload();
    await page.getByRole('textbox',{name:'학교 이름',exact:true}).fill('한빛');
    await page.getByRole('button',{name:/한빛초등학교/}).click();await page.getByRole('button',{name:'이 학교로 등록',exact:false}).click();
    await page.getByRole('heading',{name:'시작할 때 급식창을 열까요?'}).waitFor();
    await page.screenshot({path:`${out}/setup-${width}-meal.png`});
    await page.getByRole('button',{name:'필요할 때만 열기',exact:false}).click();
    await page.getByRole('heading',{name:'Tidy 툴킷을 켤까요?'}).waitFor();
    assert.equal(await page.locator('.setup main').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await page.screenshot({path:`${out}/setup-${width}-toolkit.png`});
    await page.getByRole('button',{name:'사용하지 않기',exact:false}).click();
    await page.waitForFunction(()=>document.body.dataset.setupComplete==='true');
    const value=await page.evaluate(()=>JSON.parse(localStorage.getItem('initial-setup')));
    assert.equal(value.completed,true);assert.equal(value.completionCount,1);assert.equal(value.appVersion,'5.6.3');assert.equal(value.choices.toolkitEnabled,false);
  }
  await page.setViewportSize({width:600,height:780});await page.goto(`${base}/?initial-setup-preview`);await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByRole('textbox',{name:'학교 이름',exact:true}).waitFor();await page.screenshot({path:`${out}/setup-first.png`});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.body.dataset.setupComplete==='true');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('initial-setup')).skipped),true);
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${out}/browser.json`,JSON.stringify({results,imagesDecoded:true,lightboxFocus:true,tabKeyboard:true,dismissal:true,storageFailure:true,onboarding:true,errors},null,2));
  console.log('PASS: 20 news layouts, 3 onboarding sizes, image loading, lightbox focus, keyboard tabs, dismissal persistence, manual reopening, storage failure.');
} catch(error) {await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.log(await page.locator('body').innerText());throw error;}
finally {await browser.close();}
