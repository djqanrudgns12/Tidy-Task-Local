// 되돌리기 알림의 상태 기계 — 뜸 · 합침 · 멈춤 · 재개 · 되돌림 · 닫힘
// 설계: docs/PRD-todo-row-gestures.md §7.6
//
// 왜 컴포넌트가 아니라 여기서 시간을 다루는가:
//   "마우스를 올리면 멈추고, 나가면 최소 2초 보장, 창이 숨으면 멈춤, 떠 있는 중 또 지우면 합치고 처음부터"
//   같은 규칙은 화면 없이 시간만 흉내 내서 검사해야 경계값 실수가 없습니다.

/** 알림이 떠 있는 시간 */
export const UNDO_TOAST_MS = 6000;
/** 멈췄다가 다시 갈 때 최소로 보장하는 시간(읽고 누를 틈) */
export const UNDO_TOAST_RESUME_MIN_MS = 2000;
/** "되돌렸어요!"를 보여 주는 시간 */
export const UNDO_DONE_MS = 1400;

/**
 * @typedef {'todo' | 'archived' | 'archived-all'} ToastEntryKind
 * @typedef {'deleted' | 'kept' | null} DdayEffect
 * @typedef {{ record: any, kind: ToastEntryKind, count: number, title: string, ddayEffect: DdayEffect }} ToastEntry
 * @typedef {{ restored: number, skipped: number }} RestoreResult
 * @typedef {{
 *   phase: 'hidden' | 'shown' | 'restored',
 *   group: number,
 *   bump: number,
 *   entries: ToastEntry[],
 *   result: RestoreResult | null,
 *   paused: boolean,
 *   remainingMs: number,
 *   startedAt: number,
 * }} ToastState
 */

/**
 * @param {{
 *   now: () => number,
 *   setTimer: (fn: () => void, ms: number) => any,
 *   clearTimer: (handle: any) => void,
 *   onChange?: (state: ToastState) => void,
 * }} deps
 */
export function createUndoToastModel({ now, setTimer, clearTimer, onChange }) {
  /** @type {ToastState} */
  let state = {
    phase: 'hidden', group: 0, bump: 0, entries: [], result: null,
    paused: false, remainingMs: 0, startedAt: 0,
  };
  /** @type {Set<string>} 멈춤 이유(올림·초점·창 숨김) — 모두 사라져야 다시 갑니다 */
  const pauseReasons = new Set();
  /** @type {any} */
  let timer = null;

  function stopTimer() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  /** @param {Partial<ToastState>} patch */
  function commit(patch) {
    state = { ...state, ...patch };
    onChange?.(state);
  }

  function hide() {
    stopTimer();
    // 알림이 사라지면 그 위의 마우스·초점은 "나감" 신호 없이 끝납니다. 남겨 두면 다음 알림이 멈춘 채로 뜹니다.
    // 창 숨김('hidden')은 알림과 상관없는 창 상태라 그대로 둡니다.
    pauseReasons.delete('hover');
    pauseReasons.delete('focus');
    commit({ phase: 'hidden', entries: [], result: null, paused: false, remainingMs: 0 });
  }

  /** @param {number} ms */
  function run(ms) {
    stopTimer();
    if (pauseReasons.size > 0) {
      commit({ paused: true, remainingMs: ms });
      return;
    }
    timer = setTimer(() => { timer = null; hide(); }, ms);
    commit({ paused: false, remainingMs: ms, startedAt: now() });
  }

  return {
    get state() { return state; },
    /** 삭제 기록들(지운 순서) — 되돌릴 때 씁니다 */
    records() { return state.entries.map((e) => e.record); },

    /**
     * 새 삭제를 알립니다. 떠 있는 중이면 묶음에 합치고 시간을 처음부터 다시 셉니다.
     * @param {ToastEntry} entry
     */
    offer(entry) {
      if (state.phase === 'shown') {
        commit({ entries: [...state.entries, entry], bump: state.bump + 1 });
      } else {
        commit({ phase: 'shown', group: state.group + 1, bump: 0, entries: [entry], result: null });
      }
      run(UNDO_TOAST_MS);
    },

    /** @param {string} reason 'hover' | 'focus' | 'hidden' */
    pause(reason) {
      const wasRunning = pauseReasons.size === 0;
      pauseReasons.add(reason);
      if (state.phase !== 'shown' || !wasRunning) return;
      stopTimer();
      const left = Math.max(0, state.remainingMs - (now() - state.startedAt));
      commit({ paused: true, remainingMs: left });
    },

    /** @param {string} reason */
    resume(reason) {
      if (!pauseReasons.delete(reason)) return;
      if (pauseReasons.size > 0 || state.phase !== 'shown' || !state.paused) return;
      run(Math.max(state.remainingMs, UNDO_TOAST_RESUME_MIN_MS));
    },

    /**
     * 되돌림 결과를 보여 주고 잠시 뒤 닫습니다.
     * @param {RestoreResult} result
     */
    markRestored(result) {
      if (state.phase !== 'shown') return;
      stopTimer();
      commit({ phase: 'restored', result, paused: false, remainingMs: UNDO_DONE_MS, startedAt: now() });
      timer = setTimer(() => { timer = null; hide(); }, UNDO_DONE_MS);
    },

    /** 즉시 닫습니다(전역 되돌리기·업데이트 잠금·내용 초기화 등). */
    dismiss() {
      if (state.phase === 'hidden') return;
      hide();
    },

    destroy() {
      stopTimer();
      pauseReasons.clear();
    },
  };
}

/**
 * 알림 문구. 조사를 붙이지 않아 잘린 제목의 받침에 따라 을/를이 틀리는 일이 없습니다.
 * @param {ToastState} state
 * @returns {{ title: string, sub: string | null, quoted: string | null }}
 *   quoted가 있으면 화면이 따옴표 안 제목을 말줄임 처리할 수 있도록 따로 줍니다.
 */
export function describeToast(state) {
  if (state.phase === 'restored') {
    const result = state.result || { restored: 0, skipped: 0 };
    if (result.restored === 0) return { title: '이미 돌아와 있어요', sub: null, quoted: null };
    if (result.skipped > 0) {
      return {
        title: `${result.restored + result.skipped}개 중 ${result.restored}개를 되돌렸어요`,
        sub: '나머지는 이미 돌아와 있어요',
        quoted: null,
      };
    }
    return { title: '되돌렸어요!', sub: null, quoted: null };
  }

  const entries = state.entries || [];
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.count || 0), 0);
  const effects = new Set(entries.map((e) => e.ddayEffect));
  // 할 일과 함께 지운 D-Day가 하나라도 있으면 그 안내가 더 중요합니다.
  const sub = effects.has('deleted')
    ? '연결된 D-Day도 함께 지웠어요'
    : effects.has('kept') ? 'D-Day는 컨트롤 타워에 남겨 뒀어요' : null;

  if (entries.length === 1 && entries[0].kind === 'archived-all') {
    return { title: `마감된 일 ${total}개를 비웠어요`, sub, quoted: null };
  }
  if (total === 1 && entries.length === 1) {
    return { title: '지웠어요', sub, quoted: entries[0].title };
  }
  const kinds = new Set(entries.map((e) => (e.kind === 'todo' ? 'todo' : 'archived')));
  if (kinds.size === 1 && kinds.has('todo')) return { title: `할 일 ${total}개를 지웠어요`, sub, quoted: null };
  if (kinds.size === 1) return { title: `마감된 일 ${total}개를 지웠어요`, sub, quoted: null };
  return { title: `${total}개를 지웠어요`, sub, quoted: null };
}
