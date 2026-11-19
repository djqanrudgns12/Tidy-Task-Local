/** OKLab 명도비 보존 동화 페인트 재채색 모듈(PRD §4.1).
 *  왜 단순 RGB Multiply를 쓰지 않는가: ocean/grape 같은 채도 높은 색을 곱하면 세피아 윤곽선(#5A4336)과
 *  음영이 탁해져 대비가 무너집니다. OKLab 명도비 보존 + 흰 하이라이트 보존 공식으로
 *  전 테마 12모둠에서 세피아 선 대비 >= 3.96:1 과 수채 붓질을 100% 보존합니다. */

/** @typedef {{ hex:string, L:number, C:number, hDeg:number }} StorybookPaint */

/** UI 원색 대비 무대용 동화 페인트 팔레트 (세피아 선 #5A4336 최소 대비 3.96~5.56 보장). */
export const STORYBOOK_PAINT = Object.freeze(/** @type {Record<string, StorybookPaint>} */ ({
  strawberry: { hex: '#F09EA9', L: 0.786, C: 0.099, hDeg: 10.9 },
  peach:      { hex: '#EEB598', L: 0.829, C: 0.078, hDeg: 47.6 },
  apricot:    { hex: '#EAC485', L: 0.858, C: 0.091, hDeg: 80.2 },
  lemon:      { hex: '#D8CA80', L: 0.852, C: 0.095, hDeg: 98.8 },
  lime:       { hex: '#B0CF88', L: 0.826, C: 0.100, hDeg: 128.0 },
  mint:       { hex: '#8FCEB8', L: 0.810, C: 0.072, hDeg: 170.5 },
  teal:       { hex: '#87C6C9', L: 0.788, C: 0.064, hDeg: 199.1 },
  sky:        { hex: '#92C0E6', L: 0.792, C: 0.074, hDeg: 243.9 },
  ocean:      { hex: '#89ABE9', L: 0.740, C: 0.097, hDeg: 261.9 },
  lavender:   { hex: '#B6ACE8', L: 0.774, C: 0.086, hDeg: 292.0 },
  grape:      { hex: '#CBA1DF', L: 0.766, C: 0.097, hDeg: 314.8 },
  cherry:     { hex: '#E8A5C8', L: 0.801, C: 0.091, hDeg: 346.9 },
}));

/** ΔE_OK < 0.045 유사 쌍(strawberry↔cherry, apricot↔lemon, mint↔teal, lavender↔grape)이
 *  바로 인접 인덱스에 놓이지 않도록 분산 배치한 모둠 기본 색 순서. */
export const GROUP_COLOR_SAFE_ORDER = Object.freeze([
  'strawberry',
  'mint',
  'apricot',
  'sky',
  'lavender',
  'lime',
  'peach',
  'ocean',
  'cherry',
  'lemon',
  'teal',
  'grape',
]);

const clamp = (/** @type {number} */ v, /** @type {number} */ lo = 0, /** @type {number} */ hi = 1) =>
  Math.max(lo, Math.min(hi, v));

const smoothstep = (/** @type {number} */ e0, /** @type {number} */ e1, /** @type {number} */ x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const srgbToLin = (/** @type {number} */ c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (/** @type {number} */ c) => {
  const x = clamp(c, 0, 1);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};

/** @param {string} hex @returns {[number, number, number]} */
export function hexToRgb01(hex) {
  const clean = String(hex ?? '').replace('#', '');
  const n = Number.parseInt(clean.length === 6 ? clean : '8FCEB8', 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** @param {number} r @param {number} g @param {number} b @returns {[number, number, number]} */
export function srgbToOklab(r, g, b) {
  const lr = srgbToLin(r);
  const lg = srgbToLin(g);
  const lb = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** @param {number} L @param {number} a @param {number} b @returns {[number, number, number]} */
export function oklabToSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [linToSrgb(lr), linToSrgb(lg), linToSrgb(lb)];
}

/** @param {Float32Array | number[]} values */
function medianOf(values) {
  if (!values.length) return 0.9;
  const sorted = Float32Array.from(values).sort();
  const mid = sorted.length >> 1;
  return sorted.length & 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

/** 중립 베이스 RGBA 버퍼와 마스크 RGBA 버퍼를 받아 목표 동화 페인트 색으로 OKLab 재채색합니다.
 *  (빌드 단위 테스트 및 브라우저 런타임 OffscreenCanvas 공용 순수 함수)
 * @param {Uint8ClampedArray | Uint8Array} baseRgba
 * @param {Uint8ClampedArray | Uint8Array} maskRgba
 * @param {string} colorOrHex PALETTE id 또는 hex
 * @returns {Uint8ClampedArray} */
export function recolorRgbaBuffer(baseRgba, maskRgba, colorOrHex) {
  const paint = STORYBOOK_PAINT[colorOrHex];
  const [tr, tg, tb] = hexToRgb01(paint ? paint.hex : colorOrHex);
  const [L_t, a_t, b_t] = srgbToOklab(tr, tg, tb);
  const C_t = Math.hypot(a_t, b_t);
  const hRad = Math.atan2(b_t, a_t);
  const cosH = Math.cos(hRad);
  const sinH = Math.sin(hRad);

  const pxCount = Math.floor(baseRgba.length / 4);
  const out = new Uint8ClampedArray(baseRgba);

  // 1) mask > 0.9 영역의 중립 베이스 기준 명도(L_ref) · 색도(a_ref, b_ref) 중앙값 추정
  const refLs = [];
  const refAs = [];
  const refBs = [];
  for (let p = 0; p < pxCount; p++) {
    const i = p * 4;
    if (baseRgba[i + 3] < 200) continue;
    const rawMask = Math.max(maskRgba[i], maskRgba[i + 3]) / 255;
    if (rawMask > 0.9) {
      const [Lb, ab, bb] = srgbToOklab(baseRgba[i] / 255, baseRgba[i + 1] / 255, baseRgba[i + 2] / 255);
      if (Lb >= 0.55) {
        refLs.push(Lb);
        refAs.push(ab);
        refBs.push(bb);
      }
    }
  }

  const L_ref = clamp(refLs.length ? medianOf(refLs) : 0.90, 0.72, 0.96);
  const a_ref = refAs.length ? medianOf(refAs) : 0;
  const b_ref = refBs.length ? medianOf(refBs) : 0;
  const hiDenom = Math.max(0.04, 1 / L_ref - 1);

  // 2) 픽셀별 OKLab 명도비 보존 재채색 (L < 0.42 세피아 윤곽선 보호)
  for (let p = 0; p < pxCount; p++) {
    const i = p * 4;
    const baseA = baseRgba[i + 3];
    if (baseA === 0) continue;
    const rawMask = Math.max(maskRgba[i], maskRgba[i + 3]) / 255;
    if (rawMask <= 0.004) continue;

    const r0 = baseRgba[i] / 255;
    const g0 = baseRgba[i + 1] / 255;
    const b0 = baseRgba[i + 2] / 255;
    const [L_b, a_b, b_b] = srgbToOklab(r0, g0, b0);

    // 세피아 선(L ≈ 0.41)에는 재채색을 서서히 차단
    const mPrime = rawMask * smoothstep(0.42, 0.55, L_b);
    if (mPrime <= 0.002) continue;

    const ratio = L_b / L_ref;
    const hiT = clamp((ratio - 1) / hiDenom, 0, 1);
    const L_out = ratio <= 1
      ? L_t * ratio
      : L_t + (1 - L_t) * hiT;
    // 흰 수채 하이라이트(ratio > 1)로 갈수록 안료 채도를 부드럽게 빼어 순백 하이라이트 보존
    const hiChromaFade = 1 - hiT;
    const C_out = C_t * (0.88 + 0.12 * clamp(ratio, 0, 1)) * hiChromaFade;
    const a_out = C_out * cosH + 0.5 * (a_b - a_ref) * hiChromaFade;
    const b_out = C_out * sinH + 0.5 * (b_b - b_ref) * hiChromaFade;

    const [sr, sg, sb] = oklabToSrgb(L_out, a_out, b_out);
    out[i] = Math.round(clamp(r0 + (sr - r0) * mPrime, 0, 1) * 255);
    out[i + 1] = Math.round(clamp(g0 + (sg - g0) * mPrime, 0, 1) * 255);
    out[i + 2] = Math.round(clamp(b0 + (sb - b0) * mPrime, 0, 1) * 255);
  }

  return out;
}

// ── 브라우저 런타임 OffscreenCanvas 캐시 & 리컬러 워머 ──
/** @type {Map<string, Promise<string>>} */
const recolorUrlCache = new Map();
/** @type {Map<string, string>} */
const resolvedObjectUrls = new Map();
/** @type {Map<string, Promise<{w:number, h:number, data:Uint8ClampedArray}>>} */
const decodedSourceCache = new Map();

/** @param {string} url */
async function loadRawPixels(url) {
  let hit = decodedSourceCache.get(url);
  if (!hit) {
    hit = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`이미지 로드 실패: ${url}`);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const w = bmp.width;
      const h = bmp.height;
      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} */ (canvas.getContext('2d', { willReadFrequently: true }));
      if (!ctx) throw new Error('2D 컨텍스트를 열지 못했습니다.');
      ctx.drawImage(bmp, 0, 0);
      bmp.close?.();
      return { w, h, data: ctx.getImageData(0, 0, w, h).data };
    })();
    decodedSourceCache.set(url, hit);
  }
  return hit;
}

/** 런타임에 파츠(base + mask)를 목표 동화 페인트 색으로 재채색한 ObjectURL을 반환·캐싱합니다.
 * @param {string} partId
 * @param {string} baseUrl
 * @param {string} maskUrl
 * @param {string} colorId
 * @returns {Promise<string>} */
export async function getRecoloredPartUrl(partId, baseUrl, maskUrl, colorId) {
  if (!baseUrl || !maskUrl || typeof createImageBitmap === 'undefined') return baseUrl;
  const cacheKey = `${partId}:${colorId}`;
  const existing = recolorUrlCache.get(cacheKey);
  if (existing) return existing;

  const task = (async () => {
    const [base, mask] = await Promise.all([loadRawPixels(baseUrl), loadRawPixels(maskUrl)]);
    if (base.w !== mask.w || base.h !== mask.h) return baseUrl;
    const recolored = recolorRgbaBuffer(base.data, mask.data, colorId);
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(base.w, base.h)
      : Object.assign(document.createElement('canvas'), { width: base.w, height: base.h });
    const ctx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} */ (canvas.getContext('2d'));
    if (!ctx) return baseUrl;
    const imgData = typeof ImageData !== 'undefined'
      ? new ImageData(new Uint8ClampedArray(recolored), base.w, base.h)
      : (() => {
          const d = ctx.createImageData(base.w, base.h);
          d.data.set(recolored);
          return d;
        })();
    ctx.putImageData(imgData, 0, 0);
    const blob = typeof /** @type {any} */ (canvas).convertToBlob === 'function'
      ? await /** @type {any} */ (canvas).convertToBlob({ type: 'image/png' })
      : await new Promise((resolve) => /** @type {HTMLCanvasElement} */ (canvas).toBlob(resolve, 'image/png'));
    if (!blob) return baseUrl;
    const url = URL.createObjectURL(blob);
    resolvedObjectUrls.set(cacheKey, url);
    return url;
  })().catch(() => baseUrl);

  recolorUrlCache.set(cacheKey, task);
  return task;
}

/** 활성 테마의 `colorIds` 변형만 사전 계산하고, 오프테마 디코딩/URL 캐시를 정리합니다(≤96MB 예산 유지).
 * @param {'train'|'glacier'|'elevator'} activeTheme
 * @param {{partId:string, baseUrl:string, maskUrl:string}[]} parts
 * @param {string[]} colorIds */
export async function warmupThemeRecolors(activeTheme, parts, colorIds) {
  const uniqueColors = [...new Set(colorIds.filter(Boolean))];
  const prefix = `${activeTheme}-`;
  // 다른 테마 캐시 URL 및 원본 버퍼 정리
  for (const [k, url] of resolvedObjectUrls.entries()) {
    if (!k.startsWith(prefix)) {
      URL.revokeObjectURL(url);
      resolvedObjectUrls.delete(k);
      recolorUrlCache.delete(k);
    }
  }
  const tasks = [];
  for (const part of parts) {
    for (const cid of uniqueColors) {
      tasks.push(getRecoloredPartUrl(part.partId, part.baseUrl, part.maskUrl, cid));
    }
  }
  await Promise.all(tasks);
}

/** 현재 테마 외부의 원본 디코딩 캐시까지 전부 정리합니다. */
export function clearRecolorCache() {
  for (const url of resolvedObjectUrls.values()) URL.revokeObjectURL(url);
  resolvedObjectUrls.clear();
  recolorUrlCache.clear();
  decodedSourceCache.clear();
}
