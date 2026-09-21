<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { TIMER_TOOLS } from '../../lib/toolkit/registry.js';
  import { native } from '../../lib/toolkit/store.js';
  import { openTool, dismissMenu } from '../../lib/toolkit/windows.js';
  import TimerIcon from './TimerIcon.svelte';
  import { ArrowUpRight } from 'lucide-svelte';
  let list: HTMLDivElement;
  let error = $state('');
  let suppressInitialFocusRing = $state(true);
  let focusDismissTimer: ReturnType<typeof setTimeout>;
  async function launch(kind: string) {
    try {
      await openTool(kind);
      await dismissMenu();
    } catch {
      error = '창을 열지 못했어요. 다시 눌러 주세요.';
    }
  }
  async function keys(e: KeyboardEvent) {
    const buttons = Array.from(list.querySelectorAll('button'));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Tab' || ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      suppressInitialFocusRing = false;
    }
    if (e.key === 'Escape') {
      await dismissMenu();
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
    let off = () => {};
    let disposed = false;
    if (native)
      void getCurrentWindow()
        .onFocusChanged(({ payload }) => {
          clearTimeout(focusDismissTimer);
          if (!payload) {
            // 툴바 버튼을 다시 누를 때는 메뉴 창의 blur가 버튼 click보다 먼저 옵니다.
            // 즉시 숨기면 click 쪽에서 닫힌 메뉴를 다시 열기 때문에, 토글 판단이 끝날 틈을 둡니다.
            focusDismissTimer = setTimeout(() => void dismissMenu(), 120);
          } else {
            suppressInitialFocusRing = true;
            list.querySelector('button')?.focus();
          }
        })
        .then((fn) => {
          if (disposed) fn();
          else off = fn;
        });
    return () => {
      disposed = true;
      clearTimeout(focusDismissTimer);
      off();
    };
  });
</script>

<svelte:window onkeydown={keys} />
<div
  class="toolkit-menu"
  class:suppress-initial-focus-ring={suppressInitialFocusRing}
  bind:this={list}
  role="menu"
  aria-label="타이머 선택"
>
  <p class="toolkit-menu-heading">타이머</p>
  {#each TIMER_TOOLS as tool}{@const kind = tool.id}<button
      role="menuitem"
      onclick={() => launch(kind)}
      ><span class="menu-icon"><TimerIcon {kind} /></span><span>{tool.label}</span><ArrowUpRight
        size={14}
      /></button
    >{/each}
  {#if error}<p role="alert" class="tk-error">{error}</p>{/if}
</div>
