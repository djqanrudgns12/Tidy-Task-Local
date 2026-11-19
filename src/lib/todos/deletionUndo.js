// 할 일·마감된 일 삭제 기록과 되돌리기 — 순수 로직
// 설계: docs/PRD-todo-row-gestures.md §7.8
//
// 왜 전역 되돌리기(Ctrl+Z)를 쓰지 않고 따로 기록하는가:
//   전역 되돌리기는 "마지막 동작"을 되돌립니다. 지운 뒤 다른 할 일의 글을 고쳤다면
//   알림의 [되돌리기]가 지운 것 대신 고친 글을 되돌리게 됩니다.
//   삭제 기록은 "무엇을, 어디서, D-Day가 어떻게 바뀌었는지"만 담아 그 항목만 정확히 살립니다.
// 왜 메모리에만 두는가:
//   삭제는 즉시 저장됩니다(창 닫기·업데이트 설치에도 안전). 기록은 알림이 떠 있는 몇 초 동안만 필요하므로
//   저장 파일·되돌리기 스냅샷 필드(WINDOW_FIELDS)에 넣지 않습니다.

import { restoreDdaysForTodos } from '../dday/ddayActions.js';
import { stripHtmlToTitle } from '../dday/ddayModel.js';

/** 알림에 보여 줄 제목 글자 수(자소 묶음 기준) */
export const TITLE_PREVIEW_CHARS = 14;

/**
 * @typedef {{ id: string, text?: string, [key: string]: any }} TodoLike
 * @typedef {{ todos: TodoLike[], archivedTodos: TodoLike[], ddayItems: any[] }} ListsState
 * @typedef {'todo' | 'archived'} DeletionKind
 * @typedef {{
 *   kind: DeletionKind,
 *   items: { todo: TodoLike, index: number, prevId: string | null, nextId: string | null }[],
 *   dday: { before: any, after: any | null, index: number }[],
 * }} DeletionRecord
 */

/** @param {DeletionKind} kind */
function listKey(kind) {
  return kind === 'archived' ? 'archivedTodos' : 'todos';
}

/** 키 순서와 상관없이 같은 값인지 (D-Day 변경 찾기용) */
function sameValue(/** @type {unknown} */ a, /** @type {unknown} */ b) {
  const stable = (/** @type {unknown} */ value) => JSON.stringify(value, (_k, v) => (
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v
  ));
  return stable(a) === stable(b);
}

/**
 * 지우기 직전·직후 상태로 삭제 기록을 만듭니다.
 * @param {{ before: ListsState, after: ListsState, kind: DeletionKind, ids: string[] }} input
 * @returns {DeletionRecord | null} 지운 것이 없으면 null
 */
export function captureDeletion({ before, after, kind, ids }) {
  const list = before[listKey(kind)] || [];
  const idSet = new Set(ids);
  /** @type {DeletionRecord['items']} */
  const items = [];
  list.forEach((todo, index) => {
    if (!todo || !idSet.has(todo.id)) return;
    items.push({
      todo: structuredClone(todo),
      index,
      // 바로 앞뒤 이웃을 기억합니다(같이 지워진 이웃이어도 됨 — 되돌릴 때 앞 항목부터 넣으므로 이어 붙음).
      prevId: index > 0 ? list[index - 1]?.id ?? null : null,
      nextId: index < list.length - 1 ? list[index + 1]?.id ?? null : null,
    });
  });
  if (items.length === 0) return null;

  // 이번 삭제로 사라졌거나 바뀐 D-Day(연결 끊김·함께 삭제·순서 재번호)를 "전/후" 모습으로 담습니다.
  const afterById = new Map((after.ddayItems || []).map((d) => [d.id, d]));
  /** @type {DeletionRecord['dday']} */
  const dday = [];
  (before.ddayItems || []).forEach((d, index) => {
    if (!d || typeof d.id !== 'string') return;
    const next = afterById.get(d.id) ?? null;
    if (next && sameValue(next, d)) return;
    dday.push({ before: structuredClone(d), after: next ? structuredClone(next) : null, index });
  });

  return { kind, items, dday };
}

/**
 * 넣을 자리: 앞 이웃 뒤 → 뒤 이웃 앞 → 원래 번호(넘치면 끝).
 * @param {TodoLike[]} list @param {DeletionRecord['items'][number]} item
 */
function insertionIndex(list, item) {
  if (item.prevId) {
    const at = list.findIndex((t) => t.id === item.prevId);
    if (at !== -1) return at + 1;
  }
  if (item.nextId) {
    const at = list.findIndex((t) => t.id === item.nextId);
    if (at !== -1) return at;
  }
  return Math.min(Math.max(0, item.index), list.length);
}

/**
 * 묶음으로 쌓인 삭제 기록을 되돌립니다. 지운 순서의 반대로 적용합니다.
 * (A를 지우고 A의 앞 이웃 B를 지웠다면 B가 먼저 돌아와야 A가 B 뒤에 정확히 들어갑니다.)
 *
 * 입력 배열·항목은 바꾸지 않고 새 배열을 돌려줍니다. 남아 있는 항목 객체는 그대로 재사용합니다.
 * @param {ListsState} state
 * @param {DeletionRecord[]} records
 * @returns {{ state: ListsState, restoredIds: string[], skippedIds: string[], restoredByKind: Record<DeletionKind, string[]> }}
 */
export function restoreDeletions(state, records) {
  const lists = {
    todos: [...(state.todos || [])],
    archivedTodos: [...(state.archivedTodos || [])],
  };
  let ddayItems = state.ddayItems || [];
  // 할 일·마감된 일 어느 쪽에든 같은 id가 있으면 이미 돌아온 것입니다(전역 되돌리기 등).
  const present = new Set([...lists.todos, ...lists.archivedTodos].map((t) => t.id));
  /** @type {string[]} */
  const restoredIds = [];
  /** @type {string[]} */
  const skippedIds = [];
  /** @type {Record<DeletionKind, string[]>} */
  const restoredByKind = { todo: [], archived: [] };

  for (const record of [...(records || [])].reverse()) {
    if (!record || !Array.isArray(record.items)) continue;
    const target = lists[listKey(record.kind)];
    /** @type {Set<string>} */
    const skippedHere = new Set();
    let restoredHere = 0;
    for (const item of [...record.items].sort((a, b) => a.index - b.index)) {
      const id = item.todo.id;
      if (present.has(id)) {
        skippedIds.push(id);
        skippedHere.add(id);
        continue;
      }
      target.splice(insertionIndex(target, item), 0, structuredClone(item.todo));
      present.add(id);
      restoredIds.push(id);
      restoredByKind[record.kind === 'archived' ? 'archived' : 'todo'].push(id);
      restoredHere += 1;
    }
    if (restoredHere === 0 || !record.dday?.length) continue;
    // 건너뛴(이미 돌아온) 할 일에 딸린 D-Day는 건드리지 않습니다. 순서만 바뀐 다른 D-Day는 함께 되돌립니다.
    const changes = record.dday.filter((c) => !skippedHere.has(c.before?.linkedTodoId));
    if (changes.length === 0) continue;
    const result = restoreDdaysForTodos(ddayItems, changes);
    if (result.changed) ddayItems = result.items;
  }

  return {
    state: { ...state, todos: lists.todos, archivedTodos: lists.archivedTodos, ddayItems },
    restoredIds,
    skippedIds,
    restoredByKind,
  };
}

/**
 * 알림에 보여 줄 짧은 제목. HTML을 걷어 내고 공백을 줄인 뒤 글자(자소 묶음) 기준으로 자릅니다.
 * 한글 자모·이모지가 반쪽으로 잘리지 않게 Intl.Segmenter를 씁니다.
 * @param {unknown} html
 * @param {number} [max]
 */
export function previewTitle(html, max = TITLE_PREVIEW_CHARS) {
  const text = stripHtmlToTitle(typeof html === 'string' ? html : '', 10000);
  if (!text) return '빈 할 일';
  const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text), (s) => s.segment)
    : Array.from(text);
  if (graphemes.length <= max) return text;
  return `${graphemes.slice(0, max).join('').trimEnd()}…`;
}
