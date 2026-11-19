<script>
  import { onMount } from 'svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import DdayWidgetIcon from './DdayWidgetIcon.svelte';
  import {
    closeDdayWidget,
    isDdayWidgetOpen,
    openDdayWidget,
    watchDdayWidgetOpen,
  } from '../../lib/dday/ddayWidgetWindow.js';

  let open = $state(false);
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    const watcher = watchDdayWidgetOpen((nextOpen) => {
      open = nextOpen;
    });
    return () => {
      watcher.dispose();
    };
  });

  /** @param {boolean} nextValue */
  async function handleChange(nextValue) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      if (nextValue) {
        const opened = await openDdayWidget();
        open = opened;
        if (!opened) error = 'D-Day 위젯을 열지 못했어요. 다시 시도해 주세요.';
      } else {
        await closeDdayWidget();
        open = false;
      }
    } catch {
      open = await isDdayWidgetOpen().catch(() => open);
      error = 'D-Day 위젯을 전환하지 못했어요. 다시 시도해 주세요.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="dday-widget-toggle-row">
  <span class="dday-widget-toggle-label">
    <DdayWidgetIcon size={23} active={open} />
    <span>D-Day 위젯</span>
  </span>
  <ToolkitSwitch
    checked={open}
    label="D-Day 위젯"
    onchange={handleChange}
    disabled={busy}
  />
</div>
{#if error}
  <p class="dday-widget-toggle-error" role="alert">{error}</p>
{/if}

<style>
  /* ToolkitToggle.svelte의 .toolkit-toggle-row와 1:1 동일 규격으로 나란히 정렬합니다. */
  .dday-widget-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 9px;
    font-size: 12px;
    font-weight: 600;
  }
  .dday-widget-toggle-label {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .dday-widget-toggle-row :global(.tk-switch[data-state='checked']) {
    background: var(--header-accent, #a86d29);
  }
  .dday-widget-toggle-error {
    color: #b43e3e;
    font-size: 11px;
    line-height: 1.5;
    padding: 4px 9px;
    margin: 0;
  }
</style>
