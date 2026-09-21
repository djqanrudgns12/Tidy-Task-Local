import { chromium } from "file:///C:/Users/rudgn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
const samples = [];
let toolkitBundleRequested = false;

try {
  for (let index = 0; index < 8; index++) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    page.on("request", (request) => {
      if (request.url().includes("ToolkitApp.svelte")) toolkitBundleRequested = true;
    });
    const started = performance.now();
    await page.goto("http://127.0.0.1:5194/?toolkit-preview=noticeboard", {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".noticeboard-app").waitFor();
    const shell = performance.now() - started;
    await page.getByRole("textbox", { name: "알림장 내용" }).waitFor();
    const editor = performance.now() - started;
    assert.equal(
      await page.getByText("알림장을 불러오고 있어요…", { exact: true }).count(),
      0,
    );
    samples.push({ shell: +shell.toFixed(1), editor: +editor.toFixed(1) });
    await page.close();
  }
  assert.equal(toolkitBundleRequested, false);
  samples.sort((left, right) => left.editor - right.editor);
  console.log(
    "Noticeboard startup PASS",
    JSON.stringify({
      samples,
      median: samples[Math.floor(samples.length / 2)],
      toolkitBundleSkipped: true,
    }),
  );
} finally {
  await browser.close();
}
