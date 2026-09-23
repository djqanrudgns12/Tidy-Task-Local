// 큰 숫자(전광판 타이머 등)를 어떤 글꼴에서도 같은 자리·같은 크기로, 서로 붙지 않게 보여 주려고
// 현재 글꼴의 실제 숫자 모양을 잽니다.
// 왜 재야 하는가: 글꼴마다 숫자의 키, 기준선 위아래로 놓이는 위치, 폭, 옆 여백이 크게 다릅니다.
// 예) 여기어때 잘난체는 숫자가 줄 상자 위로 삐져나와 윗줄 글자를 덮고, 메이플스토리 L도 굵기 합성
// (굵은체가 없는 글꼴을 브라우저가 부풀려 그림) 때문에 좁힌 자간에서 숫자끼리 맞닿습니다.
// 고정값(line-height·letter-spacing)만으로는 모든 글꼴·사용자 글꼴을 맞출 수 없어, 잰 값을 CSS 변수로 넘깁니다.

/** 작은 크기로 재면 캔버스가 글자 윤곽을 픽셀 단위로 반올림해(±1px) 오차가 커집니다. 크게 재고 비율로 씁니다. */
export const MEASURE_SIZE = 200;
/** 숫자 표시가 쓰는 굵기(toolkit.css .digital-time·.secondary-time과 같아야 굵기 합성까지 재어집니다) */
export const NUMERAL_WEIGHT = 700;
/** 이웃한 숫자 잉크 사이에 최소한 남길 틈(em). 전광판처럼 크게 띄워도 숫자가 한 덩어리로 뭉치지 않을 만큼만 둡니다. */
export const NUMERAL_GAP = 0.02;

const DIGITS = '0123456789';

/**
 * 측정 전이거나 캔버스를 쓸 수 없을 때의 값 — 기본 글꼴(메이플스토리 L, 700)을 잰 결과입니다.
 * toolkit.css의 var(--tk-num-*, 기본값)과 같은 숫자여야 측정 전후로 화면이 튀지 않습니다.
 */
export const NUMERAL_DEFAULTS = Object.freeze({
  ink: 0.78,
  shift: -0.0325,
  advance: 0.675,
  colon: 0.246,
  trackMin: 0.006,
});

/**
 * @typedef {{width:number,actualBoundingBoxLeft:number,actualBoundingBoxRight:number,
 *   actualBoundingBoxAscent:number,actualBoundingBoxDescent:number,
 *   fontBoundingBoxAscent?:number,fontBoundingBoxDescent?:number}} GlyphMetrics
 * @typedef {{ink:number,shift:number,advance:number,colon:number,trackMin:number}} NumeralMetrics
 */

/** @param {number} value */
const round = (value) => Math.round(value * 10000) / 10000;

/**
 * MEASURE_SIZE로 잰 글자 상자에서 숫자 표시용 값(모두 em 단위)을 계산합니다.
 * - ink: 숫자 잉크의 높이(가장 높은 숫자 꼭대기 ~ 가장 낮은 숫자 바닥)
 * - shift: 줄 높이를 ink로 잡았을 때 잉크 가운데가 줄 가운데보다 아래로 처진 정도(위로 이만큼 올리면 딱 맞음)
 * - advance / colon: 가장 넓은 숫자·쌍점의 폭(시간 글자 전체 폭을 미리 계산해 칸 밖으로 넘치지 않게 함)
 * - trackMin: 숫자끼리 NUMERAL_GAP 이상 떨어지려면 필요한 최소 자간
 * @param {(text:string)=>GlyphMetrics} measure
 * @returns {NumeralMetrics}
 */
export function numeralMetrics(measure) {
  const glyphs = [...`${DIGITS}:`].map((ch) => {
    const m = measure(ch);
    return {
      ch,
      m,
      // 옆 여백: 글자 폭의 시작/끝에서 실제 잉크까지. 음수면 잉크가 글자 폭 밖으로 나와 있습니다.
      left: -m.actualBoundingBoxLeft,
      right: m.width - m.actualBoundingBoxRight,
    };
  });
  const digits = glyphs.filter((g) => g.ch !== ':');
  const colon = glyphs[glyphs.length - 1];
  const inkAscent = Math.max(...digits.map((g) => g.m.actualBoundingBoxAscent));
  const inkDescent = Math.max(...digits.map((g) => g.m.actualBoundingBoxDescent));
  const fontAscent = digits[0].m.fontBoundingBoxAscent;
  const fontDescent = digits[0].m.fontBoundingBoxDescent;
  const advance = Math.max(...digits.map((g) => g.m.width));
  const ink = inkAscent + inkDescent;
  // 캔버스가 없거나 글꼴을 못 읽어 값이 비정상이면 기본값을 씁니다(잘못된 값으로 숫자가 사라지는 것보다 낫습니다).
  if (
    !(ink > MEASURE_SIZE * 0.2) ||
    !(advance > 0) ||
    !Number.isFinite(fontAscent) ||
    !Number.isFinite(fontDescent)
  )
    return { ...NUMERAL_DEFAULTS };
  let gap = Infinity;
  for (const a of glyphs)
    for (const b of glyphs) if (a.ch !== ':' || b.ch !== ':') gap = Math.min(gap, a.right + b.left);
  const em = (/** @type {number} */ v) => v / MEASURE_SIZE;
  return {
    ink: round(em(ink)),
    shift: round(em((/** @type {number} */ (fontAscent) - /** @type {number} */ (fontDescent)) / 2 - (inkAscent - inkDescent) / 2)),
    advance: round(em(advance)),
    colon: round(em(colon.m.width)),
    trackMin: round(NUMERAL_GAP - em(gap)),
  };
}

/** @param {NumeralMetrics} m */
export function numeralStyle(m) {
  return (
    `--tk-num-ink:${m.ink};--tk-num-shift:${m.shift};--tk-num-advance:${m.advance};` +
    `--tk-num-colon:${m.colon};--tk-num-track-min:${m.trackMin};`
  );
}

/** @param {string} fontStack CSS font-family 값(예: "\"여기어때 잘난체\",\"Malgun Gothic\",sans-serif") */
export function measureNumerals(fontStack) {
  const ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ctx) return { ...NUMERAL_DEFAULTS };
  ctx.font = `${NUMERAL_WEIGHT} ${MEASURE_SIZE}px ${fontStack}`;
  return numeralMetrics((text) => ctx.measureText(text));
}

/**
 * 글꼴 파일을 받은 뒤에 재야 대체 글꼴(맑은 고딕)을 재는 실수가 없습니다.
 * 글꼴을 끝내 못 받으면 화면도 대체 글꼴로 그려지므로, 그때 잰 값이 화면과 맞습니다.
 * @param {string} fontStack
 */
export async function numeralStyleFor(fontStack) {
  if (typeof document === 'undefined') return numeralStyle(NUMERAL_DEFAULTS);
  try {
    await document.fonts.load(`${NUMERAL_WEIGHT} ${MEASURE_SIZE}px ${fontStack}`, `${DIGITS}:`);
  } catch {}
  return numeralStyle(measureNumerals(fontStack));
}
