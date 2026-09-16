import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findVisiblePlacement,
  isPlausibleCoordinate,
  pickPrimaryMonitor,
  resolveSavedPosition,
  toMonitorGeometry,
} from './windowPlacement.js';

// 실제 사용자 환경에서 측정한 모니터 구성 (물리 픽셀)
//   주 모니터: 4K, 배율 200%, (0,0)~(3840,2160), 작업영역 높이 2064
//   보조 모니터: FHD, 배율 100%, (3840,0)~(5760,1080), 작업영역 높이 1032
const tauriMonitor = (x, y, w, h, workH, scale) => ({
  name: null,
  position: { x, y },
  size: { width: w, height: h },
  workArea: { position: { x, y }, size: { width: w, height: workH } },
  scaleFactor: scale,
});
const PRIMARY_4K = toMonitorGeometry(tauriMonitor(0, 0, 3840, 2160, 2064, 2));
const SECONDARY_FHD = toMonitorGeometry(tauriMonitor(3840, 0, 1920, 1080, 1032, 1));
const BOTH = [PRIMARY_4K, SECONDARY_FHD];

test('Tauri 모니터 객체를 물리 사각형으로 바꾼다', () => {
  assert.deepEqual(SECONDARY_FHD, {
    bounds: { x: 3840, y: 0, width: 1920, height: 1080 },
    work: { x: 3840, y: 0, width: 1920, height: 1032 },
    scale: 1,
  });
  assert.equal(toMonitorGeometry(null), null);
});

test('[재현] 보조 모니터(100%)에서 저장된 예전 논리 좌표는 주 모니터 배율로 2배가 되지 않고 제자리로 복원된다', () => {
  // 5.0.0 방식: 논리 4500 저장 → 주 모니터(배율 2)에서 setPosition(Logical) → 물리 9000(화면 밖)
  const legacy = { logicalX: 4500, logicalY: 200, width: 328, height: 449 };
  assert.deepEqual(resolveSavedPosition(legacy, BOTH), { x: 4500, y: 200 });
});

test('주 모니터(200%)에서 저장된 예전 논리 좌표는 배율 2로 되돌린다 (현재 사용자 데이터)', () => {
  const legacy = { logicalX: 1489, logicalY: 175, width: 328, height: 449 };
  assert.deepEqual(resolveSavedPosition(legacy, BOTH), { x: 2978, y: 350 });
});

test('물리 좌표가 있으면 그대로 쓴다', () => {
  assert.deepEqual(
    resolveSavedPosition({ physicalX: 4500, physicalY: 200, logicalX: 999999, logicalY: 5 }, BOTH),
    { x: 4500, y: 200 },
  );
});

test('보조 모니터를 뺐다면(재부팅 시 늦게 켜짐 등) 저장 좌표를 쓰지 않는다', () => {
  assert.equal(resolveSavedPosition({ physicalX: 4500, physicalY: 200, logicalX: 4500, logicalY: 200 }, [PRIMARY_4K]), null);
});

test('최소화 좌표(-32000)·잘못된 값·모니터 정보 없음은 쓰지 않는다', () => {
  assert.equal(isPlausibleCoordinate(-32000), false);
  assert.equal(resolveSavedPosition({ physicalX: -32000, physicalY: -32000 }, BOTH), null);
  assert.equal(resolveSavedPosition({ logicalX: '100', logicalY: 100 }, BOTH), null);
  assert.equal(resolveSavedPosition({ logicalX: 100, logicalY: 100 }, []), null);
});

test('최대화된 창의 살짝 음수 좌표(-8,-8)는 정상 위치로 인정한다', () => {
  assert.deepEqual(resolveSavedPosition({ physicalX: -8, physicalY: -8, width: 1920, height: 1032 }, BOTH), { x: -8, y: -8 });
});

test('제목줄이 모니터 위쪽 밖으로 나간 위치는 인정하지 않는다', () => {
  assert.equal(resolveSavedPosition({ physicalX: 400, physicalY: -300 }, BOTH), null);
});

test('주 모니터는 (0,0)을 포함하는 모니터다 (목록 순서와 무관)', () => {
  assert.equal(pickPrimaryMonitor([SECONDARY_FHD, PRIMARY_4K]), PRIMARY_4K);
  assert.equal(pickPrimaryMonitor([]), null);
});

test('[재현] 화면 밖(물리 9000)에 놓인 창은 주 모니터 작업영역 가운데로 옮긴다', () => {
  const offscreen = { x: 9000, y: 400, width: 656, height: 898 };
  assert.deepEqual(findVisiblePlacement(offscreen, BOTH), { x: 1592, y: 583 });
});

test('이미 보이는 창(보조 모니터 포함)은 옮기지 않는다', () => {
  assert.equal(findVisiblePlacement({ x: 2978, y: 350, width: 656, height: 898 }, BOTH), null);
  assert.equal(findVisiblePlacement({ x: 4500, y: 200, width: 328, height: 449 }, BOTH), null);
  // 오른쪽 끝에 일부만 걸쳐 있어도 제목줄을 잡을 수 있으면 그대로 둡니다
  assert.equal(findVisiblePlacement({ x: 5600, y: 100, width: 328, height: 449 }, BOTH), null);
});

test('작업영역보다 큰 창은 작업영역 왼쪽 위에 맞춘다', () => {
  assert.deepEqual(findVisiblePlacement({ x: 99999, y: 0, width: 5000, height: 3000 }, BOTH), { x: 0, y: 0 });
});

test('모니터 정보를 못 읽으면 아무것도 바꾸지 않는다', () => {
  assert.equal(findVisiblePlacement({ x: 9000, y: 0, width: 300, height: 300 }, []), null);
});
