/** 추첨 결과 6대 런타임 불변식 검증기(Commit-Before-Animate 보안 관문).
 * 무대에 애니메이션을 시작하기 직전, 커밋될 분할 결과가 모든 수학적·교육적 계약을
 * 만족하는지 O(N + |E|) 시간에 단정 검증합니다. */

/**
 * @param {object} params
 * @param {{index:number, studentIds:string[]}[]} params.groups
 * @param {{id:string}[]} params.participants
 * @param {number[]} params.capacities
 * @param {Record<string, number>} [params.activePinned]
 * @param {[string, string][]} [params.activeApart]
 * @param {Map<number, string[]>} [params.lockedGroups] 부분 재추첨 시 잠긴 모둠의 기존 멤버
 * @returns {{ok:true} | {ok:false, code:string, reason:string}}
 */
export function verifyPartitionInvariant({
  groups,
  participants,
  capacities,
  activePinned = {},
  activeApart = [],
  lockedGroups = new Map(),
}) {
  if (!Array.isArray(groups) || !Array.isArray(capacities) || groups.length !== capacities.length) {
    return { ok: false, code: 'GROUP_COUNT_MISMATCH', reason: '모둠 수가 설정된 정원 배열과 일치하지 않아요.' };
  }

  const participantSet = new Set(participants.map((p) => p.id));
  const totalCap = capacities.reduce((sum, c) => sum + c, 0);
  if (totalCap !== participantSet.size) {
    return { ok: false, code: 'TOTAL_CAPACITY_MISMATCH', reason: '정원 총합이 참여 인원과 맞지 않아요.' };
  }

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, number>} */
  const groupOf = new Map();

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const cap = capacities[i];
    if (!Number.isInteger(cap) || cap < 1) {
      return { ok: false, code: 'INVALID_CAPACITY', reason: `${i + 1}모둠 정원이 1명 미만이에요.` };
    }
    if (!g || !Array.isArray(g.studentIds) || g.studentIds.length !== cap) {
      return { ok: false, code: 'GROUP_SIZE_MISMATCH', reason: `${i + 1}모둠 배정 인원이 정원(${cap}명)과 달라요.` };
    }

    // 불변식 ⑤ 잠긴 모둠의 구성원 불변 확인(순서는 정렬/보존 정책에 따라 집합 동일성 + 길이 확인)
    const lockedMembers = lockedGroups.get(i);
    if (lockedMembers) {
      if (lockedMembers.length !== g.studentIds.length) {
        return { ok: false, code: 'LOCKED_GROUP_MUTATED', reason: `${i + 1}모둠 잠금이 풀렸거나 인원이 달라졌어요.` };
      }
      const expectedSet = new Set(lockedMembers);
      if (g.studentIds.some((id) => !expectedSet.has(id))) {
        return { ok: false, code: 'LOCKED_GROUP_MUTATED', reason: `${i + 1}모둠 잠긴 명단이 훼손되었어요.` };
      }
    }

    for (const sid of g.studentIds) {
      // 불변식 ② 중복 0명 & ③ 결석/외부 ID 혼입 0명
      if (!participantSet.has(sid)) {
        return { ok: false, code: 'UNAUTHORIZED_PARTICIPANT', reason: '결석 또는 외부 학생 ID가 결과에 섞였어요.' };
      }
      if (seen.has(sid)) {
        return { ok: false, code: 'DUPLICATE_PARTICIPANT', reason: '한 학생이 두 모둠에 중복 배정되었어요.' };
      }
      seen.add(sid);
      groupOf.set(sid, i);
    }
  }

  // 불변식 ① 전원 포함
  if (seen.size !== participantSet.size) {
    return { ok: false, code: 'MISSING_PARTICIPANT', reason: '모든 참여 학생이 빠짐없이 배정되지 않았어요.' };
  }

  // 불변식 ⑥ 활성 pinned · apart 위반 0건
  for (const [sid, targetIdx] of Object.entries(activePinned)) {
    if (!participantSet.has(sid)) continue;
    if (groupOf.get(sid) !== targetIdx) {
      return { ok: false, code: 'PINNED_VIOLATION', reason: '사전 지정 모둠 규칙이 지켜지지 않았어요.' };
    }
  }

  for (const [a, b] of activeApart) {
    if (!participantSet.has(a) || !participantSet.has(b)) continue;
    if (groupOf.get(a) === groupOf.get(b)) {
      return { ok: false, code: 'APART_VIOLATION', reason: '같은 모둠 제외 규칙을 어긴 짝이 있어요.' };
    }
  }

  return { ok: true };
}
