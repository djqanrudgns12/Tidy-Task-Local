<script lang="ts">
  import { onMount } from 'svelte';
  import { X, MoveHorizontal, MoveVertical, ChevronDown } from 'lucide-svelte';
  import {
    readSettings,
    patchSettings,
    setEnabled,
    subscribeSettings,
    native,
  } from '../../lib/toolkit/store.js';
  import { PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
  import { defaults, TOOLBAR_SIZES } from '../../lib/toolkit/preferences.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import ToolIcon from './ToolIcon.svelte';
  import ToolkitSwitch from './ToolkitSwitch.svelte';
  import ToolkitSelect from './ToolkitSelect.svelte';
  import { TOOLKIT_THEMES } from '../../lib/toolkit/themes.js';
  let config = $state(defaults().toolkit),
    error = $state('');
  let externalExpanded = $state(false);
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });
  async function change(patch: Record<string, unknown>) {
    try {
      config = (await patchSettings('toolkit', patch)).toolkit;
      error = '';
    } catch {
      error = '설정을 저장하지 못했어요.';
    }
  }
  // 도구 표시 줄은 모양이 모두 같아 표 하나로 그립니다. 외부 툴 묶음은 앞 3개와 뒤 3개 사이에 놓입니다.
  type ToolRow = { id: string; title: string; hint: string };
  const TOOL_ROWS_BEFORE_EXTERNAL: ToolRow[] = [
    { id: 'timer', title: '타이머', hint: '수업 시간을 한눈에 확인해요' },
    { id: 'noticeboard', title: '알림장', hint: '작성하고 화이트보드로 보여줘요' },
    { id: 'picker', title: '간단 뽑기', hint: '클래식 · 인형 뽑기 · 풍선 다트' },
  ];
  const TOOL_ROWS_AFTER_EXTERNAL: ToolRow[] = [
    { id: 'focus-bell', title: '집중벨', hint: '소리와 애니메이션으로 시선을 모아요' },
    { id: 'tournament', title: '토너먼트', hint: '대진을 만들고 우리 반 우승자를 정해요' },
    { id: 'roster', title: '학급 명단', hint: '학생과 모둠을 함께 관리해요' },
  ];
  function setToolVisible(id: string, visible: boolean) {
    const others = config.visibleToolIds.filter((toolId) => toolId !== id);
    void change({ visibleToolIds: visible ? [...others, id] : others });
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
    <span class="tk-settings-title"><ToolIcon kind="settings" size={28} />툴킷 설정</span><button
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
    <section class="settings-section theme-setting-card">
      <div class="settings-heading"><div><h2>테마</h2><p>모든 도구에 같은 분위기를 입혀요</p></div></div>
      <div class="theme-picker-row">
        <span class="theme-swatch" aria-hidden="true" style:background={TOOLKIT_THEMES.find(t => t.id === config.theme)?.swatch}></span>
        <ToolkitSelect label="테마 색상" value={config.theme}
          options={TOOLKIT_THEMES.map(t => ({ value: t.id, label: t.label, swatch: t.swatch }))}
          onchange={(theme) => change({ theme })} />
      </div>
      <div class="theme-preview" aria-hidden="true"><span>Aa</span><i></i><i></i><i></i></div>
      {#if config.darkMode}<p class="theme-mode-hint">다크 모드를 끄면 선택한 색상이 적용돼요.</p>{/if}
      <div class="settings-row theme-mode-row">
        <span class="settings-copy"><strong>다크 모드</strong><small>눈이 편안한 어두운 화면</small></span>
        <span class="settings-control"><small class:active={config.darkMode}>{config.darkMode ? '켜짐' : '꺼짐'}</small>
          <ToolkitSwitch label="다크 모드" checked={config.darkMode} onchange={(darkMode) => change({ darkMode })} />
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
      <div class="toolbar-size-control">
        <div class="toolbar-size-heading">
          <label for="toolbar-size">툴바 크기</label>
          <span>{TOOLBAR_SIZES[config.toolbarSize].label}</span>
        </div>
        <input id="toolbar-size" type="range" min="0" max="4" step="1"
          value={config.toolbarSize}
          aria-valuetext={TOOLBAR_SIZES[config.toolbarSize].label}
          style={`--size-progress: ${config.toolbarSize * 25}%`}
          oninput={(e) => change({ toolbarSize: Number(e.currentTarget.value) })} />
        <div class="toolbar-size-labels" aria-hidden="true">
          {#each TOOLBAR_SIZES as size, index}
            <span class:chosen={config.toolbarSize === index}>{size.label}</span>
          {/each}
        </div>
      </div>
    </section>
    <section class="settings-section tools-setting-card">
      <div class="settings-heading">
        <div>
          <h2>보이는 도구</h2>
          <p>자주 쓰는 도구만 남겨두세요</p>
        </div>
      </div>
      {#snippet toolRow(tool: ToolRow)}
        <div class="settings-row tool-setting-row">
          <span class="settings-icon-label">
            <span class="settings-tool-icon"><ToolIcon kind={tool.id} size={36} /></span>
            <span class="settings-copy"><strong>{tool.title}</strong><small>{tool.hint}</small></span>
          </span>
          <ToolkitSwitch
            label={`${tool.title} 표시`}
            checked={config.visibleToolIds.includes(tool.id)}
            onchange={(visible) => setToolVisible(tool.id, visible)}
          />
        </div>
      {/snippet}
      {#each TOOL_ROWS_BEFORE_EXTERNAL as tool (tool.id)}{@render toolRow(tool)}{/each}
      <div class="external-tools-group" class:expanded={externalExpanded}>
        <div class="settings-row tool-setting-row external-tools-heading">
          <button class="external-tools-disclosure" aria-expanded={externalExpanded}
            aria-controls="external-tool-options" onclick={() => externalExpanded = !externalExpanded}>
            <span class="settings-tool-icon"><ToolIcon kind="external" size={36} /></span>
            <span class="settings-copy"><strong>외부 툴</strong><small>롤린썬더 · 클래너</small></span>
            <ChevronDown size={16} />
          </button>
          <ToolkitSwitch label="외부 툴 표시" checked={config.externalToolsEnabled}
            onchange={(v) => change({ externalToolsEnabled: v })} />
        </div>
        <div id="external-tool-options" class="external-tool-options" hidden={!externalExpanded}>
        {#each PLATFORM_TOOLS as tool}
        <div class="settings-row tool-setting-row">
          <span class="settings-icon-label">
            <span class="settings-tool-icon toolkit-platform-icon"><img src={tool.icon} alt="" draggable="false" /></span>
            <span class="settings-copy"><strong>{tool.label}</strong><small>웹사이트 바로가기</small></span>
          </span>
          <ToolkitSwitch label={`${tool.label} 표시`}
            checked={!config.hiddenPlatformIds.includes(tool.id)}
            onchange={(v) => change({ hiddenPlatformIds: v ? config.hiddenPlatformIds.filter((id) => id !== tool.id) : [...config.hiddenPlatformIds, tool.id] })} />
        </div>
        {/each}
        {#if !config.externalToolsEnabled}<p class="external-tools-hint">외부 툴을 켜면 선택한 도구가 툴바에 표시돼요.</p>{/if}
        </div>
      </div>
      {#each TOOL_ROWS_AFTER_EXTERNAL as tool (tool.id)}{@render toolRow(tool)}{/each}
    </section>
    {#if error}<p class="tk-error" role="alert">{error}</p>{/if}
  </div>
</section>
