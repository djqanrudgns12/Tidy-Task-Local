const { chromium } = await import(
  'file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
);
const assert = (await import('node:assert/strict')).default;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 360 } });
const settings = (orientation, collapsed) => ({
  schemaVersion: 1,
  revision: 1,
  toolkit: {
    enabled: true,
    orientation,
    collapsed,
    visibleToolIds: ['timer'],
    position: null,
  },
  preferences: {},
});

async function capture(name, orientation, collapsed) {
  await page.goto('http://127.0.0.1:5173/?toolkit-preview=toolkit');
  await page.evaluate(
    (value) => localStorage.setItem('tidy-toolkit-preview-v1', JSON.stringify(value)),
    settings(orientation, collapsed),
  );
  await page.reload();
  const bar = page.locator('.toolkit-bar');
  await bar.waitFor();
  const box = await bar.boundingBox();
  assert(box && box.width <= 400 && box.height <= 330);
  await page.screenshot({
    path: `output/qa/toolkit/toolbar-${name}.png`,
    clip: { x: 0, y: 0, width: Math.ceil(box.width + 16), height: Math.ceil(box.height + 16) },
  });
  return { name, width: Math.round(box.width), height: Math.round(box.height) };
}

console.log(await capture('horizontal', 'horizontal', false));
console.log(await capture('collapsed', 'horizontal', true));
console.log(await capture('vertical', 'vertical', false));
await browser.close();
