export const TINY_NOTE_DEFAULT_WIDTH = 250;
export const TINY_NOTE_DEFAULT_HEIGHT = 280;
export const TINY_NOTE_MIN_WIDTH = 160;
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
