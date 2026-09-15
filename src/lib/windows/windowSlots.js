// ═══════════════════════════════════════════════════════════════════
// [창 슬롯 규칙] 새 창을 어느 번호로 열지, 어떤 옵션으로 만들지 정하는 순수 로직입니다.
//
// 왜 한 파일로 모았는가:
//   새 노트 창·새 Tiny Note·아카이브 꺼내기가 거의 같은 코드를 각자 복사해 쓰고 있었고,
//   한쪽만 고쳐진 사례(꺼내기 창 최소 폭 160px, 기본 크기 누락)가 실제로 있었습니다.
//   Tauri API를 부르지 않는 순수 함수라 단위 테스트로 검증합니다.
// ═══════════════════════════════════════════════════════════════════
import { hasWindowContent } from '../storage/windowDataCodec.js';
import { normalizeThemeId, isTinyNoteDarkTheme } from '../themes.js';
import {
  TINY_NOTE_DEFAULT_HEIGHT,
  TINY_NOTE_DEFAULT_WIDTH,
  TINY_NOTE_MIN_HEIGHT,
  TINY_NOTE_MIN_WIDTH,
  TINY_NOTE_ROLLED_HEIGHT,
} from '../tinyNoteWindow.js';
import { MAX_WINDOWS_PER_KIND, slotLabels } from './windowLabels.js';

export const NOTE_DEFAULT_WIDTH = 380;
export const NOTE_DEFAULT_HEIGHT = 500;

/** @param {string} prefix @param {string[]} openLabels */
export function countOpenSlots(prefix, openLabels) {
  const open = new Set(openLabels || []);
  return slotLabels(prefix).filter((label) => open.has(label)).length;
}

/** @param {string} prefix @param {string[]} openLabels */
export function isSlotLimitReached(prefix, openLabels) {
  return countOpenSlots(prefix, openLabels) >= MAX_WINDOWS_PER_KIND;
}

/**
 * 닫혀 있는 슬롯 중 열 번호를 고릅니다.
 *  - 'reuse-data-first': 내용이 남아 있는 닫힌 창을 1순위로 되살리고, 없으면 첫 빈 슬롯
 *  - 'empty-only'      : 내용을 덮어쓰면 안 되는 경우(꺼내기) — 비어 있는 첫 닫힌 슬롯만
 * @param {{ prefix: string, openLabels: string[], getData: (label: string) => Promise<any>, mode: 'reuse-data-first' | 'empty-only' }} params
 * @returns {Promise<string | null>}
 */
export async function findSlot({ prefix, openLabels, getData, mode }) {
  const open = new Set(openLabels || []);
  let firstEmpty = null;

  for (const label of slotLabels(prefix)) {
    if (open.has(label)) continue;
    const hasData = hasWindowContent(await getData(label));

    if (hasData && mode === 'reuse-data-first') return label;
    if (!hasData && !firstEmpty) {
      firstEmpty = label;
      if (mode === 'empty-only') return label;
    }
  }
  return firstEmpty;
}

/** @param {unknown} value @returns {value is number} */
function isValidPos(value) {
  return value !== null && value !== undefined && typeof value === 'number' && !isNaN(value);
}

/** @param {any} value @param {number} fallback */
function savedSize(value, fallback) {
  return (value && value > 0) ? Math.round(value) : fallback;
}

/** @param {string} label */
function slotNumber(label) {
  return label.split('-')[1];
}

// 일반 노트 창(note-N) 생성 옵션 — 저장된 크기·위치가 있으면 그대로, 없으면 화면 중앙
/** @param {string} label @param {Record<string, any> | null | undefined} winData */
export function noteWindowOptions(label, winData) {
  /** @type {Record<string, any>} */
  const options = {
    url: 'index.html',
    title: `Tidy Task Note ${slotNumber(label)}`,
    width: savedSize(winData?.windowWidth, NOTE_DEFAULT_WIDTH),
    height: savedSize(winData?.windowHeight, NOTE_DEFAULT_HEIGHT),
    decorations: false,
    transparent: true,
    visible: false,
  };
  if (isValidPos(winData?.windowPosX) && isValidPos(winData?.windowPosY)) {
    options.x = Math.round(winData.windowPosX);
    options.y = Math.round(winData.windowPosY);
  } else {
    options.center = true;
  }
  return options;
}

// Tiny Note 창 생성 옵션 — 롤업 상태로 닫혔다면 35px 띠 높이로 바로 엽니다(깜빡임 방지)
/** @param {string} label @param {Record<string, any> | null | undefined} winData */
export function tinyNoteWindowOptions(label, winData) {
  const isRolledUp = winData?.isRolledUp || false;
  /** @type {Record<string, any>} */
  const options = {
    url: 'index.html',
    title: `Tiny Note ${slotNumber(label)}`,
    width: savedSize(winData?.windowWidth, TINY_NOTE_DEFAULT_WIDTH),
    height: isRolledUp ? TINY_NOTE_ROLLED_HEIGHT : savedSize(winData?.windowHeight, TINY_NOTE_DEFAULT_HEIGHT),
    minWidth: TINY_NOTE_MIN_WIDTH,
    minHeight: isRolledUp ? TINY_NOTE_ROLLED_HEIGHT : TINY_NOTE_MIN_HEIGHT,
    transparent: false,
    decorations: false,
    alwaysOnTop: false,
    maximizable: false,
    visible: false,
  };
  if (isValidPos(winData?.windowPosX) && isValidPos(winData?.windowPosY)) {
    options.x = Math.round(winData.windowPosX);
    options.y = Math.round(winData.windowPosY);
  }
  return options;
}

// 아카이브에서 꺼낸 메모를 새 Tiny Note 슬롯에 넣을 데이터
// 왜 크기를 명시하는가: 크기가 비어 있으면 복원 로직이 크기 적용을 건너뛰어 헤더 폭 계산이 어긋났습니다.
/** @param {{ title?: string, content?: string, themeColor?: string, isDarkMode?: boolean }} noteData */
export function archivedNoteToWindowData(noteData) {
  return {
    title: noteData.title,
    notes: noteData.content,
    themeColor: normalizeThemeId(noteData.themeColor, 'tiny-note'),
    isDarkMode: isTinyNoteDarkTheme(noteData.themeColor) || noteData.isDarkMode,
    todos: [],
    archivedTodos: [],
    windowWidth: TINY_NOTE_DEFAULT_WIDTH,
    windowHeight: TINY_NOTE_DEFAULT_HEIGHT,
  };
}
