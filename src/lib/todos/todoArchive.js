// ═══════════════════════════════════════════════════════════════════
// [할 일 → 보관함(아카이브)] 다중 선택한 할 일을 아카이브 창의 메모 카드로 바꾸는 규칙입니다.
//
// 왜 할 일 하나를 카드 하나로 만드는가:
//   [D-Day]가 고른 할 일마다 D-Day를 하나씩 만드는 것처럼, [아카이브]도 고른 할 일을 하나씩 보관합니다.
//   카드마다 따로 즐겨찾기·삭제·Tiny Note로 되살리기를 할 수 있어야 보관함에서 다시 찾아 쓰기 쉽습니다.
// 할 일의 서식(굵게·색 등)은 본문에 그대로 두고, 마감일은 본문 아래 한 줄로 남겨 날짜 정보를 잃지 않습니다.
// ═══════════════════════════════════════════════════════════════════
import { formatShortDate, parseDateKey } from '../datePicker/calendarModel.js';
import { stripHtmlToTitle } from '../dday/ddayModel.js';

// 카드 제목 길이. 아카이브 창의 제목 칸이 한 줄로 잘라 보여 주므로 길게 두지 않습니다.
export const ARCHIVE_TITLE_MAX = 20;

/**
 * 고른 할 일을 목록 순서대로 꺼냅니다. (선택한 순서가 아니라 화면에 보이던 순서)
 * @template {{ id: string }} T
 * @param {readonly T[]} todos
 * @param {readonly string[]} selectedIds
 * @returns {T[]}
 */
export function pickSelectedTodos(todos, selectedIds) {
  const wanted = new Set(selectedIds || []);
  return (todos || []).filter((todo) => todo && wanted.has(todo.id));
}

/**
 * 할 일 하나를 아카이브 카드 내용으로 바꿉니다. (archiveStore.addNotes가 받는 모양)
 * @param {{ id: string, text?: string, deadline?: string }} todo
 * @param {{ themeColor?: string, isDarkMode?: boolean, sourceLabel?: string }} [look]
 * @returns {{ title: string, content: string, themeColor: string, isDarkMode: boolean, sourceLabel: string }}
 */
export function todoToArchiveNote(todo, look = {}) {
  const html = typeof todo.text === 'string' ? todo.text : '';
  const title = stripHtmlToTitle(html, ARCHIVE_TITLE_MAX) || '할 일';
  const parts = parseDateKey(todo.deadline || '');
  const deadlineLine = parts
    ? `<div>📅 ${parts.year}년 ${formatShortDate(todo.deadline)} 마감</div>`
    : '';
  return {
    title,
    content: `<div>${html}</div>${deadlineLine}`,
    themeColor: look.themeColor || 'amber',
    isDarkMode: Boolean(look.isDarkMode),
    sourceLabel: look.sourceLabel || 'unknown',
  };
}
