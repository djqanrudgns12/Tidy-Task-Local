import test from 'node:test';
import assert from 'node:assert/strict';
import {
  visualUnits,
  estimateWrappedLines,
  classifyTimerSurface,
  resolveWidgetHeadline,
  resolveNoteAlign,
  computeSmartTypography,
  snapWidgetToMonitorEdges,
  resolveNonOverlappingWidgetBounds,
} from './layout.js';

test('짧은 설명은 기본 창과 전체화면에서 큼직하게 커지고, 5줄 설명도 스크롤 없이 맞춘다', () => {
  const shortStandard = computeSmartTypography({
    width: 880,
    height: 600,
    form: 'standard',
    title: '모둠 토의',
    note: '핵심 내용 세 가지를 포스트잇에 적어 주세요.',
    placeholderTitle: '전광판 타이머',
  });
  assert.ok(shortStandard.titlePx >= 32, `기본 창 제목 크기 ${shortStandard.titlePx}`);
  assert.ok(shortStandard.notePx >= 24, `기본 창 짧은 설명 크기 ${shortStandard.notePx}`);
  assert.equal(shortStandard.resolvedAlign, 'center');

  const shortFullscreen = computeSmartTypography({
    width: 1840,
    height: 1000,
    form: 'fullscreen',
    title: '모둠 토의',
    note: '핵심 내용 세 가지를 포스트잇에 적어 주세요.',
    placeholderTitle: '전광판 타이머',
  });
  assert.ok(shortFullscreen.titlePx >= 52, `전체화면 제목 크기 ${shortFullscreen.titlePx}`);
  assert.ok(shortFullscreen.notePx >= 38, `전체화면 짧은 설명 크기 ${shortFullscreen.notePx}`);

  const fiveLines = [
    '1. 조용히 교과서 32쪽을 펴세요.',
    '2. 모르는 단어에 연필로 밑줄을 그으세요.',
    '3. 짝과 함께 뜻을 이야기해 보세요.',
    '4. 발표할 내용을 공책에 한 줄 적으세요.',
    '5. 다 끝나면 손을 머리 위로 올리세요.',
  ].join('\n');
  const multiLine = computeSmartTypography({
    width: 560,
    height: 600,
    form: 'standard',
    title: '국어 읽기 활동',
    note: fiveLines,
    placeholderTitle: '전광판 타이머',
  });
  assert.equal(multiLine.resolvedAlign, 'left');
  const wrapped = estimateWrappedLines(fiveLines, multiLine.availNoteWidth, multiLine.notePx);
  assert.ok(
    wrapped * multiLine.notePx * 1.58 <= multiLine.noteMaxHeightPx + 1,
    `5줄이 예산(${multiLine.noteMaxHeightPx}) 안에 들어가야 함: ${wrapped}줄 × ${multiLine.notePx}px`,
  );
});

test('좁은 폭에서는 과도한 세로 줄바꿈 대신 글자 크기를 먼저 줄여 최소 줄당 글자 수를 지킨다', () => {
  const narrow = computeSmartTypography({
    width: 240,
    height: 360,
    form: 'tall',
    title: '미술 준비물 정리하기',
    note: '물통 씻고 팔레트 닦아서 바구니에 넣으세요.',
    placeholderTitle: '모래시계',
  });
  assert.ok(narrow.availNoteWidth / narrow.notePx >= 7.0, `최소 줄당 글자 수 보장: ${narrow.availNoteWidth / narrow.notePx}`);
});

test('타이핑 포커스 중 히스테리시스로 미세 확대 떨림을 막고, 축소는 즉시 반영한다', () => {
  const base = {
    width: 820,
    height: 580,
    form: /** @type {const} */ ('standard'),
    title: '활동',
    placeholderTitle: '전광판 타이머',
    noteFocused: true,
  };
  const fourLines = '첫 번째 문장입니다.\n두 번째 문장입니다.\n세 번째 문장입니다.\n네 번째 문장입니다.\n다섯 번째 문장입니다.';
  const exact = computeSmartTypography({ ...base, note: fourLines, noteFocused: false });
  // 여유가 18% 미만이면 타이핑 중 크기가 들썩이지 않도록 이전 크기를 유지합니다.
  const hold = computeSmartTypography({ ...base, note: fourLines, prevNotePx: exact.notePx - 2 });
  assert.equal(hold.notePx, exact.notePx - 2);

  // 글이 길어져 칸을 넘칠 때는 즉시 줄여 커서가 가려지지 않게 합니다.
  const longNote = Array.from({ length: 9 }, (_, i) => `${i + 1}. 활동 안내 문장이 꽤 길게 이어집니다.`).join('\n');
  const shrunk = computeSmartTypography({ ...base, note: longNote, prevNotePx: 32 });
  assert.ok(shrunk.notePx < 32);
});

test('사용자 배율과 정렬·비중 취향이 일관되게 반영된다', () => {
  const normal = computeSmartTypography({
    width: 820,
    height: 580,
    form: 'standard',
    title: '과학 실험',
    note: '실험 보고서 작성',
    placeholderTitle: '전광판 타이머',
    displayPrefs: { titleScale: 100, noteScale: 100, noteAlign: 'auto', layoutFocus: 'balanced' },
  });
  const boosted = computeSmartTypography({
    width: 820,
    height: 580,
    form: 'standard',
    title: '과학 실험',
    note: '실험 보고서 작성',
    placeholderTitle: '전광판 타이머',
    displayPrefs: { titleScale: 140, noteScale: 140, noteAlign: 'left', layoutFocus: 'note' },
  });
  assert.ok(boosted.titlePx > normal.titlePx);
  assert.ok(boosted.notePx > normal.notePx);
  assert.equal(boosted.resolvedAlign, 'left');
  assert.ok(boosted.noteMaxHeightPx > normal.noteMaxHeightPx);
});

test('위젯 4대 폼팩터 분류와 경계 히스테리시스가 정확히 동작한다', () => {
  assert.equal(classifyTimerSurface({ width: 920, height: 620 }).form, 'standard');
  assert.equal(classifyTimerSurface({ width: 1920, height: 1080, fullscreen: true, widgetMode: true }).form, 'fullscreen');
  assert.equal(classifyTimerSurface({ width: 380, height: 120, widgetMode: true }).form, 'strip');
  assert.equal(classifyTimerSurface({ width: 220, height: 200, widgetMode: true }).form, 'tile');
  assert.equal(classifyTimerSurface({ width: 260, height: 440, widgetMode: true }).form, 'tall');
  assert.equal(classifyTimerSurface({ width: 340, height: 240, widgetMode: true }).form, 'card');

  // strip 경계(176px)를 3px 넘겨도 직전이 strip이면 형태가 즉시 튀지 않습니다.
  assert.equal(
    classifyTimerSurface({ width: 380, height: 179, widgetMode: true, prevForm: 'strip' }).form,
    'strip',
  );
  // 작은 창에서는 확인창도 인라인 컴팩트 모드로 전환됩니다.
  assert.equal(classifyTimerSurface({ width: 380, height: 120, widgetMode: true }).compactConfirm, true);
  assert.equal(classifyTimerSurface({ width: 220, height: 200, widgetMode: true }).analogDensity, 'minimal');
  assert.equal(classifyTimerSurface({ width: 380, height: 120, widgetMode: true }).stopwatchVariant, 'minimal');
});

test('제목이 비었을 때는 설명 첫 줄을 위젯 헤드라인으로 승격한다', () => {
  assert.deepEqual(resolveWidgetHeadline('모둠 발표', '설명 내용', '전광판 타이머'), {
    text: '모둠 발표',
    promotedFromNote: false,
    isPlaceholder: false,
  });
  assert.deepEqual(resolveWidgetHeadline('   ', '\n1. 조용히 자습하기\n2. 다 하면 책 읽기', '모래시계'), {
    text: '1. 조용히 자습하기',
    promotedFromNote: true,
    isPlaceholder: false,
  });
  assert.deepEqual(resolveWidgetHeadline('', '  ', '모래시계'), {
    text: '모래시계',
    promotedFromNote: false,
    isPlaceholder: true,
  });
  assert.equal(resolveNoteAlign('1. 준비물 꺼내기', 'auto'), 'left');
  assert.equal(resolveNoteAlign('한 줄 안내', 'auto'), 'center');
  assert.ok(visualUnits('한글AB') === 2 + 2 * 0.56);
});

test('자석 도킹은 4K 200%와 FHD 100%에서 가장자리 16논리px 이내를 깔끔하게 맞춘다', () => {
  const fhd = [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, work: { x: 0, y: 0, width: 1920, height: 1032 }, scale: 1 }];
  const snappedFhd = snapWidgetToMonitorEdges({ x: 1572, y: 12, width: 340, height: 236 }, fhd);
  assert.equal(snappedFhd.snapped, true);
  assert.equal(snappedFhd.x, 1920 - 340 - 2);
  assert.equal(snappedFhd.y, 2);

  const uhd = [{ bounds: { x: 0, y: 0, width: 3840, height: 2160 }, work: { x: 0, y: 0, width: 3840, height: 2064 }, scale: 2 }];
  const snappedUhd = snapWidgetToMonitorEdges({ x: 20, y: 1560, width: 680, height: 472 }, uhd);
  assert.equal(snappedUhd.snapped, true);
  assert.equal(snappedUhd.x, 4);
  assert.equal(snappedUhd.y, 2064 - 472 - 4);
});

test('다중 타이머 위젯이 겹칠 때는 작업영역 안에서 계단식으로 비켜 준다', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1032 };
  const placed = resolveNonOverlappingWidgetBounds(
    { x: 1560, y: 20, width: 340, height: 236 },
    [{ x: 1560, y: 20, width: 340, height: 236 }],
    work,
    32,
  );
  assert.ok(placed.x !== 1560 || placed.y !== 20);
  assert.ok(placed.x >= 0 && placed.x + placed.width <= 1920);
  assert.ok(placed.y >= 0 && placed.y + placed.height <= 1032);
});
