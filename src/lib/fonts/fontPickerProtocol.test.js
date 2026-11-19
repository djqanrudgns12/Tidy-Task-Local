import test from 'node:test';
import assert from 'node:assert/strict';
import { isDataWindowLabel } from '../windows/windowLabels.js';
import {
  ANCHOR_GAP,
  EDGE_PADDING,
  FONT_PICKER_LABEL,
  FONT_PICKER_WINDOW_OPTIONS,
  MAX_WIDTH,
  MIN_SNAP_HEIGHT,
  STANDARD_HEIGHT,
  STANDARD_WIDTH,
  changesValue,
  normalizeClosedPayload,
  normalizeOpenPayload,
  placeFontPicker,
  resolvePickerWidth,
  returnsFocus,
} from './fontPickerProtocol.js';

const FHD = {
  name: 'FHD',
  scale: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  work: { x: 0, y: 0, width: 1920, height: 1040 },
};

const UHD_200 = {
  name: '4K',
  scale: 2,
  bounds: { x: 1920, y: 0, width: 3840, height: 2160 },
  work: { x: 1920, y: 0, width: 3840, height: 2080 },
};

test('placeFontPicker: 여유 공간이 충분하면 버튼 바로 아래 2px 간격·좌측 정렬로 밀착한다', () => {
  const p = placeFontPicker({
    anchor: { x: 300, y: 120, width: 88, height: 24 },
    monitors: [FHD],
  });
  assert.equal(p.side, 'below');
  assert.equal(p.x, 300);
  assert.equal(p.y, 120 + 24 + ANCHOR_GAP);
  assert.equal(p.width, STANDARD_WIDTH);
  assert.equal(p.height, STANDARD_HEIGHT);
});

test('placeFontPicker: align=end이면 설정창 트리거 오른쪽 끝에 1:1 정렬한다', () => {
  const p = placeFontPicker({
    anchor: { x: 600, y: 200, width: 200, height: 32 },
    align: 'end',
    monitors: [FHD],
  });
  assert.equal(p.side, 'below');
  assert.equal(p.x + p.width, 800);
  assert.equal(p.y, 232 + ANCHOR_GAP);
});

test('placeFontPicker: 아래가 332px 미만이어도 위가 충분하면 위로 정사이즈 반전한다', () => {
  const p = placeFontPicker({
    anchor: { x: 300, y: 800, width: 90, height: 24 },
    monitors: [FHD],
  });
  assert.equal(p.side, 'above');
  assert.equal(p.height, STANDARD_HEIGHT);
  assert.equal(p.y + p.height + ANCHOR_GAP, 800);
});

test('placeFontPicker: 아래·위 모두 332px 미만이지만 200px 이상이면 옆으로 튕기지 않고 높이만 축소해 밀착한다', () => {
  // 1280×720@150% 비슷한 낮은 작업영역 (높이 480px), 버튼이 중앙 y=220에 위치
  const smallMonitor = {
    name: 'Laptop',
    scale: 1,
    bounds: { x: 0, y: 0, width: 1280, height: 500 },
    work: { x: 0, y: 0, width: 1280, height: 480 },
  };
  const p = placeFontPicker({
    anchor: { x: 200, y: 220, width: 90, height: 24 },
    monitors: [smallMonitor],
  });
  assert.equal(p.side, 'below');
  assert.equal(p.x, 200);
  assert.equal(p.y, 246);
  // 480 - 6(edge) - 246 = 228px (>= MIN_SNAP_HEIGHT 200)
  assert.equal(p.height, 480 - EDGE_PADDING - 246);
  assert.ok(p.height >= MIN_SNAP_HEIGHT && p.height < STANDARD_HEIGHT);
});

test('placeFontPicker: 4K 200% 모니터에서 물리 크기와 좌표가 배율 2배로 정확히 환산된다', () => {
  const p = placeFontPicker({
    anchor: { x: 2400, y: 300, width: 180, height: 52 },
    monitors: [FHD, UHD_200],
  });
  assert.equal(p.scale, 2);
  assert.equal(p.side, 'below');
  assert.equal(p.width, STANDARD_WIDTH * 2);
  assert.equal(p.height, STANDARD_HEIGHT * 2);
  assert.equal(p.x, 2400);
  assert.equal(p.y, 352 + ANCHOR_GAP * 2);
});

test('placeFontPicker: 화면 우측 끝에 가까우면 작업영역 안으로 안전하게 당긴다', () => {
  const p = placeFontPicker({
    anchor: { x: 1840, y: 100, width: 70, height: 24 },
    monitors: [FHD],
  });
  assert.equal(p.x + p.width, FHD.work.width - EDGE_PADDING);
});

test('resolvePickerWidth는 252~288 범위를 지킨다', () => {
  assert.equal(resolvePickerWidth(68), STANDARD_WIDTH);
  assert.equal(resolvePickerWidth(264), 264);
  assert.equal(resolvePickerWidth(400), MAX_WIDTH);
});

test('normalizeOpenPayload와 normalizeClosedPayload가 유효성 및 닫힘 규칙을 지킨다', () => {
  const req = normalizeOpenPayload({
    requestId: 'main:1',
    requester: 'main',
    value: '교보 손글씨 2024',
    align: 'end',
    preferredWidth: 270,
    anchor: { x: 100.4, y: 200.6, width: 120, height: 28 },
    theme: { source: 'toolkit', themeId: 'ocean', isDarkMode: true },
    customFonts: [{ name: '내폰트', path: 'C:/a.ttf' }, { name: '', path: 'bad' }],
    extraOptions: [{ value: 'follow', label: '메인 창과 동일' }],
  });
  assert.ok(req);
  assert.equal(req.align, 'end');
  assert.equal(req.preferredWidth, 270);
  assert.equal(req.theme.source, 'toolkit');
  assert.equal(req.customFonts.length, 1);
  assert.equal(req.extraOptions.length, 1);

  assert.equal(normalizeOpenPayload({ requestId: '', requester: 'main', anchor: { x: 0, y: 0, width: 1, height: 1 } }), null);
  assert.equal(normalizeOpenPayload({ requestId: 'a', requester: 'main', anchor: { x: NaN, y: 0, width: 1, height: 1 } }), null);

  assert.deepEqual(normalizeClosedPayload({ requestId: 'main:1', reason: 'select', value: '페이퍼로지 B' }), {
    requestId: 'main:1',
    reason: 'select',
    value: '페이퍼로지 B',
  });
  assert.deepEqual(normalizeClosedPayload({ requestId: 'main:1', reason: 'context-menu' }), {
    requestId: 'main:1',
    reason: 'context-menu',
    value: '',
  });
  assert.equal(normalizeClosedPayload({ requestId: 'main:1', reason: 'select', value: '' }), null);
  assert.equal(changesValue('select'), true);
  assert.equal(changesValue('blur'), false);
  assert.equal(returnsFocus('escape'), true);
  assert.equal(returnsFocus('host-moved'), false);
  assert.equal(returnsFocus('context-menu'), false);
});

test('font-picker는 비데이터·비이동·무그림자 임시 팝업 창 계약을 지킨다', () => {
  assert.equal(isDataWindowLabel(FONT_PICKER_LABEL), false);
  assert.equal(FONT_PICKER_WINDOW_OPTIONS.decorations, false);
  assert.equal(FONT_PICKER_WINDOW_OPTIONS.transparent, true);
  assert.equal(FONT_PICKER_WINDOW_OPTIONS.shadow, false);
  assert.equal(FONT_PICKER_WINDOW_OPTIONS.resizable, false);
  assert.equal(FONT_PICKER_WINDOW_OPTIONS.alwaysOnTop, true);
  assert.equal(FONT_PICKER_WINDOW_OPTIONS.skipTaskbar, true);
  assert.equal(FONT_PICKER_WINDOW_OPTIONS.visible, false);
});
