/** @param {readonly string[]} a @param {readonly string[]} b */
export function sameTodoOrder(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** @param {readonly string[]} ids @param {string} sourceId @param {string} targetId */
export function moveTodoOrder(ids, sourceId, targetId) {
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * 이동 도중 바뀐 내용을 보존하고, 추가·삭제·되돌리기와 충돌한 순서는 저장하지 않습니다.
 * @template {{id: string}} T
 * @param {readonly T[]} todos
 * @param {readonly string[]} initialIds
 * @param {readonly string[]} nextIds
 * @returns {T[] | null}
 */
export function applyTodoOrder(todos, initialIds, nextIds) {
  if (!sameTodoOrder(todos.map(todo => todo.id), initialIds)
      || sameTodoOrder(initialIds, nextIds)
      || nextIds.length !== initialIds.length
      || new Set(initialIds).size !== initialIds.length
      || new Set(nextIds).size !== nextIds.length) return null;
  const byId = new Map(todos.map(todo => [todo.id, todo]));
  if (nextIds.some(id => !byId.has(id))) return null;
  return nextIds.map(id => /** @type {T} */ (byId.get(id)));
}
