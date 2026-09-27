// 투표판 후보 카드 배치(PRD 6·9절). 뒷자리에서 이름이 읽혀야 하므로 "이름 글자가 가장 커지는" 줄·칸과 카드 모양을 고릅니다.
// 카드 모양 두 가지:
//  - 가로형(wide): [기호 키캡][캐릭터][이름·소개] — 카드가 납작할 때(3×3 등). 폭이 높이의 약 2.3배일 때 가장 알맞음.
//  - 세로형(tall): 키캡 위 · 캐릭터 가운데 · 이름 아래 — 카드가 네모에 가까울 때(2~4명).

export const GAP = 18;

/**
 * @param {number} count 카드 수(1~9) @param {number} width 카드 판 폭 @param {number} height 카드 판 높이
 * @returns {{rows:number, cols:number, cardW:number, cardH:number, orient:'wide'|'tall', key:number, art:number, name:number, intro:number, reach:number}}
 */
export function boothGrid(count, width, height) {
  const n = Math.max(1, count);
  /** @type {ReturnType<typeof boothGrid>|null} */ let best = null;
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    // 마지막 줄이 너무 비면(예: 7명을 4×2) 모양이 어색하므로 빈칸이 한 줄의 절반을 넘는 배치는 뺍니다.
    if (rows * cols - n >= cols && rows > 1) continue;
    const cardW = (width - GAP * (cols - 1)) / cols;
    const cardH = (height - GAP * (rows - 1)) / rows;
    if (cardW <= 0 || cardH <= 0) continue;
    for (const orient of /** @type {const} */ (['wide', 'tall'])) {
      const unit = orient === 'wide' ? Math.min(cardW / 2.3, cardH) : Math.min(cardW / 0.95, cardH);
      // 배치 고르기 점수는 예전 이름 크기(가로형 unit×0.3)를 그대로 씁니다 — 가로형 글자만 줄였을 때 줄·칸 선택이 바뀌지 않게.
      const reach = orient === 'wide' ? unit * 0.3 : unit * 0.19;
      const candidate = {
        rows, cols, cardW, cardH, orient,
        key: orient === 'wide' ? Math.min(unit * 0.44, cardH * 0.44) : unit * 0.2,
        // 가로형은 캐릭터를 조금 작게(폭의 0.3), 이름도 unit×0.25로 — 이름이 캐릭터에 붙어 보이지 않게 여유 폭을 남깁니다.
        art: orient === 'wide' ? Math.min(cardH * 0.84, cardW * 0.3) : cardH * 0.44,
        name: orient === 'wide' ? unit * 0.25 : unit * 0.19,
        intro: Math.max(12, orient === 'wide' ? unit * 0.1 : unit * 0.07),
        reach,
      };
      // 이름이 1px보다 더 커질 때만 바꿉니다(같으면 줄이 적은 배치 유지).
      if (!best || candidate.reach > best.reach + 1) best = candidate;
    }
  }
  // 판 크기를 아직 재지 못했거나(처음 그릴 때 폭 0 · 숨은 창) 너무 작으면 들어갈 배치가 없습니다.
  // 그래도 화면이 멈추지 않도록 한 줄 배치에 크기 0을 돌려주고, 크기를 재면 다시 계산됩니다.
  return best ?? { rows: 1, cols: n, cardW: 0, cardH: 0, orient: 'tall', key: 0, art: 0, name: 0, intro: 12, reach: 0 };
}

// ── 준비 화면 "오늘의 후보" 판 ──
// 칸 하나 = 스티커(왼쪽 아래에 기호 키캡을 붙임) 아래에 이름, 그 아래 소개 한 줄(있을 때).
// 준비하는 동안 칠판에 걸어 두는 판이라 뒷자리에서도 얼굴·번호·이름이 보이게, 판에 들어가는 가장 큰 스티커를 고릅니다.
export const LINEUP_GAP_X = 20;
export const LINEUP_GAP_Y = 18;
export const LINEUP_ART_MIN = 56;
export const LINEUP_ART_MAX = 176;
/** 이름 글자 = 스티커 × 0.19(17~32px), 줄 간격 1.2. */
const NAME_RATIO = 0.19;
const NAME_MIN = 17;
const NAME_MAX = 32;
const LINE_HEIGHT = 1.2;
/** 스티커와 이름 사이 · 이름과 소개 사이 간격(px). */
const ROW_GAP = 12;
/** 소개 줄 높이(px). 글자 14~16px이라 스티커 크기와 상관없이 거의 같습니다. */
const INTRO_ROW = 22;
/** 스티커가 이보다 작으면 소개 줄을 빼고 그 자리를 스티커에 줍니다(작은 칸에서는 소개가 잘려 읽히지도 않음). */
const INTRO_MIN_ART = 100;
/** 칸 폭은 스티커의 1.15배 이상(한글 이름 5~6자가 줄지 않고 들어가는 폭, 더 긴 이름은 fitName이 줄임). */
const CELL_WIDTH = 1.15;

/** @param {number} art */
const nameSize = (art) => Math.round(Math.min(NAME_MAX, Math.max(NAME_MIN, art * NAME_RATIO)));

/**
 * @param {number} count 후보 수(1~9) @param {number} width 판 폭 @param {number} height 판 높이
 * @param {{intro?:boolean, nameLines?:number}} [opts]
 *   intro: 소개가 있는 후보가 있는지(있으면 스티커가 충분히 클 때 모든 칸에 소개 줄을 둠 — 칸 높이가 같게)
 *   nameLines: 이름 줄 수(의견 항목은 문장이라 2줄까지)
 * @returns {{rows:number, cols:number, art:number, name:number, key:number, intro:number, cellW:number, showIntro:boolean}}
 */
export function lineupGrid(count, width, height, opts = {}) {
  if (opts.intro) {
    const withIntro = fitLineup(count, width, height, true, opts.nameLines);
    if (withIntro.art >= INTRO_MIN_ART) return withIntro;
  }
  return fitLineup(count, width, height, false, opts.nameLines);
}

/** @param {number} count @param {number} width @param {number} height @param {boolean} showIntro @param {number} [nameLines] */
function fitLineup(count, width, height, showIntro, nameLines = 1) {
  const n = Math.max(1, count);
  const lines = Math.max(1, nameLines);
  const introRow = showIntro ? INTRO_ROW + ROW_GAP : 0;
  /** @param {number} art @param {number} cellW */
  // 칸 폭은 스티커의 1.8배까지만 씁니다. 후보가 적을 때 판 끝까지 벌어지면 한 묶음으로 안 보여서입니다.
  const sized = (art, cellW) => ({ art, name: nameSize(art), key: Math.round(Math.min(52, Math.max(26, art * 0.3))), intro: art >= 130 ? 16 : 14, cellW: Math.floor(Math.min(cellW, art * 1.8)), showIntro });
  /** @type {ReturnType<typeof lineupGrid>|null} */ let best = null;
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    // 투표판과 같은 규칙: 마지막 줄이 절반 넘게 비는 배치(7명을 4×2 등)는 뺍니다.
    if (rows * cols - n >= cols && rows > 1) continue;
    const cellW = (width - LINEUP_GAP_X * (cols - 1)) / cols;
    const cellH = (height - LINEUP_GAP_Y * (rows - 1)) / rows;
    // 칸 높이 = 스티커 + 간격 + 이름 줄 + (소개 줄). 이름 글자에 최소 크기가 있어 작은 스티커에서는 따로 셉니다.
    const avail = cellH - ROW_GAP - introRow;
    let byHeight = avail / (1 + NAME_RATIO * LINE_HEIGHT * lines);
    if (byHeight * NAME_RATIO < NAME_MIN) byHeight = avail - NAME_MIN * LINE_HEIGHT * lines;
    const art = Math.floor(Math.min(cellW / CELL_WIDTH, byHeight, LINEUP_ART_MAX));
    if (art <= 0) continue;
    // 스티커가 1px보다 더 커질 때만 바꿉니다(같으면 줄이 적은 배치 유지 — 한 줄이 가장 읽기 쉬움).
    if (!best || art > best.art + 1) best = { rows, cols, ...sized(art, cellW) };
  }
  // 판이 아직 재지지 않았거나(폭 0) 아주 작은 창이면 최소 크기를 지킵니다. 판이 넘치면 준비 화면이 스크롤됩니다
  // (스티커가 점처럼 작아지지 않게).
  const minCell = LINEUP_ART_MIN * CELL_WIDTH;
  if (!best) return { rows: 1, cols: n, ...sized(LINEUP_ART_MIN, minCell) };
  if (best.art >= LINEUP_ART_MIN) return best;
  return { rows: best.rows, cols: best.cols, ...sized(LINEUP_ART_MIN, Math.max(best.cellW, minCell)) };
}
