// 클래식 "두근두근 이름 카드"의 두 가지 규칙을 모읍니다.
// 1) 넘김 순서: 처음엔 빠르게 넘기다 점점 느려져 마지막 장에서 당첨자에게 멈춥니다.
//    당첨자는 이미 engine.js가 정했고, 여기서는 "보여 주는 순서"만 만듭니다(확률과 무관).
// 2) 글자 크기 맞춤: 이름이 카드 안에서 중간에 끊기지 않도록 실제 글꼴로 재서 크기를 줄입니다.

/** 마지막 장(당첨자)이 나온 뒤 결과로 바뀌기까지 멈춰 있는 시간(ms). 한 박자 쉬어야 "멈췄다"가 눈에 들어옵니다. */
export const ROLL_HOLD = 340;
/** 첫 장 사이 간격(ms)과, 끝에 가서 더해지는 최대 간격(ms). 끝으로 갈수록 세제곱으로 느려집니다. */
const FIRST_GAP = 55;
const SLOWDOWN = 290;

/**
 * @param {number} count 넘길 이름 수
 * @param {number} winner 당첨자 위치(0..count-1)
 * @param {number} duration 추첨 전체 길이(ms)
 * @param {()=>number} [random] 0 이상 1 미만 난수(시험에서 바꿔 끼웁니다)
 * @returns {{at:number,index:number}[]} at(ms)에 index번째 이름을 보여 줍니다. 마지막 장은 항상 당첨자입니다.
 */
export function rollingPlan(count, winner, duration, random = Math.random) {
  const end = Math.max(0, duration - ROLL_HOLD);
  /** @type {number[]} */ const times = [];
  for (let t = 0; t < end; t += FIRST_GAP + SLOWDOWN * (t / end) ** 3) times.push(t);
  // 마지막 장이 정확히 end에 오도록 간격을 고르게 늘려, 멈춘 뒤 쉬는 시간이 매번 같게 합니다.
  const stretch = times.length > 1 ? end / /** @type {number} */ (times.at(-1)) : 1;
  const plan = (times.length ? times : [0]).map((t) => ({ at: Math.round(t * stretch), index: winner }));
  // 당첨자(마지막 장)에서 거꾸로 채웁니다. 바로 뒤 장과 다른 이름만 고르면 같은 이름이 두 번 연속 나오지 않고,
  // 마지막 직전 장도 저절로 당첨자가 아니게 되어 멈추는 순간이 분명해집니다(두 명일 때도 번갈아 나옴).
  /** @type {Set<number>} */ const seen = new Set([winner]);
  for (let i = plan.length - 2; i >= 0; i--) {
    const next = plan[i + 1].index;
    if (seen.size >= count) seen.clear();
    // 아직 안 나온 이름부터 골라, 적은 인원에서도 한 사람만 반복해 비치지 않게 합니다.
    const index = pick(count, (k) => k !== next && !seen.has(k), random) ?? pick(count, (k) => k !== next, random) ?? winner;
    plan[i].index = index;
    seen.add(index);
  }
  return plan;
}

/** @param {number} count @param {(k:number)=>boolean} allowed @param {()=>number} random */
function pick(count, allowed, random) {
  let free = 0;
  for (let k = 0; k < count; k++) if (allowed(k)) free++;
  if (!free) return null;
  let r = Math.min(free - 1, Math.floor(random() * free));
  for (let k = 0; k < count; k++) if (allowed(k) && r-- === 0) return k;
  return null;
}

/** @param {{at:number,index:number}[]} plan @param {number} elapsed */
export function rollingStep(plan, elapsed) {
  let step = 0;
  while (step + 1 < plan.length && plan[step + 1].at <= elapsed) step++;
  return step;
}

/**
 * fits(비율)가 참인 가장 큰 비율을 min..1 사이에서 찾습니다. 7번 반으로 나누면 1% 안쪽까지 맞습니다.
 * @param {(scale:number)=>boolean} fits
 * @returns {{scale:number,fits:boolean}} fits=false면 가장 작게 줄여도 넘친다는 뜻입니다.
 */
export function largestFit(fits, min = 0.3, steps = 7) {
  if (fits(1)) return { scale: 1, fits: true };
  if (!fits(min)) return { scale: min, fits: false };
  let lo = min, hi = 1;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { scale: Math.round(lo * 1000) / 1000, fits: true };
}

/**
 * 이름 글자(node)가 카드(부모 요소) 안에 들어가도록 CSS 변수 --fit(0.3~1)을 맞추는 Svelte 액션입니다.
 * 왜 재는가: 글꼴마다 글자 폭이 달라(사용자 글꼴 포함) 글자 수로 어림하면 넘치거나 이름 중간에서 줄이 바뀝니다.
 * 이름은 줄을 바꾸지 않고(word-break:keep-all) 작아지며, 띄어쓰기가 있는 긴 항목만 띄어쓰기에서 줄을 바꿉니다.
 * 가장 작게 줄여도 넘치는 한 덩어리 글자(띄어쓰기 없는 40자 등)만 data-squeezed로 아무 데서나 줄을 바꿉니다.
 * @param {HTMLElement} node
 * @param {string} _name 바뀔 때마다 다시 재도록 받는 값(재는 것은 화면에 그려진 글자입니다)
 */
export function fitName(node, _name) {
  const box = /** @type {HTMLElement} */ (node.parentElement);
  /** @type {Map<string,{scale:number,fits:boolean}>} */ const cache = new Map();
  let queued = false;
  let alive = true;
  const measure = (/** @type {number} */ scale) => {
    node.style.setProperty('--fit', String(scale));
    return node.scrollWidth <= node.clientWidth + 1 && box.scrollHeight <= box.clientHeight + 1;
  };
  const run = () => {
    queued = false;
    if (!alive || !node.isConnected) return;
    const key = `${node.textContent}|${box.clientWidth}x${box.clientHeight}|${getComputedStyle(node).fontFamily}`;
    let result = cache.get(key);
    if (!result) {
      node.removeAttribute('data-squeezed');
      result = largestFit(measure);
      cache.set(key, result);
    }
    node.style.setProperty('--fit', String(result.scale));
    node.toggleAttribute('data-squeezed', !result.fits);
  };
  // Svelte가 글자를 바꾼 뒤, 화면에 그리기 전에 잽니다(마이크로태스크는 그리기보다 먼저 돕니다).
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  };
  const reset = () => {
    cache.clear();
    schedule();
  };
  const resize = new ResizeObserver(reset);
  resize.observe(box);
  // 사용자 글꼴이 늦게 도착하면 대체 글꼴로 잰 값이 틀리므로 다시 잽니다.
  document.fonts?.addEventListener('loadingdone', reset);
  schedule();
  return {
    update: schedule,
    destroy() {
      alive = false;
      resize.disconnect();
      document.fonts?.removeEventListener('loadingdone', reset);
    },
  };
}
