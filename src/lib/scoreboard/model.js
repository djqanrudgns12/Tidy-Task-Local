/** 점수판 자료 모양·기본값·읽기 보정(normalize).
 * 저장소(Rust scores.rs)는 크기·깊이 같은 안전 검사만 하므로, 값의 규칙(점수 범위·이름 길이 등)은 여기서 맞춥니다.
 * 잘못된 값 하나 때문에 전체를 버리지 않고 그 값만 기본값으로 돌립니다(PRD 12.5). */
import { newId } from '../ids.js';

export const LIMITS = Object.freeze({
  score: 99999,
  step: 999,
  boards: 12,
  items: 40,
  itemName: 16,
  boardTitle: 20,
  groupMin: 2,
  groupMax: 12,
  groupName: 10,
  classes: 50,
  scoresPerClass: 500,
});

/** 카드 색 12가지. 테마와 따로인 파스텔 — 카드 바탕은 이 색을 패널색에 22% 섞어 쓰므로 다크 모드에서도 숫자가 잘 읽힙니다. */
export const PALETTE = Object.freeze([
  { id: 'strawberry', label: '딸기', color: '#EF6F86' },
  { id: 'peach', label: '복숭아', color: '#F59A6B' },
  { id: 'apricot', label: '살구', color: '#F4B740' },
  { id: 'lemon', label: '레몬', color: '#D9C02F' },
  { id: 'lime', label: '라임', color: '#94C548' },
  { id: 'mint', label: '민트', color: '#4FC2A0' },
  { id: 'teal', label: '청록', color: '#3BB3B8' },
  { id: 'sky', label: '하늘', color: '#5AA9E6' },
  { id: 'ocean', label: '바다', color: '#4C7FE0' },
  { id: 'lavender', label: '라벤더', color: '#9B87E6' },
  { id: 'grape', label: '포도', color: '#B874D6' },
  { id: 'cherry', label: '벚꽃', color: '#E77DB8' },
].map((c) => Object.freeze(c)));
export const PALETTE_IDS = PALETTE.map((c) => c.id);

/** 모둠 모양 12가지(색을 구분하기 어려운 학생도 모양으로 구분). SVG는 GroupSymbol.svelte */
export const SYMBOLS = Object.freeze(['star', 'heart', 'cloud', 'flower', 'drop', 'leaf', 'bolt', 'moon', 'sun', 'note', 'clover', 'acorn']);
export const SYMBOL_LABELS = Object.freeze({
  star: '별', heart: '하트', cloud: '구름', flower: '꽃', drop: '물방울', leaf: '나뭇잎',
  bolt: '번개', moon: '달', sun: '해', note: '음표', clover: '클로버', acorn: '도토리',
});

export const DEFAULT_GROUP_COUNT = 6;

/** @param {number} n */
export const clampScore = (n) => Math.max(-LIMITS.score, Math.min(LIMITS.score, Math.round(Number(n) || 0)));

/** 한 줄 이름: NFC, 앞뒤 공백·제어 문자 제거, 길이 제한(코드포인트 기준 — Rust와 같은 셈)
 * @param {unknown} value @param {number} max */
export function cleanLabel(value, max) {
  const text = String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  return [...text].slice(0, max).join('');
}

/** @param {unknown} v */
const bool = (v, /** @type {boolean} */ fallback) => (typeof v === 'boolean' ? v : fallback);
/** @param {unknown} v @param {number} min @param {number} max @param {number} fallback */
const int = (v, min, max, fallback) => (Number.isInteger(v) && /** @type {number} */ (v) >= min && /** @type {number} */ (v) <= max ? /** @type {number} */ (v) : fallback);
/** @param {unknown} v */
const idOf = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : null);

/** 점수판마다 두는 표시·조작 설정 */
export const defaultBoardPrefs = () => ({ step: 1, customStep: /** @type {number|null} */ (null), badges: true, colorCards: true });
/** @param {any} raw */
export function normalizeBoardPrefs(raw) {
  const d = defaultBoardPrefs();
  return {
    step: int(raw?.step, 1, LIMITS.step, d.step),
    customStep: raw?.customStep == null ? null : int(raw.customStep, 1, LIMITS.step, 0) || null,
    badges: bool(raw?.badges, d.badges),
    colorCards: bool(raw?.colorCards, d.colorCards),
  };
}

/** 효과음·음량·동작 줄이기 — 점수판 3종이 함께 씁니다(PRD 6.10). */
export const defaultShared = () => ({ sound: true, volume: 70, reduced: false });
/** @param {any} raw */
export function normalizeShared(raw) {
  const d = defaultShared();
  return { sound: bool(raw?.sound, d.sound), volume: int(raw?.volume, 0, 100, d.volume), reduced: bool(raw?.reduced, d.reduced) };
}

/** @param {any} raw @param {number} [limit] @returns {Record<string, number>} */
function normalizeScores(raw, limit = LIMITS.scoresPerClass) {
  /** @type {Record<string, number>} */ const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw).slice(0, limit)) if (idOf(id) && Number.isFinite(value)) out[id] = clampScore(value);
  return out;
}

export const defaultPersonal = () => ({
  prefs: { ...defaultBoardPrefs(), showNumber: true, groupColors: true, clusterByGroup: false },
  lastClassId: /** @type {string|null} */ (null),
  /** @type {Record<string, {scores: Record<string, number>}>} */
  classes: {},
});
/** @param {any} raw */
export function normalizePersonal(raw) {
  const d = defaultPersonal();
  const prefs = {
    ...normalizeBoardPrefs(raw?.prefs),
    showNumber: bool(raw?.prefs?.showNumber, true),
    groupColors: bool(raw?.prefs?.groupColors, true),
    clusterByGroup: bool(raw?.prefs?.clusterByGroup, false),
  };
  /** @type {Record<string, {scores: Record<string, number>}>} */ const classes = {};
  if (raw?.classes && typeof raw.classes === 'object')
    for (const [id, value] of Object.entries(raw.classes).slice(0, LIMITS.classes))
      if (idOf(id)) classes[id] = { scores: normalizeScores(/** @type {any} */ (value)?.scores) };
  return { prefs, lastClassId: idOf(raw?.lastClassId) ?? d.lastClassId, classes };
}

/** 모둠 번호 n의 기본 모둠(색·모양은 번호 순서대로)
 * @param {number} n 1부터 @param {string} [id] */
export const makeGroup = (n, id = newId()) => ({
  id,
  name: `${n}모둠`,
  color: PALETTE_IDS[(n - 1) % PALETTE_IDS.length],
  symbol: SYMBOLS[(n - 1) % SYMBOLS.length],
  score: 0,
});

export const defaultGroup = () => ({
  prefs: defaultBoardPrefs(),
  groups: Array.from({ length: DEFAULT_GROUP_COUNT }, (_, i) => makeGroup(i + 1)),
});
/** @param {any} raw */
export function normalizeGroup(raw) {
  if (!raw || !Array.isArray(raw.groups)) return defaultGroup();
  const seen = new Set();
  /** @type {ReturnType<typeof makeGroup>[]} */
  const groups = [];
  for (const g of raw.groups.slice(0, LIMITS.groupMax)) {
    const id = idOf(g?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const n = groups.length + 1;
    groups.push({
      id,
      name: cleanLabel(g.name, LIMITS.groupName) || `${n}모둠`,
      color: PALETTE_IDS.includes(g.color) ? g.color : PALETTE_IDS[(n - 1) % 12],
      symbol: SYMBOLS.includes(g.symbol) ? g.symbol : SYMBOLS[(n - 1) % 12],
      score: clampScore(g.score),
    });
  }
  while (groups.length < LIMITS.groupMin) groups.push(makeGroup(groups.length + 1));
  return { prefs: normalizeBoardPrefs(raw.prefs), groups };
}

export const defaultCustom = () => ({
  lastBoardId: /** @type {string|null} */ (null),
  /** 만들기 화면에서 입력 중인 내용. 줄 목록으로 둡니다(저장소의 글자 수 안전 제한 200자는 한 줄 단위로 걸리므로).
   * @type {{title:string,lines:string[],startScore:number}|null} */
  draft: null,
  /** @type {CustomBoard[]} */
  boards: [],
});
/** @typedef {{id:string,name:string,color:string,score:number}} CustomItem */
/** @typedef {{id:string,title:string,startScore:number,usedAt:number,prefs:ReturnType<typeof defaultBoardPrefs>,items:CustomItem[]}} CustomBoard */

/** @param {any} raw @returns {CustomBoard|null} */
function normalizeBoard(raw) {
  const id = idOf(raw?.id);
  if (!id || !Array.isArray(raw.items)) return null;
  const seen = new Set();
  /** @type {CustomItem[]} */ const items = [];
  for (const it of raw.items.slice(0, LIMITS.items)) {
    const itemId = idOf(it?.id);
    const name = cleanLabel(it?.name, LIMITS.itemName);
    if (!itemId || seen.has(itemId) || !name) continue;
    seen.add(itemId);
    items.push({ id: itemId, name, color: PALETTE_IDS.includes(it.color) ? it.color : PALETTE_IDS[items.length % 12], score: clampScore(it.score) });
  }
  if (!items.length) return null;
  return {
    id,
    title: cleanLabel(raw.title, LIMITS.boardTitle) || '점수판',
    startScore: clampScore(raw.startScore),
    usedAt: Number.isFinite(raw.usedAt) ? raw.usedAt : 0,
    prefs: normalizeBoardPrefs(raw.prefs),
    items,
  };
}
/** @param {any} raw */
export function normalizeCustom(raw) {
  const d = defaultCustom();
  const seen = new Set();
  /** @type {CustomBoard[]} */ const boards = [];
  for (const b of Array.isArray(raw?.boards) ? raw.boards.slice(0, LIMITS.boards) : []) {
    const board = normalizeBoard(b);
    if (board && !seen.has(board.id)) {
      seen.add(board.id);
      boards.push(board);
    }
  }
  const draft = raw?.draft && typeof raw.draft === 'object'
    ? {
        title: cleanLabel(raw.draft.title, LIMITS.boardTitle),
        lines: (Array.isArray(raw.draft.lines) ? raw.draft.lines : []).slice(0, 80).map((/** @type {unknown} */ l) => String(l ?? '').slice(0, 60)),
        startScore: clampScore(raw.draft.startScore),
      }
    : d.draft;
  const lastBoardId = idOf(raw?.lastBoardId);
  return { lastBoardId: boards.some((b) => b.id === lastBoardId) ? lastBoardId : boards[0]?.id ?? null, draft, boards };
}
