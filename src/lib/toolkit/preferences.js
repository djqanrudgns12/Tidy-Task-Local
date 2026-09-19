/** @typedef {{tickEnabled:boolean,warningEnabled?:boolean,endEnabled?:boolean,warningLeadSeconds?:number,warningDurationSeconds?:number|null,dialRangeMinutes?:number,showRemainingTime?:boolean}} Preferences */
/** @typedef {{schemaVersion:number,revision:number,toolkit:{enabled:boolean,orientation:string,collapsed:boolean,visibleToolIds:string[],position:Record<string,number>|null},preferences:Record<string,Preferences>}} Settings */
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
    schemaVersion: 1,
    revision: 0,
    toolkit: {
      enabled: true,
      orientation: 'horizontal',
      collapsed: false,
      visibleToolIds: ['timer'],
      position: null,
    },
    preferences: Object.fromEntries(TIMER_KINDS.map((kind) => [kind, defaultPreferences(kind)])),
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
  if (input?.schemaVersion != null && input.schemaVersion !== 1)
    throw new Error('더 최신 버전의 툴킷 설정입니다.');
  const out = defaults();
  out.revision = Number.isSafeInteger(input?.revision) ? input.revision : 0;
  for (const key of /** @type {const} */ (['enabled', 'collapsed']))
    if (typeof input?.toolkit?.[key] === 'boolean') out.toolkit[key] = input.toolkit[key];
  if (['horizontal', 'vertical'].includes(input?.toolkit?.orientation))
    out.toolkit.orientation = input.toolkit.orientation;
  if (Array.isArray(input?.toolkit?.visibleToolIds))
    out.toolkit.visibleToolIds = input.toolkit.visibleToolIds.filter(
      /** @param {unknown} id */ (id) => id === 'timer',
    );
  if (input?.toolkit?.position) out.toolkit.position = input.toolkit.position;
  for (const kind of TIMER_KINDS)
    out.preferences[kind] = normalizePreferences(kind, input?.preferences?.[kind]);
  return out;
}
/** @param {Settings} input @param {string} scope @param {Record<string,unknown>} patch */
export function applySettingsPatch(input, scope, patch) {
  const out = normalizeSettings(input);
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
