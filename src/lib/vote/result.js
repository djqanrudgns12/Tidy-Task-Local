// 결과 모델(PRD 8절 "결과 화면"). 결과 화면과 결과 이미지(PNG)가 같은 모델을 써서 공개 범위가 어긋나지 않게 합니다.
// 공개 범위: all(득표·비율) · rank(순위만) · winner(당선자만) · result(찬반: 통과/부결만).
import { finalResult } from './archive.js';
import { tallyYesNo, ruleSentence, percent } from './tally.js';
import { VISIBILITIES } from './model.js';

/** 결과 보기·이미지 저장에 사용하는 공개 범위 이름. @param {string} visibility @param {string} [type] */
export function resultVisibilityLabel(visibility, type = 'candidate') {
  if (visibility === 'rank') return '순위만 공개';
  if (visibility === 'winner') return type === 'opinion' ? '선택된 항목만 공개' : '당선자만 공개';
  if (visibility === 'result') return '결과만 공개';
  return '모두 공개';
}

/** @param {import('./model.js').VoteType} type */
export function resultVisibilityOptions(type) {
  return VISIBILITIES[type].map(value => ({ value, label: resultVisibilityLabel(value, type) }));
}

/**
 * @param {import('./archive.js').Entry} entry
 * @param {{teacher?:boolean, visibility?:string}} [o] teacher=true면 모두 공개. visibility는 기록 원본을 바꾸지 않는 미리보기·내보내기 선택.
 */
export function resultModel(entry, o = {}) {
  const c = entry.config;
  const requested = o.visibility ?? c.reveal.visibility;
  const visibility = o.teacher ? 'all' : VISIBILITIES[c.type].includes(requested) ? requested : c.reveal.visibility;
  const base = {
    id: entry.id,
    title: c.title,
    date: entry.finishedOn,
    type: c.type,
    visibility,
    voters: c.rules.voters,
    participants: entry.ballots.length,
    showCounts: visibility === 'all',
  };
  if (c.type === 'yesno') {
    const agendas = tallyYesNo(c, entry.ballots).map((a) => ({
      text: a.agenda.text,
      yes: a.yes,
      no: a.no,
      abstain: a.abstain,
      participants: a.participants,
      passed: a.passed,
      tie: a.tie,
      yesPercent: percent(a.yes, a.participants),
      noPercent: percent(a.no, a.participants),
    }));
    return { ...base, rule: ruleSentence(c.rules.passRule), passRule: c.rules.passRule, agendas, winners: [], rows: [], pendingTie: [], openSeats: 0, noneVoted: false, validVotes: base.showCounts ? agendas.reduce((n, a) => n + a.yes + a.no, 0) : null, abstain: agendas.reduce((n, a) => n + a.abstain, 0), runoffCount: 0, round: 0, seats: 0 };
  }
  const final = finalResult(entry);
  // 순위 목록은 방금 개표한 판(결선이 있으면 마지막 결선)을 보여 줍니다. 당선자는 모든 판을 합친 최종 결과입니다.
  const lastIndex = final.rounds.length - 1;
  const shown = final.rounds[lastIndex];
  const shownRound = lastIndex === 0 ? entry : entry.runoffs[lastIndex - 1];
  const byId = new Map([entry, ...entry.runoffs].flatMap((r) => r.config.items).map((it) => [it.id, it]));
  const winners = final.winners.map((id) => byId.get(id)).filter(Boolean);
  const tied = final.pendingTie.map((id) => byId.get(id)).filter(Boolean);
  const winnerSet = new Set(final.winners);
  const tiedSet = new Set(final.pendingTie);
  const rows = visibility === 'winner' ? [] : shown.rows.map((r) => ({
    item: r.item,
    rank: r.rank,
    count: visibility === 'all' ? r.count : null,
    percent: visibility === 'all' ? percent(r.count, shown.totalVotes) : null,
    winner: winnerSet.has(r.item.id),
    tied: tiedSet.has(r.item.id),
  }));
  return {
    ...base,
    winners: /** @type {import('./model.js').Item[]} */ (winners),
    pendingTie: /** @type {import('./model.js').Item[]} */ (tied),
    openSeats: final.openSeats,
    rows,
    participants: shownRound.ballots.length,
    validVotes: visibility === 'all' ? shown.totalVotes : null,
    abstain: visibility === 'all' ? shown.abstain : null,
    noneVoted: final.rounds[0].noneVoted,
    round: lastIndex,
    seats: c.rules.seats,
    runoffCount: entry.runoffs.length,
    agendas: [],
    rule: '',
    passRule: '',
  };
}

/** 화면·PNG·접근성 안내가 동일한 문구를 사용합니다. @param {ReturnType<typeof resultModel>} m */
export function resultNote(m) {
  const detail = m.type === 'yesno'
    ? (m.rule ? `판정 기준 · ${m.rule}` : '찬반 의견 집계')
    : m.showCounts ? '득표율은 유효 선택 수 기준'
    : `공개 범위 · ${resultVisibilityLabel(m.visibility, m.type)}`;
  return `※ ${detail}`;
}

/** 결과 한 줄 요약(기록함 목록·알림). @param {ReturnType<typeof resultModel>} m */
export function resultSummary(m) {
  if (m.type === 'yesno') {
    if (m.agendas.length === 1) {
      const a = m.agendas[0];
      return a.passed === null ? '판정 없음' : a.passed ? '통과' : '부결';
    }
    const passed = m.agendas.filter((a) => a.passed).length;
    return m.agendas[0]?.passed === null ? `안건 ${m.agendas.length}개` : `안건 ${m.agendas.length}개 중 ${passed}개 통과`;
  }
  if (m.noneVoted) return '당선자 없음';
  const names = m.winners.map((w) => w.name).join(', ');
  if (m.pendingTie.length) return names ? `${names} · 나머지 동점` : '동점 — 결선 필요';
  return names || '당선자 없음';
}
