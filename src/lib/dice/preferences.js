/** 주사위 창의 작은 설정(개수·소리·동작 줄이기). 던진 결과는 저장하지 않습니다.
 * 왜 localStorage인가: 이 세 값은 잃어도 기본값으로 곧바로 쓸 수 있는 편의 설정이라 Rust 저장소·업데이트 전 저장 확인이 필요 없습니다.
 * 동기식 쓰기라 업데이트 설치로 앱이 즉시 끝나도 반쯤 쓴 파일이 남지 않습니다. */
import { DEFAULT_COUNT, clampCount } from './engine.js';

export const STORAGE_KEY = 'tidy-dice-settings-v1';

/** reduced가 null이면 OS의 "동작 줄이기" 설정을 따릅니다. 사용자가 스위치를 한 번 누르면 그 선택을 기억합니다.
 * @typedef {{count:number,sound:boolean,reduced:boolean|null}} DicePrefs */

/** @returns {DicePrefs} */
export const defaultPrefs = () => ({ count: DEFAULT_COUNT, sound: true, reduced: null });

/** @param {unknown} input @returns {DicePrefs} */
export function normalizePrefs(input) {
  const out = defaultPrefs();
  const raw = /** @type {Record<string, unknown>|null} */ (input && typeof input === 'object' ? input : null);
  if (!raw || raw.version !== 1) return out;
  // 숫자가 아닌 개수는 기본값으로 돌립니다('2' 같은 문자열도 손상으로 봅니다).
  if (typeof raw.count === 'number') out.count = clampCount(raw.count);
  if (typeof raw.sound === 'boolean') out.sound = raw.sound;
  if (typeof raw.reduced === 'boolean') out.reduced = raw.reduced;
  return out;
}

/** @param {Pick<Storage,'getItem'>|null|undefined} storage @returns {{prefs:DicePrefs,error:string}} */
export function loadPrefs(storage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return { prefs: text ? normalizePrefs(JSON.parse(text)) : defaultPrefs(), error: '' };
  } catch {
    return { prefs: defaultPrefs(), error: '저장된 설정을 읽지 못해 기본값으로 시작해요.' };
  }
}

/** @param {Pick<Storage,'setItem'>|null|undefined} storage @param {DicePrefs} prefs @returns {string} 실패 안내(성공이면 빈 문자열) */
export function savePrefs(storage, prefs) {
  try {
    const clean = normalizePrefs({ version: 1, ...prefs });
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...clean }));
    return '';
  } catch {
    return '바꾼 설정을 저장하지 못했어요. 이 창을 닫으면 되돌아가요.';
  }
}
