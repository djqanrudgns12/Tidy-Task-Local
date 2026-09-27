// session 구역의 변경 함수들(PRD 11절 "쓰기 규칙"). section.js의 mutate/mutateAndConfirm에 그대로 넘깁니다.
// 규칙: 입력을 고치지 않고 새 객체를 돌려줍니다. 할 수 없는 변경이면 입력 객체 그대로(=거부)를 돌려줍니다.
// 같은 함수를 두 번 적용해도 결과가 같아야 합니다(다른 창과 충돌하면 section.js가 최신 값 위에 다시 적용).
import { fisherYates, insertIndex, secureRandom } from './random.js';

/** @typedef {import('./model.js').Session} Session */
/** @typedef {import('./model.js').Ballot} Ballot */

/** 표를 무작위 위치에 끼워 넣습니다. u는 표를 만들 때 한 번 뽑은 값이라 다시 적용해도 같은 규칙입니다.
 * 거부: 투표 중이 아님 · 인원이 찼음 · 같은 id가 이미 있음(두 번 들어가지 않게).
 * @param {Ballot} ballot @param {number} u @returns {(s:Session)=>Session} */
export const insertBallot = (ballot, u) => (s) => {
  if (!s.id || s.phase !== 'voting') return s;
  if (s.ballots.length >= s.rules.voters) return s;
  if (s.ballots.some((b) => b.id === ballot.id)) return s;
  const at = insertIndex(u, s.ballots.length);
  const ballots = [...s.ballots.slice(0, at), { id: ballot.id, p: [...ballot.p], a: ballot.a }, ...s.ballots.slice(at)];
  return { ...s, ballots, lastBallotId: ballot.id };
};

/** 학생이 되돌리기 시간 안에 지운 표(또는 선생님의 직전 표 취소). 없거나 마감 뒤면 그대로.
 * 마감 뒤에 지우지 않는 이유: 선생님이 이미 마감한 투표가 학생 키 하나로 다시 열리면 혼란스럽습니다(선생님이 인원을 늘려 다시 받음).
 * @param {string} id @returns {(s:Session)=>Session} */
export const removeBallot = (id) => (s) => {
  if (!s.id || (s.phase !== 'voting' && s.phase !== 'paused')) return s;
  if (!s.ballots.some((b) => b.id === id)) return s;
  return { ...s, ballots: s.ballots.filter((b) => b.id !== id), lastBallotId: s.lastBallotId === id ? null : s.lastBallotId };
};

/** 선생님의 [직전 표 취소]: 가장 최근에 들어온 표 1장. 내용은 어디에도 보이지 않습니다. @param {Session} s */
export function voidLast(s) {
  if (!s.id || !s.lastBallotId || (s.phase !== 'voting' && s.phase !== 'paused')) return s;
  return removeBallot(s.lastBallotId)(s);
}

/** 멈춤 켜고 끄기. 2026-09-26부터 화면에서 멈춤을 쓰지 않습니다(선생님 메뉴를 여는 동안만 투표판이 키를 받지 않음).
 * 예전 판에서 멈춘 채 저장된 투표를 다시 열 때 setPaused(false)로 이어 받는 데만 씁니다.
 * @param {boolean} paused @returns {(s:Session)=>Session} */
export const setPaused = (paused) => (s) => {
  if (!s.id) return s;
  if (paused && s.phase === 'voting') return { ...s, phase: 'paused' };
  if (!paused && s.phase === 'paused') return { ...s, phase: 'voting' };
  return s;
};

/** 준비 → 안내 또는 투표. @param {'tutorial'|'voting'} phase @returns {(s:Session)=>Session} */
export const begin = (phase) => (s) => {
  if (!s.id || (s.phase !== 'ready' && s.phase !== 'tutorial')) return s;
  if (s.phase === phase) return s;
  return { ...s, phase };
};

/** 인원 고치기. 받은 표보다 적게는 못 줄입니다. 마감 뒤 늘리면 다시 받습니다.
 * @param {number} voters @returns {(s:Session)=>Session} */
export const setVoters = (voters) => (s) => {
  if (!s.id || !['ready', 'tutorial', 'voting', 'paused', 'closed'].includes(s.phase)) return s;
  const n = Math.min(60, Math.max(voters, s.ballots.length, 2));
  if (n === s.rules.voters) return s;
  const rules = { ...s.rules, voters: n };
  if (s.phase === 'closed' && n > s.ballots.length) return { ...s, rules, phase: 'voting', counting: null };
  return { ...s, rules };
};

/** 마감: 개표 순서를 한 번 더 섞어 정하고 직전 표 표시를 지웁니다.
 * order를 인자로 받는 이유: 충돌로 다시 적용될 때 순서가 바뀌면 안 되므로 섞기는 부르는 쪽에서 한 번만 합니다.
 * @param {string[]} order @returns {(s:Session)=>Session} */
export const close = (order) => (s) => {
  if (!s.id || (s.phase !== 'voting' && s.phase !== 'paused')) return s;
  const ids = new Set(s.ballots.map((b) => b.id));
  const valid = order.length === s.ballots.length && order.every((id) => ids.has(id));
  return { ...s, phase: 'closed', lastBallotId: null, counting: { order: valid ? [...order] : s.ballots.map((b) => b.id), cursor: 0, agenda: 0, revealed: [] } };
};

/** 지금 표로 개표 순서를 만듭니다(부르는 쪽에서 close에 넘김). @param {Session} s @param {()=>number} [rng] */
export const countingOrder = (s, rng = secureRandom) => fisherYates(s.ballots.map((b) => b.id), rng);

/** 개표 시작. @param {Session} s */
export function startCounting(s) {
  if (!s.id || s.phase !== 'closed' || !s.counting) return s;
  return { ...s, phase: 'counting' };
}

/** 개표 진행 위치 저장. 앞으로만 갑니다(안건 → 표 순서로 비교). 다시 보기는 저장하지 않고 화면에서만 합니다.
 * @param {number} cursor @param {number} [agenda] @returns {(s:Session)=>Session} */
export const setCursor = (cursor, agenda) => (s) => {
  if (!s.id || s.phase !== 'counting' || !s.counting) return s;
  const a = Math.min(Math.max(0, agenda ?? s.counting.agenda), Math.max(0, s.agendas.length - 1));
  // 커서의 뜻은 모드마다 다릅니다(표 수 · 공개한 묶음 수). 한도는 reveal.js가 정하고 여기서는 음수만 막습니다.
  const c = Math.min(Math.max(0, Math.floor(cursor)), 100000);
  const ahead = a > s.counting.agenda || (a === s.counting.agenda && c > s.counting.cursor);
  if (!ahead) return s;
  return { ...s, counting: { ...s.counting, agenda: a, cursor: c } };
};

/** 골라 공개: 공개한 카드. @param {string} itemId @returns {(s:Session)=>Session} */
export const revealItem = (itemId) => (s) => {
  if (!s.id || s.phase !== 'counting' || !s.counting || s.counting.revealed.includes(itemId)) return s;
  if (!s.items.some((it) => it.id === itemId)) return s;
  return { ...s, counting: { ...s.counting, revealed: [...s.counting.revealed, itemId] } };
};

/** [투표 그만두기]의 되돌리기: 지운 투표를 그대로 다시 넣습니다. 투표 중이었다면 곧바로 이어서 받습니다
 * (2026-09-26 멈춤 없앰 — 선생님이 멈추지 않았는데 투표가 멈춰 있으면 헷갈렸음). 예전 판에서 멈춘 채 지운 투표도 투표 중으로.
 * 그 사이 다른 투표가 생겼으면 그대로(덮어쓰지 않음). @param {Session} cancelled @returns {(s:Session)=>Session} */
export const restoreCancelled = (cancelled) => (s) => {
  if (s.id) return s;
  return cancelled.phase === 'paused' ? { ...cancelled, phase: 'voting' } : cancelled;
};

/** [처음부터 다시 받기](선생님 메뉴): 투표(후보·설정)는 그대로 두고 받은 표만 비운 뒤 곧바로 첫 친구부터 다시 받습니다.
 * 투표 중(멈춤 포함)일 때만 합니다 — 마감·개표 뒤에 표가 사라지면 개표 순서가 어긋납니다.
 * 누른 순간 보고 있던 표만 지웁니다. 그 뒤에 들어온 표가 있으면(다른 창과 충돌해 다시 적용될 때 등) 거부해 새 표를 지우지 않습니다.
 * @param {string[]} seenIds 누른 순간 보고 있던 표 id @returns {(s:Session)=>Session} */
export const restart = (seenIds) => (s) => {
  if (!s.id || (s.phase !== 'voting' && s.phase !== 'paused')) return s;
  if (s.ballots.length === 0 && s.phase === 'voting') return s;
  const seen = new Set(seenIds);
  if (s.ballots.some((b) => !seen.has(b.id))) return s;
  return { ...s, phase: 'voting', ballots: [], lastBallotId: null, counting: null };
};

/** [처음부터 다시 받기]의 되돌리기: 비우기 전 표를 다시 넣고 이어서 받습니다(멈춤 없음).
 * 다른 투표로 바뀌었거나, 그 사이 새 표가 들어왔거나, 이미 마감됐으면 그대로(새 표를 덮어쓰지 않음).
 * @param {Session} before @returns {(s:Session)=>Session} */
export const restoreRestarted = (before) => (s) => {
  if (!s.id || s.id !== before.id) return s;
  if (s.ballots.length || (s.phase !== 'voting' && s.phase !== 'paused')) return s;
  return { ...before, phase: 'voting', counting: null };
};

/** 개표 끝 표시(기록함으로 옮기기 직전). @param {Session} s */
export function finish(s) {
  if (!s.id || s.phase !== 'counting') return s;
  return { ...s, phase: 'done' };
}
