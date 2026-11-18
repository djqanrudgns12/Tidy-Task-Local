<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { track } from '../../lib/analytics.js';
  import { newId } from '../../lib/ids.js';
  import { timerAnalyticsEvents } from '../../lib/timers/analytics.js';
  import { AlertDialog } from 'bits-ui';
  import {
    Play,
    Pause,
    RotateCcw,
    Flag,
    Pin,
    PinOff,
    Minus,
    Maximize2,
    Minimize2,
    X,
    SlidersHorizontal,
    Check,
    Plus,
    NotebookPen,
    PictureInPicture2,
  } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { PhysicalPosition } from '@tauri-apps/api/dpi';
  import { listen } from '@tauri-apps/api/event';
  import {
    native,
    readSettings,
    patchSettings,
    subscribeSettings,
  } from '../../lib/toolkit/store.js';
  import { defaultPreferences, TIMER_NAMES, TIMER_KINDS } from '../../lib/toolkit/preferences.js';
  import {
    WIDGET_MAX_HEIGHT,
    WIDGET_MAX_WIDTH,
    WIDGET_MIN_HEIGHT,
    WIDGET_MIN_WIDTH,
    defaultTimerDisplayPreferences,
    isValidWidgetBounds,
    normalizeTimerDisplayPreferences,
    type TimerDisplayPreferences,
    type TimerWidgetBounds,
  } from '../../lib/timers/timerDisplayPreferences.js';
  import {
    classifyTimerSurface,
    computeSmartTypography,
    resolveWidgetHeadline,
    snapWidgetToMonitorEdges,
    type TimerSurfaceForm,
  } from '../../lib/timers/layout.js';
  import {
    applyTimerWindowBounds,
    defaultWidgetPlacement,
    readOtherTimerRects,
    type TimerWindowTarget,
  } from '../../lib/timers/windowBounds.js';
  import { getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { isPlausibleCoordinate } from '../../lib/windows/windowPlacement.js';
  import {
    createTimer,
    sampleTimer,
    transitionTimer,
    formatTime,
    sandFraction,
  } from '../../lib/timers/engine.js';
  import { createAlarmTracker, alarmPlan } from '../../lib/timers/alarmPlan.js';
  import { createTimerAudio } from '../../lib/timers/audio.js';
  import { SOUND_KEYS, type SoundRole } from '../../lib/timers/soundLibrary.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import TimerResizeHandles from './TimerResizeHandles.svelte';
  import TimerSettingsPanel from './TimerSettingsPanel.svelte';
  import AnalogTimer from './AnalogTimer.svelte';
  import HourglassTimer from './HourglassTimer.svelte';
  import LapTimeline from './LapTimeline.svelte';
  import StopwatchFace from './StopwatchFace.svelte';

  let { kind } = $props<{ kind: string }>();
  const timerKind = untrack(() => (TIMER_KINDS.includes(kind) ? kind : 'digital'));
  const stopwatch = timerKind === 'stopwatch';
  const timeAdjustments = [
    { label: '10초', ms: 10000 },
    { label: '30초', ms: 30000 },
    { label: '1분', ms: 60000 },
    { label: '5분', ms: 300000 },
    { label: '10분', ms: 600000 },
  ];

  let model = $state(createTimer(timerKind)),
    view = $state(untrack(() => sampleTimer(model, performance.now())));
  let prefs = $state<import('../../lib/toolkit/preferences.js').Preferences>(
    defaultPreferences(timerKind),
  );
  // 4종 타이머가 함께 쓰는 글자 배율·정렬·위젯 위치 설정입니다.
  let displayPrefs = $state<TimerDisplayPreferences>(defaultTimerDisplayPreferences());
  let lastRevision = -1;
  let pendingDisplayPatch: Partial<TimerDisplayPreferences> = {};
  let displaySaveTimer: ReturnType<typeof setTimeout> | undefined;
  let displaySaveInFlight = false;

  // 제목·설명은 이 창에서만 쓰는 활동 내용입니다(저장소·통계로 보내지 않음).
  let title = $state(''),
    note = $state(''),
    titleFocused = $state(false),
    noteFocused = $state(false),
    pinned = $state(false),
    settingsOpen = $state(!stopwatch),
    lapsOpen = $state(false),
    lapsManuallyClosed = $state(false),
    error = $state(''),
    busy = $state(false),
    loaded = $state(false),
    disposed = false;
  let confirmation = $state<'close' | 'reset' | null>(null),
    confirmOpen = $state(false),
    dialRange = $state(60),
    scheme = $state<'light' | 'dark'>('light');

  // 창 상태 머신: normal ↔ widget ↔ fullscreen
  let widgetMode = $state(false),
    fullscreen = $state(false),
    maximized = $state(false),
    windowTransitioning = false,
    programmaticMoveLock = false,
    modeBeforeFullscreen: 'normal' | 'widget' = 'normal',
    pinnedBeforeWidget = false;
  let normalWindowBounds: TimerWindowTarget | null = null;
  let widgetWindowBoundsBeforeFullscreen: TimerWindowTarget | null = null;
  let widgetSnapTimer: ReturnType<typeof setTimeout> | undefined;

  // 전체화면 3초 유휴 크롬 숨김
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  // 반응형 레이아웃 실측
  // 왜 창(winW, winH)과 카드(mainW, mainH)를 나누는가:
  //   surface(사이드 패널 도킹 vs 오버레이, 위젯 폼팩터)가 카드 폭(mainW)에 의존하면
  //   "mainW < 임계 -> 오버레이 전환 -> mainW 확대 -> 오버레이 해제 -> mainW 축소" 무한 진동이 생깁니다.
  //   표면 분류는 항상 고정된 창 크기(winW, winH)만 보고, 글자 크기만 실제 카드 크기(mainW, mainH)에 맞춥니다.
  let winW = $state(0),
    winH = $state(0),
    mainW = $state(0),
    mainH = $state(0);
  let noteInputEl = $state<HTMLTextAreaElement>();
  let compactCancelBtn = $state<HTMLButtonElement>();
  let committedForm: TimerSurfaceForm | null = null;
  let committedNotePx = 0;

  const tracker = createAlarmTracker();
  const analyticsWindowId = newId();
  function reportTransition(before: typeof model) {
    for (const event of timerAnalyticsEvents(before, model)) {
      const operation =
        event === 'timer_completed' || event === 'timer_started'
          ? `${analyticsWindowId}-${model.runId}`
          : newId();
      track(event, { operation });
    }
  }
  const audio = createTimerAudio((message) => {
    if (!disposed) error = message;
  }, timerKind);

  const draggable = (
    node: HTMLElement,
    params?: { onDoubleClick?: (() => void) | null },
  ) => (native ? dragRegion(node, params) : { update() {}, destroy() {} });

  function widgetBodyDrag(node: HTMLElement, active: boolean) {
    let inner =
      active && native
        ? dragRegion(node, { onDoubleClick: () => void windowAction(toggleFullscreen) })
        : null;
    return {
      update(nextActive: boolean) {
        if (nextActive && native && !inner) {
          inner = dragRegion(node, { onDoubleClick: () => void windowAction(toggleFullscreen) });
        } else if ((!nextActive || !native) && inner) {
          inner.destroy();
          inner = null;
        }
      },
      destroy() {
        inner?.destroy();
      },
    };
  }

  const name = TIMER_NAMES[timerKind];
  const shownTime = $derived(formatTime(stopwatch ? view.elapsedMs : view.remainingMs, stopwatch));
  const mainDigits = $derived(shownTime.split('.')[0]);
  const centiDigits = $derived(shownTime.split('.')[1] ?? '');
  const hasNote = $derived(note.trim().length > 0);
  const noteCompact = $derived(!hasNote && !noteFocused);
  const progress = $derived(Math.max(0, Math.min(1, 1 - sandFraction(view))));
  const closeWarning = $derived(
    stopwatch && model.laps.length > 0
      ? '스톱워치 기록도 함께 사라져요.'
      : '진행 중인 타이머가 종료돼요.',
  );

  const surface = $derived.by(() => {
    const next = classifyTimerSurface({
      width: winW || 960,
      height: winH || 680,
      widgetMode,
      fullscreen,
      prevForm: committedForm,
    });
    committedForm = next.snugWidget ? next.form : null;
    return next;
  });

  const typo = $derived.by(() => {
    const next = computeSmartTypography({
      width: mainW || 900,
      height: mainH || 600,
      form: surface.form,
      title,
      note,
      placeholderTitle: name,
      noteFocused,
      displayPrefs,
      prevNotePx: committedNotePx,
    });
    committedNotePx = next.notePx;
    return next;
  });

  const widgetHeadline = $derived(resolveWidgetHeadline(title, note, name));
  const widgetNoteBody = $derived.by(() => {
    const trimmed = (note || '').trim();
    if (!trimmed) return '';
    if (!widgetHeadline.promotedFromNote) return trimmed;
    const lines = trimmed.split(/\r?\n/);
    const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
    if (firstNonEmptyIdx < 0) return '';
    return lines
      .slice(firstNonEmptyIdx + 1)
      .join('\n')
      .trim();
  });

  // 전광판·스톱워치 숫자 길이에 맞춘 동적 폭 계수(1시간 초과 등 자릿수 변화 대응)
  const mainRunUnits = $derived.by(() => {
    const digits = mainDigits.replace(/:/g, '').length;
    const colons = (mainDigits.match(/:/g) || []).length;
    return `calc(${digits} * var(--tk-num-advance, 0.675) + ${colons} * var(--tk-num-colon, 0.246))`;
  });

  function wake() {
    idle = false;
    clearTimeout(idleTimer);
    if (fullscreen && !settingsOpen && !noteFocused && !confirmOpen) {
      idleTimer = setTimeout(() => {
        if (fullscreen && !settingsOpen && !noteFocused && !confirmOpen) idle = true;
      }, 3000);
    }
  }

  $effect(() => {
    if (!fullscreen || settingsOpen || noteFocused || confirmOpen) {
      idle = false;
      clearTimeout(idleTimer);
    } else {
      wake();
    }
  });

  function update() {
    if (disposed) return;
    const now = performance.now();
    view = sampleTimer(model, now);
    if (model.phase === 'running' && view.phase === 'completed') {
      const before = model;
      model = transitionTimer(model, { type: 'sample' }, now);
      reportTransition(before);
    }
    if (timerKind === 'analog' && view.remainingMs > 1800000) dialRange = 60;
  }

  function schedule() {
    const current = sampleTimer(model, performance.now());
    audio.schedule(alarmPlan(current, prefs, tracker));
  }

  async function act(type: string, ms?: number) {
    if (busy || !loaded || disposed) return;
    busy = true;
    error = '';
    try {
      if (type === 'start' || type === 'restart') await audio.ready();
      if (disposed) return;
      const before = sampleTimer(model, performance.now());
      const beforeTransition = model;
      model = transitionTimer(model, { type, ms }, performance.now());
      reportTransition(beforeTransition);
      update();
      if (type === 'record') {
        // 스톱워치: 첫 기록이 생기면 사용자가 직접 닫아 둔 경우가 아닐 때 기록 패널을 자동으로 펼칩니다.
        if (beforeTransition.laps.length === 0 && model.laps.length > 0 && !lapsManuallyClosed) {
          lapsOpen = true;
        }
        return;
      }
      if (type === 'reset' && stopwatch) {
        lapsOpen = false;
        lapsManuallyClosed = false;
      }
      if (type === 'adjust' && before.phase === 'running' && model.phase === 'completed')
        audio.schedule({
          tick: false,
          end: prefs.endEnabled === true,
          endIn: 0,
          warningIn: null,
          warningFor: 0,
        });
      else schedule();
    } finally {
      busy = false;
    }
  }

  async function changePreferences(patch: Record<string, unknown>) {
    prefs = { ...prefs, ...patch };
    if (patch.dialRangeMinutes) dialRange = Number(patch.dialRangeMinutes);
    // 진행 중에 소리를 바꾸면 새 파일을 먼저 받아 둔 뒤 다시 예약합니다.
    if (audio.select(prefs) && model.phase === 'running') await audio.ready();
    if (disposed) return;
    schedule();
    try {
      const saved = await patchSettings(timerKind, patch);
      lastRevision = Math.max(lastRevision, saved.revision);
      error = '';
    } catch {
      error = '이 창에는 적용했지만 설정을 저장하지 못했어요.';
    }
  }

  async function flushDisplayPatch() {
    clearTimeout(displaySaveTimer);
    displaySaveTimer = undefined;
    if (!Object.keys(pendingDisplayPatch).length) return;
    const patch = pendingDisplayPatch;
    pendingDisplayPatch = {};
    displaySaveInFlight = true;
    try {
      const saved = await patchSettings('timerDisplay', patch);
      lastRevision = Math.max(lastRevision, saved.revision);
      if (!Object.keys(pendingDisplayPatch).length) {
        displayPrefs = normalizeTimerDisplayPreferences(
          (saved.preferences as Record<string, unknown>)?.timerDisplay,
        );
      }
      error = '';
    } catch {
      error = '화면 크기 설정을 저장하지 못했어요.';
    } finally {
      displaySaveInFlight = false;
    }
  }

  function changeDisplayPrefs(patch: Partial<TimerDisplayPreferences>) {
    displayPrefs = normalizeTimerDisplayPreferences({ ...displayPrefs, ...patch });
    pendingDisplayPatch = { ...pendingDisplayPatch, ...patch };
    clearTimeout(displaySaveTimer);
    displaySaveTimer = setTimeout(() => {
      void flushDisplayPatch();
    }, 180);
  }

  async function preview(name: string) {
    if (model.phase === 'running') {
      error = '미리 듣기는 잠시 멈춘 뒤 사용할 수 있어요.';
      return;
    }
    await audio.preview(name);
  }

  function chooseSound(role: SoundRole, id: string) {
    const saving = changePreferences({ [SOUND_KEYS[role]]: id });
    if (model.phase !== 'running') void audio.preview(role);
    return saving;
  }

  async function pin() {
    try {
      if (native) await getCurrentWindow().setAlwaysOnTop(!pinned);
      pinned = !pinned;
    } catch {
      error = '항상 위 상태를 바꾸지 못했어요.';
    }
  }

  async function beginNoteEdit() {
    noteFocused = true;
    await tick();
    noteInputEl?.focus();
  }

  function leaveNote() {
    noteFocused = false;
    if (!hasNote) note = '';
  }

  function noteKeys(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    (e.currentTarget as HTMLTextAreaElement).blur();
  }

  function titleKeys(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.stopPropagation();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  async function readExpandedState() {
    const win = getCurrentWindow();
    const [isFull, isMax] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
    fullscreen = isFull;
    maximized = isMax;
    return { win, isFull, isMax };
  }

  async function captureCurrentWindowTarget(): Promise<TimerWindowTarget | null> {
    if (!native) return null;
    const win = getCurrentWindow();
    if (await win.isMinimized().catch(() => false)) return null;
    const [pos, size, scale] = await Promise.all([
      win.outerPosition(),
      win.innerSize(),
      win.scaleFactor(),
    ]);
    if (!isPlausibleCoordinate(pos.x) || !isPlausibleCoordinate(pos.y)) return null;
    const safeScale = scale > 0 ? scale : 1;
    const width = Math.round(size.width / safeScale);
    const height = Math.round(size.height / safeScale);
    if (width <= 0 || height <= 0) return null;
    return {
      physicalX: pos.x,
      physicalY: pos.y,
      logicalX: Math.round(pos.x / safeScale),
      logicalY: Math.round(pos.y / safeScale),
      width,
      height,
    };
  }

  async function captureValidWidgetBounds(): Promise<TimerWidgetBounds | null> {
    const target = await captureCurrentWindowTarget();
    if (!target || target.physicalX == null || target.physicalY == null) return null;
    const bounds: TimerWidgetBounds = {
      physicalX: target.physicalX,
      physicalY: target.physicalY,
      logicalX: target.logicalX ?? target.physicalX,
      logicalY: target.logicalY ?? target.physicalY,
      width: Math.max(WIDGET_MIN_WIDTH, Math.min(WIDGET_MAX_WIDTH, target.width)),
      height: Math.max(WIDGET_MIN_HEIGHT, Math.min(WIDGET_MAX_HEIGHT, target.height)),
    };
    return isValidWidgetBounds(bounds) ? bounds : null;
  }

  function scheduleWidgetSnapAndSave() {
    if (!native || !widgetMode || fullscreen || maximized || windowTransitioning || programmaticMoveLock)
      return;
    clearTimeout(widgetSnapTimer);
    widgetSnapTimer = setTimeout(() => {
      void (async () => {
        if (disposed || !widgetMode || fullscreen || maximized || windowTransitioning || programmaticMoveLock)
          return;
        try {
          const win = getCurrentWindow();
          if (await win.isMinimized()) return;
          const [pos, outerSize, innerSize, scale, monitors] = await Promise.all([
            win.outerPosition(),
            win.outerSize(),
            win.innerSize(),
            win.scaleFactor(),
            getMonitorGeometries(),
          ]);
          if (!isPlausibleCoordinate(pos.x) || !isPlausibleCoordinate(pos.y)) return;

          const snap = snapWidgetToMonitorEdges(
            { x: pos.x, y: pos.y, width: outerSize.width, height: outerSize.height },
            monitors,
          );
          let finalX = pos.x;
          let finalY = pos.y;
          if (snap.snapped && (snap.x !== pos.x || snap.y !== pos.y)) {
            programmaticMoveLock = true;
            await win.setPosition(new PhysicalPosition(snap.x, snap.y));
            finalX = snap.x;
            finalY = snap.y;
            setTimeout(() => {
              programmaticMoveLock = false;
            }, 220);
          }

          const safeScale = scale > 0 ? scale : 1;
          const bounds: TimerWidgetBounds = {
            physicalX: finalX,
            physicalY: finalY,
            logicalX: Math.round(finalX / safeScale),
            logicalY: Math.round(finalY / safeScale),
            width: Math.max(
              WIDGET_MIN_WIDTH,
              Math.min(WIDGET_MAX_WIDTH, Math.round(innerSize.width / safeScale)),
            ),
            height: Math.max(
              WIDGET_MIN_HEIGHT,
              Math.min(WIDGET_MAX_HEIGHT, Math.round(innerSize.height / safeScale)),
            ),
          };
          if (isValidWidgetBounds(bounds)) {
            changeDisplayPrefs({ widgetBounds: bounds });
          }
        } catch {}
      })();
    }, 200);
  }

  async function toggleWidgetMode() {
    if (windowTransitioning) return;
    if (!native) {
      if (!widgetMode) settingsOpen = false;
      widgetMode = !widgetMode;
      return;
    }
    const win = getCurrentWindow();
    windowTransitioning = true;
    try {
      if (!widgetMode) {
        pinnedBeforeWidget = pinned;
        const { isFull, isMax } = await readExpandedState();
        if (!isFull && !isMax) {
          normalWindowBounds = await captureCurrentWindowTarget();
        }
        if (isFull) {
          await win.setFullscreen(false);
          fullscreen = false;
        }
        if (isMax) {
          await win.unmaximize();
          maximized = false;
        }
        settingsOpen = false;
        const [pos, size, monitors, existingRects] = await Promise.all([
          win.outerPosition().catch(() => null),
          win.outerSize().catch(() => null),
          getMonitorGeometries(),
          readOtherTimerRects(win.label),
        ]);
        const target = defaultWidgetPlacement({
          currentPos: pos ? { x: pos.x, y: pos.y } : null,
          currentSize: size ? { width: size.width, height: size.height } : null,
          monitors,
          existingRects,
          savedWidgetBounds: displayPrefs.widgetBounds,
        });
        await applyTimerWindowBounds(win, target, {
          minWidth: WIDGET_MIN_WIDTH,
          minHeight: WIDGET_MIN_HEIGHT,
        });
        await win.setAlwaysOnTop(true);
        pinned = true;
        widgetMode = true;
      } else {
        if (!fullscreen && !maximized) {
          const currentWidget = await captureValidWidgetBounds();
          if (currentWidget) changeDisplayPrefs({ widgetBounds: currentWidget });
        }
        if (fullscreen) {
          await win.setFullscreen(false);
          fullscreen = false;
        }
        if (maximized) {
          await win.unmaximize();
          maximized = false;
        }
        const restoreTarget: TimerWindowTarget = normalWindowBounds ?? { width: 960, height: 680 };
        await applyTimerWindowBounds(win, restoreTarget, {
          minWidth: WIDGET_MIN_WIDTH,
          minHeight: WIDGET_MIN_HEIGHT,
        });
        await win.setAlwaysOnTop(pinnedBeforeWidget);
        pinned = pinnedBeforeWidget;
        widgetMode = false;
      }
    } catch {
      error = '위젯 모드를 전환하지 못했어요.';
    } finally {
      windowTransitioning = false;
    }
  }

  async function toggleFullscreen() {
    if (windowTransitioning) return;
    if (!native) {
      if (!fullscreen) {
        modeBeforeFullscreen = widgetMode ? 'widget' : 'normal';
        await document.documentElement.requestFullscreen?.().catch(() => {});
        fullscreen = true;
      } else {
        if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {});
        fullscreen = false;
      }
      wake();
      return;
    }
    const win = getCurrentWindow();
    windowTransitioning = true;
    try {
      const { isFull, isMax } = await readExpandedState();
      if (!isFull) {
        modeBeforeFullscreen = widgetMode ? 'widget' : 'normal';
        if (widgetMode) {
          widgetWindowBoundsBeforeFullscreen = await captureCurrentWindowTarget();
        } else if (!isMax) {
          normalWindowBounds = await captureCurrentWindowTarget();
        }
        if (isMax) {
          await win.unmaximize();
          maximized = false;
        }
        await win.setFullscreen(true);
        fullscreen = true;
      } else {
        await win.setFullscreen(false);
        fullscreen = false;
        if (modeBeforeFullscreen === 'widget') {
          widgetMode = true;
          if (widgetWindowBoundsBeforeFullscreen) {
            await applyTimerWindowBounds(win, widgetWindowBoundsBeforeFullscreen, {
              minWidth: WIDGET_MIN_WIDTH,
              minHeight: WIDGET_MIN_HEIGHT,
            });
          }
        } else {
          widgetMode = false;
          if (normalWindowBounds) {
            await applyTimerWindowBounds(win, normalWindowBounds, {
              minWidth: WIDGET_MIN_WIDTH,
              minHeight: WIDGET_MIN_HEIGHT,
            });
          }
        }
      }
    } catch {
      error = '전체화면 상태를 바꾸지 못했어요.';
    } finally {
      wake();
      windowTransitioning = false;
    }
  }

  async function restoreNormalFromMaximizedOrFullscreen() {
    if (!native || windowTransitioning) return false;
    const { win, isFull, isMax } = await readExpandedState();
    if (!isFull && !isMax) return false;
    if (isFull) {
      await toggleFullscreen();
      return true;
    }
    windowTransitioning = true;
    try {
      await win.unmaximize();
      maximized = false;
      if (normalWindowBounds) {
        await applyTimerWindowBounds(win, normalWindowBounds, {
          minWidth: WIDGET_MIN_WIDTH,
          minHeight: WIDGET_MIN_HEIGHT,
        });
      }
      return true;
    } finally {
      windowTransitioning = false;
    }
  }

  async function windowAction(action: 'minimize' | 'maximize' | (() => Promise<unknown>)) {
    if (typeof action === 'function') {
      try {
        await action();
      } catch {
        error = '창 상태를 바꾸지 못했어요.';
      }
      return;
    }
    if (!native) return;
    try {
      const win = getCurrentWindow();
      if (action === 'minimize') await win.minimize();
      if (action === 'maximize') {
        const { isFull, isMax } = await readExpandedState();
        if (isFull || isMax) await restoreNormalFromMaximizedOrFullscreen();
        else {
          normalWindowBounds = await captureCurrentWindowTarget();
          await win.maximize();
          maximized = true;
        }
      }
    } catch {
      error = '창 상태를 바꾸지 못했어요.';
    }
  }

  async function finishClose() {
    clearTimeout(widgetSnapTimer);
    if (native && widgetMode && !fullscreen && !maximized) {
      const bounds = await captureValidWidgetBounds().catch(() => null);
      if (bounds) pendingDisplayPatch = { ...pendingDisplayPatch, widgetBounds: bounds };
    }
    await flushDisplayPatch().catch(() => {});
    audio.dispose();
    await closeWindow();
  }

  async function ask(action: 'close' | 'reset') {
    if (action === 'reset' && model.laps.length === 0) {
      void act('reset');
      return;
    }
    if (action === 'close' && model.phase !== 'running' && model.laps.length === 0) {
      await finishClose();
      return;
    }
    confirmation = action;
    confirmOpen = true;
    if (surface.compactConfirm) {
      await tick();
      compactCancelBtn?.focus();
    }
  }

  async function confirm() {
    confirmOpen = false;
    if (confirmation === 'reset') await act('reset');
    else await finishClose();
  }

  async function keys(e: KeyboardEvent) {
    wake();
    // 한글 조합 중에는 어떤 단축키도 가로채지 않습니다.
    if (e.isComposing || e.keyCode === 229) return;
    // 선택 상자 등 하위 팝업이 먼저 Esc를 처리했으면 건너뜁니다.
    if (e.key === 'Escape' && e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (confirmOpen) {
        e.preventDefault();
        confirmOpen = false;
        return;
      }
      e.preventDefault();
      if (native) {
        try {
          if (await restoreNormalFromMaximizedOrFullscreen()) return;
        } catch {
          error = '원래 창 크기로 돌아가지 못했어요.';
          return;
        }
      } else if (fullscreen) {
        await toggleFullscreen();
        return;
      }
      if (settingsOpen) {
        settingsOpen = false;
        return;
      }
      if (stopwatch && lapsOpen) {
        lapsOpen = false;
        lapsManuallyClosed = true;
      }
      return;
    }

    if (
      confirmOpen ||
      e.repeat ||
      (e.target instanceof Element &&
        e.target.closest(
          'button,input,select,textarea,[role="slider"],[role="menu"],[role="dialog"]',
        ))
    )
      return;

    if (e.key === 'F11') {
      e.preventDefault();
      void windowAction(toggleFullscreen);
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.code === 'KeyF') {
        e.preventDefault();
        void windowAction(toggleFullscreen);
        return;
      }
      if (e.code === 'KeyW') {
        e.preventDefault();
        void windowAction(toggleWidgetMode);
        return;
      }
    }
    if (e.code !== 'Space') return;
    e.preventDefault();
    void act(view.phase === 'running' ? 'pause' : view.phase === 'completed' ? 'restart' : 'start');
  }

  // 진행 중일 때만 프레임을 돌려 유휴 타이머가 CPU를 쓰지 않게 합니다.
  let frame = 0;
  function animate() {
    frame = 0;
    if (disposed || model.phase !== 'running') return;
    if (document.visibilityState === 'visible') update();
    frame = requestAnimationFrame(animate);
  }
  $effect(() => {
    if (model.phase === 'running' && !frame && !disposed) frame = requestAnimationFrame(animate);
  });

  onMount(() => {
    let interval: ReturnType<typeof setInterval>;
    const offs: (() => void)[] = [];

    const readScheme = () => {
      scheme = getComputedStyle(document.documentElement).colorScheme.includes('dark')
        ? 'dark'
        : 'light';
    };
    readScheme();
    const schemeObserver = new MutationObserver(readScheme);
    schemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    offs.push(() => schemeObserver.disconnect());

    const onFullscreenChange = () => {
      if (!native) fullscreen = Boolean(document.fullscreenElement);
      wake();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    offs.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange));

    const cleanup = () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearInterval(interval);
      clearTimeout(idleTimer);
      clearTimeout(widgetSnapTimer);
      clearTimeout(displaySaveTimer);
      offs.forEach((fn) => fn());
      audio.dispose();
    };

    void (async () => {
      try {
        const settings = await readSettings();
        if (disposed) return;
        lastRevision = settings.revision;
        prefs = settings.preferences[timerKind];
        displayPrefs = normalizeTimerDisplayPreferences(
          (settings.preferences as Record<string, unknown>)?.timerDisplay,
        );
        audio.select(prefs);
        dialRange = prefs.dialRangeMinutes || 60;
        loaded = true;

        const sub = await subscribeSettings((nextSettings) => {
          if (disposed || nextSettings.revision <= lastRevision) return;
          lastRevision = nextSettings.revision;
          const incoming = normalizeTimerDisplayPreferences(
            (nextSettings.preferences as Record<string, unknown>)?.timerDisplay,
          );
          if (displaySaveInFlight || Object.keys(pendingDisplayPatch).length) {
            displayPrefs = normalizeTimerDisplayPreferences({ ...incoming, ...pendingDisplayPatch });
          } else {
            displayPrefs = incoming;
          }
        });
        if (disposed) sub();
        else offs.push(sub);

        if (native) {
          const win = getCurrentWindow();
          await readExpandedState();
          const resized = await win.onResized(async () => {
            try {
              await readExpandedState();
              scheduleWidgetSnapAndSave();
            } catch {}
          });
          if (disposed) resized();
          else offs.push(resized);

          const moved = await win.onMoved(() => {
            scheduleWidgetSnapAndSave();
          });
          if (disposed) moved();
          else offs.push(moved);

          const close = await win.onCloseRequested((e) => {
            e.preventDefault();
            void ask('close');
          });
          if (disposed) close();
          else offs.push(close);

          const quit = await listen('before-quit', () => {
            void flushDisplayPatch();
            audio.dispose();
          });
          if (disposed) quit();
          else offs.push(quit);

          const prep = await listen('update-prepare', () => {
            void flushDisplayPatch();
          });
          if (disposed) prep();
          else offs.push(prep);
        }
      } catch {
        error = '설정을 읽지 못했어요. 기본 설정으로 사용할 수 있어요.';
        loaded = true;
      }
    })();

    interval = setInterval(() => {
      if (document.visibilityState !== 'visible' && model.phase === 'running') update();
    }, 250);

    return cleanup;
  });
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} onkeydown={keys} onpointermove={wake} onpointerdown={wake} />

<main
  class="timer-frame"
  class:is-complete={view.phase === 'completed'}
  class:is-running={view.phase === 'running'}
  class:is-paused={view.phase === 'paused'}
  class:stopwatch-frame={stopwatch}
  class:snug-widget={surface.snugWidget}
  class:widget-explicit={widgetMode}
  class:fullscreen
  class:idle={idle && fullscreen}
  class:compact-controls={surface.compactControls || (!surface.snugWidget && (mainW || 900) < 680)}
  data-kind={timerKind}
  data-form={surface.form}
  data-scheme={scheme}
  style:--timer-title-px={`${typo.titlePx}px`}
  style:--timer-note-px={`${typo.notePx}px`}
  style:--timer-note-max-h={`${typo.noteMaxHeightPx}px`}
  style:--timer-note-width={`${typo.availNoteWidth}px`}
  style:--timer-note-align={typo.resolvedAlign}
  style:--widget-note-lines={surface.maxNoteLines}
>
  <TimerResizeHandles
    {native}
    {fullscreen}
    {maximized}
    snugWidget={surface.snugWidget}
    onToggleFullscreen={() => void windowAction(toggleFullscreen)}
    onError={(msg) => (error = msg)}
  />

  {#if !surface.snugWidget}
    <header
      class="timer-titlebar"
      use:draggable={{ onDoubleClick: () => void windowAction(toggleFullscreen) }}
    >
      <div class="timer-kind">
        <img src="/images/toolkit/toolkit-icon.png" alt="" /><span>Tidy 툴킷</span><span
          class="titlebar-dot">·</span
        ><span>{name}</span>
      </div>
      <div class="window-actions">
        <button
          class="widget-toggle-btn"
          aria-label="위젯 모드로 전환"
          title="작은 플로팅 위젯으로 띄우기 (W)"
          onclick={() => void windowAction(toggleWidgetMode)}
          ><PictureInPicture2 size={15} /><span>위젯</span></button
        ><button
          class:pinned
          aria-label="항상 위"
          aria-pressed={pinned}
          title="항상 위"
          onclick={pin}><Pin size={15} fill={pinned ? 'currentColor' : 'none'} /></button
        ><span></span><button aria-label="최소화" onclick={() => windowAction('minimize')}
          ><Minus size={16} /></button
        ><button
          aria-label={fullscreen ? '전체화면 종료' : '최대화 또는 복원'}
          title={fullscreen ? '전체화면 종료 (Esc / F11)' : '창 최대화'}
          onclick={() => windowAction(fullscreen ? toggleFullscreen : 'maximize')}
          >{#if fullscreen}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}</button
        ><button class="window-close" aria-label="닫기" onclick={() => void ask('close')}
          ><X size={18} /></button
        >
      </div>
    </header>
  {/if}

  <div class="timer-workspace" class:overlay-panels={surface.overlayPanels}>
    <div
      class="timer-layout"
      class:with-settings={settingsOpen && !surface.snugWidget}
      class:with-laps={stopwatch && lapsOpen && !surface.snugWidget}
      class:overlay-panels={surface.overlayPanels}
    >
      <section
        class="timer-main"
        aria-label={name}
        bind:clientWidth={mainW}
        bind:clientHeight={mainH}
        use:widgetBodyDrag={surface.snugWidget}
      >
        {#if surface.snugWidget}
          <!-- 착 달라붙은 위젯 상단 리본: 상태 점 + 제목(또는 승격된 설명 1줄) + 호버 마이크로 버튼 -->
          <header class="widget-ribbon">
            <span
              class="widget-status-dot"
              class:running={view.phase === 'running'}
              class:complete={view.phase === 'completed'}
              aria-hidden="true"
            ></span>
            <input
              class="timer-title-input widget-title-input"
              class:promoted={widgetHeadline.promotedFromNote && !titleFocused}
              aria-label="활동 제목"
              placeholder={widgetHeadline.text}
              title={title ? '활동 이름 수정' : '활동 이름 입력'}
              bind:value={title}
              maxlength="40"
              onfocus={() => (titleFocused = true)}
              onblur={() => (titleFocused = false)}
              onkeydown={titleKeys}
            />
          </header>

          <!-- 호버·정지·완료 상태에서만 부드럽게 나타나는 상단 우측 마이크로 액션 -->
          <div class="widget-micro-actions" data-no-drag>
            <button
              class:active={pinned}
              aria-label={pinned ? '항상 위 해제' : '항상 위 고정'}
              aria-pressed={pinned}
              title={pinned ? '항상 위 켜짐' : '항상 위'}
              onclick={pin}
              >{#if pinned}<Pin size={13} />{:else}<PinOff size={13} />{/if}</button
            >
            <button
              aria-label={widgetMode ? '일반 창으로 돌아가기' : '위젯 모드 전환'}
              title={widgetMode ? '일반 창으로 돌아가기 (W)' : '플로팅 위젯으로 고정 (W)'}
              onclick={() => void windowAction(toggleWidgetMode)}
              ><Maximize2 size={13} /></button
            >
            <button
              class="close"
              aria-label="타이머 닫기"
              title="닫기"
              onclick={() => void ask('close')}><X size={14} /></button
            >
          </div>

          {#if surface.form === 'card' || surface.form === 'tall' || (surface.form === 'tile' && surface.maxNoteLines > 0 && hasNote)}
            {#if noteFocused}
              <label class="widget-note-editor" data-no-drag>
                <textarea
                  bind:this={noteInputEl}
                  class="timer-note-input widget-note-textarea"
                  aria-label="활동 설명"
                  placeholder="활동 내용을 적어 주세요."
                  rows="2"
                  maxlength="1000"
                  spellcheck="false"
                  bind:value={note}
                  onblur={leaveNote}
                  onkeydown={noteKeys}
                ></textarea>
              </label>
            {:else if hasNote && widgetNoteBody}
              <button
                type="button"
                class="widget-note-preview"
                data-no-drag
                title="클릭하여 설명 수정"
                onclick={() => void beginNoteEdit()}
              >
                {widgetNoteBody}
              </button>
            {:else if surface.form === 'card' || surface.form === 'tall'}
              <button
                type="button"
                class="widget-note-add"
                data-no-drag
                onclick={() => void beginNoteEdit()}
              >
                <NotebookPen size={12} /><span>{hasNote ? '설명 수정' : '설명'}</span>
              </button>
            {/if}
          {/if}
        {:else}
          <header class="timer-panel-heading">
            <div class="timer-title-row">
              <input
                class="timer-title-input"
                aria-label="활동 제목"
                placeholder={name}
                title={title ? '활동 이름 수정' : '활동 이름 입력'}
                bind:value={title}
                maxlength="40"
                onfocus={() => (titleFocused = true)}
                onblur={() => (titleFocused = false)}
                onkeydown={titleKeys}
              />
              <div class="timer-heading-tools">
                {#if stopwatch}
                  <button
                    class="timer-laps-toggle"
                    class:active={lapsOpen}
                    aria-expanded={lapsOpen}
                    title={lapsOpen ? '기록 패널 접기' : '기록 패널 보기'}
                    onclick={() => {
                      lapsOpen = !lapsOpen;
                      lapsManuallyClosed = !lapsOpen;
                    }}
                    ><Flag size={15} /><span>기록</span>{#if model.laps.length > 0}<em
                        class="lap-count-badge">{model.laps.length}</em
                      >{/if}</button
                  >
                {/if}
                <button
                  class="timer-settings-toggle"
                  class:active={settingsOpen}
                  aria-expanded={settingsOpen}
                  aria-controls="timer-settings-panel"
                  onclick={() => (settingsOpen = !settingsOpen)}
                  ><SlidersHorizontal size={16} /><span>{settingsOpen
                      ? '설정 접기'
                      : '설정'}</span></button
                >
              </div>
            </div>
            <label
              class="timer-note"
              class:compact={noteCompact}
              class:align-left={!noteCompact && typo.resolvedAlign === 'left'}
            >
              <NotebookPen class="note-mark" aria-hidden="true" />
              <textarea
                bind:this={noteInputEl}
                class="timer-note-input"
                aria-label="활동 설명"
                placeholder={noteCompact ? '설명 추가' : '활동 방법, 준비물, 주의할 점을 적어 주세요.'}
                rows="1"
                maxlength="1000"
                spellcheck="false"
                bind:value={note}
                onfocus={() => (noteFocused = true)}
                onblur={leaveNote}
                onkeydown={noteKeys}
              ></textarea>
            </label>
          </header>
        {/if}

        <div
          class="timer-stage"
          class:digital={timerKind === 'digital' || stopwatch}
          class:analog={timerKind === 'analog'}
          class:hourglass={timerKind === 'hourglass'}
        >
          {#if timerKind === 'analog'}
            <AnalogTimer
              remaining={view.remainingMs}
              range={dialRange}
              editable={view.phase !== 'running'}
              density={surface.analogDensity}
              onset={(ms) => act('set', ms)}
            />
            <div class="analog-caption">
              <span class="secondary-time">{shownTime}</span>{#if !surface.snugWidget}<span
                  class="dial-range">한 바퀴 {dialRange}분</span
                >{/if}
            </div>
          {:else if timerKind === 'hourglass'}
            <HourglassTimer
              fraction={sandFraction(view)}
              running={view.phase === 'running'}
              compact={surface.snugWidget}
            />{#if prefs.showRemainingTime || surface.snugWidget}<span class="secondary-time"
                >{shownTime}</span
              >{/if}
          {:else if stopwatch}
            <StopwatchFace
              time={shownTime}
              variant={surface.stopwatchVariant}
              lapCount={model.laps.length}
            />
          {:else}
            <div class="digital-board" style:--num-run-dynamic={mainRunUnits}>
              {#if !surface.snugWidget}
                <div class="board-rivets" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                <div class="board-caption">
                  <span><i></i>남은 시간</span>
                  <small>분 : 초</small>
                </div>
              {/if}
              <div class="digital-time" aria-label={shownTime}>
                <span>{mainDigits}</span>{#if centiDigits}<small>.{centiDigits}</small>{/if}
              </div>
              <div class="digital-progress" aria-hidden="true">
                <span style:width={`${progress * 100}%`}></span><i
                  style:left={`${progress * 100}%`}></i>
              </div>
            </div>
          {/if}

          {#if view.phase === 'completed' && surface.form !== 'strip' && surface.form !== 'tile'}
            <div class="completion-message" aria-live="polite">
              <Check size={17} /><span>시간이 끝났어요</span>
            </div>
          {/if}
        </div>

        {#if surface.snugWidget}
          <div class="widget-controls" data-no-drag>
            {#if !stopwatch && (surface.form === 'card' || surface.form === 'tall')}
              <button
                class="widget-step-chip"
                aria-label="1분 줄이기"
                disabled={!loaded || busy || view.remainingMs === 0}
                onclick={() => act('adjust', -60000)}>−1분</button
              >
            {/if}
            <button
              class="widget-secondary-btn"
              aria-label={stopwatch ? '초기화' : '다시 설정'}
              title={stopwatch ? '초기화' : '다시 설정'}
              onclick={() => (stopwatch ? ask('reset') : act('reset'))}
              ><RotateCcw size={14} />{#if surface.form === 'tall'}<span>{stopwatch ? '초기화' : '재설정'}</span>{/if}</button
            >
            <button
              class="widget-primary-btn"
              aria-label={view.phase === 'running'
                ? '일시정지'
                : view.phase === 'completed'
                  ? '다시 시작'
                  : view.phase === 'paused'
                    ? '계속하기'
                    : '시작'}
              disabled={!loaded ||
                busy ||
                (!stopwatch && view.remainingMs === 0 && view.phase !== 'completed')}
              onclick={() =>
                act(
                  view.phase === 'running'
                    ? 'pause'
                    : view.phase === 'completed'
                      ? 'restart'
                      : 'start',
                )}
            >
              {#if view.phase === 'running'}
                <Pause size={15} fill="currentColor" />{#if surface.form === 'card' || surface.form === 'tall'}<span>일시정지</span>{/if}
              {:else}
                <Play size={15} fill="currentColor" />{#if surface.form === 'card' || surface.form === 'tall'}<span>{view.phase === 'completed'
                      ? '다시 시작'
                      : view.phase === 'paused'
                        ? '계속'
                        : '시작'}</span>{/if}
              {/if}
            </button>
            {#if stopwatch}
              <button
                class="widget-secondary-btn"
                aria-label="기록"
                title="구간 기록"
                disabled={view.phase !== 'running'}
                onclick={() => act('record')}><Flag size={14} /></button
              >
            {:else if surface.form === 'card' || surface.form === 'tall'}
              <button
                class="widget-step-chip"
                aria-label="1분 늘리기"
                disabled={!loaded || busy || view.remainingMs >= 3600000}
                onclick={() => act('adjust', 60000)}>+1분</button
              >
            {/if}
          </div>

          {#if stopwatch && surface.form === 'tall' && model.laps.length > 0 && mainH >= 310}
            <div class="widget-mini-laps" data-no-drag aria-label="최근 기록">
              {#each [...model.laps].reverse().slice(0, 3) as lap (lap.id)}
                <div class="widget-mini-lap">
                  <span>#{String(lap.sequence).padStart(2, '0')}</span>
                  <time>{formatTime(lap.elapsedMs, true)}</time>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="timer-control-area">
            <div class="control-dock">
              <div class="primary-controls">
                <button
                  class="secondary-action"
                  aria-label={stopwatch ? '초기화' : '다시 설정'}
                  onclick={() => (stopwatch ? ask('reset') : act('reset'))}
                  ><RotateCcw size={16} /><span>{stopwatch ? '초기화' : '다시 설정'}</span></button
                ><button
                  class="primary-action"
                  disabled={!loaded ||
                    busy ||
                    (!stopwatch && view.remainingMs === 0 && view.phase !== 'completed')}
                  onclick={() =>
                    act(
                      view.phase === 'running'
                        ? 'pause'
                        : view.phase === 'completed'
                          ? 'restart'
                          : 'start',
                    )}
                  >{#if view.phase === 'running'}<Pause size={18} fill="currentColor" /><span
                      >일시정지</span
                    >{:else}<Play size={18} fill="currentColor" /><span
                      >{view.phase === 'completed'
                        ? '다시 시작'
                        : view.phase === 'paused'
                          ? '계속하기'
                          : '시작'}</span
                    >{/if}</button
                >{#if stopwatch}<button
                    class="secondary-action"
                    disabled={view.phase !== 'running'}
                    onclick={() => act('record')}><Flag size={16} /><span>기록</span></button
                  >{/if}
              </div>
              {#if !stopwatch}
                <div class="dock-adjustments" role="group" aria-label="빠른 시간 조절">
                  {#each timeAdjustments as adjustment}
                    <div class="dock-step">
                      <button
                        type="button"
                        class="decrease"
                        aria-label={`${adjustment.label} 줄이기`}
                        title={`${adjustment.label} 줄이기`}
                        disabled={!loaded || busy || view.remainingMs === 0}
                        onclick={() => act('adjust', -adjustment.ms)}
                        ><Minus size={13} strokeWidth={2.6} /></button
                      ><span class="dock-step-label">{adjustment.label}</span><button
                        type="button"
                        class="increase"
                        aria-label={`${adjustment.label} 늘리기`}
                        title={`${adjustment.label} 늘리기`}
                        disabled={!loaded || busy || view.remainingMs >= 3600000}
                        onclick={() => act('adjust', adjustment.ms)}
                        ><Plus size={13} strokeWidth={2.6} /></button
                      >
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </section>

      {#if stopwatch && lapsOpen && !surface.snugWidget}<LapTimeline laps={model.laps} />{/if}
      {#if settingsOpen && loaded && !surface.snugWidget}
        <TimerSettingsPanel
          id="timer-settings-panel"
          kind={timerKind}
          {prefs}
          {displayPrefs}
          phase={view.phase}
          remaining={view.remainingMs}
          {dialRange}
          onchange={changePreferences}
          ondisplaychange={changeDisplayPrefs}
          onset={(ms) => act('set', ms)}
          onpreview={preview}
          onsound={chooseSound}
        />
      {/if}
    </div>

    {#if error}
      <div role="alert" class="timer-error">
        <span>{error}</span><button aria-label="알림 닫기" onclick={() => (error = '')}
          ><X size={14} /></button
        >
      </div>
    {/if}
  </div>

  {#if confirmOpen && surface.compactConfirm}
    <div
      class="timer-compact-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-label={confirmation === 'reset' ? '기록 초기화 확인' : '타이머 닫기 확인'}
      data-no-drag
    >
      <p>{confirmation === 'reset' ? '기록을 초기화할까요?' : '진행 중인 타이머를 닫을까요?'}</p>
      <div class="compact-confirm-actions">
        <button
          type="button"
          class="secondary-action"
          bind:this={compactCancelBtn}
          onclick={() => (confirmOpen = false)}>취소</button
        >
        <button type="button" class="primary-action" onclick={confirm}
          >{confirmation === 'reset' ? '초기화' : '닫기'}</button
        >
      </div>
    </div>
  {/if}
</main>

{#if !surface.compactConfirm}
  <AlertDialog.Root bind:open={confirmOpen}
    ><AlertDialog.Portal
      ><AlertDialog.Overlay class="tk-dialog-overlay" /><AlertDialog.Content class="tk-dialog"
        ><AlertDialog.Title
          >{confirmation === 'reset'
            ? '기록을 초기화할까요?'
            : '타이머를 닫을까요?'}</AlertDialog.Title
        ><AlertDialog.Description
          >{confirmation === 'reset'
            ? '경과 시간과 기록이 모두 지워져요. 소리 설정은 유지돼요.'
            : closeWarning}</AlertDialog.Description
        >
        <div class="tk-dialog-actions">
          <AlertDialog.Cancel class="secondary-action">취소</AlertDialog.Cancel><AlertDialog.Action
            class="primary-action"
            onclick={confirm}>{confirmation === 'reset' ? '초기화' : '닫기'}</AlertDialog.Action
          >
        </div></AlertDialog.Content
      ></AlertDialog.Portal
    ></AlertDialog.Root
  >
{/if}
