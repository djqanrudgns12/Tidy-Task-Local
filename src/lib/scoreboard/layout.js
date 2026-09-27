/** 카드 판 배치(PRD 6.1·6.2).
 * 항목 수와 판 크기에서, 스크롤 없이 "점수 글자가 가장 커지는" 열·행 수를 고릅니다(화상회의 타일 배치와 같은 방식).
 * 모든 경우의 열 수를 시험해도 40개면 40번 계산이라 충분히 빠릅니다. */

// 점수 글자가 보기 좋은 카드 비율(폭/높이). 이보다 좁은 카드는 폭이 글자 크기를 제한합니다.
const IDEAL_RATIO = 1.25;
export const MIN_CARD_HEIGHT = 96;
// 밀도 경계(카드 높이 px)와 창을 조금씩 키울 때 깜빡이지 않게 두는 여유
export const DENSITY_WIDE = 220;
export const DENSITY_NORMAL = 130;
export const DENSITY_HYSTERESIS = 8;

/**
 * @param {number} n 카드 수
 * @param {number} width 판 폭(px) @param {number} height 판 높이(px)
 * @param {{gap?:number}} [o]
 * @returns {{cols:number, rows:number, cardW:number, cardH:number, scroll:boolean}}
 */
export function fitGrid(n, width, height, { gap = 12 } = {}) {
  if (n <= 0 || width <= 0 || height <= 0) return { cols: 1, rows: 1, cardW: Math.max(0, width), cardH: Math.max(0, height), scroll: false };
  /** @type {{cols:number,rows:number,cardW:number,cardH:number,score:number,empty:number}|null} */
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cardW = (width - (cols - 1) * gap) / cols;
    const cardH = (height - (rows - 1) * gap) / rows;
    if (cardW <= 0 || cardH <= 0) continue;
    const score = Math.min(cardH, cardW / IDEAL_RATIO);
    const empty = cols * rows - n;
    if (!best || score > best.score + 0.5 || (Math.abs(score - best.score) <= 0.5 && (empty < best.empty || (empty === best.empty && cols > best.cols))))
      best = { cols, rows, cardW, cardH, score, empty };
  }
  if (best && best.cardH >= MIN_CARD_HEIGHT) return { cols: best.cols, rows: best.rows, cardW: best.cardW, cardH: best.cardH, scroll: false };
  // 너무 많으면 카드 최소 높이를 지키고 세로로 스크롤합니다(40개 넘는 커스텀·개인 점수판).
  const minW = MIN_CARD_HEIGHT * IDEAL_RATIO;
  const cols = Math.max(1, Math.min(n, Math.floor((width + gap) / (minW + gap))));
  const cardW = (width - (cols - 1) * gap) / cols;
  return { cols, rows: Math.ceil(n / cols), cardW, cardH: MIN_CARD_HEIGHT, scroll: true };
}

/** 카드 높이 → 밀도. prev가 있으면 경계 근처에서 이전 밀도를 유지합니다.
 * @param {number} cardH @param {'wide'|'normal'|'tight'} [prev] @returns {'wide'|'normal'|'tight'} */
export function densityOf(cardH, prev) {
  const h = DENSITY_HYSTERESIS;
  const plain = cardH >= DENSITY_WIDE ? 'wide' : cardH >= DENSITY_NORMAL ? 'normal' : 'tight';
  if (!prev || prev === plain) return plain;
  if (prev === 'wide' && cardH >= DENSITY_WIDE - h) return 'wide';
  if (prev === 'tight' && cardH < DENSITY_NORMAL + h) return 'tight';
  if (prev === 'normal' && cardH >= DENSITY_NORMAL - h && cardH < DENSITY_WIDE + h) return 'normal';
  return plain;
}

// 고정폭 숫자 한 글자의 폭(글자 크기 대비, 대부분의 한글 글꼴 숫자는 0.55~0.62)
const DIGIT_WIDTH = 0.62;

/** 카드 안 치수와 점수 글자 크기(PRD 6.2).
 * 버튼 배치 두 가지 중 점수 글자가 더 커지는 쪽을 고릅니다.
 *  - bottom: 아래 한 줄에 [−] 2 : 3 [+] (넓은 카드 — 누르기 편한 큰 버튼)
 *  - side:   점수 양옆에 세운 [−] [+] (보통·빽빽 — 30명 카드에서도 숫자가 56px 이상 되도록 세로 자리를 아낌)
 * @param {number} cardW @param {number} cardH @param {'wide'|'normal'|'tight'} density @param {number} chars "−12" → 3 @param {boolean} [hasSub] */
export function cardMetrics(cardW, cardH, density, chars, hasSub = false) {
  const pad = density === 'wide' ? 12 : density === 'normal' ? 10 : 8;
  const gap = density === 'wide' ? 8 : density === 'normal' ? 6 : 4;
  const nameMax = nameFontMax(cardH, density);
  const headH = Math.round(nameMax * 1.3);
  const btnH = density === 'wide' ? 56 : density === 'normal' ? 40 : 32;
  const btnW = density === 'wide' ? 64 : density === 'normal' ? 48 : 40;
  const digits = Math.max(2, chars) * DIGIT_WIDTH;
  const subH = hasSub && density === 'wide' ? 22 : 0;
  const bottom = Math.min((cardH - headH - btnH - pad * 2 - gap * 2 - subH) * 0.9, ((cardW - pad * 2) * 0.9) / digits);
  const side = Math.min((cardH - headH - pad * 2 - gap - subH) * 0.9, ((cardW - pad * 2 - btnW * 2 - gap * 2) * 0.94) / digits);
  const mode = density !== 'wide' && side > bottom ? 'side' : 'bottom';
  const scoreFont = Math.max(12, Math.floor(Math.min(mode === 'side' ? side : bottom, 260)));
  return { mode: /** @type {'bottom'|'side'} */ (mode), scoreFont, nameMax, headH, btnH, btnW, pad, gap };
}

/** 모둠끼리 모아 보기: 묶음마다 왼쪽에 이름 칸(headingW)을 두고 같은 크기의 카드로 채울 때 가장 큰 카드가 되는 열 수.
 * 왜 제목을 왼쪽에 두는가: 위에 두면 묶음 수만큼 세로 자리를 잃어 30명·6모둠에서 스크롤이 생겼습니다.
 * @param {number[]} sizes 묶음별 카드 수 @param {number} width @param {number} height @param {{gap?:number, headingW?:number}} [o] */
export function fitClusters(sizes, width, height, { gap = 12, headingW = 84 } = {}) {
  const n = Math.max(...sizes, 1);
  const inner = width - headingW - gap;
  /** @type {{cols:number,cardW:number,cardH:number,score:number}|null} */
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = sizes.reduce((sum, s) => sum + Math.ceil(s / cols), 0);
    const cardW = (inner - (cols - 1) * gap) / cols;
    const cardH = (height - (rows - 1) * gap) / rows;
    if (cardW <= 0 || cardH <= 0) continue;
    const score = Math.min(cardH, cardW / IDEAL_RATIO);
    if (!best || score > best.score + 0.5) best = { cols, cardW, cardH, score };
  }
  if (best && best.cardH >= MIN_CARD_HEIGHT) return { cols: best.cols, cardW: best.cardW, cardH: best.cardH, scroll: false };
  const cols = Math.max(1, Math.floor((inner + gap) / (MIN_CARD_HEIGHT * IDEAL_RATIO + gap)));
  return { cols, cardW: (inner - (cols - 1) * gap) / cols, cardH: MIN_CARD_HEIGHT, scroll: true };
}

/** 이름 글자 크기의 최대값(px). 실제 크기는 fitText가 폭에 맞춰 줄입니다.
 * @param {number} cardH @param {'wide'|'normal'|'tight'} density */
export function nameFontMax(cardH, density) {
  if (density === 'wide') return Math.round(Math.min(44, Math.max(26, cardH * 0.13)));
  if (density === 'normal') return Math.round(Math.min(26, Math.max(18, cardH * 0.15)));
  return Math.round(Math.min(18, Math.max(13, cardH * 0.15)));
}
