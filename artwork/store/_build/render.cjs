// Microsoft Store 이미지 렌더러 — store-assets.html의 각 구역을 정확한 픽셀 크기의 PNG로 저장합니다.
//
// 실행(프로젝트 의존성에 넣지 않기 위해 playwright-core를 따로 둔 경로를 NODE_PATH로 지정):
//   $env:NODE_PATH="<playwright-core가 설치된 node_modules>"; node artwork/store/_build/render.cjs
// 크롬 경로는 CHROME_PATH 환경변수, 없으면 Playwright가 내려받은 chromium을 찾습니다.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const HTML = 'file:///' + path.join(__dirname, 'store-assets.html').replace(/\\/g, '/');

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('chrome.exe를 찾지 못했습니다. CHROME_PATH를 지정하세요.');
}

// [요소 id, 저장 파일, 렌더 배율, 투명 배경 여부]
// 스크린샷: 1920×1080 × 4/3 = 2560×1440 (스토어 최소 1366×768, 최대 3840×2160 범위 안에서 원본 캡처가 늘어나지 않는 크기)
const JOBS = [
  ['s01', 'screenshots/01-수업은-즐겁게.png', 4 / 3],
  ['s02', 'screenshots/02-마감일-색으로.png', 4 / 3],
  ['s03', 'screenshots/03-tiny-note-보관함.png', 4 / 3],
  ['s04', 'screenshots/04-툴킷-12가지.png', 4 / 3],
  ['s05', 'screenshots/05-뽑기.png', 4 / 3],
  ['s06', 'screenshots/06-학급-투표.png', 4 / 3],
  ['s07', 'screenshots/07-자리-배치.png', 4 / 3],
  ['s08', 'screenshots/08-점수판-온도계.png', 4 / 3],
  ['s09', 'screenshots/09-알림장-급식.png', 4 / 3],
  ['s10', 'screenshots/10-테마-글꼴.png', 4 / 3],
  ['poster', 'logos/poster-art-2x3-1440x2160.png', 2],
  ['box', 'logos/box-art-1x1-2160.png', 2],
  ['box-clear', 'logos/box-art-1x1-2160-transparent.png', 2, true],
  ['promo', 'promo/promo-16x9-3840x2160.png', 2],
];

(async () => {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--allow-file-access-from-files', '--font-render-hinting=none'] });
  const byScale = new Map();
  for (const job of JOBS) { const k = job[2]; if (!byScale.has(k)) byScale.set(k, []); byScale.get(k).push(job); }
  for (const [scale, jobs] of byScale) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text()); });
    await page.goto(HTML);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    const fontOk = await page.evaluate(() => document.fonts.check('700 40px Maple') && [...document.fonts].some(f => f.family.includes('Maple') && f.status === 'loaded'));
    if (!fontOk) throw new Error('메이플스토리 글꼴을 불러오지 못했습니다(파일 경로·--allow-file-access-from-files 확인).');
    for (const [id, file, , clear] of jobs) {
      const out = path.join(ROOT, file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.locator('#' + id).screenshot({ path: out, omitBackground: !!clear, animations: 'disabled' });
      console.log('saved', file);
    }
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
