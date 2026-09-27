// 개표 계산(PRD 8절 "당선 계산" · "찬반 판정"). 모든 개표 모드의 마지막 화면 숫자는 이 계산과 같아야 합니다.

/** @typedef {import('./model.js').Item} Item */
/** @typedef {import('./model.js').Ballot} Ballot */
/** @typedef {{item:Item, count:number, rank:number}} Row */

/** 항목별 득표와 기권 칸 수. ballots는 개표 순서로 앞에서부터 upTo장만 셉니다(연출 중간값).
 * @param {Item[]} items @param {Ballot[]} ballots @param {number} [upTo] */
export function countItems(items, ballots, upTo = ballots.length) {
  /** @type {Record<string, number>} */ const counts = Object.fromEntries(items.map((it) => [it.id, 0]));
  let abstain = 0;
  for (const b of ballots.slice(0, upTo)) {
    for (const id of b.p) if (id in counts) counts[id]++;
    abstain += b.a;
  }
  return { counts, abstain, participants: Math.min(upTo, ballots.length) };
}

/** 득표 내림차순, 같은 득표는 같은 순위(1·2·2·4), 화면 순서는 기호 순. @param {Item[]} items @param {Record<string,number>} counts @returns {Row[]} */
export function rankRows(items, counts) {
  const sorted = [...items].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.number - b.number);
  /** @type {Row[]} */ const rows = [];
  sorted.forEach((item, i) => {
    const count = counts[item.id] ?? 0;
    const rank = i > 0 && rows[i - 1].count === count ? rows[i - 1].rank : i + 1;
    rows.push({ item, count, rank });
  });
  return rows;
}

/**
 * 당선·동점. 0표는 당선될 수 없습니다.
 * @param {Row[]} rows rankRows 결과 @param {number} seats
 * @returns {{winners:string[], tied:string[], openSeats:number}} openSeats = 동점 때문에 비워 둔 자리(결선으로 채움)
 */
export function decide(rows, seats) {
  const nonzero = rows.filter((r) => r.count > 0);
  if (nonzero.length <= seats) return { winners: nonzero.map((r) => r.item.id), tied: [], openSeats: 0 };
  const boundary = nonzero[seats - 1].count;
  const above = nonzero.filter((r) => r.count > boundary);
  const at = nonzero.filter((r) => r.count === boundary);
  const remaining = seats - above.length;
  if (at.length === remaining) return { winners: [...above, ...at].map((r) => r.item.id), tied: [], openSeats: 0 };
  return { winners: above.map((r) => r.item.id), tied: at.map((r) => r.item.id), openSeats: remaining };
}

/** 후보·의견 투표 결과 한 번에. @param {{items:Item[], rules:{seats:number}}} config @param {Ballot[]} ballots */
export function tallyItems(config, ballots) {
  const { counts, abstain, participants } = countItems(config.items, ballots);
  const rows = rankRows(config.items, counts);
  const decision = decide(rows, config.rules.seats);
  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, abstain, participants, rows, totalVotes, ...decision, noneVoted: totalVotes === 0 };
}

/**
 * "당선 확실": 남은 표를 모두 받아도 뒤집을 수 없으면 확실(PRD 8절).
 * A가 확실 ⇔ A의 득표 > (A를 뺀 k번째 득표) + 남은 표 × (한 표가 한 항목에 줄 수 있는 최대 표).
 * 남은 표가 같은 후보에게 겹쳐 가는 경우를 무시해 보수적으로 판정하므로, 확실이라 한 것이 틀리는 일은 없습니다.
 * @param {Record<string,number>} counts @param {number} remaining 남은 표 장 수 @param {number} perBallotMax @param {number} seats
 * @returns {string[]} 확실한 항목 id */
export function certainWinners(counts, remaining, perBallotMax, seats) {
  const ids = Object.keys(counts);
  return ids.filter((id) => {
    const mine = counts[id];
    if (mine <= 0) return false;
    const others = ids.filter((x) => x !== id).map((x) => counts[x]).sort((a, b) => b - a);
    const kth = others[seats - 1] ?? 0;
    return mine > kth + remaining * perBallotMax;
  });
}

// ── 찬반 ──
/** 통과 여부. 판정 없음이면 null. @param {string} rule @param {{yes:number,no:number,participants:number}} t @returns {boolean|null} */
export function passes(rule, { yes, no, participants }) {
  switch (rule) {
    case 'yesOverNo': return yes > no;
    case 'majority': return yes * 2 > participants;
    case 'twoThirds': return participants > 0 && yes * 3 >= participants * 2;
    default: return null;
  }
}

/** 안건 k의 집계(개표 순서 앞 upTo장). @param {Ballot[]} ballots @param {number} k @param {number} [upTo] */
export function countAgenda(ballots, k, upTo = ballots.length) {
  let yes = 0, no = 0, abstain = 0;
  for (const b of ballots.slice(0, upTo)) {
    const v = b.p[k];
    if (v === 'y') yes++;
    else if (v === 'n') no++;
    else if (v === 'a') abstain++;
  }
  return { yes, no, abstain, participants: yes + no + abstain };
}

/** 찬반 전체 결과. @param {{agendas:{id:string,text:string}[], rules:{passRule:string}}} config @param {Ballot[]} ballots */
export function tallyYesNo(config, ballots) {
  return config.agendas.map((agenda, k) => {
    const t = countAgenda(ballots, k);
    return { agenda, ...t, passed: passes(config.rules.passRule, t), tie: t.yes === t.no };
  });
}

/** 남은 표를 모두 받아도 결과가 바뀌지 않으면 'pass'·'fail', 아직 모르면 null(개표 방송의 "통과 확실").
 * @param {string} rule @param {{yes:number,no:number,participants:number}} t @param {number} remaining */
export function certainPass(rule, t, remaining) {
  if (rule === 'none') return null;
  const worst = { yes: t.yes, no: t.no + remaining, participants: t.participants + remaining };
  const best = { yes: t.yes + remaining, no: t.no, participants: t.participants + remaining };
  if (passes(rule, worst)) return 'pass';
  if (!passes(rule, best)) return 'fail';
  return null;
}

/** 통과 기준 문장(결과 화면). @param {string} rule */
export function ruleSentence(rule) {
  switch (rule) {
    case 'yesOverNo': return '찬성이 반대보다 많으면 통과';
    case 'majority': return '투표한 사람의 절반보다 많이 찬성하면 통과';
    case 'twoThirds': return '투표한 사람의 3분의 2 이상이 찬성하면 통과';
    default: return '통과 여부는 판정하지 않아요';
  }
}

/** 퍼센트(소수 없이). @param {number} part @param {number} whole */
export const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
