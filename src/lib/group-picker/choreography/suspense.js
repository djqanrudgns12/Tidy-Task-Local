/** 3대 무대 공용 물리·서스펜스·시간 예산·스쿼시/스트레치 & 접지 그림자 순수 모듈.
 *  Die.svelte의 접지 그림자 공식과 Rigging Blueprint(Z-샌드위치, ζ=0.58 감쇠 스프링)를 따릅니다. */

export const ARM_MS = 500;
export const SETTLED_ARM_MS = 400;
export const REDUCED_DURATION_MS = 950;
export const TICKET_FLIGHT_MS = 420;
export const DAMPED_ZETA = 0.58;

/** @param {number} v @param {number} [min] @param {number} [max] */
export const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

/** @param {number} a @param {number} b @param {number} t */
export const mix = (a, b, t) => a + (b - a) * clamp(t);

/** @param {number} t */
export const easeOutCubic = (t) => {
  const u = 1 - clamp(t);
  return 1 - u * u * u;
};

/** @param {number} t */
export const easeInOutCubic = (t) => {
  const u = clamp(t);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};

/** 감쇠 스프링 응답(zeta = 0.58). 차량 제동 피칭·착지 바운스에 씁니다.
 * @param {number} t 0..1 @param {number} [freq] */
export function dampedSpring(t, freq = 3.2) {
  const u = clamp(t);
  return Math.exp(-4.2 * u) * Math.sin(u * Math.PI * freq);
}

/** 유체 감속 표류 곡선(1 - e^{-lambda u}). 빙하가 딱 멈추지 않고 물 저항으로 부드럽게 멈춥니다.
 * @param {number} u 0..1 @param {number} [lambda] */
export function fluidEase(u, lambda = 3.6) {
  const t = clamp(u);
  if (t >= 1) return 1;
  return (1 - Math.exp(-lambda * t)) / (1 - Math.exp(-lambda));
};

/** 발끝 피벗(origin bottom center) 부피 보존 스쿼시·스트레치(scaleX * scaleY ≈ 1).
 * @param {number} u 도약 진행 0..1 @returns {{scaleX:number, scaleY:number, jumpY:number}} */
export function squashStretch(u) {
  const t = clamp(u);
  if (t < 0.14) {
    const p = t / 0.14;
    const scaleX = mix(1.0, 1.12, p);
    const scaleY = mix(1.0, 0.89, p);
    return { scaleX, scaleY, jumpY: 0 };
  }
  if (t < 0.78) {
    const p = (t - 0.14) / 0.64;
    const air = Math.sin(p * Math.PI);
    // 이륙 초기에 길게 뻗고(0.92, 1.10) 정점에서 부드럽게 회복(0.98, 1.02)
    const stretch = (1 - p) * 0.08;
    const scaleX = Number((0.98 - stretch * 0.75).toFixed(4));
    const scaleY = Number((1 / scaleX).toFixed(4));
    return { scaleX, scaleY, jumpY: air };
  }
  const p = (t - 0.78) / 0.22;
  const bounce = Math.sin(p * Math.PI);
  const scaleX = Number((1 + 0.12 * bounce).toFixed(4));
  const scaleY = Number((1 / scaleX).toFixed(4));
  return { scaleX, scaleY, jumpY: 0 };
}

/** Die.svelte 그림자 분리 공식: 캐릭터가 뜰수록 그림자는 바닥에 고정된 채 작고 옅어집니다.
 * @param {number} liftRatio 0(접지)~1(정점) @returns {{scale:number, opacity:number}} */
export function groundShadow(liftRatio) {
  const k = clamp(liftRatio);
  return {
    scale: Number((1 - 0.38 * k).toFixed(4)),
    opacity: Number((0.16 - 0.09 * k).toFixed(4)),
  };
}

/** 2차 베지어 점 좌표. 티켓 비행(420ms) 궤적 산출에 씁니다.
 * @param {{x:number,y:number}} p0 @param {{x:number,y:number}} p1 @param {{x:number,y:number}} p2 @param {number} t */
export function bezierQuad(p0, p1, p2, t) {
  const u = clamp(t);
  const inv = 1 - u;
  return {
    x: inv * inv * p0.x + 2 * inv * u * p1.x + u * u * p2.x,
    y: inv * inv * p0.y + 2 * inv * u * p1.y + u * u * p2.y,
  };
}

/** 창 가림/복귀 시 prevElapsed ~ nextElapsed 사이 지나친 확정 티켓들을 찾아 즉시 정착시킵니다(오디오 폭주 방지).
 * @param {{studentId:string, groupIndex:number, atMs:number}[]} events
 * @param {number} prevMs
 * @param {number} nextMs */
export function missedTicketEvents(events, prevMs, nextMs) {
  return events.filter((ev) => ev.atMs > prevMs && ev.atMs <= nextMs);
}
