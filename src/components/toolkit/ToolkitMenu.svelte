<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { TIMER_TOOLS, SCOREBOARD_TOOLS, PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
  import { defaults } from '../../lib/toolkit/preferences.js';
  import { moreTools } from '../../lib/toolkit/moreTools.js';
  import ToolIcon from './ToolIcon.svelte';
  import { contextPanel } from '../../lib/toolkit/contextPanel.js';
  import ToolkitQuickTools from './ToolkitQuickTools.svelte';
  import { native, readSettings, subscribeSettings, patchSettings, setEnabled } from '../../lib/toolkit/store.js';
  import { openTool, openPlatform, dismissMenu, centerToolbar } from '../../lib/toolkit/windows.js';
  import TimerIcon from './TimerIcon.svelte';
  import { ArrowUpRight, Minimize2, Maximize2, LocateFixed, Settings, Power, GripHorizontal } from 'lucide-svelte';
  // ondone: 브라우저 미리보기에서는 메뉴가 툴바 안에 그려지므로, 동작 뒤 닫기를 툴바에 맡깁니다.
  let { kind = 'timer', ondone } = $props<{ kind?: 'timer' | 'scoreboard' | 'external' | 'more' | 'context'; ondone?: () => void }>();
  // 점수판 메뉴: 마지막으로 연 항목에 초점을 두어 Enter 한 번으로 다시 열게 하고, 이미 열린 창에는 점을 찍습니다.
  // 왜 localStorage인가: 잃어도 첫 항목에 초점이 갈 뿐인 편의 값이라 저장소를 따로 두지 않습니다.
  let config = $state(defaults().toolkit);
  let groupId = $state('');
  const archived = $derived(moreTools(config));
  const group = $derived(archived.find((tool) => tool.id === groupId));
  async function selectGroup(id: string) { groupId = id; await tick(); focusFirst(); }
  const LAST_KEY = 'tidy-scoreboard-menu-last';
  let openLabels = $state<string[]>([]);
  function lastScoreboard() {
    try { return localStorage.getItem(LAST_KEY); } catch { return null; }
  }
  async function refreshOpen() {
    if (kind !== 'scoreboard' || !native) return;
    const found = await Promise.all(SCOREBOARD_TOOLS.map(async (tool) => ((await WebviewWindow.getByLabel(tool.id)) ? tool.id : '')));
    openLabels = found.filter(Boolean);
  }
  function focusFirst() {
    const last = kind === 'scoreboard' ? lastScoreboard() : null;
    const target = (last && list.querySelector<HTMLButtonElement>(`button[data-tool="${last}"]`)) || list.querySelector('button');
    target?.focus();
  }
  let list: HTMLDivElement;
  let error = $state('');
  let panelDragging = $state(false);
  let hiddenPlatformIds = $state<string[]>([]);
  let externalToolsEnabled = $state(true);
  let collapsed = $state(false);
  let suppressInitialFocusRing = $state(true);
  let focusDismissTimer: ReturnType<typeof setTimeout>;
  const visiblePlatforms = $derived(
    PLATFORM_TOOLS.filter((tool) => externalToolsEnabled && !hiddenPlatformIds.includes(tool.id)),
  );
  const menuLabel = $derived(kind === 'timer' ? '타이머' : kind === 'scoreboard' ? '점수판' : kind === 'external' ? '외부 툴' : kind === 'more' ? '더보기' : 'Tidy 툴킷');
  async function launch(id: string, platform = false) {
    try {
      if (kind === 'timer' || (kind === 'more' && !platform)) await openTool(id);
      else if (kind === 'scoreboard') {
        await openTool(id);
        try { localStorage.setItem(LAST_KEY, id); } catch {}
      } else await openPlatform(id);
      await dismissMenu(kind);
      ondone?.();
    } catch {
      error = '창을 열지 못했어요. 다시 눌러 주세요.';
    }
  }
  async function runContext(action: 'collapse' | 'center' | 'settings' | 'disable') {
    try {
      // 먼저 숨겨야 툴바 크기 맞춤·이동이 떠 있는 메뉴와 겹쳐 보이지 않습니다.
      await dismissMenu('context');
      if (action === 'collapse') await patchSettings('toolkit', { collapsed: !collapsed });
      else if (action === 'center') await centerToolbar();
      else if (action === 'settings') await openTool('toolkit-settings');
      // 끄기는 설정의 on/off와 같은 경로(toolkit_set_enabled)라 설정 창 토글도 함께 꺼집니다. 이 메뉴 창도 여기서 닫힙니다.
      else await setEnabled(false);
      ondone?.();
    } catch {
      error = '실행하지 못했어요. 다시 눌러 주세요.';
    }
  }
  async function keys(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (kind === 'context' && e.key !== 'Escape') return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Tab' || ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      suppressInitialFocusRing = false;
    }
    if (e.key === 'Escape' && kind === 'more' && group) {
      e.preventDefault();
      await selectGroup('');
      return;
    }
    if (e.key === 'Escape') {
      await dismissMenu(kind);
      ondone?.();
      if (native) await (await WebviewWindow.getByLabel('toolkit'))?.setFocus();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      buttons[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus();
    }
  }
  onMount(() => {
    focusFirst();
    void refreshOpen();
    let offFocus = () => {};
    let offSettings = () => {};
    let disposed = false;
    if (kind !== 'timer' && kind !== 'scoreboard') {
      const apply = (settings: Awaited<ReturnType<typeof readSettings>>) => {
        if (disposed) return;
        config = settings.toolkit;
        if (groupId && !moreTools(config).some((tool) => tool.id === groupId)) groupId = '';
        void tick().then(() => { if (!disposed && kind === 'more' && !list.contains(document.activeElement)) focusFirst(); });
        hiddenPlatformIds = settings.toolkit.hiddenPlatformIds;
        externalToolsEnabled = settings.toolkit.externalToolsEnabled;
        collapsed = settings.toolkit.collapsed;
      };
      void subscribeSettings(apply).then((fn) => {
        if (disposed) fn();
        else offSettings = fn;
      });
      void readSettings().then(apply);
    }
    if (native)
      void getCurrentWindow()
        .onFocusChanged(({ payload }) => {
          clearTimeout(focusDismissTimer);
          if (!payload) {
            // 툴바 버튼을 다시 누를 때는 메뉴 창의 blur가 버튼 click보다 먼저 옵니다.
            // 즉시 숨기면 click 쪽에서 닫힌 메뉴를 다시 열기 때문에, 토글 판단이 끝날 틈을 둡니다.
            focusDismissTimer = setTimeout(() => { if (!panelDragging) void dismissMenu(kind); }, 120);
          } else {
            suppressInitialFocusRing = true;
            focusFirst();
            void refreshOpen();
          }
        })
        .then((fn) => {
          if (disposed) fn();
          else offFocus = fn;
        });
    return () => {
      disposed = true;
      clearTimeout(focusDismissTimer);
      offFocus();
      offSettings();
    };
  });
</script>

<svelte:window onkeydown={keys} />
<div
  class="toolkit-menu"
  class:suppress-initial-focus-ring={suppressInitialFocusRing}
  bind:this={list}
  use:contextPanel={{ enabled: kind === 'context', ondrag: (active) => panelDragging = active }}
  role={kind === 'context' ? 'dialog' : 'menu'}
  aria-label={`${menuLabel} 선택`}
  class:more-menu={kind === 'more'}
  class:external-menu={kind === 'external'}
  class:scoreboard-menu={kind === 'scoreboard'}
  class:context-menu={kind === 'context'}
  tabindex="-1"
  oncontextmenu={(e) => e.preventDefault()}
>
  {#if kind === 'context'}
    <header class="context-panel-heading" data-panel-drag title="잡고 끌어서 패널 이동">
      <span>{menuLabel}</span><span class="context-panel-grip"><GripHorizontal size={16}/><span>이동</span></span>
    </header>
  {:else}<p class="toolkit-menu-heading">{menuLabel}</p>{/if}
  {#if kind === 'more'}
    {#if group}
      <button role="menuitem" class="more-back" onclick={() => selectGroup('')}>← 더보기 목록</button>
      <p class="toolkit-menu-heading">{group.label}</p>
      {#each group.entries as entry}
        <button role="menuitem" onclick={() => launch(entry.id)}>
          <span class="menu-icon">{#if group.id === 'timer'}<TimerIcon kind={entry.id} />{:else}<ToolIcon kind={entry.id} size={26} />{/if}</span>
          <span>{entry.label}</span><ArrowUpRight size={14} />
        </button>
      {/each}
    {:else}
      <p class="more-description">툴바에서 숨긴 도구를 여기서 열 수 있어요.</p>
      {#each archived as tool (tool.id)}
        <button role="menuitem" aria-haspopup={tool.entries.length ? 'menu' : undefined}
          onclick={() => tool.entries.length ? selectGroup(tool.id) : launch(tool.id, tool.platform)}>
          <span class="menu-icon"><ToolIcon kind={tool.platform ? 'external' : tool.id} size={26} /></span>
          <span>{tool.label}</span>{#if tool.entries.length}<span aria-hidden="true">›</span>{:else}<ArrowUpRight size={14} />{/if}
        </button>
      {:else}
        <p class="more-empty">모든 도구가 툴바에 표시되어 있어요.</p>
      {/each}
    {/if}
  {:else if kind === 'timer'}
    {#each TIMER_TOOLS as tool}<button
      role="menuitem"
      onclick={() => launch(tool.id)}
      ><span class="menu-icon"><TimerIcon kind={tool.id} /></span><span>{tool.label}</span><ArrowUpRight
        size={14}
      /></button
    >{/each}
  {:else if kind === 'scoreboard'}
    {#each SCOREBOARD_TOOLS as tool}<button
      role="menuitem"
      data-tool={tool.id}
      title={openLabels.includes(tool.id) ? `${tool.label} (열려 있어요 · 누르면 앞으로)` : tool.label}
      onclick={() => launch(tool.id)}
      ><span class="menu-icon"><ToolIcon kind={tool.id} size={26} /></span><span class="menu-copy"
        ><span class="menu-title">{tool.label}{#if openLabels.includes(tool.id)}<i class="menu-open-dot" aria-label="열려 있음"></i>{/if}</span
        ><small>{tool.hint}</small></span
      ><ArrowUpRight size={14} /></button
    >{/each}
  {:else if kind === 'context'}
    <div class="context-shortcuts">
      <button onclick={() => runContext('collapse')}><span class="menu-icon">{#if collapsed}<Maximize2 size={15}/>{:else}<Minimize2 size={15}/>{/if}</span><span>{collapsed ? '펼치기' : '접기'}</span></button>
      <button title="툴킷을 화면 가운데로 이동" onclick={() => runContext('center')}><span class="menu-icon"><LocateFixed size={15}/></span><span>가운데로</span></button>
    </div>
    <ToolkitQuickTools />
    <div class="context-footer">
      <button onclick={() => runContext('settings')}><Settings size={15}/><span>전체 설정</span></button>
      <button class="context-power" onclick={() => runContext('disable')}><Power size={15}/><span>툴킷 끄기</span></button>
    </div>
  {:else}
    {#each visiblePlatforms as tool}<button
        role="menuitem"
        title={`${tool.label} 웹사이트 열기`}
        onclick={() => launch(tool.id)}
        ><span class="menu-icon platform-menu-icon"><img src={tool.icon} alt="" draggable="false" /></span><span>{tool.label}</span><ArrowUpRight
          size={14}
        /></button
      >{/each}
  {/if}
  {#if error}<p role="alert" class="tk-error">{error}</p>{/if}
</div>
