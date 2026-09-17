export const SCALES = [0.85, 0.92, 1, 1.12, 1.25];
/** @param {number} w @param {number} h */
export function rawLayout(w, h) {
  if (w < 220 || h < 160) return "mini";
  if (w < 300) return "compact";
  if (w < 420) return "default";
  if (w < 640 || h < 360) return "wide";
  return "weekly";
}
/** @param {number} width @param {number} height @param {number} [scale] @param {string} [previous] */
export function pickLayout(width, height, scale = 1, previous = "") {
  const w = width / scale,
    h = height / scale,
    next = rawLayout(w, h);
  if (
    previous &&
    (rawLayout(w + 6, h + 6) === previous ||
      rawLayout(w - 6, h - 6) === previous)
  )
    return previous;
  return next;
}
