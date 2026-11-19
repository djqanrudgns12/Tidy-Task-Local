<script lang="ts">
  import { FastForward } from 'lucide-svelte';
  import GroupSymbol from '../../scoreboard/GroupSymbol.svelte';
  import { PALETTE } from '../../../lib/scoreboard/model.js';
  import { fitFontSize } from '../../../lib/scoreboard/fitText.js';

  const COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  let {
    phase,
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
    groups: { index: number; name: string; color: string; symbol: string }[];
    activeIndex?: number;
    doneAll?: boolean;
    doneGroupIndices?: Set<number>;
    banner: {
      key?: string;
      groupIndex: number;
      groupName: string;
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
  const activeGrpHex = $derived(COLOR_MAP[activeGrp?.color] ?? '#4FC2A0');

  const showAnnouncement = $derived(
    phase === 'running' && (banner.names.length > 0 || (banner.groupIndex >= 0 && banner.customSummary)),
  );
  const bannerMainText = $derived(
    banner.names.length > 0 ? banner.names.join(' · ') : (banner.customSummary ?? idleStatusText),
  );

  // 가용 HUD 폭 안에서 말줄임("허··") 없이 정확히 맞추기 (1080p >= 48px scr, 800x560 scrollWidth <= clientWidth)
  const bannerFontPx = $derived.by(() => {
    const avail = Math.max(96, hudW - (narrowHud ? 210 : 410) - (narrowHud ? 95 : 155));
    const maxPx = narrowHud ? 28 : hudW >= 1100 ? 60 : 50;
    return fitFontSize(bannerMainText, {
      family: fontFamily,
      weight: 800,
      avail,
      max: maxPx,
      min: 13,
    }).size;
  });
</script>

<header class="gp-hud-band" class:narrow={narrowHud} bind:clientWidth={hudW}>
  <div class="gp-strip-chips" role="status" aria-label="모둠 진행 상태">
    {#if narrowHud && activeGrp}
      <span
        class="gp-strip-chip active"
        style:--chip-hex={activeGrpHex}
      >
        <GroupSymbol symbol={activeGrp.symbol} color="#ffffff" size={14} />
        <span>{activeGrp.name}</span>
        <span style="opacity:0.86; font-size:12px">{Math.min(activeIndex + 1, groups.length)}/{groups.length}</span>
      </span>
    {:else}
      {#each groups as g, i (g.index)}
        {@const isCurrentActive = phase === 'running' ? g.index === activeGrp?.index && !doneAll : i === 0}
        {@const done = phase === 'running' && !isCurrentActive && (doneGroupIndices ? doneGroupIndices.has(g.index) : (i < activeIndex || doneAll))}
        {@const active = isCurrentActive}
        {@const compact = groups.length >= 4 && (!active || groups.length >= 9)}
        {@const hex = COLOR_MAP[g.color] ?? '#4FC2A0'}
        <span
          class="gp-strip-chip"
          class:compact
          class:done
          class:active
          style:--chip-hex={hex}
          title={g.name}
        >
          {#if compact}
            {i + 1}
          {:else}
            <GroupSymbol
              symbol={g.symbol}
              color={active ? '#ffffff' : hex}
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
          style:--banner-hex={banner.groupColorHex || '#4FC2A0'}
          aria-live="polite"
        >
          <span class="gp-hud-banner-group">
            <GroupSymbol
              symbol={banner.groupSymbol || 'star'}
              color={banner.groupColorHex || '#4FC2A0'}
              size={narrowHud ? 16 : 22}
            />
            <span>{banner.groupName}</span>
          </span>
          <span class="gp-hud-banner-dot" aria-hidden="true">·</span>
          <strong class="gp-hud-banner-name" style:font-size={`${bannerFontPx.toFixed(1)}px`}>{bannerMainText}</strong>
        </div>
      {/key}
    {:else}
      <div class="gp-hud-status">
        {phase === 'running' ? bannerMainText : idleStatusText}
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
