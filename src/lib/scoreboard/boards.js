/** 점수판 변경 규칙 — 모두 "이전 자료 → 새 자료"를 돌려주는 순수 함수입니다(입력을 고치지 않음).
 * section.js의 mutate/undo가 이 함수들을 그대로 받습니다. */
import { newId } from '../ids.js';
import { LIMITS, PALETTE_IDS, SYMBOLS, clampScore, cleanLabel, makeGroup, defaultBoardPrefs } from './model.js';

/** @param {Record<string, number>} scores @param {string[]} ids @param {number} delta */
export function adjustMap(scores, ids, delta) {
  const next = { ...scores };
  for (const id of ids) next[id] = clampScore((next[id] ?? 0) + delta);
  return next;
}
/** @template {{id:string,score:number}} T @param {T[]} list @param {string[]} ids @param {number} delta @returns {T[]} */
export function adjustList(list, ids, delta) {
  const set = new Set(ids);
  return list.map((it) => (set.has(it.id) ? { ...it, score: clampScore(it.score + delta) } : it));
}

// ── 개인 ──
/** @param {any} d @param {string} classId @returns {Record<string, number>} */
export const personalScores = (d, classId) => d.classes[classId]?.scores ?? {};
/** 학급 점수 자리를 바꿉니다. 학급 수가 한계를 넘으면 가장 오래된(앞쪽) 학급 점수부터 정리합니다.
 * @param {any} d @param {string} classId @param {Record<string, number>} scores */
export function withPersonalScores(d, classId, scores) {
  const classes = { ...d.classes, [classId]: { scores } };
  const keys = Object.keys(classes);
  while (keys.length > LIMITS.classes) delete classes[/** @type {string} */ (keys.shift())];
  return { ...d, classes };
}
/** @param {any} d @param {string} classId @param {string[]} ids @param {number} delta */
export const personalAdjust = (d, classId, ids, delta) => withPersonalScores(d, classId, adjustMap(personalScores(d, classId), ids, delta));
/** @param {any} d @param {string} classId @param {string} id @param {number} value */
export const personalSet = (d, classId, id, value) => withPersonalScores(d, classId, { ...personalScores(d, classId), [id]: clampScore(value) });
/** 초기화는 명단에서 지워진 학생의 보관 점수도 함께 정리합니다(PRD 7.4). @param {any} d @param {string} classId */
export const personalReset = (d, classId) => withPersonalScores(d, classId, {});
/** @param {string} classId */
export const personalUndo = (classId) => ({
  key: `personal:${classId}`,
  pick: (/** @type {any} */ d) => personalScores(d, classId),
  put: (/** @type {any} */ d, /** @type {Record<string, number>} */ s) => withPersonalScores(d, classId, s),
});

// ── 모둠 ──
/** @param {any} d @param {string[]} ids @param {number} delta */
export const groupAdjust = (d, ids, delta) => ({ ...d, groups: adjustList(d.groups, ids, delta) });
/** @param {any} d @param {string} id @param {number} value */
export const groupSet = (d, id, value) => ({ ...d, groups: d.groups.map((/** @type {any} */ g) => (g.id === id ? { ...g, score: clampScore(value) } : g)) });
/** @param {any} d */
export const groupReset = (d) => ({ ...d, groups: d.groups.map((/** @type {any} */ g) => ({ ...g, score: 0 })) });
export const groupUndo = () => ({
  key: 'group',
  pick: (/** @type {any} */ d) => d.groups,
  put: (/** @type {any} */ d, /** @type {any[]} */ groups) => ({ ...d, groups }),
});

/** 모둠 수 바꾸기: 늘리면 가장 작은 빈 번호 이름·안 쓰는 색·모양으로 뒤에 추가, 줄이면 마지막부터 뺍니다.
 * @param {any} d @param {number} count */
export function setGroupCount(d, count) {
  const target = Math.max(LIMITS.groupMin, Math.min(LIMITS.groupMax, Math.round(count)));
  let groups = d.groups.slice(0, target);
  while (groups.length < target) {
    const names = new Set(groups.map((/** @type {any} */ g) => g.name));
    let n = 1;
    while (names.has(`${n}모둠`)) n++;
    const colors = new Set(groups.map((/** @type {any} */ g) => g.color));
    const symbols = new Set(groups.map((/** @type {any} */ g) => g.symbol));
    const base = makeGroup(n);
    groups = [...groups, {
      ...base,
      color: PALETTE_IDS.find((c) => !colors.has(c)) ?? base.color,
      symbol: SYMBOLS.find((s) => !symbols.has(s)) ?? base.symbol,
    }];
  }
  return { ...d, groups };
}
/** @param {any} d @param {string} id @param {{name?:string,color?:string,symbol?:string}} patch */
export function updateGroup(d, id, patch) {
  return {
    ...d,
    groups: d.groups.map((/** @type {any} */ g, /** @type {number} */ i) => {
      if (g.id !== id) return g;
      const next = { ...g };
      if (patch.name !== undefined) next.name = cleanLabel(patch.name, LIMITS.groupName) || g.name || `${i + 1}모둠`;
      if (patch.color && PALETTE_IDS.includes(patch.color)) next.color = patch.color;
      if (patch.symbol && SYMBOLS.includes(patch.symbol)) next.symbol = patch.symbol;
      return next;
    }),
  };
}
/** @param {any} d @param {string} id */
export function removeGroup(d, id) {
  if (d.groups.length <= LIMITS.groupMin) return d;
  return { ...d, groups: d.groups.filter((/** @type {any} */ g) => g.id !== id) };
}

// ── 커스텀 ──
/** @param {any} d @param {string} id */
export const findBoard = (d, id) => d.boards.find((/** @type {any} */ b) => b.id === id) ?? null;
/** @param {any} d @param {string} id @param {(b:any)=>any} fn */
const mapBoard = (d, id, fn) => ({ ...d, boards: d.boards.map((/** @type {any} */ b) => (b.id === id ? fn(b) : b)) });

/** @param {any} d @param {{title:string, names:string[], startScore:number}} input @param {number} [now] */
export function createBoard(d, { title, names, startScore }, now = Date.now()) {
  if (d.boards.length >= LIMITS.boards) return d;
  const start = clampScore(startScore);
  const items = names.slice(0, LIMITS.items).map((name, i) => ({
    id: newId(),
    name: cleanLabel(name, LIMITS.itemName),
    color: PALETTE_IDS[i % PALETTE_IDS.length],
    score: start,
  })).filter((it) => it.name);
  if (!items.length) return d;
  const board = { id: newId(), title: cleanLabel(title, LIMITS.boardTitle) || '새 점수판', startScore: start, usedAt: now, prefs: defaultBoardPrefs(), items };
  return { ...d, boards: [...d.boards, board], lastBoardId: board.id, draft: null };
}
/** @param {any} d @param {string} id @param {number} [now] */
export const openBoard = (d, id, now = Date.now()) => (findBoard(d, id) ? { ...mapBoard(d, id, (b) => ({ ...b, usedAt: now })), lastBoardId: id } : d);
/** @param {any} d @param {string} id @param {{title?:string,startScore?:number,prefs?:object}} patch */
export const updateBoard = (d, id, patch) => mapBoard(d, id, (b) => ({
  ...b,
  ...(patch.title !== undefined ? { title: cleanLabel(patch.title, LIMITS.boardTitle) || b.title } : {}),
  ...(patch.startScore !== undefined ? { startScore: clampScore(patch.startScore) } : {}),
  ...(patch.prefs ? { prefs: { ...b.prefs, ...patch.prefs } } : {}),
}));
/** @param {any} d @param {string} id @param {number} [now] */
export function duplicateBoard(d, id, now = Date.now()) {
  const b = findBoard(d, id);
  if (!b || d.boards.length >= LIMITS.boards) return d;
  const copy = {
    ...b,
    id: newId(),
    title: cleanLabel(`${b.title} 사본`, LIMITS.boardTitle),
    usedAt: now,
    items: b.items.map((/** @type {any} */ it) => ({ ...it, id: newId(), score: b.startScore })),
  };
  return { ...d, boards: [...d.boards, copy], lastBoardId: copy.id };
}
/** @param {any} d @param {string} id */
export function deleteBoard(d, id) {
  const boards = d.boards.filter((/** @type {any} */ b) => b.id !== id);
  const next = [...boards].sort((a, b) => b.usedAt - a.usedAt)[0];
  return { ...d, boards, lastBoardId: d.lastBoardId === id ? next?.id ?? null : d.lastBoardId };
}
/** 항목 목록 통째로 바꾸기(추가·삭제·순서·이름·색). id가 같으면 점수를 지키고, 새 항목은 시작 점수.
 * @param {any} d @param {string} id @param {{id?:string,name:string,color?:string}[]} items */
export function setBoardItems(d, id, items) {
  return mapBoard(d, id, (b) => {
    const old = new Map(b.items.map((/** @type {any} */ it) => [it.id, it]));
    const next = items.slice(0, LIMITS.items).map((it, i) => {
      const prev = it.id ? old.get(it.id) : undefined;
      return {
        id: prev ? prev.id : newId(),
        name: cleanLabel(it.name, LIMITS.itemName) || prev?.name || `${i + 1}번`,
        color: it.color && PALETTE_IDS.includes(it.color) ? it.color : prev?.color ?? PALETTE_IDS[i % PALETTE_IDS.length],
        score: prev ? prev.score : b.startScore,
      };
    });
    return next.length ? { ...b, items: next } : b;
  });
}
/** @param {any} d @param {string} boardId @param {string[]} ids @param {number} delta */
export const boardAdjust = (d, boardId, ids, delta) => mapBoard(d, boardId, (b) => ({ ...b, items: adjustList(b.items, ids, delta) }));
/** @param {any} d @param {string} boardId @param {string} id @param {number} value */
export const boardSet = (d, boardId, id, value) => mapBoard(d, boardId, (b) => ({ ...b, items: b.items.map((/** @type {any} */ it) => (it.id === id ? { ...it, score: clampScore(value) } : it)) }));
/** @param {any} d @param {string} boardId */
export const boardReset = (d, boardId) => mapBoard(d, boardId, (b) => ({ ...b, items: b.items.map((/** @type {any} */ it) => ({ ...it, score: b.startScore })) }));
/** 점수판 하나의 되돌리기. 지운 점수판도 같은 자리·같은 ID로 되살립니다. @param {string} boardId */
export const customUndo = (boardId) => ({
  key: `custom:${boardId}`,
  pick: (/** @type {any} */ d) => {
    const index = d.boards.findIndex((/** @type {any} */ b) => b.id === boardId);
    return { index, board: index >= 0 ? d.boards[index] : null };
  },
  put: (/** @type {any} */ d, /** @type {{index:number, board:any}} */ snap) => {
    const boards = d.boards.filter((/** @type {any} */ b) => b.id !== boardId);
    if (snap.board) boards.splice(Math.min(Math.max(0, snap.index), boards.length), 0, snap.board);
    const lastBoardId = snap.board ? boardId : d.lastBoardId === boardId ? boards[0]?.id ?? null : d.lastBoardId;
    return { ...d, boards, lastBoardId };
  },
});
