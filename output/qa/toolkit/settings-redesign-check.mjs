import { chromium } from 'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 680 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto('http://127.0.0.1:5174/?toolkit-preview=digital');
await page.getByRole('complementary', { name: '타이머 설정' }).waitFor();

const desktop = await page.locator('.timer-settings-panel').evaluate((panel) => {
  const presets = panel.querySelector('.time-presets');
  const rect = panel.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    scrollHeight: panel.scrollHeight,
    clientHeight: panel.clientHeight,
    presetColumns: getComputedStyle(presets).gridTemplateColumns.split(' ').length,
  };
});
assert.ok(desktop.width >= 320, `desktop settings width was ${desktop.width}`);
assert.ok(desktop.presetColumns >= 3);
await page.getByRole('button', { name: '10분', exact: true }).click();
await assert.doesNotReject(() => page.getByLabel('준비, 10분').waitFor());
await page.screenshot({ path: 'output/qa/toolkit/settings-redesign-960.png' });

for (const [width, height] of [
  [820, 680],
  [640, 680],
  [380, 720],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(100);
  const state = await page.locator('.timer-settings-panel').evaluate((panel) => {
    const main = document.querySelector('.timer-main').getBoundingClientRect();
    const settings = panel.getBoundingClientRect();
    return {
      mainWidth: Math.round(main.width),
      settingsWidth: Math.round(settings.width),
      stacked: settings.top >= main.bottom - 1,
      bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert.equal(state.bodyOverflow, false, `${width}px view overflowed horizontally`);
  if (width <= 760) assert.equal(state.stacked, true, `${width}px view did not stack settings`);
  else assert.ok(state.settingsWidth >= 292, `${width}px settings width was ${state.settingsWidth}`);
  await page.screenshot({
    path: `output/qa/toolkit/settings-redesign-${width}.png`,
    fullPage: true,
  });
}

assert.deepEqual(pageErrors, []);
console.log(JSON.stringify({ desktop, result: 'PASS' }));
await browser.close();
