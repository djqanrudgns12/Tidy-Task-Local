import { escapeHtml } from '../io/txtPorter.js';
import { newId } from '../ids.js';
import { parseDateKey } from '../datePicker/calendarModel.js';
import {
  buildDdayItem,
  normalizeDdayList,
  stripHtmlToTitle,
  todayDateKey,
} from './ddayModel.js';

/**
 * @typedef {import('./ddayModel.js').DdayItem} DdayItem
 * @typedef {import('./ddayModel.js').DdaySettings} DdaySettings
 * @typedef {{ id: string, text: string, completed: boolean, deadline?: string }} TodoItem
 * @typedef {{
 *   todos: TodoItem[],
 *   archivedTodos: TodoItem[],
 *   ddayItems: DdayItem[],
 *   sortOrder?: 'asc' | 'desc',
 * }} DdayWindowState
 */

/**
 * appState._sortTodosByDeadline과 동일한 정렬 순수 함수.
 * @param {TodoItem[]} todos
 * @param {'asc' | 'desc'} [sortOrder]
 * @returns {TodoItem[]}
 */
export function sortTodosByDeadlineList(todos, sortOrder = 'asc') {
  return [...todos].sort((a, b) => {
    const hasA = Boolean(a.deadline);
    const hasB = Boolean(b.deadline);
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    const timeA = new Date(/** @type {string} */ (a.deadline)).getTime();
    const timeB = new Date(/** @type {string} */ (b.deadline)).getTime();
    return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
  });
}

/** @param {DdayItem[]} items */
function reindexActiveOrders(items) {
  let nextOrder = 0;
  return items.map((item) => (item.status === 'active' ? { ...item, order: nextOrder++ } : item));
}

/**
 * 기존 활성 할 일을 D-Day로 고정합니다.
 * 이미 연동된 활성 D-Day가 있으면 중복 생성하지 않고 그대로 반환합니다.
 * @param {DdayWindowState} state
 * @param {string} todoId
 * @param {DdaySettings} settings
 * @param {string} [today]
 * @param {Partial<DdayItem>} [customPatch]
 * @returns {{ state: DdayWindowState, item: DdayItem | null, created: boolean }}
 */
export function pinTodoAsDday(state, todoId, settings, today = todayDateKey(), customPatch = {}) {
  const todos = [...(state.todos || [])];
  const archivedTodos = [...(state.archivedTodos || [])];
  let ddayItems = normalizeDdayList(state.ddayItems);

  const existing = ddayItems.find((d) => d.status === 'active' && d.linkedTodoId === todoId);
  if (existing) {
    return {
      state: { ...state, todos, archivedTodos, ddayItems },
      item: existing,
      created: false,
    };
  }

  const todoIdx = todos.findIndex((t) => t.id === todoId);
  if (todoIdx === -1) {
    return { state, item: null, created: false };
  }
  const todo = todos[todoIdx];
  const dateKey = customPatch.date || todo.deadline;
  if (!parseDateKey(dateKey)) {
    return { state, item: null, created: false };
  }

  const preset = settings.defaultChannelsFromTodo;
  const keepTodo = customPatch.showInTodo ?? preset.showInTodo;
  const title = stripHtmlToTitle(customPatch.title ?? todo.text) || 'D-Day';

  if (todo.deadline !== dateKey) {
    todos[todoIdx] = { ...todo, deadline: dateKey };
  }
  if (!keepTodo) {
    todos.splice(todoIdx, 1);
  }

  const nextOrder = ddayItems.filter((d) => d.status === 'active').length;
  const createdItem = buildDdayItem({
    title,
    date: dateKey,
    startDate: today,
    countMode: customPatch.countMode || 'countdown',
    repeatYearly: Boolean(customPatch.repeatYearly),
    icon: customPatch.icon || 'flag',
    tone: customPatch.tone || 'accent',
    status: 'active',
    linkedTodoId: keepTodo ? todo.id : null,
    showInTodo: keepTodo,
    showInBanner: customPatch.showInBanner ?? preset.showInBanner,
    showInWidget: customPatch.showInWidget ?? preset.showInWidget,
    order: nextOrder,
  });
  if (!createdItem) {
    return { state, item: null, created: false };
  }

  ddayItems = reindexActiveOrders([...ddayItems, createdItem]);
  return {
    state: {
      ...state,
      todos: sortTodosByDeadlineList(todos, state.sortOrder),
      archivedTodos,
      ddayItems,
    },
    item: createdItem,
    created: true,
  };
}

/**
 * 컨트롤 타워에서 새 D-Day를 추가합니다.
 * @param {DdayWindowState} state
 * @param {Partial<DdayItem>} draft
 * @param {DdaySettings} settings
 * @param {string} [today]
 * @returns {{ state: DdayWindowState, item: DdayItem | null }}
 */
export function createNewDday(state, draft, settings, today = todayDateKey()) {
  let todos = [...(state.todos || [])];
  const archivedTodos = [...(state.archivedTodos || [])];
  let ddayItems = normalizeDdayList(state.ddayItems);

  const title = stripHtmlToTitle(draft.title);
  if (!title || !parseDateKey(draft.date)) {
    return { state, item: null };
  }

  const preset = settings.defaultChannelsFromNew;
  const wantTodo = draft.showInTodo ?? preset.showInTodo;
  /** @type {string | null} */
  let linkedTodoId = null;

  if (wantTodo) {
    const newTodo = {
      id: newId(),
      text: escapeHtml(title),
      completed: false,
      deadline: draft.date,
    };
    linkedTodoId = newTodo.id;
    todos = sortTodosByDeadlineList([...todos, newTodo], state.sortOrder);
  }

  const nextOrder = ddayItems.filter((d) => d.status === 'active').length;
  const item = buildDdayItem({
    title,
    date: draft.date,
    startDate: draft.startDate || today,
    countMode: draft.countMode || 'countdown',
    repeatYearly: Boolean(draft.repeatYearly),
    icon: draft.icon || 'flag',
    tone: draft.tone || 'accent',
    status: 'active',
    linkedTodoId,
    showInTodo: wantTodo && linkedTodoId !== null,
    showInBanner: draft.showInBanner ?? preset.showInBanner,
    showInWidget: draft.showInWidget ?? preset.showInWidget,
    order: nextOrder,
  });
  if (!item) return { state, item: null };

  ddayItems = reindexActiveOrders([...ddayItems, item]);
  return {
    state: { ...state, todos, archivedTodos, ddayItems },
    item,
  };
}

/**
 * 기존 D-Day 항목을 수정합니다 (별칭/날짜/스타일/3채널 토글 포함).
 * showInTodo 토글에 따라 To-do 생성·복원 또는 할 일 목록 제거(D-Day 보존)를 처리합니다.
 * @param {DdayWindowState} state
 * @param {string} ddayId
 * @param {Partial<DdayItem>} patch
 * @param {string} [today]
 * @returns {{ state: DdayWindowState, item: DdayItem | null }}
 */
export function updateDdayItem(state, ddayId, patch, today = todayDateKey()) {
  let todos = [...(state.todos || [])];
  let archivedTodos = [...(state.archivedTodos || [])];
  let ddayItems = normalizeDdayList(state.ddayItems);

  const idx = ddayItems.findIndex((d) => d.id === ddayId);
  if (idx === -1) return { state, item: null };

  const current = ddayItems[idx];
  const nextTitle = patch.title !== undefined ? stripHtmlToTitle(patch.title) || current.title : current.title;
  const nextDate = patch.date !== undefined && parseDateKey(patch.date) ? patch.date : current.date;
  const dateChanged = nextDate !== current.date;
  let linkedTodoId = current.linkedTodoId;
  let showInTodo = current.showInTodo;

  if (patch.showInTodo === false && (current.showInTodo || linkedTodoId)) {
    if (linkedTodoId) {
      todos = todos.filter((t) => t.id !== linkedTodoId);
    }
    linkedTodoId = null;
    showInTodo = false;
  } else if (patch.showInTodo === true) {
    const activeMatch = linkedTodoId ? todos.find((t) => t.id === linkedTodoId) : null;
    if (activeMatch) {
      showInTodo = true;
    } else {
      const archivedIdx = linkedTodoId ? archivedTodos.findIndex((t) => t.id === linkedTodoId) : -1;
      if (archivedIdx !== -1) {
        const restored = { ...archivedTodos[archivedIdx], completed: false, deadline: nextDate };
        archivedTodos.splice(archivedIdx, 1);
        todos = sortTodosByDeadlineList([...todos, restored], state.sortOrder);
        showInTodo = true;
      } else {
        const createdTodo = {
          id: newId(),
          text: escapeHtml(nextTitle),
          completed: false,
          deadline: nextDate,
        };
        todos = sortTodosByDeadlineList([...todos, createdTodo], state.sortOrder);
        linkedTodoId = createdTodo.id;
        showInTodo = true;
      }
    }
  }

  // 연결된 활성 할 일이 남아 있고 날짜가 바뀌었으면 할 일 마감일도 동기화 (원문 text는 유지)
  if (linkedTodoId) {
    const todoIdx = todos.findIndex((t) => t.id === linkedTodoId);
    if (todoIdx !== -1 && todos[todoIdx].deadline !== nextDate) {
      todos[todoIdx] = { ...todos[todoIdx], deadline: nextDate };
      todos = sortTodosByDeadlineList(todos, state.sortOrder);
    }
  }

  const nextItem = buildDdayItem({
    ...current,
    ...patch,
    id: current.id,
    title: nextTitle,
    date: nextDate,
    startDate: dateChanged && !patch.startDate ? today : (patch.startDate ?? current.startDate),
    linkedTodoId,
    showInTodo: linkedTodoId !== null && showInTodo,
  });
  if (!nextItem) return { state, item: null };

  ddayItems[idx] = nextItem;
  return {
    state: { ...state, todos, archivedTodos, ddayItems },
    item: nextItem,
  };
}

/**
 * D-Day를 완료 아카이브로 보냅니다.
 * @param {DdayWindowState} state
 * @param {string} ddayId
 * @param {DdaySettings} settings
 * @param {string} [today]
 * @returns {{ state: DdayWindowState, completedTodo: boolean }}
 */
export function completeDdayItem(state, ddayId, settings, today = todayDateKey()) {
  let todos = [...(state.todos || [])];
  let archivedTodos = [...(state.archivedTodos || [])];
  let ddayItems = normalizeDdayList(state.ddayItems);

  const idx = ddayItems.findIndex((d) => d.id === ddayId);
  if (idx === -1) return { state, completedTodo: false };
  const target = ddayItems[idx];

  let completedTodo = false;
  if (settings.completeWithTodo && target.linkedTodoId) {
    const tIdx = todos.findIndex((t) => t.id === target.linkedTodoId);
    if (tIdx !== -1) {
      const moved = { ...todos[tIdx], completed: true };
      todos.splice(tIdx, 1);
      archivedTodos = [moved, ...archivedTodos];
      completedTodo = true;
    }
  }

  ddayItems[idx] = {
    ...target,
    status: 'archived',
    completedAt: today,
  };
  ddayItems = reindexActiveOrders(ddayItems);
  return {
    state: { ...state, todos, archivedTodos, ddayItems },
    completedTodo,
  };
}

/**
 * 완료 아카이브의 D-Day를 스마트 복원합니다.
 * 마감된 일(archivedTodos)에 원본 할 일이 남아 있으면 함께 활성 목록으로 복귀하고,
 * 이미 비워진 상태라면 D-Day 전용으로 오류 없이 되살립니다.
 * @param {DdayWindowState} state
 * @param {string} ddayId
 * @returns {{ state: DdayWindowState, restoredTodo: boolean }}
 */
export function restoreDdayItem(state, ddayId) {
  let todos = [...(state.todos || [])];
  const archivedTodos = [...(state.archivedTodos || [])];
  let ddayItems = normalizeDdayList(state.ddayItems);

  const idx = ddayItems.findIndex((d) => d.id === ddayId);
  if (idx === -1) return { state, restoredTodo: false };
  const target = ddayItems[idx];

  let linkedTodoId = target.linkedTodoId;
  let showInTodo = false;
  let restoredTodo = false;

  if (linkedTodoId) {
    const activeMatch = todos.some((t) => t.id === linkedTodoId);
    if (activeMatch) {
      showInTodo = true;
    } else {
      const aIdx = archivedTodos.findIndex((t) => t.id === linkedTodoId);
      if (aIdx !== -1) {
        const recovered = { ...archivedTodos[aIdx], completed: false };
        archivedTodos.splice(aIdx, 1);
        todos = sortTodosByDeadlineList([...todos, recovered], state.sortOrder);
        showInTodo = true;
        restoredTodo = true;
      } else {
        linkedTodoId = null;
        showInTodo = false;
      }
    }
  }

  const activeCount = ddayItems.filter((d) => d.status === 'active').length;
  ddayItems[idx] = {
    ...target,
    status: 'active',
    completedAt: null,
    linkedTodoId,
    showInTodo,
    order: activeCount,
  };
  ddayItems = reindexActiveOrders(ddayItems);
  return {
    state: { ...state, todos, archivedTodos, ddayItems },
    restoredTodo,
  };
}

/**
 * @param {DdayWindowState} state
 * @param {string} ddayId
 * @param {{ deleteLinkedTodo?: boolean }} [options]
 * @returns {DdayWindowState}
 */
export function deleteDdayItem(state, ddayId, { deleteLinkedTodo = false } = {}) {
  const ddayItems = normalizeDdayList(state.ddayItems);
  const target = ddayItems.find((d) => d.id === ddayId);
  if (!target) return state;

  let todos = [...(state.todos || [])];
  if (deleteLinkedTodo && target.linkedTodoId) {
    todos = todos.filter((t) => t.id !== target.linkedTodoId);
  }
  const remaining = reindexActiveOrders(ddayItems.filter((d) => d.id !== ddayId));
  return { ...state, todos, ddayItems: remaining };
}

/** @param {DdayWindowState} state @returns {DdayWindowState} */
export function clearArchivedDdays(state) {
  const ddayItems = normalizeDdayList(state.ddayItems).filter((d) => d.status !== 'archived');
  return { ...state, ddayItems };
}

/**
 * @param {DdayWindowState} state
 * @param {string[]} orderedActiveIds
 * @returns {DdayWindowState}
 */
export function reorderActiveDdays(state, orderedActiveIds) {
  const ddayItems = normalizeDdayList(state.ddayItems);
  const rank = new Map(orderedActiveIds.map((id, idx) => [id, idx]));
  const active = ddayItems
    .filter((d) => d.status === 'active')
    .sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999))
    .map((d, idx) => ({ ...d, order: idx }));
  const archived = ddayItems.filter((d) => d.status === 'archived');
  return { ...state, ddayItems: [...active, ...archived] };
}

/**
 * 할 일 마감일 변경을 연동 D-Day에 반영합니다.
 * 마감일을 지우면('') 연결된 할 일과 분리하되 D-Day 날짜는 보존합니다.
 * @param {DdayWindowState} state
 * @param {string} todoId
 * @param {string} nextDeadline
 * @returns {{ state: DdayWindowState, changed: boolean }}
 */
export function syncTodoDeadlineToDdays(state, todoId, nextDeadline) {
  const ddayItems = normalizeDdayList(state.ddayItems);
  let changed = false;
  const nextItems = ddayItems.map((d) => {
    if (d.linkedTodoId !== todoId || d.status !== 'active') return d;
    if (parseDateKey(nextDeadline)) {
      if (d.date === nextDeadline) return d;
      changed = true;
      return { ...d, date: nextDeadline };
    }
    changed = true;
    return { ...d, linkedTodoId: null, showInTodo: false };
  });
  return { state: changed ? { ...state, ddayItems: nextItems } : state, changed };
}

/**
 * @param {DdayWindowState} state
 * @param {string[]} todoIds
 * @param {DdaySettings} settings
 * @param {string} [today]
 * @returns {{ state: DdayWindowState, archivedCount: number }}
 */
export function syncTodosCompletedToDdays(state, todoIds, settings, today = todayDateKey()) {
  const idSet = new Set(todoIds);
  const ddayItems = normalizeDdayList(state.ddayItems);
  let archivedCount = 0;

  if (!settings.completeWithTodo) {
    // 완료 연동 OFF라도 활성 To-do에서 사라졌으므로 showInTodo=false는 유지하되 D-Day는 active로 남김
    const next = ddayItems.map((d) => {
      if (d.status === 'active' && d.linkedTodoId && idSet.has(d.linkedTodoId)) {
        return { ...d, showInTodo: false };
      }
      return d;
    });
    return { state: { ...state, ddayItems: next }, archivedCount: 0 };
  }

  const next = ddayItems.map((d) => {
    if (d.status === 'active' && d.linkedTodoId && idSet.has(d.linkedTodoId)) {
      archivedCount += 1;
      return { ...d, status: /** @type {const} */ ('archived'), completedAt: today };
    }
    return d;
  });
  return {
    state: archivedCount > 0 ? { ...state, ddayItems: reindexActiveOrders(next) } : state,
    archivedCount,
  };
}

/**
 * 마감된 할 일 복원 시(completeWithTodo가 켜져 있고 아카이브 D-Day가 매칭되면) 함께 복원합니다.
 * @param {DdayWindowState} state
 * @param {string} todoId
 * @param {DdaySettings} settings
 * @returns {{ state: DdayWindowState, restoredCount: number }}
 */
export function syncTodoRestoredToDdays(state, todoId, settings) {
  const ddayItems = normalizeDdayList(state.ddayItems);
  let restoredCount = 0;
  let activeCount = ddayItems.filter((d) => d.status === 'active').length;
  const next = ddayItems.map((d) => {
    if (d.linkedTodoId !== todoId) return d;
    if (d.status === 'archived' && settings.completeWithTodo) {
      restoredCount += 1;
      return { ...d, status: /** @type {const} */ ('active'), completedAt: null, showInTodo: true, order: activeCount++ };
    }
    if (d.status === 'active') {
      return { ...d, showInTodo: true };
    }
    return d;
  });
  return {
    state: restoredCount > 0 ? { ...state, ddayItems: reindexActiveOrders(next) } : { ...state, ddayItems: next },
    restoredCount,
  };
}

/**
 * 활성 할 일 삭제 시 deleteWithTodo 설정에 따라 동시 삭제 또는 D-Day 전용 보존을 수행합니다.
 * @param {DdayWindowState} state
 * @param {string[]} todoIds
 * @param {DdaySettings} settings
 * @returns {{ state: DdayWindowState, deletedCount: number, keptCount: number }}
 */
export function syncTodosDeletedToDdays(state, todoIds, settings) {
  const idSet = new Set(todoIds);
  const ddayItems = normalizeDdayList(state.ddayItems);
  let deletedCount = 0;
  let keptCount = 0;

  if (settings.deleteWithTodo) {
    const remaining = ddayItems.filter((d) => {
      if (d.status === 'active' && d.linkedTodoId && idSet.has(d.linkedTodoId)) {
        deletedCount += 1;
        return false;
      }
      return true;
    });
    return {
      state: deletedCount > 0 ? { ...state, ddayItems: reindexActiveOrders(remaining) } : state,
      deletedCount,
      keptCount: 0,
    };
  }

  const next = ddayItems.map((d) => {
    if (d.status === 'active' && d.linkedTodoId && idSet.has(d.linkedTodoId)) {
      keptCount += 1;
      return { ...d, linkedTodoId: null, showInTodo: false };
    }
    return d;
  });
  return {
    state: keptCount > 0 ? { ...state, ddayItems: next } : state,
    deletedCount: 0,
    keptCount,
  };
}

/**
 * 마감된 일 목록에서 영구 삭제될 때(단건 또는 전체 비우기), 보관 중인 D-Day의 끊어진 linkedTodoId만 정리합니다.
 * @param {DdayWindowState} state
 * @param {string[] | null} deletedTodoIds null이면 전체 비우기
 * @returns {DdayWindowState}
 */
export function syncArchivedTodosDeletedToDdays(state, deletedTodoIds) {
  const ddayItems = normalizeDdayList(state.ddayItems);
  const activeIds = new Set((state.todos || []).map((t) => t.id));
  const idSet = deletedTodoIds ? new Set(deletedTodoIds) : null;
  let changed = false;
  const next = ddayItems.map((d) => {
    if (!d.linkedTodoId) return d;
    if (activeIds.has(d.linkedTodoId)) return d;
    if (idSet === null || idSet.has(d.linkedTodoId)) {
      changed = true;
      return { ...d, linkedTodoId: null, showInTodo: false };
    }
    return d;
  });
  return changed ? { ...state, ddayItems: next } : state;
}

/** 키 순서와 상관없이 같은 값인지 봅니다(저장·정규화를 거치며 키 순서가 바뀌어도 "그대로"로 판단). */
function stableJson(/** @type {unknown} */ value) {
  return JSON.stringify(value, (_key, v) => (
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v
  ));
}

/**
 * 할 일 삭제를 되돌릴 때, 그 삭제로 사라지거나 바뀐 D-Day를 "삭제 직전" 모습으로 되돌립니다.
 *
 * 왜 "직후 모습과 같을 때만" 바꾸는가:
 *   삭제 뒤에 사용자가 그 D-Day를 직접 고쳤다면(다른 할 일에 연결, 이름 변경, 삭제) 사용자의 변경이 우선입니다.
 *   되돌리기가 사용자가 방금 한 일을 덮으면 "되돌렸더니 다른 게 망가지는" 사고가 됩니다.
 *
 * @param {DdayItem[]} currentItems 지금 D-Day 목록
 * @param {{ before: DdayItem, after: DdayItem | null, index: number }[]} changes 삭제가 바꾼 D-Day들
 * @returns {{ items: DdayItem[], changed: boolean, restoredIds: string[] }}
 */
export function restoreDdaysForTodos(currentItems, changes) {
  const items = [...(currentItems || [])];
  /** @type {Set<string>} */
  const restoredIds = new Set();
  // 원래 자리에 다시 넣을 때 앞 항목부터 넣어야 번호가 어긋나지 않습니다.
  const ordered = [...(changes || [])].sort((a, b) => a.index - b.index);
  for (const { before, after, index } of ordered) {
    if (!before || typeof before.id !== 'string') continue;
    const at = items.findIndex((d) => d.id === before.id);
    if (at === -1) {
      // 삭제 직후에도 있었는데 지금 없다 = 사용자가 나중에 지웠다 → 건너뜀
      if (after) continue;
      items.splice(Math.min(Math.max(0, index), items.length), 0, structuredClone(before));
      restoredIds.add(before.id);
      continue;
    }
    // 삭제로 사라졌던 id가 지금 있다 = 다른 경로로 이미 돌아왔다 → 건너뜀
    if (!after) continue;
    if (stableJson(items[at]) !== stableJson(after)) continue;
    items[at] = structuredClone(before);
    restoredIds.add(before.id);
  }
  if (restoredIds.size === 0) return { items: currentItems, changed: false, restoredIds: [] };

  // 진행 중 D-Day의 순서를 원래 order 기준으로 다시 매깁니다. 같은 값이면 되돌린 항목이 앞입니다.
  const active = items
    .filter((d) => d.status === 'active')
    .sort((a, b) => (a.order - b.order) || (Number(restoredIds.has(b.id)) - Number(restoredIds.has(a.id))));
  const orderOf = new Map(active.map((d, i) => [d.id, i]));
  const next = items.map((d) => {
    if (d.status !== 'active') return d;
    const order = /** @type {number} */ (orderOf.get(d.id));
    return d.order === order ? d : { ...d, order };
  });
  return { items: next, changed: true, restoredIds: [...restoredIds] };
}
