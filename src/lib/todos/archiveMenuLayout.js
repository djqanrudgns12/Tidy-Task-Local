// ═══════════════════════════════════════════════════════════════════
// [다중 선택 [아카이브] 드롭다운 배치 규칙] docs/PRD-bulk-archive-dropdown.md §4~§7
//
// 화면에 그리는 컴포넌트(BulkArchiveMenu.svelte)는 좌표를 재기만 하고, "얼마나 크게 · 어느 단계로 ·
// 어디에" 여는지는 모두 이 순수 함수들이 정합니다. 그래야 창 폭·화면 글자·남은 높이 조합을 단위 테스트로
// 빠짐없이 확인할 수 있습니다. 좌표는 모두 웹뷰 화면(= 메모 창 안쪽) 기준 논리 px입니다.
// ═══════════════════════════════════════════════════════════════════

// 메뉴 글자 크기 범위(pt). 화면 글자를 따라가되 6·8pt는 읽기 어렵고 13·15pt는 창을 덮어 묶습니다. (§5)
export const ARCHIVE_MENU_PT = Object.freeze({ min: 9, max: 12, fallback: 10 });

// 카드 가로 예산(px)과 em 기준 폭. 최소 창 250px − 도크 바깥 여백 10px×2 = 230px ≥ 224px라 늘 들어갑니다. (§4)
export const ARCHIVE_MENU_WIDTH = Object.freeze({ min: 176, em: 14, max: 224 });

// 단계별 세로 상한(px). 실측 L 98~130 · M 75~99 · S 40~52 (§4.2) — 검수 스크립트가 이 값을 넘지 않는지 봅니다.
export const ARCHIVE_MENU_HEIGHT_CAP = Object.freeze({ l: 130, m: 99, s: 52 });

/** 큰 것부터 작은 것 순서. 아래(또는 위)에 처음 들어가는 단계를 고릅니다. @type {readonly ('l' | 'm' | 's')[]} */
export const ARCHIVE_MENU_TIERS = Object.freeze(['l', 'm', 's']);

// 꼭지(▲)와 간격(px · em). 꼭지 끝은 버튼 아래 3px, 도크 테두리 아래 2px 중 더 아래에 둡니다. (§7.1)
export const ARCHIVE_MENU_GAP = Object.freeze({ fromButton: 3, fromRail: 2, nubEm: 0.45, edgeMargin: 8, viewportInset: 4 });

// 한쪽 정렬선과 이 거리(px) 안이면 그 선에 붙입니다. 2~9px 어긋남이 가장 삐뚤어 보여서입니다. (§7.4)
export const ARCHIVE_MENU_SNAP = 10;

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 화면 글자 크기(pt) → 메뉴 글자 크기(pt). 잘못된 값이면 기본 10pt.
 * @param {unknown} uiFontSizePt
 */
export function resolveArchiveMenuPt(uiFontSizePt) {
  const pt = Number(uiFontSizePt);
  if (!Number.isFinite(pt) || pt <= 0) return ARCHIVE_MENU_PT.fallback;
  return clamp(pt, ARCHIVE_MENU_PT.min, ARCHIVE_MENU_PT.max);
}

/** pt → px (CSS 1pt = 4/3px) @param {number} pt */
export function ptToPx(pt) {
  return (pt * 4) / 3;
}

/**
 * 카드 가로 폭(px). 정렬선 사이 폭(railWidth)이 더 좁으면 그 폭에 맞춥니다(실제로는 최소 창에서도 일어나지 않는 안전망).
 * @param {number} menuPt @param {number} [railWidth]
 */
export function resolveArchiveMenuWidth(menuPt, railWidth = Infinity) {
  const wanted = clamp(ARCHIVE_MENU_WIDTH.em * ptToPx(menuPt), ARCHIVE_MENU_WIDTH.min, ARCHIVE_MENU_WIDTH.max);
  return Math.round(Math.min(wanted, Number.isFinite(railWidth) && railWidth > 0 ? railWidth : wanted) * 100) / 100;
}

/**
 * @typedef {{ left: number, right: number, top: number, bottom: number }} Box
 */

/**
 * 버튼 위·아래로 메뉴가 쓸 수 있는 높이(꼭지 포함). 창 가장자리에서 8px은 비워 둡니다.
 * @param {{ anchor: Box, rail?: Box | null, viewportHeight: number, nubPx: number, topLimit?: number }} input
 */
export function measureArchiveMenuRoom({ anchor, rail = null, viewportHeight, nubPx, topLimit = 0 }) {
  const tipDown = Math.max(anchor.bottom + ARCHIVE_MENU_GAP.fromButton, rail ? rail.bottom + ARCHIVE_MENU_GAP.fromRail : -Infinity);
  const tipUp = Math.min(anchor.top - ARCHIVE_MENU_GAP.fromButton, rail ? rail.top - ARCHIVE_MENU_GAP.fromRail : Infinity);
  return {
    below: Math.max(0, viewportHeight - ARCHIVE_MENU_GAP.edgeMargin - (tipDown + nubPx)),
    above: Math.max(0, tipUp - nubPx - ARCHIVE_MENU_GAP.edgeMargin - topLimit),
    tipDown,
    tipUp,
  };
}

/**
 * 남은 높이에 맞춰 단계와 여는 방향을 고릅니다. (§6)
 * L→M→S 순서로 아래에 처음 들어가는 단계, 없으면 위에 처음 들어가는 단계, 그래도 없으면 S를 아래로(잘림).
 * @param {{ heights: { l: number, m: number, s: number }, below: number, above: number }} input
 * @returns {{ tier: 'l' | 'm' | 's', direction: 'down' | 'up', clipped: boolean }}
 */
export function pickArchiveMenuTier({ heights, below, above }) {
  for (const tier of ARCHIVE_MENU_TIERS) {
    if (heights[tier] <= below) return { tier, direction: 'down', clipped: false };
  }
  for (const tier of ARCHIVE_MENU_TIERS) {
    if (heights[tier] <= above) return { tier, direction: 'up', clipped: false };
  }
  return { tier: 's', direction: 'down', clipped: true };
}

/**
 * 메뉴 왼쪽 위 좌표와 꼭지 위치를 정합니다. (§7)
 * 1. 버튼 가운데 맞춤 → 2. 정렬선(도크 바깥 테두리) 안으로 → 3. 한쪽 선과 10px 안이면 붙임 → 4. 화면 밖으로 나가지 않게
 * 꼭지는 언제나 버튼 가운데를 가리키되 둥근 모서리에 걸치지 않게 [nubInset, 폭 − nubInset]으로 묶습니다.
 * @param {{
 *   anchor: Box, rail?: Box | null, viewportWidth: number,
 *   width: number, height: number, direction: 'down' | 'up',
 *   tipDown: number, tipUp: number, nubPx: number, nubInset: number, snap?: number,
 * }} input
 */
export function placeArchiveMenu({
  anchor, rail = null, viewportWidth, width, height, direction, tipDown, tipUp, nubPx, nubInset, snap = ARCHIVE_MENU_SNAP,
}) {
  const inset = ARCHIVE_MENU_GAP.viewportInset;
  const lineLeft = rail ? rail.left : inset;
  const lineRight = rail ? rail.right : viewportWidth - inset;
  const center = (anchor.left + anchor.right) / 2;

  let minLeft = lineLeft;
  let maxLeft = lineRight - width;
  if (maxLeft < minLeft) maxLeft = minLeft; // 정렬선 사이가 카드보다 좁으면 왼쪽 선에 맞춤
  let left = clamp(center - width / 2, minLeft, maxLeft);

  const toMin = left - minLeft;
  const toMax = maxLeft - left;
  // 더 가까운 선 하나에만 붙입니다(이미 한쪽 선에 닿아 있으면 그대로 — 반대쪽으로 튀지 않게).
  if (toMin <= snap && toMin <= toMax) left = minLeft;
  else if (toMax <= snap) left = maxLeft;

  // 정렬선이 화면 밖에 있더라도(창이 아주 좁을 때) 카드는 화면 안에 둡니다.
  left = clamp(left, inset, Math.max(inset, viewportWidth - inset - width));

  const nubX = clamp(center - left, nubInset, width - nubInset);
  const top = direction === 'up' ? tipUp - nubPx - height : tipDown + nubPx;
  return {
    left: Math.round(left * 100) / 100,
    top: Math.round(top * 100) / 100,
    nubX: Math.round(nubX * 100) / 100,
    direction,
  };
}

/** 상자 친구 개수 방울 글자. 100 이상은 '99+'. @param {number} count */
export function countBubbleLabel(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 99 ? '99+' : String(n);
}
