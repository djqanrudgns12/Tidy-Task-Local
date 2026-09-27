import { TOOLKIT_THEMES } from './themes.js';
import { defaultClockPreferences, normalizeClockPreferences, isValidClockField } from '../clock/clockPreferences.js';
import { DEFAULT_SOUNDS, SOUND_KEYS, isSoundId } from '../timers/soundLibrary.js';
/** @typedef {{tickEnabled:boolean,tickSound?:string,warningEnabled?:boolean,warningSound?:string,endEnabled?:boolean,endSound?:string,warningLeadSeconds?:number,warningDurationSeconds?:number|null,dialRangeMinutes?:number,showRemainingTime?:boolean}} Preferences
 * tickSound·warningSound·endSound: 고른 소리 id(목록: src/lib/timers/soundLibrary.js). 스톱워치는 tickSound만 있습니다. */
/** @typedef {{schemaVersion:number,revision:number,toolkit:{theme:string,darkMode:boolean,uiFontFamily:string,enabled:boolean,externalToolsEnabled:boolean,orientation:string,toolbarSize:number,alwaysOnTop:boolean,collapsed:boolean,visibleToolIds:string[],toolOrderIds:string[],hiddenPlatformIds:string[],position:Record<string,number>|null},preferences:Record<string,Preferences>}} Settings
 * preferences.clock은 타이머와 모양이 다른 시계 설정(clockPreferences.js)입니다. 읽을 때는 normalizeClockPreferences를 거칩니다. */
export const TOOLBAR_SIZES = [
  { label: '매우 작게', scale: 0.9 },
  { label: '작게', scale: 0.95 },
  { label: '보통', scale: 1 },
  { label: '크게', scale: 1.05 },
  { label: '매우 크게', scale: 1.1 },
];
export const TIMER_KINDS = ['digital', 'analog', 'hourglass', 'stopwatch'];
// 툴킷 UI 글꼴은 Tidy Task(메모) 글꼴과 따로 저장합니다. 목록만 Tidy Task의 내장·등록 글꼴을 빌려 씁니다.
export const DEFAULT_UI_FONT = '메이플스토리 L';
export const UI_FONT_NAME_MAX = 60;
/** 글꼴 이름으로 저장할 수 있는 값인가. Rust toolkit.rs의 uiFontFamily 규칙과 같아야 합니다(길이는 코드포인트 기준).
 * 왜 목록과 대조하지 않는가: 등록 글꼴 목록은 Tidy Task 저장소에 있어 여기서 알 수 없고,
 * 나중에 글꼴이 지워져도 설정은 남겨 두고 화면만 기본 글꼴로 대신 그리면 됩니다.
 * @param {unknown} value */
export function isValidUiFontName(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const chars = [...value];
  return chars.length <= UI_FONT_NAME_MAX && !chars.some((ch) => /[\u0000-\u001f\u007f-\u009f]/.test(ch));
}
// 툴바에 보일 수 있는 도구 id. Rust toolkit.rs의 TOOL_IDS와 같아야 합니다.
export const TOOL_IDS = ['timer', 'clock', 'picker', 'noticeboard', 'tournament', 'focus-bell', 'dice', 'scoreboard', 'thermometer', 'vote', 'seating', 'roster'];
// 외부 툴은 툴바에서 하나의 버튼이므로 순서 목록에서도 하나의 항목입니다.
export const DEFAULT_VISIBLE_TOOL_IDS = ['timer', 'picker', 'noticeboard', 'vote', 'seating', 'roster'];
export const DEFAULT_TOOL_ORDER = [...DEFAULT_VISIBLE_TOOL_IDS, 'external', 'focus-bell', 'clock', 'scoreboard', 'dice', 'thermometer', 'tournament'];
const LEGACY_TOOL_ORDER = [...TOOL_IDS.slice(0, -1), 'external', 'roster'];
/** @param {unknown} ids */
export function normalizeToolOrder(ids) {
  const known = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && DEFAULT_TOOL_ORDER.includes(id)) : [];
  return [...new Set([...known, ...DEFAULT_TOOL_ORDER])];
}
/** @param {Settings['toolkit']} toolkit @param {string} id */
export function isToolEnabled(toolkit, id) {
  return id === 'external' ? toolkit.externalToolsEnabled : toolkit.visibleToolIds.includes(id);
}
/** 활성화 도구를 앞에, 비활성화 도구를 뒤에 모으고 각 영역 안의 순서는 유지합니다.
 * @param {unknown} ids @param {Settings['toolkit']} toolkit */
export function groupToolOrder(ids, toolkit) {
  const order = normalizeToolOrder(ids);
  return [...order.filter((id) => isToolEnabled(toolkit, id)), ...order.filter((id) => !isToolEnabled(toolkit, id))];
}
/** 전환한 도구만 새 영역의 맨 아래로 옮깁니다.
 * @param {Settings['toolkit']} before @param {Settings['toolkit']} after */
function orderAfterVisibilityChange(before, after) {
  const changed = before.toolOrderIds.filter((id) => isToolEnabled(before, id) !== isToolEnabled(after, id));
  return groupToolOrder([...before.toolOrderIds.filter((id) => !changed.includes(id)), ...changed], after);
}
/** @type {Record<string,string>} */
export const TIMER_NAMES = {
  digital: '전광판 타이머',
  analog: '아날로그 타이머',
  hourglass: '모래시계',
  stopwatch: '스톱워치',
};
// 분 단위입니다. 0.5분은 빠른 설정에서 30초로 표시합니다.
export const PRESETS = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 40];
export const WARNING_LEADS = [5, 10, 20, 30, 40, 50, 60, 90, 120];
export const WARNING_DURATIONS = [null, 2, 5, 10, 20];
/** 설정 키 → 소리 역할(tickSound → tick). */
const SOUND_ROLE_BY_KEY = /** @type {Record<string, import('../timers/soundLibrary.js').SoundRole>} */ (
  Object.fromEntries(Object.entries(SOUND_KEYS).map(([role, key]) => [key, role]))
);
/** @param {string} kind @returns {Preferences} */
export function defaultPreferences(kind) {
  if (!TIMER_KINDS.includes(kind)) throw new Error('알 수 없는 타이머입니다.');
  // 소리 기본값은 타이머마다 예전부터 울리던 소리입니다. 업데이트 뒤에도 사용자가 고르기 전에는 소리가 바뀌지 않습니다.
  // Rust toolkit.rs의 defaults()와 같아야 합니다.
  const sounds = /** @type {Record<string,string>} */ (DEFAULT_SOUNDS[kind]);
  if (kind === 'stopwatch') return { tickEnabled: true, tickSound: sounds.tick };
  return {
    tickEnabled: true,
    tickSound: sounds.tick,
    warningEnabled: true,
    warningSound: sounds.warning,
    endEnabled: true,
    endSound: sounds.end,
    warningLeadSeconds: 5,
    warningDurationSeconds: null,
    ...(kind === 'analog' ? { dialRangeMinutes: 60 } : {}),
    ...(kind === 'hourglass' ? { showRemainingTime: true } : {}),
  };
}
/** @returns {Settings} */
export function defaults() {
  return {
    schemaVersion: 12,
    revision: 0,
    toolkit: {
      // 처음 설정에서 사용 여부를 고르기 전에는 조용히 대기합니다.
      enabled: false,
      theme: 'sage',
      darkMode: false,
      uiFontFamily: DEFAULT_UI_FONT,
      orientation: 'horizontal',
      toolbarSize: 2,
      // 툴바를 다른 창보다 늘 위에 둘지(맨 앞으로) 여부. 예전 동작이 항상 위였으므로 기본은 true입니다.
      alwaysOnTop: true,
      collapsed: false,
      visibleToolIds: [...DEFAULT_VISIBLE_TOOL_IDS],
      toolOrderIds: [...DEFAULT_TOOL_ORDER],
      hiddenPlatformIds: [],
      externalToolsEnabled: true,
      position: null,
    },
    preferences: {
      ...Object.fromEntries(TIMER_KINDS.map((kind) => [kind, defaultPreferences(kind)])),
      clock: /** @type {any} */ (defaultClockPreferences()),
    },
  };
}
/** @param {string} kind @param {any} [input] @returns {Preferences} */
export function normalizePreferences(kind, input = {}) {
  const result = defaultPreferences(kind);
  for (const key of /** @type {(keyof Preferences)[]} */ (Object.keys(result))) {
    const value = input?.[key];
    if (typeof result[key] === 'boolean' && typeof value === 'boolean')
      Object.assign(result, { [key]: value });
    if (key === 'warningLeadSeconds' && WARNING_LEADS.includes(value))
      Object.assign(result, { [key]: value });
    if (key === 'warningDurationSeconds' && WARNING_DURATIONS.includes(value))
      Object.assign(result, { [key]: value });
    if (key === 'dialRangeMinutes' && [30, 60].includes(value))
      Object.assign(result, { [key]: value });
    // 소리 id는 그 역할(시계음·경고음·종료음) 목록에 있을 때만 받습니다. 다른 역할의 id나 모르는 값은 기본 소리로 둡니다.
    const role = SOUND_ROLE_BY_KEY[key];
    if (role && isSoundId(role, value)) Object.assign(result, { [key]: value });
  }
  return result;
}
/** @param {any} input @returns {Settings} */
export function normalizeSettings(input) {
  if (input?.schemaVersion != null && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(input.schemaVersion))
    throw new Error('더 최신 버전의 툴킷 설정입니다.');
  const out = defaults();
  out.revision = Number.isSafeInteger(input?.revision) ? input.revision : 0;
  for (const key of /** @type {const} */ (['enabled', 'collapsed', 'externalToolsEnabled', 'darkMode', 'alwaysOnTop']))
    if (typeof input?.toolkit?.[key] === 'boolean') out.toolkit[key] = input.toolkit[key];
  if (TOOLKIT_THEMES.some(t => t.id === input?.toolkit?.theme)) out.toolkit.theme = input.toolkit.theme;
  if (isValidUiFontName(input?.toolkit?.uiFontFamily)) out.toolkit.uiFontFamily = input.toolkit.uiFontFamily;
  if (['horizontal', 'vertical'].includes(input?.toolkit?.orientation))
    out.toolkit.orientation = input.toolkit.orientation;
  if (Number.isInteger(input?.toolkit?.toolbarSize) && input.toolkit.toolbarSize >= 0 && input.toolkit.toolbarSize < TOOLBAR_SIZES.length)
    out.toolkit.toolbarSize = input.toolkit.toolbarSize;
  if (Array.isArray(input?.toolkit?.visibleToolIds))
    // 같은 도구가 두 번 들어가면 버튼이 두 번 그려지므로 첫 번째만 남깁니다(Rust toolkit.rs는 저장을 거부).
    out.toolkit.visibleToolIds = [...new Set(input.toolkit.visibleToolIds.filter(
      /** @param {unknown} id */ (id) => typeof id === 'string' && TOOL_IDS.includes(id),
    ))];
  out.toolkit.toolOrderIds = normalizeToolOrder(input?.toolkit?.toolOrderIds);
  if (Array.isArray(input?.toolkit?.hiddenPlatformIds))
    out.toolkit.hiddenPlatformIds = [...new Set(input.toolkit.hiddenPlatformIds.filter(
      /** @param {unknown} id */ (id) => id === 'clanner' || id === 'rollinthunder',
    ))];
  if (input?.schemaVersion === 1 && !out.toolkit.visibleToolIds.includes('roster')) out.toolkit.visibleToolIds.push('roster');
  if ([1, 2].includes(input?.schemaVersion) && !out.toolkit.visibleToolIds.includes('noticeboard')) out.toolkit.visibleToolIds.push('noticeboard');
  if ([1, 2, 3].includes(input?.schemaVersion) && !out.toolkit.visibleToolIds.includes('picker')) out.toolkit.visibleToolIds.push('picker');
  if ([1, 2, 3, 4].includes(input?.schemaVersion) && !out.toolkit.visibleToolIds.includes('tournament')) out.toolkit.visibleToolIds.push('tournament');
  if ([1, 2, 3, 4, 5].includes(input?.schemaVersion) && !out.toolkit.visibleToolIds.includes('focus-bell')) out.toolkit.visibleToolIds.push('focus-bell');
  // 스키마 7에서 주사위가 새로 생겼습니다. 이전 설정에는 한 번만 보이게 넣고, 이후 사용자가 숨기면 그대로 둡니다.
  if ([1, 2, 3, 4, 5, 6].includes(input?.schemaVersion) && !out.toolkit.visibleToolIds.includes('dice')) out.toolkit.visibleToolIds.push('dice');
  // 스키마 8에서 시계가 새로 생겼습니다. 규칙은 주사위와 같습니다(Rust toolkit.rs와 같은 규칙).
  if ([1, 2, 3, 4, 5, 6, 7].includes(input?.schemaVersion) && !out.toolkit.visibleToolIds.includes('clock')) out.toolkit.visibleToolIds.push('clock');
  // 스키마 9에서 점수판·학급 온도계가 새로 생겼습니다. 규칙은 주사위와 같습니다(Rust toolkit.rs와 같은 규칙).
  if ([1, 2, 3, 4, 5, 6, 7, 8].includes(input?.schemaVersion))
    for (const id of ['scoreboard', 'thermometer']) if (!out.toolkit.visibleToolIds.includes(id)) out.toolkit.visibleToolIds.push(id);
  // 스키마 10에서 학급 투표가 새로 생겼습니다. 규칙은 주사위와 같습니다(Rust toolkit.rs와 같은 규칙).
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9].includes(input?.schemaVersion) && !out.toolkit.visibleToolIds.includes('vote')) out.toolkit.visibleToolIds.push('vote');
  if (input?.schemaVersion <= 10 && !out.toolkit.visibleToolIds.includes('seating')) out.toolkit.visibleToolIds.push('seating');
  // 이전 기본값 그대로인 항목만 바꿉니다. 선생님이 숨기거나 재정렬한 설정은 유지합니다.
  if (input?.schemaVersion <= 11) {
    if (out.toolkit.visibleToolIds.length === TOOL_IDS.length)
      out.toolkit.visibleToolIds = [...DEFAULT_VISIBLE_TOOL_IDS];
    const order = input?.toolkit?.toolOrderIds;
    if (Array.isArray(order) && order.length === LEGACY_TOOL_ORDER.length && order.every((id, index) => id === LEGACY_TOOL_ORDER[index]))
      out.toolkit.toolOrderIds = [...DEFAULT_TOOL_ORDER];
  }
  out.toolkit.toolOrderIds = groupToolOrder(out.toolkit.toolOrderIds, out.toolkit);
  if (input?.toolkit?.position) out.toolkit.position = input.toolkit.position;
  for (const kind of TIMER_KINDS)
    out.preferences[kind] = normalizePreferences(kind, input?.preferences?.[kind]);
  out.preferences.clock = /** @type {any} */ (normalizeClockPreferences(input?.preferences?.clock));
  return out;
}
/** @param {Settings} input @param {string} scope @param {Record<string,unknown>} patch */
export function applySettingsPatch(input, scope, patch) {
  const out = normalizeSettings(input);
  if (scope === 'clock') {
    // 시계는 항목마다 규칙이 달라 하나라도 어긋나면 통째로 거부합니다(Rust merge와 같은 동작).
    if (!patch || !Object.keys(patch).length || Object.entries(patch).some(([key, value]) => !isValidClockField(key, value)))
      throw new Error('저장할 수 없는 설정입니다.');
    out.preferences.clock = /** @type {any} */ (normalizeClockPreferences({ ...out.preferences.clock, ...patch }));
    out.revision++;
    return normalizeSettings(out);
  }
  const allowed =
    scope === 'toolkit' ? Object.keys(out.toolkit) : Object.keys(defaultPreferences(scope));
  if (!patch || Object.keys(patch).some((key) => !allowed.includes(key)))
    throw new Error('저장할 수 없는 설정입니다.');
  if (scope === 'toolkit') {
    const before = out.toolkit;
    out.toolkit = { ...before, ...patch };
    if (!Object.hasOwn(patch, 'toolOrderIds')) out.toolkit.toolOrderIds = orderAfterVisibilityChange(before, out.toolkit);
  }
  else
    out.preferences[scope] = normalizePreferences(scope, { ...out.preferences[scope], ...patch });
  out.revision++;
  return normalizeSettings(out);
}
