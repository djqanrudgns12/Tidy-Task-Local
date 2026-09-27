/** 온도계 눈금과 좌표. 눈금 간격은 1·2·2.5·5 × 10의 거듭제곱 중 큰 눈금이 5~12개가 되는 값입니다(차트 눈금의 흔한 방식). */

/** maxMajor: 큰 눈금 간격 수의 상한. 관이 낮으면 화면이 높이에 맞춰 줄여 넘깁니다(숫자끼리 겹치지 않게).
 * @param {number} min @param {number} max @param {number} [maxMajor] @returns {{major:number[], minor:number[], step:number}} */
export function niceTicks(min, max, maxMajor = 12) {
  const limit = Math.max(1, Math.floor(maxMajor));
  const span = Math.max(1, max - min);
  let step = 1;
  const bases = [1, 2, 2.5, 5];
  outer: for (let exp = 0; exp < 6; exp++)
    for (const b of bases) {
      const s = b * 10 ** exp;
      // 2.5 간격은 정수 온도에서 어색하므로 정수로 떨어질 때(25·250…)만 씁니다(올림한 3 간격은 더 어색했습니다).
      if (!Number.isInteger(s)) continue;
      if (span / s <= limit) {
        step = s;
        break outer;
      }
    }
  const major = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) major.push(v);
  // 끝(최대)은 늘 보여 줍니다. 바로 아래 눈금과 너무 붙으면(간격의 절반 미만) 그 눈금을 빼서 숫자가 겹치지 않게 합니다.
  if (major[major.length - 1] !== max) {
    if (major.length > 1 && max - major[major.length - 1] < step / 2) major.pop();
    major.push(max);
  }
  const minorStep = step / 2;
  const minor = [];
  if (Number.isInteger(minorStep) && span / minorStep <= 40)
    for (let v = Math.ceil(min / minorStep) * minorStep; v < max; v += minorStep) if (!major.includes(v)) minor.push(v);
  return { major, minor, step };
}

/** 값 → 관 안의 y(위가 max). @param {number} value @param {number} min @param {number} max @param {number} top @param {number} bottom */
export function valueToY(value, min, max, top, bottom) {
  const ratio = (Math.max(min, Math.min(max, value)) - min) / Math.max(1, max - min);
  return bottom - ratio * (bottom - top);
}
