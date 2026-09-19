/** @param {number} degrees @param {number} radius @param {number} [center] */
export function pointAt(degrees, radius, center = 150) {
  const angle = (degrees * Math.PI) / 180;
  return { x: center + Math.sin(angle) * radius, y: center - Math.cos(angle) * radius };
}
/** @param {number} fraction */
export function sectorPath(fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  if (f === 0) return '';
  if (f >= 1) return 'M150 35 A115 115 0 1 1 150 265 A115 115 0 1 1 150 35 Z';
  const p = pointAt(f * 360, 115);
  return `M150 150 L150 35 A115 115 0 ${f > 0.5 ? 1 : 0} 1 ${p.x} ${p.y} Z`;
}
/** @param {number} x @param {number} y */
export function pointerAngle(x, y) {
  return ((Math.atan2(x - 150, 150 - y) * 180) / Math.PI + 360) % 360;
}
/** @param {number} current @param {number} previousPointer @param {number} pointer */
export function advanceAngle(current, previousPointer, pointer) {
  const delta = ((pointer - previousPointer + 540) % 360) - 180;
  return Math.max(0, Math.min(360, current + delta));
}
// Curved glass width is 82 - 75t². Invert its analytic area for true sand volume.
/** @param {number} fraction @param {number} [height] */
export function sandHeights(fraction, height = 108) {
  const f = Math.max(0, Math.min(1, fraction));
  /** @param {number} amount @param {(v:number)=>number} area */
  function invert(amount, area) {
    if (amount <= 0) return 0;
    if (amount >= 1) return height;
    let low = 0,
      high = 1;
    for (let i = 0; i < 32; i++) {
      const middle = (low + high) / 2;
      if (area(middle) < amount) low = middle;
      else high = middle;
    }
    return ((low + high) / 2) * height;
  }
  return {
    upper: invert(f, (v) => (7 * v + 75 * v * v - 25 * v * v * v) / 57),
    lower: invert(1 - f, (v) => (82 * v - 25 * v * v * v) / 57),
  };
}
