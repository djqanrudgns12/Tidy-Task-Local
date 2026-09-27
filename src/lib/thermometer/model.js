/** 학급 온도계 자료 모양·기본값·읽기 보정·틀(프리셋). PRD 10.1 기본값: 최대 10, 올리기·내리기 1, 영하 허용. */
import { newId } from '../ids.js';
import { cleanLabel } from '../scoreboard/model.js';
import { isDateKey } from './calendar.js';
import { MOODS, moodId } from './moods.js';

export const LIMITS = Object.freeze({
  minMax: 5,
  maxMax: 1000,
  title: 12,
  topText: 14,
  stageLabel: 12,
  stages: 10,
  chips: 8,
  chipText: 6,
  // 기록에 붙는 사유. 칩(버튼)은 짧게 두지만, 칸에 직접 쓰는 사유는 "수학 문제 다 풂"처럼 조금 더 길 수 있어 따로 둡니다.
  reason: 12,
  log: 300,
  dailyDays: 120,
  stampDates: 100,
  sets: 50,
  thermometers: 2,
  rewardText: 14,
});
export const STAMP_SIZES = Object.freeze([5, 10, 20]);
export const AUTO_MODES = Object.freeze(['off', 'daily-reset', 'daily-cool', 'weekly-reset']);
export const DEFAULT_SET = 'default';

/** @typedef {{id:string,at:number,label:string,reached:boolean}} Stage */
/** @typedef {{id:string,at:number,delta:number,value:number,kind:'manual'|'auto'|'restart',reason:string}} LogEntry */
/** @typedef {{id:string,kind:'cooled'|'reset'|'kept'|'missed',amount:number}} Notice */
/** @typedef {ReturnType<typeof makeThermometer>} Thermometer */

/** @param {'positive'|'negative'} [mood] */
export function makeThermometer(mood = 'positive') {
  const m = MOODS[mood];
  return {
    id: newId(),
    title: /** @type {string} */ (m.title),
    mood: /** @type {'positive'|'negative'} */ (mood),
    unit: /** @type {'deg'|'point'|'none'} */ ('deg'),
    value: 0,
    max: 10,
    upStep: 1,
    downStep: 1,
    linkSteps: true,
    allowBelowZero: true,
    topText: '',
    goalReached: false,
    deadline: /** @type {string|null} */ (null),
    deadlineOutcome: /** @type {null|'met'|'missed'|'kept'|'ended'} */ (null),
    /** @type {Stage[]} */
    stages: [],
    autoCool: { mode: /** @type {'off'|'daily-reset'|'daily-cool'|'weekly-reset'} */ ('off'), amount: 1, weekdaysOnly: true },
    lastCooledOn: /** @type {string|null} */ (null),
    reasons: { show: true, chips: [...m.chips] },
    stamps: { size: 10, count: 0, rewardText: '', completedBoards: 0, dates: /** @type {string[]} */ ([]) },
    /** @type {Notice[]} */
    notices: [],
    /** @type {LogEntry[]} */
    log: [],
    /** @type {Record<string, {up:number,down:number,auto:number}>} */
    daily: {},
  };
}

/** 두 번째 온도계 틀(PRD 10.10) @param {'warning'|'praise'|'blank'} preset @param {'positive'|'negative'} firstMood */
export function presetThermometer(preset, firstMood) {
  if (preset === 'warning') return makeThermometer('negative');
  if (preset === 'praise') return makeThermometer('positive');
  return makeThermometer(firstMood);
}

/** 무드를 바꿀 때: 제목·사유 칩이 그 무드의 기본값 그대로면 새 무드의 기본값으로 바꿉니다(사용자가 고친 값은 유지).
 * @param {Thermometer} t @param {'positive'|'negative'} mood */
export function switchMood(t, mood) {
  if (t.mood === mood) return t;
  const from = MOODS[t.mood];
  const to = MOODS[mood];
  const chipsDefault = t.reasons.chips.length === from.chips.length && t.reasons.chips.every((c, i) => c === from.chips[i]);
  return {
    ...t,
    mood,
    title: t.title === from.title ? to.title : t.title,
    reasons: chipsDefault ? { ...t.reasons, chips: [...to.chips] } : t.reasons,
  };
}

/** @param {unknown} v @param {boolean} f */
const bool = (v, f) => (typeof v === 'boolean' ? v : f);
/** @param {unknown} v @param {number} min @param {number} max @param {number} f */
const int = (v, min, max, f) => (Number.isInteger(v) && /** @type {number} */ (v) >= min && /** @type {number} */ (v) <= max ? /** @type {number} */ (v) : f);
/** @param {unknown} v */
const idOf = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : null);

/** @param {any} raw @returns {Thermometer|null} */
export function normalizeThermometer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mood = moodId(raw.mood);
  const base = makeThermometer(mood);
  const id = idOf(raw.id) ?? base.id;
  const max = int(raw.max, LIMITS.minMax, LIMITS.maxMax, base.max);
  const allowBelowZero = bool(raw.allowBelowZero, base.allowBelowZero);
  const min = allowBelowZero ? -max : 0;
  const value = Number.isFinite(raw.value) ? Math.max(min, Math.min(max, Math.round(raw.value))) : 0;
  /** @type {Stage[]} */ const stages = [];
  const usedAt = new Set();
  for (const s of Array.isArray(raw.stages) ? raw.stages.slice(0, LIMITS.stages) : []) {
    const at = int(s?.at, 1, LIMITS.maxMax, 0);
    if (!at || usedAt.has(at)) continue;
    usedAt.add(at);
    stages.push({ id: idOf(s.id) ?? newId(), at, label: cleanLabel(s.label, LIMITS.stageLabel), reached: bool(s.reached, false) });
  }
  stages.sort((a, b) => a.at - b.at);
  const chips = Array.isArray(raw.reasons?.chips)
    ? raw.reasons.chips.map((/** @type {unknown} */ c) => cleanLabel(c, LIMITS.chipText)).filter(Boolean).slice(0, LIMITS.chips)
    : base.reasons.chips;
  /** @type {LogEntry[]} */ const log = [];
  for (const e of Array.isArray(raw.log) ? raw.log.slice(-LIMITS.log) : [])
    if (Number.isFinite(e?.at) && Number.isFinite(e?.delta) && Number.isFinite(e?.value))
      log.push({ id: idOf(e.id) ?? newId(), at: e.at, delta: Math.round(e.delta), value: Math.round(e.value), kind: ['auto', 'restart'].includes(e.kind) ? e.kind : 'manual', reason: cleanLabel(e.reason, LIMITS.reason) });
  /** @type {Record<string, {up:number,down:number,auto:number}>} */ const daily = {};
  if (raw.daily && typeof raw.daily === 'object')
    for (const key of Object.keys(raw.daily).filter(isDateKey).sort().slice(-LIMITS.dailyDays)) {
      const d = raw.daily[key];
      daily[key] = { up: int(d?.up, 0, 1e6, 0), down: int(d?.down, 0, 1e6, 0), auto: int(d?.auto, 0, 1e6, 0) };
    }
  const size = STAMP_SIZES.includes(raw.stamps?.size) ? raw.stamps.size : base.stamps.size;
  return {
    ...base,
    id,
    title: cleanLabel(raw.title, LIMITS.title) || base.title,
    unit: ['deg', 'point', 'none'].includes(raw.unit) ? raw.unit : 'deg',
    value,
    max,
    upStep: int(raw.upStep, 1, max, 1),
    downStep: int(raw.downStep, 1, max, 1),
    linkSteps: bool(raw.linkSteps, true),
    allowBelowZero,
    topText: cleanLabel(raw.topText, LIMITS.topText),
    goalReached: bool(raw.goalReached, false),
    deadline: isDateKey(raw.deadline) ? raw.deadline : null,
    deadlineOutcome: ['met', 'missed', 'kept', 'ended'].includes(raw.deadlineOutcome) ? raw.deadlineOutcome : null,
    stages,
    autoCool: {
      mode: AUTO_MODES.includes(raw.autoCool?.mode) ? raw.autoCool.mode : 'off',
      amount: int(raw.autoCool?.amount, 1, max, 1),
      weekdaysOnly: bool(raw.autoCool?.weekdaysOnly, true),
    },
    lastCooledOn: isDateKey(raw.lastCooledOn) ? raw.lastCooledOn : null,
    reasons: { show: bool(raw.reasons?.show, true), chips },
    stamps: {
      size,
      count: int(raw.stamps?.count, 0, size, 0),
      rewardText: cleanLabel(raw.stamps?.rewardText, LIMITS.rewardText),
      completedBoards: int(raw.stamps?.completedBoards, 0, 1e6, 0),
      dates: Array.isArray(raw.stamps?.dates) ? raw.stamps.dates.filter(isDateKey).slice(-LIMITS.stampDates) : [],
    },
    notices: Array.isArray(raw.notices)
      ? raw.notices.filter((/** @type {any} */ n) => ['cooled', 'reset', 'kept', 'missed'].includes(n?.kind)).slice(-4)
        .map((/** @type {any} */ n) => ({ id: idOf(n.id) ?? newId(), kind: n.kind, amount: int(n.amount, 0, 1e6, 0) }))
      : [],
    log,
    daily,
  };
}

/** @param {any} raw */
function normalizeSet(raw) {
  const seen = new Set();
  const thermometers = [];
  for (const t of Array.isArray(raw?.thermometers) ? raw.thermometers : []) {
    const n = normalizeThermometer(t);
    if (n && !seen.has(n.id) && thermometers.length < LIMITS.thermometers) {
      seen.add(n.id);
      thermometers.push(n);
    }
  }
  // 명시적으로 모두 지운 학급은 빈 상태로 둡니다. 오래된 자료에 목록 자체가 없으면 기본 온도계를 만듭니다.
  if (!Array.isArray(raw?.thermometers)) thermometers.push(makeThermometer('positive'));
  const selectedId = thermometers.some((t) => t.id === raw?.selectedId) ? raw.selectedId : thermometers[0]?.id ?? '';
  return { selectedId, thermometers, usedAt: Number.isFinite(raw?.usedAt) ? raw.usedAt : 0 };
}
/** @typedef {ReturnType<typeof normalizeSet>} ThermoSet */

export const makeSet = () => {
  const t = makeThermometer('positive');
  return { selectedId: t.id, thermometers: [t], usedAt: 0 };
};

export const defaultMain = () => ({
  lastSetKey: DEFAULT_SET,
  rosterHintDismissed: false,
  shared: { sound: true, volume: 70, reduced: false },
  /** @type {Record<string, ThermoSet>} */
  sets: { [DEFAULT_SET]: makeSet() },
});
/** @typedef {ReturnType<typeof defaultMain>} ThermoMain */

/** @param {any} raw @returns {ThermoMain} */
export function normalizeMain(raw) {
  const d = defaultMain();
  /** @type {Record<string, ThermoSet>} */ const sets = {};
  if (raw?.sets && typeof raw.sets === 'object')
    for (const [key, value] of Object.entries(raw.sets).slice(0, LIMITS.sets)) if (idOf(key)) sets[key] = normalizeSet(value);
  if (!Object.keys(sets).length) sets[DEFAULT_SET] = makeSet();
  const lastSetKey = idOf(raw?.lastSetKey) && sets[raw.lastSetKey] ? raw.lastSetKey : Object.keys(sets)[0];
  return {
    lastSetKey,
    rosterHintDismissed: bool(raw?.rosterHintDismissed, false),
    shared: {
      sound: bool(raw?.shared?.sound, d.shared.sound),
      volume: int(raw?.shared?.volume, 0, 100, d.shared.volume),
      reduced: bool(raw?.shared?.reduced, d.shared.reduced),
    },
    sets,
  };
}

/** 학급을 복사해 시작: 설정은 그대로, 값·기록·도장·도달 표시·기한 결과는 비움(PRD 10.2)
 * @param {ThermoSet} source */
export function copySet(source) {
  const thermometers = source.thermometers.map((t) => ({
    ...t,
    id: newId(),
    value: 0,
    goalReached: false,
    deadlineOutcome: null,
    stages: t.stages.map((s) => ({ ...s, id: newId(), reached: false })),
    lastCooledOn: null,
    stamps: { ...t.stamps, count: 0, completedBoards: 0, dates: [] },
    notices: [],
    log: [],
    daily: {},
  }));
  return { selectedId: thermometers[0]?.id ?? '', thermometers, usedAt: Date.now() };
}
