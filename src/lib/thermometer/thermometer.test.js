import test from 'node:test';
import assert from 'node:assert/strict';
import { makeThermometer, normalizeMain, normalizeThermometer, switchMood, copySet, presetThermometer, LIMITS } from './model.js';
import { bump, moveTo, restart, repeatPeriod, catchUp, applySettings, tagReason, renameThermometer, newStampBoard, ackNotices } from './rules.js';
import { stageStatus, nextLine, layoutStickers, rulerCells, evenStages, fitStagesToMax, stageLimit } from './stages.js';
import { niceTicks, valueToY } from './scale.js';
import { faceOf } from './face.js';
import { schoolDaysBetween, mondayPassed, deadlineChips, deadlineText, addDays, weekday, weekStart } from './calendar.js';
import { todaySummary, weekBuckets, weekTotal, filterLog } from './history.js';
import { mixColor } from './color.js';

const day = (/** @type {string} */ today) => ({ now: Date.parse(`${today}T10:00:00`), today });
const WED = '2026-09-23'; // 수요일

test('defaults follow the confirmed PRD values', () => {
  const t = makeThermometer();
  assert.equal(t.max, 10);
  assert.equal(t.upStep, 1);
  assert.equal(t.downStep, 1);
  assert.equal(t.allowBelowZero, true);
  assert.equal(t.mood, 'positive');
  assert.equal(t.title, '칭찬 온도계');
  assert.equal(makeThermometer('negative').title, '경고 온도계');
  const main = normalizeMain(undefined);
  assert.equal(Object.keys(main.sets).length, 1);
  assert.equal(main.sets.default.thermometers.length, 1);
});

test('an emptied class stays empty after normalization and can be copied', () => {
  const empty = { selectedId: '', thermometers: [], usedAt: 0 };
  const main = normalizeMain({ lastSetKey: 'class-1', sets: { 'class-1': empty } });
  assert.deepEqual(main.sets['class-1'].thermometers, []);
  assert.equal(main.sets['class-1'].selectedId, '');
  assert.deepEqual(copySet(main.sets['class-1']).thermometers, []);
});

test('bump respects range and step linking', () => {
  let t = { ...makeThermometer(), upStep: 3, downStep: 2 };
  t = bump(t, 1, day(WED)).t;
  assert.equal(t.value, 3);
  t = bump(t, -1, day(WED)).t; // 같게(linkSteps) → 3
  assert.equal(t.value, 0);
  t = bump({ ...t, linkSteps: false }, -1, day(WED)).t;
  assert.equal(t.value, -2);
  const bottom = moveTo({ ...t, value: -10 }, -99, day(WED));
  assert.equal(bottom.events.clamped, 'bottom');
  const noZero = bump({ ...makeThermometer(), allowBelowZero: false }, -1, day(WED));
  assert.equal(noZero.t.value, 0);
  assert.equal(noZero.events.clamped, 'bottom');
  assert.ok(bump(makeThermometer(), -1, day(WED)).events.freeze);
});

test('stage and goal fire once until restart, even when oscillating', () => {
  let t = { ...makeThermometer(), stages: [{ id: 's', at: 3, label: '칭찬 도장', reached: false }] };
  const fired = [];
  for (const dir of [1, 1, 1, -1, 1, -1, 1]) {
    const r = bump(t, /** @type {1|-1} */ (dir), day(WED));
    fired.push(r.events.stages.length);
    t = r.t;
  }
  assert.equal(fired.reduce((a, b) => a + b, 0), 1);
  let tops = 0;
  let stamps = 0;
  for (let i = 0; i < 12; i++) {
    const r = bump(t, 1, day(WED));
    tops += r.events.top ? 1 : 0;
    stamps += r.events.stamp ? 1 : 0;
    t = r.t;
    t = bump(t, -1, day(WED)).t;
    t = bump(t, 1, day(WED)).t;
  }
  assert.equal(tops, 1);
  assert.equal(stamps, 1);
  assert.equal(t.stamps.count, 1);
  t = restart(t, day(WED));
  assert.equal(t.value, 0);
  assert.equal(t.goalReached, false);
  assert.equal(t.stages[0].reached, false);
  assert.equal(t.stamps.count, 1);
  const again = moveTo(t, 10, day(WED));
  assert.equal(again.events.top, true);
  assert.equal(again.events.stages.length, 1);
});

/** @typedef {import('./model.js').Thermometer} Thermometer */

test('negative mood: limit warns without a stamp; kept deadline stamps next day', () => {
  /** @type {Thermometer} */
  let t = { ...makeThermometer('negative'), max: 5, deadline: addDays(WED, 2) };
  let r = moveTo(t, 5, day(WED));
  assert.equal(r.events.top, true);
  assert.equal(r.events.stamp, false);
  assert.equal(r.t.deadlineOutcome, 'ended');
  // 버틴 경우
  t = { ...makeThermometer('negative'), max: 5, deadline: WED };
  t = moveTo(t, 3, day(WED)).t;
  assert.equal(catchUp(t, day(WED)).t.deadlineOutcome, null);
  const next = catchUp(t, day(addDays(WED, 1))).t;
  assert.equal(next.deadlineOutcome, 'kept');
  assert.equal(next.stamps.count, 1);
  assert.equal(next.notices.at(-1)?.kind, 'kept');
  assert.equal(catchUp(next, day(addDays(WED, 2))).t.stamps.count, 1);
  const again = repeatPeriod(next, day(addDays(WED, 1)));
  assert.equal(again.value, 0);
  assert.equal(again.deadline, addDays(WED, 8));
  assert.equal(again.deadlineOutcome, null);
});

test('positive deadline: met inside, missed after', () => {
  /** @type {Thermometer} */
  let t = { ...makeThermometer(), deadline: WED };
  const late = moveTo(t, 10, day(addDays(WED, 1)));
  assert.equal(late.events.top, true);
  assert.equal(late.events.stamp, false);
  const inTime = moveTo(t, 10, day(WED));
  assert.equal(inTime.t.deadlineOutcome, 'met');
  t = moveTo(t, 4, day(WED)).t;
  const missed = catchUp(t, day(addDays(WED, 1))).t;
  assert.equal(missed.deadlineOutcome, 'missed');
  assert.equal(missed.notices.at(-1)?.kind, 'missed');
});

test('auto cool: daily N per school day, weekly reset, idempotent, releases stages', () => {
  const FRI = '2026-09-25';
  const MON = '2026-09-28';
  /** @type {Thermometer} */
  let t = { ...makeThermometer('negative'), max: 10, stages: [{ id: 's', at: 3, label: '', reached: false }], autoCool: { mode: /** @type {const} */ ('daily-cool'), amount: 2, weekdaysOnly: true } };
  t = catchUp(t, day(FRI)).t; // 처음: 오늘부터 셈
  assert.equal(t.lastCooledOn, FRI);
  t = moveTo(t, 7, day(FRI)).t;
  assert.equal(t.stages[0].reached, true);
  const mon = catchUp(t, day(MON)).t; // 금→월: 학교 날 1일
  assert.equal(mon.value, 5);
  assert.equal(catchUp(mon, day(MON)).changed, false);
  const later = catchUp(mon, day(addDays(MON, 3))).t; // 3일 더 → 5-6 → 0에서 멈춤
  assert.equal(later.value, 0);
  assert.equal(later.stages[0].reached, false);
  assert.equal(later.notices.at(-1)?.kind, 'cooled');
  assert.equal(later.daily[addDays(MON, 3)].auto, 5);
  // 영하 값은 식힘이 건드리지 않음
  const cold = catchUp({ ...mon, value: -3 }, day(addDays(MON, 1))).t;
  assert.equal(cold.value, -3);
  // 매주 월요일 0
  let w = { ...makeThermometer(), autoCool: { mode: /** @type {const} */ ('weekly-reset'), amount: 1, weekdaysOnly: true }, lastCooledOn: FRI, value: 6 };
  assert.equal(catchUp(w, day('2026-09-27')).t.value, 6); // 일요일
  const reset = catchUp(w, day(MON)).t;
  assert.equal(reset.value, 0);
  assert.equal(reset.notices.at(-1)?.kind, 'reset');
  // 매일 0: 주말만 지나면 그대로
  let dly = { ...makeThermometer(), autoCool: { mode: /** @type {const} */ ('daily-reset'), amount: 1, weekdaysOnly: true }, lastCooledOn: FRI, value: 4 };
  assert.equal(catchUp(dly, day('2026-09-27')).t.value, 4);
  assert.equal(catchUp(dly, day(MON)).t.value, 0);
  // 끄면 기준 날짜를 지움
  assert.equal(catchUp({ ...dly, autoCool: { ...dly.autoCool, mode: 'off' } }, day(MON)).t.lastCooledOn, null);
});

test('settings clamp value without firing events; reasons attach to a log entry', () => {
  let t = moveTo(makeThermometer(), 8, day(WED)).t;
  t = applySettings(t, { max: 6 });
  assert.equal(t.value, 6);
  assert.equal(t.goalReached, true);
  assert.equal(t.stamps.count, 0);
  const r = bump(makeThermometer(), 1, day(WED));
  const tagged = tagReason(r.t, /** @type {string} */ (r.events.logId), '협동');
  assert.equal(tagged.log.at(-1)?.reason, '협동');
  assert.deepEqual(ackNotices({ ...t, notices: [{ id: 'n', kind: 'cooled', amount: 1 }] }).notices, []);
  // 자동 식힘을 켠 날을 바로 적어 두어, 며칠 뒤 처음 열어도 그사이 식힘을 빠뜨리지 않음
  const base = { ...makeThermometer(), value: 5 };
  const on = applySettings(base, { autoCool: { ...base.autoCool, mode: /** @type {const} */ ('daily-cool') } }, WED);
  assert.equal(on.lastCooledOn, WED);
  assert.equal(catchUp(on, day('2026-09-28')).t.value, 2); // 목·금·월 = 3일
  assert.equal(applySettings(on, { autoCool: { ...on.autoCool, amount: 2 } }, '2026-09-28').lastCooledOn, WED); // 양만 바꾸면 기준일 유지
  assert.equal(applySettings(on, { autoCool: { ...on.autoCool, mode: /** @type {const} */ ('off') } }, '2026-09-28').lastCooledOn, null);
});

test('custom reasons are trimmed, capped and survive a reload', () => {
  const r = bump(makeThermometer(), 1, day(WED));
  const logId = /** @type {string} */ (r.events.logId);
  // 칸에 직접 쓴 사유: 앞뒤 빈칸을 걷고, 칩 길이(6)가 아니라 사유 길이(12)까지 받습니다.
  const tagged = tagReason(r.t, logId, '  수학 문제 다 풀었어요!!  ');
  assert.equal(tagged.log.at(-1)?.reason, '수학 문제 다 풀었어요');
  assert.equal([...(tagged.log.at(-1)?.reason ?? '')].length, LIMITS.reason);
  assert.equal(normalizeThermometer(tagged)?.log.at(-1)?.reason, '수학 문제 다 풀었어요');
  // 빈 글은 붙이지 않고, 없는 기록 ID는 아무것도 바꾸지 않습니다.
  assert.equal(tagReason(r.t, logId, '   '), r.t);
  assert.equal(tagReason(r.t, 'missing', '협동').log.at(-1)?.reason, '');
});

test('rename keeps a title: trims, caps and ignores empty input', () => {
  const t = makeThermometer();
  assert.equal(renameThermometer(t, ' 우리 반 칭찬 ').title, '우리 반 칭찬');
  assert.equal([...renameThermometer(t, '가나다라마바사아자차카타파하').title].length, LIMITS.title);
  // 다 지운 순간(빈 글)이나 같은 이름이면 그대로 돌려줘 저장이 일어나지 않습니다.
  assert.equal(renameThermometer(t, '   '), t);
  assert.equal(renameThermometer(t, t.title), t);
});

test('stamp board completes once and waits for a new board', () => {
  /** @type {Thermometer} */
  let t = { ...makeThermometer(), stamps: { size: 5, count: 4, rewardText: '영화', completedBoards: 0, dates: [] } };
  const r = moveTo(t, 10, day(WED));
  assert.equal(r.events.boardComplete, true);
  assert.equal(r.t.stamps.completedBoards, 1);
  t = restart(r.t, day(WED));
  assert.equal(moveTo(t, 10, day(WED)).events.stamp, false);
  assert.equal(newStampBoard(t).stamps.count, 0);
});

test('stages: status, next line, limits, layout, even spread and refit', () => {
  const stages = [{ id: 'a', at: 3, label: '칭찬 도장', reached: true }, { id: 'b', at: 8, label: '자리 바꾸기', reached: false }];
  const st = stageStatus(stages, 5, 10);
  assert.deepEqual(st.map((s) => s.status), ['reached', 'next']);
  assert.equal(st[1].remain, 3);
  assert.equal(nextLine('positive', stages, 5, 10, 'deg'), '다음: 8° 자리 바꾸기까지 3°');
  assert.equal(nextLine('negative', [], 9, 10, 'deg'), '한계까지 1°!');
  assert.equal(nextLine('positive', [], 10, 10, 'deg'), '목표 달성!');
  assert.equal(nextLine('positive', [], 4, 10, 'point'), '목표까지 6점');
  assert.equal(stageStatus([{ id: 'x', at: 12, label: '', reached: false }], 1, 10)[0].hidden, true);
  const earned = [{ id: 'a', at: 3, label: '', reached: true }, { id: 'b', at: 5, label: '', reached: true }, { id: 'c', at: 8, label: '', reached: false }];
  assert.deepEqual(stageStatus(earned, 4, 10).map((s) => s.status), ['reached', 'next', 'future'], '기본은 지금 값 기준');
  assert.deepEqual(stageStatus(earned, 4, 10, { keepReached: true }).map((s) => s.status), ['reached', 'reached', 'next'], '칭찬 온도계는 받은 보상을 유지하고 다음 목표는 8°');
  assert.equal(stageLimit(10), 9);
  assert.equal(stageLimit(100), LIMITS.stages);
  const lay = layoutStickers([100, 105, 108, 300], 30, 50, 320);
  assert.deepEqual(lay.ys, [100, 130, 160, 300]);
  const pushed = layoutStickers([280, 290, 300], 30, 0, 300);
  assert.deepEqual(pushed.ys, [240, 270, 300]);
  assert.equal(layoutStickers(Array(9).fill(0), 30, 0, 100).compact, true);
  assert.deepEqual(rulerCells(10), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(rulerCells(100).slice(0, 3), [5, 10, 15]);
  assert.deepEqual(evenStages(10, 3), [3, 5, 8]);
  assert.equal(evenStages(5, 10).length, 4);
  const refit = fitStagesToMax(stages, 10, 5);
  assert.deepEqual(refit.map((s) => s.at), [2, 4]);
});

test('ticks, coordinates and faces', () => {
  assert.deepEqual(niceTicks(0, 10).major, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const t37 = niceTicks(0, 37);
  assert.equal(t37.major.at(-1), 37);
  assert.ok(t37.major.length <= 13);
  assert.ok(niceTicks(0, 1000).major.length <= 13);
  assert.ok(niceTicks(-10, 10).major.includes(0));
  // 관이 낮으면 큰 눈금 수를 줄이고, 최대 바로 아래에 붙은 눈금은 뺌
  assert.deepEqual(niceTicks(0, 10, 5).major, [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks(0, 10, 3).major, [0, 5, 10]);
  assert.deepEqual(niceTicks(0, 11, 3).major, [0, 5, 11]);
  assert.deepEqual(niceTicks(0, 10, 4).major, [0, 5, 10]); // 3 간격 대신 5
  assert.equal(valueToY(5, 0, 10, 0, 100), 50);
  assert.equal(valueToY(99, 0, 10, 0, 100), 0);
  assert.deepEqual([-1, 2, 3, 7, 10].map((v) => faceOf('positive', v, 10)), ['frozen', 'sleepy', 'smile', 'excited', 'star']);
  assert.deepEqual([-1, 0, 2, 3, 7, 10].map((v) => faceOf('negative', v, 10)), ['chill', 'calm', 'sheepish', 'worried', 'flushed', 'boiling']);
});

test('calendar: school days, mondays, deadline chips and text', () => {
  assert.equal(weekday(WED), 3);
  assert.equal(schoolDaysBetween('2026-09-25', '2026-09-28', true), 1);
  assert.equal(schoolDaysBetween('2026-09-25', '2026-09-28', false), 3);
  assert.equal(schoolDaysBetween(WED, WED, true), 0);
  assert.equal(schoolDaysBetween('2026-09-18', '2026-09-28', true), 6);
  assert.equal(mondayPassed('2026-09-25', '2026-09-27'), false);
  assert.equal(mondayPassed('2026-09-25', '2026-09-28'), true);
  assert.deepEqual(deadlineChips(WED).map((c) => c.date), ['2026-09-25', '2026-10-02', '2026-10-07']);
  assert.equal(deadlineChips('2026-09-25')[0].date, '2026-09-25');
  assert.equal(deadlineChips('2026-09-26')[0].date, '2026-10-02');
  assert.equal(deadlineText('2026-09-25', WED).text, '금요일(9/25)까지 · 2일 남음');
  assert.equal(deadlineText(WED, WED).text, '오늘까지!');
  assert.ok(deadlineText('2026-09-22', WED).left < 0);
  // 부정 무드는 "버티기", 결과가 나면 결과 문구
  assert.equal(deadlineText('2026-09-25', WED, { mood: 'negative' }).text, '금요일(9/25)까지 버티기 · 2일 남음');
  assert.equal(deadlineText('2026-09-22', WED, { mood: 'negative', outcome: 'kept' }).text, '화요일(9/22)까지 버텼어요!');
  assert.equal(deadlineText('2026-09-25', WED, { outcome: 'met' }).done, true);
  assert.equal(weekStart(WED), '2026-09-21');
});

test('history: today summary, week bars and log filter', () => {
  let t = makeThermometer();
  t = moveTo(t, 3, day(WED)).t;
  t = moveTo(t, 2, day(WED)).t;
  t = moveTo(t, 4, day('2026-09-26')).t; // 토요일
  assert.deepEqual(todaySummary(t.daily, WED), { up: 3, down: 1, auto: 0, empty: false });
  assert.equal(todaySummary(t.daily, '2026-09-22').empty, true);
  const bars = weekBuckets(t.daily, WED, WED);
  assert.deepEqual(bars.map((b) => b.label), ['월', '화', '수', '목', '금', '토']);
  assert.equal(bars[2].today, true);
  assert.deepEqual(weekTotal(bars), { up: 5, down: 1 });
  assert.equal(filterLog(t.log, 'all', Date.parse(`${WED}T12:00:00`)).length, 3);
  assert.equal(filterLog(t.log, 'today', Date.parse(`${WED}T12:00:00`)).length, 2);
});

test('normalize, mood switch, copy and presets', () => {
  const bad = normalizeThermometer({ max: 3, value: 99, upStep: 50, stages: [{ at: 2 }, { at: 2 }, { at: 0 }], stamps: { size: 7 } });
  assert.equal(bad?.max, 10);
  assert.equal(bad?.value, 10);
  assert.equal(bad?.upStep, 1);
  assert.equal(bad?.stages.length, 1);
  assert.equal(bad?.stamps.size, 10);
  const main = normalizeMain({ lastSetKey: 'c1', sets: { c1: { thermometers: [{}, {}, {}] } } });
  assert.equal(main.sets.c1.thermometers.length, 2);
  assert.equal(main.lastSetKey, 'c1');
  const t = makeThermometer();
  const neg = switchMood(t, 'negative');
  assert.equal(neg.title, '경고 온도계');
  assert.equal(neg.reasons.chips[0], '소란');
  const custom = switchMood({ ...t, title: '우리 반' }, 'negative');
  assert.equal(custom.title, '우리 반');
  const set = { selectedId: t.id, thermometers: [moveTo({ ...t, stages: [{ id: 's', at: 2, label: '가', reached: true }] }, 5, day(WED)).t], usedAt: 0 };
  const copied = copySet(set);
  assert.equal(copied.thermometers[0].value, 0);
  assert.equal(copied.thermometers[0].stages[0].label, '가');
  assert.equal(copied.thermometers[0].stages[0].reached, false);
  assert.notEqual(copied.thermometers[0].id, t.id);
  assert.equal(presetThermometer('warning', 'positive').mood, 'negative');
  assert.equal(presetThermometer('blank', 'negative').mood, 'negative');
});

test('liquid colors mix in OKLab from start to end', () => {
  assert.equal(mixColor('#9ED8FF', '#2F7BE0', 0), 'rgb(158 216 255)');
  assert.equal(mixColor('#9ED8FF', '#2F7BE0', 1), 'rgb(47 123 224)');
  assert.match(mixColor('#FFC3A0', '#E5484D', 0.5), /^rgb\(\d+ \d+ \d+\)$/);
  assert.equal(mixColor('#000000', '#FFFFFF', 2), 'rgb(255 255 255)');
  const r = moveTo(makeThermometer(), 2, { ...day(WED), logId: 'fixed' });
  assert.equal(r.events.logId, 'fixed');
  assert.equal(r.t.log.at(-1)?.id, 'fixed');
});
