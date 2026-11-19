<script lang="ts">
  import GroupSymbol from '../../scoreboard/GroupSymbol.svelte';
  import StageHudBand from './StageHudBand.svelte';
  import StageStudent from './StageStudent.svelte';
  import { createBannerTracker, idleTitle } from './stageShared.js';
  import { PALETTE } from '../../../lib/scoreboard/model.js';
  import { formatStudentLabel } from '../../../lib/group-picker/allocation.js';
  import {
    ELEVATOR_URLS,
    SHARED_URLS,
    avatarForStudent,
    resolveThemePartUrl,
  } from '../../../lib/group-picker/assets.js';
  import {
    ELEVATOR_W,
    ELEVATOR_H,
    ELEVATOR_APERTURE,
    ELEVATOR_STUDENT_BASE_H,
    rugSlotPosition,
    elevatorPoseAt,
  } from '../../../lib/group-picker/choreography/elevator.js';
  import {
    CORE_W,
    CORE_H,
    computeStageViewport,
    applyCameraPoint,
    logicalToScreen,
  } from '../../../lib/group-picker/choreography/viewport.js';

  const UI_COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  let {
    phase,
    plan = null,
    elapsed = 0,
    groups,
    participants,
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
    onOpenSetup,
    onMarkBroken,
  } = $props<{
    phase: 'idle' | 'running' | 'settled';
    plan?: any;
    elapsed?: number;
    groups: { index: number; name: string; color: string; symbol: string }[];
    participants: any[];
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
    onOpenSetup?: () => void;
    onMarkBroken: (src: string) => void;
  }>();

  let viewportEl = $state<HTMLDivElement>();
  let vpW = $state(960);
  let vpH = $state(600);
  const vp = $derived(computeStageViewport(vpW, vpH));

  const dark = $derived(scheme === 'dark');
  const studentById = $derived(Object.fromEntries(participants.map((p: any) => [p.id, p])));
  const pose = $derived(phase === 'running' && plan ? elevatorPoseAt(plan, elapsed) : null);

  const activeCar = $derived(pose ? pose.car : groups[0] ?? { index: 0, name: '1모둠', color: 'mint', symbol: 'star' });
  const activeColorHex = $derived(UI_COLOR_MAP[activeCar.color] ?? '#4FC2A0');

  // OKLab 재채색 URL 캐시 (아치 몰딩 + 좌우 엘리베이터 문짝)
  let recoloredParts = $state<Record<string, string>>({});
  $effect(() => {
    const colorIds: string[] = Array.from(new Set<string>(groups.map((g: any) => String(g.color ?? '')).filter(Boolean)));
    let cancelled = false;
    for (const cid of colorIds) {
      const specs = [
        ['elevator-arch', ELEVATOR_URLS['e1-arch-trim-base'], ELEVATOR_URLS['e1-arch-trim-mask']],
        ['elevator-door-left', ELEVATOR_URLS['e1-door-left-base'], ELEVATOR_URLS['e1-door-left-mask']],
        ['elevator-door-right', ELEVATOR_URLS['e1-door-right-base'], ELEVATOR_URLS['e1-door-right-mask']],
      ];
      for (const [partId, baseUrl, maskUrl] of specs) {
        const key = `${partId}:${cid}`;
        if (recoloredParts[key] || !baseUrl || !maskUrl) continue;
        void resolveThemePartUrl(partId, baseUrl, maskUrl, cid).then((url) => {
          if (!cancelled && url) {
            recoloredParts = { ...recoloredParts, [key]: url };
          }
        });
      }
    }
    return () => {
      cancelled = true;
    };
  });

  const archSrc = $derived(recoloredParts[`elevator-arch:${activeCar.color}`] ?? ELEVATOR_URLS['e1-arch-trim-base']);
  const doorLeftSrc = $derived(recoloredParts[`elevator-door-left:${activeCar.color}`] ?? ELEVATOR_URLS['e1-door-left-base']);
  const doorRightSrc = $derived(recoloredParts[`elevator-door-right:${activeCar.color}`] ?? ELEVATOR_URLS['e1-door-right-base']);

  const doorOpen = $derived(pose ? pose.doorOpen : 0.85);
  const gapHalf = $derived(pose ? pose.gapHalf : doorOpen * 133);
  const leftDoorRightX = $derived(ELEVATOR_APERTURE.centerX - gapHalf);
  const rightDoorLeftX = $derived(ELEVATOR_APERTURE.centerX + gapHalf);
  const gapWidth = $derived(Math.max(0, rightDoorLeftX - leftDoorRightX));

  // 상단 8m 호명 배너 (하차 또는 문틈 서프라이즈 시작 시점)
  const bannerTracker = createBannerTracker();
  let lastRunRef: any = null;
  const banner = $derived.by(() => {
    if (phase !== 'running' || !pose) {
      if (lastRunRef !== null) {
        bannerTracker.reset();
        lastRunRef = null;
      }
      return bannerTracker.update({
        mode: 'elevator',
        elapsed: 0,
        idleText: idleTitle('엘리베이터', participants.length, groups.length),
      });
    }
    if (lastRunRef !== plan) {
      bannerTracker.reset();
      lastRunRef = plan;
    }
    const activeSid = pose.exiting?.studentId ?? (pose.surprisePeek && pose.surprisePeek.peekProgress > 0.35 ? pose.surprisePeek.studentId : null);
    const st = activeSid ? studentById[activeSid] : null;
    return bannerTracker.update({
      mode: 'elevator',
      elapsed,
      idleText: pose.activeSpeech,
      candidate: st
        ? {
            key: `el-${st.id}`,
            groupIndex: activeCar.index,
            groupName: activeCar.name,
            groupColorId: activeCar.color,
            groupColorHex: activeColorHex,
            groupSymbol: activeCar.symbol,
            studentName: formatStudentLabel(st, allStudents, alwaysShowNumber),
          }
        : null,
    });
  });

  // 전경 캐릭터(arrivedPositions + exiting) Y_feet 오름차순 깊이 정렬
  const foregroundStudents = $derived.by(() => {
    if (phase !== 'running' || !pose) {
      // 대기 미리보기: 양날개 러그 위 샘플 배치 (중앙 통로 640..960 개방)
      const preview = participants.slice(0, 6);
      return preview.map((st: any, idx: number) => {
        const slot = rugSlotPosition(idx, preview.length);
        return {
          studentId: st.id,
          student: st,
          x: slot.x,
          y: slot.y,
          groundY: slot.y,
          scale: slot.scale,
          scaleX: 1,
          scaleY: 1,
          shadowScale: 1,
          shadowOpacity: 0.16,
          movingBlend: 0,
          committed: false,
        };
      });
    }
    const items: any[] = [];
    for (const ap of pose.arrivedPositions) {
      const st = studentById[ap.studentId];
      if (!st) continue;
      items.push({
        studentId: ap.studentId,
        student: st,
        x: ap.x,
        y: ap.y,
        groundY: ap.y,
        scale: ap.scale,
        scaleX: 1,
        scaleY: 1,
        shadowScale: 1,
        shadowOpacity: 0.16,
        movingBlend: 0,
        committed: true,
      });
    }
    if (pose.exiting) {
      const st = studentById[pose.exiting.studentId];
      if (st) {
        items.push({
          studentId: st.id,
          student: st,
          x: pose.exiting.x,
          y: pose.exiting.y,
          groundY: pose.exiting.groundY,
          scale: pose.exiting.scale,
          scaleX: pose.exiting.scaleX,
          scaleY: pose.exiting.scaleY,
          shadowScale: pose.exiting.shadow.scale,
          shadowOpacity: pose.exiting.shadow.opacity,
          movingBlend: 1,
          committed: false,
        });
      }
    }
    items.sort((a, b) => a.groundY - b.groundY);
    return items;
  });

  const cam = $derived(pose?.camera ?? { x: 0, y: 0, scale: 1, originX: 800, originY: 520 });
  const cabSettleY = $derived(pose?.cabSettleY ?? 0);
  const doorQuiverX = $derived(pose?.doorQuiverX ?? 0);

  export function getLaunchScreenPoint() {
    if (!viewportEl) return { x: window.innerWidth * 0.45, y: window.innerHeight * 0.48 };
    const lx = pose?.exiting?.x ?? ELEVATOR_APERTURE.centerX;
    const ly = pose?.exiting ? pose.exiting.groundY - 120 : 540;
    const camPt = applyCameraPoint(lx, ly, pose?.camera);
    return logicalToScreen(camPt.x, camPt.y, viewportEl.getBoundingClientRect(), vp);
  }

  void ELEVATOR_W;
  void ELEVATOR_H;
</script>

<div class="gp-stage-canvas" data-mode="elevator">
  <StageHudBand
    {phase}
    mode="elevator"
    {groups}
    activeIndex={pose ? pose.activeGroupIndex : 0}
    doneAll={pose ? pose.committedIds.size === participants.length : false}
    {banner}
    {fontFamily}
    idleStatusText={idleTitle('엘리베이터', participants.length, groups.length)}
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
      <!-- Z1: 금빛 부티크 엘리베이터 캐빈 내부 (개구부 666.4..932.4 × 308..770 뒤쪽 + 1F 쿠션 안착) -->
      <img
        class="gp-prop-img"
        src={ELEVATOR_URLS['e1-cabin-interior']}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:left="660px"
        style:top={`${(298 + cabSettleY).toFixed(2)}px`}
        style:width="280px"
        style:height="478px"
        style:z-index="1"
      />

      <!-- Z2: 문틈 클립 [leftDoorRightX..rightDoorLeftX × 308..770] 안쪽 승객 & 문틈 얼굴/팔 -->
      <div
        class="gp-el-gap-clip"
        style:left={`${leftDoorRightX.toFixed(1)}px`}
        style:width={`${gapWidth.toFixed(1)}px`}
      >
        {#if pose}
          {#each pose.insideCarIds as sid, idx (sid)}
            {@const st = studentById[sid]}
            {#if st}
              {@const av = avatarForStudent(st, classAvatarMap)}
              {@const cx = [748, 799.4, 850][idx] ?? 799.4}
              <StageStudent
                studentId={sid}
                label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
                fullSrc={av.fullSrc}
                x={cx - leftDoorRightX}
                y={745 - 308 + cabSettleY}
                heightPx={ELEVATOR_STUDENT_BASE_H * 0.84}
                {elapsed}
                accentHex={activeColorHex}
                showLabel={false}
                vpScale={vp.scale}
                {dark}
                {fontFamily}
                zIndex={2}
                {onMarkBroken}
              />
            {/if}
          {/each}

          {#if pose.insideCarOverflowCount > 0 && vp.scale >= 0.35}
            <div
              class="gp-plus-pill gp-el-cabin-plus"
              style:left={`${(799.4 - leftDoorRightX).toFixed(1)}px`}
            >
              +{pose.insideCarOverflowCount}명 대기
            </div>
          {/if}

          {#if pose.surprisePeek}
            {@const pst = studentById[pose.surprisePeek.studentId]}
            {#if pst}
              {@const pav = avatarForStudent(pst, classAvatarMap)}
              <!-- 문틈 사이 얼굴/눈/앞머리 (u=0.78 하차 시작 X = peekHeadX 와 정확히 일치) -->
              <StageStudent
                studentId={pst.id}
                label={formatStudentLabel(pst, allStudents, alwaysShowNumber)}
                fullSrc={pav.fullSrc}
                x={pose.surprisePeek.peekHeadX - leftDoorRightX}
                y={pose.surprisePeek.y - 308}
                heightPx={ELEVATOR_STUDENT_BASE_H * pose.surprisePeek.scale}
                {elapsed}
                accentHex={activeColorHex}
                showLabel={false}
                vpScale={vp.scale}
                {dark}
                {fontFamily}
                zIndex={2}
                {onMarkBroken}
              />
            {/if}
          {/if}
        {/if}
      </div>

      <!-- Z3: 슬라이딩 엘리베이터 문짝 (로비 포켓 [533..1066] 엄격 클립 + 안쪽 입체 테두리 + Act 3 문짝 떨림) -->
      <div class="gp-el-pocket-clip">
        <img
          class="gp-prop-img gp-el-door-leaf left"
          src={doorLeftSrc}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:left={`${(leftDoorRightX - 533 - 133 + doorQuiverX * 0.4).toFixed(1)}px`}
          style:top="0px"
          style:width="133px"
          style:height="462px"
        />
        <img
          class="gp-prop-img gp-el-door-leaf right"
          src={doorRightSrc}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:left={`${(rightDoorLeftX - 533 + doorQuiverX).toFixed(1)}px`}
          style:top="0px"
          style:width="133px"
          style:height="462px"
        />
      </div>

      <!-- Z4: 로비 마스터 껍데기 (중앙 266×462 투명 개구부, 문 포켓 100% 가림) -->
      <img
        class="gp-bleed-bg"
        src={dark ? ELEVATOR_URLS['e1-bg-dusk-tint'] : ELEVATOR_URLS['e1-lobby-shell']}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:z-index="4"
      />

      {#if dark}
        <div class="gp-dark-scrim" style:z-index="4" aria-hidden="true"></div>
      {/if}

      <!-- 문 열림 연동 금빛 로비 카펫 광선 스필 -->
      <div
        class="gp-el-light-spill"
        style:opacity={(Math.max(0, doorOpen - 0.08) * (dark ? 0.62 : 0.42)).toFixed(3)}
        style:z-index="4"
        aria-hidden="true"
      ></div>

      <!-- OKLab 아치 베젤 + 반원 다이얼 + 호출 버튼 + 모둠 명판 -->
      <img
        class="gp-prop-img"
        src={archSrc}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:left="532.6px"
        style:top="132.9px"
        style:width="532px"
        style:height="663px"
        style:z-index="4"
      />

      <!-- 벽등 글로우 좌/우 (내부 래퍼 CSS 호흡 애니메이션) -->
      <div
        class="gp-prop-img"
        style:left="404px"
        style:top="336px"
        style:width="160px"
        style:height="160px"
        style:transform="translate(-50%, -50%)"
        style:z-index="4"
      >
        <img
          class="gp-glow-sprite gp-glow-pulse"
          src={ELEVATOR_URLS['e1-sconce-glow']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:width="100%"
          style:height="100%"
          style:opacity={dark ? 0.94 : 0.36}
        />
      </div>
      <div
        class="gp-prop-img"
        style:left="1187px"
        style:top="336px"
        style:width="160px"
        style:height="160px"
        style:transform="translate(-50%, -50%)"
        style:z-index="4"
      >
        <img
          class="gp-glow-sprite gp-glow-pulse"
          src={ELEVATOR_URLS['e1-sconce-glow']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:width="100%"
          style:height="100%"
          style:opacity={dark ? 0.94 : 0.36}
          style:animation-delay="-1.1s"
        />
      </div>

      <!-- 띵동 종소리 후광 (bellRing 시) -->
      {#if pose?.bellRing && SHARED_URLS['gp-sparkle-burst']}
        <img
          class="gp-prop-img gp-sparkle-pop"
          src={SHARED_URLS['gp-sparkle-burst']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:left="800px"
          style:top="172px"
          style:width="180px"
          style:height="180px"
          style:z-index="4"
        />
      {/if}

      <!-- 반원 아날로그 다이얼 (피벗 800, 234 · 4F:-67.5° -> 1F:+67.5°) -->
      <img
        class="gp-prop-img"
        src={ELEVATOR_URLS['e1-dial-face']}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:left="682px"
        style:top="108px"
        style:width="236px"
        style:height="139px"
        style:z-index="4"
      />
      <img
        class="gp-prop-img"
        src={ELEVATOR_URLS['e1-dial-needle']}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:left="768px"
        style:top="116px"
        style:width="64px"
        style:height="140px"
        style:transform-origin="32px 118px"
        style:transform={`rotate(${(pose ? pose.dialAngleDeg : 67.5).toFixed(2)}deg)`}
        style:z-index="4"
      />

      <!-- 아치 상단 대형 크림 모둠 명판 -->
      <div
        class="gp-stage-badge gp-el-arch-plate"
        style:border-color={activeColorHex}
      >
        <GroupSymbol symbol={activeCar.symbol} color={activeColorHex} size={23} />
        <span>{activeCar.name}</span>
        {#if pose?.bellRing}
          <span class="gp-plus-pill">띵동!</span>
        {/if}
      </div>

      <!-- Z3.5: 우측 문짝 앞면을 꽉 잡은 네 손가락 (Z3 문 위, 비클립, 떨림 연동) -->
      {#if pose?.surprisePeek && pose.surprisePeek.fingersOpacity > 0.01}
        <img
          class="gp-prop-img"
          src={ELEVATOR_URLS['e1-peek-fingers']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:left={`${(pose.surprisePeek.fingersX + pose.surprisePeek.fingersSlideX + doorQuiverX).toFixed(1)}px`}
          style:top={`${pose.surprisePeek.fingersY.toFixed(1)}px`}
          style:width="72px"
          style:height="100px"
          style:opacity={pose.surprisePeek.fingersOpacity.toFixed(3)}
          style:transform="translate(-38%, -50%)"
          style:z-index="5"
        />
      {/if}

      {#if pose?.exiting?.isHolding}
        <div
          class="gp-elevator-hold-spot"
          style:left="800px"
          style:top="776px"
          style:--spot-hex={activeColorHex}
        ></div>
      {/if}

      <!-- Z6: 로비 러그 착지 완료 + 하차 이동 중 학생 (기둥·버튼 회피 472/1128 양날개, y 오름차순 깊이 정렬) -->
      {#each foregroundStudents as fs (fs.studentId)}
        {@const av = avatarForStudent(fs.student, classAvatarMap)}
        {@const isRecentHero = pose?.heroCallout?.studentId === fs.studentId}
        <StageStudent
          studentId={fs.studentId}
          label={formatStudentLabel(fs.student, allStudents, alwaysShowNumber)}
          fullSrc={av.fullSrc}
          x={fs.x}
          y={fs.y}
          groundY={fs.groundY}
          heightPx={ELEVATOR_STUDENT_BASE_H * fs.scale}
          scaleX={fs.scaleX}
          scaleY={fs.scaleY}
          walkLeanDeg={fs.walkLeanDeg ?? 0}
          shadowScale={fs.shadowScale}
          shadowOpacity={fs.shadowOpacity}
          movingBlend={fs.movingBlend}
          vpScale={vp.scale}
          isHero={fs.movingBlend > 0 || isRecentHero}
          celebrateBurst={isRecentHero}
          idleCssAnim={phase === 'idle'}
          {elapsed}
          accentHex={fs.committed ? activeColorHex : '#5A4336'}
          {dark}
          {fontFamily}
          zIndex={fs.movingBlend > 0 ? 7 : 6}
          {onMarkBroken}
        />
      {/each}

      {#if pose && pose.rugOverflowCount > 0}
        <div class="gp-queue-more-pill" style:left="1380px" style:top="768px" style:z-index="6">
          +{pose.rugOverflowCount}명 러그 합류
        </div>
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
        {#if startDisabledReason && onOpenSetup}
          <button type="button" class="gp-cta-hint clickable" onclick={onOpenSetup}>
            {startDisabledReason}
          </button>
        {:else}
          <span class="gp-cta-hint">{startDisabledReason || '띵—동! 엘리베이터 문이 열리면 우리 모둠 친구들이 걸어 나와요'}</span>
        {/if}
      </div>
    {/if}
  </div>
</div>
