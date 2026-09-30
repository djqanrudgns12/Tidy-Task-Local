// 미니 온도계 크기 검수. 독립 브라우저의 예시 자료만 쓰며 실제 앱 저장소는 건드리지 않습니다.
// NODE_PATH=<Playwright node_modules> node scripts/qa-mini-thermometer.cjs
// MINI_THERMOMETER_QA_URL로 개발 서버 주소를 지정할 수 있습니다.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.MINI_THERMOMETER_QA_URL || 'http://localhost:5173';
const output = path.resolve('output/qa/mini-thermometer-resize');
fs.mkdirSync(output, { recursive: true });
const report = { cases: 0, failures: [], errors: [], checks: [], screenshots: [] };
const widths = [280, 320, 371, 372, 389, 390, 391, 400, 520, 625, 880, 1200, 1920, 4000];
const heights = [220, 240, 287, 288, 289, 300, 351, 352, 353, 380, 388, 389, 390, 468, 469, 470, 480, 560, 800, 3000];
const sizes = widths.flatMap(width => heights.map(height => ({ width, height })));
const fixtures = ['screenshot', 'stages', 'extremes', 'completed'];
const fonts = ['메이플스토리 L', 'Malgun Gothic'];

async function seed(page, fixture, count, font) {
    const { makeThermometer } = await import('../src/lib/thermometer/model.js');
    const { dateKey } = await import('../src/lib/thermometer/calendar.js');
    const { defaults } = await import('../src/lib/toolkit/preferences.js');
    const thermometers = ['positive', 'negative'].slice(0, count).map((mood, i) => {
      const t = { ...makeThermometer(mood), id: `qa-${i}`, title: i ? '카오스 지수' : '코스모스 지수', max: 5, value: i ? 3 : 4, topText: i ? '절망' : '희망' };
      if (fixture !== 'screenshot') {
        Object.assign(t, { title: '우리반함께만드는아주긴이름', max: 1000, topText: '모두가함께하는아주긴최종목표', upStep: 1000, downStep: 999, linkSteps: false });
        t.daily[dateKey()] = { up: 1000000, down: 1000000, auto: 1000000 };
        if (fixture === 'stages') {
          t.value = i ? 333 : 4;
          t.unit = i ? 'none' : 'point';
          t.stages = [500, 800].map((at, j) => ({ id: `stage-${j}`, at, label: '함께만드는아주긴단계이름', reached: false }));
        } else if (fixture === 'extremes') {
          t.value = -1000;
          t.unit = i ? 'deg' : 'point';
        } else {
          t.value = 1000;
          t.goalReached = true;
          t.unit = i ? 'none' : 'point';
        }
      }
      return t;
    });
    const scores = { schemaVersion: 1, sections: {
      main: { revision: 1, data: { lastSetKey: 'default', sets: { default: { thermometers } } } },
      display: { revision: 1, data: { setKey: 'default', showToday: true, showUpcoming: true } },
    } };
    const settings = defaults();
    settings.toolkit.uiFontFamily = font;
    const roster = { revision: 0, defaultClassId: 'default', classes: [{ id: 'default', name: fixture === 'screenshot' ? '5학년 2반' : '학급이름이아주길어도버튼은제자리에', students: [], groups: [] }] };
  await page.evaluate(({scores,settings,roster}) => {
    localStorage.setItem('tidy-scores-preview-v1:thermometer', JSON.stringify(scores));
    localStorage.setItem('tidy-toolkit-preview-v1', JSON.stringify(settings));
    localStorage.setItem('tidy-classroom-preview-v2', JSON.stringify(roster));
  }, {scores,settings,roster});
  await page.reload({waitUntil:'networkidle'});
  await page.waitForSelector('.td-card');
  await page.evaluate(() => document.fonts.ready);
}

// 부모의 scrollHeight만으로는 형제 위에 겹쳐 그려진 글자를 놓칩니다.
// 실제 글자·버튼 경계와 각 줄의 순서, 부모 안쪽 포함 여부를 따로 확인합니다.
async function layoutIssues(page) {
  return page.evaluate(() => {
    const issues = [];
    const visible = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const rect = e => e.getBoundingClientRect();
    const contains = (parent, child, name) => {
      if (!visible(child)) return;
      const p = rect(parent), c = rect(child);
      if (c.left < p.left - 1 || c.right > p.right + 1 || c.top < p.top - 1 || c.bottom > p.bottom + 1)
        issues.push(`${name}: 부모 영역 밖 (${[c.left-p.left,c.top-p.top,c.right-p.right,c.bottom-p.bottom].map(n=>n.toFixed(1)).join(',')})`);
    };
    const separate = (a, b, name) => {
      if (!visible(a) || !visible(b)) return;
      const x = rect(a), y = rect(b);
      if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1)
        issues.push(`${name}: 서로 겹침`);
    };
    const board = document.querySelector('.td-board');
    for (const node of board.querySelectorAll('.td-header, .td-card, .td-hint')) contains(board, node, node.className);
    const header = board.querySelector('.td-header');
    const headerChildren = [...header.children];
    headerChildren.forEach(e => contains(header, e, '제목 줄'));
    headerChildren.slice(1).forEach((e, i) => separate(headerChildren[i], e, '제목 줄'));
    for (const [i, card] of [...board.querySelectorAll('.td-card')].entries()) {
      const inner = card.querySelector('.td-card-inner');
      const rows = [...inner.children].filter(visible);
      rows.forEach(e => contains(card, e, `카드 ${i} ${e.className}`));
      rows.slice(1).forEach((e, j) => {
        if (rect(rows[j]).bottom > rect(e).top + 1) issues.push(`카드 ${i}: 줄 순서 ${rows[j].className} → ${e.className}`);
      });
      const hero = card.querySelector('.td-hero');
      for (const selector of ['.td-value-block', '.td-reading', '.td-reading strong', '.td-reading > span', '.td-maximum', '.td-step-note', '.td-instrument', '.td-adjust', '.td-glass']) {
        for (const e of card.querySelectorAll(selector)) contains(hero, e, `카드 ${i} ${selector}`);
      }
      separate(card.querySelector('.td-value-block'), card.querySelector('.td-instrument'), `카드 ${i} 숫자 / 조작 버튼`);
      for (const e of card.querySelectorAll('.td-reading strong, .td-reading > span, .td-maximum, .td-step-note')) contains(card.querySelector('.td-value-block'), e, `카드 ${i} 숫자 안내`);
      for (const group of ['.td-label', '.td-goal-caption', '.td-goal > strong', '.td-upcoming', '.td-today', '.td-card-foot']) {
        const parent = card.querySelector(group);
        if (!visible(parent)) continue;
        const children = [...parent.children];
        children.forEach(e => contains(parent, e, `카드 ${i} ${group}`));
        for (let a = 0; a < children.length; a++) for (let b = a + 1; b < children.length; b++) separate(children[a], children[b], `카드 ${i} ${group}`);
      }
    }
    const menu = document.querySelector('.td-menu');
    if (menu) {
      const r = rect(menu);
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) issues.push('설정: 창 밖');
      if (menu.scrollWidth > menu.clientWidth + 1) issues.push('설정: 가로 넘침');
      for (const tile of menu.querySelectorAll('.td-tile')) separate(tile.querySelector('.td-tile-name'), tile.querySelector('.td-check'), '설정: 이름 / 체크');
    }
    return issues;
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(output, name) });
  report.screenshots.push(name);
}

// 실제 화면의 네이티브 분기를 쓰되 IPC는 브라우저 안에서만 받습니다.
// 투명한 여백까지 위쪽 손잡이가 잡히는지, 창 이동 대신 올바른 resize 명령을 보내는지 확인합니다.
// Windows가 실제 창 크기를 바꾸는 검증과는 구분합니다.
async function checkTopEdge(browser, seedPage) {
  const data = await seedPage.evaluate(() => ({
    scores: JSON.parse(localStorage.getItem('tidy-scores-preview-v1:thermometer')),
    settings: JSON.parse(localStorage.getItem('tidy-toolkit-preview-v1')),
    roster: JSON.parse(localStorage.getItem('tidy-classroom-preview-v2')),
  }));
  const context = await browser.newContext({viewport:{width:520,height:420}});
  await context.addInitScript(data => {
    let callbackId = 0;
    window.isTauri = true;
    window.__miniIpc = [];
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow:{label:'thermometer-display'}, currentWebview:{label:'thermometer-display'} },
      transformCallback: () => ++callbackId,
      unregisterCallback: () => {},
      invoke: async (command, args) => {
        window.__miniIpc.push({command,args});
        if (command === 'scores_read') return {...data.scores,readOnly:false,notice:null};
        if (command === 'toolkit_read') return data.settings;
        if (command === 'classroom_read') return data.roster;
        if (command === 'plugin:window|available_monitors') return [];
        if (command === 'plugin:window|is_minimized') return false;
        if (command === 'plugin:store|load' || command === 'plugin:event|listen') return 1;
        if (command === 'plugin:store|get') return [null,false];
        return null;
      },
    };
  }, data);
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.goto(base);
    await page.waitForSelector('.td-card');
    for (const y of [1,4,6,11]) {
      assert.equal(await page.evaluate(y => document.elementFromPoint(innerWidth/2,y)?.getAttribute('data-direction'),y),'North',`위쪽 ${y}px에서 손잡이가 잡혀야 합니다`);
      await page.evaluate(() => window.__miniIpc = []);
      await page.mouse.move(260,y);
      await page.mouse.down();
      await page.mouse.up();
      const calls = await page.evaluate(() => window.__miniIpc.filter(x => /start_(resize_)?dragging/.test(x.command)));
      assert.deepEqual(calls,[{command:'plugin:window|start_resize_dragging',args:{label:'thermometer-display',value:'North'}}]);
    }
    await page.evaluate(() => window.__miniIpc = []);
    await page.mouse.move(260,24);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__miniIpc.some(x => x.command === 'plugin:window|start_dragging')),true,'제목 줄 빈 곳에서는 창 이동이 유지되어야 합니다');
    await shot(page,'top-edge-native-markup.png');
    report.checks.push('위쪽 1·4·6·11px 손잡이와 North IPC · 제목 줄 창 이동(브라우저 IPC 대체)');
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 880, height: 480 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(`${base}/?toolkit-preview=thermometer-display`);
  await page.waitForSelector('.td-card');
  try {
    if (process.argv.includes('--resize-only')) {
      await seed(page,'screenshot',2,'메이플스토리 L');
      await checkTopEdge(browser,page);
      assert.equal(report.errors.length,0);
      return;
    }
    for (const font of fonts) for (const fixture of fixtures) for (const count of [2, 1]) {
      await seed(page, fixture, count, font);
      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        const issues = await layoutIssues(page);
        report.cases++;
        if (issues.length) report.failures.push({ font, fixture, count, ...size, issues });
      }
      console.log(`${font} / ${fixture} / ${count}개: ${sizes.length}개 크기 검사`);
    }
    for (const size of [{width:280,height:220}, {width:625,height:480}, {width:880,height:480}, {width:1920,height:220}]) {
      await seed(page, 'screenshot', 2, '메이플스토리 L');
      await page.setViewportSize(size);
      await shot(page, `cards-${size.width}x${size.height}.png`);
    }
    await seed(page, 'extremes', 2, 'Malgun Gothic');
    await page.setViewportSize({width:280,height:220});
    await shot(page, 'long-values-280x220.png');
    await seed(page, 'stages', 2, 'Malgun Gothic');
    for (const size of [{width:280,height:220},{width:280,height:440},{width:400,height:560},{width:880,height:480}]) {
      await page.setViewportSize(size);
      await page.getByRole('button', { name: '미니 온도계 설정', exact: true }).click();
      const issues = await layoutIssues(page);
      report.cases++;
      if (issues.length) report.failures.push({ fixture:'menu',...size,issues });
      await shot(page, `menu-${size.width}x${size.height}.png`);
      await page.keyboard.press('Escape');
    }

    // 크기를 여러 번 바꾼 뒤에도 온도 조작·이름 편집·설정 저장이 그대로 작동하는지 확인합니다.
    await seed(page, 'screenshot', 2, '메이플스토리 L');
    await page.setViewportSize({width:880,height:480});
    await page.locator('.td-increase').first().click();
    await assert.doesNotReject(() => page.waitForFunction(() => document.querySelector('.td-reading strong').textContent === '5'));
    await page.locator('.td-decrease').first().click();
    await page.waitForFunction(() => document.querySelector('.td-reading strong').textContent === '4');
    await page.getByRole('textbox', {name:'온도계 이름'}).first().fill('크기검수');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('tidy-scores-preview-v1:thermometer')).sections.main.data.sets.default.thermometers[0].title === '크기검수');
    await page.reload();
    await page.waitForSelector('.td-card');
    assert.equal(await page.getByRole('textbox', {name:'온도계 이름'}).first().inputValue(), '크기검수');
    assert.equal(await page.locator('.td-reading strong').first().textContent(), '4');
    report.checks.push('크기 변경 뒤 온도 증감·이름 편집·다시 열기 유지');

    const other = await context.newPage();
    await other.goto(`${base}/?toolkit-preview=thermometer-display`);
    await other.waitForSelector('.td-card');
    await page.locator('.td-decrease').first().click();
    await other.waitForFunction(() => document.querySelector('.td-reading strong').textContent === '3');
    await other.close();
    report.checks.push('두 미니 화면 사이의 저장 동기화');

    // 200% 배율에서도 논리 크기가 같으면 같은 배치입니다. 어두운 테마와 다른 글꼴도 함께 확인합니다.
    const scaled = await browser.newContext({viewport:{width:880,height:480},deviceScaleFactor:2});
    const scaledPage = await scaled.newPage();
    await scaledPage.goto(`${base}/?toolkit-preview=thermometer-display`);
    await scaledPage.waitForSelector('.td-card');
    await seed(scaledPage, 'stages', 2, 'Malgun Gothic');
    await scaledPage.evaluate(()=>{ const settings=JSON.parse(localStorage.getItem('tidy-toolkit-preview-v1'));settings.toolkit.darkMode=true;localStorage.setItem('tidy-toolkit-preview-v1',JSON.stringify(settings)); });
    await scaledPage.reload();
    await scaledPage.waitForSelector('.td-card');
    assert.deepEqual(await layoutIssues(scaledPage), []);
    await shot(scaledPage, 'dark-200-percent.png');
    await scaled.close();
    report.checks.push('어두운 화면·200% 렌더 배율');
    await checkTopEdge(browser,page);
    assert.equal(report.errors.length, 0, '브라우저 실행 오류');
    assert.equal(report.failures.length, 0, `배치 오류 ${report.failures.length}건: ${JSON.stringify(report.failures.slice(0,5))}`);
  } finally {
    fs.writeFileSync(path.join(output,process.argv.includes('--resize-only')?'resize-report.json':'report.json'), JSON.stringify(report,null,2));
    await browser.close();
    console.log(JSON.stringify({cases:report.cases,failures:report.failures.length,errors:report.errors,checks:report.checks,output}));
  }
}
main().catch(e=>{ console.error(e); process.exitCode=1; });
