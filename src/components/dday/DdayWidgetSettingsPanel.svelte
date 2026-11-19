<script lang="ts">
  import { tick } from 'svelte';
  import {
    ArrowUpRight,
    Check,
    ChevronDown,
    LocateFixed,
    Pin,
    PinOff,
    Power,
    Rocket,
    X,
  } from 'lucide-svelte';
  import DdayIcon from './DdayIcon.svelte';
  import { contrastRatio } from '../../lib/dday/ddayBadge.js';
  import { resolveExplicitToneHex } from '../../lib/dday/ddayWidgetTheme.js';
  import type { DdayWidgetMenuState } from '../../lib/dday/ddayWidgetMenuProtocol.js';
  import { windowDrag } from '../../lib/windows/windowDrag.js';

  let {
    state: menuState,
    maxHeight = 540,
    draggable = false,
    onaction,
    onclose,
    onstartdrag,
  }: {
    state: DdayWidgetMenuState;
    maxHeight?: number;
    draggable?: boolean;
    onaction?: (action: string, payload?: Record<string, any>) => void;
    onclose?: () => void;
    onstartdrag?: () => void;
  } = $props();

  let shellEl = $state<HTMLDivElement | null>(null);
  let scopeComboEl = $state<HTMLDivElement | null>(null);
  let scopeBtnEl = $state<HTMLButtonElement | null>(null);
  let scopeOpen = $state(false);
  let scopeHighlightIdx = $state(0);

  const scopeOptions = $derived([
    { value: 'all', label: '모든 메모 창' },
    ...menuState.windows.map((w) => ({
      value: w.label,
      label: w.title || w.label,
    })),
  ]);

  const activeScopeLabel = $derived(
    scopeOptions.find((opt) => opt.value === menuState.prefs.displayScope)?.label ?? '모든 메모 창',
  );

  function closeScopeMenu(restoreFocus = false) {
    if (!scopeOpen) return;
    scopeOpen = false;
    if (restoreFocus) {
      void tick().then(() => scopeBtnEl?.focus({ preventScroll: true }));
    }
  }

  function openScopeMenu() {
    const idx = Math.max(
      0,
      scopeOptions.findIndex((opt) => opt.value === menuState.prefs.displayScope),
    );
    scopeHighlightIdx = idx;
    scopeOpen = true;
  }

  function chooseScope(value: string | undefined) {
    if (!value) return;
    closeScopeMenu(true);
    if (value !== menuState.prefs.displayScope) {
      onaction?.('set-scope', { displayScope: value });
    }
  }

  function handleScopeKeydown(e: KeyboardEvent) {
    if (!scopeOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openScopeMenu();
      }
      return;
    }
    const len = scopeOptions.length;
    if (len === 0) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeScopeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      scopeHighlightIdx = (scopeHighlightIdx + 1) % len;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      scopeHighlightIdx = (scopeHighlightIdx - 1 + len) % len;
    } else if (e.key === 'Home') {
      e.preventDefault();
      scopeHighlightIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      scopeHighlightIdx = len - 1;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      chooseScope(scopeOptions[scopeHighlightIdx]?.value);
    } else if (e.key === 'Tab') {
      closeScopeMenu(false);
    }
  }

  $effect(() => {
    if (!scopeOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && scopeComboEl?.contains(e.target)) return;
      closeScopeMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  });

  export function focusFirst() {
    const target =
      shellEl?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], button:not(:disabled)');
    target?.focus({ preventScroll: true });
  }

  export function handleEscape(): boolean {
    if (!scopeOpen) return false;
    closeScopeMenu(true);
    return true;
  }

  function headDragAction(node: HTMLElement) {
    if (!draggable) return { destroy() {} };
    return windowDrag(node, { onstart: () => onstartdrag?.() });
  }
</script>

<div
  bind:this={shellEl}
  class="dw-menu-shell"
  data-scheme={menuState.effectiveDark ? 'dark' : 'light'}
  role="dialog"
  aria-label="D-Day 위젯 설정"
  style="{menuState.themeStyle};width:{menuState.menuWidth}px;max-height:{maxHeight}px;font-family:{menuState.fontFamily};"
>
  <header class="dw-menu-head" class:is-draggable={draggable} use:headDragAction>
    <DdayIcon
      icon="flag"
      tone="accent"
      accent={menuState.accentHex}
      size={18}
      dark={menuState.effectiveDark}
    />
    <strong>D-Day 위젯</strong>
    <button
      type="button"
      class="dw-menu-close"
      aria-label="닫기"
      data-no-drag
      onclick={() => onclose?.()}
    >
      <X size={13} />
    </button>
  </header>

  <div class="dw-menu-scroll">
    <section class="dw-menu-sec" aria-label="위젯 스킨">
      <h3>스킨</h3>
      <div class="dw-skin-grid" role="radiogroup" aria-label="위젯 스킨 고르기">
        <button
          type="button"
          role="radio"
          aria-checked={menuState.effectiveSkin === 'w1'}
          class="dw-skin-card"
          class:on={menuState.effectiveSkin === 'w1'}
          onclick={() => onaction?.('select-skin', { skin: 'w1' })}
        >
          <span class="dw-skin-thumb w1-thumb" aria-hidden="true"><i></i><b>D-5</b></span>
          <span>플립 캘린더</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={menuState.effectiveSkin === 'w4'}
          class="dw-skin-card"
          class:on={menuState.effectiveSkin === 'w4'}
          onclick={() => onaction?.('select-skin', { skin: 'w4' })}
        >
          <span class="dw-skin-thumb w4-thumb" aria-hidden="true"><i></i><b>D-5</b></span>
          <span>폴라로이드</span>
        </button>
      </div>
    </section>

    <section class="dw-menu-sec" aria-label="위젯 배경">
      <h3>배경</h3>
      <div class="dw-mode-row" role="radiogroup" aria-label="배경 테마">
        <button
          type="button"
          role="radio"
          aria-checked={menuState.prefs.appearanceMode === 'auto'}
          class="dw-mode-chip"
          class:on={menuState.prefs.appearanceMode === 'auto'}
          onclick={() => onaction?.('set-appearance', { appearanceMode: 'auto' })}
        >자동</button>
        <button
          type="button"
          role="radio"
          aria-checked={menuState.prefs.appearanceMode === 'light'}
          class="dw-mode-chip"
          class:on={menuState.prefs.appearanceMode === 'light'}
          onclick={() => onaction?.('set-appearance', { appearanceMode: 'light' })}
        >크림</button>
        <button
          type="button"
          role="radio"
          aria-checked={menuState.prefs.appearanceMode === 'dark'}
          class="dw-mode-chip"
          class:on={menuState.prefs.appearanceMode === 'dark'}
          onclick={() => onaction?.('set-appearance', { appearanceMode: 'dark' })}
        >더스크</button>
      </div>
    </section>

    <section class="dw-menu-sec" aria-label="표시할 D-Day">
      <h3>표시 항목</h3>
      <div class="dw-scope-wrap" bind:this={scopeComboEl}>
        <div class="dw-scope-row">
          <span id="dw-scope-label" class="dw-scope-label">창 범위</span>
          <button
            bind:this={scopeBtnEl}
            type="button"
            class="dw-scope-trigger"
            class:is-open={scopeOpen}
            role="combobox"
            aria-labelledby="dw-scope-label"
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            aria-controls="dw-scope-listbox"
            onclick={() => (scopeOpen ? closeScopeMenu(false) : openScopeMenu())}
            onkeydown={handleScopeKeydown}
          >
            <span class="dw-scope-val">{activeScopeLabel}</span>
            <ChevronDown size={13} class="dw-scope-chevron" />
          </button>
        </div>

        {#if scopeOpen}
          <div
            id="dw-scope-listbox"
            class="dw-scope-list"
            role="listbox"
            aria-label="창 범위 선택"
            tabindex="-1"
            onkeydown={handleScopeKeydown}
          >
            {#each scopeOptions as opt, idx (opt.value)}
              {@const selected = opt.value === menuState.prefs.displayScope}
              <button
                type="button"
                role="option"
                class="dw-scope-option"
                class:is-selected={selected}
                class:is-highlight={idx === scopeHighlightIdx}
                aria-selected={selected}
                onmouseenter={() => { scopeHighlightIdx = idx; }}
                onclick={() => chooseScope(opt.value)}
              >
                <span class="dw-scope-opt-text">{opt.label}</span>
                {#if selected}
                  <Check size={12} strokeWidth={2.8} />
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if menuState.entries.length > 0}
        <div class="dw-tiles">
          {#each menuState.entries as entry (entry.key)}
            {@const tileTone = resolveExplicitToneHex(entry.tone, menuState.accentHex, menuState.effectiveDark)}
            {@const checkInk = contrastRatio('#ffffff', tileTone) >= contrastRatio('#111827', tileTone) ? '#ffffff' : '#111827'}
            <button
              type="button"
              role="checkbox"
              aria-checked={entry.checked}
              class="dw-tile"
              style="--dw-tile-tone:{tileTone};--dw-tile-check-ink:{checkInk};"
              onclick={() => onaction?.('toggle-hidden', { entryKey: entry.key })}
            >
              <span class="dw-tile-name">{entry.title}</span>
              <span class="dw-tile-check">
                {#if entry.checked}<Check size={9} strokeWidth={3} />{/if}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="dw-tiles-empty">선택한 범위에 위젯 표시할 D-Day가 없어요.</p>
      {/if}
    </section>

    <section class="dw-menu-sec" aria-label="창 동작">
      <h3>창 동작</h3>
      <button
        type="button"
        role="switch"
        aria-checked={menuState.prefs.alwaysOnTop}
        disabled={menuState.pinBusy}
        class="dw-switch"
        onclick={() => onaction?.('toggle-top')}
      >
        {#if menuState.prefs.alwaysOnTop}<Pin size={14} />{:else}<PinOff size={14} />{/if}
        <span class="dw-switch-text">
          항상 위에 고정
          <small>다른 창 위로 위젯을 띄워 둡니다</small>
        </span>
        <span class="dw-knob" aria-hidden="true"><i></i></span>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={menuState.prefs.autoOpen}
        class="dw-switch"
        onclick={() => onaction?.('toggle-stay')}
      >
        <Rocket size={14} />
        <span class="dw-switch-text">
          Tidy Task와 함께 열기
          <small>앱 실행 시 이 자리와 크기로 다시 띄웁니다</small>
        </span>
        <span class="dw-knob" aria-hidden="true"><i></i></span>
      </button>

      {#if menuState.prefs.autoOpen && !menuState.startupEnabled}
        <button
          type="button"
          class="dw-startup-helper"
          disabled={menuState.startupBusy}
          onclick={() => onaction?.('enable-startup')}
        >
          <Power size={12} />
          <span>{menuState.startupBusy ? '등록 중…' : 'Windows 시작 프로그램 함께 켜기'}</span>
        </button>
      {/if}
    </section>
  </div>

  <div class="dw-actions">
    <button type="button" onclick={() => onaction?.('center')}>
      <LocateFixed size={13} />
      <span>가운데로</span>
    </button>
    <button
      type="button"
      class="dw-action-pri"
      onclick={() => onaction?.('open-control')}
    >
      <span>D-Day 컨트롤</span>
      <ArrowUpRight size={13} />
    </button>
  </div>
</div>

<style>
  .dw-menu-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 8px;
    gap: 6px;
    border: 0;
    border-radius: 14px;
    background: var(--dw-menu-bg, #fdfaf3);
    background-clip: padding-box;
    box-shadow: none;
    overflow: hidden;
    isolation: isolate;
    color: var(--dw-ink, #1e2430);
    font-size: 11px;
    line-height: 1.4;
    user-select: none;
  }
  .dw-menu-shell * {
    box-sizing: border-box;
  }
  .dw-menu-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 40;
    border-radius: inherit;
    pointer-events: none;
    box-shadow:
      inset 0 0 0 1px var(--dw-border, #dfd5c0),
      inset 0 1px 0 var(--dw-highlight, #ffffff);
  }
  .dw-menu-shell :is(button, [tabindex]):focus-visible {
    outline: 1.5px solid var(--dw-accent, #d97706);
    outline-offset: 1px;
  }

  .dw-menu-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 3px 0 7px;
    border-radius: 9px;
    background: var(--dw-menu-head-bg, #f4ebce);
  }
  .dw-menu-head.is-draggable {
    cursor: grab;
  }
  .dw-menu-head.is-draggable:active {
    cursor: grabbing;
  }
  .dw-menu-head strong {
    flex: 1;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: -0.015em;
    color: var(--dw-ink, #1e2430);
  }
  .dw-menu-close {
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--dw-muted, #526074);
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .dw-menu-close:hover {
    background: var(--dw-menu-hover, rgba(15, 23, 42, 0.08));
    color: var(--dw-ink, #1e2430);
  }

  .dw-menu-scroll {
    flex: 1;
    min-height: 0;
    display: grid;
    gap: 6px;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 1px;
  }
  .dw-menu-scroll::-webkit-scrollbar {
    width: 5px;
  }
  .dw-menu-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .dw-menu-scroll::-webkit-scrollbar-thumb {
    background: var(--dw-menu-sec-border, rgba(100, 116, 139, 0.32));
    border-radius: 999px;
  }
  .dw-menu-scroll::-webkit-scrollbar-button {
    display: none;
  }

  .dw-menu-sec {
    display: grid;
    gap: 5px;
    padding: 6px;
    border-radius: 10px;
    background: var(--dw-menu-sec-bg, #ffffff);
    border: 1px solid var(--dw-menu-sec-border, #e8ddb7);
  }
  .dw-menu-sec h3 {
    justify-self: start;
    margin: 0;
    padding: 1.5px 7px;
    border-radius: 999px;
    background: var(--dw-accent-soft, #f9eed2);
    color: var(--dw-accent-ink, #9a4f04);
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: -0.015em;
  }

  .dw-skin-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }
  .dw-skin-card {
    padding: 6px 5px 5px;
    border-radius: 8px;
    border: 1px solid var(--dw-menu-sec-border, #e5e7eb);
    background: var(--dw-card-surface, #ffffff);
    color: var(--dw-ink, #1e2430);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font: inherit;
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;
  }
  .dw-skin-card:hover {
    border-color: var(--dw-accent-line, #d97706);
  }
  .dw-skin-card.on {
    border-color: var(--dw-accent-fill, #d97706);
    background: var(--dw-accent-soft, #fef3c7);
    color: var(--dw-accent-ink, #9a4f04);
  }
  .dw-skin-thumb {
    position: relative;
    width: 40px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid var(--dw-border, #d6ccb8);
    background: var(--dw-card-bg, #fffdf8);
    display: grid;
    place-items: center;
    color: var(--dw-ink, #1e2430);
    font-size: 8.5px;
    font-weight: 800;
    overflow: hidden;
  }
  .dw-skin-thumb.w1-thumb > i {
    position: absolute;
    top: 2px;
    left: 10px;
    right: 10px;
    height: 4px;
    border-left: 2.5px solid var(--dw-ring-stroke, #64748b);
    border-right: 2.5px solid var(--dw-ring-stroke, #64748b);
  }
  .dw-skin-thumb.w4-thumb > i {
    position: absolute;
    top: 2px;
    left: 11px;
    right: 11px;
    height: 4px;
    border-radius: 2px;
    background: var(--dw-tape-fill, #fcd34d);
    transform: rotate(-3deg);
  }

  .dw-mode-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: var(--dw-menu-track, #eceef3);
  }
  .dw-mode-chip {
    height: 23px;
    border-radius: 5px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--dw-muted, #64748b);
    font: inherit;
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .dw-mode-chip:hover {
    color: var(--dw-ink, #1e2430);
  }
  .dw-mode-chip.on {
    border-color: var(--dw-accent-line, #d97706);
    background: var(--dw-card-surface, #ffffff);
    color: var(--dw-accent-ink, #9a4f04);
  }

  .dw-scope-wrap {
    display: grid;
    gap: 4px;
  }
  .dw-scope-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 5px 4px 7px;
    border-radius: 7px;
    background: var(--dw-menu-track, #eceef3);
    font-size: 10.5px;
    font-weight: 700;
  }
  .dw-scope-label {
    flex: none;
    color: var(--dw-ink, #1e2430);
  }
  .dw-scope-trigger {
    flex: 1;
    min-width: 0;
    height: 24px;
    padding: 0 7px;
    border-radius: 6px;
    border: 1px solid var(--dw-menu-sec-border, #d8dde6);
    background: var(--dw-card-surface, #ffffff);
    color: var(--dw-ink, #1e2430);
    font: inherit;
    font-size: 10.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    cursor: pointer;
    text-align: left;
  }
  .dw-scope-trigger.is-open {
    border-color: var(--dw-accent-fill, #d97706);
  }
  .dw-scope-trigger :global(.dw-scope-chevron) {
    flex: none;
    color: var(--dw-muted, #64748b);
    transition: transform 140ms ease;
  }
  .dw-scope-trigger.is-open :global(.dw-scope-chevron) {
    transform: rotate(180deg);
  }
  .dw-scope-val {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dw-scope-list {
    display: grid;
    gap: 2px;
    max-height: 140px;
    overflow-y: auto;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--dw-accent-line, #d97706);
    background: var(--dw-card-surface, #ffffff);
  }
  .dw-scope-list::-webkit-scrollbar {
    width: 5px;
  }
  .dw-scope-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .dw-scope-list::-webkit-scrollbar-thumb {
    background: var(--dw-menu-sec-border, rgba(100, 116, 139, 0.32));
    border-radius: 999px;
  }
  .dw-scope-list::-webkit-scrollbar-button {
    display: none;
  }
  .dw-scope-option {
    width: 100%;
    padding: 5px 7px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--dw-ink, #1e2430);
    font: inherit;
    font-size: 10.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    text-align: left;
    cursor: pointer;
  }
  .dw-scope-option.is-highlight {
    background: var(--dw-menu-hover, #f1f5f9);
  }
  .dw-scope-option.is-selected {
    background: var(--dw-accent-soft, #fef3c7);
    color: var(--dw-accent-ink, #9a4f04);
  }
  .dw-scope-opt-text {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dw-tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }
  .dw-tile {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 5px 22px 5px 7px;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--dw-tile-tone) 38%, var(--dw-menu-sec-border, #d8dde6));
    background: color-mix(in srgb, var(--dw-tile-tone) 10%, var(--dw-card-surface, #ffffff));
    color: var(--dw-ink, #1e2430);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .dw-tile[aria-checked='false'] {
    border-style: dashed;
    border-color: var(--dw-menu-sec-border, #cbd5e1);
    background: var(--dw-card-surface, #ffffff);
    opacity: 0.68;
  }
  .dw-tile-name {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dw-tile-check {
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 1.5px solid var(--dw-muted, #64748b);
    display: grid;
    place-items: center;
    color: var(--dw-tile-check-ink, #ffffff);
  }
  .dw-tile[aria-checked='true'] .dw-tile-check {
    border-color: var(--dw-tile-tone);
    background: var(--dw-tile-tone);
  }
  .dw-tiles-empty {
    margin: 2px 0 0;
    padding: 6px;
    border-radius: 7px;
    background: var(--dw-menu-track, #f1f5f9);
    color: var(--dw-muted, #64748b);
    font-size: 10px;
    text-align: center;
  }

  .dw-switch {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--dw-ink, #1e2430);
    font: inherit;
    font-size: 10.5px;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
    transition: background-color 120ms ease;
  }
  .dw-switch:hover:not(:disabled) {
    background: var(--dw-menu-hover, rgba(15, 23, 42, 0.055));
  }
  .dw-switch:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .dw-switch-text {
    flex: 1;
    min-width: 0;
  }
  .dw-switch-text small {
    display: block;
    font-size: 9px;
    font-weight: 500;
    color: var(--dw-muted, #64748b);
    line-height: 1.25;
  }
  .dw-knob {
    position: relative;
    flex-shrink: 0;
    width: 28px;
    height: 16px;
    border-radius: 99px;
    background: var(--dw-menu-knob-off, #94a3b8);
    transition: background-color 150ms ease;
  }
  .dw-knob i {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    transition: transform 150ms ease;
  }
  .dw-switch[aria-checked='true'] .dw-knob {
    background: var(--dw-accent-fill, #d97706);
  }
  .dw-switch[aria-checked='true'] .dw-knob i {
    transform: translateX(12px);
  }

  .dw-startup-helper {
    width: 100%;
    height: 25px;
    border-radius: 7px;
    border: 1px solid var(--dw-menu-warn-border, #f59e0b);
    background: var(--dw-menu-warn-bg, #fef3c7);
    color: var(--dw-menu-warn-ink, #92400e);
    font: inherit;
    font-size: 9.5px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
    cursor: pointer;
  }

  .dw-actions {
    flex: none;
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 5px;
    padding-top: 5px;
    border-top: 1px solid var(--dw-menu-sec-border, #e5e7eb);
  }
  .dw-actions button {
    min-width: 0;
    height: 29px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--dw-menu-sec-border, #d8dde6);
    background: var(--dw-card-surface, #ffffff);
    color: var(--dw-ink, #1e2430);
    font: inherit;
    font-size: 10.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .dw-actions button:hover {
    border-color: var(--dw-accent-line, #d97706);
  }
  .dw-actions .dw-action-pri {
    border-color: var(--dw-accent-fill, #d97706);
    background: var(--dw-accent-fill, #d97706);
    color: var(--dw-on-accent, #ffffff);
  }
</style>
