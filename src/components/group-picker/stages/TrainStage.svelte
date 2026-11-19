<script lang="ts">
  import GroupSymbol from '../../scoreboard/GroupSymbol.svelte';
  import StageHudBand from './StageHudBand.svelte';
  import StageStudent from './StageStudent.svelte';
  import { createBannerTracker } from './stageShared.js';
  import { PALETTE } from '../../../lib/scoreboard/model.js';
  import { formatStudentLabel } from '../../../lib/group-picker/allocation.js';
  import { STORYBOOK_PAINT } from '../../../lib/group-picker/recolor.js';
  import {
    TRAIN_URLS,
    avatarForStudent,
    resolveThemePartUrl,
  } from '../../../lib/group-picker/assets.js';
  import {
    TRAIN_STOP_X,
    TRAIN_WHEEL_R,
    TRAIN_QUEUE_Y,
    TRAIN_STUDENT_BASE_H,
    trainGroundScale,
    queueSlotPosition,
    trainPoseAt,
  } from '../../../lib/group-picker/choreography/train.js';
  import {
    CORE_W,
    CORE_H,
    computeStageViewport,
    applyCameraPoint,
    logicalToScreen,
  } from '../../../lib/group-picker/choreography/viewport.js';

  const UI_COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));
  const WHEEL_DISPLAY = (276 * TRAIN_WHEEL_R) / 131.94; // ~75.3px (반지름 36 정합)
  const WHEEL_CENTER_Y = 671.5 - TRAIN_WHEEL_R + 2; // 637.5
  const PASSIVE_PUFFS = [0, 1];

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
    onMarkBroken: (src: string) => void;
  }>();

  let viewportEl = $state<HTMLDivElement>();
  let vpW = $state(960);
  let vpH = $state(600);
  const vp = $derived(computeStageViewport(vpW, vpH));

  const dark = $derived(scheme === 'dark');
  const studentById = $derived(Object.fromEntries(participants.map((p: any) => [p.id, p])));
  const pose = $derived(phase === 'running' && plan ? trainPoseAt(plan, elapsed) : null);
  const activeGroup = $derived(pose ? pose.car : groups[0] ?? { index: 0, name: '1모둠', color: 'mint', symbol: 'star' });
  const activeColorHex = $derived(UI_COLOR_MAP[activeGroup.color] ?? STORYBOOK_PAINT[activeGroup.color]?.hex ?? '#4FC2A0');

  // OKLab 재채색 URL 캐시 (모둠 색별 중립 열차 차체 + 좌우 문짝)
  let recoloredUrls = $state<Record<string, string>>({});
  $effect(() => {
    const colorIds: string[] = Array.from(new Set<string>(groups.map((g: any) => String(g.color ?? '')).filter(Boolean)));
    let cancelled = false;
    for (const cid of colorIds) {
      const specs = [
        ['train-body', TRAIN_URLS['t1-train-body-base'], TRAIN_URLS['t1-train-body-mask']],
        ['train-door-left', TRAIN_URLS['t1-door-left-base'], TRAIN_URLS['t1-door-left-mask']],
        ['train-door-right', TRAIN_URLS['t1-door-right-base'], TRAIN_URLS['t1-door-right-mask']],
      ];
      for (const [partId, baseUrl, maskUrl] of specs) {
        const key = `${partId}:${cid}`;
        if (recoloredUrls[key] || !baseUrl || !maskUrl) continue;
        void resolveThemePartUrl(partId, baseUrl, maskUrl, cid).then((url) => {
          if (!cancelled && url) {
            recoloredUrls = { ...recoloredUrls, [key]: url };
          }
        });
      }
    }
    return () => {
      cancelled = true;
    };
  });

  const bodySrc = $derived(recoloredUrls[`train-body:${activeGroup.color}`] ?? TRAIN_URLS['t1-train-body-base']);
  const doorLeftSrc = $derived(recoloredUrls[`train-door-left:${activeGroup.color}`] ?? TRAIN_URLS['t1-door-left-base']);
  const doorRightSrc = $derived(recoloredUrls[`train-door-right:${activeGroup.color}`] ?? TRAIN_URLS['t1-door-right-base']);

  // 상단 8m 호명 배너 상태 추적 (도약 시작 시점 + 600ms 최소 체류 + 2명 병합)
  const bannerTracker = createBannerTracker();
  let lastRunRef: any = null;
  const banner = $derived.by(() => {
    if (phase !== 'running' || !pose) {
      if (lastRunRef !== null) {
        bannerTracker.reset();
        lastRunRef = null;
      }
      return bannerTracker.update({
        mode: 'train',
        elapsed: 0,
        idleText: `햇살역 대기 승강장 · ${participants.length}명 탑승 준비`,
      });
    }
    if (lastRunRef !== plan) {
      bannerTracker.reset();
      lastRunRef = plan;
    }
    const primary = pose.boarding;
    const st = primary ? studentById[primary.studentId] : null;
    return bannerTracker.update({
      mode: 'train',
      elapsed,
      idleText: pose.activeSpeech,
      candidate: st
        ? {
            key: `tr-${st.id}`,
            groupIndex: activeGroup.index,
            groupName: activeGroup.name,
            groupColorHex: activeColorHex,
            groupSymbol: activeGroup.symbol,
            studentName: formatStudentLabel(st, allStudents, alwaysShowNumber),
          }
        : null,
    });
  });

  // 대기 중 학생 (idle 미리보기 4석 vs running 결정적 룩어헤드 4석)
  const waitItems = $derived.by(() => {
    if (phase === 'running' && pose) {
      return pose.waitingPositions
        .filter((w) => w.visible)
        .map((w) => ({
          ...w,
          student: studentById[w.studentId],
        }))
        .filter((w) => Boolean(w.student));
    }
    const scale = trainGroundScale(TRAIN_QUEUE_Y);
    return participants.slice(0, 4).map((st: any, idx: number) => ({
      studentId: st.id,
      student: st,
      x: queueSlotPosition(idx).x,
      y: TRAIN_QUEUE_Y,
      perspScale: scale,
      opacity: 1,
    }));
  });
  const hiddenWaitCount = $derived(
    phase === 'running' && pose ? pose.queueHiddenCount : Math.max(0, participants.length - 4),
  );

  // 기차 주행 좌표 (X=800 중심 정차 기준 오프셋)
  const carX = $derived(pose ? pose.carX : TRAIN_STOP_X);
  const trainDx = $derived(carX - TRAIN_STOP_X);
  const carPitchDeg = $derived(pose ? pose.carPitchDeg : 0);
  const chugBobY = $derived(pose ? pose.chugBobY : 0);
  const wheelAngleDeg = $derived(pose ? pose.wheelAngleDeg : 0);
  const crankX = $derived(Math.cos(pose ? pose.crankAngleRad : 0) * 0.55 * TRAIN_WHEEL_R);
  const crankY = $derived(Math.sin(pose ? pose.crankAngleRad : 0) * 0.55 * TRAIN_WHEEL_R);
  const openDx = $derived((pose ? pose.doorOpenRatio : 1) * 75);

  // 증기 퍼프 소스 목록
  const steamImgs = [TRAIN_URLS['t1-steam-1'], TRAIN_URLS['t1-steam-2'], TRAIN_URLS['t1-steam-3']];

  const heroCalloutStudent = $derived(pose?.heroCallout ? studentById[pose.heroCallout.studentId] : null);
  const cam = $derived(pose?.camera ?? { x: 0, y: 0, scale: 1, originX: 800, originY: 520 });

  /** 비행 티켓 발사 화면 좌표를 반환합니다 (카메라 변환 + 뷰포트 getBoundingClientRect 기준 실시간 매핑). */
  export function getLaunchScreenPoint() {
    if (!viewportEl) return { x: window.innerWidth * 0.45, y: window.innerHeight * 0.45 };
    const pt = applyCameraPoint(carX, 460, pose?.camera);
    return logicalToScreen(pt.x, pt.y, viewportEl.getBoundingClientRect(), vp);
  }
</script>

<div class="gp-stage-canvas" data-mode="train">
  <StageHudBand
    {phase}
    {groups}
    activeIndex={pose ? pose.carIndex : 0}
    doneAll={pose ? pose.committedIds.size === participants.length : false}
    {banner}
    {fontFamily}
    idleStatusText={`햇살역 승강장 · ${participants.length}명 탑승 대기 중`}
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
      <!-- Z0: 1800×1400 블리드 배경 (낮/황혼 전환) -->
      <img
        class="gp-bleed-bg"
        src={dark ? TRAIN_URLS['t1-bg-dusk'] : TRAIN_URLS['t1-bg-meadow']}
        alt=""
        aria-hidden="true"
        draggable="false"
      />

      <!-- 수채 구름 2점 (내부 래퍼에서 CSS 부유 애니메이션 수행 → 충돌 0%) -->
      <div class="gp-prop-img" style:left="160px" style:top="52px" style:width="290px" style:height="156px">
        <img
          class="gp-cloud-drift"
          src={TRAIN_URLS['t1-cloud-1']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:width="100%"
          style:height="100%"
          style:opacity={dark ? 0.55 : 0.92}
        />
      </div>
      <div class="gp-prop-img" style:left="1180px" style:top="68px" style:width="260px" style:height="188px">
        <img
          class="gp-cloud-drift slow"
          src={TRAIN_URLS['t1-cloud-2']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:width="100%"
          style:height="100%"
          style:opacity={dark ? 0.55 : 0.92}
        />
      </div>

      <!-- 역 지붕·시계·현판 (뒷단) -->
      <img
        class="gp-prop-img"
        src={TRAIN_URLS['t1-station-back']}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:left="430px"
        style:top="190px"
        style:width="1096px"
        style:height="498px"
      />
      <div class="gp-t1-signboard" aria-hidden="true">
        <span>햇살역</span>
        <small>승강장</small>
      </div>

      <!-- 다크 모드 정적 야경 오버레이 (캐릭터 아래) -->
      {#if dark}
        <div class="gp-dark-scrim" aria-hidden="true"></div>
      {/if}

      <!-- Z1~Z4: 모둠 열차 주행 그룹 -->
      <div
        class="gp-train-mover"
        style:transform={`translate3d(${trainDx.toFixed(1)}px, 0, 0)`}
      >
        <!-- 차체 피칭 바깥쪽 바퀴 & 연결봉 (레일 이탈 0px) -->
        {#each [186, 294, 492, 588, 996, 1092] as wx (wx)}
          <img
            class="gp-prop-img gp-train-wheel"
            src={TRAIN_URLS['t1-wheel']}
            alt=""
            aria-hidden="true"
            draggable="false"
            style:left={`${wx}px`}
            style:top={`${WHEEL_CENTER_Y}px`}
            style:width={`${WHEEL_DISPLAY.toFixed(1)}px`}
            style:height={`${WHEEL_DISPLAY.toFixed(1)}px`}
            style:transform={`translate(-50%, -50%) rotate(${wheelAngleDeg.toFixed(2)}deg)`}
          />
        {/each}
        {#each [240, 540, 1044] as rx (rx)}
          <img
            class="gp-prop-img"
            src={TRAIN_URLS['t1-rod']}
            alt=""
            aria-hidden="true"
            draggable="false"
            style:left={`${rx + crankX}px`}
            style:top={`${WHEEL_CENTER_Y + crankY}px`}
            style:width="156px"
            style:height="27px"
            style:transform="translate(-50%, -50%)"
          />
        {/each}

        <!-- 차체 피칭 + 레일 서스펜션 바운스 wrapper (바퀴와 분리 → 레일 틈 0px) -->
        <div
          class="gp-train-pitch"
          style:transform={`translate3d(0, ${chugBobY.toFixed(2)}px, 0) rotate(${carPitchDeg.toFixed(3)}deg)`}
        >
          <!-- 증기 퍼프 (idle 시 기관차 연통 2점 은은한 연기, 주행 시 3~5점 분출) -->
          {#if pose && pose.steamPuffs.length > 0}
            {#each pose.steamPuffs as puff (puff.idx)}
              <img
                class="gp-prop-img"
                src={steamImgs[puff.idx % steamImgs.length]}
                alt=""
                aria-hidden="true"
                draggable="false"
                style:left={`${(108 + (puff.x - (carX - 420))).toFixed(1)}px`}
                style:top={`${(puff.y + 72).toFixed(1)}px`}
                style:width={`${(130 * puff.scale).toFixed(1)}px`}
                style:height="auto"
                style:opacity={puff.opacity.toFixed(3)}
                style:transform="translate(-50%, -50%)"
              />
            {/each}
          {:else if phase === 'idle'}
            {#each PASSIVE_PUFFS as pi (pi)}
              <img
                class="gp-prop-img gp-idle-steam"
                src={steamImgs[pi]}
                alt=""
                aria-hidden="true"
                draggable="false"
                style:left="108px"
                style:top="418px"
                style:width="92px"
                style:height="auto"
                style:animation-delay={`${pi * -1.4}s`}
              />
            {/each}
          {/if}

          <img
            class="gp-prop-img"
            src={TRAIN_URLS['t1-locomotive']}
            alt=""
            aria-hidden="true"
            draggable="false"
            style:left="16px"
            style:top="454px"
            style:width="376px"
            style:height="193px"
            style:z-index="1"
          />

          <!-- Z1: 객차 좌/우 유리창 배경 + 탑승객 실루엣 (bodySrc z4 뒤쪽에 엄격 클립) -->
          <div class="gp-train-win-clip" style:left="431px" style:top="403px" style:width="62px" style:height="74px">
            {#if pose}
              {#each pose.inCarStudentIds.slice(3, 5) as sid, wi (sid)}
                {@const st = studentById[sid]}
                {#if st}
                  {@const av = avatarForStudent(st, classAvatarMap)}
                  <StageStudent
                    studentId={sid}
                    label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
                    fullSrc={av.fullSrc}
                    x={22 + wi * 20}
                    y={74}
                    heightPx={64}
                    {elapsed}
                    accentHex={activeColorHex}
                    showLabel={false}
                    silhouette={true}
                    {dark}
                    {fontFamily}
                    zIndex={2}
                    {onMarkBroken}
                  />
                {/if}
              {/each}
            {/if}
          </div>
          <div class="gp-train-win-clip" style:left="1111px" style:top="403px" style:width="56px" style:height="74px">
            {#if pose}
              {#each pose.inCarStudentIds.slice(5, 7) as sid, wi (sid)}
                {@const st = studentById[sid]}
                {#if st}
                  {@const av = avatarForStudent(st, classAvatarMap)}
                  <StageStudent
                    studentId={sid}
                    label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
                    fullSrc={av.fullSrc}
                    x={20 + wi * 18}
                    y={74}
                    heightPx={64}
                    {elapsed}
                    accentHex={activeColorHex}
                    showLabel={false}
                    silhouette={true}
                    {dark}
                    {fontFamily}
                    zIndex={2}
                    {onMarkBroken}
                  />
                {/if}
              {/each}
            {/if}
          </div>

          <!-- Z1: 객차 중앙 문 개구부 내부 배경 (실측 개구부 정합) -->
          <img
            class="gp-prop-img"
            src={TRAIN_URLS['t1-cabin-interior']}
            alt=""
            aria-hidden="true"
            draggable="false"
            style:left="706px"
            style:top="376px"
            style:width="188px"
            style:height="250px"
            style:z-index="1"
          />

          <!-- Z2: 이미 탑승한 학생 (문 정면 3석) & behindDoor 도약 중인 학생 -->
          {#if pose}
            {#each pose.inCarStudentIds.slice(0, 3) as sid, idx (sid)}
              {@const st = studentById[sid]}
              {#if st}
                {@const av = avatarForStudent(st, classAvatarMap)}
                {@const seatCoords = [
                  { x: 766, y: 616, h: 156 },
                  { x: 800, y: 616, h: 156 },
                  { x: 834, y: 616, h: 156 },
                ][idx]}
                <StageStudent
                  studentId={sid}
                  label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
                  fullSrc={av.fullSrc}
                  x={seatCoords.x}
                  y={seatCoords.y}
                  heightPx={seatCoords.h}
                  {elapsed}
                  accentHex={activeColorHex}
                  showLabel={false}
                  silhouette={false}
                  {dark}
                  {fontFamily}
                  zIndex={2}
                  {onMarkBroken}
                />
              {/if}
            {/each}

            {#each pose.activeBoardings as ab (ab.studentId)}
              {#if ab.behindDoor}
                {@const st = studentById[ab.studentId]}
                {#if st}
                  {@const av = avatarForStudent(st, classAvatarMap)}
                  <StageStudent
                    studentId={ab.studentId}
                    label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
                    fullSrc={av.fullSrc}
                    x={ab.x}
                    y={ab.y}
                    groundY={ab.groundY}
                    heightPx={TRAIN_STUDENT_BASE_H * ab.perspScale}
                    scaleX={ab.scaleX}
                    scaleY={ab.scaleY}
                    walkLeanDeg={ab.walkLeanDeg}
                    shadowScale={ab.shadow.scale}
                    shadowOpacity={ab.shadow.opacity}
                    movingBlend={1}
                    {elapsed}
                    accentHex={activeColorHex}
                    showLabel={false}
                    vpScale={vp.scale}
                    celebrateBurst={ab.u >= 0.72 && ab.u <= 0.96}
                    {dark}
                    {fontFamily}
                    zIndex={2}
                    {onMarkBroken}
                  />
                {/if}
              {/if}
            {/each}
          {/if}

          <!-- Z3: 슬라이딩 문짝 (실측 개구부 [719..881] 엄격 클립 + bodySrc z4 뒤에 숨음 → 직사각형 이음새 0px) -->
          <div class="gp-train-door-clip">
            <img
              class="gp-prop-img"
              src={doorLeftSrc}
              alt=""
              aria-hidden="true"
              draggable="false"
              style:left={`${(-openDx).toFixed(1)}px`}
              style:top="0px"
              style:width="81px"
              style:height="247px"
            />
            <img
              class="gp-prop-img"
              src={doorRightSrc}
              alt=""
              aria-hidden="true"
              draggable="false"
              style:left={`${(81 + openDx).toFixed(1)}px`}
              style:top="0px"
              style:width="81px"
              style:height="247px"
            />
          </div>

          <!-- Z4: OKLab 동화 페인트 객차 본체 (문틀 포켓과 창문 바깥쪽을 완벽히 감쌈) -->
          <img
            class="gp-prop-img"
            src={bodySrc}
            alt={`${activeGroup.name} 객차`}
            draggable="false"
            style:left="375.3px"
            style:top="278.9px"
            style:width="848.6px"
            style:height="374.7px"
            style:z-index="4"
            onerror={() => onMarkBroken(bodySrc)}
          />

          <!-- Z4.2: 객차 지붕 대형 모둠 명판 (#FFFDF9 + #192F28 + 3.5px 모둠 원색 테두리 + 심볼) -->
          <div
            class="gp-stage-badge gp-train-car-plate"
            style:border-color={activeColorHex}
          >
            <GroupSymbol symbol={activeGroup.symbol} color={activeColorHex} size={26} />
            <span>{activeGroup.name}</span>
            {#if pose && pose.overflowInCarCount > 0}
              <span class="gp-plus-pill">+{pose.overflowInCarCount}</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Z4.5: 전경 역 기둥(X 1169..1289 → 열차 꼬리가 뒤로 자연스럽게 지나감) + 승강장 바닥 -->
      <img
        class="gp-prop-img"
        src={TRAIN_URLS['t1-station-fg']}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:left="1169px"
        style:top="228px"
        style:width="120px"
        style:height="462px"
        style:z-index="4"
      />
      <img
        class="gp-prop-img"
        src={TRAIN_URLS['t1-platform-fg']}
        alt=""
        aria-hidden="true"
        draggable="false"
        style:left="-100px"
        style:top="690px"
        style:width="1800px"
        style:height="51px"
        style:z-index="4"
      />

      <!-- Straight Alpha 미리 구운 등불 글로우 (내부 래퍼 CSS 호흡 애니메이션) -->
      <div
        class="gp-prop-img"
        style:left="600px"
        style:top="320px"
        style:width="140px"
        style:height="140px"
        style:transform="translate(-50%, -50%)"
        style:z-index="4"
      >
        <img
          class="gp-glow-sprite gp-glow-pulse"
          src={TRAIN_URLS['t1-lantern-glow']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:width="100%"
          style:height="100%"
          style:opacity={dark ? 0.94 : 0.34}
        />
      </div>
      <div
        class="gp-prop-img"
        style:left="1213px"
        style:top="340px"
        style:width="148px"
        style:height="148px"
        style:transform="translate(-50%, -50%)"
        style:z-index="4"
      >
        <img
          class="gp-glow-sprite gp-glow-pulse"
          src={TRAIN_URLS['t1-lantern-glow']}
          alt=""
          aria-hidden="true"
          draggable="false"
          style:width="100%"
          style:height="100%"
          style:opacity={dark ? 0.94 : 0.34}
          style:animation-delay="-1.1s"
        />
      </div>

      <!-- Z5: 승강장 여유 4석 대기줄 + 우측 외 N명 배지 + 라이벌 + 문턱 앞 도약(behindDoor=false) -->
      {#each waitItems as item (item.studentId)}
        {@const av = avatarForStudent(item.student, classAvatarMap)}
        <StageStudent
          studentId={item.studentId}
          label={formatStudentLabel(item.student, allStudents, alwaysShowNumber)}
          fullSrc={av.fullSrc}
          x={item.x}
          y={item.y}
          heightPx={TRAIN_STUDENT_BASE_H * item.perspScale}
          opacity={item.opacity}
          showLabel={item.opacity >= 0.72}
          labelMaxWOverride={148}
          vpScale={vp.scale}
          idleCssAnim={phase === 'idle'}
          {elapsed}
          accentHex="#5A4336"
          {dark}
          {fontFamily}
          zIndex={5}
          {onMarkBroken}
        />
      {/each}

      {#if hiddenWaitCount > 0}
        <div
          class="gp-queue-more-pill"
          style:left={phase === 'idle' ? '786px' : '782px'}
          style:top={phase === 'idle' ? '722px' : '824px'}
        >
          외 {hiddenWaitCount}명 대기 중
        </div>
      {/if}

      {#if pose}
        {#each pose.activeBoardings as ab (ab.studentId)}
          {#if ab.rivalPose}
            {@const rst = studentById[ab.rivalPose.studentId]}
            {#if rst}
              {@const rav = avatarForStudent(rst, classAvatarMap)}
              <StageStudent
                studentId={rst.id}
                label={formatStudentLabel(rst, allStudents, alwaysShowNumber)}
                fullSrc={rav.fullSrc}
                x={ab.rivalPose.x}
                y={ab.rivalPose.y}
                groundY={ab.rivalPose.groundY}
                heightPx={TRAIN_STUDENT_BASE_H * ab.rivalPose.perspScale}
                walkLeanDeg={ab.rivalPose.walkLeanDeg}
                shadowScale={ab.rivalPose.shadow.scale}
                shadowOpacity={ab.rivalPose.shadow.opacity}
                movingBlend={1}
                showLabel={ab.rivalPose.x >= 700}
                vpScale={vp.scale}
                {elapsed}
                accentHex="#5A4336"
                {dark}
                {fontFamily}
                zIndex={5}
                {onMarkBroken}
              />
            {/if}
          {/if}

          {#if !ab.behindDoor}
            {@const st = studentById[ab.studentId]}
            {#if st}
              {@const av = avatarForStudent(st, classAvatarMap)}
              <StageStudent
                studentId={ab.studentId}
                label={formatStudentLabel(st, allStudents, alwaysShowNumber)}
                fullSrc={av.fullSrc}
                x={ab.x}
                y={ab.y}
                groundY={ab.groundY}
                heightPx={TRAIN_STUDENT_BASE_H * ab.perspScale}
                scaleX={ab.scaleX}
                scaleY={ab.scaleY}
                walkLeanDeg={ab.walkLeanDeg}
                shadowScale={ab.shadow.scale}
                shadowOpacity={ab.shadow.opacity}
                movingBlend={1}
                showLabel={ab.u <= 0.08 || ab.x >= 710}
                vpScale={vp.scale}
                isHero={true}
                celebrateBurst={ab.u >= 0.68 && ab.u <= 0.96}
                {elapsed}
                accentHex={activeColorHex}
                {dark}
                {fontFamily}
                zIndex={6}
                {onMarkBroken}
              />
            {/if}
          {/if}
        {/each}

        {#if pose.heroCallout && heroCalloutStudent}
          <div
            class="gp-hero-callout"
            style:left="800px"
            style:top="224px"
            style:border-color={activeColorHex}
            style:--callout-hex={activeColorHex}
          >
            <GroupSymbol symbol={activeGroup.symbol} color={activeColorHex} size={22} />
            <span>{formatStudentLabel(heroCalloutStudent, allStudents, alwaysShowNumber)}</span>
          </div>
        {/if}
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
        <span class="gp-cta-hint">{startDisabledReason || '스페이스바(Space)로 바로 출발할 수 있어요'}</span>
      </div>
    {/if}
  </div>
</div>
