// Run against Vite with Playwright available via node_modules or NODE_PATH.
// Uses a development-only isolated fixture; no real Tauri store is read/written.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.HEADER_QA_URL || 'http://127.0.0.1:5176';
const output = path.resolve('output/qa/header');
fs.mkdirSync(output, { recursive: true });
const results = [];
const check = (name, detail) => results.push({ name, detail });

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const dark of [false, true]) {
      for (const width of [200, 250, 280, 320, 350, 480, 640]) {
        await page.setViewportSize({ width, height: 550 });
        await page.goto(`${base}/?header-preview${dark ? '&dark' : ''}&title=${encodeURIComponent('새 학기 우리 반 준비할 일')}`);
        await page.getByRole('button', { name: '새 노트', exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => {
          const roots = [...document.querySelectorAll('.titlebar,.note-heading,.note-tools,.format-tools')];
          return roots.map(root => ({
            name: root.className,
            overflow: root.scrollWidth - root.clientWidth,
            buttons: [...root.querySelectorAll('button')].filter(b => b.checkVisibility()).map(b => {
              const r = b.getBoundingClientRect();
              return { name: b.getAttribute('aria-label') || b.textContent || b.title, left: r.left, right: r.right, width: r.width, height: r.height, overflow: b.scrollWidth - b.clientWidth };
            }),
          }));
        });
        for (const root of layout) {
          assert.ok(root.overflow <= 1, `${width} ${root.name} overflow ${root.overflow}`);
          for (const button of root.buttons) {
            assert.ok(button.left >= 0 && button.right <= width, `${width} offscreen ${button.name}`);
            assert.ok(button.overflow <= 1, `${width} clipped label ${button.name}`);
          }
        }
        check(`layout-${width}-${dark ? 'dark' : 'light'}`, layout);
        if ([250, 350, 640].includes(width)) await page.screenshot({ path: path.join(output, `${dark ? 'dark' : 'light'}-${width}.png`) });
        await page.getByRole('button', { name: '메뉴', exact: true }).click();
        const menu = page.getByRole('dialog', { name: '메뉴', exact: true });
        const rect = await menu.boundingBox();
        assert.ok(rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0 && rect.y + rect.height <= 551);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('button', { name: '메뉴', exact: true }).evaluate(n => n === document.activeElement), true);
      }
    }
    check('menu-bounds-and-escape', '14 viewport/theme combinations');

    await page.setViewportSize({ width: 250, height: 300 });
    await page.goto(`${base}/?header-preview`);
    await page.getByRole('button', { name: '메뉴', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '메뉴', exact: true });
    assert.ok(await menu.evaluate(n => n.scrollHeight > n.clientHeight));
    await page.getByRole('button', { name: '모든 내용 초기화…', exact: true }).click();
    const reset = page.getByRole('dialog', { name: '모든 내용을 초기화할까요?' });
    await reset.waitFor();
    assert.equal(await page.getByRole('button', { name: '취소', exact: true }).evaluate(n => n === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await reset.isVisible(), false);
    assert.equal(await page.evaluate(() => window.__headerQA.appState.notes), '샘플 메모');
    check('short-window-reset-cancel', 'Scrollable menu, default cancel focus, Escape preserves content');

    await page.setViewportSize({ width: 350, height: 550 });
    const create = page.getByRole('button', { name: '새 노트', exact: true });
    await create.click();
    await page.getByRole('button', { name: /Tidy Task 노트 To do list/ }).click();
    await create.click();
    await page.getByRole('button', { name: /Tiny Note 스티커/ }).click();
    assert.deepEqual(await page.evaluate(() => window.__headerQA.calls.filter(x => x.command.startsWith('create-')).map(x => x.command)), ['create-note', 'create-tiny']);
    check('create-menu', 'Two separate existing creation callbacks');
    await create.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Tiny Note/);
    await page.keyboard.press('Escape');
    await create.click();
    await page.getByRole('textbox', { name: '노트 제목' }).click();
    assert.equal(await page.getByRole('dialog', { name: '새 노트', exact: true }).isVisible(), false);
    check('keyboard-and-outside-close', 'Arrow navigation and outside dismissal');

    await page.getByRole('button', { name: '메뉴', exact: true }).click();
    await page.getByRole('button', { name: '여러 항목 선택', exact: true }).click();
    await page.getByText('여러 항목 선택 중', { exact: true }).waitFor();
    await page.getByRole('button', { name: '완료', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__headerQA.appState.isEditMode), false);
    const reminder = page.getByRole('button', { name: '알림', exact: true });
    await reminder.click();
    assert.equal(await reminder.getAttribute('aria-pressed'), 'false');
    await reminder.click();
    assert.equal(await reminder.getAttribute('aria-pressed'), 'true');
    check('selection-and-reminder', 'Existing state/event route with visible status');

    const format = page.getByRole('button', { name: '서식', exact: true });
    await format.click();
    assert.equal(await page.locator('#main-format-tools').count(), 0);
    await page.reload();
    await create.waitFor();
    assert.equal(await format.getAttribute('aria-expanded'), 'false');
    await page.screenshot({ path: path.join(output, 'compact-350.png') });
    await format.click();
    const editor = page.getByRole('textbox', { name: '할 일 편집' });
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: '굵게', exact: true }).click();
    assert.ok(await editor.evaluate(n => !!n.querySelector('b,strong') || [...n.querySelectorAll('span')].some(e => Number(getComputedStyle(e).fontWeight) >= 600)));
    await page.getByRole('button', { name: '기울임', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.ok(await editor.evaluate(n => !!n.querySelector('i,em') || [...n.querySelectorAll('span')].some(e => getComputedStyle(e).fontStyle === 'italic')));
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.getByTitle('글자 색상', { exact: true }).click();
    const palette = page.getByRole('dialog', { name: '서식 옵션' });
    await palette.locator('.color-grid button').nth(5).click();
    assert.ok(await editor.evaluate(n => !!n.querySelector('span[style*="color"]')));
    const size = page.getByTitle('글자 크기 — 직접 입력하거나 ▾로 선택', { exact: true });
    await size.fill('18');
    await size.press('Enter');
    assert.ok(await editor.evaluate(n => !!n.querySelector('span[style*="18pt"]')));
    check('format-persistence-and-selection', 'Collapse persists; mouse bold, keyboard italic, palette color, 18pt retain editor selection');

    const sizeTrigger = page.getByRole('button', { name: '글자 크기 목록 열기', exact: true });
    await sizeTrigger.focus();
    await page.keyboard.press('Enter');
    const presets = page.locator('.fs-list');
    await presets.waitFor();
    assert.equal(await presets.locator('button').first().evaluate(n => n === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    const presetText = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.keyboard.press('Enter');
    assert.equal(await size.inputValue(), String(parseFloat(presetText)));
    await sizeTrigger.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await presets.count(), 0);
    assert.equal(await sizeTrigger.evaluate(n => n === document.activeElement), true);
    check('font-presets-keyboard', 'Enter opens, arrows navigate, Enter applies, Escape returns focus');

    await page.setViewportSize({ width: 250, height: 300 });
    await page.getByTitle('더보기', { exact: true }).click();
    await page.getByRole('button', { name: '기호', exact: true }).click();
    const symbols = page.getByRole('dialog', { name: '서식 옵션' });
    const symbolRect = await symbols.boundingBox();
    assert.ok(symbolRect.x >= 0 && symbolRect.x + symbolRect.width <= 251 && symbolRect.y + symbolRect.height <= 301);
    await page.keyboard.press('Escape');
    check('format-popup-bounds', 'Symbols stay inside a 250x300 viewport');
    for (const width of [200, 250, 280, 320, 350, 640]) {
      await page.setViewportSize({ width, height: 500 });
      await page.goto(`${base}/?header-preview&design=classic`);
      await page.locator('.classic-create').waitFor();
      assert.equal(await page.getByRole('button', { name: /상단 디자인:/ }).count(), 0);
      assert.equal(await page.locator('.classic-create button').first().getAttribute('aria-label'), '항상 위');
      assert.equal(await page.getByRole('button', { name: '모든 내용 초기화', exact: true }).count(), 1);
      assert.equal(await page.locator('.main-toolbar-row').count(), 1);
      assert.ok(await page.locator('.titlebar').evaluate(n => n.scrollWidth <= n.clientWidth + 1));
      await page.goto(`${base}/?header-preview`);
      assert.equal(await page.getByRole('button', { name: /상단 디자인:/ }).count(), 0);
      assert.equal(await page.locator('.brand-group button').getAttribute('aria-label'), '항상 위');
      await page.getByRole('button', { name: '새 노트', exact: true }).waitFor();
      await page.getByRole('button', { name: '새 노트', exact: true }).click();
      await page.getByText('To do list 창 추가하기', { exact: true }).waitFor();
      await page.getByText('스티커 메모 추가하기', { exact: true }).waitFor();
      await page.getByRole('button', { name: '새 노트 닫기', exact: true }).click();
      assert.equal(await page.getByRole('dialog', { name: '새 노트', exact: true }).isVisible(), false);
      await page.getByRole('button', { name: '메뉴', exact: true }).click();
      await page.getByRole('button', { name: '메뉴 닫기', exact: true }).click();

    }
    for (const design of ['classic', 'modern']) {
      await page.goto(`${base}/?header-preview&design=${design}`);
      await page.locator('.format-tools').waitFor();
      for (const width of [200, 220, 250, 275, 289, 295, 300, 320, 350, 480, 640]) {
        await page.setViewportSize({width, height:500});
        const row = await page.locator('.format-tools').evaluate(root => {
          const controls = [...root.querySelectorAll('.format-fields > select,.header-font-size,.format-buttons > button')];
          return {overflow:root.scrollWidth-root.clientWidth, centers:controls.map(n => {const r=n.getBoundingClientRect();return r.y+r.height/2;}), clipped:controls.some(n=>n.scrollWidth>n.clientWidth+1)};
        });
        assert.ok(row.overflow <= 1 && !row.clipped, `${design} ${width}: clipped format control`);
        assert.ok(Math.max(...row.centers)-Math.min(...row.centers)<1, `${design} ${width}: wrapped format row`);
      }
    }
    check('single-row-format', 'Both designs: 22 resize cases, 200–640 px, all fields/buttons aligned and unclipped');
    check('settings-only-design', '6 widths: no header switch; classic pin first, modern pin beside brand; tools and close buttons preserved');
    await page.setViewportSize({ width: 320, height: 500 });
    await page.goto(`${base}/?header-preview&design=classic&settings`);
    const classicOption = page.locator('input[name="header-design"][value="classic"]');
    const modernOption = page.locator('input[name="header-design"][value="modern"]');
    await classicOption.waitFor({state:'attached'});
    assert.equal(await classicOption.isChecked(), true);
    await page.getByText('모던', {exact:true}).click();
    await page.waitForFunction(() => window.__headerQA.appState.headerDesign === 'modern');
    assert.equal(await modernOption.isChecked(), true);
    await modernOption.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => window.__headerQA.appState.headerDesign === 'classic');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__headerQA.appState.headerDesign === 'modern');
    await page.screenshot({ path: path.join(output, 'settings-live.png') });
    await page.getByRole('button', { name: '취소', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__headerQA.appState.headerDesign), 'modern');
    check('settings-design-selection', 'Mouse and arrow keys apply immediately; Cancel preserves the explicitly immediate preference');
    for (const design of ['classic', 'modern']) {
      await page.goto(`${base}/?header-preview&design=${design}`);
      await page.locator('.titlebar').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:path.join(output, `settings-only-${design}.png`)});
    }
    assert.deepEqual(errors, []);
    check('runtime-errors', errors);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: 'passed', checks: results }, null, 2));
    console.log(`PASS: ${results.length} header UI checks`);
  } finally { await browser.close(); }
}
main().catch(error => { fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: 'failed', error: error.message, checks: results }, null, 2)); console.error(error); process.exitCode = 1; });
