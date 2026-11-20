<script>
  import { onMount, tick } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { emit, listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import {
    Check,
    LayoutGrid,
    Maximize2,
    Minimize2,
    PanelTop,
    Pin,
    PinOff,
    Plus,
    X,
  } from 'lucide-svelte';
  import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { BUILTIN_FONTS } from '../../lib/builtinFonts.js';
  import { registerFontFace } from '../../lib/fonts.js';
  import { watchCustomFonts } from '../../lib/toolkit/appearance.js';
  import { ensureWindowOnScreen, getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { pickPrimaryMonitor } from '../../lib/windows/windowPlacement.js';
  import {
    DDAY_CONTROL_BOUNDS,
    computeDdayCounter,
    normalizeDdaySettings,
    normalizeDdayWidgetPrefs,
    stripHtmlToTitle,
    todayDateKey,
  } from '../../lib/dday/ddayModel.js';
  import {
    classifyControlLayout,
    clamp,
    computeControlMetrics,
    controlMetricsToStyle,
  } from '../../lib/dday/ddayLayout.js';
  import {
    applyControlWindowLimits,
    applyDdayWindowBounds,
    captureWindowGeometry,
    computeDoubleClickTarget,
    findMonitorAtPoint,
    resolveControlSizeLimits,
  } from '../../lib/dday/ddayWindowBounds.js';
  import {
    toggleDdayWidget,
    watchDdayWidgetOpen,
  } from '../../lib/dday/ddayWidgetWindow.js';
  import {
    controlThemeToStyle,
    resolveControlThemeTokens,
    resolveUiFontStack,
  } from '../../lib/dday/ddayControlTheme.js';
  import {
    applyTodoOrder,
    beginOrderOverlay,
    createOrderOverlayState,
    createRemovalGuard,
    projectActiveDdays,
    reconcileOverlayWithSnapshot,
    settleOrderOverlay,
  } from '../../lib/dday/ddaySort.js';
  import { createVerticalDdaySort } from '../../lib/dday/ddayVerticalSort.js';
  import { formatDeadlineChip } from '../../lib/editor/richTextFormat.js';
  import { resolveMenuWidth } from '../../lib/windows/contextMenuLayout.js';
  import {
    DDAY_EVENTS,
    buildWindowDdaySnapshot,
    collectAllNoteWindowsDdays,
    createDdaySettingsSection,
    createDdayWidgetSection,
    dispatchDdayCommand,
    savePreviewWindows,
    subscribeDdayStore,
  } from '../../lib/dday/ddaySync.js';
  import ContextRibbonHeader from '../context-menu/ContextRibbonHeader.svelte';
  import ContextSegmentRow from '../context-menu/ContextSegmentRow.svelte';
  import ContextTileGrid from '../context-menu/ContextTileGrid.svelte';
  import '../context-menu/ctxTokens.css';
  import DdayBanner from './DdayBanner.svelte';
  import DdayControlGlyph from './DdayControlGlyph.svelte';
  import DdayResizeHandles from './DdayResizeHandles.svelte';
  import DdayRowCard from './DdayRowCard.svelte';
  import DdayEditSheet from './DdayEditSheet.svelte';
  import DdaySettingsTab from './DdaySettingsTab.svelte';
  import DdayArchiveView from './DdayArchiveView.svelte';
  import { resolveControlGlyphState } from '../../lib/dday/ddayBadge.js';

  /** @type {{ preview?: boolean }} */
  let { preview = false } = $props();

  /** @returns {{ target?: string, hasBootstrap: boolean, appearance: { themeColor?: string, isDarkMode?: boolean, uiFontFamily?: string, uiFontSize?: number } | null }} */
  function parseBootstrapSearch() {
    if (typeof location === 'undefined') return { hasBootstrap: false, appearance: null };
    const p = new URLSearchParams(location.search);
    const target = p.get('ddayCtrlTarget') || undefined;
    const themeColor = p.get('theme') || undefined;
    const darkRaw = p.get('dark');
    const isDarkMode = darkRaw === '1' ? true : darkRaw === '0' ? false : undefined;
    const uiFontFamily = p.get('uifont') || undefined;
    const fsNum = Number(p.get('fs') || p.get('font'));
    const uiFontSize = Number.isFinite(fsNum) && fsNum >= 8 ? clamp(fsNum, 9, 16) : undefined;
    const hasAp = Boolean(themeColor || isDarkMode !== undefined || uiFontFamily || uiFontSize !== undefined);
    return {
      target,
      hasBootstrap: Boolean(target || hasAp),
      appearance: hasAp ? { themeColor, isDarkMode, uiFontFamily, uiFontSize } : null,
    };
  }

  const bootstrap = parseBootstrapSearch();

  /** @type {import('../../lib/dday/ddaySync.js').DdayWindowSnapshot[]} */
  let windows = $state([]);
  let targetLabel = $state(bootstrap.target || 'main');
  let initialAppearance = $state(
    /** @type {{ themeColor?: string, isDarkMode?: boolean, uiFontFamily?: string, uiFontSize?: number } | null} */ (
      bootstrap.appearance
    ),
  );
  let todayKey = $state(todayDateKey());

  /** @type {import('../../lib/toolkit/appearance.js').CustomFont[]} */
  let customFonts = $state([]);

  /** @type {import('../../lib/dday/ddayModel.js').DdaySettings} */
  let settings = $state(normalizeDdaySettings(undefined));
  /** @type {import('../../lib/dday/ddayModel.js').DdayWidgetPrefs} */
  let widgetPrefs = $state(normalizeDdayWidgetPrefs(undefined));

  /** @type {'list' | 'settings'} */
  let activeTab = $state('list');
  /** @type {'main' | 'create' | 'edit' | 'archive'} */
  let subView = $state('main');
  /** @type {string | null} */
  let editingDdayId = $state(null);
  /** @type {string | null} */
  let focusDdayId = $state(null);

  let previewThemeOverride = $state(/** @type {string | null} */ (null));
  let previewDarkOverride = $state(/** @type {boolean | null} */ (null));
  let previewFontFamilyOverride = $state(/** @type {string | null} */ (null));
  let previewFontOverride = $state(/** @type {number | null} */ (null));
  let previewWidthOverride = $state(/** @type {number | null} */ (null));
  let previewHeightOverride = $state(/** @type {number | null} */ (null));
  let previewNativeFrame = $state(false);
  let previewShowHandles = $state(false);

  /** @type {{ item: import('../../lib/dday/ddayModel.js').DdayItem, x: number, y: number } | null} */
  let contextMenu = $state(null);
  /** @type {HTMLDivElement | null} */
  let shellEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let scrollEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let ctxEl = $state(null);

  let shellW = $state(DDAY_CONTROL_BOUNDS.defaultWidth);
  let shellH = $state(DDAY_CONTROL_BOUNDS.defaultHeight);
  let committedLayout = $state(/** @type {import('../../lib/dday/ddayLayout.js').ControlLayoutState | null} */ (null));
  let ready = $state(false);
  let closing = $state(false);
  let windowTransitioning = false;
  let pinBusy = $state(false);
  let widgetOpen = $state(false);
  let widgetBusy = $state(false);
  /** @type {ReturnType<typeof setTimeout> | null} */
  let saveGeomTimer = null;
  let scaleSuppressUntil = 0;
  let prevStableGeomKey = '';
  let lastMonitorKey = '';

  let noticeText = $state('');
  /** @type {ReturnType<typeof setTimeout> | null} */
  let noticeTimer = null;

  // 표시 순서 오버레이 + 드래그 프리뷰 + 낙관적 완료 숨김
  let orderOverlayState = $state(createOrderOverlayState());
  /** @type {readonly string[] | null} */
  let previewOrder = $state(null);
  let completingIds = $state(/** @type {Set<string>} */ (new Set()));

  const removalGuard = createRemovalGuard({ now: () => performance.now() });

  /** @param {string} msg */
  function showNotice(msg) {
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeText = msg;
    noticeTimer = setTimeout(() => {
      noticeText = '';
    }, 2600);
  }

  /** @param {HTMLElement} node */
  const draggable = (node) =>
    isTauri()
      ? dragRegion(node, { onDoubleClick: () => void toggleControlSize() })
      : { update() {}, destroy() {} };

  /** @param {HTMLElement} node */
  function blockDrag(node) {
    /** @param {Event} e */
    const stop = (e) => e.stopPropagation();
    node.addEventListener('pointerdown', stop);
    node.addEventListener('mousedown', stop);
    return {
      destroy() {
        node.removeEventListener('pointerdown', stop);
        node.removeEventListener('mousedown', stop);
      },
    };
  }

  const currentWindowSnap = $derived(
    windows.find((w) => w.label === targetLabel) || windows[0] || null,
  );
  const dark = $derived(
    previewDarkOverride ?? currentWindowSnap?.isDarkMode ?? initialAppearance?.isDarkMode ?? false,
  );
  const themeColor = $derived(
    previewThemeOverride ?? currentWindowSnap?.themeColor ?? initialAppearance?.themeColor ?? 'amber',
  );
  const uiFontFamily = $derived(
    previewFontFamilyOverride ?? currentWindowSnap?.uiFontFamily ?? initialAppearance?.uiFontFamily ?? '메이플스토리 L',
  );
  const uiFontSize = $derived(
    previewFontOverride ?? currentWindowSnap?.uiFontSize ?? initialAppearance?.uiFontSize ?? 10,
  );

  const themeTokens = $derived(resolveControlThemeTokens(themeColor, dark));
  const themeStyle = $derived(controlThemeToStyle(themeTokens));
  const accent = $derived(themeTokens.accentInk);
  const uiFontStack = $derived(resolveUiFontStack(uiFontFamily, BUILTIN_FONTS, customFonts));
  // 배너 미리보기의 D-Day 제목은 메모 창 배너와 같이 메모 글꼴을 씁니다(없으면 화면 글꼴).
  const memoFontStack = $derived(
    currentWindowSnap?.fontFamily
      ? resolveUiFontStack(currentWindowSnap.fontFamily, BUILTIN_FONTS, customFonts)
      : uiFontStack,
  );

  const activeItems = $derived.by(() =>
    (currentWindowSnap?.ddayItems || [])
      .filter((d) => d.status === 'active')
      .slice()
      .sort((a, b) => a.order - b.order),
  );
  const visibleBaseActive = $derived(activeItems.filter((d) => !completingIds.has(d.id)));
  const activeOverlayIds = $derived(orderOverlayState.byLabel[targetLabel]?.ids ?? null);
  const displayedActiveItems = $derived(projectActiveDdays(visibleBaseActive, activeOverlayIds));
  const renderActiveItems = $derived(
    previewOrder ? projectActiveDdays(displayedActiveItems, previewOrder) : displayedActiveItems,
  );

  const headerGlyphState = $derived(
    resolveControlGlyphState(displayedActiveItems, todayKey, { themeColor, dark }),
  );
  const idleGlyphState = $derived(
    resolveControlGlyphState([], todayKey, { themeColor, dark }),
  );
  const archivedItems = $derived.by(() =>
    (currentWindowSnap?.ddayItems || []).filter((d) => d.status === 'archived'),
  );
  const bannerItems = $derived(displayedActiveItems.filter((d) => d.showInBanner));
  const editingItem = $derived(
    editingDdayId ? activeItems.find((d) => d.id === editingDdayId) || null : null,
  );
  const editingLinkedTodoText = $derived.by(() => {
    if (!editingItem?.linkedTodoId || !currentWindowSnap) return '';
    const found =
      currentWindowSnap.todos.find((t) => t.id === editingItem.linkedTodoId) ||
      currentWindowSnap.archivedTodos.find((t) => t.id === editingItem.linkedTodoId);
    return found?.text || '';
  });

  const layout = $derived(
    classifyControlLayout({
      width: shellW,
      height: shellH,
      itemCount: displayedActiveItems.length,
      archiveCount: archivedItems.length,
      prev: committedLayout,
    }),
  );
  const metrics = $derived(
    computeControlMetrics({
      width: shellW,
      height: shellH,
      uiFontSize,
      wideEdit: layout.wideEdit,
    }),
  );
  const metricsStyle = $derived(controlMetricsToStyle(metrics));
  const compactCapsules = $derived(uiFontSize >= 13 || layout.compactWidth);
  const previewFrameStyle = $derived.by(() => {
    if (!(preview || !isTauri()) || !previewWidthOverride) return '';
    const h = previewHeightOverride || DDAY_CONTROL_BOUNDS.defaultHeight;
    return `width: ${previewWidthOverride}px; height: ${h}px;`;
  });
  const hasPreviewFrame = $derived(
    (preview || !isTauri()) && !previewNativeFrame && Boolean(previewFrameStyle),
  );
  const sortDisabled = $derived(
    subView !== 'main' || activeTab !== 'list' || displayedActiveItems.length < 2,
  );
  const canDragSort = $derived(!sortDisabled && displayedActiveItems.length >= 2);

  // 세로 스마트 정렬 엔진
  const ddaySorter = createVerticalDdaySort({
    getIds: () => displayedActiveItems.map((d) => d.id),
    isDisabled: () => sortDisabled,
    onpreview: (ids) => {
      previewOrder = ids;
    },
    oncommit: (initialIds, nextIds) => {
      void submitReorder(currentWindowSnap?.label || targetLabel, initialIds, nextIds);
    },
    onpointerdragstart: () => {
      contextMenu = null;
    },
    getScrollContainer: () => scrollEl,
  });

  // 표시 순서·화면·모드 전환 시 진행 중이던 드래그가 어긋나면 안전하게 취소합니다.
  $effect(() => {
    ddaySorter.sync();
  });

  // 창별 등록 글꼴(커스텀 .ttf/.otf)이 선택되면 이 WebView 문서에도 동적으로 적재합니다.
  $effect(() => {
    if (!isTauri()) return;
    const memoFontName = currentWindowSnap?.fontFamily;
    for (const font of customFonts) {
      if (font.name === uiFontFamily || font.name === memoFontName) void registerFontFace(font.name, font.path);
    }
  });

  // 컨텍스트 메뉴가 열려 있는 동안 최신 항목 상태로 유지
  const activeContextItem = $derived.by(() => {
    if (!contextMenu) return null;
    return displayedActiveItems.find((d) => d.id === contextMenu?.item.id) || null;
  });
  const ctxWidth = $derived(
    Math.min(resolveMenuWidth('ctrl-ctx', uiFontSize), Math.max(206, shellW - 16)),
  );

  // 삭제·아카이브된 항목으로 편집 진입 시 빈 편집 상태에 머물지 않도록 목록으로 복귀합니다.
  $effect(() => {
    if (subView === 'edit' && editingDdayId && windows.length > 0 && !editingItem) {
      subView = 'main';
      editingDdayId = null;
    }
  });

  const activeContextCounter = $derived(
    activeContextItem ? computeDdayCounter(activeContextItem, todayKey) : null,
  );
  const activeContextShortDate = $derived(
    activeContextCounter ? formatDeadlineChip(activeContextCounter.effectiveDate) : '',
  );
  const activeContextChannelOptions = $derived.by(() => {
    if (!activeContextItem) return [];
    const item = activeContextItem;
    return [
      {
        id: 'showInTodo',
        label: '할 일',
        active: Boolean(item.showInTodo),
        title: item.showInTodo ? '할 일 목록에서 숨기기' : '할 일 목록에 표시',
        onclick: () => { void handleToggleChannel(item.id, 'showInTodo', !item.showInTodo); },
      },
      {
        id: 'showInBanner',
        label: '배너',
        active: Boolean(item.showInBanner),
        title: item.showInBanner ? '메모 상단 배너에서 숨기기' : '메모 상단 배너에 표시',
        onclick: () => { void handleToggleChannel(item.id, 'showInBanner', !item.showInBanner); },
      },
      {
        id: 'showInWidget',
        label: '위젯',
        active: Boolean(item.showInWidget),
        title: item.showInWidget ? '툴킷 D-Day 위젯에서 숨기기' : '툴킷 D-Day 위젯에 표시',
        onclick: () => { void handleToggleChannel(item.id, 'showInWidget', !item.showInWidget); },
      },
    ];
  });
  const activeContextTiles = $derived.by(() => {
    if (!activeContextItem) return [];
    const item = activeContextItem;
    const isLinked = item.linkedTodoId !== null;
    const itemIdx = displayedActiveItems.findIndex((d) => d.id === item.id);
    /** @type {import('../context-menu/ContextTileGrid.svelte').default extends never ? any : any[]} */
    const tiles = [];

    if (itemIdx > 0) {
      tiles.push({
        id: 'move-top',
        icon: /** @type {const} */ ('chevUp'),
        label: '맨 위로',
        tone: /** @type {const} */ ('accent'),
        title: '대표 배너(1순위)로 올리기',
        onclick: () => {
          const label = currentWindowSnap?.label || targetLabel;
          const ids = displayedActiveItems.map((d) => d.id);
          const nextIds = [item.id, ...ids.filter((id) => id !== item.id)];
          contextMenu = null;
          void submitReorder(label, ids, nextIds);
        },
      });
    }

    tiles.push(
      {
        id: 'edit',
        icon: /** @type {const} */ ('pencil'),
        label: '편집',
        tone: /** @type {const} */ ('sky'),
        title: '상세 편집',
        onclick: () => {
          editingDdayId = item.id;
          subView = 'edit';
          contextMenu = null;
        },
      },
      {
        id: 'complete',
        icon: /** @type {const} */ ('checkCircle'),
        label: '완료',
        tone: /** @type {const} */ ('ok'),
        title: '완료 처리 (아카이브)',
        onclick: () => {
          contextMenu = null;
          void handleComplete(item.id);
        },
      },
      {
        id: 'delete',
        icon: isLinked ? /** @type {const} */ ('pinOff') : /** @type {const} */ ('trash'),
        label: isLinked ? '고정 해제' : '삭제',
        tone: /** @type {const} */ ('danger'),
        title: isLinked ? 'D-Day 고정만 해제 (할 일 유지)' : 'D-Day 영구 삭제',
        onclick: () => {
          const id = item.id;
          const hadTodo = item.linkedTodoId !== null;
          contextMenu = null;
          void sendCommand('delete', { ddayId: id, deleteLinkedTodo: false }).then(() => {
            showNotice(hadTodo ? '할 일은 남기고 D-Day만 해제했어요' : 'D-Day를 삭제했어요');
          });
        },
      },
    );
    return tiles;
  });

  // 컨텍스트 메뉴 안에서도 방향키·Tab·Home·End 탐색을 지원합니다.
  /** @param {KeyboardEvent} e */
  function handleContextKeydown(e) {
    if (!ctxEl) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      contextMenu = null;
      return;
    }
    const buttons = /** @type {HTMLButtonElement[]} */ ([...ctxEl.querySelectorAll('button:not(:disabled)')]);
    if (!buttons.length) return;
    const idx = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    let next;
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) next = (idx + 1) % buttons.length;
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) next = (idx - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    if (next !== undefined) {
      e.preventDefault();
      buttons[next].focus();
    }
  }

  /** @param {import('../../lib/dday/ddaySync.js').DdayWindowSnapshot | undefined} snap */
  function activeIdsOfSnapshot(snap) {
    return (snap?.ddayItems || [])
      .filter((d) => d.status === 'active')
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((d) => d.id);
  }

  /** @param {string} label @param {import('../../lib/dday/ddaySync.js').DdayWindowSnapshot | undefined} nextSnap */
  function mergeSnapshot(label, nextSnap) {
    if (!nextSnap) return;
    orderOverlayState = reconcileOverlayWithSnapshot(orderOverlayState, label, activeIdsOfSnapshot(nextSnap));
    const idx = windows.findIndex((w) => w.label === label);
    if (idx >= 0) {
      windows = windows.map((w, i) => (i === idx ? nextSnap : w));
    } else {
      windows = [...windows, nextSnap];
    }
  }

  /** @param {string} action @param {any} [payload] */
  async function sendCommand(action, payload = {}) {
    const label = currentWindowSnap?.label || targetLabel;
    const res = await dispatchDdayCommand(label, action, payload, settings);
    if (res.snapshot) mergeSnapshot(label, res.snapshot);
    return res;
  }

  /**
   * 비동기 reorder IPC를 표시 순서 오버레이 리듀서로 조율해 되튐·잠금·동시 편집 유실을 막습니다.
   * @param {string} label
   * @param {readonly string[]} initialIds
   * @param {readonly string[]} nextIds
   */
  async function submitReorder(label, initialIds, nextIds) {
    const valid = applyTodoOrder(
      initialIds.map((id) => ({ id })),
      initialIds,
      nextIds,
    );
    if (!valid) return;

    const started = beginOrderOverlay(orderOverlayState, label, nextIds);
    orderOverlayState = started.state;

    const res = await dispatchDdayCommand(label, 'reorder', { orderedIds: [...nextIds] }, settings);
    const ackActiveIds = res.snapshot ? activeIdsOfSnapshot(res.snapshot) : null;

    // settle은 mergeSnapshot 전에 실행해 최신 토큰 일치를 정확히 판정합니다.
    const settled = settleOrderOverlay(orderOverlayState, {
      label,
      token: started.token,
      ok: Boolean(res?.ok),
      ackActiveIds,
    });
    orderOverlayState = settled.state;

    if (res.snapshot) {
      mergeSnapshot(label, res.snapshot);
    }

    if (settled.notifyFailure) {
      showNotice(
        res?.ok
          ? '잠금 상태라 D-Day 순서를 변경하지 못했어요'
          : '순서를 저장하지 못해 원래 순서로 표시해요',
      );
    }
  }

  /** @param {{ targetLabel?: string, focusDdayId?: string | null, editDdayId?: string | null, initialTab?: 'list'|'settings'|'archive', openCreate?: boolean, appearance?: { themeColor?: string, isDarkMode?: boolean, uiFontFamily?: string, uiFontSize?: number } | null }} payload */
  function applyTargetPayload(payload) {
    if (!payload) return;
    if (payload.appearance) {
      initialAppearance = {
        themeColor: payload.appearance.themeColor ?? initialAppearance?.themeColor,
        isDarkMode:
          typeof payload.appearance.isDarkMode === 'boolean'
            ? payload.appearance.isDarkMode
            : initialAppearance?.isDarkMode,
        uiFontFamily: payload.appearance.uiFontFamily ?? initialAppearance?.uiFontFamily,
        uiFontSize: Number.isFinite(Number(payload.appearance.uiFontSize))
          ? Number(payload.appearance.uiFontSize)
          : initialAppearance?.uiFontSize,
      };
    }
    if (payload.targetLabel) targetLabel = payload.targetLabel;
    if (payload.focusDdayId !== undefined) focusDdayId = payload.focusDdayId;
    if (payload.editDdayId) {
      activeTab = 'list';
      focusDdayId = payload.editDdayId;
      editingDdayId = payload.editDdayId;
      subView = 'edit';
    } else if (payload.openCreate) {
      activeTab = 'list';
      editingDdayId = null;
      subView = 'create';
    } else if (payload.initialTab === 'archive') {
      activeTab = 'settings';
      subView = 'archive';
    } else if (payload.initialTab === 'settings') {
      activeTab = 'settings';
      subView = 'main';
    } else {
      activeTab = 'list';
      editingDdayId = null;
      subView = 'main';
    }
    previewOrder = null;
    contextMenu = null;
  }

  /** @param {import('../../lib/dday/ddayModel.js').DdayItem} item @param {number} clientX @param {number} clientY @param {boolean} [viaKeyboard] */
  async function openRowContext(item, clientX, clientY, viaKeyboard = false) {
    if (ddaySorter.isPointerGuardActive()) return;
    const box = shellEl?.getBoundingClientRect();
    const relX = box ? clientX - box.left : clientX;
    const relY = box ? clientY - box.top : clientY;
    contextMenu = { item, x: relX, y: relY };
    await tick();
    if (contextMenu && ctxEl && shellEl) {
      const sh = shellEl.getBoundingClientRect();
      const cr = ctxEl.getBoundingClientRect();
      const maxX = Math.max(8, sh.width - cr.width - 8);
      const maxY = Math.max(8, sh.height - cr.height - 8);
      contextMenu = {
        ...contextMenu,
        x: Math.max(8, Math.min(contextMenu.x, maxX)),
        y: Math.max(8, Math.min(contextMenu.y, maxY)),
      };
      if (viaKeyboard) ctxEl.querySelector('button')?.focus();
    }
  }

  /** @param {number} delayMs */
  function scheduleSaveControlGeometry(delayMs = 350) {
    if (windowTransitioning || closing) return;
    if (saveGeomTimer) clearTimeout(saveGeomTimer);
    saveGeomTimer = setTimeout(() => void saveControlGeometry(false), delayMs);
  }

  /** @param {boolean} [forceImmediate] */
  async function saveControlGeometry(forceImmediate = false) {
    if (!isTauri() || !ready || windowTransitioning || closing) return;
    const now = performance.now();
    if (!forceImmediate && now < scaleSuppressUntil) {
      scheduleSaveControlGeometry(Math.ceil(scaleSuppressUntil - now) + 40);
      return;
    }
    try {
      const win = getCurrentWindow();
      const captured = await captureWindowGeometry(win, DDAY_CONTROL_BOUNDS, { clampSize: true });
      if (!captured) return;

      // I11: DPI 배율 전환 직후 innerSize/scaleFactor 시점 차이로 인한 오저장을 막기 위해 2회 연속 일치 시에만 저장합니다.
      const sizeKey = `${captured.width}x${captured.height}`;
      if (!forceImmediate && sizeKey !== prevStableGeomKey) {
        prevStableGeomKey = sizeKey;
        scheduleSaveControlGeometry(140);
        return;
      }
      prevStableGeomKey = sizeKey;
      settingsSection?.mutate((cur) => ({ ...cur, controlGeometry: captured }));
    } catch {}
  }

  async function refreshMonitorLimitsOnMove() {
    if (!isTauri() || !ready || windowTransitioning || closing) return;
    try {
      const win = getCurrentWindow();
      const [pos, size, scale, monitors] = await Promise.all([
        win.outerPosition().catch(() => null),
        win.innerSize().catch(() => null),
        win.scaleFactor().catch(() => 1),
        getMonitorGeometries(),
      ]);
      if (!pos || !size || !monitors.length) return;
      const cx = pos.x + size.width / 2;
      const cy = pos.y + size.height / 2;
      const monitor = findMonitorAtPoint(cx, cy, monitors) || pickPrimaryMonitor(monitors);
      if (!monitor) return;
      const mKey = `${monitor.bounds.x},${monitor.bounds.y},${monitor.bounds.width}x${monitor.bounds.height}@${monitor.scale}`;
      if (mKey !== lastMonitorKey) {
        lastMonitorKey = mKey;
        const limits = await applyControlWindowLimits(win, monitor, DDAY_CONTROL_BOUNDS);
        const factor = Number(scale) > 0 ? Number(scale) : 1;
        const logW = Math.round(size.width / factor);
        const logH = Math.round(size.height / factor);
        if (logW > limits.maxWidth || logH > limits.maxHeight) {
          await win
            .setSize(new LogicalSize(Math.min(logW, limits.maxWidth), Math.min(logH, limits.maxHeight)))
            .catch(() => {});
        }
      }
    } catch {}
  }

  async function toggleControlPin() {
    if (pinBusy) return;
    const prev = settings.controlAlwaysOnTop;
    const nextVal = !prev;
    if (!isTauri()) {
      handleUpdateSettings({ controlAlwaysOnTop: nextVal });
      showNotice(nextVal ? '항상 위 고정 켜짐' : '항상 위 해제됨');
      return;
    }
    pinBusy = true;
    try {
      await getCurrentWindow().setAlwaysOnTop(nextVal);
      if (settingsSection) {
        const res = await settingsSection.mutateAndConfirm(
          (cur) => ({ ...cur, controlAlwaysOnTop: nextVal }),
          (cur) => cur.controlAlwaysOnTop === nextVal,
        );
        if (res !== 'saved') {
          await getCurrentWindow().setAlwaysOnTop(prev).catch(() => {});
        } else {
          showNotice(nextVal ? '항상 위 고정 켜짐' : '항상 위 해제됨');
        }
      }
    } catch {
      await getCurrentWindow().setAlwaysOnTop(prev).catch(() => {});
    } finally {
      pinBusy = false;
    }
  }

  /** @param {'wide' | 'default' | null} [forcePreset] 버튼은 자기 글자대로(넓게/기본), 헤더 더블클릭은 지정 없이 토글합니다. */
  async function toggleControlSize(forcePreset = null) {
    if (windowTransitioning || closing) return;
    contextMenu = null;
    ddaySorter.cancel();
    if (!isTauri()) {
      if (layout.wideEdit) {
        previewWidthOverride = DDAY_CONTROL_BOUNDS.defaultWidth;
        previewHeightOverride = DDAY_CONTROL_BOUNDS.defaultHeight;
      } else {
        previewWidthOverride = DDAY_CONTROL_BOUNDS.wideWidth;
        previewHeightOverride = DDAY_CONTROL_BOUNDS.wideHeight;
      }
      return;
    }
    windowTransitioning = true;
    try {
      const win = getCurrentWindow();
      if (await win.isMaximized().catch(() => false)) {
        await win.unmaximize().catch(() => {});
      }
      const [pos, size, scale, monitors] = await Promise.all([
        win.outerPosition().catch(() => null),
        win.outerSize().catch(() => null),
        win.scaleFactor().catch(() => 1),
        getMonitorGeometries(),
      ]);
      const cx = pos && size ? pos.x + size.width / 2 : null;
      const cy = pos && size ? pos.y + size.height / 2 : null;
      const curMonitor = findMonitorAtPoint(cx, cy, monitors) || pickPrimaryMonitor(monitors);
      await applyControlWindowLimits(win, curMonitor, DDAY_CONTROL_BOUNDS);
      const target = computeDoubleClickTarget({
        currentPos: pos ? { x: pos.x, y: pos.y } : null,
        currentSize: size ? { width: size.width, height: size.height } : null,
        currentScale: scale,
        monitors,
        forcePreset,
      });
      for (let pass = 0; pass < 2; pass++) {
        if (target.physicalX !== null && target.physicalY !== null) {
          await win.setPosition(new PhysicalPosition(target.physicalX, target.physicalY)).catch(() => {});
        }
        await win.setSize(new LogicalSize(target.width, target.height)).catch(() => {});
      }
      await ensureWindowOnScreen(win, monitors);
    } finally {
      setTimeout(() => {
        windowTransitioning = false;
        void saveControlGeometry(true);
      }, 100);
    }
  }

  async function closeModal() {
    if (closing) return;
    closing = true;
    if (saveGeomTimer) clearTimeout(saveGeomTimer);
    ddaySorter.cancel();
    if (!isTauri()) {
      window.close();
      return;
    }
    try {
      const withTimeout = (/** @type {Promise<unknown>} */ p, ms = 400) =>
        Promise.race([p.catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms))]);
      const allowCapture = performance.now() >= scaleSuppressUntil;
      const captured = allowCapture
        ? await Promise.race([
            captureWindowGeometry(getCurrentWindow(), DDAY_CONTROL_BOUNDS, { clampSize: true }).catch(() => null),
            new Promise((resolve) => setTimeout(() => resolve(null), 250)),
          ])
        : null;
      if (captured) {
        settingsSection?.mutate((cur) => ({ ...cur, controlGeometry: captured }));
      }
      await withTimeout(settingsSection?.settle() ?? Promise.resolve());
    } catch {
      // 닫기 차단을 방지합니다.
    } finally {
      // close()가 아니라 destroy()로 닫습니다. close()는 닫기 요청을 다시 보내고, 아래 onCloseRequested가
      //   그것을 막은(preventDefault) 뒤 closeModal()을 부르는데 이미 closing 중이라 그냥 돌아와서
      //   [닫기]·[완료]·Alt+F4 어느 것으로도 창이 닫히지 않았습니다(6.0.0 출시 전 실제 앱에서 재현).
      //   저장은 위에서 끝냈으므로 닫기 요청을 다시 거치지 않습니다(D-Day 위젯의 closeWindow()와 같은 방식).
      try {
        await getCurrentWindow().destroy();
      } catch {
        // 파괴에 실패하면 다음 클릭으로 다시 시도할 수 있게 잠금을 풉니다.
        closing = false;
      }
    }
  }

  async function handleToggleWidget() {
    if (widgetBusy) return;
    if (!isTauri()) {
      const res = await toggleDdayWidget();
      widgetOpen = res.open;
      showNotice(
        res.open
          ? '위젯 ON (프리뷰는 ?toolkit-preview=dday 로 확인)'
          : '데스크톱 D-Day 위젯을 닫았어요',
      );
      return;
    }
    widgetBusy = true;
    try {
      const res = await toggleDdayWidget({
        preferSideOfCurrentWindow: true,
        hasSavedGeometry: Boolean(widgetPrefs.geometry),
      });
      widgetOpen = res.open;
      if (!res.ok) {
        showNotice('D-Day 위젯을 전환하지 못했어요');
      } else {
        showNotice(res.open ? '데스크톱 D-Day 위젯을 띄웠어요' : '데스크톱 D-Day 위젯을 닫았어요');
      }
    } catch {
      showNotice('D-Day 위젯을 전환하지 못했어요');
    } finally {
      widgetBusy = false;
    }
  }

  /** @param {Partial<import('../../lib/dday/ddayModel.js').DdaySettings>} patch */
  function handleUpdateSettings(patch) {
    settingsSection?.mutate((cur) => ({ ...cur, ...patch }));
  }

  /** @param {Partial<import('../../lib/dday/ddayModel.js').DdayWidgetPrefs>} patch */
  function handleUpdateWidgetPrefs(patch) {
    widgetSection?.mutate((cur) => ({ ...cur, ...patch }));
  }

  /** @param {string} id @param {MouseEvent} [event] */
  async function handleComplete(id, event = undefined) {
    const isPointerClick = Boolean(event && event.detail !== 0);
    if (isPointerClick && event && removalGuard.active(event.clientX, event.clientY)) {
      return;
    }
    if (completingIds.has(id)) return;

    completingIds = new Set([...completingIds, id]);
    if (isPointerClick && event) {
      removalGuard.start(event.clientX, event.clientY);
    }

    try {
      const res = await sendCommand('complete', { ddayId: id });
      const stillActive = Boolean(res?.snapshot?.ddayItems?.some((d) => d.id === id && d.status === 'active'));
      if (!res?.ok || stillActive) {
        const next = new Set(completingIds);
        next.delete(id);
        completingIds = next;
        showNotice(res?.ok ? '잠금 상태라 완료 처리하지 못했어요' : '완료 처리를 저장하지 못했어요');
        return;
      }
      showNotice('완료 아카이브로 이동했어요');
    } finally {
      if (completingIds.has(id)) {
        const next = new Set(completingIds);
        next.delete(id);
        completingIds = next;
      }
    }
  }

  /** @param {string} id */
  async function handleRestore(id) {
    const hadLinked = archivedItems.find((d) => d.id === id)?.linkedTodoId !== null;
    await sendCommand('restore', { ddayId: id });
    showNotice(hadLinked ? 'D-Day와 할 일을 복원했어요' : 'D-Day를 복원했어요');
  }

  /** @param {string} id @param {'showInTodo' | 'showInBanner' | 'showInWidget'} channel @param {boolean} nextValue */
  async function handleToggleChannel(id, channel, nextValue) {
    await sendCommand('update', { ddayId: id, patch: { [channel]: nextValue } });
  }

  /** @param {any} draft */
  async function handleSaveSheet(draft) {
    if (subView === 'edit' && editingDdayId) {
      await sendCommand('update', { ddayId: editingDdayId, patch: draft });
      showNotice('D-Day 변경사항을 저장했어요');
    } else {
      const res = await sendCommand('create', draft);
      if (res.item?.id) focusDdayId = res.item.id;
      showNotice('새 D-Day를 추가했어요');
    }
    subView = 'main';
    editingDdayId = null;
  }

  /** @param {boolean} deleteLinkedTodo */
  async function handleDeleteFromSheet(deleteLinkedTodo) {
    if (!editingDdayId) return;
    await sendCommand('delete', { ddayId: editingDdayId, deleteLinkedTodo });
    subView = 'main';
    editingDdayId = null;
    showNotice(deleteLinkedTodo ? 'D-Day와 할 일을 모두 삭제했어요' : 'D-Day를 삭제했어요');
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (ddaySorter.isActive()) {
        e.preventDefault();
        e.stopPropagation();
        ddaySorter.cancel(e);
        return;
      }
      if (contextMenu) {
        e.preventDefault();
        contextMenu = null;
        return;
      }
      if (subView !== 'main') {
        e.preventDefault();
        subView = 'main';
        editingDdayId = null;
        return;
      }
      if (ddaySorter.isPointerHeld()) {
        e.preventDefault();
        return;
      }
      if (isTauri()) closeModal();
    }
  }

  /** QA 프리뷰용 결정적 시드 스냅샷 생성 (?items= & ?windows=)
   * @param {number} itemCount
   * @param {number} windowCount
   */
  function seedQaPreviewWindows(itemCount, windowCount) {
    const base = new Date();
    const off = (/** @type {number} */ d) => {
      const x = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d);
      return todayDateKey(x);
    };
    const tones = /** @type {const} */ (['accent', 'emerald', 'sky', 'lilac', 'rose', 'gold']);
    const icons = /** @type {const} */ (['puzzle', 'snow', 'sparkle', 'trophy', 'flag', 'book', 'star', 'clover']);
    const items = Array.from({ length: Math.max(0, itemCount) }, (_, i) => ({
      id: `qa-d${i + 1}`,
      title: i === 0 ? 'AI 분야 동아리 운영일지 및 강사비 정산 보고' : `D-Day 일정 항목 ${i + 1}`,
      date: off((i + 1) * 4 - 2),
      startDate: off(-10),
      countMode: 'countdown',
      repeatYearly: i === 2,
      icon: icons[i % icons.length],
      tone: tones[i % tones.length],
      status: 'active',
      completedAt: null,
      linkedTodoId: i % 2 === 0 ? `qa-t${i + 1}` : null,
      showInTodo: i % 2 === 0,
      showInBanner: true,
      showInWidget: true,
      order: i,
    }));
    const archived = [
      {
        id: 'qa-a1',
        title: '완료된 기초학력 운영 계획서 제출',
        date: off(-6),
        startDate: off(-20),
        countMode: 'countdown',
        repeatYearly: false,
        icon: 'flag',
        tone: 'accent',
        status: 'archived',
        completedAt: off(-5),
        linkedTodoId: null,
        showInTodo: false,
        showInBanner: true,
        showInWidget: true,
        order: 0,
      },
    ];
    const extraSpecs = [
      { label: 'main', title: '기본 할 일', themeColor: 'amber', isDarkMode: false },
      { label: 'note-1', title: '1학년 프로젝트 메모', themeColor: 'green', isDarkMode: false },
      { label: 'note-2', title: '생활지도 노트', themeColor: 'periwinkle', isDarkMode: true },
    ];
    return extraSpecs.slice(0, Math.max(1, windowCount)).map((spec, idx) =>
      buildWindowDdaySnapshot(spec.label, {
        ...spec,
        ddayBannerMode: 'bento',
        ddayItems: idx === 0 ? [...items, ...archived] : items.slice(0, 2),
      }),
    );
  }

  /** @type {ReturnType<typeof createDdaySettingsSection> | null} */
  let settingsSection = null;
  /** @type {ReturnType<typeof createDdayWidgetSection> | null} */
  let widgetSection = null;

  onMount(() => {
    let disposed = false;
    /** @type {(() => void)[]} */
    const offs = [];
    const register = (/** @type {() => void} */ fn) => {
      if (disposed) fn();
      else offs.push(fn);
    };

    let qaSeedWindows = /** @type {import('../../lib/dday/ddaySync.js').DdayWindowSnapshot[] | null} */ (null);

    if (preview || !isTauri()) {
      const params = new URLSearchParams(location.search);
      if (params.get('frame') === 'native') previewNativeFrame = true;
      if (params.get('handles') === '1') previewShowHandles = true;
      if (params.has('theme')) previewThemeOverride = params.get('theme') || null;
      if (params.has('dark')) previewDarkOverride = params.get('dark') !== '0';
      if (params.has('uifont')) previewFontFamilyOverride = params.get('uifont') || null;
      const fontParam = Number(params.get('fs') || params.get('font'));
      if (Number.isFinite(fontParam) && fontParam >= 9) previewFontOverride = fontParam;
      const limits = resolveControlSizeLimits(null, DDAY_CONTROL_BOUNDS);
      const wParam = Number(params.get('w'));
      const hParam = Number(params.get('h'));
      if (Number.isFinite(wParam) && wParam > 0) {
        previewWidthOverride = Math.round(clamp(wParam, limits.minWidth, limits.maxWidth));
      }
      if (Number.isFinite(hParam) && hParam > 0) {
        previewHeightOverride = Math.round(clamp(hParam, limits.minHeight, limits.maxHeight));
      }
      if (params.has('items') || params.has('windows')) {
        const ic = Number(params.get('items') ?? 4);
        const wc = Number(params.get('windows') ?? 1);
        qaSeedWindows = seedQaPreviewWindows(
          Number.isFinite(ic) ? ic : 4,
          Number.isFinite(wc) ? wc : 1,
        );
        savePreviewWindows(qaSeedWindows);
      }
      const tabParam = params.get('tab');
      if (tabParam === 'settings') activeTab = 'settings';
      else if (tabParam === 'archive') {
        activeTab = 'settings';
        subView = 'archive';
      } else if (tabParam === 'edit') {
        subView = 'create';
      }
    }

    if (!isTauri()) {
      /** @type {any} */ (window).__ddayControlQA = {
        getState: () => ({
          targetLabel,
          themeColor,
          dark,
          uiFontFamily,
          uiFontSize,
          uiFontStack,
          themeTokens,
          layout,
          shellW,
          shellH,
          activeIds: displayedActiveItems.map((d) => d.id),
          renderIds: renderActiveItems.map((d) => d.id),
          bannerFirstId: bannerItems[0]?.id ?? null,
          overlayState: orderOverlayState,
          subView,
          activeTab,
          sortDisabled,
          sortActive: ddaySorter.isActive(),
          guardActive: ddaySorter.isPointerGuardActive(),
          contextMenuOpen: Boolean(contextMenu),
        }),
        setIpcSimulation: (/** @type {any} */ next) => {
          /** @type {any} */ (window).__ddayPreviewIpc = next || {};
        },
        openContextOnIndex: (/** @type {number} */ idx = 0) => {
          const item = displayedActiveItems[idx];
          if (item) void openRowContext(item, 140, 220, false);
        },
        resetOrder: (/** @type {string[]} */ ids) => {
          previewOrder = null;
          orderOverlayState = createOrderOverlayState();
          const cur = windows.find((w) => w.label === targetLabel);
          if (cur && Array.isArray(ids)) {
            const rank = new Map(ids.map((id, i) => [id, i]));
            const nextItems = cur.ddayItems.map((d) =>
              d.status === 'active' ? { ...d, order: rank.get(d.id) ?? d.order } : d,
            );
            const nextSnap = { ...cur, ddayItems: nextItems };
            mergeSnapshot(targetLabel, nextSnap);
            savePreviewWindows(windows);
          }
        },
      };
    }

    // I9(c): shellW/shellH 초기값과 ResizeObserver를 모두 border-box 기준으로 단일화합니다.
    let ro = /** @type {ResizeObserver | null} */ (null);
    if (shellEl && typeof ResizeObserver !== 'undefined') {
      const syncSize = (/** @type {number} */ w, /** @type {number} */ h) => {
        if (w <= 0 || h <= 0) return;
        const dw = Math.abs(w - shellW);
        const dh = Math.abs(h - shellH);
        if (dw >= 2 || dh >= 2) {
          contextMenu = null;
        }
        committedLayout = classifyControlLayout({
          width: w,
          height: h,
          itemCount: displayedActiveItems.length,
          archiveCount: archivedItems.length,
          prev: committedLayout,
        });
        shellW = w;
        shellH = h;
      };
      const initBox = shellEl.getBoundingClientRect();
      syncSize(initBox.width, initBox.height);
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = entry.borderBoxSize?.[0];
          if (box && box.inlineSize > 0 && box.blockSize > 0) {
            syncSize(box.inlineSize, box.blockSize);
          } else if (shellEl) {
            const rect = shellEl.getBoundingClientRect();
            syncSize(rect.width, rect.height);
          }
        }
      });
      ro.observe(shellEl);
    }

    settingsSection = createDdaySettingsSection({
      onChange: (/** @type {import('../../lib/dday/ddayModel.js').DdaySettings} */ next) => {
        if (!disposed) settings = next;
      },
    });
    widgetSection = createDdayWidgetSection({
      onChange: (/** @type {import('../../lib/dday/ddayModel.js').DdayWidgetPrefs} */ next) => {
        if (!disposed) widgetPrefs = next;
      },
    });
    const widgetWatcher = watchDdayWidgetOpen((open) => {
      if (!disposed) widgetOpen = open;
    });
    register(() => widgetWatcher.dispose());

    const onFocus = () => { todayKey = todayDateKey(); };
    const dayTimer = setInterval(() => { todayKey = todayDateKey(); }, 60_000);
    window.addEventListener('focus', onFocus);

    const onPreviewSync = (/** @type {Event} */ ev) => {
      const d = /** @type {CustomEvent} */ (ev).detail;
      if (d?.label && d?.snapshot) mergeSnapshot(d.label, d.snapshot);
    };
    window.addEventListener('tidy-dday-preview-sync', onPreviewSync);

    void (async () => {
      let resolveTarget = () => {};
      const targetArrived = new Promise((res) => {
        resolveTarget = () => res(undefined);
      });

      try {
        await Promise.all([
          settingsSection.load().catch(() => {}),
          widgetSection.load().catch(() => {}),
          collectAllNoteWindowsDdays()
            .then((list) => {
              if (!disposed && list.length > 0) {
                windows = qaSeedWindows || list;
                if (!windows.some((w) => w.label === targetLabel)) {
                  targetLabel = windows[0].label;
                }
              }
            })
            .catch(() => {}),
          isTauri()
            ? watchCustomFonts((fonts) => {
                if (!disposed) customFonts = fonts;
              })
                .then((off) => register(off))
                .catch(() => {})
            : Promise.resolve(),
        ]);

        try {
          register(
            await subscribeDdayStore(({ section, revision }) => {
              if (section === 'settings') void settingsSection?.external(revision);
              if (section === 'widget') void widgetSection?.external(revision);
            }),
          );
        } catch {}

        if (disposed) return;

        if (isTauri()) {
          const win = getCurrentWindow();
          try {
            if (settings.controlGeometry) {
              await applyDdayWindowBounds(win, settings.controlGeometry, DDAY_CONTROL_BOUNDS, {
                enforceMaxSize: true,
                disableMaximize: true,
              });
            } else {
              const monitors = await getMonitorGeometries();
              const curPos = await win.outerPosition().catch(() => null);
              const curMonitor = findMonitorAtPoint(curPos?.x, curPos?.y, monitors) || pickPrimaryMonitor(monitors);
              await applyControlWindowLimits(win, curMonitor, DDAY_CONTROL_BOUNDS);
              await ensureWindowOnScreen(win, monitors);
            }
          } catch {}

          await win.setAlwaysOnTop(settings.controlAlwaysOnTop).catch(() => {});

          try {
            register(
              await win.onMoved(() => {
                void refreshMonitorLimitsOnMove();
                scheduleSaveControlGeometry(350);
              }),
            );
            register(await win.onResized(() => scheduleSaveControlGeometry(350)));
            register(
              await win.onScaleChanged(() => {
                // I11: DPI 배율 전환 중 setSize 루프 및 과도기 오측정 저장을 막습니다.
                scaleSuppressUntil = performance.now() + 500;
                prevStableGeomKey = '';
                scheduleSaveControlGeometry(540);
              }),
            );
            register(
              await win.onCloseRequested((e) => {
                e.preventDefault();
                void closeModal();
              }),
            );
            register(
              await listen(DDAY_EVENTS.windowUpdated, (ev) => {
                const p = /** @type {any} */ (ev.payload);
                if (p?.label && p?.snapshot) mergeSnapshot(p.label, p.snapshot);
              }),
            );
            register(
              await win.listen(DDAY_EVENTS.setTarget, (ev) => {
                applyTargetPayload(/** @type {any} */ (ev.payload));
                resolveTarget();
              }),
            );
          } catch {}

          ready = true;
          // C1: controlReady 발행 후 setTarget 도착(또는 부트스트랩 확인)과 글꼴 로드를 최대 350ms 기다린 뒤 show() 합니다.
          await emit(DDAY_EVENTS.controlReady, {}).catch(() => {});
          await Promise.race([
            targetArrived,
            new Promise((r) => setTimeout(r, bootstrap.hasBootstrap ? 120 : 350)),
          ]);
          const customMatch = customFonts.find((f) => f.name === uiFontFamily);
          if (customMatch) {
            await Promise.race([
              registerFontFace(customMatch.name, customMatch.path).catch(() => false),
              new Promise((r) => setTimeout(r, 250)),
            ]);
          }
          if (typeof document !== 'undefined' && document.fonts) {
            await Promise.race([
              Promise.allSettled([
                document.fonts.load(`12px ${uiFontStack}`),
                document.fonts.ready,
              ]),
              new Promise((r) => setTimeout(r, 350)),
            ]);
          }
          await tick();
          await win.show().catch(() => {});
          await win.setFocus().catch(() => {});
        } else {
          ready = true;
        }
      } finally {
        ready = true;
        if (isTauri() && !disposed) {
          void getCurrentWindow().show().catch(() => {});
        }
      }
    })();

    return () => {
      disposed = true;
      ddaySorter.destroy();
      removalGuard.clear();
      ro?.disconnect();
      offs.forEach((fn) => fn());
      clearInterval(dayTimer);
      if (noticeTimer) clearTimeout(noticeTimer);
      if (saveGeomTimer) clearTimeout(saveGeomTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('tidy-dday-preview-sync', onPreviewSync);
      if (!isTauri()) delete /** @type {any} */ (window).__ddayControlQA;
      settingsSection?.dispose();
      widgetSection?.dispose();
    };
  });
</script>

<svelte:window
  onkeydown={handleKeydown}
  onblur={() => {
    contextMenu = null;
    ddaySorter.cancel();
  }}
/>

<div
  class="ctrl-host"
  class:is-preview={preview || !isTauri()}
  class:has-preview-frame={hasPreviewFrame}
  style={themeStyle}
>
  <div
    bind:this={shellEl}
    class="ctrl-shell"
    class:is-compact={layout.compactWidth}
    class:is-wide={layout.wideEdit}
    class:is-short={layout.shortHeight}
    data-scheme={dark ? 'dark' : 'light'}
    data-theme={themeTokens.themeId}
    data-tier={layout.tier}
    style="--ui-font-family: {uiFontStack}; --global-font-family: {memoFontStack}; --ui-font-scale: {uiFontSize / 10}; --ctrl-font-size: {metrics.fsBody}px; {metricsStyle}; {previewFrameStyle}"
    role="dialog"
    aria-label="D-Day 컨트롤 타워"
  >
    {#if subView === 'create' || (subView === 'edit' && editingItem)}
      <DdayEditSheet
        mode={subView === 'edit' ? 'edit' : 'create'}
        item={subView === 'edit' ? editingItem : null}
        linkedTodoText={editingLinkedTodoText}
        {settings}
        {todayKey}
        {themeColor}
        {accent}
        {dark}
        wide={layout.wideEdit}
        veryNarrow={layout.veryNarrow}
        onheaderdblclick={() => void toggleControlSize()}
        oncancel={() => { subView = 'main'; editingDdayId = null; }}
        onsave={handleSaveSheet}
        ondelete={handleDeleteFromSheet}
      />
    {:else if subView === 'archive'}
      <DdayArchiveView
        items={archivedItems}
        {accent}
        {dark}
        wideGrid={layout.archiveGrid2Col}
        fullDate={layout.archiveFullDate}
        veryNarrow={layout.veryNarrow}
        onheaderdblclick={() => void toggleControlSize()}
        onback={() => (subView = 'main')}
        onrestore={handleRestore}
        ondelete={(id) => sendCommand('delete', { ddayId: id, deleteLinkedTodo: false })}
        onclearall={() => sendCommand('clear-archived')}
      />
    {:else}
      <!-- 드래그 가능한 상단 헤더 (더블클릭으로 기본 ↔ 와이드 크기 전환) -->
      <header class="ctrl-head" use:draggable title="드래그해 이동 · 더블클릭해 창 크기 전환">
        <span class="ctrl-logo" aria-hidden="true">
          <DdayControlGlyph state={headerGlyphState} size={18} />
        </span>
        <div class="ctrl-head-copy">
          <strong>D-Day 컨트롤</strong>
          {#if !layout.compactWidth && !layout.shortHeight}
            <small>할 일 연동 · 상단 배너 · 바탕화면 위젯</small>
          {/if}
        </div>
        <div
          class="ctrl-head-actions"
          role="group"
          aria-label="창 제어"
          data-no-drag
          use:blockDrag
        >
          <button
            type="button"
            class="ctrl-head-btn"
            class:pin-on={settings.controlAlwaysOnTop}
            aria-label={settings.controlAlwaysOnTop ? '항상 위 고정 해제' : '항상 위에 고정'}
            aria-pressed={settings.controlAlwaysOnTop}
            title={settings.controlAlwaysOnTop ? '항상 위 고정 해제' : '항상 위에 고정'}
            onclick={() => void toggleControlPin()}
          >
            {#if settings.controlAlwaysOnTop}
              <Pin size={14} strokeWidth={2.2} />
            {:else}
              <PinOff size={14} strokeWidth={2.2} />
            {/if}
          </button>
          <button
            type="button"
            class="ctrl-head-btn"
            aria-label={layout.wideEdit ? '기본 크기로 축소' : '넓게 보기'}
            title={layout.wideEdit
              ? `기본 크기(${DDAY_CONTROL_BOUNDS.defaultWidth}×${DDAY_CONTROL_BOUNDS.defaultHeight})로 복원`
              : `넓게 보기(${DDAY_CONTROL_BOUNDS.wideWidth}×${DDAY_CONTROL_BOUNDS.wideHeight})`}
            onclick={() => void toggleControlSize(layout.wideEdit ? 'default' : 'wide')}
          >
            {#if layout.wideEdit}
              <Minimize2 size={14} strokeWidth={2.2} />
            {:else}
              <Maximize2 size={14} strokeWidth={2.2} />
            {/if}
          </button>
          <button type="button" class="ctrl-head-btn ctrl-close" aria-label="닫기" title="닫기" onclick={() => void closeModal()}>
            <X size={15} strokeWidth={2.3} />
          </button>
        </div>
      </header>

      <!-- 2개 이상의 메모 창이 있을 때 대상 창 전환 -->
      {#if windows.length >= 2}
        <div class="ctrl-win-bar" role="tablist" aria-label="대상 메모 창 선택">
          {#each windows as w (w.label)}
            <button
              type="button"
              role="tab"
              aria-selected={targetLabel === w.label}
              class="ctrl-win-pill"
              class:on={targetLabel === w.label}
              onclick={() => { targetLabel = w.label; focusDdayId = null; previewOrder = null; contextMenu = null; }}
              title={stripHtmlToTitle(w.title, 20)}
            >
              {stripHtmlToTitle(w.title, 12)}
            </button>
          {/each}
        </div>
      {/if}

      <!-- 2탭 세그먼트 바 -->
      <div class="ctrl-tabs-wrap">
        <div class="ctrl-tabs" role="tablist" aria-label="D-Day 컨트롤 메뉴">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'list'}
            class="ctrl-tab"
            class:on={activeTab === 'list'}
            onclick={() => { activeTab = 'list'; previewOrder = null; contextMenu = null; }}
          >
            <span>D-Day 목록</span>
            <span class="ctrl-tab-badge tnum">{displayedActiveItems.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'settings'}
            class="ctrl-tab"
            class:on={activeTab === 'settings'}
            onclick={() => { activeTab = 'settings'; previewOrder = null; contextMenu = null; }}
          >
            <span>설정 · 보관</span>
            <span class="ctrl-tab-badge tnum">{archivedItems.length}</span>
          </button>
        </div>
      </div>

      <div bind:this={scrollEl} class="ctrl-scroll">
        {#if activeTab === 'list'}
          <!-- 상단 배너 미니 프리뷰 & 모드 토글 -->
          <section class="ctrl-banner-box" aria-label="메모 상단 배너 설정">
            <div class="ctrl-banner-head">
              <div class="ctrl-banner-label">
                <PanelTop size={12} strokeWidth={2.3} />
                <span>메모 상단 배너</span>
              </div>
              <div class="ctrl-banner-modes" role="radiogroup" aria-label="배너 표시 형식">
                <button
                  type="button"
                  role="radio"
                  aria-checked={(currentWindowSnap?.ddayBannerMode ?? 'single') === 'single'}
                  class:on={(currentWindowSnap?.ddayBannerMode ?? 'single') === 'single'}
                  onclick={() => sendCommand('set-banner-mode', { mode: 'single' })}
                >대표 1개</button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={currentWindowSnap?.ddayBannerMode === 'bento'}
                  class:on={currentWindowSnap?.ddayBannerMode === 'bento'}
                  onclick={() => sendCommand('set-banner-mode', { mode: 'bento' })}
                >2열 그리드</button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={currentWindowSnap?.ddayBannerMode === 'hidden'}
                  class:on={currentWindowSnap?.ddayBannerMode === 'hidden'}
                  onclick={() => sendCommand('set-banner-mode', { mode: 'hidden' })}
                >숨김</button>
              </div>
            </div>

            {#if (currentWindowSnap?.ddayBannerMode ?? 'single') === 'hidden'}
              <p class="ctrl-banner-empty">배너가 숨김 상태예요. 위젯이나 할 일 목록에서는 계속 볼 수 있어요.</p>
            {:else if bannerItems.length === 0}
              <p class="ctrl-banner-empty">배너에 켠 D-Day가 없어요. 아래 행에서 <strong>배너</strong>를 켜 보세요.</p>
            {:else}
              <div class="ctrl-banner-prev">
                <DdayBanner
                  items={bannerItems}
                  mode={currentWindowSnap?.ddayBannerMode ?? 'single'}
                  {todayKey}
                  {themeColor}
                  {accent}
                  {dark}
                  compact={true}
                  onselect={(id) => { editingDdayId = id; subView = 'edit'; }}
                  onmanage={() => {}}
                />
              </div>
            {/if}
          </section>

          <div class="ctrl-sec-head">
            <div class="ctrl-sec-left">
              <span class="ctrl-sec-title">진행 중 <strong class="tnum">{displayedActiveItems.length}</strong></span>
              {#if displayedActiveItems.length >= 2 && !layout.compactWidth}
                <span class="ctrl-sort-hint">끌어서 순서 변경</span>
              {/if}
            </div>
            <button
              type="button"
              class="ctrl-add-btn"
              onclick={() => { editingDdayId = null; subView = 'create'; }}
            >
              <Plus size={13} strokeWidth={2.6} />
              <span>새 D-Day</span>
            </button>
          </div>

          {#if displayedActiveItems.length === 0}
            <div class="ctrl-empty">
              <span class="ctrl-empty-icon"><DdayControlGlyph state={idleGlyphState} size={22} /></span>
              <strong>등록된 D-Day가 아직 없어요</strong>
              <small>중요한 시험·행사·기념일을 추가하거나, 할 일을 우클릭해 D-Day로 고정할 수 있어요.</small>
              <button
                type="button"
                class="ctrl-empty-cta"
                onclick={() => { editingDdayId = null; subView = 'create'; }}
              >
                <Plus size={13} strokeWidth={2.5} />
                <span>첫 D-Day 만들기</span>
              </button>
            </div>
          {:else}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              class="ctrl-list"
              role="list"
              aria-label="진행 중인 D-Day 목록"
              onpointermove={(e) => removalGuard.onPointerMove(e.clientX, e.clientY)}
            >
              {#each renderActiveItems as item, idx (item.id)}
                <div
                  class="dd-sort-item"
                  role="listitem"
                  data-dday-id={item.id}
                  use:ddaySorter.row={{ id: item.id, index: idx, disabled: !canDragSort }}
                >
                  <DdayRowCard
                    {item}
                    {todayKey}
                    {accent}
                    {dark}
                    forceCompact={compactCapsules}
                    sortable={canDragSort}
                    highlighted={focusDdayId === item.id}
                    shouldBlockContextMenu={() => ddaySorter.isPointerGuardActive()}
                    oncomplete={handleComplete}
                    ontogglechannel={handleToggleChannel}
                    onedit={(id) => { editingDdayId = id; subView = 'edit'; }}
                    oncontextopen={openRowContext}
                  />
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <DdaySettingsTab
            {settings}
            {widgetPrefs}
            archivedCount={archivedItems.length}
            {accent}
            {dark}
            compact={compactCapsules}
            veryNarrow={layout.veryNarrow}
            wide={layout.wideSettings}
            onupdatesettings={handleUpdateSettings}
            onupdatewidgetprefs={handleUpdateWidgetPrefs}
            onopenarchive={() => (subView = 'archive')}
          />
        {/if}
      </div>

      <footer class="ctrl-foot">
        <button
          type="button"
          class="ctrl-widget-btn"
          class:is-open={widgetOpen}
          aria-pressed={widgetOpen}
          disabled={widgetBusy}
          title={widgetOpen ? '클릭해 바탕화면 D-Day 위젯 닫기' : '바탕화면 D-Day 위젯 띄우기'}
          onclick={handleToggleWidget}
        >
          {#if widgetOpen}<span class="ctrl-widget-dot" aria-hidden="true"></span>{/if}
          <LayoutGrid size={13} strokeWidth={2.2} />
          <span>{widgetOpen ? '위젯 켜짐' : '위젯 켜기'}</span>
        </button>
        <button
          type="button"
          class="ctrl-done-btn"
          title="창 닫기"
          onclick={() => void closeModal()}
        >완료</button>
      </footer>
    {/if}

    <!-- 우하단 미세 리사이즈 그립 힌트 (실제 입력은 바깥 DdayResizeHandles가 처리) -->
    <svg class="ctrl-resize-grip" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4.5 10.5L10.5 4.5M8 10.5L10.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>

    {#if noticeText}
      <div class="ctrl-toast" role="status" aria-live="polite">
        <Check size={12} strokeWidth={2.8} />
        <span>{noticeText}</span>
      </div>
    {/if}

    {#if activeContextItem && contextMenu}
      <div
        class="ctrl-ctx-backdrop"
        role="presentation"
        onpointerdown={() => (contextMenu = null)}
      ></div>
      <div
        bind:this={ctxEl}
        class="ctrl-ctx ctx-pocket"
        class:dark={dark}
        data-scheme={dark ? 'dark' : 'light'}
        role="menu"
        tabindex="-1"
        aria-label={`${activeContextItem.title} 빠른 메뉴`}
        onkeydown={handleContextKeydown}
        oncontextmenu={(e) => e.preventDefault()}
        style="left: {contextMenu.x}px; top: {contextMenu.y}px; --surface: {themeTokens.bg}; --accent: {themeTokens.accentInk}; --ctx-accent-ink: {themeTokens.onAccent}; --ctx-width: {ctxWidth}px; font-size: {Math.max(9, uiFontSize)}pt;"
      >
        <ContextRibbonHeader
          leftChip={activeContextCounter?.label || 'D-Day'}
          leftSolid={true}
          title={activeContextItem.title}
          emptyTitle="D-Day"
          rightMeta={activeContextShortDate}
        />

        <div class="ctrl-ctx-ch-card" role="group" aria-label="표시 위치 토글">
          <ContextSegmentRow
            label="표시"
            mode="multi"
            options={activeContextChannelOptions}
            ariaLabel="표시 위치"
          />
        </div>

        <ContextTileGrid tiles={activeContextTiles} ariaLabel="D-Day 빠른 동작" />
      </div>
    {/if}
  </div>

  <DdayResizeHandles
    native={isTauri()}
    debugShow={previewShowHandles}
    edgeSize={4}
    cornerSize={10}
    onResizeStart={() => {
      contextMenu = null;
      ddaySorter.cancel();
    }}
  />
</div>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    width: 100%;
    height: 100%;
    background: transparent !important;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .ctrl-host {
    position: fixed;
    inset: 0;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: stretch;
    background: transparent;
    overflow: hidden;
  }
  .ctrl-host.is-preview.has-preview-frame {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: var(--dd-preview-stage, #ece7db);
    padding: 18px;
    align-items: center;
  }
  .ctrl-host :global(*) {
    box-sizing: border-box;
  }

  .ctrl-shell {
    container: ctrl / size;
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border-radius: 16px;
    background: var(--dd-ctrl-bg, #fdfaf3);
    color: var(--dd-ctrl-ink, #1e2430);
    border: 1px solid var(--dd-ctrl-border, #e8ddb7);
    box-shadow: none;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    isolation: isolate;
    color-scheme: light;
    font-family: var(--ui-font-family, '메이플스토리 L', sans-serif);
    font-size: var(--ctrl-font-size, 12px);
    user-select: none;
  }
  .ctrl-shell[data-scheme='dark'] {
    color-scheme: dark;
  }
  .ctrl-shell :global(button),
  .ctrl-shell :global(input),
  .ctrl-shell :global(select),
  .ctrl-shell :global(textarea) {
    font-family: inherit;
  }
  .ctrl-host.is-preview.has-preview-frame .ctrl-shell {
    box-shadow: 0 16px 38px rgba(15, 23, 42, 0.16);
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .ctrl-head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px var(--dd-pad-x, 14px) 9px;
    cursor: grab;
    flex-shrink: 0;
  }
  .ctrl-shell.is-compact .ctrl-head,
  .ctrl-shell.is-short .ctrl-head {
    padding: 8px var(--dd-pad-x, 11px) 7px;
    gap: 7px;
  }
  .ctrl-head:active {
    cursor: grabbing;
  }
  .ctrl-logo {
    width: clamp(26px, calc(var(--dd-icon-sz, 26px) * 1.12), 34px);
    height: clamp(26px, calc(var(--dd-icon-sz, 26px) * 1.12), 34px);
    border-radius: 10px;
    background: var(--dd-accent-soft);
    color: var(--dd-accent-ink);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .ctrl-head-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ctrl-head-copy strong {
    font-size: var(--dd-fs-head, 13.5px);
    font-weight: 800;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--dd-ctrl-ink);
  }
  .ctrl-head-copy small {
    font-size: var(--dd-fs-sub, 10px);
    color: var(--dd-ctrl-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctrl-head-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    cursor: default;
  }
  .ctrl-head-btn {
    width: 27px;
    height: 27px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--dd-ctrl-muted);
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .ctrl-head-btn :global(svg) {
    pointer-events: none;
  }
  .ctrl-head-btn:hover {
    background: var(--dd-ctrl-surface-muted);
    color: var(--dd-ctrl-ink);
  }
  .ctrl-head-btn.pin-on {
    color: var(--dd-accent-ink);
    background: var(--dd-accent-soft);
  }
  .ctrl-head-btn.ctrl-close:hover {
    background: rgba(225, 29, 72, 0.12);
    color: #e11d48;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-head-btn.ctrl-close:hover {
    background: rgba(251, 113, 133, 0.22);
    color: #fda4af;
  }

  .ctrl-win-bar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 var(--dd-pad-x, 14px) 8px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .ctrl-win-pill {
    height: 23px;
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid var(--dd-ctrl-line);
    background: var(--dd-ctrl-surface);
    color: var(--dd-ctrl-sub);
    font-size: var(--dd-fs-sub, 10.5px);
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
  }
  .ctrl-win-pill.on {
    border-color: var(--dd-accent-border);
    background: var(--dd-accent-soft);
    color: var(--dd-accent-ink);
  }

  .ctrl-tabs-wrap {
    padding: 0 var(--dd-pad-x, 14px) 9px;
    flex-shrink: 0;
  }
  .ctrl-shell.is-short .ctrl-tabs-wrap {
    padding-bottom: 6px;
  }
  .ctrl-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 3px;
    gap: 3px;
    border-radius: 11px;
    background: var(--dd-ctrl-section);
  }
  .ctrl-tab {
    height: clamp(27px, calc(var(--dd-btn-h, 30px) * 0.96), 34px);
    border: 0;
    border-radius: 8.5px;
    background: transparent;
    color: var(--dd-ctrl-sub);
    font: inherit;
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  .ctrl-shell.is-short .ctrl-tab {
    height: 26px;
  }
  .ctrl-tab.on {
    background: var(--dd-ctrl-surface);
    color: var(--dd-ctrl-ink);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.09);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-tab.on {
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }
  .ctrl-tab-badge {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--dd-ctrl-surface-muted);
    font-size: var(--dd-fs-micro, 10px);
    font-weight: 800;
    color: var(--dd-ctrl-sub);
  }
  .ctrl-tab.on .ctrl-tab-badge {
    background: var(--dd-accent-soft);
    color: var(--dd-accent-ink);
  }

  .ctrl-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* C6 + I10: 동쪽 4px 리사이즈 핸들과 스크롤바 비겹침 + measuredNarrow 깜빡임 방지 */
    margin-right: 4px;
    padding: 2px calc(var(--dd-pad-x, 14px) - 4px) 16px var(--dd-pad-x, 14px);
    display: flex;
    flex-direction: column;
    gap: var(--dd-gap, 10px);
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: var(--dd-scroll-thumb, auto) var(--dd-scroll-track, transparent);
  }

  .ctrl-banner-box {
    padding: 9px 10px;
    border-radius: 13px;
    background: var(--dd-ctrl-surface);
    border: 1px solid var(--dd-ctrl-line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ctrl-shell.is-short .ctrl-banner-box {
    padding: 7px 9px;
    gap: 6px;
  }
  .ctrl-banner-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }
  .ctrl-banner-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--dd-fs-sub, 11px);
    font-weight: 800;
    color: var(--dd-ctrl-ink);
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
  }
  .ctrl-banner-label span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ctrl-shell.is-compact .ctrl-banner-label :global(svg) {
    display: none;
  }

  .ctrl-banner-modes {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    border-radius: 8px;
    background: var(--dd-ctrl-section);
    flex-shrink: 0;
  }
  .ctrl-banner-modes button {
    height: 21px;
    padding: 0 7px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--dd-ctrl-sub);
    font-size: var(--dd-fs-micro, 10px);
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .ctrl-shell.is-compact .ctrl-banner-modes button {
    padding: 0 5px;
  }
  .ctrl-banner-modes button.on {
    background: var(--dd-ctrl-surface);
    color: var(--dd-accent-ink);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.09);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-banner-modes button.on {
    background: var(--dd-ctrl-surface-hover);
    color: var(--dd-ctrl-ink);
  }

  .ctrl-banner-empty {
    margin: 0;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px dashed var(--dd-ctrl-line);
    font-size: var(--dd-fs-sub, 10.5px);
    color: var(--dd-ctrl-sub);
    text-align: center;
    word-break: keep-all;
  }

  .ctrl-sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 2px 0;
    min-width: 0;
  }
  .ctrl-sec-left {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .ctrl-sec-title {
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 800;
    color: var(--dd-ctrl-sub);
    white-space: nowrap;
  }
  .ctrl-sec-title strong {
    color: var(--dd-accent-ink);
    margin-left: 2px;
  }
  .ctrl-sort-hint {
    font-size: var(--dd-fs-micro, 9.5px);
    font-weight: 600;
    color: var(--dd-ctrl-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctrl-add-btn {
    height: clamp(25px, calc(var(--dd-btn-h, 29px) * 0.9), 32px);
    padding: 0 10px 0 8px;
    border: 0;
    border-radius: 999px;
    background: var(--dd-accent-fill);
    color: var(--dd-on-accent);
    font: inherit;
    font-size: var(--dd-fs-sub, 11px);
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 3.5px;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--dd-accent-fill) 28%, transparent);
  }
  .ctrl-add-btn:hover {
    filter: brightness(0.95);
  }

  .ctrl-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .dd-sort-item {
    position: relative;
    width: 100%;
    border-radius: 13px;
  }
  /* C7: Svelte scoped :global() + --dd-sort-width / --dnd-width 폴백으로 IACVT 붕괴 방지 */
  .dd-sort-item:global([data-dnd-dragging]) {
    width: var(--dd-sort-width, var(--dnd-width)) !important;
    min-width: var(--dd-sort-width, var(--dnd-width)) !important;
    max-width: var(--dd-sort-width, var(--dnd-width)) !important;
    left: var(--dd-sort-left) !important;
    z-index: 20;
    cursor: grabbing;
  }
  .dd-sort-item:global([data-dnd-dragging]) :global(.dd-row) {
    border-color: var(--dd-accent-border);
    box-shadow: 0 10px 26px rgba(15, 23, 42, 0.2);
    cursor: grabbing;
  }
  .ctrl-shell[data-scheme='dark'] .dd-sort-item:global([data-dnd-dragging]) :global(.dd-row) {
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  }
  /* 끄기·착지 중 내부 버튼 호버·손잡이를 억제해 실수로 완료·편집처럼 보이지 않게 합니다. */
  .dd-sort-item:global(:is([data-dnd-dragging], [data-dnd-dropping])) :global(.dd-check),
  .dd-sort-item:global(:is([data-dnd-dragging], [data-dnd-dropping])) :global(.dd-edit-btn),
  .dd-sort-item:global(:is([data-dnd-dragging], [data-dnd-dropping])) :global(.dd-cap-seg) {
    pointer-events: none;
  }
  .dd-sort-item:global([data-dnd-dragging]:not(:has(.dd-kbd-handle:focus-visible))) :global(.dd-kbd-handle),
  .dd-sort-item:global([data-dnd-dropping]) :global(.dd-kbd-handle) {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  .ctrl-empty {
    padding: 22px 14px;
    border-radius: 14px;
    border: 1.5px dashed var(--dd-ctrl-line);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
  }
  .ctrl-empty-icon {
    width: 36px;
    height: 36px;
    border-radius: 11px;
    background: var(--dd-accent-soft);
    color: var(--dd-accent-ink);
    display: grid;
    place-items: center;
  }
  .ctrl-empty strong {
    font-size: var(--dd-fs-title, 12.5px);
    font-weight: 800;
    color: var(--dd-ctrl-ink);
  }
  .ctrl-empty small {
    font-size: var(--dd-fs-sub, 11px);
    color: var(--dd-ctrl-sub);
    line-height: 1.45;
    word-break: keep-all;
  }
  .ctrl-empty-cta {
    margin-top: 4px;
    height: clamp(28px, calc(var(--dd-btn-h, 30px) * 0.98), 34px);
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--dd-accent-fill);
    color: var(--dd-on-accent);
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    cursor: pointer;
  }

  .ctrl-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px var(--dd-pad-x, 14px) 12px;
    border-top: 1px solid var(--dd-ctrl-line);
    background: var(--dd-ctrl-foot-bg);
    flex-shrink: 0;
  }
  .ctrl-shell.is-short .ctrl-foot {
    padding: 7px var(--dd-pad-x, 12px) 9px;
  }

  .ctrl-widget-btn {
    height: clamp(29px, calc(var(--dd-btn-h, 32px) * 1.04), 37px);
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--dd-accent-border);
    background: var(--dd-accent-soft);
    color: var(--dd-accent-ink);
    font: inherit;
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .ctrl-widget-btn:hover:not(:disabled) {
    filter: brightness(0.97);
  }
  .ctrl-widget-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .ctrl-widget-btn.is-open {
    border-color: var(--dd-accent-fill);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dd-accent-fill) 32%, transparent);
  }
  .ctrl-widget-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--dd-accent-fill);
    flex-shrink: 0;
  }

  /* Q3: 라이트·다크 모드 모두 + 새 D-Day와 동일한 --dd-accent-fill + --dd-on-accent로 통일 */
  .ctrl-done-btn {
    height: clamp(29px, calc(var(--dd-btn-h, 32px) * 1.04), 37px);
    padding: 0 18px;
    border: 0;
    border-radius: 10px;
    background: var(--dd-accent-fill);
    color: var(--dd-on-accent);
    font: inherit;
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }
  .ctrl-done-btn:hover {
    filter: brightness(0.95);
  }

  .ctrl-resize-grip {
    position: absolute;
    right: 7px;
    bottom: 7px;
    color: var(--dd-ctrl-muted);
    opacity: 0.34;
    pointer-events: none;
    z-index: 25;
    transition: opacity 150ms ease;
  }
  .ctrl-shell:hover .ctrl-resize-grip {
    opacity: 0.62;
  }

  .ctrl-toast {
    position: absolute;
    left: 50%;
    bottom: 58px;
    transform: translateX(-50%);
    max-width: calc(100% - 24px);
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--dd-toast-bg);
    color: var(--dd-toast-ink);
    font-size: 11px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
    z-index: 40;
    pointer-events: none;
  }
  .ctrl-toast span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctrl-ctx-backdrop {
    position: absolute;
    inset: 0;
    z-index: 48;
  }
  .ctrl-ctx {
    position: absolute;
    z-index: 50;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22), inset 0 1px 0 var(--ctx-inset);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-ctx {
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.50), inset 0 1px 0 var(--ctx-inset);
  }
  .ctrl-ctx-ch-card {
    padding: 4px;
    margin-bottom: 5px;
    border-radius: var(--ctx-radius-card, 8px);
    background: var(--ctx-field);
    border: 1px solid var(--ctx-line);
  }
</style>
