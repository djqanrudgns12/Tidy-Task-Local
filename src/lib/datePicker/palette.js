// 달력 카드의 색을 메모 창 테마에서 뽑아 CSS 변수로 만듭니다. (순수 함수)
// 왜 CSS 변수인가: 예전 달력은 칸 42개마다 색 조건을 계산한 style 문자열을 붙였습니다.
//   색은 한 번만 정하고 칸에는 클래스만 붙이면, 달을 넘길 때 바뀌는 것은 글자와 클래스뿐이라 빠릅니다.
import { getTidyTheme } from '../themes.js';

// 테마 목록을 읽지 못하는 경우의 마지막 기본값 (amber와 같은 색)
const FALLBACK_TOKENS = { bg: '#fdfaf3', section: '#f4ebce', border: '#e8ddb7', accent: '#d97706', accentDark: '#fbbf24' };

/**
 * @param {string} themeId
 * @param {boolean} isDarkMode
 * @returns {Record<string, string>} CSS 변수 이름 → 값
 */
export function calendarPalette(themeId, isDarkMode) {
  const tokens = getTidyTheme(themeId)?.tidy || FALLBACK_TOKENS;
  if (isDarkMode) {
    return {
      '--dp-bg': '#2d303e',
      '--dp-border': 'rgba(255,255,255,0.12)',
      '--dp-text': '#e2e8f0',
      '--dp-muted': '#8b93a7',
      '--dp-fade': '#5b6275',
      '--dp-head-bg': '#1e2030',
      '--dp-head-text': tokens.accentDark,
      '--dp-accent': tokens.accentDark,
      // 어두운 화면의 강조색은 밝은 색이라 흰 글자가 묻힙니다. 선택한 날 글자는 짙게 씁니다.
      '--dp-on-accent': '#111827',
      '--dp-accent-soft': 'rgba(255,255,255,0.08)',
      '--dp-hover': 'rgba(255,255,255,0.08)',
      '--dp-chip-bg': 'rgba(255,255,255,0.06)',
      '--dp-chip-border': 'rgba(255,255,255,0.12)',
      '--dp-sun': '#f87171',
      '--dp-sat': '#60a5fa',
      '--dp-danger': '#fca5a5',
      '--dp-danger-bg': 'rgba(239,68,68,0.12)',
    };
  }
  return {
    '--dp-bg': '#ffffff',
    '--dp-border': 'rgba(0,0,0,0.1)',
    '--dp-text': '#1f2937',
    '--dp-muted': '#9ca3af',
    '--dp-fade': '#cbd0d8',
    '--dp-head-bg': tokens.section,
    '--dp-head-text': tokens.accent,
    '--dp-accent': tokens.accent,
    '--dp-on-accent': '#ffffff',
    '--dp-accent-soft': 'rgba(0,0,0,0.05)',
    '--dp-hover': 'rgba(0,0,0,0.06)',
    '--dp-chip-bg': tokens.bg,
    '--dp-chip-border': tokens.border,
    '--dp-sun': '#ef4444',
    '--dp-sat': '#3b82f6',
    '--dp-danger': '#ef4444',
    '--dp-danger-bg': 'rgba(239,68,68,0.07)',
  };
}

// CSS 변수 묶음을 style 속성 문자열로 바꿉니다.
/** @param {Record<string, string>} vars */
export function toStyleText(vars) {
  return Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(';');
}
