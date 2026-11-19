import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MENU_HEIGHT,
  normalizeActionPayload,
  normalizeClosedPayload,
  normalizeOpenPayload,
  normalizeSyncPayload,
  placeDdayWidgetMenu,
  returnsFocusToWidget,
  sanitizeThemeStyle,
} from './ddayWidgetMenuProtocol.js';

const MONITORS = [
  {
    bounds: { x: 0, y: 0, width: 3840, height: 2160 },
    work: { x: 0, y: 0, width: 3840, height: 2080 },
    scale: 2,
  },
  {
    bounds: { x: 3840, y: 0, width: 1920, height: 1080 },
    work: { x: 3840, y: 0, width: 1920, height: 1040 },
    scale: 1,
  },
];

test('placeDdayWidgetMenu prefers right -> left -> below -> above -> overlay and handles mixed DPI monitors', () => {
  // 1) FHD(100%) 중앙 위젯: 오른쪽 배치 우선
  const rightPlace = placeDdayWidgetMenu({
    anchor: { x: 4040, y: 200, width: 236, height: 256 },
    size: { width: 264, height: 420 },
    monitors: MONITORS,
  });
  assert.equal(rightPlace.side, 'right');
  assert.equal(rightPlace.scale, 1);
  assert.equal(rightPlace.x, 4040 + 236 + 8);
  assert.equal(rightPlace.y, 200);
  assert.equal(rightPlace.maxLogicalHeight, MAX_MENU_HEIGHT);

  // 2) FHD 우측 끝 위젯: 오른쪽 부족 → 왼쪽 반전
  const leftPlace = placeDdayWidgetMenu({
    anchor: { x: 3840 + 1920 - 250, y: 180, width: 236, height: 256 },
    size: { width: 264, height: 420 },
    monitors: MONITORS,
  });
  assert.equal(leftPlace.side, 'left');
  assert.equal(leftPlace.x, 3840 + 1920 - 250 - 8 - 264);

  // 3) 좌우 모두 좁은 화면(500px 폭): below → 위쪽 공간만 있으면 above → 아예 좁으면 overlay
  const narrowMonitor = [{
    bounds: { x: 0, y: 0, width: 500, height: 800 },
    work: { x: 0, y: 0, width: 500, height: 760 },
    scale: 1,
  }];
  const belowPlace = placeDdayWidgetMenu({
    anchor: { x: 130, y: 40, width: 236, height: 220 },
    size: { width: 264, height: 400 },
    monitors: narrowMonitor,
  });
  assert.equal(belowPlace.side, 'below');
  assert.equal(belowPlace.y, 40 + 220 + 8);

  const abovePlace = placeDdayWidgetMenu({
    anchor: { x: 130, y: 480, width: 236, height: 220 },
    size: { width: 264, height: 400 },
    monitors: narrowMonitor,
  });
  assert.equal(abovePlace.side, 'above');
  assert.equal(abovePlace.y, 480 - 8 - 400);

  const tinyMonitor = [{
    bounds: { x: 0, y: 0, width: 420, height: 400 },
    work: { x: 0, y: 0, width: 420, height: 400 },
    scale: 1,
  }];
  const overlayPlace = placeDdayWidgetMenu({
    anchor: { x: 80, y: 70, width: 236, height: 256 },
    size: { width: 264, height: 320 },
    monitors: tinyMonitor,
  });
  assert.equal(overlayPlace.side, 'overlay');
  assert.ok(overlayPlace.x >= 8 && overlayPlace.x + overlayPlace.width <= 412);
  assert.ok(overlayPlace.y >= 8 && overlayPlace.y + overlayPlace.height <= 392);
  assert.equal(overlayPlace.maxLogicalHeight, 384);

  // 4) 4K 200% 주 모니터에서 물리 크기 2배 계산
  const hiDpi = placeDdayWidgetMenu({
    anchor: { x: 200, y: 200, width: 472, height: 512 },
    size: { width: 268, height: 440 },
    monitors: MONITORS,
  });
  assert.equal(hiDpi.scale, 2);
  assert.equal(hiDpi.side, 'right');
  assert.equal(hiDpi.width, 536);
  assert.equal(hiDpi.height, 880);
  assert.equal(hiDpi.x, 200 + 472 + 16);
});

test('protocol validators normalize valid payloads and reject malformed or injected inputs', () => {
  const validState = {
    prefs: {
      skin: 'w4',
      appearanceMode: 'auto',
      displayScope: 'main',
      hiddenIds: ['main:d1'],
      alwaysOnTop: true,
      autoOpen: false,
      geometry: null,
    },
    effectiveSkin: 'w4',
    effectiveDark: false,
    startupEnabled: true,
    startupBusy: false,
    pinBusy: false,
    themeStyle: '--dw-card-bg:#f6f7ff;--dw-dock-bg:rgba(255, 255, 255, 0.88)',
    accentHex: '#4f46e5',
    fontFamily: '"Pretendard", sans-serif',
    uiFontSize: 11,
    windows: [{ label: 'main', title: '<b>기본</b> 할 일' }],
    entries: [{ key: 'main:d1', title: '<i>수학</i> 페스티벌', tone: 'rose', checked: true, counterLabel: 'D-5', windowTitle: '기본' }],
  };

  const openReq = normalizeOpenPayload({
    requestId: 'dday:1:1',
    requester: 'dday',
    anchor: { x: 100, y: 200, width: 236, height: 256 },
    viaKeyboard: true,
    state: validState,
  });
  assert.ok(openReq);
  assert.equal(openReq.state.entries[0].title, '수학 페스티벌');
  assert.equal(openReq.state.windows[0].title, '기본 할 일');
  assert.equal(openReq.state.menuWidth, 260);
  assert.match(openReq.state.themeStyle, /^--dw-card-bg:#f6f7ff;--dw-dock-bg:rgba/);

  // NaN / 0 크기 앵커 거부
  assert.equal(normalizeOpenPayload({ requestId: '1', requester: 'dday', anchor: { x: NaN, y: 0, width: 100, height: 100 }, state: validState }), null);
  assert.equal(normalizeOpenPayload({ requestId: '1', requester: 'dday', anchor: { x: 0, y: 0, width: 0, height: 100 }, state: validState }), null);

  // CSS 인젝션 차단
  assert.equal(sanitizeThemeStyle('color:red; background:url(javascript:alert(1)); --dw-card-bg:#ffffff}body{'), '');
  assert.equal(sanitizeThemeStyle('--dw-card-bg:#ffffff; position:fixed'), '--dw-card-bg:#ffffff');
  const injectedFont = normalizeOpenPayload({
    requestId: 'dday:1:2',
    requester: 'dday',
    anchor: { x: 10, y: 10, width: 200, height: 200 },
    state: { ...validState, fontFamily: 'Arial; color:red}' },
  });
  assert.equal(injectedFont?.state.fontFamily, '"Gulim", sans-serif');

  // sync 검증
  assert.ok(normalizeSyncPayload({ state: validState }));
  assert.equal(normalizeSyncPayload({ requestId: '', state: validState }), null);

  // action 엄격 검증
  assert.deepEqual(normalizeActionPayload({ requestId: 'r1', action: 'select-skin', payload: { skin: 'w4' } }), {
    requestId: 'r1',
    action: 'select-skin',
    payload: { skin: 'w4' },
  });
  assert.equal(normalizeActionPayload({ requestId: 'r1', action: 'select-skin', payload: { skin: 'w9' } }), null);
  assert.equal(normalizeActionPayload({ requestId: 'r1', action: 'set-appearance', payload: { appearanceMode: 'sepia' } }), null);
  assert.equal(normalizeActionPayload({ requestId: 'r1', action: 'set-scope', payload: { displayScope: '' } }), null);
  assert.equal(normalizeActionPayload({ requestId: 'r1', action: 'toggle-hidden', payload: {} }), null);
  assert.equal(normalizeActionPayload({ requestId: 'r1', action: 'hacked', payload: {} }), null);
  assert.ok(normalizeActionPayload({ requestId: 'r1', action: 'toggle-top', payload: {} }));

  // closed 검증
  assert.deepEqual(normalizeClosedPayload({ requestId: 'r1', reason: 'escape' }), { requestId: 'r1', reason: 'escape' });
  assert.equal(normalizeClosedPayload({ requestId: 'r1', reason: 'unknown' }), null);
  assert.equal(returnsFocusToWidget('escape'), true);
  assert.equal(returnsFocusToWidget('close-btn'), true);
  assert.equal(returnsFocusToWidget('blur'), false);
});
