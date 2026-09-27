// 기록함과 결선(PRD 8·11절). 끝난 투표는 archive 구역의 entries 맨 앞에 쌓이고 최근 30개만 남습니다.
// 결선 투표는 원래 투표 항목의 runoffs에 차례로 묶입니다(기록함에서 하나로 셈). 표는 섞인 채로 보관해 다시 개표할 수 있습니다.
import { LIMITS, normalizeConfig, cleanText } from './model.js';
import { tallyItems } from './tally.js';
import { ballotsInOrder } from './reveal.js';

/** @typedef {import('./model.js').Session} Session */
/** @typedef {{id:string, finishedOn:string, config:import('./model.js').Config, ballots:import('./model.js').Ballot[]}} Round */
/** @typedef {Round & {runoffs:Round[], note?:string}} Entry */

export const RECORD_NOTE_MAX = 500;

/** 메모의 줄바꿈은 남기고 제어 문자를 정리합니다. @param {unknown} value */
export function cleanRecordNote(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')).slice(0, RECORD_NOTE_MAX).join('');
}

/** @param {Session} s @param {string} finishedOn @returns {Round} */
function roundOf(s, finishedOn) {
  const { id, type, title, items, agendas, rules, reveal, tutorial, speechContent } = s;
  // 개표 순서대로 보관합니다(이미 섞인 순서 — 다시 개표할 때 같은 순서로 펼쳐짐).
  return { id, finishedOn, config: normalizeConfig({ type, title, items, agendas, rules, reveal, tutorial, speechContent }), ballots: ballotsInOrder(s).map((b) => ({ id: b.id, p: [...b.p], a: b.a })) };
}

export const EMPTY_ARCHIVE = Object.freeze({ entries: [] });

/** @param {unknown} raw @returns {{entries:Entry[]}} */
export function normalizeArchive(raw) {
  const r = /** @type {any} */ (raw);
  if (!r || !Array.isArray(r.entries)) return { entries: [] };
  /** @type {Entry[]} */ const entries = [];
  const seen = new Set();
  for (const e of r.entries.slice(0, LIMITS.archiveMax)) {
    const round = normalizeRound(e);
    if (!round || seen.has(round.id)) continue;
    seen.add(round.id);
    const runoffs = Array.isArray(e.runoffs) ? e.runoffs.map(normalizeRound).filter(/** @returns {x is Round} */ (/** @type {Round|null} */ x) => !!x) : [];
    entries.push({ ...round, runoffs, ...(typeof e.note === 'string' ? { note: cleanRecordNote(e.note) } : {}) });
  }
  return { entries };
}

/** @param {any} e @returns {Round|null} */
function normalizeRound(e) {
  if (!e || typeof e.id !== 'string' || !e.config) return null;
  const config = normalizeConfig(e.config, e.id);
  const itemIds = new Set(config.items.map((it) => it.id));
  const ballots = Array.isArray(e.ballots)
    ? e.ballots.filter((/** @type {any} */ b) => b && typeof b.id === 'string' && Array.isArray(b.p)
        && (config.type === 'yesno' ? b.p.length === config.agendas.length : b.p.every((/** @type {unknown} */ x) => typeof x === 'string' && itemIds.has(x))))
      .map((/** @type {any} */ b) => ({ id: b.id, p: [...b.p], a: Number.isInteger(b.a) && b.a >= 0 ? b.a : 0 }))
    : [];
  return { id: e.id, finishedOn: typeof e.finishedOn === 'string' ? e.finishedOn : '', config, ballots };
}

/**
 * 끝난 투표를 기록함에 넣습니다. 결선이면 원래 항목의 runoffs에 붙이고, 아니면 맨 앞에 새 항목.
 * 같은 id가 이미 있으면 그대로(두 번 들어가지 않게 — 다시 적용해도 안전).
 * @param {Session} s @param {string} finishedOn @returns {(a:{entries:Entry[]})=>{entries:Entry[]}}
 */
export const archiveSession = (s, finishedOn) => (a) => {
  const round = roundOf(s, finishedOn);
  const exists = a.entries.some((e) => e.id === round.id || e.runoffs.some((r) => r.id === round.id));
  if (exists) return a;
  if (s.runoffOf) {
    const i = a.entries.findIndex((e) => e.id === s.runoffOf);
    if (i >= 0) {
      const entries = [...a.entries];
      entries[i] = { ...entries[i], runoffs: [...entries[i].runoffs, round] };
      return { entries };
    }
  }
  return { entries: [{ ...round, runoffs: [] }, ...a.entries].slice(0, LIMITS.archiveMax) };
};

/** 기록 하나 지우기(되돌리기용으로 지운 항목을 돌려줌). @param {string} id */
export const removeEntry = (id) => (/** @type {{entries:Entry[]}} */ a) => ({ entries: a.entries.filter((e) => e.id !== id) });

/** 기록 제목과 메모만 바꿉니다. 투표 설정, 받은 표와 결선 기록은 보존합니다.
 * @param {string} id @param {{title:string, note:string}} patch */
export const updateEntry = (id, patch) => (/** @type {{entries:Entry[]}} */ a) => {
  const title = cleanText(patch.title, LIMITS.titleMax).trim();
  if (!title) return a;
  const note = cleanRecordNote(patch.note).trim();
  return { entries: a.entries.map((e) => e.id === id ? { ...e, config: { ...e.config, title }, note } : e) };
};
/** 지운 항목 되살리기(원래 자리). @param {Entry} entry @param {number} index */
export const restoreEntry = (entry, index) => (/** @type {{entries:Entry[]}} */ a) =>
  a.entries.some((e) => e.id === entry.id) ? a : { entries: [...a.entries.slice(0, index), entry, ...a.entries.slice(index)].slice(0, LIMITS.archiveMax) };

/** session이 이미 기록함에 들어갔는지(기록 뒤 비우기 전에 꺼졌을 때 정리용). @param {Session} s @param {{entries:Entry[]}} a */
export const alreadyArchived = (s, a) => !!s.id && a.entries.some((e) => e.id === s.id || e.runoffs.some((r) => r.id === s.id));

/**
 * 원래 투표 + 결선들을 합친 최종 결과(후보·의견). 결선마다 이전 판의 동점 자리를 채웁니다.
 * @param {Entry} entry
 * @returns {{winners:string[], pendingTie:string[], openSeats:number, rounds:ReturnType<typeof tallyItems>[]}}
 */
export function finalResult(entry) {
  /** @type {ReturnType<typeof tallyItems>[]} */ const rounds = [];
  /** @type {string[]} */ const winners = [];
  let pendingTie = /** @type {string[]} */ ([]);
  let openSeats = 0;
  for (const r of [entry, ...entry.runoffs]) {
    const t = tallyItems(r.config, r.ballots);
    rounds.push(t);
    winners.push(...t.winners);
    pendingTie = t.tied;
    openSeats = t.openSeats;
    // 이번 판에 동점이 없으면 더 볼 판이 없습니다(그 뒤 결선 기록은 어긋난 자료라 무시).
    if (!t.tied.length) break;
  }
  return { winners, pendingTie, openSeats, rounds };
}

/** 결선 제목: 원래 제목 + " 결선"(30자를 넘으면 원래 제목을 줄임). @param {string} title */
export function runoffTitle(title) {
  const suffix = ' 결선';
  const room = LIMITS.titleMax - Array.from(suffix).length;
  return Array.from(title).slice(0, room).join('') + suffix;
}

/**
 * 결선 투표 설정(PRD 8절): 동점 항목만(기호·캐릭터·색·이름 그대로), 당선 = 남은 자리, 1인 표 = min(원래, 남은 자리).
 * @param {Entry} entry @returns {import('./model.js').Config|null}
 */
export function runoffConfig(entry) {
  if (entry.config.type === 'yesno') return null;
  const result = finalResult(entry);
  if (!result.pendingTie.length) return null;
  const last = entry.runoffs.length ? entry.runoffs[entry.runoffs.length - 1].config : entry.config;
  const items = last.items.filter((it) => result.pendingTie.includes(it.id));
  const seats = result.openSeats;
  return {
    ...last,
    title: runoffTitle(entry.config.title),
    items,
    rules: { ...last.rules, seats, votesPerVoter: Math.min(last.rules.votesPerVoter, seats), allowRepeat: last.rules.allowRepeat && Math.min(last.rules.votesPerVoter, seats) > 1 },
    tutorial: { ...last.tutorial, enabled: false },
  };
}
