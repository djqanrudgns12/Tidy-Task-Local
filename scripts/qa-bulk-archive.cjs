// 다중 선택 [아카이브] 드롭다운 검수 — docs/PRD-bulk-archive-dropdown.md §13
// 개발 전용 미리보기(?bulk-archive-preview)를 실제 브라우저(Edge)로 열어 크기 예산·배치·단계·키보드를 확인합니다.
//   npm run dev -- --port 5173
//   NODE_PATH=<playwright가 있는 node_modules> node scripts/qa-bulk-archive.cjs
// 미리보기는 저장소·IPC를 쓰지 않으므로 실제 할 일·보관함을 건드리지 않습니다.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.ARCHIVE_QA_URL || 'http://localhost:5173';
const output = path.resolve(process.env.ARCHIVE_QA_OUTPUT || 'output/qa/bulk-archive');
fs.mkdirSync(output, { recursive: true });

const CAP = { l: 130, m: 99, s: 52 };
const WIDTH = { min: 176, max: 224 };
const RAIL_INSET = 10; // 도크 바깥 테두리 = 창 가장자리에서 10px
const results = [];
const check = (name, detail = 'ok') => results.push({ name, detail });

/** 열린 드롭다운·버튼·도크·꼭지의 좌표를 읽습니다. @param {import('playwright').Page} page */
async function readGeometry(page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-bulk-archive-menu]');
    const nub = document.querySelector('[data-archive-menu-nub]');
    const btn = document.querySelector('[data-bulk-archive-btn]');
    const dock = document.querySelector('[data-bulk-dock]');
    if (!card || !btn || !dock || !nub) return null;
    const c = card.getBoundingClientRect();
    const n = nub.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    const overflowing = [...card.querySelectorAll('.am-label, .am-caption, .am-pill, .am-head-text')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
    const measure = Object.fromEntries(['l', 'm', 's'].map((t) => [t, document.querySelector(`.am-measure .tier-${t}`)?.offsetHeight ?? 0]));
    return {
      tier: card.getAttribute('data-tier'),
      direction: card.getAttribute('data-direction'),
      card: { left: c.left, right: c.right, top: c.top, bottom: c.bottom, width: c.width, height: c.height },
      nub: { cx: n.left + n.width / 2, top: n.top, bottom: n.bottom },
      btn: { cx: b.left + b.width / 2, top: b.top, bottom: b.bottom },
      dock: { left: d.left, right: d.right, top: d.top, bottom: d.bottom },
      viewport: { w: innerWidth, h: innerHeight },
      overflowing,
      measure,
      focused: document.activeElement?.textContent?.trim() ?? '',
    };
  });
}

/** @param {import('playwright').Page} page @param {string} query */
async function openPreview(page, query) {
  await page.goto(`${base}/?bulk-archive-preview&open&${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-bulk-archive-menu][data-tier]:not([data-tier=""])', { timeout: 5000 });
  // 열림 애니메이션(140ms)이 끝난 뒤 잽니다.
  await page.waitForTimeout(220);
  return readGeometry(page);
}

/** @param {NonNullable<Awaited<ReturnType<typeof readGeometry>>>} g @param {string} label */
function assertPlacement(g, label) {
  const { card, nub, btn, dock, viewport } = g;
  assert.ok(card.width >= WIDTH.min - 0.5 && card.width <= WIDTH.max + 0.5, `${label}: 폭 ${card.width}`);
  assert.ok(card.height <= CAP[g.tier] + 2, `${label}: ${g.tier} 높이 ${card.height} > ${CAP[g.tier]}`);
  assert.ok(card.left >= Math.min(dock.left, RAIL_INSET) - 0.5 && card.right <= Math.max(dock.right, viewport.w - RAIL_INSET) + 0.5, `${label}: 도크 선 밖 ${card.left}~${card.right}`);
  assert.ok(card.left >= 0 && card.right <= viewport.w && card.top >= 0 && card.bottom <= viewport.h, `${label}: 화면 밖`);
  assert.deepEqual(g.overflowing, [], `${label}: 글자 넘침 ${g.overflowing}`);
  // 꼭지는 버튼 가운데를 가리킵니다(둥근 모서리 묶음 때문에 버튼이 카드 끝 밖이면 예외).
  const nubFree = btn.cx >= card.left + 20 && btn.cx <= card.right - 20;
  if (nubFree) assert.ok(Math.abs(nub.cx - btn.cx) <= 1, `${label}: 꼭지 ${nub.cx} ≠ 버튼 가운데 ${btn.cx}`);
  if (g.direction === 'down') {
    const tip = Math.max(btn.bottom + 3, dock.bottom + 2);
    assert.ok(Math.abs(nub.top - tip) <= 1.5, `${label}: 꼭지 끝 ${nub.top} ≠ ${tip}`);
  } else {
    const tip = Math.min(btn.top - 3, dock.top - 2);
    assert.ok(Math.abs(nub.bottom - tip) <= 1.5, `${label}: 위로 연 꼭지 끝 ${nub.bottom} ≠ ${tip}`);
  }
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 560 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    // ── 1. 테마 × 다크 × 화면 글자 × 창 폭: 크기 예산과 배치 ──
    let cases = 0;
    for (const theme of ['amber', 'periwinkle', 'mauve', 'sea-glass']) {
      for (const dark of [false, true]) {
        for (const pt of [6, 10, 12, 15]) {
          for (const w of [250, 300, 380, 460]) {
            await page.setViewportSize({ width: w, height: 560 });
            const g = await openPreview(page, `theme=${theme}${dark ? '&dark' : ''}&pt=${pt}`);
            assert.ok(g, `${theme} ${pt}pt ${w}px: 드롭다운이 열리지 않음`);
            const label = `${theme}${dark ? '-dark' : ''} ${pt}pt ${w}px`;
            assert.equal(g.tier, 'l', `${label}: 넉넉한 창에서는 L`);
            assertPlacement(g, label);
            if (w === 380 || w === 250) {
              await page.screenshot({ path: path.join(output, `menu-${theme}${dark ? '-dark' : ''}-${pt}pt-${w}.png`), clip: { x: 0, y: 120, width: w, height: 260 } });
            }
            cases++;
          }
        }
      }
    }
    check('size-budget-and-placement', `${cases}조합`);

    // ── 2. 남은 높이에 따라 L → M → S → 위로 ──
    for (const pt of [10, 15]) {
      await page.setViewportSize({ width: 380, height: 700 });
      const tall = await openPreview(page, `pt=${pt}`);
      const tipBottom = tall.nub.bottom; // 꼭지 아래 끝 = 카드 위 끝
      const room = (/** @type {number} */ below) => Math.round(tipBottom + 8 + below);
      const zones = [
        { want: 'l', dir: 'down', h: room(tall.measure.l + 4) },
        { want: 'm', dir: 'down', h: room((tall.measure.l + tall.measure.m) / 2) },
        { want: 's', dir: 'down', h: room((tall.measure.m + tall.measure.s) / 2) },
      ];
      for (const z of zones) {
        await page.setViewportSize({ width: 380, height: z.h });
        const g = await openPreview(page, `pt=${pt}`);
        assert.equal(`${g.tier}/${g.direction}`, `${z.want}/${z.dir}`, `${pt}pt 창 높이 ${z.h}: ${g.tier}/${g.direction}`);
        assertPlacement(g, `${pt}pt ${z.want}`);
        await page.screenshot({ path: path.join(output, `tier-${z.want}-${pt}pt.png`), clip: { x: 0, y: Math.max(0, g.card.top - 60), width: 380, height: Math.min(z.h - Math.max(0, g.card.top - 60), 220) } });
      }
      // 아래에 S도 안 들어가면 위로(머리 영역 150px 위 공간)
      await page.setViewportSize({ width: 380, height: room(tall.measure.s - 12) });
      const up = await openPreview(page, `pt=${pt}`);
      assert.equal(up.direction, 'up', `${pt}pt: 아래가 모자라면 위로`);
      assertPlacement(up, `${pt}pt up`);
      await page.screenshot({ path: path.join(output, `tier-up-${pt}pt.png`) });
    }
    check('tier-fallback-l-m-s-up');

    // ── 3. 키보드: 열자마자 복사해서 보관, → 이동, Enter 고르기 / Esc 초점 복귀 ──
    await page.setViewportSize({ width: 380, height: 560 });
    const k = await openPreview(page, 'pt=10');
    assert.equal(k.focused.startsWith('복사해서 보관'), true, `첫 초점: ${k.focused}`);
    await page.keyboard.press('ArrowRight');
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /옮겨서 보관/);
    await page.keyboard.press('Tab');
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /복사해서 보관/, 'Tab은 메뉴 안에서 돈다');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    assert.match(await page.locator('[data-preview-log]').textContent(), /옮겼어요/);
    assert.equal(await page.locator('[data-bulk-archive-menu]').count(), 0, '고르면 닫힘');
    await page.locator('[data-bulk-archive-btn]').click();
    await page.waitForSelector('[data-bulk-archive-menu][data-tier]:not([data-tier=""])');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-bulk-archive-menu]').count(), 0, 'Esc로 닫힘');
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-bulk-archive-btn')), true, 'Esc 뒤 초점은 [아카이브]');
    check('keyboard-flow');

    // ── 4. 바깥 누름·버튼 다시 누름으로 닫힘, 열린 직후 연타 무시 ──
    await page.locator('[data-bulk-archive-btn]').click();
    await page.waitForSelector('[data-bulk-archive-menu][data-tier]:not([data-tier=""])');
    await page.mouse.click(5, 540);
    assert.equal(await page.locator('[data-bulk-archive-menu]').count(), 0, '바깥 누름으로 닫힘');
    await page.locator('[data-bulk-archive-btn]').click();
    await page.waitForSelector('[data-bulk-archive-menu][data-tier]:not([data-tier=""])');
    await page.locator('[data-bulk-archive-btn]').click();
    assert.equal(await page.locator('[data-bulk-archive-menu]').count(), 0, '버튼 다시 누름으로 닫힘');
    check('close-outside-and-toggle');

    // ── 5. 100개 이상은 99+ ──
    const many = await openPreview(page, 'pt=10&n=120');
    assert.ok(many);
    assert.equal(await page.locator('[data-bulk-archive-menu] .am-head .count').textContent(), '99+');
    await page.screenshot({ path: path.join(output, 'count-99plus.png'), clip: { x: 0, y: 120, width: 380, height: 260 } });
    check('count-bubble-99plus');

    assert.deepEqual(errors, [], '콘솔 오류');
    check('no-console-errors');
    console.log(`아카이브 드롭다운 검수 통과: ${results.map((r) => `${r.name}${r.detail !== 'ok' ? `(${r.detail})` : ''}`).join(', ')}`);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
