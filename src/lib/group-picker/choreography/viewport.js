/** 3대 무대 공용 1800×1400 블리드 마스터 · 동적 viewBox · 화면 좌표 역변환 · 호흡 모션 모듈(PRD §2.5, §3.2).
 *  왜 고정 16:9 letterbox 대신 동적 viewBox 를 쓰는가: 설정 화면(1.01)과 시어터(1.42) 등 창 비율 변화에도
 *  상하 검은 띠 없이 1800×1400 여백을 자연스럽게 노출하면서 1600×900 코어 리깅 좌표를 보존합니다. */
import { hashStudentId } from '../assets.js';
import { clamp } from './suspense.js';

export const CORE_W = 1600;
export const CORE_H = 900;
export const BLEED_W = 1800;
export const BLEED_H = 1400;
export const BLEED_OX = 100;
export const BLEED_OY = 320;

/** 컨테이너(W×H)에 맞는 논리 viewBox + HTML 스테이지 CSS scale/offset 변환값 계산.
 * @param {number} containerW @param {number} containerH */
export function computeStageViewport(containerW, containerH) {
  const W = Math.max(64, Number(containerW) || CORE_W);
  const H = Math.max(64, Number(containerH) || CORE_H);
  const a = W / H;

  let vx = 0;
  let vy = 0;
  let vw = CORE_W;
  let vh = CORE_H;

  if (a < 16 / 9) {
    vw = CORE_W;
    vh = Math.min(CORE_W / a, BLEED_H - 9); // max 1391 이내 안전 노출
    vx = 0;
    const desiredVy = (CORE_H - vh) * 0.50;
    const minVy = -BLEED_OY;
    const maxVy = (BLEED_H - BLEED_OY) - vh;
    vy = clamp(desiredVy, minVy, maxVy);
  } else {
    vh = CORE_H;
    vw = Math.min(CORE_H * a, BLEED_W);
    vy = 0;
    vx = (CORE_W - vw) / 2;
  }

  const scale = Math.min(W / vw, H / vh);
  const renderW = vw * scale;
  const renderH = vh * scale;
  const padX = (W - renderW) / 2;
  const padY = (H - renderH) / 2;
  const tx = padX - vx * scale;
  const ty = padY - vy * scale;

  return {
    x: Number(vx.toFixed(2)),
    y: Number(vy.toFixed(2)),
    w: Number(vw.toFixed(2)),
    h: Number(vh.toFixed(2)),
    viewBoxAttr: `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`,
    scale: Number(scale.toFixed(5)),
    tx: Number(tx.toFixed(2)),
    ty: Number(ty.toFixed(2)),
  };
}

/** 논리 코어 좌표(1600×900) -> 뷰포트 CSS px (getBoundingClientRect + viewBox 반영).
 * @param {number} lx @param {number} ly
 * @param {DOMRect | {left:number, top:number, width:number, height:number}} containerRect
 * @param {ReturnType<typeof computeStageViewport>} vp */
export function logicalToScreen(lx, ly, containerRect, vp) {
  return {
    x: containerRect.left + vp.tx + lx * vp.scale,
    y: containerRect.top + vp.ty + ly * vp.scale,
  };
}

/** 카메라 줌·쉐이크 변환을 1600×900 논리 좌표에 선적용합니다.
 * @param {number} lx @param {number} ly
 * @param {{x?:number, y?:number, scale?:number, originX?:number, originY?:number}} [cam] */
export function applyCameraPoint(lx, ly, cam) {
  if (!cam) return { x: lx, y: ly };
  const s = cam.scale ?? 1;
  const ox = cam.originX ?? 800;
  const oy = cam.originY ?? 500;
  return {
    x: (lx - ox) * s + ox + (cam.x ?? 0),
    y: (ly - oy) * s + oy + (cam.y ?? 0),
  };
}

/** SVG element 가 있을 때 실제 getScreenCTM() 으로 더 정확한 화면 좌표 반환.
 * @param {SVGSVGElement | undefined} svgEl @param {number} lx @param {number} ly
 * @param {DOMRect | {left:number, top:number, width:number, height:number} | undefined} fallbackRect
 * @param {ReturnType<typeof computeStageViewport> | undefined} fallbackVp */
export function resolveLaunchPoint(svgEl, lx, ly, fallbackRect, fallbackVp) {
  if (svgEl && typeof svgEl.createSVGPoint === 'function') {
    const ctm = svgEl.getScreenCTM();
    if (ctm) {
      const pt = svgEl.createSVGPoint();
      pt.x = lx;
      pt.y = ly;
      const mapped = pt.matrixTransform(ctm);
      if (Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) {
        return { x: mapped.x, y: mapped.y };
      }
    }
  }
  if (fallbackRect && fallbackVp) {
    return logicalToScreen(lx, ly, fallbackRect, fallbackVp);
  }
  return { x: window.innerWidth * 0.45, y: window.innerHeight * 0.48 };
}

/** 학생별 고유 호흡 모션 + 미세 무게중심 흔들림 (점프/이동 중엔 movingBlend로 서서히 감쇠).
 * @param {string} studentId @param {number} elapsedMs @param {number} [movingBlend] 0=정지, 1=점프중 */
export function idleBreath(studentId, elapsedMs, movingBlend = 0) {
  const h = hashStudentId(studentId);
  const h1 = (h % 1000) / 1000;
  const h2 = ((h >>> 10) % 1000) / 1000;
  const periodMs = 1600 * (0.9 + 0.2 * h2);
  const decay = 1 - clamp(movingBlend);
  const phase = 2 * Math.PI * h1 + ((elapsedMs / periodMs) * 2 * Math.PI);
  const amp = 0.021 * decay;
  const scaleY = 1 + Math.sin(phase) * amp;
  const scaleX = 1 / Math.sqrt(scaleY);
  const swayPhase = 2 * Math.PI * h2 + ((elapsedMs / (periodMs * 1.45)) * 2 * Math.PI);
  const rotateDeg = Math.sin(swayPhase) * 1.35 * decay;
  return {
    scaleX: Number(scaleX.toFixed(4)),
    scaleY: Number(scaleY.toFixed(4)),
    rotateDeg: Number(rotateDeg.toFixed(3)),
  };
}
