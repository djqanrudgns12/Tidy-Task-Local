<script>
  // 마감일 달력 카드(화면만). 창 옮기기·위치·결과 전달은 DatePickerWindow가 맡습니다.
  // 왜 나눴는가: 같은 카드를 실제 팝업 창과 브라우저 시안(?date-picker-preview)에서 함께 써서,
  //   네이티브 창 없이도 모양·키보드 동작을 확인할 수 있게 합니다.
  import { tick } from 'svelte';
  import {
    WEEKDAY_LABELS,
    buildMonthGrid,
    cursorMoveForKey,
    moveCursor,
    parseDateKey,
    quickDates,
    shiftMonth,
    addMonths,
    toDateKey,
  } from '../../lib/datePicker/calendarModel.js';

  /**
   * @type {{
   *   value?: string,
   *   todayKey: string,
   *   viaKeyboard?: boolean,
   *   draggable?: boolean,
   *   onpick: (key: string) => void,
   *   onclear: () => void,
   *   onescape: () => void,
   * }}
   */
  let { value = '', todayKey, viaKeyboard = false, draggable = false, onpick, onclear, onescape } = $props();

  // 처음 펼칠 달과 커서 위치입니다. 부모가 요청마다 카드를 새로 만들므로({#key}) 이후로는 value를 따라가지 않습니다.
  // svelte-ignore state_referenced_locally
  const start = parseDateKey(value) || parseDateKey(todayKey) || { year: 2000, month: 0, day: 1 };
  let view = $state({ year: start.year, month: start.month });
  // svelte-ignore state_referenced_locally
  let cursor = $state(value || todayKey);
  // 키보드로 움직이기 시작하면 커서 테두리를 보여 줍니다. 마우스로 열었을 때는 가만히 두어 깔끔하게 보입니다.
  // svelte-ignore state_referenced_locally
  let keyboardMode = $state(viaKeyboard);

  /** @type {HTMLDivElement | null} */
  let gridEl = $state(null);

  let cells = $derived(buildMonthGrid(view.year, view.month, { todayKey, selectedKey: value }));
  let quick = $derived(quickDates(todayKey));
  let today = $derived(parseDateKey(todayKey));
  let isThisMonth = $derived(Boolean(today) && today?.year === view.year && today?.month === view.month);

  /** @param {{ key: string, weekday: number }} cell */
  function ariaLabel(cell) {
    const p = parseDateKey(cell.key);
    return p ? `${p.year}년 ${p.month + 1}월 ${p.day}일 ${WEEKDAY_LABELS[cell.weekday]}요일` : cell.key;
  }

  // 커서를 옮기고, 다른 달이면 그 달을 펼친 뒤 그 칸에 입력 초점을 줍니다.
  /** @param {string} key */
  async function setCursor(key) {
    const p = parseDateKey(key);
    if (!p) return;
    cursor = key;
    if (p.year !== view.year || p.month !== view.month) view = { year: p.year, month: p.month };
    await tick();
    focusCursor();
  }

  // 부모(팝업 창)가 창을 보여 준 뒤에도 부릅니다. 숨은 창에서 준 초점은 창이 활성화될 때 사라질 수 있습니다.
  export function focusCursor() {
    /** @type {HTMLButtonElement | null | undefined} */
    const button = gridEl?.querySelector(`[data-key="${cursor}"]`);
    button?.focus({ preventScroll: true });
  }

  /** @param {number} delta */
  function goMonth(delta) {
    view = shiftMonth(view, delta);
    // 키보드 커서도 같은 날짜의 다음/이전 달로 따라갑니다(말일 보정). 초점은 누른 버튼에 그대로 둡니다.
    cursor = addMonths(cursor, delta);
  }

  function goThisMonth() {
    if (!today) return;
    view = { year: today.year, month: today.month };
    // 고른 날이 이번 달에 있으면 그 날에, 아니면 오늘에 커서를 둡니다.
    const picked = parseDateKey(value);
    cursor = picked && picked.year === today.year && picked.month === today.month ? value : todayKey;
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    // 한글 조합 중에 들어오는 키는 달력 조작이 아닙니다.
    if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onescape();
      return;
    }
    const move = cursorMoveForKey(e);
    if (move) {
      e.preventDefault();
      keyboardMode = true;
      void setCursor(moveCursor(cursor, move));
      return;
    }
    const onButton = e.target instanceof HTMLElement && e.target.closest('button');
    if (e.key === 'Enter' || e.key === ' ') {
      // 버튼에 초점이 있으면 그 버튼의 기본 동작(click)에 맡깁니다. 여기서도 처리하면 두 번 고릅니다.
      if (onButton) return;
      e.preventDefault();
      onpick(cursor);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && value) {
      e.preventDefault();
      onclear();
      return;
    }
    // T: 오늘로 커서 이동. 왜 e.code인가: 한글 입력 상태에서는 e.key가 'ㅅ'이 되어 알아듣지 못합니다.
    if (e.code === 'KeyT' && !e.shiftKey) {
      e.preventDefault();
      keyboardMode = true;
      void setCursor(todayKey);
    }
  }

  // 달력 위에서 휠을 굴리면 달을 넘깁니다. 터치패드는 작은 값이 연달아 오므로 모아서 한 번만 넘깁니다.
  let wheelAccum = 0;
  let wheelLockedUntil = 0;
  /** @param {WheelEvent} e */
  function handleWheel(e) {
    const now = performance.now();
    if (now < wheelLockedUntil) return;
    wheelAccum += e.deltaY;
    if (Math.abs(wheelAccum) < 40) return;
    goMonth(wheelAccum > 0 ? 1 : -1);
    wheelAccum = 0;
    wheelLockedUntil = now + 140;
  }

  // 마우스를 쓰기 시작하면 키보드 커서 테두리를 거둡니다.
  function handlePointerDown() {
    keyboardMode = false;
  }

  // 달을 넘겨 커서가 보이는 달 밖에 있으면, 키보드로 다시 움직일 때 보이는 달 안에서 시작합니다.
  let cursorInView = $derived(cells.some((c) => c.key === cursor));
  let tabStopKey = $derived(cursorInView ? cursor : toDateKey(view.year, view.month, 1));
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- 카드 아무 곳이나 잡고 끌 수 있습니다(끌기 자체는 창 쪽 DatePickerWindow가 붙입니다).
     왜 머리글만이 아닌가: 작은 달력에서 머리글은 잡을 자리가 너무 좁고, 사용자는 보통 아무 데나 잡습니다. -->
<div
  class="dp-card"
  class:kbd={keyboardMode}
  class:draggable
  role="dialog"
  aria-label="마감일 선택"
  tabindex="-1"
  onpointerdown={handlePointerDown}
>
  <div class="dp-head">
    <button type="button" class="dp-nav" onclick={() => goMonth(-1)} title="이전 달 (PageUp)" aria-label="이전 달">
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
    <button
      type="button"
      class="dp-title"
      class:away={!isThisMonth}
      onclick={goThisMonth}
      title={isThisMonth ? '달력을 끌어서 옮길 수 있어요' : '이번 달로 돌아가기'}
    >{view.year}년 {view.month + 1}월</button>
    <button type="button" class="dp-nav" onclick={() => goMonth(1)} title="다음 달 (PageDown)" aria-label="다음 달">
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
    </button>
  </div>

  <div class="dp-quick" role="group" aria-label="빠른 선택">
    {#each quick as q (q.id)}
      <button
        type="button"
        class="dp-chip"
        class:active={q.key === value}
        title={q.hint}
        onclick={() => onpick(q.key)}
      >{q.label}</button>
    {/each}
  </div>

  <div class="dp-weekdays" aria-hidden="true">
    {#each WEEKDAY_LABELS as w, i}
      <span class:sun={i === 0} class:sat={i === 6}>{w}</span>
    {/each}
  </div>

  <div class="dp-grid" role="group" aria-label="{view.year}년 {view.month + 1}월" bind:this={gridEl} onwheel={handleWheel}>
    <!-- 칸 42개를 순서 그대로 재사용합니다(키 없는 each). 날짜 키로 묶으면 달을 넘길 때마다 칸을 모두 지웠다 다시 만듭니다. -->
    {#each cells as cell}
      <button
        type="button"
        class="dp-day"
        class:out={!cell.inMonth}
        class:sun={cell.weekday === 0}
        class:sat={cell.weekday === 6}
        class:today={cell.isToday}
        class:selected={cell.isSelected}
        class:cursor={cell.key === cursor}
        data-key={cell.key}
        tabindex={cell.key === tabStopKey ? 0 : -1}
        aria-label={ariaLabel(cell)}
        aria-pressed={cell.isSelected}
        aria-current={cell.isToday ? 'date' : undefined}
        onclick={() => onpick(cell.key)}
      >{cell.day}</button>
    {/each}
  </div>

  {#if value}
    <div class="dp-foot">
      <button type="button" class="dp-clear" onclick={onclear} title="마감일 없애기 (Delete)">
        <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        날짜 지우기
      </button>
    </div>
  {/if}
</div>

<style>
  .dp-card {
    width: 15.4em;
    background: var(--dp-bg);
    color: var(--dp-text);
    border: 1px solid var(--dp-border);
    border-radius: 14px;
    box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.28), 0 1px 3px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    user-select: none;
    outline: none;
  }
  /* 빈 곳은 "잡을 수 있다"는 손 모양, 누를 수 있는 것들은 손가락 모양입니다. */
  .dp-card.draggable { cursor: grab; }
  .dp-card.draggable:active { cursor: grabbing; }
  .dp-card.draggable :is(button, .dp-day, .dp-chip, .dp-nav, .dp-clear) { cursor: pointer; }

  button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  svg path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25em;
    padding: 0.4em 0.5em;
    background: var(--dp-head-bg);
    color: var(--dp-head-text);
  }
  .dp-nav {
    display: grid;
    place-items: center;
    width: 1.75em;
    height: 1.75em;
    border-radius: 8px;
    flex-shrink: 0;
    transition: background-color 0.12s;
  }
  .dp-nav:hover { background: rgba(0, 0, 0, 0.08); }
  .dp-title {
    flex: 1;
    min-width: 0;
    padding: 0.2em 0.3em;
    border-radius: 8px;
    font-weight: 700;
    font-size: 0.86em;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  /* 다른 달을 보고 있을 때만 "눌러서 이번 달로" 돌아갈 수 있다는 표시를 줍니다. */
  .dp-title.away { text-decoration: underline dotted; text-underline-offset: 3px; }

  .dp-quick {
    display: flex;
    gap: 0.25em;
    padding: 0.45em 0.45em 0.1em;
  }
  .dp-chip {
    flex: 1 1 auto;
    padding: 0.28em 0.2em;
    border-radius: 999px;
    border: 1px solid var(--dp-chip-border);
    background: var(--dp-chip-bg);
    font-size: 0.66em;
    font-weight: 700;
    white-space: nowrap;
    transition: transform 0.1s, background-color 0.12s, border-color 0.12s;
  }
  .dp-chip:hover { border-color: var(--dp-accent); color: var(--dp-accent); }
  .dp-chip:active { transform: scale(0.95); }
  .dp-chip.active {
    background: var(--dp-accent);
    border-color: var(--dp-accent);
    color: var(--dp-on-accent);
  }

  .dp-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    padding: 0.4em 0.45em 0.1em;
    font-size: 0.64em;
    font-weight: 700;
    text-align: center;
    color: var(--dp-muted);
  }
  .dp-weekdays .sun { color: var(--dp-sun); }
  .dp-weekdays .sat { color: var(--dp-sat); }

  .dp-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.12em;
    padding: 0.1em 0.45em 0.45em;
  }
  .dp-day {
    height: 1.95em;
    border-radius: 8px;
    font-size: 0.75em;
    text-align: center;
    transition: background-color 0.1s, transform 0.1s;
  }
  .dp-day.sun { color: var(--dp-sun); }
  .dp-day.sat { color: var(--dp-sat); }
  .dp-day.out { color: var(--dp-fade); }
  .dp-day:hover { background: var(--dp-hover); }
  .dp-day:active { transform: scale(0.92); }
  .dp-day.today {
    font-weight: 700;
    background: var(--dp-accent-soft);
    box-shadow: inset 0 0 0 1.5px var(--dp-accent);
  }
  .dp-day.selected {
    font-weight: 700;
    color: var(--dp-on-accent);
    background: var(--dp-accent);
    box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.25);
  }
  .dp-day:focus-visible { outline: none; }
  /* 키보드로 조작할 때만 커서 테두리를 보여 줍니다. */
  .kbd .dp-day.cursor {
    outline: 2px solid var(--dp-accent);
    outline-offset: 1px;
  }
  .dp-nav:focus-visible,
  .dp-chip:focus-visible,
  .dp-title:focus-visible,
  .dp-clear:focus-visible {
    outline: 2px solid var(--dp-accent);
    outline-offset: 1px;
  }

  .dp-foot {
    border-top: 1px solid var(--dp-border);
    padding: 0.3em 0.45em 0.45em;
  }
  .dp-clear {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3em;
    padding: 0.4em;
    border-radius: 10px;
    font-size: 0.72em;
    font-weight: 700;
    color: var(--dp-danger);
    background: var(--dp-danger-bg);
    transition: transform 0.1s;
  }
  .dp-clear:active { transform: scale(0.97); }
</style>
