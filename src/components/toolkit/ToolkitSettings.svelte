<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { sortToolRows } from '../../lib/toolkit/sortTools.js';
  import { X, MoveHorizontal, MoveVertical, ChevronDown, GripVertical, Type, BringToFront, SendToBack } from 'lucide-svelte';
  import {
    readSettings,
    patchSettings,
    setEnabled,
    subscribeSettings,
    previewToolOrder,
    native,
  } from '../../lib/toolkit/store.js';
  import { PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
  import { defaults, TOOLBAR_SIZES, groupToolOrder, isToolEnabled } from '../../lib/toolkit/preferences.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import ToolIcon from './ToolIcon.svelte';
  import ToolkitSwitch from './ToolkitSwitch.svelte';
  import ToolkitSelect from './ToolkitSelect.svelte';
  import { TOOLKIT_THEMES } from '../../lib/toolkit/themes.js';
  import { uiFontChoices, uiFontStack, watchCustomFonts } from '../../lib/toolkit/appearance.js';
  import type { CustomFont } from '../../lib/toolkit/appearance.js';
  import { registerFontFace } from '../../lib/fonts.js';
  let config = $state(defaults().toolkit),
    error = $state('');
  // 글꼴 목록은 Tidy Task에서 읽기만 합니다. 고른 값은 툴킷 설정에만 저장되어 Tidy Task 글꼴에 영향을 주지 않습니다.
  let customFonts = $state<CustomFont[]>([]);
  let customFontsLoaded = $state(false);
  const fontChoices = $derived(uiFontChoices(customFonts));
  // 등록 글꼴이 Tidy Task에서 지워졌으면 목록에 없으므로, 지금 값을 따로 보여 주어 선택 상자가 비지 않게 합니다.
  const fontMissing = $derived(customFontsLoaded && !fontChoices.some((font) => font.name === config.uiFontFamily));
  const fontOptions = $derived([
    ...(fontMissing ? [{ value: config.uiFontFamily, label: config.uiFontFamily, note: '찾을 수 없음' }] : []),
    ...fontChoices.map((font) => ({
      value: font.name,
      label: font.name,
      font: uiFontStack({ uiFontFamily: font.name }),
      note: font.custom ? '내 글꼴' : undefined,
    })),
  ]);
  let externalExpanded = $state(false);
  let draggedId = $state('');
  let toolsSaving = $state(false);
  let draftOrder = $state<string[] | null>(null);
  const renderedOrder = $derived(groupToolOrder(draftOrder ?? config.toolOrderIds, config));
  const enabledIds = $derived(renderedOrder.filter((id) => isToolEnabled(config, id)));
  const disabledIds = $derived(renderedOrder.filter((id) => !isToolEnabled(config, id)));
  const renderedItems = $derived([...enabledIds, ...(disabledIds.length ? ['disabled-divider', ...disabledIds] : [])]);
  function previewOrder(ids: string[] | null) {
    draftOrder = ids;
    void previewToolOrder(ids).catch(() => {});
  }
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });
  async function change(patch: Record<string, unknown>) {
    try {
      config = (await patchSettings('toolkit', patch)).toolkit;
      error = '';
    } catch {
      error = '설정을 저장하지 못했어요.';
    }
  }
  // 도구는 하나의 목록에 두고, 표시 상태에 따라 활성화·비활성화 영역으로 모읍니다.
  type ToolRow = { id: string; title: string; hint: string };
  const TOOL_ROWS: ToolRow[] = [
    { id: 'timer', title: '타이머', hint: '수업 시간을 한눈에 확인해요' },
    { id: 'clock', title: '시계', hint: '지금 몇 시인지 표준시로 크게 보여줘요' },
    { id: 'picker', title: '간단 뽑기', hint: '클래식 · 인형 뽑기 · 풍선 다트' },
    { id: 'noticeboard', title: '알림장', hint: '작성하고 화이트보드로 보여줘요' },
    { id: 'tournament', title: '토너먼트', hint: '대진을 만들고 우리 반 우승자를 정해요' },
    { id: 'focus-bell', title: '집중벨', hint: '소리와 애니메이션으로 시선을 모아요' },
    { id: 'dice', title: '주사위', hint: '1~3개를 던지고 합계를 크게 보여줘요' },
    { id: 'scoreboard', title: '점수판', hint: '개인 · 모둠 · 커스텀 점수를 크게 보여줘요' },
    { id: 'thermometer', title: '학급 온도계', hint: '우리 반 공동 목표를 온도로 보여줘요' },
    { id: 'vote', title: '학급 투표', hint: '키보드로 비밀 투표하고 두근두근 개표해요' },
    { id: 'seating', title: '자리 배치', hint: '교실 자리를 고르고 배치해요' },
    { id: 'roster', title: '학급 명단', hint: '학생과 모둠을 함께 관리해요' },
  ];
  const TOOL_ROWS_BY_ID: Record<string, ToolRow> = Object.fromEntries(TOOL_ROWS.map((tool) => [tool.id, tool]));
  async function saveOrder(ids: string[]) {
    if (toolsSaving) return false;
    toolsSaving = true;
    const before = config.toolOrderIds;
    config = { ...config, toolOrderIds: ids };
    try {
      config = (await patchSettings('toolkit', { toolOrderIds: ids })).toolkit;
      error = '';
      return true;
    } catch {
      config = { ...config, toolOrderIds: before };
      error = '도구 순서를 저장하지 못했어요.';
      return false;
    } finally {
      toolsSaving = false;
    }
  }
  function moveWithKey(event: KeyboardEvent, id: string) {
    if (draggedId || toolsSaving || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const ids = [...config.toolOrderIds];
    const index = ids.indexOf(id);
    const target = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (target < 0 || target >= ids.length) return;
    if (isToolEnabled(config, id) !== isToolEnabled(config, ids[target])) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void saveOrder(ids);
  }
  async function setToolVisible(id: string, visible: boolean) {
    if (toolsSaving || draggedId) return;
    toolsSaving = true;
    try {
      const others = config.visibleToolIds.filter((toolId) => toolId !== id);
      await change(id === 'external' ? { externalToolsEnabled: visible } : { visibleToolIds: visible ? [...others, id] : others });
    } finally {
      toolsSaving = false;
    }
  }
  onMount(() => {
    let off = () => {};
    let offFonts = () => {};
    let disposed = false;
    void watchCustomFonts((fonts) => {
      customFonts = fonts;
      customFontsLoaded = true;
      // 목록에서 각 글꼴 모양을 미리 보이려면 이 창에도 등록 글꼴 파일을 불러와야 합니다.
      for (const font of fonts) void registerFontFace(font.name, font.path);
    })
      .then((fn) => {
        if (disposed) fn();
        else offFonts = fn;
      })
      .catch(() => {
        customFontsLoaded = true;
      });
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
      void previewToolOrder(null).catch(() => {});
      off();
      offFonts();
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
    <section class="settings-section ui-setting-card">
      <div class="settings-heading"><div><h2>UI 설정</h2><p>툴킷 화면에 쓰는 글꼴을 골라요</p></div></div>
      <div class="theme-picker-row ui-font-row">
        <span class="ui-font-icon" aria-hidden="true"><Type size={16} /></span>
        <ToolkitSelect label="UI 글꼴" value={config.uiFontFamily}
          options={fontOptions}
          onchange={(uiFontFamily) => change({ uiFontFamily })} />
      </div>
      <p class="ui-font-preview" aria-hidden="true" style:font-family={uiFontStack(config)}>가나다라 Aa 0123</p>
      {#if fontMissing}
        <p class="theme-mode-hint">이 글꼴을 찾을 수 없어 맑은 고딕으로 보여요. 다른 글꼴을 골라 주세요.</p>
      {:else}
        <p class="ui-font-hint">Tidy Task 메모 글꼴과는 따로 저장돼요. 글꼴 파일은 Tidy Task 설정에서 추가할 수 있어요.</p>
      {/if}
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
      <!-- 툴바가 늘 위에 떠 있어 다른 창을 가린다는 의견이 있어, 다른 창 뒤로 보낼 수 있게 합니다. -->
      <div class="toolbar-layer-control" role="radiogroup" aria-labelledby="toolbar-layer-title">
        <div class="toolbar-size-heading">
          <strong id="toolbar-layer-title">툴바 위치</strong>
          <span>{config.alwaysOnTop ? '항상 위' : '다른 창 뒤'}</span>
        </div>
        <div class="orientation-options">
          <button
            role="radio"
            class:chosen={config.alwaysOnTop}
            aria-checked={config.alwaysOnTop}
            onclick={() => change({ alwaysOnTop: true })}
            ><span class="orientation-icon"><BringToFront size={20} /></span><span>맨 앞으로</span
            ><i aria-hidden="true"></i></button
          ><button
            role="radio"
            class:chosen={!config.alwaysOnTop}
            aria-checked={!config.alwaysOnTop}
            onclick={() => change({ alwaysOnTop: false })}
            ><span class="orientation-icon"><SendToBack size={20} /></span><span>맨 뒤로</span
            ><i aria-hidden="true"></i></button
          >
        </div>
        <p class="toolbar-layer-hint">
          {#if config.alwaysOnTop}
            툴바가 다른 창에 가려지지 않고 늘 위에 보여요.
          {:else}
            다른 창이 툴바를 덮을 수 있어요. 툴바를 누르거나 트레이의 'Tidy 툴킷 열기'로 다시 앞으로 불러요.
          {/if}
        </p>
      </div>
    </section>
    <section class="settings-section tools-setting-card">
      <div class="settings-heading">
        <div>
          <h2>보이는 도구</h2>
          <p>자주 쓰는 도구를 고르고, 손잡이를 끌어 순서를 바꿔요</p>
        </div>
      </div>
      {#snippet toolRow(tool: ToolRow)}
        <div class="settings-row tool-setting-row">
          <button class="tool-order-grip"
            aria-label={`${tool.title} 순서 변경. 위쪽 또는 아래쪽 화살표로 이동`}
            title="끌어서 순서 변경"
            onkeydown={(event) => moveWithKey(event, tool.id)}><GripVertical size={18} /></button>
          <span class="settings-icon-label">
            <span class="settings-tool-icon"><ToolIcon kind={tool.id} size={36} /></span>
            <span class="settings-copy"><strong>{tool.title}</strong><small>{tool.hint}</small></span>
          </span>
          <ToolkitSwitch
            label={`${tool.title} 표시`}
            checked={config.visibleToolIds.includes(tool.id)}
            disabled={toolsSaving || !!draggedId}
            onchange={(visible) => setToolVisible(tool.id, visible)}
          />
        </div>
      {/snippet}
      <div class="tool-order-list" role="list"
        use:sortToolRows={{ order: renderedOrder, groups: [enabledIds, disabledIds], disabled: toolsSaving, onpreview: previewOrder, onactive: (id) => draggedId = id, oncommit: saveOrder }}>
      {#each renderedItems as id (id)}
        <div class="tool-order-item" role={id === 'disabled-divider' ? 'presentation' : 'listitem'} data-tool-order-id={id === 'disabled-divider' ? undefined : id}
          class:tool-disabled={id !== 'disabled-divider' && !isToolEnabled(config, id)}
          class:tool-disabled-last={id === disabledIds.at(-1)}
          class:tool-disabled-divider={id === 'disabled-divider'}
          class:sort-placeholder={draggedId === id}
          animate:flip={{ duration: draggedId === id ? 0 : draggedId ? 180 : 240, easing: cubicOut }}>
        {#if id === 'disabled-divider'}
          <div class="disabled-tools-heading"><span>비활성화된 도구</span><small>{disabledIds.length}개</small></div>
        {:else if id === 'external'}
          <div class="external-tools-group" class:expanded={externalExpanded}>
            <div class="settings-row tool-setting-row external-tools-heading" role="group" aria-label="외부 툴 순서와 표시 설정">
              <button class="tool-order-grip"
                aria-label="외부 툴 순서 변경. 위쪽 또는 아래쪽 화살표로 이동"
                title="끌어서 순서 변경"
                onkeydown={(event) => moveWithKey(event, id)}><GripVertical size={18} /></button>
              <button class="external-tools-disclosure" aria-expanded={externalExpanded}
                aria-controls="external-tool-options" onclick={() => externalExpanded = !externalExpanded}>
                <span class="settings-tool-icon"><ToolIcon kind="external" size={36} /></span>
                <span class="settings-copy"><strong>외부 툴</strong><small>롤린썬더 · 클래너</small></span>
                <ChevronDown size={16} />
              </button>
              <ToolkitSwitch label="외부 툴 표시" checked={config.externalToolsEnabled}
                disabled={toolsSaving || !!draggedId}
                onchange={(v) => setToolVisible(id, v)} />
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
                onchange={(v) => change({ hiddenPlatformIds: v ? config.hiddenPlatformIds.filter((platformId) => platformId !== tool.id) : [...config.hiddenPlatformIds, tool.id] })} />
            </div>
            {/each}
            {#if !config.externalToolsEnabled}<p class="external-tools-hint">외부 툴을 켜면 선택한 도구가 툴바에 표시돼요.</p>{/if}
            </div>
          </div>
        {:else}
          {@render toolRow(TOOL_ROWS_BY_ID[id])}
        {/if}
        </div>
      {/each}
        </div>
    </section>
    {#if error}<p class="tk-error" role="alert">{error}</p>{/if}
  </div>
</section>
