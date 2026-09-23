import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimeSync,
  describeSync,
  describeDifference,
  formatDuration,
  validateMeasurement,
  RESYNC_MS,
  RETRY_MS,
  SKEW_POLL_MS,
} from './timeSync.js';

/** @param {number} offsetMs @param {Record<string, unknown>} [extra] @returns {import('./timeSync.js').Measurement} */
const ntp = (offsetMs, extra = {}) => /** @type {any} */ ({
  offsetMs, uncertaintyMs: 12, source: 'ntp', server: 'time.kriss.re.kr', agreeing: 4, responded: 4, wallSkewMs: 1000, ...extra,
});

/** 가짜 환경: 시계·타이머·측정 결과·부팅 카운터를 손으로 조절합니다. */
/** @param {{results?: unknown[]}} [options] */
function harness({ results = [] } = {}) {
  const env = {
    wall: 1_790_133_180_000,
    mono: 0,
    timers: /** @type {{at:number,fn:()=>void,id:number}[]} */ ([]),
    id: 1,
    measureCalls: 0,
    results: [...results],
    skew: 1000,
    states: /** @type {any[]} */ ([]),
  };
  const sync = createTimeSync({
    measure: async () => {
      env.measureCalls++;
      const next = env.results.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new Error('응답 없음');
      return next;
    },
    readSkew: async () => env.skew,
    wallNow: () => env.wall,
    monotonic: () => env.mono,
    setTimer: (fn, ms) => {
      const id = env.id++;
      env.timers.push({ at: env.mono + ms, fn, id });
      return id;
    },
    clearTimer: (id) => {
      env.timers = env.timers.filter((t) => t.id !== id);
    },
    onChange: (state) => env.states.push(state),
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    env,
    sync,
    flush,
    /** 시간을 흘리며 만기된 타이머를 실행합니다.
     * @param {number} ms */
    async advance(ms) {
      const end = env.mono + ms;
      for (;;) {
        env.timers.sort((a, b) => a.at - b.at);
        const next = env.timers[0];
        if (!next || next.at > end) break;
        env.timers.shift();
        env.wall += next.at - env.mono;
        env.mono = next.at;
        next.fn();
        await flush();
      }
      env.wall += end - env.mono;
      env.mono = end;
      await flush();
    },
  };
}

test('시작하면 바로 재고, 표준시 = PC 시각 + 보정값', async () => {
  const h = harness({ results: [ntp(2687)] });
  h.sync.start();
  await h.flush();
  assert.equal(h.env.measureCalls, 1);
  assert.equal(h.sync.now(), h.env.wall + 2687);
  assert.equal(h.sync.snapshot().checking, false);
  assert.equal(describeSync(h.sync.snapshot(), h.sync.now()).tone, 'ok');
});

test('성공하면 1시간 뒤, 실패하면 점점 길게 다시 잰다', async () => {
  const h = harness({ results: [ntp(2600), new Error('막힘'), new Error('막힘'), ntp(2650)] });
  h.sync.start();
  await h.flush();
  await h.advance(RESYNC_MS - 1);
  assert.equal(h.env.measureCalls, 1);
  await h.advance(1);
  assert.equal(h.env.measureCalls, 2); // 실패
  // 실패해도 이전 보정값은 그대로 씁니다.
  assert.equal(h.sync.now(), h.env.wall + 2600);
  await h.advance(RETRY_MS[0]);
  assert.equal(h.env.measureCalls, 3); // 또 실패
  await h.advance(RETRY_MS[1] - 1);
  assert.equal(h.env.measureCalls, 3);
  await h.advance(1);
  assert.equal(h.env.measureCalls, 4);
  assert.equal(h.sync.now(), h.env.wall + 2650);
  assert.equal(h.sync.snapshot().error, null);
});

test('측정 오차 안의 흔들림은 반영하지 않는다', async () => {
  const h = harness({ results: [ntp(2600), ntp(2608), ntp(2640)] });
  h.sync.start();
  await h.flush();
  await h.advance(RESYNC_MS);
  assert.equal(h.sync.now() - h.env.wall, 2600); // 8ms 차이 < 오차 12ms
  await h.advance(RESYNC_MS);
  assert.equal(h.sync.now() - h.env.wall, 2640);
});

test('PC 시각이 바뀌면 보정값을 고쳐 화면 시각이 끊기지 않고, 곧바로 다시 잰다', async () => {
  const h = harness({ results: [ntp(2600), ntp(2)] });
  h.sync.start();
  await h.flush();
  const before = h.sync.now();
  // Windows가 PC 시각을 2.598초 앞당김(표준시는 그대로). 인터넷이 없어도 1분 안에 맞춰야 합니다.
  h.env.wall += 2598;
  h.env.skew += 2598;
  assert.equal(h.sync.now(), before + 2598); // 아직 모름
  await h.advance(SKEW_POLL_MS);
  assert.equal(h.sync.now(), before + SKEW_POLL_MS); // 이어짐
  assert.equal(h.env.measureCalls, 2); // 곧바로 다시 잼
  assert.equal(h.sync.now() - h.env.wall, 2);
});

test('절전 복귀(카운터 그대로)는 보정값을 지키고 다시 재기만 한다', async () => {
  const h = harness({ results: [ntp(2600), ntp(2601)] });
  h.sync.start();
  await h.flush();
  h.env.mono += 20_000; // 틱 이상이 오기까지
  h.env.wall += 3_600_000; // 1시간 절전: 벽시계와 절전 포함 카운터가 함께 흐름
  await h.sync.disturbance('late');
  assert.equal(h.env.measureCalls, 2);
  assert.equal(h.sync.now() - h.env.wall, 2600); // 1ms 차이는 오차 안
});

test('자동 재측정은 10초 안에 몰리지 않는다', async () => {
  const h = harness({ results: [ntp(2600), ntp(2600), ntp(2600)] });
  h.sync.start();
  await h.flush();
  await h.sync.disturbance('late');
  await h.sync.disturbance('late');
  assert.equal(h.env.measureCalls, 1);
  await h.advance(10_000);
  assert.equal(h.env.measureCalls, 2);
  // 사용자가 누르면 바로 잽니다.
  await h.sync.syncNow();
  assert.equal(h.env.measureCalls, 3);
});

test('끄면 PC 시각으로 돌아가고 늦게 온 결과가 끼어들지 않는다', async () => {
  let release = () => {};
  const h = harness();
  const sync = createTimeSync({
    measure: () => new Promise((resolve) => { release = () => resolve(ntp(5000)); }),
    wallNow: () => h.env.wall,
    monotonic: () => h.env.mono,
    setTimer: () => 0,
    clearTimer: () => {},
  });
  sync.start();
  sync.setEnabled(false);
  release();
  await h.flush();
  assert.equal(sync.now(), h.env.wall);
  assert.equal(describeSync(sync.snapshot(), sync.now()).tone, 'off');
});

test('멈췄다 다시 시작하면 새로 잰다', async () => {
  const h = harness({ results: [ntp(100), ntp(200)] });
  h.sync.start();
  h.sync.stop();
  await h.flush();
  h.sync.start();
  await h.flush();
  assert.equal(h.env.measureCalls, 2);
  assert.equal(h.sync.now() - h.env.wall, 200);
});

test('믿을 수 없는 측정 결과는 거부한다', () => {
  assert.throws(() => validateMeasurement(null));
  assert.throws(() => validateMeasurement({ ...ntp(NaN) }));
  assert.throws(() => validateMeasurement({ ...ntp(10), source: 'guess' }));
  assert.throws(() => validateMeasurement(ntp(13 * 3_600_000, { agreeing: 1 })));
  assert.ok(validateMeasurement(ntp(13 * 3_600_000, { agreeing: 2 })));
});

test('출처 칩 문구', () => {
  const now = 1_790_133_180_000;
  const base = { enabled: true, checking: false, offsetMs: 2687, measurement: ntp(2687), checkedAt: now, error: null };
  const ok = describeSync(base, now + 60_000);
  assert.equal(ok.label, '표준시');
  assert.match(ok.detail, /^PC 시각이 2\.7초 느려요 · 한국표준과학연구원 · 오후 12:13 확인$/);
  const stale = describeSync(base, now + 5 * 3_600_000 + 12 * 60_000);
  assert.equal(stale.tone, 'stale');
  assert.equal(stale.label, '표준시 · 5시간 전 확인');
  assert.equal(describeSync({ ...base, measurement: null, checking: true }, now).tone, 'busy');
  assert.equal(describeSync({ ...base, measurement: null }, now).label, 'PC 시각');
  const http = describeSync({ ...base, measurement: ntp(-192_000, { source: 'http', server: 'www.cloudflare.com' }), offsetMs: -192_000 }, now);
  assert.match(http.detail, /^PC 시각이 3분 12초 빨라요 · Cloudflare 응답 시각\(보안 연결 없이\)/);
});

test('차이와 기간 표기', () => {
  assert.equal(describeDifference(20), 'PC 시각과 같아요');
  assert.equal(describeDifference(2687), 'PC 시각이 2.7초 느려요');
  assert.equal(formatDuration(42_400), '42초');
  assert.equal(formatDuration(3_600_000), '1시간');
  assert.equal(formatDuration(26 * 3_600_000), '1일 2시간');
});
