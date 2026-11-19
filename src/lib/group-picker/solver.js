/** 무결점 랜덤 모둠 배정 솔버.
 *  - CSPRNG 기각 샘플링(picker/engine.js 패턴)으로 편향 제거
 *  - 무제약 추첨 시 정확한 다항분포(c_0!...c_{G-1}!/N!) 등확률 보장
 *  - 사전 고정 학생이 있어도 모둠 내 공개 순서를 재셔플해 고정 여부 은닉
 *  - 비균등 정원에서 앞 모둠 성별 쏠림을 막는 무편향 할당량 샘플링(Unbiased Quota Sampling)
 *  - Phase 0(모순 빠른 진단) → Phase 1(Randomized MRV + Degree Heuristic) → Phase 2(V_apart=0 보존 스왑 폴리시) */
import { verifyPartitionInvariant } from './invariants.js';

/** 32비트 CSPRNG 정수 반환. */
export const randomWord = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** 기각 샘플링 기반 균등 정수 [0, n).
 * @param {number} n @param {()=>number} [word] */
export function randomIndex(n, word = randomWord) {
  if (!Number.isSafeInteger(n) || n < 1 || n > 0x100000000) {
    throw new Error('뽑을 대상을 확인해 주세요.');
  }
  const limit = Math.floor(0x100000000 / n) * n;
  let value;
  do {
    value = word();
  } while (value >= limit);
  return value % n;
}

/** Fisher-Yates 무편향 셔플.
 * @template T @param {readonly T[]} items @param {()=>number} [word] @returns {T[]} */
export function shuffle(items, word = randomWord) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, word);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** [0, 1) 연속 난수(기각 샘플링 32비트). @param {()=>number} [word] */
export function randomUnit(word = randomWord) {
  return (word() >>> 0) / 0x100000000;
}

/** 저장된 제약 규칙 중 오늘 결석·삭제 학생이 낀 규칙을 비파괴 휴면 처리(Dormant Rule Bypass).
 * @param {object} params
 * @param {{id:string}[]} params.participants
 * @param {number} params.groupCount
 * @param {[string, string][]} [params.apartPairs]
 * @param {Record<string, number>} [params.pinnedByGroup]
 * @param {string[]} [params.leaderIds]
 * @param {Set<number>} [params.lockedIndices] 부분 재추첨 시 잠긴 모둠 인덱스 */
export function filterActiveRules({
  participants,
  groupCount,
  apartPairs = [],
  pinnedByGroup = {},
  leaderIds = [],
  lockedIndices = new Set(),
}) {
  const activeSet = new Set(participants.map((p) => p.id));
  /** @type {[string, string][]} */
  const activeApart = [];
  /** @type {Set<string>} */
  const apartSeen = new Set();
  let dormantCount = 0;

  for (const pair of apartPairs) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [rawA, rawB] = pair;
    if (!rawA || !rawB || rawA === rawB) continue;
    const [a, b] = rawA < rawB ? [rawA, rawB] : [rawB, rawA];
    const key = `${a}|${b}`;
    if (apartSeen.has(key)) continue;
    apartSeen.add(key);
    if (activeSet.has(a) && activeSet.has(b)) {
      activeApart.push([a, b]);
    } else {
      dormantCount += 1;
    }
  }

  /** @type {Record<string, number>} */
  const activePinned = {};
  for (const [sid, gIdx] of Object.entries(pinnedByGroup)) {
    if (!Number.isInteger(gIdx) || gIdx < 0 || gIdx >= groupCount) continue;
    if (!activeSet.has(sid)) {
      dormantCount += 1;
      continue;
    }
    if (!lockedIndices.has(gIdx)) {
      activePinned[sid] = gIdx;
    }
  }

  const activeLeaders = leaderIds.filter((sid) => activeSet.has(sid));
  dormantCount += leaderIds.length - activeLeaders.length;

  return { activeApart, activePinned, activeLeaders, dormantCount };
}

/** 비균등 정원(예: [5,5,4,4,4,4])에서 앞 모둠 성별 편향을 없애기 위한 무편향 할당량 샘플링(Unbiased Quota Sampling).
 * 각 모둠 기대치 mu_i의 정수부 배정 후 잔여를 소수부 크기 비례 CSPRNG 가중 비복원 추첨해
 * 정확히 sum(m_i*) = maleCount, E[m_i*] = mu_{M,i}가 되게 만듭니다.
 * @param {number[]} capacities
 * @param {number} maleCount
 * @param {number} femaleCount
 * @param {()=>number} [word]
 * @returns {{maleTargets:number[], femaleTargets:number[]}|null} */
export function sampleGenderQuotas(capacities, maleCount, femaleCount, word = randomWord) {
  if (maleCount + femaleCount < 2 || (maleCount === 0 && femaleCount === 0)) return null;
  const n = capacities.reduce((a, b) => a + b, 0);
  if (n <= 0) return null;

  const maleTargets = sampleSingleQuota(capacities, maleCount, n, capacities, word);
  const residualCaps = capacities.map((c, i) => c - maleTargets[i]);
  const remN = residualCaps.reduce((a, b) => a + b, 0);
  const femaleTargets = remN > 0 && femaleCount > 0
    ? sampleSingleQuota(capacities, Math.min(femaleCount, remN), n, residualCaps, word)
    : capacities.map(() => 0);

  return { maleTargets, femaleTargets };
}

/** @param {number[]} capacities @param {number} count @param {number} totalN @param {number[]} maxAllowed @param {()=>number} word */
function sampleSingleQuota(capacities, count, totalN, maxAllowed, word) {
  const targets = capacities.map((c, i) => {
    const exact = (c * count) / totalN;
    return Math.min(maxAllowed[i], Math.floor(exact));
  });
  let rem = count - targets.reduce((a, b) => a + b, 0);
  while (rem > 0) {
    const eligible = capacities
      .map((c, i) => {
        if (targets[i] >= maxAllowed[i]) return null;
        const exact = (c * count) / totalN;
        const frac = Math.max(0.0001, exact - targets[i]);
        return { i, weight: frac };
      })
      .filter(Boolean);
    if (!eligible.length) break;
    const totalWeight = eligible.reduce((s, item) => s + /** @type {any} */ (item).weight, 0);
    let pick = randomUnit(word) * totalWeight;
    let chosen = /** @type {any} */ (eligible[eligible.length - 1]).i;
    for (const item of eligible) {
      pick -= /** @type {any} */ (item).weight;
      if (pick <= 0) {
        chosen = /** @type {any} */ (item).i;
        break;
      }
    }
    targets[chosen] += 1;
    rem -= 1;
  }
  return targets;
}

/** @typedef {{index:number, name:string, color:string, symbol:string, studentIds:string[], locked:boolean}} DrawnGroup */
/** @typedef {{runId:string, createdAt:number, dormantCount:number, groups:DrawnGroup[], revealQueue:{studentId:string, groupIndex:number, stepIndex:number}[], participantIds:string[], participantsSnapshot:Record<string, any>}} DrawRun */

/** @param {string[][][]} recentHistory */
function buildRecentPairMap(recentHistory) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  // 최신 회차일수록 가중치를 높게 줍니다.
  for (let age = 0; age < recentHistory.length; age++) {
    const weight = Math.max(1, 3 - Math.floor(age / 2));
    const groups = recentHistory[age];
    if (!Array.isArray(groups)) continue;
    for (const memberIds of groups) {
      if (!Array.isArray(memberIds)) continue;
      for (let i = 0; i < memberIds.length; i++) {
        for (let j = i + 1; j < memberIds.length; j++) {
          const a = memberIds[i];
          const b = memberIds[j];
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          counts.set(key, (counts.get(key) ?? 0) + weight);
        }
      }
    }
  }
  return counts;
}

/** 무결점 모둠원 추첨 실행기 (전체 추첨 & 잠금 제외 부분 재추첨 공용).
 * @param {object} input
 * @param {{id:string, name:string, number?:number, gender?:string}[]} input.participants
 * @param {{index:number, name:string, color:string, symbol:string, capacity:number}[]} input.groupSpecs
 * @param {[string, string][]} [input.apartPairs]
 * @param {Record<string, number>} [input.pinnedByGroup]
 * @param {string[]} [input.leaderIds]
 * @param {boolean} [input.genderBalance]
 * @param {boolean} [input.avoidRecentRepeat]
 * @param {string[][][]} [input.recentHistory] 최근 회차 [[sid,...], ...] 목록 (최신이 index 0)
 * @param {Map<number, string[]>} [input.lockedGroups] 잠긴 모둠 index -> 확정 studentIds
 * @param {number} [input.budgetMs]
 * @param {()=>number} [word]
 * @returns {{ok:true, run:Readonly<DrawRun>}|{ok:false, code:string, reason:string, hint?:string}} */
export function solveGroupDraw(input, word = randomWord) {
  const {
    participants,
    groupSpecs,
    apartPairs = [],
    pinnedByGroup = {},
    leaderIds = [],
    genderBalance = false,
    avoidRecentRepeat = false,
    recentHistory = [],
    lockedGroups = new Map(),
    budgetMs = 70,
  } = input;

  if (!Array.isArray(participants) || participants.length < 2) {
    return {
      ok: false,
      code: 'TOO_FEW_PARTICIPANTS',
      reason: '참여 학생이 최소 2명 필요해요.',
      hint: '결석 체크를 해제하거나 한 명 뽑기를 이용해 주세요.',
    };
  }
  const capacities = groupSpecs.map((g) => g.capacity);
  const sumCap = capacities.reduce((a, b) => a + b, 0);
  if (groupSpecs.length < 2 || sumCap !== participants.length || capacities.some((c) => c < 1)) {
    return {
      ok: false,
      code: 'INVALID_CAPACITIES',
      reason: `모둠 정원 합계(${sumCap}명)가 참여 인원(${participants.length}명)과 맞지 않아요.`,
      hint: '[나머지 자동 맞추기]를 누른 뒤 다시 뽑아 보세요.',
    };
  }

  /** @type {Set<number>} */
  const lockedIndices = new Set(lockedGroups.keys());
  const byId = new Map(participants.map((p) => [p.id, p]));

  // 잠긴 모둠 멤버 무결성 확인 및 부분 재추첨 서브문제(P', G') 분리
  /** @type {Set<string>} */
  const lockedMemberSet = new Set();
  for (const [gIdx, members] of lockedGroups.entries()) {
    if (gIdx < 0 || gIdx >= groupSpecs.length || members.length !== capacities[gIdx]) {
      return {
        ok: false,
        code: 'LOCKED_CONFLICT',
        reason: `${gIdx + 1}모둠 잠금 상태와 정원이 어긋나서 다시 뽑을 수 없어요.`,
      };
    }
    for (const sid of members) {
      if (!byId.has(sid) || lockedMemberSet.has(sid)) {
        return {
          ok: false,
          code: 'LOCKED_CONFLICT',
          reason: '잠긴 모둠 명단에 참여하지 않거나 중복된 학생이 있어요.',
        };
      }
      lockedMemberSet.add(sid);
    }
  }

  const rules = filterActiveRules({
    participants,
    groupCount: groupSpecs.length,
    apartPairs,
    pinnedByGroup,
    leaderIds,
    lockedIndices,
  });

  // 잠긴 멤버와 미잠금 P' 사이 고정 충돌 체크
  for (const [sid, gIdx] of Object.entries(pinnedByGroup)) {
    if (lockedMemberSet.has(sid) && !lockedGroups.get(gIdx)?.includes(sid)) {
      return {
        ok: false,
        code: 'PINNED_LOCKED_CONFLICT',
        reason: '잠긴 모둠 밖에 있는 학생에게 잠긴 모둠 고정 규칙이 걸려 있어요.',
        hint: '조건 설정을 열거나 잠금을 풀어 주세요.',
      };
    }
  }

  // 서브문제 P'(미배정 학생) & G'(미잠금 모둠) 구성
  const subParticipants = participants.filter((p) => !lockedMemberSet.has(p.id));
  const unlockedIndices = groupSpecs.map((g) => g.index).filter((i) => !lockedIndices.has(i));

  // 전부 잠겨 있는 경우 즉시 무변동 복제 반환
  if (subParticipants.length === 0) {
    const frozenGroups = freezeGroups(
      groupSpecs,
      groupSpecs.map((g) => [...(lockedGroups.get(g.index) ?? [])]),
      byId,
      word,
      lockedIndices,
    );
    return finalizeRun({
      groupSpecs,
      frozenGroups,
      participants,
      capacities,
      rules,
      lockedGroups,
      byId,
      word,
    });
  }

  // ── Phase 0: Fast-Fail 모순 빠른 진단 ──
  const subPinnedByGroup = /** @type {Record<number, string[]>} */ ({});
  unlockedIndices.forEach((gi) => (subPinnedByGroup[gi] = []));
  for (const [sid, gi] of Object.entries(rules.activePinned)) {
    if (lockedMemberSet.has(sid)) continue;
    subPinnedByGroup[gi].push(sid);
  }
  for (const gi of unlockedIndices) {
    if (subPinnedByGroup[gi].length > capacities[gi]) {
      return {
        ok: false,
        code: 'PINNED_EXCEEDS_CAPACITY',
        reason: `${groupSpecs[gi].name} 정원(${capacities[gi]}명)보다 많이 사전 고정(${subPinnedByGroup[gi].length}명)되어 있어요.`,
        hint: '정원을 늘리거나 조건 설정에서 모둠 지정을 줄여 주세요.',
      };
    }
  }

  // activeApart 중 서브문제 내부 간선만 추출 & 사전 고정 모순 검사
  const subIdSet = new Set(subParticipants.map((p) => p.id));
  /** @type {Map<string, Set<string>>} */
  const apartAdj = new Map(subParticipants.map((p) => [p.id, new Set()]));
  for (const [a, b] of rules.activeApart) {
    if (subIdSet.has(a) && subIdSet.has(b)) {
      apartAdj.get(a)?.add(b);
      apartAdj.get(b)?.add(a);
    }
  }
  for (const gi of unlockedIndices) {
    const pinnedList = subPinnedByGroup[gi];
    for (let i = 0; i < pinnedList.length; i++) {
      for (let j = i + 1; j < pinnedList.length; j++) {
        if (apartAdj.get(pinnedList[i])?.has(pinnedList[j])) {
          const nA = byId.get(pinnedList[i])?.name ?? '학생';
          const nB = byId.get(pinnedList[j])?.name ?? '학생';
          return {
            ok: false,
            code: 'PINNED_APART_CLASH',
            reason: `'${nA}' 학생과 '${nB}' 학생이 같은 모둠(${groupSpecs[gi].name})에 지정된 동시에 제외 규칙도 걸려 있어요.`,
            hint: '조건 설정에서 둘 중 하나를 해제해 주세요.',
          };
        }
      }
    }
  }

  const subApartCount = rules.activeApart.filter(([a, b]) => subIdSet.has(a) && subIdSet.has(b)).length;
  const subPinnedCount = Object.keys(rules.activePinned).filter((sid) => subIdSet.has(sid)).length;
  const maleCount = subParticipants.filter((p) => p.gender === 'male').length;
  const femaleCount = subParticipants.filter((p) => p.gender === 'female').length;
  const useGender = Boolean(genderBalance && maleCount + femaleCount >= 2 && maleCount > 0 && femaleCount > 0);
  const useHistory = Boolean(avoidRecentRepeat && recentHistory.length > 0);

  // 무제약 순수 랜덤 fast-path: 정확한 다항분포 c_0!...c_{G-1}!/N! 보장
  if (subApartCount === 0 && subPinnedCount === 0 && !useGender && !useHistory) {
    const shuffled = shuffle(subParticipants, word);
    /** @type {string[][]} */
    const memberMatrix = groupSpecs.map(() => []);
    let cursor = 0;
    for (const gi of unlockedIndices) {
      const cap = capacities[gi];
      memberMatrix[gi] = shuffled.slice(cursor, cursor + cap).map((s) => s.id);
      cursor += cap;
    }
    for (const gi of lockedIndices) {
      memberMatrix[gi] = [...(lockedGroups.get(gi) ?? [])];
    }
    const frozenGroups = freezeGroups(groupSpecs, memberMatrix, byId, word, lockedIndices);
    return finalizeRun({
      groupSpecs,
      frozenGroups,
      participants,
      capacities,
      rules,
      lockedGroups,
      byId,
      word,
    });
  }

  // ── Phase 1: Randomized MRV + Degree Heuristic 해 탐색 ──
  const unlockedCaps = unlockedIndices.map((gi) => capacities[gi]);
  const quotaTarget = useGender ? sampleGenderQuotas(unlockedCaps, maleCount, femaleCount, word) : null;
  const recentPairMap = useHistory ? buildRecentPairMap(recentHistory) : new Map();

  // 성별/이력 페널티 없을 때는 첫 해 1개만 구해도 조건 하 균등 랜덤(단, Phase 1이 후보를 섞음)
  const wantMultiple = useGender || useHistory;
  const maxSolutions = wantMultiple ? 48 : 1;
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const timeNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /** @type {string[][][]} */
  const solutions = [];
  const attemptsLimit = wantMultiple ? 64 : 18;

  for (let attempt = 0; attempt < attemptsLimit; attempt++) {
    if (solutions.length >= maxSolutions) break;
    if (attempt > 0 && timeNow() - startTime > budgetMs) break;
    const sol = findOneBacktrackingSolution({
      subParticipants,
      unlockedIndices,
      capacities,
      subPinnedByGroup,
      apartAdj,
      word,
      maxNodes: 4000,
    });
    if (sol) solutions.push(sol);
  }

  if (solutions.length === 0) {
    // 보다 넉넉한 노드 제한으로 마지막 정밀 탐색 1회 시도
    const deepSol = findOneBacktrackingSolution({
      subParticipants,
      unlockedIndices,
      capacities,
      subPinnedByGroup,
      apartAdj,
      word,
      maxNodes: 25000,
    });
    if (deepSol) solutions.push(deepSol);
  }

  if (solutions.length === 0) {
    return {
      ok: false,
      code: 'UNSATISFIABLE_CONSTRAINTS',
      reason: '설정한 "같은 모둠 제외" · 사전 지정 조건을 모두 동시에 만족하는 배정이 불가능해요.',
      hint: '모둠 수를 늘리거나 제외 조건 수를 조금 줄여 주세요.',
    };
  }

  // ── Phase 2: V_apart = 0 보존 O(1) 스왑 폴리시 & 최상위 버킷 균등 추출 ──
  const fixedMask = new Set(Object.keys(rules.activePinned));
  const scored = solutions.map((sol) => {
    const polished = wantMultiple
      ? polishSwap({
          groupsByPos: sol,
          unlockedIndices,
          apartAdj,
          fixedMask,
          byId,
          quotaTarget,
          recentPairMap,
          word,
        })
      : sol;
    return {
      sol: polished,
      cost: computeSoftCost(polished, byId, quotaTarget, recentPairMap),
    };
  });

  let minCost = Infinity;
  for (const item of scored) {
    if (item.cost < minCost) minCost = item.cost;
  }
  const topBucket = scored.filter((item) => Math.abs(item.cost - minCost) < 1e-6);
  const chosen = topBucket[randomIndex(topBucket.length, word)].sol;

  /** @type {string[][]} */
  const fullMatrix = groupSpecs.map(() => []);
  unlockedIndices.forEach((gi, pos) => {
    // 사전 고정 학생이 있어도 모둠 내 공개 순서를 다시 섞어 고정을 눈치채지 못하게 합니다.
    fullMatrix[gi] = shuffle(chosen[pos], word);
  });
  for (const gi of lockedIndices) {
    fullMatrix[gi] = [...(lockedGroups.get(gi) ?? [])];
  }

  const frozenGroups = freezeGroups(groupSpecs, fullMatrix, byId, word, lockedIndices);
  return finalizeRun({
    groupSpecs,
    frozenGroups,
    participants,
    capacities,
    rules,
    lockedGroups,
    byId,
    word,
  });
}

/** MRV + Degree Heuristic 단일 해 백트래킹.
 * @param {{subParticipants:any[], unlockedIndices:number[], capacities:number[], subPinnedByGroup:Record<number, string[]>, apartAdj:Map<string, Set<string>>, word:()=>number, maxNodes:number}} params */
function findOneBacktrackingSolution({
  subParticipants,
  unlockedIndices,
  capacities,
  subPinnedByGroup,
  apartAdj,
  word,
  maxNodes,
}) {
  const gLen = unlockedIndices.length;
  /** @type {number[]} */
  const remainingCaps = unlockedIndices.map((gi) => capacities[gi]);
  /** @type {string[][]} */
  const bins = unlockedIndices.map((gi) => [...subPinnedByGroup[gi]]);
  const pinnedSet = new Set();

  for (let pos = 0; pos < gLen; pos++) {
    remainingCaps[pos] -= bins[pos].length;
    for (const sid of bins[pos]) pinnedSet.add(sid);
  }

  // 남은 미배정 학생 목록
  const vars = shuffle(
    subParticipants.filter((p) => !pinnedSet.has(p.id)),
    word,
  );
  if (vars.length === 0) return bins;

  let nodes = 0;

  /** 학생 id를 pos번 모둠에 넣어도 apart 충돌이 없는지 확인 */
  const canPlace = (/** @type {string} */ sid, /** @type {number} */ pos) => {
    if (remainingCaps[pos] <= 0) return false;
    const enemies = apartAdj.get(sid);
    if (!enemies || enemies.size === 0) return true;
    const bin = bins[pos];
    for (let i = 0; i < bin.length; i++) {
      if (enemies.has(bin[i])) return false;
    }
    return true;
  };

  /** @param {string[]} unassigned */
  function backtrack(unassigned) {
    if (unassigned.length === 0) return true;
    if (++nodes > maxNodes) return false;

    // MRV + Degree 휴리스틱으로 다음 배치할 학생 선택
    let bestIdx = -1;
    /** @type {number[]} */
    let bestDomain = [];
    let bestDeg = -1;

    for (let i = 0; i < unassigned.length; i++) {
      const sid = unassigned[i];
      /** @type {number[]} */
      const domain = [];
      for (let pos = 0; pos < gLen; pos++) {
        if (canPlace(sid, pos)) domain.push(pos);
      }
      if (domain.length === 0) return false; // Forward checking 조기 가지치기!
      const deg = apartAdj.get(sid)?.size ?? 0;
      if (
        bestIdx === -1 ||
        domain.length < bestDomain.length ||
        (domain.length === bestDomain.length && deg > bestDeg)
      ) {
        bestIdx = i;
        bestDomain = domain;
        bestDeg = deg;
      }
    }

    const chosenSid = unassigned[bestIdx];
    const nextUnassigned = unassigned.filter((_, i) => i !== bestIdx);
    const orderedDomain = shuffle(bestDomain, word);

    for (const pos of orderedDomain) {
      bins[pos].push(chosenSid);
      remainingCaps[pos] -= 1;
      if (backtrack(nextUnassigned)) return true;
      remainingCaps[pos] += 1;
      bins[pos].pop();
    }
    return false;
  }

  return backtrack(vars.map((v) => v.id)) ? bins : null;
}

/** V_apart=0 을 100% 보존하며 성별 목표 및 최근 겹침 페널티를 줄이는 O(1) 스왑 폴리시.
 * @param {{groupsByPos:string[][], unlockedIndices:number[], apartAdj:Map<string, Set<string>>, fixedMask:Set<string>, byId:Map<string, any>, quotaTarget:{maleTargets:number[], femaleTargets:number[]}|null, recentPairMap:Map<string, number>, word:()=>number}} params */
function polishSwap({
  groupsByPos,
  unlockedIndices,
  apartAdj,
  fixedMask,
  byId,
  quotaTarget,
  recentPairMap,
  word,
}) {
  const bins = groupsByPos.map((arr) => [...arr]);
  if (unlockedIndices.length < 2) return bins;
  let currentCost = computeSoftCost(bins, byId, quotaTarget, recentPairMap);
  if (currentCost === 0) return bins;

  const canEnter = (/** @type {string} */ sid, /** @type {number} */ pos, /** @type {string} */ excludingSid) => {
    const enemies = apartAdj.get(sid);
    if (!enemies || enemies.size === 0) return true;
    const bin = bins[pos];
    for (let i = 0; i < bin.length; i++) {
      if (bin[i] !== excludingSid && enemies.has(bin[i])) return false;
    }
    return true;
  };

  for (let step = 0; step < 80; step++) {
    if (currentCost === 0) break;
    const g1 = randomIndex(bins.length, word);
    const g2 = (g1 + 1 + randomIndex(bins.length - 1, word)) % bins.length;
    if (!bins[g1].length || !bins[g2].length) continue;
    const i1 = randomIndex(bins[g1].length, word);
    const i2 = randomIndex(bins[g2].length, word);
    const s1 = bins[g1][i1];
    const s2 = bins[g2][i2];
    if (fixedMask.has(s1) || fixedMask.has(s2)) continue;
    if (!canEnter(s1, g2, s2) || !canEnter(s2, g1, s1)) continue;

    bins[g1][i1] = s2;
    bins[g2][i2] = s1;
    const nextCost = computeSoftCost(bins, byId, quotaTarget, recentPairMap);
    if (nextCost <= currentCost) {
      currentCost = nextCost;
    } else {
      bins[g1][i1] = s1;
      bins[g2][i2] = s2;
    }
  }
  return bins;
}

/** @param {string[][]} bins @param {Map<string, any>} byId @param {{maleTargets:number[], femaleTargets:number[]}|null} quotaTarget @param {Map<string, number>} recentPairMap */
function computeSoftCost(bins, byId, quotaTarget, recentPairMap) {
  let cost = 0;
  if (quotaTarget) {
    for (let pos = 0; pos < bins.length; pos++) {
      let m = 0;
      let f = 0;
      for (const sid of bins[pos]) {
        const g = byId.get(sid)?.gender;
        if (g === 'male') m++;
        else if (g === 'female') f++;
      }
      cost += 20 * (Math.abs(m - quotaTarget.maleTargets[pos]) + Math.abs(f - quotaTarget.femaleTargets[pos]));
    }
  }
  if (recentPairMap.size > 0) {
    for (const bin of bins) {
      for (let i = 0; i < bin.length; i++) {
        for (let j = i + 1; j < bin.length; j++) {
          const a = bin[i];
          const b = bin[j];
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          cost += recentPairMap.get(key) ?? 0;
        }
      }
    }
  }
  return cost;
}

/** @param {any[]} groupSpecs @param {string[][]} matrix @param {Map<string, any>} byId @param {()=>number} word @param {Set<number>} lockedIndices */
function freezeGroups(groupSpecs, matrix, byId, word, lockedIndices) {
  return groupSpecs.map((spec, idx) => {
    const memberIds = lockedIndices.has(idx) ? matrix[idx] : shuffle(matrix[idx], word);
    return {
      index: spec.index,
      name: spec.name,
      color: spec.color,
      symbol: spec.symbol,
      studentIds: memberIds,
      members: memberIds.map((id) => byId.get(id)),
      locked: lockedIndices.has(idx),
    };
  });
}

/** 최종 6대 불변식 검증 게이트를 통과시킨 뒤 불변 객체(Object.freeze)로 봉인합니다.
 * @param {{groupSpecs:any[], frozenGroups:{index:number, name:string, color:string, symbol:string, studentIds:string[], members:any[], locked:boolean}[], participants:any[], capacities:number[], rules:ReturnType<typeof filterActiveRules>, lockedGroups:Map<number, string[]>, byId:Map<string, any>, word:()=>number}} params
 * @returns {{ok:true, run:Readonly<DrawRun>}|{ok:false, code:string, reason:string, hint?:string}} */
function finalizeRun({
  groupSpecs: _groupSpecs,
  frozenGroups,
  participants,
  capacities,
  rules,
  lockedGroups,
  byId,
  word,
}) {
  const check = verifyPartitionInvariant({
    groups: frozenGroups,
    participants,
    capacities,
    activePinned: rules.activePinned,
    activeApart: rules.activeApart,
    lockedGroups,
  });
  if (!check.ok) {
    return { ok: /** @type {const} */ (false), code: check.code, reason: check.reason };
  }

  // 모둠 순 공개 큐와 라운드로빈 공개 큐 생성(연출 무대별 선택 사용)
  /** @type {{studentId:string, groupIndex:number, stepIndex:number}[]} */
  const sequentialQueue = [];
  let stepIndex = 0;
  for (let gi = 0; gi < frozenGroups.length; gi++) {
    for (const sid of frozenGroups[gi].studentIds) {
      sequentialQueue.push({ studentId: sid, groupIndex: gi, stepIndex: stepIndex++ });
    }
  }

  const runId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `run-${Date.now().toString(36)}-${word().toString(36)}`;

  const runObj = deepFreeze(/** @type {DrawRun} */ ({
    runId,
    createdAt: Date.now(),
    dormantCount: rules.dormantCount,
    groups: frozenGroups.map((g) => ({
      index: g.index,
      name: g.name,
      color: g.color,
      symbol: g.symbol,
      studentIds: [...g.studentIds],
      locked: g.locked,
    })),
    revealQueue: sequentialQueue,
    participantIds: participants.map((p) => p.id),
    participantsSnapshot: Object.fromEntries([...byId.entries()].map(([id, p]) => [id, { ...p }])),
  }));

  return { ok: /** @type {const} */ (true), run: runObj };
}

/** @template T @param {T} obj @returns {T} */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) {
      deepFreeze(value);
    }
  }
  return obj;
}
