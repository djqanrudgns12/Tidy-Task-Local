// 타이머 4종의 반응형 폼팩터, 스마트 글자 크기, 자석 도킹 및 다중 위젯 배치를 계산하는 순수 모듈입니다.
// 왜 DOM 밖의 순수 함수로 분리하는가:
//   글자 크기 계산이 자식 요소 높이 측정에 의존하면 "크기 변경 → 높이 변경 → 재측정" 무한 루프가 생깁니다.
//   고정 부모(.timer-main)의 크기와 텍스트 분량만으로 한 번에 계산해 진동을 원천 차단합니다.

/** @typedef {'standard' | 'fullscreen' | 'strip' | 'tile' | 'tall' | 'card'} TimerSurfaceForm */
/** @typedef {{ x: number, y: number, width: number, height: number }} PhysicalRect */

const LIST_LINE_PREFIX = /^\s*(?:\d+[.)]|[-•*▪▫✓✔①-⑳]|[가-하][.)])\s*/;

/** @param {number} value @param {number} min @param {number} max */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** @param {number} value */
const roundHalf = (value) => Math.round(value * 2) / 2;

/**
 * 글꼴의 시각적 가로 비중을 어림합니다(한글·한자·이모지 = 1.0em, 영문·숫자·공백 = 0.56em).
 * @param {string} text
 * @returns {number}
 */
export function visualUnits(text) {
  if (!text) return 0;
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    units += code <= 0x7f ? 0.56 : 1.0;
  }
  return units;
}

/**
 * 주어진 폭과 글자 크기에서 문단이 몇 줄로 줄바꿈될지 추정합니다.
 * @param {string} text
 * @param {number} availWidthPx
 * @param {number} fontSizePx
 * @returns {number}
 */
export function estimateWrappedLines(text, availWidthPx, fontSizePx) {
  if (!text) return 1;
  const safeWidth = Math.max(40, availWidthPx - 16);
  const cap = Math.max(1, safeWidth / Math.max(1, fontSizePx));
  const lines = text.split(/\r?\n/);
  let total = 0;
  for (const line of lines) {
    const units = visualUnits(line);
    total += units === 0 ? 1 : Math.max(1, Math.ceil(units / cap));
  }
  return Math.max(1, total);
}

/**
 * 창 크기·비율·모드에 따라 타이머 표면 형태와 보조 레이아웃 규칙을 결정합니다.
 * 경계선 근처에서 테두리를 미세하게 움직일 때 형태가 깜빡이지 않도록 히스테리시스 데드밴드(±6px, ±0.05)를 둡니다.
 * @param {{ width: number, height: number, widgetMode?: boolean, fullscreen?: boolean, prevForm?: TimerSurfaceForm | null }} input
 */
export function classifyTimerSurface({
  width,
  height,
  widgetMode = false,
  fullscreen = false,
  prevForm = null,
}) {
  const safeW = Math.max(1, Number.isFinite(width) ? width : 960);
  const safeH = Math.max(1, Number.isFinite(height) ? height : 680);
  const snugWidget = !fullscreen && (widgetMode || safeW < 480 || safeH < 350);

  /** @type {TimerSurfaceForm} */
  let form;
  if (fullscreen) {
    form = 'fullscreen';
  } else if (!snugWidget) {
    form = 'standard';
  } else {
    const ratio = safeW / safeH;
    // 직전 형태가 위젯 4종 중 하나였다면 경계선 떨림을 막기 위해 ±6px / ±0.05 데드밴드를 적용합니다.
    if (prevForm === 'strip' && safeH < 182 && ratio >= 1.50) {
      form = 'strip';
    } else if (prevForm === 'tile' && !(safeH < 170 && ratio >= 1.60) && safeW < 298 && safeH < 278) {
      form = 'tile';
    } else if (prevForm === 'tall' && !(safeW < 286 && safeH < 266) && ratio <= 0.93 && safeH >= 266) {
      form = 'tall';
    } else if (
      prevForm === 'card' &&
      !(safeH < 170 && ratio >= 1.60) &&
      !(safeW < 286 && safeH < 266) &&
      !(ratio <= 0.83 && safeH >= 278)
    ) {
      form = 'card';
    } else if (safeH < 176 && ratio >= 1.55) {
      form = 'strip';
    } else if (safeW < 292 && safeH < 272) {
      form = 'tile';
    } else if (ratio <= 0.88 && safeH >= 272) {
      form = 'tall';
    } else {
      form = 'card';
    }
  }

  const maxNoteLines =
    form === 'strip'
      ? 0
      : form === 'tile'
        ? safeH >= 225
          ? 1
          : 0
        : form === 'card'
          ? safeH >= 290
            ? 3
            : 2
          : form === 'tall'
            ? safeH >= 430
              ? 5
              : 3
            : 0;

  return {
    snugWidget,
    form,
    overlayPanels: !snugWidget && (safeW < 820 || safeH < 480),
    compactControls: !snugWidget && (safeW < 760 || safeH < 540),
    compactConfirm: safeH < 235 || safeW < 310,
    analogDensity: /** @type {'full' | 'minimal'} */ (
      snugWidget && (form === 'strip' || safeW < 260 || safeH < 245) ? 'minimal' : 'full'
    ),
    stopwatchVariant: /** @type {'illustrated' | 'minimal'} */ (
      snugWidget && (form === 'strip' || safeH < 230 || safeW < 270) ? 'minimal' : 'illustrated'
    ),
    maxNoteLines,
  };
}

/**
 * 작은 위젯에서 제목이 비어 있을 때 설명의 첫 줄을 위젯 상단 헤드라인으로 승격합니다.
 * 왜: 선생님이 제목은 비워 두고 설명에만 활동 내용을 적었을 때 위젯에서 안내가 사라지지 않게 하기 위함입니다.
 * @param {string} title
 * @param {string} note
 * @param {string} fallbackName
 */
export function resolveWidgetHeadline(title, note, fallbackName) {
  const cleanTitle = (title || '').trim();
  if (cleanTitle) {
    return { text: cleanTitle, promotedFromNote: false, isPlaceholder: false };
  }
  const lines = (note || '').split(/\r?\n/);
  for (const raw of lines) {
    const cleanLine = raw.trim();
    if (cleanLine) {
      return { text: cleanLine, promotedFromNote: true, isPlaceholder: false };
    }
  }
  return { text: fallbackName, promotedFromNote: false, isPlaceholder: true };
}

/**
 * 설명 정렬('auto' | 'center' | 'left')을 실제 CSS text-align 값으로 해석합니다.
 * 짧은 1~2줄 문장은 시계 축에 맞춰 가운데 정렬하고, 3줄 이상 또는 목록 형태는 왼쪽 정렬로 가독성을 높입니다.
 * @param {string} note
 * @param {'auto' | 'center' | 'left'} [prefAlign]
 * @returns {'center' | 'left'}
 */
export function resolveNoteAlign(note, prefAlign = 'auto') {
  if (prefAlign === 'left' || prefAlign === 'center') return prefAlign;
  const nonEmptyLines = (note || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (nonEmptyLines.length >= 3 || nonEmptyLines.some((line) => LIST_LINE_PREFIX.test(line))) {
    return 'left';
  }
  return 'center';
}

/**
 * 컨테이너 크기·텍스트 분량·공통 취향 배율을 바탕으로 제목과 설명의 최적 글자 크기를 계산합니다.
 * @param {{
 *   width: number,
 *   height: number,
 *   form: TimerSurfaceForm,
 *   title: string,
 *   note: string,
 *   placeholderTitle: string,
 *   noteFocused?: boolean,
 *   displayPrefs?: Partial<import('./timerDisplayPreferences.js').TimerDisplayPreferences>,
 *   prevNotePx?: number
 * }} input
 */
export function computeSmartTypography({
  width,
  height,
  form,
  title,
  note,
  placeholderTitle,
  noteFocused = false,
  displayPrefs = {},
  prevNotePx = 0,
}) {
  const safeW = Math.max(160, Number.isFinite(width) ? width : 880);
  const safeH = Math.max(100, Number.isFinite(height) ? height : 600);
  const titleScale = (Number(displayPrefs?.titleScale) || 100) / 100;
  const noteScale = (Number(displayPrefs?.noteScale) || 100) / 100;
  const layoutFocus = displayPrefs?.layoutFocus || 'balanced';
  const noteAlignPref = displayPrefs?.noteAlign || 'auto';

  const isWidget = form === 'strip' || form === 'tile' || form === 'tall' || form === 'card';
  const availTitleWidth = isWidget ? Math.max(90, safeW - 44) : Math.max(120, safeW - 150);
  const headline = (title && title.trim()) || placeholderTitle || '';
  const titleUnits = Math.max(4.5, visualUnits(headline));

  let titleFloor = 20;
  let titleCeil = 44;
  let titleHeightCap = safeH * 0.052 + 12;
  if (form === 'fullscreen') {
    titleFloor = 26;
    titleCeil = 66;
    titleHeightCap = safeH * 0.066 + 14;
  } else if (form === 'tall' || form === 'card') {
    titleFloor = 14;
    titleCeil = 24;
    titleHeightCap = safeH * 0.062 + 8;
  } else if (form === 'tile') {
    titleFloor = 13;
    titleCeil = 19;
    titleHeightCap = Math.min(safeW * 0.075, safeH * 0.082);
  } else if (form === 'strip') {
    titleFloor = 13;
    titleCeil = 19;
    titleHeightCap = safeH * 0.135;
  }

  const fitTitleOneLine = (availTitleWidth * 0.9) / titleUnits;
  const autoTitle = clamp(Math.min(fitTitleOneLine, titleHeightCap), titleFloor, titleCeil);
  const hardTitleMax = form === 'strip' || form === 'tile' ? titleCeil * 1.18 : titleCeil * 1.45;
  const titlePx = roundHalf(clamp(autoTitle * titleScale, titleFloor * 0.85, hardTitleMax));

  const availNoteWidth =
    form === 'fullscreen'
      ? Math.min(safeW - 48, Math.max(760, safeW * 0.86))
      : isWidget
        ? Math.max(120, safeW - 28)
        : Math.min(safeW - 36, Math.max(520, safeW * 0.9));

  const minStageReserve =
    form === 'fullscreen'
      ? Math.max(220, safeH * 0.34)
      : form === 'standard'
        ? Math.max(170, safeH * 0.34)
        : Math.max(96, safeH * 0.45);

  let focusRatio = layoutFocus === 'note' ? 0.54 : layoutFocus === 'timer' ? 0.28 : 0.43;
  if (form === 'card') {
    focusRatio = layoutFocus === 'note' ? 0.36 : layoutFocus === 'timer' ? 0.20 : 0.28;
  } else if (form === 'tall') {
    focusRatio = layoutFocus === 'note' ? 0.42 : layoutFocus === 'timer' ? 0.24 : 0.33;
  } else if (form === 'tile' || form === 'strip') {
    focusRatio = 0.22;
  }

  const noteMaxHeightPx = Math.round(
    clamp(safeH * focusRatio, 52, Math.max(52, safeH - minStageReserve)),
  );

  // 한국어 어절이 2~4글자씩 과도하게 줄바꿈되지 않도록 한 줄 최소 수용 글자 수를 보장합니다.
  const minCpl = form === 'tall' ? 7.5 : 8.8;
  const widthCap = availNoteWidth / minCpl;

  const noteFloor = form === 'fullscreen' ? 18 : isWidget ? 12 : 14.5;
  const noteCeil = form === 'fullscreen' ? 56 : isWidget ? 22 : 38;

  const cleanNote = (note || '').trim();
  let autoNote;
  if (!cleanNote) {
    if (form === 'fullscreen') {
      autoNote = clamp(safeW * 0.025 + 10, 22, 38);
    } else if (isWidget) {
      autoNote = clamp(safeW * 0.04 + 4, 12, 18);
    } else {
      autoNote = clamp(safeW * 0.024 + 8, 16, 26);
    }
  } else {
    const searchCeil = Math.min(noteCeil, widthCap);
    autoNote = noteFloor;
    if (searchCeil > noteFloor) {
      // 이진 탐색으로 스크롤 없이 한 화면에 들어가는 가장 큰 글자 크기를 찾습니다.
      let low = noteFloor;
      let high = searchCeil;
      for (let step = 0; step < 14; step++) {
        const mid = (low + high) / 2;
        const lines = estimateWrappedLines(cleanNote, availNoteWidth, mid);
        if (lines * (mid * 1.58) <= noteMaxHeightPx) {
          autoNote = mid;
          low = mid;
        } else {
          high = mid;
        }
      }
      autoNote = roundHalf(autoNote);
    } else {
      autoNote = roundHalf(Math.max(11.5, searchCeil));
    }
  }

  const hardNoteMax = Math.max(noteFloor, Math.min(noteCeil * 1.25, availNoteWidth / 6.2));
  const scaledNote = roundHalf(clamp(autoNote * noteScale, noteFloor * 0.85, hardNoteMax));

  // 타이핑 중에는 줄어들어야 할 때만 즉시 줄이고, 커질 때는 18% 이상 여유가 날 때만 키워 화면 떨림을 막습니다.
  let notePx = scaledNote;
  if (noteFocused && prevNotePx > 0) {
    if (scaledNote >= prevNotePx && scaledNote < prevNotePx * 1.18) {
      notePx = prevNotePx;
    }
  }

  return {
    titlePx,
    notePx,
    noteMaxHeightPx,
    availNoteWidth: Math.round(availNoteWidth),
    resolvedAlign: resolveNoteAlign(note, noteAlignPref),
  };
}

/**
 * 위젯 창이 모니터 작업영역 가장자리에 가까우면 일정 간격(눈에 보이는 카드 기준 8px)으로 자석처럼 맞춥니다.
 * @param {PhysicalRect} rect
 * @param {import('../windows/windowPlacement.js').MonitorGeometry[]} monitors
 * @param {{ snapThresholdLogical?: number, edgeGapLogical?: number }} [options]
 * @returns {{ x: number, y: number, snapped: boolean }}
 */
export function snapWidgetToMonitorEdges(
  rect,
  monitors,
  { snapThresholdLogical = 16, edgeGapLogical = 2 } = {},
) {
  if (!rect || !Array.isArray(monitors) || monitors.length === 0) {
    return { x: rect?.x ?? 0, y: rect?.y ?? 0, snapped: false };
  }
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const monitor =
    monitors.find(
      (m) => cx >= m.bounds.x && cx < m.bounds.x + m.bounds.width && cy >= m.bounds.y && cy < m.bounds.y + m.bounds.height,
    ) ?? monitors[0];
  if (!monitor) return { x: rect.x, y: rect.y, snapped: false };

  const scale = monitor.scale > 0 ? monitor.scale : 1;
  const threshold = snapThresholdLogical * scale;
  const gap = Math.round(edgeGapLogical * scale);
  const { work } = monitor;

  let x = rect.x;
  let y = rect.y;
  let snapped = false;

  const leftEdge = work.x + gap;
  const rightEdge = work.x + work.width - rect.width - gap;
  if (Math.abs(rect.x - leftEdge) <= threshold) {
    x = Math.round(leftEdge);
    snapped = true;
  } else if (Math.abs(rect.x - rightEdge) <= threshold) {
    x = Math.round(rightEdge);
    snapped = true;
  }

  const topEdge = work.y + gap;
  const bottomEdge = work.y + work.height - rect.height - gap;
  if (Math.abs(rect.y - topEdge) <= threshold) {
    y = Math.round(topEdge);
    snapped = true;
  } else if (Math.abs(rect.y - bottomEdge) <= threshold) {
    y = Math.round(bottomEdge);
    snapped = true;
  }

  return { x, y, snapped };
}

/**
 * 여러 타이머를 연달아 위젯으로 전환할 때 이미 떠 있는 위젯과 겹치지 않도록 계단식으로 자리를 비켜 줍니다.
 * @param {PhysicalRect} desiredRect
 * @param {PhysicalRect[]} existingRects
 * @param {{ x: number, y: number, width: number, height: number }} monitorWork
 * @param {number} [stepPhysical]
 * @returns {PhysicalRect}
 */
export function resolveNonOverlappingWidgetBounds(
  desiredRect,
  existingRects,
  monitorWork,
  stepPhysical = 32,
) {
  let x = desiredRect.x;
  let y = desiredRect.y;
  const maxX = monitorWork.x + Math.max(0, monitorWork.width - desiredRect.width);
  const maxY = monitorWork.y + Math.max(0, monitorWork.height - desiredRect.height);

  for (let attempt = 0; attempt < 8; attempt++) {
    const overlaps = existingRects.some(
      (other) => Math.abs(other.x - x) < 24 && Math.abs(other.y - y) < 24,
    );
    if (!overlaps) break;
    x = clamp(x - stepPhysical, monitorWork.x, maxX);
    y = clamp(y + stepPhysical, monitorWork.y, maxY);
    if (existingRects.some((other) => Math.abs(other.x - x) < 24 && Math.abs(other.y - y) < 24)) {
      x = clamp(desiredRect.x + stepPhysical * (attempt + 1), monitorWork.x, maxX);
    }
  }

  return {
    x: Math.round(clamp(x, monitorWork.x, maxX)),
    y: Math.round(clamp(y, monitorWork.y, maxY)),
    width: desiredRect.width,
    height: desiredRect.height,
  };
}
