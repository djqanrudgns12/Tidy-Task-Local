// D-Day 컨트롤 패널 종합 Playwright QA 매트릭스 (?dday-control-preview)
// 실행 방법:
//   Vite 개발 서버 기동 후:
//   $env:NODE_PATH="C:\Users\User\AppData\Local\npm-cache\_npx\86170c4cd1c5da32\node_modules"
//   $env:DDAY_QA_URL="http://127.0.0.1:5178"
//   node scripts/qa-dday-control.cjs

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.DDAY_QA_URL || 'http://127.0.0.1:5178';
const output = path.resolve(process.env.DDAY_QA_OUTPUT || 'output/qa/dday-control');
fs.mkdirSync(output, { recursive: true });

const ALL_THEMES = [
  'white',
  'amber',
  'blue',
  'green',
  'rose',
  'purple',
  'slate',
  'sea-glass',
  'apricot',
  'pistachio',
  'periwinkle',
  'mauve',
  'linen',
  'kraft',
  'sepia',
];

const results = [];
function pass(name, detail = 'ok') {
  results.push({ name, detail });
  console.log(`PASS: ${name} (${detail})`);
}

/** @param {import('playwright').Page} page @param {string} query */
async function openPreview(page, query) {
  const url = `${base}/?dday-control-preview${query}`;
  const viewSelector = query.includes('tab=edit')
    ? '.es-scroll'
    : query.includes('tab=archive')
      ? '.ar-scroll'
      : query.includes('tab=settings')
        ? '.st-wrap'
        : '.ctrl-done-btn';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15000 });
      await page.locator('.ctrl-shell').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator(viewSelector).waitFor({ state: 'visible', timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => Boolean(window.__ddayControlQA));
      await page.waitForTimeout(60);
      return;
    } catch (err) {
      if (attempt === 0 && /Execution context was destroyed|navigation/i.test(String(err))) {
        continue;
      }
      throw err;
    }
  }
}

/** 페이지 내 계산 스타일 WCAG 대비율 측정 유틸 */
const DOM_CONTRAST_SCRIPT = () => {
  function parseColor(str) {
    if (!str || str === 'transparent') return null;
    const m = str.match(/rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
    if (!m) return null;
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4]),
    };
  }
  function composite(fg, bg) {
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  }
  function relLum({ r, g, b }) {
    const toLin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  }
  function contrastRatio(c1, c2) {
    const l1 = relLum(c1);
    const l2 = relLum(c2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function effectiveBg(el) {
    const chain = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      chain.push(cur);
      if (cur.classList?.contains('ctrl-shell')) break;
      cur = cur.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) {
      const parsed = parseColor(getComputedStyle(chain[i]).backgroundColor);
      if (parsed && parsed.a > 0) {
        base = parsed.a >= 0.999 ? { ...parsed, a: 1 } : composite(parsed, base);
      }
    }
    return base;
  }
  function measureContrast(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    const bg = effectiveBg(el);
    if (!fg) return null;
    const effectiveFg = fg.a < 0.999 ? composite(fg, bg) : fg;
    return {
      ratio: contrastRatio(effectiveFg, bg),
      color: cs.color,
      bg: cs.backgroundColor,
    };
  }
  return { measureContrast };
};

function resolveChromiumExecutable() {
  try {
    const def = chromium.executablePath();
    if (def && fs.existsSync(def)) return def;
  } catch {}
  const localApp = process.env.LOCALAPPDATA;
  if (localApp) {
    const cacheDir = path.join(localApp, 'ms-playwright');
    if (fs.existsSync(cacheDir)) {
      const dirs = fs.readdirSync(cacheDir).sort().reverse();
      for (const dir of dirs) {
        const headlessExe = path.join(cacheDir, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
        if (dir.startsWith('chromium_headless_shell-') && fs.existsSync(headlessExe)) return headlessExe;
        const chromeExe = path.join(cacheDir, dir, 'chrome-win64', 'chrome.exe');
        if (dir.startsWith('chromium-') && fs.existsSync(chromeExe)) return chromeExe;
      }
    }
  }
  return undefined;
}

async function run() {
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 520, height: 740 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // 다른 작업 공간의 파일 저장으로 Vite HMR full-reload가 개입하지 않도록 WebSocket HMR만 무음 격리합니다.
  await page.addInitScript(() => {
    const NativeWS = window.WebSocket;
    // @ts-ignore
    window.WebSocket = function (url, protocols) {
      const p = Array.isArray(protocols) ? protocols[0] : protocols;
      if (p === 'vite-hmr' || p === 'vite-ping') {
        /** @type {Record<string, Function[]>} */
        const listeners = {};
        const stub = {
          readyState: 1,
          CONNECTING: 0,
          OPEN: 1,
          CLOSING: 2,
          CLOSED: 3,
          protocol: p,
          addEventListener(type, fn) {
            (listeners[type] ||= []).push(fn);
          },
          removeEventListener(type, fn) {
            listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
          },
          dispatchEvent() { return true; },
          send() {},
          close() { stub.readyState = 3; },
        };
        setTimeout(() => {
          const openEv = new Event('open');
          (listeners.open || []).forEach((fn) => fn(openEv));
          if (p === 'vite-hmr') {
            const msgEv = new MessageEvent('message', { data: JSON.stringify({ type: 'connected' }) });
            (listeners.message || []).forEach((fn) => fn(msgEv));
          }
        }, 0);
        return stub;
      }
      return protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
    };
    window.WebSocket.prototype = NativeWS.prototype;
  });

  const runtimeErrors = [];
  page.on('pageerror', (err) => {
    runtimeErrors.push(`pageerror: ${err.message}`);
    console.error('[BROWSER PAGEERROR]', err);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      runtimeErrors.push(`console.error: ${msg.text()}`);
      console.error('[BROWSER CONSOLE ERROR]', msg.text());
    }
  });

  // =========================================================================
  // 1. 무여백 프레임 + 스크롤바 / 동쪽 핸들 분리 + 닫기 버튼 히트테스트
  // =========================================================================
  await page.setViewportSize({ width: 380, height: 580 });
  await openPreview(page, '&frame=native&handles=1&w=380&h=580&items=8&dark=0');

  const nativeMetrics = await page.evaluate(() => {
    const host = document.querySelector('.ctrl-host');
    const shell = document.querySelector('.ctrl-shell');
    const scroll = document.querySelector('.ctrl-scroll');
    const closeBtn = document.querySelector('.ctrl-close');
    const hostCs = getComputedStyle(host);
    const shellCs = getComputedStyle(shell);
    const shellRect = shell.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const closeRect = closeBtn.getBoundingClientRect();
    const hitClose = document.elementFromPoint(
      closeRect.left + closeRect.width / 2,
      closeRect.top + closeRect.height / 2,
    );
    const hitEast = document.elementFromPoint(378, 300);
    return {
      hostPadding: hostCs.paddingTop + ' ' + hostCs.paddingRight + ' ' + hostCs.paddingBottom + ' ' + hostCs.paddingLeft,
      hostBg: hostCs.backgroundColor,
      boxShadow: shellCs.boxShadow,
      borderRadius: shellCs.borderRadius,
      borderColor: shellCs.borderTopColor,
      shellRect: { left: shellRect.left, top: shellRect.top, right: shellRect.right, width: shellRect.width, height: shellRect.height },
      scrollRect: { right: scrollRect.right },
      scrollOverflow: scroll.scrollHeight > scroll.clientHeight,
      closeHitOk: Boolean(hitClose && hitClose.closest('.ctrl-close') && !hitClose.closest('.dd-corner-ne')),
      eastHitClass: hitEast?.className || '',
    };
  });

  assert.equal(nativeMetrics.hostPadding, '0px 0px 0px 0px', 'host padding must be 0px');
  assert.equal(nativeMetrics.hostBg, 'rgba(0, 0, 0, 0)', 'host background must be transparent');
  assert.equal(nativeMetrics.boxShadow, 'none', 'shell must have zero box-shadow');
  assert.equal(nativeMetrics.borderRadius, '16px', 'shell borderRadius must be 16px');
  assert.match(nativeMetrics.borderColor, /^rgb\(\d+, \d+, \d+\)$/, 'shell border must be opaque 6-hex rgb()');
  assert.ok(Math.abs(nativeMetrics.shellRect.width - 380) <= 1 && Math.abs(nativeMetrics.shellRect.height - 580) <= 1);
  assert.ok(nativeMetrics.scrollOverflow, '8 items should make .ctrl-scroll overflow');
  assert.ok(nativeMetrics.scrollRect.right <= nativeMetrics.shellRect.right - 4, '.ctrl-scroll right must clear 4px East handle');
  assert.ok(nativeMetrics.closeHitOk, '.ctrl-close center hit-test must not be intercepted by NE corner handle');
  assert.ok(nativeMetrics.eastHitClass.includes('dd-edge-e'), 'East edge x=378 must hit .dd-edge-e handle');

  // EditSheet (.es-scroll) 동쪽 4px 핸들 분리 검사 (낮은 높이 460에서 스크롤 발생 확인)
  await page.setViewportSize({ width: 380, height: 460 });
  await openPreview(page, '&frame=native&handles=1&w=380&h=460&tab=edit');
  const editScrollOk = await page.evaluate(() => {
    const shell = document.querySelector('.ctrl-shell').getBoundingClientRect();
    const esScroll = document.querySelector('.es-scroll');
    const esRect = esScroll.getBoundingClientRect();
    return {
      rightOk: esRect.right <= shell.right - 4,
      scrollRight: esRect.right,
      shellRight: shell.right,
      overflow: esScroll.scrollHeight > esScroll.clientHeight,
    };
  });
  assert.ok(editScrollOk.rightOk, `.es-scroll right (${editScrollOk.scrollRight}) must be <= ${editScrollOk.shellRight - 4}`);

  // Archive (.ar-scroll) 동쪽 4px 핸들 분리 검사
  await openPreview(page, '&frame=native&handles=1&w=380&h=460&tab=archive');
  const archScrollOk = await page.evaluate(() => {
    const shell = document.querySelector('.ctrl-shell').getBoundingClientRect();
    const arScroll = document.querySelector('.ar-scroll');
    const arRect = arScroll.getBoundingClientRect();
    return {
      rightOk: arRect.right <= shell.right - 4,
      scrollRight: arRect.right,
      shellRight: shell.right,
    };
  });
  assert.ok(archScrollOk.rightOk, `.ar-scroll right (${archScrollOk.scrollRight}) must be <= ${archScrollOk.shellRight - 4}`);

  // Native Light & Dark 스크린샷 저장
  await page.setViewportSize({ width: 380, height: 580 });
  await openPreview(page, '&frame=native&w=380&h=580&items=5&dark=0');
  await page.screenshot({ path: path.join(output, 'native-light.png') });
  await openPreview(page, '&frame=native&w=380&h=580&items=5&dark=1');
  await page.screenshot({ path: path.join(output, 'native-dark.png') });
  pass('Suite 1: zero-bleed native shell & East handle / NE close hit-test', 'list, edit, archive cleared');

  // =========================================================================
  // 2. 15종 테마 × 라이트·다크(30조합) WCAG 대비율 + [완료] CTA 통일 + 잔존 #d97706 검사
  // =========================================================================
  await page.setViewportSize({ width: 440, height: 660 });
  const repThemes = new Set(['amber:0', 'blue:0', 'sea-glass:1', 'rose:1', 'linen:0', 'kraft:0', 'slate:1', 'periwinkle:0']);

  for (const theme of ALL_THEMES) {
    for (const darkFlag of [0, 1]) {
      await openPreview(page, `&theme=${theme}&dark=${darkFlag}&w=380&h=580&items=4`);

      const themeCheck = await page.evaluate((fnStr) => {
        const { measureContrast } = eval(`(${fnStr})`)();
        const doneBtn = document.querySelector('.ctrl-done-btn');
        const addBtn = document.querySelector('.ctrl-add-btn');
        const dotOn = document.querySelector('.b3-dot.on');
        const ctrlLink = document.querySelector('.b3-ctrl-link');
        const doneCs = getComputedStyle(doneBtn);
        const addCs = getComputedStyle(addBtn);
        return {
          doneText: doneBtn.textContent?.trim(),
          doneTitle: doneBtn.getAttribute('title'),
          doneBg: doneCs.backgroundColor,
          doneFg: doneCs.color,
          addBg: addCs.backgroundColor,
          addFg: addCs.color,
          dotOnBg: dotOn ? getComputedStyle(dotOn).backgroundColor : null,
          ctrlLinkFg: ctrlLink ? getComputedStyle(ctrlLink).color : null,
          cHead: measureContrast('.ctrl-head-copy strong')?.ratio ?? 0,
          cTitle: measureContrast('.dd-title')?.ratio ?? 0,
          cDone: measureContrast('.ctrl-done-btn')?.ratio ?? 0,
          cAdd: measureContrast('.ctrl-add-btn')?.ratio ?? 0,
          cCounter: measureContrast('.dd-counter')?.ratio ?? 0,
          cTabOn: measureContrast('.ctrl-tab.on')?.ratio ?? 0,
          cTabOff: measureContrast('.ctrl-tab:not(.on)')?.ratio ?? 0,
          cWidget: measureContrast('.ctrl-widget-btn')?.ratio ?? 0,
          cBannerMode: measureContrast('.ctrl-banner-modes button.on')?.ratio ?? 0,
        };
      }, DOM_CONTRAST_SCRIPT.toString());

      const label = `${theme}:${darkFlag ? 'dark' : 'light'}`;
      assert.equal(themeCheck.doneText, '완료', `${label} done button text`);
      assert.equal(themeCheck.doneTitle, '창 닫기', `${label} done button title`);
      assert.equal(themeCheck.doneBg, themeCheck.addBg, `${label} done/add bg match`);
      assert.equal(themeCheck.doneFg, themeCheck.addFg, `${label} done/add fg match`);

      assert.ok(themeCheck.cHead >= 4.5, `${label} head contrast ${themeCheck.cHead.toFixed(2)}`);
      assert.ok(themeCheck.cTitle >= 4.5, `${label} title contrast ${themeCheck.cTitle.toFixed(2)}`);
      assert.ok(themeCheck.cDone >= 4.5, `${label} done contrast ${themeCheck.cDone.toFixed(2)}`);
      assert.ok(themeCheck.cAdd >= 4.5, `${label} add contrast ${themeCheck.cAdd.toFixed(2)}`);
      assert.ok(themeCheck.cCounter >= 3.0, `${label} counter contrast ${themeCheck.cCounter.toFixed(2)}`);
      assert.ok(themeCheck.cTabOn >= 3.0 && themeCheck.cTabOff >= 3.0, `${label} tab contrast`);
      assert.ok(themeCheck.cWidget >= 3.0, `${label} widget btn contrast ${themeCheck.cWidget.toFixed(2)}`);
      assert.ok(themeCheck.cBannerMode >= 3.0, `${label} banner mode contrast ${themeCheck.cBannerMode.toFixed(2)}`);

      if (theme !== 'amber') {
        assert.notEqual(themeCheck.dotOnBg, 'rgb(217, 119, 6)', `${label} .b3-dot.on hardcoded #d97706`);
        assert.notEqual(themeCheck.ctrlLinkFg, 'rgb(217, 119, 6)', `${label} .b3-ctrl-link hardcoded #d97706`);
      }

      if (repThemes.has(`${theme}:${darkFlag}`)) {
        await page.screenshot({ path: path.join(output, `theme-${theme}-${darkFlag ? 'dark' : 'light'}.png`) });
      }
    }
  }

  // 비-호박 테마(blue, sea-glass, purple) 설정 탭 .st-startup-btn 잔존 #d97706 검사
  for (const theme of ['blue', 'sea-glass', 'purple']) {
    await openPreview(page, `&theme=${theme}&dark=0&tab=settings&w=380&h=580`);
    const startupColors = await page.evaluate(() => {
      const btn = document.querySelector('.st-startup-btn');
      if (!btn) return null;
      const cs = getComputedStyle(btn);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    assert.ok(startupColors, `${theme} .st-startup-btn should render in preview`);
    assert.notEqual(startupColors.bg, 'rgb(217, 119, 6)', `${theme} .st-startup-btn must not be #d97706`);
  }
  pass('Suite 2: 15 themes × 2 modes (30 combos)', 'all WCAG AA >= 4.5 / >= 3.0, CTA unified, no #d97706');

  // =========================================================================
  // 3. uiFontFamily 연동 검사 (맑은고딕, 메이플스토리 L, 교보 손글씨 2025, 미등록 커스텀 폴백)
  // =========================================================================
  const fontChecks = [
    { q: '맑은고딕', expect: 'Malgun Gothic' },
    { q: '메이플스토리 L', expect: '메이플스토리 L' },
    { q: '교보 손글씨 2025', expect: '교보 손글씨 2025' },
    { q: '존재하지않는커스텀글꼴', expect: '메이플스토리 L' },
  ];
  for (const fc of fontChecks) {
    await openPreview(page, `&uifont=${encodeURIComponent(fc.q)}&w=380&h=580&items=4`);
    const bentoTtlFont = await page.evaluate(() => getComputedStyle(document.querySelector('.b3-mini-ttl')).fontFamily);
    assert.ok(bentoTtlFont.includes(fc.expect), `uifont=${fc.q} on .b3-mini-ttl: "${bentoTtlFont}"`);
    await page.getByRole('radio', { name: '대표 1개' }).click();
    await page.locator('.b3-title').waitFor({ state: 'visible' });
    const fonts = await page.evaluate(() => ({
      shell: getComputedStyle(document.querySelector('.ctrl-shell')).fontFamily,
      title: getComputedStyle(document.querySelector('.dd-title')).fontFamily,
      done: getComputedStyle(document.querySelector('.ctrl-done-btn')).fontFamily,
      bannerTitle: getComputedStyle(document.querySelector('.b3-title')).fontFamily,
    }));
    for (const [k, v] of Object.entries(fonts)) {
      assert.ok(v.includes(fc.expect), `uifont=${fc.q} on ${k}: "${v}" should include "${fc.expect}"`);
    }
  }
  pass('Suite 3: uiFontFamily linkage', '4 fonts verified across .ctrl-shell, .dd-title, .ctrl-done-btn, .b3-title');

  // =========================================================================
  // 4. 창 리사이즈 하네스 매트릭스 (6 폭 × 4 높이 × 폰트 × 뷰 × 항상 1열)
  // =========================================================================
  const WIDTHS = [340, 380, 452, 546, 560, 580];
  const HEIGHTS = [460, 580, 660, 860];
  await openPreview(page, '&frame=native&items=6&windows=3&fs=10&theme=amber&dark=0');
  let matrixCount = 0;

  for (const w of WIDTHS) {
    for (const h of HEIGHTS) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(45);
      const res = await page.evaluate(() => {
        const shell = document.querySelector('.ctrl-shell');
        const scroll = document.querySelector('.ctrl-scroll');
        const items = [...document.querySelectorAll('.dd-sort-item')];
        const headBtns = [...document.querySelectorAll('.ctrl-head-btn')].map((b) => b.getBoundingClientRect());
        const footBtns = [...document.querySelectorAll('.ctrl-foot button')].map((b) => b.getBoundingClientRect());
        const sRect = shell.getBoundingClientRect();
        const lefts = items.map((el) => Math.round(el.getBoundingClientRect().left));
        const tops = items.map((el) => Math.round(el.getBoundingClientRect().top));
        return {
          shellOverflowX: shell.scrollWidth > shell.clientWidth + 1,
          scrollOverflowX: scroll.scrollWidth > scroll.clientWidth + 1,
          singleColLeftSpread: lefts.length ? Math.max(...lefts) - Math.min(...lefts) : 0,
          strictlyIncreasingTops: tops.every((t, i) => i === 0 || t > tops[i - 1]),
          headInside: headBtns.every((r) => r.left >= sRect.left && r.right <= sRect.right),
          footInside: footBtns.every((r) => r.left >= sRect.left && r.right <= sRect.right),
          footNoOverlap: footBtns.length < 2 || footBtns[0].right <= footBtns[1].left + 1,
        };
      });
      assert.equal(res.shellOverflowX, false, `${w}x${h} .ctrl-shell horizontal overflow`);
      assert.equal(res.scrollOverflowX, false, `${w}x${h} .ctrl-scroll horizontal overflow`);
      assert.ok(res.singleColLeftSpread <= 1, `${w}x${h} .ctrl-list must stay 1-column (spread ${res.singleColLeftSpread})`);
      assert.equal(res.strictlyIncreasingTops, true, `${w}x${h} .ctrl-list items must stack vertically`);
      assert.equal(res.headInside && res.footInside && res.footNoOverlap, true, `${w}x${h} header/footer fit`);
      matrixCount += 1;

      if (
        (w === 340 && h === 460) ||
        (w === 380 && h === 580) ||
        (w === 560 && h === 660) ||
        (w === 580 && h === 860)
      ) {
        await page.screenshot({ path: path.join(output, `size-${w}x${h}.png`) });
      }
    }
  }

  // 글꼴 크기(9, 13, 15pt), items(0, 1), 뷰(edit + 달력, settings, archive, 퀵 메뉴) 점검
  for (const fsVal of [9, 13, 15]) {
    await page.setViewportSize({ width: 340, height: 520 });
    await openPreview(page, `&frame=native&fs=${fsVal}&items=3&windows=3`);
    const noOverflow = await page.evaluate(() => {
      const sh = document.querySelector('.ctrl-shell');
      const sc = document.querySelector('.ctrl-scroll');
      return sh.scrollWidth <= sh.clientWidth + 1 && sc.scrollWidth <= sc.clientWidth + 1;
    });
    assert.equal(noOverflow, true, `fs=${fsVal} at 340w overflowed horizontally`);
  }

  for (const itemCnt of [0, 1]) {
    await openPreview(page, `&frame=native&w=380&h=580&items=${itemCnt}`);
    const qa = await page.evaluate(() => window.__ddayControlQA.getState());
    assert.equal(qa.activeIds.length, itemCnt);
    assert.equal(qa.sortDisabled, true, `items=${itemCnt} must disable sort`);
  }

  // Wide Edit + Calendar Open
  await page.setViewportSize({ width: 560, height: 660 });
  await openPreview(page, '&frame=native&tab=edit');
  await page.locator('.es-date-btn').click();
  await page.locator('.es-cal-wrap').waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(output, 'view-edit-wide-cal.png') });

  // Wide Settings
  await openPreview(page, '&frame=native&tab=settings');
  await page.screenshot({ path: path.join(output, 'view-settings-wide.png') });

  // Archive View
  await page.setViewportSize({ width: 380, height: 580 });
  await openPreview(page, '&frame=native&tab=archive');
  await page.screenshot({ path: path.join(output, 'view-archive.png') });

  // Quick Menu screenshot
  await openPreview(page, '&frame=native&items=4');
  await page.evaluate(() => window.__ddayControlQA.openContextOnIndex(2));
  await page.locator('.ctrl-ctx').waitFor({ state: 'visible' });
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'view-quick-menu.png') });

  pass('Suite 4: Resize Harness width/height/font/view matrix', `${matrixCount} size cells + fs/items/views verified`);

  // =========================================================================
  // 5. 스마트 세로 드래그 · 클릭 · 취소 · Esc · 터치 우클릭 · 키보드 · 연타 · IPC 레이스
  // =========================================================================
  await page.setViewportSize({ width: 380, height: 680 });
  await openPreview(page, '&frame=native&items=4');

  // 5.1 짧은 제목 클릭 -> edit 진입 & Esc 복귀
  const firstTitleBtn = page.locator('.dd-sort-item').nth(0).locator('.dd-title-btn');
  await firstTitleBtn.click();
  await page.waitForFunction(() => window.__ddayControlQA.getState().subView === 'edit');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ddayControlQA.getState().subView === 'main');
  pass('5.1 short title click -> edit & Esc -> main');

  // 5.2 가로 20px 드래그 (dy = 0) -> 정렬 미발동
  const box0 = await page.locator('.dd-sort-item').nth(0).locator('.dd-title-btn').boundingBox();
  const initialIds = await page.evaluate(() => window.__ddayControlQA.getState().activeIds);
  await page.mouse.move(box0.x + 12, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.mouse.move(box0.x + 32, box0.y + box0.height / 2, { steps: 6 });
  const horizActive = await page.evaluate(() => window.__ddayControlQA.getState().sortActive);
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterHoriz = await page.evaluate(() => window.__ddayControlQA.getState());
  assert.equal(horizActive, false, 'horizontal 20px drag must not activate sort');
  assert.deepEqual(afterHoriz.activeIds, initialIds);
  // If user didn't drag far horizontally? Wait: if title button had click after 20px horiz move inside title-btn, let's return if edit opened
  if (afterHoriz.subView === 'edit') {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__ddayControlQA.getState().subView === 'main');
  }
  pass('5.2 horizontal 20px drag on title does not trigger sort');

  // 5.3 세로 드래그 (.dd-title-btn에서 시작해 item 2 아래로 이동 + 폭 고정 + .ctrl-scroll Y 경계 제한 + 착지 무되튐)
  const item0Box = await page.locator('.dd-sort-item').nth(0).locator('.dd-title-btn').boundingBox();
  const item2Box = await page.locator('.dd-sort-item').nth(2).boundingBox();
  const card0InitBox = await page.locator('.dd-sort-item').nth(0).boundingBox();
  const scrollBox = await page.locator('.ctrl-scroll').boundingBox();

  await page.mouse.move(item0Box.x + 24, item0Box.y + item0Box.height / 2);
  await page.mouse.down();
  await page.mouse.move(item0Box.x + 24, item2Box.y + item2Box.height * 0.72, { steps: 12 });
  await page.waitForTimeout(80);

  const midDrag = await page.evaluate(() => {
    const draggingEl = document.querySelector('.dd-sort-item[data-dnd-dragging]');
    const rect = draggingEl?.getBoundingClientRect();
    return {
      hasDragging: Boolean(draggingEl),
      width: rect?.width ?? 0,
      top: rect?.top ?? 0,
      bottom: rect?.bottom ?? 0,
      qa: window.__ddayControlQA.getState(),
    };
  });
  assert.equal(midDrag.hasDragging, true, '[data-dnd-dragging] must be active mid-drag');
  assert.ok(Math.abs(midDrag.width - card0InitBox.width) <= 1.5, `dragged width ${midDrag.width} != ${card0InitBox.width}`);
  assert.ok(midDrag.top >= scrollBox.y - 2 && midDrag.bottom <= scrollBox.y + scrollBox.height + 2, 'dragged item Y must stay within .ctrl-scroll bounds');

  // 헤더 위(-40px)까지 과도하게 끌었을 때도 .ctrl-scroll 상단 경계를 넘지 않는지 확인
  await page.mouse.move(item0Box.x + 24, 12, { steps: 8 });
  await page.waitForTimeout(40);
  const topClamped = await page.evaluate(() => document.querySelector('.dd-sort-item[data-dnd-dragging]')?.getBoundingClientRect().top ?? 0);
  assert.ok(topClamped >= scrollBox.y - 2, `top clamped (${topClamped}) must remain >= scroll top (${scrollBox.y})`);

  // 다시 item 2 아래로 내린 뒤 드롭하고 rAF 샘플링으로 0-프레임 되튐 없음 확인
  await page.mouse.move(item0Box.x + 24, item2Box.y + item2Box.height * 0.72, { steps: 10 });
  await page.waitForTimeout(60);

  await page.evaluate(() => {
    window.__ddayDropOrderSamples = [];
    const sample = () => {
      window.__ddayDropOrderSamples.push(window.__ddayControlQA.getState().renderIds);
      if (window.__ddayDropOrderSamples.length < 15) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.up();
  await page.waitForTimeout(320);

  const afterDrop = await page.evaluate(() => ({
    qa: window.__ddayControlQA.getState(),
    samples: window.__ddayDropOrderSamples,
  }));
  assert.equal(afterDrop.qa.subView, 'main', 'dropping vertical drag must NOT open edit sheet');
  assert.notDeepEqual(afterDrop.qa.activeIds, initialIds, 'vertical drag must commit new order');
  assert.equal(afterDrop.qa.bannerFirstId, afterDrop.qa.activeIds[0], 'banner representative must update to index 0');
  const revertedSample = afterDrop.samples.some((s) => JSON.stringify(s) === JSON.stringify(initialIds));
  assert.equal(revertedSample, false, 'order must NEVER snap back to initialIds across drop animation frames');
  pass('5.3 smart vertical drag from title -> reorder + width lock + Y clamp + zero snapback');

  // 5.4 카드 본문(.dd-date) 드래그 -> 순서 변경
  const beforeBodyDrag = await page.evaluate(() => window.__ddayControlQA.getState().activeIds);
  const date0Box = await page.locator('.dd-sort-item').nth(0).locator('.dd-date').boundingBox();
  const row1Box = await page.locator('.dd-sort-item').nth(1).boundingBox();
  await page.mouse.move(date0Box.x + date0Box.width / 2, date0Box.y + date0Box.height / 2);
  await page.mouse.down();
  await page.mouse.move(date0Box.x + date0Box.width / 2, row1Box.y + row1Box.height * 0.78, { steps: 12 });
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(260);
  const afterBodyDrag = await page.evaluate(() => window.__ddayControlQA.getState());
  assert.equal(afterBodyDrag.subView, 'main');
  assert.notDeepEqual(afterBodyDrag.activeIds, beforeBodyDrag, 'dragging from .dd-date body must reorder');
  pass('5.4 vertical drag from card body (.dd-date) -> reorder');

  // 5.5 드래그 중 Esc -> 원상 복구 + 클릭 가드로 편집 열림 차단 + 다이얼로그 유지
  const preEscIds = await page.evaluate(() => window.__ddayControlQA.getState().activeIds);
  const escSrcBox = await page.locator('.dd-sort-item').nth(0).locator('.dd-title-btn').boundingBox();
  const escDstBox = await page.locator('.dd-sort-item').nth(2).boundingBox();
  await page.mouse.move(escSrcBox.x + 20, escSrcBox.y + escSrcBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(escSrcBox.x + 20, escDstBox.y + escDstBox.height * 0.72, { steps: 12 });
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.__ddayControlQA.getState().sortActive), true);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(180);
  const postEsc = await page.evaluate(() => window.__ddayControlQA.getState());
  assert.deepEqual(postEsc.activeIds, preEscIds, 'Esc mid-drag must revert order');
  assert.equal(postEsc.subView, 'main', 'Esc mid-drag + mouseup must not open edit sheet');
  assert.equal(await page.locator('.ctrl-shell').isVisible(), true, 'Esc mid-drag must keep dialog open');
  pass('5.5 mid-drag Esc -> revert, guard click, keep dialog open');

  // 5.6 인터랙티브 컨트롤(.dd-check, .dd-edit-btn, .dd-cap-seg, .dd-capsule 2px 틈새) 위 드래그 -> 정렬 무발동
  const beforeBlockedIds = await page.evaluate(() => window.__ddayControlQA.getState().activeIds);
  const noSortLocators = [
    page.locator('.dd-sort-item').nth(0).locator('.dd-check'),
    page.locator('.dd-sort-item').nth(0).locator('.dd-edit-btn'),
    page.locator('.dd-sort-item').nth(0).locator('.dd-cap-seg').first(),
  ];
  for (const loc of noSortLocators) {
    const b = await loc.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + 48, { steps: 8 });
    assert.equal(await page.evaluate(() => window.__ddayControlQA.getState().sortActive), false);
    await page.mouse.up();
    await page.waitForTimeout(40);
  }
  // .dd-capsule 첫 버튼과 둘째 버튼 사이 2px 틈새 테스트
  const seg0Box = await page.locator('.dd-sort-item').nth(0).locator('.dd-cap-seg').nth(0).boundingBox();
  const seg1Box = await page.locator('.dd-sort-item').nth(0).locator('.dd-cap-seg').nth(1).boundingBox();
  const gapX = (seg0Box.x + seg0Box.width + seg1Box.x) / 2;
  const gapY = seg0Box.y + seg0Box.height / 2;
  await page.mouse.move(gapX, gapY);
  await page.mouse.down();
  await page.mouse.move(gapX, gapY + 48, { steps: 8 });
  assert.equal(await page.evaluate(() => window.__ddayControlQA.getState().sortActive), false, '.dd-capsule 2px gap must not start sort');
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => window.__ddayControlQA.getState().activeIds), beforeBlockedIds);
  pass('5.6 drag over .dd-check / .dd-edit-btn / .dd-cap-seg / .dd-capsule gap blocked');

  // 5.7 .dd-check 150ms 내 연타 -> 1건만 완료 (removalGuard + completingIds)
  await openPreview(page, '&frame=native&items=4');
  const chkBox = await page.locator('.dd-sort-item').nth(0).locator('.dd-check').boundingBox();
  await page.mouse.click(chkBox.x + chkBox.width / 2, chkBox.y + chkBox.height / 2);
  await page.waitForTimeout(80);
  await page.mouse.click(chkBox.x + chkBox.width / 2, chkBox.y + chkBox.height / 2);
  await page.waitForTimeout(160);
  const afterDblCheck = await page.evaluate(() => window.__ddayControlQA.getState());
  assert.equal(afterDblCheck.activeIds.length, 3, 'rapid double-click on .dd-check must complete only 1 item');
  pass('5.7 rapid double-click on .dd-check completes only 1 item');

  // 5.8 터치·드래그 가드 활성 중 contextmenu 억제(C5) + 일반 마우스 우클릭 '맨 위로' 타일 승격
  await openPreview(page, '&frame=native&items=4');
  // 5.8a-1 포인터 드래그 중 contextmenu 이벤트 -> 메뉴 차단 확인
  const dragBox = await page.locator('.dd-sort-item').nth(0).locator('.dd-title-btn').boundingBox();
  await page.mouse.move(dragBox.x + 20, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + 20, dragBox.y + 80, { steps: 10 });
  const suppressedDuringDrag = await page.evaluate(() => {
    const row = document.querySelector('.dd-sort-item .dd-row');
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 160 }));
    return window.__ddayControlQA.getState().contextMenuOpen;
  });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForFunction(() => !window.__ddayControlQA.getState().sortActive);
  assert.equal(suppressedDuringDrag, false, 'contextmenu must be suppressed while pointer drag is active');

  // 5.8a-2 터치 홀드 중 contextmenu 이벤트 -> touchOrPenHeld로 메뉴 차단 확인
  const suppressedDuringTouchHold = await page.evaluate(() => {
    const row = document.querySelector('.dd-sort-item .dd-row');
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0, bubbles: true }));
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 160 }));
    const openWhileTouchHeld = window.__ddayControlQA.getState().contextMenuOpen;
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0, bubbles: true }));
    return openWhileTouchHeld;
  });
  assert.equal(suppressedDuringTouchHold, false, 'contextmenu must be suppressed while touch pointer is held');

  // 5.8b 일반 마우스 우클릭 -> '맨 위로' 타일 클릭 -> 0번 자리 + 배너 갱신
  const card2Id = await page.evaluate(() => window.__ddayControlQA.getState().activeIds[2]);
  const card2Loc = page.locator('.dd-sort-item').nth(2).locator('.dd-row');
  await card2Loc.click({ button: 'right', position: { x: 80, y: 18 } });
  await page.locator('.ctrl-ctx').waitFor({ state: 'visible' });
  await page.waitForTimeout(150);
  await page.locator('.ctrl-ctx').getByRole('menuitem', { name: /맨 위로/ }).click();
  await page.waitForFunction((id) => window.__ddayControlQA && window.__ddayControlQA.getState().activeIds[0] === id, card2Id);
  const afterMoveTop = await page.evaluate(() => window.__ddayControlQA.getState());
  assert.equal(afterMoveTop.bannerFirstId, card2Id, 'move-top must update banner representative');
  pass('5.8 drag/touch contextmenu suppression & mouse right-click quick-menu 맨 위로');

  // 5.9 키보드 Tab -> .dd-kbd-handle (캡슐 뒤) -> 카드 높이 0px 변화 -> Space/ArrowDown/Space 순서 이동
  await openPreview(page, '&frame=native&items=4');
  const kbdCard0Ids = await page.evaluate(() => window.__ddayControlQA.getState().activeIds);
  const row0HeightBefore = await page.locator('.dd-sort-item').nth(0).locator('.dd-row').evaluate((el) => el.getBoundingClientRect().height);
  // 3rd .dd-cap-seg에 포커스 후 Tab 한 번 -> .dd-kbd-handle 도달 검증
  await page.locator('.dd-sort-item').nth(0).locator('.dd-cap-seg').nth(2).focus();
  await page.keyboard.press('Tab');
  const focusedInfo = await page.evaluate(() => {
    const el = document.activeElement;
    const row = document.querySelector('.dd-sort-item .dd-row');
    return {
      isKbdHandle: Boolean(el && el.classList.contains('dd-kbd-handle')),
      heightAfter: row.getBoundingClientRect().height,
    };
  });
  assert.equal(focusedInfo.isKbdHandle, true, 'Tab after 3rd .dd-cap-seg must focus .dd-kbd-handle');
  assert.ok(Math.abs(focusedInfo.heightAfter - row0HeightBefore) < 0.5, 'focusing .dd-kbd-handle must not shift card height');

  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  await page.keyboard.press('Space');
  await page.waitForFunction((expectedSecond) => window.__ddayControlQA.getState().activeIds[1] === expectedSecond, kbdCard0Ids[0]);
  pass('5.9 keyboard .dd-kbd-handle Tab order, 0px shift, Space/ArrowDown reorder');

  // 5.10 Archive 비우기 확인 다이얼로그 & EditSheet 달력에서 Esc 단계별 닫기 (I3)
  await openPreview(page, '&frame=native&tab=archive');
  await page.getByRole('button', { name: '비우기' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'first Esc closes confirmClear dialog');
  assert.equal(await page.evaluate(() => window.__ddayControlQA.getState().subView), 'archive', 'first Esc keeps archive view open');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ddayControlQA.getState().subView === 'main');

  await openPreview(page, '&frame=native&tab=edit');
  await page.locator('.es-date-btn').click();
  await page.locator('.es-cal-wrap').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.es-cal-wrap').count(), 0, 'first Esc closes calendar wrapper');
  assert.equal(await page.evaluate(() => window.__ddayControlQA.getState().subView), 'create', 'first Esc in EditSheet calendar closes only calendar');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ddayControlQA.getState().subView === 'main');
  pass('5.10 Archive confirmClear & EditSheet calendar Esc step-back');

  // 5.11 IPC 시뮬레이션: frozen / fail 롤백 + 200ms 지연 연속 드래그 레이스(최종 2번째 순서 수렴)
  await openPreview(page, '&frame=native&items=4');
  const raceStartIds = await page.evaluate(() => window.__ddayControlQA.getState().activeIds);

  // 5.11a frozen 시뮬레이션
  await page.evaluate(() => window.__ddayControlQA.setIpcSimulation({ frozen: true, delayMs: 30 }));
  await page.evaluate(() => window.__ddayControlQA.openContextOnIndex(2));
  await page.locator('.ctrl-ctx').getByRole('menuitem', { name: /맨 위로/ }).click();
  await page.locator('.ctrl-toast').waitFor({ state: 'visible' });
  const toastFrozen = await page.locator('.ctrl-toast').textContent();
  assert.ok(toastFrozen?.includes('잠금'), `frozen toast expected, got: ${toastFrozen}`);
  assert.deepEqual(await page.evaluate(() => window.__ddayControlQA.getState().activeIds), raceStartIds);

  // 5.11b fail 시뮬레이션
  await page.evaluate(() => window.__ddayControlQA.setIpcSimulation({ fail: true, delayMs: 30 }));
  await page.evaluate(() => window.__ddayControlQA.openContextOnIndex(2));
  await page.locator('.ctrl-ctx').getByRole('menuitem', { name: /맨 위로/ }).click();
  await page.waitForFunction(() => document.querySelector('.ctrl-toast')?.textContent?.includes('원래 순서'));
  assert.deepEqual(await page.evaluate(() => window.__ddayControlQA.getState().activeIds), raceStartIds);

  // 5.11c 200ms 지연 중 연속 2회 순서 변경 -> 최종 2번째 순서로 진동 없이 수렴
  await page.evaluate(() => window.__ddayControlQA.setIpcSimulation({ delayMs: 200, fail: false, frozen: false }));
  const id0 = raceStartIds[0];
  const id1 = raceStartIds[1];
  const id2 = raceStartIds[2];
  // 1번째 변경: index 1 맨 위로
  await page.evaluate(() => window.__ddayControlQA.openContextOnIndex(1));
  await page.locator('.ctrl-ctx').getByRole('menuitem', { name: /맨 위로/ }).click();
  await page.waitForTimeout(50);
  // 아직 1번째 IPC 응답(200ms) 오기 전에 2번째 변경: id2를 맨 위로
  await page.evaluate(() => window.__ddayControlQA.openContextOnIndex(2));
  await page.locator('.ctrl-ctx').getByRole('menuitem', { name: /맨 위로/ }).click();
  await page.waitForTimeout(350);
  const postRace = await page.evaluate(() => window.__ddayControlQA.getState());
  assert.equal(postRace.activeIds[0], id2, `second reorder must win (got ${postRace.activeIds[0]}, expected ${id2}, vs first ${id1}/${id0})`);
  assert.equal(Object.keys(postRace.overlayState.byLabel).length, 0, 'overlay must settle cleanly after second IPC');
  pass('5.11 IPC overlay: frozen revert, fail revert, 200ms race settles on 2nd order');

  assert.equal(runtimeErrors.length, 0, `Runtime errors detected:\n${runtimeErrors.join('\n')}`);

  await browser.close();
  console.log(`\nALL ${results.length} QA SUITES PASSED (0 runtime errors). Artifacts -> ${output}`);
}

run().catch((err) => {
  console.error('\nQA FAILED:', err);
  process.exit(1);
});
