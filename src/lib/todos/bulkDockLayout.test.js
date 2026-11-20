import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDY_THEMES } from '../themes.js';
import { contrastRatio } from '../dday/ddayBadge.js';
import {
  BULK_DOCK_METRICS,
  bulkDockPaletteToStyle,
  computeSortCapsulePosition,
  formatCountPip,
  resolveBulkDockPalette,
  resolveSelectAllState,
} from './bulkDockLayout.js';

test('formatCountPip: 0 이하 빈 문자열, 1..99 그대로, 100 이상 99+로 캡한다', () => {
  assert.equal(formatCountPip(0), '');
  assert.equal(formatCountPip(-3), '');
  assert.equal(formatCountPip(NaN), '');
  assert.equal(formatCountPip(1), '1');
  assert.equal(formatCountPip(42), '42');
  assert.equal(formatCountPip(99), '99');
  assert.equal(formatCountPip(100), '99+');
  assert.equal(formatCountPip(350), '99+');
});

test('resolveSelectAllState: empty / none / partial / all 4상태와 검색 중 숨김 선택을 정확히 판정한다', () => {
  const empty = resolveSelectAllState({ totalCount: 0, visibleSelectedCount: 0, totalSelectedCount: 0 });
  assert.equal(empty.mode, 'empty');
  assert.equal(empty.disabled, true);
  assert.equal(empty.ariaChecked, 'false');
  assert.equal(empty.pipText, '');

  const none = resolveSelectAllState({ totalCount: 4, visibleSelectedCount: 0, totalSelectedCount: 0 });
  assert.equal(none.mode, 'none');
  assert.equal(none.disabled, false);
  assert.equal(none.ariaChecked, 'false');
  assert.equal(none.pipText, '');
  assert.match(none.title, /모두 선택/);

  const partial = resolveSelectAllState({ totalCount: 4, visibleSelectedCount: 2, totalSelectedCount: 2 });
  assert.equal(partial.mode, 'partial');
  assert.equal(partial.disabled, false);
  assert.equal(partial.ariaChecked, 'mixed');
  assert.equal(partial.pipText, '2');
  assert.match(partial.title, /2개 선택됨/);

  const all = resolveSelectAllState({ totalCount: 4, visibleSelectedCount: 4, totalSelectedCount: 4 });
  assert.equal(all.mode, 'all');
  assert.equal(all.disabled, false);
  assert.equal(all.ariaChecked, 'true');
  assert.equal(all.pipText, '4');
  assert.match(all.title, /전체 선택됨/);

  // 검색 필터로 선택된 항목이 잠시 가려졌지만 숨겨진 선택이 남아 있는 경우
  const hiddenSelected = resolveSelectAllState({ totalCount: 2, visibleSelectedCount: 0, totalSelectedCount: 3 });
  assert.equal(hiddenSelected.mode, 'partial');
  assert.equal(hiddenSelected.disabled, false);
  assert.equal(hiddenSelected.ariaChecked, 'mixed');
  assert.equal(hiddenSelected.pipText, '3');

  // 검색 결과 0건인데 숨겨진 선택이 남아 있는 경우에도 해제할 수 있어야 한다
  const hiddenInZero = resolveSelectAllState({ totalCount: 0, visibleSelectedCount: 0, totalSelectedCount: 1 });
  assert.equal(hiddenInZero.mode, 'partial');
  assert.equal(hiddenInZero.disabled, false);
  assert.equal(hiddenInZero.pipText, '1');
});

test('computeSortCapsulePosition: 정상 폭에서는 실측 날짜 뱃지 정중앙에 0px 오차로 배치하고 꼬리점을 표시한다', () => {
  // 창 좌측 0 기준: dockLeft=10, dockBorderLeft=1 → dockInnerLeft=11
  // 날짜 뱃지 정중앙 = 91px → 도크 내부 targetCx = 80px, capsuleLeftPx = 80 - 18 = 62px
  const pos = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: 91,
    actionsLeftClientX: 184,
    globalFontSizePt: 10,
    hasVisibleRows: true,
  });

  assert.equal(pos.targetCx, 80);
  assert.equal(pos.clampedCx, 80);
  assert.equal(pos.capsuleLeftPx, 62);
  assert.equal(pos.isClamped, false);
  assert.equal(pos.showNotch, true);
});

test('computeSortCapsulePosition: 날짜 없는 아이콘 뱃지(폭 37px, 중심 77.5px) 중앙도 정밀 추종한다', () => {
  const pos = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: 77.5,
    actionsLeftClientX: 184,
    globalFontSizePt: 10,
    hasVisibleRows: true,
  });

  assert.equal(pos.clampedCx, 66.5);
  assert.equal(pos.capsuleLeftPx, 48.5);
  assert.equal(pos.showNotch, true);
});

test('computeSortCapsulePosition: 할 일이 0개이면 폴백 좌표를 쓰되 꼬리점은 숨긴다', () => {
  const pos = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: null,
    actionsLeftClientX: 200,
    globalFontSizePt: 10,
    hasVisibleRows: false,
  });

  assert.equal(pos.showNotch, false);
  assert.ok(pos.clampedCx >= 75 && pos.clampedCx <= 82);
});

test('computeSortCapsulePosition: dateSlotPx·uiFontSizePt가 주어지면 날짜 슬롯 중심(48 + slot/2)을 폴백으로 추종한다', () => {
  const at10pt = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: null,
    actionsLeftClientX: 220,
    uiFontSizePt: 10,
    hasVisibleRows: false,
  });
  assert.equal(at10pt.clampedCx, 80); // 48 + 64/2

  const at15pt = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: null,
    actionsLeftClientX: 240,
    uiFontSizePt: 15,
    hasVisibleRows: false,
  });
  assert.equal(at15pt.clampedCx, 89); // 48 + 82/2

  const stage3 = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: null,
    actionsLeftClientX: 240,
    uiFontSizePt: 10,
    dateSlotPx: 84,
    hasVisibleRows: false,
  });
  assert.equal(stage3.clampedCx, 90); // 48 + 84/2
});

test('computeSortCapsulePosition: 극초협폭·대형 글꼴에서 우측 4버튼과 겹치지 않게 클램프하고 이탈 8px 초과 시 꼬리점을 숨긴다', () => {
  // 우측 액션 시작이 창 기준 95px (도크 내부 84px)까지 밀려온 극한 상황
  // maxCx = 84 - 8 - 17 = 59px (targetCx 80px 대비 21px 이탈 > 8px)
  const pos = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: 91,
    actionsLeftClientX: 95,
    globalFontSizePt: 12,
    hasVisibleRows: true,
  });

  const dockInnerLeft = 11;
  const capsuleRightClientX = dockInnerLeft + pos.capsuleLeftPx + BULK_DOCK_METRICS.CAPSULE_WIDTH_PX;
  assert.ok(capsuleRightClientX <= 95 - BULK_DOCK_METRICS.ACTIONS_MIN_GAP_PX);
  assert.equal(pos.isClamped, true);
  assert.equal(pos.showNotch, false);
});

test('computeSortCapsulePosition: 비정상적으로 왼쪽에 치우친 값도 좌측 체크박스+핍 안전거리(minCx)로 보호한다', () => {
  const pos = computeSortCapsulePosition({
    dockLeft: 10,
    dockBorderLeft: 1,
    badgeCenterClientX: 25,
    actionsLeftClientX: 220,
    globalFontSizePt: 10,
    hasVisibleRows: true,
  });

  const minLeftPx = BULK_DOCK_METRICS.CHECK_LOCAL_LEFT_PX
    + BULK_DOCK_METRICS.CHECK_SIZE_PX
    + BULK_DOCK_METRICS.PIP_CLEARANCE_PX;
  assert.equal(pos.capsuleLeftPx, minLeftPx);
  assert.equal(pos.isClamped, true);
  assert.equal(pos.showNotch, false);
});

test('resolveBulkDockPalette: 15개 메모 테마 × 라이트/다크 30조합 모두 WCAG AA(≥4.5:1) 대비와 light-dark() 미사용을 보장한다', () => {
  assert.equal(TIDY_THEMES.length, 15);

  for (const theme of TIDY_THEMES) {
    for (const dark of [false, true]) {
      const p = resolveBulkDockPalette(theme.id, dark);
      const styleStr = bulkDockPaletteToStyle(p);

      // light-dark() 사용 금지 검증
      assert.equal(styleStr.includes('light-dark('), false, `${theme.id}/${dark}에 light-dark()가 포함됨`);

      // 강조 채움([마감]·체크·핍) 대비 ≥ 4.5:1
      const fillRatio = contrastRatio(p.accentFill, p.onAccent);
      assert.ok(
        fillRatio >= BULK_DOCK_METRICS.MIN_CONTRAST_RATIO,
        `${theme.id}/${dark} accentFill(${p.accentFill}) vs onAccent(${p.onAccent}) 대비 부족: ${fillRatio.toFixed(2)}`,
      );

      // 보조 버튼([아카이브]·[D-Day]) 텍스트 대비 ≥ 4.5:1
      const softRatio = contrastRatio(p.accentText, p.softBg);
      assert.ok(
        softRatio >= BULK_DOCK_METRICS.MIN_CONTRAST_RATIO,
        `${theme.id}/${dark} accentText(${p.accentText}) vs softBg(${p.softBg}) 대비 부족: ${softRatio.toFixed(2)}`,
      );

      // 페이퍼 군 라이트 모드는 따뜻한 크림(#fffdf7) 사용
      if (!dark && theme.group === 'paper') {
        assert.equal(p.pillBg, '#fffdf7', `${theme.id} 라이트 pillBg는 크림 톤이어야 함`);
      }
      if (dark) {
        assert.equal(p.onAccent, '#111827', `${theme.id} 다크 onAccent는 어두운 잉크여야 함`);
      }
    }
  }
});
