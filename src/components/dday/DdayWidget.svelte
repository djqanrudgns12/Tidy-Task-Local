<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ChevronLeft,
    ChevronRight,
    Ellipsis,
    Flag,
    Pin,
    PinOff,
    Plus,
    Repeat,
    X,
  } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit, listen } from '@tauri-apps/api/event';
  import { DDAY_WIDGET_STATE_EVENT } from '../../lib/dday/ddayWidgetWindow.js';
  import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { watchCustomFonts } from '../../lib/toolkit/appearance.js';
  import { registerFontFace } from '../../lib/fonts.js';
  import { ensureWindowOnScreen, getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { toolkitDrag } from '../../lib/toolkit/drag.js';
  import { readLaunchAtStartup, setLaunchAtStartup } from '../../lib/autostart.js';
  import { track } from '../../lib/analytics.js';
  import { resolveMenuWidth } from '../../lib/windows/contextMenuLayout.js';
  import { normalizeThemeId } from '../../lib/themes.js';
  import {
    DDAY_APPEARANCE_MODES,
    DDAY_WIDGET_BOUNDS,
    computeProgressPercent,
    formatDotDate,
    normalizeDdayWidgetPrefs,
    savedDdayGeometry,
    stripHtmlToTitle,
    todayDateKey,
    type DdayAppearanceMode,
    type DdaySkin,
    type DdayWidgetPrefs,
  } from '../../lib/dday/ddayModel.js';
  import { computeWidgetLayout } from '../../lib/dday/ddayLayout.js';
  import {
    applyDdayWindowBounds,
    captureWindowGeometry,
    snapWidgetRectToEdges,
  } from '../../lib/dday/ddayWindowBounds.js';
  import {
    DDAY_EVENTS,
    collectAllNoteWindowsDdays,
    createDdayWidgetSection,
    flattenWidgetItems,
    openDdayControlWindow,
    subscribeDdayStore,
    type DdayWindowSnapshot,
  } from '../../lib/dday/ddaySync.js';
  import {
    resolveWidgetThemeSource,
    resolveWidgetThemeTokens,
    widgetThemeToStyle,
  } from '../../lib/dday/ddayWidgetTheme.js';
  import { ddayWidgetMenu } from '../../lib/dday/ddayWidgetMenuClient.svelte.js';
  import {
    normalizeMenuState,
    returnsFocusToWidget,
  } from '../../lib/dday/ddayWidgetMenuProtocol.js';
  import DdayIcon from './DdayIcon.svelte';
  import DdayResizeHandles from './DdayResizeHandles.svelte';
  import DdayWidgetSettingsPanel from './DdayWidgetSettingsPanel.svelte';
  import './dday-widget.css';

  let windows = $state<DdayWindowSnapshot[]>([]);
  let prefs = $state.raw(normalizeDdayWidgetPrefs(undefined));
  let ready = $state(false);
  let closing = $state(false);
  let today = $state(todayDateKey());
  let currentIndex = $state(0);

  // 개발 미리보기 전용 URL 파라미터 오버라이드
  let previewSkinOverride = $state<DdaySkin | null>(null);
  let previewSchemeOverride = $state<'light' | 'dark' | null>(null);
  let previewThemeOverride = $state<string | null>(null);
  let previewW = $state(DDAY_WIDGET_BOUNDS.defaultWidth);
  let previewH = $state(DDAY_WIDGET_BOUNDS.defaultHeight);
  let previewEmpty = $state(false);
  let previewMenuOpen = $state(false);
  let previewPanelRef = $state<DdayWidgetSettingsPanel | null>(null);

  let boardEl = $state<HTMLElement>();
  let menuBtnEl = $state<HTMLButtonElement | null>(null);
  let boardW = $state(DDAY_WIDGET_BOUNDS.defaultWidth);
  let boardH = $state(DDAY_WIDGET_BOUNDS.defaultHeight);
  let committedTier = $state<'micro' | 'standard' | 'expanded' | null>(null);

  let pinBusy = $state(false);
  let isDragging = $state(false);
  let isSnapping = false;
  let dragCommitSeq = 0;
  let startupEnabled = $state(true);
  let startupBusy = $state(false);
  let programmaticMoveUntil = 0;
  let customFonts: { name: string; path: string }[] = [];

  const widgetSection = createDdayWidgetSection({
    onChange: (next: DdayWidgetPrefs) => {
      prefs = next;
    },
  });

  const effectiveSkin = $derived<DdaySkin>(previewSkinOverride ?? prefs.skin);
  const inScopeEntries = $derived(
    previewEmpty ? [] : flattenWidgetItems(windows, prefs.displayScope, today),
  );
  const visibleEntries = $derived(
    inScopeEntries.filter((entry) => !prefs.hiddenIds.includes(entry.key)),
  );

  $effect(() => {
    if (visibleEntries.length === 0) currentIndex = 0;
    else if (currentIndex >= visibleEntries.length) currentIndex = visibleEntries.length - 1;
  });

  const currentEntry = $derived(visibleEntries[currentIndex] ?? null);
  const nextEntry = $derived(
    visibleEntries.length >= 2
      ? visibleEntries[(currentIndex + 1) % visibleEntries.length]
      : null,
  );

  const themeSource = $derived(
    resolveWidgetThemeSource(windows, prefs.displayScope, currentEntry),
  );
  const themeTokens = $derived(
    resolveWidgetThemeTokens({
      themeColor: previewThemeOverride ?? themeSource.themeColor,
      isDarkMode: themeSource.isDarkMode,
      appearanceMode: prefs.appearanceMode,
      itemTone: currentEntry?.item.tone ?? 'accent',
      previewDarkOverride: previewSchemeOverride ? previewSchemeOverride === 'dark' : null,
    }),
  );
  const themeStyle = $derived(widgetThemeToStyle(themeTokens));
  const effectiveDark = $derived(themeTokens.effectiveDark);
  const uiFontCss = $derived(`"${themeSource.uiFontFamily.replace(/[";{}<>\\]/g, '')}", "Malgun Gothic", sans-serif`);

  const currentProgress = $derived(
    currentEntry ? computeProgressPercent(currentEntry.item, today) : 0,
  );
  const widgetLayout = $derived(
    computeWidgetLayout({
      width: boardW,
      height: boardH,
      label: currentEntry?.counter.label ?? 'D-5',
      prevTier: committedTier,
    }),
  );

  const menuOpen = $derived(native ? ddayWidgetMenu.isOpen : previewMenuOpen);

  const menuStatePayload = $derived.by(() => ({
    prefs,
    effectiveSkin,
    effectiveDark,
    startupEnabled,
    startupBusy,
    pinBusy,
    themeStyle,
    accentHex: themeTokens.accent,
    fontFamily: uiFontCss,
    uiFontSize: themeSource.uiFontSize,
    menuWidth: resolveMenuWidth('dw-menu', themeSource.uiFontSize),
    windows: windows.map((w) => ({
      label: w.label,
      title: stripHtmlToTitle(w.title, 20) || (w.label === 'main' ? '기본 할 일' : w.label),
    })),
    entries: inScopeEntries.map((entry) => ({
      key: entry.key,
      title: entry.item.title,
      tone: entry.item.tone,
      checked: !prefs.hiddenIds.includes(entry.key),
      counterLabel: entry.counter.label,
      windowTitle: entry.windowTitle,
    })),
  }));

  const normalizedPreviewMenuState = $derived(
    !native ? normalizeMenuState(menuStatePayload) : null,
  );

  $effect(() => {
    if (native && ddayWidgetMenu.isOpen) {
      ddayWidgetMenu.sync(menuStatePayload);
    }
  });

  // 메모 창이 사용자 등록 글꼴을 쓰는 경우 위젯 창 웹뷰에도 즉시 불러옵니다.
  $effect(() => {
    if (!native) return;
    const match = customFonts.find((cf) => cf.name === themeSource.uiFontFamily);
    if (match) void registerFontFace(match.name, match.path);
  });

  function resolveDragThreshold(target: Element | null, pointerType: string): number {
    const touch = pointerType === 'touch';
    if (target?.closest('.dw-mac-btn')) return touch ? 14 : 10;
    if (target?.closest('.dw-nav-btn, .dw-empty-btn')) return touch ? 12 : 8;
    if (target?.closest('.w4-hero-btn, .w1-flap-btn, .w4-title-btn, .w1-title-btn')) {
      return touch ? 10 : 5;
    }
    return touch ? 8 : 4;
  }

  function shouldIgnoreDragTarget(target: Element | null): boolean {
    return Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function handleDragStart() {
    isDragging = true;
    dragCommitSeq += 1;
    menuToggleIntent = false;
    clearTimeout(saveTimer);
    clearTimeout(snapTimer);
    if (menuOpen) closeMenu('widget-moved', false);
  }

  function handleDragEnd(payload: import('../../lib/toolkit/dragMachine.js').DragEndEvent) {
    isDragging = false;
    clearTimeout(saveTimer);
    clearTimeout(snapTimer);
    if (!native) return;
    if (payload.reason === 'os-fallback') return;
    programmaticMoveUntil = Math.max(programmaticMoveUntil, performance.now() + 300);
    if (payload.moved && !payload.cancelled) {
      void commitDragPosition();
    }
  }

  function patch(value: Partial<typeof prefs>) {
    if (!native) {
      if ('appearanceMode' in value) previewSchemeOverride = null;
      prefs = normalizeDdayWidgetPrefs({ ...prefs, ...value });
    }
    widgetSection.mutate((cur) => ({ ...cur, ...value }));
  }

  function selectSkin(nextSkin: DdaySkin) {
    if (previewSkinOverride) previewSkinOverride = nextSkin;
    if (prefs.skin !== nextSkin) {
      patch({ skin: nextSkin });
      track('dday_skin_changed', { choice: nextSkin });
    }
  }

  function toggleHiddenEntry(entryKey: string) {
    const exists = prefs.hiddenIds.includes(entryKey);
    const nextHidden = exists
      ? prefs.hiddenIds.filter((id) => id !== entryKey)
      : [...prefs.hiddenIds, entryKey];
    patch({ hiddenIds: nextHidden });
  }

  function cycleEntry(dir: -1 | 1) {
    const len = visibleEntries.length;
    if (len < 2) return;
    currentIndex = (currentIndex + dir + len) % len;
  }

  let wheelLockUntil = 0;
  function handleWheel(e: WheelEvent) {
    if (menuOpen || visibleEntries.length < 2) return;
    const now = performance.now();
    if (now < wheelLockUntil) return;
    if (Math.abs(e.deltaY) < 18 && Math.abs(e.deltaX) < 18) return;
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    cycleEntry(delta > 0 ? 1 : -1);
    wheelLockUntil = now + 200;
  }

  async function toggleTop() {
    if (pinBusy) return;
    if (!native) {
      patch({ alwaysOnTop: !prefs.alwaysOnTop });
      return;
    }
    pinBusy = true;
    const previous = prefs.alwaysOnTop;
    const nextVal = !previous;
    try {
      await getCurrentWindow().setAlwaysOnTop(nextVal);
      const res = await widgetSection.mutateAndConfirm(
        (cur) => ({ ...cur, alwaysOnTop: nextVal }),
        (cur) => cur.alwaysOnTop === nextVal,
      );
      if (res !== 'saved') {
        await getCurrentWindow().setAlwaysOnTop(previous).catch(() => {});
      } else if (ddayWidgetMenu.isOpen) {
        await ddayWidgetMenu.raiseAboveHost();
      }
    } catch {
      await getCurrentWindow().setAlwaysOnTop(previous).catch(() => {});
    } finally {
      pinBusy = false;
    }
  }

  async function toggleStay() {
    const nextVal = !prefs.autoOpen;
    if (!nextVal) {
      patch({ autoOpen: false });
      return;
    }
    if (!native) {
      patch({ autoOpen: true });
      return;
    }
    const captured = await captureWindowGeometry(getCurrentWindow(), DDAY_WIDGET_BOUNDS).catch(() => null);
    await widgetSection.mutateAndConfirm(
      (cur) => ({ ...cur, autoOpen: true, geometry: captured ?? cur.geometry }),
      (cur) => cur.autoOpen === true,
    );
  }

  async function enableStartupNow() {
    if (startupBusy) return;
    startupBusy = true;
    try {
      startupEnabled = native ? await setLaunchAtStartup(true) : true;
    } catch {
      // ignore failure softly
    } finally {
      startupBusy = false;
    }
  }

  async function centerOnScreen() {
    if (!native) return;
    const w = getCurrentWindow();
    const monitors = await getMonitorGeometries();
    const pos = await w.outerPosition();
    const size = await w.outerSize();
    const m =
      monitors.find(
        (mon) =>
          pos.x >= mon.bounds.x &&
          pos.x < mon.bounds.x + mon.bounds.width &&
          pos.y >= mon.bounds.y &&
          pos.y < mon.bounds.y + mon.bounds.height,
      ) ?? monitors[0];
    if (m) {
      const targetX = Math.round(m.work.x + (m.work.width - size.width) / 2);
      const targetY = Math.round(m.work.y + (m.work.height - size.height) / 2);
      programmaticMoveUntil = performance.now() + 450;
      await w.setPosition(new PhysicalPosition(targetX, targetY));
      await saveGeometry(prefs.autoOpen);
      if (ddayWidgetMenu.isOpen) {
        await ddayWidgetMenu.reposition();
      }
    }
  }

  async function openControl(focusId: string | null = null, winLabel?: string, openCreate = false) {
    if (!native) {
      const url = new URL(location.href);
      url.search = '?dday-control-preview';
      window.open(url.toString(), '_blank', 'width=410,height=640');
      return;
    }
    await openDdayControlWindow({
      requesterLabel: winLabel || currentEntry?.windowLabel || 'main',
      focusDdayId: focusId,
      openCreate,
    });
  }

  function handleMenuAction(action: string, payload: Record<string, any> = {}) {
    switch (action) {
      case 'select-skin':
        if (payload.skin === 'w1' || payload.skin === 'w4') selectSkin(payload.skin);
        break;
      case 'set-appearance':
        if (DDAY_APPEARANCE_MODES.includes(payload.appearanceMode)) {
          patch({ appearanceMode: payload.appearanceMode as DdayAppearanceMode });
        }
        break;
      case 'set-scope':
        if (typeof payload.displayScope === 'string' && payload.displayScope.trim()) {
          patch({ displayScope: payload.displayScope.trim() });
          currentIndex = 0;
        }
        break;
      case 'toggle-hidden':
        if (typeof payload.entryKey === 'string') toggleHiddenEntry(payload.entryKey);
        break;
      case 'toggle-top':
        void toggleTop();
        break;
      case 'toggle-stay':
        void toggleStay();
        break;
      case 'enable-startup':
        void enableStartupNow();
        break;
      case 'center':
        void centerOnScreen();
        break;
      case 'open-control':
        closeMenu('action');
        void openControl(currentEntry?.item.id ?? null, currentEntry?.windowLabel);
        break;
      default:
        break;
    }
  }

  let menuToggleIntent = false;
  function handleMenuBtnPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    menuToggleIntent = native ? ddayWidgetMenu.isToggleTarget() : previewMenuOpen;
  }

  function handleMenuBtnClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const viaKeyboard = e.detail === 0;
    const intent = menuToggleIntent;
    menuToggleIntent = false;
    if (intent && !viaKeyboard) {
      closeMenu('toggle');
      return;
    }
    void openSettingsPopup({ viaKeyboard });
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isDragging) return;
    void openSettingsPopup({ viaKeyboard: false });
  }

  async function openSettingsPopup({ viaKeyboard = false } = {}) {
    if (!native) {
      previewMenuOpen = true;
      return;
    }
    await ddayWidgetMenu.open({
      viaKeyboard,
      triggerEl: menuBtnEl,
      state: menuStatePayload,
      onAction: handleMenuAction,
      onClosed: (reason) => {
        if (returnsFocusToWidget(reason)) {
          boardEl?.focus({ preventScroll: true });
        }
      },
    });
  }

  function closeMenu(reason = 'requester', toggleGrace = true) {
    if (!native) {
      previewMenuOpen = false;
      if (returnsFocusToWidget(reason)) boardEl?.focus({ preventScroll: true });
      return;
    }
    ddayWidgetMenu.close(reason, { toggleGrace });
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen && !native) {
      if (previewPanelRef?.handleEscape()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      closeMenu('escape');
      return;
    }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      void openSettingsPopup({ viaKeyboard: true });
      return;
    }
    if (!menuOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      cycleEntry(e.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  let saveTimer: ReturnType<typeof setTimeout>;
  let snapTimer: ReturnType<typeof setTimeout>;

  async function commitDragPosition() {
    const seq = ++dragCommitSeq;
    if (!native || !ready || closing || isDragging) return;
    await snapToEdgeIfNear(seq);
    if (seq !== dragCommitSeq || isDragging || closing) return;
    if (prefs.autoOpen) await saveGeometry();
  }

  async function saveGeometry(force = false) {
    if (!native || !ready || !(force || prefs.autoOpen)) return;
    try {
      const captured = await captureWindowGeometry(getCurrentWindow(), DDAY_WIDGET_BOUNDS);
      if (captured) patch({ geometry: captured });
    } catch {}
  }

  async function snapToEdgeIfNear(commitSeq?: number): Promise<boolean> {
    if (!native || !ready || isSnapping || isDragging || closing) return false;
    try {
      const w = getCurrentWindow();
      const [minimized, maximized, fullscreen] = await Promise.all([
        w.isMinimized().catch(() => false),
        w.isMaximized().catch(() => false),
        w.isFullscreen().catch(() => false),
      ]);
      if (minimized || maximized || fullscreen || isDragging || closing) return false;
      if (commitSeq !== undefined && commitSeq !== dragCommitSeq) return false;
      const [pos, size, monitors] = await Promise.all([
        w.outerPosition(),
        w.outerSize(),
        getMonitorGeometries(),
      ]);
      if (isDragging || closing) return false;
      if (commitSeq !== undefined && commitSeq !== dragCommitSeq) return false;
      const snapped = snapWidgetRectToEdges(
        { x: pos.x, y: pos.y, width: size.width, height: size.height },
        monitors,
      );
      if (snapped.snapped) {
        if (isDragging || closing) return false;
        if (commitSeq !== undefined && commitSeq !== dragCommitSeq) return false;
        isSnapping = true;
        programmaticMoveUntil = Math.max(programmaticMoveUntil, performance.now() + 300);
        try {
          await w.setPosition(new PhysicalPosition(snapped.x, snapped.y));
          return true;
        } finally {
          setTimeout(() => {
            isSnapping = false;
          }, 120);
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async function closeWidget() {
    if (closing) return;
    closing = true;
    clearTimeout(saveTimer);
    clearTimeout(snapTimer);
    closeMenu('widget-closed', false);
    try {
      const withTimeout = (p: Promise<unknown>, ms = 400) =>
        Promise.race([p.catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms))]);
      await withTimeout(saveGeometry());
      await withTimeout(widgetSection.settle());
    } catch {
      // 저장 실패나 타임아웃이 위젯 닫기를 막지 않도록 무시합니다.
    } finally {
      if (native) {
        await emit(DDAY_WIDGET_STATE_EVENT, false).catch(() => {});
        try {
          await closeWindow();
        } catch {
          await getCurrentWindow().close().catch(() => {});
        }
      } else {
        window.close();
      }
    }
  }

  function mergeWindowSnapshot(label: string, nextSnap: DdayWindowSnapshot) {
    const idx = windows.findIndex((w) => w.label === label);
    if (idx >= 0) windows = windows.map((w, i) => (i === idx ? nextSnap : w));
    else windows = [...windows, nextSnap];
  }

  function refreshDay() {
    today = todayDateKey();
  }

  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    const register = (fn: () => void) => {
      if (disposed) fn();
      else offs.push(fn);
    };

    if (!native) {
      const params = new URLSearchParams(location.search);
      const skinParam = params.get('skin');
      if (skinParam === 'w1' || skinParam === 'w4') previewSkinOverride = skinParam;
      const schemeParam = params.get('scheme');
      if (schemeParam === 'dark' || schemeParam === 'light') previewSchemeOverride = schemeParam;
      if (params.has('dark')) previewSchemeOverride = params.get('dark') === '0' ? 'light' : 'dark';
      const themeParam = params.get('theme');
      if (themeParam) previewThemeOverride = normalizeThemeId(themeParam);
      const wParam = Number(params.get('w'));
      const hParam = Number(params.get('h'));
      if (Number.isFinite(wParam) && wParam >= DDAY_WIDGET_BOUNDS.minWidth && wParam <= DDAY_WIDGET_BOUNDS.maxWidth) {
        previewW = Math.round(wParam);
      }
      if (Number.isFinite(hParam) && hParam >= DDAY_WIDGET_BOUNDS.minHeight && hParam <= DDAY_WIDGET_BOUNDS.maxHeight) {
        previewH = Math.round(hParam);
      }
      if (params.has('empty')) previewEmpty = true;
    }

    const onPreviewSync = (ev: Event) => {
      const d = (ev as CustomEvent).detail;
      if (d?.label && d?.snapshot) mergeWindowSnapshot(d.label, d.snapshot);
    };
    window.addEventListener('tidy-dday-preview-sync', onPreviewSync);

    let ro: ResizeObserver | null = null;
    if (boardEl && typeof ResizeObserver !== 'undefined') {
      const measure = (w: number, h: number) => {
        if (w <= 0 || h <= 0) return;
        const prevW = boardW;
        const prevH = boardH;
        boardW = w;
        boardH = h;
        const nextTier = computeWidgetLayout({
          width: w,
          height: h,
          label: currentEntry?.counter.label ?? 'D-5',
          prevTier: committedTier,
        }).tier;
        committedTier = nextTier;
        if (native && ddayWidgetMenu.isOpen && (Math.abs(w - prevW) >= 2 || Math.abs(h - prevH) >= 2)) {
          closeMenu('widget-resized', false);
        }
      };
      const initRect = boardEl.getBoundingClientRect();
      measure(initRect.width, initRect.height);
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          measure(entry.contentRect.width, entry.contentRect.height);
        }
      });
      ro.observe(boardEl);
    }

    void (async () => {
      try {
        if (native) {
          try {
            register(
              await watchCustomFonts((fonts) => {
                customFonts = fonts;
              }),
            );
          } catch {}
        }

        try {
          register(
            await subscribeDdayStore(({ section, revision }) => {
              if (section === 'widget') void widgetSection.external(revision);
            }),
          );
        } catch {}

        await Promise.all([
          widgetSection.load().catch(() => {}),
          collectAllNoteWindowsDdays()
            .then((list) => {
              if (!disposed) windows = list;
            })
            .catch(() => {}),
        ]);

        if (native) {
          startupEnabled = await readLaunchAtStartup().catch(() => true);
          try {
            register(
              await listen(DDAY_EVENTS.windowUpdated, (ev) => {
                const p = ev.payload as any;
                if (p?.label && p?.snapshot) mergeWindowSnapshot(p.label, p.snapshot);
              }),
            );
          } catch {}
        } else {
          startupEnabled = false;
        }

        if (disposed) return;

        if (native) {
          const w = getCurrentWindow();
          try {
            const g = savedDdayGeometry(prefs);
            if (g) {
              await applyDdayWindowBounds(w, g, DDAY_WIDGET_BOUNDS);
            } else {
              await w.setMinSize(new LogicalSize(DDAY_WIDGET_BOUNDS.minWidth, DDAY_WIDGET_BOUNDS.minHeight)).catch(() => {});
              await ensureWindowOnScreen(w);
            }
          } catch {}

          await w.setAlwaysOnTop(prefs.alwaysOnTop).catch(() => {});

          const scheduleSave = () => {
            if (isDragging) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
              if (!isDragging) void saveGeometry();
            }, 350);
          };
          const scheduleMove = () => {
            // 직접 드래그 중에는 종료 시점(handleDragEnd)에 스냅·저장을 1회만 수행하므로 중도 인터럽트를 차단합니다.
            if (isDragging) return;
            if (performance.now() < programmaticMoveUntil) return;
            if (ddayWidgetMenu.isOpen) {
              closeMenu('widget-moved', false);
            }
            scheduleSave();
            clearTimeout(snapTimer);
            snapTimer = setTimeout(() => {
              if (!isDragging) void snapToEdgeIfNear();
            }, 240);
          };

          try {
            register(await w.onMoved(scheduleMove));
            register(
              await w.onResized(() => {
                scheduleSave();
                if (ddayWidgetMenu.isOpen) closeMenu('widget-resized', false);
              }),
            );
            register(
              await w.onCloseRequested((e) => {
                e.preventDefault();
                void closeWidget();
              }),
            );
          } catch {}

          ready = true;
          await w.show().catch(() => {});
          await w.setFocus().catch(() => {});
          await emit(DDAY_WIDGET_STATE_EVENT, true).catch(() => {});
          ddayWidgetMenu.schedulePrewarm(1200);
        } else {
          ready = true;
          if (new URLSearchParams(location.search).has('menu')) {
            previewMenuOpen = true;
          }
        }
      } finally {
        ready = true;
        if (native && !disposed) {
          const w = getCurrentWindow();
          void w.show().catch(() => {});
        }
      }
    })();

    const interval = setInterval(refreshDay, 60_000);
    window.addEventListener('focus', refreshDay);

    return () => {
      disposed = true;
      ro?.disconnect();
      ddayWidgetMenu.dispose();
      offs.forEach((fn) => fn());
      clearInterval(interval);
      clearTimeout(saveTimer);
      clearTimeout(snapTimer);
      window.removeEventListener('focus', refreshDay);
      window.removeEventListener('tidy-dday-preview-sync', onPreviewSync);
      widgetSection.dispose();
    };
  });
</script>

<svelte:window onkeydown={keydown} />

<div
  class="dw-root"
  class:is-preview={!native}
  data-scheme={effectiveDark ? 'dark' : 'light'}
  data-tier={widgetLayout.tier}
  style="{themeStyle};--dw-num-scale:{widgetLayout.numScale};--dw-icon-sz:{widgetLayout.iconSize}px;font-family:{uiFontCss};"
>
  <div class="dw-stage" style={!native ? `width:${previewW}px;height:${previewH}px;` : undefined}>
    <main
      bind:this={boardEl}
      class="dw-board"
      class:is-dragging={isDragging}
      tabindex="-1"
      aria-label="D-Day 위젯"
      oncontextmenu={handleContextMenu}
      onwheel={handleWheel}
      ondragstart={(e) => e.preventDefault()}
      use:toolkitDrag={{
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
        thresholdForTarget: resolveDragThreshold,
        shouldIgnore: shouldIgnoreDragTarget,
      }}
    >
      <div
        class="dw-shell"
        class:is-w1={Boolean(currentEntry) && effectiveSkin !== 'w4'}
        class:is-w4={Boolean(currentEntry) && effectiveSkin === 'w4'}
        class:is-empty={!currentEntry}
      >
        {#if !currentEntry}
          <div class="dw-empty-inner">
            <span class="dw-empty-icon"><Flag size={16} strokeWidth={2.2} /></span>
            <strong>위젯에 표시할 D-Day 없음</strong>
            <small>컨트롤 타워에서 위젯 채널을 켜거나 새 일정을 추가해 보세요.</small>
            <button
              type="button"
              class="dw-empty-btn"
              onclick={() => void openControl(null, 'main', true)}
            >
              <Plus size={12} strokeWidth={2.5} />
              <span>D-Day 추가</span>
            </button>
          </div>
        {:else if effectiveSkin === 'w4'}
          <!-- SKIN W-4: 인-프레임 마스킹테이프 폴라로이드 -->
          <div class="w4-frame">
            <svg class="w4-tape" viewBox="0 0 88 22" aria-hidden="true">
              <defs>
                <pattern id="dw-washi-stripe" width="6" height="6" patternTransform="rotate(28)" patternUnits="userSpaceOnUse">
                  <rect width="3" height="6" fill="var(--dw-tape-stripe)" />
                </pattern>
              </defs>
              <path
                d="M2,2 L5,5.5 L1,9 L5,12.5 L1,16 L4,19.5 L84,19.5 L87,16 L83,12.5 L87,9 L83,5.5 L86,2 Z"
                fill="var(--dw-tape-fill)"
              />
              <path
                d="M2,2 L5,5.5 L1,9 L5,12.5 L1,16 L4,19.5 L84,19.5 L87,16 L83,12.5 L87,9 L83,5.5 L86,2 Z"
                fill="url(#dw-washi-stripe)"
              />
            </svg>

            <div class="w4-mat">
              <div class="w4-mat-top">
                <DdayIcon
                  icon={currentEntry.item.icon}
                  tone={currentEntry.item.tone}
                  accent={themeTokens.accent}
                  size="var(--dw-icon-sz, 22px)"
                  dark={effectiveDark}
                />
              </div>

              <button
                type="button"
                class="w4-hero-btn"
                onclick={() => void openControl(currentEntry.item.id, currentEntry.windowLabel)}
                title="클릭하여 D-Day 컨트롤 열기 · 잡고 끌면 이동"
              >
                <span
                  class="w4-number tnum"
                  class:imminent={currentEntry.counter.state === 'today' || currentEntry.counter.state === 'imminent'}
                  class:overdue={currentEntry.counter.state === 'overdue'}
                >
                  {currentEntry.counter.label}
                </span>
                <span class="w4-mat-date tnum">
                  {#if currentEntry.item.repeatYearly}매년 {/if}{formatDotDate(currentEntry.counter.effectiveDate)}
                </span>
              </button>
            </div>

            <div class="w4-chin">
              <button
                type="button"
                class="w4-title-btn"
                onclick={() => void openControl(currentEntry.item.id, currentEntry.windowLabel)}
                title={`${currentEntry.item.title} (${currentEntry.windowTitle})`}
              >
                <span class="w4-title">{currentEntry.item.title}</span>
              </button>

              {#if visibleEntries.length >= 2}
                <div class="w4-pager" role="group" aria-label="D-Day 전환">
                  <button
                    type="button"
                    class="dw-nav-btn"
                    aria-label="이전 D-Day"
                    onclick={(e) => { e.stopPropagation(); cycleEntry(-1); }}
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <span class="dw-nav-count tnum">{currentIndex + 1}/{visibleEntries.length}</span>
                  <button
                    type="button"
                    class="dw-nav-btn"
                    aria-label="다음 D-Day"
                    onclick={(e) => { e.stopPropagation(); cycleEntry(1); }}
                  >
                    <ChevronRight size={11} />
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- SKIN W-1: 인-프레임 데스크 플립 캘린더 -->
          <div class="w1-card">
            <div class="w1-topband">
              <div class="w1-rings" aria-hidden="true">
                {#each [0, 1] as _ring}
                  <svg class="w1-ring-svg" viewBox="0 0 16 14">
                    <circle cx="8" cy="10.5" r="2.5" fill="var(--dw-ring-hole)" />
                    <path
                      d="M4.5,10.5 C4.5,3.5 6,1.5 8,1.5 C10,1.5 11.5,3.5 11.5,10.5"
                      fill="none"
                      stroke="var(--dw-ring-stroke)"
                      stroke-width="2.2"
                      stroke-linecap="round"
                    />
                    <path
                      d="M6.2,9.2 C6.2,4.5 7,2.8 8,2.8"
                      fill="none"
                      stroke="var(--dw-ring-highlight)"
                      stroke-opacity="0.72"
                      stroke-width="0.9"
                      stroke-linecap="round"
                    />
                  </svg>
                {/each}
              </div>

              <div class="w1-top-left">
                <DdayIcon
                  icon={currentEntry.item.icon}
                  tone={currentEntry.item.tone}
                  accent={themeTokens.accent}
                  size="var(--dw-icon-sz, 20px)"
                  dark={effectiveDark}
                />
                <span class="w1-scope-tag">
                  {#if currentEntry.item.repeatYearly}
                    <Repeat size={9} style="display:inline;vertical-align:-1px;margin-right:2px;" />
                  {/if}
                  {currentEntry.windowTitle}
                </span>
              </div>
            </div>

            <div class="w1-body">
              <button
                type="button"
                class="w1-flap-btn"
                onclick={() => void openControl(currentEntry.item.id, currentEntry.windowLabel)}
                title="클릭하여 D-Day 컨트롤 열기 · 잡고 끌면 이동"
              >
                <span class="w1-hinge" aria-hidden="true"></span>
                <span
                  class="w1-number tnum"
                  class:imminent={currentEntry.counter.state === 'today' || currentEntry.counter.state === 'imminent'}
                  class:overdue={currentEntry.counter.state === 'overdue'}
                >
                  {currentEntry.counter.label}
                </span>
              </button>

              <div class="w1-caption">
                <button
                  type="button"
                  class="w1-title-btn"
                  onclick={() => void openControl(currentEntry.item.id, currentEntry.windowLabel)}
                  title={currentEntry.item.title}
                >
                  <span class="w1-title">{currentEntry.item.title}</span>
                </button>
                <span class="w1-date tnum">
                  {#if currentEntry.item.repeatYearly}매년 {/if}{formatDotDate(currentEntry.counter.effectiveDate)}
                </span>
              </div>

              <div class="w1-extra">
                <div class="w1-bar" aria-hidden="true">
                  <i style="width: {currentProgress}%;"></i>
                </div>
                <div class="w1-extra-row">
                  <span class="tnum">진행률 {currentProgress}%</span>
                  {#if nextEntry}
                    <span class="w1-next-peek tnum">다음: {nextEntry.item.title} ({nextEntry.counter.label})</span>
                  {/if}
                </div>
              </div>
            </div>

            {#if visibleEntries.length >= 2}
              <div class="w1-pager" role="group" aria-label="D-Day 전환">
                <button
                  type="button"
                  class="dw-nav-btn"
                  aria-label="이전 D-Day"
                  onclick={(e) => { e.stopPropagation(); cycleEntry(-1); }}
                >
                  <ChevronLeft size={11} />
                </button>
                <span class="dw-nav-count tnum">{currentIndex + 1} / {visibleEntries.length}</span>
                <button
                  type="button"
                  class="dw-nav-btn"
                  aria-label="다음 D-Day"
                  onclick={(e) => { e.stopPropagation(); cycleEntry(1); }}
                >
                  <ChevronRight size={11} />
                </button>
              </div>
            {/if}

            <div class="w1-paper-stack" aria-hidden="true">
              <span class="w1-stack-1"></span>
              <span class="w1-stack-2"></span>
            </div>
          </div>
        {/if}

        <!-- 통합 우측 상단 macOS 감성 호버 컨트롤 (평소 완전 숨김 · 구역 호버/초점/메뉴 열림 시 활성화) -->
        <div class="dw-ctrl-zone" class:is-open={menuOpen}>
          <div
            class="dw-mac-dock"
            role="group"
            aria-label="창 제어"
          >
            <button
              type="button"
              class="dw-mac-btn dw-mac-pin"
              class:is-active={prefs.alwaysOnTop}
              aria-pressed={prefs.alwaysOnTop}
              aria-label={prefs.alwaysOnTop ? '항상 위 고정 해제' : '항상 위에 고정'}
              title={prefs.alwaysOnTop ? '고정 해제' : '항상 위에'}
              disabled={pinBusy}
              onclick={(e) => { e.stopPropagation(); void toggleTop(); }}
            >
              {#if prefs.alwaysOnTop}
                <Pin size={10} strokeWidth={2.4} />
              {:else}
                <PinOff size={10} strokeWidth={2.2} />
              {/if}
            </button>
            <button
              bind:this={menuBtnEl}
              type="button"
              class="dw-mac-btn dw-mac-menu"
              class:is-active={menuOpen}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-label="위젯 설정"
              title="위젯 설정"
              onpointerdown={handleMenuBtnPointerDown}
              onclick={handleMenuBtnClick}
            >
              <Ellipsis size={11} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              class="dw-mac-btn dw-mac-close"
              aria-label="위젯 닫기"
              title="닫기"
              onclick={(e) => { e.stopPropagation(); void closeWidget(); }}
            >
              <X size={10.5} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>

  {#if !native && previewMenuOpen && normalizedPreviewMenuState}
    <div class="dw-preview-popover" data-scheme={effectiveDark ? 'dark' : 'light'}>
      <DdayWidgetSettingsPanel
        bind:this={previewPanelRef}
        state={normalizedPreviewMenuState}
        maxHeight={520}
        onaction={handleMenuAction}
        onclose={() => closeMenu('close-btn')}
      />
    </div>
  {/if}

  <!-- 8방향 창 크기 조절 핸들: cornerSize=10(0..9px)으로 닫기 버튼(12px+)과 0px 충돌 보장 -->
  <DdayResizeHandles
    {native}
    edgeSize={5}
    cornerSize={10}
    onResizeStart={() => closeMenu('widget-resized', false)}
  />
</div>
