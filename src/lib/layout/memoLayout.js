// ═══════════════════════════════════════════════════════════════════
// [메모 창 세로 배치 규칙] 할 일 · 스플리터 · 마감된 일 · 중요한 일 메모가 창 높이를 나눠 갖는 규칙
//
// 왜 한 곳에 모았는가 (5.6.3까지의 사고):
//   창 크기 처리기·스플리터·CSS(min/max-height, 40%, 28vh)가 제각각 높이를 정했습니다.
//   ① 메모 높이 저장값이 CSS 최대(240px)를 넘어 "화면에 안 보이는 높이"가 쌓였습니다.
//      그래서 아래쪽 테두리를 줄이면 그 유령 높이가 먼저 깎이는 동안 할 일부터 줄었고,
//      스플리터 최소 높이 계산에도 유령 높이가 들어가 공간이 남았는데도 줄여지지 않았습니다.
//   ② 마감된 일 칸이 flex-shrink로 가장 먼저 찌그러져 통째로 사라졌고, 넘친 부분은 메모 아래를 잘랐습니다.
//   ③ 위/아래 테두리를 늦게 갱신되는 window.screenY로 판별해, 위쪽을 끌어도 메모 높이가 바뀌며 흔들렸습니다.
//   ④ 마감된 일 최대 높이가 창 높이의 비율(40%, 28vh)이라 창 높이가 바뀔 때마다 같이 출렁였습니다.
//   이제 모든 높이는 이 파일의 순수 함수만 정하고, 화면(memoLayoutController)은 결과를 그리기만 합니다.
//
// 영역
//   T = 할 일        : 남는 높이를 모두 갖습니다. 최소 TODOS_MIN_H.
//   A = 마감된 일    : 자기 내용 높이(목록은 최대 5.5줄 + 내부 스크롤). 최소 = 머리글 한 줄.
//   N = 중요한 일 메모: 사용자가 고른 높이(notesPref). 최소 = 머리글 + 글 두 줄.
//
// 규칙
//   · 붙잡기(hold) — 위쪽 테두리, 스플리터, 최대화·스냅, 프로그램이 바꾼 크기, 내용·표시 변화:
//       할 일만 늘고 줄어듭니다. 할 일이 최소에 닿으면 마감된 일 목록 → 메모 순으로 양보합니다.
//       사용자가 고른 메모 높이(notesPref)는 바꾸지 않으므로 창을 다시 키우면 메모 → 목록 → 할 일 순으로 돌아옵니다.
//   · 아래쪽 테두리(bottom) — 끌기 시작한 순간의 배치를 기준으로 계산합니다(끌던 중 되돌리면 정확히 원래대로).
//       줄일 때: 메모의 빈 곳 → 할 일의 빈 곳 → 메모 글(최소까지) → 할 일 목록(최소까지) → 마감된 일 목록
//       늘릴 때: 가려진 마감된 일 목록 → 가려진 할 일 → 가려진 메모 글 → 남는 높이는 메모
//       끌기가 끝나면 그때의 메모 높이가 새 notesPref가 됩니다.
//
// 불변식(테스트로 확인): "마감된 일이 자기 내용보다 작으면 할 일은 최소" 이고, 할 일은 가능한 한 최소 이상입니다.
//   아래쪽 끌기 결과가 이 조건을 지키므로, 끌기가 끝나 hold로 돌아가도 배치가 한 픽셀도 바뀌지 않습니다.
// ═══════════════════════════════════════════════════════════════════

/** 할 일 영역 최소 높이 (입력줄 + 두 줄 반). 5.6.3과 같은 값입니다. */
export const TODOS_MIN_H = 145;
/** 할 일과 아래 영역 사이의 끌기 손잡이 높이 */
export const SPLITTER_H = 6;
/** 새 창의 메모 높이 */
export const DEFAULT_NOTES_H = 140;
/** 5.6.3까지 메모 칸의 CSS 최소·최대 높이. 예전 저장값(notesHeight)을 "실제로 보이던 높이"로 옮길 때만 씁니다. */
export const LEGACY_NOTES_MIN_H = 140;
export const LEGACY_NOTES_MAX_H = 240;
/** 마감된 일 목록이 스크롤 없이 보여 주는 줄 수. 반 줄이 걸쳐 보여야 "더 있다"는 것이 드러납니다. */
export const ARCHIVE_LIST_ROWS = 5.5;
/** 창 크기 알림이 이만큼 없으면 끌기가 끝난 것으로 봅니다. */
export const GESTURE_IDLE_MS = 350;
/** 창 최소 높이는 화면 작업영역의 이 비율을 넘지 않습니다(어떤 계산 실수에도 창이 화면 밖으로 커지지 않게). */
export const MIN_HEIGHT_SCREEN_RATIO = 0.8;

/**
 * 한 순간의 측정값. 모든 높이는 CSS px 정수입니다.
 * @typedef {object} LayoutFrame
 * @property {number} bodyH  할 일·스플리터·마감된 일·메모가 나눠 쓸 높이
 * @property {number} todosMin
 * @property {{ min: number, natural: number } | null} archive  null = 숨김
 * @property {{ min: number } | null} notes  null = 숨김
 */

/**
 * @typedef {object} LayoutResult
 * @property {number} todos
 * @property {number} archive
 * @property {number} notes
 */

/**
 * 아래쪽 끌기를 시작한 순간의 배치와 내용 높이
 * @typedef {object} DragBase
 * @property {number} bodyH
 * @property {number} archive   그때 보이던 마감된 일 높이
 * @property {number} notes     그때 보이던 메모 높이
 * @property {number} todosFit  할 일 목록이 모두 보이는 할 일 높이
 * @property {number} notesFit  메모 글이 모두 보이는 메모 높이
 */

/** @param {number} value @param {number} lo @param {number} hi */
function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** @param {unknown} value */
function isUsableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** @param {LayoutFrame} frame */
export function splitterHeight(frame) {
  return frame.archive || frame.notes ? SPLITTER_H : 0;
}

/** 측정값을 정수로 다듬고, 최소가 자연 높이보다 크지 않게 맞춥니다. @param {LayoutFrame} frame */
function limits(frame) {
  const aMin = frame.archive ? Math.max(0, Math.round(frame.archive.min)) : 0;
  const aNat = frame.archive ? Math.max(aMin, Math.round(frame.archive.natural)) : 0;
  const nMin = frame.notes ? Math.max(0, Math.round(frame.notes.min)) : 0;
  return { S: splitterHeight(frame), tMin: Math.round(frame.todosMin), aMin, aNat, nMin };
}

/**
 * 붙잡기 배치: 할 일이 높이 변화를 모두 받고, 모자랄 때만 마감된 일 목록 → 메모 순으로 양보합니다.
 * @param {LayoutFrame} frame
 * @param {number} notesPref 사용자가 고른 메모 높이
 * @returns {LayoutResult}
 */
export function holdLayout(frame, notesPref) {
  const { S, tMin, aMin, aNat, nMin } = limits(frame);
  const bodyH = Math.round(frame.bodyH);
  const room = bodyH - S - tMin;
  const pref = isUsableNumber(notesPref) ? Math.round(notesPref) : DEFAULT_NOTES_H;
  const notesWant = frame.notes ? Math.max(nMin, pref) : 0;
  // 마감된 일 목록이 먼저 양보합니다(메모를 원하는 높이로 둔 채 남는 만큼만 차지).
  const archive = frame.archive ? clamp(room - notesWant, aMin, aNat) : 0;
  // 목록이 머리글까지 줄었는데도 모자라면 그때 메모가 양보합니다.
  const notes = frame.notes ? clamp(room - archive, nMin, notesWant) : 0;
  return { todos: bodyH - S - archive - notes, archive, notes };
}

/**
 * 아래쪽 테두리 끌기 배치. 끌기 시작 때(base)를 기준으로 지금 높이까지의 차이를 나눕니다.
 * 같은 끌기 안에서는 결과가 지금 높이에만 달려 있어, 되돌리면 정확히 원래 배치로 돌아옵니다.
 * @param {DragBase} base
 * @param {LayoutFrame} frame
 * @returns {LayoutResult}
 */
export function bottomDragLayout(base, frame) {
  const { S, tMin, aMin, aNat, nMin } = limits(frame);
  const bodyH = Math.round(frame.bodyH);
  let notes = frame.notes ? Math.round(base.notes) : 0;
  let archive = frame.archive ? clamp(Math.round(base.archive), aMin, aNat) : 0;
  let todos = Math.round(base.bodyH) - S - archive - notes;
  const delta = bodyH - Math.round(base.bodyH);
  const todosFit = Math.max(tMin, Math.round(base.todosFit));
  const notesFit = Math.max(nMin, Math.round(base.notesFit));

  if (delta < 0) {
    let need = -delta;
    /** current를 floor까지 줄일 수 있는 만큼 줄입니다. @param {number} current @param {number} floor */
    const take = (current, floor) => {
      const cut = Math.min(need, Math.max(0, current - floor));
      need -= cut;
      return current - cut;
    };
    if (frame.notes) notes = take(notes, notesFit); // ① 메모 아래 빈 곳
    todos = take(todos, todosFit);                  // ② 할 일 목록 아래 빈 곳
    if (frame.notes) notes = take(notes, nMin);     // ③ 메모 글 (메모는 스크롤)
    todos = take(todos, tMin);                      // ④ 할 일 목록 (목록은 스크롤)
    if (frame.archive) archive = take(archive, aMin); // ⑤ 마감된 일 목록 (머리글은 끝까지 남김)
    todos -= need; // 창 최소 높이보다 작아진 경우(보통은 OS 최소 크기가 먼저 막습니다)
  } else if (delta > 0) {
    let spare = delta;
    /** current를 ceil까지 채울 수 있는 만큼 채웁니다. @param {number} current @param {number} ceil */
    const give = (current, ceil) => {
      const add = Math.min(spare, Math.max(0, ceil - current));
      spare -= add;
      return current + add;
    };
    todos = give(todos, tMin);                         // 창이 최소보다 작았다면 할 일 최소부터 되찾음
    if (frame.archive) archive = give(archive, aNat); // ⑤를 되돌림: 가려진 마감된 일 목록
    todos = give(todos, todosFit);                     // ④를 되돌림: 가려진 할 일
    if (frame.notes) {
      notes = give(notes, notesFit);                   // ③을 되돌림: 가려진 메모 글
      notes += spare;                                  // 아래쪽 테두리는 메모의 테두리이므로 남는 높이는 메모
    } else {
      todos += spare;
    }
  }
  return { todos, archive, notes };
}

/**
 * 창 크기가 어느 테두리로 바뀌었는지 판별합니다. 좌표·높이는 Tauri가 알려 준 물리 px입니다.
 * 왜 window.screenY를 쓰지 않는가: WebView2는 창 위치를 따로 늦게 알려 받아, 위쪽을 끄는 동안에도
 *   screenY가 그대로인 순간이 있습니다. 그 순간을 "아래쪽 끌기"로 오판해 메모가 흔들렸습니다.
 * @param {{ y: number | null, height: number | null } | null | undefined} start 끌기 시작 전 위치·높이
 * @param {{ y: number | null, height: number | null } | null | undefined} now
 * @param {number} [tolerance]
 * @returns {'none' | 'bottom' | 'top' | 'other'}
 */
export function classifyResize(start, now, tolerance = 2) {
  if (!start || !now || !isUsableNumber(start.y) || !isUsableNumber(start.height)
    || !isUsableNumber(now.y) || !isUsableNumber(now.height)) return 'other';
  const sy = /** @type {number} */ (start.y), sh = /** @type {number} */ (start.height);
  const ny = /** @type {number} */ (now.y), nh = /** @type {number} */ (now.height);
  if (Math.abs(nh - sh) <= tolerance) return 'none';
  if (Math.abs(ny - sy) <= tolerance) return 'bottom';           // 위쪽이 그대로 → 아래쪽(또는 아래 모서리) 끌기
  if (Math.abs(ny + nh - (sy + sh)) <= tolerance) return 'top';  // 아래쪽이 그대로 → 위쪽 끌기
  return 'other'; // 최대화·스냅처럼 위아래가 함께 바뀜
}

/** 창 크기 변경 첫 알림이 이만큼(CSS px) 넘게 한 번에 바뀌면 끌기가 아니라 최대화·복원·스냅으로 봅니다. */
export const INSTANT_RESIZE_JUMP = 160;

/**
 * 크기 변경의 "첫 알림"이 한 번에 크게 뛰었는지. 손으로 끄는 테두리는 처음에 조금씩 움직이지만,
 * 최대화·복원·스냅은 한 번에 목표 크기로 바뀝니다.
 * 왜 필요한가: 화면 맨 위에 붙은 창을 최대화하면 위쪽 좌표가 그대로라 "아래쪽 끌기"처럼 보이고,
 *   그대로 두면 최대화할 때마다 메모 높이가 바뀌어 저장됐습니다.
 * @param {number | null} startHeight 물리 px
 * @param {number} nowHeight 물리 px
 * @param {number} scale 화면 배율(devicePixelRatio)
 */
export function isInstantResize(startHeight, nowHeight, scale) {
  if (!isUsableNumber(startHeight) || !isUsableNumber(nowHeight)) return false;
  const factor = isUsableNumber(scale) && scale > 0 ? scale : 1;
  return Math.abs(nowHeight - /** @type {number} */ (startHeight)) / factor > INSTANT_RESIZE_JUMP;
}

/**
 * 창 최소 높이: 고정 머리(제목줄·툴바) + 각 영역의 최소.
 * 편집 모드 띠·업데이트 알림처럼 잠깐 생기는 띠는 넣지 않습니다(띠가 생길 때마다 창이 커지지 않게).
 * @param {{ fixedChromeH: number, frame: LayoutFrame, workAreaH: number }} input
 */
export function minWindowHeight({ fixedChromeH, frame, workAreaH }) {
  const { S, tMin, aMin, nMin } = limits(frame);
  const chrome = Math.max(0, Math.ceil(fixedChromeH));
  const want = chrome + tMin + S + aMin + nMin;
  const cap = Math.max(chrome + tMin, Math.floor(workAreaH * MIN_HEIGHT_SCREEN_RATIO));
  return Math.min(want, cap);
}

/**
 * 사용자가 고른 메모 높이를 정합니다.
 * notesPaneHeight(5.6.4~)가 있으면 그대로, 없으면 예전 notesHeight를 "실제로 보이던 높이"(140~240)로 옮깁니다.
 * 왜: 예전 notesHeight에는 CSS 최대 240px에 가려 보이지 않던 값(예: 500)이 섞여 있어,
 *     그대로 쓰면 업데이트 직후 메모 칸이 갑자기 커집니다.
 * @param {unknown} paneHeight
 * @param {unknown} legacyNotesHeight
 */
export function resolveNotesPreference(paneHeight, legacyNotesHeight) {
  if (isUsableNumber(paneHeight) && /** @type {number} */ (paneHeight) > 0) {
    return Math.round(/** @type {number} */ (paneHeight));
  }
  const legacy = isUsableNumber(legacyNotesHeight) ? /** @type {number} */ (legacyNotesHeight) : DEFAULT_NOTES_H;
  return Math.round(clamp(legacy, LEGACY_NOTES_MIN_H, LEGACY_NOTES_MAX_H));
}

/**
 * 스플리터를 끄는 동안의 창 높이. 스플리터는 할 일 높이만 바꾸고 창이 그만큼 아래로 늘고 줄어듭니다.
 * 할 일은 최소 아래로 줄지 않고(이미 최소보다 작으면 더 줄이지 않음), 창은 화면 높이를 넘지 않습니다.
 * @param {{ startWindowH: number, startTodosH: number, todosMin: number, pointerDelta: number, maxWindowH: number }} input
 */
export function splitterWindowHeight({ startWindowH, startTodosH, todosMin, pointerDelta, maxWindowH }) {
  const delta = Math.max(Math.min(0, todosMin - startTodosH), pointerDelta);
  const cap = Math.max(startWindowH, maxWindowH);
  return Math.round(Math.min(cap, startWindowH + delta));
}
