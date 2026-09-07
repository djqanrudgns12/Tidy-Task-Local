<script>
  import { onMount, onDestroy } from "svelte";
  import { slide } from "svelte/transition";
  import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
  import { LogicalSize, LogicalPosition, PhysicalPosition } from "@tauri-apps/api/dpi";
  import { Pin, Palette, ChevronUp, ChevronDown, Trash2, X, Minus, Archive, Maximize2, Minimize2 } from "lucide-svelte";
  import { appState } from "../lib/appState.svelte.js";
  import NoteEditor from "./NoteEditor.svelte";
  import FloatingRTE from "./FloatingRTE.svelte";
  import { archiveState } from "../lib/archiveStore.svelte.js";
  import {
    TINY_NOTE_MIN_HEIGHT,
    TINY_NOTE_MIN_WIDTH,
    TINY_NOTE_ROLLED_HEIGHT,
    resolveTinyNoteExpandedHeight,
    resolveTinyNoteWidth,
    shouldPersistTinyNoteBounds,
  } from "../lib/tinyNoteWindow.js";

  // ✨ 안전한 윈도우 캡처용 지연 할당 변수 (초기화 오류 방지)
  let appWindow = null;

  let unlistenMove = null;
  let unlistenResize = null;
  let resizeSaveTimeout = null;
  let snapLock = false;
  let isProcessing = false;
  
  let showCreationMessage = $state(true);
  let showArchiveMessage = $state(false);

  const stickerThemeMap = {
    white: { light: "#f8fafc", dark: "#1e293b", tapeLight: "rgba(0,0,0,0.04)", tapeDark: "rgba(255,255,255,0.06)" },
    amber: { light: "#fef3c7", dark: "#78350f", tapeLight: "rgba(0,0,0,0.06)", tapeDark: "rgba(255,255,255,0.08)" },
    blue:  { light: "#dbeafe", dark: "#1e3a8a", tapeLight: "rgba(0,0,0,0.05)", tapeDark: "rgba(255,255,255,0.08)" },
    green: { light: "#dcfce7", dark: "#14532d", tapeLight: "rgba(0,0,0,0.06)", tapeDark: "rgba(255,255,255,0.08)" },
    rose:  { light: "#ffe4e6", dark: "#881337", tapeLight: "rgba(0,0,0,0.05)", tapeDark: "rgba(255,255,255,0.08)" },
    purple:{ light: "#f3e8ff", dark: "#4c1d95", tapeLight: "rgba(0,0,0,0.05)", tapeDark: "rgba(255,255,255,0.08)" },
    slate: { light: "#f1f5f9", dark: "#334155", tapeLight: "rgba(0,0,0,0.05)", tapeDark: "rgba(255,255,255,0.08)" }
  };
  
  let currentTheme = $derived(stickerThemeMap[appState.themeColor] || stickerThemeMap['amber']);
  let bgColor = $derived(appState.isDarkMode ? currentTheme.dark : currentTheme.light);
  let tapeColor = $derived(appState.isDarkMode ? currentTheme.tapeDark : currentTheme.tapeLight);

  let headerGradient = $derived(appState.isDarkMode ? 'linear-gradient(to bottom, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)' : 'linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)');
  let headerShadow = $derived(appState.isDarkMode ? '0 2px 4px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)');
  let headerBorderTop = $derived(appState.isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.6)');

  function isValidPosition(value) {
    return Number.isFinite(value) && value > -10000 && value < 20000;
  }

  async function setExpandedConstraints() {
    await appWindow.setResizable(true);
    await appWindow.setMaxSize(null);
    await appWindow.setMinSize(new LogicalSize(TINY_NOTE_MIN_WIDTH, TINY_NOTE_MIN_HEIGHT));
  }

  async function rememberNormalBounds() {
    const factor = await appWindow.scaleFactor();
    const size = (await appWindow.innerSize()).toLogical(factor);
    const position = (await appWindow.innerPosition()).toLogical(factor);
    const width = resolveTinyNoteWidth(size.width, appState.windowWidth);
    const height = resolveTinyNoteExpandedHeight(size.height, appState.previousHeight, appState.windowHeight);

    appState.windowWidth = width;
    appState.windowHeight = height;
    appState.previousHeight = height;
    appState.windowPosX = position.x;
    appState.windowPosY = position.y;
  }

  async function restoreExpandedWindow({ restorePosition = false } = {}) {
    const factor = await appWindow.scaleFactor();
    const currentSize = (await appWindow.innerSize()).toLogical(factor);
    const width = resolveTinyNoteWidth(appState.windowWidth, currentSize.width);
    const height = resolveTinyNoteExpandedHeight(
      appState.windowHeight,
      appState.previousHeight,
      currentSize.height,
    );

    await setExpandedConstraints();
    await appWindow.setSize(new LogicalSize(width, height));

    if (restorePosition && isValidPosition(appState.windowPosX) && isValidPosition(appState.windowPosY)) {
      await appWindow.setPosition(
        new LogicalPosition(Math.round(appState.windowPosX), Math.round(appState.windowPosY)),
      );
    }

    appState.windowWidth = width;
    appState.windowHeight = height;
    appState.previousHeight = height;
  }

  async function applyRolledUpWindow() {
    const factor = await appWindow.scaleFactor();
    const currentSize = (await appWindow.innerSize()).toLogical(factor);
    const width = resolveTinyNoteWidth(appState.windowWidth, currentSize.width);

    // 롤업은 높이만 고정합니다. 너비까지 min/max로 잠그면 Windows DPI 변경이나
    // 모니터 이동 시 창 폭이 비정상적으로 클램프될 수 있습니다.
    await appWindow.setResizable(true);
    await appWindow.setMaxSize(null);
    await appWindow.setMinSize(new LogicalSize(TINY_NOTE_MIN_WIDTH, TINY_NOTE_ROLLED_HEIGHT));
    await appWindow.setSize(new LogicalSize(width, TINY_NOTE_ROLLED_HEIGHT));
    await appWindow.setResizable(false);
  }

  onMount(async () => {
    appWindow = getCurrentWindow(); // 런타임에 안전하게 캡처

    setTimeout(() => { showCreationMessage = false; }, 2500);
    
    const win = appWindow;
    await win.setMaximizable(false);

    // ✨ 태어날 때 핀 상태 동기화
    await win.setAlwaysOnTop(appState.isPinned);

    // 구버전의 세로 스냅 상태는 Tiny Note에서 더 이상 사용하지 않습니다.
    // 전체화면과 롤업이 동시에 저장된 비정상 상태에서는 전체화면을 우선합니다.
    const storedFullscreen = appState.isFullscreen;
    const nativeFullscreen = await win.isFullscreen();
    const hadConflictingRollup = (storedFullscreen || nativeFullscreen) && appState.isRolledUp;
    const hadLegacyVerticalSnap = appState.isVerticalSnapped
      || appState.preSnapPosY !== null
      || appState.preSnapHeight !== null;
    appState.isVerticalSnapped = false;
    appState.preSnapPosY = null;
    appState.preSnapHeight = null;

    if (appState.isFullscreen || nativeFullscreen) {
      appState.isFullscreen = true;
      appState.isRolledUp = false;
      await setExpandedConstraints();
      if (!nativeFullscreen) await win.setFullscreen(true);
    } else if (appState.isRolledUp) {
      await applyRolledUpWindow();
    } else {
      await setExpandedConstraints();
    }

    if (hadLegacyVerticalSnap || hadConflictingRollup || nativeFullscreen !== storedFullscreen) {
      await appState.saveNow(false);
    }
    
    // ✨ 자석 스냅 엔진 (150ms Debounce Lock 방어)
    unlistenMove = await win.onMoved(async (event) => {
      if (snapLock || appState.isFullscreen || isProcessing) return;
      snapLock = true;
      setTimeout(() => { snapLock = false; }, 150);

      try {
        const monitor = await currentMonitor();
        if (!monitor) return;

        const factor = await win.scaleFactor();
        const winSize = await win.outerSize();
        const winLogicalSize = winSize.toLogical(factor);
        
        const physicalPos = new PhysicalPosition(event.payload.x, event.payload.y);
        const pos = physicalPos.toLogical(factor);

        const monitorPos = monitor.position.toLogical(factor);
        const monitorSize = monitor.size.toLogical(factor);

        const margin = 20;
        let snapX = pos.x;
        let snapY = pos.y;
        let snapped = false;

        // X축 스냅 판단 (좌/우 가장자리)
        if (Math.abs(pos.x - monitorPos.x) < margin) {
          snapX = monitorPos.x;
          snapped = true;
        } else if (Math.abs((pos.x + winLogicalSize.width) - (monitorPos.x + monitorSize.width)) < margin) {
          snapX = monitorPos.x + monitorSize.width - winLogicalSize.width;
          snapped = true;
        }

        // Y축 스냅 판단 (상/하 가장자리)
        if (Math.abs(pos.y - monitorPos.y) < margin) {
          snapY = monitorPos.y;
          snapped = true;
        } else if (Math.abs((pos.y + winLogicalSize.height) - (monitorPos.y + monitorSize.height)) < margin) {
          snapY = monitorPos.y + monitorSize.height - winLogicalSize.height;
          snapped = true;
        }

        // 범위 안에 들어왔다면 스냅 발동 
        if (snapped) {
          await win.setPosition(new LogicalPosition(snapX, snapY));
        }

        // 바뀐 좌표를 앱 상태에 반영하여 재시작 시 위치 기억
        appState.windowPosX = snapX;
        appState.windowPosY = snapY;
        appState.save();
      } catch (e) {
        console.error("Window snap error:", e);
      }
    });

    // Tiny Note 크기 저장은 이 네이티브 이벤트 한 곳에서만 담당합니다.
    // 전체화면/롤업/전환 중 크기는 정상 창 크기를 덮어쓰지 않습니다.
    unlistenResize = await win.onResized(async (event) => {
      if (!shouldPersistTinyNoteBounds({
        isFullscreen: appState.isFullscreen,
        isRolledUp: appState.isRolledUp,
        isTransitioning: isProcessing,
      })) return;

      try {
        const factor = await win.scaleFactor();
        const logicalSize = event.payload.toLogical(factor);

        appState.windowWidth = resolveTinyNoteWidth(logicalSize.width, appState.windowWidth);
        appState.windowHeight = resolveTinyNoteExpandedHeight(
          logicalSize.height,
          appState.previousHeight,
          appState.windowHeight,
        );
        appState.previousHeight = appState.windowHeight;

        if (resizeSaveTimeout) clearTimeout(resizeSaveTimeout);
        resizeSaveTimeout = setTimeout(() => {
          appState.save();
        }, 300);
      } catch(e) {
        console.warn("Tiny Note resize 저장 오류:", e);
      }
    });

    // 창 모드와 리스너를 먼저 안정화한 뒤 부가 스토어를 준비합니다.
    // 아카이브 버튼도 준비 전 클릭 시 자체적으로 init을 기다리므로 기능 손실은 없습니다.
    if (!archiveState.isReady) {
      archiveState.init().catch((error) => console.warn("Tiny Note 아카이브 초기화 오류:", error));
    }
  });

  onDestroy(() => {
    if (unlistenMove) unlistenMove();
    if (unlistenResize) unlistenResize();
    if (resizeSaveTimeout) clearTimeout(resizeSaveTimeout);
  });

  async function handlePin() {
    appState.isPinned = !appState.isPinned;
    await appWindow.setAlwaysOnTop(appState.isPinned);
    appState.save();
  }

  // ✨ 테마 7+1종 강제 적용 및 다크모드 순환
  function handleThemeCycle() {
    const themes = ['white', 'amber', 'blue', 'green', 'rose', 'purple', 'slate'];
    
    // 다크모드 상태에서 클릭 시 무조건 첫 번째 라이트 모드로 복귀 (사이클 루프 시작)
    if (appState.isDarkMode) {
      appState.themeColor = themes[0];
      appState.isDarkMode = false;
      appState.saveNow();
      return;
    }

    let idx = themes.indexOf(appState.themeColor);
    
    if (idx === -1) {
      // 명단에 없는 이상한 테마일 경우 기본 첫 번째(white)로 강제 복원
      appState.themeColor = themes[0];
      appState.isDarkMode = false;
    } else if (idx === themes.length - 1) {
      // 7번째 색상(slate) 클릭 시: 색상은 유지하고 다크모드만 발동
      appState.isDarkMode = true;
    } else {
      // 일반적인 순서대로 다음 색상으로 변경
      appState.themeColor = themes[idx + 1];
    }
    appState.saveNow();
  }



  // 수동 클릭 간격 계산 대신 Svelte의 dblclick과 Tauri 네이티브 전체화면 API를 사용합니다.
  // data-tauri-drag-region과 조합하면 드래그와 더블클릭이 서로 다른 상태를 건드리지 않습니다.
  async function handleHeaderDoubleClick(e) {
    if (e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!appWindow || isProcessing) return;

    isProcessing = true;
    try {
      const currentlyFullscreen = await appWindow.isFullscreen();

      if (!currentlyFullscreen) {
        if (appState.isRolledUp) {
          // 편집기는 창 높이가 복구된 뒤 마운트되어야 0px 레이아웃으로 고정되지 않습니다.
          await restoreExpandedWindow();
          appState.isRolledUp = false;
        }

        await rememberNormalBounds();
        await setExpandedConstraints();
        appState.isFullscreen = true;
        await appWindow.setFullscreen(true);
      } else {
        // 네이티브 전체화면을 먼저 해제한 뒤 저장된 정상 크기와 위치를 확정 복원합니다.
        await appWindow.setFullscreen(false);
        await restoreExpandedWindow({ restorePosition: true });
        appState.isFullscreen = false;
      }

      await appState.saveNow(false);
    } catch (err) {
      try {
        appState.isFullscreen = await appWindow.isFullscreen();
      } catch (_) {}
      console.warn("Tiny Note 전체화면 전환 오류:", err);
    } finally {
      setTimeout(() => { isProcessing = false; }, 150);
    }
  }

  // 롤업 버튼은 유지하되 창 제약, 크기, Svelte 렌더 순서를 하나의 트랜잭션으로 처리합니다.
  async function handleRollup(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!appWindow || isProcessing || appState.isFullscreen || await appWindow.isFullscreen()) return;
    isProcessing = true;
    const rollingUp = !appState.isRolledUp;

    try {
      if (rollingUp) {
        await rememberNormalBounds();
        appState.isRolledUp = true;
        await applyRolledUpWindow();
      } else {
        // 롤업 상태를 유지한 채 네이티브 창부터 복원해야 에디터가 최종 높이에서 마운트됩니다.
        await restoreExpandedWindow();
        appState.isRolledUp = false;
      }

      await appState.saveNow(false);
    } catch (err) {
      appState.isRolledUp = rollingUp ? false : true;
      try {
        if (appState.isRolledUp) await applyRolledUpWindow();
        else await restoreExpandedWindow();
      } catch (_) {}
      console.warn("Tiny Note 롤업 전환 오류:", err);
    } finally {
      setTimeout(() => {
        isProcessing = false;
      }, 150);
    }
  }

  async function confirmDelete() {
    appState.notes = '';
    appState.saveNow();
  }

  // ✨ TCREI: Integrity + Resilience - 내용물을 아카이브에 안전하게 넘기고 창 닫기
  // 저장 성공을 확인한 후에만 내용을 비워 데이터 유실을 방지합니다.
  async function handleArchive() {
    if (!appWindow) return;
    if (!archiveState.isReady) await archiveState.init();
    
    const cleanText = appState.notes.replace(/<[^>]*>?/gm, '').trim();
    if (!cleanText && !appState.title.trim()) return; // 빈 노트 무시

    // 🚀 [Resilience] 저장 성공 여부를 확인합니다.
    const saved = await archiveState.addNote({
      title: appState.title,
      content: appState.notes,
      themeColor: appState.themeColor,
      isDarkMode: appState.isDarkMode,
      sourceLabel: appState.windowLabel || appWindow.label
    });

    if (!saved) {
      // 저장 실패 시 데이터를 보존하고 사용자에게 알림
      console.error("아카이브 저장 실패: 데이터 보존됨");
      return;
    }

    // ✨ [수정] 성공 시 UI 피드백을 먼저 보여줍니다.
    showCreationMessage = false;
    showArchiveMessage = true;
    
    // ✨ 800ms 동안 애니메이션 대기 (Promise 기반으로 컨텍스트 보존)
    await new Promise(resolve => setTimeout(resolve, 800));

    // 🚀 대기 완료 후 내용 비우기 (유령 청소기 발동)
    appState.notes = '';
    appState.title = '';
    // 🚀 [Phase 2: 결함 D 해결] 반드시 디스크 쓰기 완료를 기다린 후 창 닫기
    // 왜 await가 필수인가:
    //   await 없이 close()를 호출하면, onCloseRequested에서 saveNow()가 또 실행되어
    //   이중 저장 경합(Race Condition)이 발생할 수 있습니다.
    await appState.saveNow();

    await appWindow.close();
  }

  async function handleMinimize() {
    await appWindow.minimize();
  }

  // ✨ 전체화면 토글 버튼 핸들러
  // handleHeaderDoubleClick과 동일한 검증된 로직을 재사용합니다.
  // isProcessing 플래그로 중복 호출을 방지하여 안정성을 보장합니다.
  async function handleFullscreen(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!appWindow || isProcessing) return;

    isProcessing = true;
    try {
      const currentlyFullscreen = await appWindow.isFullscreen();

      if (!currentlyFullscreen) {
        // 롤업 상태라면 먼저 창을 펼친 뒤 전체화면으로 진입합니다.
        if (appState.isRolledUp) {
          await restoreExpandedWindow();
          appState.isRolledUp = false;
        }
        // 현재 정상 크기/위치를 기억해 둡니다 (전체화면 해제 시 복원용).
        await rememberNormalBounds();
        await setExpandedConstraints();
        appState.isFullscreen = true;
        await appWindow.setFullscreen(true);
      } else {
        // 네이티브 전체화면을 해제한 뒤 저장된 크기와 위치로 복원합니다.
        await appWindow.setFullscreen(false);
        await restoreExpandedWindow({ restorePosition: true });
        appState.isFullscreen = false;
      }

      await appState.saveNow(false);
    } catch (err) {
      // 오류 발생 시 실제 네이티브 상태와 동기화합니다.
      try { appState.isFullscreen = await appWindow.isFullscreen(); } catch (_) {}
      console.warn("Tiny Note 전체화면 버튼 전환 오류:", err);
    } finally {
      setTimeout(() => { isProcessing = false; }, 150);
    }
  }

  async function handleClose() {
    await appWindow.close();
  }
</script>

<div
  class="h-screen w-screen flex flex-col group overflow-hidden transition-colors duration-300 relative"
  style="
    background-color: {bgColor};
    color: {appState.isDarkMode ? '#e2e8f0' : '#4b5563'};
  "
>
  <!-- 타이틀바: 네이티브 드래그 영역 + 더블클릭 전체화면 토글 -->
  <div
    class="flex items-center justify-between px-1.5 h-[35px] shrink-0 w-full cursor-move select-none relative z-10"
    style="
      background-color: {tapeColor};
      background-image: {headerGradient};
      border-top: {headerBorderTop};
      box-shadow: {headerShadow};
    "
    data-tauri-drag-region
    ondblclick={handleHeaderDoubleClick}
    role="presentation"
  >
    <!-- ✨ 좌측: 아카이브 아이콘(보관 버튼) + 제목 (항상 보임) -->
    <div class="flex items-center gap-1.5 pointer-events-none">
      <button
        class="cursor-pointer pointer-events-auto flex items-center justify-center p-1 rounded-md hover:bg-black/10 transition-colors ml-0.5 mt-[1px]"
        onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleArchive(); }}
        title="아카이빙하기"
      >
        <Archive size={14} class="text-amber-600" strokeWidth={2.2} />
      </button>
      <input
        type="text"
        bind:value={appState.title}
        oninput={() => appState.save()} maxlength="10"
        class="pointer-events-auto bg-transparent border-none outline-none text-left text-[11px] font-semibold w-[80px]"
        style="color: {appState.isDarkMode ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)'};"
        placeholder="Tiny Note..."
      />
    </div>

    <!-- ✨ 우측: 호버 시 나타나는 도구들 + 닫기 버튼 -->
    <div class="flex items-center gap-0.5 pointer-events-none">
      <div class="flex items-center gap-0 opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-opacity duration-200">
        <button
          class="cursor-pointer pointer-events-auto p-1 rounded-md transition-colors {appState.isPinned ? 'text-rose-500' : 'text-gray-500 hover:text-amber-600 hover:bg-black/5'}"
          onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); handlePin(); }}
          title="항상 위"
        >
          <Pin size={12} class={appState.isPinned ? "fill-current tracking-tight" : ""} />
        </button>
        <button
          class="cursor-pointer pointer-events-auto p-1 rounded-md text-gray-500 hover:text-amber-600 hover:bg-black/5 transition-colors"
          onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleThemeCycle(); }}
          title="테마 변경"
        >
          <Palette size={12} />
        </button>



        <button
          class="cursor-pointer pointer-events-auto p-1 rounded-md text-gray-500 hover:text-amber-600 hover:bg-black/5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleRollup(e); }}
          disabled={appState.isFullscreen}
          title={appState.isFullscreen ? '전체화면을 해제한 뒤 롤업할 수 있습니다' : '롤업/펼치기'}
          aria-label={appState.isRolledUp ? 'Tiny Note 펼치기' : 'Tiny Note 롤업'}
        >
          {#if appState.isRolledUp}
            <ChevronDown size={12} />
          {:else}
            <ChevronUp size={12} />
          {/if}
        </button>

        <button
          class="cursor-pointer pointer-events-auto p-1 rounded-md text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
          onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); confirmDelete(); }}
          title="내용 비우기"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <button
        class="cursor-pointer pointer-events-auto p-1 rounded-md ml-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-all duration-150"
        onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleMinimize(); }}
        title="창 숨기기"
      >
        <Minus size={13} strokeWidth={2.5} />
      </button>

      <!-- ✨ 전체화면 토글 버튼: 최소화와 닫기 사이에 위치 -->
      <!-- 전체화면 중에는 Minimize2(축소) 아이콘, 아닐 때는 Maximize2(확대) 아이콘을 표시합니다. -->
      <button
        class="cursor-pointer pointer-events-auto p-1 rounded-md ml-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 text-gray-500 hover:text-amber-600 hover:bg-black/5 transition-all duration-150"
        onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
        onclick={(e) => handleFullscreen(e)}
        title={appState.isFullscreen ? '전체화면 해제' : '전체화면'}
        aria-label={appState.isFullscreen ? '전체화면 해제' : '전체화면으로 보기'}
      >
        {#if appState.isFullscreen}
          <Minimize2 size={13} strokeWidth={2.5} />
        {:else}
          <Maximize2 size={13} strokeWidth={2.5} />
        {/if}
      </button>

      <button
        class="cursor-pointer pointer-events-auto p-1 rounded-md ml-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 text-gray-500 hover:text-white hover:bg-red-500 transition-all duration-150"
        onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleClose(); }}
        title="닫기"
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  </div>

  <!-- ✨ 메인 에디터 영역 (롤업 시에는 숨김 처리) -->
  {#if !appState.isRolledUp}
    <div class="flex flex-col relative" style="flex: 1 1 0; min-height: 0;">
      <NoteEditor />
    </div>
    
    <!-- ✨ 서식 편집 플로팅 툴바 (하단에 독립 배치로 편집 가능하게) -->
    <FloatingRTE />
  {/if}

  <!-- ✨ 귀여운 토스트 팝업 UI -->
  {#if showCreationMessage || showArchiveMessage}
    <div
      class="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none"
      style="z-index: 99999;"
      transition:slide={{ duration: 250, axis: 'y' }}
    >
      <div
        class="px-3 py-1.5 rounded-full shadow-lg border text-[10px] font-bold text-center flex items-center gap-1.5"
        style="
          background-color: {appState.isDarkMode ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)'};
          color: {appState.isDarkMode ? '#fde68a' : '#92400e'};
          border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          backdrop-filter: blur(4px);
        "
      >
        {#if showCreationMessage}
          <span>✨ 당신을 위한 Tiny Note 생성!</span>
        {:else if showArchiveMessage}
          <span>📦 아카이브에 안전하게 넣었어요!</span>
        {/if}
      </div>
    </div>
  {/if}
</div>
