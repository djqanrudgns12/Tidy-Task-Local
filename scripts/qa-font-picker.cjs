// ═══════════════════════════════════════════════════════════════════
// 글꼴 선택 패널(H3 + D1 에어리 포스트잇) 종합 Playwright QA 스크립트
// 실행:
//   $env:NODE_PATH="C:\Users\User\AppData\Local\npm-cache\_npx\86170c4cd1c5da32\node_modules"
//   $env:FP_QA_URL="http://127.0.0.1:5189"
//   node scripts/qa-font-picker.cjs
// ═══════════════════════════════════════════════════════════════════
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.FP_QA_URL || 'http://127.0.0.1:5189';
const output = path.resolve(process.env.FP_QA_OUTPUT || 'output/qa/font-picker');
fs.mkdirSync(output, { recursive: true });

const results = [];
function pass(name, detail = 'ok') {
  results.push({ name, detail });
  console.log(`PASS: ${name} (${detail})`);
}

async function run() {
  const launchOpts = { headless: true };
  if (process.env.PLAYWRIGHT_CHROME && fs.existsSync(process.env.PLAYWRIGHT_CHROME)) {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROME;
  }
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  // ── 1. 기본 ?font-picker-preview (앰버 라이트) ───────────────────────────
  await page.goto(`${base}/?font-picker-preview&theme=amber`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="standalone-panel"] .fp-root').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);

  const panel = page.locator('[data-testid="standalone-panel"] .fp-root');

  // 1-A. 7개 기본 카테고리 탭 1줄 수납 검증
  const tabMetrics = await panel.evaluate((el) => {
    const bar = el.querySelector('.fp-cat-bar');
    const pills = Array.from(el.querySelectorAll('.fp-cat-pill'));
    const tops = new Set(pills.map((p) => Math.round(p.getBoundingClientRect().top)));
    return {
      count: pills.length,
      labels: pills.map((p) => p.textContent.trim()),
      rowCount: tops.size,
      barHeight: Math.round(bar.getBoundingClientRect().height),
      overflowX: bar.scrollWidth > bar.clientWidth,
    };
  });
  assert.equal(tabMetrics.count, 7);
  assert.equal(tabMetrics.rowCount, 1, `7개 기본 탭이 1줄이어야 함: ${JSON.stringify(tabMetrics)}`);
  assert.ok(tabMetrics.barHeight <= 36, `탭 바 높이 초과: ${tabMetrics.barHeight}px`);
  assert.equal(tabMetrics.overflowX, false, '탭 바 가로 오버플로우 금지');
  pass('7개 기본 탭 1줄 완벽 수납', `${tabMetrics.barHeight}px · ${tabMetrics.labels.join('/')}`);

  // 1-B. 43개 패밀리 행 전수 가로 잘림 0px 검증
  const rowAudit = await panel.evaluate((el) => {
    const panelRect = el.getBoundingClientRect();
    const rows = Array.from(el.querySelectorAll('.fp-row'));
    const issues = [];
    for (const r of rows) {
      const rr = r.getBoundingClientRect();
      if (r.scrollWidth > r.clientWidth + 1) {
        issues.push(`row overflow: ${r.textContent.trim()} (${r.scrollWidth} > ${r.clientWidth})`);
      }
      const chips = Array.from(r.querySelectorAll('.fp-wchip'));
      for (const c of chips) {
        const cr = c.getBoundingClientRect();
        if (cr.right > panelRect.right - 2) {
          issues.push(`chip right clip: ${c.textContent.trim()} (${cr.right} > ${panelRect.right})`);
        }
        if (cr.width < 15) {
          issues.push(`chip squished: ${c.textContent.trim()} (${cr.width}px)`);
        }
      }
    }
    return { rowCount: rows.length, issues };
  });
  assert.equal(rowAudit.rowCount, 43, `전체 행 수가 43개여야 함: ${rowAudit.rowCount}`);
  assert.deepEqual(rowAudit.issues, [], `행/칩 잘림 발견: ${rowAudit.issues.join('; ')}`);
  pass('43개 패밀리 행 · 모든 굵기 칩 가로 무잘림', `${rowAudit.rowCount}행 전수 통과`);

  // 1-C. 굵기 칩 호버 시 실시간 고유 글꼴 변신 + 클릭 선택 검증
  // 고딕 탭 → 페이퍼로지 EB 호버 → .fp-name computed fontFamily 변경 검증
  await panel.locator('.fp-cat-pill', { hasText: '고딕' }).click();
  await page.waitForTimeout(80);
  const paperRow = panel.locator('.fp-row', { hasText: '페이퍼로지' });
  const beforePaperFont = await paperRow.locator('.fp-name').evaluate((el) => getComputedStyle(el).fontFamily);
  await paperRow.locator('.fp-wchip', { hasText: 'EB' }).hover();
  await page.waitForTimeout(60);
  const hoverPaperFont = await paperRow.locator('.fp-name').evaluate((el) => getComputedStyle(el).fontFamily);
  assert.ok(hoverPaperFont.includes('페이퍼로지 EB'), `EB 호버 시 폰트 미전환: ${hoverPaperFont}`);
  assert.notEqual(beforePaperFont, hoverPaperFont);
  await panel.screenshot({ path: path.join(output, '01-amber-gothic-hover-eb.png') });
  pass('페이퍼로지 EB 칩 호버 실시간 글꼴 변신', `${beforePaperFont} -> ${hoverPaperFont}`);

  // 손글씨 탭 → 교보 손글씨 4종 보존 및 24 호버/선택 검증
  await panel.locator('.fp-cat-pill', { hasText: '손글씨' }).click();
  await page.waitForTimeout(80);
  const kyoboRow = panel.locator('.fp-row', { hasText: '교보 손글씨' });
  const kyoboChips = await kyoboRow.locator('.fp-wchip').allTextContents();
  assert.deepEqual(kyoboChips, ['19', '23', '24', '25']);
  await kyoboRow.locator('.fp-wchip', { hasText: '25' }).hover();
  await page.waitForTimeout(60);
  const hoverKyoboFont = await kyoboRow.locator('.fp-name').evaluate((el) => getComputedStyle(el).fontFamily);
  assert.ok(hoverKyoboFont.includes('교보 손글씨 2025'), `교보 25 호버 미전환: ${hoverKyoboFont}`);
  await kyoboRow.locator('.fp-wchip', { hasText: '25' }).click();
  await page.waitForTimeout(60);
  assert.ok((await page.locator('[data-testid="selected-font"]').textContent()).includes('교보 손글씨 2025'));
  await panel.screenshot({ path: path.join(output, '02-amber-hand-kyobo25.png') });
  pass('교보 손글씨 19·23·24·25 보존 + 호버/선택 정상', kyoboChips.join('/'));

  // 포인트 탭 → 여기어때 잘난체 1·2·고딕 보존 + 전체 탭 복귀 캡처
  await panel.locator('.fp-cat-pill', { hasText: '포인트' }).click();
  await page.waitForTimeout(80);
  const jalnanChips = await panel.locator('.fp-row', { hasText: '여기어때 잘난체' }).locator('.fp-wchip').allTextContents();
  assert.deepEqual(jalnanChips, ['1', '2', '고딕']);
  await panel.locator('.fp-cat-pill', { hasText: '전체' }).click();
  await page.waitForTimeout(80);
  await panel.screenshot({ path: path.join(output, '03-amber-all-default.png') });
  pass('여기어때 잘난체 1·2·고딕 보존 및 전체 탭 복귀', jalnanChips.join('/'));

  // ── 2. 테마 매트릭스 캡처 (로즈 라이트 / 크라프트 라이트 / 페리윙클 다크 / 툴킷 오션) ──
  const themeSnaps = [
    { query: '&theme=rose', file: '04-rose-light.png', label: '더스티 로즈 라이트' },
    { query: '&theme=kraft', file: '05-kraft-light.png', label: '크라프트 메모어 라이트' },
    { query: '&theme=periwinkle&dark=1', file: '06-periwinkle-dark.png', label: '페리윙클 에어 다크' },
    { query: '&source=toolkit&theme=ocean', file: '07-toolkit-ocean-light.png', label: '툴킷 오션 블루' },
    { query: '&theme=blue&custom=1', file: '08-blue-custom-8tabs.png', label: '노르딕 블루 + 내 글꼴 8탭' },
  ];
  for (const snap of themeSnaps) {
    await page.goto(`${base}/?font-picker-preview${snap.query}`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="standalone-panel"] .fp-root').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(90);
    if (snap.query.includes('custom=1')) {
      const count = await page.locator('[data-testid="standalone-panel"] .fp-cat-pill').count();
      assert.equal(count, 8, '커스텀 글꼴 포함 시 8탭이어야 함');
    }
    await page.locator('[data-testid="standalone-panel"] .fp-root').screenshot({ path: path.join(output, snap.file) });
    pass(`테마 스냅샷: ${snap.label}`, snap.file);
  }

  // ── 3. 초소형 뷰포트(280×210, 200×180) 트리거 포탈 무잘림 검증 ────────────
  for (const vp of [
    { width: 280, height: 210, name: '최소 메모창 280x210' },
    { width: 200, height: 180, name: '초소형 Tiny Note 200x180' },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${base}/?font-picker-preview&theme=amber&trigger-only=1`, { waitUntil: 'networkidle' });
    await page.locator('.qa-trig-toolbar').click();
    const portal = page.locator('.fp-portal-float');
    await portal.waitFor({ state: 'visible' });
    const box = await portal.boundingBox();
    assert.ok(box, `${vp.name} 포탈 미표시`);
    assert.ok(box.x >= 0 && box.y >= 0, `${vp.name} 좌상단 이탈: ${JSON.stringify(box)}`);
    assert.ok(box.x + box.width <= vp.width + 1, `${vp.name} 우측 이탈: ${JSON.stringify(box)}`);
    assert.ok(box.y + box.height <= vp.height + 1, `${vp.name} 하단 이탈: ${JSON.stringify(box)}`);
    pass(`초소형 뷰포트 무잘림: ${vp.name}`, `${Math.round(box.width)}×${Math.round(box.height)} at (${Math.round(box.x)},${Math.round(box.y)})`);
    await page.keyboard.press('Escape');
    await portal.waitFor({ state: 'hidden' });
  }

  // ── 3-B. 마우스 오픈 직후 키보드 탐색(↓ → → Enter) + 재클릭 토글 검증 ──
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto(`${base}/?font-picker-preview&theme=amber&trigger-only=1`, { waitUntil: 'networkidle' });
  const toolbarTrig = page.locator('.qa-trig-toolbar');
  await toolbarTrig.click();
  const portalKb = page.locator('.fp-portal-float');
  await portalKb.waitFor({ state: 'visible' });
  // 마우스로 연 직후 ArrowDown을 누르면 목록으로 포커스가 진입해야 함
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(40);
  const focusedIsRow = await page.evaluate(() => document.activeElement?.getAttribute('data-fp-focusable') === 'row');
  assert.equal(focusedIsRow, true, '마우스 오픈 직후 ArrowDown으로 행 포커스 진입 실패');
  // Escape로 닫힘 확인
  await page.keyboard.press('Escape');
  await portalKb.waitFor({ state: 'hidden' });
  // 재오픈 후 트리거 재클릭 토글 닫힘 확인
  await toolbarTrig.click();
  await portalKb.waitFor({ state: 'visible' });
  await toolbarTrig.click();
  await portalKb.waitFor({ state: 'hidden' });
  pass('마우스 오픈 후 키보드 진입(ArrowDown/Esc) + 재클릭 토글', 'ok');

  // ── 4. 실제 SettingsModal (?header-preview&settings) 글자 탭 통합 검증 ────
  await page.setViewportSize({ width: 380, height: 600 });
  await page.goto(`${base}/?header-preview&settings&theme=periwinkle`, { waitUntil: 'networkidle' });
  await page.locator('#st-tab-text').waitFor({ state: 'visible' });
  await page.locator('#st-tab-text').click();
  await page.waitForTimeout(100);
  const memoTrig = page.locator('button[aria-label="메모 글꼴"]');
  await memoTrig.waitFor({ state: 'visible' });
  await memoTrig.click();
  await page.locator('.fp-portal-float .fp-root').waitFor({ state: 'visible' });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(output, '09-settings-memo-font-open.png') });
  await page.locator('.fp-portal-float .fp-cat-pill', { hasText: '고딕' }).click();
  await page.locator('.fp-portal-float .fp-row', { hasText: '프리젠테이션' }).locator('.fp-wchip', { hasText: 'SB' }).click();
  await page.waitForTimeout(80);
  assert.ok((await memoTrig.textContent()).includes('프리젠테이션 SB'), '설정창 메모 글꼴 반영 실패');
  // 화면 글꼴 트리거 열기 → Esc 시 팝업만 닫히고 SettingsModal은 유지되는지 검증
  const uiTrig = page.locator('button[aria-label="화면 글꼴"]');
  await uiTrig.click();
  await page.locator('.fp-portal-float .fp-root').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('.fp-portal-float').waitFor({ state: 'hidden' });
  assert.equal(await uiTrig.isVisible(), true, 'Esc 시 설정창까지 닫혀서는 안 됨');
  pass('SettingsModal 글자 탭 연동(열기→고딕→프리젠테이션 SB + Esc 격리)', 'ok');

  // ── 5. 실제 ContextMenu (?context-menu-preview=text) 인라인 H3 드로어 검증 ─
  await page.setViewportSize({ width: 420, height: 620 });
  await page.goto(`${base}/?context-menu-preview=text&drag`, { waitUntil: 'networkidle' });
  const ctxFontBtn = page.locator('button[aria-label="글꼴 선택"]');
  await ctxFontBtn.waitFor({ state: 'visible' });
  await ctxFontBtn.click();
  const inlinePanel = page.locator('.fmt-font-drawer .fp-root.is-inline');
  await inlinePanel.waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
  const inlineBox = await inlinePanel.boundingBox();
  assert.ok(inlineBox && inlineBox.height <= 220, `인라인 드로어 높이 초과: ${JSON.stringify(inlineBox)}`);
  const inlineOverflow = await inlinePanel.evaluate((el) => {
    const rows = Array.from(el.querySelectorAll('.fp-row'));
    return rows.filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => r.textContent.trim());
  });
  assert.deepEqual(inlineOverflow, [], `인라인 드로어 가로 잘림: ${inlineOverflow.join(', ')}`);
  await page.screenshot({ path: path.join(output, '10-context-menu-inline-drawer.png') });
  // 인라인 드로어 안에서 칩 선택 → 드로어 자동 닫힘 확인
  await inlinePanel.locator('.fp-cat-pill', { hasText: '손글씨' }).click();
  await inlinePanel.locator('.fp-row', { hasText: '교보 손글씨' }).locator('.fp-wchip', { hasText: '24' }).click();
  await inlinePanel.waitFor({ state: 'hidden' });
  pass('ContextMenu 인라인 H3 글꼴 드로어 통합 + 선택 닫힘', `${Math.round(inlineBox.width)}×${Math.round(inlineBox.height)}`);

  // 콘솔/런타임 에러 0건 확인
  assert.deepEqual(errors, [], `콘솔/페이지 에러 발생:\n${errors.join('\n')}`);
  pass('런타임 에러 0건', 'console.error / pageerror = 0');

  await browser.close();
  console.log(`\nALL ${results.length} PLAYWRIGHT QA CHECKS PASSED!`);
}

run().catch((err) => {
  console.error('QA FAILED:', err);
  process.exit(1);
});
