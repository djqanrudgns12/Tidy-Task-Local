import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDY_THEMES } from '../themes.js';
import { contrastRatio } from '../dday/ddayBadge.js';
import {
  ARCHIVE_BUDDY_COLORS,
  ARCHIVE_MENU_MIN_CONTRAST,
  archiveMenuPaletteToStyle,
  resolveArchiveMenuPalette,
} from './archiveMenuPalette.js';

const HEX6 = /^#[0-9a-f]{6}$/i;

test('15개 테마 × 라이트/다크 모든 색이 명시 6자리 Hex다 (light-dark()·rgba 없음)', () => {
  for (const theme of TIDY_THEMES) {
    for (const dark of [false, true]) {
      const p = resolveArchiveMenuPalette(theme.id, dark);
      for (const [key, value] of Object.entries(p)) {
        if (key === 'dark') continue;
        assert.match(String(value), HEX6, `${theme.id}/${dark ? 'dark' : 'light'}/${key}=${value}`);
      }
    }
  }
});

test('글자 대비: 이름·설명·강조 글자가 딱지(평소·올림) 위에서, 개수 방울 글자가 방울 위에서 4.5:1 이상', () => {
  for (const theme of TIDY_THEMES) {
    for (const dark of [false, true]) {
      const p = resolveArchiveMenuPalette(theme.id, dark);
      const label = `${theme.id}/${dark ? 'dark' : 'light'}`;
      for (const surface of [p.tile, p.tileHover, p.card]) {
        assert.ok(contrastRatio(p.ink, surface) >= ARCHIVE_MENU_MIN_CONTRAST, `${label} ink`);
        assert.ok(contrastRatio(p.muted, surface) >= ARCHIVE_MENU_MIN_CONTRAST, `${label} muted ${contrastRatio(p.muted, surface).toFixed(2)}`);
      }
      assert.ok(contrastRatio(p.accentInk, p.tileHover) >= ARCHIVE_MENU_MIN_CONTRAST, `${label} accentInk`);
      assert.ok(contrastRatio(p.onAccent, p.bubble) >= ARCHIVE_MENU_MIN_CONTRAST, `${label} bubble`);
    }
  }
});

test('상자 친구 얼굴은 골판지 몸통 위에서 또렷하다(테마와 무관)', () => {
  assert.ok(contrastRatio(ARCHIVE_BUDDY_COLORS.face, ARCHIVE_BUDDY_COLORS.body) >= 4.5);
});

test('모르는 테마는 기본 테마로, style 문자열은 --am-* 변수만 만든다', () => {
  const fallback = resolveArchiveMenuPalette('no-such-theme', false);
  assert.match(fallback.accent, HEX6);
  const style = archiveMenuPaletteToStyle(fallback);
  assert.ok(style.split('; ').every((part) => /^--am-[a-z-]+: #[0-9a-f]{6}$/i.test(part)), style);
});
