<script>
  import { onMount } from 'svelte';
  import {
    ArrowUpDown,
    Check,
    LayoutGrid,
    ListTodo,
    PanelTop,
    Pencil,
    Repeat,
  } from 'lucide-svelte';
  import {
    computeDdayCounter,
    formatDotDate,
    resolveToneColor,
  } from '../../lib/dday/ddayModel.js';
  import DdayIcon from './DdayIcon.svelte';

  /**
   * @type {{
   *   item: import('../../lib/dday/ddayModel.js').DdayItem,
   *   todayKey: string,
   *   accent?: string,
   *   dark?: boolean,
   *   forceCompact?: boolean,
   *   highlighted?: boolean,
   *   sortable?: boolean,
   *   shouldBlockContextMenu?: (() => boolean) | undefined,
   *   oncomplete: (id: string, event?: MouseEvent) => void,
   *   ontogglechannel: (id: string, channel: 'showInTodo' | 'showInBanner' | 'showInWidget', nextValue: boolean) => void,
   *   onedit: (id: string) => void,
   *   oncontextopen: (item: import('../../lib/dday/ddayModel.js').DdayItem, x: number, y: number, viaKeyboard?: boolean) => void,
   * }}
   */
  let {
    item,
    todayKey,
    accent = '#d97706',
    dark = false,
    forceCompact = false,
    highlighted = false,
    sortable = true,
    shouldBlockContextMenu = undefined,
    oncomplete,
    ontogglechannel,
    onedit,
    oncontextopen,
  } = $props();

  /** @type {HTMLDivElement | null} */
  let cardEl = $state(null);
  let measuredNarrow = $state(false);

  onMount(() => {
    if (!cardEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        measuredNarrow = entry.contentRect.width < 305;
      }
    });
    ro.observe(cardEl);
    measuredNarrow = cardEl.getBoundingClientRect().width < 305;
    return () => ro.disconnect();
  });

  const compactCapsule = $derived(forceCompact || measuredNarrow);
  const toneColor = $derived(resolveToneColor(item.tone, accent));
  const counter = $derived(computeDdayCounter(item, todayKey));
  const dateLabel = $derived(formatDotDate(counter.effectiveDate));

  /** @param {MouseEvent} e */
  function handleContextMenu(e) {
    e.preventDefault();
    if (shouldBlockContextMenu?.()) return;
    oncontextopen(item, e.clientX, e.clientY, false);
  }

  /** @param {KeyboardEvent} e */
  function handleRowKeydown(e) {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const rect = cardEl?.getBoundingClientRect();
      oncontextopen(item, rect ? rect.left + rect.width * 0.5 : 160, rect ? rect.top + 28 : 120, true);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={cardEl}
  class="dd-row"
  class:sortable
  class:highlighted
  class:overdue={counter.state === 'overdue'}
  class:imminent={counter.state === 'imminent' || counter.state === 'today'}
  data-scheme={dark ? 'dark' : 'light'}
  style="--dd-tone: {toneColor};"
  title={sortable ? '위아래로 끌어 순서 변경' : undefined}
  oncontextmenu={handleContextMenu}
>
  <div class="dd-line1">
    <button
      type="button"
      class="dd-check"
      data-dday-no-sort
      aria-label={`${item.title} 완료 처리`}
      title="완료 아카이브로 보내기"
      onclick={(e) => oncomplete(item.id, e)}
      onkeydown={handleRowKeydown}
    >
      <Check size={11} strokeWidth={2.8} />
    </button>

    <DdayIcon icon={item.icon} tone={item.tone} {accent} size="var(--dd-icon-sz, 26px)" {dark} />

    <button
      type="button"
      class="dd-title-btn"
      data-dday-sortable
      onclick={() => onedit(item.id)}
      onkeydown={handleRowKeydown}
      title={sortable ? `${item.title} (${dateLabel}) · 클릭해 편집 · 끌어 순서 변경` : `${item.title} (${dateLabel})`}
    >
      <span class="dd-title">{item.title}</span>
    </button>

    <span
      class="dd-counter tnum"
      class:today={counter.state === 'today'}
      class:imminent={counter.state === 'imminent'}
      class:overdue={counter.state === 'overdue'}
    >
      {counter.label}
    </span>

    <button
      type="button"
      class="dd-edit-btn"
      data-dday-no-sort
      class:icon-only={compactCapsule}
      onclick={() => onedit(item.id)}
      aria-label={`${item.title} 편집`}
      title="상세 편집"
    >
      <Pencil size={11} strokeWidth={2.2} />
      {#if !compactCapsule}
        <span>편집</span>
      {/if}
    </button>
  </div>

  <div class="dd-line2">
    <div class="dd-meta">
      <span class="dd-origin" class:linked={item.linkedTodoId !== null}>
        {item.linkedTodoId ? 'To-do 연동' : 'D-Day 전용'}
      </span>
      <span class="dd-dot-sep" aria-hidden="true">·</span>
      {#if item.repeatYearly}
        <Repeat size={9.5} class="shrink-0 opacity-75" aria-hidden="true" />
      {/if}
      <span class="dd-date tnum">{item.repeatYearly ? `매년 ${dateLabel}` : dateLabel}</span>
    </div>

    <div
      class="dd-capsule"
      class:compact={compactCapsule}
      data-dday-no-sort
      role="group"
      aria-label={`${item.title} 표시 채널`}
    >
      <button
        type="button"
        class="dd-cap-seg"
        data-dday-no-sort
        class:on={item.showInTodo}
        aria-pressed={item.showInTodo}
        aria-label={`할 일 목록에 함께 표시 (${item.showInTodo ? '켜짐' : '꺼짐'})`}
        title={`할 일 목록 표시 (${item.showInTodo ? '켜짐' : '꺼짐'})`}
        onclick={() => ontogglechannel(item.id, 'showInTodo', !item.showInTodo)}
      >
        {#if compactCapsule}
          <ListTodo size={11} strokeWidth={2.2} />
          <i class="dd-cap-dot" aria-hidden="true"></i>
        {:else}
          <i class="dd-cap-dot" aria-hidden="true"></i>
          <span>할 일</span>
        {/if}
      </button>

      <button
        type="button"
        class="dd-cap-seg"
        data-dday-no-sort
        class:on={item.showInBanner}
        aria-pressed={item.showInBanner}
        aria-label={`메모 상단 배너에 표시 (${item.showInBanner ? '켜짐' : '꺼짐'})`}
        title={`상단 배너 표시 (${item.showInBanner ? '켜짐' : '꺼짐'})`}
        onclick={() => ontogglechannel(item.id, 'showInBanner', !item.showInBanner)}
      >
        {#if compactCapsule}
          <PanelTop size={11} strokeWidth={2.2} />
          <i class="dd-cap-dot" aria-hidden="true"></i>
        {:else}
          <i class="dd-cap-dot" aria-hidden="true"></i>
          <span>배너</span>
        {/if}
      </button>

      <button
        type="button"
        class="dd-cap-seg"
        data-dday-no-sort
        class:on={item.showInWidget}
        aria-pressed={item.showInWidget}
        aria-label={`툴킷 D-Day 위젯에 표시 (${item.showInWidget ? '켜짐' : '꺼짐'})`}
        title={`데스크톱 위젯 표시 (${item.showInWidget ? '켜짐' : '꺼짐'})`}
        onclick={() => ontogglechannel(item.id, 'showInWidget', !item.showInWidget)}
      >
        {#if compactCapsule}
          <LayoutGrid size={11} strokeWidth={2.2} />
          <i class="dd-cap-dot" aria-hidden="true"></i>
        {:else}
          <i class="dd-cap-dot" aria-hidden="true"></i>
          <span>위젯</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- 키보드 전용 순서 손잡이: DOM 맨 마지막(Tab 순서 일치) + absolute 오버레이로 줄바꿈 흔들림 0px -->
  <button
    type="button"
    class="dd-kbd-handle"
    data-dday-no-sort
    disabled={!sortable}
    aria-label="끌어서 순서 변경"
    title={sortable ? '순서 변경 (스페이스 → ↑↓ → 스페이스)' : '항목이 2개 이상일 때 순서를 바꿀 수 있어요'}
  >
    <ArrowUpDown size={11} strokeWidth={2.5} />
  </button>
</div>

<style>
  .dd-row {
    container-type: inline-size;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--dd-row-gap, 7px);
    padding: 9px 10px 8px 10px;
    border-radius: 13px;
    background: var(--dd-ctrl-surface, #ffffff);
    border: 1px solid var(--dd-ctrl-line, rgba(15, 23, 42, 0.08));
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
    min-width: 0;
  }
  .dd-row.sortable {
    cursor: grab;
  }
  .dd-row:hover {
    background: var(--dd-ctrl-surface-hover, #ffffff);
    border-color: color-mix(in srgb, var(--dd-tone) 38%, var(--dd-ctrl-line, rgba(15, 23, 42, 0.1)));
    box-shadow: 0 3px 10px color-mix(in srgb, var(--dd-tone) 9%, transparent);
  }
  /* F5: 외부 링 대신 inset 링으로 강조해 스크롤 경계 좌우 클리핑/잔상을 없앱니다. */
  .dd-row.highlighted {
    border-color: var(--dd-tone);
    background: color-mix(in srgb, var(--dd-tone) 6%, var(--dd-ctrl-surface, #ffffff));
    box-shadow: inset 0 0 0 1.5px var(--dd-tone);
  }
  .dd-row[data-scheme='dark'] {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  }
  .dd-row[data-scheme='dark']:hover {
    border-color: color-mix(in srgb, var(--dd-tone) 46%, var(--dd-ctrl-line, rgba(255, 255, 255, 0.14)));
  }

  .dd-line1 {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .dd-check {
    width: 19px;
    height: 19px;
    border-radius: 50%;
    border: 1.5px solid var(--dd-ctrl-muted, #94a3b8);
    background: transparent;
    color: transparent;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    cursor: pointer;
    padding: 0;
    transition: all 140ms ease;
  }
  .dd-check:hover {
    border-color: var(--dd-tone);
    background: color-mix(in srgb, var(--dd-tone) 12%, transparent);
    color: var(--dd-tone);
  }

  .dd-title-btn {
    flex: 1;
    min-width: 0;
    border: 0;
    padding: 0;
    background: transparent;
    text-align: left;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .dd-title {
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--dd-fs-title, 12.5px);
    font-weight: 700;
    color: var(--dd-ctrl-ink, #1e2430);
    line-height: 1.3;
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .dd-counter {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 2.5px 7px;
    border-radius: 7px;
    font-size: var(--dd-fs-sub, 11px);
    font-weight: 800;
    background: color-mix(in srgb, var(--dd-tone) 14%, var(--dd-ctrl-surface, #ffffff));
    color: color-mix(in srgb, var(--dd-tone) 76%, var(--dd-ctrl-ink, #111827));
  }
  .dd-row[data-scheme='dark'] .dd-counter {
    background: color-mix(in srgb, var(--dd-tone) 22%, var(--dd-ctrl-surface, #1a1d26));
    color: color-mix(in srgb, var(--dd-tone) 72%, var(--dd-ctrl-ink, #ffffff));
  }
  .dd-counter.today,
  .dd-counter.imminent {
    background: color-mix(in srgb, #e11d48 14%, var(--dd-ctrl-surface, #ffffff));
    color: #be123c;
  }
  .dd-row[data-scheme='dark'] .dd-counter.today,
  .dd-row[data-scheme='dark'] .dd-counter.imminent {
    background: color-mix(in srgb, #f43f5e 26%, var(--dd-ctrl-surface, #1a1d26));
    color: #fda4af;
  }
  .dd-counter.overdue {
    background: var(--dd-ctrl-surface-muted, rgba(100, 116, 139, 0.14));
    color: var(--dd-ctrl-sub, #475569);
  }

  .dd-edit-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: clamp(24px, calc(var(--dd-icon-sz, 26px) * 0.94), 30px);
    padding: 0 7px;
    border-radius: 7px;
    border: 1px solid var(--dd-ctrl-line, rgba(15, 23, 42, 0.08));
    background: var(--dd-ctrl-surface-muted, #f8fafc);
    color: var(--dd-ctrl-sub, #475569);
    font-size: var(--dd-fs-sub, 10.5px);
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .dd-edit-btn.icon-only {
    width: clamp(24px, calc(var(--dd-icon-sz, 26px) * 0.94), 30px);
    padding: 0;
    justify-content: center;
  }
  .dd-edit-btn:hover {
    background: var(--dd-accent-soft, rgba(15, 23, 42, 0.08));
    border-color: var(--dd-accent-border, rgba(15, 23, 42, 0.16));
    color: var(--dd-accent-ink, var(--dd-accent));
  }

  .dd-line2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-left: 26px;
    min-width: 0;
  }

  .dd-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    flex: 1;
    font-size: var(--dd-fs-sub, 10.5px);
    color: var(--dd-ctrl-sub, #64748b);
  }

  .dd-origin {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: var(--dd-fs-micro, 9.5px);
    font-weight: 700;
    padding: 1.5px 5.5px;
    border-radius: 5px;
    background: var(--dd-ctrl-surface-muted, rgba(15, 23, 42, 0.055));
    color: var(--dd-ctrl-sub, #475569);
  }
  .dd-origin.linked {
    background: var(--dd-accent-soft, color-mix(in srgb, var(--dd-accent) 12%, transparent));
    color: var(--dd-accent-ink, var(--dd-accent));
  }

  .dd-dot-sep {
    flex-shrink: 0;
    opacity: 0.55;
  }
  .dd-date {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .dd-capsule {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 2px;
    gap: 2px;
    border-radius: 999px;
    background: var(--dd-ctrl-section, #f1f5f9);
    border: 1px solid var(--dd-ctrl-line, rgba(15, 23, 42, 0.06));
  }

  .dd-cap-seg {
    display: inline-flex;
    align-items: center;
    gap: 3.5px;
    height: clamp(20px, calc(var(--dd-btn-h, 30px) * 0.68), 26px);
    padding: 0 7px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--dd-ctrl-muted, #64748b);
    font-size: var(--dd-fs-micro, 10px);
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
    transition: background-color 130ms ease, color 130ms ease, box-shadow 130ms ease;
  }
  .dd-capsule.compact .dd-cap-seg {
    padding: 0 5.5px;
    gap: 2.5px;
  }
  @container (width < 292px) {
    .dd-line2 {
      padding-left: 4px;
      gap: 5px;
    }
    .dd-dot-sep {
      display: none;
    }
  }
  .dd-cap-seg:hover {
    color: var(--dd-ctrl-ink, #1e2430);
  }

  .dd-cap-dot {
    width: 4.5px;
    height: 4.5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.45;
    flex-shrink: 0;
  }
  .dd-cap-seg.on {
    background: var(--dd-ctrl-surface, #ffffff);
    color: color-mix(in srgb, var(--dd-tone) 45%, var(--dd-ctrl-ink, #111827));
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }
  .dd-cap-seg.on .dd-cap-dot {
    background: var(--dd-tone);
    opacity: 1;
  }
  .dd-row[data-scheme='dark'] .dd-cap-seg.on {
    background: var(--dd-ctrl-surface-hover, #2f3545);
    color: var(--dd-ctrl-ink, #f8fafc);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }

  /* 평상시 투명(레이아웃 점유 0px), Tab :focus-visible 시에만 노출 */
  .dd-kbd-handle {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 24px;
    height: 22px;
    padding: 0;
    border-radius: 7px;
    border: 1.5px solid var(--dd-accent-ink, var(--dd-accent));
    background: var(--dd-ctrl-surface, #ffffff);
    color: var(--dd-accent-ink, var(--dd-accent));
    display: grid;
    place-items: center;
    opacity: 0;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
    z-index: 4;
    cursor: grab;
    transition: opacity 120ms ease;
  }
  .dd-kbd-handle:focus-visible {
    opacity: 1;
    pointer-events: auto;
    outline: 2px solid var(--dd-accent);
    outline-offset: 1px;
  }
</style>
