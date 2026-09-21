import { chromium } from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 960, height: 680 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const base = process.env.TIDY_PREVIEW_URL || 'http://127.0.0.1:5190';
const out = 'public/images/update-5.5';
await fs.mkdir(out, { recursive: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
async function open(role, width = 960, height = 680) {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}/?toolkit-preview=${role}`);
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.fonts.ready);
}
async function capture(name, selector) {
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: `${out}/${name}.png` });
  console.log('Captured', name);
}
try {
  await open('toolkit', 1100, 220);
  await capture('toolbar', '.toolkit-bar');
  for (const kind of ['digital', 'analog', 'hourglass', 'stopwatch']) {
    await open(kind, 620, 560);
    await capture(kind);
  }
  await open('focus-bell', 760, 510);
  await capture('focus-bell');
  await open('toolkit-settings', 380, 700);
  await capture('settings');
  await open('picker', 960, 720);
  await page.getByRole('button', { name: '직접 입력', exact: false }).first().click();
  await page.getByRole('button', { name: '목록 입력', exact: false }).first().click();
  await page.getByLabel('뽑기 목록 입력').fill('김하늘\n이바다\n박여름\n최우주\n정다온\n강이든\n윤하루\n한별');
  await page.getByRole('button', { name: '목록 확인', exact: true }).click();
  await page.getByRole('button', { name: '이 목록으로 뽑기', exact: true }).click();
  await page.getByRole('tab', { name: '인형 뽑기', exact: true }).click();
  await page.waitForTimeout(500);
  await capture('picker');
  await capture('picker-stage', '.picker-stage');
  await open('roster', 960, 680);
  await page.evaluate(async () => {
    const { execute, readRoster } = await import('/src/lib/classroom/repository.js');
    let s = await readRoster();
    s = (await execute({ type: 'createClass', name: '우리 반 · 예시 명단' }, s.revision)).snapshot;
    await execute({ type: 'saveStudents', classId: s.classes[0].id, deleteIds: [], students: ['김하늘','이바다','박여름','최우주','정다온','강이든','윤하루','한별'].map((name, i) => ({ number: i + 1, name, gender: 'unspecified' })) }, s.revision);
  });
  await page.waitForTimeout(500);
  await capture('roster');
  await open('tournament', 1100, 760);
  await page.getByRole('button', { name: '8 강', exact: false }).click();
  await page.getByRole('button', { name: '대진표 만들기', exact: false }).click();
  await page.getByLabel('한 줄에 한 명').fill('김하늘\n이바다\n박여름\n최우주\n정다온\n강이든\n윤하루\n한별');
  await page.getByRole('button', { name: '명단 적용', exact: true }).click();
  await page.waitForTimeout(300);
  await capture('tournament');
  await open('noticeboard', 960, 680);
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill('오늘도 함께 자라는 우리 반\n\n1. 친구의 이야기를 끝까지 들어요.\n2. 모둠 활동 뒤 자리를 정리해요.\n3. 내일 준비물: 색연필, 풀, 가위');
  await page.waitForTimeout(500);
  await capture('noticeboard');
  await fs.writeFile(`${out}/captures.json`, JSON.stringify({ deviceScaleFactor: 2, source: 'Actual application components in isolated browser preview; fictional demonstration data.', errors }, null, 2));
  if (errors.length) throw Error(errors.join('\n'));
} finally { await browser.close(); }
