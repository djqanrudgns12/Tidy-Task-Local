/** 주사위 연출 계산 — DOM 없이 각도·시간·키프레임만 만듭니다. 결과(눈)는 engine.js가 먼저 정하고, 여기서는 그 면에 착지하도록 거꾸로 계산합니다. */
import { clampCount } from './engine.js';

export const ROLL_MS = 1050;
export const STAGGER_MS = 80;
export const JITTER_MS = 30;
export const REDUCED_MS = 200;
// 3개를 어긋나게 던져도 마지막 주사위가 이 시간 안에 멈춰야 합니다(PRD 성공 기준).
export const MAX_ROLL_MS = 1300;

// PRD 5.1 타임라인의 단계 경계(ms)를 1050ms에 대한 비율로 둡니다. 키프레임 offset으로 바로 씁니다.
export const PHASE = Object.freeze({
  crouch: 110 / ROLL_MS, // 움츠림 끝 → 튀어 오름 시작
  lift: 210 / ROLL_MS, // 떠오르며 세로로 늘어남이 가장 큰 때
  apex: 430 / ROLL_MS, // 가장 높은 곳
  impact: 650 / ROLL_MS, // 바닥에 닿음(효과음 "톡")
  squash: 720 / ROLL_MS, // 가장 찌그러짐
  rebound: 790 / ROLL_MS, // 작은 튐의 꼭대기
  readable: 860 / ROLL_MS, // 흔들리며 멈춤 시작 — 눈이 읽히므로 결과 칩을 채웁니다
  wobble: 945 / ROLL_MS,
  settle: 1010 / ROLL_MS,
});

/** 값 → 그 면이 정면(보는 사람 쪽)을 향하는 회전. 면 배치는 앞 1 / 뒤 6 / 위 2 / 아래 5 / 오른쪽 3 / 왼쪽 4이고,
 * 마주보는 면의 합이 7이라 진짜 주사위처럼 구릅니다. 부호는 motion.test.js의 회전 행렬 검사로 확정했습니다. */
export const FACE_ANGLES = Object.freeze({
  1: Object.freeze({ x: 0, y: 0 }),
  2: Object.freeze({ x: -90, y: 0 }),
  3: Object.freeze({ x: 0, y: -90 }),
  4: Object.freeze({ x: 0, y: 90 }),
  5: Object.freeze({ x: 90, y: 0 }),
  6: Object.freeze({ x: 0, y: 180 }),
});

/** 각 면 요소를 정육면체 제자리에 놓는 변환(한 변의 절반만큼 밀어냄). CSS 변수 --dice-half를 씁니다. */
export const FACE_PLACEMENT = Object.freeze({
  1: 'translateZ(var(--dice-half))',
  6: 'rotateY(180deg) translateZ(var(--dice-half))',
  2: 'rotateX(90deg) translateZ(var(--dice-half))',
  5: 'rotateX(-90deg) translateZ(var(--dice-half))',
  3: 'rotateY(90deg) translateZ(var(--dice-half))',
  4: 'rotateY(-90deg) translateZ(var(--dice-half))',
});

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

/** @typedef {{delay:number,duration:number,height:number,turnsX:number,turnsY:number,dirY:number,tiltZ:number,drift:number,restYaw:number,reduced:boolean}} DiePlan */

/** 주사위마다 조금씩 다른 던지기 계획. 똑같이 움직이면 기계처럼 보여서 출발·높이·바퀴·흔들림을 모두 흩뜨립니다.
 * @param {number} count @param {() => number} rng @param {boolean} reduced @returns {DiePlan[]} */
export function rollPlan(count, rng, reduced) {
  return Array.from({ length: clampCount(count) }, (_, i) => {
    if (reduced)
      return { delay: 0, duration: REDUCED_MS, height: 0, turnsX: 0, turnsY: 0, dirY: 1, tiltZ: 0, drift: 0, restYaw: 0, reduced: true };
    const tiltSign = rng() < 0.5 ? -1 : 1;
    return {
      delay: Math.round(i * STAGGER_MS + rng() * JITTER_MS),
      duration: ROLL_MS,
      height: 0.9 * (0.88 + rng() * 0.24),
      turnsX: 2 + (rng() < 0.5 ? 0 : 1),
      turnsY: 1 + (rng() < 0.5 ? 0 : 1),
      dirY: rng() < 0.5 ? -1 : 1,
      tiltZ: tiltSign * (10 + rng() * 14),
      drift: (rng() * 2 - 1) * 0.08,
      restYaw: Math.round((rng() * 2 - 1) * 4 * 10) / 10,
      reduced: false,
    };
  });
}

/** current에서 dir 방향으로 최소 turns바퀴 이상 돌면서, 360으로 나눈 나머지가 target과 같은 가장 가까운 각도.
 * @param {number} current @param {number} target @param {number} turns @param {number} dir */
function forward(current, target, turns, dir) {
  const base = current + dir * turns * 360;
  const ahead = (((target - base) % 360) + 360) % 360;
  return dir > 0 ? base + ahead : base - ((360 - ahead) % 360);
}

/** 지난 결과 각도에서 이어 굴려 목표 면에 닿는 각도를 구합니다(0도로 되감기·순간이동 없음).
 * @param {{x:number,y:number}} from @param {number} value @param {DiePlan} plan */
export function nextAngles(from, value, plan) {
  const face = FACE_ANGLES[/** @type {1|2|3|4|5|6} */ (value)];
  if (!face) throw new Error('주사위 눈은 1~6이어야 해요.');
  return {
    x: forward(from.x, face.x, plan.turnsX, 1),
    y: forward(from.y, face.y, plan.turnsY, plan.dirY),
    yaw: plan.restYaw,
  };
}

const deg = (/** @type {number} */ v) => `${Math.round(v * 100) / 100}deg`;
const px = (/** @type {number} */ v) => `${Math.round(v * 100) / 100}px`;

/** 회전 함수 목록은 모든 키프레임에서 같아야 합니다. 목록이 다르면 브라우저가 행렬로 보간해 여러 바퀴가 사라집니다.
 * @param {number} yaw @param {number} x @param {number} y @param {number} [z] */
export const spinTransform = (yaw, x, y, z = 0) => `rotateY(${deg(yaw)}) rotateX(${deg(x)}) rotateY(${deg(y)}) rotateZ(${deg(z)})`;

/** 멈춰 있는 주사위의 회전. @param {number} value @param {number} yaw */
export function restTransform(value, yaw) {
  const face = FACE_ANGLES[/** @type {1|2|3|4|5|6} */ (value)] ?? FACE_ANGLES[1];
  return spinTransform(yaw, face.x, face.y, 0);
}

/** 3D 회전 키프레임. 날아가는 동안 돌고, 착지 뒤 남은 각도를 지나쳤다 돌아오며(흔들림) 목표 면에서 멈춥니다.
 * @param {{x:number,y:number,yaw:number}} from @param {{x:number,y:number,yaw:number}} to @param {DiePlan} plan */
export function spinKeyframes(from, to, plan) {
  if (plan.reduced)
    // 줄임 모드: 흐려진 순간(가운데)에 새 면으로 한 번에 바뀝니다. 같은 offset 두 개로 뚝 끊어 돌지 않게 합니다.
    return [
      { offset: 0, transform: spinTransform(from.yaw, from.x, from.y) },
      { offset: 0.5, transform: spinTransform(from.yaw, from.x, from.y) },
      { offset: 0.5, transform: spinTransform(to.yaw, to.x, to.y) },
      { offset: 1, transform: spinTransform(to.yaw, to.x, to.y) },
    ];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const along = (/** @type {number} */ p) => ({ x: from.x + dx * p, y: from.y + dy * p });
  const yawAt = (/** @type {number} */ p) => from.yaw + (to.yaw - from.yaw) * p;
  const frame = (/** @type {number} */ offset, /** @type {{x:number,y:number}} */ a, /** @type {number} */ yaw, /** @type {number} */ z, /** @type {string} */ easing) =>
    ({ offset, transform: spinTransform(yaw, a.x, a.y, z), easing });
  const apex = along(0.55), impact = along(0.9), squash = along(0.93);
  return [
    frame(0, from, from.yaw, 0, 'linear'),
    frame(PHASE.crouch, from, from.yaw, 0, 'cubic-bezier(.3,.55,.6,1)'),
    frame(PHASE.apex, apex, yawAt(0.5), plan.tiltZ, 'cubic-bezier(.4,0,.7,.7)'),
    frame(PHASE.impact, impact, yawAt(0.85), plan.tiltZ * 0.35, 'cubic-bezier(.2,.7,.4,1)'),
    frame(PHASE.squash, squash, yawAt(0.9), plan.tiltZ * 0.15, 'ease-out'),
    frame(PHASE.readable, { x: to.x - 18 * sx, y: to.y - 9 * sy }, to.yaw, 0, 'ease-in-out'),
    frame(PHASE.wobble, { x: to.x + 7 * sx, y: to.y + 3.5 * sy }, to.yaw, 0, 'ease-in-out'),
    frame(PHASE.settle, { x: to.x - 3 * sx, y: to.y - 1.5 * sy }, to.yaw, 0, 'ease-out'),
    frame(1, to, to.yaw, 0, 'linear'),
  ];
}

const move = (/** @type {number} */ x, /** @type {number} */ y) => `translate3d(${px(x)}, ${px(y)}, 0px)`;

/** 위치(튀어 오름) 키프레임. 찌그러짐은 squashKeyframes가 다른 층에서 맡아, 위치 이징과 모양 이징이 서로를 방해하지 않습니다.
 * 올라갈 때 감속, 떨어질 때 가속이라 실제 포물선처럼 보입니다.
 * @param {DiePlan} plan @param {number} size 한 변(px) */
export function hopKeyframes(plan, size) {
  if (plan.reduced) return [{ offset: 0, transform: move(0, 0) }, { offset: 1, transform: move(0, 0) }];
  const high = plan.height * size;
  const drift = plan.drift * size;
  const rise = 'cubic-bezier(.2,.7,.3,1)';
  const fall = 'cubic-bezier(.6,0,.9,.4)';
  return [
    { offset: 0, transform: move(0, 0), easing: 'linear' },
    { offset: PHASE.crouch, transform: move(0, 0), easing: rise },
    { offset: PHASE.apex, transform: move(drift, -high), easing: fall },
    { offset: PHASE.impact, transform: move(drift * 0.55, 0), easing: 'linear' },
    { offset: PHASE.squash, transform: move(drift * 0.45, 0), easing: rise },
    { offset: PHASE.rebound, transform: move(drift * 0.2, -0.18 * size), easing: fall },
    { offset: PHASE.readable, transform: move(0, 0), easing: 'linear' },
    { offset: 1, transform: move(0, 0), easing: 'linear' },
  ];
}

const shape = (/** @type {number} */ sx, /** @type {number} */ sy) => `scale3d(${sx}, ${sy}, 1)`;

/** 모양(움츠림·늘어남·찌그러짐) 키프레임. 기준점은 바닥 가운데라 찌그러져도 바닥에 붙어 있습니다.
 * 줄임 모드에서는 모양 대신 잠깐 흐려졌다 돌아옵니다. @param {DiePlan} plan */
export function squashKeyframes(plan) {
  if (plan.reduced)
    return [
      { offset: 0, transform: shape(1, 1), opacity: 1, easing: 'ease-out' },
      { offset: 0.5, transform: shape(0.96, 0.96), opacity: 0.4, easing: 'ease-out' },
      { offset: 1, transform: shape(1, 1), opacity: 1 },
    ];
  return [
    { offset: 0, transform: shape(1, 1), opacity: 1, easing: 'ease-out' },
    { offset: PHASE.crouch, transform: shape(1.06, 0.88), opacity: 1, easing: 'cubic-bezier(.3,.8,.5,1)' },
    { offset: PHASE.lift, transform: shape(0.95, 1.06), opacity: 1, easing: 'ease-in-out' },
    { offset: PHASE.apex, transform: shape(1, 1), opacity: 1, easing: 'ease-in' },
    { offset: PHASE.impact, transform: shape(0.97, 1.04), opacity: 1, easing: 'cubic-bezier(.2,.8,.4,1)' },
    { offset: PHASE.squash, transform: shape(1.12, 0.84), opacity: 1, easing: 'cubic-bezier(.3,.7,.4,1)' },
    { offset: PHASE.rebound, transform: shape(0.98, 1.03), opacity: 1, easing: 'ease-in' },
    { offset: PHASE.readable, transform: shape(1.05, 0.94), opacity: 1, easing: 'ease-out' },
    { offset: PHASE.wobble, transform: shape(0.99, 1.01), opacity: 1, easing: 'ease-in-out' },
    { offset: 1, transform: shape(1, 1), opacity: 1 },
  ];
}

const blot = (/** @type {number} */ x, /** @type {number} */ k) => `translate3d(${px(x)}, 0px, 0px) scale(${k})`;

/** 바닥 그림자 키프레임. 높이와 반대로 움직입니다 — 높을수록 크고 옅게, 닿는 순간 작고 진하게. 높이감의 절반을 그림자가 만듭니다.
 * @param {DiePlan} plan @param {number} size */
export function shadowKeyframes(plan, size) {
  const rest = { transform: blot(0, 1), opacity: 0.26 };
  if (plan.reduced) return [{ offset: 0, ...rest }, { offset: 1, ...rest }];
  const drift = plan.drift * size;
  return [
    { offset: 0, ...rest, easing: 'linear' },
    { offset: PHASE.crouch, transform: blot(0, 1.06), opacity: 0.3, easing: 'cubic-bezier(.2,.7,.3,1)' },
    { offset: PHASE.apex, transform: blot(drift, 1.25), opacity: 0.12, easing: 'cubic-bezier(.6,0,.9,.4)' },
    { offset: PHASE.impact, transform: blot(drift * 0.55, 0.85), opacity: 0.32, easing: 'linear' },
    { offset: PHASE.squash, transform: blot(drift * 0.45, 0.9), opacity: 0.34, easing: 'cubic-bezier(.2,.7,.3,1)' },
    { offset: PHASE.rebound, transform: blot(drift * 0.2, 1.05), opacity: 0.22, easing: 'cubic-bezier(.6,0,.9,.4)' },
    { offset: PHASE.readable, transform: blot(0, 0.94), opacity: 0.3, easing: 'ease-out' },
    { offset: 1, ...rest },
  ];
}

/** @param {DiePlan} plan 이 주사위가 바닥에 닿는 시각(ms, 던진 순간 기준) */
export const landingAt = (plan) => plan.delay + Math.round(plan.duration * (plan.reduced ? 0.5 : PHASE.impact));
/** @param {DiePlan} plan 눈이 읽혀 결과 칩을 채우는 시각 */
export const readableAt = (plan) => plan.delay + Math.round(plan.duration * (plan.reduced ? 1 : PHASE.readable));
/** @param {DiePlan} plan 완전히 멈추는 시각 */
export const endsAt = (plan) => plan.delay + plan.duration;
/** @param {readonly DiePlan[]} plans */
export const rollEndsAt = (plans) => Math.max(0, ...plans.map(endsAt));

// 한 변 크기 규칙(논리 px). 무대 높이는 한 변의 2.3배(튀어 오를 자리 포함), 결과줄은 합계 글자(0.55배)의 1.3배를 차지합니다.
export const SIZE_MIN = 96;
export const SIZE_MAX = 220;
export const STAGE_PER_SIZE = 2.3;
export const RESULT_PER_SIZE = 0.55 * 1.3;
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
