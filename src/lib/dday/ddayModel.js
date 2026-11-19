import { todayKey as localTodayKey } from '../dateUtils.js';
import { WEEKDAY_LABELS, parseDateKey } from '../datePicker/calendarModel.js';
import { newId } from '../ids.js';

/**
 * @typedef {
 *   | 'flag' | 'cal' | 'bell' | 'hourglass' | 'book' | 'pencil' | 'puzzle'
 *   | 'trophy' | 'party' | 'cake' | 'gift' | 'heart' | 'plane' | 'camera'
 *   | 'sprout' | 'flower' | 'sun' | 'snow' | 'star' | 'sparkle' | 'clover'
 * } DdayIconId
 */
/** @typedef {'accent'|'emerald'|'sky'|'lilac'|'rose'|'gold'} DdayToneId */
/** @typedef {'countdown'|'since'} DdayCountMode */
/** @typedef {'active'|'archived'} DdayStatus */
/** @typedef {'single'|'bento'|'hidden'} DdayBannerMode */
/** @typedef {'w1'|'w4'} DdaySkin */
/** @typedef {'auto'|'light'|'dark'} DdayAppearanceMode */

export const DDAY_TITLE_MAX = 30;
// 7열 × 3행(21종) 순서: 1행 일정·배움 / 2행 성취·기념 / 3행 계절·응원.
// 기존 저장 데이터(flag, puzzle, snow, sparkle, sprout, star, trophy, cal) 8종 ID를 그대로 유지해 무손실 호환을 보장합니다.
/** @type {readonly DdayIconId[]} */
export const DDAY_ICONS = Object.freeze([
  'flag', 'cal', 'bell', 'hourglass', 'book', 'pencil', 'puzzle',
  'trophy', 'party', 'cake', 'gift', 'heart', 'plane', 'camera',
  'sprout', 'flower', 'sun', 'snow', 'star', 'sparkle', 'clover',
]);

// 아이콘 라벨·카테고리의 단일 원천(편집 시트·접근성·테스트 공용)
/** @type {Readonly<Record<DdayIconId, Readonly<{ label: string, category: string }>>>} */
export const DDAY_ICON_META = Object.freeze({
  flag: Object.freeze({ label: '깃발', category: '일정·배움' }),
  cal: Object.freeze({ label: '달력', category: '일정·배움' }),
  bell: Object.freeze({ label: '알림종', category: '일정·배움' }),
  hourglass: Object.freeze({ label: '모래시계', category: '일정·배움' }),
  book: Object.freeze({ label: '책', category: '일정·배움' }),
  pencil: Object.freeze({ label: '연필', category: '일정·배움' }),
  puzzle: Object.freeze({ label: '퍼즐', category: '일정·배움' }),
  trophy: Object.freeze({ label: '트로피', category: '성취·기념' }),
  party: Object.freeze({ label: '축하폭죽', category: '성취·기념' }),
  cake: Object.freeze({ label: '케이크', category: '성취·기념' }),
  gift: Object.freeze({ label: '선물', category: '성취·기념' }),
  heart: Object.freeze({ label: '하트', category: '성취·기념' }),
  plane: Object.freeze({ label: '비행기', category: '성취·기념' }),
  camera: Object.freeze({ label: '카메라', category: '성취·기념' }),
  sprout: Object.freeze({ label: '새싹', category: '계절·응원' }),
  flower: Object.freeze({ label: '꽃', category: '계절·응원' }),
  sun: Object.freeze({ label: '햇살', category: '계절·응원' }),
  snow: Object.freeze({ label: '눈꽃', category: '계절·응원' }),
  star: Object.freeze({ label: '별', category: '계절·응원' }),
  sparkle: Object.freeze({ label: '반짝', category: '계절·응원' }),
  clover: Object.freeze({ label: '네잎클로버', category: '계절·응원' }),
});
/** @type {readonly DdayToneId[]} */
export const DDAY_TONES = Object.freeze(['accent', 'emerald', 'sky', 'lilac', 'rose', 'gold']);
/** @type {readonly DdayBannerMode[]} */
export const DDAY_BANNER_MODES = Object.freeze(['single', 'bento', 'hidden']);
/** @type {readonly DdaySkin[]} */
export const DDAY_SKINS = Object.freeze(['w1', 'w4']);
/** @type {readonly DdayAppearanceMode[]} */
export const DDAY_APPEARANCE_MODES = Object.freeze(['auto', 'light', 'dark']);
/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   date: string,
 *   startDate: string | null,
 *   countMode: DdayCountMode,
 *   repeatYearly: boolean,
 *   icon: DdayIconId,
 *   tone: DdayToneId,
 *   status: DdayStatus,
 *   completedAt: string | null,
 *   linkedTodoId: string | null,
 *   showInTodo: boolean,
 *   showInBanner: boolean,
 *   showInWidget: boolean,
 *   order: number,
 * }} DdayItem
 *
 * @typedef {{ showInTodo: boolean, showInBanner: boolean, showInWidget: boolean }} ChannelPreset
 * @typedef {{
 *   defaultChannelsFromTodo: ChannelPreset,
 *   defaultChannelsFromNew: ChannelPreset,
 *   completeWithTodo: boolean,
 *   deleteWithTodo: boolean,
 * }} DdaySettings
 * @typedef {{ x: number, y: number, width: number, height: number }} DdayGeometry
 * @typedef {{
 *   skin: DdaySkin,
 *   appearanceMode: DdayAppearanceMode,
 *   displayScope: string,
 *   hiddenIds: string[],
 *   alwaysOnTop: boolean,
 *   autoOpen: boolean,
 *   geometry: DdayGeometry | null,
 * }} DdayWidgetPrefs
 */

/** @type {Record<string, string>} */
const ENTITY_MAP = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * @param {string} str
 * @param {number} maxCodepoints
 */
export function truncateCodepoints(str, maxCodepoints = DDAY_TITLE_MAX) {
  const chars = [...String(str || '')];
  return chars.length <= maxCodepoints ? chars.join('') : chars.slice(0, maxCodepoints).join('');
}

/**
 * 할 일 HTML이나 사용자 입력을 한 줄짜리 안전한 D-Day 제목(최대 30코드포인트)으로 정제합니다.
 * @param {unknown} raw
 * @param {number} [maxLen]
 * @returns {string}
 */
export function stripHtmlToTitle(raw, maxLen = DDAY_TITLE_MAX) {
  if (typeof raw !== 'string') return '';
  let text = raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<(?:div|p|li)(?:\s[^>]*)?>/gi, ' ')
    .replace(/<[^>]*>?/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITY_MAP[code.toLowerCase()] ?? m;
    })
    // \uC774\uBAA8\uC9C0 \uC787\uAE30 \uAE00\uC790(ZWJ, U+200D)\uB294 \uB0A8\uAE41\uB2C8\uB2E4. \uC9C0\uC6B0\uBA74 \uAC00\uC871\u00B7\uC9C1\uC5C5 \uC774\uBAA8\uC9C0\uAC00 \uB0B1\uAC1C \uADF8\uB9BC\uC73C\uB85C \uCABC\uAC1C\uC838 \uBCF4\uC600\uC2B5\uB2C8\uB2E4.
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B\u200C\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateCodepoints(text, maxLen);
}

/** @param {Date} [now] */
export function todayDateKey(now = new Date()) {
  return localTodayKey(now);
}

/** @param {number} year */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 로컬 자정 기준 날짜 차이 (toKey - fromKey, 일 단위). 유효하지 않으면 NaN.
 * UTC 일수 변환을 사용해 서머타임 영향을 배제합니다.
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {number}
 */
export function calendarDiffDays(fromKey, toKey) {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  if (!a || !b) return NaN;
  const utcA = Date.UTC(a.year, a.month, a.day);
  const utcB = Date.UTC(b.year, b.month, b.day);
  return Math.round((utcB - utcA) / 86_400_000);
}

/**
 * 'YYYY-MM-DD'를 표기용 문자열('11.23 (월)')로 변환합니다.
 * @param {unknown} dateKey
 * @returns {string}
 */
export function formatDotDate(dateKey) {
  const parts = parseDateKey(dateKey);
  if (!parts) return '';
  const weekday = new Date(parts.year, parts.month, parts.day).getDay();
  return `${parts.month + 1}.${String(parts.day).padStart(2, '0')} (${WEEKDAY_LABELS[weekday]})`;
}

/**
 * 'YYYY-MM-DD'를 상세 표기용('2026년 11월 23일 (월)')으로 변환합니다.
 * @param {unknown} dateKey
 * @returns {string}
 */
export function formatFullDate(dateKey) {
  const parts = parseDateKey(dateKey);
  if (!parts) return '';
  const weekday = new Date(parts.year, parts.month, parts.day).getDay();
  return `${parts.year}년 ${parts.month + 1}월 ${parts.day}일 (${WEEKDAY_LABELS[weekday]})`;
}

/**
 * 매년 반복(countdown)일 때 기준일(refDateKey) 기준 다음 목표 날짜('YYYY-MM-DD')를 계산합니다.
 * 2월 29일은 평년에서 2월 28일로 보정합니다.
 * @param {string} dateKey
 * @param {boolean} repeatYearly
 * @param {DdayCountMode} countMode
 * @param {string} [refDateKey]
 * @returns {string}
 */
export function resolveEffectiveTargetDate(dateKey, repeatYearly, countMode, refDateKey = todayDateKey()) {
  const target = parseDateKey(dateKey);
  if (!target) return dateKey;
  if (!repeatYearly || countMode !== 'countdown') return dateKey;
  const ref = parseDateKey(refDateKey);
  if (!ref) return dateKey;

  const dayForYear = (/** @type {number} */ y) =>
    target.month === 1 && target.day === 29 && !isLeapYear(y) ? 28 : target.day;

  let year = Math.max(ref.year, target.year);
  let candidate = `${String(year).padStart(4, '0')}-${String(target.month + 1).padStart(2, '0')}-${String(dayForYear(year)).padStart(2, '0')}`;
  if (calendarDiffDays(refDateKey, candidate) < 0) {
    year += 1;
    candidate = `${String(year).padStart(4, '0')}-${String(target.month + 1).padStart(2, '0')}-${String(dayForYear(year)).padStart(2, '0')}`;
  }
  return candidate;
}

/**
 * @param {Pick<DdayItem, 'date' | 'countMode' | 'repeatYearly'>} item
 * @param {string} [refDateKey]
 * @returns {{ label: string, diff: number, state: 'today'|'imminent'|'week'|'upcoming'|'overdue'|'since', effectiveDate: string }}
 */
export function computeDdayCounter(item, refDateKey = todayDateKey()) {
  const countMode = item.countMode === 'since' ? 'since' : 'countdown';
  const effectiveDate = resolveEffectiveTargetDate(item.date, !!item.repeatYearly, countMode, refDateKey);
  if (countMode === 'since') {
    const diff = calendarDiffDays(item.date, refDateKey);
    if (!Number.isFinite(diff)) return { label: '+1일', diff: 0, state: 'since', effectiveDate: item.date };
    if (diff >= 0) {
      return { label: `+${diff + 1}일`, diff: diff + 1, state: 'since', effectiveDate: item.date };
    }
    return { label: `D-${Math.abs(diff)}`, diff, state: 'upcoming', effectiveDate: item.date };
  }

  const diff = calendarDiffDays(refDateKey, effectiveDate);
  if (!Number.isFinite(diff)) return { label: 'D-0', diff: 0, state: 'today', effectiveDate };
  if (diff === 0) return { label: 'D-Day', diff: 0, state: 'today', effectiveDate };
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, diff, state: 'overdue', effectiveDate };
  if (diff <= 3) return { label: `D-${diff}`, diff, state: 'imminent', effectiveDate };
  if (diff <= 7) return { label: `D-${diff}`, diff, state: 'week', effectiveDate };
  return { label: `D-${diff}`, diff, state: 'upcoming', effectiveDate };
}

/**
 * B-3 배너·와이드 위젯용 경과율(%)을 계산합니다 (8..96% 클램프, 당일/지남/기념일 100%).
 * @param {Pick<DdayItem, 'date' | 'startDate' | 'countMode' | 'repeatYearly'>} item
 * @param {string} [refDateKey]
 * @returns {number}
 */
export function computeProgressPercent(item, refDateKey = todayDateKey()) {
  const counter = computeDdayCounter(item, refDateKey);
  if (counter.state === 'today' || counter.state === 'overdue' || counter.state === 'since') return 100;

  const startKey = parseDateKey(item.startDate) ? /** @type {string} */ (item.startDate) : refDateKey;
  const totalSpan = calendarDiffDays(startKey, counter.effectiveDate);
  if (!Number.isFinite(totalSpan) || totalSpan <= 0) {
    // 시작일이 목표일과 같거나(당일 등록) 매년 반복으로 과거 기준일이면 최근 30일 창 기준 추정
    const fallbackRatio = Math.max(0, Math.min(1, (30 - counter.diff) / 30));
    return Math.round(8 + fallbackRatio * 88);
  }
  const elapsed = calendarDiffDays(startKey, refDateKey);
  const ratio = Math.max(0, Math.min(1, elapsed / totalSpan));
  return Math.round(8 + ratio * 88);
}

/**
 * @param {unknown} tone
 * @param {string} [accentFallback]
 * @returns {string}
 */
export function resolveToneColor(tone, accentFallback = '#d97706') {
  switch (tone) {
    case 'emerald': return '#059669';
    case 'sky': return '#2563eb';
    case 'lilac': return '#7c3aed';
    case 'rose': return '#e11d48';
    case 'gold': return '#ca8a04';
    default: return accentFallback || '#d97706';
  }
}

/**
 * @param {unknown} raw
 * @param {number} [fallbackOrder]
 * @returns {DdayItem | null}
 */
export function normalizeDdayItem(raw, fallbackOrder = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, any>} */ (raw);
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null;
  if (!id) return null;
  const dateParts = parseDateKey(r.date);
  if (!dateParts) return null;
  const title = stripHtmlToTitle(r.title);
  if (!title) return null;

  const linkedTodoId = typeof r.linkedTodoId === 'string' && r.linkedTodoId.trim() ? r.linkedTodoId.trim() : null;
  const status = r.status === 'archived' ? 'archived' : 'active';
  const countMode = r.countMode === 'since' ? 'since' : 'countdown';
  const startDate = parseDateKey(r.startDate) ? r.startDate : null;
  const completedAt = status === 'archived' && typeof r.completedAt === 'string' && r.completedAt.trim()
    ? r.completedAt.trim()
    : null;
  const icon = DDAY_ICONS.includes(r.icon) ? r.icon : 'flag';
  const tone = DDAY_TONES.includes(r.tone) ? r.tone : 'accent';
  const order = Number.isFinite(Number(r.order)) ? Math.max(0, Math.floor(Number(r.order))) : fallbackOrder;

  return {
    id,
    title,
    date: r.date,
    startDate,
    countMode,
    repeatYearly: Boolean(r.repeatYearly),
    icon,
    tone,
    status,
    completedAt,
    linkedTodoId,
    // linkedTodoId가 없으면 To-do 채널 ON일 수 없음
    showInTodo: linkedTodoId !== null && Boolean(r.showInTodo),
    showInBanner: r.showInBanner !== false,
    showInWidget: r.showInWidget !== false,
    order,
  };
}

/**
 * @param {unknown} rawList
 * @returns {DdayItem[]}
 */
export function normalizeDdayList(rawList) {
  if (!Array.isArray(rawList)) return [];
  /** @type {DdayItem[]} */
  const out = [];
  const seen = new Set();
  for (let i = 0; i < rawList.length; i += 1) {
    const item = normalizeDdayItem(rawList[i], i);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  // 활성 항목 order 0..N-1 정규화
  const active = out.filter((d) => d.status === 'active').sort((a, b) => a.order - b.order);
  active.forEach((d, idx) => { d.order = idx; });
  return out;
}

/**
 * @param {unknown} raw
 * @param {ChannelPreset} fallback
 * @returns {ChannelPreset}
 */
function normalizeChannelPreset(raw, fallback) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, any>} */ (raw) : {};
  return {
    showInTodo: typeof r.showInTodo === 'boolean' ? r.showInTodo : fallback.showInTodo,
    showInBanner: typeof r.showInBanner === 'boolean' ? r.showInBanner : fallback.showInBanner,
    showInWidget: typeof r.showInWidget === 'boolean' ? r.showInWidget : fallback.showInWidget,
  };
}

/**
 * @param {unknown} [raw]
 * @returns {DdaySettings}
 */
export function normalizeDdaySettings(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, any>} */ (raw) : {};
  return {
    defaultChannelsFromTodo: normalizeChannelPreset(r.defaultChannelsFromTodo, {
      showInTodo: true,
      showInBanner: true,
      showInWidget: true,
    }),
    defaultChannelsFromNew: normalizeChannelPreset(r.defaultChannelsFromNew, {
      showInTodo: false,
      showInBanner: true,
      showInWidget: true,
    }),
    completeWithTodo: typeof r.completeWithTodo === 'boolean' ? r.completeWithTodo : true,
    deleteWithTodo: typeof r.deleteWithTodo === 'boolean' ? r.deleteWithTodo : false,
  };
}

/** @param {unknown} raw @returns {DdayGeometry | null} */
export function normalizeDdayGeometry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const g = /** @type {Record<string, any>} */ (raw);
  const { x, y, width, height } = g;
  if (![x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (x <= -10000 || y <= -10000) return null;
  if (width < 150 || height < 150 || width > 2000 || height > 2000) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * @param {unknown} [raw]
 * @returns {DdayWidgetPrefs}
 */
export function normalizeDdayWidgetPrefs(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, any>} */ (raw) : {};
  const skin = DDAY_SKINS.includes(r.skin) ? r.skin : 'w1';
  const appearanceMode = DDAY_APPEARANCE_MODES.includes(r.appearanceMode) ? r.appearanceMode : 'auto';
  const displayScope = typeof r.displayScope === 'string' && r.displayScope.trim() ? r.displayScope.trim() : 'all';
  const hiddenIds = Array.isArray(r.hiddenIds)
    ? [...new Set(r.hiddenIds.filter((/** @type {unknown} */ v) => typeof v === 'string' && v.length > 0 && v.length <= 120))]
    : [];
  return {
    skin,
    appearanceMode,
    displayScope,
    hiddenIds,
    alwaysOnTop: Boolean(r.alwaysOnTop),
    autoOpen: Boolean(r.autoOpen),
    geometry: normalizeDdayGeometry(r.geometry),
  };
}

/** @param {DdayWidgetPrefs | null | undefined} prefs */
export function savedDdayGeometry(prefs) {
  return prefs?.autoOpen ? (prefs.geometry ?? null) : null;
}

/** @param {Partial<DdayItem>} fields */
export function buildDdayItem(fields) {
  return normalizeDdayItem({
    id: fields.id || newId(),
    title: fields.title || '',
    date: fields.date || todayDateKey(),
    startDate: fields.startDate ?? todayDateKey(),
    countMode: fields.countMode || 'countdown',
    repeatYearly: Boolean(fields.repeatYearly),
    icon: fields.icon || 'flag',
    tone: fields.tone || 'accent',
    status: fields.status || 'active',
    completedAt: fields.completedAt ?? null,
    linkedTodoId: fields.linkedTodoId ?? null,
    showInTodo: Boolean(fields.showInTodo),
    showInBanner: fields.showInBanner !== false,
    showInWidget: fields.showInWidget !== false,
    order: fields.order ?? 0,
  });
}
