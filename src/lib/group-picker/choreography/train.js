/** Stage 1: '햇살 시골 간이역 모둠 열차' 1600×900 실측 리깅 · 우→좌 주행 ·
 *  결정적 대기열 슬라이드 · 3단계 Z5→Z2 문턱 핸드오프 타임라인 엔진 (PRD §4.2). */
import {
  REDUCED_DURATION_MS,
  clamp,
  mix,
  easeOutCubic,
  easeInOutCubic,
  dampedSpring,
  squashStretch,
  groundShadow,
} from './suspense.js';
import { shuffle } from '../solver.js';

export const TRAIN_STAGE_W = 1600;
export const TRAIN_STAGE_H = 900;
export const TRAIN_WHEEL_R = 36;
export const TRAIN_STOP_X = 800;

/** 1600×900 코어 좌표계 기준 객차 문 개구부(t1-train-body-base 실측 투명 영역 정합) */
export const TRAIN_DOOR_RECT = Object.freeze({
  left: 719,
  right: 881,
  top: 377,
  bottom: 624,
  width: 162,
  height: 247,
});

export const TRAIN_QUEUE_Y = 812;
export const TRAIN_MAX_QUEUE_SLOTS = 4;
export const TRAIN_STUDENT_BASE_H = 192;
export const TRAIN_STUDENT_BASE_W = 124;

/** 원근 지면 배율 연속 함수 (PRD §4.2: Yg=690→0.86, Yg=812→1.034).
 * @param {number} footY */
export function trainGroundScale(footY) {
  return 0.86 + (footY - 690) * (0.30 / 210);
}

/** 대기열 슬롯 실수 순위 r(0..3+) -> 화면 X 좌표 및 진입 페이드.
 *  4석 여유 배치 X_q(k) = 112 + 164k (112, 276, 440, 604), 4 이상은 우측(668)에서 슬라이드·페이드 인.
 * @param {number} rank */
export function queueSlotPosition(rank) {
  if (rank <= 3) {
    return { x: 112 + 164 * Math.max(0, rank), opacity: 1, visible: true };
  }
  if (rank < 4) {
    const enter = 4 - rank; // 0 -> 1
    return {
      x: mix(768, 604, enter),
      opacity: clamp(enter),
      visible: true,
    };
  }
  return { x: 768, opacity: 0, visible: false };
}

/** 학생별 대기열 X(sid, t): 앞순번 탑승 시작 시마다 320ms 동안 정확히 1칸씩 감속 슬라이드(순간이동 ZERO).
 * @param {ReturnType<typeof createTrainPlan>} plan
 * @param {string} sid
 * @param {number} t */
export function queueXAt(plan, sid, t) {
  const rank0 = plan.waitingRankMap?.[sid] ?? -1;
  if (rank0 < 0) return { x: 96, opacity: 0, visible: false, rank: 0 };

  let shifted = 0;
  for (let i = 0; i < rank0; i++) {
    const prevSid = plan.waitingOrder[i];
    const leaveMs = plan.leaveMsByStudent?.[prevSid];
    if (leaveMs !== undefined && t > leaveMs) {
      shifted += easeOutCubic(clamp((t - leaveMs) / 320));
    }
  }
  const rank = Math.max(0, rank0 - shifted);
  return { ...queueSlotPosition(rank), rank };
}

/** 햇살역 모둠 열차 주행 계획 생성(Deterministic timeline + 룩어헤드 대기열 + 티켓 발사 시점 표).
 * @param {object} params
 * @param {{index:number, name:string, color:string, symbol:string, studentIds:string[]}[]} params.groups
 * @param {string[]} params.allStudentIds
 * @param {boolean} [params.reduced]
 * @param {()=>number} [params.word] */
export function createTrainPlan({ groups, allStudentIds, reduced = false, word }) {
  const gCount = groups.length;
  const totalN = allStudentIds.length;
  // 4석 룩어헤드 셔플: 탑승할 학생 100%가 출발 시점엔 이미 가시 슬롯(0..3)에 서 있도록 청크별 무작위 배치
  const boardingSeq = groups.flatMap((g) => g.studentIds);
  const remainIds = allStudentIds.filter((id) => !boardingSeq.includes(id));
  const fullSeq = [...boardingSeq, ...remainIds];
  /** @type {string[]} */
  const waitingOrder = [];
  for (let i = 0; i < fullSeq.length; i += TRAIN_MAX_QUEUE_SLOTS) {
    waitingOrder.push(...shuffle(fullSeq.slice(i, i + TRAIN_MAX_QUEUE_SLOTS), word));
  }

  /** @type {Record<string, number>} */
  const waitingRankMap = {};
  waitingOrder.forEach((sid, idx) => {
    waitingRankMap[sid] = idx;
  });

  if (reduced) {
    /** @type {{studentId:string, groupIndex:number, atMs:number}[]} */
    const ticketEvents = [];
    /** @type {Record<string, number>} */
    const leaveMsByStudent = {};
    let cursor = 140;
    const gap = Math.max(12, Math.floor((REDUCED_DURATION_MS - 260) / Math.max(1, totalN)));
    const cars = groups.map((g) => ({
      groupIndex: g.index,
      name: g.name,
      color: g.color,
      symbol: g.symbol,
      startMs: 0,
      arriveEndMs: 220,
      closeStartMs: REDUCED_DURATION_MS - 120,
      boardEndMs: REDUCED_DURATION_MS - 40,
      departEndMs: REDUCED_DURATION_MS,
      boardings: g.studentIds.map((sid, mi) => {
        const at = cursor;
        leaveMsByStudent[sid] = at;
        ticketEvents.push({ studentId: sid, groupIndex: g.index, atMs: at });
        cursor += gap;
        return {
          studentId: sid,
          slotInCar: mi,
          startMs: at,
          endMs: at + gap,
          commitAt: at,
          isMidRace: false,
          isPhotoFinish: false,
          isPhotoPairLead: false,
          rivalId: null,
        };
      }),
    }));
    return {
      mode: /** @type {const} */ ('train'),
      reduced: true,
      totalDurationMs: REDUCED_DURATION_MS,
      waitingOrder,
      waitingRankMap,
      leaveMsByStudent,
      cars,
      ticketEvents,
    };
  }

  // 비선형 페이싱: 28명/6모둠 기준 ~23.75초 수렴
  const perCarIn = gCount <= 3 ? 1050 : gCount <= 6 ? 820 : 620;
  const perCarOut = gCount <= 3 ? 680 : gCount <= 6 ? 560 : 420;
  const midCarIdx = gCount >= 3 ? Math.floor(gCount / 2) : -1;
  const lastCarIdx = gCount - 1;
  const scaleFactor = Math.max(0.62, Math.min(1.38, 28 / Math.max(6, totalN)));

  /** @type {any[]} */
  const cars = [];
  /** @type {{studentId:string, groupIndex:number, atMs:number, isClimax?:boolean}[]} */
  const ticketEvents = [];
  /** @type {Record<string, number>} */
  const leaveMsByStudent = {};
  /** @type {Record<string, number>} */
  const globalOrderIdx = {};

  // 각 호차에 배정된 학생의 최종 탑승 시작/완료 계산을 위해 globalIdx 기록
  let seqCursor = 0;
  for (let gi = 0; gi < gCount; gi++) {
    for (const sid of groups[gi].studentIds) {
      globalOrderIdx[sid] = seqCursor++;
    }
  }

  let t = 0;

  for (let gi = 0; gi < gCount; gi++) {
    const grp = groups[gi];
    const carStart = t;
    const arriveEnd = carStart + perCarIn;
    t = arriveEnd + 160; // 정차 후 문 개방 대기

    /** @type {any[]} */
    const boardings = [];
    const members = grp.studentIds;

    for (let mi = 0; mi < members.length; mi++) {
      const sid = members[mi];
      const isLastCar = gi === lastCarIdx;
      const isLastOverall = isLastCar && mi === members.length - 1;
      const isPhotoLead = isLastCar && members.length >= 2 && mi === members.length - 2;
      const isPhotoPairSecond = isLastCar && members.length >= 2 && mi === members.length - 1;
      const isMidHighlight = gi === midCarIdx && mi === members.length - 1 && totalN >= 6;

      let stepMs = gi === 0 ? 640 : 410;
      stepMs = Math.round(stepMs * scaleFactor);
      stepMs = Math.max(260, Math.min(720, stepMs));
      if (isMidHighlight) stepMs = Math.max(stepMs, 760);
      if (isPhotoLead || isLastOverall) stepMs = 1050;

      // PRD §4.2 C5:
      // - 포토피니시: 마지막 호차 마지막 2명이 6px y-오프셋으로 나란히 달려와 둘 다 0.25s(250ms) 차로 탑승(패자 없음).
      // - 중반 하이라이트 라이벌: 아직 미탑승 상태(rivalId ∉ committedIds)인 후속 순번 학생으로만 제한!
      let rivalId = null;
      if (isMidHighlight) {
        const mySeq = globalOrderIdx[sid] ?? 0;
        // 아직 탑승하지 않은 후속 학생 중 현재 대기열 앞쪽(슬롯 0..6)에 서 있는 후보 우선
        const laterCandidates = allStudentIds
          .filter((id) => id !== sid && (globalOrderIdx[id] ?? -1) > mySeq)
          .sort((a, b) => (waitingRankMap[a] ?? 999) - (waitingRankMap[b] ?? 999));
        if (laterCandidates.length > 0) {
          rivalId = laterCandidates[0];
        }
      }

      const bStart = t;
      const bEnd = t + stepMs;
      // Phase B 도약 착지 완료(u ≈ 0.82) 직전인 0.78 시점에 확정 티켓 발사
      const commitAt = Math.round(bStart + stepMs * 0.78);
      leaveMsByStudent[sid] = bStart;

      boardings.push({
        studentId: sid,
        slotInCar: mi,
        startMs: bStart,
        endMs: bEnd,
        commitAt,
        isMidRace: isMidHighlight,
        isPhotoFinish: isPhotoLead || isPhotoPairSecond || isLastOverall,
        photoLane: isPhotoLead ? -1 : isPhotoPairSecond ? 1 : 0,
        rivalId,
      });
      ticketEvents.push({
        studentId: sid,
        groupIndex: grp.index,
        atMs: commitAt,
        isClimax: isPhotoPairSecond || (members.length === 1 && isLastOverall),
      });

      if (isPhotoLead) {
        // 마지막 2인은 250ms 차이로 나란히 달려와 둘 다 탑승!
        t = bStart + 250;
      } else {
        t = bEnd + (isLastOverall ? 220 : 60);
      }
    }

    const lastBEnd = boardings.reduce((mx, b) => Math.max(mx, b.endMs), t);
    const closeStartMs = Math.max(t, lastBEnd + 40); // Phase C 착지 완료 후 문 닫힘 시작
    const boardEnd = closeStartMs + 180;
    const departEnd = boardEnd + perCarOut;

    cars.push({
      groupIndex: grp.index,
      name: grp.name,
      color: grp.color,
      symbol: grp.symbol,
      startMs: carStart,
      arriveEndMs: arriveEnd,
      closeStartMs,
      boardEndMs: boardEnd,
      departEndMs: departEnd,
      boardings,
    });
    t = departEnd + 80;
  }

  return {
    mode: /** @type {const} */ ('train'),
    reduced: false,
    totalDurationMs: Math.max(t + 320, 4200),
    waitingOrder,
    waitingRankMap,
    leaveMsByStudent,
    cars,
    ticketEvents,
  };
}

/** 주어진 elapsedMs에서의 햇살역 모둠 열차 무대 전체 물리 포즈 산출(순수 함수, 1600×900 코어 기준).
 * @param {ReturnType<typeof createTrainPlan>} plan
 * @param {number} elapsedMs */
export function trainPoseAt(plan, elapsedMs) {
  const t = clamp(elapsedMs, 0, plan.totalDurationMs);
  const committedIds = new Set(
    plan.ticketEvents.filter((ev) => ev.atMs <= t).map((ev) => ev.studentId),
  );

  const foundIdx = plan.cars.findIndex((c) => t <= c.departEndMs);
  const activeCarIdx = foundIdx >= 0 ? foundIdx : Math.max(0, plan.cars.length - 1);
  const car = plan.cars[activeCarIdx] ?? plan.cars[plan.cars.length - 1];

  // 우측 진입 -> 정중앙(X=800) 정차 -> 좌측 출발 (기관차가 왼쪽을 향함, PRD §4.2)
  const enterStartX = 2280;
  const departEndX = -980;
  let carX = TRAIN_STOP_X;
  let carPitchDeg = 0;
  let chugBobY = 0;
  let doorOpenRatio = 1;

  if (!plan.reduced) {
    if (t < car.arriveEndMs) {
      const u = clamp((t - car.startMs) / Math.max(1, car.arriveEndMs - car.startMs));
      carX = mix(enterStartX, TRAIN_STOP_X, easeOutCubic(u));
      if (u > 0.65) {
        const brakeU = (u - 0.65) / 0.35;
        carPitchDeg = -1.35 * dampedSpring(brakeU, 2.4);
      }
      if (u > 0.80) {
        chugBobY = -2.4 * dampedSpring((u - 0.80) / 0.20, 2.1);
      }
      doorOpenRatio = clamp((u - 0.82) / 0.18);
    } else if (t <= car.boardEndMs) {
      carX = TRAIN_STOP_X;
      const sinceArrive = t - car.arriveEndMs;
      const overshoot = sinceArrive < 260 ? 0.05 * dampedSpring(sinceArrive / 260, 2.0) : 0;
      const closeStart = car.closeStartMs ?? (car.boardEndMs - 160);
      doorOpenRatio = t >= closeStart
        ? clamp((car.boardEndMs - t) / Math.max(1, car.boardEndMs - closeStart))
        : 1 + overshoot;
      if (sinceArrive < 260) {
        chugBobY = -1.6 * dampedSpring(sinceArrive / 260, 2.0);
      }
    } else {
      const u = clamp((t - car.boardEndMs) / Math.max(1, car.departEndMs - car.boardEndMs));
      carX = mix(TRAIN_STOP_X, departEndX, easeInOutCubic(u));
      carPitchDeg = 0.72 * dampedSpring(u, 1.5);
      doorOpenRatio = 0;
    }
  }

  // 바퀴 무미끄럼 회전 (carX 감소 시 음의 각도로 반시계 좌향 회전)
  const traveled = carX - TRAIN_STOP_X;
  if (Math.abs(traveled) > 4) {
    chugBobY += Math.sin(traveled * 0.065) * 1.8;
  }
  const wheelAngleDeg = ((traveled / TRAIN_WHEEL_R) * 180) / Math.PI;
  const crankAngleRad = (traveled / TRAIN_WHEEL_R);

  let act = 1;
  if (activeCarIdx > 0 && activeCarIdx < plan.cars.length - 1) act = 2;
  if (activeCarIdx === plan.cars.length - 1) act = 3;

  // 3단계 문턱 핸드오프(Phase A 승강장 접근 -> Phase B 문턱 도약 -> Phase C 객실 착지)
  /** @type {any[]} */
  const activeBoardings = [];
  let activeSpeech = '';
  let photoFinishCamZoom = 0;

  for (const b of car.boardings) {
    if (t >= b.startMs && t <= b.endMs) {
      const u = (t - b.startMs) / Math.max(1, b.endMs - b.startMs);
      const startSlot = queueXAt(plan, b.studentId, b.startMs);
      const startX = startSlot.x;
      const laneOffsetY = b.photoLane === -1 ? -6 : b.photoLane === 1 ? 0 : 0;
      const startY = TRAIN_QUEUE_Y + laneOffsetY;
      const seatOffsetX = ((b.slotInCar % 3) - 1) * 16;
      const laneXOffset = b.photoLane === -1 ? -18 : b.photoLane === 1 ? 18 : 0;

      let x = startX;
      let y = startY;
      let groundY = startY;
      let scaleX = 1;
      let scaleY = 1;
      let walkLeanDeg = 0;
      let jumpLift = 0;
      let perspScale = trainGroundScale(y);

      if (u <= 0.55) {
        // Phase A: 예비 웅크림(0..0.09) + 대기석 -> 문 앞(800, 700) 지상 접근
        const p = easeInOutCubic(u / 0.55);
        x = mix(startX, TRAIN_STOP_X + laneXOffset, p);
        groundY = mix(startY, 700 + laneOffsetY, p);
        const stepArc = Math.abs(Math.sin((u / 0.55) * Math.PI * 2)) * 22;
        y = groundY - stepArc;
        perspScale = trainGroundScale(groundY);
        jumpLift = stepArc / 48;
        if (u < 0.09) {
          const cp = Math.sin((u / 0.09) * Math.PI);
          scaleX = Number((1 + 0.10 * cp).toFixed(4));
          scaleY = Number((1 - 0.10 * cp).toFixed(4));
        } else {
          walkLeanDeg = Math.sin((u / 0.55) * Math.PI * 4) * 5.2 + 3.2;
        }
      } else if (u <= 0.82) {
        // Phase B: 문턱 도약 포물선 (800, 700) -> (800, 623)
        const p = (u - 0.55) / 0.27;
        const sq = squashStretch(p);
        x = TRAIN_STOP_X + laneXOffset;
        groundY = mix(700 + laneOffsetY, 623, easeOutCubic(p));
        const arcH = b.isPhotoFinish ? 60 : 44;
        y = groundY - sq.jumpY * arcH;
        perspScale = mix(trainGroundScale(700), 0.86, p);
        scaleX = sq.scaleX;
        scaleY = sq.scaleY;
        jumpLift = sq.jumpY;
      } else {
        // Phase C: 객실 내부 착지 후 좌석 슬롯으로 이동 (800, 623 -> seat, 616)
        const p = easeOutCubic((u - 0.82) / 0.18);
        x = mix(TRAIN_STOP_X + laneXOffset, TRAIN_STOP_X + seatOffsetX + laneXOffset * 0.35, p);
        groundY = mix(623, 616, p);
        y = groundY;
        perspScale = 0.86;
      }

      if (b.isPhotoFinish && act === 3) {
        photoFinishCamZoom = Math.max(photoFinishCamZoom, Math.sin(clamp(u) * Math.PI));
      }

      const w = TRAIN_STUDENT_BASE_W * perspScale;
      const h = TRAIN_STUDENT_BASE_H * perspScale;
      // 실측 문 개구부(719..881) 내부로 들어왔을 때만 Z5 -> Z2 전환(절대 팝/잘림 방지)
      const behindDoor =
        y <= 621 &&
        x - w / 2 >= TRAIN_DOOR_RECT.left + 2 &&
        x + w / 2 <= TRAIN_DOOR_RECT.right - 2 &&
        y - h >= TRAIN_DOOR_RECT.top;

      // 중반 하이라이트 라이벌 (아직 미탑승한 후속 학생만, bump(u)로 제자리 복귀해 순간이동 없음)
      let rivalPose = null;
      if (b.rivalId && !committedIds.has(b.rivalId)) {
        const rHome = queueXAt(plan, b.rivalId, t);
        const bump = Math.sin(clamp(u) * Math.PI);
        const hop = Math.abs(Math.sin(clamp(u) * Math.PI * 3)) * 16;
        const ry = mix(TRAIN_QUEUE_Y, 728, bump * 0.48);
        rivalPose = {
          studentId: b.rivalId,
          x: mix(rHome.x, 730, bump * 0.52),
          y: ry - hop,
          groundY: ry,
          perspScale: trainGroundScale(ry),
          walkLeanDeg: bump * 5.5,
          shadow: groundShadow(hop / 36),
        };
      }

      const entry = {
        studentId: b.studentId,
        slotInCar: b.slotInCar,
        u,
        x,
        y,
        groundY,
        perspScale,
        scaleX,
        scaleY,
        walkLeanDeg: Number(walkLeanDeg.toFixed(2)),
        jumpLift,
        shadow: groundShadow(jumpLift),
        behindDoor,
        isPhotoFinish: b.isPhotoFinish,
        isMidRace: b.isMidRace,
        rivalId: rivalPose ? b.rivalId : null,
        rivalPose,
        bannerHoldKey: b.studentId,
      };
      activeBoardings.push(entry);

      if (b.isPhotoFinish) {
        activeSpeech = '마지막 두 친구 나란히 탑승!';
      } else if (b.isMidRace) {
        activeSpeech = '내가 먼저 탈래! 두근두근!';
      } else {
        activeSpeech = `${car.name} 승차 중!`;
      }
    }
  }

  // 최근 확정된 영웅 호명 콜아웃 (commitAt..commitAt+900ms)
  let heroCallout = null;
  for (let i = car.boardings.length - 1; i >= 0; i--) {
    const b = car.boardings[i];
    if (t >= b.commitAt && t <= b.commitAt + 900) {
      heroCallout = {
        studentId: b.studentId,
        groupIndex: car.groupIndex,
        groupName: car.name,
        progress: clamp((t - b.commitAt) / 900),
      };
      break;
    }
  }

  const boarding = activeBoardings[activeBoardings.length - 1] ?? null;

  if (!activeSpeech) {
    if (t < car.arriveEndMs) {
      activeSpeech = `${car.name} 열차가 햇살역으로 들어와요!`;
    } else if (t > car.boardEndMs) {
      activeSpeech = `${car.name} 출발! 칙칙폭폭~`;
    } else {
      activeSpeech = `${car.name} 문이 활짝 열렸어요`;
    }
  }

  const activeBoardingIds = new Set(activeBoardings.map((ab) => ab.studentId));
  const activeRivalIds = new Set(activeBoardings.map((ab) => ab.rivalId).filter(Boolean));

  const currentInCar = car.boardings
    .filter((/** @type {any} */ b) => committedIds.has(b.studentId) && !activeBoardingIds.has(b.studentId))
    .map((/** @type {any} */ b) => b.studentId);

  // 객실 내 가시 최대 7명(문 정면 3 + 좌우 창 2+2), 초과 +N 배지
  const overflowInCarCount = Math.max(0, currentInCar.length - 7);

  // 대기 승강장 남은 학생 목록 (활성 탑승/라이벌 제외, 이미 떠난 학생 제외)
  const leftSet = new Set(
    Object.entries(plan.leaveMsByStudent ?? {})
      .filter(([, ms]) => t >= ms)
      .map(([sid]) => sid),
  );
  const waitingStudents = plan.waitingOrder.filter(
    (sid) => !committedIds.has(sid) && !leftSet.has(sid) && !activeBoardingIds.has(sid),
  );

  const waitingPositions = waitingStudents.map((sid) => {
    const q = queueXAt(plan, sid, t);
    const isTemporarilyRacing = activeRivalIds.has(sid);
    return {
      studentId: sid,
      x: q.x,
      y: TRAIN_QUEUE_Y,
      perspScale: trainGroundScale(TRAIN_QUEUE_Y),
      opacity: isTemporarilyRacing ? 0 : q.opacity,
      visible: q.visible && !isTemporarilyRacing,
      rank: q.rank,
    };
  });
  const queueHiddenCount = Math.max(0, waitingStudents.length - TRAIN_MAX_QUEUE_SLOTS);

  // 증기 퍼프: 우->좌 주행 반대방향(+vx 우측 바람) + 상승 드리프트 (출발 시 5개로 증폭)
  const chimneyX = carX - 420;
  const isDeparting = !plan.reduced && t >= (car.closeStartMs ?? car.boardEndMs) && t <= car.departEndMs;
  const isMoving = Math.abs(carX - TRAIN_STOP_X) > 6 || t < car.arriveEndMs + 220 || isDeparting;
  const steamCount = isDeparting ? 5 : 3;
  const steamPuffs = isMoving
    ? Array.from({ length: steamCount }, (_, idx) => {
        const phase = ((t * (isDeparting ? 0.0014 : 0.001) + idx / steamCount) % 1);
        return {
          idx,
          x: chimneyX + phase * (isDeparting ? 155 : 110),
          y: 350 - phase * (isDeparting ? 128 : 95) - Math.sin(phase * Math.PI) * 14,
          scale: (isDeparting ? 0.65 : 0.55) + phase * 0.78,
          opacity: (1 - phase) * (isDeparting ? 0.88 : 0.78),
        };
      })
    : [];

  const camera = {
    x: 0,
    y: 0,
    scale: Number((1 + 0.045 * photoFinishCamZoom).toFixed(4)),
    originX: 800,
    originY: 520,
  };

  return {
    act,
    carIndex: activeCarIdx,
    car,
    carX,
    carPitchDeg,
    chugBobY: Number(chugBobY.toFixed(2)),
    wheelAngleDeg,
    crankAngleRad,
    doorOpenRatio,
    boarding,
    activeBoardings,
    heroCallout,
    inCarStudentIds: currentInCar,
    overflowInCarCount,
    waitingStudents,
    waitingPositions,
    queueHiddenCount,
    committedIds,
    activeSpeech,
    steamPuffs,
    camera,
    progressRatio: clamp(t / plan.totalDurationMs),
  };
}
