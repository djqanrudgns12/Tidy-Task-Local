<script>
  // @ts-nocheck
  import { onMount, tick } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit, emitTo } from '@tauri-apps/api/event';
  import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
  import { getThemeAccent, getTidyTheme } from '../lib/themes.js';
  import { watchCustomFonts } from '../lib/toolkit/appearance.js';
  import { registerFontFace } from '../lib/fonts.js';
  import { getMonitorGeometries } from '../lib/windows/windowRegistry.js';
  import { BUILTIN_FONTS } from '../lib/builtinFonts.js';
  import { STABLE_MAX_PT } from '../lib/fontSize.js';
  import { computeMenuBounds } from '../lib/editor/richTextFormat.js';
  import { CONTEXT_DUOTONE_ICONS } from '../lib/contextMenuIcons.js';
  import ContextFormatBar from './context-menu/ContextFormatBar.svelte';
  import './context-menu/ctxTokens.css';
  import {
    Undo2, Redo2, Pencil, Check, Download, Upload, Settings2, CircleHelp,
    PanelsTopLeft, Utensils, CopyPlus, StickyNote, Archive, NotebookPen,
    Omega, Scissors, Copy, ClipboardPaste, TextSelect, Pin, Palette,
    ChevronUp, ChevronDown, PinOff,
  } from 'lucide-svelte';

  let {
    isStandalone = false,
    preview = false,
    previewType = 'bar',
    previewDark = false,
    previewConfig = {},
    onaction = undefined,
    onliveaction = undefined,
  } = $props();

  let type = $state('bar');
  let config = $state({
    themeColor: 'amber', isDarkMode: false, showArchived: true, showNotes: true,
    isEditMode: false, isPinned: false, isRolledUp: false, isFullscreen: false,
    hasEditor: false, hasSelection: false,
    canUndo: true, canRedo: false,
    maxFontPt: STABLE_MAX_PT,
    fonts: BUILTIN_FONTS,
    selectionFormat: null,
    todoMeta: null,
  });
  let visible = $state(false);
  let menuRef = $state(null);
  let formatBarRef = $state(null);
  let requesterLabel = $state('');
  let sessionToken = $state('');
  let maxHeight = $state(760);

  // 동적 리사이즈(인라인 드로어 개폐) 시 원래 앵커 좌표와 모니터 작업영역으로 경계를 유지합니다.
  let anchorX = 0;
  let anchorY = 0;
  let activeMonitor = null;
  let activeScale = 1;
  let lastSizedW = 0;
  let lastSizedH = 0;
  let resizeFrame = 0;

  const todoMenuWidth = $derived((config.uiFontSize || 10) >= 12 ? 236 : 220);

  const launchers = [
    { action: 'open-toolkit', label: 'Tidy 툴킷 열기', icon: PanelsTopLeft },
    { action: 'open-meal', label: '급식창 열기', icon: Utensils },
    { action: 'spawn-window', label: '새 Tidy Task 노트', icon: CopyPlus },
    { action: 'spawn-tiny', label: '새 Tiny Note', icon: StickyNote },
  ];

  async function syncStandaloneBounds(force = false) {
    if (!isStandalone || !visible || !menuRef) return;
    const width = menuRef.offsetWidth;
    const height = menuRef.offsetHeight;
    if (!width || !height) return;
    if (!force && width === lastSizedW && height === lastSizedH) return;
    lastSizedW = width;
    lastSizedH = height;
    const win = getCurrentWindow();
    const { left, top } = computeMenuBounds({
      anchorX,
      anchorY,
      width,
      height,
      scale: activeScale,
      work: activeMonitor?.work || null,
    });
    await win.setSize(new LogicalSize(width, height));
    await win.setPosition(new PhysicalPosition(left, top));
  }

  // 드로어가 열리거나 닫혀 메뉴 크기가 바뀌면 창 크기·위치를 실시간으로 재보정합니다.
  $effect(() => {
    if (!isStandalone || !visible || !menuRef) return;
    const node = menuRef;
    const observer = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        void syncStandaloneBounds(false).catch(() => {});
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (resizeFrame) { cancelAnimationFrame(resizeFrame); resizeFrame = 0; }
    };
  });

  onMount(() => {
    if (preview) {
      const params = new URLSearchParams(location.search);
      const isDragPreview = params.has('drag') || previewConfig.hasSelection;
      const isLinkedPreview = params.has('dday');
      const sampleTodo = previewType === 'todo'
        ? {
            id: 'demo-t1',
            titlePreview: '수학 익힘책 단원평가 채점하기',
            hasDeadline: true,
            deadlineLabel: '11.17 (화)',
            deadlineChip: '11.17',
            deadlineTone: 'soon',
            linkedDdayId: isLinkedPreview ? 'demo-d1' : null,
            linkedCounter: isLinkedPreview ? 'D-2' : '',
          }
        : null;
      type = previewType;
      config = {
        ...config,
        themeColor: params.get('theme') || 'periwinkle',
        uiFontFamily: '메이플스토리 L',
        uiFontSize: Number(params.get('uifont')) || 10,
        hasEditor: true,
        hasSelection: Boolean(isDragPreview),
        canUndo: true,
        canRedo: true,
        fonts: BUILTIN_FONTS,
        selectionFormat: isDragPreview
          ? {
              fontFamily: '메이플스토리 L',
              fontSize: 10,
              isBold: true,
              isItalic: false,
              isUnderline: false,
              textColor: '#4f46e5',
              bgColor: '#fef08a',
              isMixedFont: false,
              isMixedSize: false,
            }
          : null,
        todoMeta: sampleTodo,
        ...previewConfig,
        isDarkMode: previewDark,
      };
      visible = true;
    }
    if (!isStandalone) return;
    document.body.style.backgroundColor = 'transparent';
    document.body.style.overflow = 'hidden';
    let disposed = false;
    const offs = [];
    const register = (off) => disposed ? off() : offs.push(off);
    void watchCustomFonts(fonts => { for (const font of fonts) void registerFontFace(font.name, font.path); }).then(register).catch(() => {});
    let requestId = 0;
    let opening = false;

    getCurrentWindow().listen('show-ctx-menu', async ({ payload }) => {
      const id = ++requestId;
      opening = true;
      try {
        const { x, y, state, requester, token } = payload;
        formatBarRef?.closeDrawer?.();
        type = payload.type;
        config = {
          ...config,
          fonts: BUILTIN_FONTS,
          maxFontPt: STABLE_MAX_PT,
          selectionFormat: null,
          ...state,
        };
        requesterLabel = requester;
        sessionToken = token || '';
        anchorX = x;
        anchorY = y;
        lastSizedW = 0;
        lastSizedH = 0;

        const win = getCurrentWindow();
        const monitors = await getMonitorGeometries();
        const monitor = monitors.find(m => x >= m.work.x && x < m.work.x + m.work.width && y >= m.work.y && y < m.work.y + m.work.height) || monitors[0];
        activeMonitor = monitor || null;
        // Move first so the menu measures at the destination monitor's scale.
        await win.setPosition(new PhysicalPosition(x, y));
        const scale = await win.scaleFactor();
        activeScale = scale;
        maxHeight = monitor ? Math.floor(monitor.work.height / scale) - 8 : 760;
        if (disposed || id !== requestId) return;
        visible = true;
        await tick();
        if (!menuRef) return;
        await syncStandaloneBounds(true);
        if (disposed || id !== requestId) return;
        await win.show();
        await win.setFocus();
        menuRef?.querySelector('button:not(:disabled)')?.focus();
      } catch (error) {
        console.error('[ContextMenu] 표시 실패:', error);
      } finally {
        if (id === requestId) opening = false;
      }
    }).then(async off => {
      register(off);
      // 준비 응답은 실제 열기 리스너가 등록된 다음에만 보냅니다.
      const offPing = await getCurrentWindow().listen('ctx-menu-ping', ({ payload }) => {
        void emitTo(payload.requester, 'ctx-menu-ready', payload.token);
      });
      register(offPing);
    });

    // 데이터 창에서 실시간 서식·히스토리 변경 결과를 돌려받아 메뉴 상태를 동기화합니다.
    getCurrentWindow().listen('ctx-state-synced', ({ payload }) => {
      if (!payload || !visible) return;
      if (sessionToken && payload.token && payload.token !== sessionToken) return;
      if (payload.close) {
        void close();
        return;
      }
      if (payload.patch && typeof payload.patch === 'object') {
        config = { ...config, ...payload.patch };
      }
    }).then(register);

    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused && !opening) void close();
    }).then(register);

    return () => { disposed = true; requestId++; offs.forEach(off => off()); };
  });

  async function close() {
    formatBarRef?.closeDrawer?.();
    visible = false;
    lastSizedW = 0;
    lastSizedH = 0;
    if (isStandalone) await getCurrentWindow().hide();
  }

  async function triggerAction(action) {
    const target = requesterLabel;
    await close();
    onaction?.(action);
    if (isStandalone) {
      if (target) await emitTo(target, 'ctx-action', action);
      else await emit('ctx-action', action);
    }
  }

  /** 메뉴를 닫지 않고 서식·기록을 실시간 반영하는 양방향 IPC 액션 */
  async function triggerLiveAction(detail) {
    const payload = { token: sessionToken, ...detail };
    onliveaction?.(payload);
    if (preview && detail.kind === 'format') {
      const cur = config.selectionFormat || {
        fontFamily: '메이플스토리 L', fontSize: 10, isBold: false, isItalic: false,
        isUnderline: false, textColor: '', bgColor: '', isMixedFont: false, isMixedSize: false,
      };
      const next = { ...cur };
      if (detail.op === 'font') { next.fontFamily = detail.value; next.isMixedFont = false; }
      else if (detail.op === 'size') { next.fontSize = detail.value; next.isMixedSize = false; }
      else if (detail.op === 'bold') next.isBold = !next.isBold;
      else if (detail.op === 'italic') next.isItalic = !next.isItalic;
      else if (detail.op === 'underline') next.isUnderline = !next.isUnderline;
      else if (detail.op === 'color') next.textColor = detail.value || '';
      else if (detail.op === 'bg') next.bgColor = detail.value || '';
      config = { ...config, selectionFormat: next };
    }
    if (isStandalone) {
      const target = requesterLabel;
      if (target) await emitTo(target, 'ctx-live-action', payload);
      else await emit('ctx-live-action', payload);
    }
  }

  function keydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (formatBarRef?.closeDrawer?.()) return;
      void close();
      return;
    }
    // 숫자 입력칸 안에서는 방향키/Home/End를 가로채지 않습니다.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement) {
      return;
    }
    const buttons = [...menuRef.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    const index = buttons.indexOf(active);
    let next;
    if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
  }
</script>

{#snippet item(action, label, Icon, checked = undefined, disabled = false)}
  <button class="item" {disabled} role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={checked} onclick={() => triggerAction(action)}>
    <Icon size={17} strokeWidth={1.7} /><span>{label}</span>
    {#if checked !== undefined}<span class="state" class:active={checked}>{#if checked}<Check size={13} />{:else}<span class="off-dot"></span>{/if}</span>{/if}
  </button>
{/snippet}

{#snippet duotoneIcon(kind, pinned = false)}
  {@const spec = CONTEXT_DUOTONE_ICONS[kind]}
  <svg
    width={spec.size}
    height={spec.size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={spec.shiftX ? `transform:translateX(${spec.shiftX}px);` : undefined}
  >
    {@html spec.renderBody(pinned)}
  </svg>
{/snippet}

{#if visible}
  {#if type === 'todo'}
    {@const meta = config.todoMeta || {}}
    {@const isLinked = Boolean(meta.linkedDdayId)}
    {@const tone = meta.deadlineTone || 'none'}
    <div
      bind:this={menuRef}
      class="ctx-pocket todo-pocket"
      class:dark={config.isDarkMode}
      data-scheme={config.isDarkMode ? 'dark' : 'light'}
      role="menu"
      tabindex="-1"
      aria-label="할 일 메뉴"
      onkeydown={keydown}
      oncontextmenu={e => e.preventDefault()}
      style="--surface:{config.isDarkMode ? '#242730' : getTidyTheme(config.themeColor).tidy.bg}; --accent:{getThemeAccent(config.themeColor, config.isDarkMode)}; --ctx-width:{todoMenuWidth}px; --limit:{maxHeight}px; font-family:'{config.uiFontFamily || '메이플스토리 L'}','Maplestory',system-ui,sans-serif; font-size:{Math.max(9, config.uiFontSize || 10)}pt;"
    >
      <!-- ① 파스텔 미니 리본 헤더: 마감일 5단계 칩(또는 도트) + 할 일 요약 + D-Day 카운터 -->
      <div class="pocket-ribbon" aria-hidden="true">
        {#if meta.hasDeadline && meta.deadlineChip}
          <span
            class="ribbon-dl-chip"
            style="color:var(--ctx-dl-{tone}, var(--ctx-accent)); background:var(--ctx-dl-{tone}-bg, var(--ctx-accent-soft));"
          >{meta.deadlineChip}</span>
        {:else}
          <span class="ribbon-dot"></span>
        {/if}
        <span class="ribbon-title" class:empty={!meta.titlePreview}>
          {meta.titlePreview || '할 일'}
        </span>
        {#if isLinked && meta.linkedCounter}
          <span class="ribbon-dday-chip">{meta.linkedCounter}</span>
        {/if}
      </div>

      <!-- ② 4칸 가로형 미니 포켓 타일 (Soft-Duotone SVG) -->
      <div class="pocket-tiles" role="group" aria-label="할 일 빠른 동작">
        <button
          type="button"
          role="menuitem"
          class="pocket-tile tile-dday"
          class:pinned={isLinked}
          title={isLinked ? 'D-Day 컨트롤에서 열기' : (meta.hasDeadline ? `${meta.deadlineLabel} 기준 D-Day 고정` : '목표 날짜를 고른 뒤 D-Day 고정')}
          onclick={() => triggerAction(isLinked ? 'todo-open-dday' : 'todo-pin-dday')}
        >
          {#if isLinked}<span class="tile-pin-dot" aria-hidden="true"></span>{/if}
          <span class="tile-icon">{@render duotoneIcon('flag', isLinked)}</span>
          <span class="tile-label">D-Day</span>
        </button>

        <button
          type="button"
          role="menuitem"
          class="pocket-tile tile-cal"
          title={meta.hasDeadline ? `마감일 변경 (${meta.deadlineLabel})` : '마감일 설정하기'}
          onclick={() => triggerAction('todo-edit-deadline')}
        >
          <span class="tile-icon">{@render duotoneIcon('calendar')}</span>
          <span class="tile-label">마감일</span>
        </button>

        <button
          type="button"
          role="menuitem"
          class="pocket-tile tile-ok"
          title="마감 처리 (보관함으로)"
          onclick={() => triggerAction('todo-complete')}
        >
          <span class="tile-icon">{@render duotoneIcon('checkCircle')}</span>
          <span class="tile-label">완료</span>
        </button>

        <button
          type="button"
          role="menuitem"
          class="pocket-tile tile-del"
          title="할 일 삭제"
          onclick={() => triggerAction('todo-delete')}
        >
          <span class="tile-icon">{@render duotoneIcon('trash')}</span>
          <span class="tile-label">삭제</span>
        </button>
      </div>

      <!-- ②-b 조건부 D-Day 고정 해제 슬림 바 -->
      {#if isLinked}
        <button
          type="button"
          role="menuitem"
          class="pocket-unpin-bar"
          onclick={() => triggerAction('todo-unpin-dday')}
        >
          <PinOff size={11} strokeWidth={2} />
          <span>D-Day 고정 해제 (할 일 유지)</span>
        </button>
      {/if}

      <!-- ③ 텍스트 드래그 시 상단 툴바 정렬 서식 카드 -->
      {#if config.hasSelection}
        <ContextFormatBar
          bind:this={formatBarRef}
          format={config.selectionFormat}
          fonts={config.fonts || BUILTIN_FONTS}
          maxFontPt={config.maxFontPt ?? STABLE_MAX_PT}
          onformat={(detail) => triggerLiveAction({ kind: 'format', ...detail })}
        />
      {/if}

      <!-- ④ 하단 아이콘 전용 유틸리티 바 (좌: 클립보드·기호 / 우: 실행취소·다시실행) -->
      <div class="pocket-dock" role="group" aria-label="편집 및 기록">
        <div class="dock-group">
          <button
            type="button"
            role="menuitem"
            class="dock-btn ctx-tip tip-left"
            disabled={!config.hasSelection}
            data-tip="잘라내기"
            title="잘라내기"
            aria-label="잘라내기"
            onclick={() => triggerAction('cut')}
          ><Scissors size={12.5} strokeWidth={1.85} /></button>

          <button
            type="button"
            role="menuitem"
            class="dock-btn ctx-tip"
            disabled={!config.hasSelection}
            data-tip="복사"
            title="복사"
            aria-label="복사"
            onclick={() => triggerAction('copy')}
          ><Copy size={12.5} strokeWidth={1.85} /></button>

          <button
            type="button"
            role="menuitem"
            class="dock-btn ctx-tip"
            disabled={!config.hasEditor}
            data-tip="붙여넣기"
            title="붙여넣기"
            aria-label="붙여넣기"
            onclick={() => triggerAction('paste')}
          ><ClipboardPaste size={12.5} strokeWidth={1.85} /></button>

          <button
            type="button"
            role="menuitem"
            class="dock-btn ctx-tip"
            disabled={!config.hasEditor}
            data-tip="특수기호"
            title="특수기호"
            aria-label="특수기호"
            onclick={() => triggerAction('symbols')}
          ><Omega size={12.5} strokeWidth={1.85} /></button>
        </div>

        <div class="dock-group">
          <button
            type="button"
            role="menuitem"
            class="dock-btn ctx-tip"
            disabled={config.canUndo === false}
            data-tip="실행 취소"
            title="실행 취소 (Ctrl+Z)"
            aria-label="실행 취소"
            onclick={() => triggerLiveAction({ kind: 'history', action: 'undo' })}
          ><Undo2 size={12.5} strokeWidth={1.95} /></button>

          <button
            type="button"
            role="menuitem"
            class="dock-btn ctx-tip tip-right"
            disabled={config.canRedo === false}
            data-tip="다시 실행"
            title="다시 실행 (Ctrl+Y)"
            aria-label="다시 실행"
            onclick={() => triggerLiveAction({ kind: 'history', action: 'redo' })}
          ><Redo2 size={12.5} strokeWidth={1.95} /></button>
        </div>
      </div>
    </div>
  {:else}
  <div bind:this={menuRef} class="context-menu" class:dark={config.isDarkMode} role="menu" tabindex="-1" aria-label={type === 'tiny' ? 'Tiny Note 메뉴' : 'Tidy Task 메뉴'} onkeydown={keydown} oncontextmenu={e => e.preventDefault()}
    style="--surface:{config.isDarkMode ? '#24262c' : getTidyTheme(config.themeColor).tidy.bg}; --accent:{getThemeAccent(config.themeColor, config.isDarkMode)}; --limit:{maxHeight}px; font-family:'{config.uiFontFamily || '메이플스토리 L'}','Maplestory',system-ui,sans-serif; font-size:{Math.max(10, config.uiFontSize || 10)}pt;">
    <div class="brand" aria-hidden="true">{type === 'tiny' ? 'Tiny Note' : 'Tidy Task'}<span>빠른 메뉴</span></div>
    <div class="launchers">
      {#each launchers as entry}
        <button role="menuitem" class="launcher" onclick={() => triggerAction(entry.action)}><entry.icon size={18} strokeWidth={1.7}/><span>{entry.label}</span></button>
      {/each}
    </div>
    <div class="separator" role="separator"></div>
    <div class="pair">
      {@render item('undo', '실행 취소', Undo2)}
      {@render item('redo', '다시 실행', Redo2)}
    </div>
    {#if type === 'text' || type === 'tiny'}
      <div class="pair">
        {@render item('cut', '잘라내기', Scissors, undefined, !config.hasSelection)}
        {@render item('copy', '복사', Copy, undefined, !config.hasSelection)}
        {@render item('paste', '붙여넣기', ClipboardPaste, undefined, !config.hasEditor)}
        {@render item('select-all', '모두 선택', TextSelect, undefined, !config.hasEditor)}
      </div>
      <div class="separator" role="separator"></div>
    {/if}
    {#if type !== 'tiny'}{@render item('toggle-edit', '편집 모드', Pencil, config.isEditMode)}{/if}
    {#if type === 'tiny'}
      {@render item('tiny-pin', '항상 위에 표시', Pin, config.isPinned)}
      <div class="pair">
        {@render item('tiny-theme', '테마 바꾸기', Palette)}
        {@render item('tiny-rollup', config.isRolledUp ? '펼치기' : '접기', config.isRolledUp ? ChevronDown : ChevronUp, undefined, config.isFullscreen)}
      </div>
      {@render item('tiny-archive', '보관함에 보관', Archive)}
    {:else if type === 'text'}
      {@render item('symbols', '특수문자', Omega)}
    {:else}
      <div class="separator" role="separator"></div>
      {@render item('toggle-archived', '마감된 일 표시', Archive, config.showArchived)}
      {@render item('toggle-notes', '중요한 일 메모 표시', NotebookPen, config.showNotes)}
      <div class="separator" role="separator"></div>
      {@render item('import', '메모장 가져오기', Download)}
      {@render item('export', '메모장으로 내보내기', Upload)}
    {/if}
    <div class="separator" role="separator"></div>
    <div class="pair footer">
      {@render item('open-help', '기능 설명', CircleHelp)}
      {@render item('open-settings', '설정', Settings2)}
    </div>
  </div>
  {/if}
{/if}

<style>
  /* ── 시안 C Refined: 아기자기 포켓 독 (type === 'todo') ── */
  .pocket-ribbon {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 6px;
    margin-bottom: 5px;
    border-radius: var(--ctx-radius-card);
    background: var(--ctx-accent-soft);
  }
  .ribbon-dl-chip {
    flex-shrink: 0;
    padding: 1.5px 5px;
    border-radius: var(--ctx-radius-pill);
    font-size: 9px;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .ribbon-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: var(--ctx-radius-pill);
    background: var(--ctx-accent);
    box-shadow: 0 0 0 2px var(--ctx-accent-border);
  }
  .ribbon-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(10px, 0.86em, 11.5px);
    font-weight: 700;
    letter-spacing: -0.015em;
    color: var(--ctx-ink);
  }
  .ribbon-title.empty {
    color: var(--ctx-muted);
    font-weight: 600;
  }
  .ribbon-dday-chip {
    flex-shrink: 0;
    padding: 1.5px 5px;
    border-radius: var(--ctx-radius-pill);
    background: var(--ctx-accent);
    color: var(--ctx-accent-ink);
    font-size: 9px;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .pocket-tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3px;
  }
  .pocket-tile {
    position: relative;
    height: 35px;
    padding: 3px 2px 4px;
    border-radius: var(--ctx-radius-card);
    border: 1px solid transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
    transition: transform 105ms ease, background-color 110ms ease, border-color 110ms ease;
  }
  .pocket-tile:hover {
    transform: translateY(-0.5px);
  }
  .pocket-tile:active {
    transform: scale(0.96);
  }
  .pocket-tile:focus,
  .pocket-unpin-bar:focus,
  .dock-btn:focus {
    outline: none;
  }
  .pocket-tile:focus-visible {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }
  .tile-pin-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 4px;
    height: 4px;
    border-radius: 99px;
    background: var(--ctx-accent);
  }
  .tile-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .tile-label {
    font-size: clamp(9px, 0.76em, 10px);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.025em;
    white-space: nowrap;
  }

  .tile-dday {
    background: var(--ctx-accent-soft);
    border-color: var(--ctx-accent-border);
    color: var(--ctx-accent);
  }
  .tile-dday:hover {
    background: var(--ctx-accent-hover);
  }

  .tile-cal {
    background: var(--ctx-warn-soft);
    color: var(--ctx-ink);
  }
  .tile-cal .tile-icon {
    color: var(--ctx-warn);
  }
  .tile-cal:hover {
    background: var(--ctx-warn-hover);
    border-color: var(--ctx-warn-border);
  }

  .tile-ok {
    background: var(--ctx-ok-soft);
    color: var(--ctx-ink);
  }
  .tile-ok .tile-icon {
    color: var(--ctx-ok);
  }
  .tile-ok:hover {
    background: var(--ctx-ok-hover);
    border-color: var(--ctx-ok-border);
  }

  .tile-del {
    background: var(--ctx-danger-soft);
    color: var(--ctx-danger);
  }
  .tile-del:hover {
    background: var(--ctx-danger-hover);
    border-color: var(--ctx-danger-border);
  }

  .pocket-unpin-bar {
    width: 100%;
    height: 22px;
    margin-top: 4px;
    padding: 0 6px;
    border-radius: var(--ctx-radius-ctrl);
    border: 1px dashed var(--ctx-line);
    background: transparent;
    color: var(--ctx-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 9.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, border-color 110ms ease;
  }
  .pocket-unpin-bar:hover {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
    border-color: var(--ctx-line-outer);
  }
  .pocket-unpin-bar:focus-visible {
    outline: 2px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .pocket-dock {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--ctx-line);
  }
  .dock-group {
    display: flex;
    align-items: center;
    gap: 1px;
  }
  .dock-btn {
    width: 24px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--ctx-radius-ctrl);
    background: transparent;
    color: var(--ctx-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, transform 90ms ease;
  }
  .dock-btn:hover:not(:disabled) {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
  }
  .dock-btn:active:not(:disabled) {
    transform: scale(0.93);
  }
  .dock-btn:disabled {
    opacity: 0.32;
    cursor: default;
  }
  .dock-btn:focus-visible {
    outline: 2px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  /* ── 기존 일반/메모/Tiny Note 메뉴 스타일 유지 ── */
  .context-menu { --ink:#343b47; --muted:#79808b; --line:rgba(50,60,70,.12); --hover:rgba(50,60,70,.065); box-sizing:border-box; width:max-content; min-width:304px;  max-height:var(--limit); overflow:auto; padding:10px; border:1px solid var(--line); border-radius:14px; background:var(--surface); color:var(--ink); user-select:none; }
  .dark { --ink:#e6e8ef; --muted:#a4aab8; --line:rgba(255,255,255,.12); --hover:rgba(255,255,255,.08); color-scheme:dark; }
  .brand { display:flex; align-items:center; justify-content:space-between; padding:3px 7px 11px; font:600 12px/1.4 system-ui,sans-serif; letter-spacing:.02em; }
  .brand span { color:var(--muted); font-size:11px; font-weight:400; }
  .launchers { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  .context-menu button { color:inherit; font:inherit; cursor:pointer; border:0; background:transparent; }
  .launcher { display:flex; align-items:center; gap:8px; padding:11px 9px; border:1px solid var(--line); border-radius:8px; text-align:left; font-size:.9em; white-space:nowrap; }
  .launcher :global(svg) { color:var(--accent); flex-shrink:0; }
  .item { display:flex; align-items:center; width:100%; gap:10px; padding:8px 9px; min-height:36px; border-radius:7px; text-align:left; line-height:1.4; white-space:nowrap; }
  .item > :global(svg) { flex-shrink:0; color:var(--muted); }
  .item > span:first-of-type { flex:1; }
  .context-menu button:disabled { opacity:.38; cursor:default; }
  .context-menu button:hover:not(:disabled) { background:var(--hover); }
  .context-menu button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; background:var(--hover); }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  .state { width:24px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:5px; background:var(--hover); color:var(--muted); }
  .state.active { background:var(--accent); color:white; }
  .off-dot { width:7px; height:1px; background:currentColor; }
  .separator { height:1px; background:var(--line); margin:7px 4px; }
  .footer { font-size:.94em; }
</style>
