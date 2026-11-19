<script>
  import { onMount } from 'svelte';
  import {
    Check,
    ChevronDown,
    ChevronUp,
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
   *   canMoveUp?: boolean,
   *   canMoveDown?: boolean,
   *   highlighted?: boolean,
   *   oncomplete: (id: string) => void,
   *   ontogglechannel: (id: string, channel: 'showInTodo' | 'showInBanner' | 'showInWidget', nextValue: boolean) => void,
   *   onedit: (id: string) => void,
   *   onmove: (id: string, dir: -1 | 1) => void,
   *   oncontextopen: (item: import('../../lib/dday/ddayModel.js').DdayItem, x: number, y: number, viaKeyboard?: boolean) => void,
   * }}
   */
  let {
    item,
    todayKey,
    accent = '#d97706',
    dark = false,
    forceCompact = false,
    canMoveUp = false,
    canMoveDown = false,
    highlighted = false,
    oncomplete,
    ontogglechannel,
    onedit,
    onmove,
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

<div
  bind:this={cardEl}
  class="dd-row"
  class:highlighted
  class:overdue={counter.state === 'overdue'}
  class:imminent={counter.state === 'imminent' || counter.state === 'today'}
  data-scheme={dark ? 'dark' : 'light'}
  data-dday-id={item.id}
  style="--dd-tone: {toneColor}; --dd-accent: {accent};"
  oncontextmenu={handleContextMenu}
  role="listitem"
>
  <div class="dd-line1">
    <div class="dd-order" role="group" aria-label="순서 이동">
      <button
        type="button"
        class="dd-step"
        disabled={!canMoveUp}
        aria-label="위로 이동"
        title="위로 이동"
        onclick={() => onmove(item.id, -1)}
      >
        <ChevronUp size={10} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        class="dd-step"
        disabled={!canMoveDown}
        aria-label="아래로 이동"
        title="아래로 이동"
        onclick={() => onmove(item.id, 1)}
      >
        <ChevronDown size={10} strokeWidth={2.5} />
      </button>
    </div>

    <button
      type="button"
      class="dd-check"
      aria-label={`${item.title} 완료 처리`}
      title="완료 아카이브로 보내기"
      onclick={() => oncomplete(item.id)}
      onkeydown={handleRowKeydown}
    >
      <Check size={11} strokeWidth={2.8} />
    </button>

    <DdayIcon icon={item.icon} tone={item.tone} {accent} size="var(--dd-icon-sz, 26px)" {dark} />

    <button
      type="button"
      class="dd-title-btn"
      onclick={() => onedit(item.id)}
      onkeydown={handleRowKeydown}
      title={`${item.title} (${dateLabel})`}
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
      role="group"
      aria-label={`${item.title} 표시 채널`}
    >
      <button
        type="button"
        class="dd-cap-seg"
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
</div>

<style>
  .dd-row {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--dd-row-gap, 7px);
    padding: 9px 10px 8px 8px;
    border-radius: 13px;
    background: #ffffff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
    transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
    min-width: 0;
  }
  .dd-row:hover {
    border-color: color-mix(in srgb, var(--dd-tone) 34%, rgba(15, 23, 42, 0.1));
    box-shadow: 0 3px 10px color-mix(in srgb, var(--dd-tone) 8%, transparent);
  }
  .dd-row.highlighted {
    border-color: var(--dd-tone);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--dd-tone) 22%, transparent);
  }
  .dd-row[data-scheme='dark'] {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  }
  .dd-row[data-scheme='dark']:hover {
    background: #272c3a;
    border-color: color-mix(in srgb, var(--dd-tone) 44%, rgba(255, 255, 255, 0.14));
  }

  .dd-line1 {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .dd-order {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex-shrink: 0;
  }
  .dd-step {
    width: 15px;
    height: 11px;
    border: 0;
    border-radius: 4px;
    padding: 0;
    display: grid;
    place-items: center;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .dd-step:hover:not(:disabled) {
    background: rgba(15, 23, 42, 0.07);
    color: #334155;
  }
  .dd-row[data-scheme='dark'] .dd-step:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
  }
  .dd-step:disabled {
    opacity: 0.22;
    cursor: default;
  }

  .dd-check {
    width: 19px;
    height: 19px;
    border-radius: 50%;
    border: 1.5px solid #cbd5e1;
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
  .dd-row[data-scheme='dark'] .dd-check {
    border-color: #4b5563;
  }
  .dd-row[data-scheme='dark'] .dd-check:hover {
    border-color: var(--dd-tone);
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
    color: #1e2430;
    line-height: 1.3;
  }
  .dd-row[data-scheme='dark'] .dd-title {
    color: #eef2f9;
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
    background: color-mix(in srgb, var(--dd-tone) 14%, #ffffff);
    color: color-mix(in srgb, var(--dd-tone) 88%, #111827);
  }
  .dd-row[data-scheme='dark'] .dd-counter {
    background: color-mix(in srgb, var(--dd-tone) 24%, #1a1d26);
    color: color-mix(in srgb, var(--dd-tone) 85%, #ffffff);
  }
  .dd-counter.today,
  .dd-counter.imminent {
    background: color-mix(in srgb, #e11d48 14%, #ffffff);
    color: #be123c;
  }
  .dd-row[data-scheme='dark'] .dd-counter.today,
  .dd-row[data-scheme='dark'] .dd-counter.imminent {
    background: color-mix(in srgb, #f43f5e 26%, #1a1d26);
    color: #fda4af;
  }
  .dd-counter.overdue {
    background: rgba(100, 116, 139, 0.14);
    color: #475569;
  }
  .dd-row[data-scheme='dark'] .dd-counter.overdue {
    background: rgba(148, 163, 184, 0.16);
    color: #cbd5e1;
  }

  .dd-edit-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: clamp(24px, calc(var(--dd-icon-sz, 26px) * 0.94), 30px);
    padding: 0 7px;
    border-radius: 7px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: #f8fafc;
    color: #475569;
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
    background: color-mix(in srgb, var(--dd-accent) 10%, #ffffff);
    border-color: color-mix(in srgb, var(--dd-accent) 30%, transparent);
    color: var(--dd-accent);
  }
  .dd-row[data-scheme='dark'] .dd-edit-btn {
    background: #2c3140;
    border-color: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }
  .dd-row[data-scheme='dark'] .dd-edit-btn:hover {
    background: color-mix(in srgb, var(--dd-accent) 20%, #2c3140);
    color: #ffffff;
  }

  .dd-line2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-left: 21px;
    min-width: 0;
  }

  .dd-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    flex: 1;
    font-size: var(--dd-fs-sub, 10.5px);
    color: #64748b;
  }
  .dd-row[data-scheme='dark'] .dd-meta {
    color: #94a3b8;
  }

  .dd-origin {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: var(--dd-fs-micro, 9.5px);
    font-weight: 700;
    padding: 1.5px 5.5px;
    border-radius: 5px;
    background: rgba(15, 23, 42, 0.055);
    color: #475569;
  }
  .dd-origin.linked {
    background: color-mix(in srgb, var(--dd-accent) 12%, transparent);
    color: color-mix(in srgb, var(--dd-accent) 90%, #111827);
  }
  .dd-row[data-scheme='dark'] .dd-origin {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }
  .dd-row[data-scheme='dark'] .dd-origin.linked {
    background: color-mix(in srgb, var(--dd-accent) 22%, transparent);
    color: color-mix(in srgb, var(--dd-accent) 82%, #ffffff);
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
    background: #f1f5f9;
    border: 1px solid rgba(15, 23, 42, 0.06);
  }
  .dd-row[data-scheme='dark'] .dd-capsule {
    background: #1a1d26;
    border-color: rgba(255, 255, 255, 0.08);
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
    color: #94a3b8;
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
    color: #475569;
  }
  .dd-row[data-scheme='dark'] .dd-cap-seg {
    color: #64748b;
  }
  .dd-row[data-scheme='dark'] .dd-cap-seg:hover {
    color: #cbd5e1;
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
    background: #ffffff;
    color: color-mix(in srgb, var(--dd-tone) 88%, #111827);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
  }
  .dd-cap-seg.on .dd-cap-dot {
    background: var(--dd-tone);
    opacity: 1;
  }
  .dd-row[data-scheme='dark'] .dd-cap-seg.on {
    background: #2f3545;
    color: #f8fafc;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
</style>
