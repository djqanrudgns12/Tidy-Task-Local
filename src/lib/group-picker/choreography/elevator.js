/** Stage 3: '파스텔 그랜드 부티크 호텔 엘리베이터' 1600×900 실측 리깅 ·
 *  4F(-67.5°)→1F(+67.5°) 아날로그 다이얼 · Z3.5 문틈 손 분리 ·
 *  중앙 통로(640..960) 개방 러그 양날개 착지 엔진 (~25.16초 @ 28명/6모둠, PRD §4.4). */
import {
  REDUCED_DURATION_MS,
  clamp,
  mix,
  easeOutCubic,
  easeInOutCubic,
  dampedSpring,
  squashStretch,
  groundShadow,
  computeHoldBudget,
} from './suspense.js';

export const ELEVATOR_W = 1600;
export const ELEVATOR_H = 900;
export const ELEVATOR_DOOR_W = 133;
export const ELEVATOR_STUDENT_BASE_H = 286;
export const ELEVATOR_HEAD_W = 110;

export const ELEVATOR_APERTURE = Object.freeze({
  left: 666.4,
  right: 932.4,
  top: 308,
  bottom: 770,
  centerX: 799.4,
  width: 266,
  height: 462,
});

export const ELEVATOR_DIAL_PIVOT = Object.freeze({ x: 800, y: 234 });

/** 로비 러그 양날개 착지 좌표 산출 (중앙 통로 X∈[640,960] 개방 + 우벽 호출버튼 회피, PRD §4.4).
 * @param {number} slotIdx 0..n-1
 * @param {number} totalInCar */
export function rugSlotPosition(slotIdx, totalInCar) {
  const n = totalInCar > 24 ? 16 : Math.max(1, totalInCar);
  const idx = totalInCar > 24 ? (slotIdx % 16) : slotIdx;
  const nRow = n <= 6 ? 1 : n <= 16 ? 2 : 3;
  const perWingRow = Math.ceil(n / (2 * nRow));
  const spacing = Math.min(148, 320 / Math.max(1, perWingRow - 1));

  const isLeftWing = idx % 2 === 0;
  const wingIdx = Math.floor(idx / 2);
  const row = Math.min(nRow - 1, Math.floor(wingIdx / Math.max(1, perWingRow)));
  const col = wingIdx % Math.max(1, perWingRow);
  const stagger = row % 2 === 1 ? spacing / 2 : 0;

  const x = isLeftWing
    ? 446 - spacing * col - stagger
    : 1184 + spacing * col + stagger;
  const y = [808, 846, 878][row] ?? 846;
  const scale = [0.95, 1.0, 1.04][row] ?? 1.0;

  return { x, y, scale, row, isLeftWing };
}

/** 반원 아날로그 다이얼 각도 계산 (4F:-67.5°, 3F:-22.5°, 2F:+22.5°, 1F:+67.5°).
 *  2F(u 0.56..0.70)에서 약 120ms 멈칫 후 1F(+67.5° + 4° 스프링 복귀).
 * @param {number} u 0..1 */
export function computeDialPose(u) {
  const t = clamp(u);
  let deg = 67.5;
  if (t < 0.30) {
    deg = mix(-67.5, -22.5, easeOutCubic(t / 0.30));
  } else if (t < 0.56) {
    deg = mix(-22.5, 22.5, easeInOutCubic((t - 0.30) / 0.26));
  } else if (t < 0.70) {
    const pauseU = (t - 0.56) / 0.14;
    deg = 22.5 + Math.sin(pauseU * Math.PI) * 1.4;
  } else if (t < 0.90) {
    deg = mix(22.5, 71.5, easeInOutCubic((t - 0.70) / 0.20));
  } else {
    deg = mix(71.5, 67.5, easeOutCubic((t - 0.90) / 0.10));
  }

  let floor = '1F';
  if (deg < -45) floor = '4F';
  else if (deg < 0) floor = '3F';
  else if (deg < 45) floor = '2F';

  return { angleDeg: Number(deg.toFixed(2)), floor };
}

/** Stage 3 엘리베이터 주행 계획 생성.
 * @param {object} params
 * @param {{index:number, name:string, color:string, symbol:string, studentIds:string[]}[]} params.groups
 * @param {string[]} params.allStudentIds
 * @param {boolean} [params.reduced] */
export function createElevatorPlan({ groups, allStudentIds, reduced = false }) {
  const gCount = groups.length;
  const totalN = allStudentIds.length;

  if (reduced) {
    /** @type {{studentId:string, groupIndex:number, atMs:number}[]} */
    const ticketEvents = [];
    let cur = 140;
    const gap = Math.max(12, Math.floor((REDUCED_DURATION_MS - 260) / Math.max(1, totalN)));
    const cars = groups.map((g) => ({
      groupIndex: g.index,
      name: g.name,
      color: g.color,
      symbol: g.symbol,
      startMs: 0,
      arriveMs: 180,
      openEndMs: 260,
      closeStartMs: REDUCED_DURATION_MS - 120,
      endMs: REDUCED_DURATION_MS,
      exits: g.studentIds.map((sid, idx) => {
        const at = cur;
        ticketEvents.push({ studentId: sid, groupIndex: g.index, atMs: at });
        cur += gap;
        return {
          studentId: sid,
          slot: idx,
          totalInCar: g.studentIds.length,
          rugSlot: rugSlotPosition(idx, g.studentIds.length),
          startMs: at,
          endMs: at + gap,
          commitAt: at,
          isDoorGapSurprise: false,
        };
      }),
    }));
    return {
      mode: /** @type {const} */ ('elevator'),
      reduced: true,
      totalDurationMs: REDUCED_DURATION_MS,
      cars,
      ticketEvents,
    };
  }

  // 2-Pass 비선형 페이싱 + 60초 예산 문턱 스포트라이트 홀드(PRD §3.8)
  const scaleFactor = Math.max(0.65, Math.min(1.35, 28 / Math.max(6, totalN)));
  const dialSweepMs = gCount <= 4 ? 1120 : gCount <= 6 ? 880 : 660;
  const doorMs = 360;

  /** @param {number} revealHoldMs @param {number} groupHoldMs */
  function buildSchedule(revealHoldMs, groupHoldMs) {
    /** @type {any[]} */
    const cars = [];
    /** @type {{studentId:string, groupIndex:number, atMs:number, isClimax?:boolean}[]} */
    const ticketEvents = [];
    let t = 0;

    for (let gi = 0; gi < gCount; gi++) {
      const grp = groups[gi];
      const startMs = t;
      const arriveMs = startMs + dialSweepMs;
      const openEndMs = arriveMs + doorMs;
      t = openEndMs + 100;

      /** @type {any[]} */
      const exits = [];
      const totalInCar = grp.studentIds.length;

      for (let mi = 0; mi < totalInCar; mi++) {
        const sid = grp.studentIds[mi];
        const isLastOverall = gi === gCount - 1 && mi === totalInCar - 1;
        let stepMs = Math.round((gi === 0 ? 600 : 410) * scaleFactor);
        stepMs = Math.max(270, Math.min(680, stepMs));

        const studentHoldMs = revealHoldMs <= 0
          ? 0
          : isLastOverall
            ? Math.min(280, revealHoldMs)
            : (totalN >= 25 && mi > 0 && mi < totalInCar - 1)
              ? Math.max(160, Math.round(revealHoldMs * 0.6))
              : revealHoldMs;

        if (isLastOverall) {
          stepMs = 1750 + studentHoldMs;
          const exStart = t;
          const exEnd = t + stepMs;
          const commitAt = Math.round(exStart + stepMs * 0.88);
          exits.push({
            studentId: sid,
            slot: mi,
            totalInCar,
            rugSlot: rugSlotPosition(mi, totalInCar),
            startMs: exStart,
            revealAt: Math.round(exStart + stepMs * 0.85),
            walkAt: Math.round(exStart + stepMs * 0.90),
            endMs: exEnd,
            commitAt,
            holdMs: studentHoldMs,
            isDoorGapSurprise: true,
          });
          ticketEvents.push({
            studentId: sid,
            groupIndex: grp.index,
            atMs: commitAt,
            isClimax: true,
          });
          t = exEnd + 65;
          continue;
        }

        const stepOutMs = Math.round(stepMs * 0.30);
        const walkToRugMs = Math.max(180, stepMs - stepOutMs);
        const exStart = t;
        const revealAt = exStart + stepOutMs;
        const walkAt = revealAt + studentHoldMs;
        const exEnd = walkAt + walkToRugMs;
        const commitAt = studentHoldMs > 0 ? revealAt : Math.round(exStart + stepMs * 0.72);

        exits.push({
          studentId: sid,
          slot: mi,
          totalInCar,
          rugSlot: rugSlotPosition(mi, totalInCar),
          startMs: exStart,
          revealAt,
          walkAt,
          endMs: exEnd,
          commitAt,
          holdMs: studentHoldMs,
          isDoorGapSurprise: false,
        });
        ticketEvents.push({
          studentId: sid,
          groupIndex: grp.index,
          atMs: commitAt,
          isClimax: false,
        });
        t = exEnd + 65;
      }

      const closeStartMs = t + Math.max(140, groupHoldMs);
      const endMs = closeStartMs + 380;
      cars.push({
        groupIndex: grp.index,
        name: grp.name,
        color: grp.color,
        symbol: grp.symbol,
        startMs,
        arriveMs,
        openEndMs,
        closeStartMs,
        endMs,
        exits,
      });
      t = endMs + 90;
    }

    return {
      totalDurationMs: Math.max(t + 300, 4400),
      cars,
      ticketEvents,
    };
  }

  const basePass = buildSchedule(0, 0);
  const { revealHoldMs, groupHoldMs } = computeHoldBudget({
    baseMs: basePass.totalDurationMs,
    totalN,
    groupCount: gCount,
    reduced: false,
  });
  const finalSchedule = buildSchedule(revealHoldMs, groupHoldMs);

  return {
    mode: /** @type {const} */ ('elevator'),
    reduced: false,
    revealHoldMs,
    groupHoldMs,
    totalDurationMs: finalSchedule.totalDurationMs,
    cars: finalSchedule.cars,
    ticketEvents: finalSchedule.ticketEvents,
  };
}

/** 주어진 elapsedMs에서의 부티크 로비 엘리베이터 포즈 산출(1600×900 코어 기준).
 * @param {ReturnType<typeof createElevatorPlan>} plan
 * @param {number} elapsedMs */
export function elevatorPoseAt(plan, elapsedMs) {
  const t = clamp(elapsedMs, 0, plan.totalDurationMs);
  const committedIds = new Set(
    plan.ticketEvents.filter((ev) => ev.atMs <= t).map((ev) => ev.studentId),
  );

  const foundIdx = plan.cars.findIndex((c) => t <= c.endMs);
  const activeIdx = foundIdx >= 0 ? foundIdx : Math.max(0, plan.cars.length - 1);
  const car = plan.cars[activeIdx] ?? plan.cars[plan.cars.length - 1];
  const gCount = plan.cars.length;

  let act = 1;
  if (activeIdx > 0 && activeIdx < gCount - 1) act = 2;
  if (activeIdx === gCount - 1) act = 3;

  let dialAngleDeg = 67.5;
  let dialFloor = '1F';
  let bellRing = false;
  let doorOpen = 1;
  let cabSettleY = 0;
  let doorQuiverX = 0;

  if (!plan.reduced) {
    if (t < car.arriveMs) {
      const u = clamp((t - car.startMs) / Math.max(1, car.arriveMs - car.startMs));
      const dial = computeDialPose(u);
      dialAngleDeg = dial.angleDeg;
      dialFloor = dial.floor;
      doorOpen = 0;
      bellRing = u > 0.94;
      if (u > 0.88) {
        cabSettleY = -5.5 * dampedSpring((u - 0.88) / 0.12, 1.8);
      }
    } else if (t < car.openEndMs) {
      const u = clamp((t - car.arriveMs) / Math.max(1, car.openEndMs - car.arriveMs));
      doorOpen = easeOutCubic(u);
      bellRing = u < 0.45;
      if (u < 0.5) {
        cabSettleY = -4.2 * dampedSpring(u / 0.5, 2.2);
      }
    } else if (t >= car.closeStartMs) {
      const u = clamp((t - car.closeStartMs) / Math.max(1, car.endMs - car.closeStartMs));
      doorOpen = 1 - easeInOutCubic(u);
    }
  }

  let exiting = null;
  let surprisePeek = null;
  let camPeekZoom = 0;
  let activeSpeech = `${car.name} 엘리베이터 이동 중`;

  for (const ex of car.exits) {
    if (t >= ex.startMs && t <= ex.endMs) {
      const dur = Math.max(1, ex.endMs - ex.startMs);
      const u = (t - ex.startMs) / dur;
      const target = ex.rugSlot;

      if (ex.isDoorGapSurprise && !plan.reduced) {
        if (u >= 0.24 && u <= 0.88) {
          camPeekZoom = Math.sin(clamp((u - 0.24) / 0.64) * Math.PI);
        }
        // u 0.00..0.28: 문 거의 닫힘 (1.0 -> 0.18)
        // u 0.28..0.60: 문틈 18%(48px) 사이 Z2 팔/얼굴 + Z3.5 우측 문 손가락 네 개 등장 + 문짝 떨림
        // u 0.60..0.78: 문 재개방 (0.18 -> 1.0), 손가락 6px 미끄러지며 120ms 페이드아웃
        // u 0.78..1.00: X = peekHeadX 에서 끊김 없이 로비 러그 슬롯으로 원근 하차!
        const gapHalfAt18 = 0.18 * ELEVATOR_DOOR_W;
        const maxPeekHeadX =
          ELEVATOR_APERTURE.centerX - gapHalfAt18 + 0.30 * ELEVATOR_HEAD_W + 24;

        if (u < 0.28) {
          doorOpen = mix(1.0, 0.18, easeInOutCubic(u / 0.28));
          activeSpeech = `${car.name} 마지막 확인 중`;
        } else if (u < 0.60) {
          doorOpen = 0.18;
          doorQuiverX = Math.sin(t * 0.065) * 2.4;
          const peekProgress = clamp((u - 0.28) / 0.18);
          const peekHeadX =
            ELEVATOR_APERTURE.centerX -
            doorOpen * ELEVATOR_DOOR_W +
            0.30 * ELEVATOR_HEAD_W +
            24 * peekProgress;
          surprisePeek = {
            studentId: ex.studentId,
            peekProgress,
            peekHeadX,
            y: 745,
            scale: 0.84,
            fingersX: ELEVATOR_APERTURE.centerX + doorOpen * ELEVATOR_DOOR_W,
            fingersY: 530,
            fingersSlideX: 0,
            fingersOpacity: clamp(peekProgress * 1.25),
          };
          activeSpeech = '잠깐만요, 마지막 친구 도착';
        } else if (u < 0.78) {
          const reopenU = (u - 0.60) / 0.18;
          doorOpen = mix(0.18, 1.0, easeOutCubic(reopenU));
          const elapsedSinceReopenMs = reopenU * 0.18 * dur;
          const fingersFade = clamp(1 - elapsedSinceReopenMs / 120);
          surprisePeek = {
            studentId: ex.studentId,
            peekProgress: 1,
            peekHeadX: maxPeekHeadX,
            y: 745,
            scale: 0.84,
            fingersX: ELEVATOR_APERTURE.centerX + doorOpen * ELEVATOR_DOOR_W,
            fingersY: 530,
            fingersSlideX: 6 * easeOutCubic(clamp(reopenU * 1.6)),
            fingersOpacity: fingersFade,
          };
          activeSpeech = `${car.name} 마지막 합류`;
        } else {
          const walkU = clamp((u - 0.78) / 0.22);
          doorOpen = 1.0;
          // u=0.78 프레임 X = peekHeadX 로 연속 연결, u=1.0 끝점 = rugSlotPosition 일치!
          let x;
          let y;
          let scale;
          let isHolding = false;
          let walkLeanDeg = 0;
          let hop = 0;
          let sq = { scaleX: 1, scaleY: 1 };

          if (walkU <= 0.30) {
            const p = easeOutCubic(walkU / 0.30);
            sq = squashStretch(p * 0.45);
            x = mix(maxPeekHeadX, ELEVATOR_APERTURE.centerX, p);
            y = mix(745, 776, p);
            scale = mix(0.84, 0.94, p);
            hop = Math.abs(Math.sin(p * Math.PI)) * 18;
            walkLeanDeg = Number((Math.sin(p * Math.PI * 2) * 4.5).toFixed(2));
          } else if (walkU <= 0.50 && (ex.holdMs ?? 0) > 0) {
            isHolding = true;
            x = ELEVATOR_APERTURE.centerX;
            y = 776;
            scale = 0.96;
            const pulse = Math.sin(((walkU - 0.30) / 0.20) * Math.PI);
            sq = { scaleX: Number((1 - 0.025 * pulse).toFixed(4)), scaleY: Number((1 + 0.03 * pulse).toFixed(4)) };
          } else {
            const moveStart = (ex.holdMs ?? 0) > 0 ? 0.50 : 0.30;
            const p = easeOutCubic(clamp((walkU - moveStart) / (1 - moveStart)));
            sq = squashStretch(clamp(0.35 + p * 0.65));
            x = mix(ELEVATOR_APERTURE.centerX, target.x, p);
            y = mix(776, target.y, p);
            scale = mix(0.94, target.scale, p);
            hop = Math.abs(Math.sin(p * Math.PI * 2)) * 22;
            walkLeanDeg = Number((Math.sin(p * Math.PI * 3) * 4.8).toFixed(2));
          }
          exiting = {
            studentId: ex.studentId,
            slot: ex.slot,
            x,
            y: y - hop,
            groundY: y,
            scale,
            scaleX: sq.scaleX,
            scaleY: sq.scaleY,
            walkLeanDeg,
            yLift: hop,
            isHolding,
            shadow: groundShadow(hop / 36),
          };
          activeSpeech = `${car.name} 도착 완료`;
        }
      } else {
        const revealAt = ex.revealAt ?? Math.round(ex.startMs + dur * 0.30);
        const walkAt = ex.walkAt ?? revealAt;
        let x;
        let y;
        let scale;
        let isHolding = false;
        let sq = { scaleX: 1, scaleY: 1 };
        let hop = 0;
        let walkLeanDeg = 0;

        if (t <= revealAt) {
          const p = easeOutCubic(clamp((t - ex.startMs) / Math.max(1, revealAt - ex.startMs)));
          sq = squashStretch(p * 0.45);
          x = ELEVATOR_APERTURE.centerX;
          y = mix(745, 776, p);
          scale = mix(0.84, 0.94, p);
          hop = Math.abs(Math.sin(p * Math.PI)) * 12;
          walkLeanDeg = Number((Math.sin(p * Math.PI * 2) * 3.6).toFixed(2));
        } else if (t < walkAt) {
          isHolding = true;
          const hp = clamp((t - revealAt) / Math.max(1, walkAt - revealAt));
          const pulse = Math.sin(hp * Math.PI);
          x = ELEVATOR_APERTURE.centerX;
          y = 776;
          scale = 0.96;
          sq = { scaleX: Number((1 - 0.025 * pulse).toFixed(4)), scaleY: Number((1 + 0.03 * pulse).toFixed(4)) };
        } else {
          const p = easeOutCubic(clamp((t - walkAt) / Math.max(1, ex.endMs - walkAt)));
          sq = squashStretch(clamp(0.35 + p * 0.65));
          x = mix(ELEVATOR_APERTURE.centerX, target.x, p);
          y = mix(776, target.y, p);
          scale = mix(0.94, target.scale, p);
          hop = Math.abs(Math.sin(p * Math.PI * 1.5)) * 20;
          walkLeanDeg = Number((Math.sin(p * Math.PI * 3) * 4.5).toFixed(2));
        }
        exiting = {
          studentId: ex.studentId,
          slot: ex.slot,
          x,
          y: y - hop,
          groundY: y,
          scale,
          scaleX: sq.scaleX,
          scaleY: sq.scaleY,
          walkLeanDeg,
          yLift: hop,
          isHolding,
          shadow: groundShadow(hop / 36),
        };
        activeSpeech = isHolding ? `${car.name} 도착 확인` : `${car.name} 하차 중`;
      }
      break;
    }
  }

  let heroCallout = null;
  for (let i = car.exits.length - 1; i >= 0; i--) {
    const ex = car.exits[i];
    if (t >= ex.commitAt && t <= ex.commitAt + 900) {
      heroCallout = {
        studentId: ex.studentId,
        groupIndex: car.groupIndex,
        groupName: car.name,
        x: ex.rugSlot.x,
        y: ex.rugSlot.y,
        progress: clamp((t - ex.commitAt) / 900),
      };
      break;
    }
  }

  if (!exiting && !surprisePeek && t >= car.openEndMs && t < car.closeStartMs) {
    activeSpeech = `${car.name} · 1층 도착 완료`;
  }

  const gapHalf = doorOpen * ELEVATOR_DOOR_W;
  const arrivedHere = car.exits
    .filter((/** @type {any} */ ex) => committedIds.has(ex.studentId) && exiting?.studentId !== ex.studentId);

  // 로비 러그 착지 학생 배치 (n>24 시 최근 16명 전신 + "+N", y 오름차순 깊이 정렬)
  const visibleArrived = arrivedHere.length > 16 ? arrivedHere.slice(-16) : arrivedHere;
  const rugOverflowCount = Math.max(0, arrivedHere.length - visibleArrived.length);
  const arrivedPositions = visibleArrived
    .map((/** @type {any} */ ex) => ({
      studentId: ex.studentId,
      slot: ex.slot,
      x: ex.rugSlot.x,
      y: ex.rugSlot.y,
      scale: ex.rugSlot.scale,
      row: ex.rugSlot.row,
    }))
    .sort((/** @type {{y:number}} */ a, /** @type {{y:number}} */ b) => a.y - b.y);

  const insideCarIds = car.exits
    .filter(
      (/** @type {any} */ ex) =>
        !committedIds.has(ex.studentId) &&
        exiting?.studentId !== ex.studentId &&
        surprisePeek?.studentId !== ex.studentId,
    )
    .map((/** @type {any} */ ex) => ex.studentId);

  return {
    act,
    activeGroupIndex: activeIdx,
    car,
    dialAngleDeg,
    dialFloor,
    bellRing,
    doorOpen,
    cabSettleY: Number(cabSettleY.toFixed(2)),
    doorQuiverX: Number(doorQuiverX.toFixed(2)),
    gapHalf,
    leftDoorRightX: ELEVATOR_APERTURE.centerX - gapHalf,
    rightDoorLeftX: ELEVATOR_APERTURE.centerX + gapHalf,
    exiting,
    surprisePeek,
    heroCallout,
    camera: {
      x: 0,
      y: 0,
      scale: Number((1 + 0.055 * camPeekZoom).toFixed(4)),
      originX: 800,
      originY: 520,
    },
    arrivedHere: arrivedHere.map((/** @type {any} */ ex) => ex.studentId),
    arrivedPositions,
    rugOverflowCount,
    insideCarIds: insideCarIds.slice(0, 3),
    insideCarOverflowCount: Math.max(0, insideCarIds.length - 3),
    committedIds,
    activeSpeech,
    progressRatio: clamp(t / plan.totalDurationMs),
  };
}
