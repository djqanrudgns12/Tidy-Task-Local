<script>
  // 다중 선택 인셋 말랑 도크 (docs/PRD-bulk-select-dock.md · 시안 3)
  //
  // 2축 정밀 정렬 구조:
  //   1. 축 1 (전체 선택 체크 토글): 좌측 x=15px(중심 23px) — TodoList 행 체크박스와 모든 창 폭·글자 크기에서 0px 일치
  //   2. 축 2 (날짜 인덱스 슬라이딩 정렬 캡슐): 실제 렌더된 [data-todo-deadline-btn] 중앙을 실측해 자동 추종
  //      (극초협폭·대형 글꼴에서는 안전 클램프로 우측 4버튼과 겹침을 차단하고, 8px 초과 이탈 시 꼬리점을 자동 숨김)
  //
  // 왜 light-dark()를 쓰지 않는가: 배포 빌드의 lightningcss 변환 문제를 피하기 위해
  //   bulkDockLayout.js::resolveBulkDockPalette가 명시적 색 토큰을 계산해 주입합니다.
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Archive, Flag } from 'lucide-svelte';
  import {
    bulkDockPaletteToStyle,
    computeSortCapsulePosition,
    resolveBulkDockPalette,
    resolveSelectAllState,
  } from '../../lib/todos/bulkDockLayout.js';

  /**
   * @type {{
   *   sortOrder: 'asc' | 'desc',
   *   totalCount: number,
   *   visibleSelectedCount: number,
   *   selectedCount: number,
   *   themeColor: string,
   *   dark: boolean,
   *   globalFontSizePt: number,
   *   uiFontSizePt: number,
   *   fontFamily?: string,
   *   uiFontFamily?: string,
   *   headerDesign?: string,
   *   layoutSignature?: string,
   *   dateSlotPx?: number,
   *   busy?: boolean,
   *   frozen?: boolean,
   *   ddayPickerOpen?: boolean,
   *   archiveMenuOpen?: boolean,
   *   onToggleAll: () => void,
   *   onToggleSort: () => void,
   *   onArchivePointerDown?: (event: PointerEvent) => void,
   *   onArchive: (event: MouseEvent & { currentTarget: HTMLElement }) => void,
   *   onDdayPointerDown: (event: PointerEvent) => void,
   *   onDdayClick: (event: MouseEvent & { currentTarget: HTMLElement }) => void,
   *   onComplete: () => void,
   *   onDelete: () => void,
   * }}
   */
  let {
    sortOrder = 'asc',
    totalCount = 0,
    visibleSelectedCount = 0,
    selectedCount = 0,
    themeColor = 'amber',
    dark = false,
    globalFontSizePt = 10,
    uiFontSizePt = 10,
    fontFamily = '',
    uiFontFamily = '',
    headerDesign = 'modern',
    layoutSignature = '',
    dateSlotPx = undefined,
    busy = false,
    frozen = false,
    ddayPickerOpen = false,
    archiveMenuOpen = false,
    onToggleAll,
    onToggleSort,
    onArchivePointerDown = undefined,
    onArchive,
    onDdayPointerDown,
    onDdayClick,
    onComplete,
    onDelete,
  } = $props();

  /** @type {HTMLDivElement | null} */
  let wrapEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let dockEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let actionsEl = $state(null);

  // 최초 배치 프레임에는 left 전환 애니메이션을 꺼서 "옆에서 날아오는" 부자연스러움을 막습니다.
  let hasMeasured = $state(false);
  let capsulePos = $state(
    computeSortCapsulePosition({
      dockLeft: 10,
      dockBorderLeft: 1,
      badgeCenterClientX: null,
      actionsLeftClientX: null,
      globalFontSizePt: 10,
      hasVisibleRows: false,
    }),
  );

  const palette = $derived(resolveBulkDockPalette(themeColor, dark));
  const paletteStyle = $derived(bulkDockPaletteToStyle(palette));
  const selectAllState = $derived(
    resolveSelectAllState({
      totalCount,
      visibleSelectedCount,
      totalSelectedCount: selectedCount,
    }),
  );
  const actionsDisabled = $derived(selectedCount === 0 || busy || frozen);
  const sortDisabled = $derived(busy || frozen);
  const selectAllDisabled = $derived(selectAllState.disabled || frozen);
  const isDesc = $derived(sortOrder === 'desc');
  const sortTitle = $derived(
    isDesc
      ? '마감일 먼 순 · 클릭하면 가까운 순으로 정렬'
      : '마감일 가까운 순 · 클릭하면 먼 순으로 정렬',
  );

  /**
   * 같은 창 안의 할 일 목록에서 정렬 캡슐의 기준이 될 마감일 뱃지를 고릅니다.
   * 1순위: 날짜 텍스트가 있는 첫 번째 뱃지(예: '11/23(월)')
   * 2순위: 모든 할 일이 날짜 없음이면 첫 번째 달력 아이콘 뱃지
   * @returns {number | null}
   */
  function measureAnchorBadgeCenterX() {
    const scope = wrapEl?.parentElement;
    if (!scope) return null;
    const badges = scope.querySelectorAll('.memo-body [data-todo-deadline-btn]');
    if (!badges.length) return null;

    /** @type {HTMLElement | null} */
    let fallbackBadge = null;
    for (const el of badges) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (!fallbackBadge) fallbackBadge = el;
      if (el.textContent && el.textContent.trim().length > 0) {
        return rect.left + rect.width / 2;
      }
    }
    if (fallbackBadge) {
      const rect = fallbackBadge.getBoundingClientRect();
      return rect.left + rect.width / 2;
    }
    return null;
  }

  /** 도크·우측 액션·날짜 뱃지 좌표를 실측해 정렬 캡슐 위치와 꼬리점 가시성을 갱신합니다. */
  function measureAlignment() {
    if (!dockEl || !actionsEl) return;
    const dockRect = dockEl.getBoundingClientRect();
    if (dockRect.width <= 0) return;
    const dockBorderLeft = parseFloat(getComputedStyle(dockEl).borderLeftWidth) || 1;
    const actionsRect = actionsEl.getBoundingClientRect();
    const badgeCenterClientX = measureAnchorBadgeCenterX();

    capsulePos = computeSortCapsulePosition({
      dockLeft: dockRect.left,
      dockBorderLeft,
      badgeCenterClientX,
      actionsLeftClientX: actionsRect.width > 0 ? actionsRect.left : null,
      globalFontSizePt,
      uiFontSizePt,
      dateSlotPx,
      hasVisibleRows: totalCount > 0,
    });

    if (!hasMeasured) {
      // 첫 페인트가 끝난 뒤에만 부드러운 left 이동을 켭니다.
      requestAnimationFrame(() => {
        hasMeasured = true;
      });
    }
  }

  let rafMeasure = 0;
  function scheduleMeasure() {
    if (rafMeasure) cancelAnimationFrame(rafMeasure);
    rafMeasure = requestAnimationFrame(() => {
      rafMeasure = 0;
      measureAlignment();
    });
  }

  onMount(() => {
    measureAlignment();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => scheduleMeasure());
    if (observer && dockEl) observer.observe(dockEl);
    if (observer && actionsEl) observer.observe(actionsEl);

    const onFontsDone = () => scheduleMeasure();
    document.fonts?.addEventListener?.('loadingdone', onFontsDone);
    void document.fonts?.ready?.then(() => scheduleMeasure());

    return () => {
      if (rafMeasure) cancelAnimationFrame(rafMeasure);
      observer?.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', onFontsDone);
    };
  });

  // 목록·정렬·글꼴·글자 크기·헤더 변경 시 다음 프레임에 날짜 뱃지 중앙을 다시 맞춥니다.
  $effect(() => {
    void [
      totalCount,
      sortOrder,
      globalFontSizePt,
      uiFontSizePt,
      fontFamily,
      uiFontFamily,
      headerDesign,
      layoutSignature,
      dateSlotPx,
    ];
    scheduleMeasure();
  });

  /** 편집 중 커서를 뺏지 않기 위해 마우스 누름의 기본 초점 이동을 막습니다. @param {MouseEvent} e */
  function keepFocus(e) {
    e.preventDefault();
  }
</script>

<div
  bind:this={wrapEl}
  transition:slide={{ duration: 150 }}
  class="bulk-dock-wrap"
  class:is-dark={dark}
  style={paletteStyle}
  data-bulk-dock-wrap
>
  <div
    bind:this={dockEl}
    class="bulk-dock"
    role="toolbar"
    aria-label="선택한 할 일 일괄 도구"
    data-bulk-dock
  >
    <!-- ① 제일 좌측 (x=15px, 중심 23px): 전체 선택 조약돌 체크 토글 + 가로 폭 0px 스티커 카운트 핍 -->
    <span class="select-all-seat">
      <button
        type="button"
        role="checkbox"
        aria-checked={selectAllState.ariaChecked}
        aria-label={selectAllState.ariaLabel}
        title={selectAllState.title}
        disabled={selectAllDisabled}
        class="dock-chk"
        class:is-checked={selectAllState.mode === 'all'}
        class:is-partial={selectAllState.mode === 'partial'}
        data-bulk-select-all
        onmousedown={keepFocus}
        onclick={onToggleAll}
      >
        {#if selectAllState.mode === 'all'}
          <svg class="chk-glyph" width="10" height="10" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
            <path d="M3.2 7.4L5.9 9.9L10.8 4.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        {:else if selectAllState.mode === 'partial'}
          <svg class="chk-glyph" width="10" height="10" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
            <path d="M3.5 7h7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        {/if}
      </button>

      {#if selectAllState.pipText}
        {#key selectAllState.pipText}
          <span class="mini-count-pip" aria-hidden="true" data-bulk-count-pip><span class="pip-num">{selectAllState.pipText}</span></span>
        {/key}
      {/if}
    </span>

    <!-- ② 날짜 중앙 축: 날짜 인덱스 슬라이딩 정렬 캡슐 (↓ 가까운 순 ↔ ↑ 먼 순 + 하단 인덱스 꼬리점) -->
    <button
      type="button"
      class="index-slide-pill"
      class:is-desc={isDesc}
      class:is-smooth={hasMeasured}
      class:hide-notch={!capsulePos.showNotch}
      style="left: {capsulePos.capsuleLeftPx}px;"
      disabled={sortDisabled}
      aria-pressed={isDesc}
      aria-label={sortTitle}
      title={sortTitle}
      data-bulk-sort-capsule
      data-notch-visible={capsulePos.showNotch ? 'true' : 'false'}
      onmousedown={keepFocus}
      onclick={onToggleSort}
    >
      <span class="index-slide-thumb" aria-hidden="true"></span>
      <span class="index-slide-slot" class:is-active={!isDesc} aria-hidden="true">
        <svg width="9.5" height="11" viewBox="0 0 12 14" fill="none" focusable="false">
          <path d="M6 2.8v8.1" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" />
          <path d="M3.3 8.4L6 11.2L8.7 8.4" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="index-slide-slot" class:is-active={isDesc} aria-hidden="true">
        <svg width="9.5" height="11" viewBox="0 0 12 14" fill="none" focusable="false">
          <path d="M6 11.2V3.1" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" />
          <path d="M3.3 5.6L6 2.8L8.7 5.6" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>

    <!-- ③ 우측 일괄 액션 4종: [아카이브] [D-Day] [마감] [노트북 지우개] (184814b 계약 100% 유지) -->
    <div bind:this={actionsEl} class="bulk-actions" data-bulk-actions>
      <!-- [아카이브]는 바로 실행하지 않고 "복사해서 보관 · 옮겨서 보관" 드롭다운을 엽니다(BulkArchiveMenu, App이 그림).
           data-bulk-archive-btn: 드롭다운이 이 버튼 가운데를 꼭지로 가리키고, 바깥 누름 판정에서 이 버튼을 뺍니다. -->
      <button
        type="button"
        class="bulk-btn bulk-btn-soft"
        class:is-picker-open={archiveMenuOpen}
        disabled={actionsDisabled}
        title="고른 할 일을 아카이브(보관함)에 복사하거나 옮기기"
        aria-label="아카이브에 보관"
        aria-haspopup="menu"
        aria-expanded={archiveMenuOpen}
        data-bulk-archive-btn
        onpointerdown={(event) => onArchivePointerDown?.(event)}
        onmousedown={keepFocus}
        onclick={onArchive}
      >
        <Archive size="1.15em" strokeWidth={2.4} />
        <span class="bulk-label">아카이브</span>
      </button>

      <button
        type="button"
        class="bulk-btn bulk-btn-soft"
        class:is-picker-open={ddayPickerOpen}
        disabled={actionsDisabled}
        title="고른 할 일을 한 번에 D-Day로 고정 (마감일이 없으면 날짜를 먼저 골라요)"
        aria-label="D-Day로 고정"
        aria-haspopup="dialog"
        aria-expanded={ddayPickerOpen}
        onpointerdown={onDdayPointerDown}
        onmousedown={keepFocus}
        onclick={onDdayClick}
      >
        <Flag size="1.15em" strokeWidth={2.4} />
        <span class="bulk-label">D-Day</span>
      </button>

      <button
        type="button"
        class="bulk-btn bulk-btn-primary"
        disabled={actionsDisabled}
        title="선택한 할 일 마감 처리"
        onmousedown={keepFocus}
        onclick={onComplete}
      >
        <span class="bulk-primary-label">마감</span>
      </button>

      <button
        type="button"
        class="bulk-eraser-btn"
        disabled={actionsDisabled}
        title="선택한 할 일 삭제"
        aria-label="선택한 할 일 삭제"
        onmousedown={keepFocus}
        onclick={onDelete}
      >
        <svg viewBox="0 0 16 16" width="14.5" height="14.5" aria-hidden="true" focusable="false">
          <path d="M8 13.3h5.2" />
          <g class="eb-body">
            <path class="eb-sleeve" d="M5.7 6.5L8.5 3.7a1.2 1.2 0 0 1 1.7 0l3.1 3.1a1.2 1.2 0 0 1 0 1.7L10.5 11.3Z" />
            <path d="M4.2 13.3L2.4 11.5a1.2 1.2 0 0 1 0-1.7l6.1-6.1a1.2 1.2 0 0 1 1.7 0l3.1 3.1a1.2 1.2 0 0 1 0 1.7l-4.8 4.8H4.2z" />
            <path d="M5.7 6.5l4.8 4.8" />
          </g>
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  .bulk-dock-wrap {
    /* TodoList(.memo-body)와 동일한 고정 간격 체계를 유지해 화면 글자를 키워도 체크 축이 밀리지 않게 합니다. */
    --spacing: 3.333333px;
    --bd-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --bd-btn-h: max(21px, 1.58em);
    container-type: inline-size;
    flex-shrink: 0;
    z-index: 10;
    padding: 5px 10px 2px;
    user-select: none;
  }

  .bulk-dock {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: max(33px, calc(var(--bd-btn-h) + 11px));
    /* 외곽 10px + 테두리 1px + 좌측 패딩 4px = 15px (아래 TodoList 체크박스 시작선과 0px 일치) */
    padding: 3px 5px 3px 4px;
    border-radius: 11px;
    border: 1px solid var(--bd-dock-border);
    background-color: var(--bd-dock-bg);
    box-shadow:
      inset 0 1px 0 var(--bd-dock-gloss),
      inset 0 -1.5px 0 var(--bd-dock-rim);
    overflow: visible;
    box-sizing: border-box;
    transition: background-color 180ms ease, border-color 180ms ease;
  }

  /* ── ① 제일 좌측: 전체 선택 조약돌 체크 토글 + 스티커 핍 ── */
  .select-all-seat {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .dock-chk {
    position: relative;
    width: 16px;
    height: 16px;
    padding: 0;
    flex: none;
    display: inline-grid;
    place-items: center;
    border-radius: 6px;
    border: 1.5px solid var(--bd-chk-border);
    background-color: var(--bd-chk-bg);
    color: var(--bd-on-accent);
    box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.05);
    cursor: pointer;
    box-sizing: border-box;
    transition:
      transform 220ms var(--bd-spring),
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease,
      opacity 140ms ease;
  }
  /* 시각은 16px로 단정하게 유지하되 실제 클릭 영역은 24px로 넓혀 작은 체크박스를 편하게 누르게 합니다. */
  .dock-chk::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 9px;
  }
  .dock-chk:hover:not(:disabled) {
    border-color: var(--bd-accent-fill);
    transform: scale(1.1);
  }
  .dock-chk:active:not(:disabled) {
    transform: scale(0.88);
    transition-duration: 90ms;
  }
  .dock-chk:disabled {
    opacity: 0.38;
    cursor: default;
  }
  .dock-chk:focus-visible {
    outline: 2px solid var(--bd-accent);
    outline-offset: 2px;
  }
  .dock-chk.is-checked {
    background-color: var(--bd-accent-fill);
    border-color: var(--bd-accent-fill);
    color: var(--bd-on-accent);
    box-shadow: inset 0 -1.5px 0 var(--bd-primary-rim);
  }
  .dock-chk.is-partial {
    background-color: var(--bd-partial-bg);
    border-color: var(--bd-accent-fill);
    color: var(--bd-accent-text);
    box-shadow: inset 0 -1.2px 0 color-mix(in srgb, var(--bd-accent-fill) 22%, transparent);
  }
  .chk-glyph {
    display: block;
    /* 하단 1.5px 딱지 받침 위의 밝은 표면에 광학 중심으로 맞춥니다. */
    transform: translateY(-0.35px);
  }

  .mini-count-pip {
    position: absolute;
    top: -5.5px;
    right: -7.5px;
    z-index: 2;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 999px;
    background-color: var(--bd-accent-fill);
    color: var(--bd-on-accent);
    border: 1.5px solid var(--bd-dock-bg);
    font-size: 8.5px;
    font-weight: 900;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    pointer-events: none;
    box-sizing: border-box;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
    animation: pip-pop 220ms var(--bd-spring);
  }
  /* 한글 UI 글꼴(메이플스토리·은하수 등)에서 숫자가 위로 치우치는 메트릭을 0.5px 광학 보정합니다. */
  .pip-num {
    display: block;
    transform: translateY(0.5px);
  }
  @keyframes pip-pop {
    from { transform: scale(0.55); opacity: 0.25; }
    to { transform: scale(1); opacity: 1; }
  }

  /* ── ② 날짜 중앙 축: 날짜 인덱스 슬라이딩 정렬 캡슐 (고정 36×21px → 15×15px 원형 노브 유지) ── */
  .index-slide-pill {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 36px;
    height: 21px;
    padding: 2px;
    border-radius: 999px;
    border: 1px solid var(--bd-dock-border);
    background-color: var(--bd-track-bg);
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    cursor: pointer;
    box-sizing: border-box;
    transition:
      border-color 150ms ease,
      transform 200ms var(--bd-spring),
      opacity 140ms ease;
  }
  .index-slide-pill.is-smooth {
    transition:
      left 180ms ease-out,
      border-color 150ms ease,
      transform 200ms var(--bd-spring),
      opacity 140ms ease;
  }
  .index-slide-pill:hover:not(:disabled) {
    border-color: var(--bd-accent);
    transform: translateY(calc(-50% - 0.5px));
  }
  .index-slide-pill:active:not(:disabled) {
    transform: translateY(-50%) scale(0.94);
    transition-duration: 90ms;
  }
  .index-slide-pill:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .index-slide-pill:focus-visible {
    outline: 2px solid var(--bd-accent);
    outline-offset: 2px;
  }

  /* 아래 날짜 뱃지 열을 은은하게 가리키는 인덱스 꼬리점 (클램프·빈 목록 시 자동 숨김) */
  .index-slide-pill::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -2.8px;
    z-index: 0;
    width: 5px;
    height: 5px;
    border-radius: 1px;
    transform: translateX(-50%) rotate(45deg);
    background-color: var(--bd-track-bg);
    border-right: 1px solid var(--bd-dock-border);
    border-bottom: 1px solid var(--bd-dock-border);
    pointer-events: none;
    transition: opacity 160ms ease, border-color 150ms ease;
  }
  .index-slide-pill:hover:not(:disabled)::after {
    border-right-color: var(--bd-accent);
    border-bottom-color: var(--bd-accent);
  }
  .index-slide-pill.hide-notch::after {
    opacity: 0;
  }

  .index-slide-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    z-index: 1;
    width: 15px;
    height: 15px;
    border-radius: 999px;
    background-color: var(--bd-thumb-bg);
    box-shadow: 0 1px 2.5px rgba(15, 23, 42, 0.16), inset 0 -1px 0 var(--bd-pill-rim);
    pointer-events: none;
    transition: transform 280ms var(--bd-spring), background-color 160ms ease;
  }
  .index-slide-pill.is-desc .index-slide-thumb {
    transform: translateX(15px);
  }

  .index-slide-slot {
    position: relative;
    z-index: 2;
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--bd-muted);
    opacity: 0.42;
    pointer-events: none;
    transition: color 180ms ease, opacity 180ms ease, transform 240ms var(--bd-spring);
  }
  .index-slide-slot.is-active {
    color: var(--bd-accent-text);
    opacity: 1;
    transform: scale(1.06);
  }
  .index-slide-slot svg {
    display: block;
  }

  /* ── ③ 우측 일괄 액션 4종 ── */
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 4.5px;
    margin-left: auto;
    flex: none;
  }

  .bulk-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.28em;
    height: var(--bd-btn-h);
    padding: 0 0.68em;
    border: 1px solid transparent;
    border-radius: 999px;
    font-family: inherit;
    font-size: 0.675em;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    box-sizing: border-box;
    transition:
      transform 200ms var(--bd-spring),
      filter 130ms ease,
      background-color 140ms ease,
      border-color 140ms ease,
      opacity 140ms ease;
  }
  .bulk-btn :global(svg) {
    flex: none;
    display: block;
  }
  .bulk-btn:active:not(:disabled) {
    transform: translateY(0.8px) scale(0.94);
    transition-duration: 90ms;
  }
  .bulk-btn:disabled {
    cursor: default;
  }
  .bulk-btn:focus-visible {
    outline: 2px solid var(--bd-accent);
    outline-offset: 1.5px;
  }

  /* 아이콘 중심과 한글·영문 텍스트 광학 기준선을 정교하게 맞춥니다. */
  .bulk-label {
    display: inline-block;
    transform: translateY(0);
  }
  .bulk-primary-label {
    display: inline-block;
    transform: translateY(0.35px);
  }

  .bulk-btn-soft {
    color: var(--bd-accent-text);
    background-color: var(--bd-soft-bg);
    border-color: var(--bd-soft-border);
  }
  .bulk-btn-soft:hover:not(:disabled) {
    background-color: var(--bd-soft-hover-bg);
    border-color: var(--bd-soft-hover-border);
    transform: translateY(-0.5px);
  }
  .bulk-btn-soft:disabled {
    opacity: 0.36;
  }
  .bulk-btn-soft.is-picker-open {
    outline: 2px solid var(--bd-accent);
    outline-offset: 1px;
  }

  .bulk-btn-primary {
    padding: 0 0.74em;
    background-color: var(--bd-accent-fill);
    color: var(--bd-on-accent);
    box-shadow: inset 0 -1.5px 0 var(--bd-primary-rim);
  }
  .bulk-btn-primary:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-0.5px);
  }
  .bulk-btn-primary:disabled {
    background-color: var(--bd-disabled-bg);
    color: var(--bd-disabled-ink);
    box-shadow: none;
    opacity: 0.78;
  }

  /* 노트북 지우개 단추 (EraserButton.svelte 패밀리) */
  .bulk-eraser-btn {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--bd-btn-h);
    height: var(--bd-btn-h);
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--bd-eraser-ink);
    cursor: pointer;
    flex: none;
    transition:
      background-color 150ms ease,
      color 150ms ease,
      transform 200ms var(--bd-spring),
      opacity 140ms ease;
  }
  .bulk-eraser-btn:disabled {
    opacity: 0.30;
    cursor: default;
    pointer-events: none;
  }
  .bulk-eraser-btn:focus-visible {
    outline: 2px solid var(--bd-accent);
    outline-offset: 1.5px;
  }
  .bulk-eraser-btn svg {
    display: block;
    overflow: visible;
  }
  .bulk-eraser-btn path:not(.eb-sleeve) {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bulk-eraser-btn .eb-body {
    transform-origin: 8px 10px;
    transform-box: view-box;
    transition: transform 220ms var(--bd-spring);
  }
  .bulk-eraser-btn .eb-sleeve {
    fill: currentColor;
    stroke: none;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .bulk-eraser-btn:hover:not(:disabled) {
    background-color: var(--bd-eraser-hover-bg);
    color: var(--bd-eraser-hover-ink);
  }
  .bulk-eraser-btn:hover:not(:disabled) .eb-body {
    transform: rotate(-12deg) translate(-0.4px, -0.5px);
  }
  .bulk-eraser-btn:hover:not(:disabled) .eb-sleeve {
    opacity: 0.24;
  }
  .bulk-eraser-btn:active:not(:disabled) {
    transform: scale(0.90);
    transition-duration: 90ms;
  }
  .bulk-eraser-btn:active:not(:disabled) .eb-body {
    transform: rotate(-18deg) translate(-1.2px, 0.3px);
    transition-duration: 90ms;
  }

  /* 폭이 모자라면(창 좁음·큰 글자) [아카이브]·[D-Day] 이름만 숨기고 원형 아이콘 버튼으로 축소합니다.
     좌측 전체 선택 체크 축(23px)은 어떤 폭에서도 움직이지 않습니다. */
  @container (max-width: calc(108px + 13.5em)) {
    .bulk-label {
      display: none;
    }
    .bulk-btn-soft {
      width: var(--bd-btn-h);
      padding-inline: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dock-chk,
    .mini-count-pip,
    .index-slide-pill,
    .index-slide-pill.is-smooth,
    .index-slide-thumb,
    .index-slide-slot,
    .bulk-btn,
    .bulk-eraser-btn,
    .bulk-eraser-btn .eb-body {
      animation: none !important;
      transition-duration: 0ms !important;
    }
    .dock-chk:hover,
    .dock-chk:active,
    .bulk-btn:hover,
    .bulk-btn:active,
    .bulk-eraser-btn:hover .eb-body,
    .bulk-eraser-btn:active .eb-body {
      transform: none;
    }
    .index-slide-pill:hover,
    .index-slide-pill:active {
      transform: translateY(-50%);
    }
  }
</style>
