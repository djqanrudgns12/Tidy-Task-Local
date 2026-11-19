import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFontSizePt,
  resolveDeadlineTone,
  formatDeadlineChip,
  cssColorToHex,
  matchFontName,
  computeMenuBounds,
} from './richTextFormat.js';

test('normalizeFontSizePt는 0.5pt 반올림과 [1, maxPt] 상한을 지킨다', () => {
  assert.equal(normalizeFontSizePt(10), 10);
  assert.equal(normalizeFontSizePt('12.4'), 12.5);
  assert.equal(normalizeFontSizePt(0), 1);
  assert.equal(normalizeFontSizePt(-5), 1);
  assert.equal(normalizeFontSizePt(99, 40), 40);
  assert.equal(normalizeFontSizePt(120, Infinity), 120);
  assert.equal(normalizeFontSizePt('abc'), null);
});

test('resolveDeadlineTone은 TodoList와 동일한 5단계 마감일 톤을 반환한다', () => {
  const now = new Date(2026, 10, 15, 14, 0); // 2026-11-15
  assert.equal(resolveDeadlineTone('', now), 'none');
  assert.equal(resolveDeadlineTone('2026-11-14', now), 'overdue');
  assert.equal(resolveDeadlineTone('2026-11-15', now), 'today');
  assert.equal(resolveDeadlineTone('2026-11-18', now), 'soon');
  assert.equal(resolveDeadlineTone('2026-11-22', now), 'week');
  assert.equal(resolveDeadlineTone('2026-11-23', now), 'later');
});

test('formatDeadlineChip은 오늘은 "오늘", 그 외는 MM.DD로 만든다', () => {
  const now = new Date(2026, 10, 15, 9, 0);
  assert.equal(formatDeadlineChip('', now), '');
  assert.equal(formatDeadlineChip('2026-11-15', now), '오늘');
  assert.equal(formatDeadlineChip('2026-11-17', now), '11.17');
  assert.equal(formatDeadlineChip('2026-03-05', now), '03.05');
});

test('cssColorToHex는 rgb/rgba/축약 hex를 #rrggbb로 정규화하고 투명은 빈 문자열로 돌린다', () => {
  assert.equal(cssColorToHex('rgb(79, 70, 229)'), '#4f46e5');
  assert.equal(cssColorToHex('rgba(254, 240, 138, 1)'), '#fef08a');
  assert.equal(cssColorToHex('rgba(0, 0, 0, 0)'), '');
  assert.equal(cssColorToHex('transparent'), '');
  assert.equal(cssColorToHex('#F0A'), '#ff00aa');
  assert.equal(cssColorToHex('#DC2626'), '#dc2626');
});

test('matchFontName은 computed font-family에서 앱 폰트 이름을 정확 일치 우선으로 찾는다', () => {
  const fonts = [
    { name: '굴림', family: '"Gulim", sans-serif' },
    { name: '새굴림', family: '"New Gulim", sans-serif' },
    { name: '바탕', family: '"Batang", serif' },
    { name: '리디바탕', family: '"리디바탕", serif' },
    { name: '메이플스토리 L', family: '"메이플스토리 L", sans-serif' },
    { name: '메이플스토리 B', family: '"메이플스토리 B", sans-serif' },
    { name: '맑은고딕', family: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  ];
  assert.equal(matchFontName('"Malgun Gothic", sans-serif', fonts), '맑은고딕');
  assert.equal(matchFontName('"리디바탕", serif', fonts), '리디바탕');
  assert.equal(matchFontName('"New Gulim", sans-serif', fonts), '새굴림');
  assert.equal(matchFontName('"메이플스토리 B", sans-serif', fonts), '메이플스토리 B');
  assert.equal(matchFontName('"Pretendard", sans-serif', fonts), 'Pretendard');
});

test('computeMenuBounds는 60색 팔레트 확장 시 모니터 하단·우측 경계 안으로 보정한다', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };
  // 일반 위치는 그대로 유지
  assert.deepEqual(
    computeMenuBounds({ anchorX: 400, anchorY: 300, width: 220, height: 170, scale: 1, work }),
    { left: 400, top: 300 }
  );
  // 150% DPI 모니터 우측 하단에서 60색 확장(높이 340px) 시 화면 안으로 끌어올림
  const clamped = computeMenuBounds({ anchorX: 1800, anchorY: 850, width: 220, height: 340, scale: 1.5, work });
  assert.equal(clamped.left, Math.round(1920 - 220 * 1.5));
  assert.equal(clamped.top, Math.round(1040 - 340 * 1.5));
  // 좌상단 음수 모니터(보조 모니터 왼쪽 배치)에서도 work.x/y 아래로 넘어가지 않음
  const leftMon = { x: -1920, y: 0, width: 1920, height: 1080 };
  const clampedLeft = computeMenuBounds({ anchorX: -1950, anchorY: -20, width: 220, height: 120, scale: 1, work: leftMon });
  assert.deepEqual(clampedLeft, { left: -1920, top: 0 });
});
