<script>
  // @ts-nocheck — 타입 주석이 아직 없는 기존 코드라 타입 검사에서 뺍니다. 고칠 때 JSDoc 타입을 붙이고 이 줄을 지워 주세요.
  import { createVerticalTodoSort } from "../lib/todos/verticalSort.js";
  import { applyTodoOrder } from "../lib/todos/order.js";
  import { appState } from "../lib/appState.svelte.js";
  import { editable } from "../lib/editable.js";
  import { Check, Plus, ArrowUpDown } from "lucide-svelte";
  import DdayTodoChip from "./dday/DdayTodoChip.svelte";
  import clsx from "clsx";
  import { onMount, tick } from "svelte";
  import EraserButton from "./todo/EraserButton.svelte";
  import UndoToast from "./todo/UndoToast.svelte";
  import { REMOVAL_GUARD_MS, createRemovalGuard, isXArmed } from "../lib/todos/rowGestures.js";
  import Icon from "@iconify/svelte";
  import { CALENDAR_BOLD_DUOTONE } from "../lib/icons.js";
  import { daysUntil, parseDeadline } from "../lib/dateUtils.js";
  import { formatShortDate } from "../lib/datePicker/calendarModel.js";
  import { datePicker, dateTrigger } from "../lib/datePicker/datePickerClient.svelte.js";
  import { memoPickerAppearance } from "../lib/datePicker/memoAppearance.js";
  import { resolveBulkDockPalette } from "../lib/todos/bulkDockLayout.js";
  import {
    classifyDeadlineKind,
    computeFittedDateBadge,
    deadlinePaletteSetToStyle,
    resolveDeadlinePaletteSet,
    resolveTodoBadgeMetrics,
    splitShortDateParts,
  } from "../lib/todos/todoBadgeMetrics.js";
  import { setTodoBadgeFit, todoBadgeFit } from "../lib/todos/todoBadgeFit.svelte.js";

  let newTaskText = $state("");
  let newTaskDeadline = $state("");

  let formDlInfo = $derived(getDeadlineInfo(newTaskDeadline, appState.todayKey));
  // 상단 BulkSelectDock 전체 선택 체크박스와 동일한 조약돌 색상·대비 토큰을 공유합니다.
  let chkPalette = $derived(resolveBulkDockPalette(appState.themeColor, appState.isDarkMode));
  // 날짜 뱃지 7상태 정제 팔레트: 행마다 계산하지 않고 루트 변수에 1회만 주입해 O(1) 테마 전환을 유지합니다.
  let dlPaletteStyle = $derived(
    deadlinePaletteSetToStyle(resolveDeadlinePaletteSet(appState.themeColor, appState.isDarkMode)),
  );

  // ✨ 마감일 달력은 메모 창 안이 아니라 별도 창(date-picker)으로 뜹니다.
  // 왜: 창을 세로로 줄이면(최소 210px) 달력(약 260px)이 창 밖으로 잘렸습니다.
  //   별도 창은 메모 창 밖·바탕화면 위까지 나올 수 있고, 모니터 작업영역 기준으로 위치를 고릅니다.
  // 달력을 여닫는 대상 이름: 기존 할 일은 'todo:<id>', 새 할 일 입력칸은 아래 상수
  const NEW_TASK_PICKER_KEY = "new";
  // 새 할 일 입력칸. 날짜를 고른 뒤 바로 이어 쓰도록 초점을 돌려줄 곳입니다.
  let newTaskInputEl = $state(null);

  // 달력 창이 메모 창과 같은 모양(테마·다크 모드·UI 글꼴·크기)으로 보이도록 넘길 값
  const pickerAppearance = () => memoPickerAppearance(appState);

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

  $effect(() => {
    const id = appState.pendingPinTodoId;
    if (!id) return;
    appState.pendingPinTodoId = null;
    const anchor = listViewportEl?.querySelector(`[data-todo-id="${CSS.escape(id)}"] [data-todo-deadline-btn]`);
    if (!(anchor instanceof HTMLElement)) return;
    void datePicker.open({
      key: todoPickerKey(id),
      anchor,
      value: appState.todos.find((t) => t.id === id)?.deadline || '',
      viaKeyboard: false,
      appearance: pickerAppearance(),
      onSelect: (v) => {
        if (!v) return;
        appState.setTodoDeadline(id, v);
        void appState.pinTodoAsDday(id);
      },
    });
  });

  /** @type {HTMLSpanElement | null} */
  let probeEl = $state(null);
  /** @type {HTMLSpanElement | null} */
  let probeMainEl = $state(null);
  /** @type {HTMLSpanElement | null} */
  let probeDowEl = $state(null);
  let probeKey = "";
  let isProbeMeasuring = false;

  /**
   * 숨김 측정 span(.todo-badge-probe)에 합성 최장 표본을 그려
   * 0~9·일~토 메트릭과 Overflow-Zero 3중 방어 피팅 결과를 갱신합니다.
   * 주의: measureLayout() 높이에 영향을 주지 않도록 listContentEl 바깥(.todo-list-root 직속)에서만 돕니다.
   */
  function recomputeBadgeFit(force = false) {
    if (!probeEl || !probeMainEl || !probeDowEl || isProbeMeasuring) return;
    const uiPt = Number(appState.uiFontSize || 10);
    const uiFont = String(appState.uiFontFamily || "");
    const base = resolveTodoBadgeMetrics(uiPt);

    isProbeMeasuring = true;
    try {
      const measureSample = (mainText, dowText, fontPx, letterSpacingEm) => {
        probeEl.style.fontSize = `${fontPx}px`;
        probeEl.style.letterSpacing = `${letterSpacingEm}em`;
        probeMainEl.textContent = mainText;
        probeDowEl.textContent = dowText;
        return probeEl.getBoundingClientRect().width;
      };

      // 0~9 최장 숫자 w, 일~토 최장 요일 d를 1회 실측해 tnum 미지원 폰트까지 커버하는 최장 표본 생성
      probeEl.style.fontSize = `${base.fontSizePx}px`;
      probeEl.style.letterSpacing = "-0.025em";
      probeDowEl.textContent = "";
      let maxDigit = "8";
      let maxDigitW = -1;
      for (const d of "0123456789") {
        probeMainEl.textContent = d;
        const w = probeEl.getBoundingClientRect().width;
        if (w > maxDigitW) {
          maxDigitW = w;
          maxDigit = d;
        }
      }

      probeMainEl.textContent = "";
      let maxDow = "수";
      let maxDowW = -1;
      for (const dow of ["일", "월", "화", "수", "목", "금", "토"]) {
        probeDowEl.textContent = `(${dow})`;
        const w = probeEl.getBoundingClientRect().width;
        if (w > maxDowW) {
          maxDowW = w;
          maxDow = dow;
        }
      }

      const synthMain = `1${maxDigit}/${maxDigit}${maxDigit}`;
      const synthDow = `(${maxDow})`;
      const synthW = measureSample(synthMain, synthDow, base.fontSizePx, -0.025);
      const fallbackPairW = synthMain === "12/28" ? 0 : measureSample("12/28", synthDow, base.fontSizePx, -0.025);
      const steadyMain = fallbackPairW > synthW ? "12/28" : synthMain;
      const measuredBase = Math.max(synthW, fallbackPairW);

      const nextCacheKey = `${Math.round(measuredBase * 100)}|${uiPt}|${uiFont}`;
      if (force || nextCacheKey !== probeKey) {
        probeKey = nextCacheKey;
        const fit = computeFittedDateBadge({
          base,
          measuredBase,
          measureAt: (fs, ls) => Math.max(
            measureSample(synthMain, synthDow, fs, ls),
            synthMain === "12/28" ? 0 : measureSample("12/28", synthDow, fs, ls),
          ),
        });
        setTodoBadgeFit(fit);
      }

      // 기준 상태로 복원해 ResizeObserver가 안정 수렴하도록 유지합니다.
      probeEl.style.fontSize = `${base.fontSizePx}px`;
      probeEl.style.letterSpacing = "-0.025em";
      probeMainEl.textContent = steadyMain;
      probeDowEl.textContent = synthDow;
    } finally {
      isProbeMeasuring = false;
    }
  }

  $effect(() => {
    void [appState.uiFontSize, appState.uiFontFamily];
    void tick().then(() => recomputeBadgeFit(true));
  });

  onMount(() => {
    // 처음 누를 때 창을 만드느라 늦지 않게, 한가할 때 달력 창을 미리 만들어 둡니다.
    datePicker.schedulePrewarm();
    recomputeBadgeFit(true);

    const observer = typeof ResizeObserver === "undefined" || !probeEl
      ? null
      : new ResizeObserver(() => recomputeBadgeFit());
    if (observer && probeEl) observer.observe(probeEl);

    const onFontsDone = () => recomputeBadgeFit(true);
    document.fonts?.addEventListener?.("loadingdone", onFontsDone);
    void document.fonts?.ready?.then(() => recomputeBadgeFit(true));

    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", onFontsDone);
      todoSorter.destroy();
    };
  });

  // ✨ [TCREI: Composition-Safe] 플레이스홀더는 CSS :empty 기반으로 처리합니다.
  // 왜: $derived(newTaskText)는 한글 IME 조합 중 상태가 업데이트되지 않아
  //     isInputEmpty가 true로 유지되어 플레이스홀더가 입력 글자와 겹치는 버그가 발생합니다.
  //     CSS :empty는 DOM의 실제 자식 노드 유무를 기준으로 판단하므로 IME와 무관하게 동작합니다.

  // ✨ 데드라인 뱃지 정보 렌더러 ('11/23(월)' 형식 + 반응형 todayKey 기준 상태 분류)
  function getDeadlineInfo(deadline, todayKeyStr = appState.todayKey) {
    if (!deadline) {
      return { kind: "unset", isIcon: true, label: "", main: "", dow: "" };
    }

    const todayDate = todayKeyStr ? parseDeadline(todayKeyStr) : new Date();
    const diffDays = daysUntil(
      deadline,
      Number.isNaN(todayDate.getTime()) ? new Date() : todayDate,
    );
    const kind = classifyDeadlineKind(deadline, diffDays);
    if (kind === "invalid") {
      const raw = String(deadline);
      return { kind, isIcon: false, label: raw, main: raw, dow: "" };
    }

    const label = formatShortDate(deadline) || String(deadline);
    const { main, dow } = splitShortDateParts(label);
    return { kind, isIcon: false, label, main, dow };
  }

  // 이동 중 순서는 저장 상태와 분리합니다. 다른 입력의 자동 저장에도 임시 순서가 섞이지 않습니다.
  let previewOrder = $state(null);
  let sortDisabled = $derived(!!appState.searchQuery || appState.isUpdateFrozen);
  let visibleTodos = $derived.by(() => {
    if (!previewOrder) return appState.filteredTodos;
    const byId = new Map(appState.todos.map(todo => [todo.id, todo]));
    return previewOrder.map(id => byId.get(id)).filter(Boolean);
  });
  const todoSorter = createVerticalTodoSort({
    getIds: () => appState.todos.map(todo => todo.id),
    isDisabled: () => sortDisabled,
    onpreview: ids => { previewOrder = ids; },
    oncommit: (initial, next) => {
      const reordered = applyTodoOrder(appState.todos, initial, next);
      if (reordered) appState.reorderTodos(reordered);
    },
    // 완료 버튼·날짜 알약으로 끌기가 시작된 순간(포인터만).
    onpointerdragstart: () => {
      // 목록 안에서 편집 중이던 글을 먼저 확정합니다. 완료 버튼은 누를 때 초점을 가져가지 않으므로
      // (예전 손잡이와 달리) 저절로 확정되지 않고, 줄이 옮겨지는 중에 편집이 끊길 수 있습니다.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.isContentEditable && listContentEl?.contains(active)) active.blur();
      // 떠 있는 달력은 닫습니다. 같은 알약을 끌면 달력은 "같은 버튼"이라 스스로 닫지 않고 엉뚱한 자리를 가리킵니다.
      datePicker.close("drag", { toggleGrace: false });
    },
  });
  $effect(() => todoSorter.sync());

  // ── 말랑 X 무장 · 연타 보호 (docs/PRD-todo-row-gestures.md §6.6, §9) ──
  // 포인터가 "다른 줄로 들어온 시각". X는 그 뒤 0.15초가 지나야 눌립니다.
  let hoverRowId = null;
  let hoverSince = 0;
  /** @param {PointerEvent} e */
  function trackHoverRow(e) {
    const row = e.target instanceof Element ? e.target.closest(".todo-row[data-todo-id]") : null;
    const id = row?.getAttribute("data-todo-id") || null;
    if (id === hoverRowId) return;
    hoverRowId = id;
    hoverSince = performance.now();
  }

  // 줄이 사라진 직후 같은 자리로 올라온 다음 줄을 실수로 누르지 않게 합니다(더블클릭 한 번에 두 개 마감·삭제 방지).
  const removalGuard = createRemovalGuard({ now: () => performance.now() });
  let settling = $state(false);
  let settleTimer = null;
  /** @param {MouseEvent} e */
  function startSettling(e) {
    removalGuard.start(e.clientX, e.clientY);
    settling = true;
    clearTimeout(settleTimer);
    const { clientX, clientY } = e;
    settleTimer = setTimeout(() => {
      settling = removalGuard.active();
      // 포인터를 움직이지 않은 채 보호가 끝났으면, 지금 포인터 밑에 올라와 있는 줄에 "방금 들어온" 것으로 기록합니다.
      // 왜: 줄이 밀려 올라오면 pointerover가 오지 않아 기록이 지워진 줄에 머물고,
      //   그 줄의 X가 보이는데도 마우스를 움직이기 전까지 눌리지 않았습니다.
      if (!settling) {
        const row = document.elementFromPoint(clientX, clientY)?.closest(".todo-row[data-todo-id]");
        hoverRowId = row?.getAttribute("data-todo-id") || null;
        hoverSince = performance.now();
      }
    }, REMOVAL_GUARD_MS + 16);
  }
  /** @param {PointerEvent} e */
  function onListPointerMove(e) {
    if (settling && removalGuard.onPointerMove(e.clientX, e.clientY)) {
      settling = false;
      clearTimeout(settleTimer);
    }
  }
  /** 포인터 클릭인데 연타 보호 중이면 true @param {MouseEvent} e */
  function blockedByRemovalGuard(e) {
    return e.detail !== 0 && removalGuard.active(e.clientX, e.clientY);
  }
  /**
   * 연타 보호 중 같은 자리의 누름은 줄 어디에서든 통째로 버립니다(캡처 단계).
   * 왜: X를 더블클릭하면 둘째 클릭이 올라온 다음 줄의 글에 떨어져 편집이 시작되고 단어까지 선택됐습니다.
   * pointerdown을 막으면 이어지는 mousedown(초점·커서)도 오지 않고, click·dblclick은 따로 버립니다.
   * @param {MouseEvent} e
   */
  function swallowWhileSettling(e) {
    if (!settling || e.button !== 0 || !removalGuard.active(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** @param {MouseEvent} e @param {string} id */
  function handleComplete(e, id) {
    if (blockedByRemovalGuard(e)) return;
    appState.toggleTodo(id);
    if (e.detail !== 0) startSettling(e);
  }

  /** X를 누른 순간 무장되어 있는가 @param {PointerEvent} e @param {string} id */
  function canPressX(e, id) {
    if (removalGuard.active(e.clientX, e.clientY)) return false;
    // 무장은 마우스에만: 터치·펜은 "올림 → 누름"이 한순간이라 늘 0초가 되어 X를 영영 못 누릅니다.
    if (e.pointerType !== "mouse") return true;
    // 포인터가 이 줄에 들어온 기록이 없으면(줄이 밀려 올라와 포인터 밑에 놓인 경우) 방금 들어온 것으로 봅니다.
    const since = hoverRowId === id ? hoverSince : performance.now();
    return isXArmed(since, performance.now());
  }

  /** @param {MouseEvent} e @param {string} id */
  function handleRemove(e, id) {
    if (blockedByRemovalGuard(e)) return;
    appState.deleteTodo(id);
    if (e.detail !== 0) startSettling(e);
  }

  // 알림에서 되돌린 할 일이 목록 밖(스크롤 아래)에 있으면 보이는 곳으로 데려옵니다.
  $effect(() => {
    const ids = appState.recentlyRestoredIds;
    if (!ids.length) return;
    void tick().then(() => {
      const row = ids
        .map((id) => listContentEl?.querySelector(`[data-todo-id="${CSS.escape(id)}"]`))
        .find(Boolean);
      row?.scrollIntoView({ block: "nearest" });
    });
  });

  onMount(() => () => clearTimeout(settleTimer));

  let currentFontFamily = $derived(
    appState.allFonts.find((f) => f.name === appState.fontFamily)?.family || '"Gulim", sans-serif'
  );

  // 메모 창 세로 배치(layout/memoLayoutController.js)가 "할 일 목록이 모두 보이는 높이"를 잴 때 부릅니다.
  // 목록이 보이는 칸(viewport)과 목록 전체(content)의 차이만큼 할 일 영역에 빈 곳/가려진 곳이 있습니다.
  let listViewportEl = $state(null);
  let listContentEl = $state(null);
  export function measureLayout() {
    if (!listViewportEl || !listContentEl) return null;
    return { viewport: listViewportEl.clientHeight, content: listContentEl.offsetHeight };
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

<div
  class="todo-list-root relative flex flex-col h-full pl-3 pr-3 pt-1"
  style="{dlPaletteStyle}; --tb-date-w: {todoBadgeFit.slotPx}px; --tb-date-fs: {todoBadgeFit.fontPx}px; --tb-date-ls: {todoBadgeFit.letterSpacingEm}em; --todo-accent: {appState.getThemeAccentColor()};"
>
  <!-- 숨김 측정 span: listContentEl 밖(.todo-list-root 직속)에 두어 measureLayout()에 영향이 없으며
       data-todo-deadline-btn을 절대 붙이지 않아 BulkSelectDock·Dday 대상 탐색에 섞이지 않습니다. -->
  <div class="todo-badge-probe-host" aria-hidden="true">
    <span bind:this={probeEl} class="todo-badge-probe">
      <span bind:this={probeMainEl}>18/88</span><span bind:this={probeDowEl} class="todo-badge-dow">(수)</span>
    </span>
  </div>

  <div
    bind:this={listViewportEl}
    class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 border-t"
    style="border-color: {appState.isEditMode ? 'transparent' : (appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(120,80,20,0.1)')};"
  >
    <!-- 줄 배경·강조색을 변수로 둬서, X 뒤 흐림 받침이 그 순간의 줄 배경과 정확히 같은 색이 되게 합니다.
         포인터 리스너는 조작이 아니라 "어느 줄 위에 있는지" 기록(X 무장·연타 보호)만 합니다. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
      bind:this={listContentEl}
      class="todo-rows min-h-[50px]"
      class:is-dark={appState.isDarkMode}
      class:is-settling={settling}
      style="--todo-chk-fill: {chkPalette.accentFill}; --todo-chk-on: {chkPalette.onAccent}; --todo-chk-rim: {chkPalette.primaryRim}; --todo-chk-bg: {chkPalette.chkBg}; --todo-chk-border: {chkPalette.chkBorder};"
      onpointerover={trackHoverRow}
      onpointerleave={() => { hoverRowId = null; }}
      onpointermove={onListPointerMove}
      onpointerdowncapture={swallowWhileSettling}
      onmousedowncapture={swallowWhileSettling}
      onclickcapture={swallowWhileSettling}
      ondblclickcapture={swallowWhileSettling}
    >
      {#each visibleTodos as todo, index (todo.id)}
        {@const dlInfo = getDeadlineInfo(todo.deadline, appState.todayKey)}
        {@const linkedDday = appState.findActiveDdayForTodo(todo.id)}
        {@const isSelected = appState.isEditMode && appState.selectedTodoIds.includes(todo.id)}

        <!--
          transition-all 을 transition-colors 로 바꾼 이유:
            transition-all 은 글이 두 줄로 늘어날 때 "높이"까지 0.3초 동안 애니메이션합니다.
            그 사이 행 높이가 내용보다 작아서 글자가 아랫줄을 침범해 겹쳐 보였습니다.
            높이는 즉시 반영하고 색상만 부드럽게 바꿉니다.
        -->
        <div
          use:todoSorter.row={{ id: todo.id, index, disabled: sortDisabled }}
          data-todo-id={todo.id}
          class="todo-row w-full min-w-full group flex items-start gap-1 px-1 transition-colors duration-200"
          class:is-restored={appState.recentlyRestoredIds.includes(todo.id)}
          class:is-selected={isSelected}
          style="border-bottom-color: {appState.isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'};"
        >
          <div class="todo-lead gap-1.5 ml-0.5">
            {#if appState.isEditMode}
              <button
                type="button"
                data-todo-select-btn
                onclick={() => appState.toggleTodoSelection(todo.id)}
                onmousedown={(e) => e.preventDefault()}
                class="todo-select-chk"
                class:is-checked={isSelected}
                aria-pressed={isSelected}
                aria-label={isSelected ? "항목 선택 해제" : "항목 선택"}
                title={isSelected ? "선택 해제" : "선택"}
              >
                {#if isSelected}
                  <svg class="todo-select-glyph" width="10" height="10" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                    <path d="M3.2 7.4L5.9 9.9L10.8 4.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                {/if}
              </button>
            {/if}

            <!-- 완료 버튼 = 잡기 버튼: 짧게 누르면 마감, 위아래로 끌면 순서 변경(data-sort-activator) -->
            <button
              type="button"
              data-sort-activator
              onclick={(e) => handleComplete(e, todo.id)}
              onmousedown={(e) => e.preventDefault()}
              class={clsx(
                "todo-done w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 shadow-sm cursor-pointer overflow-hidden group/done my-auto",
                appState.isDarkMode ? "border-gray-500 hover:border-emerald-500 hover:bg-emerald-500" : "border-gray-300 bg-white hover:border-emerald-500 hover:bg-emerald-500"
              )}
              title={sortDisabled ? "마감 처리" : "마감 처리 · 위아래로 끌면 순서 변경"}
              aria-label="마감 처리"
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
              data-sort-activator
              class="todo-badge"
              class:is-picker-open={datePicker.openKey === todoPickerKey(todo.id)}
              data-dl={dlInfo.kind}
              title={dlInfo.kind === "invalid"
                ? `${dlInfo.label} (클릭해 날짜 다시 고르기)`
                : (sortDisabled ? "마감일 설정" : "마감일 설정 · 위아래로 끌면 순서 변경")}
              data-todo-deadline-btn
              aria-expanded={datePicker.openKey === todoPickerKey(todo.id)}
            >
              {#if dlInfo.isIcon}
                <span class="todo-badge-icon" aria-hidden="true">
                  <Icon icon={CALENDAR_BOLD_DUOTONE} width="100%" height="100%" />
                </span>
              {:else if dlInfo.kind === "invalid"}
                <span class="todo-badge-label is-invalid">{dlInfo.label}</span>
              {:else}
                <span class="todo-badge-label"><span>{dlInfo.main}</span>{#if dlInfo.dow}<span class="todo-badge-dow">{dlInfo.dow}</span>{/if}</span>
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

          <!--
            줄 끝 꼬리: D-Day 깃발(있으면)만 자리를 차지하고, X·키보드 손잡이는 그 왼쪽에 "겹쳐" 뜹니다.
            왜 겹치는가: 예전엔 손잡이·휴지통이 투명한 채로 약 42px를 늘 차지해 오른쪽에 빈 띠가 생겼습니다.
            겹침 묶음은 투명도·변형만 바뀌므로 나타나고 사라져도 줄 폭·높이·줄바꿈이 한 픽셀도 바뀌지 않습니다.
          -->
          <div class="todo-tail" class:has-flag={!!linkedDday}>
            {#if linkedDday}
              <DdayTodoChip
                item={linkedDday}
                todayKey={appState.todayKey}
                themeColor={appState.themeColor}
                dark={appState.isDarkMode}
                onclick={() => appState.openDdayControl({ focusDdayId: linkedDday.id })}
              />
            {/if}

            <div class="todo-float">
              <span class="todo-veil" aria-hidden="true"></span>
              <!-- 키보드 전용 손잡이: Tab으로 왔을 때만 보입니다(스페이스 → ↑↓ → 스페이스). 포인터는 완료 버튼·날짜 알약으로 끕니다. -->
              <button
                type="button"
                class="todo-kbd-handle"
                disabled={sortDisabled}
                title={sortDisabled ? "검색·업데이트 중에는 순서를 바꿀 수 없어요" : "순서 변경 (스페이스 → ↑↓ → 스페이스)"}
                aria-label="끌어서 순서 변경"
              >
                <ArrowUpDown size={11} strokeWidth={2.6} />
              </button>
              <span class="todo-x-pop">
                <EraserButton
                  dark={appState.isDarkMode}
                  canPress={(e) => canPressX(e, todo.id)}
                  onremove={(e) => handleRemove(e, todo.id)}
                />
              </span>
            </div>
          </div>
        </div>
      {/each}
    </section>
  </div>

  <!-- 되돌리기 알림 자리: 새 할 일 입력줄 바로 위. 높이 0이라 배치(measureLayout)에 영향이 없습니다. -->
  <UndoToast />

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
        class="todo-badge todo-date-button"
        class:is-picker-open={datePicker.openKey === NEW_TASK_PICKER_KEY}
        data-dl={formDlInfo.kind}
        title={newTaskDeadline ? `마감일: ${formatShortDate(newTaskDeadline)}` : "마감일 설정"}
        aria-expanded={datePicker.openKey === NEW_TASK_PICKER_KEY}
      >
        {#if formDlInfo.isIcon}
          <span class="todo-badge-icon" aria-hidden="true">
            <Icon icon={CALENDAR_BOLD_DUOTONE} width="100%" height="100%" />
          </span>
        {:else if formDlInfo.kind === "invalid"}
          <span class="todo-badge-label is-invalid">{formDlInfo.label}</span>
        {:else}
          <span class="todo-badge-label"><span>{formDlInfo.main}</span>{#if formDlInfo.dow}<span class="todo-badge-dow">{formDlInfo.dow}</span>{/if}</span>
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
  /* ── 마감일 뱃지 공통 말랑 딱지 규격 (D-Day 칩과 1:1 쌍둥이 · 가로는 전 행 동일 고정 슬롯) ── */
  .todo-badge-probe-host {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .todo-badge-probe {
    position: absolute;
    left: 0;
    top: 0;
    display: inline-block;
    white-space: nowrap;
    font-family: var(--ui-font-family);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    visibility: hidden;
    pointer-events: none;
  }

  .todo-badge {
    --tb-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: safe center;
    width: var(--tb-date-w, 64px);
    height: var(--tb-h, 22px);
    padding: 0 4px;
    border-radius: var(--tb-radius, 999px);
    border: 1px solid var(--badge-border);
    background-color: var(--badge-bg);
    color: var(--badge-color);
    box-shadow: inset 0 -1.5px 0 var(--badge-rim), inset 0 1px 0 var(--tb-gloss);
    font-family: var(--ui-font-family);
    font-size: var(--tb-date-fs, var(--tb-fs, 10.5px));
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tb-date-ls, -0.025em);
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    flex-shrink: 0;
    cursor: pointer;
    user-select: none;
    transition:
      transform 200ms var(--tb-spring),
      background-color 140ms ease,
      border-color 140ms ease;
  }

  .todo-badge[data-dl='overdue'] {
    --badge-bg: var(--dl-overdue-bg);
    --badge-hover-bg: var(--dl-overdue-hover-bg);
    --badge-border: var(--dl-overdue-border);
    --badge-hover-border: var(--dl-overdue-hover-border);
    --badge-color: var(--dl-overdue-color);
    --badge-rim: var(--dl-overdue-rim);
  }
  .todo-badge[data-dl='today'] {
    --badge-bg: var(--dl-today-bg);
    --badge-hover-bg: var(--dl-today-hover-bg);
    --badge-border: var(--dl-today-border);
    --badge-hover-border: var(--dl-today-hover-border);
    --badge-color: var(--dl-today-color);
    --badge-rim: var(--dl-today-rim);
  }
  .todo-badge[data-dl='soon'] {
    --badge-bg: var(--dl-soon-bg);
    --badge-hover-bg: var(--dl-soon-hover-bg);
    --badge-border: var(--dl-soon-border);
    --badge-hover-border: var(--dl-soon-hover-border);
    --badge-color: var(--dl-soon-color);
    --badge-rim: var(--dl-soon-rim);
  }
  .todo-badge[data-dl='week'] {
    --badge-bg: var(--dl-week-bg);
    --badge-hover-bg: var(--dl-week-hover-bg);
    --badge-border: var(--dl-week-border);
    --badge-hover-border: var(--dl-week-hover-border);
    --badge-color: var(--dl-week-color);
    --badge-rim: var(--dl-week-rim);
  }
  .todo-badge[data-dl='later'] {
    --badge-bg: var(--dl-later-bg);
    --badge-hover-bg: var(--dl-later-hover-bg);
    --badge-border: var(--dl-later-border);
    --badge-hover-border: var(--dl-later-hover-border);
    --badge-color: var(--dl-later-color);
    --badge-rim: var(--dl-later-rim);
  }
  .todo-badge[data-dl='unset'] {
    --badge-bg: var(--dl-unset-bg);
    --badge-hover-bg: var(--dl-unset-hover-bg);
    --badge-border: var(--dl-unset-border);
    --badge-hover-border: var(--dl-unset-hover-border);
    --badge-color: var(--dl-unset-color);
    --badge-rim: transparent;
    border-style: dashed;
    box-shadow: none;
  }
  .todo-badge[data-dl='invalid'] {
    --badge-bg: var(--dl-invalid-bg);
    --badge-hover-bg: var(--dl-invalid-hover-bg);
    --badge-border: var(--dl-invalid-border);
    --badge-hover-border: var(--dl-invalid-hover-border);
    --badge-color: var(--dl-invalid-color);
    --badge-rim: transparent;
    border-style: dashed;
    box-shadow: none;
  }

  .todo-badge:hover {
    background-color: var(--badge-hover-bg);
    border-color: var(--badge-hover-border);
    transform: translateY(-0.5px) scale(1.04);
  }
  .todo-badge:active {
    transform: scale(1.03, 0.92);
    transition-duration: 140ms, 140ms, 90ms;
  }
  .todo-badge.is-picker-open {
    outline: 2px solid var(--todo-accent);
    outline-offset: 1px;
  }
  .todo-badge:focus-visible {
    outline: 2px solid var(--todo-accent);
    outline-offset: 1.5px;
  }

  .todo-badge-label {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    line-height: 1;
    transform: translateY(var(--tb-label-nudge, 0.065em));
  }
  .todo-badge-label.is-invalid {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .todo-badge-dow {
    opacity: 0.80;
  }
  .todo-badge-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--tb-icon, 12.5px) + 1.5px);
    height: calc(var(--tb-icon, 12.5px) + 1.5px);
    flex: none;
    pointer-events: none;
    transform: translateY(-0.5px);
  }

  /* 하단 새 할 일 입력줄: 위 목록과 1:1 동일 고정 슬롯(64×22px @10pt)으로 입력창 좌우 점프를 없애고
     위아래 3px 히트 확장(::before)으로 28px 입력창 높이와 누르기 쉬운 감도를 함께 확보합니다. */
  .todo-date-button {
    overflow: visible;
  }
  .todo-date-button .todo-badge-label {
    overflow: hidden;
  }
  .todo-date-button::before {
    content: '';
    position: absolute;
    inset: -3px 0;
    border-radius: var(--tb-radius, 999px);
  }
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

  /* ── 다중 선택 행 조약돌 체크 토글 (상단 BulkSelectDock 16×16px · rx=6px과 1:1 동일 규격) ── */
  .todo-select-chk {
    position: relative;
    width: 16px;
    height: 16px;
    padding: 0;
    margin-block: auto;
    flex-shrink: 0;
    display: inline-grid;
    place-items: center;
    border-radius: 6px;
    border: 1.5px solid var(--todo-chk-border, #b4bac6);
    background-color: var(--todo-chk-bg, #ffffff);
    color: var(--todo-chk-on, #ffffff);
    box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.05);
    cursor: pointer;
    z-index: 10;
    box-sizing: border-box;
    transition:
      transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1),
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease;
  }
  /* 옆 완료 버튼(5px 간격)과 겹치지 않는 2px 범위만 히트 영역을 넓혀 클릭감을 부드럽게 합니다. */
  .todo-select-chk::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 8px;
  }
  .todo-select-chk:hover {
    border-color: var(--todo-chk-fill, var(--todo-accent));
    transform: scale(1.1);
  }
  .todo-select-chk:active {
    transform: scale(0.88);
    transition-duration: 90ms;
  }
  .todo-select-chk:focus-visible {
    outline: 2px solid var(--todo-accent);
    outline-offset: 1.5px;
  }
  .todo-select-chk.is-checked {
    background-color: var(--todo-chk-fill, var(--todo-accent));
    border-color: var(--todo-chk-fill, var(--todo-accent));
    box-shadow: inset 0 -1.5px 0 var(--todo-chk-rim, rgba(0, 0, 0, 0.25));
  }
  .todo-select-glyph {
    display: block;
    transform: translateY(-0.35px);
  }

  /* ── 줄 배경과 X 받침 색 ─────────────────────────────────────
     X 뒤의 흐림 받침은 "그 순간의 줄 배경"과 같은 색이어야 글자가 잘린 듯 보이지 않고 부드럽게 사라집니다.
     줄 배경 = 테마색 위에 마우스 올림 덧칠(라이트 검정 5%, 다크 흰색 5%)이므로, 같은 값을 color-mix로 만듭니다. */
  .todo-rows {
    --row-hover: rgba(0, 0, 0, 0.05);
    --row-surface-rest: var(--global-theme-color);
    --row-surface-hover: color-mix(in srgb, var(--global-theme-color) 95%, black);
    --row-surface-selected: color-mix(in srgb, var(--todo-accent) 7%, var(--global-theme-color));
    --row-surface-selected-hover: color-mix(in srgb, var(--todo-accent) 10%, var(--row-surface-hover));
    --done-rest-bg: #ffffff;
    --done-rest-border: #d1d5db;
  }
  .todo-rows.is-dark {
    --row-hover: rgba(255, 255, 255, 0.05);
    --row-surface-hover: color-mix(in srgb, var(--global-theme-color) 95%, white);
    --row-surface-selected: color-mix(in srgb, var(--todo-accent) 11%, var(--global-theme-color));
    --row-surface-selected-hover: color-mix(in srgb, var(--todo-accent) 14%, var(--row-surface-hover));
    --done-rest-bg: transparent;
    --done-rest-border: #6b7280;
  }
  .todo-row { --row-surface: var(--row-surface-rest); }
  .todo-row.is-selected {
    background-color: var(--row-surface-selected);
    --row-surface: var(--row-surface-selected);
  }
  .todo-row:hover {
    background-color: var(--row-hover);
    --row-surface: var(--row-surface-hover);
  }
  .todo-row.is-selected:hover {
    background-color: var(--row-surface-selected-hover);
    --row-surface: var(--row-surface-selected-hover);
  }

  /* ── 줄 끝 꼬리와 겹침 묶음(X · 키보드 손잡이) ─────────────────
     깃발이 없으면 꼬리 폭은 0이고, 줄의 간격(gap-1)만큼 되돌려 글이 줄 안쪽 여백 끝까지 닿게 합니다.
     겹침 묶음은 꼬리의 왼쪽(right: 100%)에 붙어 첫 줄 높이 안에서 세로 가운데에 뜹니다.
     보이고 숨기는 것은 투명도·변형·pointer-events만 씁니다 — 폭·높이를 바꾸면 편집 중 줄바꿈이 흔들립니다. */
  .todo-tail {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    min-height: var(--todo-first-line-h, 36px);
    margin-left: calc(-1 * var(--spacing, 0.25rem));
  }
  .todo-tail.has-flag { margin-left: 0; }

  .todo-float {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 100%;
    display: flex;
    align-items: center;
    gap: 3px;
    padding-left: 16px; /* 흐림 받침이 글을 덮기 시작하는 너비 */
    pointer-events: none;
    opacity: 0;
    transition: opacity 140ms ease-out;
    z-index: 1;
  }
  .todo-tail.has-flag .todo-float { margin-right: 2px; }

  .todo-veil {
    position: absolute;
    inset: 0;
    background-color: var(--row-surface);
    -webkit-mask-image: linear-gradient(to right, transparent, #000 16px);
    mask-image: linear-gradient(to right, transparent, #000 16px);
    transition: background-color 200ms ease;
  }

  /* 지우개 단추는 나타날 때 0.72배에서 톡 튀어나옵니다(크기는 겉 상자, 올림·누름 효과는 EraserButton 자신이 맡음). */
  .todo-x-pop {
    position: relative;
    display: grid;
    pointer-events: none;
    transform: scale(0.72);
    transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 140ms ease-out;
  }

  /* 키보드 전용 손잡이: 평소 폭 0·투명, Tab으로 왔을 때만 작은 알약으로 나타납니다. */
  .todo-kbd-handle {
    position: relative;
    display: grid;
    place-items: center;
    width: 0;
    height: 20px;
    padding: 0;
    margin: 0;
    border: 0;
    overflow: hidden;
    border-radius: 999px;
    opacity: 0;
    color: var(--todo-accent);
    background-color: color-mix(in srgb, var(--todo-accent) 16%, var(--row-surface));
  }
  .todo-kbd-handle:focus-visible {
    width: 24px;
    opacity: 1;
    outline: 2px solid var(--todo-accent);
    outline-offset: 1px;
  }

  /* 보이기: 줄에 마우스를 올림 · 묶음 안 단추에 키보드 초점 */
  .todo-row:hover .todo-float,
  .todo-row:has(.todo-float :focus-visible) .todo-float { opacity: 1; }
  .todo-row:hover .todo-x-pop,
  .todo-row:has(.todo-float :focus-visible) .todo-x-pop {
    transform: none;
    pointer-events: auto;
  }

  /* 숨기기(위 규칙보다 우선): 그 줄 글을 편집 중 · 잡힌/착지 중인 줄 · 연타 보호 중 */
  .todo-rows .todo-row:has(.todo-text:focus) .todo-float,
  .todo-rows .todo-row:global([data-dnd-dropping]) .todo-float,
  .todo-rows.is-settling .todo-row .todo-float { opacity: 0; }
  .todo-rows .todo-row:has(.todo-text:focus) .todo-x-pop,
  .todo-rows .todo-row:global(:is([data-dnd-dragging], [data-dnd-dropping])) .todo-x-pop,
  .todo-rows.is-settling .todo-row .todo-x-pop {
    opacity: 0;
    transform: scale(0.72);
    pointer-events: none;
  }
  /* 잡힌 줄: 마우스로 끄는 중이면 묶음을 숨기고, 키보드로 끄는 중이면 손잡이만 남깁니다. */
  .todo-rows .todo-row:global([data-dnd-dragging]):not(:has(.todo-kbd-handle:focus-visible)) .todo-float { opacity: 0; }

  /* 잡은 행은 폭·줄바꿈을 유지하고 색과 그림자로만 구분합니다. */
  .todo-row:global([data-dnd-dragging]) {
    width: var(--todo-sort-width) !important;
    min-width: var(--todo-sort-width) !important;
    max-width: var(--todo-sort-width) !important;
    left: var(--todo-sort-left) !important;
    background-color: var(--global-theme-color);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.13);
    --row-surface: var(--row-surface-rest);
  }

  /* 끄는 동안 완료 버튼의 올림·누름 효과(초록 채움·체크·확대/축소)를 끕니다.
     그대로 두면 끄는 내내 "마감될 것처럼" 보입니다. 날짜 알약의 확대/축소도 끕니다. */
  .todo-rows .todo-row:global(:is([data-dnd-dragging], [data-dnd-dropping])) .todo-done {
    transform: none !important;
    background-color: var(--done-rest-bg) !important;
    border-color: var(--done-rest-border) !important;
  }
  .todo-rows .todo-row:global(:is([data-dnd-dragging], [data-dnd-dropping])) .todo-done :global(svg) { opacity: 0 !important; }
  .todo-rows .todo-row:global(:is([data-dnd-dragging], [data-dnd-dropping])) .todo-badge { transform: none !important; }

  /* 알림에서 되돌린 줄: 강조색으로 한 번 반짝여 "여기로 돌아왔어요"를 알립니다. */
  .todo-row.is-restored { animation: todo-restored 900ms ease-out; }
  @keyframes todo-restored {
    from { background-color: color-mix(in srgb, var(--todo-accent) 22%, transparent); }
    to { background-color: transparent; }
  }

  /* 마우스를 올릴 수 없는 기기: 지우개를 늘 보여 주고, 그 자리만큼 글 오른쪽을 비웁니다(기기마다 고정이라 흔들림 없음). */
  @media (hover: none) {
    .todo-float { opacity: 1; }
    .todo-x-pop { transform: none; pointer-events: auto; }
    .todo-text { padding-right: 30px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .todo-x-pop,
    .todo-rows .todo-row .todo-x-pop { transform: none !important; transition: opacity 140ms ease-out; }
    .todo-badge,
    .todo-badge:hover,
    .todo-badge:active {
      transform: none;
      transition: background-color 140ms ease, border-color 140ms ease;
    }
    .todo-select-chk,
    .todo-select-chk:hover,
    .todo-select-chk:active { transform: none; transition-duration: 0ms; }
  }

  .todo-text {
    line-height: 1.55;
    padding-top: var(--todo-pad-y);
    padding-bottom: var(--todo-pad-y);
    /* 사용자가 넣은 띄어쓰기/줄바꿈을 그대로 보존합니다. */
    white-space: pre-wrap;
    /* 좁은 할 일 칸에서 띄어쓰기가 없는 긴 단어가 통째로 내려가 오른쪽 빈 공간이 크게 생기는 것을 막기 위해 글자 단위로 줄바꿈합니다. */
    word-break: break-all;
    /* 특수문자 연속 등 word-break로 못 자르는 문자열도 가로 넘침 없이 줄바꿈합니다. */
    overflow-wrap: anywhere;
  }

  .todo-input-field {
    /* 새 할 일 입력칸도 목록과 동일하게 글자 단위로 줄바꿈해 빈 공간과 가로 넘침을 막습니다. */
    word-break: break-all;
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
    left: 7px;
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 35px);
  }
</style>
