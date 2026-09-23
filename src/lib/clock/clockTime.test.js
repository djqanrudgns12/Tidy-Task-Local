import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  clockParts,
  displayTime,
  displayDate,
  handAngles,
  nextRotation,
  KST_OFFSET_MS,
} from './clockTime.js';

/** 한국 시각 문자열 → 유닉스 ms
 * @param {string} iso */
const kst = (iso) => Date.parse(`${iso}+09:00`);

test('UTC 자정은 한국 오전 9시이고, PC 시간대와 상관없이 같다', () => {
  const parts = clockParts(Date.UTC(2026, 8, 23, 0, 0, 0));
  assert.equal(parts.hours, 9);
  assert.equal(parts.day, 23);
  assert.equal(KST_OFFSET_MS, 32_400_000);
  // 다른 시간대의 PC에서도 같은 결과여야 합니다. 새 프로세스를 시간대를 바꿔 띄워 확인합니다.
  const moduleUrl = new URL('./clockTime.js', import.meta.url).href;
  const script = `import(${JSON.stringify(moduleUrl)}).then(m => console.log(JSON.stringify(m.clockParts(${Date.UTC(2026, 8, 23, 15, 30, 5)}))))`;
  for (const TZ of ['America/New_York', 'UTC', 'Asia/Kolkata']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ },
      cwd: fileURLToPath(new URL('.', import.meta.url)),
    });
    assert.deepEqual(JSON.parse(String(out)), {
      year: 2026, month: 9, day: 24, weekday: 4, hours: 0, minutes: 30, seconds: 5, milliseconds: 0,
    }, TZ);
  }
});

test('12시간제: 자정은 오전 12시, 정오는 오후 12시', () => {
  /** @param {string} iso @param {{hour12?:boolean, showSeconds?:boolean}} [options] */
  const at = (iso, options) => displayTime(clockParts(kst(iso)), options);
  assert.equal(at('2026-09-23T00:00:00').text, '오전 12:00:00');
  assert.equal(at('2026-09-23T00:05:07', { showSeconds: false }).text, '오전 12:05');
  assert.equal(at('2026-09-23T11:59:59').text, '오전 11:59:59');
  assert.equal(at('2026-09-23T12:00:00').text, '오후 12:00:00');
  assert.equal(at('2026-09-23T23:59:59').text, '오후 11:59:59');
  assert.deepEqual(at('2026-09-23T21:05:07').hourDigits, [null, 9]);
  assert.deepEqual(at('2026-09-23T10:30:41').hourDigits, [1, 0]);
});

test('24시간제는 앞자리 0을 채우고 오전·오후가 없다', () => {
  const view = displayTime(clockParts(kst('2026-09-23T09:05:07')), { hour12: false });
  assert.equal(view.meridiem, null);
  assert.equal(view.text, '09:05:07');
  assert.deepEqual(view.hourDigits, [0, 9]);
  assert.deepEqual(view.secondDigits, [0, 7]);
  const night = displayTime(clockParts(kst('2026-09-23T23:59:00')), { hour12: false, showSeconds: false });
  assert.equal(night.text, '23:59');
  assert.equal(night.secondDigits, null);
});

test('날짜와 요일: 일주일, 월말, 윤년, 자정 넘김', () => {
  const names = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  for (let i = 0; i < 7; i++) {
    const date = displayDate(clockParts(kst(`2026-09-${String(20 + i).padStart(2, '0')}T12:00:00`)));
    assert.equal(date.weekday, names[i]);
    assert.equal(date.weekend, i === 0 ? 'sun' : i === 6 ? 'sat' : null);
  }
  assert.equal(displayDate(clockParts(kst('2026-09-23T10:00:00'))).text, '9월 23일 수요일');
  assert.equal(displayDate(clockParts(kst('2028-02-29T00:00:00'))).text, '2월 29일 화요일');
  assert.equal(displayDate(clockParts(kst('2026-12-31T23:59:59'))).text, '12월 31일 목요일');
  // 1초 뒤 = 새해. 날짜 열쇠가 바뀌어 화면이 같은 틱에 날짜를 바꿉니다.
  const newYear = displayDate(clockParts(kst('2026-12-31T23:59:59') + 1000));
  assert.equal(newYear.text, '1월 1일 금요일');
  assert.notEqual(newYear.key, displayDate(clockParts(kst('2026-12-31T23:59:59'))).key);
});

test('바늘 각도: 시침은 분에 따라 이어서 움직인다', () => {
  /** @param {string} iso */
  const angle = (iso) => handAngles(clockParts(kst(iso)));
  assert.deepEqual(angle('2026-09-23T15:00:00'), { hour: 90, minute: 0, second: 0 });
  assert.deepEqual(angle('2026-09-23T06:30:00'), { hour: 195, minute: 180, second: 0 });
  assert.deepEqual(angle('2026-09-23T00:00:00'), { hour: 0, minute: 0, second: 0 });
  const half = angle('2026-09-23T03:30:30');
  assert.equal(half.hour, 105.25); // 3과 4의 한가운데에서 조금 더
  assert.equal(half.minute, 183);
  assert.equal(half.second, 180);
});

test('바늘은 앞으로만 돌고, 크게 건너뛰면 돌지 않고 옮긴다', () => {
  let step = nextRotation(null, 354);
  assert.deepEqual(step, { rotation: 354, animate: false });
  step = nextRotation(step.rotation, 0); // 59초 → 0초
  assert.deepEqual(step, { rotation: 360, animate: true });
  step = nextRotation(step.rotation, 6);
  assert.deepEqual(step, { rotation: 366, animate: true });
  assert.deepEqual(nextRotation(366, 6), { rotation: 366, animate: false });
  // 표준시 보정으로 1초 뒤로 가면 거꾸로 돌지 않고 제자리로 옮깁니다.
  assert.deepEqual(nextRotation(366, 0), { rotation: 0, animate: false });
  // 절전 뒤 크게 건너뛰기
  assert.deepEqual(nextRotation(90, 270), { rotation: 270, animate: false });
});

test('숫자가 아닌 시각은 거부한다', () => {
  assert.throws(() => clockParts(NaN));
  assert.throws(() => clockParts(Infinity));
});
