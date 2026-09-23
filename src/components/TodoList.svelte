<script>
  // @ts-nocheck — 타입 주석이 아직 없는 기존 코드라 타입 검사에서 뺍니다. 고칠 때 JSDoc 타입을 붙이고 이 줄을 지워 주세요.
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { appState } from "../lib/appState.svelte.js";
  import { editable } from "../lib/editable.js";
  import { Check, Plus, Trash2, GripVertical } from "lucide-svelte";
  import clsx from "clsx";
  import { flushSync, onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import { CALENDAR_BOLD_DUOTONE } from "../lib/icons.js";
  import { daysUntil } from "../lib/dateUtils.js";
  import { formatShortDate } from "../lib/datePicker/calendarModel.js";
  import { datePicker, dateTrigger } from "../lib/datePicker/datePickerClient.svelte.js";

  let newTaskText = $state("");
  let newTaskDeadline = $state("");

  let formDlInfo = $derived(getDeadlineInfo(newTaskDeadline));

  // ✨ 마감일 달력은 메모 창 안이 아니라 별도 창(date-picker)으로 뜹니다.
  // 왜: 창을 세로로 줄이면(최소 210px) 달력(약 260px)이 창 밖으로 잘렸습니다.
  //   별도 창은 메모 창 밖·바탕화면 위까지 나올 수 있고, 모니터 작업영역 기준으로 위치를 고릅니다.
  // 달력을 여닫는 대상 이름: 기존 할 일은 'todo:<id>', 새 할 일 입력칸은 아래 상수
  const NEW_TASK_PICKER_KEY = "new";
  // 새 할 일 입력칸. 날짜를 고른 뒤 바로 이어 쓰도록 초점을 돌려줄 곳입니다.
  let newTaskInputEl = $state(null);

  // 달력 창이 메모 창과 같은 모양(테마·다크 모드·UI 글꼴·크기)으로 보이도록 넘길 값
  function pickerAppearance() {
    const name = appState.uiFontFamily || "메이플스토리 L";
    const font = appState.allFonts.find((f) => f.name === name);
    const custom = appState.customFonts.find((f) => f.name === name);
    return {
      isDarkMode: !!appState.isDarkMode,
      themeColor: appState.themeColor,
      fontFamily: font ? font.family : '"Gulim", sans-serif',
      fontSizePt: appState.uiFontSize || 10,
      customFont: custom && custom.path ? { name: custom.name, path: custom.path } : null,
    };
  }

  /** @param {string} id */
  const todoPickerKey = (id) => `todo:${id}`;

  // 달력이 떠 있는 동안 그 할 일이 사라지면(삭제·마감 처리·되돌리기) 달력도 닫습니다.
  $effect(() => {
    const key = datePicker.openKey;
    if (!key || !key.startsWith("todo:")) return;
    const id = key.slice("todo:".length);
    if (!appState.todos.some((t) => t.id === id)) datePicker.close("gone");
  });

  // 업데이트 설치 직전(입력 잠금)에는 달력을 닫습니다. 잠근 뒤 고른 날짜는 저장되지 못하기 때문입니다.
  $effect(() => {
    if (appState.isUpdateFrozen && datePicker.openKey) datePicker.close("frozen");
  });

  onMount(() => {
    // 처음 누를 때 창을 만드느라 늦지 않게, 한가할 때 달력 창을 미리 만들어 둡니다.
    datePicker.schedulePrewarm();
  });

  // ✨ [TCREI: Composition-Safe] 플레이스홀더는 CSS :empty 기반으로 처리합니다.
  // 왜: $derived(newTaskText)는 한글 IME 조합 중 상태가 업데이트되지 않아
  //     isInputEmpty가 true로 유지되어 플레이스홀더가 입력 글자와 겹치는 버그가 발생합니다.
  //     CSS :empty는 DOM의 실제 자식 노드 유무를 기준으로 판단하므로 IME와 무관하게 동작합니다.

  // ✨ 데드라인 뱃지 정보 렌더러 (4/24일 형식 + 색상)
  function getDeadlineInfo(deadline) {
    if (!deadline) {
      return {
        isIcon: true,
        color: appState.isDarkMode ? '#4b5563' : '#9ca3af',
        bg: appState.isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        borderColor: appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      };
    }

    // 날짜 계산·표기는 리마인더·달력과 같은 공용 함수를 씁니다(로컬 자정 기준, '9/30(수)' 형식).
    const diffDays = daysUntil(deadline);
    const label = formatShortDate(deadline) || String(deadline);

    let color, bg, borderColor;
    if (diffDays < 0) {
      // 🟣 지연됨 (보라색)
      color = appState.isDarkMode ? '#c084fc' : '#9333ea';
      bg    = appState.isDarkMode ? 'rgba(147,51,234,0.18)' : 'rgba(243,232,255,0.9)';
      borderColor = appState.isDarkMode ? 'rgba(147,51,234,0.3)' : '#c084fc';
    } else if (diffDays === 0) {
      // 🔴 오늘 마감 (빨강색)
      color = appState.isDarkMode ? '#fca5a5' : '#ef4444';
      bg    = appState.isDarkMode ? 'rgba(239,68,68,0.18)' : 'rgba(254,226,226,0.9)';
      borderColor = appState.isDarkMode ? 'rgba(239,68,68,0.3)' : '#fca5a5';
    } else if (diffDays <= 3) {
      // 🟠 마감 임박 (주황색)
      color = appState.isDarkMode ? '#fb923c' : '#ea580c';
      bg    = appState.isDarkMode ? 'rgba(234,88,12,0.18)' : 'rgba(255,237,213,0.9)';
      borderColor = appState.isDarkMode ? 'rgba(234,88,12,0.3)' : '#fb923c';
    } else if (diffDays <= 7) {
      // 🟢 1주일 이내 (초록색)
      color = appState.isDarkMode ? '#6ee7b7' : '#059669';
      bg    = appState.isDarkMode ? 'rgba(16,185,129,0.18)' : 'rgba(209,250,229,0.9)';
      borderColor = appState.isDarkMode ? 'rgba(16,185,129,0.3)' : '#6ee7b7';
    } else {
      // 🔵 여유 (파랑색)
      color = appState.isDarkMode ? '#93c5fd' : '#3b82f6';
      bg    = appState.isDarkMode ? 'rgba(59,130,246,0.18)' : 'rgba(219,234,254,0.9)';
      borderColor = appState.isDarkMode ? 'rgba(59,130,246,0.3)' : '#93c5fd';
    }

    return { label, color, bg, borderColor };
  }

  const flipDurationMs = 300;
  let dragDisabled = $state(true);

  function dragHandle(node) {
    function handleDown(e) {
      flushSync(() => { dragDisabled = false; });
    }
    node.addEventListener('mousedown', handleDown);
    node.addEventListener('touchstart', handleDown, { passive: true });
    return {
      destroy() {
        node.removeEventListener('mousedown', handleDown);
        node.removeEventListener('touchstart', handleDown);
      }
    };
  }

  let currentFontFamily = $derived(
    appState.allFonts.find((f) => f.name === appState.fontFamily)?.family || '"Gulim", sans-serif'
  );

  function handleDndConsider(e) {
    if (appState.searchQuery) return;
    // 드래그 도중에는 화면 순서만 바꾸고 저장하지 않습니다.
    // 왜: 칸을 지날 때마다 저장하면 드래그 한 번에 수십 번 디스크에 쓰고,
    //     되돌리기 기록이 중간 상태로 가득 차며, 드래그용 임시 항목까지 저장될 수 있습니다.
    //     최종 순서는 놓는 순간(finalize)에 한 번만 저장합니다.
    appState.todos = e.detail.items;
  }
  function handleDndFinalize(e) {
    if (appState.searchQuery) return;
    appState.reorderTodos(e.detail.items);
    dragDisabled = true;
  }

  function handleAddSubmit(e) {
    e.preventDefault();
    if (newTaskText.trim()) {
      appState.addTodo(newTaskText.trim(), newTaskDeadline);
      newTaskText = "";
      newTaskDeadline = "";
      // 새 할 일 달력이 아직 떠 있다면 닫습니다. 방금 추가한 할 일의 날짜를 고르던 달력이라 더 쓸 곳이 없습니다.
      if (datePicker.openKey === NEW_TASK_PICKER_KEY) datePicker.close("requester");
    }
  }
</script>

<div class="flex flex-col h-full pl-3 pr-3 pt-1">
  <div
    class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 border-t"
    style="border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(120,80,20,0.1)'};"
  >
    <section
      use:dndzone={{ 
        items: appState.filteredTodos, 
        flipDurationMs, 
        dropTargetStyle: { outline: 'none' },
        dragDisabled
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
      class="todo-rows min-h-[50px]"
    >
      {#each appState.filteredTodos as todo (todo.id)}
        {@const dlInfo = getDeadlineInfo(todo.deadline)}

        <!--
          transition-all 을 transition-colors 로 바꾼 이유:
            transition-all 은 글이 두 줄로 늘어날 때 "높이"까지 0.3초 동안 애니메이션합니다.
            그 사이 행 높이가 내용보다 작아서 글자가 아랫줄을 침범해 겹쳐 보였습니다.
            높이는 즉시 반영하고 색상만 부드럽게 바꿉니다.
        -->
        <div
          animate:flip={{ duration: flipDurationMs, easing: cubicOut }}
          class="todo-row w-full min-w-full group flex items-start gap-1 px-1 transition-colors duration-200 {appState.isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}"
          style="border-bottom-color: {appState.isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'};"
        >
          <div
            use:dragHandle
            class="todo-lead w-[18px] justify-center opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing pl-0.5 text-gray-400"
          >
            <GripVertical size={13} strokeWidth={2.5} />
          </div>

          <div class="todo-lead gap-1.5 ml-0.5">
            {#if appState.isEditMode}
              <button
                onclick={() => appState.toggleTodoSelection(todo.id)}
                onmousedown={(e) => e.preventDefault()}
                class={clsx(
                  "w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-sm cursor-pointer z-10 my-auto",
                  appState.selectedTodoIds.includes(todo.id) ? "text-white" : (appState.isDarkMode ? "border-gray-500 bg-[#252830]" : "border-gray-400 bg-white")
                )}
                style={appState.selectedTodoIds.includes(todo.id) ? `background-color: ${appState.getThemeAccentColor()}; border-color: ${appState.getThemeAccentColor()};` : null}
              >
                {#if appState.selectedTodoIds.includes(todo.id)}
                  <Check size={11} strokeWidth={4} />
                {/if}
              </button>
            {/if}

            <button
              onclick={() => appState.toggleTodo(todo.id)}
              onmousedown={(e) => e.preventDefault()}
              class={clsx(
                "w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 shadow-sm cursor-pointer overflow-hidden group/done my-auto",
                appState.isDarkMode ? "border-gray-500 hover:border-emerald-500 hover:bg-emerald-500" : "border-gray-300 bg-white hover:border-emerald-500 hover:bg-emerald-500"
              )}
              title="마감 처리 (보관함으로)"
            >
              <Check size={11} strokeWidth={4} class="opacity-0 group-hover/done:opacity-100 transition-opacity text-white" />
            </button>
          </div>

          <!-- ✨ 기존 할 일 마감일 뱃지 — 누르면 날짜 선택 창(별도 창)이 뱃지 옆에 뜹니다 -->
          <div class="todo-lead relative justify-center ml-0.5">
            <button
              type="button"
              use:dateTrigger={{
                key: todoPickerKey(todo.id),
                value: todo.deadline || '',
                appearance: pickerAppearance,
                onSelect: (v) => appState.setTodoDeadline(todo.id, v),
              }}
              class="px-[0.6em] py-[0.3em] font-bold border rounded-full transition-all hover:scale-105 active:scale-95 flex items-center justify-center whitespace-nowrap shrink-0"
              style="
                color: {dlInfo.color};
                background-color: {dlInfo.bg};
                border-color: {dlInfo.borderColor};
                min-width: 3.5em;
                font-family: var(--ui-font-family);
                font-size: 0.8em;
                outline: {datePicker.openKey === todoPickerKey(todo.id) ? `2px solid ${appState.getThemeAccentColor()}` : 'none'};
                outline-offset: 1px;
              "
              title="마감일 설정"
              aria-expanded={datePicker.openKey === todoPickerKey(todo.id)}
            >
              {#if dlInfo.isIcon}
                <Icon icon={CALENDAR_BOLD_DUOTONE} width="16" height="16" />
              {:else}
                {dlInfo.label}
              {/if}
            </button>
          </div>

          <div
            class="todo-text flex-1 min-w-0 outline-none ml-1 px-1 rounded {appState.isDarkMode ? '' : 'focus:bg-amber-50'}"
            style="color: {appState.isDarkMode ? '#e2e8f0' : '#1f2937'}; font-family: {currentFontFamily}; font-size: var(--global-font-size, 10pt); letter-spacing: var(--global-letter-spacing, 0em);"
            contenteditable="true"
            spellcheck="false"
            use:editable={{
              html: todo.text,
              onUpdate: (val) => { todo.text = val; appState.save(); },
              onSave: () => appState.saveNow(),
            }}
            onkeydown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
            }}
            role="textbox"
            tabindex="0"
          ></div>

          <button
            onclick={() => appState.deleteTodo(todo.id)}
            class="todo-lead opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-500 hover:scale-110 active:scale-95 hover:bg-black/5 rounded transition-all"
            title="삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      {/each}
    </section>
  </div>

  <!-- ✨ 할 일 추가 폼 (캘린더 버튼 왼쪽 배치) -->
  <form onsubmit={handleAddSubmit} class="mt-2 flex gap-1 relative pb-1 shrink-0 items-center">

    <div class="relative shrink-0 flex items-center justify-center">
      <button
        type="button"
        use:dateTrigger={{
          key: NEW_TASK_PICKER_KEY,
          value: newTaskDeadline,
          appearance: pickerAppearance,
          onSelect: (v) => { newTaskDeadline = v; },
          focusAfter: () => newTaskInputEl,
        }}
        class="min-w-[28px] h-[28px] px-[0.4em] flex items-center justify-center rounded-lg border transition-all hover:scale-105 active:scale-95 relative whitespace-nowrap"
        style="
          background-color: {formDlInfo.bg};
          border-color: {formDlInfo.borderColor};
          color: {formDlInfo.color};
          font-family: var(--ui-font-family);
          outline: {datePicker.openKey === NEW_TASK_PICKER_KEY ? `2px solid ${appState.getThemeAccentColor()}` : 'none'};
          outline-offset: 1px;
        "
        title={newTaskDeadline ? `마감일: ${formatShortDate(newTaskDeadline)}` : "마감일 설정"}
        aria-expanded={datePicker.openKey === NEW_TASK_PICKER_KEY}
      >
        {#if newTaskDeadline}
          <span class="font-bold leading-none" style="font-size: 0.8em;">
            {formatShortDate(newTaskDeadline)}
          </span>
        {:else}
          <Icon icon={CALENDAR_BOLD_DUOTONE} width="16" height="16" class="pointer-events-none shrink-0" />
        {/if}
      </button>
    </div>

    <!-- 내용 입력 (오른쪽) -->
    <div class="relative flex-1 min-w-0">
      <div
        bind:this={newTaskInputEl}
        class="todo-input-field w-full border border-transparent rounded py-[4px] pl-2 pr-7 outline-none transition-all flex items-center min-h-[28px]"
        style="background-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)'}; color: {appState.isDarkMode ? '#e2e8f0' : '#1f2937'}; font-family: {currentFontFamily}; font-size: var(--global-font-size, 10pt); letter-spacing: var(--global-letter-spacing, 0em); --placeholder-color: {appState.isDarkMode ? '#94a3b8' : '#374151'};"
        contenteditable="true"
        spellcheck="false"
        data-placeholder="내용을 입력해주세요."
        use:editable={{
          html: newTaskText,
          onUpdate: (val) => { newTaskText = val; },
        }}
        onkeydown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddSubmit(e); }
        }}
        role="textbox"
        tabindex="0"
      ></div>

      <button
        type="button"
        onclick={handleAddSubmit}
        disabled={!newTaskText.trim()}
        class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-amber-600 disabled:opacity-30 transition-colors"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  </form>
</div>

<style>
  /* ── 할 일 한 줄(행) 레이아웃 ─────────────────────────────────────
     왜 공책 밑줄을 배경 그라디언트에서 행 테두리로 바꿨는가:
       예전에는 36px 간격의 고정 그라디언트로 밑줄을 그렸습니다.
       그런데 글이 두 줄을 넘어가면 행 높이는 늘어나는데 밑줄은 그대로 36px
       간격에 머물러, 밑줄이 글자를 가로지르고 아랫줄과 겹쳐 보였습니다.
       이제 밑줄을 각 행의 border-bottom 으로 그리므로, 글이 몇 줄이 되든
       밑줄은 항상 그 행의 진짜 경계에 정확히 붙습니다. */
  .todo-row {
    /* 글자 한 줄이 차지하는 높이 */
    --todo-line-h: calc(var(--global-font-size, 10pt) * 1.55);
    /* 위아래 여백을 계산으로 뽑습니다.
       왜 계산인가: 한 줄짜리 항목의 전체 높이를 기존과 똑같은 36px로 유지하면서도,
       글자 크기를 키우면 여백이 자동으로 줄어 답답해지지 않습니다.
       (작은 글씨 → 여백이 늘어 36px를 채움 / 큰 글씨 → 최소 4px 여백 유지) */
    --todo-pad-y: max(4px, calc((36px - var(--todo-line-h)) / 2));
    /* 첫 줄 상자의 높이 = 글자 한 줄 + 위아래 여백. 체크박스·D-day 뱃지의 기준선입니다. */
    --todo-first-line-h: calc(var(--todo-line-h) + var(--todo-pad-y) * 2);
    border-bottom: 1px solid transparent;
    border-radius: 2px;
  }

  /* 체크박스 / D-day 뱃지 / 삭제 버튼은 항상 "첫 줄"에 정렬됩니다.
     행 전체는 위쪽 정렬(items-start)로 두고, 이 요소들만 첫 줄 높이만큼의
     상자 안에서 세로 가운데 정렬하면 한 줄일 때는 예전과 똑같이 보이고
     여러 줄일 때는 위쪽 첫 줄에 깔끔하게 붙습니다. */
  .todo-lead {
    min-height: var(--todo-first-line-h, 36px);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .todo-text {
    line-height: 1.55;
    padding-top: var(--todo-pad-y);
    padding-bottom: var(--todo-pad-y);
    /* 사용자가 넣은 띄어쓰기/줄바꿈을 그대로 보존합니다. */
    white-space: pre-wrap;
    /* 한국어는 어절(띄어쓰기) 단위로 줄을 넘겨야 자연스럽습니다. */
    word-break: keep-all;
    /* 다만 URL처럼 띄어쓰기가 없는 긴 문자열은 강제로 잘라 가로 넘침을 막습니다. */
    overflow-wrap: anywhere;
  }

  /* ✨ [TCREI: Composition-Safe] CSS 기반 플레이스홀더
     왜: contenteditable의 플레이스홀더를 별도 Svelte 상태($derived)로 관리하면,
         한글 IME 조합 중 상태가 동기화되지 않아 입력 글자와 겹치는 버그가 발생합니다.
         CSS :empty는 DOM의 실제 자식 노드 유무만 보므로 IME와 완전히 독립적입니다. */
  :global(.todo-input-field:empty::before) {
    content: attr(data-placeholder);
    color: var(--placeholder-color, #9ca3af);
    opacity: 0.4;
    pointer-events: none;
    position: absolute;
    left: 0.625rem;
    top: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 35px);
  }
</style>