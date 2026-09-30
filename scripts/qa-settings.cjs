// 설정 창 검수 — 개발 전용 미리보기(?header-preview&settings)를 실제 브라우저로 조작합니다.
// Run against Vite with Playwright available via node_modules or NODE_PATH.
//   npm run dev -- --port 5173
//   NODE_PATH=<playwright가 있는 node_modules> node scripts/qa-settings.cjs
// 미리보기는 Tauri 호출을 흉내 내므로 실제 저장소·Windows 시작 프로그램·앱 데이터를 건드리지 않습니다.
// (데이터 초기화의 실제 삭제는 Rust 단위 테스트 `cargo test --lib factory_reset`가 확인합니다.)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.SETTINGS_QA_URL || 'http://localhost:5173';
// 새 검수는 별도 폴더에 남길 수 있게 해, 이전 화면·결과를 덮어쓰지 않습니다.
const output = path.resolve(process.env.SETTINGS_QA_OUTPUT || 'output/qa/settings');
fs.mkdirSync(output, { recursive: true });
const results = [];
const check = (name, detail = 'ok') => results.push({ name, detail });

const TABS = ['모양', '글자', '동작', '관리'];
const WIDTH = 360;
const HEIGHT = 560;

/** @param {import('playwright').Page} page @param {string} query */
async function open(page, query = '') {
  // networkidle: 파일을 막 고친 직후에는 Vite가 늦게 보내는 갱신(HMR)으로 화면이 한 번 다시 그려질 수 있어 잠잠해질 때까지 기다립니다.
  await page.goto(`${base}/?header-preview&settings${query}`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '모양' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  // 자동 실행 상태를 읽은 뒤에야 스위치가 열립니다.
  await page.waitForFunction(() => window.__headerQA.calls.some((c) => c.command === 'plugin:autostart|is_enabled'));
}

/** @param {import('playwright').Page} page @param {string} name */
async function selectTab(page, name) {
  await page.getByRole('tab', { name }).click();
  await page.getByRole('tab', { name, selected: true }).waitFor();
  // 탭이 바뀔 때의 짧은 등장 효과가 끝난 뒤 잽니다.
  await page.waitForTimeout(220);
}

// 가로로 넘치거나 화면 밖으로 나간 컨트롤이 없는지 확인합니다.
/** @param {import('playwright').Page} page @param {string} label */
async function assertLayout(page, label) {
  const viewport = page.viewportSize();
  const layout = await page.evaluate(() => {
    const body = /** @type {HTMLElement} */ (document.querySelector('.st-body'));
    const foot = /** @type {HTMLElement} */ (document.querySelector('.st-foot'));
    const tabs = [...document.querySelectorAll('.st-tab')].map((tab) => ({
      name: tab.textContent?.trim(), overflow: tab.scrollWidth - tab.clientWidth,
    }));
    const controls = [...document.querySelectorAll('.st-main button, .st-main select, .st-main input[type=range]')]
      .filter((el) => el.checkVisibility())
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20) || el.tagName, left: r.left, right: r.right };
      });
    const footRect = foot.getBoundingClientRect();
    return {
      overflowX: body.scrollWidth - body.clientWidth,
      overflowY: body.scrollHeight - body.clientHeight,
      footBottom: footRect.bottom,
      tabs,
      controls,
    };
  });
  assert.ok(layout.overflowX <= 1, `${label}: 본문이 가로로 넘칩니다 (${layout.overflowX}px)`);
  assert.ok(layout.footBottom <= viewport.height + 1, `${label}: 아래 버튼 줄이 창 밖으로 나갑니다`);
  for (const tab of layout.tabs) assert.ok(tab.overflow <= 1, `${label}: 탭 "${tab.name}" 글자가 잘립니다`);
  for (const control of layout.controls) {
    assert.ok(control.left >= -1 && control.right <= viewport.width + 1, `${label}: "${control.name}"이 창 밖으로 나갑니다`);
  }
  return layout;
}

// 전환 효과(탭 등장 · 스위치 이동 · 확인 창 등장)가 끝난 뒤의 화면을 남깁니다.
/** @param {import('playwright').Page} page @param {string} name */
async function shot(page, name) {
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(output, name) });
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // 일부러 실패시킨 경우(&autostart-fail, &wipe-busy)에 화면 코드가 남기는 기록은 오류로 세지 않습니다.
  const expectedLogs = [/^자동 실행 설정 실패/, /^설정 초기화 실패/, /^데이터 초기화 실패: BUSY/];
  page.on('console', (message) => {
    if (message.type() === 'error' && !expectedLogs.some((pattern) => pattern.test(message.text()))) errors.push(message.text());
  });

  try {
    // ── 1. 네 탭 × 밝은 화면·다크 모드: 기본 글자 크기에서는 스크롤 없이 들어갑니다 ──
    for (const [theme, dark] of [['amber', false], ['mauve', false], ['sea-glass', true]]) {
      await open(page, `&theme=${theme}${dark ? '&dark' : ''}`);
      for (const tab of TABS) {
        await selectTab(page, tab);
        await shot(page, `${theme}${dark ? '-dark' : ''}-${TABS.indexOf(tab) + 1}-${tab}.png`);
        const layout = await assertLayout(page, `${theme}${dark ? '-dark' : ''} ${tab}`);
        assert.ok(layout.overflowY <= 1, `${theme} ${tab}: 기본 크기에서 세로로 넘칩니다 (${layout.overflowY}px)`);
      }
    }
    check('tabs-fit-without-scroll', '3 themes × 4 tabs');

    // ── 2. 탭 키보드 이동 ──
    await open(page);
    await page.getByRole('tab', { name: '모양' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('tab', { name: '글자', selected: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'st-tab-text');
    await page.keyboard.press('End');
    await page.getByRole('tab', { name: '관리', selected: true }).waitFor();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('tab', { name: '모양', selected: true }).waitFor();
    check('tab-keyboard');

    // 테마 방울은 색을 바로 고르고 방향키로도 옮길 수 있습니다.
    await open(page);
    const swatches = page.getByRole('radiogroup', { name: '테마 색상' });
    assert.equal(await swatches.getByRole('radio').count(), 15);
    await swatches.getByRole('radio').nth(4).click();
    assert.equal(await swatches.getByRole('radio').nth(4).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await swatches.getByRole('radio').nth(5).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await swatches.getByRole('radio').first().getAttribute('aria-checked'), 'true');
    check('theme-swatches-keyboard');

    // ── 3. UI 글자 크기를 끝까지 키우고 줄여도 넘치지 않습니다 ──
    for (const size of [15, 6]) {
      await open(page);
      await selectTab(page, '글자');
      const slider = page.getByRole('slider', { name: '크기' }).nth(1);
      await slider.focus();
      await page.keyboard.press(size === 15 ? 'End' : 'Home');
      await page.waitForFunction((s) => getComputedStyle(document.querySelector('.st-root')).fontSize === `${(s * 4) / 3}px`, size);
      for (const tab of TABS) {
        await selectTab(page, tab);
        await assertLayout(page, `UI ${size}pt ${tab}`);
        await shot(page, `ui-${size}pt-${TABS.indexOf(tab) + 1}-${tab}.png`);
      }
    }
    check('ui-font-size-extremes', '6pt · 15pt × 4 tabs');

    // 낮은 화면에서는 본문을 스크롤하고 [취소 · 반영]은 항상 화면 안에 둡니다.
    await page.setViewportSize({ width: WIDTH, height: 400 });
    await open(page);
    for (const tab of TABS) {
      await selectTab(page, tab);
      await assertLayout(page, `낮은 화면 ${tab}`);
      await shot(page, `height-400-${TABS.indexOf(tab) + 1}-${tab}.png`);
    }
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    check('small-screen-footer-stays-visible');

    // ── 4. 반영 전 변경 표시와 [반영]이 보내는 값 ──
    await open(page, '&theme=amber');
    const pending = page.locator('.st-pending');
    assert.equal((await pending.textContent())?.trim(), '');
    await page.getByRole('switch', { name: '다크 모드' }).click();
    assert.match((await pending.textContent()) || '', /바꾼 설정 1개/);
    assert.equal(await page.locator('#st-tab-look .st-tab-dot').count(), 1);
    await page.getByRole('switch', { name: '다크 모드' }).click();
    assert.equal((await pending.textContent())?.trim(), '');
    assert.equal(await page.locator('.st-tab-dot').count(), 0);

    // 상단 디자인은 고르는 즉시 보내고 "반영 전 변경"으로 세지 않습니다.
    await page.getByRole('radio', { name: /클래식/ }).check({ force: true });
    await page.waitForFunction(() => window.__headerQA.events.some((e) => e.name === 'req-set-header-design'));
    assert.equal((await pending.textContent())?.trim(), '');

    await page.getByRole('switch', { name: '다크 모드' }).click();
    await selectTab(page, '동작');
    await page.getByRole('switch', { name: /전체 무음 모드/ }).click();
    assert.match((await pending.textContent()) || '', /바꾼 설정 2개/);
    await shot(page, 'pending-changes.png');
    await page.getByRole('button', { name: '반영' }).click();
    await page.waitForFunction(() => window.__headerQA.events.some((e) => e.name === 'req-apply-settings'));
    const applied = await page.evaluate(() => window.__headerQA.events.find((e) => e.name === 'req-apply-settings').payload);
    assert.deepEqual(applied, {
      targetWindow: 'main', fontSize: 10, uiFontSize: 10, headerDesign: 'classic', themeColor: 'amber',
      uiFontFamily: '메이플스토리 L', isDarkMode: true, globalFont: '메이플스토리 L',
      showArchived: true, showNotes: true, showReminders: true, globalMuteSound: true,
    });
    // 자동 실행은 건드리지 않았으므로 등록을 바꾸지 않습니다.
    assert.equal(await page.evaluate(() => window.__headerQA.calls.filter((c) => /autostart\|(enable|disable)/.test(c.command)).length), 0);
    check('pending-indicator-and-apply-payload');

    // ── 5. 컴퓨터를 켜면 자동 실행 ──
    await open(page);
    await selectTab(page, '동작');
    const launch = page.getByRole('switch', { name: /컴퓨터를 켜면 자동 실행/ });
    assert.equal(await launch.getAttribute('aria-checked'), 'true', '기본은 켜짐');
    await launch.click();
    assert.match((await pending.textContent()) || '', /바꾼 설정 1개/);
    assert.equal(await page.locator('#st-tab-behavior .st-tab-dot').count(), 1);
    // [반영] 전에는 등록을 바꾸지 않습니다.
    assert.equal(await page.evaluate(() => window.__headerQA.calls.some((c) => c.command === 'plugin:autostart|disable')), false);
    await page.getByRole('button', { name: '반영' }).click();
    await page.waitForFunction(() => window.__headerQA.events.some((e) => e.name === 'req-apply-settings'));
    assert.equal(await page.evaluate(() => window.__headerQA.calls.some((c) => c.command === 'plugin:autostart|disable')), true);
    const savedChoice = await page.evaluate(() => JSON.parse(localStorage.getItem('tidy-scores-preview-v1:thermometer')).sections.display.data.windowsStart);
    assert.equal(savedChoice, false, '끈 선택을 저장해야 다음 시작 때 다시 켜지지 않습니다');
    check('autostart-off-is-applied-and-remembered');

    // 꺼 둔 상태로 열면 꺼짐으로 보이고, 다시 켜면 등록 + 선택 저장
    await open(page, '&autostart-off');
    await selectTab(page, '동작');
    assert.equal(await launch.getAttribute('aria-checked'), 'false');
    await launch.click();
    await page.getByRole('button', { name: '반영' }).click();
    await page.waitForFunction(() => window.__headerQA.calls.some((c) => c.command === 'plugin:autostart|enable'));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('tidy-scores-preview-v1:thermometer')).sections.display.data.windowsStart === true);
    check('autostart-on-again');

    // 등록 변경이 실패하면 창을 닫지 않고 그 자리에서 알립니다(다른 설정도 보내지 않음).
    await open(page, '&autostart-fail');
    await page.getByRole('switch', { name: '다크 모드' }).click();
    await selectTab(page, '동작');
    await launch.click();
    await selectTab(page, '모양');
    await page.getByRole('button', { name: '반영' }).click();
    await page.getByRole('alert').filter({ hasText: '자동 실행 설정을 바꾸지 못했어요' }).waitFor();
    await page.getByRole('tab', { name: '동작', selected: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__headerQA.events.some((e) => e.name === 'req-apply-settings')), false);
    await shot(page, 'autostart-failed.png');
    check('autostart-failure-is-shown');

    // ── 6. 설정 초기화: 확인 한 번, 기본값을 보냄 ──
    await open(page, '&theme=mauve&autostart-off');
    await selectTab(page, '관리');
    const resetButton = page.getByRole('button', { name: '초기화', exact: true });
    await resetButton.click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('heading', { name: '설정을 처음 상태로 되돌릴까요?' }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '취소', '처음 초점은 취소');
    await shot(page, 'dialog-reset-settings.png');
    // Esc로 닫으면 아무것도 보내지 않고 누른 버튼으로 초점이 돌아옵니다.
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await resetButton.evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.evaluate(() => window.__headerQA.events.length), 0);
    await resetButton.click();
    await dialog.getByRole('button', { name: '설정 초기화' }).click();
    await page.waitForFunction(() => window.__headerQA.events.some((e) => e.name === 'req-apply-settings'));
    // 1) 설정을 연 메모 창에만 "되돌려라"를 보냅니다. (Tauri 흉내는 emitTo를 전달하지 않아 호출 기록으로 확인합니다)
    const resetCall = await page.evaluate(() => window.__headerQA.calls.find((c) => c.command === 'plugin:event|emit_to'));
    assert.equal(resetCall.args.event, 'req-reset-config');
    assert.equal(resetCall.args.target.label, 'main');
    // 2) 알림·무음은 기본값을 모든 창에 방송합니다.
    const defaults = await page.evaluate(() => window.__headerQA.events.find((e) => e.name === 'req-apply-settings').payload);
    assert.equal(defaults.themeColor, 'amber');
    assert.equal(defaults.showReminders, true);
    assert.equal(defaults.globalMuteSound, false);
    // 자동 실행도 처음 상태(켜짐)로
    await page.waitForFunction(() => window.__headerQA.calls.some((c) => c.command === 'plugin:autostart|enable'));
    assert.equal(await page.evaluate(() => window.__headerQA.calls.some((c) => c.command === 'factory_reset')), false);
    check('settings-reset');

    // 자동 실행을 기본값으로 바꿀 수 없으면 다른 설정을 먼저 초기화하거나 창을 닫지 않습니다.
    await open(page, '&theme=mauve&autostart-off&autostart-fail');
    await selectTab(page, '관리');
    await resetButton.click();
    await dialog.getByRole('button', { name: '설정 초기화' }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.__headerQA.events.some((e) => e.name === 'req-apply-settings')), false);
    assert.equal(await page.evaluate(() => window.__headerQA.calls.some((c) => c.command === 'plugin:event|emit_to')), false);
    await dialog.getByRole('button', { name: '취소' }).click();
    await dialog.waitFor({ state: 'detached' });
    check('settings-reset-failure-keeps-other-settings');

    // ── 7. 데이터 초기화: 경고 두 번 + 두 번째 버튼은 잠깐 잠김 ──
    await open(page, '&theme=mauve');
    await selectTab(page, '관리');
    const wipeButton = page.getByRole('button', { name: '모두 지우기', exact: true });
    await wipeButton.click();
    await dialog.getByRole('heading', { name: '모든 데이터를 지울까요?' }).waitFor();
    assert.match((await dialog.textContent()) || '', /1 \/ 2/);
    assert.match((await dialog.textContent()) || '', /학급 명단/);
    await shot(page, 'dialog-wipe-1.png');

    // [계속]을 빠르게 두 번 눌러도(같은 자리에 [모두 지우기]가 나타남) 지워지지 않습니다.
    const continueBox = await dialog.getByRole('button', { name: '계속' }).boundingBox();
    await page.mouse.click(continueBox.x + continueBox.width / 2, continueBox.y + continueBox.height / 2, { clickCount: 2, delay: 40 });
    await dialog.getByRole('heading', { name: '정말 모두 지울까요?' }).waitFor();
    assert.match((await dialog.textContent()) || '', /2 \/ 2/);
    const finalButton = dialog.getByRole('button', { name: /모두 지우기/ });
    assert.equal(await finalButton.isDisabled(), true, '두 번째 경고의 버튼은 처음에 잠겨 있어야 합니다');
    assert.match((await finalButton.textContent()) || '', /\(\d\)/);
    await page.mouse.click(continueBox.x + continueBox.width / 2, continueBox.y + continueBox.height / 2);
    assert.equal(await page.evaluate(() => window.__headerQA.calls.some((c) => c.command === 'factory_reset')), false);
    await shot(page, 'dialog-wipe-2-locked.png');

    // 취소하면 아무 일도 없습니다.
    await dialog.getByRole('button', { name: '취소' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__headerQA.calls.some((c) => c.command === 'factory_reset')), false);

    // 끝까지 진행: 잠금이 풀린 뒤에만 눌립니다.
    await wipeButton.click();
    await dialog.getByRole('button', { name: '계속' }).click();
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent?.includes('모두 지우기'));
      return button && !button.disabled;
    }, null, { timeout: 6000 });
    assert.equal((await finalButton.textContent())?.trim(), '모두 지우기');
    await shot(page, 'dialog-wipe-2-armed.png');
    await finalButton.click();
    await dialog.getByRole('heading', { name: '지우는 중이에요…' }).waitFor();
    assert.equal(await page.evaluate(() => window.__headerQA.calls.filter((c) => c.command === 'factory_reset').length), 1);
    // 지우는 중에는 Esc로 닫히지 않습니다.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await dialog.count(), 1);
    await shot(page, 'dialog-wiping.png');
    check('data-wipe-needs-two-confirmations');

    // 종료·업데이트 중이라 거절되면 이유를 알리고 닫을 수 있습니다.
    await open(page, '&wipe-busy');
    await selectTab(page, '관리');
    await wipeButton.click();
    await dialog.getByRole('button', { name: '계속' }).click();
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent?.includes('모두 지우기'));
      return button && !button.disabled;
    }, null, { timeout: 6000 });
    await finalButton.click();
    await dialog.getByRole('heading', { name: '초기화하지 못했어요' }).waitFor();
    assert.match((await dialog.textContent()) || '', /종료하거나 업데이트하는 중/);
    await shot(page, 'dialog-wipe-busy.png');
    await dialog.getByRole('button', { name: '닫기' }).click();
    await dialog.waitFor({ state: 'detached' });
    check('data-wipe-busy-is-explained');

    // ── 8. 글꼴 추가 ──
    await open(page);
    await selectTab(page, '글자');
    await page.locator('.st-file input').setInputFiles({ name: '우리반 손글씨.ttf', mimeType: 'font/ttf', buffer: Buffer.from([0, 1, 0, 0]) });
    await page.getByRole('status').filter({ hasText: '우리반손글씨' }).waitFor();
    const added = await page.evaluate(() => window.__headerQA.events.find((e) => e.name === 'req-add-custom-font').payload);
    assert.equal(added.name, '우리반손글씨');
    const fontCall = await page.evaluate(() => window.__headerQA.calls.find((c) => c.command === 'save_custom_font'));
    assert.ok(fontCall, '글꼴 파일을 저장 명령으로 보냅니다');
    await assertLayout(page, '글꼴 추가 뒤');
    await shot(page, 'font-added.png');
    check('font-upload');

    assert.deepEqual(errors, [], `콘솔 오류: ${errors.join(' | ')}`);
    check('no-console-errors');
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`설정 창 검수 통과: ${results.map((r) => r.name).join(', ')}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
