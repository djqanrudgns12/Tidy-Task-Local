<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { TIMER_TOOLS, PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
  import { native, readSettings, subscribeSettings, patchSettings, setEnabled } from '../../lib/toolkit/store.js';
  import { openTool, openPlatform, dismissMenu, centerToolbar } from '../../lib/toolkit/windows.js';
  import TimerIcon from './TimerIcon.svelte';
  import { ArrowUpRight, Minimize2, Maximize2, LocateFixed, Settings, Power } from 'lucide-svelte';
  // ondone: 브라우저 미리보기에서는 메뉴가 툴바 안에 그려지므로, 동작 뒤 닫기를 툴바에 맡깁니다.
  let { kind = 'timer', ondone } = $props<{ kind?: 'timer' | 'external' | 'context'; ondone?: () => void }>();
  let list: HTMLDivElement;
  let error = $state('');
  let hiddenPlatformIds = $state<string[]>([]);
  let externalToolsEnabled = $state(true);
  let collapsed = $state(false);
  let suppressInitialFocusRing = $state(true);
  let focusDismissTimer: ReturnType<typeof setTimeout>;
  const visiblePlatforms = $derived(
    PLATFORM_TOOLS.filter((tool) => externalToolsEnabled && !hiddenPlatformIds.includes(tool.id)),
  );
  const menuLabel = $derived(kind === 'timer' ? '타이머' : kind === 'external' ? '외부 툴' : 'Tidy 툴킷');
  async function launch(id: string) {
    try {
      if (kind === 'timer') await openTool(id);
      else await openPlatform(id);
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
    const buttons = Array.from(list.querySelectorAll('button'));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Tab' || ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      suppressInitialFocusRing = false;
    }
    if (e.key === 'Escape') {
      await dismissMenu(kind);
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
    list.querySelector('button')?.focus();
    let offFocus = () => {};
    let offSettings = () => {};
    let disposed = false;
    if (kind !== 'timer') {
      const apply = (settings: Awaited<ReturnType<typeof readSettings>>) => {
        if (disposed) return;
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
            focusDismissTimer = setTimeout(() => void dismissMenu(kind), 120);
          } else {
            suppressInitialFocusRing = true;
            list.querySelector('button')?.focus();
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
  role="menu"
  aria-label={`${menuLabel} 선택`}
  class:external-menu={kind === 'external'}
  class:context-menu={kind === 'context'}
  tabindex="-1"
  oncontextmenu={(e) => e.preventDefault()}
>
  <p class="toolkit-menu-heading">{menuLabel}</p>
  {#if kind === 'timer'}
    {#each TIMER_TOOLS as tool}<button
      role="menuitem"
      onclick={() => launch(tool.id)}
      ><span class="menu-icon"><TimerIcon kind={tool.id} /></span><span>{tool.label}</span><ArrowUpRight
        size={14}
      /></button
    >{/each}
  {:else if kind === 'context'}
    <button role="menuitem" onclick={() => runContext('collapse')}
      ><span class="menu-icon">{#if collapsed}<Maximize2 size={15} />{:else}<Minimize2 size={15} />{/if}</span
      ><span>{collapsed ? '펼치기' : '접기'}</span></button
    >
    <button role="menuitem" title="툴킷을 지금 화면 한가운데로 옮겨요" onclick={() => runContext('center')}
      ><span class="menu-icon"><LocateFixed size={15} /></span><span>좌표 초기화</span><small class="context-hint">화면 가운데</small></button
    >
    <button role="menuitem" onclick={() => runContext('settings')}
      ><span class="menu-icon"><Settings size={15} /></span><span>설정</span></button
    >
    <hr class="context-divider" />
    <button role="menuitem" class="context-danger" onclick={() => runContext('disable')}
      ><span class="menu-icon"><Power size={15} /></span><span
        >툴킷 끄기<small>설정에서 다시 켤 수 있어요</small></span
      ></button
    >
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
