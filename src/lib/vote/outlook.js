// Public-information-only counting outlook. "Likely" is a conservative trend,
// never a statistical probability. "Certain" requires a mathematical guarantee.
import { ballotsShown, partialCounts, partialAgenda, reverseGroups } from './reveal.js';
import { countItems, rankRows, certainPass } from './tally.js';

/** @typedef {'close'|'ahead'|'likely'|'certain'} Kind */
/** @typedef {{kind:Kind, label:string, detail:string}} OutlookTag */
/** @typedef {{byId:Record<string,OutlookTag>, leaders:string[], outcome:OutlookTag|null}} Outlook */
/** @returns {Outlook} */
const empty = () => ({ byId: {}, leaders: [], outcome: null });
/** @param {Kind} kind @param {string} label @param {string} detail @returns {OutlookTag} */
const tag = (kind, label, detail) => ({ kind, label, detail });
/** @param {string} type */
const certainLabel = type => type === 'opinion' ? '선정 확실' : '당선 확실';
/** @param {number} shown @param {number} total */
const enough = (shown, total) => shown >= Math.min(3, total) && shown >= total * .2;
/** Compare the minimum number of adversarial ballots with the actual ballots
 * left. One decisive ballot is always too fragile to call "likely".
 * @param {number} required @param {number} shown @param {number} total */
function likely(required, shown, total) {
  return shown >= 6 && shown >= total * .5 && required >= 2 && required >= (total - shown) * .75;
}

/** Can k other candidates still reach this candidate's score? Ties at the
 * selection boundary are NOT guaranteed wins. The remaining vote budget is
 * shared by the challengers, including repeated votes on a single ballot.
 * @param {Record<string,number>} counts @param {string} id @param {number} remaining
 * @param {{seats:number,votesPerVoter:number,allowRepeat:boolean}} rules */
export function selectionChallenge(counts, id, remaining, rules) {
  const mine = counts[id] ?? 0;
  if (mine <= 0) return { certain: false, required: 0 };
  const maximum = rules.allowRepeat ? rules.votesPerVoter : 1;
  const needs = Object.entries(counts).filter(([other]) => other !== id)
    .map(([, count]) => Math.max(0, mine - count)).sort((a, b) => a - b).slice(0, rules.seats);
  if (needs.length < rules.seats) return { certain: true, required: Infinity };
  const required = Math.max(Math.ceil(Math.max(0, ...needs) / maximum), Math.ceil(needs.reduce((sum, n) => sum + n, 0) / rules.votesPerVoter));
  return { certain: required > remaining, required };
}

/** @param {Record<string,number>} counts @param {string} id @param {number} remaining
 * @param {{seats:number,votesPerVoter:number,allowRepeat:boolean}} rules */
export const lockedSelection = (counts, id, remaining, rules) => selectionChallenge(counts, id, remaining, rules).certain;

/** Counts must contain ONLY the already counted ballots.
 * @param {{type:string, rules:{seats:number,votesPerVoter:number,allowRepeat:boolean}}} config
 * @param {Record<string,number>} counts @param {number} shown @param {number} total
 * @returns {Outlook} */
export function itemOutlook(config, counts, shown, total) {
  const result = empty();
  if (shown <= 0 || total <= 0) return result;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] ?? 0;
  if (top <= 0) return result;
  const first = sorted.filter(([, n]) => n === top);
  if (first.length === 1) result.leaders = [first[0][0]];
  const { seats, allowRepeat, votesPerVoter } = config.rules;
  const maximum = allowRepeat ? votesPerVoter : 1;
  const remaining = Math.max(0, total - shown);
  const boundary = sorted[seats - 1]?.[1] ?? 0;
  const closeBallots = Math.max(1, Math.floor(remaining * .25));
  for (const [id, count] of sorted) {
    if (count <= 0) continue;
    const challenge = selectionChallenge(counts, id, remaining, config.rules);
    if (challenge.certain) {
      result.byId[id] = tag('certain', certainLabel(config.type), remaining ? `남은 ${remaining}장을 모두 활용해도 선출 경계의 동점·역전을 만들 수 없어요. 복수 선출과 한 사람의 표 수를 함께 반영했어요.` : '모든 표를 공개했고, 선출 경계의 동점 없이 선출 대상에 포함돼요.');
      continue;
    }
    // At completion an unresolved boundary is a final tie, not a forecast.
    if (!remaining || !enough(shown, total)) continue;
    if (count >= boundary) {
      const detail = challenge.required === 0 ? '현재 선출 경계에서 동률이에요.' : `남은 ${remaining}장 중 최소 ${challenge.required}장이 추격에 유리하게 나오면 선출 경계의 동점·역전이 가능해요.`;
      result.byId[id] = challenge.required <= closeBallots
        ? tag('close', '경합', detail)
        : likely(challenge.required, shown, total)
          ? tag('likely', '유력', `${detail} 남은 표의 75% 이상이 필요하지만 결과가 확정된 것은 아니에요.`)
          : tag('ahead', '우세', detail);
    } else {
      const required = Math.ceil((boundary - count) / maximum);
      if (required <= remaining && required <= closeBallots) result.byId[id] = tag('close', '경합', `남은 ${remaining}장 중 최소 ${required}장에서 표를 모으면 현재 선출 경계의 득표에 도달할 수 있어요. 다른 후보·항목의 추가 득표에 따라 달라져요.`);
    }
  }
  return result;
}

/** @param {string} rule @param {{yes:number,no:number,abstain:number,participants:number}} t
 * @param {number} shown @param {number} total @returns {Outlook} */
export function agendaOutlook(rule, t, shown, total) {
  const result = empty();
  if (shown <= 0 || total <= 0) return result;
  const remaining = Math.max(0, total - shown);
  if (t.yes !== t.no) result.leaders = [t.yes > t.no ? 'y' : 'n'];
  if (remaining && enough(shown, total) && t.yes + t.no > 0) {
    const closeGap = Math.max(1, Math.floor(remaining * .25));
    if (Math.abs(t.yes - t.no) <= closeGap) {
      for (const id of ['y', 'n']) result.byId[id] = tag('close', '경합', '현재 찬성과 반대의 표 차이가 작아요. 통과 여부는 설정한 통과 기준으로 따로 판단해요.');
    } else {
      result.byId[result.leaders[0]] = tag('ahead', '우세', '현재 찬반 득표에서 앞서 있어요. 통과 여부는 기권을 포함한 통과 기준에 따라 달라져요.');
    }
  }
  if (rule === 'none') return result;
  const locked = certainPass(rule, t, remaining);
  if (locked) {
    result.outcome = tag('certain', locked === 'pass' ? '통과 확실' : '부결 확실', '기권과 설정된 통과 기준을 반영했을 때, 남은 표가 어느 쪽으로 나와도 이 판정은 바뀌지 않아요.');
  } else {
    if (rule === 'yesOverNo') {
      const towardsPass = t.yes > t.no;
      const required = towardsPass ? t.yes - t.no : t.no - t.yes + 1;
      if (likely(required, shown, total)) result.outcome = tag('likely', towardsPass ? '통과 유력' : '부결 유력', `현재 흐름을 바꾸려면 남은 ${remaining}장 중 최소 ${required}장이 ${towardsPass ? '반대' : '찬성'}여야 해요. 결과는 바뀔 수 있어요.`);
    } else {
      const threshold = rule === 'majority' ? Math.floor(total / 2) + 1 : Math.ceil(total * 2 / 3);
      const yesNeeded = threshold - t.yes;
      const notYesNeeded = remaining - yesNeeded + 1;
      if (likely(notYesNeeded, shown, total)) result.outcome = tag('likely', '통과 유력', `통과에 필요한 찬성은 ${yesNeeded}표 더예요. 남은 ${remaining}장 중 ${notYesNeeded}장 이상이 반대·기권이면 부결될 수 있어요.`);
      else if (likely(yesNeeded, shown, total)) result.outcome = tag('likely', '부결 유력', `통과하려면 남은 ${remaining}장 중 ${yesNeeded}장 이상이 찬성이어야 해요. 기권도 참여 인원에 포함해 계산했어요.`);
    }
  }
  return result;
}

/** Cards are complete candidate totals, NOT a sample of ballots. Never run
 * sample-based "likely" logic on them. Unknown cards are treated as possible
 * challengers. Rank-only views never derive a gap from hidden vote counts.
 * @param {string} type @param {number} seats @param {number} totalItems
 * @param {{id:string,count?:number,rank?:number}[]} visible @param {string} visibility
 * @returns {Outlook} */
export function cardOutlook(type, seats, totalItems, visible, visibility) {
  const result = empty();
  if (!visible.length || !['all', 'rank'].includes(visibility)) return result;
  const hidden = totalItems - visible.length;
  if (visibility === 'rank') {
    const top = visible.filter(row => row.rank === 1);
    // No unique-leader claim until all rank-one ties are known.
    if (!hidden && top.length === 1) result.leaders = [top[0].id];
    for (const row of visible) {
      const rank = row.rank ?? totalItems + 1;
      const sameOrBetter = visible.filter(other => (other.rank ?? Infinity) <= rank).length;
      const nextRank = Math.min(...visible.filter(other => (other.rank ?? 0) > rank).map(other => other.rank ?? Infinity));
      // A lower visible rank proves positive votes without exposing counts.
      // Competition ranking also bounds the size of this tie group.
      const positiveKnown = Number.isFinite(nextRank);
      const lastPossiblePosition = Math.min(nextRank - 1, sameOrBetter + hidden);
      const same = visible.filter(other => other.rank === rank).length;
      if (positiveKnown && lastPossiblePosition <= seats) result.byId[row.id] = tag('certain', certainLabel(type), '공개된 순위만으로도 동점 가능성을 포함해 선출 범위 안이라는 것이 확인돼요.');
      else if (hidden && positiveKnown && rank <= seats && rank + same - 1 > seats) result.byId[row.id] = tag('close', '경합', '공개된 같은 순위의 후보·항목이 남은 선출 자리보다 많아요. 최종 동점 판정을 확인해 주세요.');
    }
    return result;
  }
  const sorted = [...visible].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const top = sorted[0]?.count ?? 0;
  // Highlight a global leader only after every card is public.
  if (!hidden && top > 0 && sorted.filter(row => row.count === top).length === 1) result.leaders = [sorted[0].id];
  for (const row of sorted) {
    const count = row.count ?? 0;
    if (count <= 0) continue;
    const sameOrBetter = sorted.filter(other => (other.count ?? 0) >= count).length;
    if (sameOrBetter + hidden <= seats) {
      result.byId[row.id] = tag('certain', certainLabel(type), '아직 열지 않은 카드가 모두 앞서더라도 선출 범위 안에 들어요.');
    }
  }
  return result;
}

/** Single mode/disclosure gate shared by every counting view.
 * @param {import('./model.js').Session} s
 * @param {{cursor:number,agenda?:number,revealed?:string[]}} progress @returns {Outlook} */
export function countingOutlook(s, { cursor, agenda = 0, revealed = [] }) {
  const { mode, visibility } = s.reveal;
  // Instant/winner/result-only announcements have no intermediate forecast.
  if (mode === 'instant' || visibility === 'winner' || visibility === 'result') return empty();
  if (mode === 'reverse' || mode === 'pick') {
    const open = new Set(mode === 'pick' ? revealed : reverseGroups(s).slice(0, cursor).flatMap(group => group.ids));
    const { counts } = countItems(s.items, s.ballots);
    const rows = rankRows(s.items, counts);
    const visible = rows.filter(row => open.has(row.item.id)).map(row => visibility === 'rank'
      ? { id: row.item.id, rank: row.rank }
      : { id: row.item.id, count: row.count });
    return cardOutlook(s.type, s.rules.seats, s.items.length, visible, visibility);
  }
  if (visibility !== 'all' || !['paper', 'race', 'broadcast'].includes(mode)) return empty();
  const shown = ballotsShown(s, cursor);
  return s.type === 'yesno'
    ? agendaOutlook(s.rules.passRule, partialAgenda(s, agenda, cursor), shown, s.ballots.length)
    : itemOutlook(s, partialCounts(s, cursor).counts, shown, s.ballots.length);
}
