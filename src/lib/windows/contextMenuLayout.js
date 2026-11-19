// 우클릭 컨텍스트 메뉴 크기·배너 모드·D-Day 메타 계산 순수 모듈
// 왜 순수 함수로 분리하는가:
//   ContextMenu.svelte · DdayControlModal · App.svelte가 같은 폭 티어·배너 복원 규칙을
//   공유하게 하고, node --test 단위 테스트로 경계값(9~14pt, 배너 숨김 복원 등)을 검증합니다.

import {
  computeDdayCounter,
  formatDotDate,
  resolveToneColor,
  stripHtmlToTitle,
} from '../dday/ddayModel.js';
import { formatDeadlineChip } from '../editor/richTextFormat.js';

/**
 * 우클릭 메뉴 타입과 UI 글자 크기(pt)에 따른 티어별 논리 폭(px)을 반환합니다.
 * - Tier S (todo, dday-banner, text, tiny, ctrl-ctx): 220 → 226 → 236 → 244px
 * - Tier M (bar):                                     236 → 242 → 252 → 260px
 * - Tier L (dw-menu, td-menu):                        256 → 260 → 264 → 268px
 * @param {string} type
 * @param {number} [uiFontSize=10]
 * @returns {number}
 */
export function resolveMenuWidth(type, uiFontSize = 10) {
  const pt = Number.isFinite(Number(uiFontSize)) ? Number(uiFontSize) : 10;

  if (type === 'bar') {
    if (pt >= 14) return 260;
    if (pt >= 12) return 252;
    if (pt >= 11) return 242;
    return 236;
  }

  if (type === 'dw-menu' || type === 'td-menu') {
    if (pt >= 14) return 268;
    if (pt >= 12) return 264;
    if (pt >= 11) return 260;
    return 256;
  }

  // Tier S 기본 (todo, dday-banner, text, tiny, ctrl-ctx)
  if (pt >= 14) return 244;
  if (pt >= 12) return 236;
  if (pt >= 11) return 226;
  return 220;
}

/**
 * 배너가 보이는 상태(single | bento)일 때의 모드를 기억합니다.
 * 메인 우클릭에서 배너를 숨겼다가 다시 켤 때, 기존 2열 그리드 설정을 잃지 않기 위해 사용합니다.
 * @param {string | undefined} currentMode
 * @param {'single' | 'bento'} [fallback='single']
 * @returns {'single' | 'bento'}
 */
export function rememberVisibleBannerMode(currentMode, fallback = 'single') {
  if (currentMode === 'bento' || currentMode === 'single') return currentMode;
  return fallback === 'bento' ? 'bento' : 'single';
}

/**
 * 메인 우클릭(bar)의 [배너] 표시 토글 클릭 시 전환할 다음 배너 모드를 계산합니다.
 * @param {string | undefined} currentMode
 * @param {'single' | 'bento'} [lastVisibleMode='single']
 * @returns {'single' | 'bento' | 'hidden'}
 */
export function nextBannerToggleMode(currentMode, lastVisibleMode = 'single') {
  if (currentMode === 'hidden') {
    return lastVisibleMode === 'bento' ? 'bento' : 'single';
  }
  return 'hidden';
}

/**
 * D-Day 배너/헤더 알약 우클릭 메뉴(`type === 'dday-banner'`)에 전달할 경량 메타 객체를 생성합니다.
 * @param {import('../dday/ddayModel.js').DdayItem | null | undefined} item
 * @param {{
 *   todayKey?: string,
 *   accent?: string,
 *   bannerMode?: import('../dday/ddayModel.js').DdayBannerMode,
 *   bannerCount?: number,
 * }} [options]
 */
export function buildDdayBannerMeta(item, options = {}) {
  if (!item || item.status !== 'active') return null;
  const counter = computeDdayCounter(item, options.todayKey);
  const bannerMode = options.bannerMode === 'bento' || options.bannerMode === 'hidden'
    ? options.bannerMode
    : 'single';
  return {
    id: item.id,
    title: stripHtmlToTitle(item.title, 24) || 'D-Day',
    counterLabel: counter.label,
    counterState: counter.state,
    shortDate: formatDeadlineChip(counter.effectiveDate) || '',
    fullDateLabel: formatDotDate(counter.effectiveDate) || '',
    toneColor: resolveToneColor(item.tone, options.accent || '#d97706'),
    linkedTodoId: item.linkedTodoId ?? null,
    showInTodo: Boolean(item.showInTodo),
    showInBanner: Boolean(item.showInBanner),
    showInWidget: Boolean(item.showInWidget),
    bannerMode,
    bannerCount: Math.max(0, Number(options.bannerCount) || 0),
  };
}
