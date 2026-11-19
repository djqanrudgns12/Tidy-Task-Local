import test from 'node:test';
import assert from 'node:assert/strict';
import { solveGroupDraw, sampleGenderQuotas, filterActiveRules } from './solver.js';
import { verifyPartitionInvariant } from './invariants.js';

/** 결정론적 xorshift32 테스트 PRNG 생성기 */
function makeRng(seed = 20261118) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} n */
function makeStudents(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s-${i + 1}`,
    number: i + 1,
    name: `학생${i + 1}`,
    gender: i % 2 === 0 ? /** @type {const} */ ('male') : /** @type {const} */ ('female'),
  }));
}

/** @param {number[]} caps */
function makeSpecs(caps) {
  return caps.map((capacity, index) => ({
    index,
    name: `${index + 1}모둠`,
    color: 'mint',
    symbol: 'star',
    capacity,
  }));
}

test('unconstrained draw satisfies exact multinomial inclusion uniformity (chi-squared check)', () => {
  const rng = makeRng(98765);
  const students = makeStudents(6);
  const caps = [3, 2, 1];
  const groupSpecs = makeSpecs(caps);
  const trials = 3000;
  const counts = students.map(() => [0, 0, 0]);

  for (let t = 0; t < trials; t++) {
    const res = solveGroupDraw({ participants: students, groupSpecs }, rng);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    res.run.groups.forEach((g, gi) => {
      g.studentIds.forEach((sid) => {
        const si = students.findIndex((s) => s.id === sid);
        counts[si][gi]++;
      });
    });
  }

  // 각 학생이 각 모둠 i에 들어갈 기대 확률 = caps[i] / 6 (chi-square df=2, p=0.001 crit=13.82)
  for (let s = 0; s < students.length; s++) {
    let chi2 = 0;
    for (let g = 0; g < 3; g++) {
      const expected = trials * (caps[g] / 6);
      chi2 += (counts[s][g] - expected) ** 2 / expected;
    }
    assert.ok(chi2 < 18, `학생 ${s} chi2=${chi2} 편향 의심`);
  }
});

test('sampleGenderQuotas distributes uneven groups [5,5,4,4,4,4] without front-bias', () => {
  const rng = makeRng(424242);
  const caps = [5, 5, 4, 4, 4, 4];
  const trials = 2000;
  const sums = [0, 0, 0, 0, 0, 0];
  const maleCount = 14;
  const femaleCount = 12;

  for (let t = 0; t < trials; t++) {
    const q = sampleGenderQuotas(caps, maleCount, femaleCount, rng);
    assert.ok(q);
    assert.equal(q.maleTargets.reduce((a, b) => a + b, 0), maleCount);
    assert.equal(q.femaleTargets.reduce((a, b) => a + b, 0), femaleCount);
    q.maleTargets.forEach((m, i) => {
      assert.ok(m + q.femaleTargets[i] <= caps[i]);
      sums[i] += m;
    });
  }

  // 모든 모둠의 실제 평균 남학생 수가 기대치 mu_i = c_i * 14 / 26에 0.08명 이내로 수렴
  for (let i = 0; i < caps.length; i++) {
    const avg = sums[i] / trials;
    const expected = (caps[i] * maleCount) / 26;
    assert.ok(Math.abs(avg - expected) < 0.08, `group ${i}: avg=${avg}, expected=${expected}`);
  }
});

test('dormant rules involving absent students are skipped safely without blocking draw', () => {
  const present = makeStudents(12); // s-1..s-12만 출석, s-99는 결석
  const rules = filterActiveRules({
    participants: present,
    groupCount: 3,
    apartPairs: [['s-1', 's-99'], ['s-2', 's-3']],
    pinnedByGroup: { 's-99': 1, 's-1': 0 },
  });
  assert.equal(rules.dormantCount, 2);
  assert.deepEqual(rules.activeApart, [['s-2', 's-3']]);
  assert.deepEqual(rules.activePinned, { 's-1': 0 });

  const res = solveGroupDraw({
    participants: present,
    groupSpecs: makeSpecs([4, 4, 4]),
    apartPairs: [['s-1', 's-99'], ['s-2', 's-3']],
    pinnedByGroup: { 's-99': 1, 's-1': 0 },
  }, makeRng(111));
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.run.dormantCount, 2);
    assert.ok(res.run.groups[0].studentIds.includes('s-1'));
    const gOf2 = res.run.groups.findIndex((g) => g.studentIds.includes('s-2'));
    const gOf3 = res.run.groups.findIndex((g) => g.studentIds.includes('s-3'));
    assert.notEqual(gOf2, gOf3);
  }
});

test('300 fuzzed constrained & partial-locked solves pass verifyPartitionInvariant and hide pinned slot index', () => {
  const rng = makeRng(77777);
  const students = makeStudents(24);
  const caps = [5, 5, 4, 4, 3, 3];
  const groupSpecs = makeSpecs(caps);
  const apartPairs = /** @type {[string, string][]} */ ([
    ['s-1', 's-2'],
    ['s-3', 's-4'],
    ['s-5', 's-6'],
    ['s-1', 's-5'],
    ['s-7', 's-8'],
  ]);
  const pinnedByGroup = { 's-1': 0, 's-10': 2 };

  let slotZeroHitsForPinned = 0;
  for (let i = 0; i < 300; i++) {
    const res = solveGroupDraw({
      participants: students,
      groupSpecs,
      apartPairs,
      pinnedByGroup,
      genderBalance: i % 2 === 0,
      avoidRecentRepeat: i % 3 === 0,
      recentHistory: i % 3 === 0 ? [[['s-1', 's-3', 's-7', 's-9']]] : [],
    }, rng);
    assert.equal(res.ok, true, `fuzz trial ${i} failed`);
    if (!res.ok) return;
    assert.equal(Object.isFrozen(res.run), true);
    assert.equal(Object.isFrozen(res.run.groups[0]), true);
    const inv = verifyPartitionInvariant({
      groups: res.run.groups,
      participants: students,
      capacities: caps,
      activePinned: pinnedByGroup,
      activeApart: apartPairs,
    });
    assert.equal(inv.ok, true);
    if (res.run.groups[0].studentIds[0] === 's-1') slotZeroHitsForPinned++;
  }
  // 0번 모둠(5명) 내에서 s-1이 첫 칸에만 박히지 않고 ~20% 수준으로 섞여 은닉됨
  assert.ok(slotZeroHitsForPinned < 110, `사전 고정 은닉 부족: ${slotZeroHitsForPinned}/300`);

  // 부분 재추첨(0모둠·2모둠 잠금 유지, 나머지 모둠만 재추첨)
  const first = solveGroupDraw({ participants: students, groupSpecs, apartPairs }, rng);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const locked = new Map([
    [0, first.run.groups[0].studentIds],
    [2, first.run.groups[2].studentIds],
  ]);
  const reroll = solveGroupDraw({
    participants: students,
    groupSpecs,
    apartPairs,
    lockedGroups: locked,
  }, rng);
  assert.equal(reroll.ok, true);
  if (reroll.ok) {
    assert.deepEqual(reroll.run.groups[0].studentIds, first.run.groups[0].studentIds);
    assert.deepEqual(reroll.run.groups[2].studentIds, first.run.groups[2].studentIds);
    assert.equal(reroll.run.groups[0].locked, true);
    assert.equal(reroll.run.groups[1].locked, false);
  }
});

test('Phase 0 fast-fail detects contradictory pinned + apart or unsatisfiable triangle cliques', () => {
  const students = makeStudents(4);
  const clash = solveGroupDraw({
    participants: students,
    groupSpecs: makeSpecs([2, 2]),
    pinnedByGroup: { 's-1': 0, 's-2': 0 },
    apartPairs: [['s-1', 's-2']],
  });
  assert.equal(clash.ok, false);
  if (!clash.ok) assert.equal(clash.code, 'PINNED_APART_CLASH');

  const impossibleClique = solveGroupDraw({
    participants: students,
    groupSpecs: makeSpecs([2, 2]),
    apartPairs: [['s-1', 's-2'], ['s-2', 's-3'], ['s-1', 's-3']], // 3-clique인데 모둠 2개뿐
  });
  assert.equal(impossibleClique.ok, false);
  if (!impossibleClique.ok) assert.equal(impossibleClique.code, 'UNSATISFIABLE_CONSTRAINTS');
});
