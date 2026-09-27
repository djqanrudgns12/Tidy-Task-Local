import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const runtime = process.env.TIDY_RUNTIME_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const require = createRequire(path.join(runtime, 'package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');
const base = process.env.TIDY_PREVIEW_URL || 'http://127.0.0.1:5196';
const out = 'public/images/update-5.6';
await fs.mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true,channel:'msedge'});
const context = await browser.newContext({deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
const page = await context.newPage();
const errors = [], captures = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {if(m.type()==='error')console.log('Browser:',m.text().slice(0,250));});
page.setDefaultTimeout(20000);
async function open(query, width=1200, height=800) {
  await page.setViewportSize({width,height});
  await page.goto(`${base}/?${query}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
}
async function snap(name, selector) {
  await page.evaluate(() => document.fonts.ready);
  const bytes = await (selector ? page.locator(selector) : page).screenshot({animations:'disabled'});
  const file = `${out}/${name}.webp`;
  await sharp(bytes).webp({quality:95,effort:6}).toFile(file);
  const {width,height} = await sharp(file).metadata();
  captures.push({name,width,height,source:page.url()}); console.log(`Captured ${name}: ${width} × ${height}`);
}
try {
  await open('toolkit-preview=toolkit',1200,200); await page.locator('.toolkit-bar').waitFor(); await snap('toolbar','.toolkit-bar');
  await open('toolkit-preview=vote&vote-fixture=result',1400,900); await page.locator('.vt-result').waitFor({timeout:45000}); await page.waitForTimeout(1600); await snap('vote');
  await open('toolkit-preview=seating',1400,900);
  await page.getByRole('button',{name:'가상 학급으로 체험하기'}).click();
  await page.getByRole('button',{name:'자리 재배치',exact:true}).click();
  await page.waitForTimeout(1800); await snap('seating');
  await open('toolkit-preview=scoreboard-group',1200,760);
  await page.evaluate(async () => {
    const {defaultGroup}=await import('/src/lib/scoreboard/model.js');
    const group=defaultGroup();
    group.groups.forEach((g,i)=>g.score=[12,8,15,10,11,9][i]);
    localStorage.setItem('tidy-scores-preview-v1:scoreboard',JSON.stringify({schemaVersion:1,sections:{group:{revision:1,data:group}}}));
  });
  await page.reload(); await page.waitForTimeout(900); await snap('scoreboard');
  // 독립된 예시 온도계: 학급 명단 유무와 관계없이 동일한 한 개의 목표를 촬영합니다.
  await page.evaluate(async () => {
    const {defaultMain}=await import('/src/lib/thermometer/model.js');
    const main=defaultMain();main.rosterHintDismissed=true;main.shared.sound=false;
    const t=main.sets.default.thermometers[0];t.title='협동 온도계';t.value=7;t.topText='함께 만드는 하루';
    t.stages=[{id:'a',at:5,label:'칭찬 릴레이',reached:true},{id:'b',at:10,label:'우리 반 놀이 시간',reached:false}];
    t.stamps.count=3;t.stamps.rewardText='영화 보기';
    localStorage.setItem('tidy-scores-preview-v1:thermometer',JSON.stringify({schemaVersion:1,sections:{main:{revision:1,data:main}}}));
  });
  await open('toolkit-preview=thermometer',1000,840); await snap('thermometer');
  await open('toolkit-preview=clock',1000,660); await snap('clock');
  await open('toolkit-preview=dice',1000,660);
  await page.getByRole('radio',{name:'3개',exact:true}).click();
  const roll=page.getByRole('button',{name:/던지기|굴리기/}).first();
  if(await roll.count()) { await roll.click(); await page.waitForTimeout(2200); }
  await snap('dice');
  await open('toolkit-preview=toolkit-settings',520,900);
  const settingBody=page.locator('.tk-settings-body');
  await settingBody.evaluate(el=>{const label=[...el.querySelectorAll('h2')].find(e=>e.textContent.includes('도구'));if(label)el.scrollTop=label.offsetTop-40;});
  await snap('settings');
  await open('toolkit-preview=picker',1200,850);
  await page.getByRole('button',{name:'직접 입력',exact:false}).first().click();
  await page.getByRole('button',{name:'목록 입력',exact:false}).first().click();
  await page.getByLabel('뽑기 목록 입력').fill('김하늘\n이바다\n박여름\n최우주\n정다온\n강이든\n윤하루\n한별');
  await page.getByRole('button',{name:'목록 확인',exact:true}).click();
  await page.getByRole('button',{name:'이 목록으로 뽑기',exact:true}).click();
  await page.getByRole('tab',{name:'인형 뽑기',exact:true}).click();
  await page.waitForTimeout(400);await snap('picker');
  await open('toolkit-preview=noticeboard',1200,800);
  await page.locator('[contenteditable="true"]').first().fill('함께 자라는 우리 반\n\n1. 친구의 이야기를 끝까지 들어요.\n2. 모둠 활동 뒤 자리를 정리해요.\n3. 내일 준비물: 색연필, 풀, 가위');
  await page.waitForTimeout(500);await snap('noticeboard');
  const calendar=await browser.newPage({viewport:{width:760,height:650},deviceScaleFactor:4,locale:'ko-KR',reducedMotion:'reduce'});
  await calendar.goto(base+'/?date-picker-preview&today=2026-09-28&value=2026-09-30&size=14');
  await calendar.locator('.dp-card').waitFor();await calendar.evaluate(()=>document.fonts.ready);
  await sharp(await calendar.locator('.dp-card').screenshot()).webp({quality:95,effort:6}).toFile(out+'/calendar.webp');
  const cm=await sharp(out+'/calendar.webp').metadata();captures.push({name:'calendar',width:cm.width,height:cm.height,source:calendar.url(),deviceScaleFactor:4});console.log('Captured calendar: '+cm.width+' × '+cm.height);await calendar.close();
  await page.evaluate(() => {
    const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('');
    const school={ATPT_OFCDC_SC_CODE:'B10',SD_SCHUL_CODE:'0000001',SCHUL_NM:'햇살초등학교',LCTN_SC_NM:'서울특별시'};
    localStorage.setItem('meal-preview:school',JSON.stringify(school));
    localStorage.setItem('meal-preview:cache:B10-0000001',JSON.stringify({[date.slice(0,6)]:{rows:[{MLSV_YMD:date,MMEAL_SC_CODE:'2',MMEAL_SC_NM:'중식',DDISH_NM:'친환경 찰현미밥<br/>소고기 미역국(5.6.16)<br/>닭갈비(5.6.13.15)<br/>오이무침(5.6.13)<br/>배추김치(9)<br/>달콤한 포도',CAL_INFO:'628.4 Kcal',NTR_INFO:'탄수화물(g) : 91.2<br/>단백질(g) : 28.1<br/>지방(g) : 16.4'}],sample:true,events:[],updatedAt:Date.now(),scheduleAt:Date.now()}}));
  });
  await open('meal-preview=meal',460,500);await snap('meal');
  if(errors.length)throw Error(errors.join('\n'));
} catch (error) { console.log('PAGE:', await page.locator('body').innerText()); console.log('ERRORS:',errors); await page.screenshot({path:'output/release-capture-failure.png'}); throw error; } finally {
  await fs.writeFile(`${out}/captures.json`,JSON.stringify({deviceScaleFactor:2,source:'Actual application components in isolated browser preview; fictional demonstration data. Not native Tauri screenshots.',captures,errors},null,2));
  await browser.close();
}
