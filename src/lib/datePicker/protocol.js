// ═══════════════════════════════════════════════════════════════════
// [날짜 선택 창 ↔ 메모 창 약속] 두 창이 주고받는 이벤트 이름과 내용의 형식입니다.
//
// 흐름 (요청 창 = 달력을 연 main / note-N):
//   요청 창 ── open(요청 번호·버튼 위치·현재 값·모양) ──▶ 날짜 선택 창
//   요청 창 ◀── opened(받았음) ─────────────────────────── 날짜 선택 창
//   요청 창 ◀── closed(이유·고른 날짜) ──────────────────── 날짜 선택 창   ← 결과는 이 한 번으로만 옵니다
//   요청 창 ── close(요청 번호) ──▶ 날짜 선택 창            ← 바깥 클릭·할 일 삭제 등으로 요청 창이 닫을 때
//
// 왜 요청 번호가 필요한가: 창 여러 개가 같은 달력 창을 번갈아 쓰고, 이벤트는 창 사이를 비동기로 오갑니다.
//   늦게 도착한 옛 결과가 새로 연 달력의 대상(다른 할 일)에 적용되면 엉뚱한 할 일의 마감일이 바뀝니다.
// ═══════════════════════════════════════════════════════════════════
import { isDateKey } from './calendarModel.js';

// 날짜 선택 창 라벨. 데이터 창이 아니므로(windowLabels.isDataWindowLabel = false) 저장소에 쓰지 않습니다.
// Rust tray.rs의 TRANSIENT_LABELS에도 같은 이름이 있어야 "좌표 초기화"가 숨은 달력 창을 띄우지 않습니다.
export const DATE_PICKER_LABEL = 'date-picker';

export const DATE_PICKER_EVENTS = Object.freeze({
  open: 'date-picker:open',
  close: 'date-picker:close',
  ping: 'date-picker:ping',
  ready: 'date-picker:ready',
  opened: 'date-picker:opened',
  closed: 'date-picker:closed',
});

// 닫힌 이유. select/clear만 값을 바꾸고, select/clear/escape는 요청 창으로 입력 초점을 돌려줍니다.
export const CLOSE_REASONS = Object.freeze([
  'select', 'clear', 'escape', 'blur', 'outside', 'toggle', 'superseded',
  'requester', 'requester-closed', 'gone', 'frozen', 'anchor-removed', 'error',
]);
/** @param {string} reason */
export const changesValue = (reason) => reason === 'select' || reason === 'clear';
/** @param {string} reason */
export const returnsFocus = (reason) => reason === 'select' || reason === 'clear' || reason === 'escape';

// 달력 창을 만들 때의 옵션. 숨긴 채 만들어 두고(미리 준비) 필요할 때 위치만 옮겨 보여 줍니다.
export const DATE_PICKER_WINDOW_OPTIONS = Object.freeze({
  url: 'index.html',
  title: 'Tidy Task 날짜 선택',
  width: 240,
  height: 320,
  decorations: false,
  transparent: true,
  // 창 테두리 그림자는 투명 모서리에 1px 흰 선을 남깁니다. 카드 그림자는 화면(CSS)이 그립니다.
  shadow: false,
  resizable: false,
  maximizable: false,
  minimizable: false,
  // "항상 위"로 고정한 메모 창보다도 위에 떠야 합니다.
  alwaysOnTop: true,
  skipTaskbar: true,
  visible: false,
  focus: false,
});

// 카드 둘레의 투명 여백(논리 px) — 카드 그림자가 창 가장자리에서 잘리지 않을 자리
export const CARD_MARGIN = 10;

/**
 * @typedef {{ name: string, path: string }} CustomFontRef
 * @typedef {{
 *   isDarkMode: boolean, themeColor: string, fontFamily: string, fontSizePt: number,
 *   customFont: CustomFontRef | null,
 * }} PickerAppearance
 * @typedef {{
 *   requestId: string, requester: string, value: string, viaKeyboard: boolean,
 *   anchor: { x: number, y: number, width: number, height: number },
 *   appearance: PickerAppearance,
 * }} OpenRequest
 */

/** @param {unknown} v @returns {v is number} */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v @param {number} max */
const shortText = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
// 글꼴 이름은 style 속성에 들어갑니다. ; { } < > \ 가 섞이면 다른 CSS 속성까지 끼워 넣을 수 있어 막습니다.
/** @param {unknown} v */
const cssFontFamily = (v) => {
  const text = shortText(v, 300);
  return text && !/[;{}<>\\]/.test(text) ? text : null;
};

/**
 * 받은 open 내용을 검사해 안전한 값만 남깁니다. 쓸 수 없는 요청이면 null.
 * 왜 검사하는가: 달력 창은 받은 값으로 창 위치를 옮기고 글꼴 파일을 읽습니다. 형식이 틀린 값이
 *   섞이면 화면 밖으로 날아가거나(NaN 좌표) 저장된 마감일이 이상한 문자열로 바뀔 수 있습니다.
 * @param {unknown} payload
 * @returns {OpenRequest | null}
 */
export function normalizeOpenRequest(payload) {
  const p = /** @type {any} */ (payload);
  if (!p || typeof p !== 'object') return null;
  const requestId = shortText(p.requestId, 120);
  const requester = shortText(p.requester, 80);
  const a = p.anchor;
  if (!requestId || !requester || !a) return null;
  if (![a.x, a.y, a.width, a.height].every(isFiniteNumber)) return null;

  const look = p.appearance && typeof p.appearance === 'object' ? p.appearance : {};
  const fontSize = Number(look.fontSizePt);
  const custom = look.customFont;
  return {
    requestId,
    requester,
    value: isDateKey(p.value) ? p.value : '',
    viaKeyboard: p.viaKeyboard === true,
    anchor: {
      x: Math.round(a.x),
      y: Math.round(a.y),
      width: Math.max(0, Math.round(a.width)),
      height: Math.max(0, Math.round(a.height)),
    },
    appearance: {
      isDarkMode: look.isDarkMode === true,
      themeColor: shortText(look.themeColor, 40) || 'amber',
      fontFamily: cssFontFamily(look.fontFamily) || '"Gulim", sans-serif',
      // 설정 화면이 허용하는 글자 크기 범위 밖이면 기본 10pt로 봅니다(창이 터무니없이 커지지 않게).
      fontSizePt: Number.isFinite(fontSize) && fontSize >= 6 && fontSize <= 32 ? fontSize : 10,
      customFont: custom && shortText(custom.name, 120) && shortText(custom.path, 1024)
        ? { name: custom.name, path: custom.path }
        : null,
    },
  };
}

/**
 * 받은 closed 내용을 검사합니다. 값을 바꾸는 이유(select/clear)인데 값이 이상하면 null.
 * @param {unknown} payload
 * @returns {{ requestId: string, reason: string, value: string } | null}
 */
export function normalizeClosed(payload) {
  const p = /** @type {any} */ (payload);
  if (!p || typeof p !== 'object') return null;
  const requestId = shortText(p.requestId, 120);
  const reason = CLOSE_REASONS.includes(p.reason) ? p.reason : null;
  if (!requestId || !reason) return null;
  if (reason === 'select' && !isDateKey(p.value)) return null;
  return { requestId, reason, value: reason === 'select' ? p.value : '' };
}
