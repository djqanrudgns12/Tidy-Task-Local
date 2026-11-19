import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDY_THEMES } from '../themes.js';
import { DDAY_TONES } from './ddayModel.js';
import {
  DDAY_BADGE_KINDS,
  badgePaletteToStyle,
  contrastRatio,
  resolveBadgePalette,
  resolveControlGlyphState,
  resolveTodoBadgeModel,
} from './ddayBadge.js';

const TODAY = '2026-11-19';

test('resolveTodoBadgeModel differentiates all 7 countdown and since badge kinds and glyphs', () => {
  const upcoming = resolveTodoBadgeModel(
    { date: '2026-12-05', countMode: 'countdown', repeatYearly: false, tone: 'accent' },
    TODAY,
  );
  assert.equal(upcoming.badgeKind, 'countdown-upcoming');
  assert.equal(upcoming.glyph, 'hourglass-mini');
  assert.equal(upcoming.label, 'D-16');
  assert.equal(upcoming.dashed, false);

  const week = resolveTodoBadgeModel(
    { date: '2026-11-25', countMode: 'countdown', repeatYearly: false, tone: 'accent' },
    TODAY,
  );
  assert.equal(week.badgeKind, 'countdown-week');
  assert.equal(week.glyph, 'hourglass-mini');
  assert.equal(week.label, 'D-6');

  const imminent = resolveTodoBadgeModel(
    { date: '2026-11-21', countMode: 'countdown', repeatYearly: false, tone: 'accent' },
    TODAY,
  );
  assert.equal(imminent.badgeKind, 'countdown-imminent');
  assert.equal(imminent.glyph, 'bell-spark');
  assert.equal(imminent.label, 'D-2');
  assert.equal(imminent.emphasis, 'imminent');

  const today = resolveTodoBadgeModel(
    { date: TODAY, countMode: 'countdown', repeatYearly: false, tone: 'accent' },
    TODAY,
  );
  assert.equal(today.badgeKind, 'countdown-today');
  assert.equal(today.glyph, 'star-burst');
  assert.equal(today.label, 'D-Day');
  assert.equal(today.palette.solid, true);

  const overdue = resolveTodoBadgeModel(
    { date: '2026-11-16', countMode: 'countdown', repeatYearly: false, tone: 'accent' },
    TODAY,
  );
  assert.equal(overdue.badgeKind, 'countdown-overdue');
  assert.equal(overdue.glyph, 'clock-past');
  assert.equal(overdue.label, 'D+3');
  assert.equal(overdue.emphasis, 'muted');

  const sinceCounting = resolveTodoBadgeModel(
    { date: '2026-11-10', countMode: 'since', repeatYearly: false, tone: 'emerald' },
    TODAY,
  );
  assert.equal(sinceCounting.badgeKind, 'since-counting');
  assert.equal(sinceCounting.glyph, 'sprout-mini');
  assert.equal(sinceCounting.label, '+10일');
  assert.equal(sinceCounting.dashed, false);

  const sinceScheduled = resolveTodoBadgeModel(
    { date: '2026-11-24', countMode: 'since', repeatYearly: false, tone: 'sky' },
    TODAY,
  );
  assert.equal(sinceScheduled.badgeKind, 'since-scheduled');
  assert.equal(sinceScheduled.glyph, 'seed-plus');
  assert.equal(sinceScheduled.label, 'D-5');
  assert.equal(sinceScheduled.dashed, true);
  assert.equal(sinceScheduled.palette.dashed, true);
});

test('repeatYearly swaps upcoming and week glyphs to loop-mini while keeping imminent and today priority', () => {
  const repeatUpcoming = resolveTodoBadgeModel(
    { date: '2025-12-10', countMode: 'countdown', repeatYearly: true, tone: 'lilac' },
    TODAY,
  );
  assert.equal(repeatUpcoming.badgeKind, 'countdown-upcoming');
  assert.equal(repeatUpcoming.glyph, 'loop-mini');
  assert.equal(repeatUpcoming.isRepeat, true);
  assert.match(repeatUpcoming.title, /매년 반복/);

  const repeatWeek = resolveTodoBadgeModel(
    { date: '2024-11-24', countMode: 'countdown', repeatYearly: true, tone: 'lilac' },
    TODAY,
  );
  assert.equal(repeatWeek.badgeKind, 'countdown-week');
  assert.equal(repeatWeek.glyph, 'loop-mini');

  const repeatImminent = resolveTodoBadgeModel(
    { date: '2020-11-21', countMode: 'countdown', repeatYearly: true, tone: 'lilac' },
    TODAY,
  );
  assert.equal(repeatImminent.badgeKind, 'countdown-imminent');
  assert.equal(repeatImminent.glyph, 'bell-spark');
  assert.match(repeatImminent.title, /매년 반복/);

  const repeatToday = resolveTodoBadgeModel(
    { date: '2021-11-19', countMode: 'countdown', repeatYearly: true, tone: 'lilac' },
    TODAY,
  );
  assert.equal(repeatToday.badgeKind, 'countdown-today');
  assert.equal(repeatToday.glyph, 'star-burst');
});

test('since mode ignores legacy repeatYearly and repeatYearly handles Feb 29 non-leap rollover', () => {
  const legacySince = resolveTodoBadgeModel(
    { date: '2026-11-01', countMode: 'since', repeatYearly: true, tone: 'accent' },
    TODAY,
  );
  assert.equal(legacySince.badgeKind, 'since-counting');
  assert.equal(legacySince.glyph, 'sprout-mini');
  assert.equal(legacySince.isRepeat, false);

  // 2024-02-29 → 2027-02-28 (평년 보정)
  const leapAdjusted = resolveTodoBadgeModel(
    { date: '2024-02-29', countMode: 'countdown', repeatYearly: true, tone: 'accent' },
    '2027-02-20',
  );
  assert.equal(leapAdjusted.label, 'D-8');
  assert.equal(leapAdjusted.badgeKind, 'countdown-upcoming');
});

test('malformed dates and huge day counts fail gracefully without throwing', () => {
  const emptyDate = resolveTodoBadgeModel(
    { date: '', countMode: 'countdown', repeatYearly: false, tone: 'accent' },
    TODAY,
  );
  assert.equal(emptyDate.label, 'D-0');
  assert.equal(emptyDate.badgeKind, 'countdown-today');

  const badSince = resolveTodoBadgeModel(
    { date: 'not-a-date', countMode: 'since', repeatYearly: false, tone: 'accent' },
    TODAY,
  );
  assert.equal(badSince.label, '+1일');
  assert.equal(badSince.badgeKind, 'since-counting');

  const farFuture = resolveTodoBadgeModel(
    { date: '2030-12-28', countMode: 'countdown', repeatYearly: false, tone: 'sky' },
    TODAY,
  );
  assert.equal(farFuture.label, 'D-1500');

  const longSince = resolveTodoBadgeModel(
    { date: '2021-05-30', countMode: 'since', repeatYearly: false, tone: 'emerald' },
    TODAY,
  );
  assert.equal(longSince.label, '+2000일');
});

test('resolveControlGlyphState tracks idle, countdown urgencies, and since mode', () => {
  const idle = resolveControlGlyphState([], TODAY, { themeColor: 'periwinkle', dark: false });
  assert.equal(idle.mode, 'idle');
  assert.equal(idle.badgeText, 'D-');
  assert.equal(idle.urgency, 'none');
  assert.equal(idle.palette.showDot, false);

  const mkItem = (/** @type {any} */ patch) => ({
    id: 'd1',
    title: '테스트',
    date: '2026-11-25',
    startDate: TODAY,
    countMode: 'countdown',
    repeatYearly: false,
    icon: 'flag',
    tone: 'accent',
    status: 'active',
    completedAt: null,
    linkedTodoId: null,
    showInTodo: true,
    showInBanner: true,
    showInWidget: true,
    order: 0,
    ...patch,
  });

  const normal = resolveControlGlyphState([mkItem({ date: '2026-11-25' })], TODAY, { themeColor: 'periwinkle' });
  assert.equal(normal.mode, 'countdown');
  assert.equal(normal.badgeText, 'D-');
  assert.equal(normal.urgency, 'normal');
  assert.equal(normal.palette.showDot, true);
  assert.equal(normal.palette.sparkleDot, false);

  const imminent = resolveControlGlyphState([mkItem({ date: '2026-11-21' })], TODAY);
  assert.equal(imminent.urgency, 'imminent');
  assert.equal(imminent.palette.showDot, true);

  const today = resolveControlGlyphState([mkItem({ date: TODAY })], TODAY);
  assert.equal(today.urgency, 'today');
  assert.equal(today.palette.sparkleDot, true);

  const overdue = resolveControlGlyphState([mkItem({ date: '2026-11-15' })], TODAY);
  assert.equal(overdue.urgency, 'overdue');
  assert.equal(overdue.palette.showDot, false);

  const sinceCounting = resolveControlGlyphState([mkItem({ date: '2026-11-10', countMode: 'since' })], TODAY);
  assert.equal(sinceCounting.mode, 'since');
  assert.equal(sinceCounting.badgeText, 'D+');
  assert.equal(sinceCounting.urgency, 'counting');

  const sinceScheduled = resolveControlGlyphState([mkItem({ date: '2026-11-26', countMode: 'since' })], TODAY);
  assert.equal(sinceScheduled.mode, 'since');
  assert.equal(sinceScheduled.badgeText, 'D+');
  assert.equal(sinceScheduled.urgency, 'scheduled');
});

test('imminent badges keep explicit tone body while applying coral alert icon/border', () => {
  const accentImminent = resolveTodoBadgeModel(
    { date: '2026-11-21', countMode: 'countdown', repeatYearly: false, tone: 'accent' },
    TODAY,
    { themeColor: 'green', dark: false },
  );
  assert.equal(accentImminent.palette.iconPrimary, '#e11d48');
  assert.equal(accentImminent.palette.ink !== '#047857', true);

  const emeraldImminent = resolveTodoBadgeModel(
    { date: '2026-11-21', countMode: 'countdown', repeatYearly: false, tone: 'emerald' },
    TODAY,
    { themeColor: 'periwinkle', dark: false },
  );
  const emeraldNormal = resolveTodoBadgeModel(
    { date: '2026-11-25', countMode: 'countdown', repeatYearly: false, tone: 'emerald' },
    TODAY,
    { themeColor: 'periwinkle', dark: false },
  );
  assert.equal(emeraldImminent.palette.bg, emeraldNormal.palette.bg);
  assert.equal(emeraldImminent.palette.ink, emeraldNormal.palette.ink);
  assert.equal(emeraldImminent.palette.iconPrimary, '#e11d48');
  assert.notEqual(emeraldImminent.palette.border, emeraldNormal.palette.border);
});

test('neutral and paper themes receive distinct tailored palettes and serialize cleanly', () => {
  for (const id of ['white', 'slate']) {
    const active = resolveBadgePalette({ themeColor: id, tone: 'accent', badgeKind: 'countdown-upcoming', dark: false });
    const overdue = resolveBadgePalette({ themeColor: id, tone: 'accent', badgeKind: 'countdown-overdue', dark: false });
    assert.notEqual(active.iconPrimary, overdue.iconPrimary);
    assert.notEqual(active.bg, overdue.bg);
  }

  for (const id of ['linen', 'kraft', 'sepia']) {
    const paperPalette = resolveBadgePalette({ themeColor: id, tone: 'accent', badgeKind: 'countdown-upcoming', dark: false });
    const paperOverdue = resolveBadgePalette({ themeColor: id, tone: 'accent', badgeKind: 'countdown-overdue', dark: false });
    assert.notEqual(paperPalette.bg, '#ffffff');
    assert.notEqual(paperOverdue.bg, '#f1f5f9');
    const styleStr = badgePaletteToStyle(paperPalette);
    assert.match(styleStr, /--dd-bg:/);
    assert.match(styleStr, /--dd-ink:/);
  }
});

test('all 15 themes x 6 tones x light/dark x 7 badge kinds satisfy WCAG AA (>= 4.5:1) contrast', () => {
  let checked = 0;
  for (const theme of TIDY_THEMES) {
    for (const tone of DDAY_TONES) {
      for (const dark of [false, true]) {
        for (const badgeKind of DDAY_BADGE_KINDS) {
          const palette = resolveBadgePalette({
            themeColor: theme.id,
            tone,
            badgeKind,
            dark,
          });
          const restRatio = contrastRatio(palette.ink, palette.bg);
          const hoverRatio = contrastRatio(palette.ink, palette.hoverBg);
          assert.ok(
            restRatio >= 4.5,
            `WCAG AA rest contrast failed (${restRatio.toFixed(2)}) for ${theme.id}/${tone}/dark=${dark}/${badgeKind}`,
          );
          assert.ok(
            hoverRatio >= 4.5,
            `WCAG AA hover contrast failed (${hoverRatio.toFixed(2)}) for ${theme.id}/${tone}/dark=${dark}/${badgeKind}`,
          );
          checked += 1;
        }
      }
    }
  }
  assert.equal(checked, 15 * 6 * 2 * 7);
});
