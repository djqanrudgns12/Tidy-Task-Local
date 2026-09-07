<script>
  import { onMount, onDestroy } from "svelte";
  import { slide, fade, scale } from "svelte/transition";
  import { Check, Eraser } from "lucide-svelte";
  import { appState } from "./lib/appState.svelte.js";
  import { TINY_NOTE_MIN_WIDTH, TINY_NOTE_ROLLED_HEIGHT } from "./lib/tinyNoteWindow.js";
  import { getTidyTheme } from "./lib/themes.js";
  import {
    UPDATE_NOTICE_STORE_KEY,
    UPDATE_NOTICE_WINDOW_LABEL,
    getUpdateNoticeWindowOptions,
    shouldShowUpdateNotice,
  } from "./lib/updateNotice.js";

  import Titlebar from "./components/Titlebar.svelte";
  import MainToolbar from "./components/MainToolbar.svelte";
  import TodoList from "./components/TodoList.svelte";
  import ArchivedList from "./components/ArchivedList.svelte";
  import NoteEditor from "./components/NoteEditor.svelte";
  import SettingsModal from "./components/SettingsModal.svelte";
  import FloatingRTE from "./components/FloatingRTE.svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import WelcomeWindow from "./components/WelcomeWindow.svelte";
  import ReminderPopup from "./components/ReminderPopup.svelte";
  import StickerWindow from "./components/StickerWindow.svelte";
  import ArchiveWindow from "./components/ArchiveWindow.svelte";
  import UpdateBanner from "./components/UpdateBanner.svelte";
  import UpdateGuide from "./components/UpdateGuide.svelte";
  import UpdateNotice from "./components/UpdateNotice.svelte";

  import { convertFileSrc } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
  import { listen, emit, emitTo } from "@tauri-apps/api/event";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { LazyStore } from "@tauri-apps/plugin-store";
  import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
  import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
  import {
    PhysicalPosition,
    PhysicalSize,
    LogicalSize,
    LogicalPosition,
  } from "@tauri-apps/api/dpi";

  let unlistenApplySettings,
    unlistenResetData,
    unlistenResetConfig,
    unlistenAddFont,
    unlistenClose,
    unlistenMove,
    unlistenFocus,
    unlistenResize;

  // 데이터를 담는 창(main / note-* / tinynote-*)인지 판별합니다.
  // 설정·컨텍스트메뉴·환영 같은 임시 UI 창은 저장 플러시 대상이 아닙니다.
  function isDataWindow(label) {
    return label === "main" || label.startsWith("note-") || label.startsWith("tinynote-");
  }

  async function openUpdateNoticeWindow() {
    try {
      const store = new LazyStore("tidy-task-config.json");
      const hiddenUntil = await store.get(UPDATE_NOTICE_STORE_KEY);
      if (!shouldShowUpdateNotice(hiddenUntil)) return;

      const existing = await WebviewWindow.getByLabel(UPDATE_NOTICE_WINDOW_LABEL);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const noticeWindow = new WebviewWindow(
        UPDATE_NOTICE_WINDOW_LABEL,
        getUpdateNoticeWindowOptions(),
      );

      noticeWindow.once("tauri://created", async () => {
        try {
          await noticeWindow.show();
          await noticeWindow.setFocus();
        } catch (_) {}
      });
      noticeWindow.once("tauri://error", (event) => {
        console.warn("업데이트 공지 창을 열지 못했습니다:", event.payload);
      });
    } catch (error) {
      console.warn("업데이트 공지 노출 여부를 확인하지 못했습니다:", error);
    }
  }

  // 창이 백그라운드로 가거나 언로드될 때 예약된 저장을 즉시 확정합니다.
  function handleVisibilityFlush(e) {
    if (!isDataWindow(getCurrentWindow().label)) return;

    // 웹뷰가 사라지는 마지막 순간(pagehide)에는 무조건 기록합니다.
    if (e?.type === "pagehide") {
      appState.flushPendingSaves(true);
      return;
    }
    // 단순히 다른 창으로 넘어간 경우엔 "예약된 저장이 있을 때만" 기록합니다.
    if (document.visibilityState !== "visible") {
      appState.flushPendingSaves();
    }
  }

  let isFirstLoad = true;
  let showDeleteModal = $state(false);

  let ctxWin = null;

  async function handleBarContextMenu(e) {
    if (getCurrentWindow().label === "settings" || getCurrentWindow().label === "ctx-menu") return;

    e.preventDefault();
    let isText = e.target.closest('.note-wrapper') || e.target.closest('[contenteditable]') || e.target.tagName === 'INPUT';
    const type = isText ? 'text' : 'bar';

    const scaleFactor = await getCurrentWindow().scaleFactor();
    const pos = await getCurrentWindow().innerPosition();
    const logicalPos = pos.toLogical(scaleFactor);
    
    const screenX = logicalPos.x + e.clientX;
    const screenY = logicalPos.y + e.clientY;

    if (ctxWin) {
      await emitTo('ctx-menu', 'show-ctx-menu', {
        x: screenX,
        y: screenY,
        type: type,
        state: { ...appState.takeSnapshot(), isEditMode: appState.isEditMode },
        requester: getCurrentWindow().label
      });
    }
  }

  // ✨ 내부 스플리터 드래그 상태
  let isDraggingSplitter = $state(false);
  let startYPos = 0;
  let startWindowLogicalHeight = 0;
  let startWindowLogicalWidth = 0;
  let splitterCurrentWindow = null;
  let isRafPending = false;
  let rafTargetYPos = 0;
  let isSplitterReady = false;
  let recentSplitterDragEnd = 0;

  // ✨ 브라우저 리사이즈 상태 추적 
  let prevScreenY = 0;
  let prevInnerHeight = 0;
  let prevInnerWidth = 0;
  let prevPixelRatio = 1;
  let resizeSaveTimeout = null;
  // onMount 안쪽에서만 선언돼 있어서 onDestroy에서 참조 시 에러가 나던 변수를 위로 끌어올립니다.
  let moveSaveTimeout = null;

  // ── 최소 창 크기 상수 ──
  // 왜 상수로 분리했는가:
  //   예전에는 보관함(마감된 일)의 실제 콘텐츠 높이를 최소 창 높이에 그대로 더했습니다.
  //   보관 항목이 20개면 최소 높이가 900px, 50개면 1600px이 되어 OS가 창을 그만큼 강제로
  //   키워버리고(화면 밖으로 커짐) 더 이상 줄일 수도 없게 됐습니다.
  //   이제 보관함은 내부 스크롤을 갖고, 최소 높이에는 머리글 한 줄만 반영합니다.
  const CHROME_MIN_H = 210;      // 타이틀바 + 툴바 + 할 일 최소 영역
  const SPLITTER_H = 6;
  const ARCHIVE_HEADER_H = 34;   // 보관함 머리글 한 줄
  const NOTES_MIN_H = 140;

  // 작업 표시줄을 제외한 화면 세로/가로 크기. 값이 이상하면 안전한 기본값을 씁니다.
  function getWorkAreaHeight() {
    const h = window.screen?.availHeight;
    return typeof h === "number" && h > 200 ? h : 900;
  }
  function getWorkAreaWidth() {
    const w = window.screen?.availWidth;
    return typeof w === "number" && w > 200 ? w : 1600;
  }

  // 안전 클램프: 저장된 창 크기가 현재 모니터보다 크면 화면 안으로 되돌립니다.
  // 왜: 큰 모니터에서 쓰던 크기가 노트북에서 그대로 복원되면 창이 화면을 벗어나
  //     테두리를 잡을 수 없어 크기 조절 자체가 불가능해집니다.
  function clampSizeToScreen(w, h) {
    const maxW = Math.max(280, getWorkAreaWidth() - 20);
    const maxH = Math.max(CHROME_MIN_H, getWorkAreaHeight() - 20);
    return {
      w: Math.min(Math.round(w), maxW),
      h: Math.min(Math.round(h), maxH),
    };
  }

  let archivedHeight = $state(0);
  let notesHeight = $state(0);

  // ─── 0. 위쪽 테두리 더블클릭 → 세로 최대화 토글 ───
  // 왜: Windows 기본 동작에서 아래쪽 테두리 더블클릭은 세로 스냅이 되지만,
  //     decorations:false 앱에서는 위쪽 테두리에 Titlebar가 덮여있어 동작하지 않습니다.
  async function handleTopEdgeDblClick() {
    const win = getCurrentWindow();
    // 전체화면이나 롤업 상태에서는 무시
    if (appState.isFullscreen) return;
    if (appState.isRolledUp) return;

    try {
      const monitor = await win.currentMonitor();
      if (!monitor) return;

      const factor = await win.scaleFactor();
      // 모니터 작업영역 (작업 표시줄 제외)을 Logical 단위로 변환
      const monitorPos = {
        x: monitor.position.x / factor,
        y: monitor.position.y / factor
      };
      
      // ✨ [TCREI] 프로그래매틱 리사이즈 락 온: 브라우저 resize 이벤트가 스냅을 해제하지 못하게 방어
      appState.isProgrammaticResize = true;

      if (!appState.isVerticalSnapped) {
        // ── 세로 스냅 진입: 현재 Y좌표와 높이를 백업 후 세로 최대화 ──
        const pos = await win.outerPosition();
        const logicalPos = pos.toLogical(factor);
        const size = await win.innerSize();
        const logicalSize = size.toLogical(factor);

        appState.preSnapPosY = logicalPos.y;
        appState.preSnapHeight = logicalSize.height;
        appState.isVerticalSnapped = true;

        // 너비(X좌표)는 유지, Y를 모니터 상단으로 이동, 높이를 작업영역(window.screen.availHeight) 전체로
        await win.setPosition(new LogicalPosition(
          Math.round(logicalPos.x),
          Math.round(monitorPos.y)
        ));
        await win.setSize(new LogicalSize(
          Math.round(logicalSize.width),
          Math.round(window.screen.availHeight) // ✨ 네이티브 OS 핏 (작업표시줄 보호)
        ));
      } else {
        // ── 세로 스냅 해제: 백업된 원래 Y좌표와 높이로 복원 ──
        appState.isVerticalSnapped = false;

        const size = await win.innerSize();
        const logicalSize = size.toLogical(factor);

        if (appState.preSnapPosY !== null) {
          const pos = await win.outerPosition();
          const logicalPos = pos.toLogical(factor);
          await win.setPosition(new LogicalPosition(
            Math.round(logicalPos.x),
            Math.round(appState.preSnapPosY)
          ));
        }
        if (appState.preSnapHeight !== null) {
          await win.setSize(new LogicalSize(
            Math.round(logicalSize.width),
            Math.round(appState.preSnapHeight)
          ));
        }

        appState.preSnapPosY = null;
        appState.preSnapHeight = null;
      }

      // 변경된 크기/위치를 즉시 상태에 반영 후 저장
      const updatedSize = await win.innerSize();
      const updatedPos = await win.outerPosition();
      const updatedLogicalSize = updatedSize.toLogical(factor);
      const updatedLogicalPos = updatedPos.toLogical(factor);
      appState.windowWidth = updatedLogicalSize.width;
      appState.windowHeight = updatedLogicalSize.height;
      appState.windowPosX = updatedLogicalPos.x;
      appState.windowPosY = updatedLogicalPos.y;
      appState.saveNow();

      // ✨ [TCREI] 락 오프 (이벤트 루프 대기를 위해 setTimeout 활용)
      setTimeout(() => { appState.isProgrammaticResize = false; }, 300);
    } catch (e) {
      console.warn("세로 스냅 처리 오류:", e);
      appState.isProgrammaticResize = false;
    }
  }

  // ─── 1. 창 크기 조절 (Resize) 동기화 엔진 ───
  function handleBrowserResize() {
    // ✨ [TCREI: Persistence] 전체화면일 때는 크기 업데이트를 건너뗴니다.
    // 왜: 전체화면 진입 전 저장해둔 원래 창 크기(windowWidth/Height)를 보존하기 위함입니다.
    //     방어하지 않으면 모니터 해상도(1920×1080 등)가 일반 창 크기로 덮어쓰여집니다.
    if (appState.isFullscreen) {
      // prev 값들은 업데이트하여 전체화면 해제 후 첫 resize에서 거대한 delta 발생을 방지
      prevScreenY = window.screenY;
      prevInnerHeight = window.innerHeight;
      prevInnerWidth = window.innerWidth;
      prevPixelRatio = window.devicePixelRatio;
      return;
    }

    if (isDraggingSplitter || Date.now() - recentSplitterDragEnd < 500) {
      prevScreenY = window.screenY;
      prevInnerHeight = window.innerHeight;
      prevInnerWidth = window.innerWidth;
      prevPixelRatio = window.devicePixelRatio;
      return;
    }

    // ✨ [세로 스냅 자동 해제] 사용자가 수동으로 창 "높이"를 드래그하면 세로 스냅 상태를 해제합니다.
    // 왜: 너비(Width)만 조절할 때는 네이티브 OS처럼 세로 스냅 상태가 유지되어야 완벽합니다.
    if (appState.isVerticalSnapped && !appState.isProgrammaticResize) {
      const currentHeight = window.innerHeight;
      // 현재 높이가 최대 가용 높이(작업표시줄 제외)와 달라졌다면 수동으로 높이를 변경한 것입니다. (DPI 오차 5px 허용)
      if (Math.abs(currentHeight - window.screen.availHeight) > 5) {
        appState.isVerticalSnapped = false;
        appState.preSnapPosY = null;
        appState.preSnapHeight = null;
      }
    }

    const currentScreenY = window.screenY;
    const currentHeight = window.innerHeight;
    const currentWidth = window.innerWidth;
    const currentPixelRatio = window.devicePixelRatio;

    if (currentPixelRatio !== prevPixelRatio) {
      prevPixelRatio = currentPixelRatio;
      prevScreenY = currentScreenY;
      prevInnerHeight = currentHeight;
      prevInnerWidth = currentWidth;
      return;
    }

    const deltaY = currentScreenY - prevScreenY;
    const deltaH = currentHeight - prevInnerHeight;
    const deltaW = Math.abs(currentWidth - prevInnerWidth);

    // ✨ 유령 메모장 크기를 제한하는 "물리적 한계치" 계산
    const archiveH = appState.showArchived ? (archivedHeight || 28) : 0;
    const splitterH = (appState.showNotes || appState.showArchived) ? 6 : 0;
    const reservedH = 210 + archiveH + splitterH; // 앱의 기본 헤더 및 할일(145px) 최소 보장 높이
    const maxAvailableNotesH = currentHeight - reservedH;

    const isSnapOrMaximize = Math.abs(deltaH) > 50 || deltaW > 50;

    if (appState.showNotes) {
      if (!isSnapOrMaximize && Math.abs(deltaY) <= 3) {
        // 하단 드래그 지속 시: 즉시 락을 해제
        appState.isNotesLocked = false;
      }

      if (!appState.isNotesLocked && !isSnapOrMaximize && Math.abs(deltaY) <= 3) {
        // 락이 풀린 상태에서만 메모장 크기 변경
        let nextNotesH = appState.notesHeight + deltaH;
        appState.notesHeight = Math.max(140, nextNotesH);
      }
      
      if (appState.notesHeight > maxAvailableNotesH) {
        // 유령 기억 퇴마 (상단 드래그 등 락/언락 여부 상관없이 한계 넘으면 강제 Clamp)
        appState.notesHeight = Math.max(140, maxAvailableNotesH);
      }
    }

    prevScreenY = currentScreenY;
    prevInnerHeight = currentHeight;
    prevInnerWidth = currentWidth;
    appState.windowWidth = currentWidth;
    appState.windowHeight = currentHeight;

    if (resizeSaveTimeout) clearTimeout(resizeSaveTimeout);
    resizeSaveTimeout = setTimeout(() => {
      appState.save();
    }, 300);
  }

 $effect(() => {
    if (!appState.isReady) return;
    try {
      const currentWindow = getCurrentWindow();
      const label = currentWindow.label;

      if (label === 'reminder' || label === 'settings' || label === 'welcome' || label === 'ctx-menu' || label.startsWith('tinynote-')) return;

      const minW = 280;
      let minH = CHROME_MIN_H;
      if (appState.showNotes || appState.showArchived) minH += SPLITTER_H;
      // 여기서 archivedHeight(실제 콘텐츠 높이)를 쓰면 창이 무한정 커집니다. 고정값만 사용합니다.
      if (appState.showArchived) minH += ARCHIVE_HEADER_H;
      if (appState.showNotes) minH += NOTES_MIN_H;

      // 최후 방어선: 어떤 계산 결과가 나오든 화면 작업영역의 80%를 넘지 못하게 막습니다.
      const hardCap = Math.max(CHROME_MIN_H, Math.floor(getWorkAreaHeight() * 0.8));
      minH = Math.min(minH, hardCap);

      currentWindow.setMinSize(new LogicalSize(minW, minH)).catch(() => {});
    } catch (e) {}
  });

  // ─── 2. 스플리터 엔진 (점프 버그 완벽 해결) ───
  function startSplitterDrag(e) {
    appState.isNotesLocked = true;
    appState.saveNow();
    e.preventDefault();

    // ✨ 스플리터를 잡는 즉시, 보이지 않는 유령 크기가 남아있다면 바로 삭제
    const archiveH = appState.showArchived ? (archivedHeight || 28) : 0;
    const splitterH = (appState.showNotes || appState.showArchived) ? 6 : 0;
    const reservedH = 210 + archiveH + splitterH;
    const realVisibleNotesH = window.innerHeight - reservedH;

    if (appState.notesHeight > realVisibleNotesH) {
      appState.notesHeight = Math.max(140, realVisibleNotesH);
    }

    isDraggingSplitter = true;
    isSplitterReady = true; 
    startYPos = e.screenY;

    e.currentTarget.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onSplitterDrag);
    window.addEventListener("pointerup", endSplitterDrag);
    window.addEventListener("pointercancel", endSplitterDrag);
    window.addEventListener("blur", endSplitterDrag);
    document.body.style.cursor = "row-resize";

    splitterCurrentWindow = getCurrentWindow();
    startWindowLogicalHeight = window.innerHeight;
    startWindowLogicalWidth = window.innerWidth;
  }

  function onSplitterDrag(e) {
    if (!isDraggingSplitter || !isSplitterReady) return;
    rafTargetYPos = e.screenY;

    if (!isRafPending) {
      isRafPending = true;
      requestAnimationFrame(() => {
        if (!isDraggingSplitter || !isSplitterReady) {
          isRafPending = false;
          return;
        }

        const delta = rafTargetYPos - startYPos;

        let minH = 210;
        if (appState.showNotes || appState.showArchived) minH += 6;
        if (appState.showArchived) minH += archivedHeight || 28;
        if (appState.showNotes) minH += appState.notesHeight;

        // ✨ THE MAGIC TRICK: "팍" 튀어오르는 현상 영구 박멸!
        // 현재 창 높이가 이미 minH보다 작다면, minH를 창 높이에 강제로 맞춥니다.
        const safeMinH = Math.min(minH, startWindowLogicalHeight);
        let newWinH = Math.max(safeMinH, startWindowLogicalHeight + delta);

        if (splitterCurrentWindow) {
          splitterCurrentWindow
            .setSize(new LogicalSize(startWindowLogicalWidth, newWinH))
            .catch(() => {});
            
          appState.windowHeight = newWinH;
        }

        isRafPending = false;
      });
    }
  }

  function endSplitterDrag(e) {
    isDraggingSplitter = false;
    recentSplitterDragEnd = Date.now();
    window.removeEventListener("pointermove", onSplitterDrag);
    window.removeEventListener("pointerup", endSplitterDrag);
    window.removeEventListener("pointercancel", endSplitterDrag);
    window.removeEventListener("blur", endSplitterDrag);
    document.body.style.cursor = "";

    if (e?.currentTarget?.releasePointerCapture) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err){}
    }

    if (splitterCurrentWindow) {
      splitterCurrentWindow
        .innerSize()
        .then(async (size) => {
          const factor = await splitterCurrentWindow.scaleFactor();
          const logical = size.toLogical(factor);
          appState.windowHeight = logical.height;
          appState.windowWidth = logical.width;
          appState.saveNow();
        })
        .catch(() => {
          appState.windowHeight = window.innerHeight;
          appState.windowWidth = window.innerWidth;
          appState.saveNow();
        });
    } else {
      appState.windowHeight = window.innerHeight;
      appState.windowWidth = window.innerWidth;
      appState.saveNow();
    }
  }

  function applyCSSVars() {
    const root = document.documentElement;

    const getFamily = (name) => {
      const found = appState.allFonts.find((f) => f.name === name);
      return found ? found.family : '"Gulim", sans-serif';
    };

    const realGlobalFont = getFamily(appState.fontFamily || "메이플스토리 L");
    const realUiFont = getFamily(appState.uiFontFamily || "메이플스토리 L");

    root.style.setProperty("--global-font-family", realGlobalFont);
    root.style.setProperty("--ui-font-family", realUiFont);
    root.style.setProperty(
      "--global-font-size",
      `${appState.fontSize || 10}pt`,
    );
    root.style.setProperty("--ui-font-size", `${appState.uiFontSize || 10}pt`);
    root.style.setProperty("--global-letter-spacing", `${appState.letterSpacing ?? 0}em`);

    const theme = getTidyTheme(appState.themeColor).tidy;
    if (!appState.isDarkMode) {
      root.style.setProperty("--global-theme-color", theme.bg);
      root.style.setProperty("--global-section-bg", theme.section);
      root.style.setProperty("--global-border-color", theme.border);
    } else {
      // ✨ [다크모드 재설계] One Dark 스타일: 명도를 높여 장시간 사용 시 눈 피로 최소화
      root.style.setProperty("--global-theme-color", "#23272e");
      root.style.setProperty("--global-section-bg", "#2b3039");
      root.style.setProperty("--global-border-color", "rgba(255,255,255,0.08)");
    }

    document.body.style.setProperty("font-family", realUiFont, "important");
    root.style.fontSize = `${appState.uiFontSize || 10}pt`;
  }

  onMount(async () => {
    // 🚨 [TCREI: Integrity] 아카이브 창은 자체 archiveStore만 사용하므로
    // appState.init()을 호출하면 windowLabel="archive"가 되어
    // performSave()가 "archive" 키에 유령 데이터를 생성합니다. 이를 방지합니다.
    const _label = getCurrentWindow().label;
    if (_label === 'archive' || _label === UPDATE_NOTICE_WINDOW_LABEL) return;

    await appState.init();
    applyCSSVars();

    const currentWindow = getCurrentWindow();

    // ✨ 메인 창 최초 실행 시진 레모 탄산 시작음 (1회만)
    if (currentWindow.label === 'main' && !appState.globalMuteSound) {
      try {
        const _ac = new (window.AudioContext || window.webkitAudioContext)();
        const _o = _ac.createOscillator();
        const _g = _ac.createGain();
        _o.type = 'sine';
        _o.frequency.setValueAtTime(1200, _ac.currentTime);
        _o.frequency.exponentialRampToValueAtTime(3600, _ac.currentTime + 0.15);
        _g.gain.setValueAtTime(0, _ac.currentTime);
        _g.gain.linearRampToValueAtTime(0.45, _ac.currentTime + 0.01);
        _g.gain.exponentialRampToValueAtTime(0.0001, _ac.currentTime + 0.4);
        _o.connect(_g); _g.connect(_ac.destination);
        _o.start(); _o.stop(_ac.currentTime + 0.42);
      } catch(e) { console.warn('시작음 재생 실패:', e); }
    }

    if (currentWindow.label === "main" && !appState.hideWelcomeMessage) {
      new WebviewWindow('welcome', {
        url: 'index.html',
        title: 'Welcome to Tidy Task',
        width: 320,
        height: 480,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        visible: true,
        resizable: false,
        skipTaskbar: false
      });
    }

    // 첫 실행 환영 창과 겹치지 않게, 기존 사용자에게만 독립 공지 창을 띄웁니다.
    if (currentWindow.label === "main" && appState.hideWelcomeMessage) {
      await openUpdateNoticeWindow();
    }

    const isValidPos = (val) =>
      val !== null &&
      val !== undefined &&
      !isNaN(val) &&
      typeof val === "number";

    const isVisiblePos = 
      (val) => isValidPos(val) && val > -10000 && val < 20000;
    const isValidSize = (val) => isValidPos(val) && val > 0;

    if (currentWindow.label !== "settings") {
      // ✨ [TCREI: Persistence] 전체화면 상태 복원
      // 왜 크기/위치를 먼저 설정하는가: setFullscreen(true) 직전의 크기를 OS가 "이전 크기"로 기억합니다.
      // 이렇게 해야 앱 재시작 후 전체화면을 해제할 때 저장된 크기로 정확히 돌아갑니다.
      if (appState.isFullscreen) {
        // 1단계: 전체화면 진입 전의 크기/위치를 먼저 설정
        if (isVisiblePos(appState.windowPosX) && isVisiblePos(appState.windowPosY)) {
          try {
            await currentWindow.setPosition(
              new LogicalPosition(
                Math.round(appState.windowPosX),
                Math.round(appState.windowPosY),
              ),
            );
          } catch (e) {}
        }
        if (isValidSize(appState.windowWidth) && isValidSize(appState.windowHeight)) {
          try {
            await currentWindow.setSize(
              new LogicalSize(
                Math.round(appState.windowWidth),
                Math.round(appState.windowHeight),
              ),
            );
          } catch (e) {}
        }
        // 2단계: 그 후 전체화면 진입 → OS가 위의 크기를 "이전 크기"로 기억
        try {
          await currentWindow.setFullscreen(true);
        } catch (e) {
          console.warn("전체화면 복원 실패:", e);
        }
      } else {
        // 일반 상태: 기존 위치/크기 복원 로직 (기존 코드 완전 보존)
        if (isVisiblePos(appState.windowPosX) && isVisiblePos(appState.windowPosY)) {
          try {
            await currentWindow.setPosition(
              new LogicalPosition(
                Math.round(appState.windowPosX),
                Math.round(appState.windowPosY),
              ),
            );
          } catch (e) {
            console.warn("위치 복원 실패:", e);
          }
        }

        if (
          isValidSize(appState.windowWidth) &&
          isValidSize(appState.windowHeight)
        ) {
          try {
            // ✨ [TCREI: Integrity] 롤업 상태인 Tiny Note는 높이를 35로 강제 고정하여 레이아웃 경합으로 인한 빈 공간 발생을 완벽 방지
            // 저장된 크기를 현재 모니터 작업영역 안으로 먼저 가둡니다.
            const safe = clampSizeToScreen(appState.windowWidth, appState.windowHeight);
            let restoreWidth = safe.w;
            let restoreHeight = safe.h;
            if (appState.isRolledUp && currentWindow.label.startsWith("tinynote-")) {
              restoreHeight = 35;
            }

            await currentWindow.setSize(
              new LogicalSize(restoreWidth, restoreHeight),
            );

            // 클램프로 값이 줄어들었다면 상태에도 반영해 다음 실행부터 정상값이 되도록 합니다.
            if (!appState.isRolledUp) {
              appState.windowWidth = restoreWidth;
              appState.windowHeight = restoreHeight;
            }
          } catch (e) {
            console.warn("크기 복원 실패:", e);
          }
        }
      }

      setTimeout(async () => {
        try {
          await currentWindow.show();
          await currentWindow.setFocus();
        } catch (e) {}
      }, 50);

      // Tiny Note는 스냅과 위치 저장을 StickerWindow의 단일 네이티브 리스너가 담당합니다.
      if (!currentWindow.label.startsWith("tinynote-")) {
        try {
          unlistenMove = await currentWindow.onMoved(async (event) => {
            if (
              event.payload &&
              typeof event.payload.x === "number" &&
              typeof event.payload.y === "number"
            ) {
              try {
                if 
                  (event.payload.x <= -10000 || event.payload.y <= -10000) return;
                const scale = await currentWindow.scaleFactor();
                const logical = new PhysicalPosition(
                  event.payload.x,
                  event.payload.y,
                ).toLogical(scale);
            
                appState.windowPosX = logical.x;
                appState.windowPosY = logical.y;
                
                if (moveSaveTimeout) clearTimeout(moveSaveTimeout);
                moveSaveTimeout = setTimeout(() => {
                  appState.save();
                }, 300);
              } catch (e) {}
            }
          });
        } catch (e) {}
      }

      if (currentWindow.label === "main" || currentWindow.label.startsWith("note-")) {
        prevScreenY = window.screenY;
        prevInnerHeight = window.innerHeight;
        prevInnerWidth = window.innerWidth;
        prevPixelRatio = window.devicePixelRatio;

        window.addEventListener("resize", handleBrowserResize);
      }

    }

    if (currentWindow.label === "main") {
      const savedWindows = [
        ...($state.snapshot(appState.activeExtraWindows) || []),
      ];

      if (savedWindows.length > 0) {
        // reload() 제거: 스토어는 앱 전체가 인스턴스 하나를 공유하므로,
        //    여기서 디스크를 다시 읽으면 다른 창이 방금 set()한(아직 디스크에 안 쓴)
        //    내용이 옛 파일 내용으로 되돌려져 사라집니다. LazyStore가 알아서 읽어옵니다.
        const mainStore = new LazyStore("tidy-task-config.json");

        const validWindows = [];

        for (const label of savedWindows) {
          try {
            const winData = await mainStore.get(label);

            if (!winData) continue;

            const hasTodos = (winData.todos || []).length > 0;
            const hasArchived = (winData.archivedTodos || []).length > 0;
            
            // ✨ 1. 시작할 때도 HTML 찌꺼기 필터링을 거쳐 진짜 빈 창은 명부에서 영구 삭제
            const rawNotes = winData.notes || "";
            const cleanNotes = rawNotes.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, '').trim();
            const hasNotes = cleanNotes.length > 0;

            if (hasTodos || hasArchived || hasNotes) {
              validWindows.push(label);
              const tX = winData.windowPosX ?? null;
              const tY = winData.windowPosY ?? null;
              const tW = winData.windowWidth ?? null;
              const tH = winData.windowHeight ?? null;

              // ✨ 2. 일반 메모장과 Tiny Note의 태생적 크기, 투명도, 제목을 완벽히 구분해서 부활시킴
              let isTiny = label.startsWith("tinynote-");
              
              // 🚨 [TCREI: Integrity] 롤업 상태에서 끝난 창은 초기 높이를 35px로 강제합니다.
              // 왜: 기본값(280px)으로 생성하면 StickerWindow.onMount에서 롤업을 복원하기 전까지
              //     순간적으로 큰 창이 보였다가 줄어드는 깜박임이 발생합니다.
              const isRolledUp = winData.isRolledUp || false;
              
              let winOpts = {
                url: "index.html",
                title: isTiny ? `Tiny Note ${label.split('-')[1]}` : `Tidy Task Note ${label.split('-')[1]}`,
                width: isTiny ? 250 : 380,
                height: (isTiny && isRolledUp) ? 35 : (isTiny ? 280 : 500),
                minWidth: isTiny ? TINY_NOTE_MIN_WIDTH : 250,
                minHeight: (isTiny && isRolledUp) ? 35 : (isTiny ? 45 : 300),
                decorations: false,
                transparent: !isTiny, // Tiny Note는 transparent false 기반이어야 테마 배경색이 정상 적용됨
                visible: false,
              };

              if (isVisiblePos(tX) && isVisiblePos(tY)) {
                winOpts.x = Math.round(tX);
                winOpts.y = Math.round(tY);
              }

              await new Promise((resolve) => {
                try {
                  const subWin = new WebviewWindow(label, winOpts);
             
                  subWin.once("tauri://created", async () => {
                    // 🚨 [TCREI: Integrity] 롤업 상태인 창은 저장된 크기로 복원하지 않고,
                    // 35px로 고정합니다. StickerWindow.onMount에서 철벽 락을 걸어줍니다.
                    if (isRolledUp && isTiny) {
                      try {
                        await subWin.setMaxSize(null);
                        await subWin.setMinSize(new LogicalSize(TINY_NOTE_MIN_WIDTH, TINY_NOTE_ROLLED_HEIGHT));
                        // ✨ [TCREI: Integrity] tW는 Logical 단위로 저장되어 있으므로 devicePixelRatio 나누기 제거
                        await subWin.setSize(new LogicalSize(isValidSize(tW) ? Math.round(tW) : 250, 35));
                        await subWin.setResizable(false);
                      } catch(e) {}
                    } else if (winData.isFullscreen) {
                      // ✨ [TCREI: Persistence] 서브 창 전체화면 복원
                      // 크기/위치를 먼저 설정한 후 전체화면 진입 → OS가 "이전 크기" 기억
                      if (isValidSize(tW) && isValidSize(tH)) {
                        try { await subWin.setSize(new LogicalSize(Math.round(tW), Math.round(tH))); } catch(e) {}
                      }
                      try { await subWin.setFullscreen(true); } catch(e) {}
                    } else if (isValidSize(tW) && isValidSize(tH)) {
                      try {
                        // ✨ [TCREI: Integrity] 저장 단위가 Logical이므로 LogicalSize로 복원
                        // 왜 변경했는가: 이전 PhysicalSize를 사용하면 DPI 스케일링(125%)에서
                        // Logical 380px → Physical(380) → 실제 380/1.25=304px로 축소됨
                        // 서브 창도 동일하게 화면 작업영역 안으로 가둡니다.
                        const safeSub = clampSizeToScreen(tW, tH);
                        await subWin.setSize(
                          new LogicalSize(safeSub.w, safeSub.h),
                        );
                      } catch (e) {}
                    }
                    try {
                      await subWin.show();
                    } catch (_) {}
                    resolve();
                  });
                 
                  subWin.once("tauri://error", () => {
                    console.warn(
                      `[Tidy Task] ${label} 창 생성 오류 — 계속 진행`,
                    );
                    resolve(); 
                  });
                  setTimeout(resolve, 5000);

                } catch (e) {
                  console.warn(`[Tidy Task] ${label} WebviewWindow 예외:`, e);
                  resolve();
                }
              });
            }
          } catch (e) {
            console.log(`[Tidy Task] ${label} 소생 실패 — 스킵`);
          }
        }

        if (validWindows.length !== savedWindows.length) {
          await mainStore.set("activeExtraWindows", validWindows);
          await mainStore.save();
          appState.activeExtraWindows = validWindows;
        }
      }
    }

    unlistenClose = await currentWindow.onCloseRequested(async (event) => {
      const win = getCurrentWindow();
      if (win.label === "settings") return;

      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // ✨ Phase 3: 매니저 창이 닫힐 때 권한 승계를 위한 이벤트 송신
      if (appState.isManager) {
        appState.isManager = false;
        await emit('manager-closing');
      }

      try {
        const factor = await win.scaleFactor();
        const nativeFullscreen = await win.isFullscreen();
        appState.isFullscreen = nativeFullscreen;
        
        // ✨ [TCREI: Persistence] 전체화면 상태에서 닫을 때는 크기/위치를 덮어쓰지 않습니다.
        // 왜: 전체화면 해상도(1920×1080 등)가 일반 창 크기로 저장되면,
        //     다음 실행 시 전체화면이 아닌데 전체화면 크기의 기형적 창이 열립니다.
        if (!nativeFullscreen) {
          // setPosition() 과 같은 기준(outer)으로 저장해야 재시작 때 위치가 밀리지 않습니다.
          const pos = await win.outerPosition();
          const logicalPos = pos.toLogical(factor);
          appState.windowPosX = logicalPos.x;
          appState.windowPosY = logicalPos.y;

          // 롤업 높이(35px)는 정상 복원 크기가 아닙니다. 롤업 직전 높이를 보존합니다.
          if (!(win.label.startsWith("tinynote-") && appState.isRolledUp)) {
            const size = await win.innerSize();
            const logicalSize = size.toLogical(factor);
            appState.windowWidth = logicalSize.width;
            appState.windowHeight = logicalSize.height;
          }
        }
      } catch (e) {}

      // saveNow 대신 flushPendingSaves: 예약만 되고 아직 기록되지 않은 변경분까지
      //    모두 디스크에 밀어넣고, 쓰기 큐가 완전히 빌 때까지 기다린 뒤 창을 파괴합니다.
      await appState.flushPendingSaves(true);
      await win.destroy();
    });

    // 마지막 한 글자 방어: 창이 포커스를 잃거나 화면에서 숨겨질 때 예약 저장을 즉시 확정합니다.
    // 왜: PC 종료/절전처럼 앱이 정상 종료 절차를 밟지 못하는 상황에서는
    //     500ms 디바운스 타이머가 그대로 증발해 마지막 입력이 사라집니다.
    if (isDataWindow(currentWindow.label)) {
      try {
        unlistenFocus = await currentWindow.onFocusChanged(({ payload: focused }) => {
          if (!focused) appState.flushPendingSaves();
        });
      } catch (e) {}
    }

    document.addEventListener("visibilitychange", handleVisibilityFlush);
    window.addEventListener("pagehide", handleVisibilityFlush);

    if (appState.customFonts && appState.customFonts.length > 0) {
      for (const cf of appState.customFonts) {
        try {
          const assetUrl = convertFileSrc(cf.path);
          const font = new FontFace(cf.name, `url(${assetUrl})`);
          const loadedFont = await font.load();
          document.fonts.add(loadedFont);
        } catch (e) {
          console.warn(`Saved font ${cf.name} could not be loaded`, e);
        }
      }
    }

    if (currentWindow.label !== "settings") {
      try {
        const autostartEnabled = await isEnabled();
        if (!autostartEnabled) {
          await enable();
          console.log("윈도우 시작프로그램에 등록되었습니다!");
        }
      } catch (error) {
        console.error("자동 시작 등록 실패:", error);
      }
    }

    if (currentWindow.label !== "settings") {
      unlistenApplySettings = await listen(
        "req-apply-settings",
        async (event) => {
          const s = event.payload;

          if (s.targetWindow && s.targetWindow !== currentWindow.label) {
            // 다른 창을 위한 설정 이벤트이지만,
            // ✨ Phase 4: 매니저 창이라면 통합 리마인더 설정(알림 Off) 킬 스위치 발동
            if (appState.isManager) {
              const prevShowReminders = appState.showReminders;
              appState.showReminders = s.showReminders ?? true;
              
              if (!appState.showReminders && prevShowReminders) {
                 const existingWindow = await WebviewWindow.getByLabel('reminder');
                 if (existingWindow) await existingWindow.close();
              } else if (appState.showReminders && !prevShowReminders) {
                 setTimeout(() => appState.checkReminders(true), 300);
              }

              // ✨ 전체 무음 모드도 전역 동기화
              if (s.globalMuteSound !== undefined) {
                appState.globalMuteSound = s.globalMuteSound;
              }

              appState.saveNow();
            }
            return;
          }

          appState.fontSize = s.fontSize;
          appState.uiFontSize = s.uiFontSize;
          appState.themeColor = s.themeColor;
          appState.uiFontFamily = s.uiFontFamily;
          appState.isDarkMode = s.isDarkMode;
          appState.showArchived = s.showArchived;
          appState.showNotes = s.showNotes;
          
          const prevShowReminders = appState.showReminders;
          appState.showReminders = s.showReminders ?? true;
          
          // ✨ Phase 4 (자신이 타겟일 때도 매니저라면 킬 스위치 처리)
          if (appState.isManager) {
            if (appState.showReminders && !prevShowReminders) {
              setTimeout(() => appState.checkReminders(true), 300);
            } else if (!appState.showReminders && prevShowReminders) {
              const existingWindow = await WebviewWindow.getByLabel('reminder');
              if (existingWindow) await existingWindow.close();
            }
          }

          if (s.globalFont !== undefined && s.globalFont !== appState.fontFamily) {
            appState.applyFontToAllText(s.globalFont);
          }

          // ✨ 전체 무음 모드 동기화
          if (s.globalMuteSound !== undefined) {
            appState.globalMuteSound = s.globalMuteSound;
          }

          applyCSSVars();
          appState.saveNow();
        },
      );

      unlistenResetData = await currentWindow.listen(
        "req-reset-data",
        async () => {
          await appState.resetContent();
        },
      );

      unlistenResetConfig = await currentWindow.listen(
        "req-reset-config",
        () => {
          appState.fontFamily = "메이플스토리 L";
          appState.uiFontFamily = "메이플스토리 L";
          appState.customFonts = [];
          appState.fontSize = 10;
          appState.uiFontSize = 10;
          appState.themeColor = "amber";
          appState.opacity = 1.0;
          appState.isPinned = false;
          appState.isDarkMode = false;
          appState.showArchived = true;
          appState.showNotes = true;

          appState.todoHeight = 145;
          appState.windowWidth = 380;
          appState.windowHeight = 500;
          try {
            const win = getCurrentWindow();
            win.setSize(new PhysicalSize(380, 500));
          } catch (e) {}

          appState.applyFontToAllText("메이플스토리 L");
          applyCSSVars();
          appState.save();
        },
      );
    }

    if (currentWindow.label === "main") {
      unlistenAddFont = await listen("req-add-custom-font", async (event) => {
        const { name, path } = event.payload;

        if (!appState.customFonts.find((f) => f.name === name)) {
          appState.customFonts.push({ name, path });

          const fontStore = new LazyStore("tidy-task-config.json");
          let latestFonts = (await fontStore.get("customFonts")) || [];
          if (!latestFonts.find((f) => f.name === name)) {
            latestFonts.push({ name, path });
            await fontStore.set("customFonts", latestFonts);
            await fontStore.save();
          }

          try {
            const assetUrl = convertFileSrc(path);
            const font = new FontFace(name, `url(${assetUrl})`);
            const loadedFont = await font.load();
            document.fonts.add(loadedFont);
          } catch (e) {}
        }
      });

      const unlistenSpawnMain = await listen("spawn-new-window", () => {
        appState.spawnNewWindow();
      });

      const unlistenSpawnTiny = await listen("spawn-tiny-note", () => {
        appState.spawnTinyNote();
      });

      const unlistenResetCoordinates = await listen("req-reset-coordinates", async () => {
        let offsetX = 100;
        let offsetY = 100;
        const mainWin = await WebviewWindow.getByLabel('main');
        if (mainWin) {
          try {
            const factor = await mainWin.scaleFactor();
            await mainWin.setPosition(new LogicalPosition(offsetX, offsetY));
            await mainWin.show();
            await mainWin.unminimize();
            await mainWin.setFocus();
            
            // App.svelte 내부 상태와 동기화 (main 창 한정)
            appState.windowPosX = offsetX;
            appState.windowPosY = offsetY;
            appState.saveNow();
            
            offsetX += 30;
            offsetY += 30;
          } catch(e) {}
        }

        const mainStore = new LazyStore('tidy-task-config.json');
        const activeWindows = await mainStore.get('activeExtraWindows') || [];
        
        for (const label of activeWindows) {
           const win = await WebviewWindow.getByLabel(label);
           if (win) {
             try {
                const factor = await win.scaleFactor();
                await win.setPosition(new LogicalPosition(offsetX, offsetY));
                await win.show();
                await win.unminimize();
                await win.setFocus();

                // 디스크에도 새 위치 저장 (StickerWindow/NoteWindow가 다시 켤 때 참고하도록)
                let winData = await mainStore.get(label);
                if (winData) {
                   winData.windowPosX = offsetX;
                   winData.windowPosY = offsetY;
                   await mainStore.set(label, winData);
                }

                offsetX += 30;
                offsetY += 30;
             } catch(e) {}
           }
        }
        await mainStore.save();
      });

      // Cleanup
      const originalOnDestroy = onDestroy;
      unlistenAddFont = () => {
          unlistenSpawnMain();
          unlistenSpawnTiny();
          unlistenResetCoordinates();
      };
    }

    if (currentWindow.label !== "ctx-menu") {
      ctxWin = await WebviewWindow.getByLabel('ctx-menu');
      if (!ctxWin) {
        ctxWin = new WebviewWindow('ctx-menu', {
          url: 'index.html',
          title: 'ContextMenu',
          width: 250,
          height: 600,
          decorations: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          visible: false,
          resizable: false,
          shadow: false
        });
      }

      currentWindow.listen('ctx-action', async (ev) => {
        const action = ev.payload;
        if (action === 'undo') appState.undo();
        else if (action === 'redo') appState.redo();
        else if (action === 'toggle-edit') appState.toggleEditMode();
        else if (action === 'spawn-window') appState.spawnNewWindow();
        else if (action === 'toggle-archived') { appState.showArchived = !appState.showArchived; appState.save(); }
        else if (action === 'toggle-notes') { appState.showNotes = !appState.showNotes; appState.save(); }
        else if (action === 'cut') document.execCommand('cut');
        else if (action === 'copy') document.execCommand('copy');
        else if (action === 'paste') {
          try {
            const text = await navigator.clipboard.readText();
            document.execCommand('insertText', false, text);
          } catch (e) {}
        }
        else if (action === 'symbols') window.dispatchEvent(new CustomEvent('open-symbol-popup'));
        else if (action === 'open-settings') {
          const existingWin = await WebviewWindow.getByLabel('settings');
          const payload = {
            targetLabel: currentWindow.label,
            settings: appState.takeSnapshot()
          };

          if (existingWin) {
            try {
              await existingWin.show();
              await existingWin.unminimize();
              await existingWin.setFocus();
              setTimeout(() => emitTo('settings', 'set-settings-target', payload), 50);
            } catch (e) {}
          } else {
            const unlisten = await listen('settings-ready', async () => {
              await emitTo('settings', 'set-settings-target', payload);
              unlisten();
            });

            new WebviewWindow('settings', {
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
        else if (action === 'open-help') {
          try {
            const existingHelp = await WebviewWindow.getByLabel('help');

            if (existingHelp) {
              await existingHelp.show();
              await existingHelp.unminimize();
              await existingHelp.setFocus();
            } else {
              const helpWin = new WebviewWindow('help', {
                url: 'help.html',
                title: '기능 설명',
                width: 600,
                height: 700,
                decorations: true,
                transparent: false,
                alwaysOnTop: false,
                center: true,
                visible: true,
                resizable: true
              });
              helpWin.once('tauri://error', (e) => {
                console.warn('[Help] 창 생성 오류:', e);
              });
            }
          } catch (e) { console.warn('[Help] 열기 실패:', e); }
        }
        else if (action === 'export') {
          try {
            const filePath = await saveDialog({
              title: 'Tidy Task 메모장으로 내보내기',
              defaultPath: 'tidy-task-export.txt',
              filters: [{ name: 'Text Files', extensions: ['txt'] }]
            });

            if (filePath) {
              const content = appState.exportToTxt();
              await writeTextFile(filePath, content);
            }
          } catch (e) { console.warn('[Export] 내보내기 실패:', e); }
        }
        else if (action === 'import') {
          try {
            const filePath = await openDialog({
              title: 'Tidy Task 메모장 가져오기',
              filters: [{ name: 'Text Files', extensions: ['txt'] }],
              multiple: false
            });

            if (filePath) {
              const content = await readTextFile(filePath);
              await appState.importFromTxt(content);
            }
          } catch (e) { console.warn('[Import] 가져오기 실패:', e); }
        }
      });
    }
  });

  onDestroy(() => {
    if (unlistenApplySettings) unlistenApplySettings();
    if (unlistenResetData) unlistenResetData();
    if (unlistenResetConfig) unlistenResetConfig();
    if (unlistenAddFont) unlistenAddFont();
    if (unlistenClose) unlistenClose();
    if (unlistenMove) unlistenMove();
    if (unlistenFocus) unlistenFocus();
    window.removeEventListener("resize", handleBrowserResize);
    document.removeEventListener("visibilitychange", handleVisibilityFlush);
    window.removeEventListener("pagehide", handleVisibilityFlush);
    if (resizeSaveTimeout) clearTimeout(resizeSaveTimeout);
    if (moveSaveTimeout) clearTimeout(moveSaveTimeout);
  });

  $effect(() => {
    if (!appState.isReady) return;

    // ✨ [TCREI: Reactivity-Isolated] CSS 변수 재적용이 필요한 "설정 변경"만 트리거합니다.
    // 왜: 이전 코드에서는 appState.notes와 appState.todos도 여기에 포함되어 있었는데,
    //     이 두 값은 한 글자 입력할 때마다 변경되므로 매번 applyCSSVars()와 save()가
    //     불필요하게 실행되어 IME 조합을 방해하고, 이중 저장을 유발했습니다.
    //     notes/todos의 저장은 NoteEditor/TodoList 컴포넌트에서 이미 자체적으로 수행합니다.
    const triggers = [
      appState.fontFamily,
      appState.fontSize,
      appState.uiFontSize,
      appState.themeColor,
      appState.opacity,
      appState.isDarkMode,
      appState.showArchived,
      appState.showNotes,
    ];

    applyCSSVars();

    if (isFirstLoad) {
      isFirstLoad = false;
      return;
    }

    appState.save();
  });

  function confirmDelete() {
    appState.deleteSelected();
    showDeleteModal = false;
  }

  function isEditingActive() {
    const el = document.activeElement;
    return (
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        (el instanceof HTMLElement && el.isContentEditable))
    );
  }

  function handleGlobalKeydown(e) {
    // ✨ 자간 단축키: Alt+Shift+N (좁히기) / Alt+Shift+W (넓히기)
    if (e.altKey && e.shiftKey) {
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        appState.adjustLetterSpacing(-0.05);
        return;
      }
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault();
        appState.adjustLetterSpacing(0.05);
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      if (appState.isEditMode && appState.selectedTodoIds.length > 0) {
        const key = e.key.toLowerCase();
        if (key === 'b') { e.preventDefault(); appState.applyStyleToSelected('format', 'bold'); return; }
        if (key === 'i') { e.preventDefault(); appState.applyStyleToSelected('format', 'italic'); return; }
        if (key === 'u') { e.preventDefault(); appState.applyStyleToSelected('format', 'underline'); return; }
      }

      if (e.key.toLowerCase() === "z") {
        if (!isEditingActive()) {
          e.preventDefault();
          appState.undo();
        }
        return;
      }
      if (e.key.toLowerCase() === "y") {
        if (!isEditingActive()) {
          e.preventDefault();
          appState.redo();
        }
        return;
      }

      if (e.key.toLowerCase() === "c" && !isEditingActive()) {
        if (appState.isEditMode && appState.selectedTodoIds.length > 0) {
          e.preventDefault();
          let selectable = [...appState.filteredTodos];
          if (appState.showArchived) {
            selectable = [...selectable, ...appState.filteredArchivedTodos];
          }

          const selectedItemsInOrder = selectable
            .filter((t) => appState.selectedTodoIds.includes(t.id))
            .map((t) => {
              const temp = document.createElement("div");
              temp.innerHTML = t.text;
              return (temp.innerText || temp.textContent || "").trim();
            });

          if (selectedItemsInOrder.length > 0) {
            const copyText = selectedItemsInOrder.join("\n");
            navigator.clipboard
              .writeText(copyText)
              .then(() => {
                appState.triggerToast("copy");
              })
              .catch(console.error);
          }
        }
      }
    }
  }

  function handleGlobalPaste(e) {
    if (isEditingActive()) return;
    if (!appState.isEditMode) return;

    const text = (e.clipboardData || e.originalEvent?.clipboardData)?.getData(
      "text/plain",
    );
    if (!text) return;

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    if (lines.length > 10) {
      e.preventDefault();
      appState.triggerToast("limit");
      return;
    }

    e.preventDefault();
    appState.addMultipleTodos(lines);

    appState.triggerToast("paste");
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} onpaste={handleGlobalPaste} />

{#if getCurrentWindow().label === "settings"}
  <div class="h-screen w-screen bg-transparent overflow-hidden">
    <SettingsModal />
  </div>
{:else if getCurrentWindow().label === "ctx-menu"}
  <ContextMenu isStandalone={true} />
{:else if getCurrentWindow().label === "welcome"}
  <WelcomeWindow />
{:else if getCurrentWindow().label === UPDATE_NOTICE_WINDOW_LABEL}
  <UpdateNotice />
{:else if getCurrentWindow().label === "reminder"}
  <ReminderPopup />
{:else if getCurrentWindow().label.startsWith("tinynote-") && appState.isReady}
  <StickerWindow />
{:else if getCurrentWindow().label === "archive"}
  <ArchiveWindow />
{:else if appState.isReady}
  <div
    class="h-screen w-screen flex flex-col overflow-hidden relative shadow-2xl rounded-lg border-2 transition-opacity duration-100"
    style="
      border-color: {appState.isDarkMode
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(120,53,15,0.10)'};
      background-color: var(--global-theme-color);
      opacity: {appState.opacity};
      font-family: var(--ui-font-family);
      font-size: var(--ui-font-size);
    "
    oncontextmenu={handleBarContextMenu}
    role="presentation"
  >
    <!-- ✨ [세로 스냅] 위쪽 테두리 더블클릭 감지 영역 (4px 투명) -->
    <!-- 왜: decorations:false에서는 위쪽 테두리에 Titlebar가 덮여있어 OS의 세로 스냅이 작동하지 않습니다. -->
    <!-- 이 div가 최상단에서 더블클릭을 감지하여 세로 최대화를 대신 수행합니다. -->
    {#if !appState.isFullscreen && !appState.isRolledUp}
      <div
        class="absolute top-0 left-0 right-0 h-[4px] cursor-n-resize"
        style="z-index: 99999;"
        ondblclick={handleTopEdgeDblClick}
        role="presentation"
      ></div>
    {/if}

    <Titlebar onOpenSettings={() => {}} />

    <MainToolbar />

    <!-- 저장소를 읽지 못해 저장이 잠긴 상태를 사용자에게 분명히 알립니다.
         왜: 조용히 실패하면 사용자가 계속 입력하다가 나중에 통째로 잃습니다.
         이 배너가 보이는 동안 앱은 디스크에 아무것도 쓰지 않고, 백그라운드에서
         스스로 재시도하다가 성공하면 배너가 사라지고 원래 데이터를 되살립니다. -->
    {#if appState.storageError}
      <div
        transition:slide={{ duration: 150 }}
        class="shrink-0 px-3 py-1.5 text-[11px] font-bold flex items-center gap-2"
        style="background-color: rgba(239,68,68,0.14); color: {appState.isDarkMode ? '#fca5a5' : '#b91c1c'};"
      >
        <span>저장소를 읽지 못했습니다. 데이터 보호를 위해 저장을 잠시 멈췄어요 (자동 재시도 중)</span>
      </div>
    {/if}

    <!-- ✨ [업데이트 안내] 새 버전이 발견되면 뜨는 얇은 알림 띠입니다.
         왜 매니저 창에서만 뜨는가: 메모장을 여러 개 켜 두어도 같은 알림이 겹쳐 뜨지 않도록,
         리마인더와 동일하게 "매니저 권한을 가진 창 하나"만 사용자에게 말을 겁니다. -->
    {#if appState.isUpdateBannerVisible && appState.updateInfo}
      <UpdateBanner />
    {/if}

    {#if appState.isEditMode}
      <div
        transition:slide={{ duration: 150 }}
        class="flex items-center justify-between px-3 py-[3px] border-b shrink-0 z-10"
        style="background-color: {appState.isDarkMode
          ? 'rgba(245, 158, 11, 0.05)'
          : '#fffbeb'}; border-color: {appState.isDarkMode
          ? 'rgba(245, 158, 11, 0.1)'
          : '#fde68a'};"
      >
        <div class="flex items-center gap-2 pl-[24px]">
          <!-- ✨ [추가] 지능형 정렬 버튼 -->
          <button
            onclick={() => appState.toggleDeadlineSort()}
            class="text-[10px] font-bold px-2 py-[2px] rounded-full transition-all active:scale-95 flex items-center justify-center border shrink-0 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-600 shadow-sm"
            style="background-color: {appState.isDarkMode ? 'rgba(255,255,255,0.05)' : '#ffffff'}; border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; color: {appState.isDarkMode ? '#e2e8f0' : '#4b5563'};"
            title="마감일 기준 정렬"
          >
            정렬 {appState.sortOrder === 'asc' ? '🔽' : '🔼'}
          </button>

          <button
            onclick={() =>
              appState.selectedTodoIds.length > 0
                ? appState.deselectAll()
                : appState.selectAll()}
            class={`w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-sm cursor-pointer z-10 my-auto ${appState.selectedTodoIds.length > 0 ? "text-white" : appState.isDarkMode ? "border-gray-500 bg-[#252830]" : "border-gray-400 bg-white"}`}
            style={appState.selectedTodoIds.length > 0 ? `background-color: ${appState.getThemeAccentColor()}; border-color: ${appState.getThemeAccentColor()};` : null}
            title={appState.selectedTodoIds.length > 0
              ? "전체 해제"
              : "모두 선택"}
          >
            {#if appState.selectedTodoIds.length > 0}
              <Check size={11} strokeWidth={4} />
            {/if}
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            onclick={() => appState.archiveSelected()}
            disabled={appState.selectedTodoIds.length === 0}
            class="text-[9px] font-bold px-2 py-[3px] rounded text-white hover:brightness-110 disabled:opacity-30 disabled:grayscale transition-all active:scale-95 flex items-center justify-center"
            style="background-color: {appState.getThemeAccentColor()};"
          >
            마감
          </button>

          <button
            onclick={() => (showDeleteModal = true)}
            disabled={appState.selectedTodoIds.length === 0}
            class="w-5 h-5 flex items-center justify-center rounded-md text-red-400 hover:text-red-500 hover:bg-red-50/50 disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
            title="삭제"
          >
            <Eraser size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    {/if}

    <div
      class="flex flex-col overflow-hidden relative"
      style="flex: 1 1 0; min-height: 0;"
    >
      <div
        class="relative flex flex-col pt-1 pb-1 overflow-hidden"
        style="min-height: 145px; flex: 1 1 0;"
      >
        <TodoList />
      </div>

      {#if appState.showNotes || appState.showArchived}
        <div
          class="h-1.5 w-full cursor-row-resize z-20 flex items-center justify-center transition-colors hover:bg-black/5"
          style="flex: 0 0 6px;"
          role="separator"
          tabindex="-1"
          onpointerdown={startSplitterDrag}
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
        <!-- 보관함은 내용이 늘어나도 창을 밀어내지 못하도록 줄어들 수 있는 박스로 만듭니다.
             flex: 0 1 auto + min-height:0 + max-height:40% 이면 공간이 부족할 때 스스로 줄어들고,
             내부는 ArchivedList가 스크롤로 처리합니다. -->
        <div
          bind:clientHeight={archivedHeight}
          class="transition-colors duration-300 border-t flex flex-col overflow-hidden"
          style="flex: 0 1 auto; min-height: 0; max-height: 40%; background-color: var(--global-section-bg); border-top-color: var(--global-border-color);"
        >
          <ArchivedList />
        </div>
      {/if}

      {#if appState.showNotes}
        <div
          style="flex: 0 0 {appState.notesHeight}px; min-height: 140px; max-height: 240px; background-color: var(--global-section-bg); border-top-color: var(--global-border-color);"
          class="relative flex flex-col transition-colors duration-300 border-t overflow-hidden"
        >
          <NoteEditor />
        </div>
      {/if}
    </div>

    {#if showDeleteModal}
      <div
        transition:fade={{ duration: 150 }}
        class="absolute inset-0 flex items-center justify-center p-4 bg-black/20 backdrop-blur-[2px]"
        style="z-index: 99999;"
      >
        <div
          transition:scale={{ duration: 200, start: 0.95 }}
          class="w-[220px] rounded-xl shadow-2xl flex flex-col overflow-hidden border"
          style="
            background-color: {appState.isDarkMode
            ? '#252830'
            : getTidyTheme(appState.themeColor).tidy.bg};
            border-color: {appState.isDarkMode
            ? 'rgba(255,255,255,0.1)'
            : 'rgba(0,0,0,0.08)'};
"
        >
          <div class="px-4 py-5 text-center flex flex-col gap-1">
            <span
              class="text-[12px] font-bold"
              style="color: {appState.isDarkMode ? '#e2e8f0' : '#1f2937'};"
            >
              선택한 항목 삭제
            </span>
            <span
              class="text-[10px]"
              style="color: {appState.isDarkMode ? '#94a3b8' : '#6b7280'};"
            >
              정말로 완전히 지울까요?
            </span>
          </div>

          <div
            class="flex border-t"
            style="border-color: {appState.isDarkMode
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.06)'};"
          >
            <button
              onclick={() => (showDeleteModal = false)}
              class="flex-1 py-2 text-[11px] font-bold transition-colors active:bg-black/5"
              style="color: {appState.isDarkMode
                ? '#94a3b8'
                : '#6b7280'}; border-right: 1px solid {appState.isDarkMode
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(0,0,0,0.06)'};"
            >
              취소
            </button>
            <button
              onclick={confirmDelete}
              class="flex-1 py-2 text-[11px] font-bold text-red-500 transition-colors hover:text-red-600 active:bg-red-500/10"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if appState.showMaxWindowToast}
      <div
        transition:scale={{ duration: 300, start: 0.8, opacity: 0 }}
        class="absolute inset-0 flex items-center justify-center pointer-events-none px-4"
        style="z-index: 99999;"
      >
        <div
          class="px-4 py-2.5 rounded-[20px] shadow-xl flex items-center gap-2 border"
          style="
            background-color: {appState.isDarkMode
            ? 'rgba(2, 44, 34, 0.95)'
            : 'rgba(240, 253, 244, 0.95)'}; 
            backdrop-filter: blur(4px);
            border-color: {appState.isDarkMode
            ? 'rgba(52, 211, 153, 0.2)'
            : 'rgba(74, 222, 128, 0.4)'};
            box-shadow: 0 8px 25px rgba(5, 150, 105, 0.15);
          "
        >
          <span class="text-[14px] leading-none mb-[1px]">🌱</span>
          <span
            class="text-[11px] font-extrabold tracking-tight"
            style="color: {appState.isDarkMode ? '#6ee7b7' : '#059669'};"
          >
            더이상 생성할 수 없습니다(최대 10개)
          </span>
        </div>
      </div>
    {/if}

    {#if appState.showPasteLimitToast || appState.showCopySuccessToast || appState.showPasteSuccessToast}
      <div
        transition:scale={{ duration: 300, start: 0.8, opacity: 0 }}
        class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none px-4"
        style="z-index: 99999;"
      >
        {#if appState.showPasteLimitToast}
          <div
            class="px-4 py-2.5 rounded-[20px] shadow-xl flex items-center gap-2 border"
            style="
              background-color: {appState.isDarkMode
              ? 'rgba(69, 10, 10, 0.95)'
              : 'rgba(254, 242, 242, 0.95)'}; 
              backdrop-filter: blur(4px);
              border-color: {appState.isDarkMode
              ? 'rgba(248, 113, 113, 0.2)'
              : 'rgba(248, 113, 113, 0.4)'};
              box-shadow: 0 8px 25px rgba(220, 38, 38, 0.15);
            "
          >
            <span class="text-[14px] leading-none mb-[1px]">🚫</span>
            <span
              class="text-[11px] font-extrabold tracking-tight"
              style="color: {appState.isDarkMode ? '#fca5a5' : '#dc2626'};"
            >
              10줄 이상 붙여넣기는 불가합니다.
            </span>
          </div>
        {:else if appState.showCopySuccessToast}
          <div
            class="px-5 py-3 rounded-[20px] shadow-xl flex flex-col items-center justify-center gap-1 border text-center"
            style="
              background-color: {appState.isDarkMode
              ? 'rgba(30, 58, 138, 0.95)'
              : 'rgba(239, 246, 255, 0.95)'}; 
              backdrop-filter: blur(4px);
              border-color: {appState.isDarkMode
              ? 'rgba(96, 165, 250, 0.2)'
              : 'rgba(96, 165, 250, 0.4)'};
              box-shadow: 0 8px 25px rgba(37, 99, 235, 0.15);
            "
          >
            <span
              class="text-[18px] leading-none mb-0.5"
              style="animation: bounce 1s infinite;">📋</span
            >
            <span
              class="text-[11px] font-extrabold tracking-tight"
              style="color: {appState.isDarkMode
                ? '#93c5fd'
                : '#2563eb'}; line-height: 1.4;"
            >
              내용을 복사했습니다!<br />이제 붙여넣기 해보세요
            </span>
          </div>
        {:else if appState.showPasteSuccessToast}
          <div
            class="px-4 py-2.5 rounded-[20px] shadow-xl flex items-center gap-2 border"
            style="
              background-color: {appState.isDarkMode
              ? 'rgba(20, 83, 45, 0.95)'
              : 'rgba(240, 253, 244, 0.95)'}; 
              backdrop-filter: blur(4px);
              border-color: {appState.isDarkMode
              ? 'rgba(74, 222, 128, 0.2)'
              : 'rgba(74, 222, 128, 0.4)'};
              box-shadow: 0 8px 25px rgba(22, 163, 74, 0.15);
            "
          >
            <span class="text-[14px] leading-none mb-[1px]">✨</span>
            <span
              class="text-[11px] font-extrabold tracking-tight"
              style="color: {appState.isDarkMode ? '#86efac' : '#16a34a'};"
            >
              할 일 목록에 추가되었습니다!
            </span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- ✨ [업데이트 안내] 배너를 누르면 열리는 단계별 안내 창 -->
    {#if appState.isUpdateGuideOpen}
      <UpdateGuide />
    {/if}

    <!-- ✨ [업데이트 안내] 설정에서 직접 확인했을 때의 "이미 최신" 응답 -->
    {#if appState.showUpToDateToast}
      <div
        transition:scale={{ duration: 300, start: 0.8, opacity: 0 }}
        class="absolute inset-0 flex items-center justify-center pointer-events-none px-4"
        style="z-index: 99999;"
      >
        <div
          class="px-4 py-2.5 rounded-[20px] shadow-xl flex items-center gap-2 border"
          style="
            background-color: {appState.isDarkMode
            ? 'rgba(20, 83, 45, 0.95)'
            : 'rgba(240, 253, 244, 0.95)'};
            backdrop-filter: blur(4px);
            border-color: {appState.isDarkMode
            ? 'rgba(74, 222, 128, 0.2)'
            : 'rgba(74, 222, 128, 0.4)'};
            box-shadow: 0 8px 25px rgba(22, 163, 74, 0.15);
          "
        >
          <span class="text-[14px] leading-none mb-[1px]">✅</span>
          <span
            class="text-[11px] font-extrabold tracking-tight"
            style="color: {appState.isDarkMode ? '#86efac' : '#16a34a'};"
          >
            이미 최신 버전을 쓰고 계세요!
          </span>
        </div>
      </div>
    {/if}
  </div>

  <FloatingRTE />
{:else}
  <div
    class="h-screen w-screen flex flex-col items-center justify-center transition-colors"
    style="background-color: {appState.isDarkMode ? '#23272e' : '#f4ebce'};"
  >
    <div class="animate-pulse flex flex-col items-center gap-2">
      <span
        class="text-[11px] font-bold tracking-widest"
        style="color: {appState.isDarkMode ? '#6b7280' : '#d97706'};"
      >
        내용을 불러오는 중...
      </span>
    </div>
  </div>
{/if}
