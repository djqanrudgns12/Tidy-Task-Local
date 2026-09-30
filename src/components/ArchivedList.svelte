<script>
  import { ChevronDown, ChevronUp, RotateCcw, Trash2 } from 'lucide-svelte';
  import { appState } from '../lib/appState.svelte.js';
  import { sanitizeForDisplay } from '../lib/editable.js';
  import { ARCHIVE_LIST_ROWS } from '../lib/layout/memoLayout.js';
  import { slide } from 'svelte/transition';

  /** @type {{ onlayoutchange?: () => void }} */
  let { onlayoutchange = undefined } = $props();

  let isOpen = $state(true);

  // ── 메모 창 세로 배치(layout/memoLayoutController.js)와 주고받는 값 ──
  /** @type {HTMLElement | null} */
  let listEl = $state(null);   // 목록이 보이는 칸(스크롤)
  /** @type {HTMLElement | null} */
  let itemsEl = $state(null);  // 목록 전체
  // 한 줄 높이·줄 간격. 재기 전에는 기본 글자(10pt) 기준 값을 씁니다. 글자 크기를 바꾸면 다시 잽니다.
  let rowHeight = $state(26);
  let rowGap = $state(4);
  // 목록 최대 높이 = 5.5줄. 창 높이와 무관한 고정값이라 창을 늘리고 줄여도 마감된 일이 출렁이지 않습니다.
  const listCap = $derived(Math.round(rowHeight * ARCHIVE_LIST_ROWS + rowGap * Math.floor(ARCHIVE_LIST_ROWS)));

  // 줄 높이·간격을 지금 글자 크기로 다시 잽니다. 배치가 목록 최대 높이를 물을 때마다 불러
  // 늘 최신 값으로 계산하게 합니다(ResizeObserver가 늦거나, 창이 가려져 멈춰 있어도).
  function syncRowMetrics() {
    if (!itemsEl) return;
    const first = itemsEl.firstElementChild;
    if (first instanceof HTMLElement && first.offsetHeight > 0 && first.offsetHeight !== rowHeight) {
      rowHeight = first.offsetHeight;
    }
    const gap = parseFloat(getComputedStyle(itemsEl).rowGap);
    if (Number.isFinite(gap) && gap !== rowGap) rowGap = gap;
  }

  export function measureLayout() {
    syncRowMetrics();
    return {
      viewport: listEl ? listEl.clientHeight : 0,
      content: itemsEl ? itemsEl.offsetHeight : 0,
      cap: listCap,
    };
  }

  // 항목이 늘거나 줄면(마감·되돌리기·삭제·글자 크기) 배치를 다시 계산하게 알립니다.
  $effect(() => {
    const el = itemsEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => onlayoutchange?.());
    observer.observe(el);
    return () => observer.disconnect();
  });
</script>

<!--
  보관함(마감된 일) 영역

  왜 내부 스크롤인가:
    예전에는 이 목록이 항목 수만큼 무한정 세로로 길어졌고, 그 높이가 창의 "최소 높이"에 그대로
    들어가 보관 항목이 쌓이면 창이 화면 밖까지 커졌습니다. 이제 목록은 5.5줄까지만 보이고 스크롤합니다.
  왜 flex 사슬(root → 몸통 → 목록 칸)이 모두 min-h-0인가:
    창이 아주 작아 할 일·메모가 최소일 때, 배치 규칙이 이 영역의 최대 높이를 줄입니다.
    그때 머리글은 남기고 목록 칸만 줄어들어 스크롤되게 하려면 사슬 전체가 줄어들 수 있어야 합니다.
-->
<div
  class="archived-root flex flex-col min-h-0 border-b transition-colors"
  style="border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};"
>
  <button
    class="memo-section-heading w-full rounded group transition-colors cursor-pointer"
    style="color: {appState.isDarkMode ? '#94a3b8' : '#374151'};"
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
  >
      <RotateCcw size={13} class="memo-section-icon transition-colors group-hover:brightness-90" style="color: {appState.getThemeAccentColor()};" />
      <span class="section-title group-hover:text-gray-600 transition-colors">
        마감된 일 ({appState.filteredArchivedTodos.length})
      </span>
    <div class="archive-heading-actions">
      {#if appState.filteredArchivedTodos.length > 0}
        <!-- 접기 머리글 안의 전체 삭제 버튼입니다. {#if} 조각으로 따로 만들어져 브라우저 재배치 문제는 없고, 클릭은 stopPropagation으로 분리됩니다. -->
        <!-- svelte-ignore node_invalid_placement_ssr -->
        <button
          onclick={(e) => { e.stopPropagation(); appState.deleteAllArchivedTodos(); }}
          onmousedown={(e) => e.preventDefault()}
          title="마감된 일 전체 삭제"
          class="archive-clear rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer hover:scale-110 active:scale-95"
          style={appState.isDarkMode ? 'hover:background-color: rgba(239,68,68,0.12)' : ''}
        >
          <Trash2 size={12} />
        </button>
      {/if}
      {#if isOpen}
        <ChevronUp size={14} class="text-gray-400" />
      {:else}
        <ChevronDown size={14} class="text-gray-400" />
      {/if}
    </div>
  </button>

  {#if isOpen && appState.filteredArchivedTodos.length > 0}
    <!-- 열고 닫는 움직임이 끝나면 배치를 한 번 더 계산합니다(닫힌 뒤엔 목록이 사라져 알릴 곳이 없음). -->
    <div
      transition:slide={{ duration: 200 }}
      class="archived-body flex flex-col min-h-0"
      onintroend={() => onlayoutchange?.()}
      onoutroend={() => onlayoutchange?.()}
    >
      <div bind:this={listEl} class="archived-scroll min-h-0" style="max-height: {listCap}px;">
        <div bind:this={itemsEl} class="flex flex-col gap-1">
          {#each appState.filteredArchivedTodos as todo (todo.id)}
            <div class="group flex items-center justify-between text-xs py-1 rounded hover:bg-black/5 px-1 transition-colors shrink-0">
              <button
                class="flex items-center gap-2 flex-1 min-w-0 outline-none text-left cursor-pointer transition-transform hover:translate-x-1"
                onclick={() => appState.restoreTodo(todo.id)}
                onmousedown={(e) => e.preventDefault()}
                title="다시 진행 중으로 돌리기"
              >
                <span class="text-amber-500/0 font-bold group-hover:text-amber-500 transition-colors shrink-0">^</span>
                <span class="line-through text-gray-400 grayscale flex-1 min-w-0 truncate" style="font-size: var(--global-font-size, 10pt);">
                  {@html sanitizeForDisplay(todo.text)}
                </span>
              </button>

              <button
                onclick={() => appState.deleteArchivedTodo(todo.id)}
                onmousedown={(e) => e.preventDefault()}
                class="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 hover:bg-black/5 rounded transition-all ml-2 cursor-pointer hover:scale-110 active:scale-95 shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .archived-root { padding-bottom: 4px; }
  .archive-heading-actions { display: flex; align-items: center; gap: 3px; margin-left: auto; flex: none; }
  .archive-clear { display: grid; place-items: center; padding: 2px; }
  .archived-body { padding: 3px var(--memo-gutter, 12px) 2px; }
  .archived-scroll {
    flex: 0 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
  }

  .archived-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .archived-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .archived-scroll::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.15);
    border-radius: 4px;
  }
</style>
