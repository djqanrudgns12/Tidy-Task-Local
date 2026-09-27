/** 순위와 순위 배지(PRD 6.4).
 * 순위는 공동 순위(1·2·2·4, 표준 경기 순위 방식)입니다.
 * 배지는 "앞서 있는 소수"를 알려 주는 표시라서, 모두가 비슷할 때는 달지 않습니다:
 *  - 1~3위이면서 점수가 최저점보다 높은 카드만
 *  - 한 순위에 카드가 전체의 1/3(올림)보다 많이 몰리면 그 순위부터는 달지 않음 */

/** @param {number[]} scores @returns {number[]} 같은 자리의 순위(1부터) */
export function ranks(scores) {
  return scores.map((s) => 1 + scores.filter((o) => o > s).length);
}

/** @param {number[]} scores @returns {number[]} 0 = 배지 없음, 1·2·3 = 금·은·동 */
export function badges(scores) {
  const out = scores.map(() => 0);
  if (scores.length < 2) return out;
  const min = Math.min(...scores);
  const r = ranks(scores);
  const crowd = Math.max(1, Math.ceil(scores.length / 3));
  for (const level of [1, 2, 3]) {
    const members = r.flatMap((rank, i) => (rank === level && scores[i] > min ? [i] : []));
    if (members.length > crowd) break;
    for (const i of members) out[i] = level;
  }
  return out;
}

/** 1위가 바뀌었는지(새로 1위 배지를 받은 카드 id 목록).
 * @param {string[]} ids @param {number[]} before @param {number[]} after */
export function newLeaders(ids, before, after) {
  const was = new Set(ids.filter((_, i) => before[i] === 1));
  return ids.filter((id, i) => after[i] === 1 && !was.has(id));
}
