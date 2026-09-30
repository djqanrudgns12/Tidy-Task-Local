// 실제 컴포넌트를 쓰는 개발 전용 화면으로 검사합니다. 사용자 저장소는 읽거나 쓰지 않습니다.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.MEMO_QA_URL || 'http://127.0.0.1:5176';
const output = path.resolve('output/qa/ui-font-20260930');
fs.mkdirSync(output, { recursive: true });

async function inspect(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.frame').getBoundingClientRect();
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { x: r.x - frame.x, y: r.y - frame.y, right: r.right - frame.x, bottom: r.bottom - frame.y, w: r.width, h: r.height };
    };
    const headings = [...document.querySelectorAll('.memo-section-heading')].map(el => {
      const title = el.querySelector('.section-title');
      const range = document.createRange();
      range.selectNodeContents(title);
      const ink = range.getBoundingClientRect();
      const actions = el.querySelector('.archive-heading-actions');
      return { ...rect(el), title: rect(title), ink: { right: ink.right - frame.x, h: ink.height }, font: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight), actions: actions ? rect(actions) : null, overflow: el.scrollWidth - el.clientWidth };
    });
    const controls = [...document.querySelectorAll('.titlebar, .main-toolbar-row, .note-heading, .note-tools, .format-tools')].map(el => ({
      name: el.className, ...rect(el), overflow: el.scrollWidth - el.clientWidth,
      buttons: [...el.querySelectorAll('button')].filter(b => b.checkVisibility()).map(b => ({ ...rect(b), label: b.title || b.getAttribute('aria-label') || b.textContent, overflow: b.scrollWidth - b.clientWidth })),
    }));
    const todoRows = [...document.querySelectorAll('.todo-row')].map(rect);
    const toolbarTitle = document.querySelector('.main-toolbar-row input');
    const toolbarLeft = document.querySelector('.main-toolbar-left');
    const toolbarRight = document.querySelector('.meal-toolbar-actions');
    return { headings, controls, todoRows, toolbarTitle: toolbarTitle ? rect(toolbarTitle) : null, toolbarLeft: toolbarLeft ? rect(toolbarLeft) : null, toolbarRight: toolbarRight ? rect(toolbarRight) : null, layout: window.__memoPreview.measure(), width: frame.width, height: frame.height, notes: window.__memoPreview.appState.notes, todos: window.__memoPreview.appState.todos.map(t => t.text) };
  });
}

function check(result, name) {
  assert.equal(result.headings.length, 2, `${name}: 제목 두 개 유지`);
  const [archive, notes] = result.headings;
  assert.ok(Math.abs(archive.title.x - notes.title.x) < .5, `${name}: 제목 시작점 ${archive.title.x}/${notes.title.x}`);
  assert.ok(Math.abs(archive.font - notes.font) < .1, `${name}: 제목 글자 크기 통일`);
  for (const h of result.headings) {
    assert.ok(h.overflow <= 1, `${name}: 제목 가로 넘침 ${h.overflow}`);
    assert.ok(h.ink.h <= h.line + 1, `${name}: 제목 줄바꿈`);
    assert.ok(h.ink.right <= (h.actions?.x ?? result.width - 12) + 1, `${name}: 제목·버튼 겹침`);
    assert.ok(h.bottom <= result.height, `${name}: 제목 세로 잘림`);
  }
  for (const c of result.controls) {
    assert.ok(c.overflow <= 1, `${name}: ${c.name} 가로 넘침 ${c.overflow}`);
    for (const b of c.buttons) {
      assert.ok(b.x >= 0 && b.right <= result.width, `${name}: 버튼 창 밖 ${b.label}`);
      assert.ok(b.overflow <= 1, `${name}: 버튼 글자 잘림 ${b.label}`);
    }
    const ys = c.buttons.map(b => b.y + b.h / 2);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 2, `${name}: 상단 도구 줄바꿈 ${c.name}`);
  }
  if (result.toolbarTitle) {
    assert.ok(result.toolbarLeft.right <= result.toolbarTitle.x + 1, `${name}: 제목·왼쪽 도구 겹침`);
    assert.ok(result.toolbarTitle.right <= result.toolbarRight.x + 1, `${name}: 제목·오른쪽 도구 겹침`);
  }
  assert.ok(Math.abs(result.layout.body - result.layout.todos - result.layout.archive - result.layout.notes - 6) <= 1, `${name}: 영역 높이 합계`);
  assert.equal(result.notes, '<div>dfasasdfsdf</div>', `${name}: 메모 보존`);
  assert.equal(result.todos.length, 4, `${name}: 할 일 보존`);
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const results = [];
  try {
    for (const design of ['classic', 'modern']) {
      for (const font of ['메이플스토리 L', '굴림', '엘리스 디지털배움']) {
        for (const dark of [false, true]) {
          await page.goto(`${base}/?memo-layout-preview&full-ui&standalone&design=${design}&font=${encodeURIComponent(font)}${dark ? '&dark' : ''}`);
          await page.waitForFunction(() => window.__memoPreview);
          await page.evaluate(() => document.fonts.ready);
          for (const width of [200, 240, 280, 318, 480]) {
            await page.setViewportSize({ width, height: 900 });
            let initialRows;
            for (const uiSize of [6, 10, 12, 15]) {
              await page.evaluate(v => window.__memoPreview.configure(v), { width, height: 547, uiSize });
              const name = `${design}/${font}/${dark ? 'dark' : 'light'}/${width}px/${uiSize}pt`;
              const result = await inspect(page);
              check(result, name);
              const rows = result.todoRows.map(r => [r.w, r.h]);
              if (!initialRows) initialRows = rows;
              assert.deepEqual(rows, initialRows, `${name}: UI 확대가 할 일의 줄바꿈을 바꾸지 않음`);
              results.push({ name, ...result });
              if (font === '메이플스토리 L' && [200, 318, 480].includes(width) && [10, 15].includes(uiSize)) {
                await page.locator('.frame').screenshot({ path: path.join(output, `${design}-${dark ? 'dark' : 'light'}-${width}-${uiSize}pt.png`) });
              }
            }
          }
        }
      }
    }
    // 마감된 일이 있을 때 삭제·접기 버튼을 함께 표시해 가장 좁은 배치를 검사합니다.
    await page.setViewportSize({ width: 200, height: 900 });
    await page.goto(`${base}/?memo-layout-preview&full-ui&standalone&width=200&ui-size=15`);
    await page.waitForFunction(() => window.__memoPreview);
    await page.evaluate(() => { window.__memoPreview.addArchived(120); window.__memoPreview.controller.requestRecomputeNextFrame(); });
    await page.evaluate(() => window.__memoPreview.configure({ width: 200, height: 700 }));
    check(await inspect(page), '마감된 일 120개/200px/15pt');
    await page.locator('.archived-root > button').click();
    await page.waitForFunction(() => !document.querySelector('.archived-scroll'));
    check(await inspect(page), '마감된 일 접기/200px/15pt');
    // 확대·축소를 반복해도 메모 선호 높이와 제목 정렬이 유지됩니다.
    await page.setViewportSize({ width: 318, height: 900 });
    await page.evaluate(() => window.__memoPreview.configure({ width: 318, height: 547, uiSize: 15, textSize: 18 }));
    check(await inspect(page), '메모 글자 18pt/UI 15pt');
    await page.evaluate(() => window.__memoPreview.configure({ uiSize: 10, textSize: 10 }));
    assert.equal(await page.evaluate(() => window.__memoPreview.appState.notesPaneHeight), 230);
    // 기존 위·아래 테두리와 스플리터 규칙도 실제 DOM에서 확인합니다.
    for (const eventFirst of [false, true]) {
      for (const scenario of ['bottom-roundtrip', 'top', 'splitter']) {
        await page.setViewportSize({ width: 1000, height: 1000 });
        await page.goto(`${base}/?memo-layout-preview&ui-size=15`);
        await page.waitForFunction(() => window.__memoPreview);
        await page.evaluate(v => window.__memoPreview.setEventFirst(v), eventFirst);
        const log = await page.evaluate(v => window.__memoPreview.scenario(v), scenario);
        if (scenario === 'bottom-roundtrip') assert.deepEqual([log[0].todos, log[0].archive, log[0].notes], [log.at(-1).todos, log.at(-1).archive, log.at(-1).notes]);
        if (scenario === 'top' || scenario === 'splitter') assert.equal(log[0].notesPref, log.at(-1).notesPref);
        results.push({ name: `${scenario}/eventFirst=${eventFirst}`, log });
      }
    }
    assert.deepEqual(errors, [], '화면 실행 오류 없음');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`PASS: ${results.length} font/layout cases, archived controls, content preservation, resize scenarios`);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
