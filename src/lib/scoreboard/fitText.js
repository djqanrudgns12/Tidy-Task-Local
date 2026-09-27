/** 이름이 카드 폭에 한 줄로 들어가는 가장 큰 글자 크기(PRD 4.4·6.2).
 * 캔버스로 글자 폭을 한 번 재서(100px 기준) 비례로 계산합니다. 줄바꿈은 하지 않고, 최소 크기에서도 넘치면 CSS 말줄임(…)이 맡습니다. */

/** @type {Map<string, number>} */
const cache = new Map();
/** @type {CanvasRenderingContext2D|null} */
let ctx = null;

/** 기본 측정기: 문서 캔버스. 테스트에서는 다른 측정기를 넘깁니다.
 * @param {string} text @param {string} font CSS font 문자열(100px 기준) */
function measure(text, font) {
  if (!ctx) ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx) return text.length * 100;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** @param {string} text @param {{family:string, weight?:number, avail:number, max:number, min?:number, measurer?:(t:string,f:string)=>number}} o
 * @returns {{size:number, fits:boolean}} */
export function fitFontSize(text, { family, weight = 800, avail, max, min = 13, measurer = measure }) {
  if (!text || avail <= 0) return { size: max, fits: true };
  const font = `${weight} 100px ${family || 'sans-serif'}`;
  const key = `${font}|${text}`;
  let width = cache.get(key);
  if (width === undefined) {
    width = measurer(text, font);
    if (cache.size > 2000) cache.clear();
    cache.set(key, width);
  }
  const ideal = width > 0 ? (avail * 100) / width : max;
  const size = Math.max(min, Math.min(max, Math.floor(ideal * 10) / 10));
  return { size, fits: ideal >= min };
}

/** 글꼴이 바뀌거나 늦게 도착했을 때 다시 재도록 비웁니다. */
export const clearFitCache = () => cache.clear();
