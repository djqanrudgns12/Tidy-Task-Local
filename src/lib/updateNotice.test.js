import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UPDATE_NOTICE_STORE_KEY,
  UPDATE_NOTICE_DISMISSED_UNTIL,
  UPDATE_NOTICE_WINDOW_LABEL,
  UPDATE_NOTICE_WINDOW_SIZE,
  WELCOME_WINDOW_SIZE,
  calculateStartupWindowLayout,
  getUpdateNoticeWindowOptions,
  getWelcomeWindowOptions,
  getTomorrowStart,
  shouldShowUpdateNotice,
} from './updateNotice.js';

// ── 시작 창 배치 (환영 창 + 업데이트 공지 창) ──────────────────────────

// 두 창이 실제로 겹치는지 검사합니다. 겹침 = 가로와 세로가 모두 교차하는 경우.
function overlaps(a, sizeA, b, sizeB) {
  const xOverlap = a.x < b.x + sizeB.width && b.x < a.x + sizeA.width;
  const yOverlap = a.y < b.y + sizeB.height && b.y < a.y + sizeA.height;
  return xOverlap && yOverlap;
}

test('배치: 일반 화면에서는 두 창이 좌우로 나란히 놓이고 절대 겹치지 않는다', () => {
  const layout = calculateStartupWindowLayout({ screenWidth: 1920, screenHeight: 1080 });

  assert.equal(layout.mode, 'side-by-side');
  assert.equal(
    overlaps(layout.welcome, WELCOME_WINDOW_SIZE, layout.notice, UPDATE_NOTICE_WINDOW_SIZE),
    false,
    '두 창이 겹치면 안 됩니다',
  );
  // 환영 창이 왼쪽 (읽는 순서: 환영 → 새 소식)
  assert.ok(layout.welcome.x < layout.notice.x);
});

test('배치: 여러 해상도에서 두 창이 항상 화면 안에 들어온다', () => {
  const screens = [
    [1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160], [1024, 768],
  ];

  for (const [w, h] of screens) {
    const layout = calculateStartupWindowLayout({ screenWidth: w, screenHeight: h });
    for (const [name, size] of [['welcome', WELCOME_WINDOW_SIZE], ['notice', UPDATE_NOTICE_WINDOW_SIZE]]) {
      const pos = layout[name];
      assert.ok(pos.x >= 0, `${w}x${h} ${name}: x가 음수입니다 (${pos.x})`);
      assert.ok(pos.y >= 0, `${w}x${h} ${name}: y가 음수입니다 (${pos.y})`);
      assert.ok(pos.x + size.width <= w, `${w}x${h} ${name}: 오른쪽으로 벗어났습니다`);
      assert.ok(pos.y + size.height <= h, `${w}x${h} ${name}: 아래로 벗어났습니다`);
    }
  }
});

test('배치: 창의 실제 바깥 크기가 지정값보다 커도 겹치지 않는다', () => {
  // 실측: width 320으로 만든 환영 창의 실제 바깥 너비는 333px(그림자·테두리 포함).
  // 이 오차를 감안해도 두 창이 붙어 보이지 않아야 합니다.
  const REAL_BORDER_SLOP = 15;
  const layout = calculateStartupWindowLayout({ screenWidth: 1920, screenHeight: 1080 });

  const welcomeRealRight = layout.welcome.x + WELCOME_WINDOW_SIZE.width + REAL_BORDER_SLOP;
  const visibleGap = layout.notice.x - welcomeRealRight;

  assert.ok(visibleGap > 0, `실제 크기 기준으로 겹칩니다 (간격 ${visibleGap}px)`);
  // 눈으로 "떨어져 있다"고 인식되려면 최소 20px은 필요합니다.
  assert.ok(visibleGap >= 20, `간격이 너무 좁아 붙어 보입니다 (${visibleGap}px)`);
});

test('배치: 묶음 전체가 화면 가로 중앙에 놓인다', () => {
  const layout = calculateStartupWindowLayout({ screenWidth: 1920, screenHeight: 1080 });
  const left = layout.welcome.x;
  const right = layout.notice.x + UPDATE_NOTICE_WINDOW_SIZE.width;
  const leftGap = left;
  const rightGap = 1920 - right;
  // 좌우 여백이 거의 같아야 "가운데 놓였다"고 할 수 있습니다(반올림 오차 2px 허용).
  assert.ok(Math.abs(leftGap - rightGap) <= 2, `좌:${leftGap} 우:${rightGap}`);
});

test('배치: 가로로 좁은 화면에서는 계단식으로 어긋나게 놓는다', () => {
  // 두 창 너비 합(320+24+430=774)보다 좁은 화면
  const layout = calculateStartupWindowLayout({ screenWidth: 700, screenHeight: 900 });

  assert.equal(layout.mode, 'cascade');
  // 완전히 같은 자리에 포개지면 안 됩니다.
  assert.ok(
    layout.welcome.x !== layout.notice.x || layout.welcome.y !== layout.notice.y,
    '계단식 배치인데 좌표가 동일합니다',
  );
});

test('배치: 화면 크기를 못 읽으면 null을 돌려 중앙 정렬로 안전하게 되돌아간다', () => {
  assert.equal(calculateStartupWindowLayout({ screenWidth: 0, screenHeight: 0 }), null);
  assert.equal(calculateStartupWindowLayout({}), null);
  assert.equal(calculateStartupWindowLayout(), null);
});

test('창 옵션: 좌표를 주면 그 자리에, 안 주면 중앙 정렬로 만든다', () => {
  const placed = getUpdateNoticeWindowOptions({ x: 100, y: 200 });
  assert.equal(placed.x, 100);
  assert.equal(placed.y, 200);
  assert.equal(placed.center, undefined);

  const centered = getUpdateNoticeWindowOptions(null);
  assert.equal(centered.center, true);
  assert.equal(centered.x, undefined);

  const welcome = getWelcomeWindowOptions({ x: 10, y: 20 });
  assert.equal(welcome.x, 10);
  assert.equal(getWelcomeWindowOptions().center, true);
});

test('창 옵션: 잘못된 좌표는 무시하고 중앙 정렬로 되돌아간다', () => {
  for (const bad of [{ x: NaN, y: 0 }, { x: 0 }, { x: 'a', y: 'b' }]) {
    assert.equal(getUpdateNoticeWindowOptions(bad).center, true);
  }
});

test('창 옵션: 환영 창과 공지 창은 크기 상수와 일치한다', () => {
  const notice = getUpdateNoticeWindowOptions();
  assert.equal(notice.width, UPDATE_NOTICE_WINDOW_SIZE.width);
  assert.equal(notice.height, UPDATE_NOTICE_WINDOW_SIZE.height);

  const welcome = getWelcomeWindowOptions();
  assert.equal(welcome.width, WELCOME_WINDOW_SIZE.width);
  assert.equal(welcome.height, WELCOME_WINDOW_SIZE.height);
});

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
