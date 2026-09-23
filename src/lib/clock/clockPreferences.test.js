import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOCK_TITLE_MAX,
  defaultClockPreferences,
  normalizeClockPreferences,
  sanitizeTitle,
  isValidTitle,
  isValidClockField,
} from './clockPreferences.js';

test('기본값: 디지털, 시:분:초, 12시간제, 표준시 맞춤 켜짐', () => {
  assert.deepEqual(normalizeClockPreferences(undefined), defaultClockPreferences());
  assert.deepEqual(defaultClockPreferences(), {
    face: 'digital', showSeconds: true, hour12: true, title: '', titleHidden: false,
    standardTimeSync: true, analogCaption: true, analogMinuteNumbers: false,
  });
});

test('잘못된 항목만 기본값으로 돌리고 나머지는 지킨다', () => {
  const read = normalizeClockPreferences({
    face: 'sundial', showSeconds: false, hour12: 'no', title: '3학년 2반', analogMinuteNumbers: true, extra: 1,
  });
  assert.equal(read.face, 'digital');
  assert.equal(read.showSeconds, false);
  assert.equal(read.hour12, true);
  assert.equal(read.title, '3학년 2반');
  assert.equal(read.analogMinuteNumbers, true);
  assert.equal('extra' in read, false);
});

test('제목 30자 경계: 코드포인트로 센다(이모지 1개 = 1자)', () => {
  const thirty = '가'.repeat(CLOCK_TITLE_MAX);
  assert.equal(isValidTitle(thirty), true);
  assert.equal(isValidTitle(thirty + '나'), false);
  const emoji = '⏰'.repeat(29) + '🦊';
  assert.equal([...emoji].length, 30);
  assert.equal(isValidTitle(emoji), true);
  assert.equal(sanitizeTitle(emoji + '🐰'), emoji);
  assert.equal(normalizeClockPreferences({ title: thirty + '나' }).title, '');
});

test('제어 문자는 거부하고, 다듬을 때는 지운다', () => {
  assert.equal(isValidTitle('시험\n종료'), false);
  assert.equal(isValidTitle('탭\t'), false);
  assert.equal(sanitizeTitle('시험\n종료\u0007'), '시험종료');
  assert.equal(sanitizeTitle(null), '');
  assert.equal(isValidClockField('title', 42), false);
  assert.equal(isValidClockField('unknown', true), false);
  assert.equal(isValidClockField('face', 'analog'), true);
});
