/** 학급 온도계 동작 규칙(PRD 10.6~10.9). 모두 "이전 온도계 → { 새 온도계, 일어난 일 }"을 돌려주는 순수 함수입니다.
 *
 * "처음 닿을 때 한 번": 단계·목표에 닿으면 도달 표시(reached·goalReached)를 세우고, 새로 시작할 때만 내립니다.
 * 문턱 근처에서 +1 −1을 반복해도 축하·경고가 여러 번 울리지 않고, 표시가 저장되므로 재실행해도 다시 울리지 않습니다.
 * 자동 식힘으로 내려간 단계만 표시를 풀어 다시 알립니다(새 날의 경고는 다시 알려야 하므로). */
import { newId } from '../ids.js';
import { cleanLabel } from '../scoreboard/model.js';
import { LIMITS } from './model.js';
import { addDays, daysBetween, mondayPassed, schoolDaysBetween } from './calendar.js';

/** @typedef {import('./model.js').Thermometer} Thermometer */
/** @typedef {{stages:import('./model.js').Stage[], top:boolean, clamped:null|'top'|'bottom', stamp:boolean, boardComplete:boolean, freeze:boolean, logId:string|null, delta:number}} Events */

/** @param {Thermometer} t */
export const rangeOf = (t) => ({ min: t.allowBelowZero ? -t.max : 0, max: t.max });

/** @returns {Events} */
const noEvents = () => ({ stages: [], top: false, clamped: null, stamp: false, boardComplete: false, freeze: false, logId: null, delta: 0 });

/** @param {Thermometer} t @param {string} today @param {'up'|'down'|'auto'} key @param {number} amount */
function addDaily(t, today, key, amount) {
  const day = t.daily[today] ?? { up: 0, down: 0, auto: 0 };
  const daily = { ...t.daily, [today]: { ...day, [key]: day[key] + amount } };
  const keys = Object.keys(daily).sort();
  while (keys.length > LIMITS.dailyDays) delete daily[/** @type {string} */ (keys.shift())];
  return daily;
}
/** 알림 하나 @param {import('./model.js').Notice['kind']} kind @param {number} amount @returns {import('./model.js').Notice} */
const notice = (kind, amount) => ({ id: newId(), kind, amount });
/** @param {Thermometer} t @param {import('./model.js').LogEntry} entry */
const addLog = (t, entry) => [...t.log, entry].slice(-LIMITS.log);

/** 도장 하나 찍기(도장판이 이미 다 찼으면 [새 도장판]을 누를 때까지 더 찍지 않음)
 * @param {Thermometer} t @param {string} today */
function stampOnce(t, today) {
  if (t.stamps.count >= t.stamps.size) return { t, stamp: false, boardComplete: false };
  const count = t.stamps.count + 1;
  const boardComplete = count >= t.stamps.size;
  return {
    t: {
      ...t,
      stamps: {
        ...t.stamps,
        count,
        completedBoards: t.stamps.completedBoards + (boardComplete ? 1 : 0),
        dates: [...t.stamps.dates, today].slice(-LIMITS.stampDates),
      },
    },
    stamp: true,
    boardComplete,
  };
}

/** 값 바꾸기의 공통 처리: 범위 맞춤 → 기록 → 단계·목표 도달 → 도장.
 * logId를 넘기면 그 ID로 기록합니다(화면이 미리 정한 ID로 사유 칩을 붙이기 위해).
 * @param {Thermometer} t @param {number} target @param {{now:number, today:string, kind?:'manual'|'auto', logId?:string}} when */
export function moveTo(t, target, { now, today, kind = 'manual', logId: givenId }) {
  const events = noEvents();
  const { min, max } = rangeOf(t);
  const value = Math.max(min, Math.min(max, Math.round(target)));
  if (value === t.value) {
    events.clamped = target > t.value ? 'top' : target < t.value ? 'bottom' : null;
    return { t, events };
  }
  const delta = value - t.value;
  const logId = givenId ?? newId();
  let next = {
    ...t,
    value,
    log: addLog(t, { id: logId, at: now, delta, value, kind, reason: '' }),
    daily: addDaily(t, today, kind === 'auto' ? 'auto' : delta > 0 ? 'up' : 'down', Math.abs(delta)),
  };
  events.logId = logId;
  events.delta = delta;
  events.freeze = t.value >= 0 && value < 0;
  if (delta > 0) {
    next.stages = next.stages.map((s) => {
      if (s.reached || s.at > value || s.at >= t.max) return s;
      events.stages.push(s);
      return { ...s, reached: true };
    });
    if (value >= t.max && !t.goalReached) {
      next.goalReached = true;
      events.top = true;
      if (t.mood === 'positive') {
        // 기한이 있으면 기한 안에서만 달성(도장)으로 셉니다.
        if (!t.deadline || today <= t.deadline) {
          const r = stampOnce(next, today);
          next = { ...r.t, deadlineOutcome: t.deadline && !t.deadlineOutcome ? 'met' : next.deadlineOutcome };
          events.stamp = r.stamp;
          events.boardComplete = r.boardComplete;
        }
      } else if (t.deadline && !t.deadlineOutcome) {
        // 부정: 한계에 닿으면 이번 기간은 "버티기 실패"로 조용히 끝납니다.
        next.deadlineOutcome = 'ended';
      }
    }
  }
  return { t: next, events };
}

/** 올리기·내리기 @param {Thermometer} t @param {1|-1} dir @param {{now:number, today:string, logId?:string}} when */
export function bump(t, dir, when) {
  const step = dir > 0 ? t.upStep : t.linkSteps ? t.upStep : t.downStep;
  return moveTo(t, t.value + dir * step, when);
}

/** 새로 시작: 값 0, 도달 표시·기한 결과 초기화. 도장·기록은 그대로(PRD 10.6).
 * @param {Thermometer} t @param {{now:number, today:string}} when */
export function restart(t, { now, today }) {
  const moved = t.value === 0 ? t : { ...t, log: addLog(t, { id: newId(), at: now, delta: -t.value, value: 0, kind: 'restart', reason: '' }), daily: addDaily(t, today, t.value > 0 ? 'down' : 'up', Math.abs(t.value)) };
  return { ...moved, value: 0, goalReached: false, deadlineOutcome: null, stages: t.stages.map((s) => ({ ...s, reached: false })) };
}

/** 부정 무드 "같은 기간 다시": 새로 시작 + 기한 7일 뒤로 @param {Thermometer} t @param {{now:number, today:string}} when */
export function repeatPeriod(t, when) {
  const base = t.deadline && t.deadline >= when.today ? t.deadline : when.today;
  return { ...restart(t, when), deadline: addDays(base, 7) };
}

/** 방금 변화에 사유 붙이기. 칩뿐 아니라 직접 쓴 글도 받으므로 여기서 다듬습니다(빈 글이면 그대로).
 * @param {Thermometer} t @param {string} logId @param {string} reason */
export function tagReason(t, logId, reason) {
  const clean = cleanLabel(reason, LIMITS.reason);
  if (!clean) return t;
  return { ...t, log: t.log.map((e) => (e.id === logId ? { ...e, reason: clean } : e)) };
}

/** 이름 바꾸기(제목 줄·미니 온도계에서 바로). 빈 이름은 받지 않고 그대로 둡니다 — 다 지운 순간에도 이름이 사라지지 않게.
 * @param {Thermometer} t @param {string} title */
export function renameThermometer(t, title) {
  const clean = cleanLabel(title, LIMITS.title);
  return clean && clean !== t.title ? { ...t, title: clean } : t;
}

/** [새 도장판] @param {Thermometer} t */
export const newStampBoard = (t) => ({ ...t, stamps: { ...t.stamps, count: 0 } });

/** 설정 바꾸기. 값은 새 범위에 맞추되, 설정 변경으로는 알림·도장이 생기지 않습니다(PRD 10.6).
 * @param {Thermometer} t @param {Partial<Thermometer>} patch @param {string|null} [today] 자동 식힘을 켠 날 */
export function applySettings(t, patch, today = null) {
  const next = { ...t, ...patch };
  // 자동 식힘 방식을 바꾼 날부터 셉니다. 여기서 적어 두지 않으면, 켠 뒤 창을 며칠 뒤에 처음 열었을 때
  // 그날을 "켠 날"로 알아 그사이 식혀야 할 만큼을 건너뜁니다.
  if (patch.autoCool && patch.autoCool.mode !== t.autoCool.mode) next.lastCooledOn = patch.autoCool.mode === 'off' ? null : today;
  const { min, max } = rangeOf(next);
  next.value = Math.max(min, Math.min(max, next.value));
  next.upStep = Math.max(1, Math.min(next.max, next.upStep));
  next.downStep = Math.max(1, Math.min(next.max, next.downStep));
  next.autoCool = { ...next.autoCool, amount: Math.max(1, Math.min(next.max, next.autoCool.amount)) };
  if (next.value >= next.max && !next.goalReached) next.goalReached = true; // 알림 없이 표시만 맞춤
  if (patch.deadline !== undefined && patch.deadline !== t.deadline) next.deadlineOutcome = null;
  return next;
}

/** 날짜 따라잡기(자동 식힘 + 기한 판정). 창을 열거나 초점이 올 때, 켜 둔 동안 10분마다 부릅니다.
 * 이미 오늘 처리했으면 아무것도 바꾸지 않습니다(여러 번 불러도 결과가 같음).
 * @param {Thermometer} t @param {{now:number, today:string}} when
 * @returns {{t:Thermometer, changed:boolean}} */
export function catchUp(t, when) {
  const { today } = when;
  let next = t;
  let changed = false;
  const mode = next.autoCool.mode;
  if (mode === 'off') {
    if (next.lastCooledOn !== null) { next = { ...next, lastCooledOn: null }; changed = true; }
  } else if (next.lastCooledOn === null || next.lastCooledOn > today) {
    // 처음 켰을 때(또는 PC 날짜가 뒤로 간 경우)는 오늘부터 셉니다.
    next = { ...next, lastCooledOn: today };
    changed = true;
  } else if (next.lastCooledOn < today) {
    const from = next.lastCooledOn;
    let target = next.value;
    if (mode === 'daily-reset') {
      if (schoolDaysBetween(from, today, next.autoCool.weekdaysOnly) > 0) target = 0;
    } else if (mode === 'weekly-reset') {
      if (mondayPassed(from, today)) target = 0;
    } else if (mode === 'daily-cool' && next.value > 0) {
      const days = schoolDaysBetween(from, today, next.autoCool.weekdaysOnly);
      target = Math.max(0, next.value - next.autoCool.amount * days);
    }
    if (target !== next.value) {
      const before = next.value;
      next = moveTo(next, target, { ...when, kind: 'auto' }).t;
      // 식어서 지나친 단계·목표는 다시 알릴 수 있게 표시를 풉니다.
      next = {
        ...next,
        stages: next.stages.map((s) => (s.reached && s.at > next.value ? { ...s, reached: false } : s)),
        goalReached: next.goalReached && next.value >= next.max,
        notices: [...next.notices, notice(target === 0 && mode !== 'daily-cool' ? 'reset' : 'cooled', before - next.value)].slice(-4),
      };
    }
    next = { ...next, lastCooledOn: today };
    changed = true;
  }
  // 기한 판정: 기한 다음 날 이후 처음 한 번
  if (next.deadline && !next.deadlineOutcome && daysBetween(next.deadline, today) > 0) {
    if (next.mood === 'positive') {
      next = { ...next, deadlineOutcome: 'missed', notices: [...next.notices, notice('missed', 0)].slice(-4) };
    } else {
      const r = stampOnce(next, today);
      next = { ...r.t, deadlineOutcome: 'kept', notices: [...r.t.notices, notice('kept', 0)].slice(-4) };
    }
    changed = true;
  }
  return { t: next, changed };
}

/** 창이 알림을 보여 줬으면 지웁니다. @param {Thermometer} t */
export const ackNotices = (t) => (t.notices.length ? { ...t, notices: [] } : t);
