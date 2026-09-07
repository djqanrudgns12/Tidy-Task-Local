export const UPDATE_NOTICE_ID = 'v5.0.0';
export const UPDATE_NOTICE_WINDOW_LABEL = 'update-notice';
export const UPDATE_NOTICE_STORE_KEY = `update-notice:${UPDATE_NOTICE_ID}:hidden-until`;
export const UPDATE_NOTICE_DISMISSED_UNTIL = Number.MAX_SAFE_INTEGER;

// 두 창의 기본 크기. 배치 계산과 창 생성이 같은 값을 보도록 한곳에 모읍니다.
export const WELCOME_WINDOW_SIZE = Object.freeze({ width: 320, height: 480 });
export const UPDATE_NOTICE_WINDOW_SIZE = Object.freeze({ width: 430, height: 650 });

// 두 창 사이의 간격(px).
// 왜 40px인가: 실측해 보니 창의 실제 바깥 크기가 지정한 width보다 큽니다.
//   (예: width 320으로 만든 환영 창의 실제 바깥 너비는 333px — 그림자/테두리가 붙습니다)
//   지정값만 믿고 간격을 좁게 잡으면 화면에서는 두 창이 거의 붙어 보이므로,
//   그 오차(약 13px)를 흡수하고도 눈에 띄는 여백이 남도록 넉넉히 잡습니다.
export const WINDOW_PAIR_GAP = 40;

// 화면 가장자리에서 최소한 이만큼은 떨어뜨립니다(작업 표시줄·모서리에 걸치는 것 방지).
export const SCREEN_EDGE_MARGIN = 16;

// ═══════════════════════════════════════════════════════════════════════
// [환영 창 + 업데이트 공지 창 동시 배치]
//
// 왜 필요한가:
//   예전에는 두 창 모두 center:true 라서 화면 정중앙에 완전히 포개졌습니다.
//   그래서 "기존 사용자에게만 공지를 띄운다"는 배타 조건으로 겹침을 피하고 있었고,
//   결과적으로 신규 사용자는 업데이트 공지를 영영 볼 수 없었습니다.
//   이제 둘을 나란히 놓아 두 창이 함께 떠도 서로 가리지 않게 합니다.
//
// 배치 규칙:
//   · 두 창을 하나의 묶음으로 보고, 그 묶음 전체를 화면 중앙에 놓습니다.
//   · 왼쪽 = 환영 창(먼저 읽을 것), 오른쪽 = 업데이트 공지(그다음 읽을 것).
//     한국어 사용자의 좌→우 읽기 순서와 "환영 → 새 소식" 흐름이 일치합니다.
//   · 세로는 각자 중앙 정렬합니다. 높이가 달라도 시선이 한 줄에 모입니다.
//   · 화면이 좁아 가로로 못 놓으면 세로로 살짝 어긋나게(계단식) 놓습니다.
//     완전히 겹치는 것보다 어긋나게 두는 편이 두 창의 존재를 알아채기 쉽습니다.
// ═══════════════════════════════════════════════════════════════════════
export function calculateStartupWindowLayout({
  screenWidth,
  screenHeight,
  welcome = WELCOME_WINDOW_SIZE,
  notice = UPDATE_NOTICE_WINDOW_SIZE,
  gap = WINDOW_PAIR_GAP,
  margin = SCREEN_EDGE_MARGIN,
} = {}) {
  const sw = Number(screenWidth) || 0;
  const sh = Number(screenHeight) || 0;

  // 화면 크기를 못 읽었으면 배치를 포기하고 각자 중앙에 두게 합니다(기존 동작으로 안전 복귀).
  if (sw <= 0 || sh <= 0) return null;

  // 화면 안으로 눌러 담는 보조 함수. 좌표가 화면 밖으로 나가는 일을 원천 차단합니다.
  const clamp = (value, size, total) => {
    const max = total - size - margin;
    if (max <= margin) return Math.max(0, Math.round((total - size) / 2));
    return Math.round(Math.min(Math.max(value, margin), max));
  };

  const pairWidth = welcome.width + gap + notice.width;

  // ── 가로 배치가 가능한 경우 (일반적인 데스크톱) ──
  if (pairWidth + margin * 2 <= sw) {
    const startX = Math.round((sw - pairWidth) / 2);
    return {
      mode: 'side-by-side',
      welcome: {
        x: clamp(startX, welcome.width, sw),
        y: clamp(Math.round((sh - welcome.height) / 2), welcome.height, sh),
      },
      notice: {
        x: clamp(startX + welcome.width + gap, notice.width, sw),
        y: clamp(Math.round((sh - notice.height) / 2), notice.height, sh),
      },
    };
  }

  // ── 화면이 좁은 경우: 계단식으로 어긋나게 배치 ──
  // 왜 완전히 포개지 않는가: 뒤 창이 조금이라도 보여야 "창이 두 개구나"를 알아챌 수 있습니다.
  const offset = Math.max(24, Math.round(Math.min(sw, sh) * 0.05));
  const noticeX = Math.round((sw - notice.width) / 2);
  const noticeY = Math.round((sh - notice.height) / 2);

  return {
    mode: 'cascade',
    notice: {
      x: clamp(noticeX, notice.width, sw),
      y: clamp(noticeY, notice.height, sh),
    },
    welcome: {
      x: clamp(noticeX - offset, welcome.width, sw),
      y: clamp(noticeY - offset, welcome.height, sh),
    },
  };
}

export function getUpdateNoticeWindowOptions(position = null) {
  const options = {
    url: 'index.html',
    title: `Tidy Task ${UPDATE_NOTICE_ID} 업데이트`,
    width: UPDATE_NOTICE_WINDOW_SIZE.width,
    height: UPDATE_NOTICE_WINDOW_SIZE.height,
    minWidth: 320,
    minHeight: 460,
    decorations: false,
    transparent: false,
    backgroundColor: '#fffdf8',
    shadow: false,
    alwaysOnTop: false,
    visible: false,
    resizable: true,
    maximizable: false,
    skipTaskbar: false,
  };

  // 배치 좌표를 받은 경우에만 직접 지정하고, 없으면 기존처럼 화면 중앙에 둡니다.
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    options.x = position.x;
    options.y = position.y;
  } else {
    options.center = true;
  }

  return options;
}

export function getWelcomeWindowOptions(position = null) {
  const options = {
    url: 'index.html',
    title: 'Welcome to Tidy Task',
    width: WELCOME_WINDOW_SIZE.width,
    height: WELCOME_WINDOW_SIZE.height,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    visible: true,
    resizable: false,
    skipTaskbar: false,
  };

  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    options.x = position.x;
    options.y = position.y;
  } else {
    options.center = true;
  }

  return options;
}

export function shouldShowUpdateNotice(hiddenUntil, now = Date.now()) {
  return !Number.isFinite(hiddenUntil) || hiddenUntil <= now;
}

export function getTomorrowStart(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}
