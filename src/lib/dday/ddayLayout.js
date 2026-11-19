// D-Day 컨트롤 패널·데스크톱 위젯의 반응형 상태 전이(히스테리시스) 및 유동 스케일 계산 순수 모듈입니다.
// 왜 DOM 측정에 의존하지 않는가:
//   자식 요소 높이를 재측정하면 "크기 변경 → 배치 변경 → 재측정" 진동이 생길 수 있으므로,
//   외곽 컨테이너 (width, height)와 글자 분량만으로 단일 패스로 안정된 토큰을 산출합니다.

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** @param {number} value */
export function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

/**
 * 글꼴의 시각적 가로 비중을 어림합니다(한글·한자·이모지 = 1.0em, ASCII = 0.56em).
 * @param {string} text
 * @returns {number}
 */
export function visualUnits(text) {
  if (!text) return 0;
  let units = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0) ?? 0;
    units += code <= 0x7f ? 0.56 : 1.0;
  }
  return units;
}

/**
 * 히스테리시스 임계치 헬퍼: 직전 상태를 유지하며 enter/exit 경계로 떨림을 방지합니다.
 * @param {boolean} prevOn
 * @param {boolean} enterCond
 * @param {boolean} exitCond
 */
function stepHysteresis(prevOn, enterCond, exitCond) {
  if (prevOn) return !exitCond;
  return enterCond;
}

/**
 * @typedef {{
 *   compactWidth: boolean,
 *   veryNarrow: boolean,
 *   archiveFullDate: boolean,
 *   wideEdit: boolean,
 *   wideSettings: boolean,
 *   listGrid2Col: boolean,
 *   archiveGrid2Col: boolean,
 *   shortHeight: boolean,
 *   tier: 'compact' | 'standard' | 'wide',
 * }} ControlLayoutState
 */

/**
 * D-Day 컨트롤 패널 외곽(.ctrl-shell border-box) 크기에 따라 5개 뷰의 반응형 레이아웃 모드를 판별합니다.
 * 최소 폭 340px · 최대 폭 580px 하네스 범위에서 1열 수직 리스트를 유지하며 360px 콤팩트 / 536px 와이드를 전환합니다.
 * @param {{
 *   width: number,
 *   height: number,
 *   itemCount?: number,
 *   archiveCount?: number,
 *   prev?: ControlLayoutState | null,
 * }} input
 * @returns {ControlLayoutState}
 */
export function classifyControlLayout({
  width,
  height,
  itemCount: _itemCount = 0,
  archiveCount: _archiveCount = 0,
  prev = null,
}) {
  const safeW = Math.max(240, Number.isFinite(width) ? width : 380);
  const safeH = Math.max(300, Number.isFinite(height) ? height : 580);

  const compactWidth = stepHysteresis(
    Boolean(prev?.compactWidth),
    safeW < 360,
    safeW >= 372,
  );
  // minWidth 340 하네스 도입으로 veryNarrow(<316) 분기는 도달하지 않으므로 하위 호환용 false 고정
  const veryNarrow = false;
  const archiveFullDate = stepHysteresis(
    Boolean(prev?.archiveFullDate),
    safeW >= 452,
    safeW < 436,
  );
  const wideEdit = stepHysteresis(
    Boolean(prev?.wideEdit),
    safeW >= 536,
    safeW < 520,
  );
  const wideSettings = stepHysteresis(
    Boolean(prev?.wideSettings),
    safeW >= 536,
    safeW < 520,
  );

  // D-Day 목록과 아카이브는 340..580px 범위에서 세로 1열 우선순위·가독성을 일관 유지합니다.
  const listGrid2Col = false;
  const archiveGrid2Col = false;

  const shortHeight = stepHysteresis(
    Boolean(prev?.shortHeight),
    safeH < 480,
    safeH >= 496,
  );

  /** @type {'compact' | 'standard' | 'wide'} */
  let tier = 'standard';
  if (compactWidth) tier = 'compact';
  else if (wideEdit) tier = 'wide';

  return {
    compactWidth,
    veryNarrow,
    archiveFullDate,
    wideEdit,
    wideSettings,
    listGrid2Col,
    archiveGrid2Col,
    shortHeight,
    tier,
  };
}

/**
 * 컨트롤 패널 연속 유동 스케일과 타이포그래피·간격·달력 축척 토큰을 계산합니다.
 * @param {{
 *   width: number,
 *   height: number,
 *   uiFontSize?: number,
 *   wideEdit?: boolean,
 * }} input
 */
export function computeControlMetrics({
  width,
  height,
  uiFontSize = 10,
  wideEdit = false,
}) {
  const safeW = clamp(Number.isFinite(width) ? width : 372, 260, 1400);
  const safeH = clamp(Number.isFinite(height) ? height : 572, 340, 1400);
  const safeFont = clamp(Number.isFinite(uiFontSize) ? uiFontSize : 10, 9, 16);

  // 넓지만 낮은 창에서 글자만 과도하게 커지지 않도록 폭 곡선과 높이 상한 중 작은 쪽을 택합니다.
  const sW = clamp(0.90 + (safeW - 292) * 0.00105, 0.90, 1.24);
  const sH = clamp(0.90 + (safeH - 392) * 0.00090, 0.90, 1.24);
  const baseScale = Math.min(sW, sH);

  const userDelta = clamp((safeFont - 10) * 0.032, -0.04, 0.14);
  // 좁은 창(300px)에서 큰 UI 글꼴 설정이 넘침을 유발하지 않도록 폭 여유 비율로 감쇠합니다.
  const roomFactor = clamp((safeW - 292) / 140, 0.25, 1);
  const scale = clamp(baseScale + userDelta * roomFactor, 0.88, 1.28);

  const padX = Math.round(clamp(10 + (safeW - 292) * 0.028, 10, 22));
  const gap = Math.round(clamp(6.5 + (scale - 0.88) * 14, 6, 12));

  const fsHead = roundHalf(clamp(13.5 * scale, 12, 17));
  const fsTitle = roundHalf(clamp(12.5 * scale, 11.5, 16));
  const fsBody = roundHalf(clamp(11.6 * scale, 10.5, 14.5));
  const fsSub = roundHalf(clamp(10.3 * scale, 9.5, 12.8));
  const fsMicro = roundHalf(clamp(9.5 * scale, 8.8, 11.5));

  const iconSz = Math.round(clamp(25 * scale, 22, 34));
  const btnH = Math.round(clamp(30 * scale, 27, 38));

  // CalendarPanel 폭(15.4em)이 1단 또는 2단 컬럼 내부 폭의 86% 이하에 들도록 수학적으로 클램프합니다.
  const calColW = wideEdit
    ? Math.max(196, (safeW - padX * 2 - 14) / 2)
    : Math.max(210, safeW - padX * 2);
  const calFs = roundHalf(clamp(Math.min(fsBody * 1.05, (calColW * 0.86) / 15.4), 10.5, 15.5));

  return {
    scale: Math.round(scale * 1000) / 1000,
    padX,
    gap,
    fsHead,
    fsTitle,
    fsBody,
    fsSub,
    fsMicro,
    iconSz,
    btnH,
    calFs,
  };
}

/**
 * computeControlMetrics 결과를 .ctrl-shell 인라인 스타일 토큰 문자열로 변환합니다.
 * @param {ReturnType<typeof computeControlMetrics>} m
 */
export function controlMetricsToStyle(m) {
  return [
    `--dd-pad-x:${m.padX}px`,
    `--dd-gap:${m.gap}px`,
    `--dd-fs-head:${m.fsHead}px`,
    `--dd-fs-title:${m.fsTitle}px`,
    `--dd-fs-body:${m.fsBody}px`,
    `--dd-fs-sub:${m.fsSub}px`,
    `--dd-fs-micro:${m.fsMicro}px`,
    `--dd-icon-sz:${m.iconSz}px`,
    `--dd-btn-h:${m.btnH}px`,
    `--dd-cal-fs:${m.calFs}px`,
  ].join(';');
}

/**
 * 데스크톱 D-Day 위젯의 크기 티어(micro/standard/expanded)와 긴 숫자 자동 축소 계수를 계산합니다.
 * @param {{
 *   width: number,
 *   height: number,
 *   label?: string,
 *   prevTier?: 'micro' | 'standard' | 'expanded' | null,
 * }} input
 */
export function computeWidgetLayout({
  width,
  height,
  label = 'D-5',
  prevTier = null,
}) {
  const safeW = clamp(Number.isFinite(width) ? width : 224, 140, 1000);
  const safeH = clamp(Number.isFinite(height) ? height : 244, 140, 1000);

  const isMicro = stepHysteresis(
    prevTier === 'micro',
    safeW < 192 || safeH < 200,
    safeW >= 204 && safeH >= 212,
  );
  const isExpanded =
    !isMicro &&
    stepHysteresis(
      prevTier === 'expanded',
      safeW >= 252 && safeH >= 252,
      safeW < 238 || safeH < 238,
    );

  /** @type {'micro' | 'standard' | 'expanded'} */
  const tier = isMicro ? 'micro' : isExpanded ? 'expanded' : 'standard';

  // D-5 (2.24u) · D-Day (2.80u)는 1.0배, D-1000 (3.36u) · +1234일 (3.80u)는 좌우 노치를 침범하지 않게 자동 축소
  const units = Math.max(3.0, visualUnits(label));
  const numScale = Math.round(clamp(3.0 / units, 0.56, 1) * 1000) / 1000;

  const minSide = Math.min(safeW, safeH);
  const ctrlBtnSize = Math.round(clamp(minSide * 0.118, 24, 30));
  const iconSize = Math.round(clamp(minSide * 0.098, 19, 30));

  return {
    tier,
    micro: tier === 'micro',
    expanded: tier === 'expanded',
    numScale,
    ctrlBtnSize,
    iconSize,
  };
}
