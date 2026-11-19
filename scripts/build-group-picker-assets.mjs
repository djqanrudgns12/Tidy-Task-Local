/** 모둠원 뽑기 에셋 자동 추출·이중 매팅·정규화·메모리 예산 검증 스크립트 (Phase 1~3 공용).
 *  외부 이미지 라이브러리 없이 로컬 헤드리스 Chromium Canvas/WebGL2 Float32 파이프라인으로
 *  이중 매트(BT.601 YCbCr + OKLab 3D 축 투영) · 닫힌 구멍 2차 패스 · 언믹스 · 디스필 ·
 *  4px RGB bleed dilation · 비격자 8-연결 캐릭터 슬라이싱(512×640, 128²) · Kåsa 바퀴 패딩 ·
 *  OKLab 중립 페인트 마스크 추출 · 체커보드 QA 시트를 생성합니다.
 *
 *  사용:
 *    node scripts/build-group-picker-assets.mjs --self-test
 *    node scripts/build-group-picker-assets.mjs --characters <jobs.json>
 *    node scripts/build-group-picker-assets.mjs --assets <jobs.json>
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ASSETS_DIR = path.join(root, 'src/assets/group-picker');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'assets-manifest.json');
const CHECK_DIR = 'C:/Users/User/.gemini/antigravity/brain/09af5acc-28cc-4dbb-992c-ae5a10ba17d0/scratch/gp-raw';

/** 브라우저 프로세서 HTML/JS 모듈: Float32 이중 매트 + WebGL2 straight-alpha WebP 인코더. */
const PROCESSOR_HTML = /* html */ `<!doctype html>
<html>
<head><meta charset="utf-8"><title>GP Asset Processor</title></head>
<body>
<script>
// ── 색공간 & 수학 유틸 (OKLab · BT.601 YCbCr · Kåsa 최소제곱 원) ──
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function rgb01ToOklab(r, g, b) {
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

function rgb255ToCbCr(r, g, b) {
  return [
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ];
}

function medianSorted(arr) {
  if (!arr.length) return 0;
  const s = Float32Array.from(arr).sort();
  const mid = s.length >> 1;
  return s.length & 1 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
}

/** 8px 테두리 링 MAD 3σ 이상치 제거 중앙값 + 그라데이션 시 32px 타일 쌍선형 보간 K(x,y) */
function estimateBackgroundField(rgba, w, h, keyKind) {
  const ringIdx = [];
  const nom = keyKind === 'magenta' ? [255, 0, 255] : keyKind === 'green' ? [0, 255, 0] : [11, 26, 46];
  const maxNomDist = keyKind === 'navy' ? 115 : 130;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= 8 && x < w - 8 && y >= 8 && y < h - 8) continue;
      const i = (y * w + x) * 4;
      const dr = rgba[i] - nom[0];
      const dg = rgba[i + 1] - nom[1];
      const db = rgba[i + 2] - nom[2];
      if (Math.hypot(dr, dg, db) <= maxNomDist) ringIdx.push(i);
    }
  }
  // 만약 전경이 가장자리 색과 너무 다르면 전체 테두리에서 중앙값 fallback
  if (ringIdx.length < 32) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= 8 && x < w - 8 && y >= 8 && y < h - 8) continue;
        ringIdx.push((y * w + x) * 4);
      }
    }
  }

  const rs = [], gs = [], bs = [];
  for (let k = 0; k < ringIdx.length; k++) {
    const i = ringIdx[k];
    rs.push(rgba[i]); gs.push(rgba[i + 1]); bs.push(rgba[i + 2]);
  }
  const medR = medianSorted(rs), medG = medianSorted(gs), medB = medianSorted(bs);
  const dists = ringIdx.map((i) => Math.hypot(rgba[i] - medR, rgba[i + 1] - medG, rgba[i + 2] - medB));
  const medD = medianSorted(dists);
  const mad = medianSorted(dists.map((d) => Math.abs(d - medD)));
  const sigma = Math.max(2.5, 1.4826 * mad);

  const inR = [], inG = [], inB = [];
  const blockSamples = new Map();
  for (let k = 0; k < ringIdx.length; k++) {
    if (Math.abs(dists[k] - medD) > 3 * sigma) continue;
    const i = ringIdx[k];
    const px = i / 4;
    const x = px % w, y = Math.floor(px / w);
    inR.push(rgba[i]); inG.push(rgba[i + 1]); inB.push(rgba[i + 2]);
    const bx = Math.floor(x / 32), by = Math.floor(y / 32);
    const key = by * 1024 + bx;
    if (!blockSamples.has(key)) blockSamples.set(key, { x: bx * 32 + 16, y: by * 32 + 16, r: [], g: [], b: [] });
    const bk = blockSamples.get(key);
    bk.r.push(rgba[i]); bk.g.push(rgba[i + 1]); bk.b.push(rgba[i + 2]);
  }
  const K0 = inR.length ? [medianSorted(inR), medianSorted(inG), medianSorted(inB)] : [medR, medG, medB];

  // 경계 32px 타일간 편차 > 7 이면 평면/그라데이션 보간 활성화
  let maxBlockDev = 0;
  const nodes = [];
  for (const bk of blockSamples.values()) {
    if (bk.r.length < 4) continue;
    const nr = medianSorted(bk.r), ng = medianSorted(bk.g), nb = medianSorted(bk.b);
    maxBlockDev = Math.max(maxBlockDev, Math.hypot(nr - K0[0], ng - K0[1], nb - K0[2]));
    nodes.push({ x: bk.x, y: bk.y, r: nr, g: ng, b: nb });
  }

  if (maxBlockDev <= 7 || nodes.length < 4) {
    return { uniform: true, K0, getK: () => K0 };
  }

  // 32px 그리드 캐시 후 쌍선형 IDW 보간
  const gw = Math.ceil(w / 32) + 1;
  const gh = Math.ceil(h / 32) + 1;
  const grid = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const px = gx * 32, py = gy * 32;
      let sw = 0, sr = 0, sg = 0, sb = 0;
      for (const n of nodes) {
        const d2 = (px - n.x) ** 2 + (py - n.y) ** 2 + 256;
        const weight = 1 / d2;
        sw += weight; sr += weight * n.r; sg += weight * n.g; sb += weight * n.b;
      }
      const gi = (gy * gw + gx) * 3;
      grid[gi] = sr / sw; grid[gi + 1] = sg / sw; grid[gi + 2] = sb / sw;
    }
  }

  return {
    uniform: false,
    K0,
    getK(x, y, out) {
      const fx = clamp(x / 32, 0, gw - 1.001);
      const fy = clamp(y / 32, 0, gh - 1.001);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const i00 = (y0 * gw + x0) * 3;
      const i10 = i00 + 3;
      const i01 = i00 + gw * 3;
      const i11 = i01 + 3;
      for (let c = 0; c < 3; c++) {
        const top = grid[i00 + c] * (1 - tx) + grid[i10 + c] * tx;
        const bot = grid[i01 + c] * (1 - tx) + grid[i11 + c] * tx;
        out[c] = top * (1 - ty) + bot * ty;
      }
      return out;
    },
  };
}

/** 이중 매트 + BFS 외곽 + 2차 닫힌 구멍 + 언믹스 + 에지 띠 디스필 + 초크 + 4px RGB 팽창 */
function cutoutBuffer(rgba, w, h, { keyKind = 'magenta', softTranslucent = false, holeMinArea = 3, holeDistMax: holeDistOverride = null, choke = true }) {
  const n = w * h;
  const field = estimateBackgroundField(rgba, w, h, keyKind);
  const dArr = new Float32Array(n);
  const matteA = new Float32Array(n);
  const kBuf = new Float32Array(3);
  const W_LAB = [1, 0, 0];

  const t0 = keyKind === 'navy' ? 0.042 : 22;
  const t1 = keyKind === 'navy' ? 0.095 : 52;
  const holeDistMax = holeDistOverride ?? (keyKind === 'navy' ? 0.042 : 20);
  const holeGrowT = Math.max(t0, holeDistMax * 1.35);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const K = field.getK(x, y, kBuf);

      if (keyKind === 'navy') {
        const cLab = rgb01ToOklab(r / 255, g / 255, b / 255);
        const kLab = rgb01ToOklab(K[0] / 255, K[1] / 255, K[2] / 255);
        const vx = cLab[0] - kLab[0], vy = cLab[1] - kLab[1], vz = cLab[2] - kLab[2];
        const wx = W_LAB[0] - kLab[0], wy = W_LAB[1] - kLab[1], wz = W_LAB[2] - kLab[2];
        const ww = Math.max(1e-6, wx * wx + wy * wy + wz * wz);
        const proj = clamp((vx * wx + vy * wy + vz * wz) / ww, 0, 1);
        const ex = vx - proj * wx, ey = vy - proj * wy, ez = vz - proj * wz;
        const e = Math.hypot(ex, ey, ez);
        const magV = Math.hypot(vx, vy, vz);
        dArr[p] = magV;
        matteA[p] = e < 0.035 ? (magV < 0.03 ? 0 : proj) : smoothstep(0.05, 0.15, magV);
      } else {
        const [cb, cr] = rgb255ToCbCr(r, g, b);
        const [kcb, kcr] = rgb255ToCbCr(K[0], K[1], K[2]);
        const d = Math.hypot(cb - kcb, cr - kcr);
        dArr[p] = d;
        matteA[p] = smoothstep(22, 70, d);
      }
    }
  }

  // 1차 BFS: 테두리에서 연결된 배경 탐색
  const bgMask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qHead = 0, qTail = 0;

  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const p = y * w + x;
      if (!bgMask[p] && dArr[p] < t0) { bgMask[p] = 1; queue[qTail++] = p; }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      const p = y * w + x;
      if (!bgMask[p] && dArr[p] < t0) { bgMask[p] = 1; queue[qTail++] = p; }
    }
  }

  const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1];
  while (qHead < qTail) {
    const p = queue[qHead++];
    const x = p % w, y = Math.floor(p / w);
    for (let k = 0; k < 8; k++) {
      const nx = x + dx8[k], ny = y + dy8[k];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const np = ny * w + nx;
      if (!bgMask[np] && dArr[np] < t1) {
        bgMask[np] = 1;
        queue[qTail++] = np;
      }
    }
  }

  // 2차 패스: 내부에 고립된 닫힌 키색 구멍(면적 ≥ 48px² & K거리 ≤ 12/0.042) 제거
  if (!softTranslucent) {
    const holeVis = new Uint8Array(n);
    const comp = [];
    for (let start = 0; start < n; start++) {
      if (bgMask[start] || holeVis[start] || dArr[start] >= holeDistMax) continue;
      comp.length = 0;
      let hH = 0, hT = 0;
      queue[hT++] = start;
      holeVis[start] = 1;
      while (hH < hT) {
        const p = queue[hH++];
        comp.push(p);
        const x = p % w, y = Math.floor(p / w);
        for (let k = 0; k < 8; k++) {
          const nx = x + dx8[k], ny = y + dy8[k];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const np = ny * w + nx;
          if (!bgMask[np] && !holeVis[np] && dArr[np] < holeGrowT) {
            holeVis[np] = 1;
            queue[hT++] = np;
          }
        }
      }
      if (comp.length >= holeMinArea) {
        for (const p of comp) bgMask[p] = 1;
      }
    }
  }

  // 배경으로부터 거리(최대 4px) 계산: 깊은 내부 픽셀 알파 1.0 보호 + 4px 전환 띠만 매팅
  const distToBg = new Uint8Array(n);
  distToBg.fill(255);
  qHead = 0; qTail = 0;
  for (let p = 0; p < n; p++) {
    if (bgMask[p]) {
      distToBg[p] = 0;
      queue[qTail++] = p;
    }
  }
  while (qHead < qTail) {
    const p = queue[qHead++];
    const curD = distToBg[p];
    if (curD >= 4) continue;
    const x = p % w, y = Math.floor(p / w);
    for (let k = 0; k < 8; k++) {
      const nx = x + dx8[k], ny = y + dy8[k];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const np = ny * w + nx;
      if (distToBg[np] > curD + 1) {
        distToBg[np] = curD + 1;
        queue[qTail++] = np;
      }
    }
  }

  const out = new Float32Array(n * 4);
  const edgeAlphaThreshold = softTranslucent ? 0.035 : 0.08;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      const K = field.getK(x, y, kBuf);
      let a;
      if (softTranslucent) {
        a = matteA[p];
      } else if (bgMask[p]) {
        a = dArr[p] < Math.max(t0, holeDistMax) ? 0 : matteA[p] * 0.35;
      } else if (distToBg[p] > 4) {
        a = 1.0;
      } else {
        a = matteA[p];
      }

      if (!softTranslucent && choke && distToBg[p] <= 3) {
        a = smoothstep(0.06, 0.94, a);
      }
      if (a < edgeAlphaThreshold) {
        out[i] = K[0]; out[i + 1] = K[1]; out[i + 2] = K[2]; out[i + 3] = 0;
        continue;
      }

      // 언믹스 F = K + (C - K) / max(α, 0.08)
      const invA = a < 0.999 ? 1 / Math.max(a, 0.08) : 1;
      let fr = K[0] + (rgba[i] - K[0]) * invA;
      let fg = K[1] + (rgba[i + 1] - K[1]) * invA;
      let fb = K[2] + (rgba[i + 2] - K[2]) * invA;
      fr = clamp(fr, 0, 255); fg = clamp(fg, 0, 255); fb = clamp(fb, 0, 255);

      // α < 1 또는 배경 경계 3px 에지 띠에만 디스필 적용
      if (distToBg[p] <= 3 || a < 0.999) {
        const edgeMix = distToBg[p] <= 1 ? 1.0 : distToBg[p] === 2 ? 0.88 : 0.65;
        if (keyKind === 'magenta') {
          if (fr > fg && fb > fg) {
            const minRB = Math.min(fr, fb);
            const spill = minRB - fg;
            fr -= spill * edgeMix;
            fb -= spill * edgeMix;
          }
        } else if (keyKind === 'green') {
          const avgRB = 0.5 * (fr + fb);
          if (fg > avgRB + 6) {
            fg = avgRB + (fg - avgRB) * (1 - edgeMix);
          }
        }
      }

      out[i] = clamp(fr, 0, 255);
      out[i + 1] = clamp(fg, 0, 255);
      out[i + 2] = clamp(fb, 0, 255);
      out[i + 3] = clamp(a, 0, 1);
    }
  }

  // 소형 잡음 고립 파편(<12px²) 제거 (sparkle 제외)
  if (!softTranslucent) {
    const fgVis = new Uint8Array(n);
    const island = [];
    for (let start = 0; start < n; start++) {
      if (fgVis[start] || out[start * 4 + 3] <= 0) continue;
      island.length = 0;
      let iH = 0, iT = 0;
      queue[iT++] = start;
      fgVis[start] = 1;
      while (iH < iT) {
        const p = queue[iH++];
        island.push(p);
        const x = p % w, y = Math.floor(p / w);
        for (let k = 0; k < 8; k++) {
          const nx = x + dx8[k], ny = y + dy8[k];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const np = ny * w + nx;
          if (!fgVis[np] && out[np * 4 + 3] > 0) {
            fgVis[np] = 1;
            queue[iT++] = np;
          }
        }
      }
      if (island.length < 12) {
        for (const p of island) out[p * 4 + 3] = 0;
      }
    }
  }

  // 4px 외곽 RGB 번짐 패딩 (alpha=0 픽셀을 가장 가까운 불투명 색으로 채움)
  let filled = new Uint8Array(n);
  for (let p = 0; p < n; p++) filled[p] = out[p * 4 + 3] > 0.02 ? 1 : 0;
  for (let pass = 0; pass < 4; pass++) {
    const nextFilled = new Uint8Array(filled);
    const snap = out.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (filled[p]) continue;
        let cnt = 0, sr = 0, sg = 0, sb = 0;
        for (let k = 0; k < 8; k++) {
          const nx = x + dx8[k], ny = y + dy8[k];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const np = ny * w + nx;
          if (filled[np]) {
            const ni = np * 4;
            sr += snap[ni]; sg += snap[ni + 1]; sb += snap[ni + 2]; cnt++;
          }
        }
        if (cnt > 0) {
          const i = p * 4;
          out[i] = sr / cnt; out[i + 1] = sg / cnt; out[i + 2] = sb / cnt;
          nextFilled[p] = 1;
        }
      }
    }
    filled = nextFilled;
  }

  return { out, field, bgMask, distToBg };
}

/** 자동 컷아웃 합격 게이트 측정 (헤일로 비율 ≤ 0.1%, 내부 키 잔존 0px, 세피아 선 α ≥ 0.97) */
function measureCutoutGates(rgbaFloat, w, h, { keyKind, bgMask, distToBg, field, softTranslucent }) {
  if (softTranslucent) return { haloRatio: 0, interiorKeyPixels: 0, sepiaMedianAlpha: 1, sepiaSamples: 0, passed: true };
  let perimeterCount = 0;
  let haloCount = 0;
  let interiorKeyPixels = 0;
  const sepiaAlphas = [];
  const kBuf = new Float32Array(3);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const i = p * 4;
      const a = rgbaFloat[i + 3];
      const r = rgbaFloat[i], g = rgbaFloat[i + 1], b = rgbaFloat[i + 2];
      const K = field.getK(x, y, kBuf);

      // 외곽 1px 가장자리 판정
      const adjZero = rgbaFloat[(p - 1) * 4 + 3] === 0 || rgbaFloat[(p + 1) * 4 + 3] === 0 ||
                      rgbaFloat[(p - w) * 4 + 3] === 0 || rgbaFloat[(p + w) * 4 + 3] === 0;
      if (a > 0.05 && adjZero) {
        perimeterCount++;
        if (keyKind === 'magenta' && r > g + 30 && b > g + 30 && Math.min(r, b) - g > 42) haloCount++;
        else if (keyKind === 'green' && g > Math.max(r, b) + 38) haloCount++;
      }

      // 내부 키 잔존 확인 (유채 키색만 엄격 검사)
      if (!bgMask[p] && distToBg[p] > 3 && a > 0.5) {
        if (keyKind === 'magenta' || keyKind === 'green') {
          const [cb, cr] = rgb255ToCbCr(r, g, b);
          const [kcb, kcr] = rgb255ToCbCr(K[0], K[1], K[2]);
          if (Math.hypot(cb - kcb, cr - kcr) < 20) interiorKeyPixels++;
        }
      }

      // 세피아 윤곽선 본체 샘플 수집 (1px 외곽 안티앨리어싱을 제외한 2~3px 인접 내부 잉크선)
      if (!bgMask[p] && distToBg[p] >= 2 && distToBg[p] <= 3 && r > b + 12 && r >= 48 && r <= 125 && g >= 35 && g <= 98 && b >= 22 && b <= 80) {
        sepiaAlphas.push(a);
      }
    }
  }

  const haloRatio = perimeterCount > 0 ? haloCount / perimeterCount : 0;
  let sepiaMedianAlpha = 1;
  if (sepiaAlphas.length >= 10) {
    const sample = sepiaAlphas.slice(0, Math.min(50, sepiaAlphas.length));
    sepiaMedianAlpha = medianSorted(sample);
  }

  return {
    haloRatio: Number(haloRatio.toFixed(5)),
    interiorKeyPixels,
    sepiaMedianAlpha: Number(sepiaMedianAlpha.toFixed(4)),
    sepiaSamples: sepiaAlphas.length,
    passed: haloRatio <= 0.001 && interiorKeyPixels === 0 && sepiaMedianAlpha >= 0.97,
  };
}

/** Float32 RGBA -> WebGL2 { premultipliedAlpha: false } 직교 직렬화 WebP 인코딩 */
async function encodeFloatRgbaWebP(rgbaFloat, w, h, quality = 1.0) {
  const bytes = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgbaFloat.length; i += 4) {
    bytes[i] = Math.round(clamp(rgbaFloat[i], 0, 255));
    bytes[i + 1] = Math.round(clamp(rgbaFloat[i + 1], 0, 255));
    bytes[i + 2] = Math.round(clamp(rgbaFloat[i + 2], 0, 255));
    bytes[i + 3] = Math.round(clamp(rgbaFloat[i + 3] * 255, 0, 255));
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const gl = c.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true });
  gl.viewport(0, 0, w, h);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, 'attribute vec2 p; varying vec2 uv; void main(){ uv = (p + 1.0) * 0.5; gl_Position = vec4(p, 0.0, 1.0); }');
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, 'precision mediump float; varying vec2 uv; uniform sampler2D u; void main(){ gl_FragColor = texture2D(u, uv); }');
  gl.compileShader(fs);
  const pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  return await new Promise((resolve) => c.toBlob(resolve, 'image/webp', quality));
}

async function decodeFileRgba(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed: ' + url);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  return { w: bmp.width, h: bmp.height, data };
}

/** 직교 Float32 알파가중 쌍선형(Mitchell/Box area-average) 리샘플링: 4px bleed와 함께 다크 프린지 제거 */
function resampleRgbaFloat(src, sw, sh, dw, dh) {
  const dst = new Float32Array(dw * dh * 4);
  const scaleX = sw / dw, scaleY = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * scaleY, sy1 = (dy + 1) * scaleY;
    const iy0 = Math.max(0, Math.floor(sy0 - 0.5));
    const iy1 = Math.min(sh - 1, Math.ceil(sy1 + 0.5));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * scaleX, sx1 = (dx + 1) * scaleX;
      const ix0 = Math.max(0, Math.floor(sx0 - 0.5));
      const ix1 = Math.min(sw - 1, Math.ceil(sx1 + 0.5));
      let wSum = 0, aW = 0, rSum = 0, gSum = 0, bSum = 0;
      for (let sy = iy0; sy <= iy1; sy++) {
        const wy = Math.max(0, Math.min(sy + 1, sy1) - Math.max(sy, sy0));
        if (wy <= 0) continue;
        for (let sx = ix0; sx <= ix1; sx++) {
          const wx = Math.max(0, Math.min(sx + 1, sx1) - Math.max(sx, sx0));
          if (wx <= 0) continue;
          const wt = wx * wy;
          const si = (sy * sw + sx) * 4;
          const a = src[si + 3];
          wSum += wt;
          aW += wt * a;
          const cWt = wt * Math.max(0.02, a);
          rSum += cWt * src[si];
          gSum += cWt * src[si + 1];
          bSum += cWt * src[si + 2];
        }
      }
      const di = (dy * dw + dx) * 4;
      const cTotal = Math.max(1e-6, wSum);
      const aOut = clamp(aW / cTotal, 0, 1);
      // 가중치 보정된 RGB (bleed 픽셀 포함)
      let colorW = 0;
      for (let sy = iy0; sy <= iy1; sy++) {
        const wy = Math.max(0, Math.min(sy + 1, sy1) - Math.max(sy, sy0));
        if (wy <= 0) continue;
        for (let sx = ix0; sx <= ix1; sx++) {
          const wx = Math.max(0, Math.min(sx + 1, sx1) - Math.max(sx, sx0));
          if (wx <= 0) continue;
          colorW += wx * wy * Math.max(0.02, src[(sy * sw + sx) * 4 + 3]);
        }
      }
      colorW = Math.max(1e-6, colorW);
      dst[di] = rSum / colorW;
      dst[di + 1] = gSum / colorW;
      dst[di + 2] = bSum / colorW;
      dst[di + 3] = aOut;
    }
  }
  return dst;
}

/** 1×3 캐릭터 스트립 비격자 8-연결 슬라이싱 + 신발 아래 그림자 제거 + anchorX/Y + 목선 크롭 */
function sliceCharacterStrip(rgbaFloat, w, h, expectedCount = 3) {
  const n = w * h;
  const labels = new Int32Array(n);
  const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1];
  const queue = new Int32Array(n);
  const comps = [];

  for (let s = 0; s < n; s++) {
    if (labels[s] || rgbaFloat[s * 4 + 3] <= 0.15) continue;
    let id = comps.length + 1;
    let qH = 0, qT = 0;
    queue[qT++] = s;
    labels[s] = id;
    let minX = w, maxX = 0, minY = h, maxY = 0, area = 0;
    const pixels = [];
    while (qH < qT) {
      const p = queue[qH++];
      pixels.push(p);
      area++;
      const x = p % w, y = Math.floor(p / w);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let k = 0; k < 8; k++) {
        const nx = x + dx8[k], ny = y + dy8[k];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const np = ny * w + nx;
        if (!labels[np] && rgbaFloat[np * 4 + 3] > 0.15) {
          labels[np] = id;
          queue[qT++] = np;
        }
      }
    }
    comps.push({ id, minX, maxX, minY, maxY, area, cx: 0.5 * (minX + maxX), cy: 0.5 * (minY + maxY), pixels });
  }

  // 주성분(총 불투명 면적 0.5% 이상) vs 소형 파편 분리 후 24px 이내 병합
  const totalFg = comps.reduce((s, c) => s + c.area, 0);
  const majors = comps.filter((c) => c.area >= totalFg * 0.005);
  const minors = comps.filter((c) => c.area < totalFg * 0.005);

  for (const m of minors) {
    let best = null, bestDist = 25;
    for (const maj of majors) {
      const d = Math.hypot(
        clamp(m.cx, maj.minX, maj.maxX) - m.cx,
        clamp(m.cy, maj.minY, maj.maxY) - m.cy,
      );
      if (d < bestDist) { bestDist = d; best = maj; }
    }
    if (best) {
      for (const p of m.pixels) best.pixels.push(p);
      best.minX = Math.min(best.minX, m.minX); best.maxX = Math.max(best.maxX, m.maxX);
      best.minY = Math.min(best.minY, m.minY); best.maxY = Math.max(best.maxY, m.maxY);
      best.area += m.area;
      best.cx = 0.5 * (best.minX + best.maxX);
    }
  }

  if (majors.length !== expectedCount) {
    throw new Error('캐릭터 스트립 성분 수 불일치: expected ' + expectedCount + ', got ' + majors.length);
  }

  majors.sort((a, b) => a.cx - b.cx);

  return majors.map((c) => {
    const pad = 12;
    const x0 = Math.max(0, c.minX - pad), y0 = Math.max(0, c.minY - pad);
    const x1 = Math.min(w - 1, c.maxX + pad), y1 = Math.min(h - 1, c.maxY + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const sub = new Float32Array(cw * ch * 4);
    const mask = new Uint8Array(w * h);
    for (const p of c.pixels) mask[p] = 1;
    // 인접 AA 가장자리까지 2px 확장 복사해 외곽선 안티앨리어싱 포함
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const p = y * w + x;
        const si = p * 4;
        const di = ((y - y0) * cw + (x - x0)) * 4;
        sub[di] = rgbaFloat[si]; sub[di + 1] = rgbaFloat[si + 1]; sub[di + 2] = rgbaFloat[si + 2];
        let keep = mask[p];
        if (!keep && rgbaFloat[si + 3] > 0) {
          for (let oy = -2; oy <= 2 && !keep; oy++) {
            for (let ox = -2; ox <= 2 && !keep; ox++) {
              const nx = x + ox, ny = y + oy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) keep = 1;
            }
          }
        }
        sub[di + 3] = keep ? rgbaFloat[si + 3] : 0;
      }
    }

    // 발밑 생성기 잔류 그림자 제거 (하단 12% 영역의 저채도 C<0.06 · 반투명/납작 덩어리)
    const trimFloorY = Math.floor(ch * 0.88);
    for (let y = trimFloorY; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const di = (y * cw + x) * 4;
        const a = sub[di + 3];
        if (a <= 0) continue;
        const [L, oa, ob] = rgb01ToOklab(sub[di] / 255, sub[di + 1] / 255, sub[di + 2] / 255);
        const C = Math.hypot(oa, ob);
        if (a < 0.72 && C < 0.06 && L < 0.6) sub[di + 3] = 0;
      }
    }

    // 정규화 전 실제 높이·발끝선 측정
    let topY = ch, botY = -1, footRow = -1, footXSum = 0, footCnt = 0;
    for (let y = 0; y < ch; y++) {
      let run = 0, maxRun = 0, rowSum = 0, rowCnt = 0;
      for (let x = 0; x < cw; x++) {
        if (sub[(y * cw + x) * 4 + 3] > 0.5) {
          run++; if (run > maxRun) maxRun = run;
          rowSum += x; rowCnt++;
        } else {
          run = 0;
        }
      }
      if (rowCnt > 0) {
        if (y < topY) topY = y;
        if (y > botY) botY = y;
      }
      if (maxRun >= 6) {
        footRow = y;
        footXSum = rowSum;
        footCnt = rowCnt;
      }
    }
    if (footRow < 0) { footRow = botY; footXSum = cw * 0.5; footCnt = 1; }
    const heightPx = Math.max(1, footRow - topY + 1);
    const widthPx = c.maxX - c.minX + 1;
    const anchorX = footXSum / Math.max(1, footCnt);
    const anchorY = footRow;
    return { cw, ch, sub, topY, heightPx, widthPx, anchorX, anchorY };
  });
}

/** 512×640 full@2x 정규화 + 목선 탐색(Neck-Search) 기반 128×128 원형 포트레이트 생성 */
function normalizeCharacterPack(rawParts) {
  const heights = rawParts.map((p) => p.heightPx).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];
  const baseScale = 540 / Math.max(1, medianH);

  return rawParts.map((part) => {
    // 키 ≤ 568, 폭 ≤ 480 상한 보장
    const s = Math.min(baseScale, 568 / part.heightPx, 480 / Math.max(1, part.widthPx));
    const sw = Math.max(1, Math.round(part.cw * s));
    const sh = Math.max(1, Math.round(part.ch * s));
    const scaled = resampleRgbaFloat(part.sub, part.cw, part.ch, sw, sh);

    const FW = 512, FH = 640, AX = 256, AY = 592;
    const ox = Math.round(AX - part.anchorX * s);
    const oy = Math.round(AY - part.anchorY * s);
    const full = new Float32Array(FW * FH * 4);
    for (let y = 0; y < sh; y++) {
      const dy = y + oy;
      if (dy < 0 || dy >= FH) continue;
      for (let x = 0; x < sw; x++) {
        const dx = x + ox;
        if (dx < 0 || dx >= FW) continue;
        const si = (y * sw + x) * 4, di = (dy * FW + dx) * 4;
        full[di] = scaled[si]; full[di + 1] = scaled[si + 1]; full[di + 2] = scaled[si + 2]; full[di + 3] = scaled[si + 3];
      }
    }

    // Full 캔버스 상 실제 머리·목선 탐색
    let fTop = FH, fBot = 0;
    const rowWidth = new Int32Array(FH);
    const rowL = new Int32Array(FH).fill(FW);
    const rowR = new Int32Array(FH).fill(-1);
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        if (full[(y * FW + x) * 4 + 3] > 0.35) {
          if (y < fTop) fTop = y;
          if (y > fBot) fBot = y;
          if (x < rowL[y]) rowL[y] = x;
          if (x > rowR[y]) rowR[y] = x;
        }
      }
      if (rowR[y] >= rowL[y]) rowWidth[y] = rowR[y] - rowL[y] + 1;
    }

    const totalH = Math.max(100, fBot - fTop);
    const searchY0 = Math.round(fTop + totalH * 0.25);
    const searchY1 = Math.round(fTop + totalH * 0.50);
    let neckY = Math.round(fTop + totalH * 0.36);
    let minW = Infinity;
    for (let y = searchY0; y <= searchY1; y++) {
      if (rowWidth[y] > 24 && rowWidth[y] < minW) {
        minW = rowWidth[y];
        neckY = y;
      }
    }

    let headL = FW, headR = 0;
    for (let y = fTop; y <= neckY; y++) {
      if (rowR[y] >= rowL[y]) {
        headL = Math.min(headL, rowL[y]);
        headR = Math.max(headR, rowR[y]);
      }
    }
    const headW = Math.max(60, headR - headL + 1);
    const headH = Math.max(60, neckY - fTop + 1);
    const headCx = 0.5 * (headL + headR);
    const headCy = 0.5 * (fTop + neckY);
    const side = Math.max(headW, headH) * 1.22;
    const cropCx = headCx;
    const cropCy = headCy + 0.04 * side;
    const cropX0 = Math.round(cropCx - side * 0.5);
    const cropY0 = Math.round(cropCy - side * 0.5);
    const cropSide = Math.max(64, Math.round(side));

    // 크롭 후 128×128 포트레이트 직결 리샘플 (원형 안전 여유 92% 포함)
    const cropBuf = new Float32Array(cropSide * cropSide * 4);
    for (let y = 0; y < cropSide; y++) {
      const sy = cropY0 + y;
      if (sy < 0 || sy >= FH) continue;
      for (let x = 0; x < cropSide; x++) {
        const sx = cropX0 + x;
        if (sx < 0 || sx >= FW) continue;
        const si = (sy * FW + sx) * 4, di = (y * cropSide + x) * 4;
        cropBuf[di] = full[si]; cropBuf[di + 1] = full[si + 1]; cropBuf[di + 2] = full[si + 2]; cropBuf[di + 3] = full[si + 3];
      }
    }
    const portrait = resampleRgbaFloat(cropBuf, cropSide, cropSide, 128, 128);
    // 128×128 원형 마스크 적용 (반지름 63.5px 안티앨리어싱)
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const dist = Math.hypot(x + 0.5 - 64, y + 0.5 - 64);
        const circ = clamp(63.5 - dist, 0, 1);
        const i = (y * 128 + x) * 4;
        portrait[i + 3] *= circ;
      }
    }

    return { full, portrait, fullW: FW, fullH: FH, anchorX: AX, anchorY: AY, neckY, headBox: { headL, headR, fTop, neckY } };
  });
}

/** Kåsa 최소제곱 원 맞춤으로 바퀴 허브 중심을 캔버스 정중앙에 패딩 */
function centerWheelKasa(rgbaFloat, w, h) {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgbaFloat[(y * w + x) * 4 + 3] > 0.5) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const gx = 0.5 * (minX + maxX), gy = 0.5 * (minY + maxY);
  const pts = [];
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    let maxR = 0;
    for (let r = 2; r < Math.max(w, h); r++) {
      const px = Math.round(gx + dx * r), py = Math.round(gy + dy * r);
      if (px < 0 || px >= w || py < 0 || py >= h) break;
      if (rgbaFloat[(py * w + px) * 4 + 3] > 0.5) maxR = r;
    }
    if (maxR > 8) pts.push([gx + dx * maxR, gy + dy * maxR]);
  }
  // 최소제곱 [x, y, 1] · [A, B, C] = x² + y²
  let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = pts.length;
  let b0 = 0, b1 = 0, b2 = 0;
  for (const [x, y] of pts) {
    const zz = x * x + y * y;
    m00 += x * x; m01 += x * y; m02 += x;
    m11 += y * y; m12 += y;
    b0 += x * zz; b1 += y * zz; b2 += zz;
  }
  // 3×3 행렬식 풀이
  const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02);
  let cx = gx, cy = gy, rFit = 0.5 * Math.max(maxX - minX, maxY - minY);
  if (Math.abs(det) > 1e-6) {
    const detA = b0 * (m11 * m22 - m12 * m12) - m01 * (b1 * m22 - m12 * b2) + m02 * (b1 * m12 - m11 * b2);
    const detB = m00 * (b1 * m22 - m12 * b2) - b0 * (m01 * m22 - m12 * m02) + m02 * (m01 * b2 - b1 * m02);
    const detC = m00 * (m11 * b2 - b1 * m12) - m01 * (m01 * b2 - b1 * m02) + b0 * (m01 * m12 - m11 * m02);
    const A = detA / det, B = detB / det, C = detC / det;
    cx = A * 0.5; cy = B * 0.5;
    rFit = Math.sqrt(Math.max(1, C + cx * cx + cy * cy));
  }
  const half = Math.ceil(rFit) + 6;
  const outSize = half * 2;
  const out = new Float32Array(outSize * outSize * 4);
  const ox = Math.round(half - cx), oy = Math.round(half - cy);
  for (let y = 0; y < h; y++) {
    const dy = y + oy; if (dy < 0 || dy >= outSize) continue;
    for (let x = 0; x < w; x++) {
      const dx = x + ox; if (dx < 0 || dx >= outSize) continue;
      const si = (y * w + x) * 4, di = (dy * outSize + dx) * 4;
      out[di] = rgbaFloat[si]; out[di + 1] = rgbaFloat[si + 1]; out[di + 2] = rgbaFloat[si + 2]; out[di + 3] = rgbaFloat[si + 3];
    }
  }
  return { out, w: outSize, h: outSize, radius: Number(rFit.toFixed(2)), hub: [half, half] };
}

/** 타이트 투명 여백 트림(+4px 여유) + 오프셋 메타 반환 */
function bboxTrim(rgbaFloat, w, h, margin = 4) {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgbaFloat[(y * w + x) * 4 + 3] > 0.01) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return { out: rgbaFloat, w, h, offsetX: 0, offsetY: 0, sourceW: w, sourceH: h };
  const x0 = Math.max(0, minX - margin), y0 = Math.max(0, minY - margin);
  const x1 = Math.min(w - 1, maxX + margin), y1 = Math.min(h - 1, maxY + margin);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Float32Array(cw * ch * 4);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const si = (y * w + x) * 4, di = ((y - y0) * cw + (x - x0)) * 4;
      out[di] = rgbaFloat[si]; out[di + 1] = rgbaFloat[si + 1]; out[di + 2] = rgbaFloat[si + 2]; out[di + 3] = rgbaFloat[si + 3];
    }
  }
  return { out, w: cw, h: ch, offsetX: x0, offsetY: y0, sourceW: w, sourceH: h };
}

/** 중립 크림 바탕 페인트 마스크 생성 (OKLab L > 0.56 & C < 0.085, 황동·세피아·창문 구멍 보호) */
function extractPaintMask(rgbaFloat, w, h, maskExclude = {}) {
  const { yMin = 0, yMax = h, excludeRects = [] } = maskExclude;
  const mask = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const inY = y >= yMin && y <= yMax;
    for (let x = 0; x < w; x++) {
      if (!inY) continue;
      let blocked = false;
      for (const rc of excludeRects) {
        if (x >= rc[0] && x <= rc[0] + rc[2] && y >= rc[1] && y <= rc[1] + rc[3]) { blocked = true; break; }
      }
      if (blocked) continue;
      const p = y * w + x;
      const i = p * 4;
      const a = rgbaFloat[i + 3];
      if (a < 0.1) continue;
      const [L, oa, ob] = rgb01ToOklab(rgbaFloat[i] / 255, rgbaFloat[i + 1] / 255, rgbaFloat[i + 2] / 255);
      const C = Math.hypot(oa, ob);
      const isNeutralCream = L >= 0.62 && C <= 0.072 && ob >= -0.022 && ob <= 0.068;
      const m = isNeutralCream ? smoothstep(0.58, 0.70, L) * (1 - smoothstep(0.055, 0.082, C)) * a : 0;
      const val = Math.round(clamp(m, 0, 1) * 255);
      mask[i] = val; mask[i + 1] = val; mask[i + 2] = val; mask[i + 3] = clamp(m, 0, 1);
    }
  }
  return mask;
}

/** 1800×1400 블리드 마스터 배치 (클램프 에지 연장으로 식물/문틈 거울 반사 방지) */
function placeIntoMaster1800x1400(srcFloat, sw, sh, placement) {
  const MW = 1800, MH = 1400;
  const { destX, destY, destW, destH } = placement;
  const scaled = (sw === destW && sh === destH) ? srcFloat : resampleRgbaFloat(srcFloat, sw, sh, Math.round(destW), Math.round(destH));
  const dw = Math.round(destW), dh = Math.round(destH);
  const dx0 = Math.round(destX), dy0 = Math.round(destY);
  const out = new Float32Array(MW * MH * 4);
  for (let my = 0; my < MH; my++) {
    const sy = clamp(my - dy0, 1, dh - 2);
    for (let mx = 0; mx < MW; mx++) {
      const sx = clamp(mx - dx0, 1, dw - 2);
      const si = (sy * dw + sx) * 4, di = (my * MW + mx) * 4;
      out[di] = scaled[si]; out[di + 1] = scaled[si + 1]; out[di + 2] = scaled[si + 2]; out[di + 3] = scaled[si + 3];
    }
  }
  return out;
}

/** 512×512 심리스 텍스처 타일 (가장자리 48px 미러·코사인 크로스페이드) */
function makeSeamlessTile512(srcFloat, sw, sh) {
  const T = 512;
  const base = resampleRgbaFloat(srcFloat, sw, sh, T, T);
  const out = new Float32Array(T * T * 4);
  const margin = 48;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const mx = T - 1 - x;
      const my = T - 1 - y;
      const wx = x < margin ? 0.5 + 0.5 * Math.sin((x / margin) * Math.PI * 0.5)
               : x >= T - margin ? 0.5 + 0.5 * Math.sin(((T - 1 - x) / margin) * Math.PI * 0.5) : 1;
      const wy = y < margin ? 0.5 + 0.5 * Math.sin((y / margin) * Math.PI * 0.5)
               : y >= T - margin ? 0.5 + 0.5 * Math.sin(((T - 1 - y) / margin) * Math.PI * 0.5) : 1;
      const i = (y * T + x) * 4;
      const iMx = (y * T + mx) * 4;
      const iMy = (my * T + x) * 4;
      const iMxy = (my * T + mx) * 4;
      for (let c = 0; c < 3; c++) {
        const hx = base[i + c] * wx + base[iMx + c] * (1 - wx);
        const hxMy = base[iMy + c] * wx + base[iMxy + c] * (1 - wx);
        out[i + c] = hx * wy + hxMy * (1 - wy);
      }
      out[i + 3] = 1;
    }
  }
  return out;
}

/** 특정 좌표에 속한 주 8-연결 전경 성분만 유지 (L자 겹침 시트 분리용) */
function isolateComponentNear(rgbaFloat, w, h, seedPt) {
  const n = w * h;
  const labels = new Int32Array(n);
  const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1];
  const queue = new Int32Array(n);
  const sx = Math.round(clamp(seedPt[0], 0, w - 1));
  const sy = Math.round(clamp(seedPt[1], 0, h - 1));
  // 시드 반경 60px 내 첫 불투명 픽셀들에서 시작해 주성분 집합 수집
  const keepComps = new Set();
  const compPixels = [];
  for (let s = 0; s < n; s++) {
    if (labels[s] || rgbaFloat[s * 4 + 3] <= 0.1) continue;
    const cid = compPixels.length + 1;
    let qH = 0, qT = 0;
    queue[qT++] = s; labels[s] = cid;
    const list = [];
    let nearSeed = false;
    while (qH < qT) {
      const p = queue[qH++];
      list.push(p);
      const px = p % w, py = Math.floor(p / w);
      if (Math.abs(px - sx) <= 72 && Math.abs(py - sy) <= 72) nearSeed = true;
      for (let k = 0; k < 8; k++) {
        const nx = px + dx8[k], ny = py + dy8[k];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const np = ny * w + nx;
        if (!labels[np] && rgbaFloat[np * 4 + 3] > 0.1) { labels[np] = cid; queue[qT++] = np; }
      }
    }
    compPixels.push({ cid, list, nearSeed });
    if (nearSeed && list.length >= 250) keepComps.add(cid);
  }
  const keepMask = new Uint8Array(n);
  for (const cp of compPixels) {
    if (keepComps.has(cp.cid)) for (const p of cp.list) keepMask[p] = 1;
  }
  for (let p = 0; p < n; p++) {
    if (keepMask[p]) continue;
    // 2px 외곽 AA 보호
    const px = p % w, py = Math.floor(p / w);
    let near = false;
    for (let oy = -2; oy <= 2 && !near; oy++) for (let ox = -2; ox <= 2 && !near; ox++) {
      const nx = px + ox, ny = py + oy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && keepMask[ny * w + nx]) near = true;
    }
    if (!near) rgbaFloat[p * 4 + 3] = 0;
  }
}

/** 직선 Canvas 글로우·그림자·별빛 베이킹 (Straight Alpha WebP) */
async function bakeProceduralSprite(preset) {
  const c = document.createElement('canvas');
  c.width = preset.w; c.height = preset.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (preset.kind === 'lantern-glow' || preset.kind === 'sconce-glow') {
    const cx = preset.w / 2, cy = preset.h / 2, r = preset.w * 0.48;
    const gr = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    const warm = preset.kind === 'sconce-glow' ? '255, 224, 152' : '255, 234, 162';
    gr.addColorStop(0, 'rgba(255, 248, 214, 0.85)');
    gr.addColorStop(0.32, 'rgba(' + warm + ', 0.52)');
    gr.addColorStop(0.7, 'rgba(' + warm + ', 0.16)');
    gr.addColorStop(1, 'rgba(' + warm + ', 0.0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, preset.w, preset.h);
  } else if (preset.kind === 'ground-shadow') {
    ctx.save();
    ctx.translate(preset.w / 2, preset.h / 2);
    ctx.scale(1, preset.h / preset.w);
    const gr = ctx.createRadialGradient(0, 0, 4, 0, 0, preset.w * 0.46);
    gr.addColorStop(0, 'rgba(24, 43, 36, 0.42)');
    gr.addColorStop(0.55, 'rgba(24, 43, 36, 0.20)');
    gr.addColorStop(1, 'rgba(24, 43, 36, 0.0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, preset.w * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (preset.kind === 'steam-puff') {
    const cx = preset.w / 2, cy = preset.h / 2;
    const lobes = preset.lobes || [[0.5, 0.52, 0.34], [0.34, 0.56, 0.25], [0.66, 0.54, 0.24], [0.5, 0.38, 0.24]];
    for (const [lx, ly, lr] of lobes) {
      const gr = ctx.createRadialGradient(preset.w * lx, preset.h * ly, 2, preset.w * lx, preset.h * ly, preset.w * lr);
      gr.addColorStop(0, 'rgba(255, 253, 246, 0.84)');
      gr.addColorStop(0.55, 'rgba(247, 244, 236, 0.52)');
      gr.addColorStop(1, 'rgba(247, 244, 236, 0.0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(preset.w * lx, preset.h * ly, preset.w * lr, 0, Math.PI * 2); ctx.fill();
    }
  } else if (preset.kind === 'sparkle' || preset.kind === 'sparkle-burst') {
    const cx = preset.w / 2, cy = preset.h / 2;
    const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, preset.w * 0.42);
    gr.addColorStop(0, preset.kind === 'sparkle' ? 'rgba(255,255,255,0.92)' : 'rgba(255,246,198,0.88)');
    gr.addColorStop(0.45, preset.kind === 'sparkle' ? 'rgba(186,238,255,0.45)' : 'rgba(143,206,184,0.34)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, preset.w, preset.h);
    const drawStar = (x, y, rad, fill) => {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = fill; ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rr = i % 2 === 0 ? rad : rad * 0.28;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    };
    drawStar(cx, cy, preset.w * 0.36, '#FFFFFF');
    if (preset.kind === 'sparkle-burst') {
      [[0.22,0.28,16,'#FFE082'],[0.78,0.24,18,'#9CE3CD'],[0.82,0.74,15,'#F09EA9'],[0.24,0.76,14,'#92C0E6']].forEach(([px,py,sr,col]) => drawStar(preset.w*px, preset.h*py, sr, col));
    }
  }
  const id = ctx.getImageData(0, 0, preset.w, preset.h).data;
  const out = new Float32Array(preset.w * preset.h * 4);
  for (let i = 0; i < id.length; i += 4) {
    out[i] = id[i]; out[i + 1] = id[i + 1]; out[i + 2] = id[i + 2]; out[i + 3] = id[i + 3] / 255;
  }
  return out;
}

window.__gpProcessJob = async function (job) {
  const { id, mode, url, crop = null, flipX = false, componentAt = null, frostedRects = null,
          targetW, targetH, placement = null, keyKind = 'magenta', softTranslucent = false,
          choke = true, trim = false, quality = 0.95, wheelKasa = false, lobbyAperture = null,
          extractMask = false, maskExclude = {}, bakePreset = null, saveAs } = job;

  if (mode === 'canvas-bake') {
    const baked = await bakeProceduralSprite(bakePreset);
    const blob = await encodeFloatRgbaWebP(baked, bakePreset.w, bakePreset.h, quality);
    await fetch('/save?name=' + encodeURIComponent(saveAs), { method: 'POST', body: blob });
    return { id, width: bakePreset.w, height: bakePreset.h, bytes: blob.size, gates: { passed: true, haloRatio: 0, interiorKeyPixels: 0, sepiaMedianAlpha: 1 } };
  }

  const decoded = await decodeFileRgba(url);
  let w = decoded.w, h = decoded.h, rawU8 = decoded.data;

  // 선택적 사전 크롭
  if (crop) {
    const [cx0, cy0, cw, ch] = crop;
    const sliced = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      const sy = cy0 + y; if (sy < 0 || sy >= h) continue;
      for (let x = 0; x < cw; x++) {
        const sx = cx0 + x; if (sx < 0 || sx >= w) continue;
        const si = (sy * w + sx) * 4, di = (y * cw + x) * 4;
        sliced[di] = rawU8[si]; sliced[di + 1] = rawU8[si + 1]; sliced[di + 2] = rawU8[si + 2]; sliced[di + 3] = rawU8[si + 3];
      }
    }
    w = cw; h = ch; rawU8 = sliced;
  }

  let work = new Float32Array(w * h * 4);
  for (let i = 0; i < rawU8.length; i += 4) {
    work[i] = rawU8[i]; work[i + 1] = rawU8[i + 1]; work[i + 2] = rawU8[i + 2]; work[i + 3] = rawU8[i + 3] / 255;
  }

  let gates = { passed: true, haloRatio: 0, interiorKeyPixels: 0, sepiaMedianAlpha: 1, sepiaSamples: 0 };

  if (mode === 'lobby-aperture') {
    if (placement) {
      work = placeIntoMaster1800x1400(work, w, h, placement);
      w = 1800; h = 1400;
    }
    const { x0, x1, y0, y1, keyHint = [255, 0, 255] } = lobbyAperture;
    const [kcb, kcr] = rgb255ToCbCr(keyHint[0], keyHint[1], keyHint[2]);
    // 중앙 문 개구부 내부 및 8px 테두리 띠만 마젠타 매팅·디스필·폐기 (외부 로비 방 벽 100% 보존)
    const rx0 = Math.max(0, Math.floor(x0) - 8), rx1 = Math.min(w - 1, Math.ceil(x1) + 8);
    const ry0 = Math.max(0, Math.floor(y0) - 8), ry1 = Math.min(h - 1, Math.ceil(y1) + 8);
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        const i = (y * w + x) * 4;
        const [cb, cr] = rgb255ToCbCr(work[i], work[i + 1], work[i + 2]);
        const d = Math.hypot(cb - kcb, cr - kcr);
        const insideRect = x >= x0 + 2 && x <= x1 - 2 && y >= y0 + 2 && y <= y1 - 2;
        if (insideRect && d < 62) {
          work[i + 3] = 0;
        } else if (d < 68) {
          const a = smoothstep(22, 68, d);
          work[i + 3] = insideRect ? Math.min(work[i + 3], a * 0.4) : Math.min(work[i + 3], a);
          if (work[i + 3] < 0.08) { work[i + 3] = 0; }
          else if (work[i] > work[i + 1] && work[i + 2] > work[i + 1]) {
            const minRB = Math.min(work[i], work[i + 2]);
            const spill = minRB - work[i + 1];
            work[i] -= spill; work[i + 2] -= spill;
          }
        }
      }
    }
    // 문턱 내측 4px RGB 팽창 (개구부 경계 흰/분홍 잔상 방지)
    for (let pass = 0; pass < 3; pass++) {
      const snap = work.slice();
      for (let y = ry0 + 1; y < ry1; y++) for (let x = rx0 + 1; x < rx1; x++) {
        const i = (y * w + x) * 4;
        if (work[i + 3] > 0.02) continue;
        let sr = 0, sg = 0, sb = 0, cnt = 0;
        for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const ni = ((y + oy) * w + (x + ox)) * 4;
          if (snap[ni + 3] > 0.2) { sr += snap[ni]; sg += snap[ni + 1]; sb += snap[ni + 2]; cnt++; }
        }
        if (cnt > 0) { work[i] = sr / cnt; work[i + 1] = sg / cnt; work[i + 2] = sb / cnt; }
      }
    }
    const blob = await encodeFloatRgbaWebP(work, w, h, quality);
    await fetch('/save?name=' + encodeURIComponent(saveAs), { method: 'POST', body: blob });
    return { id, width: w, height: h, bytes: blob.size, gates };
  }

  if (mode === 'seamless-tile-512') {
    const tile = makeSeamlessTile512(work, w, h);
    const blob = await encodeFloatRgbaWebP(tile, 512, 512, quality);
    await fetch('/save?name=' + encodeURIComponent(saveAs), { method: 'POST', body: blob });
    return { id, width: 512, height: 512, bytes: blob.size, gates };
  }

  if (mode === 'opaque-resize') {
    if (placement) {
      work = placeIntoMaster1800x1400(work, w, h, placement);
      w = 1800; h = 1400;
    } else if (targetW && targetH && (w !== targetW || h !== targetH)) {
      work = resampleRgbaFloat(work, w, h, targetW, targetH);
      w = targetW; h = targetH;
    }
    const blob = await encodeFloatRgbaWebP(work, w, h, quality);
    await fetch('/save?name=' + encodeURIComponent(saveAs), { method: 'POST', body: blob });
    let maskBytes = 0;
    if (extractMask) {
      const scaledMaskExclude = {
        yMin: maskExclude.yMinRatio != null ? Math.round(h * maskExclude.yMinRatio) : 0,
        yMax: maskExclude.yMaxRatio != null ? Math.round(h * maskExclude.yMaxRatio) : h,
        excludeRects: (maskExclude.ratioRects || []).map(([rx, ry, rw, rh]) => [rx * w, ry * h, rw * w, rh * h]),
      };
      const mask = extractPaintMask(work, w, h, scaledMaskExclude);
      const maskName = saveAs.endsWith('-base.webp') ? saveAs.replace(/-base\.webp$/, '-mask.webp') : saveAs.replace(/\.webp$/, '-mask.webp');
      const maskBlob = await encodeFloatRgbaWebP(mask, w, h, 0.95);
      await fetch('/save?name=' + encodeURIComponent(maskName), { method: 'POST', body: maskBlob });
      maskBytes = maskBlob.size;
    }
    return { id, width: w, height: h, bytes: blob.size, maskBytes, gates };
  }

  // 알파 컷아웃 실행
  const cut = cutoutBuffer(rawU8, w, h, { keyKind, softTranslucent, holeDistMax: job.holeDistMax ?? null, choke });
  work = cut.out;
  gates = measureCutoutGates(work, w, h, { keyKind, bgMask: cut.bgMask, distToBg: cut.distToBg, field: cut.field, softTranslucent });

  if (componentAt) isolateComponentNear(work, w, h, componentAt);

  if (mode === 'character-strip') {
    const parts = sliceCharacterStrip(work, w, h, job.ids.length);
    const norm = normalizeCharacterPack(parts);
    const outputs = [];
    for (let k = 0; k < job.ids.length; k++) {
      const charId = job.ids[k];
      const item = norm[k];
      const fullBlob = await encodeFloatRgbaWebP(item.full, item.fullW, item.fullH, 0.95);
      const portBlob = await encodeFloatRgbaWebP(item.portrait, 128, 128, 0.95);
      await fetch('/save?name=' + encodeURIComponent('characters/full/' + charId + '.webp'), { method: 'POST', body: fullBlob });
      await fetch('/save?name=' + encodeURIComponent('characters/portraits/' + charId + '.webp'), { method: 'POST', body: portBlob });
      outputs.push({ charId, fullBytes: fullBlob.size, portBytes: portBlob.size, anchorX: item.anchorX, anchorY: item.anchorY, neckY: item.neckY });
    }
    return { id, w, h, gates, outputs };
  }

  if (frostedRects) {
    for (const [fx, fy, fw, fh] of frostedRects) {
      for (let y = fy; y < fy + fh; y++) {
        if (y < 0 || y >= h) continue;
        for (let x = fx; x < fx + fw; x++) {
          if (x < 0 || x >= w) continue;
          const i = (y * w + x) * 4;
          if (work[i + 3] > 0.5) {
            work[i] = 244; work[i + 1] = 250; work[i + 2] = 253; work[i + 3] = 0.24;
          }
        }
      }
    }
  }

  if (placement) {
    work = placeIntoMaster1800x1400(work, w, h, placement);
    w = 1800; h = 1400;
  } else if (targetW && targetH && (w !== targetW || h !== targetH)) {
    work = resampleRgbaFloat(work, w, h, targetW, targetH);
    w = targetW; h = targetH;
  }

  if (lobbyAperture) {
    const { x0, x1, y0, y1, feather = 1.5 } = lobbyAperture;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      if (y < 0 || y >= h) continue;
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        if (x < 0 || x >= w) continue;
        const dx = Math.min(x - x0, x1 - x);
        const dy = Math.min(y - y0, y1 - y);
        const d = Math.min(dx, dy);
        if (d >= feather) work[(y * w + x) * 4 + 3] = 0;
        else if (d >= 0) work[(y * w + x) * 4 + 3] *= clamp(1 - d / feather, 0, 1);
      }
    }
  }

  let meta = { width: w, height: h };
  if (wheelKasa) {
    const centered = centerWheelKasa(work, w, h);
    work = centered.out; w = centered.w; h = centered.h;
    meta = { ...meta, width: w, height: h, radius: centered.radius, hub: centered.hub };
  } else if (trim) {
    const trimmed = bboxTrim(work, w, h, 4);
    work = trimmed.out; w = trimmed.w; h = trimmed.h;
    meta = { width: w, height: h, offsetX: trimmed.offsetX, offsetY: trimmed.offsetY, sourceW: trimmed.sourceW, sourceH: trimmed.sourceH };
  }

  if (flipX) {
    const flipped = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + (w - 1 - x)) * 4, di = (y * w + x) * 4;
        flipped[di] = work[si]; flipped[di + 1] = work[si + 1]; flipped[di + 2] = work[si + 2]; flipped[di + 3] = work[si + 3];
      }
    }
    work = flipped;
  }

  const blob = await encodeFloatRgbaWebP(work, w, h, quality);
  await fetch('/save?name=' + encodeURIComponent(saveAs), { method: 'POST', body: blob });

  // 중앙 투명 문 개구부(t1-train-body-base, e1-arch-trim-base 등) 바운딩 박스 측정
  if (job.measureAperture) {
    let ax0 = w, ax1 = -1, ay0 = h, ay1 = -1;
    const xStart = Math.round(w * 0.25), xEnd = Math.round(w * 0.75);
    const yStart = Math.round(h * 0.22), yEnd = Math.round(h * 0.96);
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        if (work[(y * w + x) * 4 + 3] < 0.1) {
          if (x < ax0) ax0 = x; if (x > ax1) ax1 = x;
          if (y < ay0) ay0 = y; if (y > ay1) ay1 = y;
        }
      }
    }
    if (ax1 > ax0 && ay1 > ay0) {
      meta.apertureRect = { x: ax0, y: ay0, width: ax1 - ax0 + 1, height: ay1 - ay0 + 1 };
    }
  }

  let maskBytes = 0;
  if (extractMask) {
    const scaledMaskExclude = {
      yMin: maskExclude.yMinRatio != null ? Math.round(h * maskExclude.yMinRatio) : 0,
      yMax: maskExclude.yMaxRatio != null ? Math.round(h * maskExclude.yMaxRatio) : h,
      excludeRects: (maskExclude.ratioRects || []).map(([rx, ry, rw, rh]) => [rx * w, ry * h, rw * w, rh * h]),
    };
    const mask = extractPaintMask(work, w, h, scaledMaskExclude);
    const maskName = saveAs.endsWith('-base.webp') ? saveAs.replace(/-base\.webp$/, '-mask.webp') : saveAs.replace(/\.webp$/, '-mask.webp');
    const maskBlob = await encodeFloatRgbaWebP(mask, w, h, 0.95);
    await fetch('/save?name=' + encodeURIComponent(maskName), { method: 'POST', body: maskBlob });
    maskBytes = maskBlob.size;
  }

  return { id, ...meta, bytes: blob.size, maskBytes, gates };
};

/** 16×16 밝은 체커보드 위에 가공된 WebP들을 배치한 PNG 검수 시트 생성 */
window.__gpBuildCheckSheet = async function (items, cols = 4, cellW = 280, cellH = 340, savePath) {
  const rows = Math.ceil(items.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * cellW;
  c.height = rows * cellH;
  const ctx = c.getContext('2d');
  // 체커보드 배경
  for (let y = 0; y < c.height; y += 16) {
    for (let x = 0; x < c.width; x += 16) {
      ctx.fillStyle = ((x >> 4) + (y >> 4)) % 2 === 0 ? '#E8ECEF' : '#CBD3DA';
      ctx.fillRect(x, y, 16, 16);
    }
  }
  for (let idx = 0; idx < items.length; idx++) {
    const col = idx % cols, row = Math.floor(idx / cols);
    const ox = col * cellW, oy = row * cellH;
    const res = await fetch(items[idx].url);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const s = Math.min((cellW - 24) / bmp.width, (cellH - 44) / bmp.height);
    const dw = bmp.width * s, dh = bmp.height * s;
    const dx = ox + (cellW - dw) / 2, dy = oy + 12 + (cellH - 44 - dh) / 2;
    ctx.drawImage(bmp, dx, dy, dw, dh);
    if (items[idx].anchor) {
      const ax = dx + items[idx].anchor[0] * s;
      const ay = dy + items[idx].anchor[1] * s;
      ctx.strokeStyle = '#FF2D55'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax - 10, ay); ctx.lineTo(ax + 10, ay); ctx.moveTo(ax, ay - 10); ctx.lineTo(ax, ay + 10); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20, 32, 28, 0.85)';
    ctx.fillRect(ox + 8, oy + cellH - 28, cellW - 16, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(items[idx].label, ox + 14, oy + cellH - 13);
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, cellW, cellH);
  }
  const pngBlob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await fetch('/save-abs?path=' + encodeURIComponent(savePath), { method: 'POST', body: pngBlob });
  return { width: c.width, height: c.height, bytes: pngBlob.size };
};
</script>
</body>
</html>`;

/** Playwright 모듈 동적 탐색 (환경 의존성 ZERO 폴백) */
async function launchChromium() {
  const req = createRequire(import.meta.url);
  let pw = null;
  for (const cand of ['playwright', 'C:/Users/User/Desktop/vibecoding/classlearning/node_modules/playwright']) {
    try {
      pw = req(cand);
      break;
    } catch {}
  }
  if (!pw) throw new Error('playwright 모듈을 찾을 수 없습니다. NODE_PATH를 확인하세요.');
  const chromeExe = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1248/chrome-win64/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((p) => p && existsSync(p));
  return await pw.chromium.launch({ executablePath: chromeExe, headless: true });
}

/** 로컬 HTTP 파일/저장 브릿지 기동 */
function startBridgeServer(sourceRoots) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/processor.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PROCESSOR_HTML);
        return;
      }
      if (url.pathname === '/file') {
        const target = path.resolve(url.searchParams.get('path') || '');
        const allowed = sourceRoots.some((sr) => target.toLowerCase().startsWith(path.resolve(sr).toLowerCase()));
        if (!allowed || !existsSync(target)) {
          res.writeHead(404); res.end('not found'); return;
        }
        const ext = path.extname(target).toLowerCase();
        const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(target));
        return;
      }
      if (url.pathname === '/save' && req.method === 'POST') {
        const rel = url.searchParams.get('name');
        const dest = path.resolve(ASSETS_DIR, rel);
        if (!dest.startsWith(path.resolve(ASSETS_DIR))) { res.writeHead(403); res.end(); return; }
        mkdirSync(path.dirname(dest), { recursive: true });
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => { writeFileSync(dest, Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); });
        return;
      }
      if (url.pathname === '/save-abs' && req.method === 'POST') {
        const dest = path.resolve(url.searchParams.get('path') || '');
        if (!dest.toLowerCase().startsWith(path.resolve(CHECK_DIR).toLowerCase())) {
          res.writeHead(403); res.end(); return;
        }
        mkdirSync(path.dirname(dest), { recursive: true });
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => { writeFileSync(dest, Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); });
        return;
      }
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** 자동 합성 테스트용 순수 PNG/Canvas 생성 후 이중 매트 합격 게이트 검증 */
async function runSelfTest(page, port) {
  mkdirSync(CHECK_DIR, { recursive: true });
  const testResult = await page.evaluate(async () => {
    const W = 256, H = 256;
    const testCases = [
      { keyKind: 'magenta', bg: [255, 0, 255], draw: (ctx) => {
        ctx.fillStyle = '#5A4336'; ctx.beginPath(); ctx.arc(128, 128, 72, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#E8DFCE'; ctx.beginPath(); ctx.arc(128, 128, 62, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FF00FF'; ctx.fillRect(110, 110, 36, 36); // 내부 48px² 이상 구멍
      }},
      { keyKind: 'navy', bg: [11, 26, 46], draw: (ctx) => {
        ctx.fillStyle = '#5A4336'; ctx.beginPath(); ctx.arc(128, 128, 70, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(128, 128, 60, 0, Math.PI * 2); ctx.fill();
      }},
      { keyKind: 'green', bg: [0, 255, 0], draw: (ctx) => {
        ctx.fillStyle = '#5A4336'; ctx.fillRect(48, 64, 160, 128);
        ctx.fillStyle = '#EEB598'; ctx.fillRect(56, 72, 144, 112);
      }},
    ];
    const summary = [];
    for (const tc of testCases) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = `rgb(${tc.bg.join(',')})`;
      ctx.fillRect(0, 0, W, H);
      tc.draw(ctx);
      const data = ctx.getImageData(0, 0, W, H).data;
      const cut = cutoutBuffer(data, W, H, { keyKind: tc.keyKind, softTranslucent: false, choke: true });
      const gates = measureCutoutGates(cut.out, W, H, { keyKind: tc.keyKind, bgMask: cut.bgMask, distToBg: cut.distToBg, field: cut.field, softTranslucent: false });
      const webp = await encodeFloatRgbaWebP(cut.out, W, H, 0.95);
      summary.push({ keyKind: tc.keyKind, gates, webpBytes: webp.size, holeCleared: cut.out[(128 * W + 128) * 4 + 3] === 0 });
    }
    return summary;
  });
  console.log('Phase 1 이중 매트 & 닫힌 구멍 자체 검증 결과:');
  console.log(JSON.stringify(testResult, null, 2));
  for (const row of testResult) {
    if (!row.gates.passed) throw new Error(`Self-test gate failed for ${row.keyKind}: ${JSON.stringify(row)}`);
    if (row.keyKind === 'magenta' && !row.holeCleared) throw new Error('Magenta enclosed hole was NOT cleared!');
  }
  console.log('ALL PHASE 1 CUTOUT GATES PASSED ✅');
}

async function main() {
  const args = process.argv.slice(2);
  const selfTest = args.includes('--self-test');
  const jobsArgIdx = args.findIndex((a) => a === '--characters' || a === '--assets');
  const jobsFile = jobsArgIdx >= 0 ? args[jobsArgIdx + 1] : null;
  const jobsMode = jobsArgIdx >= 0 ? args[jobsArgIdx] : null;

  if (!selfTest && !jobsFile) {
    console.error('사용: node scripts/build-group-picker-assets.mjs --self-test | --characters <json> | --assets <json>');
    process.exit(1);
  }

  const artifactBrainDir = 'C:/Users/User/.gemini/antigravity/brain/09af5acc-28cc-4dbb-992c-ae5a10ba17d0';
  const { server, port } = await startBridgeServer([artifactBrainDir, ASSETS_DIR, root]);
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/processor.html`, { waitUntil: 'load' });

    if (selfTest) {
      await runSelfTest(page, port);
    }

    if (jobsFile) {
      const spec = JSON.parse(readFileSync(path.resolve(jobsFile), 'utf8'));
      const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : { characters: {}, assets: {} };
      const results = [];
      for (const job of spec.jobs) {
        const jobWithUrl = { ...job, url: `http://127.0.0.1:${port}/file?path=${encodeURIComponent(job.sourcePath)}` };
        const res = await page.evaluate((j) => window.__gpProcessJob(j), jobWithUrl);
        results.push(res);
        console.log(JSON.stringify(res));
        if (!res.gates?.passed && !job.allowGateWarn) {
          throw new Error(`Cutout gate failed on ${job.id}: ${JSON.stringify(res.gates)}`);
        }
        if (jobsMode === '--characters') {
          for (const ch of res.outputs) {
            manifest.characters[ch.charId] = {
              full: `characters/full/${ch.charId}.webp`,
              portrait: `characters/portraits/${ch.charId}.webp`,
              width: 512,
              height: 640,
              anchorX: ch.anchorX,
              anchorY: ch.anchorY,
              neckY: ch.neckY,
            };
          }
        } else if (jobsMode === '--assets') {
          manifest.assets[job.saveAs] = {
            width: res.width ?? res.w,
            height: res.height ?? res.h,
            offsetX: res.offsetX ?? 0,
            offsetY: res.offsetY ?? 0,
            sourceW: res.sourceW ?? (res.width ?? res.w),
            sourceH: res.sourceH ?? (res.height ?? res.h),
            apertureRect: res.apertureRect ?? null,
            radius: res.radius ?? null,
            hub: res.hub ?? null,
            bytes: res.bytes,
          };
        }
      }
      if (spec.checkSheet) {
        const items = spec.checkSheet.items.map((it) => ({
          ...it,
          url: `http://127.0.0.1:${port}/file?path=${encodeURIComponent(path.join(ASSETS_DIR, it.relPath))}`,
        }));
        await page.evaluate(
          ({ items, cols, cellW, cellH, savePath }) => window.__gpBuildCheckSheet(items, cols, cellW, cellH, savePath),
          { ...spec.checkSheet, items },
        );
      }
      mkdirSync(ASSETS_DIR, { recursive: true });
      writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
