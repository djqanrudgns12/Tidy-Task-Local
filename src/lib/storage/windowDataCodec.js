// ═══════════════════════════════════════════════════════════════════
// [창 데이터 계약] 저장 파일의 "창 데이터" 한 칸을 읽고 쓰는 규칙을 한 표로 관리합니다.
//
// 왜 표 하나로 모았는가 (프로젝트 규칙 2):
//   예전에는 새 상태를 추가할 때 init()·저장·되돌리기 스냅샷 세 곳을 사람이 직접 맞춰야 했고,
//   한 곳이라도 빠지면 재시작 시 값이 사라졌습니다. 이제 이 표에 한 줄만 추가하면
//   복원·저장·스냅샷이 모두 같은 목록을 따릅니다.
//
// 주의 — 복원 규칙의 `||` 와 `??` 는 일부러 다릅니다:
//   `v || 기본값` : 0, '', false 까지 기본값으로 바꿉니다. (예: fontSize 0 → 10)
//   `v ?? 기본값` : 값이 아예 없을 때만 기본값을 씁니다. (예: letterSpacing 0 → 0 유지)
//   5.0.0의 init()과 똑같이 옮겨야 저장값이 조용히 바뀌지 않으므로 절대 통일하지 마세요.
// ═══════════════════════════════════════════════════════════════════
import { isTinyNoteDarkTheme, normalizeThemeId } from '../themes.js';
import { isTinyNoteLabel } from '../windows/windowLabels.js';

const DEFAULT_FONT = '메이플스토리 L';

/**
 * name     : 저장 키이자 AppState 필드 이름
 * restore  : (저장값, 지금까지 복원한 값들, ctx) → 복원 값
 * snapshot : 되돌리기(Undo) 기록 대상 여부
 * 배열 순서 = 저장 시 JSON 키 순서 (5.0.0과 동일하게 유지)
 */
export const WINDOW_FIELDS = Object.freeze([
  { name: 'todos', restore: (v) => v || [], snapshot: true },
  { name: 'archivedTodos', restore: (v) => v || [], snapshot: true },
  { name: 'notes', restore: (v) => v || '', snapshot: true },
  {
    name: 'themeColor',
    // Tiny Note와 Tidy Task는 쓸 수 있는 테마 목록이 달라 창 종류에 맞춰 정규화합니다.
    restore: (v, _d, ctx) => normalizeThemeId(v, isTinyNoteLabel(ctx.label) ? 'tiny-note' : 'tidy'),
    snapshot: true,
  },
  {
    name: 'opacity',
    // 0에 가까운 값이 저장되면 창이 안 보이게 되므로 0.1 미만은 1.0으로 되돌립니다.
    restore: (v) => {
      const value = v ?? 1.0;
      return (typeof value !== 'number' || value < 0.1) ? 1.0 : value;
    },
    snapshot: true,
  },
  { name: 'reminderOpacity', restore: (v) => v ?? 1.0, snapshot: false },
  { name: 'fontFamily', restore: (v) => v || DEFAULT_FONT, snapshot: true },
  { name: 'uiFontFamily', restore: (v) => v || DEFAULT_FONT, snapshot: true },
  { name: 'fontSize', restore: (v) => v || 10, snapshot: true },
  { name: 'uiFontSize', restore: (v) => v || 10, snapshot: true },
  { name: 'letterSpacing', restore: (v) => v ?? 0, snapshot: true },
  { name: 'isPinned', restore: (v) => v || false, snapshot: false },
  { name: 'title', restore: (v) => v || '', snapshot: true },
  {
    name: 'isDarkMode',
    // Tiny Note 전용 다크 테마는 테마 자체가 어두우므로 다크 모드를 강제합니다.
    restore: (v, decoded) => isTinyNoteDarkTheme(decoded.themeColor) || v || false,
    snapshot: true,
  },
  { name: 'showArchived', restore: (v) => v ?? true, snapshot: true },
  { name: 'showNotes', restore: (v) => v ?? true, snapshot: true },
  { name: 'showReminders', restore: (v) => v ?? true, snapshot: true },
  { name: 'reminderSuppressUntil', restore: (v) => v || 0, snapshot: true },
  // 창 위치·크기는 "없음(undefined)"이 의미를 가지므로(→ 기본 배치) 그대로 둡니다.
  { name: 'windowPosX', restore: (v) => v, snapshot: false },
  { name: 'windowPosY', restore: (v) => v, snapshot: false },
  { name: 'windowWidth', restore: (v) => v, snapshot: false },
  { name: 'windowHeight', restore: (v) => v, snapshot: false },
  { name: 'isFullscreen', restore: (v) => v || false, snapshot: false },
  { name: 'todoHeight', restore: (v) => v ?? 145, snapshot: false },
  { name: 'notesHeight', restore: (v) => v ?? 140, snapshot: false },
  { name: 'isNotesLocked', restore: (v) => v ?? false, snapshot: false },
  // 무음 모드는 앱 전체 설정이라 창 데이터가 아니라 전역 키(ctx)에서 읽습니다. 저장은 양쪽에 합니다.
  { name: 'globalMuteSound', restore: (_v, _d, ctx) => ctx.globalMuteSound || false, snapshot: false },
  { name: 'isRolledUp', restore: (v) => v || false, snapshot: false },
  { name: 'previousHeight', restore: (v) => v || 280, snapshot: false },
  { name: 'isVerticalSnapped', restore: (v) => v || false, snapshot: false },
  { name: 'preSnapPosY', restore: (v) => v ?? null, snapshot: false },
  { name: 'preSnapHeight', restore: (v) => v ?? null, snapshot: false },
]);

// 되돌리기 스냅샷의 필드 순서 (5.0.0 takeSnapshot과 동일)
export const SNAPSHOT_FIELDS = Object.freeze([
  'todos', 'archivedTodos', 'notes', 'themeColor', 'opacity',
  'fontFamily', 'uiFontFamily', 'fontSize', 'uiFontSize', 'letterSpacing',
  'isDarkMode', 'showArchived', 'showNotes', 'showReminders', 'reminderSuppressUntil', 'title',
]);

/**
 * 저장된 창 데이터를 화면 상태 값으로 바꿉니다.
 * @param {Record<string, any> | null | undefined} winData
 * @param {{ label: string, globalMuteSound?: boolean }} ctx
 */
export function decodeWindowData(winData, ctx) {
  const source = winData || {};
  /** @type {Record<string, any>} */
  const decoded = {};
  for (const field of WINDOW_FIELDS) {
    decoded[field.name] = field.restore(source[field.name], decoded, ctx);
  }
  return decoded;
}

/**
 * 화면 상태를 저장용 객체로 바꿉니다.
 * @param {(name: string) => any} read 필드 이름을 받아 "평범한 값"(프록시가 아닌 값)을 돌려주는 함수
 */
export function encodeWindowData(read) {
  /** @type {Record<string, any>} */
  const data = {};
  for (const field of WINDOW_FIELDS) {
    data[field.name] = read(field.name);
  }
  return data;
}

/**
 * 되돌리기 기록용 스냅샷을 만듭니다.
 * @param {(name: string) => any} read 깊은 복사된 값을 돌려주는 함수
 */
export function pickSnapshot(read) {
  /** @type {Record<string, any>} */
  const snap = {};
  for (const name of SNAPSHOT_FIELDS) snap[name] = read(name);
  return snap;
}

// 스냅샷을 되돌릴 때의 값 보정 (옛 스냅샷에 없던 필드를 안전한 기본값으로)
export function restoreSnapshotValue(name, value) {
  if (name === 'letterSpacing') return value ?? 0;
  if (name === 'showReminders') return value ?? true;
  if (name === 'reminderSuppressUntil') return value || 0;
  return value;
}

// ── "빈 창" 판정 ───────────────────────────────────────────────────
// 왜 한 함수로 모았는가: 창 생성·꺼내기·부팅 복원·유령 청소기가 서로 다른 기준을 쓰면
//   같은 창을 어떤 곳은 "내용 있음", 어떤 곳은 "비었음"으로 판단해 명부가 어긋났습니다.

// HTML에 사람이 읽을 글자가 하나라도 있는지 봅니다. (<br>, &nbsp;, 폭 없는 공백만 있으면 비어 있음)
export function htmlHasText(html) {
  if (!html) return false;
  return String(html)
    .replace(/<[^>]*>?/g, '')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/[​-‍﻿]/g, '')
    .trim().length > 0;
}

export function hasWindowContent(winData) {
  if (!winData) return false;
  return (Array.isArray(winData.todos) && winData.todos.length > 0)
    || (Array.isArray(winData.archivedTodos) && winData.archivedTodos.length > 0)
    || htmlHasText(winData.notes);
}
