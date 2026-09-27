/** 구(온도계 아래 동그라미)의 표정(PRD 10.4). 무드마다 5단계 + 영하.
 * 긍정: 꽁꽁 → 졸림 → 방긋 → 신남 → 별 눈 / 부정: 아주 차분 → 평온 → 머쓱 → 걱정 → 볼 빨개짐 → 부글부글 */

/** @param {'positive'|'negative'} mood @param {number} value @param {number} max
 * @returns {'frozen'|'sleepy'|'smile'|'excited'|'star'|'chill'|'calm'|'sheepish'|'worried'|'flushed'|'boiling'} */
export function faceOf(mood, value, max) {
  const ratio = value / Math.max(1, max);
  if (mood === 'positive') {
    if (value < 0) return 'frozen';
    if (ratio >= 1) return 'star';
    if (ratio >= 0.7) return 'excited';
    if (ratio >= 0.3) return 'smile';
    return 'sleepy';
  }
  if (value < 0) return 'chill';
  if (value === 0) return 'calm';
  if (ratio >= 1) return 'boiling';
  if (ratio >= 0.7) return 'flushed';
  if (ratio >= 0.3) return 'worried';
  return 'sheepish';
}
