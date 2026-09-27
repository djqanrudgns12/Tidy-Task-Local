/** 증감 단위(PRD 6.3). 칩 [1][2][5][10] + 직접 입력 1개(마지막으로 입력한 값이 다섯 번째 칩으로 남음). */
import { LIMITS } from './model.js';

export const STEP_CHIPS = Object.freeze([1, 2, 5, 10]);

/** 직접 입력 글자 → 1~999 정수 또는 null. 전각 숫자(５)도 받습니다.
 * @param {unknown} text */
export function parseStep(text) {
  const t = String(text ?? '').normalize('NFKC').trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= LIMITS.step ? n : null;
}

/** 보여 줄 칩 목록: 기본 4개 + 기본에 없는 직접 입력값
 * @param {number|null} customStep */
export function chipsFor(customStep) {
  return customStep && !STEP_CHIPS.includes(customStep) ? [...STEP_CHIPS, customStep] : [...STEP_CHIPS];
}

/** "+5" / "−5" 표기(마이너스는 보기 좋은 긴 줄표 U+2212) @param {number} n */
export const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
/** 점수 표기 @param {number} n */
export const scoreText = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));
