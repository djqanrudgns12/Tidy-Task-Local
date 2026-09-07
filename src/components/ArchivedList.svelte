<script>
  import { ChevronDown, ChevronUp, RotateCcw, Trash2 } from 'lucide-svelte';
  import { appState } from '../lib/appState.svelte.js';
  import { sanitizeForDisplay } from '../lib/editable.js';
  import { slide } from 'svelte/transition';

  let isOpen = $state(true);
</script>

<!--
  보관함(마감된 일) 영역

  왜 내부 스크롤로 바꿨는가:
    예전에는 이 목록이 항목 수만큼 무한정 세로로 길어졌습니다. 그 높이가 그대로
    창의 "최소 높이(setMinSize)" 계산에 들어가는 바람에, 보관 항목이 쌓이면
    창이 화면 밖까지 강제로 커지고 크기 조절도 막히는 버그가 있었습니다.
    이제 목록은 스스로 스크롤을 갖고, 높이가 화면 대비 일정 비율(28vh)을 넘지 않습니다.
-->
<div
  class="archived-root flex flex-col min-h-0 px-3 mt-1 border-b transition-colors {isOpen ? 'pb-2' : 'pb-1'}"
  style="border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};"
>
  <button
    class="flex items-center justify-between py-1 w-full rounded group transition-colors cursor-pointer shrink-0"
    style="color: {appState.isDarkMode ? '#94a3b8' : '#374151'};"
    onclick={() => isOpen = !isOpen}
  >
    <div class="flex items-center gap-2 pl-1">
      <div class="w-4 flex justify-center items-center">
        <RotateCcw size={13} class="transition-colors group-hover:brightness-90" style="color: {appState.getThemeAccentColor()};" />
      </div>
      <span class="section-title group-hover:text-gray-600 transition-colors">
        마감된 일 ({appState.filteredArchivedTodos.length})
      </span>
    </div>
    <div class="flex items-center gap-1">
      {#if appState.filteredArchivedTodos.length > 0}
        <button
          onclick={(e) => { e.stopPropagation(); appState.deleteAllArchivedTodos(); }}
          onmousedown={(e) => e.preventDefault()}
          title="마감된 일 전체 삭제"
          class="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer hover:scale-110 active:scale-95"
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

  {#if isOpen}
    <div transition:slide={{ duration: 200 }} class="min-h-0">
      <div class="archived-scroll flex flex-col gap-1 mt-1 pl-1">
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
  {/if}
</div>

<style>
  /* 목록 높이를 화면 대비 비율로 제한합니다.
     왜 vh 인가: 창 크기가 커지면 보관함도 자연스럽게 더 보이고,
     창이 작아지면 알아서 줄어들어 할 일/메모 영역을 침범하지 않습니다. */
  .archived-scroll {
    max-height: 28vh;
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
