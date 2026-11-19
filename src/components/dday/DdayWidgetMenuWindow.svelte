<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { emit, emitTo, listen } from '@tauri-apps/api/event';
  import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
  import DdayWidgetSettingsPanel from './DdayWidgetSettingsPanel.svelte';
  import {
    DDAY_WIDGET_MENU_CLOSE_REASONS,
    DDAY_WIDGET_MENU_EVENTS as EV,
    DEFAULT_MENU_EDGE,
    MAX_MENU_HEIGHT,
    normalizeOpenPayload,
    normalizeSyncPayload,
    placeDdayWidgetMenu,
    returnsFocusToWidget,
    type DdayWidgetMenuState,
  } from '../../lib/dday/ddayWidgetMenuProtocol.js';
  import {
    resolveWidgetThemeSource,
    resolveWidgetThemeTokens,
    widgetThemeToStyle,
  } from '../../lib/dday/ddayWidgetTheme.js';
  import { normalizeDdayWidgetPrefs } from '../../lib/dday/ddayModel.js';
  import { resolveMenuWidth } from '../../lib/windows/contextMenuLayout.js';
  import { createSerialQueue } from '../../lib/storage/serialQueue.js';
  import { registerFontFace } from '../../lib/fonts.js';
  import { watchCustomFonts } from '../../lib/toolkit/appearance.js';
  import { ensureWindowOnScreen, getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { pickMonitorForRect } from '../../lib/windows/popupPlacement.js';

  const native = isTauri();
  const win = native ? getCurrentWindow() : null;
  const ops = createSerialQueue();

  const FONT_WAIT_MS = 180;
  const DRAG_QUIET_MS = 500;
  const BLUR_CONFIRM_MS = 70;

  type OpenReq = NonNullable<ReturnType<typeof normalizeOpenPayload>>;
  type Placement = ReturnType<typeof placeDdayWidgetMenu>;

  let session = $state.raw<Omit<OpenReq, 'state'> | null>(null);
  let menuState = $state.raw<DdayWidgetMenuState | null>(null);
  let maxHeight = $state(MAX_MENU_HEIGHT);
  let revealed = $state(false);
  let slotEl = $state<HTMLDivElement | null>(null);
  let panelRef = $state<DdayWidgetSettingsPanel | null>(null);

  let latestOpenId: string | null = null;
  let phase: 'hidden' | 'preparing' | 'shown' | 'hiding' = 'hidden';
  let hadFocus = false;
  let detached = false;
  let lastPlacement: Placement | null = null;
  let dragUntil = 0;
  let dragEndTimer: ReturnType<typeof setTimeout> | null = null;
  let programmaticMoveUntil = 0;
  let suppressBlurUntil = 0;
  let blurCheckPending = false;
  let customFonts: { name: string; path: string }[] = [];

  const isDragging = () => performance.now() < dragUntil;
  const isBlurSuppressed = () => performance.now() < suppressBlurUntil;
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () =>
    Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))),
      delay(50),
    ]);

  // ── 브라우저 단독 미리보기 (?dday-widget-menu-preview) 상태 ──
  const previewParams = !native ? new URLSearchParams(location.search) : null;
  const previewInitTheme = previewParams?.get('theme') || 'periwinkle';
  const previewInitDark = previewParams?.has('dark') || previewParams?.get('scheme') === 'dark';
  const previewInitSkin = previewParams?.get('skin') === 'w4' ? 'w4' : 'w1';
  const previewWindows = [
    { label: 'main', title: '기본 할 일', themeColor: previewInitTheme, isDarkMode: previewInitDark, uiFontFamily: 'Pretendard', uiFontSize: 10 },
    { label: 'note-1', title: '수업 준비 메모', themeColor: 'sea-glass', isDarkMode: true, uiFontFamily: 'Pretendard', uiFontSize: 10 },
  ];
  const previewRawItems = [
    { key: 'main:p1', windowLabel: 'main', windowTitle: '기본 할 일', title: 'AI 분야 동아리 운영일지 및 강사…', tone: 'accent' as const, counterLabel: 'D-6' },
    { key: 'main:p2', windowLabel: 'main', windowTitle: '기본 할 일', title: '마스터교원 성찰보고서 제출', tone: 'rose' as const, counterLabel: 'D-2' },
    { key: 'note-1:p3', windowLabel: 'note-1', windowTitle: '수업 준비 메모', title: '겨울방학식 준비물 안내', tone: 'sky' as const, counterLabel: 'D-36' },
  ];
  let previewPrefs = $state.raw(
    normalizeDdayWidgetPrefs({
      skin: previewInitSkin,
      appearanceMode: previewParams?.get('appearance') || 'auto',
      displayScope: 'all',
      hiddenIds: [],
      alwaysOnTop: false,
      autoOpen: false,
    }),
  );
  let previewStartupEnabled = $state(true);

  const previewState = $derived.by<DdayWidgetMenuState | null>(() => {
    if (native) return null;
    const entriesInScope = previewRawItems.filter(
      (item) => previewPrefs.displayScope === 'all' || item.windowLabel === previewPrefs.displayScope,
    );
    const activeEntry = entriesInScope.find((item) => !previewPrefs.hiddenIds.includes(item.key)) || null;
    const src = resolveWidgetThemeSource(previewWindows, previewPrefs.displayScope, activeEntry);
    const tokens = resolveWidgetThemeTokens({
      themeColor: src.themeColor,
      isDarkMode: src.isDarkMode,
      appearanceMode: previewPrefs.appearanceMode,
      itemTone: 'accent',
    });
    return {
      prefs: previewPrefs,
      effectiveSkin: previewPrefs.skin,
      effectiveDark: tokens.effectiveDark,
      startupEnabled: previewStartupEnabled,
      startupBusy: false,
      pinBusy: false,
      themeStyle: widgetThemeToStyle(tokens),
      accentHex: tokens.accent,
      fontFamily: '"Pretendard", "Malgun Gothic", sans-serif',
      uiFontSize: src.uiFontSize,
      menuWidth: resolveMenuWidth('dw-menu', src.uiFontSize),
      windows: previewWindows.map((w) => ({ label: w.label, title: w.title })),
      entries: entriesInScope.map((e) => ({
        key: e.key,
        title: e.title,
        tone: e.tone,
        checked: !previewPrefs.hiddenIds.includes(e.key),
        counterLabel: e.counterLabel,
        windowTitle: e.windowTitle,
      })),
    };
  });

  function handlePreviewAction(action: string, payload: Record<string, any> = {}) {
    switch (action) {
      case 'select-skin':
        previewPrefs = normalizeDdayWidgetPrefs({ ...previewPrefs, skin: payload.skin });
        break;
      case 'set-appearance':
        previewPrefs = normalizeDdayWidgetPrefs({ ...previewPrefs, appearanceMode: payload.appearanceMode });
        break;
      case 'set-scope':
        previewPrefs = normalizeDdayWidgetPrefs({ ...previewPrefs, displayScope: payload.displayScope });
        break;
      case 'toggle-hidden': {
        const exists = previewPrefs.hiddenIds.includes(payload.entryKey);
        const hiddenIds = exists
          ? previewPrefs.hiddenIds.filter((id) => id !== payload.entryKey)
          : [...previewPrefs.hiddenIds, payload.entryKey];
        previewPrefs = normalizeDdayWidgetPrefs({ ...previewPrefs, hiddenIds });
        break;
      }
      case 'toggle-top':
        previewPrefs = normalizeDdayWidgetPrefs({ ...previewPrefs, alwaysOnTop: !previewPrefs.alwaysOnTop });
        break;
      case 'toggle-stay':
        previewPrefs = normalizeDdayWidgetPrefs({ ...previewPrefs, autoOpen: !previewPrefs.autoOpen });
        break;
      case 'enable-startup':
        previewStartupEnabled = true;
        break;
      default:
        break;
    }
  }

  // ── 네이티브 창 제어 로직 ──
  async function ensureStateFontsLoaded(state: DdayWidgetMenuState) {
    const tasks: Promise<unknown>[] = [];
    for (const cf of customFonts) {
      if (state.fontFamily.includes(cf.name)) {
        tasks.push(registerFontFace(cf.name, cf.path));
      }
    }
    tasks.push(document.fonts.load(`${state.uiFontSize}pt ${state.fontFamily}`, '가D-5').catch(() => {}));
    await Promise.race([Promise.all(tasks), delay(FONT_WAIT_MS)]);
  }

  function measurePanel(fallbackWidth = 264) {
    const rect = slotEl?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) {
      return { width: fallbackWidth, height: 420 };
    }
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  }

  async function applyGeometry(p: Placement, currentScale: number) {
    if (!win) return;
    const size = new LogicalSize(p.width / p.scale, p.height / p.scale);
    const position = new PhysicalPosition(p.x, p.y);
    const crossesScale = Math.abs(currentScale - p.scale) > 0.01;
    for (let pass = 0; pass < (crossesScale ? 2 : 1); pass += 1) {
      programmaticMoveUntil = performance.now() + 260;
      await win.setSize(size);
      await win.setPosition(position);
    }
    programmaticMoveUntil = performance.now() + 260;
  }

  async function verifyGeometry(p: Placement) {
    if (!win) return;
    try {
      const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
      const off =
        Math.abs(pos.x - p.x) > 1 ||
        Math.abs(pos.y - p.y) > 1 ||
        Math.abs(size.width - p.width) > 2 ||
        Math.abs(size.height - p.height) > 2;
      if (!off || detached || isDragging()) return;
      programmaticMoveUntil = performance.now() + 260;
      await win.setSize(new PhysicalSize(p.width, p.height));
      await win.setPosition(new PhysicalPosition(p.x, p.y));
    } catch {}
  }

  function noteDragActivity() {
    dragUntil = performance.now() + DRAG_QUIET_MS;
    if (dragEndTimer) return;
    const check = () => {
      if (isDragging()) {
        dragEndTimer = setTimeout(check, 120);
        return;
      }
      dragEndTimer = null;
      void finishDrag();
    };
    dragEndTimer = setTimeout(check, DRAG_QUIET_MS);
  }

  async function finishDrag() {
    if (!win || phase !== 'shown') return;
    try {
      if (!(await win.isFocused())) await win.setFocus();
    } catch {}
    programmaticMoveUntil = performance.now() + 260;
    await ensureWindowOnScreen(win);
  }

  function notifyClosed(s: { requestId: string; requester: string }, reason: string) {
    void emitTo(s.requester, EV.closed, { requestId: s.requestId, reason }).catch(() => {});
  }

  async function focusRequester(label: string) {
    try {
      const target = await WebviewWindow.getByLabel(label);
      if (target) await target.setFocus();
    } catch {}
  }

  function handleOpen(payload: unknown) {
    const req = normalizeOpenPayload(payload);
    if (!req) return;
    void emitTo(req.requester, EV.opened, { requestId: req.requestId }).catch(() => {});
    latestOpenId = req.requestId;
    void ops.enqueue(() => present(req));
  }

  async function present(req: OpenReq) {
    if (latestOpenId !== req.requestId) return;
    const previous = session;
    if (previous && previous.requestId !== req.requestId) {
      notifyClosed(previous, 'superseded');
    }
    try {
      await presentSteps(req);
    } catch (e) {
      console.warn('D-Day 위젯 설정 창을 띄우지 못했습니다:', e);
      if (session?.requestId === req.requestId) {
        notifyClosed(req, 'error');
        session = null;
        menuState = null;
        revealed = false;
        phase = 'hidden';
        try {
          await win?.hide();
        } catch {}
      }
    }
  }

  async function presentSteps(req: OpenReq) {
    if (!win) return;
    phase = 'preparing';
    hadFocus = false;
    detached = false;
    revealed = false;

    const [monitors, currentScale] = await Promise.all([
      getMonitorGeometries(),
      win.scaleFactor().catch(() => window.devicePixelRatio || 1),
    ]);
    if (latestOpenId !== req.requestId) return;

    const targetMon = pickMonitorForRect(req.anchor, monitors);
    const monScale = targetMon && targetMon.scale > 0 ? targetMon.scale : currentScale || 1;
    maxHeight = targetMon
      ? Math.min(MAX_MENU_HEIGHT, Math.max(220, Math.floor(targetMon.work.height / monScale - DEFAULT_MENU_EDGE * 2)))
      : MAX_MENU_HEIGHT;

    menuState = req.state;
    session = {
      requestId: req.requestId,
      requester: req.requester,
      anchor: req.anchor,
      viaKeyboard: req.viaKeyboard,
    };
    await tick();
    await ensureStateFontsLoaded(req.state);
    await tick();
    if (latestOpenId !== req.requestId) return;

    const size = measurePanel(req.state.menuWidth);
    const placement = placeDdayWidgetMenu({
      anchor: req.anchor,
      size,
      monitors,
      fallbackScale: currentScale,
    });
    maxHeight = placement.maxLogicalHeight;
    await applyGeometry(placement, currentScale);
    if (latestOpenId !== req.requestId) return;
    lastPlacement = placement;

    await win.setAlwaysOnTop(true).catch(() => {});
    await win.show();
    await win.setFocus();
    revealed = true;
    phase = 'shown';
    await tick();
    panelRef?.focusFirst();
    await verifyGeometry(placement);
    scheduleFocusCheck(req.requestId);
  }

  function scheduleFocusCheck(id: string) {
    setTimeout(async () => {
      if (!win || phase !== 'shown' || session?.requestId !== id || isDragging() || isBlurSuppressed()) return;
      try {
        if (await win.isFocused()) {
          hadFocus = true;
          return;
        }
        if (hadFocus) requestClose('blur');
        else await win.setFocus();
      } catch {}
    }, 250);
  }

  async function confirmBlurThenClose() {
    if (!win || blurCheckPending) return;
    blurCheckPending = true;
    try {
      for (const wait of [BLUR_CONFIRM_MS, 350]) {
        await delay(wait);
        if (phase !== 'shown') return;
        if (isDragging() || isBlurSuppressed()) {
          await delay(300);
          if (phase !== 'shown' || isDragging() || isBlurSuppressed()) continue;
        }
        if (!(await win.isFocused().catch(() => false))) {
          requestClose('blur');
          return;
        }
      }
    } finally {
      blurCheckPending = false;
    }
  }

  function requestClose(reason: string) {
    const s = session;
    if (!s || phase === 'hiding' || phase === 'hidden') return;
    if (phase === 'preparing' && latestOpenId === s.requestId) latestOpenId = null;
    phase = 'hiding';
    void ops.enqueue(async () => {
      if (session !== s) {
        if (phase === 'hiding') phase = session ? 'shown' : 'hidden';
        return;
      }
      notifyClosed(s, reason);
      if (returnsFocusToWidget(reason)) await focusRequester(s.requester);
      revealed = false;
      await nextFrame();
      if (session === s) {
        session = null;
        menuState = null;
      }
      try {
        await win?.hide();
      } catch {}
      phase = 'hidden';
    });
  }

  function handleSync(payload: unknown) {
    const sync = normalizeSyncPayload(payload);
    if (!sync || !session) return;
    if (sync.requestId && sync.requestId !== session.requestId) return;
    menuState = sync.state;
    if (sync.anchor) {
      session = { ...session, anchor: sync.anchor };
    }
  }

  function handleCloseRequest(payload: unknown) {
    const p = payload as any;
    const id = p?.requestId;
    if (typeof id !== 'string') return;
    const reason = DDAY_WIDGET_MENU_CLOSE_REASONS.includes(p?.reason) ? p.reason : 'requester';
    if (session?.requestId === id) {
      requestClose(reason);
      return;
    }
    if (latestOpenId === id && typeof p?.requester === 'string') {
      latestOpenId = null;
      void emitTo(p.requester, EV.closed, { requestId: id, reason }).catch(() => {});
    }
  }

  async function refit(forceReposition = false) {
    if (!win || phase !== 'shown' || !session || !lastPlacement || !slotEl) return;
    const size = {
      width: Math.ceil(slotEl.offsetWidth),
      height: Math.ceil(slotEl.offsetHeight),
    };
    if (size.width < 1 || size.height < 1) return;
    const { scale } = lastPlacement;
    const sizeUnchanged =
      Math.abs(size.width * scale - lastPlacement.width) < 2 &&
      Math.abs(size.height * scale - lastPlacement.height) < 2;
    if (sizeUnchanged && !forceReposition) return;

    if (detached && !forceReposition) {
      programmaticMoveUntil = performance.now() + 220;
      await win.setSize(new LogicalSize(size.width, size.height));
      lastPlacement = {
        ...lastPlacement,
        width: Math.ceil(size.width * scale),
        height: Math.ceil(size.height * scale),
      };
      return;
    }

    const [monitors, currentScale] = await Promise.all([
      getMonitorGeometries(),
      win.scaleFactor().catch(() => scale),
    ]);
    if (phase !== 'shown' || !session) return;
    const placement = placeDdayWidgetMenu({
      anchor: session.anchor,
      size,
      monitors,
      fallbackScale: currentScale,
    });
    maxHeight = placement.maxLogicalHeight;
    await applyGeometry(placement, currentScale);
    lastPlacement = placement;
  }

  function handleNativeAction(action: string, payload: Record<string, any> = {}) {
    if (!session) return;
    if (action === 'toggle-top' || action === 'center') {
      suppressBlurUntil = performance.now() + 550;
    }
    void emitTo(session.requester, EV.action, {
      requestId: session.requestId,
      action,
      payload,
    }).catch(() => {});
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (panelRef?.handleEscape()) {
        e.preventDefault();
        return;
      }
      if (native) {
        e.preventDefault();
        requestClose('escape');
      }
    }
  }

  $effect(() => {
    if (!native) return;
    const el = slotEl;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void ops.enqueue(() => refit(false)));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  onMount(() => {
    if (!native || !win) return;
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';

    const offs: (() => void)[] = [];
    let disposed = false;

    void (async () => {
      const unwatchFonts = await watchCustomFonts((fonts) => {
        customFonts = fonts;
      }).catch(() => () => {});
      if (disposed) {
        unwatchFonts();
        return;
      }
      offs.push(unwatchFonts);

      const handlers = await Promise.all([
        win.listen(EV.open, (e) => handleOpen(e.payload)),
        win.listen(EV.sync, (e) => handleSync(e.payload)),
        win.listen(EV.reposition, (e) => {
          const p = e.payload as any;
          if (!session || (p?.requestId && p.requestId !== session.requestId)) return;
          if (p?.anchor && typeof p.anchor.x === 'number') {
            session = { ...session, anchor: p.anchor };
            detached = false;
            suppressBlurUntil = performance.now() + 550;
            void ops.enqueue(() => refit(true));
          }
        }),
        win.listen(EV.raise, (e) => {
          const p = e.payload as any;
          if (!session || (p?.requestId && p.requestId !== session.requestId)) return;
          suppressBlurUntil = performance.now() + 550;
          void ops.enqueue(async () => {
            if (!win || phase !== 'shown') return;
            await win.setAlwaysOnTop(true).catch(() => {});
            if (!(await win.isFocused().catch(() => false))) {
              await win.setFocus().catch(() => {});
            }
          });
        }),
        win.listen(EV.close, (e) => handleCloseRequest(e.payload)),
        win.listen(EV.ping, (e) => {
          const from = (e.payload as any)?.from;
          if (typeof from === 'string') void emitTo(from, EV.ready, {}).catch(() => {});
        }),
        win.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            hadFocus = true;
            return;
          }
          if (phase === 'shown' && hadFocus && !isBlurSuppressed()) {
            void confirmBlurThenClose();
          }
        }),
        win.onMoved(() => {
          if (phase !== 'shown' || performance.now() < programmaticMoveUntil) return;
          detached = true;
          noteDragActivity();
        }),
        listen('window-roster-changed', (e) => {
          const closed = (e.payload as any)?.closed;
          if (session && closed === session.requester) requestClose('requester');
        }),
      ]);

      if (disposed) {
        handlers.forEach((off) => off());
        return;
      }
      offs.push(...handlers);
      await emit(EV.ready, {});
    })().catch((e) => console.warn('D-Day 위젯 설정 창을 준비하지 못했습니다:', e));

    return () => {
      disposed = true;
      if (dragEndTimer) clearTimeout(dragEndTimer);
      offs.forEach((off) => off());
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if native}
  <div class="dwm-root">
    <div class="dwm-slot" class:revealed bind:this={slotEl}>
      {#if session && menuState}
        {#key session.requestId}
          <DdayWidgetSettingsPanel
            bind:this={panelRef}
            state={menuState}
            {maxHeight}
            draggable
            onaction={handleNativeAction}
            onclose={() => requestClose('close-btn')}
            onstartdrag={() => {
              detached = true;
              noteDragActivity();
            }}
          />
        {/key}
      {/if}
    </div>
  </div>
{:else if previewState}
  <div class="dwm-preview-stage" data-scheme={previewState.effectiveDark ? 'dark' : 'light'}>
    <DdayWidgetSettingsPanel
      bind:this={panelRef}
      state={previewState}
      maxHeight={540}
      onaction={handlePreviewAction}
      onclose={() => {}}
    />
  </div>
{/if}

<style>
  :global(html),
  :global(body),
  :global(#app) {
    background: transparent !important;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .dwm-root {
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: transparent;
  }
  .dwm-slot {
    display: inline-block;
    vertical-align: top;
    opacity: 0;
  }
  .dwm-slot.revealed {
    opacity: 1;
    animation: dwm-pop 140ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transform-origin: top left;
  }
  @keyframes dwm-pop {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dwm-slot.revealed {
      animation: none;
    }
  }

  .dwm-preview-stage {
    width: 100vw;
    min-height: 100vh;
    padding: 24px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    background: #ebe6da;
  }
  .dwm-preview-stage[data-scheme='dark'] {
    background: #141720;
  }
</style>
