<script>
  import { appState } from '../lib/appState.svelte.js';
  import { ChevronLeft, ChevronRight, X } from 'lucide-svelte';
  import { onMount, onDestroy, tick } from 'svelte';
  import { mount, unmount } from 'svelte';

  /** @type {{ value: string, anchorEl?: HTMLElement | null, onchange: (v: string) => void, onclose: () => void }} */
  let { value = '', anchorEl = null, onchange, onclose } = $props();

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date();

  let viewYear  = $state(value ? parseInt(value.split('-')[0]) : today.getFullYear());
  let viewMonth = $state(value ? parseInt(value.split('-')[1]) - 1 : today.getMonth());

  // 드래그
  let el = $state(null);
  let dragX = $state(0), dragY = $state(0);
  let dragging = false;
  let startMX = 0, startMY = 0, startDX = 0, startDY = 0;

  // 앵커 기반 위치 계산
  let posTop = $state(0);
  let posLeft = $state(0);

  let selectedDate = $derived(value ? new Date(value + 'T00:00:00') : null);
  let firstDay = $derived(new Date(viewYear, viewMonth, 1).getDay());
  let lastDay  = $derived(new Date(viewYear, viewMonth + 1, 0).getDate());

  function prevFill() {
    const days = [], pl = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) days.push(pl - i);
    return days;
  }
  function currDays() { return Array.from({ length: lastDay }, (_, i) => i + 1); }
  function nextFill() {
    const total = firstDay + lastDay, rows = Math.ceil(total / 7);
    return Array.from({ length: rows * 7 - total }, (_, i) => i + 1);
  }

  function prevMonth() { viewMonth === 0 ? (viewMonth = 11, viewYear--) : viewMonth--; }
  function nextMonth() { viewMonth === 11 ? (viewMonth = 0, viewYear++) : viewMonth++; }

  function selectDay(d) {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onchange(`${viewYear}-${mm}-${dd}`);
    onclose();
  }
  function clearDate() { onchange(''); onclose(); }

  function isToday(d) { return d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear(); }
  function isSelected(d) { return selectedDate ? (d === selectedDate.getDate() && viewMonth === selectedDate.getMonth() && viewYear === selectedDate.getFullYear()) : false; }
  function colOf(d) { return (firstDay + d - 1) % 7; }

  // ── 드래그 ─────────────────────────────
  function onHeaderDown(e) {
    if (e.button !== 0) return;
    dragging = true;
    startMX = e.clientX; startMY = e.clientY;
    startDX = dragX; startDY = dragY;
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup', onMU);
    e.preventDefault();
  }
  function onMM(e) { if (dragging) { dragX = startDX + e.clientX - startMX; dragY = startDY + e.clientY - startMY; } }
  function onMU() { dragging = false; window.removeEventListener('mousemove', onMM); window.removeEventListener('mouseup', onMU); }

  // ── 외부 클릭 닫기 ─────────────────────
  function handleOutside(e) {
    if (el && !el.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      onclose();
    }
  }

  // ── 위치 계산: anchorEl 기준으로 팝업 위치 결정 ─
  async function calcPosition() {
    if (!anchorEl) return;
    await tick();
    const rect = anchorEl.getBoundingClientRect();
    const popW = 200, popH = 280; // 예상 팝업 크기
    // 위쪽에 공간 있으면 위로, 없으면 아래로
    const topSpace = rect.top;
    const top = topSpace > popH + 8
      ? rect.top - popH - 6 + window.scrollY
      : rect.bottom + 6 + window.scrollY;
    posTop  = top;
    posLeft = Math.min(rect.left + window.scrollX, window.innerWidth - popW - 8);
  }

  onMount(async () => {
    await calcPosition();
    setTimeout(() => document.addEventListener('mousedown', handleOutside), 0);
  });

  onDestroy(() => {
    document.removeEventListener('mousedown', handleOutside);
    window.removeEventListener('mousemove', onMM);
    window.removeEventListener('mouseup', onMU);
  });

  // 테마
  let bg         = $derived(appState.isDarkMode ? '#2d303e' : '#ffffff');
  let border     = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)');
  let textMain   = $derived(appState.isDarkMode ? '#e2e8f0' : '#1f2937');
  let textFade   = $derived(appState.isDarkMode ? '#3f4455' : '#d1d5db');
  let headerBg   = $derived(appState.isDarkMode ? '#1e2030' : '#fef3c7');
  let headerText = $derived(appState.isDarkMode ? '#fde047' : '#d97706');
</script>

<!-- Portal 대상: body에 직접 붙어 overflow clip 탈출 -->
<div
  bind:this={el}
  class="rounded-2xl shadow-2xl border overflow-hidden select-none"
  style="
    position: fixed;
    z-index: 9999;
    background-color: {bg};
    border-color: {border};
    min-width: 196px;
    font-family: var(--ui-font-family, '굴림');
    top: {posTop + dragY}px;
    left: {posLeft + dragX}px;
  "
  role="dialog"
>
  <!-- 헤더 (드래그 핸들) -->
  <div
    class="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing"
    style="background-color: {headerBg}; color: {headerText};"
    onmousedown={onHeaderDown}
    role="presentation"
  >
    <button onclick={prevMonth} class="p-1 rounded-lg hover:bg-black/10 transition-colors shrink-0" onmousedown={(e)=>e.stopPropagation()}>
      <ChevronLeft size={13} strokeWidth={2.5} />
    </button>
    <span class="font-bold text-[0.85em] tracking-wide pointer-events-none">{viewYear}년 {viewMonth + 1}월</span>
    <button onclick={nextMonth} class="p-1 rounded-lg hover:bg-black/10 transition-colors shrink-0" onmousedown={(e)=>e.stopPropagation()}>
      <ChevronRight size={13} strokeWidth={2.5} />
    </button>
  </div>

  <!-- 요일 헤더 -->
  <div class="grid grid-cols-7 px-2 pt-2 pb-0.5 gap-x-0.5">
    {#each WEEKDAYS as w, i}
      <div class="text-center text-[0.65em] font-bold py-0.5"
        style="color: {i===0 ? '#ef4444' : i===6 ? '#3b82f6' : (appState.isDarkMode ? '#475569' : '#9ca3af')};">
        {w}
      </div>
    {/each}
  </div>

  <!-- 날짜 그리드 -->
  <div class="grid grid-cols-7 px-2 pb-2 gap-y-0.5 gap-x-0.5">
    {#each prevFill() as d}
      <div class="text-center text-[0.7em] py-1 rounded-lg" style="color:{textFade};">{d}</div>
    {/each}

    {#each currDays() as d}
      {@const sel = isSelected(d)}
      {@const tod = isToday(d)}
      {@const col = colOf(d)}
      <button
        onclick={() => selectDay(d)}
        class="text-center text-[0.75em] py-1 rounded-lg font-medium transition-all hover:scale-110 active:scale-95"
        style="
          color: {sel ? '#fff' : col===0 ? '#ef4444' : col===6 ? '#3b82f6' : textMain};
          background-color: {sel ? '#f59e0b' : tod ? (appState.isDarkMode ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.1)') : 'transparent'};
          font-weight: {sel || tod ? 'bold' : 'normal'};
          outline: {tod && !sel ? '1.5px solid rgba(245,158,11,0.6)' : 'none'};
          outline-offset: -1px;
          box-shadow: {sel ? '0 2px 6px rgba(245,158,11,0.4)' : 'none'};
        "
      >{d}</button>
    {/each}

    {#each nextFill() as d}
      <div class="text-center text-[0.7em] py-1 rounded-lg" style="color:{textFade};">{d}</div>
    {/each}
  </div>

  <!-- 날짜 지우기 -->
  {#if value}
    <div class="border-t px-2 pb-2 pt-1" style="border-color:{border};">
      <button
        onclick={clearDate}
        class="w-full text-[0.72em] font-bold flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
        style="color:#ef4444; background-color:{appState.isDarkMode ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.07)'};"
      >
        <X size={10} strokeWidth={3} />
        날짜 지우기
      </button>
    </div>
  {/if}
</div>
