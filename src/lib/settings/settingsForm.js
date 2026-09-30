// ═══════════════════════════════════════════════════════════════════
// [설정 창의 값 묶음] 설정 창이 다루는 값의 기본값·읽기·바뀜 판정·적용 요청 모양을 한곳에 둡니다.
//
// 왜 컴포넌트 밖에 두는가:
//   "설정 초기화"의 기본값, 화면에 처음 채우는 값, [반영]이 보내는 값이 서로 다른 곳에 적혀 있으면
//   항목을 하나 추가할 때 한 곳을 빠뜨리기 쉽습니다. (실제로 '전체 무음'은 창을 열 때 보내는 값에서 빠져 있어
//   설정 창을 열고 [반영]만 눌러도 무음이 풀렸습니다.)
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_FONT = '메이플스토리 L';

// 슬라이더 범위 (pt)
export const FONT_SIZE_RANGE = Object.freeze({ min: 6, max: 14 });
export const UI_FONT_SIZE_RANGE = Object.freeze({ min: 6, max: 15 });

/**
 * @typedef {{
 *   themeColor: string, isDarkMode: boolean, headerDesign: 'classic' | 'modern',
 *   fontFamily: string, fontSize: number, uiFontFamily: string, uiFontSize: number,
 *   showArchived: boolean, showNotes: boolean, showReminders: boolean, globalMuteSound: boolean,
 * }} SettingsForm
 */

/** "설정 초기화"가 되돌리는 처음 상태. (windowDataCodec.js의 복원 기본값과 같은 값)
 * @type {Readonly<SettingsForm>} */
export const SETTINGS_DEFAULTS = Object.freeze({
  themeColor: 'amber',
  isDarkMode: false,
  headerDesign: 'classic',
  fontFamily: DEFAULT_FONT,
  fontSize: 10,
  uiFontFamily: DEFAULT_FONT,
  uiFontSize: 10,
  showArchived: true,
  showNotes: true,
  showReminders: true,
  globalMuteSound: false,
});

// [반영]을 눌러야 적용되는 항목. 상단 디자인은 고르는 즉시 적용되므로 "바뀜" 판정에서 뺍니다.
const APPLY_FIELDS = /** @type {const} */ ([
  'themeColor', 'isDarkMode', 'fontFamily', 'fontSize', 'uiFontFamily', 'uiFontSize',
  'showArchived', 'showNotes', 'showReminders', 'globalMuteSound',
]);

// 슬라이더 범위 밖의 저장값(옛 버전에서 넘어온 값)도 그대로 둡니다.
// 왜: 여기서 범위 안으로 고치면 설정 창을 열고 [반영]만 눌러도 사용자의 글자 크기가 조용히 바뀝니다.
/** @param {unknown} value @param {number} fallback */
function fontSizeOf(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** @param {unknown} value @param {boolean} fallback */
function flag(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/** @param {unknown} value @param {string} fallback */
function text(value, fallback) {
  return typeof value === 'string' && value ? value : fallback;
}

/**
 * 메모 창이 보낸 값(또는 설정 창의 appState)을 설정 창의 값 묶음으로 바꿉니다.
 * 빠진 값은 fallback → 기본값 순으로 채웁니다.
 * @param {Record<string, any> | null | undefined} source
 * @param {Partial<SettingsForm>} [fallback]
 * @returns {SettingsForm}
 */
export function readSettingsForm(source, fallback = {}) {
  const from = source || {};
  const base = { ...SETTINGS_DEFAULTS, ...fallback };
  return {
    themeColor: text(from.themeColor, base.themeColor),
    isDarkMode: flag(from.isDarkMode, base.isDarkMode),
    headerDesign: (from.headerDesign ?? base.headerDesign) === 'modern' ? 'modern' : 'classic',
    fontFamily: text(from.fontFamily, base.fontFamily),
    fontSize: fontSizeOf(from.fontSize, base.fontSize),
    uiFontFamily: text(from.uiFontFamily, base.uiFontFamily),
    uiFontSize: fontSizeOf(from.uiFontSize, base.uiFontSize),
    showArchived: flag(from.showArchived, base.showArchived),
    showNotes: flag(from.showNotes, base.showNotes),
    showReminders: flag(from.showReminders, base.showReminders),
    globalMuteSound: flag(from.globalMuteSound, base.globalMuteSound),
  };
}

/** [반영]을 눌러야 적용되는 항목 가운데 바뀐 것의 이름.
 * @param {SettingsForm} current @param {SettingsForm} initial @returns {(typeof APPLY_FIELDS)[number][]} */
export function changedFields(current, initial) {
  return APPLY_FIELDS.filter((name) => current[name] !== initial[name]);
}

/**
 * 메모 창에 보내는 'req-apply-settings' 내용. (받는 쪽: App.svelte)
 * 메모 글꼴은 받는 쪽이 `globalFont`라는 이름으로 읽습니다 — 글꼴이 바뀌었을 때만 본문 전체의 글꼴을 바꾸기 때문입니다.
 * @param {SettingsForm} form @param {string} targetWindow
 */
export function toApplyPayload(form, targetWindow) {
  return {
    targetWindow,
    fontSize: form.fontSize,
    uiFontSize: form.uiFontSize,
    headerDesign: form.headerDesign,
    themeColor: form.themeColor,
    uiFontFamily: form.uiFontFamily,
    isDarkMode: form.isDarkMode,
    globalFont: form.fontFamily,
    showArchived: form.showArchived,
    showNotes: form.showNotes,
    showReminders: form.showReminders,
    globalMuteSound: form.globalMuteSound,
  };
}

/**
 * 메모 창이 설정 창을 열 때 보내는 "지금의 설정". 되돌리기 스냅샷에는 없는 값(상단 디자인·전체 무음)을 덧붙입니다.
 * @param {{ takeSnapshot: () => Record<string, any>, headerDesign: string, globalMuteSound: boolean }} state
 */
export function settingsSnapshotFor(state) {
  return { ...state.takeSnapshot(), headerDesign: state.headerDesign, globalMuteSound: state.globalMuteSound };
}

/** 모든 데이터 창이 앱 전체 설정을 함께 받아야, 다음 저장이나 매니저 승계 때 옛 값으로 돌아가지 않습니다.
 * 창별 모양·글자는 이 함수에서 건드리지 않습니다.
 * @param {{ showReminders: boolean, globalMuteSound: boolean }} state
 * @param {{ showReminders?: boolean, globalMuteSound?: boolean }} payload */
export function applySharedSettings(state, payload) {
  let changed = false;
  for (const key of /** @type {const} */ (['showReminders', 'globalMuteSound'])) {
    const value = payload[key];
    if (typeof value === 'boolean' && state[key] !== value) {
      state[key] = value;
      changed = true;
    }
  }
  return changed;
}

// ── 설정 창의 묶음(탭) ────────────────────────────────────────────
/** @typedef {'look' | 'text' | 'behavior' | 'manage'} SettingsTabId */
/** @type {ReadonlyArray<{ id: SettingsTabId, label: string }>} */
export const SETTINGS_TABS = Object.freeze([
  { id: 'look', label: '모양' },
  { id: 'text', label: '글자' },
  { id: 'behavior', label: '동작' },
  { id: 'manage', label: '관리' },
]);

// [반영] 전 변경이 어느 탭에 있는지 (탭 이름 옆에 점으로 알려 줍니다)
/** @type {Readonly<Record<(typeof APPLY_FIELDS)[number], SettingsTabId>>} */
export const FIELD_TABS = Object.freeze({
  themeColor: 'look',
  isDarkMode: 'look',
  showArchived: 'look',
  showNotes: 'look',
  fontFamily: 'text',
  fontSize: 'text',
  uiFontFamily: 'text',
  uiFontSize: 'text',
  showReminders: 'behavior',
  globalMuteSound: 'behavior',
});

/** 탭 줄에서 방향키·Home·End로 옮겨 갈 탭. (양 끝에서는 반대쪽으로 넘어갑니다)
 * @param {SettingsTabId} current @param {string} key @returns {SettingsTabId | null} 옮기지 않는 키면 null */
export function nextTab(current, key) {
  const index = SETTINGS_TABS.findIndex((tab) => tab.id === current);
  const last = SETTINGS_TABS.length - 1;
  if (index < 0) return null;
  if (key === 'ArrowRight') return SETTINGS_TABS[index === last ? 0 : index + 1].id;
  if (key === 'ArrowLeft') return SETTINGS_TABS[index === 0 ? last : index - 1].id;
  if (key === 'Home') return SETTINGS_TABS[0].id;
  if (key === 'End') return SETTINGS_TABS[last].id;
  return null;
}

// ── 설정 창 크기 ──────────────────────────────────────────────────
// 기본 글자 크기에서 첫 탭이 스크롤 없이 들어가는 크기(논리 px)입니다.
export const SETTINGS_WINDOW = Object.freeze({ width: 360, height: 560, minHeight: 400, margin: 24 });

/**
 * 설정 창 크기. 화면(작업 표시줄을 뺀 높이)이 낮으면 그 안에 들어가도록 높이를 줄입니다.
 * 왜: 이 창은 크기를 바꿀 수 없어, 작은 노트북·높은 배율 화면에서 창이 화면보다 크면
 *   아래쪽 [취소 · 반영] 버튼이 화면 밖으로 나가 누를 수 없습니다. (본문은 스크롤되므로 줄여도 됩니다)
 * @param {number[]} workAreaHeights 연결된 모니터들의 작업영역 높이(논리 px). 비어 있으면 기본 크기.
 */
export function settingsWindowSize(workAreaHeights = []) {
  const heights = workAreaHeights.filter((h) => Number.isFinite(h) && h > 0);
  // 어느 모니터에 뜰지 미리 알 수 없으므로 가장 낮은 화면에 맞춥니다.
  const room = heights.length ? Math.min(...heights) - SETTINGS_WINDOW.margin : SETTINGS_WINDOW.height;
  const height = Math.round(Math.min(SETTINGS_WINDOW.height, Math.max(SETTINGS_WINDOW.minHeight, room)));
  return { width: SETTINGS_WINDOW.width, height };
}

// ── 데이터 초기화의 두 번 확인 ─────────────────────────────────────
// 두 번째 경고 창의 [모두 지우기]는 이 시간이 지나야 눌립니다.
// 왜: 첫 번째 [계속]과 같은 자리에 버튼이 나타나므로, 빠르게 두 번 누르면 읽지도 않고 지나가 버립니다.
export const WIPE_ARM_MS = 3000;

/** [모두 지우기]가 눌릴 때까지 남은 초(올림). 0이면 누를 수 있습니다.
 * @param {number} openedAt 두 번째 경고 창이 뜬 시각 @param {number} now */
export function wipeArmSecondsLeft(openedAt, now) {
  return Math.max(0, Math.ceil((openedAt + WIPE_ARM_MS - now) / 1000));
}
