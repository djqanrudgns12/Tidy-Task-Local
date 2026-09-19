<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { AlertDialog } from 'bits-ui';
  import {
    Play,
    Pause,
    RotateCcw,
    Flag,
    Pin,
    Minus,
    Maximize2,
    X,
    SlidersHorizontal,
    Check,
    Plus,
  } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
  import { listen } from '@tauri-apps/api/event';
  import { native, readSettings, patchSettings } from '../../lib/toolkit/store.js';
  import { defaultPreferences, TIMER_NAMES, TIMER_KINDS } from '../../lib/toolkit/preferences.js';
  import {
    createTimer,
    sampleTimer,
    transitionTimer,
    formatTime,
    sandFraction,
  } from '../../lib/timers/engine.js';
  import { createAlarmTracker, alarmPlan } from '../../lib/timers/alarmPlan.js';
  import { createTimerAudio } from '../../lib/timers/audio.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import TimerIcon from '../toolkit/TimerIcon.svelte';
  import TimerSettingsPanel from './TimerSettingsPanel.svelte';
  import AnalogTimer from './AnalogTimer.svelte';
  import HourglassTimer from './HourglassTimer.svelte';
  import LapTimeline from './LapTimeline.svelte';
  let { kind } = $props<{ kind: string }>();
  const timerKind = untrack(() => (TIMER_KINDS.includes(kind) ? kind : 'digital'));
  const stopwatch = timerKind === 'stopwatch';
  let model = $state(createTimer(timerKind)),
    view = $state(untrack(() => sampleTimer(model, performance.now())));
  let prefs = $state<import('../../lib/toolkit/preferences.js').Preferences>(
    defaultPreferences(timerKind),
  );
  let title = $state(''),
    pinned = $state(false),
    settingsOpen = $state(!stopwatch),
    error = $state(''),
    busy = $state(false),
    loaded = $state(false),
    disposed = false;
  let confirmation = $state<'close' | 'reset' | null>(null),
    confirmOpen = $state(false),
    dialRange = $state(60),
    windowExpanded = $state(false),
    windowTransitioning = false;
  type ResizeDirection =
    | 'NorthWest'
    | 'NorthEast'
    | 'SouthWest'
    | 'SouthEast';
  type WindowBounds = {
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
  let normalWindowBounds: WindowBounds | null = null;
  const resizeCorners: { direction: ResizeDirection; className: string }[] = [
    { direction: 'NorthWest', className: 'north-west' },
    { direction: 'NorthEast', className: 'north-east' },
    { direction: 'SouthWest', className: 'south-west' },
    { direction: 'SouthEast', className: 'south-east' },
  ];
  const tracker = createAlarmTracker();
  const audio = createTimerAudio((message) => {
    if (!disposed) error = message;
  });
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });
  const name = TIMER_NAMES[timerKind];
  const phaseLabel = $derived(
    { ready: '준비', running: '진행 중', paused: '잠시 멈춤', completed: '시간 끝' }[view.phase],
  );
  const shownTime = $derived(formatTime(stopwatch ? view.elapsedMs : view.remainingMs, stopwatch));
  const configuredDuration = $derived(
    `${Math.floor(model.initialMs / 60000) ? `${Math.floor(model.initialMs / 60000)}분` : ''}${
      model.initialMs % 60000 ? ` ${Math.round((model.initialMs % 60000) / 1000)}초` : ''
    }`.trim() || '0초',
  );
  const progress = $derived(Math.max(0, Math.min(1, 1 - sandFraction(view))));
  const closeWarning = $derived(
    stopwatch && model.laps.length > 0
      ? '스톱워치 기록도 함께 사라져요.'
      : '진행 중인 타이머가 종료돼요.',
  );
  function update() {
    if (disposed) return;
    const now = performance.now();
    view = sampleTimer(model, now);
    if (model.phase === 'running' && view.phase === 'completed')
      model = transitionTimer(model, { type: 'sample' }, now);
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
      model = transitionTimer(model, { type, ms }, performance.now());
      update();
      if (type === 'record') return;
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
    schedule();
    try {
      await patchSettings(timerKind, patch);
      error = '';
    } catch {
      error = '이 창에는 적용했지만 설정을 저장하지 못했어요.';
    }
  }
  async function preview(name: string) {
    if (model.phase === 'running') {
      error = '미리 듣기는 잠시 멈춘 뒤 사용할 수 있어요.';
      return;
    }
    await audio.preview(name);
  }
  async function pin() {
    try {
      if (native) await getCurrentWindow().setAlwaysOnTop(!pinned);
      pinned = !pinned;
    } catch {
      error = '항상 위 상태를 바꾸지 못했어요.';
    }
  }
  async function readExpandedState() {
    const win = getCurrentWindow();
    const [fullscreen, maximized] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
    windowExpanded = fullscreen || maximized;
    return { win, fullscreen, maximized };
  }
  async function rememberNormalWindowBounds() {
    const win = getCurrentWindow();
    const [position, size] = await Promise.all([win.innerPosition(), win.innerSize()]);
    normalWindowBounds = {
      position: { x: position.x, y: position.y },
      size: { width: size.width, height: size.height },
    };
  }
  async function restoreNormalWindow() {
    if (!native || windowTransitioning) return false;
    const { win, fullscreen, maximized } = await readExpandedState();
    if (!fullscreen && !maximized) return false;
    windowTransitioning = true;
    try {
      if (fullscreen) await win.setFullscreen(false);
      if (maximized) await win.unmaximize();
      if (normalWindowBounds) {
        await win.setPosition(
          new PhysicalPosition(normalWindowBounds.position.x, normalWindowBounds.position.y),
        );
        await win.setSize(new PhysicalSize(normalWindowBounds.size.width, normalWindowBounds.size.height));
      }
      windowExpanded = false;
      return true;
    } finally {
      windowTransitioning = false;
    }
  }
  async function windowAction(action: string) {
    if (!native) return;
    try {
      const win = getCurrentWindow();
      if (action === 'minimize') await win.minimize();
      if (action === 'maximize') {
        const { fullscreen, maximized } = await readExpandedState();
        if (fullscreen || maximized) await restoreNormalWindow();
        else {
          await rememberNormalWindowBounds();
          await win.maximize();
          windowExpanded = true;
        }
      }
    } catch {
      error = '창 상태를 바꾸지 못했어요.';
    }
  }
  function resizeFromCorner(e: MouseEvent, direction: ResizeDirection) {
    if (!native || e.button !== 0 || windowExpanded || windowTransitioning) return;
    e.preventDefault();
    e.stopPropagation();
    void getCurrentWindow()
      .startResizeDragging(direction)
      .catch(() => (error = '창 크기 조절을 시작하지 못했어요.'));
  }
  function ask(action: 'close' | 'reset') {
    if (action === 'reset' && model.laps.length === 0) {
      void act('reset');
      return;
    }
    if (action === 'close' && model.phase !== 'running' && model.laps.length === 0) {
      audio.dispose();
      void closeWindow();
      return;
    }
    confirmation = action;
    confirmOpen = true;
  }
  async function confirm() {
    confirmOpen = false;
    if (confirmation === 'reset') await act('reset');
    else {
      audio.dispose();
      await closeWindow();
    }
  }
  async function keys(e: KeyboardEvent) {
    if (e.key === 'Escape' && !confirmOpen) {
      e.preventDefault();
      if (native) {
        try {
          if (await restoreNormalWindow()) {
            return;
          }
        } catch {
          error = '원래 창 크기로 돌아가지 못했어요.';
          return;
        }
      }
      if (settingsOpen) settingsOpen = false;
      return;
    }
    if (
      confirmOpen ||
      e.repeat ||
      e.code !== 'Space' ||
      (e.target instanceof Element &&
        e.target.closest(
          'button,input,select,textarea,[role="slider"],[role="menu"],[role="dialog"]',
        ))
    )
      return;
    e.preventDefault();
    void act(view.phase === 'running' ? 'pause' : view.phase === 'completed' ? 'restart' : 'start');
  }
  onMount(() => {
    let frame = 0;
    let interval: ReturnType<typeof setInterval>;
    const offs: (() => void)[] = [];
    const animate = () => {
      if (disposed) return;
      if (document.visibilityState === 'visible' && model.phase === 'running') update();
      frame = requestAnimationFrame(animate);
    };
    const cleanup = () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearInterval(interval);
      offs.forEach((fn) => fn());
      audio.dispose();
    };
    void (async () => {
      try {
        const settings = await readSettings();
        if (disposed) return;
        prefs = settings.preferences[timerKind];
        dialRange = prefs.dialRangeMinutes || 60;
        loaded = true;
        if (native) {
          const win = getCurrentWindow();
          const expanded = await readExpandedState();
          windowExpanded = expanded.fullscreen || expanded.maximized;
          const resized = await win.onResized(async () => {
            try {
              const state = await readExpandedState();
              windowExpanded = state.fullscreen || state.maximized;
            } catch {}
          });
          if (disposed) resized();
          else offs.push(resized);
          const close = await win.onCloseRequested((e) => {
            e.preventDefault();
            ask('close');
          });
          if (disposed) close();
          else offs.push(close);
          const quit = await listen('before-quit', () => audio.dispose());
          if (disposed) quit();
          else offs.push(quit);
        }
      } catch {
        error = '설정을 읽지 못했어요. 기본 설정으로 사용할 수 있어요.';
        loaded = true;
      }
    })();
    frame = requestAnimationFrame(animate);
    interval = setInterval(() => {
      if (document.visibilityState !== 'visible' && model.phase === 'running') update();
    }, 250);
    return cleanup;
  });
</script>

<svelte:window onkeydown={keys} />
<main
  class="timer-frame"
  class:is-complete={view.phase === 'completed'}
  class:stopwatch-frame={stopwatch}
>
  {#if native}
    {#each resizeCorners as corner}
      <button
        type="button"
        class="timer-resize-corner {corner.className}"
        class:inactive={windowExpanded}
        tabindex="-1"
        aria-hidden="true"
        onmousedown={(event) => resizeFromCorner(event, corner.direction)}
      ></button>
    {/each}
  {/if}
  <header class="timer-titlebar" use:draggable>
    <div class="timer-kind">
      <img src="/images/toolkit/toolkit-icon.png" alt="" /><span>학급 툴킷</span><span
        class="titlebar-dot">·</span
      ><span>{name}</span>
    </div>
    <div class="window-actions">
      <button class:pinned aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={pin}
        ><Pin size={16} fill={pinned ? 'currentColor' : 'none'} /></button
      ><span></span><button aria-label="최소화" onclick={() => windowAction('minimize')}
        ><Minus size={17} /></button
      ><button aria-label="최대화 또는 복원" onclick={() => windowAction('maximize')}
        ><Maximize2 size={14} /></button
      ><button class="window-close" aria-label="닫기" onclick={() => ask('close')}
        ><X size={19} /></button
      >
    </div>
  </header>
  <div class="timer-workspace">
    <div class="timer-layout" class:with-settings={settingsOpen} class:with-laps={stopwatch}>
      <section class="timer-main" aria-label={name}>
        <header class="timer-panel-heading">
          <div class="timer-title-group">
            <input
              class="timer-title-input"
              aria-label="활동 제목"
              placeholder={name}
              title={title ? '활동 이름 수정' : '활동 이름 입력'}
              bind:value={title}
              maxlength="40"
            />
            <div
              class="timer-status-summary"
              class:running={view.phase === 'running'}
              class:paused={view.phase === 'paused'}
              class:completed={view.phase === 'completed'}
              aria-label={stopwatch ? phaseLabel : `${phaseLabel}, ${configuredDuration}`}
            >
              <span class="status-state"><i></i>{phaseLabel}</span>
              {#if !stopwatch}<span class="status-divider" aria-hidden="true"></span><strong
                  >{configuredDuration}</strong
                >{/if}
            </div>
          </div>
          <button
            class="timer-settings-toggle"
            class:active={settingsOpen}
            aria-expanded={settingsOpen}
            aria-controls="timer-settings-panel"
            onclick={() => (settingsOpen = !settingsOpen)}
            ><SlidersHorizontal size={17} /><span>{settingsOpen
                ? '설정 접기'
                : '설정 보기'}</span></button
          >
        </header>
        <div
          class="timer-stage"
          class:digital={timerKind === 'digital' || stopwatch}
          class:analog={timerKind === 'analog'}
          class:hourglass={timerKind === 'hourglass'}
        >
          {#if timerKind === 'analog'}<AnalogTimer
              remaining={view.remainingMs}
              range={dialRange}
              editable={view.phase !== 'running'}
              onset={(ms) => act('set', ms)}
            />
            <div class="analog-caption">
              <span class="secondary-time">{shownTime}</span><span class="dial-range"
                >한 바퀴 {dialRange}분</span
              >
            </div>
          {:else if timerKind === 'hourglass'}<HourglassTimer
              fraction={sandFraction(view)}
              running={view.phase === 'running'}
            />{#if prefs.showRemainingTime}<span class="secondary-time">{shownTime}</span>{/if}
          {:else}<div class="digital-board" class:stopwatch-board={stopwatch}>
              <div class="board-rivets" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
              <div class="board-caption">
                <span><i></i>{stopwatch ? '경과 시간' : '남은 시간'}</span>
                <small>{stopwatch ? '시 : 분 : 초' : '분 : 초'}</small>
              </div>
              <div class="digital-time" aria-label={shownTime}>
                <span>{shownTime.split('.')[0]}</span>{#if stopwatch}<small
                    >.{shownTime.split('.')[1]}</small
                  >{/if}
              </div>
              {#if !stopwatch}<div class="digital-progress" aria-hidden="true">
                  <span style:width={`${progress * 100}%`}></span><i
                    style:left={`${progress * 100}%`}></i>
                </div>{:else}<div class="stopwatch-decoration" aria-hidden="true">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>{/if}
            </div>{/if}
          <div class="completion-message" aria-live="polite">
            {#if view.phase === 'completed'}<Check size={19} /><span>시간이 끝났어요</span>{/if}
          </div>
        </div>
        <div class="timer-control-area">
          <div class="primary-controls">
            <button
              class="secondary-action"
              aria-label={stopwatch ? '초기화' : '다시 설정'}
              onclick={() => (stopwatch ? ask('reset') : act('reset'))}
              ><RotateCcw size={17} /><span>{stopwatch ? '초기화' : '다시 설정'}</span></button
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
              >{#if view.phase === 'running'}<Pause size={20} fill="currentColor" /><span
                  >일시정지</span
                >{:else}<Play size={20} fill="currentColor" /><span
                  >{view.phase === 'completed'
                    ? '다시 시작'
                    : view.phase === 'paused'
                      ? '계속하기'
                      : '시작'}</span
                >{/if}</button
            >{#if stopwatch}<button
                class="secondary-action"
                disabled={view.phase !== 'running'}
                onclick={() => act('record')}><Flag size={18} /><span>기록</span></button
              >{/if}
          </div>
          {#if !stopwatch}<div class="time-adjustments" aria-label="시간 증감">
              {#each [1, 5, 10] as minute}<div>
                  <button
                    aria-label={`${minute}분 줄이기`}
                    disabled={view.remainingMs === 0}
                    onclick={() => act('adjust', -minute * 60000)}><Minus size={13} /></button
                  ><span>{minute}분</span><button
                    aria-label={`${minute}분 늘리기`}
                    disabled={view.remainingMs >= 3600000}
                    onclick={() => act('adjust', minute * 60000)}><Plus size={13} /></button
                  >
                </div>{/each}
            </div>{/if}
        </div>
      </section>
      {#if stopwatch}<LapTimeline laps={model.laps} />{/if}
      {#if settingsOpen && loaded}<TimerSettingsPanel
          id="timer-settings-panel"
          kind={timerKind}
          {prefs}
          phase={view.phase}
          remaining={view.remainingMs}
          {dialRange}
          onchange={changePreferences}
          onset={(ms) => act('set', ms)}
          onpreview={preview}
        />{/if}
    </div>
    {#if error}<div role="alert" class="timer-error">
        <span>{error}</span><button aria-label="알림 닫기" onclick={() => (error = '')}
          ><X size={14} /></button
        >
      </div>{/if}
  </div>
</main>
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
