import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UPDATE_NOTICE_STORE_KEY,
  UPDATE_NOTICE_DISMISSED_UNTIL,
  UPDATE_NOTICE_WINDOW_LABEL,
  getUpdateNoticeWindowOptions,
  getTomorrowStart,
  shouldShowUpdateNotice,
} from './updateNotice.js';

test('공지 숨김 저장 키는 릴리스 버전별로 분리된다', () => {
  assert.match(UPDATE_NOTICE_STORE_KEY, /v5\.0\.0/);
});

test('업데이트 공지는 메인 화면을 덮지 않는 독립 이동 창으로 연다', () => {
  const options = getUpdateNoticeWindowOptions();

  assert.equal(UPDATE_NOTICE_WINDOW_LABEL, 'update-notice');
  assert.equal(options.decorations, false);
  assert.equal(options.transparent, false);
  assert.equal(options.shadow, false);
  assert.equal(options.alwaysOnTop, false);
  assert.equal(options.resizable, true);
  assert.equal(options.skipTaskbar, false);
});

test('저장된 숨김 시각이 없거나 지났으면 공지를 표시한다', () => {
  assert.equal(shouldShowUpdateNotice(undefined, 1000), true);
  assert.equal(shouldShowUpdateNotice(999, 1000), true);
  assert.equal(shouldShowUpdateNotice(1001, 1000), false);
});

test('오늘 그만보기는 다음 날 자정까지 숨긴다', () => {
  const now = new Date(2026, 8, 8, 21, 34, 20, 120);
  const result = new Date(getTomorrowStart(now));

  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 8);
  assert.equal(result.getDate(), 9);
  assert.equal(result.getHours(), 0);
  assert.equal(result.getMinutes(), 0);
  assert.equal(result.getSeconds(), 0);
  assert.equal(result.getMilliseconds(), 0);
});

test('더 이상 보지 않기는 현재 버전 공지를 계속 숨긴다', () => {
  assert.equal(
    shouldShowUpdateNotice(UPDATE_NOTICE_DISMISSED_UNTIL, Date.now()),
    false,
  );
});
