// ═══════════════════════════════════════════════════════════════════
// [매니저 선출] 리마인더 점검·업데이트 확인을 맡을 창 하나를 고릅니다.
//
// 왜 "지금 열려 있는 창"에서 고르는가:
//   예전에는 저장 명부(activeExtraWindows)에서 골랐는데, 명부에는 내용이 있어서
//   다음 실행 때 되살릴 "닫힌 창"도 들어 있습니다. 가장 번호가 작은 창이 닫혀 있으면
//   아무도 매니저가 되지 않아 리마인더와 업데이트 확인이 조용히 멈췄습니다.
//
// 우선순위: main → note-1..10 → tinynote-1..10
//   (Tiny Note만 남아도 매니저가 있어야 알림이 계속됩니다)
// ═══════════════════════════════════════════════════════════════════
import { NOTE_PREFIX, TINY_NOTE_PREFIX, slotLabels } from './windowLabels.js';

export const MANAGER_PRIORITY = Object.freeze([
  'main',
  ...slotLabels(NOTE_PREFIX),
  ...slotLabels(TINY_NOTE_PREFIX),
]);

/**
 * @param {string[]} openLabels 지금 열려 있는 창 라벨 목록
 * @param {{ exclude?: string | null }} [options] 곧 닫힐 창처럼 후보에서 뺄 라벨
 * @returns {string | null} 매니저가 될 창 라벨 (후보가 없으면 null)
 */
export function pickManager(openLabels, { exclude = null } = {}) {
  const open = new Set(openLabels || []);
  if (exclude) open.delete(exclude);
  return MANAGER_PRIORITY.find((label) => open.has(label)) ?? null;
}
