/** 주사위 연출 계산 — DOM 없이 자세·높이·시간만 만듭니다. 결과(눈)는 engine.js가 먼저 정하고, 여기서는 그 면에 착지하도록 끝에서부터 거꾸로 짭니다.
 *
 * 한 번 던지기의 흐름(주사위마다 조금씩 다름):
 *   움츠림 → 높이 던져져 두 바퀴 이상 구름 → 바닥에 부딪혀 두 번 더 튐(점점 낮게·느리게)
 *   → 바닥에서 모서리를 넘어 한두 번 굴러감(옆으로 미끄러지며 돎) → 살짝 흔들리다 멈춤.
 * 공중에서는 회전 속도가 일정하고(실제 물체처럼), 부딪히는 순간에만 회전 축·속도가 바뀝니다.
 * 높이는 "자세상 가장 낮은 점이 바닥 아래로 내려가지 않게" 매 순간 올려 줘서, 모서리로 떨어지고 모서리를 딛고 넘어가는 모습이 저절로 나옵니다. */
import { clampCount } from './engine.js';
import { BEVEL, FACE_FRAMES } from './geometry.js';
import { axisAngle, mul, slerp, rotate, toMat3, fromRows, normalize3 } from './rotation.js';

/** @typedef {import('./rotation.js').Quat} Quat */
/** @typedef {import('./rotation.js').Vec3} Vec3 */

const UP = /** @type {Vec3} */ ([0, 1, 0]);
const SIDE = /** @type {Vec3} */ ([1, 0, 0]);

export const CROUCH_MS = 110; // 움츠림(던지기 직전의 예비 동작)
export const SQUINT_MS = CROUCH_MS + 70; // "> <" 얼굴을 보여 주는 시간
export const SETTLE_MS = 210; // 마지막으로 눕고 나서 흔들리다 멈추는 시간
export const TIP_MS = Object.freeze({ single: [270], double: [220, 270] }); // 바닥에서 모서리를 넘어 한 번 구르는 시간
export const IMPACT_MS = 120; // 부딪힌 뒤 찌그러졌다 돌아오는 시간
export const STAGGER_MS = 90;
export const JITTER_MS = 40;
export const REDUCED_MS = 200;
// 3개를 어긋나게 던져도 마지막 주사위가 이 시간 안에 멈춰야 합니다. 예전(1.3초)보다 조금 길게 — 충분히 구르는 게 보이도록.
export const MAX_ROLL_MS = 1900;
/** 중력(한 변/ms²). 첫 비행(한 변의 0.5~0.64배 높이)이 0.40~0.45초가 되는 값 — 교실 화면에서 "휙"이 아니라 "휘익 톡톡"으로 보이는 빠르기. */
export const GRAVITY = 2.5e-5;
const TURNS = 2; // 첫 비행에서 도는 바퀴 수(자세 보정분은 별도)
const TIP_EASE = 0.55; // 모서리를 넘을 때 꼭대기(45°)에서 느려지고 떨어지며 빨라지는 정도
const ROCK_DEG = 7; // 눕고 나서 반대쪽 모서리로 살짝 들렸다 돌아오는 각도

const clamp01 = (/** @type {number} */ v) => Math.min(1, Math.max(0, v));
const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;
const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t);
const easeOut = (/** @type {number} */ t) => 1 - (1 - t) ** 3;
const add = (/** @type {Vec3} */ a, /** @type {Vec3} */ b, k = 1) => /** @type {Vec3} */ ([a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]);

/** 연출 전용 씨앗 난수(mulberry32). 결과용 crypto 난수와 분리해야 같은 씨앗으로 테스트가 재현됩니다.
 * @param {number} seed */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 값 → 그 면이 정면(보는 사람 쪽)을 향하고 그림이 똑바로 선 자세. yaw는 멈췄을 때 살짝 틀어진 각도(세로축 기준).
 * @param {number} value @param {number} [yawDeg] @returns {Quat} */
export function restQuat(value, yawDeg = 0) {
  const frame = FACE_FRAMES[/** @type {1} */ (value)];
  if (!frame) throw new Error('주사위 눈은 1~6이어야 해요.');
  const face = fromRows(/** @type {Vec3} */ (frame.right), /** @type {Vec3} */ (frame.up), /** @type {Vec3} */ (frame.normal));
  return mul(axisAngle(UP, yawDeg), face);
}

/** 중심에서 가장 낮은 점까지의 높이(중심~면 = 1 기준). 반듯이 누우면 1, 모서리로 서면 약 1.26, 꼭짓점으로 서면 약 1.45.
 * @param {Quat} q */
export function supportHeight(q) {
  const m = toMat3(q);
  return (1 - BEVEL) * (Math.abs(m[3]) + Math.abs(m[4]) + Math.abs(m[5])) + BEVEL;
}
/** 바닥에 닿아 있을 때 중심 높이(한 변 단위). @param {Quat} q */
const restingCenter = (q) => supportHeight(q) / 2;

/** 가장 정면을 보는 면(1~6). 화면에 무엇이 보이는지 확인할 때 씁니다. @param {Quat} q */
export function frontFace(q) {
  let best = 1;
  let bestZ = -Infinity;
  for (const [value, frame] of Object.entries(FACE_FRAMES)) {
    const z = rotate(q, /** @type {Vec3} */ (frame.normal))[2];
    if (z > bestZ) { bestZ = z; best = Number(value); }
  }
  return best;
}

/** @typedef {{delay:number, reduced:boolean, height:number, bounce2:number, bounce3:number, tips:1|2, tipSign:number, skid:number,
 *   restYaw:number, alpha2:number, alpha3:number, jitter:[Vec3,Vec3,Vec3], drift:number}} DiePlan */

/** 주사위마다 조금씩 다른 던지기 계획. 똑같이 움직이면 기계처럼 보여서 출발·높이·튐·구르는 횟수·미끄러짐을 모두 흩뜨립니다.
 * @param {number} count @param {() => number} rng @param {boolean} reduced @returns {DiePlan[]} */
export function rollPlan(count, rng, reduced) {
  const n = clampCount(count);
  // 좌우로 살짝 흩어지는 방향은 한 번 던질 때 모두 같게 — 이웃 주사위와 엇갈려 겹치지 않게 합니다.
  const side = rng() < 0.5 ? -1 : 1;
  const vec = () => /** @type {Vec3} */ ([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]);
  return Array.from({ length: n }, (_, i) => {
    if (reduced)
      return { delay: 0, reduced: true, height: 0, bounce2: 0, bounce3: 0, tips: 1, tipSign: 1, skid: 0, restYaw: 0, alpha2: 0, alpha3: 0, jitter: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], drift: 0 };
    return {
      delay: Math.round(i * STAGGER_MS + rng() * JITTER_MS),
      reduced: false,
      height: 0.5 + rng() * 0.14,
      bounce2: 0.2 + rng() * 0.06,
      bounce3: 0.28 + rng() * 0.06,
      tips: rng() < 0.55 ? 1 : 2,
      tipSign: rng() < 0.5 ? -1 : 1,
      skid: (rng() < 0.5 ? -1 : 1) * (12 + rng() * 30),
      restYaw: Math.round((rng() * 2 - 1) * 4 * 10) / 10,
      alpha2: 170 + rng() * 80,
      alpha3: 45 + rng() * 35,
      jitter: [vec(), vec(), vec()],
      drift: side * (0.02 + rng() * 0.05),
    };
  });
}

/** 높이 h(한 변 단위)까지 떴다 내려오는 시간(ms). @param {number} h */
const airTime = (h) => Math.round(2 * Math.sqrt((2 * h) / GRAVITY));

/** 계획 → 구간 시각표(ms, 이 주사위가 출발한 순간 기준). 부딪힘 목록은 효과음 예약에도 씁니다. @param {DiePlan} plan */
export function timeline(plan) {
  if (plan.reduced) return { reduced: true, air: [], tips: [], launch: 0, ground: 0, readable: REDUCED_MS, total: REDUCED_MS, impacts: [] };
  const h2 = plan.height * plan.bounce2;
  const air = [airTime(plan.height), airTime(h2), airTime(h2 * plan.bounce3)];
  const tips = plan.tips === 2 ? TIP_MS.double : TIP_MS.single;
  const hits = [CROUCH_MS + air[0]];
  hits.push(hits[0] + air[1], hits[0] + air[1] + air[2]);
  const ground = hits[2];
  const tipEnds = tips.map((_, i) => ground + tips.slice(0, i + 1).reduce((s, v) => s + v, 0));
  const readable = tipEnds.at(-1) ?? ground;
  // 세기: 첫 착지가 가장 크고, 튈수록·구를수록 작아집니다(효과음 크기·찌그러짐 정도).
  const impacts = [
    { at: hits[0], strength: 1 },
    { at: hits[1], strength: 0.55 },
    { at: hits[2], strength: 0.32 },
    ...tipEnds.map((at, i) => ({ at, strength: i === tipEnds.length - 1 ? 0.24 : 0.28 })),
  ];
  return { reduced: false, air, tips, launch: CROUCH_MS, ground, readable, total: readable + SETTLE_MS, impacts };
}

/** @param {DiePlan} plan 눈이 읽혀 결과 칩을 채우는 시각(던진 순간 기준) */
export const readableAt = (plan) => plan.delay + timeline(plan).readable;
/** @param {DiePlan} plan 완전히 멈추는 시각 */
export const endsAt = (plan) => plan.delay + timeline(plan).total;
/** @param {readonly DiePlan[]} plans */
export const rollEndsAt = (plans) => Math.max(0, ...plans.map(endsAt));
/** @param {DiePlan} plan 부딪히는 순간들(던진 순간 기준 ms, 세기 0~1) */
export const impactsOf = (plan) => timeline(plan).impacts.map((hit) => ({ at: plan.delay + hit.at, strength: hit.strength }));

/** 지난 자세(from)에서 이어 굴러 value 면으로 착지하는 대본을 만듭니다. 끝 자세부터 거꾸로 짜서 착지 면이 반드시 맞습니다.
 * @param {Quat} from @param {number} value @param {DiePlan} plan */
export function buildRoll(from, value, plan) {
  const tl = timeline(plan);
  const final = restQuat(value, plan.restYaw);
  if (plan.reduced) return { plan, tl, from, final, total: tl.total };
  // 바닥 단계: 주사위 자기 좌우축으로 90°씩 모서리를 넘고, 동시에 세로축으로 미끄러지며 돌다 멈춥니다.
  const sideAxis = rotate(axisAngle(UP, plan.restYaw), SIDE);
  const theta0 = plan.tipSign * 90 * plan.tips;
  const skidTurn = axisAngle(UP, plan.skid);
  const ground = mul(skidTurn, mul(axisAngle(sideAxis, theta0), final));
  // 공중 회전은 바닥에서 구를 방향과 같은 쪽으로 — 튀는 동안 도는 방향이 뒤집히면 부자연스럽습니다.
  const spin = /** @type {Vec3} */ (rotate(skidTurn, sideAxis).map((c) => -plan.tipSign * c));
  const [j1, j2, j3] = plan.jitter;
  const axis3 = normalize3(add(spin, j3, 0.25));
  const hit2 = mul(axisAngle(axis3, -plan.alpha3), ground);
  const axis2 = normalize3(add(spin, j2, 0.6));
  const hit1 = mul(axisAngle(axis2, -plan.alpha2), hit2);
  const axis1 = normalize3(add(spin, j1, 0.5));
  return { plan, tl, from, final, total: tl.total, sideAxis, theta0, ground, hit1, hit2, axis1, axis2, axis3 };
}
/** @typedef {ReturnType<typeof buildRoll>} RollScript */

/** 포물선: y0에서 출발해 T ms 뒤 y1에 닿는 자유 낙하. @param {number} y0 @param {number} y1 @param {number} T @param {number} t */
function flight(y0, y1, T, t) {
  const v0 = (y1 - y0 + (GRAVITY * T * T) / 2) / T;
  return y0 + v0 * t - (GRAVITY * t * t) / 2;
}

/** 바닥에서 구르는 각도(주사위 좌우축 기준). 한 번 넘을 때마다 꼭대기에서 느려지고, 누운 뒤에는 반대로 살짝 들렸다 멈춥니다.
 * @param {RollScript} script @param {number} t 바닥 단계 시작부터 ms */
function tipAngle(script, t) {
  const { tips } = script.tl;
  const sign = script.plan.tipSign;
  let start = 0;
  for (let i = 0; i < tips.length; i++) {
    if (t < start + tips[i]) {
      const p = (t - start) / tips[i];
      const f = p + (TIP_EASE * Math.sin(2 * Math.PI * p)) / (2 * Math.PI);
      return /** @type {number} */ (script.theta0) - sign * 90 * (i + f);
    }
    start += tips[i];
  }
  const u = clamp01((t - start) / SETTLE_MS);
  return -sign * ROCK_DEG * Math.exp(-2.2 * u) * Math.sin(3 * Math.PI * u);
}

/** 모양(움츠림·늘어남·찌그러짐). 기준점은 바닥에 닿은 점이라 찌그러져도 바닥에 붙어 있습니다. @param {RollScript} script @param {number} t */
function squashAt(script, t) {
  let sx = 1;
  let sy = 1;
  if (t < CROUCH_MS) {
    const e = easeOut(t / CROUCH_MS);
    sx = 1 + 0.08 * e;
    sy = 1 - 0.13 * e;
  } else if (t < CROUCH_MS + 70) {
    const e = smooth((t - CROUCH_MS) / 70);
    sx = lerp(1.08, 0.95, e);
    sy = lerp(0.87, 1.07, e);
  } else if (t < CROUCH_MS + 190) {
    const e = smooth((t - CROUCH_MS - 70) / 120);
    sx = lerp(0.95, 1, e);
    sy = lerp(1.07, 1, e);
  }
  for (const hit of script.tl.impacts) {
    const since = t - hit.at;
    if (since < 0 || since >= IMPACT_MS) continue;
    const bump = Math.sin((Math.PI * since) / IMPACT_MS) * (1 - since / (2 * IMPACT_MS));
    sx += 0.13 * hit.strength * bump;
    sy -= 0.17 * hit.strength * bump;
  }
  return { sx, sy };
}

/** @typedef {{q: Quat, y: number, x: number, sx: number, sy: number, opacity: number, squint: boolean}} DiePose */

/** 멈춰 있는 자세. @param {Quat} q @returns {DiePose} */
export const restPose = (q) => ({ q, y: restingCenter(q), x: 0, sx: 1, sy: 1, opacity: 1, squint: false });

/** 대본의 t ms(이 주사위 출발 기준) 순간 모습. y = 바닥에서 중심까지 높이, x = 좌우 이동(둘 다 한 변 단위).
 * @param {RollScript} script @param {number} t @returns {DiePose} */
export function poseAt(script, t) {
  const { plan, tl } = script;
  t = Math.min(script.total, Math.max(0, t));
  if (t >= script.total) return restPose(script.final);
  if (plan.reduced) {
    // 줄임 모드: 흐려진 순간(가운데)에 새 면으로 한 번에 바뀝니다. 돌거나 뜨지 않습니다.
    const wave = Math.sin((Math.PI * t) / REDUCED_MS);
    const q = t < REDUCED_MS / 2 ? script.from : script.final;
    return { q, y: restingCenter(q), x: 0, sx: 1 - 0.04 * wave, sy: 1 - 0.04 * wave, opacity: 1 - 0.6 * wave, squint: false };
  }
  const s = /** @type {Required<RollScript>} */ (script);
  const [t1, t2, t3] = tl.air;
  const hit1 = tl.launch + t1;
  const hit2 = hit1 + t2;
  /** @type {Quat} */ let q;
  let y;
  let x = 0;
  if (t < tl.launch) {
    q = s.from;
    y = restingCenter(q);
  } else if (t < hit1) {
    const p = (t - tl.launch) / t1;
    // 여러 바퀴 도는 회전 위에, 출발 자세 → 첫 착지 자세 보정을 얹습니다. 바퀴 수가 정수라 끝에서 정확히 착지 자세가 됩니다.
    q = mul(axisAngle(s.axis1, 360 * TURNS * p), slerp(s.from, s.hit1, p));
    y = flight(restingCenter(s.from), restingCenter(s.hit1), t1, t - tl.launch);
    x = plan.drift * Math.sin(Math.PI * p);
  } else if (t < hit2) {
    const p = (t - hit1) / t2;
    q = mul(axisAngle(s.axis2, plan.alpha2 * (p - 1)), s.hit2);
    y = flight(restingCenter(s.hit1), restingCenter(s.hit2), t2, t - hit1);
  } else if (t < tl.ground) {
    const p = (t - hit2) / t3;
    q = mul(axisAngle(s.axis3, plan.alpha3 * (p - 1)), s.ground);
    y = flight(restingCenter(s.hit2), restingCenter(s.ground), t3, t - hit2);
  } else {
    const since = t - tl.ground;
    const skid = plan.skid * (1 - easeOut(clamp01(since / (tl.total - tl.ground))));
    q = mul(axisAngle(UP, skid), mul(axisAngle(s.sideAxis, tipAngle(script, since)), s.final));
    y = restingCenter(q);
  }
  // 빠르게 도는 중에는 포물선만 따르면 모서리가 바닥을 뚫는 순간이 생깁니다. 가장 낮은 점이 바닥 위에 있게 올립니다.
  y = Math.max(y, restingCenter(q));
  const { sx, sy } = squashAt(script, t);
  return { q, y, x, sx, sy, opacity: 1, squint: t < SQUINT_MS };
}

// ── 크기 규칙(논리 px) ──
// 무대 높이는 한 변의 2.3배(튀어 오를 자리 포함), 결과줄은 합계 글자(한 변의 0.55배)의 1.4배를 차지합니다.
export const SIZE_MIN = 96;
export const SIZE_MAX = 220;
export const STAGE_PER_SIZE = 2.3;
export const RESULT_PER_TOTAL = 0.55;
export const RESULT_ROW = 1.4;
export const RESULT_PER_SIZE = RESULT_PER_TOTAL * RESULT_ROW;
export const GAP_PER_SIZE = 0.38;

/** 창 안의 "무대 + 결과줄" 영역 크기에서 주사위 한 변을 구합니다.
 * 왜 무대 높이로 재지 않는가: 결과줄 높이가 한 변에 비례하므로, 무대만 재면 크기↔높이가 서로를 바꾸며 흔들립니다.
 * @param {number} count @param {number} width @param {number} height */
export function fitDieSize(count, width, height) {
  const n = clampCount(count);
  const byWidth = Math.max(0, width - 48) / (n + GAP_PER_SIZE * (n - 1));
  const byHeight = Math.max(0, height - 24) / (STAGE_PER_SIZE + RESULT_PER_SIZE);
  return Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.min(byWidth, byHeight))));
}

/** 가운데 정렬된 자리의 가로 위치(px, 무대 가운데 기준). @param {number} index @param {number} count @param {number} size */
export const slotOffset = (index, count, size) => (index - (clampCount(count) - 1) / 2) * size * (1 + GAP_PER_SIZE);

// ── 결과 패널 크기 ──
/** 결과 패널 안 요소의 폭(합계 글자 크기 T의 배수). dice.css의 칩·기호·합계 칸·간격·안쪽 여백과 반드시 같아야 합니다.
 * 폭을 글자 모양에 맡기지 않고 고정해 두어야, 어떤 글꼴·숫자(7이든 18이든)에서도 미리 계산한 폭 안에 한 줄로 들어갑니다. */
export const RESULT_WIDTH = Object.freeze({ chip: 0.7, op: 0.32, total: 1.3, gap: 0.14, pad: 0.42 });
export const RESULT_MIN_PX = 56;
/** "던지기를 눌러 보세요"의 폭(글자 크기 배수, 넉넉하게). */
export const HINT_EM = 10.2;
const PANEL_BORDER = 2;

/** 수식 한 줄의 폭(T 배수, 안쪽 여백 제외). 1개 = 합계만, n개 = 칩 n + 기호 n(+ … =) + 합계 + 간격 2n. @param {number} count */
export function equationUnits(count) {
  const n = clampCount(count);
  const w = RESULT_WIDTH;
  return n === 1 ? w.total : n * w.chip + n * w.op + w.total + 2 * n * w.gap;
}

/** 결과 패널: 합계 글자 크기(T)·패널 폭·안내 글자 크기(px).
 * T는 주사위 크기에 비례하되(교실 뒤에서도 읽히게 최소 56px), 주사위 3개라도 창 폭 안에서 한 줄로 들어가도록 폭으로 한 번 더 제한합니다.
 * 패널 폭은 개수마다 고정 — 대기 → 굴리는 중 → 결과로 바뀌어도 패널이 커졌다 작아지지 않습니다.
 * @param {number} count @param {number} width 결과줄이 쓸 수 있는 폭(px) @param {number} size 주사위 한 변(px) */
export function fitResultSize(count, width, size) {
  const avail = Math.max(0, width - 8);
  const inner = equationUnits(count) + 2 * RESULT_WIDTH.pad;
  const total = Math.floor(Math.min(Math.max(RESULT_MIN_PX, size * RESULT_PER_TOTAL), (avail - PANEL_BORDER) / inner));
  const padding = 2 * RESULT_WIDTH.pad * total + PANEL_BORDER;
  // 안내 문구는 패널 높이(합계 글자의 1.22배)에 어울리게 합계 글자의 0.24배(16~30px).
  const hint = Math.floor(Math.max(0, Math.min(30, Math.max(16, total * 0.24), (avail - padding) / HINT_EM)));
  const panel = Math.ceil(Math.min(avail, Math.max(inner * total + PANEL_BORDER, HINT_EM * hint + padding)));
  return { total, panel, hint };
}
