/**
 * Tiny Note 헤더의 "우선순위 기반 자동 접기" 계산기.
 *
 * 왜 순수 함수로 분리했는가:
 *   DOM 측정과 계산이 한 덩어리로 섞여 있으면 눈으로 보기 전엔 검증할 수 없습니다.
 *   폭 계산만 떼어내면 단위 테스트로 경계값(딱 맞는 폭, 1px 모자란 폭 등)을
 *   전부 확인할 수 있어, 창 크기를 바꿔가며 손으로 확인할 필요가 없습니다.
 *
 * 왜 버튼 폭을 상수로 두는가:
 *   버튼은 아이콘만 담고 CSS로 22x22px 고정이라 폰트 설정과 무관합니다.
 *   따라서 "측정 → 재렌더" 같은 2단계 레이아웃 없이 한 번에 정확히 계산됩니다.
 *   (DPI 배율은 CSS 픽셀 기준이므로 이 계산에 영향을 주지 않습니다.)
 */

/** 도구 버튼 한 개의 폭 (p-1 4px x 2 + 아이콘 12px + 여백 2px) */
export const HEADER_TOOL_WIDTH = 22;

/** `⋯` 오버플로우 버튼의 폭 */
export const HEADER_OVERFLOW_WIDTH = 22;

/** 창 제어 3종(최소화·전체화면·닫기)이 차지하는 폭 — 절대 접히지 않습니다. */
export const HEADER_CONTROLS_WIDTH = 69;

/** 좌측 고정 영역(아카이브 버튼 + 간격 + 제목 최소폭)이 차지하는 폭 */
export const HEADER_LEADING_WIDTH = 72;

/**
 * 헤더에 펼쳐서 보여줄 도구 버튼의 개수를 구합니다.
 *
 * @param {object} params
 * @param {number} params.availableWidth 도구가 쓸 수 있는 남은 폭(px)
 * @param {number} params.toolCount 접기 대상 도구의 전체 개수
 * @param {number} [params.toolWidth] 도구 버튼 한 개의 폭
 * @param {number} [params.overflowWidth] `⋯` 버튼의 폭
 * @returns {number} 펼칠 개수 (0 이상 toolCount 이하)
 */
export function resolveVisibleToolCount({
  availableWidth,
  toolCount,
  toolWidth = HEADER_TOOL_WIDTH,
  overflowWidth = HEADER_OVERFLOW_WIDTH,
}) {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(toolCount)) return 0;
  if (toolCount <= 0 || toolWidth <= 0) return 0;
  if (availableWidth <= 0) return 0;

  // 전부 들어가면 `⋯` 버튼 자체가 필요 없으므로 그 자리를 뺄 이유도 없습니다.
  if (availableWidth >= toolCount * toolWidth) return toolCount;

  // 하나라도 접힌다면 `⋯` 버튼이 등장하므로 그만큼 자리를 먼저 확보합니다.
  const usable = availableWidth - overflowWidth;
  if (usable < toolWidth) return 0;

  // 전부 들어가지 못하는 상황이므로 최대치는 toolCount - 1 입니다.
  return Math.min(toolCount - 1, Math.floor(usable / toolWidth));
}

/**
 * 헤더 전체 폭에서 "도구가 쓸 수 있는 남은 폭"을 구합니다.
 *
 * @param {number} headerWidth 헤더의 내부 폭(패딩 제외, contentRect 기준)
 * @param {object} [options]
 * @param {number} [options.leadingWidth] 좌측 고정 영역 폭
 * @param {number} [options.controlsWidth] 창 제어 3종 폭
 */
export function resolveAvailableToolWidth(headerWidth, options = {}) {
  const {
    leadingWidth = HEADER_LEADING_WIDTH,
    controlsWidth = HEADER_CONTROLS_WIDTH,
  } = options;

  if (!Number.isFinite(headerWidth)) return 0;
  return Math.max(0, headerWidth - leadingWidth - controlsWidth);
}
