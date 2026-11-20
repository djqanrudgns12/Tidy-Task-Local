// 창 내 할 일 날짜 뱃지의 실제 폰트 피팅·3차 슬롯 폭 결과를 보관하는 반응형 스토어.
// TodoList의 숨김 측정 span과 BulkSelectDock의 정렬 캡슐 계산이 동일 슬롯 폭을 즉시 공유합니다.
import { TODO_BADGE_METRICS } from './todoBadgeMetrics.js';

/** @type {{ fontPx: number, slotPx: number, letterSpacingEm: number, stage: 1 | 2 | 3 }} */
export const todoBadgeFit = $state({
  fontPx: TODO_BADGE_METRICS.BASE_FONT_PX,
  slotPx: TODO_BADGE_METRICS.BASE_DATE_WIDTH_PX,
  letterSpacingEm: TODO_BADGE_METRICS.BASE_LETTER_SPACING_EM,
  stage: 1,
});

/**
 * 값이 실제로 달라졌을 때만 갱신해 불필요한 반응형 재측정 루프를 막습니다.
 * @param {{ fontPx: number, slotPx: number, letterSpacingEm: number, stage: 1 | 2 | 3 }} next
 */
export function setTodoBadgeFit(next) {
  if (
    todoBadgeFit.fontPx === next.fontPx &&
    todoBadgeFit.slotPx === next.slotPx &&
    todoBadgeFit.letterSpacingEm === next.letterSpacingEm &&
    todoBadgeFit.stage === next.stage
  ) {
    return;
  }
  todoBadgeFit.fontPx = next.fontPx;
  todoBadgeFit.slotPx = next.slotPx;
  todoBadgeFit.letterSpacingEm = next.letterSpacingEm;
  todoBadgeFit.stage = next.stage;
}
