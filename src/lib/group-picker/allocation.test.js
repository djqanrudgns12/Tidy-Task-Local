import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendAllocations,
  computeRemainderOptions,
  createDefaultIntent,
  deriveEffectiveCapacities,
  stepGroupCapacity,
  autoBalanceUnlocked,
  addGroupCapacity,
  removeGroupCapacity,
  checkGlobalSwitchLockConflict,
  formatStudentLabel,
  parseCustomNames,
  normalizeRatios,
} from './allocation.js';

test('recommendAllocations returns contiguous window (max 4, N>=10 -> 4) preserving [0] as top pick and >=2 caps', () => {
  assert.deepEqual(recommendAllocations(2), []);
  assert.deepEqual(recommendAllocations(3), []);
  assert.equal(recommendAllocations(4).length, 1);
  assert.equal(recommendAllocations(5).length, 1);
  assert.equal(recommendAllocations(6).length, 2);
  assert.equal(recommendAllocations(7).length, 2);
  assert.equal(recommendAllocations(8).length, 3);
  assert.equal(recommendAllocations(9).length, 3);

  for (let n = 4; n <= 50; n++) {
    const recs = recommendAllocations(n);
    const expectedLen = n <= 5 ? 1 : n <= 7 ? 2 : n <= 9 ? 3 : 4;
    assert.equal(recs.length, expectedLen, `N=${n}: length=${recs.length}`);
    assert.equal(recs[0].isTop, true, `N=${n}: recs[0] must be top recommendation`);
    assert.equal(recs.filter((r) => r.isTop).length, 1, `N=${n}: exactly one isTop`);

    const asc = [...recs].sort((a, b) => a.groupCount - b.groupCount);
    for (let i = 1; i < asc.length; i++) {
      assert.equal(asc[i].groupCount, asc[i - 1].groupCount + 1, `N=${n}: non-contiguous ${asc.map((x) => x.groupCount)}`);
    }
    for (const r of recs) {
      assert.equal(r.capacities.reduce((a, b) => a + b, 0), n);
      assert.ok(r.capacities.every((c) => c >= 2), `N=${n} 1인 모둠 포함: ${r.capacities}`);
    }
  }

  // N=21 기본값 5모둠 불변 계약 & 실측 연속 조합 확인
  const r21 = recommendAllocations(21);
  assert.equal(createDefaultIntent(21).baseIntent.groupCount, 5);
  assert.equal(r21[0].groupCount, 5);
  assert.deepEqual(r21.map((r) => r.groupCount).sort((a, b) => a - b), [4, 5, 6, 7]);
  assert.deepEqual(recommendAllocations(29).map((r) => r.groupCount).sort((a, b) => a - b), [6, 7, 8, 9]);
  assert.deepEqual(recommendAllocations(37).map((r) => r.groupCount).sort((a, b) => a - b), [8, 9, 10, 11]);
});

test('computeRemainderOptions blocks 1-person isolation on K=2 odd N and keeps exact sum', () => {
  for (let n = 5; n <= 23; n += 2) {
    const res = computeRemainderOptions(n, 2);
    assert.equal(res.hasRemainder, true);
    assert.equal(res.options.length, 1, `K=2, N=${n}에서 옵션 B 숨겨야 함`);
    assert.equal(res.options[0].capacities.reduce((a, b) => a + b, 0), n);
    assert.ok(res.options[0].capacities.every((c) => c >= 2));
  }
  const ex = computeRemainderOptions(26, 4);
  assert.equal(ex.options.length, 2);
  assert.deepEqual(ex.options[0].capacities, [5, 5, 4, 4, 4, 4]);
  assert.deepEqual(ex.options[1].capacities, [4, 4, 4, 4, 4, 4, 2]);

  const edge25 = computeRemainderOptions(25, 4);
  assert.equal(edge25.options.length, 2);
  assert.deepEqual(edge25.options[1].capacities, [4, 4, 4, 4, 4, 3, 2]);
});

test('attendance toggling with BaseIntent + anchorSnapshot restores original capacities 100%', () => {
  const { baseIntent } = createDefaultIntent(26, { groupCount: 6 });
  // 교사가 수동으로 [6, 5, 4, 4, 4, 3]으로 맞춘 상태 앵커 스냅샷
  const customAnchorCaps = [6, 5, 4, 4, 4, 3];
  const anchorSnapshot = {
    n: 26,
    capacities: [...customAnchorCaps],
    locked: [6, null, null, null, null, null],
  };
  const customIntent = {
    ...baseIntent,
    ratios: normalizeRatios(customAnchorCaps),
  };

  for (let absent = 1; absent <= 23; absent++) {
    const curN = 26 - absent;
    const derived = deriveEffectiveCapacities({
      baseIntent: customIntent,
      anchorSnapshot,
      n: curN,
      pinnedFloors: [0, 0, 0, 0, 0, 0],
      groupPool: anchorSnapshot.locked.map((lockedCap, i) => ({
        index: i,
        id: `slot-${i}`,
        sourceGroupId: null,
        customName: null,
        color: 'mint',
        symbol: 'star',
        lockedCap,
      })),
    });
    assert.equal(derived.capacities.reduce((a, b) => a + b, 0), curN, `N=${curN} 합계 오류`);
    assert.ok(derived.capacities.every((c) => c >= 1));
  }

  // 결석 전원 복귀(N=26) 시 100.00% 원위치 복원 확인
  const restored = deriveEffectiveCapacities({
    baseIntent: customIntent,
    anchorSnapshot,
    n: 26,
    pinnedFloors: [0, 0, 0, 0, 0, 0],
    groupPool: [],
  });
  assert.equal(restored.restoredAnchor, true);
  assert.deepEqual(restored.capacities, customAnchorCaps);
  assert.deepEqual(restored.locks, [6, null, null, null, null, null]);
});

test('small N (2 and 3) smoothly relaxes autoFloor to 1 without deadlocks', () => {
  const { baseIntent, anchorSnapshot } = createDefaultIntent(3);
  const d3 = deriveEffectiveCapacities({ baseIntent, anchorSnapshot, n: 3 });
  assert.deepEqual(d3.capacities, [2, 1]);
  assert.equal(d3.hasOnePersonDueToSmallN, true);

  const d2 = deriveEffectiveCapacities({ baseIntent, anchorSnapshot: null, n: 2 });
  assert.deepEqual(d2.capacities, [1, 1]);
});

test('stepGroupCapacity keepTotal protects locked and 1-person groups as donors', () => {
  // 그룹 0 잠금, 그룹 1 = 1명(이미 수동 1명), 그룹 2 = 3명, 그룹 3 = 2명
  const res = stepGroupCapacity({
    capacities: [4, 1, 3, 2],
    locks: [4, null, null, null],
    pinnedFloors: [0, 0, 0, 0],
    n: 10,
    index: 3,
    delta: 1,
    keepTotal: true,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.capacities, [4, 1, 2, 3]); // 오직 그룹 2(>2)에서만 1명 차감
  }

  // 그룹 3을 다시 2→1로 줄이려 하면 확인 요청 반환
  const confirmReq = stepGroupCapacity({
    capacities: [4, 2, 2, 2],
    locks: [null, null, null, null],
    pinnedFloors: [0, 0, 0, 0],
    n: 10,
    index: 3,
    delta: -1,
    keepTotal: false,
  });
  assert.equal(confirmReq.ok, false);
  assert.equal(confirmReq.needsOnePersonConfirm, true);
});

test('addGroupCapacity, removeGroupCapacity, autoBalanceUnlocked, lock conflicts work cleanly', () => {
  const add = addGroupCapacity({
    capacities: [5, 5, 4, 4],
    locks: [5, null, null, null],
    pinnedFloors: [0, 0, 0, 0],
    n: 18,
  });
  assert.ok(add);
  assert.equal(add.capacities.reduce((a, b) => a + b, 0), 18);
  assert.equal(add.capacities[0], 5); // 잠금 모둠 유지

  const rem = removeGroupCapacity({
    capacities: [5, 4, 4, 3, 2],
    locks: [5, null, null, null, null],
    pinnedFloors: [0, 0, 0, 0, 0],
    index: 4,
  });
  assert.ok(rem);
  assert.equal(rem.capacities.reduce((a, b) => a + b, 0), 18);

  const balanced = autoBalanceUnlocked({
    capacities: [6, 3, 2, 2],
    locks: [6, null, null, null],
    pinnedFloors: [0, 0, 0, 0],
    n: 15,
  });
  assert.equal(balanced.ok, true);
  if (balanced.ok) assert.deepEqual(balanced.capacities, [6, 3, 3, 3]);

  const conflict = checkGlobalSwitchLockConflict({
    locks: [null, null, 8, null, null, null],
    n: 20,
    targetGroupCount: 2,
  });
  assert.equal(conflict.unlockRequired, true);
});

test('formatStudentLabel disambiguates homonyms across full roster including absentees', () => {
  const allStudents = [
    { id: '1', number: 3, name: '김서연' },
    { id: '2', number: 11, name: '김서연' }, // 결석 중이어도 포함해 판단!
    { id: '3', number: 5, name: '박지민' },
  ];
  assert.equal(formatStudentLabel(allStudents[0], allStudents, false), '3 김서연');
  assert.equal(formatStudentLabel(allStudents[2], allStudents, false), '박지민');
  assert.equal(formatStudentLabel(allStudents[2], allStudents, true), '5 박지민');
});

test('parseCustomNames supports newline, tab/comma single-line split and 50-item guard', () => {
  const comma = parseCustomNames('하늘, 바다, 구름, 별');
  assert.deepEqual(comma.names, ['하늘', '바다', '구름', '별']);

  const fiftyFive = Array.from({ length: 55 }, (_, i) => `친구${i + 1}`).join('\n');
  const parsed = parseCustomNames(fiftyFive);
  assert.equal(parsed.over50, true);
  assert.equal(parsed.totalCount, 55);
  assert.equal(parsed.names.length, 50);
  assert.equal(parsed.linesForStorage.length, 55);
});
