// ═══════════════════════════════════════════════════════════════════
// [다중 선택 일괄 동작 안내] 선택 막대의 [아카이브]·[D-Day]를 누른 뒤 보이는 짧은 안내 글을 정합니다.
//
// 왜 결과를 글로 알려 주는가: 일괄 동작은 고른 것 가운데 일부만 처리될 수 있습니다
//   (이미 D-Day인 할 일, 날짜를 고르지 않은 할 일). 아무 말 없이 일부만 바뀌면 "안 눌렸다"고 오해합니다.
// ═══════════════════════════════════════════════════════════════════

/**
 * [D-Day] 결과 안내.
 * @param {{ created: readonly unknown[], alreadyLinked: number, missingDate: number }} result
 * @returns {string}
 */
export function describeBulkDdayResult(result) {
  const made = result.created.length;
  /** @type {string[]} */
  const skipped = [];
  if (result.alreadyLinked > 0) skipped.push(`이미 D-Day ${result.alreadyLinked}개`);
  if (result.missingDate > 0) skipped.push(`날짜 없는 ${result.missingDate}개`);
  const tail = skipped.length ? ` (${skipped.join(' · ')} 제외)` : '';
  if (made > 0) return `D-Day ${made}개를 만들었어요${tail}`;
  if (result.alreadyLinked > 0 && result.missingDate === 0) return '고른 할 일은 이미 모두 D-Day예요';
  return `만든 D-Day가 없어요${tail}`;
}

/**
 * [아카이브] 결과 안내.
 * @param {number} count 보관한 할 일 수
 * @param {boolean} ok 보관함에 들어간 것을 확인했는지
 * @returns {string}
 */
export function describeArchiveResult(count, ok) {
  if (!ok) return '아카이브에 넣지 못했어요. 할 일은 그대로 두었어요';
  return `할 일 ${count}개를 아카이브에 보관했어요`;
}
