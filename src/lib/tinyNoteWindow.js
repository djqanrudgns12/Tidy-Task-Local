export const TINY_NOTE_DEFAULT_WIDTH = 250;
export const TINY_NOTE_DEFAULT_HEIGHT = 280;
// 헤더의 버튼이 잘리지 않는 물리적 하한입니다.
// 왜 160 -> 200 인가: 160px 에서는 어차피 버튼이 잘려 쓸 수 없었습니다.
//   200px 는 "좌측(72) + 창 제어 3종(69) + 도구 1개 + ... 버튼" 이 모두 들어가는 최소치이며,
//   스티커 메모다운 아담한 크기를 유지하는 선입니다. (docs/PRD-tiny-note-header.md 참고)
export const TINY_NOTE_MIN_WIDTH = 200;
export const TINY_NOTE_MIN_HEIGHT = 45;
export const TINY_NOTE_ROLLED_HEIGHT = 35;

function isUsableDimension(value, minimum) {
  return Number.isFinite(value) && value >= minimum;
}

export function resolveTinyNoteWidth(savedWidth, currentWidth) {
  if (isUsableDimension(savedWidth, TINY_NOTE_MIN_WIDTH)) return Math.round(savedWidth);
  if (isUsableDimension(currentWidth, TINY_NOTE_MIN_WIDTH)) return Math.round(currentWidth);
  return TINY_NOTE_DEFAULT_WIDTH;
}

export function resolveTinyNoteExpandedHeight(savedHeight, previousHeight, currentHeight) {
  // 정상 창 높이를 우선하고, 구버전 리사이즈 경합으로 35px가 저장된 경우에만
  // 롤업 직전 높이(previousHeight)를 복구 후보로 사용합니다.
  if (isUsableDimension(savedHeight, TINY_NOTE_MIN_HEIGHT)) return Math.round(savedHeight);
  if (isUsableDimension(previousHeight, TINY_NOTE_MIN_HEIGHT)) return Math.round(previousHeight);
  if (isUsableDimension(currentHeight, TINY_NOTE_MIN_HEIGHT)) return Math.round(currentHeight);
  return TINY_NOTE_DEFAULT_HEIGHT;
}

export function shouldPersistTinyNoteBounds({
  isFullscreen,
  isRolledUp,
  isTransitioning,
}) {
  return !isFullscreen && !isRolledUp && !isTransitioning;
}

/**
 * 저장된 Tiny Note 크기를 화면 작업영역 안으로 가둡니다.
 *
 * 왜 필요한가:
 *   더블클릭 경합(네이티브 최대화 + 전체화면 동시 실행) 때문에 "최대화된 크기"가
 *   정상 크기로 저장돼 버린 창이 있습니다. 그런 창은 다시 열 때마다 화면을 꽉 채운 채
 *   나타나서 "부자연스럽게 커지는" 증상이 계속됩니다.
 *   복원 직전에 한 번 가둬 주면 이미 오염된 저장값도 스스로 정상으로 돌아옵니다.
 *
 * @param {number} width  복원하려는 너비 (Logical)
 * @param {number} height 복원하려는 높이 (Logical)
 * @param {{ width?: number, height?: number }} workArea 작업 표시줄을 제외한 화면 크기
 */
export function clampTinyNoteSize(width, height, workArea = {}) {
  const areaWidth = workArea.width;
  const areaHeight = workArea.height;

  let nextWidth = Math.round(width);
  let nextHeight = Math.round(height);

  // 작업영역 값이 신뢰할 수 있을 때만 가둡니다 (값이 이상하면 원본을 그대로 둡니다).
  if (Number.isFinite(areaWidth) && areaWidth >= TINY_NOTE_MIN_WIDTH) {
    nextWidth = Math.min(nextWidth, Math.round(areaWidth));
  }
  if (Number.isFinite(areaHeight) && areaHeight >= TINY_NOTE_MIN_HEIGHT) {
    nextHeight = Math.min(nextHeight, Math.round(areaHeight));
  }

  return {
    width: Math.max(TINY_NOTE_MIN_WIDTH, nextWidth),
    height: Math.max(TINY_NOTE_MIN_HEIGHT, nextHeight),
  };
}
