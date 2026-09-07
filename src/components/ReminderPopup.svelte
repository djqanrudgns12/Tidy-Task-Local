<script>
  import { onMount, onDestroy } from "svelte";
  import { slide } from "svelte/transition";
  import {
    Bell,
    X,
    Clock,
    BellOff,
    CalendarCheck,
    Eye,
    Check,
    Timer,
  } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listen, emit } from "@tauri-apps/api/event";

  let isDarkMode = $state(false);
  let uiFontFamily = $state('"Gulim", sans-serif');
  let uiFontSize = $state(10);
  let themeColor = $state("amber");
  let letterSpacing = $state(0);
  let opacity = $state(1.0);
  let reminderTitle = $state("통합 리마인더");
  let todos = $state([]);
  let globalMuteSound = $state(false);

  // ✨ 사용자 지정 시간 관련 상태
  let showCustomTimeInput = $state(false);
  let customHours = $state(0);
  let customMinutes = $state(30);

  let unlistenUpdate;

  function _playNotificationSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("사운드 재생 실패:", e);
    }
  }

  onMount(async () => {
    unlistenUpdate = await listen("reminder-update", (event) => {
      const payload = event.payload;
      isDarkMode = payload.isDarkMode;
      uiFontFamily = payload.uiFontFamily;
      uiFontSize = payload.uiFontSize;
      themeColor = payload.themeColor;
      letterSpacing = payload.letterSpacing || 0;
      opacity = payload.opacity ?? 1.0;
      reminderTitle = payload.reminderTitle || "통합 리마인더";
      todos = payload.todos;
      globalMuteSound = payload.globalMuteSound ?? false;

      if (todos.length === 0) getCurrentWindow().close();

      if (payload.playSound && !globalMuteSound) _playNotificationSound();
    });

    await emit("reminder-ready");

    const win = getCurrentWindow();
    await win.show();
  });

  onDestroy(() => {
    if (unlistenUpdate) unlistenUpdate();
  });

  async function dismiss(mode, payload = null) {
    if (mode) {
      await emit("dismiss-reminder", { mode, ...payload });
    }
    await getCurrentWindow().close();
  }

  async function archiveItem(id, sourceLabel) {
    todos = todos.filter((t) => t.id !== id);
    await emit("archive-reminder-item", { id, sourceLabel });
    if (todos.length === 0) await getCurrentWindow().close();
  }

  function handleOpacityChange() {
    emit("update-reminder-opacity", { opacity });
  }

  function handleTitleChange(e) {
    reminderTitle = e.target.innerText;
    emit("update-reminder-title", { title: reminderTitle });
  }
  const themeColorMap = {
    white: { bg: "#ffffff", section: "#f4f5f7", border: "#e5e7eb" },
    amber: { bg: "#fdfaf3", section: "#f4ebce", border: "#e8ddb7" },
    blue: { bg: "#f0f7ff", section: "#dceefb", border: "#c4e1f6" },
    green: { bg: "#f2fbf5", section: "#e0f5e7", border: "#c7ecd5" },
    rose: { bg: "#fff7f8", section: "#fae3e7", border: "#f2c9d1" },
    purple: { bg: "#f9f7ff", section: "#ede7fa", border: "#ddd3f5" },
    slate: { bg: "#f8fafc", section: "#eef2f6", border: "#dce3ea" },
  };

  // ✨ 테마별 accent color를 반환하는 헬퍼 (Tidy Task의 appState.getThemeAccentColor()와 동일 로직)
  // 왜: ReminderPopup은 appState에 접근하지 못하므로, themeColor 값에서 직접 계산합니다.
  function getAccentColor() {
    const accentMap = {
      white: '#6b7280', amber: '#d97706', blue: '#2563eb',
      green: '#16a34a', rose: '#e11d48', purple: '#7c3aed', slate: '#475569'
    };
    return accentMap[themeColor] || '#d97706';
  }

  // ✨ 통합 리마인더 기한 뱃지 색상 로직
  function getBadgeColors(diffDays) {
    if (diffDays === null || diffDays === Infinity) {
      // ⚪ 진행 중 (기한 없음)
      return {
        bg: isDarkMode ? "#334155" : "#f1f5f9",
        text: isDarkMode ? "#cbd5e1" : "#64748b",
        border: isDarkMode ? "#475569" : "#e2e8f0",
      };
    } else if (diffDays < 0) {
      // 🟣 지연됨 (보라색)
      return {
        bg: isDarkMode ? "rgba(147,51,234,0.18)" : "#f3e8ff",
        text: isDarkMode ? "#c084fc" : "#9333ea",
        border: isDarkMode ? "rgba(147,51,234,0.3)" : "#d8b4fe",
      };
    } else if (diffDays === 0) {
      // 🔴 오늘 마감 (빨강색)
      return {
        bg: isDarkMode ? "rgba(239,68,68,0.18)" : "#fee2e2",
        text: isDarkMode ? "#fca5a5" : "#ef4444",
        border: isDarkMode ? "rgba(239,68,68,0.3)" : "#fca5a5",
      };
    } else {
      // 🟠 마감 D-X (주황색)
      return {
        bg: isDarkMode ? "rgba(234,88,12,0.18)" : "#ffedd5",
        text: isDarkMode ? "#fb923c" : "#ea580c",
        border: isDarkMode ? "rgba(234,88,12,0.3)" : "#fb923c",
      };
    }
  }
</script>

<div
  class="w-screen h-screen rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] border flex flex-col overflow-hidden select-none transition-opacity duration-200"
  style="
    background-color: {isDarkMode
    ? '#1e2028'
    : themeColorMap[themeColor]?.bg || '#ffffff'};
    border-color: {isDarkMode
    ? 'rgba(255,255,255,0.1)'
    : themeColorMap[themeColor]?.border || 'rgba(0,0,0,0.08)'};
    font-family: {uiFontFamily};
    font-size: {uiFontSize}pt;
    letter-spacing: {letterSpacing}em;
    opacity: {opacity};
  "
>
  <div
    data-tauri-drag-region
    class="px-3 py-2.5 flex items-center justify-between cursor-move border-b transition-colors"
    style="border-color: {isDarkMode
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(0,0,0,0.03)'}; background-color: {isDarkMode
      ? 'rgba(0,0,0,0.2)'
      : themeColorMap[themeColor]?.section || '#fef3c7'};"
  >
    <div class="flex items-center gap-2 overflow-hidden pointer-events-none">
      <div
        class="p-1 rounded-lg"
        style="background-color: {isDarkMode
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(255,255,255,0.5)'}; color: {isDarkMode
          ? '#fde047'
          : '#d97706'}"
      >
        <Bell size={12} strokeWidth={3} />
      </div>
      <span
        class="text-[0.9em] font-extrabold truncate"
        style="color: {isDarkMode ? '#e2e8f0' : '#374151'};"
        >{reminderTitle}</span
      >
    </div>

    <div class="flex items-center gap-2 pointer-events-auto" style="--slider-thumb-color: {getAccentColor()};">
      <div class="flex items-center gap-1 group/op" title="투명도 조절">
        <Eye
          size={10}
          class="text-gray-400 opacity-0 group-hover/op:opacity-100 transition-opacity"
        />
        <input
          type="range"
          min="0.3"
          max="1.0"
          step="0.05"
          bind:value={opacity}
          oninput={handleOpacityChange}
          class="w-12 h-1.5 appearance-none rounded-full bg-black/15 cursor-pointer custom-slider"
        />
      </div>
      <button
        onclick={() => dismiss(null)}
        class="text-gray-400 hover:text-red-500 transition-colors p-0.5"
        title="닫기"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  </div>

  <div class="p-3 flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
    {#each todos as todo}
      {@const colors = getBadgeColors(todo.diffDays)}
      <div
        class="group flex flex-col gap-1.5 p-2.5 rounded-xl border transition-all"
        style="
          background-color: {isDarkMode
          ? 'rgba(255,255,255,0.02)'
          : 'rgba(0,0,0,0.01)'};
          border-color: {isDarkMode
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(0,0,0,0.05)'};
        "
      >
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <span
              class="font-black text-[0.8em] px-2 py-0.5 rounded-full border shadow-sm tracking-tight shrink-0"
              style="
                    background-color: {colors.bg}; 
                    color: {colors.text};
                    border-color: {colors.border};
                  "
            >
              {todo.diffDays === null || todo.diffDays === Infinity
                ? "진행 중"
                : todo.diffDays < 0
                  ? `지연 D+${Math.abs(todo.diffDays)}`
                  : todo.diffDays === 0
                    ? "오늘까지"
                    : `마감 D-${todo.diffDays}`}
            </span>
            <!-- ✨ Phase 2: 출처(sourceTitle) 뱃지를 텍스트 데이터 훼손 없이 독립 UI로 표기 -->
            <span
              class="font-black text-[0.7em] px-1.5 py-0.5 rounded-md border tracking-tight opacity-75 shrink-0 max-w-[120px] truncate"
              style="color: {isDarkMode
                ? '#cbd5e1'
                : '#475569'}; border-color: {isDarkMode
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(0,0,0,0.1)'}; background: {isDarkMode
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(0,0,0,0.03)'};"
              title="출처: {todo.sourceTitle || '제목 없음'}"
            >
              📝 {todo.sourceTitle || "제목 없음"}
            </span>
            <button
              onclick={() => archiveItem(todo.id, todo.sourceLabel)}
              class="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1 rounded hover:bg-black/10 active:scale-95 ml-auto"
              style="color: {isDarkMode ? '#10b981' : '#059669'};"
              title="마감 (항목 완료)"
            >
              <Check size={14} strokeWidth={3} />
            </button>
          </div>
        </div>
        <span
          class="text-[0.95em] leading-snug font-medium"
          style="color: {isDarkMode ? '#cbd5e1' : '#475569'}"
        >
          {todo.text
            .replace(/<[^>]*>?/gm, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&[a-zA-Z]+;/g, "")
            .trim()}
        </span>
      </div>
    {/each}
  </div>

  <!-- ✨ 하단 액션 버튼 영역 (세련되고 귀여운 카드형 디자인) -->
  <div
    class="px-3 pb-3 pt-2 flex flex-col gap-2 mt-auto"
    style="background-color: {isDarkMode
      ? 'rgba(0,0,0,0.15)'
      : 'rgba(0,0,0,0.02)'}; border-top: 1px solid {isDarkMode
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(0,0,0,0.03)'};"
  >
    {#if showCustomTimeInput}
      <!-- 커스텀 시간 지정 영역 (직접 입력형) -->
      <div transition:slide={{ duration: 250 }} class="overflow-hidden">
        <div
          class="flex items-center justify-between p-2.5 rounded-2xl border shadow-sm backdrop-blur-sm"
          style="background-color: {isDarkMode
            ? 'rgba(255,255,255,0.05)'
            : 'rgba(255,255,255,0.8)'}; border-color: {isDarkMode
            ? 'rgba(255,255,255,0.1)'
            : 'rgba(0,0,0,0.05)'};"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border shadow-inner focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 transition-all"
              style="background-color: {isDarkMode
                ? 'rgba(0,0,0,0.2)'
                : '#f8fafc'}; border-color: {isDarkMode
                ? 'rgba(255,255,255,0.08)'
                : '#e2e8f0'};"
            >
              <input
                type="number"
                min="0"
                max="99"
                bind:value={customHours}
                class="w-8 bg-transparent text-center outline-none text-[1em] font-bold hide-spinners"
                style="color: {isDarkMode ? '#fde68a' : '#d97706'}"
                placeholder="0"
              />
              <span
                class="text-[0.75em] font-black"
                style="color: {isDarkMode ? '#94a3b8' : '#64748b'}">시간</span
              >
            </div>
            <div
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border shadow-inner focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 transition-all"
              style="background-color: {isDarkMode
                ? 'rgba(0,0,0,0.2)'
                : '#f8fafc'}; border-color: {isDarkMode
                ? 'rgba(255,255,255,0.08)'
                : '#e2e8f0'};"
            >
              <input
                type="number"
                min="0"
                max="59"
                bind:value={customMinutes}
                class="w-8 bg-transparent text-center outline-none text-[1em] font-bold hide-spinners"
                style="color: {isDarkMode ? '#fde68a' : '#d97706'}"
                placeholder="30"
              />
              <span
                class="text-[0.75em] font-black"
                style="color: {isDarkMode ? '#94a3b8' : '#64748b'}">분</span
              >
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() =>
                dismiss("custom", {
                  hours: customHours || 0,
                  minutes: customMinutes || 0,
                })}
              class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[0.8em] font-bold hover:from-amber-500 hover:to-amber-600 active:scale-95 shadow-md shadow-amber-500/20 transition-all flex items-center gap-1"
            >
              <Check size={14} strokeWidth={3} /> 지정
            </button>
            <button
              onclick={() => (showCustomTimeInput = false)}
              class="p-1.5 rounded-xl hover:bg-black/5 active:scale-95 transition-all text-gray-400 hover:text-gray-600"
              style="hover:background-color: {isDarkMode
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(0,0,0,0.05)'}"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- 3단 액션 버튼 -->
    <div class="grid grid-cols-3 gap-2">
      <button
        onclick={() => dismiss("today")}
        class="flex flex-col items-center justify-center py-2.5 gap-1.5 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 group relative overflow-hidden"
        style="background-color: {isDarkMode
          ? 'rgba(255,255,255,0.04)'
          : '#ffffff'}; border-color: {isDarkMode
          ? 'rgba(255,255,255,0.08)'
          : 'rgba(0,0,0,0.04)'};"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-amber-400/0 to-amber-400/0 group-hover:from-amber-400/10 group-hover:to-transparent transition-all"
        ></div>
        <CalendarCheck
          size={18}
          strokeWidth={2.5}
          class="text-amber-500 group-hover:scale-110 transition-transform relative z-10"
        />
        <span
          class="text-[0.75em] font-bold relative z-10"
          style="color: {isDarkMode ? '#cbd5e1' : '#4b5563'}">오늘 끄기</span
        >
      </button>

      <button
        onclick={() => dismiss("1hour")}
        class="flex flex-col items-center justify-center py-2.5 gap-1.5 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 group relative overflow-hidden"
        style="background-color: {isDarkMode
          ? 'rgba(255,255,255,0.04)'
          : '#ffffff'}; border-color: {isDarkMode
          ? 'rgba(255,255,255,0.08)'
          : 'rgba(0,0,0,0.04)'};"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-blue-400/0 to-blue-400/0 group-hover:from-blue-400/10 group-hover:to-transparent transition-all"
        ></div>
        <Clock
          size={18}
          strokeWidth={2.5}
          class="text-blue-500 group-hover:scale-110 transition-transform relative z-10"
        />
        <span
          class="text-[0.75em] font-bold relative z-10"
          style="color: {isDarkMode ? '#cbd5e1' : '#4b5563'}">1시간 후</span
        >
      </button>

      <button
        onclick={() => (showCustomTimeInput = !showCustomTimeInput)}
        class="flex flex-col items-center justify-center py-2.5 gap-1.5 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 group relative overflow-hidden"
        style="background-color: {isDarkMode
          ? 'rgba(255,255,255,0.04)'
          : '#ffffff'}; border-color: {showCustomTimeInput
          ? isDarkMode
            ? 'rgba(16,185,129,0.4)'
            : '#10b981'
          : isDarkMode
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.04)'};"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-emerald-400/0 to-emerald-400/0 group-hover:from-emerald-400/10 group-hover:to-transparent transition-all"
        ></div>
        <Timer
          size={18}
          strokeWidth={2.5}
          class="text-emerald-500 group-hover:scale-110 transition-transform relative z-10"
        />
        <span
          class="text-[0.75em] font-bold relative z-10"
          style="color: {isDarkMode ? '#cbd5e1' : '#4b5563'}">시간 지정</span
        >
      </button>
    </div>

    <button
      onclick={() => dismiss("off")}
      class="w-full py-2.5 rounded-2xl flex items-center justify-center gap-1.5 font-bold text-[0.8em] transition-all hover:scale-[1.02] active:scale-95 border group"
      style="background-color: {isDarkMode
        ? 'rgba(239,68,68,0.1)'
        : '#fef2f2'}; border-color: {isDarkMode
        ? 'rgba(239,68,68,0.2)'
        : '#fca5a5'}; color: {isDarkMode ? '#fca5a5' : '#ef4444'};"
    >
      <BellOff
        size={14}
        strokeWidth={2.5}
        class="group-hover:-rotate-12 transition-transform"
      /> 리마인더 완전 끄기
    </button>
  </div>
</div>

<style>
  :global(body) {
    background: transparent !important;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  input[type=range].custom-slider {
    -webkit-appearance: none;
    appearance: none;
    outline: none;
  }
  input[type=range].custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--slider-thumb-color, #9ca3af);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    cursor: pointer;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 10px;
  }

  /* 숫자 입력 스피너 숨기기 */
  .hide-spinners::-webkit-outer-spin-button,
  .hide-spinners::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .hide-spinners {
    -moz-appearance: textfield;
  }
</style>
