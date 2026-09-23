// 시계 설정의 기본값과 검증. 툴킷 설정 파일(tidy-task-toolkit.json)의 preferences.clock에 저장됩니다.
// Rust(src-tauri/src/toolkit.rs의 clock 검증)와 같은 규칙을 지켜야 저장이 거부되지 않습니다.

/** 제목 최대 글자 수(유니코드 코드포인트 기준 — Rust의 chars().count()와 같게 셉니다). */
export const CLOCK_TITLE_MAX = 30;

/** @typedef {{face:'digital'|'analog', showSeconds:boolean, hour12:boolean, title:string, titleHidden:boolean, standardTimeSync:boolean, analogCaption:boolean, analogMinuteNumbers:boolean}} ClockPreferences */

/** @returns {ClockPreferences} */
export function defaultClockPreferences() {
  return {
    face: 'digital',
    showSeconds: true,
    hour12: true,
    title: '',
    titleHidden: false,
    // 틀린 PC 시각도 바로잡도록 처음부터 켭니다. 실패하면 PC 시각으로 조용히 돌아갑니다.
    standardTimeSync: true,
    analogCaption: true,
    analogMinuteNumbers: false,
  };
}

const BOOLEAN_KEYS = /** @type {const} */ ([
  'showSeconds',
  'hour12',
  'titleHidden',
  'standardTimeSync',
  'analogCaption',
  'analogMinuteNumbers',
]);

// 제어 문자(줄바꿈·탭 포함). Rust char::is_control과 같은 범위입니다.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** 입력을 저장할 수 있는 제목으로 다듬습니다(제어 문자 제거, 30자까지).
 * @param {unknown} value */
export function sanitizeTitle(value) {
  const text = String(value ?? '').replace(CONTROL, '');
  const chars = [...text];
  return chars.length > CLOCK_TITLE_MAX ? chars.slice(0, CLOCK_TITLE_MAX).join('') : text;
}

/** 저장해도 되는 제목인지(다듬지 않고) 확인합니다.
 * @param {unknown} value */
export function isValidTitle(value) {
  return typeof value === 'string' && [...value].length <= CLOCK_TITLE_MAX && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

/** 한 항목이 저장 규칙에 맞는지.
 * @param {string} key @param {unknown} value */
export function isValidClockField(key, value) {
  if (key === 'face') return value === 'digital' || value === 'analog';
  if (key === 'title') return isValidTitle(value);
  if (/** @type {readonly string[]} */ (BOOLEAN_KEYS).includes(key)) return typeof value === 'boolean';
  return false;
}

/** 저장된 값을 읽을 때: 알 수 없거나 잘못된 항목은 기본값으로 둡니다(원본 파일은 고치지 않음).
 * @param {any} [input]
 * @returns {ClockPreferences} */
export function normalizeClockPreferences(input = {}) {
  const result = defaultClockPreferences();
  for (const key of /** @type {(keyof ClockPreferences)[]} */ (Object.keys(result))) {
    const value = input?.[key];
    if (isValidClockField(key, value)) Object.assign(result, { [key]: value });
  }
  return result;
}
