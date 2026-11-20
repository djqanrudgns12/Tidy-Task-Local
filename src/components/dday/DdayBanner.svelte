<script>
  import { tick } from 'svelte';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { appState } from '../../lib/appState.svelte.js';
  import {
    computeDdayCounter,
    computeProgressPercent,
    formatDotDate,
    resolveToneColor,
  } from '../../lib/dday/ddayModel.js';
  import { badgePaletteToStyle, resolveTodoBadgeModel } from '../../lib/dday/ddayBadge.js';
  import DdayIcon from './DdayIcon.svelte';

  /**
   * @type {{
   *   items?: import('../../lib/dday/ddayModel.js').DdayItem[],
   *   mode?: import('../../lib/dday/ddayModel.js').DdayBannerMode,
   *   todayKey?: string,
   *   themeColor?: string,
   *   accent?: string,
   *   dark?: boolean,
   *   compact?: boolean,
   *   onselect?: (ddayId: string) => void,
   *   onmanage?: () => void,
   * }}
   */
  let {
    items = undefined,
    mode = undefined,
    todayKey = undefined,
    themeColor = undefined,
    accent = undefined,
    dark = undefined,
    compact = false,
    onselect = undefined,
    onmanage = undefined,
  } = $props();

  const resolvedDark = $derived(dark ?? appState.isDarkMode);
  const resolvedThemeColor = $derived(themeColor ?? appState.themeColor);
  const resolvedAccent = $derived(accent ?? appState.getThemeAccentColor());
  const resolvedToday = $derived(todayKey ?? appState.todayKey);
  const resolvedMode = $derived(mode ?? appState.ddayBannerMode);
  const resolvedItems = $derived.by(() => {
    const src = items ?? appState.bannerDdays;
    return (src || []).filter((d) => d.status === 'active' && d.showInBanner);
  });

  const visible = $derived(resolvedMode !== 'hidden' && resolvedItems.length > 0);
  const effectiveMode = $derived(
    !visible ? 'hidden' : resolvedMode === 'bento' && resolvedItems.length >= 2 ? 'bento' : 'single',
  );

  let focusIdx = $state(0);
  let bentoPage = $state(0);

  $effect(() => {
    if (focusIdx >= resolvedItems.length) focusIdx = 0;
    const totalPages = Math.max(1, Math.ceil(resolvedItems.length / 2));
    if (bentoPage >= totalPages) bentoPage = 0;
  });

  // 배너가 열리거나 접힐 때, 1줄 <-> 2열 모드가 바뀔 때 MemoLayout 높이를 즉시 재계산합니다.
  $effect(() => {
    const _layoutKey = `${effectiveMode}:${resolvedItems.length > 0}`;
    if (compact) return;
    void tick().then(() => {
      window.dispatchEvent(new CustomEvent('tidy-dday-banner-layout', { detail: _layoutKey }));
    });
    return () => {
      void tick().then(() => {
        window.dispatchEvent(new CustomEvent('tidy-dday-banner-layout', { detail: 'unmount' }));
      });
    };
  });

  const singleItem = $derived(resolvedItems[focusIdx] ?? resolvedItems[0] ?? null);
  const bentoTotalPages = $derived(Math.max(1, Math.ceil(resolvedItems.length / 2)));
  const bentoPair = $derived(resolvedItems.slice(bentoPage * 2, bentoPage * 2 + 2));

  /** @param {string} id */
  function openItem(id) {
    if (onselect) onselect(id);
    else void appState.openDdayControl({ focusDdayId: id });
  }

  function openManager() {
    if (onmanage) onmanage();
    else void appState.openDdayControl({ initialTab: 'list' });
  }

  /** @param {Event} e @param {-1 | 1} dir */
  function cycleSingle(e, dir) {
    e.stopPropagation();
    const len = resolvedItems.length;
    if (len < 2) return;
    focusIdx = (focusIdx + dir + len) % len;
  }

  /** @param {Event} e @param {number} page */
  function setPage(e, page) {
    e.stopPropagation();
    bentoPage = page;
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="b3-wrap"
    class:compact
    data-scheme={resolvedDark ? 'dark' : 'light'}
    data-dday-surface={compact ? undefined : 'banner'}
    data-dday-fallback-id={compact ? undefined : (singleItem?.id || bentoPair[0]?.id || resolvedItems[0]?.id || '')}
    oncontextmenu={(e) => { if (compact) e.preventDefault(); }}
  >
    {#if effectiveMode === 'single' && singleItem}
      {@const toneColor = resolveToneColor(singleItem.tone, resolvedAccent)}
      {@const counter = computeDdayCounter(singleItem, resolvedToday)}
      {@const progress = computeProgressPercent(singleItem, resolvedToday)}
      {@const badge = resolveTodoBadgeModel(singleItem, resolvedToday, {
        themeColor: resolvedThemeColor,
        dark: resolvedDark,
      })}
      <div
        class="b3-card"
        data-scheme={resolvedDark ? 'dark' : 'light'}
        data-dday-id={compact ? undefined : singleItem.id}
        data-dday-surface={compact ? undefined : 'banner'}
        style="--dd-tone: {toneColor}; --dd-accent: {resolvedAccent};"
      >
        <div class="b3-main-row">
          <button
            type="button"
            class="b3-chip-btn"
            class:is-dashed={badge.dashed}
            class:is-solid={badge.palette.solid}
            class:is-today={badge.badgeKind === 'countdown-today'}
            data-scheme={resolvedDark ? 'dark' : 'light'}
            style={badgePaletteToStyle(badge.palette)}
            onclick={() => openItem(singleItem.id)}
            title={badge.title}
            aria-label={`${singleItem.title}, ${badge.ariaLabel}`}
          >
            <span class="b3-chip-icon" aria-hidden="true">
              <DdayIcon
                icon={singleItem.icon}
                tone={singleItem.tone}
                accent={resolvedAccent}
                size="calc(13px * var(--dd-s, 1))"
                dark={resolvedDark}
                variant="bare"
              />
            </span>
            <span class="b3-chip-label tnum">{badge.label}</span>
          </button>

          <button
            type="button"
            class="b3-body-btn"
            onclick={() => openItem(singleItem.id)}
            title={`${singleItem.title} · ${formatDotDate(counter.effectiveDate)}`}
          >
            <span class="b3-title">{singleItem.title}</span>
            <span class="b3-date tnum">{formatDotDate(counter.effectiveDate)}</span>
          </button>

          {#if resolvedItems.length > 1}
            <div class="b3-nav" role="group" aria-label="D-Day 전환">
              <button type="button" class="b3-nav-btn" aria-label="이전 D-Day" onclick={(e) => cycleSingle(e, -1)}>
                <ChevronLeft size="0.85em" />
              </button>
              <span class="b3-nav-count tnum">{focusIdx + 1}/{resolvedItems.length}</span>
              <button type="button" class="b3-nav-btn" aria-label="다음 D-Day" onclick={(e) => cycleSingle(e, 1)}>
                <ChevronRight size="0.85em" />
              </button>
            </div>
          {/if}
        </div>
        <div class="b3-track" aria-hidden="true">
          <div class="b3-fill" style="width: {progress}%;"></div>
        </div>
      </div>
    {:else if effectiveMode === 'bento'}
      <div class="b3-bento-shell">
        <div class="b3-bento">
          {#each bentoPair as item (item.id)}
            {@const toneColor = resolveToneColor(item.tone, resolvedAccent)}
            {@const counter = computeDdayCounter(item, resolvedToday)}
            {@const progress = computeProgressPercent(item, resolvedToday)}
            {@const badge = resolveTodoBadgeModel(item, resolvedToday, {
              themeColor: resolvedThemeColor,
              dark: resolvedDark,
            })}
            <button
              type="button"
              class="b3-mini-card"
              data-scheme={resolvedDark ? 'dark' : 'light'}
              data-dday-id={compact ? undefined : item.id}
              data-dday-surface={compact ? undefined : 'banner'}
              style="--dd-tone: {toneColor};"
              onclick={() => openItem(item.id)}
              title={`${item.title} (${formatDotDate(counter.effectiveDate)})`}
            >
              <span class="b3-mini-top">
                <span class="b3-mini-ttl">{item.title}</span>
                <span
                  class="b3-mini-badge"
                  class:is-dashed={badge.dashed}
                  style={badgePaletteToStyle(badge.palette)}
                >
                  <span class="b3-mini-badge-label tnum">{badge.label}</span>
                </span>
              </span>
              <span class="b3-track"><span class="b3-fill" style="width: {progress}%;"></span></span>
            </button>
          {/each}
        </div>
        <div class="b3-bento-foot">
          <div class="b3-dots" role="tablist" aria-label="D-Day 페이지">
            {#each Array.from({ length: bentoTotalPages }, (_, i) => i) as page}
              <button
                type="button"
                class="b3-dot"
                class:on={bentoPage === page}
                aria-label={`${page + 1}페이지`}
                onclick={(e) => setPage(e, page)}
              ></button>
            {/each}
          </div>
          <button type="button" class="b3-ctrl-link" onclick={openManager}>
            <span class="tnum">전체 {resolvedItems.length}건 관리</span>
            <ChevronRight size="0.85em" />
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* 배너 글자·칩 크기는 화면 글자 크기(설정 → 글자 → 화면 글자)를 따라갑니다.
     왜 배율을 0.8~1.5로 묶는가: 6pt처럼 아주 작게 고르면 D-Day 숫자 칩이 읽을 수 없을 만큼 작아지고,
     너무 크면 메모 창 머리 영역을 배너가 다 차지하기 때문입니다. (--ui-font-scale = 화면 글자 pt / 10, App.svelte) */
  .b3-wrap {
    --dd-s: clamp(0.8, var(--ui-font-scale, 1), 1.5);
    container-type: inline-size;
    padding: 5px 10px 6px;
    border-top: 1px solid var(--header-line, rgba(15, 23, 42, 0.08));
    flex-shrink: 0;
  }
  .b3-wrap.compact {
    padding: 0;
    border-top: 0;
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .b3-card {
    border-radius: 11px;
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--dd-tone) 7%, var(--dd-ctrl-surface, #ffffff)) 0%,
      var(--dd-ctrl-surface, #ffffff) 100%
    );
    border: 1px solid color-mix(in srgb, var(--dd-tone) 22%, var(--dd-ctrl-line, rgba(15, 23, 42, 0.08)));
    box-shadow: 0 2px 8px color-mix(in srgb, var(--dd-tone) 9%, transparent);
    padding: 5px 8px 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }
  .b3-card[data-scheme='dark'] {
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--dd-tone) 14%, var(--dd-ctrl-surface, #252935)) 0%,
      var(--dd-ctrl-surface, #20242e) 100%
    );
    border-color: color-mix(in srgb, var(--dd-tone) 28%, var(--dd-ctrl-line, rgba(255, 255, 255, 0.1)));
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
  }

  .b3-main-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .b3-chip-btn {
    --dd-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3.5px;
    height: calc(22px * var(--dd-s));
    padding: 0 7px 0 4.5px;
    border-radius: 999px;
    border: 1px solid var(--dd-border);
    background-color: var(--dd-bg);
    color: var(--dd-ink);
    /* 할 일 스마트 칩(DdayTodoChip)과 동일한 아래쪽 안쪽 딱지 받침으로 규격을 통일합니다. */
    box-shadow: inset 0 -1.5px 0 var(--dd-rim);
    font-family: var(--ui-font-family);
    font-size: calc(10.5px * var(--dd-s));
    font-weight: 800;
    line-height: 1;
    flex-shrink: 0;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    box-sizing: border-box;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      transform 200ms var(--dd-spring);
  }
  .b3-chip-btn.is-dashed {
    border-style: dashed;
  }
  .b3-chip-btn:hover {
    background-color: var(--dd-hover-bg);
    border-color: var(--dd-hover-border);
    transform: translateY(-0.5px) scale(1.03);
  }
  .b3-chip-btn:active {
    transform: scale(1.02, 0.92);
    transition-duration: 140ms, 140ms, 90ms;
  }
  .b3-chip-btn:focus-visible {
    outline: 2px solid var(--dd-focus);
    outline-offset: 1.5px;
  }
  .b3-chip-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: calc(13px * var(--dd-s));
    height: calc(13px * var(--dd-s));
    flex: none;
    /* 하단 1.5px 딱지 림을 제외한 칩 표면에 시각 중앙으로 놓습니다. */
    transform: translateY(-0.5px);
  }
  /* 당일(D-Day) 솔리드 강조 칩 위에서도 21종 커스텀 스티커의 줄기·윤곽이 묻히지 않게 대비를 보정합니다. */
  .b3-chip-btn.is-solid[data-scheme='light'] .b3-chip-icon :global(.dday-bare) {
    --dd-stem: #fffdf8;
    filter: drop-shadow(0 0.5px 0.8px rgba(0, 0, 0, 0.28));
  }
  .b3-chip-btn.is-solid[data-scheme='dark'] .b3-chip-icon :global(.dday-bare) {
    --dd-stem: #3c3431;
    filter: none;
  }
  .b3-chip-label {
    display: inline-block;
    line-height: 1;
    /* 한글 폰트 em-box의 하단 descender 공백으로 글자가 위로 뜨는 현상을 실측 기준으로 광학 보정합니다. */
    transform: translateY(var(--dd-label-nudge, 0.065em));
  }

  .b3-body-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .b3-title {
    flex: 1;
    min-width: 0;
    font-family: var(--global-font-family, var(--ui-font-family, 'Maplestory', sans-serif));
    font-size: calc(min(12px, max(10.5px, 3.8cqi)) * var(--dd-s));
    font-weight: 700;
    color: var(--dd-ctrl-ink, #1f2430);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .b3-card[data-scheme='dark'] .b3-title { color: var(--dd-ctrl-ink, #e8edf5); }

  .b3-date {
    font-size: calc(9.5px * var(--dd-s));
    font-weight: 600;
    color: var(--dd-ctrl-sub, #646e7d);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .b3-card[data-scheme='dark'] .b3-date { color: var(--dd-ctrl-sub, #9ca7b8); }

  .b3-nav {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 1px 3px;
    border-radius: 7px;
    background: rgba(15, 23, 42, 0.045);
    flex-shrink: 0;
  }
  .b3-card[data-scheme='dark'] .b3-nav { background: rgba(255, 255, 255, 0.07); }
  .b3-nav-btn {
    width: calc(16px * var(--dd-s));
    height: calc(16px * var(--dd-s));
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #646e7d;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .b3-nav-btn:hover { background: rgba(15, 23, 42, 0.08); color: #1f2430; }
  .b3-card[data-scheme='dark'] .b3-nav-btn { color: #aeb9c9; }
  .b3-card[data-scheme='dark'] .b3-nav-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
  .b3-nav-count {
    font-size: calc(9px * var(--dd-s));
    font-weight: 700;
    color: #646e7d;
    padding: 0 2px;
  }
  .b3-card[data-scheme='dark'] .b3-nav-count { color: #aeb9c9; }

  .b3-track {
    display: block;
    width: 100%;
    height: 3px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--dd-tone) 15%, rgba(15, 23, 42, 0.04));
    overflow: hidden;
  }
  .b3-card[data-scheme='dark'] .b3-track,
  .b3-mini-card[data-scheme='dark'] .b3-track {
    background: color-mix(in srgb, var(--dd-tone) 22%, rgba(255, 255, 255, 0.08));
  }
  .b3-fill {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--dd-tone) 68%, #ffffff), var(--dd-tone));
  }

  /* Bento 2-Col Mini Cards */
  .b3-bento-shell { display: flex; flex-direction: column; gap: 4px; }
  .b3-bento { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .b3-mini-card {
    border-radius: 10px;
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--dd-tone) 8%, var(--dd-ctrl-surface, #ffffff)) 0%,
      var(--dd-ctrl-surface, #ffffff) 100%
    );
    border: 1px solid color-mix(in srgb, var(--dd-tone) 22%, var(--dd-ctrl-line, rgba(15, 23, 42, 0.07)));
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
    padding: 5px 7px 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    cursor: pointer;
    text-align: left;
  }
  .b3-mini-card[data-scheme='dark'] {
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--dd-tone) 15%, var(--dd-ctrl-surface, #252935)) 0%,
      var(--dd-ctrl-surface, #20242e) 100%
    );
    border-color: color-mix(in srgb, var(--dd-tone) 30%, var(--dd-ctrl-line, rgba(255, 255, 255, 0.1)));
  }
  .b3-mini-card:hover { border-color: var(--dd-tone); }
  .b3-mini-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    min-width: 0;
  }
  .b3-mini-ttl {
    flex: 1;
    min-width: 0;
    font-family: var(--global-font-family, var(--ui-font-family, 'Maplestory', sans-serif));
    font-size: calc(10.5px * var(--dd-s));
    font-weight: 700;
    color: var(--dd-ctrl-ink, #1f2430);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .b3-mini-card[data-scheme='dark'] .b3-mini-ttl { color: var(--dd-ctrl-ink, #e8edf5); }
  .b3-mini-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: calc(18px * var(--dd-s));
    padding: 0 5.5px;
    border-radius: 999px;
    border: 1px solid var(--dd-border);
    background-color: var(--dd-bg);
    color: var(--dd-ink);
    box-shadow: inset 0 -1px 0 var(--dd-rim);
    font-family: var(--ui-font-family);
    font-size: calc(9px * var(--dd-s));
    font-weight: 800;
    line-height: 1;
    flex-shrink: 0;
    white-space: nowrap;
    box-sizing: border-box;
  }
  .b3-mini-badge.is-dashed {
    border-style: dashed;
  }
  .b3-mini-badge-label {
    display: inline-block;
    line-height: 1;
    transform: translateY(var(--dd-label-nudge, 0.065em));
  }

  @media (prefers-reduced-motion: reduce) {
    .b3-chip-btn {
      transition: background-color 140ms ease, border-color 140ms ease;
    }
    .b3-chip-btn:hover,
    .b3-chip-btn:active {
      transform: none;
    }
  }

  .b3-bento-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1px 2px 0;
  }
  .b3-dots { display: flex; align-items: center; gap: 4px; }
  .b3-dot {
    width: 5px;
    height: 5px;
    border: 0;
    padding: 0;
    border-radius: 50%;
    background: rgba(100, 116, 139, 0.28);
    cursor: pointer;
    transition: width 150ms ease, background-color 150ms ease;
  }
  .b3-dot.on {
    width: 13px;
    border-radius: 99px;
    background: var(--header-accent, #d97706);
  }
  .b3-ctrl-link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    border: 0;
    padding: 1px 4px;
    border-radius: 5px;
    background: transparent;
    font-size: calc(9.5px * var(--dd-s));
    font-weight: 700;
    color: var(--header-accent, #d97706);
    cursor: pointer;
  }
  .b3-ctrl-link:hover { background: var(--header-tint, rgba(217, 119, 6, 0.08)); }

  @container (max-width: 295px) {
    .b3-date { display: none; }
  }
</style>
