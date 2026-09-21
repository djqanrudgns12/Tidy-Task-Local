<script lang="ts">
  import { onMount } from 'svelte';
  import { readSettings, subscribeSettings, setEnabled } from '../../lib/toolkit/store.js';
  import ToolkitSwitch from './ToolkitSwitch.svelte';
  let {
    variant = 'compact',
    isDarkMode = false,
    accent = '#d97706',
  } = $props<{
    variant?: 'compact' | 'panel';
    isDarkMode?: boolean;
    accent?: string;
  }>();
  let enabled = $state(false),
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

{#if variant === 'panel'}
  <section
    class="toolkit-toggle-panel"
    class:panel-dark={isDarkMode}
    style="--toolkit-accent: {accent};"
    aria-labelledby="toolkit-toggle-title"
  >
    <div class="toolkit-toggle-panel-row">
      <div class="toolkit-toggle-identity">
        <span class="toolkit-toggle-icon" aria-hidden="true">
          <img src="/images/toolkit/toolkit-icon.png" alt="" />
        </span>
        <div class="toolkit-toggle-copy">
          <h2 id="toolkit-toggle-title">Tidy 툴킷</h2>
          <p>수업에 필요한 도구를 모아 놓은 툴킷입니다.</p>
        </div>
      </div>
      <ToolkitSwitch
        checked={enabled}
        label="Tidy 툴킷"
        onchange={change}
        disabled={busy}
      />
    </div>
    {#if error}<p class="toolkit-toggle-error" role="alert">{error}</p>{/if}
  </section>
{:else}
  <div class="toolkit-toggle-row">
    <span><img src="/images/toolkit/toolkit-icon.png" alt="" />Tidy 툴킷</span><ToolkitSwitch
      checked={enabled}
      label="Tidy 툴킷"
      onchange={change}
      disabled={busy}
    />
  </div>
  {#if error}<p class="toolkit-toggle-error" role="alert">{error}</p>{/if}
{/if}

<style>
  .toolkit-toggle-panel {
    --toolkit-ink: #4b5563;
    --toolkit-muted: #64748b;
    --toolkit-surface: rgba(255, 255, 255, 0.6);
    --toolkit-border: rgba(0, 0, 0, 0.04);
    --toolkit-icon-surface: rgba(0, 0, 0, 0.045);
    padding: 14px;
    border: 1px solid var(--toolkit-border);
    border-radius: 12px;
    color: var(--toolkit-ink);
    background: var(--toolkit-surface);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
    transition: background 0.3s, border-color 0.3s, color 0.3s;
  }
  .toolkit-toggle-panel.panel-dark {
    --toolkit-ink: #cbd5e1;
    --toolkit-muted: #94a3b8;
    --toolkit-surface: rgba(0, 0, 0, 0.2);
    --toolkit-border: rgba(255, 255, 255, 0.05);
    --toolkit-icon-surface: rgba(255, 255, 255, 0.08);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .toolkit-toggle-panel-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .toolkit-toggle-identity {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .toolkit-toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 9px;
    background: var(--toolkit-icon-surface);
  }
  .toolkit-toggle-icon img {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }
  .toolkit-toggle-copy {
    min-width: 0;
  }
  .toolkit-toggle-copy h2 {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    font-weight: 700;
  }
  .toolkit-toggle-copy p {
    margin: 4px 0 0;
    color: var(--toolkit-muted);
    font-size: 10px;
    line-height: 1.5;
    font-weight: 500;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }
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
    color: #b43e3e;
    font-size: 11px;
    line-height: 1.5;
    padding: 4px 9px;
  }
  .toolkit-toggle-panel .toolkit-toggle-error {
    margin: 9px 0 0 44px;
    padding: 0;
    font-size: 9px;
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
  .toolkit-toggle-panel :global(.tk-switch[data-state='checked']) {
    background: var(--toolkit-accent, #d97706);
  }
  .toolkit-toggle-panel :global(.tk-switch:focus-visible) {
    outline: 2px solid var(--toolkit-accent, #d97706);
    outline-offset: 3px;
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
