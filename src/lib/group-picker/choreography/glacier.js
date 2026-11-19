/** Stage 2: '수채 북극 라군 빙하 갈라지기' 1600×900 실측 블루프린트 ·
 *  공선 꼭짓점 T-접합 제거 + 위치 변위장 D(P) 공유 곡선 BSP + 15px 안전 다각형 ·
 *  ρ≤0.60 적응형 밀도 · 12.0s 다리 선행 페이드 · 20.62초 3막 연출 엔진 (PRD §4.3). */
import { STORYBOOK_PAINT } from '../recolor.js';
import {
  REDUCED_DURATION_MS,
  clamp,
  mix,
  fluidEase,
  squashStretch,
  groundShadow,
} from './suspense.js';
import { randomIndex, shuffle } from '../solver.js';

export const GLACIER_W = 1600;
export const GLACIER_H = 900;
export const GLACIER_DURATION_MS = 20620;
export const BEVEL_DEPTH_PX = 24;
export const GLACIER_SAFE_INSET = 15; // maxWaveAmp(9) + padding(6)

/** 부호 있는 다각형 면적 * 2 (Y-down 화면 좌표 기준 > 0 이면 시계방향 외곽).
 * @param {{x:number,y:number}[]} pts */
export function signedPolygonArea2(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area;
}

/** 다각형 면적(Shoelace 공식). @param {{x:number,y:number}[]} pts */
export function polygonArea(pts) {
  return Math.abs(signedPolygonArea2(pts)) / 2;
}

/** 다각형 무게중심. @param {{x:number,y:number}[]} pts */
export function polygonCentroid(pts) {
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const len = Math.max(1, pts.length);
  return { x: sx / len, y: sy / len };
}

/** 다각형 와인딩을 일관된 방향(signedArea2 > 0)으로 정규화.
 * @param {{x:number,y:number}[]} pts */
function normalizeWinding(pts) {
  if (signedPolygonArea2(pts) < 0) return [...pts].reverse();
  return pts;
}

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b @param {(p:{x:number,y:number})=>number} fn */
function intersectCut(a, b, fn) {
  const va = fn(a);
  const vb = fn(b);
  const denom = va - vb;
  const t = Math.abs(denom) < 1e-9 ? 0.5 : va / denom;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/** @param {{x:number,y:number}[]} poly @param {boolean} horizontal @param {number} skew @param {number} minX @param {number} minY @param {number} cut @param {boolean} keepLeft */
function clipHalfPlane(poly, horizontal, skew, minX, minY, cut, keepLeft) {
  const val = (/** @type {{x:number,y:number}} */ p) =>
    (horizontal ? p.x + skew * (p.y - minY) : p.y + skew * (p.x - minX)) - cut;
  const inside = (/** @type {{x:number,y:number}} */ p) => (keepLeft ? val(p) <= 1e-7 : val(p) >= -1e-7);

  /** @type {{x:number,y:number}[]} */
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const inCur = inside(cur);
    const inNxt = inside(nxt);
    if (inCur && inNxt) {
      out.push(nxt);
    } else if (inCur && !inNxt) {
      out.push(intersectCut(cur, nxt, val));
    } else if (!inCur && inNxt) {
      out.push(intersectCut(cur, nxt, val));
      out.push(nxt);
    }
  }
  // 아주 가까운 중복 꼭짓점 제거 (동일 교점 보존)
  const deduped = [];
  for (const p of out) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-5) {
      deduped.push(p);
    }
  }
  if (deduped.length >= 2 && Math.hypot(deduped[0].x - deduped[deduped.length - 1].x, deduped[0].y - deduped[deduped.length - 1].y) <= 1e-5) {
    deduped.pop();
  }
  return deduped.length >= 3 ? normalizeWinding(deduped) : poly;
}

/** @param {{x:number,y:number}[]} poly @param {boolean} horizontal @param {number} skew @param {number} minX @param {number} minY @param {number} cut */
function extractCutSegment(poly, horizontal, skew, minX, minY, cut) {
  const val = (/** @type {{x:number,y:number}} */ p) =>
    (horizontal ? p.x + skew * (p.y - minY) : p.y + skew * (p.x - minX)) - cut;
  /** @type {{x:number,y:number}[]} */
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const va = val(a);
    const vb = val(b);
    if ((va <= 0 && vb >= 0) || (va >= 0 && vb <= 0)) {
      if (Math.abs(va - vb) > 1e-6) hits.push(intersectCut(a, b, val));
    }
  }
  if (hits.length < 2) return [];
  return [hits[0], hits[hits.length - 1]];
}

/** 볼록 다각형을 직선 분할해 정확히 비율 targetRatio / (1 - targetRatio) 로 양분.
 * @param {{x:number,y:number}[]} poly
 * @param {number} ratioA
 * @param {number} jitterSeed */
function splitPolygonBalanced(poly, ratioA, jitterSeed) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const horizontal = maxX - minX >= maxY - minY;
  const skew = ((jitterSeed % 15) - 7) * 0.015;
  const totalArea = polygonArea(poly);
  const targetA = totalArea * clamp(ratioA, 0.08, 0.92);
  let lo = horizontal ? minX - 40 : minY - 40;
  let hi = horizontal ? maxX + 40 : maxY + 40;

  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    const clipped = clipHalfPlane(poly, horizontal, skew, minX, minY, mid, true);
    const a = polygonArea(clipped);
    if (a < targetA) lo = mid;
    else hi = mid;
  }
  const cut = (lo + hi) / 2;
  const polyA = clipHalfPlane(poly, horizontal, skew, minX, minY, cut, true);
  const polyB = clipHalfPlane(poly, horizontal, skew, minX, minY, cut, false);
  const cutLine = extractCutSegment(poly, horizontal, skew, minX, minY, cut);
  return { polyA, polyB, cutLine };
}

/** 점 P에서 선분 AB까지의 최단 거리 및 투영 비율 t.
 * @param {{x:number,y:number}} p @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function projectOnSegment(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return { dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0, proj: a };
  const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  const tc = clamp(t);
  const proj = { x: a.x + vx * tc, y: a.y + vy * tc };
  return { dist: Math.hypot(p.x - proj.x, p.y - proj.y), t, proj };
}

/** 공선 꼭짓점 삽입(T-junction 제거): 인접 잎의 분할 꼭짓점이 내 변 위에 있으면 그대로 삽입.
 * @param {{x:number,y:number}[][]} leafPolys */
function insertCollinearVertices(leafPolys) {
  /** @type {{x:number,y:number}[]} */
  const allVerts = [];
  for (const poly of leafPolys) {
    for (const v of poly) {
      if (!allVerts.some((u) => Math.hypot(u.x - v.x, u.y - v.y) <= 1e-3)) {
        allVerts.push(v);
      }
    }
  }

  // 모든 다각형의 꼭짓점을 정규화된 정점 풀의 동일 좌표로 통일
  const snap = (/** @type {{x:number,y:number}} */ p) => {
    const match = allVerts.find((u) => Math.hypot(u.x - p.x, u.y - p.y) <= 1e-3);
    return match ? { x: match.x, y: match.y } : p;
  };

  return leafPolys.map((rawPoly) => {
    const poly = rawPoly.map(snap);
    /** @type {{x:number,y:number}[]} */
    const expanded = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      expanded.push(a);
      /** @type {{t:number, v:{x:number,y:number}}[]} */
      const mids = [];
      for (const q of allVerts) {
        if (Math.hypot(q.x - a.x, q.y - a.y) <= 1e-3 || Math.hypot(q.x - b.x, q.y - b.y) <= 1e-3) {
          continue;
        }
        const { dist, t } = projectOnSegment(q, a, b);
        if (dist < 1e-2 && t > 1e-5 && t < 1 - 1e-5) {
          mids.push({ t, v: { x: q.x, y: q.y } });
        }
      }
      mids.sort((u, v) => u.t - v.t);
      for (const m of mids) {
        expanded.push(m.v);
      }
    }
    return expanded;
  });
}

/** 위치만의 함수인 변위장 D(P) 생성기 (파장 ≥ 90px, 합 ΣA_i ≤ 9px).
 *  맞닿은 두 섬의 변이 정방향/역방향 무관하게 비트 단위로 정확히 일치합니다.
 * @param {number} seed */
function createDisplacementField(seed) {
  const s = Math.abs(seed | 0) + 17;
  const freqs = [
    { a: 3.8, k: 0.039, ang: ((s * 37) % 360) * (Math.PI / 180), p1: ((s * 1.1) % 6.28), p2: ((s * 2.3) % 6.28) },
    { a: 3.1, k: 0.053, ang: (((s * 83) + 60) % 360) * (Math.PI / 180), p1: ((s * 3.7) % 6.28), p2: ((s * 0.7) % 6.28) },
    { a: 2.1, k: 0.067, ang: (((s * 131) + 120) % 360) * (Math.PI / 180), p1: ((s * 5.1) % 6.28), p2: ((s * 4.3) % 6.28) },
  ];
  const wave = (/** @type {{x:number,y:number}} */ p, /** @type {number} */ ampScale, distToOuter = 999) => {
    // 외곽 경계는 부드럽게 0.35배로 눌러 안정적 실루엣 유지 (위치만의 함수!)
    const outerMix = distToOuter <= 0.5 ? 0.35 : 0.35 + 0.65 * clamp(distToOuter / 24);
    let dx = 0;
    let dy = 0;
    for (const f of freqs) {
      const ux = Math.cos(f.ang);
      const uy = Math.sin(f.ang);
      const vx = -uy;
      const vy = ux;
      const projU = p.x * ux + p.y * uy;
      const projV = p.x * vx + p.y * vy;
      dx += f.a * Math.sin(f.k * projU + f.p1);
      dy += f.a * Math.cos(f.k * projV + f.p2);
    }
    return {
      x: p.x + dx * ampScale * outerMix,
      y: p.y + dy * ampScale * outerMix,
    };
  };
  return wave;
}

/** 선분 (a,b) 를 canonical min(a,b)->max(a,b) 방향으로 n = ceil(len/6) 등분해 변위.
 * @param {{x:number,y:number}} a @param {{x:number,y:number}} b
 * @param {(p:{x:number,y:number}, ampScale:number, distOuter:number)=>{x:number,y:number}} fieldFn
 * @param {number} ampScale @param {{x:number,y:number}[]} rootHull */
export function displaceSharedEdge(a, b, fieldFn, ampScale, rootHull) {
  const reversed = a.x > b.x || (a.x === b.x && a.y > b.y);
  const p0 = reversed ? b : a;
  const p1 = reversed ? a : b;
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const n = Math.max(1, Math.ceil(len / 6));

  const minOuterDist = (/** @type {{x:number,y:number}} */ pt) => {
    let best = Infinity;
    for (let i = 0; i < rootHull.length; i++) {
      const d = projectOnSegment(pt, rootHull[i], rootHull[(i + 1) % rootHull.length]).dist;
      if (d < best) best = d;
    }
    return best;
  };

  /** @type {{x:number,y:number}[]} */
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const raw = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
    pts.push(fieldFn(raw, ampScale, minOuterDist(raw)));
  }
  if (reversed) pts.reverse();
  return pts;
}

/** 다각형 각 변을 d px 평행 안쪽 오프셋한 안전 볼록 다각형 생성 (C6: 캐릭터 footprint 보호).
 * @param {{x:number,y:number}[]} convexPoly @param {number} d */
export function buildParallelSafePolygon(convexPoly, d = GLACIER_SAFE_INSET) {
  const poly = normalizeWinding(convexPoly);
  const sign = signedPolygonArea2(poly) >= 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    // 외향 법선 n = sign*(dy, -dx)의 반대 (-n) 가 내향 법선
    const inX = (-sign * dy) / len;
    const inY = (sign * dx) / len;
    lines.push({
      p1: { x: a.x + inX * d, y: a.y + inY * d },
      p2: { x: b.x + inX * d, y: b.y + inY * d },
    });
  }
  if (lines.length < 3) return poly;

  // 순수 인접 직선 교차로 오프셋 다각형 구성 (실버 붕괴 시 중심 축소 폴백)
  /** @type {{x:number,y:number}[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[i];
    const l2 = lines[(i + 1) % lines.length];
    const a1 = l1.p2.y - l1.p1.y;
    const b1 = l1.p1.x - l1.p2.x;
    const c1 = a1 * l1.p1.x + b1 * l1.p1.y;
    const a2 = l2.p2.y - l2.p1.y;
    const b2 = l2.p1.x - l2.p2.x;
    const c2 = a2 * l2.p1.x + b2 * l2.p1.y;
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-6) continue;
    out.push({
      x: (b2 * c1 - b1 * c2) / det,
      y: (a1 * c2 - a2 * c1) / det,
    });
  }
  const origArea = polygonArea(poly);
  const safeArea = out.length >= 3 ? polygonArea(out) : 0;
  if (out.length >= 3 && safeArea > origArea * 0.25 && safeArea < origArea) {
    // 평행 오프셋 결과 모든 점이 원 다각형 내부인지 확인
    if (out.every((pt) => pointInPoly(pt, poly))) {
      return out;
    }
  }
  // 아주 뾰족한 모서리 등에서는 보수적으로 centroid 내향 0.84 축소 폴백
  const c = polygonCentroid(poly);
  return poly.map((p) => ({
    x: c.x + (p.x - c.x) * 0.84,
    y: c.y + (p.y - c.y) * 0.84,
  }));
}

/** 점이 다각형 내부에 있는지 판정(반시계/시계 무관). @param {{x:number,y:number}} pt @param {{x:number,y:number}[]} poly */
export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 점 P가 다각형 외부라면 가장 가까운 다각형 내부 점으로 투영.
 * @param {{x:number,y:number}} pt @param {{x:number,y:number}[]} poly @param {{x:number,y:number}} center */
function clampPointInsidePoly(pt, poly, center) {
  if (poly.length < 3 || pointInPoly(pt, poly)) return pt;
  let lo = 0;
  let hi = 1;
  for (let iter = 0; iter < 16; iter++) {
    const mid = (lo + hi) / 2;
    const cand = { x: mix(pt.x, center.x, mid), y: mix(pt.y, center.y, mid) };
    if (pointInPoly(cand, poly)) hi = mid;
    else lo = mid;
  }
  return { x: mix(pt.x, center.x, hi), y: mix(pt.y, center.y, hi) };
}

/** 캐릭터 footprint 4개 모서리가 모두 safePoly 안에 들어가도록 중심 좌표 투영.
 * @param {{x:number,y:number}} pos @param {number} halfW @param {number} upH @param {number} downH
 * @param {{x:number,y:number}[]} safePoly @param {{x:number,y:number}} center */
export function clampFootprintInsidePoly(pos, halfW, upH, downH, safePoly, center) {
  if (safePoly.length < 3) return pos;
  const allCornersIn = (/** @type {{x:number,y:number}} */ p) =>
    pointInPoly({ x: p.x - halfW, y: p.y - upH }, safePoly) &&
    pointInPoly({ x: p.x + halfW, y: p.y - upH }, safePoly) &&
    pointInPoly({ x: p.x - halfW, y: p.y + downH }, safePoly) &&
    pointInPoly({ x: p.x + halfW, y: p.y + downH }, safePoly);

  if (allCornersIn(pos)) return pos;
  let lo = 0;
  let hi = 1;
  for (let iter = 0; iter < 18; iter++) {
    const mid = (lo + hi) / 2;
    const cand = { x: mix(pos.x, center.x, mid), y: mix(pos.y, center.y, mid) };
    if (allCornersIn(cand)) hi = mid;
    else lo = mid;
  }
  return { x: mix(pos.x, center.x, hi), y: mix(pos.y, center.y, hi) };
}

/** 다각형에서 남향(외향 법선 n.y > 0) 2.5D 절벽 면 추출.
 * @param {{x:number,y:number}[]} pts */
export function extractSouthCliffEdges(pts) {
  const s = signedPolygonArea2(pts) >= 0 ? 1 : -1;
  /** @type {{x1:number,y1:number,x2:number,y2:number}[]} */
  const cliffs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ny = s * -dx; // 외향 법선 n = s * (dy, -dx)
    if (ny > 0.35 * Math.hypot(dx, dy)) {
      cliffs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return cliffs;
}

/** SVG path 문자열 변환. @param {{x:number,y:number}[]} pts */
export function polyToPathD(pts) {
  if (!pts.length) return '';
  return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}` +
    pts.slice(1).map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('') +
    'Z';
}

/** Spatial Hash 이름표 스태킹 + safePoly 경계 클램핑 + 상단 깃발 여백·장애물 보호.
 * @param {{id:string, x:number, y:number}[]} items
 * @param {number} minW @param {number} minH
 * @param {{x:number,y:number}[]} safePoly @param {{x:number,y:number}} fallbackCenter
 * @param {number} [halfW] @param {number} [upH] @param {number} [downH] @param {number} [minFootY]
 * @param {{x:number, y:number, rx:number, ry:number, preferY?:boolean, preferDir?:number} | null} [avoidPt] */
export function resolveLabelOverlaps(
  items,
  minW = 104,
  minH = 44,
  safePoly = [],
  fallbackCenter = { x: GLACIER_W / 2, y: GLACIER_H / 2 },
  halfW = 0,
  upH = 0,
  downH = 0,
  minFootY = -Infinity,
  avoidPt = null,
) {
  const placed = items.map((it) => ({ ...it }));
  const floorFootY = Number.isFinite(minFootY) ? Math.min(minFootY, fallbackCenter.y + 20) : -Infinity;
  for (let pass = 0; pass < 26; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = minW - Math.abs(dx);
        const oy = minH - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (ox < oy) {
            const push = (ox / 2 + 1) * (dx >= 0 ? 1 : -1);
            a.x -= push;
            b.x += push;
          } else {
            const push = (oy / 2 + 1) * (dy >= 0 ? 1 : -1);
            a.y -= push;
            b.y += push;
          }
        }
      }
      if (avoidPt) {
        const adx = placed[i].x - avoidPt.x;
        const ady = placed[i].y - avoidPt.y;
        const aox = avoidPt.rx - Math.abs(adx);
        const aoy = avoidPt.ry - Math.abs(ady);
        if (aox > 0 && aoy > 0) {
          moved = true;
          if (!avoidPt.preferY && aox < aoy) {
            placed[i].x += (aox + 1) * (adx >= 0 ? 1 : -1);
          } else if (avoidPt.preferY) {
            // 페데스탈 위/아래 여유 공간으로 자연 분배 (중심 ±20px 이내만 preferDir 사용)
            const dir = Math.abs(ady) <= 20 && avoidPt.preferDir != null ? avoidPt.preferDir : (ady >= 0 ? 1 : -1);
            placed[i].y = avoidPt.y + dir * (avoidPt.ry + 2);
          } else {
            placed[i].y += (aoy + 1) * (ady >= 0 ? 1 : -1);
          }
        }
      }
      if (placed[i].y < floorFootY) {
        placed[i].y = floorFootY;
      }
      if (safePoly.length >= 3) {
        placed[i] = {
          id: placed[i].id,
          ...(halfW > 0 || upH > 0 || downH > 0
            ? clampFootprintInsidePoly(placed[i], halfW, upH, downH, safePoly, fallbackCenter)
            : clampPointInsidePoly(placed[i], safePoly, fallbackCenter)),
        };
      }
    }
    if (!moved) break;
  }
  return placed;
}

/** 정확히 G개의 정원 비례 공유-곡선 맞물림 얼음섬 + 안전 다각형 + 공유변 이웃 그래프 생성.
 * @param {number[]} capacities @param {number} [width] @param {number} [height] @param {number} [seed] @param {number[]} [weights] */
export function partitionGlacierBSP(capacities, width = GLACIER_W, height = GLACIER_H, seed = 101, weights = capacities) {
  const safeWeights = Array.isArray(weights) && weights.length === capacities.length
    ? weights.map((w) => Math.max(0.1, Number(w) || 1))
    : capacities;
  const padX = Math.round(width * 0.068);
  const padTop = Math.max(92, Math.round(height * 0.102));
  const padBottom = Math.round(height * 0.124);
  const rx = padX;
  const rW = width - padX;
  const ry = padTop;
  const rH = height - padBottom;
  const corner = Math.round(Math.min(width, height) * 0.068);

  // 시계방향 외곽 (Y-down signedArea > 0) 육각 빙하 루트
  const rawRoot = normalizeWinding([
    { x: rx + corner, y: ry },
    { x: rW - corner * 1.1, y: ry + 8 },
    { x: rW, y: ry + corner * 1.15 },
    { x: rW - corner * 0.75, y: rH },
    { x: rx + corner * 0.85, y: rH - 8 },
    { x: rx, y: ry + corner * 1.3 },
  ]);

  /** @type {{indices:number[], poly:{x:number,y:number}[]}[]} */
  const leaves = [];
  /** @type {[{x:number,y:number},{x:number,y:number}][]} */
  const rawCracks = [];

  /** @param {number[]} groupIndices @param {{x:number,y:number}[]} poly @param {number} depth */
  function recurse(groupIndices, poly, depth) {
    if (groupIndices.length === 1) {
      leaves.push({ indices: groupIndices, poly });
      return;
    }
    const half = Math.ceil(groupIndices.length / 2);
    const leftIds = groupIndices.slice(0, half);
    const rightIds = groupIndices.slice(half);
    const sumL = leftIds.reduce((s, gi) => s + safeWeights[gi], 0);
    const sumR = rightIds.reduce((s, gi) => s + safeWeights[gi], 0);
    const ratioA = sumL / Math.max(1e-4, sumL + sumR);
    const { polyA, polyB, cutLine } = splitPolygonBalanced(poly, ratioA, depth * 7 + leftIds[0] + (seed % 11));
    if (cutLine.length === 2) rawCracks.push(/** @type {any} */ (cutLine));
    recurse(leftIds, polyA, depth + 1);
    recurse(rightIds, polyB, depth + 2);
  }

  recurse(capacities.map((_, i) => i), rawRoot, 1);
  leaves.sort((a, b) => a.indices[0] - b.indices[0]);

  // 공선 꼭짓점 삽입으로 T-접합 제거 -> 맞닿은 변의 정점 쌍이 정확히 1:1 대응
  const alignedPolys = insertCollinearVertices(leaves.map((l) => l.poly));

  // 공유변 이웃 그래프 추출 (경계 페이크 점프 & 균열 라인 추출용)
  /** @type {Record<number, {neighbor:number, mid:{x:number,y:number}, a:{x:number,y:number}, b:{x:number,y:number}}[]>} */
  const sharedNeighbors = {};
  for (let i = 0; i < alignedPolys.length; i++) sharedNeighbors[i] = [];

  const samePt = (/** @type {{x:number,y:number}} */ u, /** @type {{x:number,y:number}} */ v) =>
    Math.hypot(u.x - v.x, u.y - v.y) <= 1e-2;

  for (let i = 0; i < alignedPolys.length; i++) {
    const pi = alignedPolys[i];
    for (let j = i + 1; j < alignedPolys.length; j++) {
      const pj = alignedPolys[j];
      for (let ei = 0; ei < pi.length; ei++) {
        const a1 = pi[ei];
        const b1 = pi[(ei + 1) % pi.length];
        for (let ej = 0; ej < pj.length; ej++) {
          const a2 = pj[ej];
          const b2 = pj[(ej + 1) % pj.length];
          if ((samePt(a1, b2) && samePt(b1, a2)) || (samePt(a1, a2) && samePt(b1, b2))) {
            const mid = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
            sharedNeighbors[i].push({ neighbor: j, mid, a: a1, b: b1 });
            sharedNeighbors[j].push({ neighbor: i, mid, a: b1, b: a1 });
          }
        }
      }
    }
  }

  // 변위장 D(P) + ±3% 면적 오차 가드(최대 3회 0.8x 진폭 감쇠)
  const fieldFn = createDisplacementField(seed);
  const totalCap = Math.max(1e-4, safeWeights.reduce((a, b) => a + b, 0));
  let ampScale = 1.0;
  /** @type {{x:number,y:number}[][]} */
  let curvedPolys = alignedPolys;

  for (let attempt = 0; attempt < 4; attempt++) {
    curvedPolys = alignedPolys.map((poly) => {
      /** @type {{x:number,y:number}[]} */
      const curved = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const seg = displaceSharedEdge(a, b, fieldFn, ampScale, rawRoot);
        for (let k = 0; k < seg.length - 1; k++) {
          curved.push(seg[k]);
        }
      }
      return curved;
    });
    const totalCurvedArea = curvedPolys.reduce((s, p) => s + polygonArea(p), 0);
    const maxErr = curvedPolys.reduce((mx, p, idx) => {
      const err = Math.abs(polygonArea(p) / Math.max(1, totalCurvedArea) - safeWeights[idx] / totalCap);
      return Math.max(mx, err);
    }, 0);
    if (maxErr <= 0.03) break;
    ampScale *= 0.8;
  }

  // Act 1 단일 통합 빙하 path 생성 (루트 외곽 변에 동일한 D(P) 적용 -> crackProgress===0->0.01 팝/이음새 0px)
  const rootWithAligned = insertCollinearVertices([rawRoot, ...alignedPolys])[0];
  /** @type {{x:number,y:number}[]} */
  const curvedRoot = [];
  for (let i = 0; i < rootWithAligned.length; i++) {
    const a = rootWithAligned[i];
    const b = rootWithAligned[(i + 1) % rootWithAligned.length];
    const seg = displaceSharedEdge(a, b, fieldFn, ampScale, rawRoot);
    for (let k = 0; k < seg.length - 1; k++) {
      curvedRoot.push(seg[k]);
    }
  }

  // 균열 패스 역시 동일 변위장으로 곡선화 (공유변 기반)
  /** @type {{x:number,y:number}[][]} */
  const cracks = [];
  const seenEdgePairs = new Set();
  for (let i = 0; i < alignedPolys.length; i++) {
    for (const edge of sharedNeighbors[i]) {
      const key = `${Math.min(i, edge.neighbor)}-${Math.max(i, edge.neighbor)}-${Math.round(edge.mid.x)}-${Math.round(edge.mid.y)}`;
      if (seenEdgePairs.has(key)) continue;
      seenEdgePairs.add(key);
      cracks.push(displaceSharedEdge(edge.a, edge.b, fieldFn, ampScale, rawRoot));
    }
  }

  const sheetCenter = { x: width / 2, y: (padTop + height - padBottom) / 2 };

  const floes = curvedPolys.map((topPoints, gi) => {
    const straightPoly = alignedPolys[gi];
    const safePoly = buildParallelSafePolygon(straightPoly, GLACIER_SAFE_INSET);
    const safeCentroid = polygonCentroid(safePoly);
    const c = polygonCentroid(topPoints);

    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of topPoints) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const dx = c.x - sheetCenter.x;
    const dy = c.y - sheetCenter.y;
    const dist = Math.hypot(dx, dy) || 1;
    const driftMag = Math.min(72, Math.max(36, 62 - capacities.length * 1.8));
    const driftX = Number(((dx / dist) * driftMag).toFixed(2));
    const driftY = Number(((dy / dist) * driftMag * 0.82).toFixed(2));

    // 상단행 섬은 윗 절벽에 깃발을 살짝 걸쳐 +70px 회수, 하단행 섬은 위쪽 섬 이름표와 충돌 0% 유지
    const topPad = minY <= 145
      ? Math.min(46, Math.max(34, (maxY - minY) * 0.11))
      : Math.min(62, Math.max(52, (maxY - minY) * 0.16));
    const badgeRaw = { x: c.x, y: Math.min(c.y - 38, minY + topPad) };
    const badge = clampPointInsidePoly(badgeRaw, safePoly, safeCentroid);

    return {
      groupIndex: gi,
      straightPoly,
      safePoly,
      safeArea: Number(polygonArea(safePoly).toFixed(1)),
      topPoints,
      pathD: polyToPathD(topPoints),
      cliffEdges: extractSouthCliffEdges(topPoints),
      sideDepth: BEVEL_DEPTH_PX,
      centroid: c,
      safeCentroid,
      badge,
      minY,
      maxY,
      area: Number(polygonArea(topPoints).toFixed(1)),
      driftX,
      driftY,
    };
  });

  return {
    floes,
    cracks,
    sharedNeighbors,
    sheetCenter,
    rootPoly: curvedRoot,
    rootPathD: polyToPathD(curvedRoot),
    rootCliffEdges: extractSouthCliffEdges(curvedRoot),
    ampScale,
  };
}

/** 다각형 위 점에서 목표점에 가장 가까운 경계점 탐색.
 * @param {{x:number,y:number}[]} poly @param {{x:number,y:number}} target */
export function nearestPointOnPolyEdge(poly, target) {
  let bestDist = Infinity;
  let bestPt = poly[0] ?? target;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const { dist, proj } = projectOnSegment(target, a, b);
    if (dist < bestDist) {
      bestDist = dist;
      bestPt = proj;
    }
  }
  return bestPt;
}

/** Stage 2: 북극 분열 전체 연출 계획 생성 (~20.62s 고정 예산 · 2-Pass P50 균일 학생 크기).
 * @param {object} params
 * @param {{index:number, name:string, color:string, symbol:string, studentIds:string[]}[]} params.groups
 * @param {string[]} params.allStudentIds
 * @param {boolean} [params.reduced]
 * @param {()=>number} [params.word] */
export function createGlacierPlan({ groups, allStudentIds, reduced = false, word }) {
  const capacities = groups.map((g) => g.studentIds.length);
  const runSeed = Math.floor((word ? word() : 0.42) * 10000);
  const totalN = allStudentIds.length;
  const baseHeight = totalN <= 16 ? 148 : totalN <= 30 ? 124 : 100;

  /** 각 섬 안전 다각형 내부에서 가장 큰 학생 신장을 허용하는 최적 cols 탐색.
   * @param {any} floe @param {number} count */
  function evaluateFloeFit(floe, count) {
    let minFx = Infinity;
    let maxFx = -Infinity;
    for (const p of floe.safePoly) {
      if (p.x < minFx) minFx = p.x;
      if (p.x > maxFx) maxFx = p.x;
    }
    const safeW = Math.max(90, maxFx - minFx);
    const safeH = Math.max(90, floe.maxY - floe.minY - GLACIER_SAFE_INSET * 2);
    const c = floe.safeCentroid;
    let colMaxY = floe.maxY - GLACIER_SAFE_INSET;
    for (let ei = 0; ei < floe.safePoly.length; ei++) {
      const p1 = floe.safePoly[ei];
      const p2 = floe.safePoly[(ei + 1) % floe.safePoly.length];
      if ((p1.x <= c.x && p2.x >= c.x) || (p2.x <= c.x && p1.x >= c.x)) {
        const denom = p2.x - p1.x;
        const t = Math.abs(denom) < 1e-6 ? 0.5 : (c.x - p1.x) / denom;
        const iy = p1.y + (p2.y - p1.y) * t;
        if (iy > c.y) colMaxY = Math.min(colMaxY, iy);
      }
    }
    const hasLowerNeighbor = floe.maxY < GLACIER_H - 150;
    const downH = safeH >= 240 ? (hasLowerNeighbor ? 34 : 26) : 18;
    const badgeClearY = floe.badge.y + 28;
    const availSpan = Math.max(76, colMaxY - downH - badgeClearY);

    let bestFit = 64;
    let bestCols = Math.max(1, Math.min(count, 3));
    const maxCols = Math.max(1, count);

    for (let cols = 1; cols <= maxCols; cols++) {
      const rows = Math.ceil(count / cols);
      // 1) 밀도 ρ <= 0.62 한계 신장
      const kRho = Math.sqrt((0.62 * floe.safeArea) / Math.max(1, count * (0.62 * 1.15 + 24 / baseHeight) * baseHeight));
      let cand = Math.min(baseHeight, Math.round(Math.sqrt((0.62 * floe.safeArea) / Math.max(1, count * 0.92))));
      // 정확한 footprint 기반 rho 상한 보정
      const fpAtBase = (baseHeight * 0.62 + 22) * (baseHeight + 26);
      const rhoBase = (count * fpAtBase) / Math.max(1, floe.safeArea);
      cand = rhoBase > 0.62
        ? Math.min(baseHeight, Math.round(baseHeight * Math.sqrt(0.62 / rhoBase)))
        : baseHeight;
      void kRho;

      // 2) 행 높이 제한 (이름표 + 2행 머리 비겹침)
      const rowLimit = Math.floor((availSpan - (rows - 1) * 52) / Math.max(0.96, rows * 0.96));
      cand = Math.min(cand, rowLimit);

      // 3) 열 폭 제한: cols * max(labelEst, fw * 1.62) <= 0.90 * safeW
      const estLabelW = totalN >= 20 ? 94 : 104;
      if (cols > 1) {
        const perColMax = (0.90 * safeW) / cols;
        if (perColMax < estLabelW) continue;
        const maxHByWidth = Math.floor(perColMax / (0.62 * 1.62));
        cand = Math.min(cand, Math.max(64, maxHByWidth));
      }

      if (cand > bestFit || (cand === bestFit && rows < Math.ceil(count / bestCols))) {
        bestFit = cand;
        bestCols = cols;
      }
    }

    return {
      cols: bestCols,
      rows: Math.ceil(count / Math.max(1, bestCols)),
      fitPx: Math.max(64, Math.min(baseHeight, bestFit)),
      safeW,
      safeH,
      colMaxY,
      downH,
      availSpan,
      badgeClearY,
    };
  }

  // Pass 1: 고정 비용(+1.2) 반영 BSP 분할 및 섬별 최대 수용 신장 측정
  const weights1 = capacities.map((c) => c + 1.2);
  let bsp = partitionGlacierBSP(capacities, GLACIER_W, GLACIER_H, runSeed, weights1);
  let fits = groups.map((grp, idx) => evaluateFloeFit(bsp.floes[idx], grp.studentIds.length));

  // Pass 2: 중앙값 P50 대비 90% 미만 협소 섬만 부드러운 면적 가중치 보상 (실제 minFit 개선 시에만 채택)
  const sortedFits = fits.map((f) => f.fitPx).sort((a, b) => a - b);
  const p50 = sortedFits[Math.floor(sortedFits.length / 2)] ?? baseHeight;
  const minFitPass1 = Math.min(...fits.map((f) => f.fitPx));
  if (fits.some((f) => f.fitPx < 0.90 * p50)) {
    const weights2 = fits.map((f, i) => {
      if (f.fitPx >= 0.90 * p50) return weights1[i];
      const boost = clamp((p50 / Math.max(36, f.fitPx)) ** 1.35, 1, 1.65);
      return Number((weights1[i] * boost).toFixed(3));
    });
    const bsp2 = partitionGlacierBSP(capacities, GLACIER_W, GLACIER_H, runSeed, weights2);
    const fits2 = groups.map((grp, idx) => evaluateFloeFit(bsp2.floes[idx], grp.studentIds.length));
    const minFitPass2 = Math.min(...fits2.map((f) => f.fitPx));
    if (minFitPass2 >= minFitPass1) {
      bsp = bsp2;
      fits = fits2;
    }
  }

  const {
    floes,
    cracks,
    sharedNeighbors,
    sheetCenter,
    rootPoly,
    rootPathD,
    rootCliffEdges,
  } = bsp;

  // 전역 통일 신장: 가장 좁은 정상 섬을 기준으로 ±8% 미세 오차 내에서 모둠 간 키 균일화!
  const minFit = Math.min(...fits.map((f) => f.fitPx));
  const globalFloorH = clamp(minFit, 70, baseHeight);

  /** @type {Record<string, {x:number, y:number, groupIndex:number, heightPx:number, showLabel:boolean, labelAlign:'below'|'above'}>} */
  const targetSlots = {};
  /** @type {Record<number, {studentHeight:number, rho:number, labelMode:string}>} */
  const floeMetrics = {};

  groups.forEach((grp, gPos) => {
    const floe = floes[gPos];
    const count = grp.studentIds.length;
    const fit = fits[gPos];
    const { cols, rows, safeW, colMaxY, downH, availSpan, badgeClearY } = fit;

    const hPx = Math.round(
      clamp(fit.fitPx, Math.max(64, globalFloorH * 0.94), Math.min(fit.fitPx, globalFloorH * 1.08)),
    );
    const fw = hPx * 0.62;
    const halfW = fw * 0.48;
    const upH = hPx * 0.92;
    const rho = (count * ((fw + 16) * (hPx + 22))) / Math.max(1, floe.safeArea);

    const stepX = Math.max(92, Math.min(164, Math.max(Math.round(fw * 1.68), Math.floor((safeW * 0.86) / Math.max(1, cols)))));
    const neededStepY = Math.round(hPx * 0.96 + 52);
    const stepY = Math.max(90, Math.min(162, neededStepY));
    const minH = rows > 1
      ? Math.min(neededStepY, Math.max(86, Math.floor((availSpan - hPx * 0.96) / (rows - 1))))
      : neededStepY;

    const labelMode = rho <= 0.62 && count <= 14 ? 'all' : 'summary-2';

    floeMetrics[grp.index] = {
      studentHeight: hPx,
      rho: Number(rho.toFixed(3)),
      labelMode,
    };

    const c = floe.safeCentroid;
    const minFootBelowBadge = badgeClearY + upH;
    const clampFallbackCenter = {
      x: c.x,
      y: Math.max(c.y, Math.min(colMaxY - downH, minFootBelowBadge + 18)),
    };
    const bodyMidY = Math.max(c.y + hPx * 0.35, minFootBelowBadge + ((rows - 1) * stepY) * 0.5);
    const pedY = sheetCenter.y + 8;
    const preferDir = colMaxY - downH >= pedY + 96 ? 1 : -1;
    const avoidPedestal = floe.safeArea >= 42000;

    const rawItems = grp.studentIds.map((sid, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const ix = c.x + (col - (cols - 1) / 2) * stepX;
      let iy = Math.max(minFootBelowBadge, bodyMidY + (row - (rows - 1) / 2) * stepY);
      if (avoidPedestal && Math.abs(ix - sheetCenter.x) < 174 && Math.abs(iy - pedY) < 98) {
        const upCand = pedY - 100;
        const dnCand = pedY + 100;
        iy = upCand >= minFootBelowBadge + 8 && iy <= pedY + 12
          ? upCand
          : dnCand <= colMaxY - downH
            ? dnCand
            : preferDir > 0
              ? dnCand
              : Math.max(minFootBelowBadge, upCand);
      }
      return {
        id: sid,
        x: ix,
        y: iy,
      };
    });

    const safePlaced = resolveLabelOverlaps(
      rawItems,
      Math.max(132, fw * 1.72),
      minH,
      floe.safePoly,
      clampFallbackCenter,
      halfW,
      upH,
      downH,
      minFootBelowBadge,
      avoidPedestal ? { x: sheetCenter.x, y: pedY, rx: 174, ry: 98, preferY: true, preferDir } : null,
    );

    safePlaced.forEach((item, idx) => {
      const isLast2 = idx >= safePlaced.length - 2;
      const showLabel = labelMode === 'all' || isLast2;
      targetSlots[item.id] = {
        x: item.x,
        y: item.y,
        groupIndex: grp.index,
        heightPx: hPx,
        showLabel,
        labelAlign: 'below',
      };
    });
  });

  // 1막: 전체 통합 빙하 위 대기 배치 (중앙 받침 비움 + 결정론적 격자 비겹침)
  const lastGroup = groups[groups.length - 1];
  const climaxSid = lastGroup.studentIds[lastGroup.studentIds.length - 1];
  const initialOrder = shuffle(allStudentIds.filter((id) => id !== climaxSid), word);
  const pedY = sheetCenter.y + 8;
  /** @type {{x:number, y:number}[]} */
  const gridSlots = [];
  if (totalN <= 15) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 1 && c === 2) continue;
        gridSlots.push({ x: sheetCenter.x + (c - 2) * 220, y: pedY + (r - 1) * 156 });
      }
    }
  } else if (totalN <= 34) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 2 && c === 3) continue;
        gridSlots.push({ x: sheetCenter.x + (c - 3) * 186, y: pedY + (r - 2) * 122 });
      }
    }
  } else {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 9; c++) {
        if ((r === 2 || r === 3) && c === 4) continue;
        gridSlots.push({ x: sheetCenter.x + (c - 4) * 154, y: 190 + r * 106 });
      }
    }
  }

  /** @type {Record<string, {x:number, y:number}>} */
  const initialSpots = {
    [climaxSid]: { x: sheetCenter.x, y: pedY },
  };
  if (initialOrder.length <= gridSlots.length) {
    initialOrder.forEach((sid, idx) => {
      const slotIdx = Math.min(
        gridSlots.length - 1,
        Math.floor((idx * gridSlots.length) / Math.max(1, initialOrder.length)),
      );
      const slot = gridSlots[slotIdx];
      initialSpots[sid] = { x: slot.x, y: slot.y };
    });
  } else {
    const safeRoot = buildParallelSafePolygon(
      [
        { x: 78, y: 112 },
        { x: GLACIER_W - 78, y: 112 },
        { x: GLACIER_W - 78, y: GLACIER_H - 122 },
        { x: 78, y: GLACIER_H - 122 },
      ],
      18,
    );
    const initCols = 10;
    const initRows = Math.ceil(initialOrder.length / initCols);
    const rawInit = initialOrder.map((sid, i) => ({
      id: sid,
      x: sheetCenter.x + ((i % initCols) - (initCols - 1) / 2) * 136,
      y: 184 + Math.floor(i / initCols) * 108 + (initRows > 6 ? 0 : 12),
    }));
    const resolvedInit = resolveLabelOverlaps(
      rawInit,
      142,
      86,
      safeRoot,
      sheetCenter,
      36,
      baseHeight * 0.9,
      14,
      -Infinity,
      { x: sheetCenter.x, y: pedY, rx: 146, ry: 82 },
    );
    for (const item of resolvedInit) {
      initialSpots[item.id] = { x: item.x, y: item.y };
    }
  }

  // 2막 경계 더블 점프 페이크 주인공: 실제 공유변 이웃이 있는 모둠 중 선택
  let fakeSid = groups[0].studentIds[word ? randomIndex(groups[0].studentIds.length, word) : 0];
  let fakeNeighborEdge = null;
  for (let gPos = 0; gPos < groups.length; gPos++) {
    const edges = sharedNeighbors[gPos] ?? [];
    if (edges.length === 0) continue;
    const candidate = groups[gPos].studentIds.find((id) => id !== climaxSid);
    if (candidate) {
      fakeSid = candidate;
      fakeNeighborEdge = edges[0];
      break;
    }
  }
  const climaxGroupPos = groups.length - 1;

  const duration = reduced ? REDUCED_DURATION_MS : GLACIER_DURATION_MS;
  /** @type {{studentId:string, groupIndex:number, atMs:number, isClimax?:boolean}[]} */
  const ticketEvents = [];

  if (reduced) {
    let cur = 150;
    const step = Math.max(12, Math.floor((duration - 280) / Math.max(1, allStudentIds.length)));
    groups.forEach((grp) => {
      grp.studentIds.forEach((sid) => {
        ticketEvents.push({ studentId: sid, groupIndex: grp.index, atMs: cur });
        cur += step;
      });
    });
  } else {
    /** @type {{sid:string, groupIndex:number}[]} */
    const nonClimax = [];
    groups.forEach((grp) => {
      grp.studentIds.forEach((sid) => {
        if (sid !== climaxSid) nonClimax.push({ sid, groupIndex: grp.index });
      });
    });
    const waveStart = 12800;
    const waveSpan = 5200;
    nonClimax.forEach((item, i) => {
      const atMs = Math.round(waveStart + (i / Math.max(1, nonClimax.length)) * waveSpan);
      ticketEvents.push({ studentId: item.sid, groupIndex: item.groupIndex, atMs });
    });
    ticketEvents.push({
      studentId: climaxSid,
      groupIndex: lastGroup.index,
      atMs: 19650,
      isClimax: true,
    });
    ticketEvents.sort((a, b) => a.atMs - b.atMs);
  }

  return {
    mode: /** @type {const} */ ('glacier'),
    reduced,
    totalDurationMs: duration,
    groups: groups.map((g, i) => ({
      ...g,
      hex: STORYBOOK_PAINT[g.color]?.hex ?? '#8FCEB8',
      floe: floes[i],
      metrics: floeMetrics[g.index],
    })),
    cracks,
    sharedNeighbors,
    sheetCenter,
    rootPoly,
    rootPathD,
    rootCliffEdges,
    initialSpots,
    targetSlots,
    climaxSid,
    climaxGroupPos,
    fakeSid,
    fakeNeighborEdge,
    ticketEvents,
  };
}

/** 주어진 elapsedMs에서의 빙하 무대 포즈 산출(1600×900 코어 기준).
 * @param {ReturnType<typeof createGlacierPlan>} plan
 * @param {number} elapsedMs */
export function glacierPoseAt(plan, elapsedMs) {
  const t = clamp(elapsedMs, 0, plan.totalDurationMs);
  const committedIds = new Set(
    plan.ticketEvents.filter((ev) => ev.atMs <= t).map((ev) => ev.studentId),
  );

  if (plan.reduced) {
    const floes = plan.groups.map((g) => ({
      groupIndex: g.index,
      name: g.name,
      color: g.color,
      hex: g.hex,
      symbol: g.symbol,
      topPoints: g.floe.topPoints,
      safePoly: g.floe.safePoly,
      pathD: g.floe.pathD,
      cliffEdges: g.floe.cliffEdges,
      offsetX: g.floe.driftX,
      offsetY: g.floe.driftY,
      centroid: g.floe.centroid,
      badge: g.floe.badge,
      maxY: g.floe.maxY,
      area: g.floe.area,
      memberCount: g.studentIds.length,
      metrics: g.metrics,
    }));
    const sortedFloes = [...floes].sort((a, b) => (a.maxY + a.offsetY) - (b.maxY + b.offsetY));

    return {
      act: 3,
      useUnifiedRoot: false,
      rootPathD: plan.rootPathD,
      rootCliffEdges: plan.rootCliffEdges,
      crackProgress: 1,
      crackLineProgress: plan.cracks.map(() => 1),
      driftProgress: 1,
      bridgeAlpha: 0,
      bridge: null,
      pedestal: { x: plan.sheetCenter.x, y: plan.sheetCenter.y, r: 34 },
      tremorX: 0,
      heroLandFlash: 0,
      heroCallout: null,
      camera: { x: 0, y: 0, scale: 1, originX: 800, originY: 450 },
      floes: floes.map((f) => ({ ...f, bobY: 0, flagScale: 1 })),
      sortedFloes: sortedFloes.map((f) => ({ ...f, bobY: 0, flagScale: 1 })),
      studentPoses: Object.entries(plan.targetSlots).map(([sid, pos]) => {
        const grp = plan.groups.find((g) => g.index === pos.groupIndex);
        const floe = grp?.floe ?? { driftX: 0, driftY: 0 };
        const gy = pos.y + floe.driftY;
        return {
          studentId: sid,
          groupIndex: pos.groupIndex,
          x: pos.x + floe.driftX,
          y: gy,
          groundY: gy,
          heightPx: pos.heightPx,
          showLabel: pos.showLabel,
          labelAlign: pos.labelAlign,
          scaleX: 1,
          scaleY: 1,
          walkLeanDeg: 0,
          shadow: groundShadow(0),
          committed: committedIds.has(sid),
          isJumping: false,
        };
      }),
      committedIds,
      activeSpeech: '북극 분열 완료',
      progressRatio: clamp(t / plan.totalDurationMs),
    };
  }

  let act = 1;
  if (t >= 5200 && t < 14600) act = 2;
  else if (t >= 14600) act = 3;

  const crackProgress = t < 5200 ? 0 : t < 13800 ? clamp((t - 5200) / 8600) : 1;
  const useUnifiedRoot = crackProgress === 0;
  const driftU = t < 12600 ? 0 : clamp((t - 12600) / 6800);
  const driftProgress = fluidEase(driftU, 3.6);
  const tremorX = t >= 4900 && t <= 13500 ? Math.sin(t * 0.055) * (t < 8500 ? 1.8 : 3.2) : 0;

  // PRD §4.3 C7: Act 3 표류(12.6s) 시작 직전 12.0s -> 12.6s 다리 알파 페이드인 완성! 착지(19.45s) 뒤 18.8s->19.65s 용해
  const bridgeAlpha =
    t < 12000 ? 0 :
    t < 12600 ? clamp((t - 12000) / 600) :
    t <= 18800 ? 1 :
    clamp(1 - (t - 18800) / 850);

  const floeOffsets = plan.groups.map((g) => ({
    offsetX: Number((g.floe.driftX * driftProgress).toFixed(2)),
    offsetY: Number((g.floe.driftY * driftProgress).toFixed(2)),
  }));

  // 중앙 얼음 다리 P0(받침 끝) <-> P1(목표 섬 현재 오프셋 경계 최근접점), 양끝 14px 겹침
  const climaxGroup = plan.groups[plan.climaxGroupPos];
  const climaxFo = floeOffsets[plan.climaxGroupPos] ?? { offsetX: 0, offsetY: 0 };
  const shiftedFloePoly = climaxGroup.floe.topPoints.map((p) => ({
    x: p.x + climaxFo.offsetX,
    y: p.y + climaxFo.offsetY,
  }));
  const nearestP1 = nearestPointOnPolyEdge(shiftedFloePoly, plan.sheetCenter);
  const bDx = nearestP1.x - plan.sheetCenter.x;
  const bDy = nearestP1.y - plan.sheetCenter.y;
  const bDist = Math.hypot(bDx, bDy) || 1;
  const ux = bDx / bDist;
  const uy = bDy / bDist;
  const p0 = { x: plan.sheetCenter.x + ux * 20, y: plan.sheetCenter.y + uy * 20 }; // r=34 - 14px overlap
  const p1 = { x: nearestP1.x + ux * 14, y: nearestP1.y + uy * 14 }; // 경계 안쪽 14px overlap
  const bridge = bridgeAlpha > 0
    ? {
        alpha: bridgeAlpha,
        p0,
        p1,
        angleDeg: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI,
        length: Math.max(48, Math.hypot(p1.x - p0.x, p1.y - p0.y)),
        midX: (p0.x + p1.x) / 2,
        midY: (p0.y + p1.y) / 2,
      }
    : null;

  const walkU = clamp((t - 3200) / 8800);
  const climaxSlot = plan.targetSlots[plan.climaxSid];

  const studentPoses = Object.entries(plan.targetSlots).map(([sid, dst]) => {
    const start = plan.initialSpots[sid] ?? plan.sheetCenter;
    const dstGrpIdx = plan.groups.findIndex((g) => g.index === dst.groupIndex);
    const fo = floeOffsets[dstGrpIdx >= 0 ? dstGrpIdx : 0] ?? { offsetX: 0, offsetY: 0 };

    if (sid === plan.climaxSid) {
      if (t < 17800) {
        // Act 1~2: 중앙 얼음 받침(sheetCenter) 위에서 대기
        const gy = plan.sheetCenter.y + 8;
        const waitX = plan.sheetCenter.x;
        const waitY = gy + Math.sin(t * 0.008) * 2.5;
        return {
          studentId: sid,
          groupIndex: dst.groupIndex,
          x: waitX,
          y: waitY,
          groundY: gy,
          heightPx: dst.heightPx,
          showLabel: true,
          labelAlign: /** @type {const} */ ('below'),
          scaleX: 1,
          scaleY: 1,
          walkLeanDeg: 0,
          shadow: groundShadow(0),
          committed: false,
          isJumping: false,
        };
      }
      const ju = clamp((t - 17800) / 1650);
      const sq = squashStretch(ju);
      const x = mix(plan.sheetCenter.x, dst.x + fo.offsetX, ju);
      const gy = mix(plan.sheetCenter.y + 8, dst.y + fo.offsetY, ju);
      const y = gy - sq.jumpY * 138;
      return {
        studentId: sid,
        groupIndex: dst.groupIndex,
        x,
        y,
        groundY: gy,
        heightPx: dst.heightPx,
        showLabel: true,
        labelAlign: dst.labelAlign,
        scaleX: sq.scaleX,
        scaleY: sq.scaleY,
        walkLeanDeg: Number((Math.sin(ju * Math.PI) * 6.5).toFixed(2)),
        shadow: groundShadow(sq.jumpY),
        committed: committedIds.has(sid),
        isJumping: ju > 0.14 && ju < 0.78,
      };
    }

    const baseX = mix(start.x, dst.x, walkU) + fo.offsetX;
    const baseY = mix(start.y, dst.y, walkU) + fo.offsetY;

    // Act 2 경계 페이크 점프(9.2s ~ 11.6s): 실제 공유변 이웃 중점 E를 향해 bump(fu) 가산(순간이동 0px)
    if (sid === plan.fakeSid && t >= 9200 && t <= 11600 && plan.fakeNeighborEdge) {
      const fu = clamp((t - 9200) / 2400);
      const bump = Math.sin(fu * Math.PI);
      const edgeMid = plan.fakeNeighborEdge.mid;
      const x = baseX + bump * (edgeMid.x - baseX) * 0.55;
      const gy = baseY + bump * (edgeMid.y - baseY) * 0.55;
      const y = gy - bump * 46;
      const sq = squashStretch(fu);
      return {
        studentId: sid,
        groupIndex: dst.groupIndex,
        x,
        y,
        groundY: gy,
        heightPx: dst.heightPx,
        showLabel: dst.showLabel,
        labelAlign: dst.labelAlign,
        scaleX: sq.scaleX,
        scaleY: sq.scaleY,
        walkLeanDeg: Number((bump * 5.0).toFixed(2)),
        shadow: groundShadow(bump * 0.8),
        committed: committedIds.has(sid),
        isJumping: true,
      };
    }

    const walking = t >= 3200 && t <= 12200;
    const stepBob = walking ? Math.abs(Math.sin(t * 0.012 + sid.charCodeAt(0))) * 8 : 0;
    const walkLeanDeg = walking ? Number((Math.sin(t * 0.012 + sid.charCodeAt(0)) * 4.5).toFixed(2)) : 0;
    return {
      studentId: sid,
      groupIndex: dst.groupIndex,
      x: baseX,
      y: baseY - stepBob,
      groundY: baseY,
      heightPx: dst.heightPx,
      showLabel: dst.showLabel,
      labelAlign: dst.labelAlign,
      scaleX: 1,
      scaleY: 1,
      walkLeanDeg,
      shadow: groundShadow(stepBob / 24),
      committed: committedIds.has(sid),
      isJumping: false,
    };
  });

  let activeSpeech = '북극 분열 시작 · 모둠별로 배정 중';
  if (t >= 5200 && t < 9200) activeSpeech = '얼음 금이 갈라지고 있어요';
  else if (t >= 9200 && t < 12000) activeSpeech = '모둠 얼음섬으로 이동 중';
  else if (t >= 12000 && t < 12600) activeSpeech = '중앙 얼음 다리 연결';
  else if (t >= 12600 && t < 17800) activeSpeech = '모둠 얼음섬 분리';
  else if (t >= 17800 && t < 19650) activeSpeech = '마지막 친구 합류';
  else if (t >= 19650) activeSpeech = `${plan.groups[climaxSlot?.groupIndex ?? 0]?.name ?? '모둠'} 착지 완료`;

  const flagScale =
    t < 5200 ? 0 :
    t < 5700 ? Number((0.4 + 0.76 * clamp((t - 5200) / 360) - 0.16 * clamp((t - 5560) / 140)).toFixed(3)) :
    1;

  const floes = plan.groups.map((g, i) => ({
    groupIndex: g.index,
    name: g.name,
    color: g.color,
    hex: g.hex,
    symbol: g.symbol,
    topPoints: g.floe.topPoints,
    safePoly: g.floe.safePoly,
    pathD: g.floe.pathD,
    cliffEdges: g.floe.cliffEdges,
    offsetX: floeOffsets[i].offsetX,
    offsetY: floeOffsets[i].offsetY,
    bobY: driftProgress > 0.01 ? Number((Math.sin(t * 0.0028 + i * 1.35) * 2.6 * driftProgress).toFixed(2)) : 0,
    flagScale,
    centroid: g.floe.centroid,
    badge: g.floe.badge,
    maxY: g.floe.maxY,
    area: g.floe.area,
    memberCount: g.studentIds.length,
    metrics: g.metrics,
  }));
  const sortedFloes = [...floes].sort((a, b) => (a.maxY + a.offsetY) - (b.maxY + b.offsetY));

  const crackLineProgress = plan.cracks.map((_, idx) =>
    clamp((crackProgress * 1.35) - (idx / Math.max(1, plan.cracks.length)) * 0.35),
  );
  const heroLandFlash = t >= 19400 && t <= 20500 ? Number(Math.sin(((t - 19400) / 1100) * Math.PI).toFixed(3)) : 0;
  const heroCallout =
    t >= 19350 && t <= 20450
      ? {
          studentId: plan.climaxSid,
          groupIndex: climaxGroup.index,
          groupName: climaxGroup.name,
          x: (climaxSlot?.x ?? plan.sheetCenter.x) + climaxFo.offsetX,
          y: (climaxSlot?.y ?? plan.sheetCenter.y) + climaxFo.offsetY,
          progress: clamp((t - 19350) / 1100),
        }
      : null;

  const heroZoomU =
    t >= 17400 && t <= 20300
      ? Math.sin(clamp((t - 17400) / 2900) * Math.PI)
      : 0;
  const camera = {
    x: crackProgress > 0.04 && crackProgress < 0.92 ? Number((tremorX * 0.85).toFixed(2)) : 0,
    y: 0,
    scale: Number((1 + 0.055 * heroZoomU).toFixed(4)),
    originX: climaxSlot ? (plan.sheetCenter.x + climaxSlot.x + climaxFo.offsetX) / 2 : 800,
    originY: climaxSlot ? (plan.sheetCenter.y + climaxSlot.y + climaxFo.offsetY) / 2 : 450,
  };

  return {
    act,
    useUnifiedRoot,
    rootPathD: plan.rootPathD,
    rootCliffEdges: plan.rootCliffEdges,
    crackProgress,
    crackLineProgress,
    driftProgress,
    bridgeAlpha,
    bridge,
    pedestal: { x: plan.sheetCenter.x, y: plan.sheetCenter.y, r: 34 },
    tremorX,
    heroLandFlash,
    heroCallout,
    camera,
    floes,
    sortedFloes,
    studentPoses,
    committedIds,
    activeSpeech,
    progressRatio: clamp(t / plan.totalDurationMs),
  };
}
