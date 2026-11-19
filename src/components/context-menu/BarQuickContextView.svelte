<script>
  import {
    CircleHelp,
    CopyPlus,
    Download,
    MousePointer2,
    Redo2,
    Settings2,
    StickyNote,
    Undo2,
    Upload,
  } from 'lucide-svelte';
  import ContextRibbonHeader from './ContextRibbonHeader.svelte';
  import ContextSegmentRow from './ContextSegmentRow.svelte';
  import ContextTileGrid from './ContextTileGrid.svelte';
  import ContextUtilityDock from './ContextUtilityDock.svelte';

  /**
   * Tidy Task 메인 빈 공간/툴바 우클릭 빠른 메뉴 (Tier M · 236px, Tidy 툴킷 제외)
   *
   * @type {{
   *   config: Record<string, any>,
   *   onaction: (action: string) => void,
   *   onliveaction: (detail: Record<string, any>) => void,
   * }}
   */
  let {
    config,
    onaction,
    onliveaction,
  } = $props();

  const ddayCount = $derived(Math.max(0, Number(config.activeDdayCount) || 0));
  const bannerDdayCount = $derived(Math.max(0, Number(config.bannerDdayCount) || 0));
  const mealOpen = $derived(Boolean(config.mealOpen));
  const remindersOn = $derived(config.showReminders !== false);
  const bannerShown = $derived(config.ddayBannerMode !== 'hidden');

  const launcherTiles = $derived([
    {
      id: 'open-dday-control',
      icon: /** @type {const} */ ('flag'),
      label: 'D-Day',
      tone: /** @type {const} */ ('accent'),
      active: ddayCount > 0,
      badge: ddayCount > 0 ? ddayCount : '',
      tip: ddayCount > 0 ? `D-Day ${ddayCount}건` : 'D-Day 컨트롤',
      title: ddayCount > 0 ? `D-Day 컨트롤 열기 (${ddayCount}건 진행 중)` : 'D-Day 컨트롤 열기',
      onclick: () => onaction('open-dday-control'),
    },
    {
      id: 'open-meal',
      icon: /** @type {const} */ ('utensils'),
      label: '급식',
      tone: /** @type {const} */ ('warn'),
      active: mealOpen,
      activeBorder: mealOpen,
      tip: mealOpen ? '급식창 닫기' : '급식창 열기',
      title: mealOpen ? '급식창 닫기' : '급식창 열기',
      onclick: () => onaction('open-meal'),
    },
    {
      id: 'open-archive',
      icon: /** @type {const} */ ('archive'),
      label: '보관함',
      tone: /** @type {const} */ ('sky'),
      tip: '보관함 열기',
      title: '보관함(아카이브) 열기',
      onclick: () => onaction('open-archive'),
    },
    {
      id: 'toggle-reminders',
      icon: remindersOn ? /** @type {const} */ ('bell') : /** @type {const} */ ('bellOff'),
      label: '알림',
      tone: remindersOn ? /** @type {const} */ ('ok') : /** @type {const} */ ('neutral'),
      active: remindersOn,
      role: /** @type {const} */ ('menuitemcheckbox'),
      checked: remindersOn,
      tip: remindersOn ? '알림 켜짐' : '알림 꺼짐',
      title: remindersOn ? '마감 알림 끄기' : '마감 알림 켜기',
      onclick: () => onliveaction({ kind: 'toggle', action: 'toggle-reminders', value: !remindersOn }),
    },
  ]);

  const viewOptions = $derived.by(() => {
    const list = [
      {
        id: 'archived',
        label: '마감됨',
        active: Boolean(config.showArchived),
        title: config.showArchived ? '마감된 일 영역 숨기기' : '마감된 일 영역 표시',
        onclick: () => onliveaction({ kind: 'toggle', action: 'toggle-archived' }),
      },
      {
        id: 'notes',
        label: '메모',
        active: Boolean(config.showNotes),
        title: config.showNotes ? '중요한 일 메모 숨기기' : '중요한 일 메모 표시',
        onclick: () => onliveaction({ kind: 'toggle', action: 'toggle-notes' }),
      },
    ];
    if (bannerDdayCount > 0) {
      list.push({
        id: 'banner',
        label: '배너',
        active: bannerShown,
        title: bannerShown ? 'D-Day 상단 배너 숨기기' : 'D-Day 상단 배너 표시',
        onclick: () => onliveaction({ kind: 'toggle', action: 'toggle-banner' }),
      });
    }
    return list;
  });
</script>

<!-- ① 파스텔 미니 리본 헤더 + 우측 실행취소/다시실행 아이콘 통합 -->
<ContextRibbonHeader leftDot={true} title="Tidy Task">
  {#snippet right()}
    <button
      type="button"
      role="menuitem"
      class="hdr-icon-btn ctx-tip tip-bottom"
      disabled={config.canUndo === false}
      data-tip="실행 취소"
      title="실행 취소 (Ctrl+Z)"
      aria-label="실행 취소"
      onclick={() => onliveaction({ kind: 'history', action: 'undo' })}
    ><Undo2 size={11.5} strokeWidth={2} /></button>

    <button
      type="button"
      role="menuitem"
      class="hdr-icon-btn ctx-tip tip-bottom tip-right"
      disabled={config.canRedo === false}
      data-tip="다시 실행"
      title="다시 실행 (Ctrl+Y)"
      aria-label="다시 실행"
      onclick={() => onliveaction({ kind: 'history', action: 'redo' })}
    ><Redo2 size={11.5} strokeWidth={2} /></button>
  {/snippet}
</ContextRibbonHeader>

<!-- ②-a 4칸 Soft-Duotone 퀵 런처 (Tidy 툴킷 제외) -->
<ContextTileGrid tiles={launcherTiles} ariaLabel="빠른 실행" />

<!-- ②-b 새 노트 2칸 미니 필 -->
<div class="bar-spawn-row" role="group" aria-label="새 노트 만들기">
  <button
    type="button"
    role="menuitem"
    class="bar-spawn-btn"
    title="새 Tidy Task 노트 창 열기"
    onclick={() => onaction('spawn-window')}
  >
    <span class="spawn-ic accent" aria-hidden="true"><CopyPlus size={12} strokeWidth={2} /></span>
    <span>새 Task</span>
  </button>

  <button
    type="button"
    role="menuitem"
    class="bar-spawn-btn"
    title="새 Tiny Note 스티커 열기"
    onclick={() => onaction('spawn-tiny')}
  >
    <span class="spawn-ic warn" aria-hidden="true"><StickyNote size={12} strokeWidth={2} /></span>
    <span>새 Tiny</span>
  </button>
</div>

<!-- ③ 화면 표시 & 편집 모드 카드 (메뉴 유지 연속 토글) -->
<div class="bar-ctrl-card" role="group" aria-label="화면 표시 및 편집 모드">
  <ContextSegmentRow
    label="표시"
    mode="multi"
    options={viewOptions}
    ariaLabel="화면 영역 표시"
  />

  <button
    type="button"
    role="menuitemcheckbox"
    aria-checked={Boolean(config.isEditMode)}
    class="bar-switch-row"
    onclick={() => onliveaction({ kind: 'toggle', action: 'toggle-edit' })}
  >
    <span class="sw-ic" class:on={config.isEditMode} aria-hidden="true">
      <MousePointer2 size={11.5} strokeWidth={2} />
    </span>
    <span class="sw-label">여러 항목 선택 (편집 모드)</span>
    <span class="sw-knob" class:on={config.isEditMode} aria-hidden="true"><i></i></span>
  </button>
</div>

<!-- ④ 하단 유틸 독 (좌: TXT 가져오기·내보내기 / 우: 기능 설명·설정) -->
<ContextUtilityDock ariaLabel="파일 및 설정">
  {#snippet left()}
    <button
      type="button"
      role="menuitem"
      class="dock-pill"
      title="메모장(.txt) 가져오기"
      onclick={() => onaction('import')}
    ><Download size={11} strokeWidth={2} /><span>가져오기</span></button>

    <button
      type="button"
      role="menuitem"
      class="dock-pill"
      title="메모장(.txt)으로 내보내기"
      onclick={() => onaction('export')}
    ><Upload size={11} strokeWidth={2} /><span>내보내기</span></button>
  {/snippet}

  {#snippet right()}
    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip"
      data-tip="기능 설명"
      title="기능 설명"
      aria-label="기능 설명"
      onclick={() => onaction('open-help')}
    ><CircleHelp size={12.5} strokeWidth={1.9} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip tip-right"
      data-tip="설정"
      title="설정"
      aria-label="설정"
      onclick={() => onaction('open-settings')}
    ><Settings2 size={12.5} strokeWidth={1.9} /></button>
  {/snippet}
</ContextUtilityDock>

<style>
  .hdr-icon-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: var(--ctx-radius-ctrl, 6px);
    background: transparent;
    color: var(--ctx-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, transform 90ms ease;
  }
  .hdr-icon-btn:hover:not(:disabled) {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
  }
  .hdr-icon-btn:active:not(:disabled) {
    transform: scale(0.92);
  }
  .hdr-icon-btn:disabled {
    opacity: 0.32;
    cursor: default;
  }
  .hdr-icon-btn:focus { outline: none; }
  .hdr-icon-btn:focus-visible {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .bar-spawn-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    margin-top: 4px;
  }

  .bar-spawn-btn {
    height: 26px;
    padding: 0 6px;
    border-radius: var(--ctx-radius-card, 8px);
    border: 1px solid var(--ctx-line);
    background: var(--ctx-field);
    color: var(--ctx-ink);
    font-family: inherit;
    font-size: clamp(9.5px, 0.8em, 10.5px);
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    transition: background-color 110ms ease, border-color 110ms ease, transform 95ms ease;
  }
  .bar-spawn-btn:hover {
    background: var(--ctx-hover);
    border-color: var(--ctx-line-outer);
  }
  .bar-spawn-btn:active {
    transform: scale(0.97);
  }
  .bar-spawn-btn:focus { outline: none; }
  .bar-spawn-btn:focus-visible {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .spawn-ic {
    display: flex;
    align-items: center;
  }
  .spawn-ic.accent { color: var(--ctx-accent); }
  .spawn-ic.warn { color: var(--ctx-warn); }

  .bar-ctrl-card {
    margin-top: 5px;
    padding: 5px;
    border-radius: var(--ctx-radius-card, 8px);
    background: var(--ctx-field);
    border: 1px solid var(--ctx-line);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bar-switch-row {
    width: 100%;
    height: 24px;
    padding: 0 5px;
    border: 0;
    border-radius: var(--ctx-radius-ctrl, 6px);
    background: transparent;
    color: var(--ctx-ink);
    font-family: inherit;
    font-size: clamp(9.5px, 0.8em, 10.5px);
    font-weight: 700;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: left;
    cursor: pointer;
    transition: background-color 110ms ease;
  }
  .bar-switch-row:hover {
    background: var(--ctx-hover);
  }
  .bar-switch-row:focus { outline: none; }
  .bar-switch-row:focus-visible {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .sw-ic {
    display: flex;
    color: var(--ctx-muted);
    transition: color 120ms ease;
  }
  .sw-ic.on {
    color: var(--ctx-accent);
  }

  .sw-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sw-knob {
    position: relative;
    flex-shrink: 0;
    width: 24px;
    height: 14px;
    border-radius: 999px;
    background: var(--ctx-line-outer);
    transition: background-color 140ms ease;
  }
  .sw-knob i {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform 140ms cubic-bezier(0.3, 1.3, 0.5, 1);
  }
  .sw-knob.on {
    background: var(--ctx-accent);
  }
  .sw-knob.on i {
    transform: translateX(10px);
  }
</style>
