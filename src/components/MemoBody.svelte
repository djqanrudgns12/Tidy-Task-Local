<script>
  // 메모 창 몸통: 할 일 · 스플리터 · 마감된 일 · 중요한 일 메모.
  // 왜 App에서 떼어 냈는가: 세로 배치는 이 마크업과 배치 컨트롤러가 짝을 이뤄야 맞게 동작합니다.
  //   개발용 확인 화면(?memo-layout-preview)이 실제 앱과 똑같은 마크업으로 검사하도록 한 곳에 둡니다.
  import { appState } from "../lib/appState.svelte.js";
  import TodoList from "./TodoList.svelte";
  import ArchivedList from "./ArchivedList.svelte";
  import NoteEditor from "./NoteEditor.svelte";
  import "../lib/memo.css";

  /**
   * @type {{
   *   layout: ReturnType<typeof import('../lib/layout/memoLayoutController.js').createMemoLayoutController>,
   *   onsplitterdown: (e: PointerEvent) => void,
   * }}
   */
  let { layout, onsplitterdown } = $props();

  // svelte-ignore state_referenced_locally — 컨트롤러는 창이 사는 동안 바뀌지 않습니다.
  const layoutRegion = layout.region;

  /** @type {any} */
  let todoListRef = $state(null);
  /** @type {any} */
  let archivedListRef = $state(null);
  /** @type {any} */
  let noteEditorRef = $state(null);

  // 컨트롤러가 내용 높이(글 양·목록 길이)를 잴 때 자식 컴포넌트에 묻습니다.
  // svelte-ignore state_referenced_locally
  layout.setProbes({
    todos: () => todoListRef?.measureLayout?.(),
    archive: () => archivedListRef?.measureLayout?.(),
    notes: () => noteEditorRef?.measureLayout?.(),
  });
</script>

<!-- 메모 창 세로 배치: 높이는 layout/memoLayout.js 규칙이 정하고 컨트롤러가 직접 씁니다.
     할 일 = 남는 높이(flex 1), 마감된 일 = 내용 높이(양보할 때만 max-height), 메모 = 정해진 height.
     여기에 min-height·max-height·%·vh로 높이를 다시 정하지 마세요. 규칙과 CSS가 서로 다르게 정하면
     보관함이 사라지거나 메모가 잘리던 예전 문제가 되돌아옵니다. -->
<div
  use:layoutRegion={'body'}
  class="memo-body flex flex-col overflow-hidden relative"
  style="flex: 1 1 0; min-height: 0;"
>
  <div
    use:layoutRegion={'todos'}
    class="relative flex flex-col pt-1 pb-1 overflow-hidden"
    style="flex: 1 1 0; min-height: 0;"
  >
    <TodoList bind:this={todoListRef} />
  </div>

  {#if appState.showNotes || appState.showArchived}
    <div
      class="h-1.5 w-full cursor-row-resize z-20 flex items-center justify-center transition-colors hover:bg-black/5"
      style="flex: 0 0 6px;"
      role="separator"
      tabindex="-1"
      onpointerdown={onsplitterdown}
    >
      <div
        class="w-[30%] h-[3px] rounded-full transition-colors"
        style="background-color: {appState.isDarkMode
          ? 'rgba(255,255,255,0.15)'
          : 'rgba(0,0,0,0.10)'};"
      ></div>
    </div>
  {/if}

  {#if appState.showArchived}
    <!-- 마감된 일: 내용 높이대로(목록은 5.5줄까지, 내부 스크롤). flex-shrink 0이라 공간이 모자라도
         저절로 찌그러져 사라지지 않습니다. 할 일·메모가 최소일 때만 배치 규칙이 max-height로 목록을 줄입니다.
         style은 고정 문자열로 둡니다(Svelte가 style을 다시 쓰면 컨트롤러가 넣은 높이가 지워짐). -->
    <div
      use:layoutRegion={'archive'}
      class="transition-colors duration-300 border-t flex flex-col overflow-hidden"
      style="flex: 0 0 auto; min-height: 0; background-color: var(--global-section-bg); border-top-color: var(--global-border-color);"
    >
      <ArchivedList bind:this={archivedListRef} onlayoutchange={layout.recompute} />
    </div>
  {/if}

  {#if appState.showNotes}
    <!-- 중요한 일 메모: 높이(height)는 배치 컨트롤러가 씁니다. style은 고정 문자열로 둡니다. -->
    <div
      use:layoutRegion={'notes'}
      style="flex: 0 0 auto; min-height: 0; background-color: var(--global-section-bg); border-top-color: var(--global-border-color);"
      class="relative flex flex-col transition-colors duration-300 border-t overflow-hidden"
    >
      <NoteEditor bind:this={noteEditorRef} />
    </div>
  {/if}
</div>
