// 다중 선택 인셋 말랑 도크(시안 3) 자동 좌표·겹침·상태·시각 검수 스크립트
// 실행:
//   npm run dev -- --port 5176
//   NODE_PATH=<playwright node_modules> node scripts/qa-bulk-dock.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.BULK_QA_URL || 'http://127.0.0.1:5176';
const output = path.resolve(process.env.BULK_QA_OUTPUT || 'output/qa/bulk-dock');
fs.mkdirSync(output, { recursive: true });

const SCREENSHOT_TODOS = [
  { id: 't1', text: '수학 퍼즐 페스티벌 아카이빙(패들렛)', completed: false, deadline: '2026-11-23' },
  { id: 't2', text: 'AI 분야 동아리 운영일지 및 강사비 기안', completed: false, deadline: '2026-11-25' },
  { id: 't3', text: '학습종합클리닉 운영일지 제출', completed: false, deadline: '2026-12-01' },
  { id: 't4', text: '기초학력 강사비 품의 기안', completed: false, deadline: '2026-12-09' },
];

const UNDATED_TODOS = [
  { id: 'u1', text: '날짜 없는 일정 첫 번째', completed: false, deadline: '' },
  { id: 'u2', text: '날짜 없는 일정 두 번째', completed: false, deadline: '' },
];

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(180);
}

async function measureMetrics(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      };
    };

    const dock = document.querySelector('[data-bulk-dock]');
    const selectAll = document.querySelector('[data-bulk-select-all]');
    const pip = document.querySelector('[data-bulk-count-pip]');
    const sortCapsule = document.querySelector('[data-bulk-sort-capsule]');
    const thumb = sortCapsule?.querySelector('.index-slide-thumb');
    const slots = sortCapsule ? [...sortCapsule.querySelectorAll('.index-slide-slot')] : [];
    const actions = document.querySelector('[data-bulk-actions]');
    const actionBtns = actions ? [...actions.querySelectorAll('button')] : [];
    const rowChk = document.querySelector('[data-todo-select-btn]');
    const badges = [...document.querySelectorAll('.memo-body [data-todo-deadline-btn]')];
    const datedBadge = badges.find((b) => b.textContent && b.textContent.trim().length > 0) || badges[0] || null;
    const viewport = document.querySelector('.memo-body .border-t');

    return {
      dock: rect(dock),
      dockOverflow: dock ? dock.scrollWidth - dock.clientWidth : 0,
      selectAll: rect(selectAll),
      selectAllAriaChecked: selectAll?.getAttribute('aria-checked') ?? null,
      selectAllDisabled: Boolean(selectAll?.disabled),
      pip: rect(pip),
      pipText: pip?.textContent?.trim() ?? '',
      sortCapsule: rect(sortCapsule),
      sortAriaPressed: sortCapsule?.getAttribute('aria-pressed') ?? null,
      notchVisible: sortCapsule?.getAttribute('data-notch-visible') ?? null,
      thumb: rect(thumb),
      slotDown: rect(slots[0]),
      slotUp: rect(slots[1]),
      actions: rect(actions),
      actionBtns: actionBtns.map((b) => ({
        label: b.getAttribute('aria-label') || b.textContent?.trim() || b.title,
        disabled: b.disabled,
        rect: rect(b),
      })),
      rowChk: rect(rowChk),
      datedBadge: rect(datedBadge),
      viewportTopBorderColor: viewport ? getComputedStyle(viewport).borderTopColor : null,
      todoOrder: [...document.querySelectorAll('.todo-row[data-todo-id]')].map((el) => el.getAttribute('data-todo-id')),
      selectedRowCount: document.querySelectorAll('.todo-row.is-selected').length,
    };
  });
}

async function captureDockZoom(page, filePath) {
  const clip = await page.evaluate(() => {
    const frame = document.querySelector('.frame');
    const dock = document.querySelector('[data-bulk-dock-wrap]');
    const rows = [...document.querySelectorAll('.todo-row')];
    if (!frame || !dock) return null;
    const fr = frame.getBoundingClientRect();
    const dr = dock.getBoundingClientRect();
    const lastRow = rows[Math.min(2, rows.length - 1)];
    const bottom = lastRow ? lastRow.getBoundingClientRect().bottom + 6 : dr.bottom + 90;
    return {
      x: Math.max(0, fr.left),
      y: Math.max(0, dr.top - 12),
      width: fr.width,
      height: Math.max(80, bottom - (dr.top - 12)),
    };
  });
  if (clip) await page.screenshot({ path: filePath, clip });
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const report = [];
  const log = (name, data) => {
    report.push({ name, ...data });
    console.log(`✔ ${name}`, JSON.stringify(data));
  };

  try {
    await page.setViewportSize({ width: 520, height: 760 });
    await page.goto(
      `${base}/?memo-layout-preview&full-ui&bulk-qa&standalone&sort-motion=full&theme=amber&design=modern&width=332&height=560&ui-size=10&text-size=12&font=${encodeURIComponent('학교안심 은하수')}`,
      { waitUntil: 'networkidle' },
    );
    await page.locator('[data-bulk-dock]').waitFor();
    await page.evaluate((todos) => window.__memoPreview.configure({
      todos,
      selectedIds: [],
      showNotes: false,
      showArchived: true,
    }), SCREENSHOT_TODOS);
    await settle(page);

    // 1. 스크린샷 조건(332px · 은하수 · 12pt 메모 · 10pt UI · 0개 선택) 2축 정밀 검증
    const m332 = await measureMetrics(page);
    const chkErr332 = Math.abs(m332.selectAll.cx - m332.rowChk.cx);
    const sortErr332 = Math.abs(m332.sortCapsule.cx - m332.datedBadge.cx);
    const thumbErrAsc = Math.abs(m332.thumb.cx - m332.slotDown.cx);
    const midYErr = Math.max(
      Math.abs(m332.selectAll.cy - m332.sortCapsule.cy),
      ...m332.actionBtns.map((b) => Math.abs(b.rect.cy - m332.sortCapsule.cy)),
    );

    assert.ok(chkErr332 <= 0.5, `332px 체크 축 오차 초과: ${chkErr332}`);
    assert.ok(sortErr332 <= 1.0, `332px 날짜 중앙 축 오차 초과: ${sortErr332}`);
    assert.ok(thumbErrAsc <= 0.6, `asc 노브-화살표 중심 오차 초과: ${thumbErrAsc}`);
    assert.ok(midYErr <= 1.0, `도크 내 수직 중앙 정렬 오차 초과: ${midYErr}`);
    assert.equal(Math.round(m332.selectAll.width), 16);
    assert.equal(Math.round(m332.rowChk.width), 16);
    assert.equal(m332.selectAllAriaChecked, 'false');
    assert.equal(m332.pipText, '');
    assert.equal(m332.notchVisible, 'true');
    assert.equal(m332.viewportTopBorderColor, 'rgba(0, 0, 0, 0)');
    assert.ok(m332.sortCapsule.right + 7 <= m332.actions.left, '정렬 캡슐과 우측 액션 겹침');
    assert.ok(m332.actionBtns.every((b) => b.disabled), '0개 선택 시 우측 4버튼 모두 비활성');

    await page.locator('.frame').screenshot({ path: path.join(output, '01-amber-332-eunhasu-0sel.png') });
    await captureDockZoom(page, path.join(output, '01-amber-332-dock-zoom.png'));
    log('332px-eunhasu-axes', {
      chkErr: Number(chkErr332.toFixed(2)),
      sortErr: Number(sortErr332.toFixed(2)),
      thumbErrAsc: Number(thumbErrAsc.toFixed(2)),
      midYErr: Number(midYErr.toFixed(2)),
      gapToActions: Number((m332.actions.left - m332.sortCapsule.right).toFixed(1)),
    });

    // 2. 상호작용 테스트: 전체 선택(4/4) → 1건 해제(부분 3/4) → 정렬 방향 반전(desc) → 전체 해제(0/4)
    await page.evaluate(() => window.__memoPreview.configure({ width: 380, textSize: 10, uiSize: 10, font: '메이플스토리 L' }));
    await settle(page);
    await page.locator('[data-bulk-select-all]').click();
    await settle(page);
    const mAll = await measureMetrics(page);
    assert.equal(mAll.selectAllAriaChecked, 'true');
    assert.equal(mAll.pipText, '4');
    assert.equal(mAll.selectedRowCount, 4);
    assert.ok(mAll.actionBtns.every((b) => !b.disabled), '전체 선택 시 우측 4버튼 활성');

    // 정렬 클릭 → desc 반전 & 노브 이동
    await page.locator('[data-bulk-sort-capsule]').click();
    await page.waitForTimeout(320);
    await settle(page);
    const mDesc = await measureMetrics(page);
    const thumbErrDesc = Math.abs(mDesc.thumb.cx - mDesc.slotUp.cx);
    assert.equal(mDesc.sortAriaPressed, 'true');
    assert.deepEqual(mDesc.todoOrder, ['t4', 't3', 't2', 't1']);
    assert.ok(thumbErrDesc <= 0.6, `desc 노브-화살표 중심 오차 초과: ${thumbErrDesc}`);
    await page.locator('.frame').screenshot({ path: path.join(output, '02-amber-380-all-desc.png') });
    await captureDockZoom(page, path.join(output, '02-amber-380-all-desc-zoom.png'));
    log('all-select-and-desc-sort', { order: mDesc.todoOrder, pip: mDesc.pipText, thumbErrDesc: Number(thumbErrDesc.toFixed(2)) });

    // 개별 2개 해제 → 부분 선택(2/4, aria-checked="mixed", pip="2")
    await page.locator('[data-todo-select-btn]').nth(0).click();
    await page.locator('[data-todo-select-btn]').nth(1).click();
    await settle(page);
    const mPart = await measureMetrics(page);
    assert.equal(mPart.selectAllAriaChecked, 'mixed');
    assert.equal(mPart.pipText, '2');
    assert.equal(mPart.selectedRowCount, 2);
    // 선택된 행 호버 시 --row-surface 와 실제 배경색 일치 확인
    const veilCheck = await page.evaluate(() => {
      const selRow = document.querySelector('.todo-row.is-selected');
      const veil = selRow?.querySelector('.todo-veil');
      return {
        rowBg: selRow ? getComputedStyle(selRow).backgroundColor : null,
        veilBg: veil ? getComputedStyle(veil).backgroundColor : null,
      };
    });
    assert.equal(veilCheck.rowBg, veilCheck.veilBg, '선택 행 배경과 .todo-veil 받침 색이 다름');
    await page.locator('.frame').screenshot({ path: path.join(output, '03-amber-380-partial-2of4.png') });
    await captureDockZoom(page, path.join(output, '03-amber-380-partial-zoom.png'));
    log('partial-select-and-veil', { pip: mPart.pipText, aria: mPart.selectAllAriaChecked, veilBg: veilCheck.veilBg });

    // 다시 전체 선택 클릭 → 전체 해제
    await page.locator('[data-bulk-select-all]').click();
    await settle(page);
    const mCleared = await measureMetrics(page);
    assert.equal(mCleared.selectAllAriaChecked, 'false');
    assert.equal(mCleared.pipText, '');
    assert.equal(mCleared.selectedRowCount, 0);

    // 3. 좁은 창(268px · 250px) + 큰 글자(12pt · 14pt) 충돌·축 고정·클램프 검증
    for (const [w, ui] of [[268, 10], [250, 10], [332, 12], [250, 14]]) {
      await page.evaluate(({ width, uiSize }) => window.__memoPreview.configure({ width, uiSize, selectedIds: ['t1', 't2'] }), { width: w, uiSize: ui });
      await settle(page);
      const m = await measureMetrics(page);
      const chkErr = Math.abs(m.selectAll.cx - m.rowChk.cx);
      assert.ok(chkErr <= 0.5, `${w}px/${ui}pt 체크 축 흔들림: ${chkErr}`);
      assert.ok(m.selectAll.right + 8 <= m.sortCapsule.left, `${w}px/${ui}pt 체크-정렬 겹침`);
      assert.ok(m.sortCapsule.right + 7 <= m.actions.left, `${w}px/${ui}pt 정렬-액션 겹침`);
      assert.ok(m.dockOverflow <= 1, `${w}px/${ui}pt 도크 가로 넘침: ${m.dockOverflow}`);
      if (w === 268 && ui === 10) {
        await page.locator('.frame').screenshot({ path: path.join(output, '04-amber-268-narrow.png') });
        await captureDockZoom(page, path.join(output, '04-amber-268-narrow-zoom.png'));
      }
      if (w === 250 && ui === 14) {
        await captureDockZoom(page, path.join(output, '05-extreme-250-14pt-zoom.png'));
      }
      log(`responsive-${w}px-${ui}pt`, {
        chkErr: Number(chkErr.toFixed(2)),
        sortErr: Number(Math.abs(m.sortCapsule.cx - m.datedBadge.cx).toFixed(2)),
        notchVisible: m.notchVisible,
        gapToActions: Number((m.actions.left - m.sortCapsule.right).toFixed(1)),
      });
    }

    // 4. 다크 모드(380px) & 페이퍼(kraft · 날짜 없는 아이콘 뱃지) & 로즈(클래식 헤더) & 빈 목록(0개)
    await page.evaluate((todos) => window.__memoPreview.configure({
      width: 380, uiSize: 10, textSize: 10, theme: 'amber', dark: true, design: 'modern', todos, selectedIds: ['t1', 't2', 't3', 't4'],
    }), SCREENSHOT_TODOS);
    await settle(page);
    await page.locator('.frame').screenshot({ path: path.join(output, '06-dark-380-all.png') });
    await captureDockZoom(page, path.join(output, '06-dark-380-zoom.png'));
    log('dark-380', { ok: true });

    await page.evaluate((todos) => window.__memoPreview.configure({
      width: 380, uiSize: 10, textSize: 10, theme: 'kraft', dark: false, design: 'modern', todos, selectedIds: ['u1'],
    }), UNDATED_TODOS);
    await settle(page);
    const mUndated = await measureMetrics(page);
    const undatedSortErr = Math.abs(mUndated.sortCapsule.cx - mUndated.datedBadge.cx);
    assert.ok(undatedSortErr <= 1.0, `날짜 없음 아이콘 뱃지 중앙 추종 오차: ${undatedSortErr}`);
    assert.equal(mUndated.notchVisible, 'true');
    await captureDockZoom(page, path.join(output, '07-kraft-undated-zoom.png'));
    log('kraft-undated-icon-badge', { sortErr: Number(undatedSortErr.toFixed(2)), notchVisible: mUndated.notchVisible });

    await page.evaluate((todos) => window.__memoPreview.configure({
      width: 360, uiSize: 10, textSize: 10, theme: 'rose', dark: false, design: 'classic', todos, selectedIds: ['t1', 't2'],
    }), SCREENSHOT_TODOS);
    await settle(page);
    await page.locator('.frame').screenshot({ path: path.join(output, '08-rose-360-classic.png') });
    log('rose-classic', { ok: true });

    // 목록 0개 → 전체선택 disabled & 꼬리점 숨김
    await page.evaluate(() => window.__memoPreview.configure({
      width: 360, theme: 'blue', dark: false, design: 'modern', todos: [], selectedIds: [],
    }));
    await settle(page);
    const mEmpty = await measureMetrics(page);
    assert.equal(mEmpty.selectAllDisabled, true);
    assert.equal(mEmpty.notchVisible, 'false');
    log('empty-list', { disabled: mEmpty.selectAllDisabled, notchVisible: mEmpty.notchVisible });

    assert.equal(pageErrors.length, 0, `페이지 오류 발생: ${pageErrors.join('; ')}`);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log('\nALL BULK DOCK QA CHECKS PASSED!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('QA FAILED:', err);
  process.exit(1);
});
