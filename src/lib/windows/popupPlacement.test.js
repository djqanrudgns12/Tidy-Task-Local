import test from 'node:test';
import assert from 'node:assert/strict';
import { placePopup, pickMonitorForRect } from './popupPlacement.js';
import { toMonitorGeometry } from './windowPlacement.js';

// 실제 사용자 환경과 같은 모니터 구성 (물리 픽셀)
//   주 모니터: 4K, 배율 200%, (0,0)~(3840,2160), 작업영역 높이 2064 (작업 표시줄 96px)
//   보조 모니터: FHD, 배율 100%, (3840,0)~(5760,1080), 작업영역 높이 1032
/** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} workH @param {number} scale @param {number} [workY] */
const monitor = (x, y, w, h, workH, scale, workY = y) => /** @type {import('./windowPlacement.js').MonitorGeometry} */ (toMonitorGeometry({
  position: { x, y },
  size: { width: w, height: h },
  workArea: { position: { x, y: workY }, size: { width: w, height: workH } },
  scaleFactor: scale,
}));
const PRIMARY_4K = monitor(0, 0, 3840, 2160, 2064, 2);
const SECONDARY_FHD = monitor(3840, 0, 1920, 1080, 1032, 1);
const BOTH = [PRIMARY_4K, SECONDARY_FHD];
// 달력 카드의 논리 크기 (10pt 기준 대략값)
const CARD = { width: 200, height: 260 };

/** @param {number} x @param {number} y @param {number} [w] @param {number} [h] */
const anchorAt = (x, y, w = 60, h = 24) => ({ x, y, width: w, height: h });

test('공간이 넉넉하면 버튼 바로 아래, 버튼 왼쪽 끝에 맞춰 뜬다', () => {
  const p = placePopup({ anchor: anchorAt(4000, 200), size: CARD, monitors: BOTH, gap: 4, edge: 6 });
  assert.equal(p.side, 'below');
  assert.deepEqual(p.card, { x: 4000, y: 228, width: 200, height: 260 });
  assert.equal(p.scale, 1);
});

test('아래가 모자라면(세로로 긴 창의 맨 아래 버튼) 위로 뜬다', () => {
  // FHD 작업영역 바닥은 1032, 여백 6 → 1026. 버튼 아래 1000+24+4+260 = 1288 > 1026
  const p = placePopup({ anchor: anchorAt(4000, 1000), size: CARD, monitors: BOTH, gap: 4, edge: 6 });
  assert.equal(p.side, 'above');
  assert.equal(p.card.y, 1000 - 4 - 260);
});

test('위를 먼저 원하면 위에 자리가 있을 때 위로 뜬다', () => {
  const p = placePopup({ anchor: anchorAt(4000, 600), size: CARD, monitors: BOTH, prefer: 'above' });
  assert.equal(p.side, 'above');
});

test('위아래 모두 모자라면 버튼을 가리지 않도록 옆(오른쪽)에 뜬다', () => {
  // 세로 400px짜리 작은 화면에서 버튼이 한가운데 있는 경우
  const small = monitor(0, 0, 1280, 400, 400, 1);
  const p = placePopup({ anchor: anchorAt(100, 180), size: CARD, monitors: [small], gap: 4, edge: 6 });
  assert.equal(p.side, 'right');
  assert.equal(p.card.x, 100 + 60 + 4);
  // 세로는 버튼 가운데에 맞추되 화면 안에 있어야 합니다.
  assert.ok(p.card.y >= 6 && p.card.y + p.card.height <= 394);
});

test('오른쪽도 모자라면 왼쪽, 그래도 모자라면 화면 안으로 밀어 넣어 겹쳐 놓는다', () => {
  const narrow = monitor(0, 0, 500, 400, 400, 1);
  const left = placePopup({ anchor: anchorAt(400, 180), size: CARD, monitors: [narrow], gap: 4, edge: 6 });
  assert.equal(left.side, 'left');
  assert.equal(left.card.x, 400 - 4 - 200);

  const tiny = monitor(0, 0, 300, 300, 300, 1);
  const overlay = placePopup({ anchor: anchorAt(120, 140), size: CARD, monitors: [tiny], gap: 4, edge: 6 });
  assert.equal(overlay.side, 'overlay');
  assert.ok(overlay.card.x >= 6 && overlay.card.x + 200 <= 294);
  assert.ok(overlay.card.y >= 6 && overlay.card.y + 260 <= 294);
});

test('화면 오른쪽 끝의 버튼이면 카드를 안쪽으로 당겨 잘리지 않게 한다', () => {
  const p = placePopup({ anchor: anchorAt(5700, 100), size: CARD, monitors: BOTH, gap: 4, edge: 6 });
  assert.equal(p.side, 'below');
  assert.equal(p.card.x + p.card.width, 5760 - 6);
});

test('[배율] 4K 200% 모니터에서는 카드 크기·간격이 물리 픽셀로 두 배가 된다', () => {
  const p = placePopup({ anchor: anchorAt(400, 400, 120, 48), size: CARD, monitors: BOTH, gap: 4, edge: 6 });
  assert.equal(p.scale, 2);
  assert.deepEqual(p.card, { x: 400, y: 400 + 48 + 8, width: 400, height: 520 });
});

test('[배율] 팝업이 어느 모니터에 있든 "버튼이 있는 모니터"의 배율을 쓴다', () => {
  // 팝업 창은 4K(배율 2)에 숨어 있었지만 버튼은 FHD(배율 1)에 있다 → 크기는 배율 1 기준
  const p = placePopup({ anchor: anchorAt(4000, 200), size: CARD, monitors: BOTH, fallbackScale: 2 });
  assert.equal(p.scale, 1);
  assert.equal(p.card.width, 200);
});

test('두 모니터 경계에 걸친 버튼은 가운데가 있는 모니터를 기준으로 한다', () => {
  // 버튼 가운데 x = 3820 + 30 = 3850 → FHD
  assert.equal(pickMonitorForRect(anchorAt(3820, 100), BOTH), SECONDARY_FHD);
  // 버튼 가운데 x = 3780 + 30 = 3810 → 4K
  assert.equal(pickMonitorForRect(anchorAt(3780, 100), BOTH), PRIMARY_4K);
});

test('버튼이 모든 모니터 밖이면(창이 화면 밖에 걸침) 가장 가까운 모니터 안에 놓는다', () => {
  const p = placePopup({ anchor: anchorAt(6000, 300), size: CARD, monitors: BOTH, gap: 4, edge: 6 });
  assert.equal(p.scale, 1);
  assert.ok(p.card.x + p.card.width <= 5760 - 6, '화면 오른쪽 밖으로 나가지 않아야 합니다');
});

test('작업 표시줄이 위에 있으면(작업영역이 아래로 밀림) 그 영역을 침범하지 않는다', () => {
  const topTaskbar = monitor(0, 0, 1920, 1080, 1032, 1, 48);
  // 버튼이 화면 맨 위 근처: 위로는 작업 표시줄 때문에 자리가 없으니 아래로 떠야 합니다.
  const p = placePopup({ anchor: anchorAt(100, 60), size: CARD, monitors: [topTaskbar], prefer: 'above', gap: 4, edge: 6 });
  assert.equal(p.side, 'below');
});

test('투명 여백(그림자 자리)만큼 창을 키우고, 카드 자리는 그대로 둔다', () => {
  const p = placePopup({ anchor: anchorAt(400, 400, 120, 48), size: CARD, monitors: BOTH, gap: 4, margin: 10 });
  assert.deepEqual(
    { x: p.x, y: p.y, width: p.width, height: p.height },
    { x: p.card.x - 20, y: p.card.y - 20, width: 400 + 40, height: 520 + 40 },
  );
});

test('카드가 화면보다 크면 머리(끌기 손잡이)가 보이도록 작업영역 왼쪽 위에 맞춘다', () => {
  const tiny = monitor(0, 0, 150, 150, 150, 1);
  const p = placePopup({ anchor: anchorAt(10, 10, 20, 20), size: CARD, monitors: [tiny], gap: 4, edge: 6 });
  assert.equal(p.card.x, 6);
  assert.equal(p.card.y, 6);
});

test('모니터 정보를 못 읽으면 보정 없이 버튼 아래에 둔다', () => {
  const p = placePopup({ anchor: anchorAt(100, 100), size: CARD, monitors: [], fallbackScale: 1.5, gap: 4 });
  assert.equal(p.side, 'below');
  assert.equal(p.scale, 1.5);
  assert.deepEqual(p.card, { x: 100, y: 100 + 24 + 6, width: 300, height: 390 });
});

test('잘못된 모니터 값은 무시한다', () => {
  assert.equal(pickMonitorForRect(anchorAt(0, 0), /** @type {any} */ ([null, { bounds: null, work: null, scale: 1 }])), null);
});
