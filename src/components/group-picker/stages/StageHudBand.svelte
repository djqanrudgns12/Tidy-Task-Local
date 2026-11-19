<script lang="ts">
  import { FastForward, TrainFront, Snowflake, Bell } from 'lucide-svelte';
  import GroupSymbol from '../../scoreboard/GroupSymbol.svelte';
  import { PALETTE } from '../../../lib/scoreboard/model.js';
  import { resolveDeepBadgeHex } from '../../../lib/group-picker/recolor.js';
  import { fitFontSize } from '../../../lib/scoreboard/fitText.js';

  const COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  let {
    phase,
    mode = 'train',
    groups,
    activeIndex = 0,
    doneAll = false,
    doneGroupIndices = undefined,
    banner,
    idleStatusText,
    fontFamily = 'Pretendard, sans-serif',
    onSkip,
  } = $props<{
    phase: 'idle' | 'running' | 'settled';
    mode?: 'train' | 'glacier' | 'elevator';
    groups: { index: number; name: string; color: string; symbol: string }[];
    activeIndex?: number;
    doneAll?: boolean;
    doneGroupIndices?: Set<number>;
    banner: {
      key?: string;
      groupIndex: number;
      groupName: string;
      groupColorId?: string;
      groupColorHex: string;
      groupSymbol: string;
      names: string[];
      customSummary: string | null;
    };
    idleStatusText: string;
    fontFamily?: string;
    onSkip?: () => void;
  }>();

  let hudW = $state(960);
  const narrowHud = $derived(hudW > 0 && hudW < 640);
  const activeGrp = $derived(groups[Math.max(0, Math.min(groups.length - 1, activeIndex))] ?? groups[0]);
  const activeGrpDeepHex = $derived(resolveDeepBadgeHex(activeGrp?.color ?? 'mint'));
  const bannerDeepHex = $derived(
    banner.groupColorId
      ? resolveDeepBadgeHex(banner.groupColorId)
      : (activeGrp && activeGrp.index === banner.groupIndex ? activeGrpDeepHex : banner.groupColorHex || '#008466'),
  );

  const showAnnouncement = $derived(
    phase === 'running' && (banner.names.length > 0 || (banner.groupIndex >= 0 && banner.customSummary)),
  );
  const bannerMainText = $derived(
    banner.names.length > 0 ? banner.names.join(' · ') : (banner.customSummary ?? idleStatusText),
  );

  // 호명 배너 비례 균형: 모둠 Deep 알약 : 학생 이름 = 0.74 : 1 (800->18:24, 1440->25:34, 1920->33:44)
  const bannerNameMax = $derived.by(() => {
    const base = narrowHud ? 24 : hudW >= 1150 ? 44 : 34;
    return banner.names.length >= 2 ? Math.round(base * 0.82) : base;
  });
  const bannerFontPx = $derived.by(() => {
    const avail = Math.max(96, hudW - (narrowHud ? 210 : 410) - (narrowHud ? 95 : 155));
    return fitFontSize(bannerMainText, {
      family: fontFamily,
      weight: 800,
      avail,
      max: bannerNameMax,
      min: 14,
    }).size;
  });
  const bannerGroupPx = $derived(Math.max(15, Math.round(bannerFontPx * 0.74)));
</script>

<header class="gp-hud-band" class:narrow={narrowHud} bind:clientWidth={hudW}>
  <div class="gp-strip-chips" role="status" aria-label="모둠 진행 상태">
    {#if narrowHud && activeGrp}
      <span
        class="gp-strip-chip active"
        style:--chip-hex={activeGrpDeepHex}
      >
        <GroupSymbol symbol={activeGrp.symbol} color="#ffffff" size={14} />
        <span>{activeGrp.name}</span>
        <span style="opacity:0.88; font-size:12px">{Math.min(activeIndex + 1, groups.length)}/{groups.length}</span>
      </span>
    {:else}
      {#each groups as g, i (g.index)}
        {@const isCurrentActive = phase === 'running' ? g.index === activeGrp?.index && !doneAll : i === 0}
        {@const done = phase === 'running' && !isCurrentActive && (doneGroupIndices ? doneGroupIndices.has(g.index) : (i < activeIndex || doneAll))}
        {@const active = isCurrentActive}
        {@const compact = groups.length >= 4 && (!active || groups.length >= 9)}
        {@const deepHex = resolveDeepBadgeHex(g.color)}
        {@const rimHex = COLOR_MAP[g.color] ?? deepHex}
        <span
          class="gp-strip-chip"
          class:compact
          class:done
          class:active
          style:--chip-hex={deepHex}
          style:--chip-rim={rimHex}
          title={g.name}
        >
          {#if compact}
            {i + 1}
          {:else}
            <GroupSymbol
              symbol={g.symbol}
              color={active ? '#ffffff' : deepHex}
              size={15}
            />
            <span>{g.name}</span>
          {/if}
        </span>
      {/each}
    {/if}
  </div>

  <div class="gp-hud-center">
    {#if showAnnouncement}
      {#key banner.key ?? bannerMainText}
        <div
          class="gp-hud-banner"
          style:--banner-hex={bannerDeepHex}
          aria-live="polite"
        >
          <span class="gp-hud-banner-group" style:background={bannerDeepHex} style:font-size={`${bannerGroupPx}px`}>
            <GroupSymbol
              symbol={banner.groupSymbol || 'star'}
              color="#ffffff"
              size={Math.max(15, Math.round(bannerGroupPx * 0.88))}
            />
            <span>{banner.groupName}</span>
          </span>
          <strong class="gp-hud-banner-name" style:font-size={`${bannerFontPx.toFixed(1)}px`}>{bannerMainText}</strong>
        </div>
      {/key}
    {:else}
      <div class="gp-hud-status gp-hud-ribbon">
        <span class="gp-hud-ribbon-icon" aria-hidden="true">
          {#if mode === 'glacier'}<Snowflake size={17} />{:else if mode === 'elevator'}<Bell size={17} />{:else}<TrainFront size={17} />{/if}
        </span>
        <span>{phase === 'running' ? bannerMainText : idleStatusText}</span>
      </div>
    {/if}
  </div>

  <div class="gp-hud-right">
    {#if phase === 'running' && onSkip}
      <button
        type="button"
        class="gp-skip-btn"
        class:icon-only={narrowHud}
        aria-label="건너뛰기"
        title="건너뛰기"
        onclick={onSkip}
      >
        <FastForward size={16} />
        {#if !narrowHud}
          <span>건너뛰기</span>
        {/if}
      </button>
    {/if}
  </div>
</header>
