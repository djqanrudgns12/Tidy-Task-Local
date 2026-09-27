/** 점수판·온도계 움직임의 공통 값.
 * 스프링: 감쇠 진동 공식으로 0→1 곡선을 만들고, CSS에서는 `linear()` 점 목록(springLinear)으로 씁니다.
 *   JS에서 easing 함수가 필요하면 `(t) => springAt(t, o)`로 감싸 쓰면 됩니다.
 * 왜 linear()인가: 튀는 느낌(살짝 넘었다 돌아옴)을 CSS만으로 낼 수 있고 WebView2(Chromium 113+)가 지원합니다. */

/** 감쇠 스프링 위치(0에서 출발해 1로 수렴).
 * @param {number} t 0~1(전체 길이 비율) @param {{bounce?:number, settle?:number}} [o]
 *  bounce: 0(넘침 없음)~0.5(많이 튐), settle: 끝날 때까지 진동이 가라앉는 정도(클수록 빨리 멈춤) */
export function springAt(t, { bounce = 0.25, settle = 6 } = {}) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // 튀지 않게 할 때는 임계 감쇠(넘치지 않고 가장 빨리 도착하는 곡선)를 씁니다.
  if (bounce <= 0) return 1 - (1 + settle * t) * Math.exp(-settle * t);
  const damping = settle * (1 - bounce);
  const freq = Math.PI * (1 + bounce * 6);
  return 1 - Math.exp(-damping * t) * Math.cos(freq * t);
}

/** CSS `linear()` 문자열. 첫 점 0, 끝 점 1. @param {{bounce?:number, settle?:number}} [o] @param {number} [points] */
export function springLinear(o, points = 32) {
  const values = [];
  for (let i = 0; i <= points; i++) values.push(Math.round(springAt(i / points, o) * 1000) / 1000);
  values[0] = 0;
  values[values.length - 1] = 1;
  return `linear(${values.join(', ')})`;
}

/** 사건별 길이(ms). 반응은 짧게, 축하만 길게(PRD 11.1). */
export const DURATION = Object.freeze({
  roll: 380,
  bump: 320,
  chip: 700,
  wave: 600,
  enter: 280,
  fill: 600,
  celebrate: 2500,
  reduced: 150,
});

/** 여러 카드가 물결처럼 차례로 움직일 때 i번째의 지연(ms). 전체가 total 안에 끝나게 간격을 줄입니다.
 * @param {number} i @param {number} n @param {number} [total] */
export function staggerDelay(i, n, total = DURATION.wave) {
  if (n <= 1) return 0;
  const step = Math.min(30, (total - DURATION.bump) / (n - 1));
  return Math.max(0, Math.round(i * step));
}
