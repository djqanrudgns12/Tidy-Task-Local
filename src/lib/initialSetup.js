import { LazyStore } from '@tauri-apps/plugin-store';
import { isTauri } from '@tauri-apps/api/core';

export const INITIAL_SETUP_WINDOW_LABEL = 'initial-setup';
// 앱 버전과 무관한 영구 키입니다. 다음 업데이트에서 버전 문자열이 바뀌어도 다시 뜨지 않습니다.
export const INITIAL_SETUP_STORE_KEY = 'initial-setup';
export const INITIAL_SETUP_SCHEMA_VERSION = 1;

/** @type {Promise<unknown> | null} */
let completionPromise = null;

/** @param {unknown} value */
export function isInitialSetupComplete(value) {
  // 초기 시험판에서 boolean으로 저장했을 가능성도 완료로 인정합니다.
  if (value === true) return true;
  if (!value || typeof value !== 'object') return false;
  const record = /** @type {Record<string, unknown>} */ (value);
  return record.completed === true && record.completionCount === 1;
}

/**
 * 완료 상태는 오직 0 -> 1로만 바뀝니다. 앱 버전은 기록용일 뿐, 노출 판정에 사용하지 않습니다.
 * @param {unknown} previous
 * @param {{mealStartup:boolean|null,toolkitEnabled:boolean|null,skipped?:boolean,appVersion?:string}} choices
 * @param {number} [completedAt]
 */
export function makeInitialSetupCompletion(previous, choices, completedAt = Date.now()) {
  if (isInitialSetupComplete(previous)) return previous;
  return {
    schemaVersion: INITIAL_SETUP_SCHEMA_VERSION,
    completed: true,
    completionCount: 1,
    completedAt,
    appVersion: typeof choices.appVersion === 'string' ? choices.appVersion : '5.6.3',
    skipped: choices.skipped === true,
    choices: {
      mealStartup: typeof choices.mealStartup === 'boolean' ? choices.mealStartup : null,
      toolkitEnabled: typeof choices.toolkitEnabled === 'boolean' ? choices.toolkitEnabled : null,
    },
  };
}

function previewRead() {
  try {
    return JSON.parse(localStorage.getItem(INITIAL_SETUP_STORE_KEY) || 'null');
  } catch {
    return null;
  }
}

export async function readInitialSetup() {
  if (!isTauri()) return previewRead();
  return new LazyStore('tidy-task-config.json').get(INITIAL_SETUP_STORE_KEY);
}

/**
 * 여러 클릭이나 중복 이벤트가 들어와도 한 번의 저장만 수행합니다.
 * 실패 시 promise를 비워 같은 창에서 재시도할 수 있습니다.
 * @param {{mealStartup:boolean|null,toolkitEnabled:boolean|null,skipped?:boolean,appVersion?:string}} choices
 */
export function completeInitialSetup(choices) {
  if (completionPromise) return completionPromise;
  completionPromise = (async () => {
    const previous = await readInitialSetup();
    const next = makeInitialSetupCompletion(previous, choices);
    if (next === previous) return previous;
    if (!isTauri()) {
      localStorage.setItem(INITIAL_SETUP_STORE_KEY, JSON.stringify(next));
      return next;
    }
    const store = new LazyStore('tidy-task-config.json');
    await store.set(INITIAL_SETUP_STORE_KEY, next);
    await store.save();
    return next;
  })().catch((error) => {
    completionPromise = null;
    throw error;
  });
  return completionPromise;
}

export function getInitialSetupWindowOptions() {
  return {
    url: 'index.html',
    title: 'Tidy Task 처음 설정',
    width: 600,
    height: 780,
    minWidth: 360,
    minHeight: 500,
    center: true,
    decorations: false,
    transparent: false,
    backgroundColor: '#f7f6f1',
    shadow: true,
    alwaysOnTop: false,
    visible: false,
    resizable: true,
    maximizable: false,
    skipTaskbar: false,
  };
}
