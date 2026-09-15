// ═══════════════════════════════════════════════════════════════════
// [리마인더 계산] 여러 창의 할 일에서 "마감 임박" 항목을 모읍니다. (순수 함수)
//
// 왜 분리했는가: 같은 계산이 "점검(알림 여부 판단)"과 "팝업 동기화" 두 곳에 복사돼 있었습니다.
//   한 함수로 모으면 두 경로의 결과가 항상 같고, 날짜 경계를 단위 테스트로 검증할 수 있습니다.
// ═══════════════════════════════════════════════════════════════════
import { daysUntil, todayKey } from '../dateUtils.js';

// 마감 며칠 전부터 알릴지 (D-3 이내 + 지난 마감 + 날짜 오류 항목)
export const REMINDER_WINDOW_DAYS = 3;

/**
 * @param {{ label: string, title?: string, todos?: any[] }[]} entries 창별 할 일 목록
 * @param {Date} [now]
 * @returns {{ list: any[], unnotified: { label: string, index: number, id: any }[], today: string }}
 *   list       : 팝업에 보여 줄 항목 (남은 날이 적은 순)
 *   unnotified : 오늘 아직 알림을 보내지 않은 항목의 위치 (알림 기록용)
 */
export function collectImminentTodos(entries, now = new Date()) {
  const today = todayKey(now);
  const seen = new Set();
  const list = [];
  const unnotified = [];

  for (const entry of entries || []) {
    const { label } = entry;
    const sourceTitle = entry.title || '제목 없음';
    const todos = entry.todos || [];

    for (let index = 0; index < todos.length; index++) {
      const todo = todos[index];
      if (!todo || !todo.deadline || todo.completed) continue;

      const days = daysUntil(todo.deadline, now);
      const isInvalid = Number.isNaN(days);
      // 날짜로 읽을 수 없는 마감일은 목록 맨 뒤에 둡니다.
      const diffDays = isInvalid ? Infinity : days;
      if (!isInvalid && diffDays > REMINDER_WINDOW_DAYS) continue;

      // 같은 항목이 두 번 들어가지 않도록 막습니다.
      // 왜 "창 이름:ID"인가: 서로 다른 창의 할 일이 우연히 같은 ID를 가지면, ID만으로 거를 때
      //   한쪽 할 일이 알림 목록에서 조용히 빠졌습니다.
      const key = `${label}:${todo.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      list.push({ ...todo, diffDays, sourceLabel: label, sourceTitle });
      if (!isInvalid && todo.lastNotified !== today) {
        unnotified.push({ label, index, id: todo.id });
      }
    }
  }

  list.sort((a, b) => a.diffDays - b.diffDays);
  return { list, unnotified, today };
}
