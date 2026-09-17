<script>
  import { Pin, Undo2, Redo2, X, Minus, StickyNote, CopyPlus, CircleHelp, Settings } from "lucide-svelte";
  import "../lib/header.css";

  import HeaderActions from './HeaderActions.svelte';
  import { handleSettings } from '../lib/headerWindows.js';
  import { emitTo } from '@tauri-apps/api/event';
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { dragRegion } from "../lib/dragRegion.js";

  import { onMount } from "svelte";
  import { appState } from "../lib/appState.svelte.js";




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
        appState.rememberWindowPosition(await appWindow.outerPosition(), factor);
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
      // 물리 좌표와 논리 좌표를 함께 기억합니다 (배율이 다른 모니터에서도 정확히 복원).
      appState.rememberWindowPosition(await win.outerPosition(), factor);
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

</script>

<div class="tidy-header-surface titlebar" class:header-dark={appState.isDarkMode} class:classic={appState.headerDesign !== 'modern'}
  style="--header-accent: {appState.getThemeAccentColor()};"
  use:dragRegion={{ onDoubleClick: handleFullscreen }} role="presentation">
  {#if appState.headerDesign !== 'modern'}<div class="classic-create"><button class="tidy-header-button window-button pin-button" onclick={handlePin} aria-pressed={appState.isPinned} aria-label="항상 위" title={appState.isPinned ? '항상 위 해제' : '항상 위'}><Pin size={14} class={appState.isPinned ? 'fill-current' : ''} /></button>
      <button class="tidy-header-button window-button create-icon" title="새 Tiny Note 띄우기" aria-label="새 Tiny Note 띄우기" onclick={() => appState.spawnTinyNote()}><StickyNote size={12}/></button>
      <button class="tidy-header-button window-button create-icon" title="새 노트 창 띄우기" aria-label="새 노트 창 띄우기" onclick={() => appState.spawnNewWindow()}><CopyPlus size={12}/></button>
      <HeaderActions kind="reset"/>
      <button class="tidy-header-button window-button" title="기능 설명" aria-label="기능 설명" onclick={() => emitTo(getCurrentWindow().label, 'ctx-action', 'open-help')}><CircleHelp size={12}/></button>
  </div>{/if}

  <div class="brand-group">    {#if appState.headerDesign === 'modern'}<button class="tidy-header-button window-button pin-button" onclick={handlePin} aria-pressed={appState.isPinned} aria-label="항상 위" title={appState.isPinned ? '항상 위 해제' : '항상 위'}><Pin size={14} class={appState.isPinned ? 'fill-current' : ''} /></button>{/if}<span class="brand">Tidy Task</span></div>
  <div class="window-actions">
   <div class="history-actions">
      <button class="tidy-header-button window-button" disabled={!appState.canUndo} onclick={() => appState.undo()} aria-label="실행 취소" title="실행 취소"><Undo2 size={13} /></button>
      <button class="tidy-header-button window-button" disabled={!appState.canRedo} onclick={() => appState.redo()} aria-label="다시 실행" title="다시 실행"><Redo2 size={15} /></button>
    </div>

    {#if appState.headerDesign !== 'modern'}<button class="tidy-header-button window-button" title="설정" aria-label="설정" onclick={handleSettings}><Settings size={12}/></button>{/if}
    <button class="tidy-header-button window-button" onclick={handleMinimize} aria-label="창 숨기기" title="창 숨기기"><Minus size={14} /></button>
    <button class="tidy-header-button window-button close-button" onclick={handleClose} aria-label="닫기" title="닫기"><X size={16} /></button>
  </div>
</div>
<style>
  .classic-create { display:flex; align-items:center; gap:1px; }
  .brand-group { display:flex; align-items:center; gap:4px; flex-shrink:0; }
  .classic .window-button { width:18px; min-height:22px; border-radius:4px; }
  .classic .window-actions { gap:1px; }
  .classic .history-actions { border:0; margin:0; padding:0; }
  .classic .brand { font-size:12px; }
  .classic .brand-group { gap:2px; }
  .create-icon { color:var(--header-accent); }
  @media(max-width:249px) { .titlebar.classic { flex-wrap:wrap; } .classic .brand-group { order:-1; width:100%; } .classic .window-actions { margin-left:auto; } }

  .titlebar { display:flex; align-items:center; justify-content:space-between; gap:6px; min-height:29px; padding:2px 8px 2px 10px; user-select:none; cursor:move; background:transparent; flex-shrink:0; }
  .brand { font-size:13px; font-weight:600; letter-spacing:-.35px; white-space:nowrap; }
  .window-actions,.history-actions { display:flex; align-items:center; }
  .history-actions { margin-right:4px; padding-right:4px; border-right:1px solid var(--header-line); }
  .window-button { width:25px; min-height:25px; padding:0; border-radius:7px; color:var(--header-muted); }
  .pin-button[aria-pressed="true"] { color:var(--header-accent); }
  .close-button:hover { color:#fff; background:#b43e3e !important; }
  @media(max-width:279px) { .titlebar { padding-inline:8px; gap:2px; } .window-button { width:26px; } .history-actions { padding-right:3px; margin-right:3px; } .brand { font-size:13px; } }
  @media(max-width:259px) { .titlebar { flex-wrap:wrap; } .brand { flex:1; } .window-actions { margin-left:auto; } }
</style>
