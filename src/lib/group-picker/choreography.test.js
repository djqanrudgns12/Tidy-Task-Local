import test from 'node:test';
import assert from 'node:assert/strict';
import { squashStretch, groundShadow, fluidEase, missedTicketEvents, REDUCED_DURATION_MS } from './choreography/suspense.js';
import { computeStageViewport } from './choreography/viewport.js';
import { createTrainPlan, trainPoseAt } from './choreography/train.js';
import {
  createGlacierPlan,
  glacierPoseAt,
  partitionGlacierBSP,
  polygonArea,
  resolveLabelOverlaps,
  pointInPoly,
} from './choreography/glacier.js';
import {
  createElevatorPlan,
  elevatorPoseAt,
  rugSlotPosition,
  computeDialPose,
} from './choreography/elevator.js';

/** @param {number[]} sizes */
function makeGroups(sizes) {
  let cursor = 1;
  return sizes.map((sz, index) => ({
    index,
    name: `${index + 1}모둠`,
    color: 'mint',
    symbol: 'star',
    studentIds: Array.from({ length: sz }, () => `s-${cursor++}`),
  }));
}

function sampleGroups28() {
  return makeGroups([5, 5, 5, 5, 4, 4]);
}

function sampleGroups50_12() {
  return makeGroups([5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4]);
}

test('squashStretch preserves volume (~1.0) and groundShadow shrinks monotonically on jump lift', () => {
  for (let u = 0; u <= 1; u += 0.05) {
    const { scaleX, scaleY, jumpY } = squashStretch(u);
    assert.ok(scaleX * scaleY >= 0.96 && scaleX * scaleY <= 1.04, `u=${u}: ${scaleX * scaleY}`);
    assert.ok(jumpY >= -1e-6 && jumpY <= 1.0001);
  }
  const ground = groundShadow(0);
  const peak = groundShadow(1);
  assert.ok(peak.scale < ground.scale);
  assert.ok(peak.opacity < ground.opacity);
  assert.equal(fluidEase(0), 0);
  assert.equal(fluidEase(1), 1);
});

test('[Stage 1 열차] 28명/6모둠 예산 · 전원 1회 확정 · reduced 모드 · 불변식2(미탑승 라이벌 & 2인 포토피니시)', () => {
  const groups = sampleGroups28();
  const allStudentIds = groups.flatMap((g) => g.studentIds);
  const plan = createTrainPlan({ groups, allStudentIds });
  assert.ok(plan.totalDurationMs >= 19000 && plan.totalDurationMs <= 27000, `duration=${plan.totalDurationMs}`);
  assert.equal(plan.ticketEvents.length, 28);
  assert.equal(new Set(plan.ticketEvents.map((e) => e.studentId)).size, 28);

  // 우→좌 진행 방향 확인: 진입 carX > 정차 800 > 출발 carX
  const car0 = plan.cars[0];
  assert.ok(trainPoseAt(plan, car0.startMs + 50).carX > 800);
  assert.equal(trainPoseAt(plan, car0.arriveEndMs + 100).carX, 800);
  assert.ok(trainPoseAt(plan, car0.departEndMs - 30).carX < 800);

  // 불변식2a: 중반 라이벌은 탑승 구간 내 내내 rivalId ∉ committedIds
  for (const car of plan.cars) {
    for (const b of car.boardings) {
      if (!b.rivalId) continue;
      assert.notEqual(b.rivalId, b.studentId);
      for (let probe = b.startMs; probe <= b.endMs; probe += 50) {
        const pose = trainPoseAt(plan, probe);
        assert.ok(
          !pose.committedIds.has(b.rivalId),
          `라이벌 ${b.rivalId} 이(가) ${probe}ms 에 이미 확정됨`,
        );
      }
    }
  }

  // 불변식2b: 마지막 호차 마지막 2인 포토피니시 ~250ms 차 나란히 탑승(패자 없음)
  const lastCar = plan.cars[plan.cars.length - 1];
  const pLead = lastCar.boardings[lastCar.boardings.length - 2];
  const pSecond = lastCar.boardings[lastCar.boardings.length - 1];
  assert.ok(pLead.isPhotoFinish && pSecond.isPhotoFinish);
  assert.equal(pSecond.startMs - pLead.startMs, 250);
  const overlapPose = trainPoseAt(plan, pSecond.startMs + 120);
  assert.equal(overlapPose.activeBoardings.length, 2);

  const endPose = trainPoseAt(plan, plan.totalDurationMs);
  assert.equal(endPose.committedIds.size, 28);

  const reduced = createTrainPlan({ groups, allStudentIds, reduced: true });
  assert.equal(reduced.totalDurationMs, REDUCED_DURATION_MS);
  assert.equal(missedTicketEvents(reduced.ticketEvents, 0, REDUCED_DURATION_MS).length, 28);
});

test('[Stage 2 빙하] 불변식3(공유변 비트일치 + ±3% 면적 + Act1 단일rootPoly) · 불변식4(safePoly 4모서리 & ρ<=0.60) · 불변식5(12.0s 다리 선행)', () => {
  // 불변식3a: 공유변 정점 순서/좌표 비트 단위 일치 및 ±3% 면적 오차
  for (const caps of [[6, 5, 4, 3], [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4]]) {
    const total = caps.reduce((a, b) => a + b, 0);
    const { floes, sharedNeighbors } = partitionGlacierBSP(caps, 1600, 900, 777);
    assert.equal(floes.length, caps.length);

    const totalArea = floes.reduce((s, f) => s + polygonArea(f.topPoints), 0);
    floes.forEach((f, i) => {
      const areaShare = polygonArea(f.topPoints) / totalArea;
      const expectedShare = caps[i] / total;
      assert.ok(Math.abs(areaShare - expectedShare) <= 0.03, `floe ${i}: ${areaShare} vs ${expectedShare}`);
    });

    // 맞닿은 두 섬이 공유 곡선 샘플 점을 비트 단위로 똑같이 소유하는지 확인
    const keyPt = (/** @type {{x:number,y:number}} */ p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    for (let i = 0; i < floes.length; i++) {
      const setA = new Set(floes[i].topPoints.map(keyPt));
      for (const edge of sharedNeighbors[i]) {
        const setB = new Set(floes[edge.neighbor].topPoints.map(keyPt));
        const sharedCount = [...setA].filter((k) => setB.has(k)).length;
        assert.ok(sharedCount >= 2, `공유변(${i}-${edge.neighbor}) 정점 일치 부족: ${sharedCount}`);
      }
    }
  }

  // Spatial Hash 비겹침 테스트
  const stacked = resolveLabelOverlaps(
    Array.from({ length: 8 }, (_, i) => ({ id: `x-${i}`, x: 800, y: 450 })),
    104,
    44,
  );
  for (let i = 0; i < stacked.length; i++) {
    for (let j = i + 1; j < stacked.length; j++) {
      const ox = 104 - Math.abs(stacked[i].x - stacked[j].x);
      const oy = 44 - Math.abs(stacked[i].y - stacked[j].y);
      assert.ok(!(ox > 2 && oy > 2), `라벨 겹침 (${i},${j}): ox=${ox}, oy=${oy}`);
    }
  }

  // 불변식3b + 불변식5: 28명/6모둠 Act1 useUnifiedRoot & 12.0s->12.6s 다리 선행 페이드
  const groups28 = sampleGroups28();
  const plan28 = createGlacierPlan({ groups: groups28, allStudentIds: groups28.flatMap((g) => g.studentIds) });
  assert.equal(plan28.totalDurationMs, 20620);
  assert.equal(glacierPoseAt(plan28, 1000).useUnifiedRoot, true);
  assert.equal(glacierPoseAt(plan28, 6000).useUnifiedRoot, false);

  assert.equal(glacierPoseAt(plan28, 12000).bridgeAlpha, 0);
  assert.ok(glacierPoseAt(plan28, 12300).bridgeAlpha > 0);
  const atDriftStart = glacierPoseAt(plan28, 12600);
  assert.equal(atDriftStart.bridgeAlpha, 1);
  assert.equal(atDriftStart.driftProgress, 0);
  assert.ok(atDriftStart.bridge);
  const act3 = glacierPoseAt(plan28, 18400);
  assert.equal(act3.act, 3);
  assert.equal(act3.bridgeAlpha, 1);
  assert.ok(glacierPoseAt(plan28, 19650).bridgeAlpha < 0.01);
  assert.equal(glacierPoseAt(plan28, plan28.totalDurationMs).committedIds.size, 28);

  // 불변식4: 극한 밀집 50명/12모둠 포함 4개 모서리 모두 safePoly 내부 및 최소 키 64px 보장
  const groups50 = sampleGroups50_12();
  const plan50 = createGlacierPlan({ groups: groups50, allStudentIds: groups50.flatMap((g) => g.studentIds) });
  for (const [sid, slot] of Object.entries(plan50.targetSlots)) {
    const grp = plan50.groups.find((g) => g.index === slot.groupIndex);
    assert.ok(grp);
    assert.ok(slot.heightPx >= 64, `${sid} height=${slot.heightPx} < 64`);
    const fw = slot.heightPx * 0.62;
    const hw = fw * 0.48;
    const uh = slot.heightPx * 0.92;
    const corners = [
      { x: slot.x - hw, y: slot.y - uh },
      { x: slot.x + hw, y: slot.y - uh },
      { x: slot.x - hw, y: slot.y + 18 },
      { x: slot.x + hw, y: slot.y + 18 },
    ];
    for (const c of corners) {
      assert.ok(pointInPoly(c, grp.floe.safePoly), `50명/12모둠 ${sid} 모서리 이탈: (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`);
    }
  }
});

test('[Stage 3 엘리베이터] 다이얼 각도표 + 불변식6(러그 중앙통로 개방 · 하차끝점=러그슬롯 · peekHeadX 연속성)', () => {
  // 다이얼 각도 범위 검증 (4F -67.5° -> 1F +67.5°)
  assert.equal(computeDialPose(0).angleDeg, -67.5);
  assert.equal(computeDialPose(0).floor, '4F');
  assert.equal(computeDialPose(1).angleDeg, 67.5);
  assert.equal(computeDialPose(1).floor, '1F');

  // 불변식6a: 모든 n(1..50)에 대해 중앙 통로 X∈[640, 960] 항상 개방
  for (const n of [1, 2, 8, 16, 24, 50]) {
    for (let i = 0; i < n; i++) {
      const slot = rugSlotPosition(i, n);
      assert.ok(slot.x <= 600 || slot.x >= 1000, `중앙통로 침범 n=${n} i=${i}: x=${slot.x}`);
    }
  }

  const groups = sampleGroups28();
  const plan = createElevatorPlan({ groups, allStudentIds: groups.flatMap((g) => g.studentIds) });
  assert.ok(plan.totalDurationMs >= 21000 && plan.totalDurationMs <= 29000, `duration=${plan.totalDurationMs}`);
  assert.equal(plan.ticketEvents.length, 28);

  const lastCar = plan.cars[plan.cars.length - 1];
  const lastExit = lastCar.exits[lastCar.exits.length - 1];
  const peekTime = lastExit.startMs + (lastExit.endMs - lastExit.startMs) * 0.44;
  const peekPose = elevatorPoseAt(plan, peekTime);
  assert.equal(peekPose.act, 3);
  assert.equal(peekPose.doorOpen, 0.18);
  assert.ok(peekPose.surprisePeek);

  // 불변식6b: u=0.779(surprisePeek) -> u=0.781(exiting) peekHeadX 연속성 (<= 6px)
  const dur = lastExit.endMs - lastExit.startMs;
  const beforeHandoff = elevatorPoseAt(plan, lastExit.startMs + dur * 0.779);
  const afterHandoff = elevatorPoseAt(plan, lastExit.startMs + dur * 0.781);
  assert.ok(beforeHandoff.surprisePeek && afterHandoff.exiting);
  const handoffDx = Math.hypot(
    beforeHandoff.surprisePeek.peekHeadX - afterHandoff.exiting.x,
    beforeHandoff.surprisePeek.y - afterHandoff.exiting.y,
  );
  assert.ok(handoffDx <= 6, `peekHeadX 하차 전환 점프=${handoffDx.toFixed(2)}px`);

  // 불변식6c: 하차 완료 시점 좌표 === arrivedPositions 러그 슬롯 (<= 0.5px)
  const atExitEnd = elevatorPoseAt(plan, lastExit.endMs);
  const afterExit = elevatorPoseAt(plan, lastExit.endMs + 2);
  const landedSlot = afterExit.arrivedPositions.find((/** @type {any} */ p) => p.studentId === lastExit.studentId);
  assert.ok(atExitEnd.exiting && landedSlot);
  const endDist = Math.hypot(atExitEnd.exiting.x - landedSlot.x, atExitEnd.exiting.y - landedSlot.y);
  assert.ok(endDist <= 0.5, `하차 끝점 불일치 dist=${endDist.toFixed(2)}px`);

  assert.equal(elevatorPoseAt(plan, plan.totalDurationMs).committedIds.size, 28);
});

test('[불변식 1] 500프레임 전 무대 연속성 검증 (무순간이동: T1 / G1 / E1 경계 및 전 구간)', () => {
  const groups = sampleGroups28();
  const allStudentIds = groups.flatMap((g) => g.studentIds);

  // Helper: 학생별 좌표 맵 추출
  /** @param {ReturnType<typeof trainPoseAt>} pose */
  const trainCoords = (pose) => {
    /** @type {Record<string, {x:number,y:number,tag:string}>} */
    const map = {};
    for (const w of pose.waitingPositions) {
      if (w.visible) map[w.studentId] = { x: w.x, y: w.y, tag: 'wait' };
    }
    for (const b of pose.activeBoardings) {
      map[b.studentId] = { x: b.x, y: b.y, tag: 'board' };
      if (b.rivalPose) map[b.rivalPose.studentId] = { x: b.rivalPose.x, y: b.rivalPose.y, tag: 'rival' };
    }
    return map;
  };

  // 1) Train 500프레임 (v_max = 18 px/ms + 4px) & 출발 경계 검증
  const trPlan = createTrainPlan({ groups, allStudentIds });
  const dtTr = trPlan.totalDurationMs / 500;
  let prevTr = trainCoords(trainPoseAt(trPlan, 0));
  for (let i = 1; i <= 500; i++) {
    const cur = trainCoords(trainPoseAt(trPlan, i * dtTr));
    for (const [sid, p] of Object.entries(cur)) {
      const q = prevTr[sid];
      if (!q) continue;
      // 7번 대기석(x~604) 밖에서 방금 진입한 경우가 아니라면 연속 이동
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      const maxAllow = 18 * dtTr + 4;
      assert.ok(dist <= maxAllow, `T1 frame ${i} ${sid} (${q.tag}->${p.tag}) jump=${dist.toFixed(1)} > ${maxAllow.toFixed(1)}`);
    }
    prevTr = cur;
  }
  for (const car of trPlan.cars) {
    for (const b of car.boardings) {
      const pre = trainCoords(trainPoseAt(trPlan, Math.max(0, b.startMs - 1)))[b.studentId];
      const post = trainCoords(trainPoseAt(trPlan, b.startMs + 1))[b.studentId];
      if (pre && post) {
        assert.ok(Math.hypot(pre.x - post.x, pre.y - post.y) <= 22, `T1 ${b.studentId} 도약 출발 점프`);
      }
    }
  }

  // 2) Glacier 500프레임 (v_max = 4.5 px/ms + 4px)
  const glPlan = createGlacierPlan({ groups, allStudentIds });
  const dtGl = glPlan.totalDurationMs / 500;
  let prevGl = Object.fromEntries(glacierPoseAt(glPlan, 0).studentPoses.map((s) => [s.studentId, s]));
  for (let i = 1; i <= 500; i++) {
    const cur = Object.fromEntries(glacierPoseAt(glPlan, i * dtGl).studentPoses.map((s) => [s.studentId, s]));
    for (const [sid, p] of Object.entries(cur)) {
      const q = prevGl[sid];
      if (!q) continue;
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      const maxAllow = 4.5 * dtGl + 4;
      assert.ok(dist <= maxAllow, `G1 frame ${i} ${sid} jump=${dist.toFixed(1)} > ${maxAllow.toFixed(1)}`);
    }
    prevGl = cur;
  }

  // 3) Elevator 500프레임 (v_max = 8 px/ms + 4px)
  const elPlan = createElevatorPlan({ groups, allStudentIds });
  const dtEl = elPlan.totalDurationMs / 500;
  /** @param {ReturnType<typeof elevatorPoseAt>} pose */
  const elCoords = (pose) => {
    /** @type {Record<string, {x:number,y:number}>} */
    const map = {};
    if (pose.surprisePeek) map[pose.surprisePeek.studentId] = { x: pose.surprisePeek.peekHeadX, y: pose.surprisePeek.y };
    if (pose.exiting) map[pose.exiting.studentId] = { x: pose.exiting.x, y: pose.exiting.y };
    for (const a of pose.arrivedPositions) map[a.studentId] = { x: a.x, y: a.y };
    return map;
  };
  let prevEl = elCoords(elevatorPoseAt(elPlan, 0));
  for (let i = 1; i <= 500; i++) {
    const cur = elCoords(elevatorPoseAt(elPlan, i * dtEl));
    for (const [sid, p] of Object.entries(cur)) {
      const q = prevEl[sid];
      if (!q) continue;
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      const maxAllow = 8 * dtEl + 4;
      assert.ok(dist <= maxAllow, `E1 frame ${i} ${sid} jump=${dist.toFixed(1)} > ${maxAllow.toFixed(1)}`);
    }
    prevEl = cur;
  }
});

test('[고도화 불변식] 뷰포트 블리드 범위 + T1 룩어헤드 대기열(무팝) + G1 깃발↔머리 비충돌', () => {
  // 1) computeStageViewport 전 비율 블리드 범위 [-100..1700, -320..1080] 이탈 0px 검증
  for (const [w, h] of [[800, 560], [1440, 920], [1920, 1080], [2560, 800], [500, 900], [3840, 2160]]) {
    const vp = computeStageViewport(w, h);
    assert.ok(vp.y >= -320 - 0.1 && vp.y + vp.h <= 1080 + 0.1, `${w}x${h}: y=${vp.y}, y+h=${vp.y + vp.h}`);
    assert.ok(vp.x >= -100 - 0.1 && vp.x + vp.w <= 1700 + 0.1, `${w}x${h}: x=${vp.x}, x+w=${vp.x + vp.w}`);
  }

  // 2) T1 4석 룩어헤드 대기열: 모든 탑승 학생은 출발 5ms 전에 이미 가시 대기열(0..3)에 존재해야 함
  const groups28 = sampleGroups28();
  const trPlan = createTrainPlan({ groups: groups28, allStudentIds: groups28.flatMap((g) => g.studentIds) });
  for (const car of trPlan.cars) {
    for (const b of car.boardings) {
      const prePose = trainPoseAt(trPlan, Math.max(0, b.startMs - 5));
      const match = prePose.waitingPositions.find((w) => w.studentId === b.studentId);
      assert.ok(match && match.visible, `T1 ${b.studentId} 가 startMs 직전 대기열에 비가시 상태`);
    }
  }

  // 3) G1 깃발 뱃지 ↔ 학생 머리 비충돌 + 일관된 below 이름표 + 50명/12모둠 Act1 비겹침 검증
  for (const sizes of [[6, 5, 5], [5, 5, 5, 5, 4, 4], [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4]]) {
    const gList = makeGroups(sizes);
    const glPlan = createGlacierPlan({ groups: gList, allStudentIds: gList.flatMap((g) => g.studentIds) });
    for (const [sid, slot] of Object.entries(glPlan.targetSlots)) {
      assert.equal(slot.labelAlign, 'below', `G1 ${sid} labelAlign should stay 'below'`);
      const grp = glPlan.groups.find((g) => g.index === slot.groupIndex);
      assert.ok(grp);
      const headY = slot.y - slot.heightPx * 0.92;
      const dx = Math.abs(slot.x - grp.floe.badge.x);
      assert.ok(
        headY >= grp.floe.badge.y + 10 || dx >= 64,
        `G1 [${sizes.length}모둠] ${sid} 머리(y=${headY.toFixed(1)}, x=${slot.x.toFixed(1)})가 깃발(${grp.floe.badge.x.toFixed(1)}, ${grp.floe.badge.y.toFixed(1)})과 너무 가까움`,
      );
    }
  }

  const g50 = makeGroups([5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4]);
  const plan50Init = createGlacierPlan({ groups: g50, allStudentIds: g50.flatMap((g) => g.studentIds) });
  const initEntries = Object.entries(plan50Init.initialSpots);
  for (let i = 0; i < initEntries.length; i++) {
    for (let j = i + 1; j < initEntries.length; j++) {
      const [idA, a] = initEntries[i];
      const [idB, b] = initEntries[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      assert.ok(!(dx < 140 && dy < 76), `50명 Act1 겹침: ${idA}(${a.x},${a.y}) vs ${idB}(${b.x},${b.y}) dx=${dx}, dy=${dy}`);
    }
  }

  // 10개 랜덤 시드에서 G1 브리지 대기(13.8s) 중 중앙 받침 주인공↔타 학생 이름표 비침범 검증
  const g28 = sampleGroups28();
  const ids28 = g28.flatMap((g) => g.studentIds);
  for (let s = 0; s < 10; s++) {
    const seedWord = () => ((s * 37 + 13) % 97) / 97;
    const p28 = createGlacierPlan({ groups: g28, allStudentIds: ids28, word: seedWord });
    const midPose = glacierPoseAt(p28, 13800);
    const heroPose = midPose.studentPoses.find((sp) => sp.studentId === p28.climaxSid);
    assert.ok(heroPose);
    for (const sp of midPose.studentPoses) {
      if (sp.studentId !== p28.climaxSid) {
        const dx = Math.abs(sp.x - heroPose.x);
        const dy = Math.abs(sp.y - heroPose.y);
        assert.ok(!(dx < 126 && dy < 46), `시드 ${s}: ${sp.studentId}(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) ↔ 주인공(${heroPose.x.toFixed(1)},${heroPose.y.toFixed(1)}) 이름표 침범`);
      }
      // 타 모둠 깃발 뱃지(anchor by, 뱃지 중심 by-22)와 학생 이름표 중심(sp.y+24) 비겹침 검증
      for (const floe of midPose.floes) {
        const bx = floe.badge.x + (floe.offsetX ?? 0);
        const by = floe.badge.y + (floe.offsetY ?? 0) - 22;
        const dx = Math.abs(sp.x - bx);
        const dy = Math.abs((sp.y + 24) - by);
        assert.ok(!(dx < 110 && dy < 42), `시드 ${s}: ${sp.studentId}(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) ↔ ${floe.name} 깃발(${bx.toFixed(1)},${by.toFixed(1)}) 이름표 침범`);
      }
    }
  }

  // T1 200프레임 대기열 내 가시 이름표(opacity>=0.72) 비겹침 검증
  for (let i = 0; i <= 200; i++) {
    const tp = trainPoseAt(trPlan, (trPlan.totalDurationMs * i) / 200);
    const vis = tp.waitingPositions.filter((w) => w.visible && w.opacity >= 0.72);
    for (let a = 0; a < vis.length; a++) {
      for (let b = a + 1; b < vis.length; b++) {
        const dx = Math.abs(vis[a].x - vis[b].x);
        assert.ok(dx >= 140, `T1 frame ${i}: ${vis[a].studentId}(${vis[a].x.toFixed(1)}) ↔ ${vis[b].studentId}(${vis[b].x.toFixed(1)}) dx=${dx.toFixed(1)} < 140`);
      }
    }
  }
});
