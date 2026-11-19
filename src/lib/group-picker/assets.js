/** 모둠원 뽑기(picker-group) 전용 수채·과슈 에셋 18종 캐릭터 + 3대 테마 파츠 로더 · 영구 아바타 배정기.
 *  기존 투표용 src/assets/vote/characters/ 는 절대 건드리지 않고 src/assets/group-picker/ 만 사용합니다. */
import manifestJson from '../../assets/group-picker/assets-manifest.json' with { type: 'json' };
import { warmupThemeRecolors, getRecoloredPartUrl, clearRecolorCache } from './recolor.js';

export const ASSETS_MANIFEST = manifestJson;

// Vite AST 매크로는 정적 import.meta.glob(...) 호출만 치환하므로 try/catch 로 Node --test 호환 유지
/** @type {Record<string, string>} */
let fullModules = {};
/** @type {Record<string, string>} */
let portraitModules = {};
/** @type {Record<string, string>} */
let trainModules = {};
/** @type {Record<string, string>} */
let glacierModules = {};
/** @type {Record<string, string>} */
let elevatorModules = {};
/** @type {Record<string, string>} */
let sharedModules = {};
try {
  fullModules = import.meta.glob('../../assets/group-picker/characters/full/*.webp', { eager: true, query: '?url', import: 'default' });
  portraitModules = import.meta.glob('../../assets/group-picker/characters/portraits/*.webp', { eager: true, query: '?url', import: 'default' });
  trainModules = import.meta.glob('../../assets/group-picker/train/*.webp', { eager: true, query: '?url', import: 'default' });
  glacierModules = import.meta.glob('../../assets/group-picker/glacier/*.webp', { eager: true, query: '?url', import: 'default' });
  elevatorModules = import.meta.glob('../../assets/group-picker/elevator/*.webp', { eager: true, query: '?url', import: 'default' });
  sharedModules = import.meta.glob('../../assets/group-picker/shared/*.webp', { eager: true, query: '?url', import: 'default' });
} catch {}

/** @param {Record<string, unknown>} mods */
function indexByFileStem(mods) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [p, url] of Object.entries(mods)) {
    const file = p.split('/').pop()?.replace(/\.webp$/i, '') ?? '';
    if (file && typeof url === 'string') out[file] = url;
  }
  return out;
}

export const CHARACTER_FULL_URLS = Object.freeze(indexByFileStem(fullModules));
export const CHARACTER_PORTRAIT_URLS = Object.freeze(indexByFileStem(portraitModules));
export const TRAIN_URLS = Object.freeze(indexByFileStem(trainModules));
export const GLACIER_URLS = Object.freeze(indexByFileStem(glacierModules));
export const ELEVATOR_URLS = Object.freeze(indexByFileStem(elevatorModules));
export const SHARED_URLS = Object.freeze(indexByFileStem(sharedModules));

export const MALE_IDS = Object.freeze(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
export const FEMALE_IDS = Object.freeze(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9']);
export const ALL_CHARACTER_IDS = Object.freeze([...MALE_IDS, ...FEMALE_IDS]);

/** FNV-1a 안정 해시 (student.id 단일 시드 전용). @param {string} s */
export function hashStudentId(s) {
  let h = 2166136261;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** @param {string} charId */
function makeAvatarRecord(charId) {
  return {
    id: charId,
    fullSrc: CHARACTER_FULL_URLS[charId] ?? '',
    src: CHARACTER_PORTRAIT_URLS[charId] ?? '',
    portraitSrc: CHARACTER_PORTRAIT_URLS[charId] ?? '',
  };
}

/** 학급 전체 명단 기준 영구 균등 라운드로빈 아바타 배정표 생성(C3: indexHint 제거).
 *  왜 전체 명단을 ID 순 정렬해 배정하는가: 28명 안팎 학급에서 단순 hash mod 는 특정 캐릭터에
 *  5명씩 쏠릴 수 있으나, ID 순으로 가장 덜 쓰인 캐릭터를 해시 타이브레이크로 배정하면
 *  전 캐릭터가 고루 쓰이고(50명 기준 최대 3명 중복), 결석·무대·스왑·결과보드에서도 불변입니다.
 * @param {{id:string, gender?:string}[]} allStudents
 * @returns {Record<string, {id:string, fullSrc:string, src:string, portraitSrc:string}>} */
export function assignClassAvatars(allStudents = []) {
  /** @type {Record<string, number>} */
  const usage = {};
  for (const cid of ALL_CHARACTER_IDS) usage[cid] = 0;

  // ID 순 정렬(같은 ID면 1회만 배정) — 번호·출석·이름 변동과 무관하게 결정적
  const sorted = [...allStudents]
    .filter((s) => s?.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));

  /** @type {Record<string, ReturnType<typeof makeAvatarRecord>>} */
  const result = {};

  for (const st of sorted) {
    if (result[st.id]) continue;
    const pool = st.gender === 'male'
      ? MALE_IDS
      : st.gender === 'female'
        ? FEMALE_IDS
        : ALL_CHARACTER_IDS;

    const h = hashStudentId(st.id);
    let minCount = Infinity;
    for (const cid of pool) {
      if (usage[cid] < minCount) minCount = usage[cid];
    }
    const candidates = pool.filter((cid) => usage[cid] === minCount);
    const chosen = candidates[h % candidates.length] ?? pool[0];
    usage[chosen] += 1;
    result[st.id] = makeAvatarRecord(chosen);
  }

  return result;
}

/** 단일 학생 아바타 조회(indexHint 완전 제거 · student.id 단독 결정).
 *  사전 계산된 classAvatarMap 이 주어지면 라운드로빈 균등 표에서 O(1) 조회합니다.
 * @param {{id:string, gender?:string, name?:string}} student
 * @param {Record<string, ReturnType<typeof makeAvatarRecord>>} [classAvatarMap] */
export function avatarForStudent(student, classAvatarMap) {
  const id = String(student?.id ?? '');
  if (classAvatarMap && id && classAvatarMap[id]) {
    return classAvatarMap[id];
  }
  const pool = student?.gender === 'male'
    ? MALE_IDS
    : student?.gender === 'female'
      ? FEMALE_IDS
      : ALL_CHARACTER_IDS;
  const charId = pool[hashStudentId(id) % pool.length];
  return makeAvatarRecord(charId);
}

/** 각 테마의 OKLab 리컬러 대상 (베이스 + 마스크) 정의 */
export function getRecolorablePartsForTheme(/** @type {'train'|'glacier'|'elevator'} */ theme) {
  if (theme === 'train') {
    return [
      { partId: 'train-body', baseUrl: TRAIN_URLS['t1-train-body-base'], maskUrl: TRAIN_URLS['t1-train-body-mask'] },
      { partId: 'train-door-left', baseUrl: TRAIN_URLS['t1-door-left-base'], maskUrl: TRAIN_URLS['t1-door-left-mask'] },
      { partId: 'train-door-right', baseUrl: TRAIN_URLS['t1-door-right-base'], maskUrl: TRAIN_URLS['t1-door-right-mask'] },
    ].filter((p) => p.baseUrl && p.maskUrl);
  }
  if (theme === 'glacier') {
    return [
      { partId: 'glacier-flag', baseUrl: GLACIER_URLS['g1-flag-base'], maskUrl: GLACIER_URLS['g1-flag-mask'] },
    ].filter((p) => p.baseUrl && p.maskUrl);
  }
  return [
    { partId: 'elevator-arch', baseUrl: ELEVATOR_URLS['e1-arch-trim-base'], maskUrl: ELEVATOR_URLS['e1-arch-trim-mask'] },
    { partId: 'elevator-door-left', baseUrl: ELEVATOR_URLS['e1-door-left-base'], maskUrl: ELEVATOR_URLS['e1-door-left-mask'] },
    { partId: 'elevator-door-right', baseUrl: ELEVATOR_URLS['e1-door-right-base'], maskUrl: ELEVATOR_URLS['e1-door-right-mask'] },
  ].filter((p) => p.baseUrl && p.maskUrl);
}

/** 테마 파츠 URL 조회 (캐시 미준비 시 중립 베이스 폴백).
 * @param {string} partId @param {string} baseUrl @param {string} maskUrl @param {string} colorId */
export async function resolveThemePartUrl(partId, baseUrl, maskUrl, colorId) {
  return getRecoloredPartUrl(partId, baseUrl, maskUrl, colorId);
}

/** @param {string} src @param {Set<string>} broken */
function decodeImg(src, broken) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (/** @type {boolean} */ ok) => {
      if (settled) return;
      settled = true;
      if (!ok) broken.add(src);
      resolve(undefined);
    };
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => finish(true)).catch(() => finish(true));
      } else {
        finish(true);
      }
    };
    img.onerror = () => finish(false);
    img.src = src;
  });
}

/** 활성 테마 + 공용 캐릭터 + 현재 사용 groupPool 색만 프리로드 & OKLab 웜업(≤ 96MB 예산 준수).
 * @param {'train'|'glacier'|'elevator'} [activeTheme]
 * @param {string[]} [groupColorIds]
 * @returns {Promise<{broken:Set<string>}>} */
export async function preloadGroupPickerAssets(activeTheme = 'train', groupColorIds = ['strawberry', 'mint', 'apricot', 'sky', 'lavender', 'lime']) {
  /** @type {Set<string>} */
  const broken = new Set();
  if (typeof Image === 'undefined') return { broken };

  const themeMap = activeTheme === 'glacier'
    ? GLACIER_URLS
    : activeTheme === 'elevator'
      ? ELEVATOR_URLS
      : TRAIN_URLS;

  const urls = [
    ...Object.values(CHARACTER_PORTRAIT_URLS),
    ...Object.values(CHARACTER_FULL_URLS),
    ...Object.values(SHARED_URLS),
    ...Object.values(themeMap),
  ].filter(Boolean);

  await Promise.all([
    ...urls.map((src) => decodeImg(src, broken)),
    warmupThemeRecolors(activeTheme, getRecolorablePartsForTheme(activeTheme), groupColorIds),
  ]);

  return { broken };
}

export { clearRecolorCache };
