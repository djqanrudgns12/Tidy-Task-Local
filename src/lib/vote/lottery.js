// 기호 추첨(PRD 4절). 결과를 먼저 정하고, 화면 연출은 그 결과를 보여 주기만 합니다.
import { fisherYates, secureRandom } from './random.js';
import { renumber } from './assign.js';

/**
 * 후보 순서를 무작위로 섞어 기호를 새로 매깁니다.
 * @param {import('./model.js').Item[]} items @param {()=>number} [rng]
 * @returns {{items:import('./model.js').Item[], order:string[]}} order = 새 기호 순서의 id(연출에서 1번부터 차례로 내려앉는 순서)
 */
export function drawNumbers(items, rng = secureRandom) {
  const shuffled = fisherYates(items, rng);
  const next = renumber(shuffled);
  return { items: next, order: next.map((it) => it.id) };
}

/** 추첨 연출 시간(ms): 섞기 1.2초 + 한 장 0.35초. 소리 lot.shuffle·lot.deal과 같은 박자입니다. @param {number} count */
export const lotteryDuration = (count) => 1200 + count * 350;
