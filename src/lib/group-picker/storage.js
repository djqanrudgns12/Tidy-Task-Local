/** 모둠원 뽑기 로컬 영속화(Rust scores.rs "group-picker" 구역) · 명단/점수판 브릿지 모듈.
 *  scores.rs::check_data 4대 제한(2MB · 깊이 10 · 문자열 200자 · 배열 1000개)을 엄수합니다. */
import { createSection } from '../scores/section.js';
import { cleanLabel, LIMITS as SB_LIMITS, normalizeGroup, PALETTE_IDS, SYMBOLS } from '../scoreboard/model.js';
import { newId } from '../ids.js';
import { execute, readRoster } from '../classroom/repository.js';
import {
  GROUP_MAX,
  GROUP_MIN,
  MAX_CUSTOM_LINES,
  MAX_GROUP_NAME_CHARS,
  PALETTE_IDS as GP_PALETTE_IDS,
  SYMBOLS as GP_SYMBOLS,
} from './allocation.js';

export const STORE_NAME = 'group-picker';
export const MAX_CLASSES = 50;
export const MAX_APART_PAIRS = 500;
export const MAX_RECENT_HISTORY = 8;
export const SAFE_CLASSES_BYTES = 1_400_000;

export const VALID_MODES = /** @type {const} */ (['train', 'glacier', 'elevator']);
export const VALID_SORTS = /** @type {const} */ (['number', 'order']);

/** 코드포인트 기준 문자열 자르기 (Rust chars().count()와 동일 기준).
 * @param {unknown} v @param {number} max */
export function clipStr(v, max = 200) {
  const s = String(v ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  return [...s].slice(0, max).join('');
}

/** @param {unknown} v @param {boolean} fallback */
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
/** @param {unknown} v */
const idStr = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : null);

export const defaultPrefs = () => ({
  sound: true,
  volume: 60,
  reduced: false,
  lastMode: /** @type {'train'|'glacier'|'elevator'} */ ('train'),
  lastClassId: /** @type {string|null} */ (null),
  sortOrder: /** @type {'number'|'order'} */ ('order'),
  alwaysShowNumber: false,
  keepTotal: false,
  setupPanelOpen: true,
});

/** @param {any} raw */
export function normalizePrefs(raw) {
  const d = defaultPrefs();
  const mode = VALID_MODES.includes(raw?.lastMode) ? raw.lastMode : d.lastMode;
  const sortOrder = VALID_SORTS.includes(raw?.sortOrder) ? raw.sortOrder : d.sortOrder;
  const volume = Number.isInteger(raw?.volume) && raw.volume >= 0 && raw.volume <= 100 ? raw.volume : d.volume;
  return {
    sound: bool(raw?.sound, d.sound),
    volume,
    reduced: bool(raw?.reduced, d.reduced),
    lastMode: /** @type {'train'|'glacier'|'elevator'} */ (mode),
    lastClassId: raw?.lastClassId === '__custom__' ? '__custom__' : idStr(raw?.lastClassId) ?? null,
    sortOrder: /** @type {'number'|'order'} */ (sortOrder),
    alwaysShowNumber: bool(raw?.alwaysShowNumber, d.alwaysShowNumber),
    keepTotal: bool(raw?.keepTotal, d.keepTotal),
    setupPanelOpen: bool(raw?.setupPanelOpen, d.setupPanelOpen),
  };
}

/** @param {any} raw @returns {import('./allocation.js').BaseIntent} */
function normalizeBaseIntent(raw) {
  const mode = /** @type {'byGroups'|'bySize'} */ (raw?.mode === 'bySize' ? 'bySize' : 'byGroups');
  const groupCount = Number.isInteger(raw?.groupCount)
    ? Math.max(GROUP_MIN, Math.min(GROUP_MAX, raw.groupCount))
    : 6;
  const targetSize = Number.isInteger(raw?.targetSize)
    ? Math.max(2, Math.min(25, raw.targetSize))
    : 4;
  const remainderChoice = /** @type {'absorb'|'extra'} */ (raw?.remainderChoice === 'extra' ? 'extra' : 'absorb');
  const rawRatios = Array.isArray(raw?.ratios) ? raw.ratios : [];
  /** @type {number[]} */
  const ratios = rawRatios
    .slice(0, GROUP_MAX)
    .map((/** @type {unknown} */ v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 1 / groupCount));
  return { mode, groupCount, targetSize, remainderChoice, ratios };
}

/** @param {any} raw */
function normalizeAnchorSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.capacities)) return null;
  const n = Number.isInteger(raw.n) && raw.n >= 2 && raw.n <= 500 ? raw.n : null;
  if (n == null) return null;
  const capacities = raw.capacities
    .slice(0, GROUP_MAX)
    .map((/** @type {unknown} */ c) => (Number.isInteger(c) && Number(c) >= 1 && Number(c) <= 500 ? Number(c) : 1));
  if (capacities.length < GROUP_MIN) return null;
  const locked = capacities.map((/** @type {number} */ _, /** @type {number} */ i) => {
    const val = raw.locked?.[i];
    return Number.isInteger(val) && val >= 1 && val <= 500 ? val : null;
  });
  return { n, capacities, locked };
}

/** @param {any} raw */
function normalizeGroupPool(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, GROUP_MAX).map((item, i) => ({
    index: i,
    id: idStr(item?.id) ?? `slot-${i + 1}`,
    sourceGroupId: idStr(item?.sourceGroupId),
    customName: clipStr(item?.customName, MAX_GROUP_NAME_CHARS) || null,
    color: GP_PALETTE_IDS.includes(item?.color) ? item.color : GP_PALETTE_IDS[i % GP_PALETTE_IDS.length],
    symbol: GP_SYMBOLS.includes(item?.symbol) ? item.symbol : GP_SYMBOLS[i % GP_SYMBOLS.length],
    lockedCap: Number.isInteger(item?.lockedCap) && item.lockedCap >= 1 && item.lockedCap <= 500
      ? item.lockedCap
      : null,
  }));
}

/** @param {any} raw */
export function normalizeClassEntry(raw) {
  const excludedSet = new Set(
    (Array.isArray(raw?.excludedIds) ? raw.excludedIds : []).slice(0, 500).map(idStr).filter(Boolean),
  );
  /** @type {[string, string][]} */
  const apartPairs = [];
  const pairSeen = new Set();
  for (const p of (Array.isArray(raw?.apartPairs) ? raw.apartPairs : []).slice(0, MAX_APART_PAIRS)) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const a = idStr(p[0]);
    const b = idStr(p[1]);
    if (!a || !b || a === b) continue;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    if (pairSeen.has(key)) continue;
    pairSeen.add(key);
    apartPairs.push([x, y]);
  }
  /** @type {Record<string, number>} */
  const pinnedByGroup = {};
  if (raw?.pinnedByGroup && typeof raw.pinnedByGroup === 'object') {
    for (const [sid, gi] of Object.entries(raw.pinnedByGroup).slice(0, 500)) {
      if (idStr(sid) && Number.isInteger(gi) && gi >= 0 && gi < GROUP_MAX) {
        pinnedByGroup[sid] = gi;
      }
    }
  }
  const leaderIds = (Array.isArray(raw?.leaderIds) ? raw.leaderIds : [])
    .slice(0, GROUP_MAX)
    .map(idStr)
    .filter(Boolean);

  // recentHistory: 학생 ID 배열들의 묶음만 저장 (깊이 6 <= 10, 한 문자열 80자 <= 200)
  /** @type {string[][][]} */
  const recentHistory = [];
  for (const run of (Array.isArray(raw?.recentHistory) ? raw.recentHistory : []).slice(0, MAX_RECENT_HISTORY)) {
    if (!Array.isArray(run)) continue;
    const cleanGroups = run
      .slice(0, GROUP_MAX)
      .map((grp) => (Array.isArray(grp) ? /** @type {string[]} */ (grp.slice(0, 60).map(idStr).filter(Boolean)) : []))
      .filter((grp) => grp.length > 0);
    if (cleanGroups.length >= GROUP_MIN) recentHistory.push(cleanGroups);
  }

  return {
    updatedAt: Number.isFinite(raw?.updatedAt) ? Number(raw.updatedAt) : 0,
    baseIntent: normalizeBaseIntent(raw?.baseIntent),
    anchorSnapshot: normalizeAnchorSnapshot(raw?.anchorSnapshot),
    groupPool: normalizeGroupPool(raw?.groupPool),
    excludedIds: [...excludedSet],
    apartPairs,
    pinnedByGroup,
    leaderIds,
    genderBalance: bool(raw?.genderBalance, false),
    avoidRecentRepeat: bool(raw?.avoidRecentRepeat, true),
    recentHistory,
  };
}

export const defaultClasses = () => ({
  /** @type {Record<string, ReturnType<typeof normalizeClassEntry>>} */
  items: {},
});

/** @param {any} raw */
export function normalizeClasses(raw) {
  /** @type {Record<string, ReturnType<typeof normalizeClassEntry>>} */
  const items = {};
  const src = raw?.items && typeof raw.items === 'object' ? raw.items : {};
  const sortedEntries = Object.entries(src)
    .filter(([cid]) => Boolean(idStr(cid)))
    .sort(([, a], [, b]) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0))
    .slice(0, MAX_CLASSES);

  for (const [cid, entry] of sortedEntries) {
    items[cid] = normalizeClassEntry(entry);
  }

  // scores.rs 2MB 상한 대비 1.4MB 안전 예산 초과 시 가장 오래된 학급의 recentHistory를 먼저 비움
  const serializedLen = (/** @type {unknown} */ obj) => JSON.stringify(obj).length;
  if (serializedLen({ items }) > SAFE_CLASSES_BYTES) {
    const oldestFirst = Object.keys(items).sort(
      (a, b) => (items[a].updatedAt || 0) - (items[b].updatedAt || 0),
    );
    for (const cid of oldestFirst) {
      if (serializedLen({ items }) <= SAFE_CLASSES_BYTES) break;
      items[cid].recentHistory = [];
    }
    for (const cid of oldestFirst) {
      if (serializedLen({ items }) <= SAFE_CLASSES_BYTES) break;
      delete items[cid];
    }
  }

  return { items };
}

export const defaultCustom = () => ({
  name: '직접 입력 명단',
  /** @type {string[]} 줄 단위 배열 (200자 제한 회피용) */
  lines: [],
  state: normalizeClassEntry({}),
});

/** @param {any} raw */
export function normalizeCustom(raw) {
  const d = defaultCustom();
  const lines = (Array.isArray(raw?.lines) ? raw.lines : [])
    .slice(0, MAX_CUSTOM_LINES)
    .map((/** @type {unknown} */ line) => clipStr(line, 180))
    .filter(Boolean);
  return {
    name: clipStr(raw?.name, MAX_GROUP_NAME_CHARS) || d.name,
    lines,
    state: normalizeClassEntry(raw?.state),
  };
}

/** 결과 모둠 목록을 scores.js recentHistory 형식(studentId[][] 한 회차)으로 축약합니다.
 * @param {{studentIds:string[]}[]} groups */
export function toHistoryEntry(groups) {
  return groups.map((g) => [...g.studentIds]);
}

/** @param {string} classId @param {{name:string, studentIds:string[]}[]} groups */
export function buildReplaceGroupsCommand(classId, groups) {
  return {
    type: 'replaceGroups',
    classId,
    groups: groups.map((g, i) => ({
      name: clipStr(g.name, MAX_GROUP_NAME_CHARS) || `${i + 1}모둠`,
      studentIds: [...g.studentIds],
    })),
  };
}

/** 학급 명단에 모둠 구성을 원자적으로 저장합니다(REVISION_CONFLICT 1회 자동 재시도 포함).
 * @param {string} classId
 * @param {{name:string, studentIds:string[]}[]} groups
 * @param {number} revision */
export async function saveGroupsToRoster(classId, groups, revision) {
  const cmd = buildReplaceGroupsCommand(classId, groups);
  try {
    return await execute(cmd, revision);
  } catch (err) {
    const msg = String(/** @type {any} */ (err)?.message ?? err);
    if (msg.includes('REVISION_CONFLICT') || msg.includes('다른 변경')) {
      const latest = await readRoster();
      return await execute(cmd, latest.revision);
    }
    throw err;
  }
}

/** 뽑힌 모둠 구성을 모둠 점수판('scoreboard' / 'group')에 안전하게 동기화합니다.
 * '점수 0점 초기화' 선택 시 ScoreCard의 오작동 -delta 애니메이션을 막기 위해 반드시 새 ID를 발급합니다.
 * @param {object} params
 * @param {{name:string, color?:string, symbol?:string}[]} params.groups
 * @param {boolean} params.resetScores
 * @returns {Promise<{ok:boolean, status:'saved'|'rejected'|'failed'|'readonly'|'out_of_range', count:number}>} */
export async function syncGroupsToScoreboard({ groups, resetScores }) {
  if (!Array.isArray(groups) || groups.length < SB_LIMITS.groupMin || groups.length > SB_LIMITS.groupMax) {
    return { ok: false, status: 'out_of_range', count: groups?.length ?? 0 };
  }
  const client = createSection({
    store: 'scoreboard',
    section: 'group',
    normalize: normalizeGroup,
  });
  try {
    await client.load();
    const targetGroups = groups.map((g, i) => ({
      name: cleanLabel(g.name, SB_LIMITS.groupName) || `${i + 1}모둠`,
      color: PALETTE_IDS.includes(g.color ?? '') ? /** @type {string} */ (g.color) : PALETTE_IDS[i % PALETTE_IDS.length],
      symbol: SYMBOLS.includes(g.symbol ?? '') ? /** @type {string} */ (g.symbol) : SYMBOLS[i % SYMBOLS.length],
    }));

    const status = await client.mutateAndConfirm(
      (current) => ({
        prefs: current.prefs,
        groups: targetGroups.map((item, idx) => {
          const prev = current.groups?.[idx];
          return {
            id: resetScores ? newId() : (prev?.id ?? newId()),
            name: item.name,
            color: item.color,
            symbol: item.symbol,
            score: resetScores ? 0 : (prev?.score ?? 0),
          };
        }),
      }),
      (saved) => saved.groups?.length === targetGroups.length && saved.groups.every((g, i) => g.name === targetGroups[i].name),
    );
    await client.settle();
    return { ok: status === 'saved', status, count: targetGroups.length };
  } finally {
    client.dispose();
  }
}
