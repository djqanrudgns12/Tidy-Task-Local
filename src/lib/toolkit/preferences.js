import { TOOLKIT_THEMES } from './themes.js';
import { defaultClockPreferences, normalizeClockPreferences, isValidClockField } from '../clock/clockPreferences.js';
/** @typedef {{tickEnabled:boolean,warningEnabled?:boolean,endEnabled?:boolean,warningLeadSeconds?:number,warningDurationSeconds?:number|null,dialRangeMinutes?:number,showRemainingTime?:boolean}} Preferences */
/** @typedef {{schemaVersion:number,revision:number,toolkit:{theme:string,darkMode:boolean,enabled:boolean,externalToolsEnabled:boolean,orientation:string,toolbarSize:number,collapsed:boolean,visibleToolIds:string[],hiddenPlatformIds:string[],position:Record<string,number>|null},preferences:Record<string,Preferences>}} Settings
 * preferences.clock은 타이머와 모양이 다른 시계 설정(clockPreferences.js)입니다. 읽을 때는 normalizeClockPreferences를 거칩니다. */
export const TOOLBAR_SIZES = [
  { label: '매우 작게', scale: 0.9 },
  { label: '작게', scale: 0.95 },
  { label: '보통', scale: 1 },
  { label: '크게', scale: 1.05 },
  { label: '매우 크게', scale: 1.1 },
];
export const TIMER_KINDS = ['digital', 'analog', 'hourglass', 'stopwatch'];
/** @type {Record<string,string>} */
export const TIMER_NAMES = {
  digital: '전광판 타이머',
  analog: '아날로그 타이머',
  hourglass: '모래시계',
  stopwatch: '스톱워치',
};
export const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 40];
export const WARNING_LEADS = [5, 10, 20, 30, 40, 50, 60, 90, 120];
export const WARNING_DURATIONS = [null, 2, 5, 10, 20];
/** @param {string} kind @returns {Preferences} */
export function defaultPreferences(kind) {
  if (!TIMER_KINDS.includes(kind)) throw new Error('알 수 없는 타이머입니다.');
  if (kind === 'stopwatch') return { tickEnabled: true };
  return {
    tickEnabled: true,
    warningEnabled: true,
    endEnabled: true,
    warningLeadSeconds: 5,
    warningDurationSeconds: null,
    ...(kind === 'analog' ? { dialRangeMinutes: 60 } : {}),
    ...(kind === 'hourglass' ? { showRemainingTime: true } : {}),
  };
}
/** @returns {Settings} */
export function defaults() {
  return {
    schemaVersion: 8,
    revision: 0,
    toolkit: {
      // 처음 설정에서 사용 여부를 고르기 전에는 조용히 대기합니다.
      enabled: false,
      theme: 'sage',
      darkMode: false,
      orientation: 'horizontal',
      toolbarSize: 2,
      collapsed: false,
      visibleToolIds: ['timer', 'clock', 'picker', 'noticeboard', 'tournament', 'focus-bell', 'dice', 'roster'],
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
  }
  return result;
}
/** @param {any} input @returns {Settings} */
export function normalizeSettings(input) {
  if (input?.schemaVersion != null && ![1, 2, 3, 4, 5, 6, 7, 8].includes(input.schemaVersion))
    throw new Error('더 최신 버전의 툴킷 설정입니다.');
  const out = defaults();
  out.revision = Number.isSafeInteger(input?.revision) ? input.revision : 0;
  for (const key of /** @type {const} */ (['enabled', 'collapsed', 'externalToolsEnabled', 'darkMode']))
    if (typeof input?.toolkit?.[key] === 'boolean') out.toolkit[key] = input.toolkit[key];
  if (TOOLKIT_THEMES.some(t => t.id === input?.toolkit?.theme)) out.toolkit.theme = input.toolkit.theme;
  if (['horizontal', 'vertical'].includes(input?.toolkit?.orientation))
    out.toolkit.orientation = input.toolkit.orientation;
  if (Number.isInteger(input?.toolkit?.toolbarSize) && input.toolkit.toolbarSize >= 0 && input.toolkit.toolbarSize < TOOLBAR_SIZES.length)
    out.toolkit.toolbarSize = input.toolkit.toolbarSize;
  if (Array.isArray(input?.toolkit?.visibleToolIds))
    out.toolkit.visibleToolIds = input.toolkit.visibleToolIds.filter(
      /** @param {unknown} id */ (id) => id === 'timer' || id === 'clock' || id === 'roster' || id === 'noticeboard' || id === 'picker' || id === 'tournament' || id === 'focus-bell' || id === 'dice',
    );
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
  if (scope === 'toolkit') out.toolkit = { ...out.toolkit, ...patch };
  else
    out.preferences[scope] = normalizePreferences(scope, { ...out.preferences[scope], ...patch });
  out.revision++;
  return normalizeSettings(out);
}
