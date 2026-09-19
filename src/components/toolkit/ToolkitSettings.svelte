<script lang="ts">
  import { onMount } from 'svelte';
  import { X, MoveHorizontal, MoveVertical, Timer } from 'lucide-svelte';
  import {
    readSettings,
    patchSettings,
    setEnabled,
    subscribeSettings,
    native,
  } from '../../lib/toolkit/store.js';
  import { defaults } from '../../lib/toolkit/preferences.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import ToolkitSwitch from './ToolkitSwitch.svelte';
  let config = $state(defaults().toolkit),
    error = $state('');
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });
  async function change(patch: Record<string, unknown>) {
    try {
      config = (await patchSettings('toolkit', patch)).toolkit;
      error = '';
    } catch {
      error = '설정을 저장하지 못했어요.';
    }
  }
  onMount(() => {
    let off = () => {};
    let disposed = false;
    void (async () => {
      try {
        const fn = await subscribeSettings((s) => (config = s.toolkit));
        if (disposed) {
          fn();
          return;
        }
        off = fn;
        config = (await readSettings()).toolkit;
      } catch {
        error = '설정을 읽지 못했어요.';
      }
    })();
    return () => {
      disposed = true;
      off();
    };
  });
</script>

<section class="tk-settings-frame">
  <header use:draggable>
    <span>툴킷 설정</span><button class="tk-icon-button" aria-label="닫기" onclick={closeWindow}
      ><X size={18} /></button
    >
  </header>
  <div class="tk-settings-body">
    <div class="toolkit-intro">
      <img src="/images/toolkit/toolkit-icon.png" alt="" />
      <div>
        <h1>내 책상 위 작은 도구함</h1>
        <p>필요한 도구만, 편한 모습으로.</p>
      </div>
    </div>
    <section class="settings-section">
      <div class="settings-row">
        <span>학급 툴킷</span><ToolkitSwitch
          label="학급 툴킷"
          checked={config.enabled}
          onchange={(v) => setEnabled(v).catch(() => (error = '전환하지 못했어요.'))}
        />
      </div>
    </section>
    <section class="settings-section">
      <h2>툴바 방향</h2>
      <div class="orientation-options">
        <button
          class:chosen={config.orientation === 'horizontal'}
          aria-pressed={config.orientation === 'horizontal'}
          onclick={() => change({ orientation: 'horizontal' })}
          ><MoveHorizontal size={24} /><span>가로로</span></button
        ><button
          class:chosen={config.orientation === 'vertical'}
          aria-pressed={config.orientation === 'vertical'}
          onclick={() => change({ orientation: 'vertical' })}
          ><MoveVertical size={24} /><span>세로로</span></button
        >
      </div>
    </section>
    <section class="settings-section">
      <h2>보이는 도구</h2>
      <div class="settings-row">
        <span class="settings-icon-label"><Timer size={18} />타이머</span><ToolkitSwitch
          label="타이머 표시"
          checked={config.visibleToolIds.includes('timer')}
          onchange={(v) => change({ visibleToolIds: v ? ['timer'] : [] })}
        />
      </div>
    </section>
    {#if error}<p class="tk-error" role="alert">{error}</p>{/if}
  </div>
</section>
