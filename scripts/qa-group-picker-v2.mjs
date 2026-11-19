/** Phase 6 Playwright 다중 해상도 · 3대 테마 · 2중 시각/DOM/성능 검수 스크립트 (PRD §7).
 *  실행: node scripts/qa-group-picker-v2.mjs [pass1|pass2] [port=5175] */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/User/Desktop/vibecoding/classlearning/package.json');
const { chromium } = require('playwright');

const CHROME_EXE = 'C:\\Users\\User\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const passName = process.argv[2] || 'pass1';
const port = process.argv[3] || '5175';
const BASE_URL = `http://localhost:${port}/?toolkit-preview=picker-group`;
const OUT_DIR = path.resolve('output/qa/group-picker-v2', passName);

const NAMES_2 = ['김서연', '이도윤'];
const NAMES_28 = [
  '김서연', '김서연', '박하준', '남궁민준', '강지호', '김경민', '김고은',
  '김민찬', '김수완', '김은솔', '선우서윤', '황보준서', '송예린', '안시우',
  '오채원', '유건우', '윤서현', '장도현', '정지우', '조아린', '최민성',
  '한유진', '허태양', '홍서아', '권현우', '배지안', '신우진', '임하율',
];
const NAMES_50 = Array.from({ length: 50 }, (_, i) => {
  const base = NAMES_28[i % NAMES_28.length];
  return i < 28 ? base : `학생${String(i + 1).padStart(2, '0')}호`;
});

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 직접 입력 명단 세팅 */
async function setCustomNames(page, names) {
  const editBtn = page.getByRole('button', { name: '명단 고치기' });
  if (await editBtn.count()) {
    await editBtn.first().click();
  }
  const textarea = page.locator('textarea[aria-label="참여자 이름 목록 입력"]');
  await textarea.waitFor({ state: 'visible', timeout: 5000 });
  await textarea.fill(names.join('\n'));
  await page.getByRole('button', { name: '목록 적용' }).click();
  await sleep(120);
}

/** 모둠 수 맞추기 */
async function setGroupCount(page, targetCount) {
  // 모둠 수 기준 탭 활성화
  const byGroupsTab = page.getByRole('tab', { name: '모둠 수 기준' });
  if (await byGroupsTab.count()) await byGroupsTab.click();

  const valEl = page.locator('.gp-global-stepper .gp-val');
  for (let i = 0; i < 16; i++) {
    const txt = (await valEl.textContent()) || '';
    const cur = Number.parseInt(txt, 10);
    if (cur === targetCount) break;
    if (cur < targetCount) {
      await page.locator('button[aria-label="모둠 수 늘리기"]').click();
    } else {
      await page.locator('button[aria-label="모둠 수 줄이기"]').click();
    }
    await sleep(40);
  }
  await sleep(120);
}

/** 테마 선택 */
async function selectTheme(page, label) {
  await page.locator('.gp-mode-tabs').getByRole('tab', { name: label }).click();
  await sleep(220);
}

/** 다크/라이트 스킴 토글 */
async function setColorScheme(page, scheme) {
  await page.evaluate((s) => {
    document.documentElement.style.colorScheme = s;
  }, scheme);
  await sleep(180);
}

/** DOM / 이미지 / 가독성 / 클리핑 검사 */
async function inspectDom(page, tag, expectRunning = false) {
  return await page.evaluate(({ tag, expectRunning }) => {
    const imgs = [...document.querySelectorAll('img')];
    const brokenImgs = imgs
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src')?.slice(-48) || '(no src)');

    const hud = document.querySelector('.gp-hud-band');
    const vp = document.querySelector('.gp-stage-viewport');
    let hudOverlapPx = 0;
    if (hud && vp) {
      const hr = hud.getBoundingClientRect();
      const vr = vp.getBoundingClientRect();
      hudOverlapPx = Math.max(0, hr.bottom - vr.top);
    }

    const sidebar = document.querySelector('.gp-sidebar-slot');
    const sidebarW = sidebar ? sidebar.getBoundingClientRect().width : -1;

    const skipBtn = document.querySelector('.gp-skip-btn');
    const skipRect = skipBtn ? skipBtn.getBoundingClientRect() : null;

    const bannerName = document.querySelector('.gp-hud-banner-name');
    const bannerFontPx = bannerName ? Number.parseFloat(getComputedStyle(bannerName).fontSize) : 0;
    const truncatedBannerCount =
      bannerName && bannerName.scrollWidth > bannerName.clientWidth + 2 ? 1 : 0;

    // 무대 내 이름표 클리핑 + 말줄임 + 겹침 + 화면 최소 글자 크기 + CTA 가림 검사
    const clippedNameplates = [];
    const plateRects = [];
    const plateEntries = [];
    let truncatedNameplateCount = 0;
    let minScreenNameplatePx = 0;
    let nameplateOverlapCount = 0;
    let plateBodyOcclusionCount = 0;
    let ctaOverlapCount = 0;

    const ctaEl = document.querySelector('.gp-primary-cta');
    const ctaRect = ctaEl ? ctaEl.getBoundingClientRect() : null;

    if (vp) {
      const vr = vp.getBoundingClientRect();
      const coreEl = vp.querySelector('.gp-stage-core');
      const coreScale = coreEl ? coreEl.getBoundingClientRect().width / 1600 : 1;
      for (const np of document.querySelectorAll('.gp-stage-nameplate')) {
        const nr = np.getBoundingClientRect();
        if (nr.width === 0 || nr.height === 0) continue;
        if (np.scrollWidth > np.clientWidth + 2) truncatedNameplateCount++;
        const computedPx = Number.parseFloat(getComputedStyle(np).fontSize) || 0;
        const scrPx = computedPx * coreScale;
        if (scrPx > 0 && (minScreenNameplatePx === 0 || scrPx < minScreenNameplatePx)) {
          minScreenNameplatePx = scrPx;
        }
        if (nr.left < vr.left - 4 || nr.right > vr.right + 4) {
          clippedNameplates.push({ text: np.textContent?.trim(), left: nr.left, right: nr.right, vrLeft: vr.left, vrRight: vr.right });
        }
        if (
          ctaRect &&
          ctaRect.width > 0 &&
          nr.right > ctaRect.left + 2 &&
          nr.left < ctaRect.right - 2 &&
          nr.bottom > ctaRect.top + 2 &&
          nr.top < ctaRect.bottom - 2
        ) {
          ctaOverlapCount++;
        }
        const hostStudent = np.closest('.gp-stage-student');
        const plateZ = hostStudent ? (Number.parseInt(getComputedStyle(hostStudent).zIndex, 10) || 0) : 0;
        plateEntries.push({ el: np, host: hostStudent, rect: nr, z: plateZ, text: np.textContent?.trim() || '' });
        plateRects.push(nr);
      }
      for (let i = 0; i < plateRects.length; i++) {
        for (let j = i + 1; j < plateRects.length; j++) {
          const a = plateRects[i];
          const b = plateRects[j];
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 4 && oy > 4) nameplateOverlapCount++;
        }
        // 모둠 깃발·열차·아치 배지와의 겹침도 함께 차단
        for (const badge of document.querySelectorAll('.gp-glacier-flag-anchor .gp-stage-badge, .gp-train-car-plate, .gp-el-arch-plate')) {
          const br = badge.getBoundingClientRect();
          if (br.width === 0 || br.height === 0) continue;
          const a = plateRects[i];
          const ox = Math.min(a.right, br.right) - Math.max(a.left, br.left);
          const oy = Math.min(a.bottom, br.bottom) - Math.max(a.top, br.top);
          if (ox > 4 && oy > 4) nameplateOverlapCount++;
        }
      }
      // 이름표 vs 타 학생 본체 스태킹 가림 검사 (zIndex 비교 + DOM 순서)
      for (const pe of plateEntries) {
        for (const body of document.querySelectorAll('.gp-stage-student-body')) {
          const bodyHost = body.closest('.gp-stage-student');
          if (!bodyHost || bodyHost === pe.host) continue;
          const bImg = body.querySelector('img');
          if (bImg && pe.text && bImg.getAttribute('alt') === pe.text) continue;
          if (body.closest('.gp-train-win-clip') || body.closest('.gp-train-mover')) continue;
          const bodyZ = Number.parseInt(getComputedStyle(bodyHost).zIndex, 10) || 0;
          const bodyAfter =
            bodyZ > pe.z ||
            (bodyZ === pe.z &&
              pe.host &&
              Boolean(pe.host.compareDocumentPosition(bodyHost) & Node.DOCUMENT_POSITION_FOLLOWING));
          if (!bodyAfter) continue;
          const rawBr = body.getBoundingClientRect();
          if (rawBr.width === 0 || rawBr.height === 0) continue;
          // 512×640 투명 좌우 여백(22%) 및 발끝 아래 여백(7.5%) 제외한 실 캐릭터 영역
          const br = {
            left: rawBr.left + rawBr.width * 0.22,
            right: rawBr.right - rawBr.width * 0.22,
            top: rawBr.top,
            bottom: rawBr.bottom - rawBr.height * 0.075,
          };
          const ox = Math.min(pe.rect.right, br.right) - Math.max(pe.rect.left, br.left);
          const oy = Math.min(pe.rect.bottom, br.bottom) - Math.max(pe.rect.top, br.top);
          if (ox > 4 && oy > 4) plateBodyOcclusionCount++;
        }
      }
    }

    const manifestEl = document.querySelector('.gp-manifest');
    let clippedManifestCardCount = 0;
    if (manifestEl) {
      const mr = manifestEl.getBoundingClientRect();
      for (const card of manifestEl.querySelectorAll('.gp-manifest-card')) {
        const cr = card.getBoundingClientRect();
        if (cr.bottom > mr.bottom + 2) clippedManifestCardCount++;
      }
    }

    const sidebarAside = document.querySelector('.gp-sidebar');
    const sumFooter = document.querySelector('.gp-sum-footer');
    let clippedSidebarFooter = false;
    if (sidebarAside && sumFooter && sidebarW > 20) {
      clippedSidebarFooter = sumFooter.getBoundingClientRect().bottom > sidebarAside.getBoundingClientRect().bottom + 2;
    }

    const manifestChips = [...document.querySelectorAll('.gp-slot-chip.filled')];
    const manifestFontPx = manifestChips.length
      ? Number.parseFloat(getComputedStyle(manifestChips[0]).fontSize)
      : 0;

    const overflowControls = [];
    for (const el of document.querySelectorAll('.gp-primary-cta, .gp-pill-btn, .gp-skip-btn, .gp-hud-banner')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        overflowControls.push(el.textContent?.trim()?.slice(0, 24));
      }
    }

    return {
      tag,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      imgCount: imgs.length,
      brokenImgCount: brokenImgs.length,
      brokenImgs,
      hudOverlapPx: Number(hudOverlapPx.toFixed(2)),
      sidebarWidth: Number(sidebarW.toFixed(1)),
      skipBtnSize: skipRect ? { w: Math.round(skipRect.width), h: Math.round(skipRect.height) } : null,
      bannerFontPx: Number(bannerFontPx.toFixed(1)),
      truncatedBannerCount,
      truncatedNameplateCount,
      minScreenNameplatePx: Number(minScreenNameplatePx.toFixed(1)),
      nameplateOverlapCount,
      plateBodyOcclusionCount,
      ctaOverlapCount,
      clippedManifestCardCount,
      clippedSidebarFooter,
      manifestFontPx: Number(manifestFontPx.toFixed(1)),
      clippedNameplateCount: clippedNameplates.length,
      clippedNameplates: clippedNameplates.slice(0, 5),
      overflowControls,
      expectRunning,
    };
  }, { tag, expectRunning });
}

/** 실제 rAF 프레임 델타 p95 및 첫 프레임 지연 측정 */
async function measureRealPlaybackPerf(page, tag) {
  await page.evaluate(() => {
    window.__gpPerf = { clickAt: performance.now(), firstRunningAt: 0, frames: [] };
    let prev = 0;
    function sample(now) {
      if (!window.__gpPerf.firstRunningAt && document.querySelector('.gp-hud-band .gp-skip-btn')) {
        window.__gpPerf.firstRunningAt = now;
      }
      if (prev > 0) window.__gpPerf.frames.push(now - prev);
      prev = now;
      if (window.__gpPerf.frames.length < 110 && window.__gpPerf.stop !== true) {
        requestAnimationFrame(sample);
      }
    }
    requestAnimationFrame(sample);
  });

  await page.locator('.gp-primary-cta').click();
  await sleep(2200);

  const metrics = await page.evaluate(() => {
    window.__gpPerf.stop = true;
    const f = [...window.__gpPerf.frames].sort((a, b) => a - b);
    const p95 = f.length ? f[Math.min(f.length - 1, Math.floor(f.length * 0.95))] : 0;
    const median = f.length ? f[Math.floor(f.length * 0.5)] : 0;
    return {
      firstFrameMs: window.__gpPerf.firstRunningAt
        ? Number((window.__gpPerf.firstRunningAt - window.__gpPerf.clickAt).toFixed(1))
        : -1,
      frameSamples: f.length,
      medianMs: Number(median.toFixed(2)),
      p95Ms: Number(p95.toFixed(2)),
    };
  });
  return { tag, ...metrics };
}

async function openFreshPage(context, width, height, { withClock = false } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  if (withClock) {
    await page.clock.install();
  }
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  if (withClock) {
    await page.clock.runFor(450);
  } else {
    await sleep(450);
  }

  // 학급 없음 / Tauri 미연결 시 자동 직접 입력 전환
  const customBtn = page.getByRole('button', { name: /직접 입력하기/ });
  if (await customBtn.count()) {
    await customBtn.click();
    await (withClock ? page.clock.runFor(200) : sleep(200));
  }
  return { page, errors };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME_EXE,
    headless: true,
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });

  const checks = [];
  const perfStats = [];
  const allErrors = [];

  try {
    // ── 1) 1440×920 기본 창: Light/Dark 3대 테마 idle + 실구동 + 3막 핵심 프레임(가상 시계) + 2명 최소 ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 }, acceptDownloads: true });
      const { page, errors } = await openFreshPage(ctx, 1440, 920, { withClock: true });

      const textarea = page.locator('textarea[aria-label="참여자 이름 목록 입력"]');
      if (await textarea.count()) {
        await textarea.fill(NAMES_28.join('\n'));
        await page.getByRole('button', { name: '목록 적용' }).click();
        await page.clock.runFor(150);
      } else {
        await setCustomNames(page, NAMES_28);
      }
      await setGroupCount(page, 6);

      // T1 Idle (Light)
      await selectTheme(page, '모둠 열차');
      await page.clock.runFor(350);
      await page.screenshot({ path: path.join(OUT_DIR, '01-train-1440-light-idle.png') });
      checks.push(await inspectDom(page, 'train-1440-light-idle', false));

      // T1 Running: 진입/탑승 (2.6s) + 포토피니시/후반 (~21s 전후 대신 2.6s & 건너뛰기)
      await page.locator('.gp-primary-cta').click();
      await page.clock.runFor(900);
      await page.clock.runFor(1800);
      await page.screenshot({ path: path.join(OUT_DIR, '02-train-1440-light-run-boarding.png') });
      checks.push(await inspectDom(page, 'train-1440-light-run', true));

      // 건너뛰기 -> ResultBoard Light + PNG Export 검수
      await page.locator('.gp-skip-btn').click();
      await page.clock.runFor(250);
      await page.screenshot({ path: path.join(OUT_DIR, '03-result-1440-light.png') });
      checks.push(await inspectDom(page, 'result-1440-light', false));

      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'PNG 저장' }).click(),
      ]);
      await dl.saveAs(path.join(OUT_DIR, '04-exported-board-light.png'));

      // ResultBoard Dark + portrait white ring check
      await setColorScheme(page, 'dark');
      await page.clock.runFor(250);
      await page.screenshot({ path: path.join(OUT_DIR, '05-result-1440-dark.png') });

      await page.clock.runFor(450);
      await page.getByRole('button', { name: '설정 바꾸기' }).click();
      await page.clock.runFor(200);

      // G1 Glacier (Dark idle + Act 2 Crack 6.2s + Act 3 Bridge 13.5s + Act 3 Hero Jump 18.4s)
      await selectTheme(page, '빙하 갈라지기');
      await page.clock.runFor(350);
      await page.screenshot({ path: path.join(OUT_DIR, '06-glacier-1440-dark-idle.png') });
      checks.push(await inspectDom(page, 'glacier-1440-dark-idle', false));

      await page.locator('.gp-primary-cta').click();
      await page.clock.runFor(900);
      await page.clock.runFor(5800);
      await page.screenshot({ path: path.join(OUT_DIR, '07-glacier-1440-dark-crack.png') });
      await page.clock.runFor(7000); // total ~13.4s (bridge + drift)
      await page.screenshot({ path: path.join(OUT_DIR, '08-glacier-1440-dark-bridge-drift.png') });
      checks.push(await inspectDom(page, 'glacier-1440-dark-bridge', true));
      await page.clock.runFor(4800); // total ~18.2s (다리 위 주인공 도약 공중 프레임)
      await page.screenshot({ path: path.join(OUT_DIR, '09-glacier-1440-dark-hero-jump.png') });

      await page.locator('.gp-skip-btn').click();
      await page.clock.runFor(500);
      await page.getByRole('button', { name: '설정 바꾸기' }).click();
      await page.clock.runFor(200);

      // E1 Elevator (Light + Dark + Act 3 Door-Gap Fingers Z3.5)
      await setColorScheme(page, 'light');
      await selectTheme(page, '엘리베이터');
      await page.clock.runFor(350);
      await page.screenshot({ path: path.join(OUT_DIR, '10-elevator-1440-light-idle.png') });
      checks.push(await inspectDom(page, 'elevator-1440-light-idle', false));

      await setColorScheme(page, 'dark');
      await page.clock.runFor(250);
      await page.screenshot({ path: path.join(OUT_DIR, '11-elevator-1440-dark-idle.png') });

      await setColorScheme(page, 'light');
      await page.locator('.gp-primary-cta').click();
      await page.clock.runFor(900);
      await page.clock.runFor(2200);
      await page.screenshot({ path: path.join(OUT_DIR, '12-elevator-1440-light-run.png') });
      checks.push(await inspectDom(page, 'elevator-1440-light-run', true));

      // Act 3 문틈 손(Z3.5 e1-peek-fingers) 실측 탐색 후 정확한 프레임 캡처
      await page.clock.runFor(18200);
      let foundPeek = false;
      for (let step = 0; step < 36; step++) {
        await page.clock.runFor(130);
        const hasFingers = await page.evaluate(() => Boolean(document.querySelector('img[src*="e1-peek-fingers"]')));
        if (hasFingers) {
          foundPeek = true;
          break;
        }
      }
      await page.screenshot({ path: path.join(OUT_DIR, '13-elevator-1440-light-act3-peek.png') });
      checks.push(await inspectDom(page, `elevator-act3-peek-found-${foundPeek}`, true));

      // 2명 / 2모둠 최소 Edge
      if (await page.locator('.gp-skip-btn').count()) {
        await page.locator('.gp-skip-btn').click();
        await page.clock.runFor(450);
      } else {
        await page.clock.runFor(2500);
      }
      await page.getByRole('button', { name: '설정 바꾸기' }).click();
      await page.clock.runFor(200);
      await setCustomNames(page, NAMES_2);
      await setGroupCount(page, 2);
      await selectTheme(page, '모둠 열차');
      await page.clock.runFor(250);
      await page.screenshot({ path: path.join(OUT_DIR, '14-min2-1440-train-idle.png') });
      checks.push(await inspectDom(page, 'min2-1440-train-idle', false));

      allErrors.push(...errors.map((e) => `[1440-clock] ${e}`));
      await ctx.close();
    }

    // ── 2) 800×560 최소 창: 레이아웃·터치 타깃·잘림 0% ──
    {
      const ctx = await browser.newContext({ viewport: { width: 800, height: 560 } });
      const { page, errors } = await openFreshPage(ctx, 800, 560, { withClock: false });
      await setCustomNames(page, NAMES_28);
      await setGroupCount(page, 6);

      await selectTheme(page, '모둠 열차');
      await page.screenshot({ path: path.join(OUT_DIR, '15-minwin-800x560-train-idle.png') });
      checks.push(await inspectDom(page, '800x560-train-idle', false));

      await selectTheme(page, '빙하 갈라지기');
      await page.screenshot({ path: path.join(OUT_DIR, '16-minwin-800x560-glacier-idle.png') });

      await selectTheme(page, '엘리베이터');
      await page.screenshot({ path: path.join(OUT_DIR, '17-minwin-800x560-elevator-idle.png') });

      await page.locator('.gp-primary-cta').click();
      await sleep(1600);
      await page.screenshot({ path: path.join(OUT_DIR, '18-minwin-800x560-theater-run.png') });
      checks.push(await inspectDom(page, '800x560-theater-run', true));

      await page.locator('.gp-skip-btn').click();
      await sleep(300);
      await page.screenshot({ path: path.join(OUT_DIR, '19-minwin-800x560-result.png') });

      allErrors.push(...errors.map((e) => `[800x560] ${e}`));
      await ctx.close();
    }

    // ── 3) 1920×1080 전자칠판: 시어터 56px 배너 + 12모둠 50명 극한 밀도 + 실측 rAF ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const { page, errors } = await openFreshPage(ctx, 1920, 1080, { withClock: false });
      await setCustomNames(page, NAMES_28);
      await setGroupCount(page, 6);
      await selectTheme(page, '모둠 열차');

      perfStats.push(await measureRealPlaybackPerf(page, '1080p-6groups-28-train'));
      await page.screenshot({ path: path.join(OUT_DIR, '20-1080p-6g-train-theater-56px.png') });
      checks.push(await inspectDom(page, '1080p-6g-train-theater', true));

      await page.locator('.gp-skip-btn').click();
      await sleep(500);
      await page.getByRole('button', { name: '설정 바꾸기' }).click();
      await sleep(200);

      // 50명 / 12모둠 극한 밀도 (빙하 + 결과보드)
      await setCustomNames(page, NAMES_50);
      await setGroupCount(page, 12);
      await selectTheme(page, '빙하 갈라지기');
      await page.screenshot({ path: path.join(OUT_DIR, '21-1080p-12g-50-glacier-idle.png') });

      await page.locator('.gp-primary-cta').click();
      await sleep(2600);
      await page.screenshot({ path: path.join(OUT_DIR, '22-1080p-12g-50-glacier-run.png') });
      checks.push(await inspectDom(page, '1080p-12g-50-glacier-run', true));

      await page.locator('.gp-skip-btn').click();
      await sleep(300);
      await page.screenshot({ path: path.join(OUT_DIR, '23-1080p-12g-50-result.png') });
      checks.push(await inspectDom(page, '1080p-12g-50-result', false));

      allErrors.push(...errors.map((e) => `[1080p] ${e}`));
      await ctx.close();
    }

    // ── 4) 3840×2160 (DPR 2) 4K 전자칠판 GPU 합성 & p95 검증 ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
      const { page, errors } = await openFreshPage(ctx, 1920, 1080, { withClock: false });
      await setCustomNames(page, NAMES_28);
      await setGroupCount(page, 6);
      await selectTheme(page, '모둠 열차');

      perfStats.push(await measureRealPlaybackPerf(page, '4k-dpr2-6groups-28-train'));
      await page.screenshot({ path: path.join(OUT_DIR, '24-4k-dpr2-train-theater.png') });
      checks.push(await inspectDom(page, '4k-dpr2-train-theater', true));

      allErrors.push(...errors.map((e) => `[4k-dpr2] ${e}`));
      await ctx.close();
    }

    const summary = {
      passName,
      timestamp: new Date().toISOString(),
      consoleOrPageErrors: allErrors,
      perfStats,
      checks,
    };
    await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify({
      errorCount: allErrors.length,
      perfStats,
      brokenImgsTotal: checks.reduce((s, c) => s + c.brokenImgCount, 0),
      hudOverlapMax: Math.max(0, ...checks.map((c) => c.hudOverlapPx)),
      clippedNameplatesTotal: checks.reduce((s, c) => s + c.clippedNameplateCount, 0),
      truncatedBannerTotal: checks.reduce((s, c) => s + c.truncatedBannerCount, 0),
      truncatedNameplateTotal: checks.reduce((s, c) => s + c.truncatedNameplateCount, 0),
      nameplateOverlapTotal: checks.reduce((s, c) => s + c.nameplateOverlapCount, 0),
      plateBodyOcclusionTotal: checks.reduce((s, c) => s + (c.plateBodyOcclusionCount ?? 0), 0),
      ctaOverlapTotal: checks.reduce((s, c) => s + c.ctaOverlapCount, 0),
      clippedManifestCardTotal: checks.reduce((s, c) => s + c.clippedManifestCardCount, 0),
      clippedSidebarFooterTotal: checks.filter((c) => c.clippedSidebarFooter).length,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
