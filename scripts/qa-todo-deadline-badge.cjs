// 투두리스트 날짜 뱃지 PRD v2.0 자동 계측·Overflow-Zero·반응형 자정 전환·다중 폰트/테마 QA 스크립트
// 실행:
//   npm run dev -- --port 5176
//   NODE_PATH=<playwright node_modules> node scripts/qa-todo-deadline-badge.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.BADGE_QA_URL || 'http://127.0.0.1:5176';
const output = path.resolve(process.env.BADGE_QA_OUTPUT || 'output/qa/todo-deadline-badge');
fs.mkdirSync(output, { recursive: true });

const TODAY = '2026-11-20';
const EXPECTED_METRICS = {
  6: { h: 18, w: 58 },
  10: { h: 22, w: 64 },
  12: { h: 24, w: 71 },
  15: { h: 28, w: 82 },
};

const MIXED_TODOS = [
  { id: 't-over', text: '작성 완료된 주간 보고 확인', completed: false, deadline: '2026-11-18' }, // overdue (purple)
  { id: 't-today', text: '교무기획 회의 자료 최종 제출', completed: false, deadline: '2026-11-20' }, // today (red)
  { id: 't-soon', text: '수학 퍼즐 페스티벌 아카이빙', completed: false, deadline: '2026-11-23' }, // soon (orange, 3d)
  { id: 't-week', text: 'AI 분야 동아리 운영일지 및 강사비 기안', completed: false, deadline: '2026-11-25' }, // week (green, 5d)
  { id: 't-later', text: '학습종합클리닉 운영일지 제출', completed: false, deadline: '2026-12-01' }, // later (blue, 11d)
  { id: 't-unset', text: '참고 도서 목록 아이디어 메모', completed: false, deadline: '' }, // unset (dashed calendar)
];

const LINKED_DDAYS = [
  {
    id: 'dd-today',
    title: '교무기획 회의 자료 최종 제출',
    date: '2026-11-20',
    countMode: 'countdown',
    repeatYearly: false,
    tone: 'rose',
    icon: 'flame',
    status: 'active',
    showInBanner: false,
    linkedTodoId: 't-today',
    order: 0,
  },
  {
    id: 'dd-week',
    title: 'AI 분야 동아리 운영일지 및 강사비 기안',
    date: '2026-11-25',
    countMode: 'countdown',
    repeatYearly: true,
    tone: 'accent',
    icon: 'notebook',
    status: 'active',
    showInBanner: true,
    linkedTodoId: 't-week',
    order: 1,
  },
];

async function launchBrowser() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // 다음 채널 시도
    }
  }
  return chromium.launch({ headless: true });
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(220);
}

async function measureBadges(page) {
  return page.evaluate(() => {
    const rOf = (el) => {
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

    const listRoot = document.querySelector('.todo-list-root');
    const rowBtns = [...document.querySelectorAll('.memo-body [data-todo-deadline-btn]')];
    const formDateBtn = document.querySelector('.todo-date-button');
    const rowDdays = [...document.querySelectorAll('.todo-tail .dday-smart-chip')];
    const sortCapsule = document.querySelector('[data-bulk-sort-capsule]');
    const probeHasBtnAttr = Boolean(document.querySelector('.todo-badge-probe')?.hasAttribute('data-todo-deadline-btn'));

    const badges = rowBtns.map((btn) => {
      const label = btn.querySelector('.todo-badge-label');
      const rect = rOf(btn);
      const labelRect = rOf(label);
      return {
        dl: btn.getAttribute('data-dl'),
        text: btn.textContent?.trim() ?? '',
        rect,
        scrollWidth: btn.scrollWidth,
        clientWidth: btn.clientWidth,
        labelCenterDx: rect && labelRect ? Math.abs(rect.cx - labelRect.cx) : 0,
        textOverflowPx: Math.max(0, btn.scrollWidth - btn.clientWidth),
      };
    });

    const ddays = rowDdays.map((chip) => {
      const rect = rOf(chip);
      return {
        kind: chip.getAttribute('data-dday-kind'),
        text: chip.textContent?.trim() ?? '',
        rect,
        scrollWidth: chip.scrollWidth,
        clientWidth: chip.clientWidth,
      };
    });

    const cs = listRoot ? getComputedStyle(listRoot) : null;
    return {
      probeHasBtnAttr,
      slotVar: cs?.getPropertyValue('--tb-date-w').trim() ?? '',
      fontVar: cs?.getPropertyValue('--tb-date-fs').trim() ?? '',
      lsVar: cs?.getPropertyValue('--tb-date-ls').trim() ?? '',
      badges,
      formDateBtn: rOf(formDateBtn),
      ddays,
      sortCapsule: rOf(sortCapsule),
    };
  });
}

async function main() {
  const browser = await launchBrowser();
  const context = await browser.newContext({ deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const report = [];
  const log = (name, detail) => {
    report.push({ name, ...detail });
    console.log(`✔ ${name}`, JSON.stringify(detail));
  };

  try {
    await page.setViewportSize({ width: 520, height: 820 });
    await page.goto(
      `${base}/?memo-layout-preview&full-ui&bulk-qa&standalone&sort-motion=full&theme=amber&design=modern&width=370&height=660&ui-size=10&text-size=10&font=${encodeURIComponent('메이플스토리 L')}`,
      { waitUntil: 'networkidle' },
    );
    await page.locator('[data-bulk-dock]').waitFor();
    await page.evaluate(
      ({ todos, ddayItems, todayKey }) => window.__memoPreview.configure({
        todos,
        ddayItems,
        todayKey,
        selectedIds: ['t-soon'],
        showNotes: false,
        showArchived: true,
      }),
      { todos: MIXED_TODOS, ddayItems: LINKED_DDAYS, todayKey: TODAY },
    );
    await settle(page);

    // 1. 기본 10pt 메이플스토리 L 정밀 계측 + 쌍둥이 높이 + 6상태 검증
    const m10 = await measureBadges(page);
    assert.equal(m10.probeHasBtnAttr, false, '측정 span에 data-todo-deadline-btn 금지 위반');
    assert.deepEqual(
      m10.badges.map((b) => b.dl),
      ['overdue', 'today', 'soon', 'week', 'later', 'unset'],
    );
    const widths10 = m10.badges.map((b) => Math.round(b.rect.width * 10) / 10);
    assert.equal(new Set(widths10).size, 1, `10pt 전 행 뱃지 폭 불일치: ${widths10.join(',')}`);
    assert.equal(widths10[0], EXPECTED_METRICS[10].w, `10pt 기본 폭은 ${EXPECTED_METRICS[10].w}px`);
    assert.ok(Math.abs(m10.formDateBtn.width - EXPECTED_METRICS[10].w) <= 0.2, '하단 입력 날짜 버튼 폭 일치');
    assert.ok(Math.abs(m10.formDateBtn.height - EXPECTED_METRICS[10].h) <= 0.2, '하단 입력 날짜 버튼 높이 일치');

    for (const b of m10.badges) {
      assert.ok(Math.abs(b.rect.height - EXPECTED_METRICS[10].h) <= 0.2, `${b.text} 높이 오류: ${b.rect.height}`);
      assert.equal(b.textOverflowPx, 0, `${b.text} 텍스트 넘침: ${b.textOverflowPx}`);
      assert.ok(b.labelCenterDx <= 0.6, `${b.text} 가로 중앙 정렬 오차: ${b.labelCenterDx}`);
    }
    for (const d of m10.ddays) {
      assert.ok(Math.abs(d.rect.height - EXPECTED_METRICS[10].h) <= 0.2, `D-Day ${d.text} 높이 0px 불일치: ${d.rect.height}`);
    }
    const sortErr = Math.abs(m10.sortCapsule.cx - m10.badges[0].rect.cx);
    assert.ok(sortErr <= 0.5, `도크 정렬 캡슐 중앙 오차 초과: ${sortErr}`);

    await page.locator('.frame').screenshot({ path: path.join(output, '01-amber-light-10pt.png') });
    log('10pt-maplestory-twin-spec', {
      slotW: widths10[0],
      badgeH: m10.badges[0].rect.height,
      ddayH: m10.ddays[0].rect.height,
      formDateH: m10.formDateBtn.height,
      sortErr: Number(sortErr.toFixed(2)),
    });

    // 2. 페이퍼(kraft) · 다크 모드 시각 캡처
    await page.evaluate(() => window.__memoPreview.configure({ theme: 'kraft', dark: false }));
    await settle(page);
    await page.locator('.frame').screenshot({ path: path.join(output, '02-kraft-paper-10pt.png') });

    await page.evaluate(() => window.__memoPreview.configure({ theme: 'amber', dark: true }));
    await settle(page);
    await page.locator('.frame').screenshot({ path: path.join(output, '03-amber-dark-10pt.png') });
    log('themes-kraft-and-dark', { ok: true });

    // 3. 4종 폰트 × 4단계 UI 글자 크기(6/10/12/15pt) Overflow-Zero & 쌍둥이 높이 & 도크 동기화 전수 검수
    await page.evaluate(() => window.__memoPreview.configure({ theme: 'amber', dark: false, width: 390, height: 680 }));
    const fonts = ['메이플스토리 L', 'KCC 간판체', '배달의민족 도현', '맑은 고딕'];
    for (const font of fonts) {
      for (const pt of [6, 10, 12, 15]) {
        await page.evaluate(({ fontName, uiSize }) => window.__memoPreview.configure({ font: fontName, uiSize }), {
          fontName: font,
          uiSize: pt,
        });
        await settle(page);
        const m = await measureBadges(page);
        const exp = EXPECTED_METRICS[pt];
        const wSet = new Set(m.badges.map((b) => Math.round(b.rect.width * 10) / 10));
        assert.equal(wSet.size, 1, `${font}/${pt}pt 행간 폭 불일치: ${[...wSet]}`);
        const actualW = [...wSet][0];
        assert.ok(actualW >= exp.w - 0.1, `${font}/${pt}pt 슬롯 폭(${actualW})이 기준(${exp.w})보다 작음`);

        for (const b of m.badges) {
          assert.ok(Math.abs(b.rect.height - exp.h) <= 0.25, `${font}/${pt}pt 높이 오류: ${b.rect.height} vs ${exp.h}`);
          assert.ok(b.textOverflowPx <= 0.5, `${font}/${pt}pt ${b.text} 넘침: ${b.textOverflowPx}`);
        }
        for (const d of m.ddays) {
          assert.ok(Math.abs(d.rect.height - exp.h) <= 0.25, `${font}/${pt}pt D-Day 높이 불일치: ${d.rect.height} vs ${exp.h}`);
        }
        const err = Math.abs(m.sortCapsule.cx - m.badges[0].rect.cx);
        assert.ok(err <= 0.6, `${font}/${pt}pt 도크 중앙 오차: ${err}`);

        if (font === '메이플스토리 L' && pt === 6) {
          await page.locator('.frame').screenshot({ path: path.join(output, '04-size-6pt.png') });
        } else if (font === '메이플스토리 L' && pt === 12) {
          await page.locator('.frame').screenshot({ path: path.join(output, '05-size-12pt.png') });
        } else if (font === '메이플스토리 L' && pt === 15) {
          await page.locator('.frame').screenshot({ path: path.join(output, '06-size-15pt.png') });
        } else if (font === 'KCC 간판체' && pt === 10) {
          await page.locator('.frame').screenshot({ path: path.join(output, '07-font-kcc-ganpan.png') });
        } else if (font === '배달의민족 도현' && pt === 10) {
          await page.locator('.frame').screenshot({ path: path.join(output, '08-font-do-hyeon.png') });
        }

        log(`matrix-${font}-${pt}pt`, {
          slotW: actualW,
          height: exp.h,
          fontPx: m.fontVar,
          ls: m.lsVar,
          sortErr: Number(err.toFixed(2)),
        });
      }
    }

    // 4. 반응형 자정 경과(todayKey 변경 → today 가 overdue 로 즉시 전환) & 비정상 날짜 invalid 격리
    await page.evaluate(({ todos, ddayItems }) => window.__memoPreview.configure({
      font: '메이플스토리 L',
      uiSize: 10,
      todayKey: '2026-11-21',
      ddayItems,
      todos: [
        ...todos,
        { id: 't-bad', text: '잘못된 날짜 문자열 방어 테스트', completed: false, deadline: 'not-a-date' },
      ],
    }), { todos: MIXED_TODOS, ddayItems: LINKED_DDAYS });
    await settle(page);
    const mRollover = await measureBadges(page);
    assert.equal(mRollover.badges[1].dl, 'overdue', '자정 경과(todayKey=2026-11-21) 후 기존 today(11-20)가 overdue로 바뀌어야 함');
    assert.equal(mRollover.badges[6].dl, 'invalid', 'NaN 날짜가 later(파랑) 대신 invalid(중립 회색)로 격리되어야 함');
    assert.equal(mRollover.badges[6].textOverflowPx, 0, 'invalid 날짜 문자열이 뱃지 밖으로 넘치면 안 됨');
    log('midnight-rollover-and-invalid', {
      rolledOverKind: mRollover.badges[1].dl,
      invalidKind: mRollover.badges[6].dl,
      invalidW: mRollover.badges[6].rect.width,
    });

    assert.equal(pageErrors.length, 0, `페이지 오류 발생: ${pageErrors.join('; ')}`);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log('\nALL TODO DEADLINE BADGE QA CHECKS PASSED!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('QA FAILED:', err);
  process.exit(1);
});
