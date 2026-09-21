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
  import { PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
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
    <span class="tk-settings-title"><i aria-hidden="true"></i>툴킷 설정</span><button
      class="tk-icon-button"
      aria-label="닫기"
      onclick={closeWindow}
      ><X size={18} /></button
    >
  </header>
  <div class="tk-settings-body">
    <div class="toolkit-intro">
      <span class="toolkit-intro-icon"><img src="/images/toolkit/toolkit-icon.png" alt="" /></span>
      <div class="toolkit-intro-copy">
        <span class="toolkit-eyebrow">CLASSROOM TOOLKIT</span>
        <h1>내 책상 위 작은 도구함</h1>
        <p>필요한 도구만, 편한 모습으로.</p>
      </div>
    </div>
    <section class="settings-section master-setting-card">
      <div class="settings-row">
        <span class="settings-copy">
          <strong>Tidy 툴킷</strong>
          <small>화면에 툴킷을 표시해요</small>
        </span>
        <span class="settings-control">
          <small class:active={config.enabled}>{config.enabled ? '켜짐' : '꺼짐'}</small>
          <ToolkitSwitch
            label="Tidy 툴킷"
            checked={config.enabled}
            onchange={(v) => setEnabled(v).catch(() => (error = '전환하지 못했어요.'))}
          />
        </span>
      </div>
    </section>
    <section class="settings-section direction-setting-card">
      <div class="settings-heading">
        <div>
          <h2>툴바 방향</h2>
          <p>화면 배치에 맞게 골라보세요</p>
        </div>
      </div>
      <div class="orientation-options">
        <button
          class:chosen={config.orientation === 'horizontal'}
          aria-pressed={config.orientation === 'horizontal'}
          onclick={() => change({ orientation: 'horizontal' })}
          ><span class="orientation-icon"><MoveHorizontal size={20} /></span><span>가로로</span
          ><i aria-hidden="true"></i></button
        ><button
          class:chosen={config.orientation === 'vertical'}
          aria-pressed={config.orientation === 'vertical'}
          onclick={() => change({ orientation: 'vertical' })}
          ><span class="orientation-icon"><MoveVertical size={20} /></span><span>세로로</span
          ><i aria-hidden="true"></i></button
        >
      </div>
    </section>
    <section class="settings-section tools-setting-card">
      <div class="settings-heading">
        <div>
          <h2>보이는 도구</h2>
          <p>자주 쓰는 도구만 남겨두세요</p>
        </div>
      </div>
      <div class="settings-row tool-setting-row">
        <span class="settings-icon-label">
          <span class="tool-icon"><Timer size={18} /></span>
          <span class="settings-copy"><strong>타이머</strong><small>수업 시간을 한눈에 확인해요</small></span>
        </span><ToolkitSwitch
          label="타이머 표시"
          checked={config.visibleToolIds.includes('timer')}
          onchange={(v) => change({ visibleToolIds: v ? [...config.visibleToolIds, 'timer'] : config.visibleToolIds.filter(id => id !== 'timer') })}
        />
      </div>
      <div class="settings-row tool-setting-row"><span class="settings-copy"><strong>알림장</strong><small>작성하고 화이트보드로 보여줘요</small></span><ToolkitSwitch label="알림장 표시" checked={config.visibleToolIds.includes('noticeboard')} onchange={(v) => change({visibleToolIds: v ? [...config.visibleToolIds, 'noticeboard'] : config.visibleToolIds.filter(id => id !== 'noticeboard')})} /></div>
      <div class="settings-row tool-setting-row"><span class="settings-copy"><strong>간단 뽑기</strong><small>클래식 · 인형 뽑기 · 풍선 다트</small></span><ToolkitSwitch label="간단 뽑기 표시" checked={config.visibleToolIds.includes('picker')} onchange={(v) => change({visibleToolIds: v ? [...config.visibleToolIds, 'picker'] : config.visibleToolIds.filter(id => id !== 'picker')})} /></div>
      {#each PLATFORM_TOOLS as tool}
        <div class="settings-row tool-setting-row">
          <span class="settings-icon-label">
            <span class="toolkit-platform-icon"><img src={tool.icon} alt="" draggable="false" /></span>
            <span class="settings-copy"><strong>{tool.label}</strong><small>웹사이트 바로가기</small></span>
          </span>
          <ToolkitSwitch label={`${tool.label} 표시`}
            checked={!config.hiddenPlatformIds.includes(tool.id)}
            onchange={(v) => change({ hiddenPlatformIds: v ? config.hiddenPlatformIds.filter((id) => id !== tool.id) : [...config.hiddenPlatformIds, tool.id] })} />
        </div>
      {/each}
      <div class="settings-row tool-setting-row"><span class="settings-copy"><strong>학급 명단</strong><small>학생과 모둠을 함께 관리해요</small></span><ToolkitSwitch label="학급 명단 표시" checked={config.visibleToolIds.includes('roster')} onchange={(v) => change({visibleToolIds: v ? [...config.visibleToolIds, 'roster'] : config.visibleToolIds.filter(id => id !== 'roster')})} /></div>
    </section>
    {#if error}<p class="tk-error" role="alert">{error}</p>{/if}
  </div>
</section>
