<script lang="ts">
  import { onMount } from 'svelte';
  import { readSettings, subscribeSettings, setEnabled } from '../../lib/toolkit/store.js';
  import ToolkitSwitch from './ToolkitSwitch.svelte';
  let enabled = $state(true),
    busy = $state(false),
    error = $state('');
  onMount(() => {
    let disposed = false;
    let off = () => {};
    void (async () => {
      try {
        const stop = await subscribeSettings((s) => {
          if (!disposed) enabled = s.toolkit.enabled;
        });
        if (disposed) {
          stop();
          return;
        }
        off = stop;
        const s = await readSettings();
        if (!disposed) enabled = s.toolkit.enabled;
      } catch {
        error = '툴킷 설정을 읽지 못했어요.';
      }
    })();
    return () => {
      disposed = true;
      off();
    };
  });
  async function change(value: boolean) {
    busy = true;
    error = '';
    try {
      await setEnabled(value);
      enabled = value;
    } catch {
      error = '툴킷을 전환하지 못했어요. 다시 시도해 주세요.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="toolkit-toggle-row">
  <span><img src="/images/toolkit/toolkit-icon.png" alt="" />학급 툴킷</span><ToolkitSwitch
    checked={enabled}
    label="학급 툴킷"
    onchange={change}
    disabled={busy}
  />
</div>
{#if error}<p class="toolkit-toggle-error" role="alert">{error}</p>{/if}

<style>
  .toolkit-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 9px;
    font-size: 12px;
    font-weight: 600;
  }
  .toolkit-toggle-row > span {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .toolkit-toggle-row img {
    width: 23px;
    height: 23px;
    object-fit: contain;
  }
  .toolkit-toggle-error {
    font-size: 11px;
    line-height: 1.5;
    padding: 4px 9px;
  }
  :global(.tk-switch) {
    width: 34px;
    height: 21px;
    border-radius: 20px;
    padding: 3px;
    border: 0;
    display: inline-flex;
    align-items: center;
    background: #92979f;
    flex: none;
    cursor: pointer;
    transition: background 0.14s;
  }
  .toolkit-toggle-row :global(.tk-switch[data-state='checked']) {
    background: var(--header-accent, #a86d29);
  }
  :global(.tk-switch-thumb) {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: white;
    transition: transform 0.14s;
    display: block;
  }
  :global(.tk-switch[data-state='checked'] .tk-switch-thumb) {
    transform: translateX(13px);
  }
</style>
