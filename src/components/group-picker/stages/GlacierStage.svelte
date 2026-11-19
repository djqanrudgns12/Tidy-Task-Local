<script lang="ts">
  import GroupSymbol from '../../scoreboard/GroupSymbol.svelte';
  import StageHudBand from './StageHudBand.svelte';
  import StageStudent from './StageStudent.svelte';
  import { createBannerTracker } from './stageShared.js';
  import { PALETTE } from '../../../lib/scoreboard/model.js';
  import { STORYBOOK_PAINT } from '../../../lib/group-picker/recolor.js';
  import { formatStudentLabel } from '../../../lib/group-picker/allocation.js';
  import {
    GLACIER_URLS,
    SHARED_URLS,
    avatarForStudent,
    resolveThemePartUrl,
  } from '../../../lib/group-picker/assets.js';
  import {
    GLACIER_W,
    GLACIER_H,
    BEVEL_DEPTH_PX,
    glacierPoseAt,
    partitionGlacierBSP,
  } from '../../../lib/group-picker/choreography/glacier.js';
  import {
    CORE_W,
    CORE_H,
    computeStageViewport,
    resolveLaunchPoint,
  } from '../../../lib/group-picker/choreography/viewport.js';

  const UI_COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  let {
    phase,
    plan = null,
    elapsed = 0,
    groups,
    capacities = [],
    participants,
    committedIds = undefined,
    allStudents,
    classAvatarMap = {},
    alwaysShowNumber,
    scheme,
    brokenAssets: _brokenAssets = new Set<string>(),
    canStart,
    startDisabledReason = '',
    preparingStage = false,
    fontFamily = 'Pretendard, sans-serif',
    onStart,
    onSkip,
    onMarkBroken,
  } = $props<{
    phase: 'idle' | 'running' | 'settled';
    plan?: any;
    elapsed?: number;
    groups: { index: number; name: string; color: string; symbol: string }[];
    capacities?: number[];
    participants: any[];
    committedIds?: Set<string>;
    allStudents: any[];
    classAvatarMap?: Record<string, { id: string; fullSrc: string; src: string; portraitSrc: string }>;
    alwaysShowNumber: boolean;
    scheme: 'light' | 'dark';
    brokenAssets?: Set<string>;
    canStart: boolean;
    startDisabledReason?: string;
    preparingStage?: boolean;
    fontFamily?: string;
    onStart: () => void;
    onSkip?: () => void;
    onMarkBroken: (src: string) => void;
  }>();

  let viewportEl = $state<HTMLDivElement>();
  let svgEl = $state<SVGSVGElement>();
  let vpW = $state(960);
  let vpH = $state(600);
  const vp = $derived(computeStageViewport(vpW, vpH));

  const dark = $derived(scheme === 'dark');
  const studentById = $derived(Object.fromEntries(participants.map((p: any) => [p.id, p])));
  const pose = $derived(phase === 'running' && plan ? glacierPoseAt(plan, elapsed) : null);

  // OKLab 재채색 깃발 캐시
  let recoloredFlags = $state<Record<string, string>>({});
  $effect(() => {
    const colorIds: string[] = Array.from(new Set<string>(groups.map((g: any) => String(g.color ?? '')).filter(Boolean)));
    const baseUrl = GLACIER_URLS['g1-flag-base'];
    const maskUrl = GLACIER_URLS['g1-flag-mask'];
    if (!baseUrl || !maskUrl) return;
    let cancelled = false;
    for (const cid of colorIds) {
      if (recoloredFlags[cid]) continue;
      void resolveThemePartUrl('glacier-flag', baseUrl, maskUrl, cid).then((url) => {
        if (!cancelled && url) {
          recoloredFlags = { ...recoloredFlags, [cid]: url };
        }
      });
    }
    return () => {
      cancelled = true;
    };
  });

  // 대기 상태 정원 비례 미리보기 BSP
  const idleBsp = $derived(
    capacities.length >= 2 && capacities.every((c: number) => c >= 1)
      ? partitionGlacierBSP(capacities, GLACIER_W, GLACIER_H, 42)
      : null,
  );

  // 8m 배너 컨트롤러: 확정 물결(12.8s~18.0s) 중엔 900ms 섬 단위 요약, Act 3 다리 점프 주인공(17.8s~) 단독 배너!
  const bannerTracker = createBannerTracker();
  let lastRunRef: any = null;
  const banner = $derived.by(() => {
    if (phase !== 'running' || !pose || !plan) {
      if (lastRunRef !== null) {
        bannerTracker.reset();
        lastRunRef = null;
      }
      return bannerTracker.update({
        mode: 'glacier',
        elapsed: 0,
        idleText: `${groups.length}개 모둠 얼음섬이 정원 비율로 나뉠 준비가 됐어요!`,
      });
    }
    if (lastRunRef !== plan) {
      bannerTracker.reset();
      lastRunRef = plan;
    }

    // Act 3 주인공 점프 시점 (17.8s 이후) -> 단독 대형 배너
    if (elapsed >= 17800) {
      const hero = studentById[plan.climaxSid];
      const lastGrp = groups[groups.length - 1] ?? groups[0];
      const hex = UI_COLOR_MAP[lastGrp?.color] ?? '#4FC2A0';
      return bannerTracker.update({
        mode: 'glacier',
        elapsed,
        idleText: pose.activeSpeech,
        candidate: hero && lastGrp
          ? {
              key: `gl-hero-${hero.id}`,
              groupIndex: lastGrp.index,
              groupName: lastGrp.name,
              groupColorHex: hex,
              groupSymbol: lastGrp.symbol,
              studentName: formatStudentLabel(hero, allStudents, alwaysShowNumber),
            }
          : null,
      });
    }

    // 12.8s ~ 17.8s 확정 물결 중 -> 현황판 committedIds 와 100% 일치하는 실시간 섬 단위 요약
    if (elapsed >= 12800) {
      const activeCommitted = committedIds ?? pose.committedIds;
      const committedByGroup = groups.map((g: any) => {
        const floeData = pose.floes.find((f) => f.groupIndex === g.index);
        const targetCount = floeData?.memberCount ?? 0;
        const planGrp = plan.groups?.find((pg: any) => pg.index === g.index);
        const doneCount = (planGrp?.studentIds ?? []).filter((sid: string) => activeCommitted.has(sid)).length;
        return { g, doneCount, targetCount };
      });
      const focusIdx = Math.min(groups.length - 1, Math.floor((elapsed - 12800) / 900) % groups.length);
      const focus = committedByGroup[focusIdx];
      const focusHex = UI_COLOR_MAP[focus?.g?.color] ?? '#4FC2A0';
      return bannerTracker.update({
        mode: 'glacier',
        elapsed,
        idleText: pose.activeSpeech,
        summaryCandidate: focus && focus.doneCount > 0
          ? {
              groupIndex: focus.g.index,
              groupName: focus.g.name,
              groupColorHex: focusHex,
              groupSymbol: focus.g.symbol,
              text: `${focus.doneCount}/${focus.targetCount}명 착지 완료`,
            }
          : null,
      });
    }

    return bannerTracker.update({
      mode: 'glacier',
      elapsed,
      idleText: pose.activeSpeech,
    });
  });

  const sortedStudents = $derived(
    pose ? [...pose.studentPoses].sort((a, b) => a.y - b.y) : [],
  );

  // StageHudBand와 호명 배너를 100% 동기화 (G1 모둠 뱃지·칩 불일치 방지)
  const hudActiveIndex = $derived.by(() => {
    if (!pose) return 0;
    if (banner.groupIndex >= 0) {
      const idx = groups.findIndex((g: any) => g.index === banner.groupIndex);
      if (idx >= 0) return idx;
    }
    if (elapsed >= 17800) return Math.max(0, groups.length - 1);
    return 0;
  });

  const doneGroupIndices = $derived.by(() => {
    const done = new Set<number>();
    if (!pose || !plan) return done;
    for (const g of groups) {
      const planGrp = plan.groups?.find((pg: any) => pg.index === g.index);
      const ids: string[] = planGrp?.studentIds ?? [];
      if (ids.length > 0 && ids.every((sid) => pose.committedIds.has(sid))) {
        done.add(g.index);
      }
    }
    return done;
  });

  const iceCrackOpacity = $derived(
    pose ? Math.max(0, Math.min(1, pose.crackProgress * 1.45) * Math.max(0, 1 - pose.driftProgress * 2.0)) : 0,
  );

  // idle 통합 빙하 미리보기 학생 (최대 8명, 넉넉한 230px×168px 간격 배치)
  const idlePreviewStudents = $derived.by(() => {
    if (!idleBsp) return [];
    const list = participants.slice(0, Math.min(8, participants.length));
    const cols = Math.min(4, Math.max(2, list.length));
    const rows = Math.ceil(list.length / cols);
    const stepX = cols <= 2 ? 320 : 230;
    const stepY = rows <= 1 ? 0 : 172;
    return list.map((st: any, idx: number) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        st,
        x: idleBsp.sheetCenter.x + (col - (cols - 1) / 2) * stepX,
        y: idleBsp.sheetCenter.y + 42 + (row - (rows - 1) / 2) * stepY,
      };
    });
  });

  // 배경 물 위 떠다니는 얼음 결정/유빙 장식 좌표
  const ambientShards = [
    { src: GLACIER_URLS['g1-ice-shard-1'], x: 76, y: 184, w: 48 },
    { src: GLACIER_URLS['g1-ice-shard-2'], x: 1510, y: 210, w: 44 },
    { src: GLACIER_URLS['g1-ice-shard-3'], x: 88, y: 760, w: 68 },
    { src: GLACIER_URLS['g1-ice-shard-4'], x: 1500, y: 742, w: 46 },
  ];

  const heroCalloutStudent = $derived(pose?.heroCallout ? studentById[pose.heroCallout.studentId] : null);
  const heroGroup = $derived(pose?.heroCallout ? groups.find((g: any) => g.index === pose.heroCallout?.groupIndex) : null);
  const cam = $derived(pose?.camera ?? { x: 0, y: 0, scale: 1, originX: 800, originY: 450 });

  export function getLaunchScreenPoint(studentId?: string) {
    if (pose && studentId) {
      const sp = pose.studentPoses.find((s) => s.studentId === studentId);
      if (sp) {
        return resolveLaunchPoint(svgEl, sp.x, sp.y - 36, viewportEl?.getBoundingClientRect(), vp);
      }
    }
    return resolveLaunchPoint(svgEl, GLACIER_W / 2, GLACIER_H / 2, viewportEl?.getBoundingClientRect(), vp);
  }
</script>

<div class="gp-stage-canvas" data-mode="glacier">
  <StageHudBand
    {phase}
    {groups}
    activeIndex={hudActiveIndex}
    doneAll={pose ? pose.committedIds.size === participants.length : false}
    {doneGroupIndices}
    {banner}
    {fontFamily}
    idleStatusText={`북극 눈꽃 빙하 · ${groups.length}개 모둠 정원 비례 분할 (${participants.length}명)`}
    {onSkip}
  />

  <div class="gp-stage-viewport" bind:this={viewportEl} bind:clientWidth={vpW} bind:clientHeight={vpH}>
    <div
      class="gp-stage-core"
      style:width={`${CORE_W}px`}
      style:height={`${CORE_H}px`}
      style:transform={`translate3d(${vp.tx}px, ${vp.ty}px, 0) scale(${vp.scale})`}
    >
      <div
        class="gp-stage-camera"
        style:transform-origin={`${cam.originX}px ${cam.originY}px`}
        style:transform={`translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.scale})`}
      >
      <!-- Z0: 1800×1400 수채 북극 라군 배경 (낮/오로라 황혼 전환) -->
      <img
        class="gp-bleed-bg"
        src={dark ? GLACIER_URLS['g1-bg-dusk'] : GLACIER_URLS['g1-bg-lagoon']}
        alt=""
        aria-hidden="true"
        draggable="false"
      />

      {#if dark}
        <div class="gp-dark-scrim" aria-hidden="true"></div>
      {/if}

      <!-- 라군 외곽 부유 유빙 (내부 CSS 부유 래퍼 → idle 중에도 생동감) -->
      {#each ambientShards as sh, i (i)}
        <div
          class="gp-prop-img"
          style:left={`${sh.x}px`}
          style:top={`${sh.y}px`}
          style:width={`${sh.w}px`}
          style:transform="translate(-50%, -50%)"
        >
          <img
            class="gp-shard-float"
            src={sh.src}
            alt=""
            aria-hidden="true"
            draggable="false"
            style:width="100%"
            style:height="auto"
            style:opacity={dark ? 0.82 : 0.94}
            style:animation-delay={`${i * -0.9}s`}
          />
        </div>
      {/each}

      <!-- Z1: 단일 벡터 빙하 + 24px 입체 절벽 + 순차 곡선 균열 + 패턴 타일 얼음 다리 -->
      <svg
        bind:this={svgEl}
        class="gp-glacier-svg"
        viewBox={`0 0 ${GLACIER_W} ${GLACIER_H}`}
        aria-hidden="true"
      >
        <defs>
          <pattern id="gp-snow-tex" width="256" height="256" patternUnits="userSpaceOnUse">
            <image href={GLACIER_URLS['g1-snow-texture']} width="256" height="256" preserveAspectRatio="none" />
          </pattern>
          <pattern id="gp-cliff-tex" width="256" height="256" patternUnits="userSpaceOnUse">
            <image href={GLACIER_URLS['g1-ice-cliff-texture']} width="256" height="256" preserveAspectRatio="none" />
          </pattern>
          <pattern id="gp-bridge-tex" width="160" height="68" patternUnits="userSpaceOnUse">
            <image href={GLACIER_URLS['g1-ice-bridge-mid']} width="160" height="68" preserveAspectRatio="xMidYMid slice" />
          </pattern>
          <linearGradient id="gp-cliff-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.20" />
            <stop offset="55%" stop-color="#7ec4da" stop-opacity="0.08" />
            <stop offset="100%" stop-color="#1a4e68" stop-opacity="0.34" />
          </linearGradient>
        </defs>

        {#if !pose && idleBsp}
          <!-- idle: Act 1과 동일한 통합 빙하 + 점선 분할 예정선(시작 시 깜박임 0%) -->
          <g>
            <path
              d={idleBsp.rootPathD}
              fill="none"
              stroke="#ffffff"
              stroke-opacity="0.48"
              stroke-width="14"
              stroke-linejoin="round"
            />
            {#each idleBsp.rootCliffEdges as edge, ei (ei)}
              {@const cliffPts = `${edge.x1.toFixed(1)},${edge.y1.toFixed(1)} ${edge.x2.toFixed(1)},${edge.y2.toFixed(1)} ${edge.x2.toFixed(1)},${(edge.y2 + BEVEL_DEPTH_PX).toFixed(1)} ${edge.x1.toFixed(1)},${(edge.y1 + BEVEL_DEPTH_PX).toFixed(1)}`}
              <polygon points={cliffPts} fill="url(#gp-cliff-tex)" stroke="#8FBDD1" stroke-width="1.2" />
              <polygon points={cliffPts} fill="url(#gp-cliff-shade)" />
            {/each}
            <path
              d={idleBsp.rootPathD}
              fill="url(#gp-snow-tex)"
              stroke="#5A4336"
              stroke-opacity="0.30"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
            {#if dark}
              <path d={idleBsp.rootPathD} fill="#1E3550" fill-opacity="0.28" stroke="none" />
            {/if}
            {#each idleBsp.cracks as crackPts, ci (ci)}
              {@const d = crackPts.map((p: { x: number; y: number }, k: number) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')}
              <path {d} fill="none" stroke="#6FAEC6" stroke-opacity="0.38" stroke-width="2" stroke-dasharray="8 8" />
            {/each}
          </g>
        {:else if pose?.useUnifiedRoot}
          <!-- Act 1 (crackProgress === 0): 단일 통합 rootPoly 1개 path -> 0px 이음새! -->
          <g transform={`translate(${(pose.tremorX * 0.5).toFixed(2)}, 0)`}>
            <path
              d={pose.rootPathD}
              fill="none"
              stroke="#ffffff"
              stroke-opacity="0.54"
              stroke-width="14"
              stroke-linejoin="round"
            />
            {#each pose.rootCliffEdges as edge, ei (ei)}
              {@const cliffPts = `${edge.x1.toFixed(1)},${edge.y1.toFixed(1)} ${edge.x2.toFixed(1)},${edge.y2.toFixed(1)} ${edge.x2.toFixed(1)},${(edge.y2 + BEVEL_DEPTH_PX).toFixed(1)} ${edge.x1.toFixed(1)},${(edge.y1 + BEVEL_DEPTH_PX).toFixed(1)}`}
              <polygon points={cliffPts} fill="url(#gp-cliff-tex)" stroke="#8FBDD1" stroke-width="1.2" />
              <polygon points={cliffPts} fill="url(#gp-cliff-shade)" />
            {/each}
            <path
              d={pose.rootPathD}
              fill="url(#gp-snow-tex)"
              stroke="#5A4336"
              stroke-opacity="0.34"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
            {#if dark}
              <path d={pose.rootPathD} fill="#1E3550" fill-opacity="0.28" stroke="none" />
            {/if}
          </g>
        {:else if pose}
          <!-- 뒤→앞 (maxY + offsetY 오름차순) 개별 얼음섬 렌더 -->
          {#each pose.sortedFloes as floe (floe.groupIndex)}
            {@const uiHex = UI_COLOR_MAP[floe.color] ?? '#4FC2A0'}
            {@const paintHex = STORYBOOK_PAINT[floe.color]?.hex ?? '#8FCEB8'}
            {@const tx = (floe.offsetX ?? 0) + (pose.tremorX ?? 0)}
            {@const ty = (floe.offsetY ?? 0) + (floe.bobY ?? 0)}
            <g transform={`translate(${tx.toFixed(2)}, ${ty.toFixed(2)})`}>
              <path
                d={floe.pathD}
                fill="none"
                stroke="#ffffff"
                stroke-opacity="0.52"
                stroke-width="14"
                stroke-linejoin="round"
              />
              <!-- 외향 남면(n.y > 0) 24px 2.5D 절벽 압출 + 그라데이션 음영 -->
              {#each floe.cliffEdges as edge, ei (ei)}
                {@const cliffPts = `${edge.x1.toFixed(1)},${edge.y1.toFixed(1)} ${edge.x2.toFixed(1)},${edge.y2.toFixed(1)} ${edge.x2.toFixed(1)},${(edge.y2 + BEVEL_DEPTH_PX).toFixed(1)} ${edge.x1.toFixed(1)},${(edge.y1 + BEVEL_DEPTH_PX).toFixed(1)}`}
                <polygon
                  points={cliffPts}
                  fill="url(#gp-cliff-tex)"
                  stroke={uiHex}
                  stroke-opacity="0.45"
                  stroke-width="1"
                />
                <polygon points={cliffPts} fill="url(#gp-cliff-shade)" />
              {/each}
              <!-- 수채 설원 상면 -->
              <path
                d={floe.pathD}
                fill="url(#gp-snow-tex)"
                stroke={pose.driftProgress < 0.08 ? '#F3FAFD' : paintHex}
                stroke-width={pose.driftProgress < 0.08 ? 1.8 : 3.5}
                stroke-linejoin="round"
              />
              {#if dark}
                <path d={floe.pathD} fill="#1E3550" fill-opacity="0.28" stroke="none" />
              {/if}
            </g>
          {/each}

          <!-- Act 2 순차 서리 균열선 (pathLength="1" 진행) -->
          {#if plan?.cracks && iceCrackOpacity > 0.02}
            <g opacity={iceCrackOpacity.toFixed(3)}>
              {#each plan.cracks as crackPts, ci (ci)}
                {@const d = crackPts.map((p: { x: number; y: number }, k: number) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')}
                {@const prog = pose.crackLineProgress?.[ci] ?? pose.crackProgress}
                <path
                  {d}
                  pathLength="1"
                  stroke-dasharray="1"
                  stroke-dashoffset={(1 - prog).toFixed(3)}
                  fill="none"
                  stroke="#E8FAFF"
                  stroke-width="7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  {d}
                  pathLength="1"
                  stroke-dasharray="1"
                  stroke-dashoffset={(1 - prog).toFixed(3)}
                  fill="none"
                  stroke="#3E5C6B"
                  stroke-opacity="0.68"
                  stroke-width="2.4"
                  stroke-linecap="round"
                />
              {/each}
            </g>
          {/if}
        {/if}

        <!-- 12.0s -> 12.6s 각진 수채 빙하 판 얼음 다리 (입체 측면 + 서리 결선, 파이프 느낌 제거) -->
        {#if pose?.bridge && pose.bridge.alpha > 0}
          {@const br = pose.bridge}
          {@const len = br.length}
          {@const m1 = (len * 0.34).toFixed(1)}
          {@const m2 = (len * 0.68).toFixed(1)}
          <g opacity={br.alpha.toFixed(3)} transform={`translate(${br.p0.x.toFixed(1)}, ${br.p0.y.toFixed(1)}) rotate(${br.angleDeg.toFixed(2)})`}>
            <polygon
              points={`-8,12 10,28 ${m1},30 ${m2},27 ${(len - 8).toFixed(1)},28 ${(len + 8).toFixed(1)},12 ${(len + 8).toFixed(1)},-2 -8,-2`}
              fill="#9AC8DE"
              stroke="#7AAEC6"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <polygon
              points={`-10,-8 12,-22 ${m1},-20 ${m2},-23 ${(len - 10).toFixed(1)},-21 ${(len + 10).toFixed(1)},-6 ${(len + 6).toFixed(1)},14 ${(len - 12).toFixed(1)},17 ${m2},15 ${m1},18 8,15`}
              fill="url(#gp-snow-tex)"
              stroke="#E8F8FF"
              stroke-width="2.4"
              stroke-linejoin="round"
            />
            <polyline
              points={`14,-9 ${m1},3 ${m2},-5 ${(len - 16).toFixed(1)},4`}
              fill="none"
              stroke="#FFFFFF"
              stroke-opacity="0.72"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <polyline
              points={`22,6 ${(len * 0.48).toFixed(1)},9 ${(len * 0.78).toFixed(1)},1`}
              fill="none"
              stroke="#B2DFEE"
              stroke-opacity="0.75"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>
        {/if}

        <!-- 중앙 얼음 받침 (running 에서만 표시해 idle 붕 뜸 제거) -->
        {#if pose}
          <image
            href={GLACIER_URLS['g1-ice-pedestal']}
            x={(pose.pedestal.x - 56).toFixed(1)}
            y={(pose.pedestal.y - 26).toFixed(1)}
            width="112"
            height="71"
          />
        {/if}
      </svg>

      <!-- 균열 서리 반짝임 & 표류 물결 파동 (HTML GPU 레이어 → SVG 전체 리페인트 0%) -->
      {#if pose && !pose.useUnifiedRoot && plan?.cracks && iceCrackOpacity > 0.1}
        {#each plan.cracks as crackPts, ci (ci)}
          {@const mid = crackPts[Math.floor(crackPts.length / 2)]}
          {@const prog = pose.crackLineProgress?.[ci] ?? 0}
          {#if mid && prog > 0.25 && prog < 0.96}
            <img
              class="gp-prop-img gp-sparkle-pop"
              src={GLACIER_URLS['g1-sparkle']}
              alt=""
              aria-hidden="true"
              draggable="false"
              style:left={`${mid.x.toFixed(1)}px`}
              style:top={`${mid.y.toFixed(1)}px`}
              style:width="64px"
              style:height="64px"
              style:z-index="3"
            />
          {/if}
        {/each}
      {/if}

      {#if pose && pose.driftProgress > 0.06}
        {#each pose.sortedFloes as floe (floe.groupIndex)}
          <div
            class="gp-glacier-ripple"
            style:left={`${(floe.centroid.x + floe.offsetX).toFixed(1)}px`}
            style:top={`${(floe.maxY + floe.offsetY + 12).toFixed(1)}px`}
            style:width="180px"
            style:height="34px"
            style:animation-delay={`${floe.groupIndex * -0.45}s`}
          ></div>
        {/each}
      {/if}

      <!-- Z2: GPU HTML 모둠 깃발 + 대형 고대비 뱃지 (Act 2 균열과 함께 탄성 등장) -->
      {#if pose && !pose.useUnifiedRoot}
        {#each pose.sortedFloes as floe (floe.groupIndex)}
          {@const uiHex = UI_COLOR_MAP[floe.color] ?? '#4FC2A0'}
          {@const flagSrc = recoloredFlags[floe.color] ?? GLACIER_URLS['g1-flag-base']}
          {@const bx = floe.badge.x + (floe.offsetX ?? 0) + (pose.tremorX ?? 0)}
          {@const by = floe.badge.y + (floe.offsetY ?? 0) + (floe.bobY ?? 0)}
          {@const fScale = floe.flagScale ?? 1}
          {@const compactFlag = groups.length >= 9}
          <div
            class="gp-glacier-flag-anchor"
            style:left={`${bx.toFixed(1)}px`}
            style:top={`${by.toFixed(1)}px`}
            style:opacity={Math.min(1, Math.max(0.28, pose.crackProgress * 4))}
            style:transform={`translate(-50%, -100%) scale(${fScale.toFixed(3)})`}
          >
            {#if flagSrc}
              <img
                class="gp-glacier-flag-img gp-flag-wave"
                src={flagSrc}
                alt=""
                aria-hidden="true"
                draggable="false"
                style:height={compactFlag ? '34px' : '44px'}
                style:margin-bottom="-6px"
                style:animation-delay={`${floe.groupIndex * -0.4}s`}
              />
            {/if}
            <div
              class="gp-stage-badge"
              style:border-color={uiHex}
              style:font-size={compactFlag ? '22px' : '27px'}
              style:padding={compactFlag ? '5px 12px' : '6px 15px'}
            >
              <GroupSymbol symbol={floe.symbol} color={uiHex} size={compactFlag ? 19 : 23} />
              <span>{floe.name}</span>
            </div>
          </div>
        {/each}
      {/if}

      {#if pose}
        <!-- 1차: 모든 학생 본체·그림자·반짝임 -->
        {#each sortedStudents as sp (sp.studentId)}
          {@const st = studentById[sp.studentId]}
          {#if st}
            {@const av = avatarForStudent(st, classAvatarMap)}
            {@const grp = groups.find((g: any) => g.index === sp.groupIndex)}
            {@const hex = UI_COLOR_MAP[grp?.color] ?? '#4FC2A0'}
            {@const isClimaxJump = sp.studentId === plan?.climaxSid && elapsed >= 17800}
            <StageStudent
              renderMode="body"
              studentId={sp.studentId}
              label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
              fullSrc={av.fullSrc}
              x={sp.x}
              y={sp.y}
              groundY={sp.groundY}
              heightPx={sp.heightPx}
              scaleX={sp.scaleX}
              scaleY={sp.scaleY}
              walkLeanDeg={sp.walkLeanDeg ?? 0}
              shadowScale={sp.shadow.scale}
              shadowOpacity={sp.shadow.opacity}
              movingBlend={sp.isJumping ? 1 : 0}
              vpScale={vp.scale}
              isHero={isClimaxJump}
              labelMaxWOverride={participants.length >= 32 && !isClimaxJump ? 106 : undefined}
              celebrateBurst={sp.studentId === plan?.climaxSid && (pose.heroLandFlash ?? 0) > 0.15}
              {elapsed}
              accentHex={sp.committed ? hex : '#5A4336'}
              showLabel={sp.showLabel}
              labelAlign={sp.labelAlign}
              {dark}
              {fontFamily}
              zIndex={isClimaxJump ? 5 : 4}
              {onMarkBroken}
            />
          {/if}
        {/each}

        <!-- 2차 최상위 레이어: 모든 학생 이름표 (앞줄 머리 가림 0%) -->
        {#each sortedStudents as sp (sp.studentId)}
          {@const st = studentById[sp.studentId]}
          {#if st && sp.showLabel}
            {@const av = avatarForStudent(st, classAvatarMap)}
            {@const grp = groups.find((g: any) => g.index === sp.groupIndex)}
            {@const hex = UI_COLOR_MAP[grp?.color] ?? '#4FC2A0'}
            {@const isClimaxJump = sp.studentId === plan?.climaxSid && elapsed >= 17800}
            <StageStudent
              renderMode="plate"
              studentId={sp.studentId}
              label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
              fullSrc={av.fullSrc}
              x={sp.x}
              y={sp.y}
              groundY={sp.groundY}
              heightPx={sp.heightPx}
              vpScale={vp.scale}
              isHero={isClimaxJump}
              labelMaxWOverride={participants.length >= 32 && !isClimaxJump ? 106 : undefined}
              {elapsed}
              accentHex={sp.committed ? hex : '#5A4336'}
              showLabel={sp.showLabel}
              labelAlign={sp.labelAlign}
              {dark}
              {fontFamily}
              zIndex={isClimaxJump ? 9 : 8}
            />
          {/if}
        {/each}

        {#if pose.heroCallout && heroCalloutStudent && heroGroup}
          {@const hHex = UI_COLOR_MAP[heroGroup.color] ?? '#4FC2A0'}
          <div
            class="gp-hero-callout"
            style:left={`${pose.heroCallout.x.toFixed(1)}px`}
            style:top={`${Math.max(96, pose.heroCallout.y - 165).toFixed(1)}px`}
            style:border-color={hHex}
            style:--callout-hex={hHex}
          >
            <GroupSymbol symbol={heroGroup.symbol} color={hHex} size={22} />
            <span>{formatStudentLabel(heroCalloutStudent, allStudents, alwaysShowNumber)}</span>
          </div>
        {/if}
      {:else}
        <!-- 대기 상태 통합 빙하 위 학생 미리보기 (본체 + 최상위 이름표 분리) -->
        {#each idlePreviewStudents as item (item.st.id)}
          {@const av = avatarForStudent(item.st, classAvatarMap)}
          <StageStudent
            renderMode="body"
            studentId={item.st.id}
            label={formatStudentLabel(item.st, allStudents, alwaysShowNumber)}
            fullSrc={av.fullSrc}
            x={item.x}
            y={item.y}
            heightPx={122}
            vpScale={vp.scale}
            idleCssAnim={true}
            {elapsed}
            accentHex="#5A4336"
            {dark}
            {fontFamily}
            zIndex={4}
            {onMarkBroken}
          />
        {/each}
        {#each idlePreviewStudents as item (item.st.id)}
          {@const av = avatarForStudent(item.st, classAvatarMap)}
          <StageStudent
            renderMode="plate"
            studentId={item.st.id}
            label={formatStudentLabel(item.st, allStudents, alwaysShowNumber)}
            fullSrc={av.fullSrc}
            x={item.x}
            y={item.y}
            heightPx={122}
            vpScale={vp.scale}
            {elapsed}
            accentHex="#5A4336"
            {dark}
            {fontFamily}
            zIndex={8}
          />
        {/each}
      {/if}
      </div>
    </div>

    {#if phase === 'idle'}
      <div class="gp-stage-cta-bar">
        <button
          type="button"
          class="gp-primary-cta"
          class:preparing={preparingStage}
          disabled={!canStart || preparingStage}
          onclick={onStart}
        >
          {#if preparingStage}
            무대 준비 중…
          {:else}
            모둠 뽑기 시작 →
          {/if}
        </button>
        <span class="gp-cta-hint">{startDisabledReason || '스페이스바(Space)로 북극 빙하가 인원수에 비례해 갈라져요'}</span>
      </div>
    {/if}
  </div>
</div>
