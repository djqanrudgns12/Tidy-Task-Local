<script>
  import { onMount } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import {
    Archive,
    Check,
    CheckCircle2,
    ChevronRight,
    LayoutGrid,
    Link2,
    Lock,
    PanelTop,
    Power,
    Rocket,
    SlidersHorizontal,
    Trash2,
  } from 'lucide-svelte';
  import { readLaunchAtStartup, setLaunchAtStartup } from '../../lib/autostart.js';

  /**
   * @type {{
   *   settings: import('../../lib/dday/ddayModel.js').DdaySettings,
   *   widgetPrefs: import('../../lib/dday/ddayModel.js').DdayWidgetPrefs,
   *   archivedCount: number,
   *   accent?: string,
   *   dark?: boolean,
   *   compact?: boolean,
   *   veryNarrow?: boolean,
   *   wide?: boolean,
   *   onupdatesettings: (patch: Partial<import('../../lib/dday/ddayModel.js').DdaySettings>) => void,
   *   onupdatewidgetprefs: (patch: Partial<import('../../lib/dday/ddayModel.js').DdayWidgetPrefs>) => void,
   *   onopenarchive: () => void,
   * }}
   */
  let {
    settings,
    widgetPrefs,
    archivedCount,
    accent = '#d97706',
    dark = false,
    compact = false,
    veryNarrow = false,
    wide = false,
    onupdatesettings,
    onupdatewidgetprefs,
    onopenarchive,
  } = $props();

  let startupEnabled = $state(true);
  let startupBusy = $state(false);
  let startupError = $state('');

  onMount(() => {
    if (!isTauri()) {
      startupEnabled = false;
      return;
    }
    void readLaunchAtStartup()
      .then((on) => {
        startupEnabled = on;
      })
      .catch(() => {
        startupEnabled = false;
      });
  });

  async function enableStartupNow() {
    if (startupBusy) return;
    startupBusy = true;
    startupError = '';
    try {
      if (isTauri()) {
        const applied = await setLaunchAtStartup(true);
        startupEnabled = applied;
      } else {
        startupEnabled = true;
      }
    } catch {
      startupError = '시작 프로그램 등록을 바꾸지 못했어요.';
    } finally {
      startupBusy = false;
    }
  }

  /** @param {'showInTodo' | 'showInBanner' | 'showInWidget'} key */
  function toggleNewChannel(key) {
    onupdatesettings({
      defaultChannelsFromNew: {
        ...settings.defaultChannelsFromNew,
        [key]: !settings.defaultChannelsFromNew[key],
      },
    });
  }

  /** @param {'showInBanner' | 'showInWidget'} key */
  function toggleTodoChannel(key) {
    onupdatesettings({
      defaultChannelsFromTodo: {
        ...settings.defaultChannelsFromTodo,
        [key]: !settings.defaultChannelsFromTodo[key],
      },
    });
  }
</script>

<div class="st-wrap" class:wide class:very-narrow={veryNarrow} data-scheme={dark ? 'dark' : 'light'} style="--dd-accent: {accent};">
  <!-- 1. 완료 아카이브 단일 진입 -->
  <button type="button" class="st-archive-entry" onclick={onopenarchive}>
    <span class="st-bubble accent">
      <Archive size={16} strokeWidth={2.2} />
    </span>
    <span class="st-entry-copy">
      <strong>완료 아카이브</strong>
      {#if !veryNarrow}
        <small>완료된 D-Day를 복원하거나 정리합니다</small>
      {/if}
    </span>
    <span class="st-entry-pill tnum">
      <span>{archivedCount}건 열기</span>
      <ChevronRight size={13} strokeWidth={2.4} />
    </span>
  </button>

  <!-- 2. 새 항목 기본 표시 위치 -->
  <section class="st-card st-card-full" aria-labelledby="st-sec-channels">
    <header class="st-card-head">
      <SlidersHorizontal size={13} strokeWidth={2.3} />
      <h3 id="st-sec-channels">새 항목 기본 표시 위치</h3>
    </header>

    <div class="st-preset-row">
      <div class="st-preset-label">
        <strong>컨트롤 타워에서 새로 추가</strong>
        <small>추가 직후 기본으로 켤 영역</small>
      </div>
      <div class="st-cap" role="group" aria-label="새 D-Day 기본 채널">
        <button
          type="button"
          class="st-seg"
          class:on={settings.defaultChannelsFromNew.showInTodo}
          aria-pressed={settings.defaultChannelsFromNew.showInTodo}
          onclick={() => toggleNewChannel('showInTodo')}
        >
          {#if !compact}<i class="st-dot" aria-hidden="true"></i><span>할 일</span>{:else}<Check size={10} /><span>할 일</span>{/if}
        </button>
        <button
          type="button"
          class="st-seg"
          class:on={settings.defaultChannelsFromNew.showInBanner}
          aria-pressed={settings.defaultChannelsFromNew.showInBanner}
          onclick={() => toggleNewChannel('showInBanner')}
        >
          {#if !compact}<i class="st-dot" aria-hidden="true"></i><span>배너</span>{:else}<PanelTop size={10} /><span>배너</span>{/if}
        </button>
        <button
          type="button"
          class="st-seg"
          class:on={settings.defaultChannelsFromNew.showInWidget}
          aria-pressed={settings.defaultChannelsFromNew.showInWidget}
          onclick={() => toggleNewChannel('showInWidget')}
        >
          {#if !compact}<i class="st-dot" aria-hidden="true"></i><span>위젯</span>{:else}<LayoutGrid size={10} /><span>위젯</span>{/if}
        </button>
      </div>
    </div>

    <div class="st-divider"></div>

    <div class="st-preset-row">
      <div class="st-preset-label">
        <strong>할 일 우클릭으로 고정</strong>
        <small>원본 할 일은 유지하고 배너·위젯에 고정</small>
      </div>
      <div class="st-cap" role="group" aria-label="할 일 고정 기본 채널">
        <span class="st-seg locked" title="원본 할 일은 목록에 유지됩니다">
          <Lock size={9.5} strokeWidth={2.4} />
          <span>할 일</span>
        </span>
        <button
          type="button"
          class="st-seg"
          class:on={settings.defaultChannelsFromTodo.showInBanner}
          aria-pressed={settings.defaultChannelsFromTodo.showInBanner}
          onclick={() => toggleTodoChannel('showInBanner')}
        >
          <i class="st-dot" aria-hidden="true"></i>
          <span>배너</span>
        </button>
        <button
          type="button"
          class="st-seg"
          class:on={settings.defaultChannelsFromTodo.showInWidget}
          aria-pressed={settings.defaultChannelsFromTodo.showInWidget}
          onclick={() => toggleTodoChannel('showInWidget')}
        >
          <i class="st-dot" aria-hidden="true"></i>
          <span>위젯</span>
        </button>
      </div>
    </div>
  </section>

  <!-- 3. 할 일 연동 규칙 -->
  <section class="st-card" aria-labelledby="st-sec-sync">
    <header class="st-card-head">
      <Link2 size={13} strokeWidth={2.3} />
      <h3 id="st-sec-sync">할 일 연동 규칙</h3>
    </header>

    <button
      type="button"
      role="switch"
      aria-checked={settings.completeWithTodo}
      class="st-switch-row"
      onclick={() => onupdatesettings({ completeWithTodo: !settings.completeWithTodo })}
    >
      <span class="st-sw-icon"><CheckCircle2 size={14} strokeWidth={2.2} /></span>
      <span class="st-sw-copy">
        <strong>할 일을 완료하면 D-Day도 아카이브 이동</strong>
        <small>체크 시 양쪽 완료 상태를 동기화합니다</small>
      </span>
      <span class="st-knob" aria-hidden="true"><i></i></span>
    </button>

    <div class="st-divider"></div>

    <button
      type="button"
      role="switch"
      aria-checked={settings.deleteWithTodo}
      class="st-switch-row"
      onclick={() => onupdatesettings({ deleteWithTodo: !settings.deleteWithTodo })}
    >
      <span class="st-sw-icon"><Trash2 size={14} strokeWidth={2.2} /></span>
      <span class="st-sw-copy">
        <strong>할 일을 삭제할 때 D-Day도 함께 삭제</strong>
        <small>끄면 할 일만 지우고 D-Day는 컨트롤 타워에 남깁니다</small>
      </span>
      <span class="st-knob" aria-hidden="true"><i></i></span>
    </button>
  </section>

  <!-- 4. D-Day 위젯 시작 설정 -->
  <section class="st-card" aria-labelledby="st-sec-widget">
    <header class="st-card-head">
      <Rocket size={13} strokeWidth={2.3} />
      <h3 id="st-sec-widget">D-Day 위젯 시작 설정</h3>
    </header>

    <button
      type="button"
      role="switch"
      aria-checked={widgetPrefs.autoOpen}
      class="st-switch-row"
      onclick={() => onupdatewidgetprefs({ autoOpen: !widgetPrefs.autoOpen })}
    >
      <span class="st-sw-icon"><LayoutGrid size={14} strokeWidth={2.2} /></span>
      <span class="st-sw-copy">
        <strong>Tidy Task를 켤 때 위젯 자동 열기</strong>
        <small>마지막 위치와 스킨 그대로 바탕화면에 복원합니다</small>
      </span>
      <span class="st-knob" aria-hidden="true"><i></i></span>
    </button>

    <div class="st-startup-strip" class:on={startupEnabled}>
      <span class="st-startup-icon">
        <Power size={12} strokeWidth={2.3} />
      </span>
      <span class="st-startup-text">
        {startupEnabled ? 'Windows 시작 프로그램 자동 실행 켜짐' : 'Windows 시작 프로그램 등록이 꺼져 있어요'}
      </span>
      {#if !startupEnabled}
        <button
          type="button"
          class="st-startup-btn"
          disabled={startupBusy}
          onclick={enableStartupNow}
        >
          {startupBusy ? '적용 중' : '함께 켜기'}
        </button>
      {/if}
    </div>
    {#if startupError}
      <p class="st-startup-err" role="alert">{startupError}</p>
    {/if}
  </section>
</div>

<style>
  .st-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--dd-gap, 10px);
  }
  .st-wrap.wide {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: stretch;
  }
  .st-wrap.wide .st-archive-entry,
  .st-wrap.wide .st-card-full {
    grid-column: 1 / -1;
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .st-archive-entry {
    width: 100%;
    padding: 11px 12px;
    border-radius: 14px;
    border: 1.5px solid color-mix(in srgb, var(--dd-accent) 28%, rgba(15, 23, 42, 0.08));
    background: linear-gradient(155deg, color-mix(in srgb, var(--dd-accent) 9%, #ffffff), #ffffff);
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    cursor: pointer;
    transition: border-color 140ms ease, transform 120ms ease;
  }
  .st-archive-entry:hover {
    border-color: var(--dd-accent);
  }
  .st-archive-entry:active {
    transform: scale(0.99);
  }
  .st-wrap[data-scheme='dark'] .st-archive-entry {
    background: linear-gradient(155deg, color-mix(in srgb, var(--dd-accent) 16%, #242836), #212531);
    border-color: color-mix(in srgb, var(--dd-accent) 36%, rgba(255, 255, 255, 0.1));
  }

  .st-bubble {
    width: 34px;
    height: 34px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .st-bubble.accent {
    background: color-mix(in srgb, var(--dd-accent) 16%, #ffffff);
    color: var(--dd-accent);
  }
  .st-wrap[data-scheme='dark'] .st-bubble.accent {
    background: color-mix(in srgb, var(--dd-accent) 26%, #1b1e26);
    color: #ffffff;
  }

  .st-entry-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .st-entry-copy strong {
    font-size: var(--dd-fs-title, 12.5px);
    font-weight: 800;
    color: #1e2430;
  }
  .st-entry-copy small {
    font-size: var(--dd-fs-sub, 10.5px);
    color: #64748b;
    word-break: keep-all;
  }
  .st-wrap[data-scheme='dark'] .st-entry-copy strong {
    color: #f1f5f9;
  }
  .st-wrap[data-scheme='dark'] .st-entry-copy small {
    color: #94a3b8;
  }

  .st-entry-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 26px;
    padding: 0 9px;
    border-radius: 999px;
    background: var(--dd-accent);
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
  }

  .st-card {
    padding: 10px 11px;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .st-wrap[data-scheme='dark'] .st-card {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .st-card-head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--dd-accent);
  }
  .st-card-head h3 {
    margin: 0;
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 800;
    color: #334155;
  }
  .st-wrap[data-scheme='dark'] .st-card-head h3 {
    color: #e2e8f0;
  }

  .st-divider {
    height: 1px;
    background: rgba(15, 23, 42, 0.06);
  }
  .st-wrap[data-scheme='dark'] .st-divider {
    background: rgba(255, 255, 255, 0.07);
  }

  .st-preset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .st-preset-label {
    flex: 1 1 130px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .st-preset-label strong {
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 700;
    color: #1e2430;
  }
  .st-preset-label small {
    font-size: var(--dd-fs-sub, 10px);
    color: #64748b;
    word-break: keep-all;
  }
  .st-wrap[data-scheme='dark'] .st-preset-label strong {
    color: #f1f5f9;
  }
  .st-wrap[data-scheme='dark'] .st-preset-label small {
    color: #94a3b8;
  }

  .st-cap {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 2px;
    gap: 2px;
    border-radius: 999px;
    background: #f1f5f9;
    border: 1px solid rgba(15, 23, 42, 0.06);
  }
  .st-wrap[data-scheme='dark'] .st-cap {
    background: #1a1d26;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .st-seg {
    display: inline-flex;
    align-items: center;
    gap: 3.5px;
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #94a3b8;
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .st-seg.on {
    background: #ffffff;
    color: var(--dd-accent);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
  }
  .st-seg.locked {
    background: rgba(15, 23, 42, 0.05);
    color: #475569;
    cursor: default;
  }
  .st-wrap[data-scheme='dark'] .st-seg.on {
    background: #2f3545;
    color: #ffffff;
  }
  .st-wrap[data-scheme='dark'] .st-seg.locked {
    background: rgba(255, 255, 255, 0.07);
    color: #cbd5e1;
  }
  .st-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.45;
  }
  .st-seg.on .st-dot {
    background: var(--dd-accent);
    opacity: 1;
  }

  .st-switch-row {
    width: 100%;
    padding: 3px 0;
    border: 0;
    background: transparent;
    display: flex;
    align-items: center;
    gap: 9px;
    text-align: left;
    cursor: pointer;
  }
  .st-sw-icon {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.05);
    color: #64748b;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .st-switch-row[aria-checked='true'] .st-sw-icon {
    background: color-mix(in srgb, var(--dd-accent) 14%, transparent);
    color: var(--dd-accent);
  }
  .st-wrap[data-scheme='dark'] .st-sw-icon {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }
  .st-sw-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .st-sw-copy strong {
    font-size: var(--dd-fs-body, 11.5px);
    font-weight: 700;
    color: #1e2430;
    word-break: keep-all;
  }
  .st-sw-copy small {
    font-size: var(--dd-fs-sub, 10px);
    color: #64748b;
    line-height: 1.38;
    word-break: keep-all;
  }
  .st-wrap[data-scheme='dark'] .st-sw-copy strong {
    color: #f1f5f9;
  }
  .st-wrap[data-scheme='dark'] .st-sw-copy small {
    color: #94a3b8;
  }

  .st-knob {
    position: relative;
    flex-shrink: 0;
    width: 34px;
    height: 20px;
    border-radius: 99px;
    background: #cbd5e1;
    transition: background-color 160ms ease;
  }
  .st-wrap[data-scheme='dark'] .st-knob {
    background: #475569;
  }
  .st-knob i {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: transform 180ms cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .st-switch-row[aria-checked='true'] .st-knob {
    background: var(--dd-accent);
  }
  .st-switch-row[aria-checked='true'] .st-knob i {
    transform: translateX(14px);
  }

  .st-startup-strip {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 9px;
    border-radius: 10px;
    background: #fef3c7;
    color: #92400e;
    font-size: 10.5px;
    font-weight: 700;
  }
  .st-startup-strip.on {
    background: #ecfdf5;
    color: #065f46;
  }
  .st-wrap[data-scheme='dark'] .st-startup-strip {
    background: rgba(217, 119, 6, 0.16);
    color: #fcd34d;
  }
  .st-wrap[data-scheme='dark'] .st-startup-strip.on {
    background: rgba(16, 185, 129, 0.16);
    color: #6ee7b7;
  }
  .st-startup-icon {
    flex-shrink: 0;
    display: grid;
    place-items: center;
  }
  .st-startup-text {
    flex: 1;
    min-width: 0;
    word-break: keep-all;
  }
  .st-startup-btn {
    flex-shrink: 0;
    height: 23px;
    padding: 0 9px;
    border: 0;
    border-radius: 999px;
    background: #d97706;
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }
  .st-startup-btn:hover:not(:disabled) {
    filter: brightness(0.95);
  }
  .st-startup-err {
    margin: 0;
    font-size: 10.5px;
    font-weight: 700;
    color: #e11d48;
  }
</style>
