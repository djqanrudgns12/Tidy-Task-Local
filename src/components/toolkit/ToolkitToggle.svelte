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
  /* panel: 설정 창의 묶음 카드 안에 들어가는 한 줄입니다.
     카드(테두리·배경)는 설정 창이 그리므로 여기서는 내용만 그리고,
     글자는 em이라 설정 창의 "UI 글자 크기"를 따라 함께 커지고 작아집니다. */
  .toolkit-toggle-panel {
    --toolkit-ink: #1f2937;
    --toolkit-muted: #6b7280;
    --toolkit-icon-surface: rgba(15, 23, 42, 0.05);
    color: var(--toolkit-ink);
    transition: color 0.25s;
  }
  .toolkit-toggle-panel.panel-dark {
    --toolkit-ink: #e5e7eb;
    --toolkit-muted: #9aa5b8;
    --toolkit-icon-surface: rgba(255, 255, 255, 0.08);
  }
  .toolkit-toggle-panel-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
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
    font-size: 0.86em;
    line-height: 1.4;
    font-weight: 700;
  }
  .toolkit-toggle-copy p {
    margin: 2px 0 0;
    color: var(--toolkit-muted);
    font-size: 0.72em;
    line-height: 1.45;
    font-weight: 500;
    text-wrap: pretty;
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
    margin: 8px 0 0 44px;
    padding: 0;
    font-size: 0.72em;
    font-weight: 700;
  }
  /* 설정 창의 다른 스위치(SwitchRow)와 같은 크기·꺼짐 색으로 맞춥니다. */
  .toolkit-toggle-panel :global(.tk-switch) {
    width: 34px;
    height: 20px;
  }
  .toolkit-toggle-panel :global(.tk-switch:not([data-state='checked'])) {
    background: rgba(15, 23, 42, 0.2);
  }
  .toolkit-toggle-panel.panel-dark :global(.tk-switch:not([data-state='checked'])) {
    background: rgba(255, 255, 255, 0.22);
  }
  .toolkit-toggle-panel :global(.tk-switch-thumb) {
    width: 14px;
    height: 14px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  }
  .toolkit-toggle-panel :global(.tk-switch[data-state='checked'] .tk-switch-thumb) {
    transform: translateX(14px);
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
