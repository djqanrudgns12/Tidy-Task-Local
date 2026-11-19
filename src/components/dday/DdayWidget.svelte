<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    ArrowUpRight,
    Check,
    ChevronLeft,
    ChevronRight,
    Ellipsis,
    Flag,
    LocateFixed,
    Pin,
    PinOff,
    Plus,
    Power,
    Repeat,
    Rocket,
    X,
  } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';
  import { PhysicalPosition } from '@tauri-apps/api/dpi';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { watchAppearance } from '../../lib/toolkit/appearance.js';
  import { ensureWindowOnScreen, getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { readLaunchAtStartup, setLaunchAtStartup } from '../../lib/autostart.js';
  import { track } from '../../lib/analytics.js';
  import {
    DDAY_WIDGET_BOUNDS,
    computeProgressPercent,
    formatDotDate,
    normalizeDdayWidgetPrefs,
    resolveToneColor,
    savedDdayGeometry,
    stripHtmlToTitle,
    todayDateKey,
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
  import DdayIcon from './DdayIcon.svelte';
  import DdayResizeHandles from './DdayResizeHandles.svelte';
  import './dday-widget.css';

  let windows = $state<DdayWindowSnapshot[]>([]);
  let prefs = $state.raw(normalizeDdayWidgetPrefs(undefined));
  let systemDark = $state(false);
  let ready = $state(false);
  let closing = $state(false);
  let today = $state(todayDateKey());
  let currentIndex = $state(0);

  let previewSkinOverride = $state<DdaySkin | null>(null);
  let previewSchemeOverride = $state<'light' | 'dark' | null>(null);

  let menu = $state<{ x: number; y: number } | null>(null);
  let menuOpenedAt = 0;
  let menuEl = $state<HTMLDivElement>();
  let boardEl = $state<HTMLElement>();
  let boardW = $state(224);
  let boardH = $state(244);
  let committedTier = $state<'micro' | 'standard' | 'expanded' | null>(null);

  let pinBusy = $state(false);
  let isSnapping = false;
  let startupEnabled = $state(true);
  let startupBusy = $state(false);

  const widgetSection = createDdayWidgetSection({
    onChange: (next: DdayWidgetPrefs) => {
      prefs = next;
    },
  });

  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });

  const effectiveSkin = $derived<DdaySkin>(previewSkinOverride ?? prefs.skin);
  const effectiveDark = $derived.by(() => {
    if (previewSchemeOverride) return previewSchemeOverride === 'dark';
    if (prefs.appearanceMode === 'dark') return true;
    if (prefs.appearanceMode === 'light') return false;
    return systemDark || Boolean(windows[0]?.isDarkMode);
  });

  const inScopeEntries = $derived(flattenWidgetItems(windows, prefs.displayScope, today));
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
  const currentTone = $derived(
    currentEntry ? resolveToneColor(currentEntry.item.tone, '#d97706') : '#d97706',
  );
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

  function blockDrag(node: HTMLElement) {
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener('pointerdown', stop);
    node.addEventListener('mousedown', stop);
    return {
      destroy() {
        node.removeEventListener('pointerdown', stop);
        node.removeEventListener('mousedown', stop);
      },
    };
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
    if (menu || visibleEntries.length < 2) return;
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
      }
    } catch {
      await getCurrentWindow().setAlwaysOnTop(previous).catch(() => {});
    } finally {
      pinBusy = false;
    }
  }

  async function toggleStay() {
    const nextVal = !prefs.autoOpen;
    patch({ autoOpen: nextVal });
    if (nextVal) await saveGeometry(true);
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
    if (!native) {
      dismiss();
      return;
    }
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
      await w.setPosition(new PhysicalPosition(targetX, targetY));
      await saveGeometry(prefs.autoOpen);
    }
    dismiss();
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

  async function openMenu(e?: MouseEvent | KeyboardEvent) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (menu && e && e.type === 'click') {
      dismiss();
      return;
    }
    menuOpenedAt = performance.now();
    const x = e instanceof MouseEvent ? e.clientX : Math.max(12, innerWidth - 40);
    const y = e instanceof MouseEvent ? e.clientY : 36;
    menu = { x, y };
    await tick();
    if (menu && menuEl) {
      const r = menuEl.getBoundingClientRect();
      menu = {
        x: Math.max(7, Math.min(menu.x, innerWidth - r.width - 7)),
        y: Math.max(7, Math.min(menu.y, innerHeight - r.height - 7)),
      };
      menuEl.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }

  function handleWindowBlur() {
    if (menu && performance.now() - menuOpenedAt < 220) return;
    menu = null;
  }

  function dismiss() {
    menu = null;
    boardEl?.focus();
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menu) {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      void openMenu(e);
      return;
    }
    if (!menu && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      cycleEntry(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (menu && menuEl && e.key === 'Tab') {
      const nodes = [...menuEl.querySelectorAll<HTMLElement>('button:not(:disabled), select')];
      const first = nodes[0];
      const last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  let saveTimer: ReturnType<typeof setTimeout>;
  let snapTimer: ReturnType<typeof setTimeout>;

  async function saveGeometry(force = false) {
    if (!native || !ready || !(force || prefs.autoOpen)) return;
    try {
      const captured = await captureWindowGeometry(getCurrentWindow(), DDAY_WIDGET_BOUNDS);
      if (captured) patch({ geometry: captured });
    } catch {}
  }

  async function snapToEdgeIfNear() {
    if (!native || !ready || isSnapping || closing) return;
    try {
      const w = getCurrentWindow();
      const [minimized, maximized, fullscreen] = await Promise.all([
        w.isMinimized().catch(() => false),
        w.isMaximized().catch(() => false),
        w.isFullscreen().catch(() => false),
      ]);
      if (minimized || maximized || fullscreen) return;
      const [pos, size, monitors] = await Promise.all([
        w.outerPosition(),
        w.outerSize(),
        getMonitorGeometries(),
      ]);
      const snapped = snapWidgetRectToEdges(
        { x: pos.x, y: pos.y, width: size.width, height: size.height },
        monitors,
      );
      if (snapped.snapped) {
        isSnapping = true;
        try {
          await w.setPosition(new PhysicalPosition(snapped.x, snapped.y));
        } finally {
          setTimeout(() => {
            isSnapping = false;
          }, 120);
        }
      }
    } catch {}
  }

  async function closeWidget() {
    if (closing) return;
    closing = true;
    clearTimeout(saveTimer);
    clearTimeout(snapTimer);
    try {
      const withTimeout = (p: Promise<unknown>, ms = 400) =>
        Promise.race([p.catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms))]);
      await withTimeout(saveGeometry());
      await withTimeout(widgetSection.settle());
    } catch {
      // 저장 실패나 타임아웃이 위젯 닫기를 막지 않도록 무시합니다.
    } finally {
      if (native) {
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
        if (menu && (Math.abs(w - prevW) >= 2 || Math.abs(h - prevH) >= 2)) {
          menu = null;
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
        try {
          register(
            await watchAppearance((a) => {
              if (!disposed && typeof a.darkMode === 'boolean') systemDark = a.darkMode;
            }),
          );
        } catch {}

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
              await w.setMinSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(DDAY_WIDGET_BOUNDS.minWidth, DDAY_WIDGET_BOUNDS.minHeight)).catch(() => {});
              await ensureWindowOnScreen(w);
            }
          } catch {}

          await w.setAlwaysOnTop(prefs.alwaysOnTop).catch(() => {});

          const scheduleSave = () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => void saveGeometry(), 350);
          };
          const scheduleMove = () => {
            scheduleSave();
            clearTimeout(snapTimer);
            snapTimer = setTimeout(() => void snapToEdgeIfNear(), 240);
          };

          try {
            register(await w.onMoved(scheduleMove));
            register(
              await w.onResized(() => {
                scheduleSave();
                if (menu) menu = null;
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
        } else {
          ready = true;
          if (new URLSearchParams(location.search).has('menu')) {
            await tick();
            void openMenu();
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

<svelte:window onkeydown={keydown} onblur={handleWindowBlur} />

<div
  class="dw-root"
  class:is-preview={!native}
  data-scheme={effectiveDark ? 'dark' : 'light'}
  data-tier={widgetLayout.tier}
  style="--dw-tone: {currentTone}; --dw-num-scale: {widgetLayout.numScale}; --dw-ctrl-sz: {widgetLayout.ctrlBtnSize}px; --dw-icon-sz: {widgetLayout.iconSize}px;"
>
  <main
    bind:this={boardEl}
    class="dw-board"
    tabindex="-1"
    aria-label="D-Day 위젯"
    oncontextmenu={(e) => void openMenu(e)}
    onwheel={handleWheel}
    use:draggable
  >
    {#if !currentEntry}
      <div class="dw-empty-card">
        <div class="dw-empty-top">
          <div
            class="dw-win-controls"
            class:pinned={prefs.alwaysOnTop}
            role="group"
            aria-label="창 제어"
            data-no-drag
            use:blockDrag
          >
            <button
              type="button"
              class="dw-icon-btn"
              aria-label="위젯 설정"
              title="위젯 설정"
              onclick={(e) => void openMenu(e)}
            >
              <Ellipsis size={13} />
            </button>
            <button
              type="button"
              class="dw-icon-btn"
              aria-label="닫기"
              title="닫기"
              onclick={(e) => { e.stopPropagation(); void closeWidget(); }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
        <span class="dw-empty-icon"><Flag size={16} strokeWidth={2.2} /></span>
        <strong>위젯에 표시할 D-Day 없음</strong>
        <small>컨트롤 타워에서 위젯 채널을 켜거나 새 일정을 추가해 보세요.</small>
        <button
          type="button"
          class="dw-empty-btn"
          data-no-drag
          onclick={() => void openControl(null, 'main', true)}
        >
          <Plus size={12} strokeWidth={2.5} />
          <span>D-Day 추가</span>
        </button>
      </div>
    {:else if effectiveSkin === 'w4'}
      <!-- SKIN W-4: 마스킹테이프 폴라로이드 스티커 -->
      <div class="w4-wrap">
        <svg class="w4-tape" viewBox="0 0 88 22" aria-hidden="true">
          <defs>
            <pattern id="dw-washi-stripe" width="6" height="6" patternTransform="rotate(28)" patternUnits="userSpaceOnUse">
              <rect width="3" height="6" fill="rgba(255,255,255,0.34)" />
            </pattern>
          </defs>
          <path
            d="M2,2 L5,5.5 L1,9 L5,12.5 L1,16 L4,19.5 L84,19.5 L87,16 L83,12.5 L87,9 L83,5.5 L86,2 Z"
            fill={effectiveDark ? '#d97706' : '#fcd34d'}
            fill-opacity={effectiveDark ? '0.68' : '0.78'}
          />
          <path
            d="M2,2 L5,5.5 L1,9 L5,12.5 L1,16 L4,19.5 L84,19.5 L87,16 L83,12.5 L87,9 L83,5.5 L86,2 Z"
            fill="url(#dw-washi-stripe)"
          />
        </svg>

        <div class="w4-frame">
          <div class="w4-mat">
            <div class="w4-mat-top">
              <DdayIcon
                icon={currentEntry.item.icon}
                tone={currentEntry.item.tone}
                size="var(--dw-icon-sz, 22px)"
                dark={effectiveDark}
              />
              <div
                class="dw-win-controls"
                class:pinned={prefs.alwaysOnTop}
                role="group"
                aria-label="창 제어"
                data-no-drag
                use:blockDrag
              >
                <button
                  type="button"
                  class="dw-icon-btn"
                  class:pin-on={prefs.alwaysOnTop}
                  aria-label={prefs.alwaysOnTop ? '항상 위 고정 해제' : '항상 위에 고정'}
                  title={prefs.alwaysOnTop ? '고정 해제' : '항상 위에'}
                  onclick={(e) => { e.stopPropagation(); void toggleTop(); }}
                >
                  {#if prefs.alwaysOnTop}<Pin size={12} />{:else}<PinOff size={12} />{/if}
                </button>
                <button
                  type="button"
                  class="dw-icon-btn"
                  aria-label="위젯 설정"
                  title="스킨 · 표시 설정"
                  onclick={(e) => void openMenu(e)}
                >
                  <Ellipsis size={13} />
                </button>
                <button
                  type="button"
                  class="dw-icon-btn dw-close-btn"
                  aria-label="위젯 닫기"
                  title="닫기"
                  onclick={(e) => { e.stopPropagation(); void closeWidget(); }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <button
              type="button"
              class="w4-hero-btn"
              data-no-drag
              onclick={() => void openControl(currentEntry.item.id, currentEntry.windowLabel)}
              title="클릭하여 D-Day 컨트롤 열기"
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
              data-no-drag
              onclick={() => void openControl(currentEntry.item.id, currentEntry.windowLabel)}
              title={`${currentEntry.item.title} (${currentEntry.windowTitle})`}
            >
              <span class="w4-title">{currentEntry.item.title}</span>
            </button>

            {#if visibleEntries.length >= 2}
              <div class="w4-pager" role="group" aria-label="D-Day 전환" data-no-drag>
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
      </div>
    {:else}
      <!-- SKIN W-1: 데스크 플립 캘린더 -->
      <div class="w1-wrap">
        <div class="w1-rings" aria-hidden="true">
          {#each [0, 1] as _ring}
            <svg class="w1-ring-svg" viewBox="0 0 18 22">
              <circle cx="9" cy="17" r="3" fill={effectiveDark ? '#141720' : '#d6ccb8'} />
              <path
                d="M5,17 C5,7 6.5,2 9,2 C11.5,2 13,7 13,17"
                fill="none"
                stroke={effectiveDark ? '#94a3b8' : '#64748b'}
                stroke-width="2.6"
                stroke-linecap="round"
              />
              <path
                d="M7,15 C7,8 7.8,3.8 9,3.8"
                fill="none"
                stroke="#ffffff"
                stroke-opacity="0.7"
                stroke-width="1"
                stroke-linecap="round"
              />
            </svg>
          {/each}
        </div>

        <div class="w1-card">
          <div class="w1-topband">
            <div class="w1-top-left">
              <DdayIcon
                icon={currentEntry.item.icon}
                tone={currentEntry.item.tone}
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

            <div
              class="dw-win-controls"
              class:pinned={prefs.alwaysOnTop}
              role="group"
              aria-label="창 제어"
              data-no-drag
              use:blockDrag
            >
              <button
                type="button"
                class="dw-icon-btn"
                class:pin-on={prefs.alwaysOnTop}
                aria-label={prefs.alwaysOnTop ? '항상 위 고정 해제' : '항상 위에 고정'}
                title={prefs.alwaysOnTop ? '고정 해제' : '항상 위에'}
                onclick={(e) => { e.stopPropagation(); void toggleTop(); }}
              >
                {#if prefs.alwaysOnTop}<Pin size={12} />{:else}<PinOff size={12} />{/if}
              </button>
              <button
                type="button"
                class="dw-icon-btn"
                aria-label="위젯 설정"
                title="스킨 · 표시 설정"
                onclick={(e) => void openMenu(e)}
              >
                <Ellipsis size={13} />
              </button>
              <button
                type="button"
                class="dw-icon-btn dw-close-btn"
                aria-label="위젯 닫기"
                title="닫기"
                onclick={(e) => { e.stopPropagation(); void closeWidget(); }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div class="w1-body">
            <button
              type="button"
              class="w1-flap-btn"
              data-no-drag
              onclick={() => void openControl(currentEntry.item.id, currentEntry.windowLabel)}
              title="클릭하여 D-Day 컨트롤 열기"
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
                data-no-drag
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
            <div class="w1-pager" role="group" aria-label="D-Day 전환" data-no-drag>
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
        </div>
      </div>
    {/if}
  </main>

  <!-- container: size 바깥(형제)에 두어 바깥 투명 6px 테두리만 리사이즈 입력을 받고 상단 우측 버튼과 절대 겹치지 않게 합니다 -->
  <DdayResizeHandles
    {native}
    edgeSize={5}
    cornerSize={12}
    onResizeStart={() => {
      menu = null;
    }}
  />

  {#if menu}
    <button
      type="button"
      class="dw-dismiss"
      aria-label="설정 메뉴 닫기"
      onclick={dismiss}
    ></button>
    <div
      bind:this={menuEl}
      class="dw-menu"
      data-scheme={effectiveDark ? 'dark' : 'light'}
      role="dialog"
      aria-label="D-Day 위젯 설정"
      style="left: {menu.x}px; top: {menu.y}px;"
    >
      <header class="dw-menu-head">
        <DdayIcon icon="flag" tone="accent" size={24} dark={effectiveDark} />
        <strong>D-Day 위젯</strong>
        <button type="button" class="dw-menu-close" aria-label="닫기" onclick={dismiss}>
          <X size={13} />
        </button>
      </header>

      <section class="dw-menu-sec" aria-label="위젯 스킨">
        <h3>스킨</h3>
        <div class="dw-skin-grid" role="radiogroup" aria-label="위젯 스킨 고르기">
          <button
            type="button"
            role="radio"
            aria-checked={effectiveSkin === 'w1'}
            class="dw-skin-card"
            class:on={effectiveSkin === 'w1'}
            onclick={() => selectSkin('w1')}
          >
            <span class="dw-skin-thumb w1-thumb" aria-hidden="true"><i></i><b>D-5</b></span>
            <span>플립 캘린더</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={effectiveSkin === 'w4'}
            class="dw-skin-card"
            class:on={effectiveSkin === 'w4'}
            onclick={() => selectSkin('w4')}
          >
            <span class="dw-skin-thumb w4-thumb" aria-hidden="true"><i></i><b>D-5</b></span>
            <span>폴라로이드</span>
          </button>
        </div>
      </section>

      <section class="dw-menu-sec" aria-label="위젯 배경">
        <h3>배경</h3>
        <div class="dw-mode-row" role="radiogroup" aria-label="배경 테마">
          <button
            type="button"
            role="radio"
            aria-checked={prefs.appearanceMode === 'auto'}
            class="dw-mode-chip"
            class:on={prefs.appearanceMode === 'auto'}
            onclick={() => patch({ appearanceMode: 'auto' })}
          >자동</button>
          <button
            type="button"
            role="radio"
            aria-checked={prefs.appearanceMode === 'light'}
            class="dw-mode-chip"
            class:on={prefs.appearanceMode === 'light'}
            onclick={() => patch({ appearanceMode: 'light' })}
          >크림</button>
          <button
            type="button"
            role="radio"
            aria-checked={prefs.appearanceMode === 'dark'}
            class="dw-mode-chip"
            class:on={prefs.appearanceMode === 'dark'}
            onclick={() => patch({ appearanceMode: 'dark' })}
          >더스크</button>
        </div>
      </section>

      <section class="dw-menu-sec" aria-label="표시할 D-Day">
        <h3>표시 항목</h3>
        <label class="dw-scope-row">
          <span>창 범위</span>
          <select
            value={prefs.displayScope}
            onchange={(e) => patch({ displayScope: e.currentTarget.value })}
          >
            <option value="all">모든 메모 창</option>
            {#each windows as win (win.label)}
              <option value={win.label}>{stripHtmlToTitle(win.title, 18)}</option>
            {/each}
          </select>
        </label>

        {#if inScopeEntries.length > 0}
          <div class="dw-tiles">
            {#each inScopeEntries as entry (entry.key)}
              {@const checked = !prefs.hiddenIds.includes(entry.key)}
              {@const tileTone = resolveToneColor(entry.item.tone, '#d97706')}
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                class="dw-tile"
                style="--dw-tone: {tileTone};"
                onclick={() => toggleHiddenEntry(entry.key)}
              >
                <span class="dw-tile-name">{entry.item.title}</span>
                <span class="dw-tile-check">
                  {#if checked}<Check size={9} strokeWidth={3} />{/if}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <section class="dw-menu-sec" aria-label="창 동작">
        <h3>창 동작</h3>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.alwaysOnTop}
          class="dw-switch"
          onclick={() => void toggleTop()}
        >
          {#if prefs.alwaysOnTop}<Pin size={14} />{:else}<PinOff size={14} />{/if}
          <span class="dw-switch-text">
            항상 위에 고정
            <small>다른 창 위로 위젯을 띄워 둡니다</small>
          </span>
          <span class="dw-knob" aria-hidden="true"><i></i></span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={prefs.autoOpen}
          class="dw-switch"
          onclick={() => void toggleStay()}
        >
          <Rocket size={14} />
          <span class="dw-switch-text">
            Tidy Task와 함께 열기
            <small>앱 실행 시 이 자리와 크기로 다시 띄웁니다</small>
          </span>
          <span class="dw-knob" aria-hidden="true"><i></i></span>
        </button>

        {#if prefs.autoOpen && !startupEnabled}
          <button
            type="button"
            class="dw-startup-helper"
            disabled={startupBusy}
            onclick={() => void enableStartupNow()}
          >
            <Power size={12} />
            <span>{startupBusy ? '등록 중…' : 'Windows 시작 프로그램 함께 켜기'}</span>
          </button>
        {/if}
      </section>

      <div class="dw-actions">
        <button type="button" onclick={() => void centerOnScreen()}>
          <LocateFixed size={13} />
          <span>가운데로</span>
        </button>
        <button
          type="button"
          class="dw-action-pri"
          onclick={() => { dismiss(); void openControl(currentEntry?.item.id ?? null, currentEntry?.windowLabel); }}
        >
          <span>D-Day 컨트롤</span>
          <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  {/if}
</div>
