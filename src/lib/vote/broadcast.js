import { ballotsShown, partialCounts, partialAgenda } from './reveal.js';
import { rankRows } from './tally.js';

/** Broadcast copy and deltas use only published ballots, including after resume.
 * @param {import('./model.js').Session} s @param {number} cursor @param {number} [agenda] */
export function broadcastSnapshot(s, cursor, agenda = 0) {
  const shown = ballotsShown(s, cursor) || 0;
  const previous = Math.max(0, cursor - 1);
  const total = s.ballots.length;
  const remaining = Math.max(0, total - shown);
  const yesno = s.type === 'yesno';
  const now = yesno ? partialAgenda(s, agenda, cursor) : partialCounts(s, cursor);
  const before = yesno ? partialAgenda(s, agenda, previous) : partialCounts(s, previous);
  const rows = yesno
    ? [{ item: { id: 'y', name: '찬성', number: 1, color: 'mint' }, count: "yes" in now ? now.yes : 0, rank: 1 },
       { item: { id: 'n', name: '반대', number: 2, color: 'apricot' }, count: "no" in now ? now.no : 0, rank: 1 }]
    : rankRows(s.items, "counts" in now ? now.counts : {});
  const oldCounts = 'counts' in before ? before.counts : { y: before.yes, n: before.no };
  const top = Math.max(0, ...rows.map(r => r.count));
  const leaders = top > 0 ? rows.filter(r => r.count === top) : [];
  const oldTop = Math.max(0, ...Object.values(oldCounts));
  const oldLeaders = Object.keys(oldCounts).filter(id => oldTop > 0 && oldCounts[id] === oldTop);
  const changed = leaders.length === 1 && oldLeaders.length === 1 && leaders[0].item.id !== oldLeaders[0];
  const gap = leaders.length === 1 && rows.length > 1 ? top - Math.max(...rows.filter(r => r.item.id !== leaders[0].item.id).map(r => r.count)) : 0;
  const valid = rows.reduce((sum, row) => sum + row.count, 0);
  const headline = !shown ? (total ? '첫 집계를 기다립니다' : '공개할 투표용지가 없습니다')
    : !valid ? '아직 유효 득표가 없습니다'
    : leaders.length > 1 ? (yesno ? '찬성 · 반대 동률' : `${leaders.length}${s.type === 'candidate' ? '명' : '개 항목'} 공동 선두`)
    : `${leaders[0].item.name} ${remaining ? '현재 선두' : '최다 득표'}`;
  return { shown, total, remaining, rows: rows.map(r => ({ ...r, delta: Math.max(0, r.count - (oldCounts[r.item.id] ?? 0)) })),
    leaders, top, gap, changed, headline, valid, abstain: now.abstain,
    denominator: yesno ? now.participants : valid,
    batch: Math.max(0, shown - (ballotsShown(s, previous) || 0)),
    basis: yesno ? '득표율은 기권을 포함한 개표 인원 기준' : '득표율은 기권을 제외한 유효 득표 기준' };
}
