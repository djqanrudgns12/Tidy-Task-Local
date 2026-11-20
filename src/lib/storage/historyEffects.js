// ═══════════════════════════════════════════════════════════════════
// [되돌리기 기록에 딸린 일] 메모 창 스냅샷 밖에서 함께 일어난 일을 Ctrl+Z · Ctrl+Y에 맞춰 되돌리고 다시 합니다.
//
// 왜 필요한가: 다중 선택 [아카이브]는 할 일을 빼는 동시에 보관함(다른 저장 키)에 카드를 넣습니다.
//   되돌리기 스냅샷은 메모 창 필드만 담으므로, Ctrl+Z로 할 일만 돌아오고 보관함 카드가 남아 같은 일이 두 곳에 생겼습니다.
// 키는 "그 동작 직후의 스냅샷 객체"입니다. WeakMap이라 기록이 20칸을 넘어 버려지거나
// 새 동작으로 앞날 기록이 지워지면 딸린 일도 함께 사라집니다(메모리 전용, 저장하지 않음).
// ═══════════════════════════════════════════════════════════════════

/** @typedef {{ undo: () => unknown, redo: () => unknown }} HistoryEffect */

export function createHistoryEffects() {
  /** @type {WeakMap<object, HistoryEffect>} */
  const effects = new WeakMap();
  return {
    /**
     * 동작이 새 기록 칸을 남겼을 때만 그 칸에 붙입니다. (기록이 남지 않았으면 붙일 곳이 없음)
     * @param {object | undefined} before 동작 전 현재 칸 @param {object | undefined} after 동작 후 현재 칸
     * @param {HistoryEffect | undefined} effect
     * @returns {boolean} 붙였는지
     */
    attach(before, after, effect) {
      if (!effect || !after || after === before) return false;
      effects.set(after, effect);
      return true;
    },
    /**
     * undo: 그 칸을 "떠날 때", redo: 그 칸에 "다시 들어올 때" 부릅니다. 실패해도 되돌리기 자체는 막지 않습니다.
     * @param {object | undefined} snap @param {'undo' | 'redo'} direction
     */
    async run(snap, direction) {
      const effect = snap && effects.get(snap);
      if (!effect) return false;
      try {
        await effect[direction]();
        return true;
      } catch (e) {
        console.error(`되돌리기 기록에 딸린 작업(${direction}) 실패:`, e);
        return false;
      }
    },
  };
}
