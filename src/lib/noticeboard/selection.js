import { formatCompactDate } from "./dates.js";
/** 기록 목록에서 여러 날짜를 고를 때의 규칙만 모았습니다(화면·저장소와 무관한 순수 함수). */

/** 항목 하나를 눌렀을 때의 새 선택 상태.
 *  Shift를 누르면 기준점(anchor)부터 지금 누른 곳까지를 한 번에 더합니다(풀지는 않습니다).
 *  왜 더하기만 하는가: 범위를 다시 훑다가 이미 고른 항목이 조용히 풀리면 지울 대상이 어긋납니다.
 * @param {string[]} selected 지금 고른 날짜들
 * @param {string[]} keys 화면에 보이는 순서대로의 날짜들
 * @param {string} key 누른 날짜
 * @param {{shift?: boolean, anchor?: string}} [options]
 * @returns {{selected: string[], anchor: string}}
 */
export function pickKey(selected, keys, key, { shift = false, anchor = "" } = {}) {
  if (shift && anchor && keys.includes(anchor) && keys.includes(key)) {
    const from = keys.indexOf(anchor),
      to = keys.indexOf(key);
    const range = keys.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { selected: [...new Set([...selected, ...range])], anchor };
  }
  return {
    selected: selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key],
    anchor: key,
  };
}
/** 화면에 보이는 항목이 모두 골라졌는지. @param {string[]} selected @param {string[]} keys */
export const allSelected = (selected, keys) =>
  keys.length > 0 && keys.every((k) => selected.includes(k));
/** 보이는 항목을 모두 고르거나 모두 풉니다.
 *  검색·기간으로 걸러져 보이지 않는 선택은 그대로 둡니다(모르는 사이에 지워지지 않게).
 * @param {string[]} selected @param {string[]} keys */
export const toggleAllKeys = (selected, keys) =>
  allSelected(selected, keys)
    ? selected.filter((k) => !keys.includes(k))
    : [...new Set([...selected, ...keys])];
/** 지우기 전 확인 문구에 넣을 날짜 요약. @param {string[]} keys @param {number} [max] */
export function describeKeys(keys, max = 6) {
  const names = keys.map(formatCompactDate);
  return names.length > max
    ? `${names.slice(0, max).join(", ")} 외 ${names.length - max}일`
    : names.join(", ");
}
