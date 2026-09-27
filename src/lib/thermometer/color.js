/** 액체 색 섞기(OKLab). 하늘 → 파랑, 복숭아 → 빨강처럼 두 색 사이를 사람 눈에 고르게 섞습니다.
 * 왜 CSS color-mix가 아니라 JS인가: 배포 빌드의 CSS 압축기가 color-mix 같은 최신 색 함수를 다른 코드로 바꿔
 * 값이 사라진 적이 있어(주사위·시계 QA), SVG에 넣는 색은 여기서 계산한 rgb() 문자열로 넘깁니다. */

/** @param {string} hex */
function toLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}
/** @param {number} c */
const toSrgb = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
};
/** @param {number[]} rgb */
function toOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** @param {number[]} lab */
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** @param {string} from '#RRGGBB' @param {string} to @param {number} t 0~1 @returns {string} 'rgb(r g b)' */
export function mixColor(from, to, t) {
  const k = Math.max(0, Math.min(1, t));
  const a = toOklab(toLinear(from));
  const b = toOklab(toLinear(to));
  const [r, g, bl] = fromOklab(a.map((v, i) => v + (b[i] - v) * k)).map(toSrgb);
  return `rgb(${r} ${g} ${bl})`;
}
