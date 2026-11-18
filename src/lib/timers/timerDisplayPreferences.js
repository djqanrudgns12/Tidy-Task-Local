// 4종 타이머가 공통으로 쓰는 화면 표시·글자 크기·위젯 위치 설정의 기본값과 검증입니다.
// Rust(src-tauri/src/toolkit.rs의 timerDisplay 검증)와 같은 규칙을 지켜야 저장이 거부되지 않습니다.

export const TITLE_SCALE_MIN = 80;
export const TITLE_SCALE_MAX = 160;
export const TITLE_SCALE_PRESETS = [85, 100, 115, 135];

export const NOTE_SCALE_MIN = 80;
export const NOTE_SCALE_MAX = 180;
export const NOTE_SCALE_PRESETS = [85, 100, 120, 145];

export const WIDGET_MIN_WIDTH = 200;
export const WIDGET_MAX_WIDTH = 1600;
export const WIDGET_MIN_HEIGHT = 116;
export const WIDGET_MAX_HEIGHT = 1200;

export const NOTE_ALIGNS = /** @type {const} */ (['auto', 'center', 'left']);
export const LAYOUT_FOCUSES = /** @type {const} */ (['balanced', 'note', 'timer']);

const WIDGET_BOUNDS_KEYS = /** @type {const} */ ([
  'physicalX',
  'physicalY',
  'logicalX',
  'logicalY',
  'width',
  'height',
]);

/**
 * @typedef {{ physicalX: number, physicalY: number, logicalX: number, logicalY: number, width: number, height: number }} TimerWidgetBounds
 * @typedef {{
 *   titleScale: number,
 *   noteScale: number,
 *   noteAlign: 'auto' | 'center' | 'left',
 *   layoutFocus: 'balanced' | 'note' | 'timer',
 *   widgetBounds: TimerWidgetBounds | null
 * }} TimerDisplayPreferences
 */

/** @returns {TimerDisplayPreferences} */
export function defaultTimerDisplayPreferences() {
  return {
    titleScale: 100,
    noteScale: 100,
    noteAlign: 'auto',
    layoutFocus: 'balanced',
    widgetBounds: null,
  };
}

/**
 * 위젯 위치·크기 값이 다중 모니터 저장 규칙에 맞는지 확인합니다.
 * 왜 최소화 좌표(-32000)를 막는가: 최소화된 창의 좌표를 저장하면 다음 위젯 전환 때 창이 화면 밖에 뜹니다.
 * @param {unknown} value
 * @returns {value is TimerWidgetBounds | null}
 */
export function isValidWidgetBounds(value) {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(record);
  if (keys.length !== WIDGET_BOUNDS_KEYS.length) return false;
  if (!WIDGET_BOUNDS_KEYS.every((key) => Object.hasOwn(record, key))) return false;
  for (const coordKey of ['physicalX', 'physicalY', 'logicalX', 'logicalY']) {
    const coord = record[coordKey];
    if (typeof coord !== 'number' || !Number.isFinite(coord) || coord <= -10000 || coord >= 100000) {
      return false;
    }
  }
  const width = record.width;
  const height = record.height;
  if (typeof width !== 'number' || !Number.isFinite(width) || width < WIDGET_MIN_WIDTH || width > WIDGET_MAX_WIDTH) {
    return false;
  }
  if (typeof height !== 'number' || !Number.isFinite(height) || height < WIDGET_MIN_HEIGHT || height > WIDGET_MAX_HEIGHT) {
    return false;
  }
  return true;
}

/**
 * 한 항목이 저장 규칙에 맞는지 확인합니다.
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidTimerDisplayField(key, value) {
  if (key === 'titleScale') {
    return typeof value === 'number' && Number.isInteger(value) && value >= TITLE_SCALE_MIN && value <= TITLE_SCALE_MAX;
  }
  if (key === 'noteScale') {
    return typeof value === 'number' && Number.isInteger(value) && value >= NOTE_SCALE_MIN && value <= NOTE_SCALE_MAX;
  }
  if (key === 'noteAlign') {
    return value === 'auto' || value === 'center' || value === 'left';
  }
  if (key === 'layoutFocus') {
    return value === 'balanced' || value === 'note' || value === 'timer';
  }
  if (key === 'widgetBounds') {
    return isValidWidgetBounds(value);
  }
  return false;
}

/**
 * 저장된 값을 읽을 때 잘못된 항목만 기본값으로 두고 유효한 값은 그대로 살립니다(원본은 고치지 않음).
 * @param {any} [input]
 * @returns {TimerDisplayPreferences}
 */
export function normalizeTimerDisplayPreferences(input = {}) {
  const result = defaultTimerDisplayPreferences();
  for (const key of /** @type {(keyof TimerDisplayPreferences)[]} */ (Object.keys(result))) {
    const value = input?.[key];
    if (isValidTimerDisplayField(key, value)) {
      if (key === 'widgetBounds' && value && typeof value === 'object') {
        result.widgetBounds = { ...value };
      } else {
        Object.assign(result, { [key]: value });
      }
    }
  }
  return result;
}
