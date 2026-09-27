/** 보상·경고 단계의 표시 계산(PRD 10.5). 화면에 보이는 상태는 "지금 값"으로 정하고,
 * 알림(처음 도달)은 저장된 도달 표시로 정합니다(rules.js). */
import { LIMITS } from './model.js';
import { unitMark } from './moods.js';

/** @typedef {import('./model.js').Stage} Stage */

/** 단계를 둘 수 있는 개수: 최대 10개, 그리고 (최대 − 1)개 이하 @param {number} max */
export const stageLimit = (max) => Math.max(0, Math.min(LIMITS.stages, max - 1));

/** @param {Stage[]} stages @param {number} value @param {number} max
 * @returns {(Stage & {status:'reached'|'next'|'future', remain:number, hidden:boolean})[]} */
export function stageStatus(stages, value, max) {
  let nextFound = false;
  return [...stages]
    .sort((a, b) => a.at - b.at)
    .map((s) => {
      const hidden = s.at >= max;
      let status = /** @type {'reached'|'next'|'future'} */ ('future');
      if (!hidden && value >= s.at) status = 'reached';
      else if (!hidden && !nextFound) {
        status = 'next';
        nextFound = true;
      }
      return { ...s, status, remain: Math.max(0, s.at - value), hidden };
    });
}

/** 큰 숫자 아래 한 줄: 다음에 닿을 단계(없으면 목표/한계까지)
 * @param {'positive'|'negative'} mood @param {Stage[]} stages @param {number} value @param {number} max @param {'deg'|'point'|'none'} unit */
export function nextLine(mood, stages, value, max, unit) {
  const u = unitMark(unit) || '';
  const next = stageStatus(stages, value, max).find((s) => s.status === 'next');
  if (value >= max) return mood === 'positive' ? '목표 달성!' : '한계에 닿았어요';
  const left = max - value;
  if (mood === 'negative' && left <= 1) return `한계까지 ${left}${u}!`;
  if (next) {
    const label = next.label ? ` ${next.label}` : '';
    return mood === 'positive'
      ? `다음: ${next.at}${u}${label}까지 ${next.remain}${u}`
      : `다음 경고: ${next.at}${u}${label}까지 ${next.remain}${u}`;
  }
  return mood === 'positive' ? `목표까지 ${left}${u}` : `한계까지 ${left}${u}`;
}

/** 스티커 세로 배치(1차원 라벨 배치). 원래 위치(y)를 지키되 서로 minGap보다 가까우면 아래로 밀고,
 * 바닥을 넘으면 아래에서 위로 한 번 더 밀어 올립니다. 순서는 바뀌지 않습니다.
 * @param {number[]} ys 원래 가운데 y(위→아래 순서로 정렬된 값) @param {number} minGap @param {number} top @param {number} bottom
 * @returns {{ys:number[], compact:boolean}} compact = 다 들어가지 않아 배지만 보일 때 */
export function layoutStickers(ys, minGap, top, bottom) {
  const out = [...ys];
  if (!out.length) return { ys: out, compact: false };
  if ((out.length - 1) * minGap > bottom - top) return { ys: out, compact: true };
  out[0] = Math.max(top, out[0]);
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + minGap);
  if (out[out.length - 1] > bottom) {
    out[out.length - 1] = bottom;
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - minGap);
  }
  return { ys: out, compact: false };
}

/** 설정 눈금자의 칸: 최대 20 이하면 1°씩, 그보다 크면 보기 좋은 간격 @param {number} max */
export function rulerCells(max) {
  if (max <= 21) return Array.from({ length: max - 1 }, (_, i) => i + 1);
  const step = [2, 5, 10, 20, 25, 50, 100].find((s) => max / s <= 20) ?? 100;
  const cells = [];
  for (let v = step; v < max; v += step) cells.push(v);
  return cells;
}

/** 고르게 나눈 n개 온도(반올림, 겹치면 한 칸씩 비킴) @param {number} max @param {number} n */
export function evenStages(max, n) {
  const count = Math.max(0, Math.min(n, stageLimit(max)));
  /** @type {number[]} */
  const out = [];
  for (let i = 1; i <= count; i++) {
    let at = Math.round((max * i) / (count + 1));
    at = Math.max(1, Math.min(max - 1, at));
    while (out.includes(at) && at < max - 1) at++;
    while (out.includes(at) && at > 1) at--;
    if (!out.includes(at)) out.push(at);
  }
  return out.sort((a, b) => a - b);
}

/** 최대를 바꿨을 때 단계를 비율대로 옮깁니다(1 ~ 최대−1, 겹치면 비킴) @param {Stage[]} stages @param {number} oldMax @param {number} newMax */
export function fitStagesToMax(stages, oldMax, newMax) {
  /** @type {number[]} */ const used = [];
  return [...stages]
    .sort((a, b) => a.at - b.at)
    .slice(0, stageLimit(newMax))
    .map((s) => {
      let at = Math.max(1, Math.min(newMax - 1, Math.round((s.at / oldMax) * newMax)));
      while (used.includes(at) && at < newMax - 1) at++;
      while (used.includes(at) && at > 1) at--;
      used.push(at);
      return { ...s, at, reached: false };
    })
    .sort((a, b) => a.at - b.at);
}
