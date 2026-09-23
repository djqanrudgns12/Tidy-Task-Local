<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    Pin,
    Minus,
    Maximize,
    Minimize,
    X,
    SlidersHorizontal,
    Tag,
    ChevronUp,
    RefreshCw,
    Clock3,
    Hash,
  } from 'lucide-svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { native, readSettings, patchSettings } from '../../lib/toolkit/store.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { clockParts, displayTime, displayDate, handAngles } from '../../lib/clock/clockTime.js';
  import { createTicker } from '../../lib/clock/ticker.js';
  import { createTimeSync, describeSync, type SyncState } from '../../lib/clock/timeSync.js';
  import {
    normalizeClockPreferences,
    sanitizeTitle,
    CLOCK_TITLE_MAX,
    type ClockPreferences,
  } from '../../lib/clock/clockPreferences.js';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import DigitalFace from './DigitalFace.svelte';
  import AnalogFace from './AnalogFace.svelte';
  import './clock.css';

  // ── 설정 ──
  let prefs = $state<ClockPreferences>(normalizeClockPreferences());
  let loaded = $state(false);
  let titleDraft = $state('');
  let titleFocused = $state(false);
  let message = $state('');
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  let titleTimer: ReturnType<typeof setTimeout> | undefined;
  let savedTitle = '';

  // ── 창 ──
  let pinned = $state(false);
  let fullscreen = $state(false);
  let settingsOpen = $state(false);
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  // 다크 모드 여부. 툴킷은 테마를 문서 뿌리의 인라인 스타일(color-scheme)로 바꾸므로 그 값을 읽어 둡니다.
  let scheme = $state<'light' | 'dark'>('light');
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });

  // 개발 미리보기 전용: ?toolkit-preview=clock&clock-at=2026-09-23T23:59:55%2B09:00 으로 원하는 시각에서 출발합니다.
  // 자정·정오 경계를 눈으로 확인하려는 것이며, 앱(네이티브)에서는 쓰지 않습니다.
  const previewShift = (() => {
    if (native || !import.meta.env.DEV) return 0;
    const at = Date.parse(new URLSearchParams(location.search).get('clock-at') || '');
    return Number.isFinite(at) ? at - Date.now() : 0;
  })();

  // ── 시각 ──
  let syncState = $state<SyncState>({
    enabled: true, checking: false, offsetMs: 0, measurement: null, checkedAt: null, error: null,
  });
  const timeSync = createTimeSync({
    measure: () =>
      native
        ? invoke('clock_time_offset')
        : Promise.reject(new Error('브라우저 미리보기에서는 PC 시각을 그대로 보여 줘요.')),
    readSkew: native ? () => invoke<number | null>('clock_wall_skew') : null,
    enabled: false, // 설정을 읽은 뒤 켭니다(끈 사용자에게 한 번이라도 묻지 않도록).
    onChange: (state) => {
      const moved = state.offsetMs !== syncState.offsetMs;
      syncState = state;
      // 보정값이 바뀌면 곧바로 다시 그리고 새 초 경계에 맞춥니다.
      if (moved) ticker.refresh();
    },
  });
  let now = $state(timeSync.now() + previewShift);
  const ticker = createTicker({
    now: () => timeSync.now() + previewShift,
    onTick: (value) => {
      now = value;
    },
    onDisturbance: (reason) => {
      // 숨은 창은 타이머가 원래 늦게 깨므로 "늦은 틱"을 무시합니다. PC 시각 변경은 늘 확인합니다.
      if (reason === 'late' && document.visibilityState === 'hidden') return;
      void timeSync.disturbance(reason);
    },
  });

  const parts = $derived(clockParts(now));
  const view = $derived(displayTime(parts, { hour12: prefs.hour12, showSeconds: prefs.showSeconds }));
  const date = $derived(displayDate(parts));
  const angles = $derived(handAngles(parts));
  // 설정을 읽기 전에는 맞춤이 꺼진 것처럼 보이지 않게 "확인 중"으로 둡니다.
  const source = $derived(
    loaded
      ? describeSync(syncState, now)
      : { tone: 'busy', label: '표준시 확인 중', detail: '설정을 읽고 있어요.' },
  );
  const titleShown = $derived(!prefs.titleHidden);
  // 제목 글자 수에 맞춰 글자 크기를 줄입니다(자르지 않음). 한글 한 글자 ≈ 1em.
  const titleChars = $derived(Math.max(8, [...(titleDraft || '제목을 입력해 보세요')].length));

  function say(text: string) {
    message = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (message = ''), 4000);
  }

  async function change(patch: Partial<ClockPreferences>) {
    prefs = { ...prefs, ...patch };
    if ('standardTimeSync' in patch) timeSync.setEnabled(prefs.standardTimeSync);
    try {
      await patchSettings('clock', patch);
    } catch {
      say('이 창에는 적용했지만 설정을 저장하지 못했어요.');
    }
  }

  // 제목은 치는 동안 매 글자 저장하지 않고, 멈추고 0.4초 뒤·칸을 떠날 때·창을 닫을 때 저장합니다.
  function saveTitleNow() {
    clearTimeout(titleTimer);
    titleTimer = undefined;
    const title = sanitizeTitle(titleDraft);
    if (title === savedTitle) return Promise.resolve();
    savedTitle = title;
    return change({ title });
  }
  function onTitleInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    // 한글 조합 중에 자르면 글자가 깨지므로, 조합이 끝난 뒤에만 30자로 다듬습니다.
    if (!(event as InputEvent).isComposing) {
      const clean = sanitizeTitle(input.value);
      if (clean !== input.value) input.value = clean;
      titleDraft = clean;
    } else titleDraft = input.value;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => void saveTitleNow(), 400);
  }
  function titleKeys(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === 'Escape') {
      // Esc가 창 전체의 "전체 화면 끝내기"로 이어지지 않게 여기서 멈춥니다.
      event.stopPropagation();
      (event.currentTarget as HTMLInputElement).blur();
    }
  }

  async function windowAction(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
    } catch {
      say(failure);
    }
  }
  async function togglePin() {
    if (!native) return;
    await getCurrentWindow().setAlwaysOnTop(!pinned);
    pinned = !pinned;
  }
  async function toggleFullscreen() {
    if (native) {
      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      fullscreen = next;
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    wake();
  }
  async function close() {
    await saveTitleNow().catch(() => {});
    await closeWindow();
  }
  function resizeFromCorner(event: MouseEvent, direction: 'NorthWest' | 'NorthEast' | 'SouthWest' | 'SouthEast') {
    if (!native || event.button !== 0 || fullscreen) return;
    event.preventDefault();
    void getCurrentWindow()
      .startResizeDragging(direction)
      .catch(() => say('창 크기 조절을 시작하지 못했어요.'));
  }

  // 전체 화면에서는 마우스가 3초 멈추면 조작 도구를 흐리게 해 시계만 남깁니다.
  function wake() {
    idle = false;
    clearTimeout(idleTimer);
    if (fullscreen && !settingsOpen) idleTimer = setTimeout(() => (idle = true), 3000);
  }

  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (settingsOpen) settingsOpen = false;
      else if (fullscreen) void windowAction(toggleFullscreen, '전체 화면을 끝내지 못했어요.');
      return;
    }
    if (event.key === 'F11') {
      event.preventDefault();
      void windowAction(toggleFullscreen, '전체 화면으로 바꾸지 못했어요.');
    }
  }

  function syncNow() {
    if (!prefs.standardTimeSync) {
      settingsOpen = true;
      return;
    }
    void timeSync.syncNow();
  }

  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = performance.now();
        return;
      }
      ticker.refresh();
      // 오래 숨어 있었다면(절전·화면 잠금 포함) 표준시도 다시 확인합니다.
      if (hiddenAt && performance.now() - hiddenAt > 10 * 60_000) void timeSync.disturbance('visible');
    };
    const onFocus = () => ticker.refresh();
    const onOnline = () => {
      if (!untrack(() => syncState.measurement)) void timeSync.disturbance('online');
    };
    const onFullscreenChange = () => {
      if (!native) fullscreen = Boolean(document.fullscreenElement);
      wake();
    };
    const readScheme = () => {
      scheme = getComputedStyle(document.documentElement).colorScheme.includes('dark') ? 'dark' : 'light';
    };
    readScheme();
    const schemeObserver = new MutationObserver(readScheme);
    schemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    offs.push(() => schemeObserver.disconnect());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    ticker.start();
    timeSync.start();

    void (async () => {
      try {
        const settings = await readSettings();
        if (disposed) return;
        prefs = normalizeClockPreferences((settings.preferences as Record<string, unknown>)?.clock);
      } catch {
        say('설정을 읽지 못해 기본 설정으로 보여 줘요.');
      }
      titleDraft = savedTitle = prefs.title;
      loaded = true;
      timeSync.setEnabled(prefs.standardTimeSync);
      if (!native) return;
      try {
        const win = getCurrentWindow();
        fullscreen = await win.isFullscreen();
        const closeOff = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          await close();
        });
        if (disposed) closeOff();
        else offs.push(closeOff);
        const resizeOff = await win.onResized(async () => {
          try {
            fullscreen = await win.isFullscreen();
          } catch {}
        });
        if (disposed) resizeOff();
        else offs.push(resizeOff);
        // 앱을 끌 때 쓰던 제목을 잃지 않게 바로 저장합니다.
        const quitOff = await listen('before-quit', () => void saveTitleNow().catch(() => {}));
        if (disposed) quitOff();
        else offs.push(quitOff);
      } catch {
        say('창 상태를 읽지 못했어요.');
      }
    })();

    return () => {
      disposed = true;
      ticker.stop();
      timeSync.stop();
      clearTimeout(idleTimer);
      clearTimeout(messageTimer);
      if (titleTimer) void saveTitleNow().catch(() => {});
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      offs.forEach((off) => off());
    };
  });
</script>

<svelte:window onkeydown={keys} onpointermove={wake} onpointerdown={wake} />

<main
  class="timer-frame clk-frame"
  class:fullscreen
  class:idle={idle && fullscreen}
  data-face={prefs.face}
  data-scheme={scheme}
  aria-busy={!loaded}
>
  {#if native && !fullscreen}
    {#each [['NorthWest', 'north-west'], ['NorthEast', 'north-east'], ['SouthWest', 'south-west'], ['SouthEast', 'south-east']] as [direction, className]}
      <button
        type="button"
        class="timer-resize-corner {className}"
        tabindex="-1"
        aria-hidden="true"
        onmousedown={(event) => resizeFromCorner(event, direction as 'NorthWest')}
      ></button>
    {/each}
  {/if}

  <header class="timer-titlebar clk-chrome" use:draggable>
    <div class="timer-kind">
      <img src="/images/toolkit/toolkit-icon.png" alt="" /><span>Tidy 툴킷</span><span class="titlebar-dot">·</span><span>시계</span>
    </div>
    <div class="window-actions">
      <button
        class:pinned={titleShown}
        aria-label={titleShown ? '제목 숨기기' : '제목 보이기'}
        aria-pressed={titleShown}
        title={titleShown ? '제목 숨기기' : '제목 보이기'}
        onclick={() => void change({ titleHidden: titleShown })}><Tag size={15} /></button
      ><button
        class:pinned={settingsOpen}
        aria-label="시계 설정"
        aria-expanded={settingsOpen}
        aria-controls="clk-settings"
        title="시계 설정"
        onclick={() => (settingsOpen = !settingsOpen)}><SlidersHorizontal size={15} /></button
      ><span></span>{#if native}<button
          class:pinned
          aria-label="항상 위"
          aria-pressed={pinned}
          title="항상 위"
          onclick={() => windowAction(togglePin, '항상 위 상태를 바꾸지 못했어요.')}
          ><Pin size={16} fill={pinned ? 'currentColor' : 'none'} /></button
        ><button aria-label="최소화" title="최소화" onclick={() => windowAction(() => getCurrentWindow().minimize(), '창을 최소화하지 못했어요.')}
          ><Minus size={17} /></button
        >{/if}<button
        aria-label={fullscreen ? '전체 화면 끝내기' : '전체 화면'}
        title={fullscreen ? '전체 화면 끝내기 (Esc)' : '전체 화면 (F11)'}
        onclick={() => windowAction(toggleFullscreen, '전체 화면으로 바꾸지 못했어요.')}
        >{#if fullscreen}<Minimize size={15} />{:else}<Maximize size={15} />{/if}</button
      ><button class="window-close" aria-label="닫기" title="닫기" onclick={() => void close()}><X size={19} /></button>
    </div>
  </header>

  <div class="clk-stage">
    {#if titleShown}
      <div class="clk-title" class:empty={!titleDraft} style="--clk-title-chars:{titleChars}">
        <input
          aria-label="시계 제목"
          placeholder="제목을 입력해 보세요"
          spellcheck="false"
          value={titleDraft}
          oninput={onTitleInput}
          oncompositionend={onTitleInput}
          onfocus={() => (titleFocused = true)}
          onblur={() => {
            titleFocused = false;
            void saveTitleNow();
          }}
          onkeydown={titleKeys}
        />
        {#if titleFocused}<span class="clk-title-count" aria-hidden="true">{[...titleDraft].length}/{CLOCK_TITLE_MAX}</span>{/if}
        <button class="clk-title-hide clk-chrome-soft" aria-label="제목 숨기기" title="제목 숨기기" onclick={() => void change({ titleHidden: true })}
          ><ChevronUp size={18} /></button
        >
      </div>
    {/if}

    <section
      class="clk-display"
      role="timer"
      aria-label={`${view.text}, ${date.text}`}
    >
      {#if prefs.face === 'analog'}
        <div class="clk-analog-wrap">
          <AnalogFace
            hour={angles.hour}
            minute={angles.minute}
            second={angles.second}
            showSeconds={prefs.showSeconds}
            minuteNumbers={prefs.analogMinuteNumbers}
          />
          {#if prefs.analogCaption}<p class="clk-caption">{view.text}</p>{/if}
        </div>
      {:else}
        <DigitalFace
          hourDigits={view.hourDigits}
          minuteDigits={view.minuteDigits}
          secondDigits={view.secondDigits}
          meridiem={view.meridiem}
          second={parts.seconds}
        />
      {/if}
      <button
        class="clk-source clk-chrome-soft"
        data-tone={source.tone}
        title={source.detail}
        aria-label={`${source.label}. ${source.detail}`}
        onclick={syncNow}
        ><span class="clk-source-dot" aria-hidden="true"></span>{source.label}</button
      >
    </section>

    <p class="clk-date" aria-hidden="true">
      <span>{date.monthDay}</span>
      <span class="clk-weekday" data-weekend={date.weekend}>{date.weekday}</span>
    </p>
  </div>

  <footer class="clk-controls clk-chrome">
    <div class="clk-segmented" role="radiogroup" aria-label="시계 모양">
      <button role="radio" aria-checked={prefs.face === 'digital'} onclick={() => void change({ face: 'digital' })}
        ><Hash size={16} />디지털</button
      ><button role="radio" aria-checked={prefs.face === 'analog'} onclick={() => void change({ face: 'analog' })}
        ><Clock3 size={16} />아날로그</button
      >
    </div>
    {#if message}<p class="clk-message" role="status">{message}</p>{/if}
    <div class="clk-segmented" role="radiogroup" aria-label="초 표시">
      <button role="radio" aria-checked={prefs.showSeconds} onclick={() => void change({ showSeconds: true })}>시:분:초</button
      ><button role="radio" aria-checked={!prefs.showSeconds} onclick={() => void change({ showSeconds: false })}>시:분</button>
    </div>
  </footer>

  {#if settingsOpen}
    <button class="clk-settings-scrim" aria-label="설정 닫기" tabindex="-1" onclick={() => (settingsOpen = false)}></button>
    <section id="clk-settings" class="clk-settings" aria-label="시계 설정">
      <h2>시계 설정</h2>
      <div class="clk-setting-row">
        <div><strong>시간 표기</strong><small>오전·오후를 붙이거나 0~23시로 보여 줘요.</small></div>
        <div class="clk-segmented small" role="radiogroup" aria-label="시간 표기">
          <button role="radio" aria-checked={prefs.hour12} onclick={() => void change({ hour12: true })}>12시간</button
          ><button role="radio" aria-checked={!prefs.hour12} onclick={() => void change({ hour12: false })}>24시간</button>
        </div>
      </div>
      <div class="clk-setting-row">
        <div>
          <strong>표준시 맞춤</strong>
          <small>한국표준과학연구원 시간 서버로 PC 시각의 오차를 바로잡아요. PC 설정은 바꾸지 않아요.</small>
        </div>
        <ToolkitSwitch checked={prefs.standardTimeSync} label="표준시 맞춤" onchange={(value: boolean) => void change({ standardTimeSync: value })} />
      </div>
      {#if prefs.standardTimeSync}
        <div class="clk-sync-status" data-tone={source.tone}>
          <span class="clk-source-dot" aria-hidden="true"></span>
          <p><strong>{source.label}</strong><small>{source.detail}</small></p>
          <button onclick={() => void timeSync.syncNow()} disabled={syncState.checking}
            ><RefreshCw size={14} class={syncState.checking ? 'clk-spin' : ''} />다시 맞추기</button
          >
        </div>
      {/if}
      <div class="clk-setting-row">
        <div><strong>디지털 시각 함께 보기</strong><small>아날로그 시계 아래에 "오전 11:30"처럼 적어 줘요.</small></div>
        <ToolkitSwitch checked={prefs.analogCaption} label="디지털 시각 함께 보기" onchange={(value: boolean) => void change({ analogCaption: value })} />
      </div>
      <div class="clk-setting-row">
        <div><strong>분 숫자 보기</strong><small>아날로그 시계 바깥에 5, 10, 15…를 적어 시계 읽기를 도와요.</small></div>
        <ToolkitSwitch checked={prefs.analogMinuteNumbers} label="분 숫자 보기" onchange={(value: boolean) => void change({ analogMinuteNumbers: value })} />
      </div>
    </section>
  {/if}
</main>
