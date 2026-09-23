import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicker, delayToNextSecond, BOUNDARY_LEAD_MS } from './ticker.js';

test('다음 초 경계 바로 뒤까지 기다린다', () => {
  assert.equal(delayToNextSecond(1_000_000_000_000), 1000 + BOUNDARY_LEAD_MS);
  assert.equal(delayToNextSecond(1_000_000_000_250), 750 + BOUNDARY_LEAD_MS);
  assert.equal(delayToNextSecond(1_000_000_000_995), 5 + BOUNDARY_LEAD_MS);
  // 음수 시각(고장 난 PC)도 경계를 바르게 계산합니다.
  assert.equal(delayToNextSecond(-250), 250 + BOUNDARY_LEAD_MS);
});

/** 가짜 시계: 벽시계·단조 시계·타이머를 손으로 돌립니다. */
function fakeClock(start = 1_790_133_180_400) {
  const clock = { wall: start, mono: 0, timers: /** @type {{at:number,fn:()=>void,id:number}[]} */ ([]), nextId: 1 };
  return {
    clock,
    wallNow: () => clock.wall,
    monotonic: () => clock.mono,
    setTimer: (/** @type {()=>void} */ fn, /** @type {number} */ ms) => {
      const id = clock.nextId++;
      clock.timers.push({ at: clock.mono + ms, fn, id });
      return id;
    },
    clearTimer: (/** @type {number} */ id) => {
      clock.timers = clock.timers.filter((t) => t.id !== id);
    },
    /** 단조 시계와 벽시계를 함께 ms만큼 흘립니다(타이머가 제때 깨어남). */
    advance(/** @type {number} */ ms) {
      const end = clock.mono + ms;
      for (;;) {
        clock.timers.sort((a, b) => a.at - b.at);
        const next = clock.timers[0];
        if (!next || next.at > end) break;
        clock.timers.shift();
        clock.wall += next.at - clock.mono;
        clock.mono = next.at;
        next.fn();
      }
      clock.wall += end - clock.mono;
      clock.mono = end;
    },
  };
}

test('매초 한 번씩, 초가 바뀐 직후에 그리며 밀림이 쌓이지 않는다', () => {
  const fake = fakeClock();
  /** @type {number[]} */
  const seconds = [];
  const ticker = createTicker({ ...fake, now: fake.wallNow, onTick: (t) => seconds.push(Math.floor(t / 1000)) });
  ticker.start();
  fake.advance(3600 * 1000);
  ticker.stop();
  // 1시간 = 3601번(시작 직후 1번 포함). 건너뛴 초도, 두 번 그린 초도 없어야 합니다.
  assert.equal(seconds.length, 3601);
  for (let i = 1; i < seconds.length; i++) assert.equal(seconds[i] - seconds[i - 1], 1);
});

test('PC 시각이 바뀌면 알리고, 그다음 틱은 새 시각의 초 경계에 맞춘다', () => {
  const fake = fakeClock();
  /** @type {[string, number][]} */
  const reasons = [];
  /** @type {number[]} */
  const shown = [];
  const ticker = createTicker({
    ...fake,
    now: fake.wallNow,
    onTick: (t) => shown.push(t),
    onDisturbance: (reason, amount) => reasons.push([reason, Math.round(amount)]),
  });
  ticker.start();
  fake.advance(2500);
  fake.clock.wall += 180_000 + 333; // 누군가 PC 시각을 3분 0.333초 앞당김
  fake.advance(1000);
  assert.deepEqual(reasons, [['wall-jump', 180_333]]);
  const last = shown[shown.length - 1];
  // 다음 예약이 새 시각 기준 초 경계 뒤 BOUNDARY_LEAD_MS 이내에 깨어나도록 잡혀야 합니다.
  fake.advance(1000);
  const next = shown[shown.length - 1];
  assert.ok(next % 1000 <= BOUNDARY_LEAD_MS + 1, String(next % 1000));
  assert.ok(next > last);
  ticker.stop();
});

test('절전처럼 틱이 한참 늦으면 "late"를 알린다', () => {
  const fake = fakeClock();
  /** @type {string[]} */
  const reasons = [];
  const ticker = createTicker({ ...fake, now: fake.wallNow, onTick: () => {}, onDisturbance: (r) => reasons.push(r) });
  ticker.start();
  // 타이머가 깨어나지 못한 채 5초가 흐름(벽시계와 단조 시계 모두)
  const pending = fake.clock.timers[0];
  fake.clock.timers = [];
  fake.clock.mono += 5000;
  fake.clock.wall += 5000;
  pending.fn();
  assert.deepEqual(reasons, ['late']);
  ticker.stop();
});

test('그리기에서 오류가 나도 시계는 멈추지 않는다', () => {
  const fake = fakeClock();
  let calls = 0;
  /** @type {unknown[]} */
  const errors = [];
  const ticker = createTicker({
    ...fake,
    now: fake.wallNow,
    onTick: () => {
      calls++;
      if (calls === 2) throw new Error('그리기 실패');
    },
    onError: (e) => errors.push(e),
  });
  ticker.start();
  fake.advance(5000);
  assert.equal(errors.length, 1);
  assert.ok(calls >= 5);
  ticker.stop();
});

test('refresh는 즉시 다시 그리고 늦은 틱으로 오해하지 않으며, stop 뒤에는 아무것도 하지 않는다', () => {
  const fake = fakeClock();
  let calls = 0;
  /** @type {string[]} */
  const reasons = [];
  const ticker = createTicker({ ...fake, now: fake.wallNow, onTick: () => calls++, onDisturbance: (r) => reasons.push(r) });
  ticker.start();
  fake.clock.mono += 60_000; // 창이 숨어 있던 1분
  fake.clock.wall += 60_000;
  ticker.refresh();
  assert.equal(calls, 2);
  assert.deepEqual(reasons, []);
  assert.equal(fake.clock.timers.length, 1);
  ticker.stop();
  assert.equal(fake.clock.timers.length, 0);
  ticker.refresh();
  fake.advance(5000);
  assert.equal(calls, 2);
});
