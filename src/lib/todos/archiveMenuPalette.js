// ═══════════════════════════════════════════════════════════════════
// [다중 선택 [아카이브] 드롭다운 색] docs/PRD-bulk-archive-dropdown.md §5
//
// 15개 테마 × 라이트/다크 30조합의 색을 명시 6자리 Hex로 계산합니다.
// 왜 CSS의 light-dark()·color-mix()로 두지 않는가: 배포 빌드(lightningcss)가 light-dark()를 변수 대체 코드로 바꿔
//   값이 사라진 전례가 있고(시계 창), 대비(≥ 4.5:1)를 테스트로 보장하려면 숫자로 알고 있어야 합니다.
// 다중 선택 도크(bulkDockLayout.js)와 같은 바탕(다크 #23272e)·같은 섞기 비율 계열을 써서, 도크 바로 밑에 열려도
// 한 벌로 보이게 합니다.
// ═══════════════════════════════════════════════════════════════════
import { getTidyTheme } from '../themes.js';
import { contrastRatio, ensureContrast, mixHex } from '../dday/ddayBadge.js';

export const ARCHIVE_MENU_MIN_CONTRAST = 4.5;

// 상자 친구는 테마와 상관없이 골판지색입니다(어느 테마에서도 "상자"로 알아보게). 볼 터치만 테마 강조색을 섞습니다.
export const ARCHIVE_BUDDY_COLORS = Object.freeze({
  body: '#e8bd82',
  flap: '#f5d6a6',
  outline: '#8b6339',
  tape: '#fff1d3',
  face: '#51391f',
  shade: '#ab7948',
});

/**
 * @typedef {{
 *   dark: boolean, accent: string, accentInk: string, onAccent: string, bubble: string,
 *   card: string, cardBorder: string, cardRim: string, dot: string,
 *   tile: string, tileBorder: string, tileRim: string, tileHover: string, tileHoverBorder: string,
 *   ink: string, muted: string, pictoInk: string, pictoFill: string, cheek: string,
 * }} ArchiveMenuPalette
 */

/**
 * @param {string} themeId @param {boolean} isDarkMode
 * @returns {ArchiveMenuPalette}
 */
export function resolveArchiveMenuPalette(themeId = 'amber', isDarkMode = false) {
  const dark = Boolean(isDarkMode);
  const raw = /** @type {any} */ (getTidyTheme(themeId));
  const tidy = raw?.tidy || { bg: '#fdfaf3', section: '#f4ebce', border: '#e8ddb7', accent: '#d97706', accentDark: '#fbbf24' };
  const min = ARCHIVE_MENU_MIN_CONTRAST;

  if (dark) {
    const accent = tidy.accentDark || '#fbbf24';
    const card = mixHex(accent, '#23272e', 0.07);
    const tile = mixHex('#ffffff', card, 0.06);
    const tileHover = mixHex(accent, tile, 0.14);
    const ink = '#e8edf5';
    const onAccent = '#111827';
    const bubble = contrastRatio(accent, onAccent) >= min ? accent : ensureContrast(accent, onAccent, min);
    return {
      dark: true,
      accent,
      accentInk: ensureContrast(accent, tileHover, min),
      onAccent,
      bubble,
      card,
      cardBorder: mixHex(accent, '#3a414d', 0.26),
      cardRim: '#14171c',
      dot: mixHex('#ffffff', card, 0.09),
      tile,
      tileBorder: mixHex(accent, '#3a414d', 0.18),
      tileRim: '#181b21',
      tileHover,
      tileHoverBorder: accent,
      ink,
      muted: ensureContrast(ensureContrast('#a5b0c0', tileHover, min), card, min),
      pictoInk: '#d6dde8',
      pictoFill: mixHex(accent, tile, 0.22),
      cheek: mixHex(accent, '#f59e9e', 0.35),
    };
  }

  const accent = tidy.accent || '#d97706';
  const card = mixHex(accent, tidy.bg, 0.05);
  const tile = '#ffffff';
  const tileHover = mixHex(accent, tile, 0.1);
  const onAccent = '#ffffff';
  const bubble = contrastRatio(accent, onAccent) >= min ? accent : ensureContrast(accent, onAccent, min);
  return {
    dark: false,
    accent,
    accentInk: ensureContrast(accent, tileHover, min),
    onAccent,
    bubble,
    card,
    cardBorder: mixHex(accent, tidy.border, 0.28),
    cardRim: mixHex(accent, mixHex('#000000', tidy.border, 0.18), 0.22),
    dot: mixHex(accent, tidy.border, 0.2),
    tile,
    tileBorder: mixHex(accent, tidy.border, 0.2),
    tileRim: mixHex(accent, mixHex('#000000', tidy.border, 0.12), 0.16),
    tileHover,
    tileHoverBorder: accent,
    ink: '#1f2937',
    muted: ensureContrast(ensureContrast('#5b6472', tileHover, min), card, min),
    pictoInk: '#374151',
    pictoFill: mixHex(accent, tile, 0.16),
    cheek: mixHex(accent, '#f59e9e', 0.35),
  };
}

/** 팔레트 → 인라인 style 문자열(--am-*). @param {ArchiveMenuPalette} p */
export function archiveMenuPaletteToStyle(p) {
  const entries = /** @type {[string, string][]} */ ([
    ['accent', p.accent], ['accent-ink', p.accentInk], ['on-accent', p.onAccent], ['bubble', p.bubble],
    ['card', p.card], ['card-border', p.cardBorder], ['card-rim', p.cardRim], ['dot', p.dot],
    ['tile', p.tile], ['tile-border', p.tileBorder], ['tile-rim', p.tileRim],
    ['tile-hover', p.tileHover], ['tile-hover-border', p.tileHoverBorder],
    ['ink', p.ink], ['muted', p.muted], ['picto-ink', p.pictoInk], ['picto-fill', p.pictoFill], ['cheek', p.cheek],
  ]);
  return entries.map(([name, value]) => `--am-${name}: ${value}`).join('; ');
}
