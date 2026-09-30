<script lang="ts">
  import { onMount, untrack } from 'svelte';
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
    Minus,
    Maximize2,
    X,
    SlidersHorizontal,
    Check,
    Plus,
    NotebookPen,
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
  import { SOUND_KEYS, type SoundRole } from '../../lib/timers/soundLibrary.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import TimerIcon from '../toolkit/TimerIcon.svelte';
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
  // 설명은 제목처럼 이 창에서만 쓰는 활동 내용입니다. 타이머 세션은 저장소에 넣지 않는다는
  // 툴킷 원칙(toolkit.rs 머리말)을 따라 창을 닫으면 함께 사라집니다.
  let title = $state(''),
    note = $state(''),
    noteFocused = $state(false),
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
  const analyticsWindowId = newId();
  function reportTransition(before: typeof model) {
    for (const event of timerAnalyticsEvents(before, model)) {
      const operation = event === 'timer_completed' || event === 'timer_started'
        ? `${analyticsWindowId}-${model.runId}` : newId();
      track(event, { operation });
    }
  }
  const audio = createTimerAudio((message) => {
    if (!disposed) error = message;
  }, timerKind);
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });
  const name = TIMER_NAMES[timerKind];
  const shownTime = $derived(formatTime(stopwatch ? view.elapsedMs : view.remainingMs, stopwatch));
  const hasNote = $derived(note.trim().length > 0);
  // 비어 있고 쓰는 중도 아니면 설명 칸을 "설명 추가" 한 줄로 납작하게 접어 시계에 자리를 내줍니다.
  // 크기는 누를 때(포커스)만 바뀌고 글을 치는 동안에는 바뀌지 않아, 첫 글자에서 칸이 튀지 않습니다.
  const noteCompact = $derived(!hasNote && !noteFocused);
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
    // 진행 중에 소리를 바꾸면 새 파일을 먼저 받아 둔 뒤 다시 예약합니다.
    // 받기 전에 예약하면 그 소리 자리가 비어 시계음이 잠깐 끊깁니다(받는 동안은 이전 소리가 계속 울림).
    if (audio.select(prefs) && model.phase === 'running') await audio.ready();
    if (disposed) return;
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
  // 선택 상자에서 소리를 고르면 바로 적용하고, 멈춰 있을 때는 그 소리를 곧장 들려줍니다.
  // 진행 중에는 예약된 소리를 끊지 않도록 미리 듣기를 하지 않습니다(새 소리는 다음 박부터 울림).
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
  function leaveNote() {
    noteFocused = false;
    // 빈 줄·공백만 남았으면 비웁니다. 그대로 두면 보이지 않는 줄이 칸 높이만 차지합니다.
    if (!hasNote) note = '';
  }
  function noteKeys(e: KeyboardEvent) {
    // 창 전체의 Esc는 "최대화 풀기"입니다. 설명을 쓰다 누른 Esc는 쓰기를 마친다는 뜻이므로
    // 여기서 멈춥니다. 그러지 않으면 전자칠판에 크게 띄운 창이 갑자기 작아집니다.
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    (e.currentTarget as HTMLTextAreaElement).blur();
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
    // 선택 상자 목록처럼 먼저 Esc를 받아 닫힌 팝업이 있으면(bits-ui가 preventDefault로 표시) 여기서는 아무것도 하지 않습니다.
    // 그러지 않으면 소리 목록을 닫으려고 누른 Esc에 설정 패널까지 접히거나 최대화가 풀립니다.
    if (e.key === 'Escape' && e.defaultPrevented) return;
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
  // 왜 진행 중일 때만 도는가: 준비·일시정지·종료 화면은 멈춰 있으므로,
  // 창을 여러 개 띄워 두어도 쉬는 타이머가 매 프레임 CPU를 쓰지 않게 합니다.
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
        audio.select(prefs);
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
      <img src="/images/toolkit/toolkit-icon.png" alt="" /><span>Tidy 툴킷</span><span
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
          <input
            class="timer-title-input"
            aria-label="활동 제목"
            placeholder={name}
            title={title ? '활동 이름 수정' : '활동 이름 입력'}
            bind:value={title}
            maxlength="40"
          />
          <!-- 설명은 제목 바로 아래에 부제처럼 늘 있습니다(접기 버튼 없음). 비어 있을 때는
               "설명 추가" 한 줄로 작게 붙어 있다가, 누르면 쓰기 좋은 크기로 펼쳐집니다.
               문서 순서를 제목 다음에 두어 Tab 이동도 제목 → 설명 → 설정 순서가 됩니다.
               label로 감싸 아이콘을 눌러도 바로 쓸 수 있습니다. -->
          <label class="timer-note" class:compact={noteCompact}>
            <NotebookPen class="note-mark" aria-hidden="true" />
            <textarea
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
          <!-- 설정 버튼은 제목 줄 오른쪽 끝에 둡니다. -->
          <div class="timer-heading-tools">
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
          </div>
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
          {:else if stopwatch}<StopwatchFace time={shownTime} />
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
          {#if !stopwatch}<section class="time-adjustment-panel" aria-labelledby="time-adjustment-heading">
              <header class="time-adjustment-heading">
                <h2 id="time-adjustment-heading">시간 조절</h2>
                <div class="time-adjustment-legend" aria-hidden="true">
                  <span class="decrease"><Minus size={12} />줄이기</span>
                  <span class="increase"><Plus size={12} />늘리기</span>
                </div>
              </header>
              <div class="time-adjustments">
                {#each timeAdjustments as adjustment}<div class="time-adjustment-step">
                    <span class="time-adjustment-label">{adjustment.label}</span>
                    <div class="time-adjustment-buttons">
                      <button
                        class="decrease"
                        aria-label={`${adjustment.label} 줄이기`}
                        disabled={!loaded || busy || view.remainingMs === 0}
                        onclick={() => act('adjust', -adjustment.ms)}><Minus size={16} strokeWidth={2.5} /></button
                      ><button
                        class="increase"
                        aria-label={`${adjustment.label} 늘리기`}
                        disabled={!loaded || busy || view.remainingMs >= 3600000}
                        onclick={() => act('adjust', adjustment.ms)}><Plus size={16} strokeWidth={2.5} /></button
                      >
                    </div>
                  </div>{/each}
              </div>
            </section>{/if}
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
          onsound={chooseSound}
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
