// 개표 연출의 진행 계산(PRD 8절). 연출의 진실은 저장된 counting.cursor(몇 걸음 공개했나) 하나이고,
// 화면은 이 값에서 계산합니다. 그래서 건너뛰기·창 가림·앱 재시작 뒤에도 숫자가 어긋나지 않습니다.
//
// 모드별 걸음(cursor)의 뜻
//  - instant: 0 → 1
//  - paper · race: 공개한 표 장 수(찬반은 안건마다 따로)
//  - broadcast: 공개한 묶음 수(묶음 경계는 broadcastStops)
//  - reverse: 공개한 카드 묶음 수(낮은 득표부터, 같은 득표는 함께)
//  - pick: 걸음 대신 counting.revealed(선생님이 고른 카드)
import { countItems, rankRows, decide, countAgenda } from './tally.js';

/** @typedef {import('./model.js').Session} Session */
/** @typedef {import('./model.js').Ballot} Ballot */

export const SPEED_FACTOR = Object.freeze({ slow: 1.4, normal: 1, fast: 0.6 });
/** 드럼롤 길이(ms). 소리 reveal.drumroll과 같아야 합니다. */
export const DRUMROLL_MS = 2500;

/** 개표 순서대로 늘어선 표. @param {Session} s @returns {Ballot[]} */
export function ballotsInOrder(s) {
  const byId = new Map(s.ballots.map((b) => [b.id, b]));
  const order = s.counting?.order ?? s.ballots.map((b) => b.id);
  return order.map((id) => byId.get(id)).filter(/** @returns {b is Ballot} */ (b) => !!b);
}

/** 개표 방송의 묶음 경계: 10%씩, 90%부터는 한 장씩(막판 긴장감). 표가 없으면 빈 목록.
 * @param {number} total @returns {number[]} 각 걸음 뒤의 공개 장 수 */
export function broadcastStops(total) {
  if (total <= 0) return [];
  const batch = Math.max(1, Math.ceil(total * 0.1));
  const slowFrom = Math.floor(total * 0.9);
  /** @type {number[]} */ const stops = [];
  let n = 0;
  while (n < slowFrom) stops.push((n = Math.min(n + batch, slowFrom)));
  while (n < total) stops.push(++n);
  return stops;
}

/**
 * 반전 공개의 묶음: 득표가 낮은 쪽부터, 같은 득표는 한 번에. 당선자만 공개면 당선(과 동점) 묶음 하나.
 * @param {Session} s @returns {{ids:string[], winner:boolean, drumroll:boolean}[]}
 */
export function reverseGroups(s) {
  const { counts } = countItems(s.items, s.ballots);
  const rows = rankRows(s.items, counts);
  const d = decide(rows, s.rules.seats);
  const top = new Set([...d.winners, ...d.tied]);
  if (s.reveal.visibility === 'winner') {
    const ids = rows.filter((r) => top.has(r.item.id)).map((r) => r.item.id);
    return ids.length ? [{ ids, winner: true, drumroll: true }] : [];
  }
  const asc = [...rows].reverse();
  /** @type {{ids:string[], winner:boolean, drumroll:boolean}[]} */ const groups = [];
  for (const r of asc) {
    const last = groups[groups.length - 1];
    const lastCount = last ? counts[last.ids[0]] : null;
    if (last && lastCount === r.count) last.ids.push(r.item.id);
    else groups.push({ ids: [r.item.id], winner: false, drumroll: false });
  }
  for (const g of groups) g.winner = g.ids.some((id) => top.has(id));
  const firstWinner = groups.findIndex((g) => g.winner);
  if (firstWinner >= 0) groups[firstWinner].drumroll = true;
  // 같은 순위끼리는 기호 순으로 놓습니다.
  const numberOf = new Map(s.items.map((it) => [it.id, it.number]));
  for (const g of groups) g.ids.sort((a, b) => (numberOf.get(a) ?? 0) - (numberOf.get(b) ?? 0));
  return groups;
}

/** 지금 안건(찬반)이나 투표 전체에서 걸음 수. @param {Session} s */
export function stepCount(s) {
  switch (s.reveal.mode) {
    case 'instant': return 1;
    case 'paper':
    case 'race': return s.ballots.length;
    case 'broadcast': return broadcastStops(s.ballots.length).length;
    case 'reverse': return reverseGroups(s).length;
    case 'pick': return s.items.length;
    default: return 1;
  }
}

/** 걸음 → 공개한 표 장 수(paper·race·broadcast). @param {Session} s @param {number} cursor */
export function ballotsShown(s, cursor) {
  if (s.reveal.mode === 'broadcast') {
    const stops = broadcastStops(s.ballots.length);
    return cursor <= 0 ? 0 : stops[Math.min(cursor, stops.length) - 1];
  }
  if (s.reveal.mode === 'instant') return cursor > 0 ? s.ballots.length : 0;
  return Math.min(Math.max(0, cursor), s.ballots.length);
}

/** 연출 중간의 항목별 득표(후보·의견). @param {Session} s @param {number} cursor */
export function partialCounts(s, cursor) {
  return countItems(s.items, ballotsInOrder(s), ballotsShown(s, cursor));
}

/** 연출 중간의 찬반 집계. @param {Session} s @param {number} agenda @param {number} cursor */
export function partialAgenda(s, agenda, cursor) {
  return countAgenda(ballotsInOrder(s), agenda, ballotsShown(s, cursor));
}

/** 개표가 끝났는지(찬반은 마지막 안건까지). @param {Session} s */
export function isComplete(s) {
  const c = s.counting;
  if (!c) return false;
  if (s.reveal.mode === 'pick') return s.items.every((it) => c.revealed.includes(it.id));
  const lastAgenda = s.type === 'yesno' ? Math.max(0, s.agendas.length - 1) : 0;
  return c.agenda >= lastAgenda && c.cursor >= stepCount(s);
}

/**
 * 자동 재생에서 다음 걸음까지 기다릴 시간(ms). 레이스는 처음엔 조금 느리게, 가운데서 빨라지고, 마지막 15%는 느려져 긴장감을 만듭니다.
 * @param {string} mode @param {number} index 지금까지 걸음 @param {number} total @param {'slow'|'normal'|'fast'} speed
 * @param {{drumrollNext?:boolean}} [extra]
 */
export function autoDelay(mode, index, total, speed, extra = {}) {
  const f = SPEED_FACTOR[speed] ?? 1;
  switch (mode) {
    // Keep the sheet legible: motion finishes in 420ms, then even fast holds for 980ms.
    case 'paper': return ({ slow: 2800, normal: 2000, fast: 1400 })[speed] ?? 2000;
    case 'race': {
      if (total <= 0) return 0;
      const p = index / total;
      if (p >= 0.85) return Math.round(900 * f);
      // 0 → 0.5 구간에서 360ms → 220ms로 빨라집니다.
      const ramp = Math.min(1, p / 0.5);
      return Math.round((360 - 140 * ramp) * f);
    }
    case 'broadcast': {
      // total is the number of reveal steps, not ballots. Hold the final
      // batches longer so viewers can read the changing standings.
      return Math.round((index >= Math.max(1, total - 3) ? 2600 : 2100) * f);
    }
    case 'reverse': return Math.round((extra.drumrollNext ? DRUMROLL_MS + 900 : 2200) * f);
    default: return Math.round(1200 * f);
  }
}

/** 正(바를 정) 획: 5획이 한 글자. @param {number} count @returns {{full:number, rest:number}} */
export const tallyMarks = (count) => ({ full: Math.floor(count / 5), rest: count % 5 });

/**
 * 레이스 트랙의 결승 거리(칸). 최종 득표를 미리 드러내지 않도록 "지금 선두 + 여유"로 정하고, 선두가 다가오면 늘어납니다.
 * 마지막 표에서는 결승선이 선두 바로 앞으로 들어옵니다(화면에서 finished일 때).
 * @param {number} leader 지금 선두 득표 @param {boolean} finished */
export function raceGoal(leader, finished) {
  if (finished) return Math.max(leader, 1);
  return Math.max(6, Math.ceil((leader + 3) / 3) * 3);
}
