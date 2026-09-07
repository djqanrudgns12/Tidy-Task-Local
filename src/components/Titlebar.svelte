<script>
  import {
    Pin,
    Undo2,
    Redo2,
    Settings,
    X,
    Minus,
    Trash2,
    CopyPlus,
    CircleHelp,
    StickyNote,
    Archive
  } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { dragRegion } from "../lib/dragRegion.js";
  import { invoke } from "@tauri-apps/api/core";
  import { emit, emitTo, listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { appState } from "../lib/appState.svelte.js";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

  let { onOpenSettings = () => {} } = $props();
  let showResetModal = $state(false);

  onMount(async () => {
    if (appState.isPinned) {
      const appWindow = getCurrentWindow();
      await appWindow.setAlwaysOnTop(true);
    }
  });

  async function handlePin() {
    appState.isPinned = !appState.isPinned;
    const appWindow = getCurrentWindow();
    await appWindow.setAlwaysOnTop(appState.isPinned);
    appState.save();
  }

  // 전환이 진행 중인지 표시하는 잠금.
  // 왜: 더블클릭 연타나 버튼 중복 클릭으로 전환이 겹치면 창이 커졌다 작아졌다 합니다.
  let isTogglingFullscreen = false;

  async function handleFullscreen() {
    if (isTogglingFullscreen) return;
    isTogglingFullscreen = true;
    try {
      await runFullscreenToggle();
    } finally {
      // 창 전환이 끝난 뒤 잠금 해제 (연타 방어)
      setTimeout(() => { isTogglingFullscreen = false; }, 200);
    }
  }

  async function runFullscreenToggle() {
    const appWindow = getCurrentWindow();
    // 화면에 실제로 적용된 네이티브 상태를 유일한 진실로 삼습니다.
    const currentlyFullscreen = await appWindow.isFullscreen();

    if (!currentlyFullscreen) {
      // ✨ [TCREI: Persistence] 전체화면 진입 전: 현재 크기/위치를 확실히 보존합니다.
      // 왜: 전체화면 상태에서 앱을 닫으면 모니터 해상도가 windowWidth/Height로 저장되는 것을 방지하고,
      //     재시작 후 전체화면 해제 시 OS가 "이전 크기"를 기억하지 못하는 문제를 원천 차단합니다.
      try {
        const factor = await appWindow.scaleFactor();
        const size = await appWindow.innerSize();
        const logicalSize = size.toLogical(factor);
        appState.windowWidth = logicalSize.width;
        appState.windowHeight = logicalSize.height;
        // setPosition() 과 기준을 맞추기 위해 outerPosition() 을 사용합니다.
        // (안쪽 좌표로 저장하면 전체화면 왕복마다 창이 테두리 두께만큼 밀립니다.)
        const pos = await appWindow.outerPosition();
        const logicalPos = pos.toLogical(factor);
        appState.windowPosX = logicalPos.x;
        appState.windowPosY = logicalPos.y;
      } catch(e) {}
    }

    // 최대화된 창은 Windows가 setSize/전체화면 해제 후 크기 복원을 무시합니다.
    // 전환 전에 최대화 잔재를 먼저 제거해야 "커진 채로 남는" 증상이 없습니다.
    try {
      if (await appWindow.isMaximized()) await appWindow.unmaximize();
    } catch (_) {}

    await appWindow.setFullscreen(!currentlyFullscreen);
    appState.isFullscreen = !currentlyFullscreen;
    appState.saveNow(false);
  }



  async function handleSettings() {
    const currentWin = getCurrentWindow();
    const existingWin = await WebviewWindow.getByLabel('settings');

    // ✨ [핵심 1] 내 창의 현재 설정 상태를 찰칵! 찍어서 보낼 준비를 합니다.
    const payload = {
      targetLabel: currentWin.label,
      settings: appState.takeSnapshot()
    };

    if (existingWin) {
      try {
        await existingWin.show();
        await existingWin.unminimize();
        await existingWin.setFocus();
        
        // ✨ 이미 열려있을 땐 혹시 모르니 아주 살짝(0.05초) 기다렸다가 쏴줍니다.
        setTimeout(() => {
          emitTo('settings', 'set-settings-target', payload);
        }, 50);
      } catch(e) {
        console.error("기존 창 표시 실패:", e);
      }
    } else {
      // ✨ [핵심 2] 설정창이 "나 준비됐어!(settings-ready)"라고 외치면 그때 데이터를 쏴줍니다.
      const unlisten = await listen('settings-ready', async () => {
        await emitTo('settings', 'set-settings-target', payload);
        unlisten(); // 한 번 쏘고 나면 수신기 끄기
      });

      const settingsWindow = new WebviewWindow('settings', {
        url: 'index.html', 
        title: '시스템 설정',
        width: 320,
        height: 500,
        resizable: false,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        visible: true
      });
    }
  }

 async function handleMinimize() {
    await getCurrentWindow().minimize();
  }

 async function handleClose() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    try {
      const win = getCurrentWindow();
      // ✨ [TCREI: Integrity] win.innerPosition()은 Physical 좌표를 반환합니다.
      // 왜 toLogical 변환이 필요한가: DPI 스케일링(125%, 150%) 환경에서
      // Physical 값을 그대로 저장하면 복원 시 위치가 스케일 배수만큼 어긋납니다.
      const factor = await win.scaleFactor();
      const pos = await win.outerPosition();
      const logicalPos = pos.toLogical(factor);
      if (typeof logicalPos.x === 'number') {
        appState.windowPosX = Math.round(logicalPos.x);
        appState.windowPosY = Math.round(logicalPos.y);
      }
      // ✨ [버그 #3 수정] 크기도 함께 저장하여 onCloseRequested와의 경합 조건을 제거합니다.
      // 왜: 이전에는 위치만 저장하고 크기는 누락하여, 닫기 직전 saveNow()가
      //     windowWidth: null 상태로 디스크에 기록될 위험이 있었습니다.
      const size = await win.innerSize();
      const logicalSize = size.toLogical(factor);
      if (typeof logicalSize.width === 'number' && logicalSize.width > 0) {
        appState.windowWidth = Math.round(logicalSize.width);
        appState.windowHeight = Math.round(logicalSize.height);
      }
      await appState.saveNow(false); 
    } catch (e) {}
    
    // ✨ [해결 4] 앱 전체 종료가 아닌 "내 창만 조용히 닫기"로 변경 (독립성 확보)
    await getCurrentWindow().close();
  }

  // ✨ [버그 수정] 원본에서 빠져있던 초기화 확인 함수 추가
  async function confirmReset() {
    await appState.resetContent();
    showResetModal = false;
  }
</script>

{#if showResetModal}
  <div
    class="absolute inset-0 z-[9999] flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.45); backdrop-filter: blur(6px);"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="rounded-2xl shadow-2xl flex flex-col items-center gap-4 px-6 py-5 mx-4 max-w-[260px] w-full border"
      style="background-color: {appState.isDarkMode ? '#1e2028' : 'rgba(255,255,255,0.97)'}; border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};"
    >
      <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
        <Trash2 size={20} class="text-red-500" />
      </div>
      <div class="text-center">
        <p class="font-bold text-[13px] mb-1" style="color: {appState.isDarkMode ? '#e2e8f0' : '#1f2937'};">
          모든 내용을 초기화할까요?
        </p>
        <p class="text-[11px]" style="color: {appState.isDarkMode ? '#9ca3af' : '#6b7280'};">
          책임 안 집니다.
        </p>
      </div>
      <div class="flex w-full gap-2">
        <button
          onclick={() => showResetModal = false}
          class="flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
          style="background-color: {appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}; color: {appState.isDarkMode ? '#d1d5db' : '#374151'};"
        >아니오</button>
        <button
          onclick={confirmReset}
          class="flex-1 py-1.5 rounded-lg text-[12px] font-bold bg-red-500 hover:bg-red-600 active:scale-95 text-white transition-all"
        >예, 초기화</button>
      </div>
    </div>
  </div>
{/if}

<!-- 타이틀바: 드래그 + 더블클릭 전체화면.
     data-tauri-drag-region 을 쓰지 않는 이유는 dragRegion 액션 주석 참고
     (네이티브 자동 최대화가 우리 전체화면 전환과 충돌했습니다). -->
<div
  class="flex items-center justify-between px-3 py-2 select-none group w-full cursor-move"
  style="color: {appState.isDarkMode ? '#d1d5db' : '#374151'};"
  use:dragRegion={{ onDoubleClick: handleFullscreen }}
  role="presentation"
>
  <div class="flex items-center gap-1 pointer-events-none">
    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md transition-colors {appState.isPinned ? '' : 'text-gray-400 hover:bg-black/5'}"
      style={appState.isPinned ? `color: ${appState.getThemeAccentColor()};` : null}
      onclick={(e) => { e.stopPropagation(); handlePin(); }}
      title="항상 위"
    >
      <Pin size={13} strokeWidth={2.5} class={appState.isPinned ? "fill-current" : ""} />
    </button>

    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md hover:bg-black/5 active:scale-95 transition-all"
      style="color: {appState.getThemeAccentColor()};"
      title="새 Tiny Note 띄우기"
      onclick={(e) => { e.stopPropagation(); appState.spawnTinyNote(); }}
    >
      <StickyNote size={13} strokeWidth={2.5} />
    </button>
    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md hover:bg-black/5 active:scale-95 transition-all"
      style="color: {appState.getThemeAccentColor()};"
      title="새 노트 창 띄우기"
      onclick={(e) => { e.stopPropagation(); appState.spawnNewWindow(); }}
    >
      <CopyPlus size={13} strokeWidth={2.5} />
    </button>

    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
      title="모든 내용 초기화"
      onclick={(e) => { e.stopPropagation(); showResetModal = true; }}
    >
      <Trash2 size={13} strokeWidth={2} />
    </button>
    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md text-gray-400 hover:text-amber-600 hover:bg-black/5 transition-all"
      title="기능 설명"
      onclick={(e) => { e.stopPropagation(); emitTo(getCurrentWindow().label, 'ctx-action', 'open-help'); }}
    >
      <CircleHelp size={13} strokeWidth={2} />
    </button>
  </div>

  <div class="flex flex-col items-center justify-center pointer-events-none mt-1">
    <span class="text-[13px] font-bold tracking-wide select-none pointer-events-none" style="color: {appState.isDarkMode ? '#e2e8f0' : '#6b7280'};">Tidy Task</span>
  </div>

  <div class="flex items-center gap-1.5 pointer-events-none">

    <button
      class="pointer-events-auto p-1 rounded-md transition-colors {appState.canUndo ? 'cursor-pointer text-gray-500 hover:text-gray-800 hover:bg-black/5' : 'text-gray-300 opacity-40 cursor-not-allowed'}"
      disabled={!appState.canUndo}
      onclick={(e) => { e.stopPropagation(); appState.undo(); }}
      title="실행 취소"
    >
      <Undo2 size={13} strokeWidth={2.5} />
    </button>

    <button
      class="pointer-events-auto p-1 rounded-md transition-colors {appState.canRedo ? 'cursor-pointer text-gray-500 hover:text-gray-800 hover:bg-black/5' : 'text-gray-300 opacity-40 cursor-not-allowed'}"
      disabled={!appState.canRedo}
      onclick={(e) => { e.stopPropagation(); appState.redo(); }}
      title="다시 실행"
    >
      <Redo2 size={13} strokeWidth={2.5} />
    </button>

    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
      title="설정"
      onclick={(e) => { e.stopPropagation(); handleSettings(); }}
    >
      <Settings size={13} strokeWidth={2.5} />
    </button>

    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
      title="창 숨기기"
      onclick={(e) => { e.stopPropagation(); handleMinimize(); }}
    >
      <Minus size={13} strokeWidth={2.5} />
    </button>

    <button
      class="cursor-pointer pointer-events-auto p-1 rounded-md text-gray-400 hover:text-white hover:bg-red-500 transition-all duration-150"
      title="닫기"
      onclick={(e) => { e.stopPropagation(); handleClose(); }}
    >
      <X size={13} strokeWidth={2.5} />
    </button>
  </div>
</div>