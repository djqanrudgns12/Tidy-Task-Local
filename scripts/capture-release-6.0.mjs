// 6.0.0 새 소식에 넣을 "실제 앱 화면"을 개발 미리보기에서 찍어 public/images/update-6.0/에 webp로 저장합니다.
// 왜 직접 찍는가: 공지 사진이 실제 화면과 다르면 선생님이 기능을 찾지 못합니다. 학생 이름·일정은 모두 예시입니다.
// 실행: (개발 서버가 떠 있는 상태에서) node scripts/capture-release-6.0.mjs
//   TIDY_PREVIEW_URL로 주소를, TIDY_RUNTIME_MODULES로 playwright·sharp 위치를 바꿀 수 있습니다(5.6 캡처 스크립트와 같은 방식).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const runtime = process.env.TIDY_RUNTIME_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const require = createRequire(path.join(runtime, 'package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');
const base = process.env.TIDY_PREVIEW_URL || 'http://localhost:5173';
const out = 'public/images/update-6.0';
await fs.mkdir(out, { recursive: true });
const only = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await context.newPage();
const errors = [], captures = [];
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(20000);

async function open(query, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}/?${query}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}
/** @param {string} name @param {string|null} selector @param {number} [pad] */
async function snap(name, selector, pad = 0) {
  await page.evaluate(() => document.fonts.ready);
  let bytes;
  if (!selector) bytes = await page.screenshot({ animations: 'disabled' });
  else {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`${name}: ${selector} 없음`);
    bytes = await page.screenshot({ animations: 'disabled', clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } });
  }
  const file = `${out}/${name}.webp`;
  await sharp(bytes).webp({ quality: 92, effort: 6 }).toFile(file);
  const { width, height, size } = await sharp(file).metadata().then(async m => ({ ...m, size: (await fs.stat(file)).size }));
  captures.push({ name, width, height, kb: Math.round(size / 1024) });
  console.log('✓', name, `${width}×${height}`, `${Math.round(size / 1024)}KB`);
}
const want = (/** @type {string} */ name) => !only.length || only.includes(name);

const students = ['김하늘','이서준','박지유','최도윤','정하린','강시우','윤서아','장민준','임채원','한예준','오지안','서윤호','신아린','권도하','황수아','안지호','송다인','류건우','전하윤','홍태오','고은채','문시윤','배로운','조유나'];

try {
  // ① D-Day 컨트롤 (할 일 연동 · 상단 배너 · 위젯 한곳 관리)
  if (want('dday-control')) {
    await open('dday-control-preview&w=420&h=640', 560, 760);
    await snap('dday-control', '.ctrl-shell');
  }
  // ② 바탕화면 D-Day 위젯 두 가지 모양
  if (want('dday-widget')) {
    await open('toolkit-preview=dday&skin=w4&theme=periwinkle', 520, 420);
    await snap('dday-widget-w4', '.dw-shell', 6);
    await open('toolkit-preview=dday&skin=w1&theme=mint', 520, 420);
    await snap('dday-widget-w1', '.dw-shell', 6);
  }
  // ③ 할 일 지우기 → 되돌리기 알림 (메모 창 실제 몸통)
  if (want('todo-undo')) {
    await open('memo-layout-preview&full-ui&sort-qa&theme=mint&height=400&width=340', 760, 560);
    await page.evaluate(async () => {
      // Vite가 고친 파일에 ?t=를 붙이므로, 화면이 실제로 불러온 주소로 같은 모듈을 엽니다(다른 주소면 다른 상태가 생김).
      const url = performance.getEntriesByType('resource').map(r => r.name).find(n => n.includes('/src/lib/appState.svelte.js'));
      const { appState } = await import(/* @vite-ignore */ url || '/src/lib/appState.svelte.js');
      appState.todos = [
        { id: 'a', text: '학부모 상담 주간 안내장 배부', completed: false, deadline: '2026-11-24' },
        { id: 'b', text: '현장체험학습 동의서 걷기', completed: false, deadline: '2026-11-25' },
        { id: 'c', text: '수학 익힘책 단원평가 채점', completed: false, deadline: '2026-11-27' },
        { id: 'd', text: '학예발표회 음원 점검', completed: false, deadline: '2026-11-28' },
        { id: 'e', text: '교실 화분 물 주기', completed: false, deadline: '' },
      ];
      appState.notes = '<div>2교시 강당 사용 · 체육복 지참</div>';
      // 사진의 주인공은 할 일 목록이므로 메모 · 마감된 일 칸은 접어 둡니다.
      appState.showNotes = false;
      appState.showArchived = false;
    });
    await page.waitForTimeout(700);
    const row = page.locator('.todo-row[data-todo-id="e"]');
    await row.hover();
    await page.waitForTimeout(400);
    await row.locator('.eraser-btn').click({ force: true });
    await page.waitForTimeout(900);
    await page.mouse.move(700, 600);
    await snap('todo-undo', '.frame');
  }
  // ④ 우클릭 포켓 메뉴 (할 일 · D-Day 배너)
  if (want('context-menu')) {
    await open('context-menu-preview=todo', 520, 360);
    await snap('ctx-todo', '.ctx-pocket', 2);
    await open('context-menu-preview=dday-banner', 520, 360);
    await snap('ctx-dday', '.ctx-pocket', 2);
  }
  // ⑤ 새 글꼴 고르기 창 (글꼴 작업이 끝나면 다시 찍습니다)
  if (want('font-picker')) {
    await open('font-picker-preview', 1000, 640);
    await snap('font-picker', '[data-testid="standalone-panel"]', 2);
  }
  // ⑥ 모둠원 뽑기 세 무대 (예시 명단 24명)
  if (want('group-picker')) {
    await open('toolkit-preview=picker-group', 1280, 820);
    await page.locator('.gp-app textarea').fill(students.join('\n'));
    await page.getByRole('button', { name: '목록 적용' }).click();
    await page.waitForTimeout(900);
    // 첫 장은 왼쪽 설정 · 오른쪽 현황판까지 보이게 창 전체, 나머지 두 무대는 무대만 크게 잘라 강조합니다.
    for (const [stage, file, selector] of [['모둠 열차', 'group-train', null], ['빙하 갈라지기', 'group-glacier', '.gp-stage-shell'], ['엘리베이터', 'group-elevator', '.gp-stage-shell']]) {
      await page.getByRole('tab', { name: stage }).click();
      await page.waitForTimeout(1500);
      await snap(file, selector);
    }
  }
  // ⑦ 타이머 (글자 크기 자동 · 공통 설정)
  if (want('timer')) {
    await open('toolkit-preview=digital', 900, 600);
    await snap('timer', null);
  }
} finally {
  await browser.close();
}
if (errors.length) console.log('페이지 오류:', errors.slice(0, 5));
await fs.writeFile(`${out}/captures.json`, JSON.stringify({ capturedAt: new Date().toISOString(), base, captures }, null, 2));
