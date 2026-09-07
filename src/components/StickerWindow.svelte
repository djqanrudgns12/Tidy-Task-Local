<script>
  import { onMount, onDestroy } from "svelte";
  import { slide } from "svelte/transition";
  import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
  import { LogicalSize, LogicalPosition, PhysicalPosition } from "@tauri-apps/api/dpi";
  import { Pin, Palette, ChevronUp, ChevronDown, Trash2, X, Minus, Archive, Maximize2, Minimize2 } from "lucide-svelte";
  import { appState } from "../lib/appState.svelte.js";
  import { getTinyNoteTheme } from "../lib/themes.js";
  import NoteEditor from "./NoteEditor.svelte";
  import FloatingRTE from "./FloatingRTE.svelte";
  import { archiveState } from "../lib/archiveStore.svelte.js";
  import {
    TINY_NOTE_MIN_HEIGHT,
    TINY_NOTE_MIN_WIDTH,
    TINY_NOTE_ROLLED_HEIGHT,
    clampTinyNoteSize,
    resolveTinyNoteExpandedHeight,
    resolveTinyNoteWidth,
    shouldPersistTinyNoteBounds,
  } from "../lib/tinyNoteWindow.js";
  import { dragRegion } from "../lib/dragRegion.js";
  import {
    resolveAvailableToolWidth,
    resolveVisibleToolCount,
  } from "../lib/headerOverflow.js";
  import { MoreHorizontal } from "lucide-svelte";

  // ✨ 안전한 윈도우 캡처용 지연 할당 변수 (초기화 오류 방지)
  let appWindow = null;

  let unlistenMove = null;
  let unlistenResize = null;
  let resizeSaveTimeout = null;
  let snapLock = false;
  let isProcessing = false;
  
  let showCreationMessage = $state(true);
  let showArchiveMessage = $state(false);

  let currentThemeDefinition = $derived(getTinyNoteTheme(appState.themeColor));
  let currentTheme = $derived(currentThemeDefinition.tinyNote);
  let bgColor = $derived(appState.isDarkMode ? currentTheme.dark : currentTheme.light);
  let tapeColor = $derived(appState.isDarkMode ? currentTheme.tapeDark : currentTheme.tapeLight);

  let headerGradient = $derived(appState.isDarkMode ? 'linear-gradient(to bottom, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)' : 'linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)');
  let headerShadow = $derived(appState.isDarkMode ? '0 2px 4px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)');
  let headerBorderTop = $derived(appState.isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.6)');

  function isValidPosition(value) {
    return Number.isFinite(value) && value > -10000 && value < 20000;
  }

  // 작업 표시줄을 제외한 화면 크기 (Logical). 값이 이상하면 클램프를 건너뜁니다.
  function getWorkArea() {
    const width = window.screen?.availWidth;
    const height = window.screen?.availHeight;
    return {
      width: Number.isFinite(width) && width > 200 ? width : undefined,
      height: Number.isFinite(height) && height > 200 ? height : undefined,
    };
  }

  // 최대화된 창은 Windows가 setSize를 무시합니다.
  // 크기를 되돌리기 전에 반드시 최대화를 먼저 풀어야 "커진 채로 남는" 증상이 사라집니다.
  async function ensureNotMaximized() {
    try {
      if (await appWindow.isMaximized()) await appWindow.unmaximize();
    } catch (_) {
      // 권한이나 플랫폼 문제로 실패해도 복원 자체는 계속 진행합니다.
    }
  }

  async function setExpandedConstraints() {
    await appWindow.setResizable(true);
    await appWindow.setMaxSize(null);
    await appWindow.setMinSize(new LogicalSize(TINY_NOTE_MIN_WIDTH, TINY_NOTE_MIN_HEIGHT));
  }

  async function rememberNormalBounds() {
    // 전체화면이거나 최대화된 상태의 크기는 "정상 크기"가 아니므로 기억하지 않습니다.
    // 왜: 이걸 저장해 버리면 전체화면을 풀었을 때 화면을 꽉 채운 크기로 되돌아옵니다.
    try {
      if ((await appWindow.isFullscreen()) || (await appWindow.isMaximized())) return;
    } catch (_) {
      // 상태를 못 읽으면 아래의 클램프에 맡깁니다.
    }

    const factor = await appWindow.scaleFactor();
    const size = (await appWindow.innerSize()).toLogical(factor);
    // setPosition() 은 창의 "바깥(outer)" 좌표를 설정하므로 저장도 outerPosition() 으로 맞춥니다.
    // 왜: 안쪽 좌표를 저장하고 바깥 좌표로 복원하면 전체화면을 켜고 끌 때마다
    //     테두리 두께(약 7px)만큼 창이 계속 오른쪽 아래로 밀려납니다.
    const position = (await appWindow.outerPosition()).toLogical(factor);
    const rawWidth = resolveTinyNoteWidth(size.width, appState.windowWidth);
    const rawHeight = resolveTinyNoteExpandedHeight(size.height, appState.previousHeight, appState.windowHeight);
    const { width, height } = clampTinyNoteSize(rawWidth, rawHeight, getWorkArea());

    appState.windowWidth = width;
    appState.windowHeight = height;
    appState.previousHeight = height;
    appState.windowPosX = position.x;
    appState.windowPosY = position.y;
  }

  async function restoreExpandedWindow({ restorePosition = false } = {}) {
    // 최대화 상태에서는 setSize가 먹지 않으므로 가장 먼저 풀어 줍니다.
    await ensureNotMaximized();

    const factor = await appWindow.scaleFactor();
    const currentSize = (await appWindow.innerSize()).toLogical(factor);
    const rawWidth = resolveTinyNoteWidth(appState.windowWidth, currentSize.width);
    const rawHeight = resolveTinyNoteExpandedHeight(
      appState.windowHeight,
      appState.previousHeight,
      currentSize.height,
    );

    // 과거 경합으로 "최대화 크기"가 정상 크기로 저장된 창도 여기서 정상으로 되돌아옵니다.
    const { width, height } = clampTinyNoteSize(rawWidth, rawHeight, getWorkArea());

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

  // 테마 레지스트리의 Tiny Note 전용 순서와 다크 모드를 한 상태 머신으로 순환합니다.
  function handleThemeCycle() {
    appState.cycleTinyNoteTheme();
  }



  // ═══════════════════════════════════════════════════════════════════
  // 전체화면 전환 — 단일 상태 머신
  //
  // 더블클릭(타이틀바)과 전체화면 버튼이 "완전히 같은 함수 하나"만 호출합니다.
  // 왜 하나로 합쳤는가: 예전에는 거의 같은 코드가 두 벌 있어서, 한쪽만 고치면
  //   다른 쪽에 옛 동작이 남는 구조였습니다. 전환 경로가 하나면 상태가 갈릴 수 없습니다.
  //
  // 네이티브 자동 최대화와의 경합은 dragRegion 액션이 원천 차단합니다.
  // (data-tauri-drag-region 의 internal_toggle_maximize 경로 제거)
  // ═══════════════════════════════════════════════════════════════════
  async function toggleFullscreen(e) {
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    // 전환이 진행 중이면 즉시 무시합니다 (연타·중복 호출 방어).
    if (!appWindow || isProcessing) return;
    isProcessing = true;

    try {
      // 화면에 실제로 적용된 네이티브 상태를 유일한 진실로 삼습니다.
      // 저장된 appState.isFullscreen 이 어긋나 있어도 여기서 바로잡힙니다.
      const currentlyFullscreen = await appWindow.isFullscreen();

      if (!currentlyFullscreen) {
        // ── 전체화면 진입 ──
        if (appState.isRolledUp) {
          // 편집기는 창 높이가 복구된 뒤 마운트되어야 0px 레이아웃으로 고정되지 않습니다.
          await restoreExpandedWindow();
          appState.isRolledUp = false;
        }

        await rememberNormalBounds();   // 돌아올 크기·위치를 먼저 기억
        await ensureNotMaximized();     // 최대화 잔재를 제거한 뒤 전체화면으로
        await setExpandedConstraints();
        // 플래그를 네이티브 호출보다 "먼저" 세웁니다.
        // 왜: 전체화면 전환으로 발생하는 onResized 이벤트가 도착했을 때
        //     isFullscreen 이 아직 false 면 전체화면 크기(1920x1080)가
        //     정상 창 크기로 저장될 수 있습니다. shouldPersistTinyNoteBounds 가
        //     이 플래그로 저장을 막아 주므로 순서가 중요합니다.
        appState.isFullscreen = true;
        await appWindow.setFullscreen(true);
      } else {
        // ── 전체화면 해제 ──
        // 네이티브 전체화면을 먼저 끄고, 그 다음 저장된 정상 크기·위치를 확정 복원합니다.
        await appWindow.setFullscreen(false);
        await restoreExpandedWindow({ restorePosition: true });
        appState.isFullscreen = false;
      }

      await appState.saveNow(false);
    } catch (err) {
      // 실패했을 때는 추측하지 않고 네이티브 상태를 다시 읽어 화면과 동기화합니다.
      try {
        appState.isFullscreen = await appWindow.isFullscreen();
      } catch (_) {}
      console.warn("Tiny Note 전체화면 전환 오류:", err);
    } finally {
      // 창 전환 애니메이션이 끝난 뒤 잠금을 풀어 연타로 인한 중복 전환을 막습니다.
      setTimeout(() => { isProcessing = false; }, 200);
    }
  }

  // 롤업 버튼은 유지하되 창 제약, 크기, Svelte 렌더 순서를 하나의 트랜잭션으로 처리합니다.
  async function handleRollup(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!appWindow || isProcessing) return;
    // 잠금을 await 보다 먼저 겁니다.
    // 왜: isFullscreen() 을 기다리는 사이에 두 번째 호출이 통과해 롤업이 두 번 실행될 수 있습니다.
    isProcessing = true;
    const rollingUp = !appState.isRolledUp;

    try {
      // 전체화면 중에는 롤업하지 않습니다 (네이티브 상태를 기준으로 판단).
      if (appState.isFullscreen || (await appWindow.isFullscreen())) return;

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

  // 전체화면 버튼은 더블클릭과 완전히 같은 단일 상태 머신을 호출합니다.
  const handleFullscreen = toggleFullscreen;

  async function handleClose() {
    await appWindow.close();
  }

  // ═══════════════════════════════════════════════════════════════════
  // 헤더 반응형 엔진 (docs/PRD-tiny-note-header.md)
  //
  // 헤더 폭이 모자라면 우선순위가 낮은 도구부터 "..." 메뉴로 접어 넣습니다.
  // 왜 이런 구조인가: 버튼이 계속 추가되어 왔는데 헤더 폭은 고정이라,
  //   어느 순간부터 기본 크기에서도 버튼이 잘리고 있었습니다.
  //   개수가 늘어도 깨지지 않으려면 "폭에 맞춰 스스로 접는" 구조가 필요합니다.
  // ═══════════════════════════════════════════════════════════════════

  let headerEl = $state(null);
  let isOverflowOpen = $state(false);
  let isWindowFocused = $state(true);

  // 초기 폭은 저장된 창 너비로 추정합니다.
  // 왜: 0에서 시작하면 첫 프레임에 버튼이 전부 접혔다가 펼쳐지며 깜빡입니다.
  let headerWidth = $state(Math.max(0, (appState.windowWidth ?? 250) - 12));

  // 접기 대상 도구 — 배열 순서가 "헤더에 표시되는 좌우 순서" 입니다.
  // 왜 표시 순서와 우선순위를 분리했는가: 버튼이 접혔다 펼쳐져도 좌우 위치가
  //   그대로여야 사용자가 위치를 기억할 수 있기 때문입니다.
  const TOOL_ORDER = ["pin", "theme", "rollup", "clear"];

  // 남는 순서(앞일수록 끝까지 살아남음). 롤업은 Tiny Note 고유 기능이라 가장 오래 남깁니다.
  const TOOL_PRIORITY = ["rollup", "pin", "theme", "clear"];

  // 롤업 상태에서는 본문이 보이지 않으므로 롤업 해제 버튼만 남깁니다.
  let activeTools = $derived(appState.isRolledUp ? ["rollup"] : TOOL_ORDER);

  let visibleToolCount = $derived(
    resolveVisibleToolCount({
      availableWidth: resolveAvailableToolWidth(headerWidth),
      toolCount: activeTools.length,
    }),
  );

  // 우선순위 상위 N개만 헤더에 남기고 나머지는 "..." 으로 보냅니다.
  let visibleToolIds = $derived(
    new Set(
      TOOL_PRIORITY.filter((id) => activeTools.includes(id)).slice(0, visibleToolCount),
    ),
  );

  let headerTools = $derived(activeTools.filter((id) => visibleToolIds.has(id)));
  let overflowTools = $derived(activeTools.filter((id) => !visibleToolIds.has(id)));

  // 접힌 게 없으면 "..." 버튼 자체를 숨깁니다.
  let hasOverflow = $derived(overflowTools.length > 0);

  // 헤더 폭 관찰: 창 크기 변경과 DPI 변경을 모두 잡아냅니다.
  $effect(() => {
    if (!headerEl) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) headerWidth = entry.contentRect.width;
    });
    observer.observe(headerEl);
    return () => observer.disconnect();
  });

  // 접힌 메뉴가 열려 있는데 창이 넓어져 접을 게 없어지면 메뉴를 닫아 줍니다.
  $effect(() => {
    if (!hasOverflow && isOverflowOpen) isOverflowOpen = false;
  });

  // 창 활성 여부에 따라 버튼 진하기를 바꿔, 여러 개 띄웠을 때 지금 쓰는 창이 도드라지게 합니다.
  $effect(() => {
    if (!appWindow) return;
    let unlisten = null;
    let disposed = false;

    appWindow
      .onFocusChanged(({ payload: focused }) => {
        isWindowFocused = focused;
        if (!focused) isOverflowOpen = false;
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  });

  // 평소에는 은은하게, 헤더에 마우스를 올리면 또렷하게.
  let toolIdleOpacity = $derived(isWindowFocused ? 0.45 : 0.25);

  function toggleOverflow(e) {
    e.preventDefault();
    e.stopPropagation();
    isOverflowOpen = !isOverflowOpen;
  }

  function closeOverflow() {
    isOverflowOpen = false;
  }

  // 메뉴에서 고른 항목을 실행한 뒤 메뉴를 닫습니다.
  function runTool(id, e) {
    closeOverflow();
    if (id === "pin") handlePin();
    else if (id === "theme") handleThemeCycle();
    else if (id === "rollup") handleRollup(e);
    else if (id === "clear") confirmDelete();
  }

  // 바깥 클릭 / Esc 로 닫기
  function handleWindowPointerDown(e) {
    if (!isOverflowOpen) return;
    if (e.target instanceof Element && e.target.closest("[data-overflow-root]")) return;
    closeOverflow();
  }

  function handleWindowKeyDown(e) {
    if (e.key === "Escape" && isOverflowOpen) closeOverflow();
  }

  // 툴팁·접근성용 전체 라벨
  const TOOL_LABELS = {
    pin: "항상 위",
    theme: "테마 바꾸기",
    rollup: "롤업/펼치기",
    clear: "내용 비우기",
  };

  // 한 줄 도구 바에 표시할 짧은 라벨.
  // 왜 따로 두는가: 창이 200px까지 좁아질 수 있어, 긴 라벨은 말줄임으로 잘려 지저분해집니다.
  //   짧은 라벨이면 최대 3개가 나란히 놓여도 잘리지 않습니다.
  const TOOL_SHORT_LABELS = {
    pin: "항상 위",
    theme: "테마",
    rollup: "롤업",
    clear: "비우기",
  };
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeyDown} />

<div
  class="h-screen w-screen flex flex-col group overflow-hidden transition-colors duration-300 relative"
  style="
    background-color: {bgColor};
    color: {appState.isDarkMode ? '#e2e8f0' : '#4b5563'};
  "
>
  <!-- ═══════════════════════════════════════════════════════════════
       타이틀바 — 드래그 영역 + 더블클릭 전체화면 + 반응형 도구 모음
       폭이 모자라면 우선순위가 낮은 도구부터 "..." 안으로 접힙니다.
       docs/PRD-tiny-note-header.md
       ═══════════════════════════════════════════════════════════════ -->
  <div
    bind:this={headerEl}
    class="tiny-header flex items-center gap-1 px-1.5 h-[35px] shrink-0 w-full cursor-move select-none relative z-10"
    style="
      background-color: {tapeColor};
      background-image: {headerGradient};
      border-top: {headerBorderTop};
      box-shadow: {headerShadow};
      --tool-idle-opacity: {toolIdleOpacity};
    "
    use:dragRegion={{ onDoubleClick: toggleFullscreen }}
    role="presentation"
  >
    <!-- 좌측: 아카이브 버튼(고정) + 제목 입력(가변) -->
    <!-- 제목은 flex-1 로 두어, 창이 넓으면 길게 쓰고 좁으면 버튼에 자리를 양보합니다. -->
    <div class="flex items-center gap-1 min-w-0 flex-1 overflow-hidden pointer-events-none">
      <button
        class="tiny-tool shrink-0 cursor-pointer pointer-events-auto flex items-center justify-center rounded-md hover:bg-black/10"
        onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleArchive(); }}
        title="아카이빙하기"
        aria-label="아카이빙하기"
      >
        <Archive size={14} class="text-amber-600" strokeWidth={2.2} />
      </button>
      <input
        type="text"
        bind:value={appState.title}
        oninput={() => appState.save()} maxlength="10"
        class="tiny-title pointer-events-auto bg-transparent border-none outline-none text-left text-[11px] font-semibold flex-1"
        style="color: {appState.isDarkMode ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)'};"
        placeholder="Tiny Note..."
      />
    </div>

    <!-- 우측: 접기 대상 도구 + "..." + 창 제어 3종(절대 안 접힘) -->
    <div class="flex items-center shrink-0 pointer-events-none" data-overflow-root>
      {#each headerTools as id (id)}
        {#if id === 'pin'}
          <button
            class="tiny-tool cursor-pointer pointer-events-auto rounded-md {appState.isPinned ? 'is-active text-rose-500' : 'text-gray-500 hover:text-amber-600'}"
            onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
            onclick={(e) => { e.preventDefault(); e.stopPropagation(); handlePin(); }}
            title="항상 위"
            aria-label="항상 위"
          >
            <Pin size={12} class={appState.isPinned ? "fill-current" : ""} />
          </button>
        {:else if id === 'theme'}
          <button
            class="tiny-tool cursor-pointer pointer-events-auto rounded-md text-gray-500 hover:text-amber-600"
            onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
            onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleThemeCycle(); }}
            title={`테마 변경 · ${currentThemeDefinition.label}`}
            aria-label={`테마 변경, 현재 ${currentThemeDefinition.label}`}
          >
            <Palette size={12} />
          </button>
        {:else if id === 'rollup'}
          <button
            class="tiny-tool cursor-pointer pointer-events-auto rounded-md text-gray-500 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
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
        {:else if id === 'clear'}
          <button
            class="tiny-tool cursor-pointer pointer-events-auto rounded-md text-gray-500 hover:text-red-500"
            onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
            onclick={(e) => { e.preventDefault(); e.stopPropagation(); confirmDelete(); }}
            title="내용 비우기"
            aria-label="내용 비우기"
          >
            <Trash2 size={12} />
          </button>
        {/if}
      {/each}

      {#if hasOverflow}
        <button
          class="tiny-tool cursor-pointer pointer-events-auto rounded-md text-gray-500 hover:text-amber-600 {isOverflowOpen ? 'is-active' : ''}"
          onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
          onclick={toggleOverflow}
          title={isOverflowOpen ? '도구 접기' : '도구 더 보기'}
          aria-label={isOverflowOpen ? '도구 접기' : '도구 더 보기'}
          aria-expanded={isOverflowOpen}
        >
          <MoreHorizontal size={13} strokeWidth={2.5} />
        </button>
      {/if}

      <!-- 창 제어 3종: OS 창 관습을 따라 절대 접히지 않습니다. -->
      <button
        class="tiny-tool cursor-pointer pointer-events-auto rounded-md ml-0.5 text-gray-500 hover:text-gray-800"
        onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleMinimize(); }}
        title="창 숨기기"
        aria-label="창 숨기기"
      >
        <Minus size={13} strokeWidth={2.5} />
      </button>

      <button
        class="tiny-tool cursor-pointer pointer-events-auto rounded-md text-gray-500 hover:text-amber-600"
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
        class="tiny-tool tiny-close cursor-pointer pointer-events-auto rounded-md text-gray-500"
        onpointerdown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleClose(); }}
        title="닫기"
        aria-label="닫기"
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       접힌 도구 — 헤더 아래 "한 줄"로 펼칩니다.
       왜 떠 있는 드롭다운이 아닌가:
         Tiny Note는 250x280 정도의 작은 창입니다. 세로 드롭다운(4항목 약 130px)은
         본문의 절반을 덮어버려서, 메모를 보면서 도구를 쓰는 게 불가능했습니다.
         헤더가 한 줄 늘어나는 형태로 바꾸면 본문이 아래로 밀릴 뿐 가려지지 않고,
         원래 헤더에 있던 버튼들이라 "헤더의 연장"으로 자연스럽게 읽힙니다.
       ═══════════════════════════════════════════════════════════════ -->
  {#if isOverflowOpen && hasOverflow && !appState.isRolledUp}
    <div
      class="tiny-overflow-bar shrink-0 flex items-stretch gap-0.5 px-1.5 py-1 border-b"
      style="
        background-color: {tapeColor};
        border-bottom-color: {appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      "
      transition:slide={{ duration: 180, axis: 'y' }}
      data-overflow-root
      role="toolbar"
      aria-label="추가 도구"
      tabindex="-1"
    >
      {#each overflowTools as id (id)}
        <button
          class="tiny-bar-item flex items-center justify-center gap-1 flex-1 min-w-0 px-1 py-1 rounded-lg text-[10px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          style="color: {appState.isDarkMode ? '#e2e8f0' : '#4b5563'};"
          onpointerdown={(e) => e.stopPropagation()}
          ondblclick={(e) => e.stopPropagation()}
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); runTool(id, e); }}
          disabled={id === 'rollup' && appState.isFullscreen}
          title={TOOL_LABELS[id]}
          aria-label={TOOL_LABELS[id]}
        >
          {#if id === 'pin'}
            <Pin size={12} class="shrink-0 {appState.isPinned ? 'fill-current text-rose-500' : ''}" />
          {:else if id === 'theme'}
            <Palette size={12} class="shrink-0" />
          {:else if id === 'rollup'}
            {#if appState.isRolledUp}
              <ChevronDown size={12} class="shrink-0" />
            {:else}
              <ChevronUp size={12} class="shrink-0" />
            {/if}
          {:else if id === 'clear'}
            <Trash2 size={12} class="shrink-0 text-red-400" />
          {/if}
          <span class="truncate">{TOOL_SHORT_LABELS[id]}</span>
        </button>
      {/each}
    </div>
  {/if}

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

<style>
  /* ── 헤더 도구 버튼 ─────────────────────────────────────────────
     크기를 22x22px로 고정하는 이유:
       headerOverflow.js 가 "몇 개를 펼칠 수 있는지"를 이 폭으로 계산합니다.
       폭이 흔들리면 계산이 어긋나 버튼이 잘리거나 어색하게 남습니다. */
  .tiny-tool {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    /* 평소에는 은은하게. 헤더에 마우스를 올리면 또렷해집니다.
       창이 비활성일 때는 더 흐려져, 여러 개 띄웠을 때 지금 쓰는 창이 도드라집니다. */
    opacity: var(--tool-idle-opacity, 0.45);
    transition:
      opacity 150ms ease,
      color 150ms ease,
      background-color 150ms ease,
      transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .tiny-header:hover .tiny-tool {
    opacity: 1;
  }

  /* 켜져 있는 토글(핀 등)과 열려 있는 메뉴는 상태 표시이므로 항상 또렷합니다. */
  .tiny-tool.is-active {
    opacity: 1;
  }

  .tiny-tool:hover:not(:disabled) {
    /* 살짝 떠오르는 느낌으로 아기자기하게 */
    transform: translateY(-1px);
    background-color: rgba(0, 0, 0, 0.06);
  }

  .tiny-tool:active:not(:disabled) {
    transform: translateY(0) scale(0.92);
  }

  .tiny-close:hover:not(:disabled) {
    background-color: #ef4444;
    color: #ffffff;
  }

  /* ── 제목 입력창 ───────────────────────────────────────────────
     고정 80px를 가변으로 바꿔, 창이 좁아지면 버튼에 자리를 양보합니다. */
  .tiny-title {
    /* 창이 아무리 좁아도 제목이 완전히 사라지지는 않도록 하한을 둡니다.
       headerOverflow.js 는 좌측 영역을 72px로 잡고 계산하므로
       (아카이브 22 + 간격 4 + 제목 28 = 54) 이 값이면 버튼을 밀어내지 않습니다. */
    min-width: 28px;
    text-overflow: ellipsis;
  }

  .tiny-title::placeholder {
    opacity: 0.55;
  }

  /* ── "..." 접힘 도구 바 ────────────────────────────────────────
     헤더 아래에 한 줄로 펼쳐지는 띠. 본문을 덮지 않고 밀어냅니다. */
  .tiny-overflow-bar {
    /* 헤더와 같은 톤을 쓰되 살짝 눌러, 헤더가 한 칸 늘어난 것처럼 보이게 합니다. */
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }

  .tiny-bar-item {
    /* 스티커가 톡 떨어지듯 살짝 튀는 반응 */
    transition:
      background-color 150ms ease,
      transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .tiny-bar-item:hover:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.07);
    transform: translateY(-1px);
  }

  .tiny-bar-item:active:not(:disabled) {
    transform: translateY(0) scale(0.94);
  }

  /* 애니메이션을 줄이도록 설정한 사용자는 존중합니다. */
  @media (prefers-reduced-motion: reduce) {
    .tiny-tool,
    .tiny-bar-item {
      transition: none;
      animation: none;
    }
    .tiny-tool:hover:not(:disabled),
    .tiny-tool:active:not(:disabled),
    .tiny-bar-item:hover:not(:disabled),
    .tiny-bar-item:active:not(:disabled) {
      transform: none;
    }
  }
</style>
