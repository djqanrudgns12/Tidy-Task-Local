/** 모둠 인원 스마트 배정 · 추천 · 출결 가역성(BaseIntent + anchorSnapshot) · 동명이인 판별 순수 모듈. */
import {
  PALETTE,
  PALETTE_IDS,
  SYMBOLS,
  SYMBOL_LABELS,
  cleanLabel,
} from '../scoreboard/model.js';
import { GROUP_COLOR_SAFE_ORDER } from './recolor.js';

export { PALETTE, PALETTE_IDS, SYMBOLS, SYMBOL_LABELS, cleanLabel };

export const GROUP_MIN = 2;
export const GROUP_MAX = 12;
export const MAX_PARTICIPANTS = 50;
export const MAX_CUSTOM_LINES = 500;
export const MAX_GROUP_NAME_CHARS = 40;
export const MAX_STUDENT_NAME_CHARS = 40;

/** @typedef {{id:string, number?:number, name:string, gender?:'male'|'female'|'unspecified'}} Participant */
/** @typedef {{index:number, id:string, sourceGroupId:string|null, customName:string|null, color:string, symbol:string, lockedCap:number|null}} GroupSlot */
/** @typedef {{mode:'byGroups'|'bySize', groupCount:number, targetSize:number, remainderChoice:'absorb'|'extra', ratios:number[]}} BaseIntent */
/** @typedef {{n:number, capacities:number[], locked:(number|null)[]}|null} AnchorSnapshot */

/** 교육적 모둠 크기 선호 가중치. 4명 > 5명 > 3명 > 6명 > 2명 > 7명 순이며 1명 이하는 강하게 회피합니다.
 * @param {number} size */
export function sizeWeight(size) {
  if (size <= 1) return -200;
  if (size === 2) return 28;
  if (size === 3) return 76;
  if (size === 4) return 100;
  if (size === 5) return 86;
  if (size === 6) return 64;
  if (size === 7) return 10;
  return 10 - 8 * (size - 7);
}

/** 총원 N을 G개 모둠으로 최대한 균등하게 나눕니다.
 * @param {number} n @param {number} g @param {'head'|'tail'} [remainderSide] @returns {number[]} */
export function evenPartition(n, g, remainderSide = 'head') {
  const safeG = Math.max(GROUP_MIN, Math.min(GROUP_MAX, Math.round(g)));
  const safeN = Math.max(0, Math.round(n));
  const q = Math.floor(safeN / safeG);
  const r = safeN % safeG;
  return Array.from({ length: safeG }, (_, i) => {
    const extra = remainderSide === 'tail' ? i >= safeG - r : i < r;
    return q + (extra ? 1 : 0);
  });
}

/** 참여 인원 N 기준 연속 최대 4개 추천 모둠 구성 탐색(소수 인원 가드 + 점수순 [0]=1위 보존).
 *  UI 표시 단계에서는 groupCount 오름차순으로 정렬해 보여 주지만, createDefaultIntent()[0] 계약을 위해
 *  반환 배열은 점수 내림차순([0] === topG) + isTop 메타데이터를 유지합니다.
 * @param {number} n
 * @returns {{id:string, groupCount:number, capacities:number[], label:string, shortSize:string, sig:string, remainder:number, score:number, isTop:boolean}[]} */
export function recommendAllocations(n) {
  if (!Number.isInteger(n) || n <= 3) return [];
  const maxG = Math.min(GROUP_MAX, Math.floor(n / 2));
  if (maxG < GROUP_MIN) return [];

  /** @type {{id:string, groupCount:number, capacities:number[], label:string, shortSize:string, sig:string, remainder:number, score:number, spread:number, dist4:number}[]} */
  const all = [];

  for (let g = GROUP_MIN; g <= maxG; g++) {
    const caps = evenPartition(n, g);
    const q = Math.floor(n / g);
    const r = n % g;
    const avgWeight = caps.reduce((sum, s) => sum + sizeWeight(s), 0) / g;
    const score = Number((avgWeight - (r > 0 ? 18 : 0)).toFixed(4));
    const spread = r === 0 ? 0 : 1;
    const dist4 = Math.abs(n / g - 4);
    const sig = r === 0 ? `${q}` : `${q}~${q + 1}`;
    const shortSize = r === 0 ? `${q}명씩` : `${q}~${q + 1}명`;
    all.push({
      id: `${g}x${sig}`,
      groupCount: g,
      capacities: caps,
      label: `${g}모둠 · ${shortSize}`,
      shortSize,
      sig,
      remainder: r,
      score,
      spread,
      dist4,
    });
  }

  const sortedByScore = [...all].sort(compareRecommendation);
  const topG = sortedByScore[0].groupCount;

  const winLen = Math.min(4, all.length);
  let bestWindow = all.slice(0, winLen);
  let bestScoreSum = -Infinity;
  let bestCenterDist = Infinity;

  for (let i = 0; i <= all.length - winLen; i++) {
    const slice = all.slice(i, i + winLen);
    if (!slice.some((item) => item.groupCount === topG)) continue;
    const sum = slice.reduce((acc, item) => acc + item.score, 0);
    const center = (slice[0].groupCount + slice[winLen - 1].groupCount) / 2;
    const centerDist = Math.abs(center - topG);
    if (
      sum > bestScoreSum + 1e-6 ||
      (Math.abs(sum - bestScoreSum) <= 1e-6 && centerDist < bestCenterDist - 1e-6)
    ) {
      bestScoreSum = sum;
      bestCenterDist = centerDist;
      bestWindow = slice;
    }
  }

  return bestWindow
    .sort(compareRecommendation)
    .map(({ spread: _s, dist4: _d, ...rest }) => ({
      ...rest,
      isTop: rest.groupCount === topG,
    }));
}

/** @param {any} a @param {any} b */
function compareRecommendation(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (a.spread !== b.spread) return a.spread - b.spread;
  if (a.dist4 !== b.dist4) return a.dist4 - b.dist4;
  return a.groupCount - b.groupCount;
}

/** '한 모둠 인원(K명)' 선택 시 나머지 처리 옵션 A/B 계산.
 * K=2 홀수 인원에서는 1인 고립 모둠이 생기지 않도록 옵션 B를 숨깁니다.
 * @param {number} n @param {number} targetSize
 * @returns {{hasRemainder:boolean, effectiveSize:number, options:{kind:'exact'|'absorb'|'extra', groupCount:number, capacities:number[], label:string, badge:string}[]}} */
export function computeRemainderOptions(n, targetSize) {
  const safeN = Math.max(GROUP_MIN, Math.min(MAX_PARTICIPANTS, Math.round(n)));
  const k = Math.max(2, Math.min(safeN, Math.round(targetSize)));
  const gBase = Math.floor(safeN / k);
  const r = safeN % k;

  // 모둠 수가 상한(12)을 넘거나 2개 미만일 때는 가장 가까운 모둠 수로 보정해 무해 상태를 유지합니다.
  const clampedG = Math.max(GROUP_MIN, Math.min(GROUP_MAX, gBase));
  if (r === 0 && gBase >= GROUP_MIN && gBase <= GROUP_MAX) {
    const caps = evenPartition(safeN, clampedG);
    return {
      hasRemainder: false,
      effectiveSize: k,
      options: [{
        kind: 'exact',
        groupCount: clampedG,
        capacities: caps,
        label: `${clampedG}모둠 · 모두 ${k}명씩`,
        badge: '딱 맞아요',
      }],
    };
  }

  const gAbsorb = Math.max(GROUP_MIN, Math.min(GROUP_MAX, gBase));
  const capsAbsorb = evenPartition(safeN, gAbsorb);
  const minA = Math.min(...capsAbsorb);
  const maxA = Math.max(...capsAbsorb);
  /** @type {{kind:'exact'|'absorb'|'extra', groupCount:number, capacities:number[], label:string, badge:string}[]} */
  const options = [{
    kind: 'absorb',
    groupCount: gAbsorb,
    capacities: capsAbsorb,
    label: minA === maxA
      ? `${gAbsorb}모둠으로 · 모두 ${minA}명씩`
      : `${gAbsorb}모둠에 1명씩 더 (${minA}~${maxA}명)`,
    badge: `옵션 A · ${gAbsorb}모둠`,
  }];

  const gExtra = gBase + 1;
  // K=2 홀수에서는 r=1 고립을 막기 위해 옵션 B를 숨깁니다. K>=3이고 r=1이면 앞 모둠에서 1명 빌려 [K,...,K-1,2] 구성.
  const allowExtra = gExtra >= GROUP_MIN && gExtra <= GROUP_MAX && !(k === 2 && r === 1);
  if (allowExtra) {
    const capsExtra = r >= 2
      ? [...Array(gBase).fill(k), r]
      : [...Array(Math.max(0, gBase - 1)).fill(k), Math.max(2, k - 1), 2];
    const sumExtra = capsExtra.reduce((a, b) => a + b, 0);
    if (sumExtra === safeN && capsExtra.every((c) => c >= 2)) {
      const minB = Math.min(...capsExtra);
      const maxB = Math.max(...capsExtra);
      options.push({
        kind: 'extra',
        groupCount: capsExtra.length,
        capacities: capsExtra,
        label: r >= 2
          ? `${capsExtra.length}모둠 새로 만들기 (마지막 ${r}명)`
          : `${capsExtra.length}모둠으로 나누기 (${minB}~${maxB}명)`,
        badge: `옵션 B · ${capsExtra.length}모둠`,
      });
    }
  }

  return { hasRemainder: true, effectiveSize: k, options };
}

/** 자동 보정·나머지 분배·공여 차감 시 사용하는 기본 하한.
 * N이 2~3명일 때는 수학적으로 1인 모둠이 불가피하므로 1로 완화합니다.
 * @param {number} totalN @param {number} [pinnedCount] */
export function autoFloor(totalN, pinnedCount = 0) {
  return Math.max(totalN < 4 ? 1 : 2, pinnedCount);
}

/** 수동 감소(확인 모달 승인 포함) 시 절대 넘지 않는 하한.
 * @param {number} [pinnedCount] */
export function hardFloor(pinnedCount = 0) {
  return Math.max(1, pinnedCount);
}

/** 명단 모둠과 사용자 커스텀 이름을 잃지 않는 영구 12슬롯 모둠 풀 생성·동기화.
 * @param {GroupSlot[]|undefined} prevPool
 * @param {{id:string, name:string}[]} [rosterGroups]
 * @returns {GroupSlot[]} */
export function syncGroupPool(prevPool, rosterGroups = []) {
  /** @type {GroupSlot[]} */
  const next = [];
  for (let i = 0; i < GROUP_MAX; i++) {
    const prev = prevPool?.[i];
    const rosterGroup = rosterGroups[i] ?? null;
    const prevName = prev?.customName ? cleanLabel(prev.customName, MAX_GROUP_NAME_CHARS) : null;
    next.push({
      index: i,
      id: prev?.id || `slot-${i + 1}`,
      sourceGroupId: rosterGroup?.id ?? prev?.sourceGroupId ?? null,
      customName: prevName || null,
      color: PALETTE_IDS.includes(prev?.color ?? '') ? /** @type {string} */ (prev?.color) : GROUP_COLOR_SAFE_ORDER[i % GROUP_COLOR_SAFE_ORDER.length],
      symbol: SYMBOLS.includes(prev?.symbol ?? '') ? /** @type {string} */ (prev?.symbol) : SYMBOLS[i % SYMBOLS.length],
      lockedCap: Number.isInteger(prev?.lockedCap) && /** @type {number} */ (prev?.lockedCap) >= 1 ? prev?.lockedCap ?? null : null,
    });
  }
  return next;
}

/** 모둠 슬롯의 현재 화면 표시 이름.
 * @param {GroupSlot|undefined} slot @param {number} index @param {{id:string, name:string}[]} [rosterGroups] */
export function resolveGroupName(slot, index, rosterGroups = []) {
  if (slot?.customName) return slot.customName;
  if (slot?.sourceGroupId) {
    const matched = rosterGroups.find((g) => g.id === slot.sourceGroupId);
    if (matched?.name) return matched.name;
  }
  const byPos = rosterGroups[index];
  if (byPos?.name) return byPos.name;
  return `${index + 1}모둠`;
}

/** 초기 BaseIntent + anchorSnapshot 생성 (창 열 때 1위 추천 자동 선택).
 * @param {number} n @param {{groupCount?:number}} [opt]
 * @returns {{baseIntent:BaseIntent, anchorSnapshot:AnchorSnapshot}} */
export function createDefaultIntent(n, opt = {}) {
  const safeN = Math.max(0, n);
  if (safeN <= 1) {
    return {
      baseIntent: { mode: 'byGroups', groupCount: 2, targetSize: 2, remainderChoice: 'absorb', ratios: [0.5, 0.5] },
      anchorSnapshot: null,
    };
  }
  const top = recommendAllocations(safeN)[0];
  const g = opt.groupCount ? Math.max(GROUP_MIN, Math.min(Math.min(GROUP_MAX, safeN), opt.groupCount)) : (top?.groupCount ?? 2);
  const caps = evenPartition(safeN, g);
  const ratios = caps.map((c) => c / safeN);
  return {
    baseIntent: {
      mode: 'byGroups',
      groupCount: g,
      targetSize: Math.max(2, Math.round(safeN / g)),
      remainderChoice: 'absorb',
      ratios,
    },
    anchorSnapshot: {
      n: safeN,
      capacities: caps,
      locked: caps.map(() => null),
    },
  };
}

/** 출결 변동 후에도 BaseIntent + anchorSnapshot에서 결정론적으로 유효 정원 배열을 계산합니다.
 * 출석 인원이 anchorSnapshot.n과 같아지고 모순이 없으면 100% 원위치 복원됩니다.
 * @param {{baseIntent:BaseIntent, anchorSnapshot:AnchorSnapshot, n:number, pinnedFloors?:number[], groupPool?:GroupSlot[]}} params
 * @returns {{capacities:number[], locks:(number|null)[], hasOnePersonDueToSmallN:boolean, restoredAnchor:boolean, groupCount:number}} */
export function deriveEffectiveCapacities({ baseIntent, anchorSnapshot, n, pinnedFloors = [], groupPool = [] }) {
  if (n < 2) {
    return {
      capacities: [],
      locks: [],
      hasOnePersonDueToSmallN: n === 1,
      restoredAnchor: false,
      groupCount: Math.max(GROUP_MIN, baseIntent.groupCount),
    };
  }

  // 유효 모둠 수: 인원보다 모둠이 많을 수 없고, N>=4에서는 가급적 2인 이상 유지 가능한 모둠 수로 임시 축소
  const minFloorPerGroup = n < 4 ? 1 : 2;
  const maxFeasibleG = Math.max(GROUP_MIN, Math.min(GROUP_MAX, Math.floor(n / minFloorPerGroup)));
  let g = Math.max(GROUP_MIN, Math.min(maxFeasibleG, baseIntent.groupCount));

  // anchorSnapshot과 N이 일치하고 각 칸의 locked / pinnedFloor와 충돌이 없으면 100% 원복
  if (
    anchorSnapshot &&
    anchorSnapshot.n === n &&
    anchorSnapshot.capacities.length === g &&
    anchorSnapshot.capacities.reduce((a, b) => a + b, 0) === n &&
    anchorSnapshot.capacities.every((c, i) => c >= Math.max(1, pinnedFloors[i] ?? 0))
  ) {
    return {
      capacities: [...anchorSnapshot.capacities],
      locks: [...anchorSnapshot.locked],
      hasOnePersonDueToSmallN: n <= 3,
      restoredAnchor: true,
      groupCount: g,
    };
  }

  if (baseIntent.mode === 'bySize') {
    const rem = computeRemainderOptions(n, baseIntent.targetSize);
    const chosen = baseIntent.remainderChoice === 'extra'
      ? (rem.options.find((o) => o.kind === 'extra') ?? rem.options[0])
      : rem.options[0];
    if (chosen && chosen.capacities.length >= GROUP_MIN) {
      g = chosen.capacities.length;
      return {
        capacities: [...chosen.capacities],
        locks: chosen.capacities.map((_, i) => groupPool[i]?.lockedCap ?? null),
        hasOnePersonDueToSmallN: chosen.capacities.some((c) => c === 1),
        restoredAnchor: false,
        groupCount: g,
      };
    }
  }

  // ratios 기반 해밀턴(최대 잔여) 배분으로 잠금/핀을 제외한 잔여 N 배분
  /** @type {(number|null)[]} */
  const rawLocks = Array.from({ length: g }, (_, i) => groupPool[i]?.lockedCap ?? null);
  const floors = Array.from({ length: g }, (_, i) => autoFloor(n, pinnedFloors[i] ?? 0));
  /** @type {number[]} */
  const caps = Array.from({ length: g }, (_, i) => floors[i]);

  // 잠금 칸 반영: 현재 N 안에서 가능한 범위라면 유지, 총원 초과 시 임시 완화
  let lockedSum = 0;
  let unlockedMinSum = 0;
  for (let i = 0; i < g; i++) {
    const lc = rawLocks[i];
    if (lc != null) lockedSum += Math.max(lc, pinnedFloors[i] ?? 0);
    else unlockedMinSum += floors[i];
  }

  /** @type {(number|null)[]} */
  const activeLocks = [...rawLocks];
  if (lockedSum + unlockedMinSum <= n) {
    for (let i = 0; i < g; i++) {
      if (activeLocks[i] != null) caps[i] = Math.max(/** @type {number} */ (activeLocks[i]), pinnedFloors[i] ?? 0);
    }
  } else {
    activeLocks.fill(null);
  }

  // 비율에 따라 남은 인원을 해밀턴 분배
  const unlockedIndices = caps.map((_, i) => i).filter((i) => activeLocks[i] == null);
  let remaining = n - caps.reduce((a, b) => a + b, 0);
  if (remaining > 0 && unlockedIndices.length > 0) {
    const ratioSum = unlockedIndices.reduce((sum, i) => sum + Math.max(0.01, baseIntent.ratios[i] ?? 1 / g), 0);
    const quotas = unlockedIndices.map((i) => {
      const w = Math.max(0.01, baseIntent.ratios[i] ?? 1 / g) / ratioSum;
      const exact = remaining * w;
      return { i, add: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    for (const q of quotas) caps[q.i] += q.add;
    let rem = remaining - quotas.reduce((s, q) => s + q.add, 0);
    quotas.sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.i - b.i));
    for (let k = 0; k < rem && k < quotas.length; k++) {
      caps[quotas[k].i] += 1;
    }
  } else if (remaining < 0) {
    // 비율 적용 전 기본 floor 합조차 크면 1인까지 완화해 sum === n 강제 맞춤
    const even = evenPartition(n, g);
    return {
      capacities: even,
      locks: even.map(() => null),
      hasOnePersonDueToSmallN: even.some((c) => c === 1),
      restoredAnchor: false,
      groupCount: g,
    };
  }

  return {
    capacities: caps,
    locks: activeLocks,
    hasOnePersonDueToSmallN: caps.some((c) => c === 1),
    restoredAnchor: false,
    groupCount: g,
  };
}

/** 개별 모둠 인원 증감(+1 / -1).
 * @param {{capacities:number[], locks:(number|null)[], pinnedFloors:number[], n:number, index:number, delta:1|-1, keepTotal:boolean, allowOnePerson?:boolean}} params
 * @returns {{ok:true, capacities:number[], needsOnePersonConfirm?:false}|{ok:false, needsOnePersonConfirm:true}|{ok:false, needsOnePersonConfirm:false, reason:string}} */
export function stepGroupCapacity({ capacities, locks, pinnedFloors, n, index, delta, keepTotal, allowOnePerson = false }) {
  if (index < 0 || index >= capacities.length) return { ok: false, needsOnePersonConfirm: false, reason: '잘못된 모둠입니다.' };
  if (locks[index] != null) return { ok: false, needsOnePersonConfirm: false, reason: '잠긴 모둠은 먼저 자물쇠를 풀어 주세요.' };

  const current = capacities[index];
  const minPinned = pinnedFloors[index] ?? 0;
  const floorAuto = autoFloor(n, minPinned);
  const floorHard = hardFloor(minPinned);
  const nextVal = current + delta;

  if (nextVal < floorHard) {
    return {
      ok: false,
      needsOnePersonConfirm: false,
      reason: minPinned >= 1 ? `사전 고정된 학생(${minPinned}명)보다 적게 줄일 수 없어요.` : '최소 1명은 필요해요.',
    };
  }

  if (delta < 0 && n >= 4 && nextVal < floorAuto && !allowOnePerson) {
    return { ok: false, needsOnePersonConfirm: true };
  }

  const next = [...capacities];
  if (!keepTotal) {
    const sumOther = next.reduce((s, c, i) => (i === index ? s : s + c), 0);
    if (nextVal + sumOther > MAX_PARTICIPANTS && delta > 0) {
      return { ok: false, needsOnePersonConfirm: false, reason: `총합이 최대 ${MAX_PARTICIPANTS}명을 넘을 수 없어요.` };
    }
    next[index] = nextVal;
    return { ok: true, capacities: next };
  }

  // 합계 유지 모드: 인접한 미잠금 모둠에서 반대 방향(±1) 1명을 대칭 조정합니다.
  // 단, 이미 1인 모둠이거나 autoFloor 이하인 모둠은 + 버튼 시 공여자(차감 대상)에서 보호합니다.
  const donorCandidates = next
    .map((_, i) => i)
    .filter((i) => i !== index && locks[i] == null)
    .sort((a, b) => Math.abs(a - index) - Math.abs(b - index));

  if (delta > 0) {
    const donor = donorCandidates.find((d) => next[d] > autoFloor(n, pinnedFloors[d] ?? 0));
    if (donor === undefined) {
      return {
        ok: false,
        needsOnePersonConfirm: false,
        reason: '다른 모둠이 모두 최소 인원(2명) 또는 잠금 상태라 합계를 유지하며 늘릴 수 없어요.',
      };
    }
    next[index] = nextVal;
    next[donor] -= 1;
    return { ok: true, capacities: next };
  } else {
    const receiver = donorCandidates.find((r) => next[r] < n);
    if (receiver === undefined) {
      return {
        ok: false,
        needsOnePersonConfirm: false,
        reason: '인원을 옮겨 담을 다른 미잠금 모둠이 없어요.',
      };
    }
    next[index] = nextVal;
    next[receiver] += 1;
    return { ok: true, capacities: next };
  }
}

/** 미잠금 모둠들만 총합 N에 맞게 자동으로 균등 맞춤.
 * @param {{capacities:number[], locks:(number|null)[], pinnedFloors:number[], n:number}} params */
export function autoBalanceUnlocked({ capacities, locks, pinnedFloors, n }) {
  const lockedSum = capacities.reduce((s, c, i) => (locks[i] != null ? s + c : s), 0);
  const unlocked = capacities.map((_, i) => i).filter((i) => locks[i] == null);
  if (!unlocked.length) {
    return lockedSum === n
      ? { ok: true, capacities: [...capacities] }
      : { ok: false, reason: '모든 모둠이 잠겨 있어 인원을 맞출 수 없어요.' };
  }
  const minAutoSum = unlocked.reduce((s, i) => s + autoFloor(n, pinnedFloors[i] ?? 0), 0);
  const minHardSum = unlocked.reduce((s, i) => s + hardFloor(pinnedFloors[i] ?? 0), 0);
  const targetRemaining = n - lockedSum;
  if (targetRemaining < minHardSum) {
    return { ok: false, reason: '잠긴 모둠 정원 합계가 참여 인원보다 많아 맞출 수 없어요.' };
  }
  const floors = unlocked.map((i) =>
    targetRemaining >= minAutoSum ? autoFloor(n, pinnedFloors[i] ?? 0) : hardFloor(pinnedFloors[i] ?? 0),
  );
  const next = [...capacities];
  let rem = targetRemaining - floors.reduce((a, b) => a + b, 0);
  unlocked.forEach((idx, uPos) => {
    next[idx] = floors[uPos];
  });
  // 미잠금 칸의 기존 상대 비율을 최대한 살리되 고르게 나머지 배분
  const weights = unlocked.map((idx, uPos) => ({ idx, uPos, base: capacities[idx] }));
  while (rem > 0) {
    // 가장 작은 모둠 우선으로 1명씩 채워 균형 달성
    weights.sort((a, b) => (next[a.idx] !== next[b.idx] ? next[a.idx] - next[b.idx] : a.idx - b.idx));
    next[weights[0].idx] += 1;
    rem -= 1;
  }
  return { ok: true, capacities: next };
}

/** 모둠 추가 가능 여부 및 실행 ([+ 모둠 추가]).
 * 미잠금 여유 합이 autoFloor 기준으로 2 이상일 때만 활성.
 * @param {{capacities:number[], locks:(number|null)[], pinnedFloors:number[], n:number}} params */
export function canAddGroup({ capacities, locks, pinnedFloors, n }) {
  if (capacities.length >= GROUP_MAX) return false;
  const minNew = n < 4 ? 1 : 2;
  const slack = capacities.reduce(
    (sum, c, i) => (locks[i] != null ? sum : sum + Math.max(0, c - autoFloor(n, pinnedFloors[i] ?? 0))),
    0,
  );
  return slack >= minNew;
}

/** @param {{capacities:number[], locks:(number|null)[], pinnedFloors:number[], n:number}} params */
export function addGroupCapacity(params) {
  if (!canAddGroup(params)) return null;
  const { capacities, locks, pinnedFloors, n } = params;
  const minNew = n < 4 ? 1 : 2;
  const next = [...capacities];
  const nextLocks = [...locks, null];
  let need = minNew;
  // 가장 인원이 넉넉한 미잠금 모둠들에서 1명씩 빌려 새 모둠 정원 구성
  while (need > 0) {
    const donors = next
      .map((_, i) => i)
      .filter((i) => locks[i] == null && next[i] > autoFloor(n, pinnedFloors[i] ?? 0))
      .sort((a, b) => next[b] - next[a] || b - a);
    if (!donors.length) return null;
    next[donors[0]] -= 1;
    need -= 1;
  }
  next.push(minNew);
  return { capacities: next, locks: nextLocks };
}

/** 모둠 삭제 가능 여부 ([× 모둠 삭제]).
 * @param {{capacities:number[], locks:(number|null)[], pinnedFloors:number[], index:number}} params */
export function canRemoveGroup({ capacities, locks, pinnedFloors, index }) {
  if (capacities.length <= GROUP_MIN) return false;
  if (locks[index] != null) return false;
  if ((pinnedFloors[index] ?? 0) > 0) return false;
  const otherUnlocked = capacities.filter((_, i) => i !== index && locks[i] == null).length;
  return otherUnlocked >= 1;
}

/** @param {{capacities:number[], locks:(number|null)[], pinnedFloors:number[], index:number}} params */
export function removeGroupCapacity(params) {
  if (!canRemoveGroup(params)) return null;
  const { capacities, locks, index } = params;
  const removed = capacities[index];
  const next = capacities.filter((_, i) => i !== index);
  const nextLocks = locks.filter((_, i) => i !== index);
  const receivers = next.map((_, i) => i).filter((i) => nextLocks[i] == null);
  let left = removed;
  while (left > 0) {
    receivers.sort((a, b) => (next[a] !== next[b] ? next[a] - next[b] : a - b));
    next[receivers[0]] += 1;
    left -= 1;
  }
  return { capacities: next, locks: nextLocks };
}

/** 잠금이 걸린 상태에서 전역 모둠 수(G')나 추천 칩을 눌렀을 때 수학적 수용 가능 여부 검사.
 * @param {{locks:(number|null)[], n:number, targetGroupCount:number}} params */
export function checkGlobalSwitchLockConflict({ locks, n, targetGroupCount }) {
  /** @type {{index:number, cap:number}[]} */
  const activeLocks = [];
  locks.forEach((cap, index) => {
    if (cap != null) activeLocks.push({ index, cap });
  });
  if (!activeLocks.length) return { hasLocks: false, compatible: true, unlockRequired: false };

  const lockedSum = activeLocks.reduce((s, item) => s + item.cap, 0);
  const allInsideTarget = activeLocks.every((item) => item.index < targetGroupCount);
  const minFloor = n < 4 ? 1 : 2;
  let compatible = allInsideTarget;
  if (compatible) {
    if (targetGroupCount > activeLocks.length) {
      compatible = lockedSum + minFloor * (targetGroupCount - activeLocks.length) <= n;
    } else if (targetGroupCount === activeLocks.length) {
      compatible = lockedSum === n;
    } else {
      compatible = false;
    }
  }
  return {
    hasLocks: true,
    compatible,
    unlockRequired: !compatible,
    lockedCount: activeLocks.length,
    lockedSum,
  };
}

const CIRCLED_NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
const dupSuffix = (/** @type {number} */ rank) => CIRCLED_NUMS[rank - 1] ?? `(${rank})`;

/** 당일 결석자 포함 '전체 학급 명단' 기준 동명이인 구분 표시 (직접 입력 동명이인은 ①, ② 접미 적용).
 * @param {{id?:string, name:string, number?:number|null}} student
 * @param {{id?:string, name:string}[]} allStudents
 * @param {boolean} [alwaysShowNumber] */
export function formatStudentLabel(student, allStudents = [], alwaysShowNumber = false) {
  const clean = cleanLabel(student?.name ?? '', MAX_STUDENT_NAME_CHARS) || '이름 없음';
  const sameName = allStudents.filter((s) => cleanLabel(s?.name ?? '', MAX_STUDENT_NAME_CHARS) === clean);
  const dup = sameName.length > 1;
  const isCustom = String(student?.id ?? '').startsWith('custom-') || student?.number == null || !Number.isFinite(Number(student.number));
  if (dup && isCustom) {
    const rank = Math.max(1, sameName.findIndex((s) => (s.id ? s.id === student?.id : s === student)) + 1);
    const tagged = `${clean} ${dupSuffix(rank)}`;
    return alwaysShowNumber && student?.number != null && Number.isFinite(Number(student.number))
      ? `${student.number} ${tagged}`
      : tagged;
  }
  if (student?.number == null || !Number.isFinite(Number(student.number))) return clean;
  return dup || alwaysShowNumber ? `${student.number} ${clean}` : clean;
}

/** 직접 입력(임시 목록) 텍스트 파싱: 줄바꿈 + 1줄 탭/쉼표 자동 분리 + 동명이인 표시 라벨(①, ②) + 50명 초과 감지.
 * @param {string} rawText */
export function parseCustomNames(rawText) {
  const rawLines = String(rawText ?? '').split(/\r?\n/);
  const tokens = rawLines.length === 1 && /[\t,]/.test(rawLines[0])
    ? rawLines[0].split(/[\t,]/)
    : rawLines;
  const cleaned = tokens
    .map((line) => cleanLabel(line, MAX_STUDENT_NAME_CHARS))
    .filter(Boolean);
  const clipped = cleaned.slice(0, MAX_PARTICIPANTS);
  const dupCounts = new Map();
  clipped.forEach((name) => dupCounts.set(name, (dupCounts.get(name) ?? 0) + 1));
  const seenRank = new Map();
  const displayNames = clipped.map((name) => {
    if ((dupCounts.get(name) ?? 0) <= 1) return name;
    const r = (seenRank.get(name) ?? 0) + 1;
    seenRank.set(name, r);
    return `${name} ${dupSuffix(r)}`;
  });
  return {
    allNames: cleaned,
    names: clipped,
    displayNames,
    over50: cleaned.length > MAX_PARTICIPANTS,
    totalCount: cleaned.length,
    duplicateNames: [...dupCounts].filter(([, count]) => count > 1).map(([name]) => name),
    linesForStorage: cleaned.slice(0, MAX_CUSTOM_LINES).map((s) => [...s].slice(0, 200).join('')),
  };
}

/** BaseIntent 비율 벡터를 현재 정원에 맞춰 정규화합니다.
 * @param {number[]} capacities */
export function normalizeRatios(capacities) {
  const sum = capacities.reduce((a, b) => a + b, 0);
  if (sum <= 0) return capacities.map(() => 1 / Math.max(1, capacities.length));
  return capacities.map((c) => c / sum);
}
