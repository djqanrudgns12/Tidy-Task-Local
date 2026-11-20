import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDY_THEMES } from '../themes.js';
import { mixHex } from '../dday/ddayBadge.js';
import {
  TODO_BADGE_METRICS,
  classifyDeadlineKind,
  computeFittedDateBadge,
  contrastRatio,
  deadlinePaletteSetToStyle,
  resolveDeadlinePaletteSet,
  resolveTodoBadgeMetrics,
  splitShortDateParts,
} from './todoBadgeMetrics.js';

test('resolveTodoBadgeMetrics: 6~15pt 전 구간 비대칭 감쇠 치수가 정체 없이 증가한다', () => {
  /** @type {Record<number, { h: number, w: number, fs: number, icon: number }>} */
  const expected = {
    6: { h: 18, w: 58, fs: 9.5, icon: 10.5 },
    7: { h: 19, w: 58, fs: 9.5, icon: 11.0 },
    8: { h: 20, w: 58, fs: 9.56, icon: 11.5 },
    9: { h: 21, w: 61, fs: 10.03, icon: 12.0 },
    10: { h: 22, w: 64, fs: 10.5, icon: 12.5 },
    11: { h: 23, w: 68, fs: 11.08, icon: 13.0 },
    12: { h: 24, w: 71, fs: 11.66, icon: 14.0 },
    13: { h: 26, w: 75, fs: 12.23, icon: 14.5 },
    14: { h: 27, w: 78, fs: 12.81, icon: 15.5 },
    15: { h: 28, w: 82, fs: 13.39, icon: 16.0 },
  };

  let prevHeight = 0;
  for (let pt = 6; pt <= 15; pt += 1) {
    const m = resolveTodoBadgeMetrics(pt);
    const e = expected[pt];
    assert.equal(m.heightPx, e.h, `${pt}pt heightPx`);
    assert.equal(m.slotWidthPx, e.w, `${pt}pt slotWidthPx`);
    assert.equal(m.fontSizePx, e.fs, `${pt}pt fontSizePx`);
    assert.equal(m.iconSizePx, e.icon, `${pt}pt iconSizePx`);
    assert.equal(m.availWidthPx, e.w - 10, `${pt}pt availWidthPx`);
    assert.ok(m.heightPx > prevHeight, `${pt}pt 높이는 직전 단계보다 커야 함`);
    prevHeight = m.heightPx;
  }

  // 경계 클램프 & 잘못된 입력 방어
  assert.equal(resolveTodoBadgeMetrics(2).heightPx, 18);
  assert.equal(resolveTodoBadgeMetrics(40).heightPx, 28);
  assert.equal(resolveTodoBadgeMetrics(NaN).heightPx, 22);
});

test('computeFittedDateBadge: 1차 통과 · 2차 자간/비트맵 단계 축소 · 3차 슬롯 확장을 정확히 판정한다', () => {
  const base = resolveTodoBadgeMetrics(10); // availWidthPx = 54, fontSizePx = 10.5

  // 1차 통과
  const s1 = computeFittedDateBadge({
    base,
    measuredBase: 48,
    measureAt: () => 48,
  });
  assert.deepEqual(s1, { fontPx: 10.5, slotPx: 64, letterSpacingEm: -0.025, stage: 1 });

  // 2차-a: 자간(-0.045em) 조정만으로 가용 폭(54px) 안착
  const s2a = computeFittedDateBadge({
    base,
    measuredBase: 55.2,
    measureAt: (fs, ls) => (ls <= -0.04 && fs >= 10.5 ? 53.5 : 55.2),
  });
  assert.deepEqual(s2a, { fontPx: 10.5, slotPx: 64, letterSpacingEm: -0.045, stage: 2 });

  // 2차-b: 비트맵 반올림으로 첫 비율 후보(9.5px)는 54.4px로 넘치지만 0.25px 감량(9.25px)에서 통과
  const s2b = computeFittedDateBadge({
    base,
    measuredBase: 61,
    measureAt: (fs) => (fs >= 10.5 ? 59.5 : fs > 9.25 ? 54.4 : 52.8),
  });
  assert.deepEqual(s2b, { fontPx: 9.25, slotPx: 64, letterSpacingEm: -0.045, stage: 2 });

  // 3차 안전망: 글자 하한(8.5px)에서도 60.4px > 54px → slotPx = ceil(60.4 + 10) = 71px
  const s3 = computeFittedDateBadge({
    base,
    measuredBase: 74,
    measureAt: (fs) => (fs <= 8.5 ? 60.4 : 71),
  });
  assert.deepEqual(s3, { fontPx: 8.5, slotPx: 71, letterSpacingEm: -0.045, stage: 3 });
});

test('splitShortDateParts & classifyDeadlineKind: 날짜/요일 분리와 NaN·경계 분류를 정확히 처리한다', () => {
  assert.deepEqual(splitShortDateParts('11/23(월)'), { main: '11/23', dow: '(월)' });
  assert.deepEqual(splitShortDateParts('5/4(화)'), { main: '5/4', dow: '(화)' });
  assert.deepEqual(splitShortDateParts('2026-11-23'), { main: '2026-11-23', dow: '' });

  assert.equal(classifyDeadlineKind('', NaN), 'unset');
  assert.equal(classifyDeadlineKind(null, 0), 'unset');
  assert.equal(classifyDeadlineKind('bad-date', NaN), 'invalid');
  assert.equal(classifyDeadlineKind('bad-date', Infinity), 'invalid');
  assert.equal(classifyDeadlineKind('2026-11-19', -1), 'overdue');
  assert.equal(classifyDeadlineKind('2026-11-20', 0), 'today');
  assert.equal(classifyDeadlineKind('2026-11-21', 1), 'soon');
  assert.equal(classifyDeadlineKind('2026-11-23', 3), 'soon');
  assert.equal(classifyDeadlineKind('2026-11-24', 4), 'week');
  assert.equal(classifyDeadlineKind('2026-11-27', 7), 'week');
  assert.equal(classifyDeadlineKind('2026-11-28', 8), 'later');
});

test('resolveDeadlinePaletteSet: 15개 테마 × 라이트/다크 30조합 모두 WCAG AA 대비와 light-dark() 미사용을 만족한다', () => {
  assert.equal(TIDY_THEMES.length, 15);
  /** @type {readonly import('./todoBadgeMetrics.js').DeadlineKind[]} */
  const textStates = ['overdue', 'today', 'soon', 'week', 'later'];

  for (const theme of TIDY_THEMES) {
    for (const dark of [false, true]) {
      const set = resolveDeadlinePaletteSet(theme.id, dark);
      const style = deadlinePaletteSetToStyle(set);

      assert.equal(style.includes('light-dark('), false, `${theme.id}/${dark}에 light-dark() 포함됨`);

      for (const kind of textStates) {
        const s = set.states[kind];
        const restRatio = contrastRatio(s.color, s.bg);
        const hoverRatio = contrastRatio(s.color, s.hoverBg);
        assert.ok(
          restRatio >= TODO_BADGE_METRICS.MIN_TEXT_CONTRAST,
          `${theme.id}/${dark}/${kind} 평소 대비 부족: ${restRatio.toFixed(2)}`,
        );
        assert.ok(
          hoverRatio >= TODO_BADGE_METRICS.MIN_TEXT_CONTRAST,
          `${theme.id}/${dark}/${kind} 호버 대비 부족: ${hoverRatio.toFixed(2)}`,
        );
      }

      const inv = set.states.invalid;
      assert.ok(
        contrastRatio(inv.color, inv.bg) >= TODO_BADGE_METRICS.MIN_TEXT_CONTRAST,
        `${theme.id}/${dark}/invalid 평소 대비 부족`,
      );
      assert.ok(
        contrastRatio(inv.color, inv.hoverBg) >= TODO_BADGE_METRICS.MIN_TEXT_CONTRAST,
        `${theme.id}/${dark}/invalid 호버 대비 부족`,
      );

      // unset은 투명 배경 위이므로 테마 표면 합성 배경 위에서 비텍스트 3.0:1 이상을 검증합니다.
      const tintBase = dark
        ? (theme.group === 'paper' ? '#26221e' : '#1f2430')
        : (theme.group === 'paper' ? mixHex('#fffaf0', theme.tidy.bg, 0.58) : theme.group === 'modern' ? '#fffdf9' : '#ffffff');
      const unsetComposite = mixHex(dark ? '#94a3b8' : '#64748b', tintBase, dark ? 0.08 : 0.05);
      const iconRatio = contrastRatio(set.states.unset.color, unsetComposite);
      assert.ok(
        iconRatio >= TODO_BADGE_METRICS.MIN_ICON_CONTRAST,
        `${theme.id}/${dark}/unset 아이콘 대비 부족: ${iconRatio.toFixed(2)}`,
      );
    }
  }
});
