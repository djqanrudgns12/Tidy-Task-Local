<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { Check, ChevronDown } from 'lucide-svelte';
  import {
    DEFAULT_THEME_ID,
    THEME_GROUPS,
    TIDY_THEMES,
    getTidyTheme,
  } from '../lib/themes.js';

  let {
    value = $bindable(DEFAULT_THEME_ID),
    isDarkMode = false,
  } = $props();

  const listboxId = 'tidy-theme-picker-listbox';
  const groupedThemes = THEME_GROUPS.map((group) => ({
    ...group,
    themes: TIDY_THEMES.filter((theme) => theme.group === group.id),
  }));

  let triggerEl = $state(null);
  let popoverEl = $state(null);
  let scrollParent = null;
  let supportsPopover = $state(false);
  let isOpen = $state(false);
  let position = $state({ top: 8, left: 8, width: 240, maxHeight: 260 });
  let selectedTheme = $derived(getTidyTheme(value));

  function updatePosition() {
    if (!triggerEl || !popoverEl) return;

    const viewportPadding = 8;
    const gap = 6;
    const triggerRect = triggerEl.getBoundingClientRect();
    const width = Math.min(triggerRect.width, window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.min(280, window.innerHeight - viewportPadding * 2);
    const measuredHeight = Math.min(popoverEl.scrollHeight || maxHeight, maxHeight);
    const spaceBelow = window.innerHeight - triggerRect.bottom - gap - viewportPadding;
    const top = spaceBelow >= measuredHeight
      ? triggerRect.bottom + gap
      : Math.max(viewportPadding, triggerRect.top - gap - measuredHeight);
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );

    position = { top, left, width, maxHeight };
  }

  function focusTheme(themeId = value) {
    const option = popoverEl?.querySelector(`[data-theme-id="${themeId}"]`)
      || popoverEl?.querySelector('[data-theme-id]');
    option?.focus();
    option?.scrollIntoView({ block: 'nearest' });
  }

  async function openPicker(direction = 'selected') {
    if (isOpen) return;
    isOpen = true;
    await tick();

    if (supportsPopover && !popoverEl.matches(':popover-open')) {
      popoverEl.showPopover();
      await tick();
    }

    updatePosition();
    if (direction === 'first') focusTheme(TIDY_THEMES[0].id);
    else if (direction === 'last') focusTheme(TIDY_THEMES.at(-1).id);
    else focusTheme();
  }

  function closePicker({ restoreFocus = true } = {}) {
    if (supportsPopover && popoverEl?.matches(':popover-open')) {
      popoverEl.hidePopover();
    }
    isOpen = false;
    if (restoreFocus) triggerEl?.focus();
  }

  function togglePicker() {
    if (isOpen) closePicker();
    else openPicker();
  }

  function selectTheme(themeId) {
    value = themeId;
    closePicker();
  }

  function moveOption(event, delta) {
    const currentId = event.target?.dataset?.themeId || value;
    const currentIndex = Math.max(0, TIDY_THEMES.findIndex((theme) => theme.id === currentId));
    const nextIndex = Math.min(TIDY_THEMES.length - 1, Math.max(0, currentIndex + delta));
    focusTheme(TIDY_THEMES[nextIndex].id);
  }

  function handleTriggerKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openPicker(isOpen ? 'selected' : 'first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openPicker('last');
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePicker();
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closePicker();
    }
  }

  function handleListboxKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveOption(event, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveOption(event, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTheme(TIDY_THEMES[0].id);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTheme(TIDY_THEMES.at(-1).id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePicker();
    }
  }

  function handleWindowPointerDown(event) {
    if (!supportsPopover && isOpen && !triggerEl?.contains(event.target) && !popoverEl?.contains(event.target)) {
      closePicker({ restoreFocus: false });
    }
  }

  function handleNativeToggle(event) {
    isOpen = event.newState === 'open';
  }

  onMount(() => {
    supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
    scrollParent = triggerEl?.closest('.custom-scrollbar');
    scrollParent?.addEventListener('scroll', closePicker);
    window.addEventListener('resize', closePicker);
  });

  onDestroy(() => {
    scrollParent?.removeEventListener('scroll', closePicker);
    window.removeEventListener('resize', closePicker);
  });
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<div class="theme-picker">
  <button
    bind:this={triggerEl}
    type="button"
    class="theme-trigger"
    class:is-dark={isDarkMode}
    onclick={togglePicker}
    onkeydown={handleTriggerKeydown}
    role="combobox"
    aria-label="테마 색상"
    aria-controls={listboxId}
    aria-expanded={isOpen}
    aria-haspopup="listbox"
    style={`--picker-accent: ${selectedTheme.tidy.accent};`}
  >
    <span class="theme-swatches" aria-hidden="true">
      <span style:background-color={selectedTheme.tidy.bg}></span>
      <span style:background-color={selectedTheme.tidy.section}></span>
      <span style:background-color={selectedTheme.tidy.accent}></span>
    </span>
    <span class="theme-trigger-copy">
      <strong>{selectedTheme.label}</strong>
      {#if selectedTheme.detail}<small>{selectedTheme.detail}</small>{/if}
    </span>
    <ChevronDown size={14} class={isOpen ? 'is-open' : ''} aria-hidden="true" />
  </button>

  <div
    bind:this={popoverEl}
    id={listboxId}
    popover={supportsPopover ? 'auto' : undefined}
    class="theme-popover"
    class:is-dark={isDarkMode}
    class:is-fallback-hidden={!supportsPopover && !isOpen}
    style:top={`${position.top}px`}
    style:left={`${position.left}px`}
    style:width={`${position.width}px`}
    style:max-height={`${position.maxHeight}px`}
    role="listbox"
    aria-label="테마 색상 목록"
    tabindex="-1"
    onkeydown={handleListboxKeydown}
    ontoggle={handleNativeToggle}
  >
    {#each groupedThemes as group (group.id)}
      <section class="theme-group" aria-labelledby={`theme-group-${group.id}`}>
        <h3 id={`theme-group-${group.id}`}>{group.label} <span>{group.themes.length}</span></h3>
        {#each group.themes as theme (theme.id)}
          <button
            type="button"
            class="theme-option"
            class:is-selected={value === theme.id}
            class:is-dark={isDarkMode}
            data-theme-id={theme.id}
            role="option"
            aria-selected={value === theme.id}
            tabindex={value === theme.id ? 0 : -1}
            style={`--option-accent: ${theme.tidy.accent};`}
            onclick={() => selectTheme(theme.id)}
          >
            <span class="theme-swatches" aria-hidden="true">
              <span style:background-color={theme.tidy.bg}></span>
              <span style:background-color={theme.tidy.section}></span>
              <span style:background-color={theme.tidy.accent}></span>
            </span>
            <span class="theme-option-copy">
              <strong>{theme.label}</strong>
              {#if theme.detail}<small>{theme.detail}</small>{/if}
            </span>
            <span class="theme-check" aria-hidden="true">
              {#if value === theme.id}<Check size={13} strokeWidth={3} />{/if}
            </span>
          </button>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .theme-picker {
    width: 100%;
  }

  .theme-trigger {
    width: 100%;
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    background: #fff;
    color: #1f2937;
    text-align: left;
    cursor: pointer;
    transition: border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
  }

  .theme-trigger:hover,
  .theme-trigger:focus-visible {
    border-color: color-mix(in srgb, var(--picker-accent, #d97706) 55%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--picker-accent, #d97706) 14%, transparent);
    outline: none;
  }

  .theme-trigger.is-dark {
    background: #2d303e;
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }

  .theme-trigger-copy,
  .theme-option-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .theme-trigger-copy strong,
  .theme-option-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85em;
  }

  .theme-trigger-copy small,
  .theme-option-copy small {
    flex-shrink: 0;
    font-size: 0.7em;
    opacity: 0.55;
  }

  .theme-swatches {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 9px);
    height: 25px;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.09);
    border-radius: 7px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  }

  .theme-swatches > span {
    display: block;
  }

  :global(.theme-trigger svg) {
    flex-shrink: 0;
    opacity: 0.55;
    transition: transform 160ms ease;
  }

  :global(.theme-trigger svg.is-open) {
    transform: rotate(180deg);
  }

  .theme-popover {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.985);
    color: #1f2937;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.24), 0 3px 10px rgba(15, 23, 42, 0.12);
    z-index: 999999;
  }

  .theme-popover.is-dark {
    background: rgba(35, 37, 48, 0.99);
    border-color: rgba(255, 255, 255, 0.14);
    color: #e2e8f0;
  }

  .theme-popover.is-fallback-hidden {
    display: none;
  }

  .theme-group + .theme-group {
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid rgba(0, 0, 0, 0.07);
  }

  .theme-popover.is-dark .theme-group + .theme-group {
    border-top-color: rgba(255, 255, 255, 0.08);
  }

  .theme-group h3 {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 4px 7px 3px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.11em;
    color: #64748b;
  }

  .theme-group h3 span {
    opacity: 0.48;
  }

  .theme-popover.is-dark .theme-group h3 {
    color: #94a3b8;
  }

  .theme-option {
    width: 100%;
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 7px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: #334155;
    text-align: left;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
  }

  .theme-option:hover,
  .theme-option:focus-visible {
    background: rgba(15, 23, 42, 0.055);
    outline: none;
  }

  .theme-option:active {
    transform: scale(0.985);
  }

  .theme-option.is-selected {
    border-color: color-mix(in srgb, var(--option-accent, #d97706) 35%, transparent);
    background: rgba(245, 158, 11, 0.09);
  }

  .theme-option.is-dark {
    color: #e2e8f0;
  }

  .theme-option.is-dark:hover,
  .theme-option.is-dark:focus-visible {
    background: rgba(255, 255, 255, 0.075);
  }

  .theme-option.is-dark.is-selected {
    border-color: rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.1);
  }

  .theme-check {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: #b45309;
  }

  .theme-option.is-dark .theme-check {
    color: #fbbf24;
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-trigger,
    .theme-option,
    :global(.theme-trigger svg) {
      transition: none;
    }
  }
</style>
