<script lang="ts">
  import { SHARED_URLS } from '../../../lib/group-picker/assets.js';
  import { idleBreath } from '../../../lib/group-picker/choreography/viewport.js';
  import { fitStageLabelSize } from './stageShared.js';

  let {
    studentId,
    label,
    fullSrc,
    x,
    y,
    groundY = undefined,
    heightPx = 160,
    scaleX = 1,
    scaleY = 1,
    shadowScale = 1,
    shadowOpacity = 0.16,
    movingBlend = 0,
    elapsed = 0,
    opacity = 1,
    accentHex = '#5A4336',
    showLabel = true,
    labelAlign = 'below',
    labelOffsetY = 4,
    dark = false,
    zIndex = undefined,
    fontFamily = 'Pretendard, sans-serif',
    silhouette = false,
    labelMaxWOverride = undefined,
    vpScale = 1,
    isHero = false,
    walkLeanDeg = 0,
    idleCssAnim = false,
    celebrateBurst = false,
    renderMode = 'both',
    onMarkBroken,
  } = $props<{
    studentId: string;
    label: string;
    fullSrc: string;
    x: number;
    y: number;
    groundY?: number;
    heightPx?: number;
    scaleX?: number;
    scaleY?: number;
    shadowScale?: number;
    shadowOpacity?: number;
    movingBlend?: number;
    elapsed?: number;
    opacity?: number;
    accentHex?: string;
    showLabel?: boolean;
    labelAlign?: 'below' | 'above';
    labelOffsetY?: number;
    dark?: boolean;
    zIndex?: number;
    fontFamily?: string;
    silhouette?: boolean;
    labelMaxWOverride?: number;
    vpScale?: number;
    isHero?: boolean;
    walkLeanDeg?: number;
    idleCssAnim?: boolean;
    celebrateBurst?: boolean;
    renderMode?: 'both' | 'body' | 'plate';
    onMarkBroken?: (src: string) => void;
  }>();

  // 512×640 마스터에서 실제 캐릭터 신장 540px(84.375%), 발끝 앵커 592px(92.5%)
  const imgH = $derived(heightPx / 0.84375);
  const imgW = $derived(imgH * 0.8);
  const breath = $derived(idleBreath(studentId, elapsed, movingBlend));
  const breathPhaseIdx = $derived(studentId ? (studentId.charCodeAt(0) + studentId.charCodeAt(studentId.length - 1)) % 4 : 0);

  // 가독성 대폭 상향: 논리 24~34px + 일반 화면 뷰포트 최소 15px(주인공 20px) 보장
  const baseLogical = $derived(
    labelMaxWOverride
      ? Math.min(30, Math.round(labelMaxWOverride * 0.21))
      : isHero
        ? 32
        : Math.max(24, Math.min(30, Math.round(heightPx * 0.22))),
  );
  const screenMinFloor = $derived(
    vpScale < 0.34
      ? baseLogical
      : Math.min(isHero ? 36 : 32, (isHero ? 20 : 15) / Math.max(0.34, vpScale)),
  );
  const labelMaxFont = $derived(Math.max(baseLogical, screenMinFloor));
  const rawMaxW = $derived(labelMaxWOverride ?? Math.max(132, Math.min(240, Math.round(heightPx * 1.48))));
  const labelMaxW = $derived(Math.max(rawMaxW, Math.round(labelMaxFont * 3.6 + 18)));
  const labelFontSize = $derived(fitStageLabelSize(label, labelMaxW, labelMaxFont, fontFamily, 14));
  const shadowW = $derived(Math.max(42, Math.round(heightPx * 0.56)));
  const effectiveGroundY = $derived(groundY ?? y);
</script>

<!-- 접지 그림자 & 반짝임 (renderMode !== 'plate' 일 때만 렌더) -->
{#if renderMode !== 'plate'}
  <img
    class="gp-stage-shadow"
    src={SHARED_URLS['gp-ground-shadow']}
    alt=""
    aria-hidden="true"
    draggable="false"
    style:left={`${x.toFixed(1)}px`}
    style:top={`${effectiveGroundY.toFixed(1)}px`}
    style:width={`${shadowW}px`}
    style:opacity={Math.min(0.85, shadowOpacity * 2.8 * opacity)}
    style:transform={`translate(-50%, -44%) scale(${shadowScale.toFixed(3)})`}
  />

  {#if celebrateBurst && SHARED_URLS['gp-sparkle-burst']}
    <img
      class="gp-prop-img gp-sparkle-pop"
      src={SHARED_URLS['gp-sparkle-burst']}
      alt=""
      aria-hidden="true"
      draggable="false"
      style:left={`${(x + heightPx * 0.30).toFixed(1)}px`}
      style:top={`${(y - heightPx * 1.08).toFixed(1)}px`}
      style:width={`${Math.round(heightPx * 0.34)}px`}
      style:height={`${Math.round(heightPx * 0.34)}px`}
      style:z-index={Math.max(1, (zIndex ?? 4) - 1)}
    />
  {/if}
{/if}

<!-- 캐릭터 컨테이너: 발끝 (x, y) 앵커 -->
{#if renderMode !== 'plate' || (showLabel && !silhouette)}
  <div
    class="gp-stage-student"
    style:left={`${x.toFixed(1)}px`}
    style:top={`${y.toFixed(1)}px`}
    style:opacity={opacity}
    style:z-index={zIndex}
  >
    {#if renderMode !== 'plate'}
      <!-- 스쿼시·스트레치 + 호흡 래퍼 (CSS idle keyframe 은 내부 래퍼로 분리해 transform 충돌 0%) -->
      <div
        class="gp-stage-student-body"
        class:silhouette
        class:dark-tone={dark && !silhouette}
        style:width={`${imgW.toFixed(1)}px`}
        style:height={`${imgH.toFixed(1)}px`}
        style:transform={`translate(-50%, -92.5%) scale(${(scaleX * breath.scaleX).toFixed(4)}, ${(scaleY * breath.scaleY).toFixed(4)}) rotate(${(breath.rotateDeg + walkLeanDeg).toFixed(2)}deg)`}
      >
        <div
          class="gp-student-idle-sway"
          class:animate={idleCssAnim && movingBlend === 0 && !silhouette}
          style:animation-delay={`${breathPhaseIdx * -420}ms`}
        >
          <img
            src={fullSrc}
            alt={label}
            draggable="false"
            onerror={() => onMarkBroken?.(fullSrc)}
          />
        </div>
      </div>
    {/if}

    <!-- 이름표: 호흡 모션 · 다크 톤 보정 바깥 최상위 (잘림·slice·말줄임 0%) -->
    {#if renderMode !== 'body' && showLabel && !silhouette}
      <div
        class="gp-stage-nameplate"
        class:above={labelAlign === 'above'}
        class:hero={isHero}
        style:--plate-offset={labelAlign === 'above' ? `${Math.round(heightPx + 14)}px` : `${labelOffsetY}px`}
        style:border-color={accentHex}
        style:font-size={`${labelFontSize.toFixed(1)}px`}
      >
        {label}
      </div>
    {/if}
  </div>
{/if}
