<script>
  import { onMount, tick } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { emit, listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import {
    Check,
    Flag,
    LayoutGrid,
    PanelTop,
    Plus,
    X,
  } from 'lucide-svelte';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { getThemeAccent, getTidyTheme } from '../../lib/themes.js';
  import { openTool } from '../../lib/toolkit/windows.js';
  import {
    computeDdayCounter,
    normalizeDdaySettings,
    normalizeDdayWidgetPrefs,
    stripHtmlToTitle,
    todayDateKey,
  } from '../../lib/dday/ddayModel.js';
  import { formatDeadlineChip } from '../../lib/editor/richTextFormat.js';
  import { resolveMenuWidth } from '../../lib/windows/contextMenuLayout.js';
  import {
    DDAY_EVENTS,
    collectAllNoteWindowsDdays,
    createDdaySettingsSection,
    createDdayWidgetSection,
    dispatchDdayCommand,
    subscribeDdayStore,
  } from '../../lib/dday/ddaySync.js';
  import ContextRibbonHeader from '../context-menu/ContextRibbonHeader.svelte';
  import ContextSegmentRow from '../context-menu/ContextSegmentRow.svelte';
  import ContextTileGrid from '../context-menu/ContextTileGrid.svelte';
  import '../context-menu/ctxTokens.css';
  import DdayBanner from './DdayBanner.svelte';
  import DdayRowCard from './DdayRowCard.svelte';
  import DdayEditSheet from './DdayEditSheet.svelte';
  import DdaySettingsTab from './DdaySettingsTab.svelte';
  import DdayArchiveView from './DdayArchiveView.svelte';

  /** @type {{ preview?: boolean }} */
  let { preview = false } = $props();

  /** @type {import('../../lib/dday/ddaySync.js').DdayWindowSnapshot[]} */
  let windows = $state([]);
  let targetLabel = $state('main');
  let todayKey = $state(todayDateKey());

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

  let previewDarkOverride = $state(/** @type {boolean | null} */ (null));
  let previewFontOverride = $state(/** @type {number | null} */ (null));

  /** @type {{ item: import('../../lib/dday/ddayModel.js').DdayItem, x: number, y: number } | null} */
  let contextMenu = $state(null);
  /** @type {HTMLDivElement | null} */
  let shellEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let ctxEl = $state(null);

  let noticeText = $state('');
  /** @type {ReturnType<typeof setTimeout> | null} */
  let noticeTimer = null;

  /** @param {string} msg */
  function showNotice(msg) {
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeText = msg;
    noticeTimer = setTimeout(() => {
      noticeText = '';
    }, 2600);
  }

  /** @param {HTMLElement} node */
  const draggable = (node) => (isTauri() ? dragRegion(node) : { destroy() {} });

  const currentWindowSnap = $derived(
    windows.find((w) => w.label === targetLabel) || windows[0] || null,
  );
  const dark = $derived(previewDarkOverride ?? currentWindowSnap?.isDarkMode ?? false);
  const themeColor = $derived(currentWindowSnap?.themeColor || 'amber');
  const accent = $derived(getThemeAccent(themeColor, dark));
  const uiFontSize = $derived(previewFontOverride ?? currentWindowSnap?.uiFontSize ?? 10);
  const compactCapsules = $derived(uiFontSize >= 13);

  const activeItems = $derived.by(() =>
    (currentWindowSnap?.ddayItems || [])
      .filter((d) => d.status === 'active')
      .slice()
      .sort((a, b) => a.order - b.order),
  );
  const archivedItems = $derived.by(() =>
    (currentWindowSnap?.ddayItems || []).filter((d) => d.status === 'archived'),
  );
  const bannerItems = $derived(activeItems.filter((d) => d.showInBanner));
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

  // 컨텍스트 메뉴가 열려 있는 동안 최신 항목 상태로 유지
  const activeContextItem = $derived.by(() => {
    if (!contextMenu) return null;
    return activeItems.find((d) => d.id === contextMenu?.item.id) || null;
  });
  const ctxSurface = $derived(dark ? '#242730' : (getTidyTheme(themeColor)?.tidy?.bg || '#ffffff'));
  const ctxWidth = $derived(resolveMenuWidth('ctrl-ctx', uiFontSize));

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
    return [
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
          void handleComplete(item.id);
          contextMenu = null;
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
    ];
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

  /** @param {string} label @param {import('../../lib/dday/ddaySync.js').DdayWindowSnapshot | undefined} nextSnap */
  function mergeSnapshot(label, nextSnap) {
    if (!nextSnap) return;
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

  /** @param {{ targetLabel?: string, focusDdayId?: string | null, editDdayId?: string | null, initialTab?: 'list'|'settings'|'archive', openCreate?: boolean }} payload */
  function applyTargetPayload(payload) {
    if (!payload) return;
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
    contextMenu = null;
  }

  /** @param {import('../../lib/dday/ddayModel.js').DdayItem} item @param {number} clientX @param {number} clientY @param {boolean} [viaKeyboard] */
  async function openRowContext(item, clientX, clientY, viaKeyboard = false) {
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

  function closeModal() {
    if (isTauri()) {
      void getCurrentWindow().close().catch(() => {});
    } else {
      window.close();
    }
  }

  async function launchWidget() {
    if (!isTauri()) {
      showNotice('프리뷰에서는 ?toolkit-preview=dday 로 위젯을 확인할 수 있어요');
      return;
    }
    try {
      await openTool('dday');
      showNotice('데스크톱 D-Day 위젯을 띄웠어요');
    } catch {
      showNotice('D-Day 위젯을 열지 못했어요');
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

  /** @param {string} id */
  async function handleComplete(id) {
    await sendCommand('complete', { ddayId: id });
    showNotice('완료 아카이브로 이동했어요');
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

  /** @param {string} id @param {-1 | 1} dir */
  async function handleMove(id, dir) {
    const ids = activeItems.map((d) => d.id);
    const idx = ids.indexOf(id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    const next = [...ids];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    await sendCommand('reorder', { orderedIds: next });
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
      if (isTauri()) closeModal();
    }
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

    if (preview || !isTauri()) {
      const params = new URLSearchParams(location.search);
      if (params.has('dark')) previewDarkOverride = params.get('dark') !== '0';
      const fontParam = Number(params.get('font'));
      if (Number.isFinite(fontParam) && fontParam >= 9) previewFontOverride = fontParam;
      const tabParam = params.get('tab');
      if (tabParam === 'settings') activeTab = 'settings';
      else if (tabParam === 'archive') {
        activeTab = 'settings';
        subView = 'archive';
      } else if (tabParam === 'edit') {
        subView = 'create';
      }
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

    const onFocus = () => { todayKey = todayDateKey(); };
    const dayTimer = setInterval(() => { todayKey = todayDateKey(); }, 60_000);
    window.addEventListener('focus', onFocus);

    const onPreviewSync = (/** @type {Event} */ ev) => {
      const d = /** @type {CustomEvent} */ (ev).detail;
      if (d?.label && d?.snapshot) mergeSnapshot(d.label, d.snapshot);
    };
    window.addEventListener('tidy-dday-preview-sync', onPreviewSync);

    void (async () => {
      await Promise.all([
        settingsSection.load(),
        widgetSection.load(),
        collectAllNoteWindowsDdays().then((list) => {
          if (!disposed && list.length > 0) {
            windows = list;
            if (!list.some((w) => w.label === targetLabel)) {
              targetLabel = list[0].label;
            }
          }
        }),
      ]);

      register(await subscribeDdayStore(({ section, revision }) => {
        if (section === 'settings') void settingsSection?.external(revision);
        if (section === 'widget') void widgetSection?.external(revision);
      }));

      if (isTauri()) {
        const win = getCurrentWindow();
        register(await listen(DDAY_EVENTS.windowUpdated, (ev) => {
          const p = /** @type {any} */ (ev.payload);
          if (p?.label && p?.snapshot) mergeSnapshot(p.label, p.snapshot);
        }));
        register(await win.listen(DDAY_EVENTS.setTarget, (ev) => {
          applyTargetPayload(/** @type {any} */ (ev.payload));
        }));
        await emit(DDAY_EVENTS.controlReady, {}).catch(() => {});
      }
    })();

    return () => {
      disposed = true;
      offs.forEach((fn) => fn());
      clearInterval(dayTimer);
      if (noticeTimer) clearTimeout(noticeTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('tidy-dday-preview-sync', onPreviewSync);
      settingsSection?.dispose();
      widgetSection?.dispose();
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} onblur={() => (contextMenu = null)} />

<div class="ctrl-host" class:is-preview={preview || !isTauri()}>
  <div
    bind:this={shellEl}
    class="ctrl-shell"
    data-scheme={dark ? 'dark' : 'light'}
    style="--dd-accent: {accent}; --ctrl-font-size: {Math.min(13.5, Math.max(11.5, uiFontSize * 1.15))}px;"
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
        oncancel={() => { subView = 'main'; editingDdayId = null; }}
        onsave={handleSaveSheet}
        ondelete={handleDeleteFromSheet}
      />
    {:else if subView === 'archive'}
      <DdayArchiveView
        items={archivedItems}
        {accent}
        {dark}
        onback={() => (subView = 'main')}
        onrestore={handleRestore}
        ondelete={(id) => sendCommand('delete', { ddayId: id, deleteLinkedTodo: false })}
        onclearall={() => sendCommand('clear-archived')}
      />
    {:else}
      <!-- 드래그 가능한 상단 헤더 -->
      <header class="ctrl-head" use:draggable>
        <span class="ctrl-logo" aria-hidden="true">
          <Flag size={15} strokeWidth={2.3} />
        </span>
        <div class="ctrl-head-copy">
          <strong>D-Day 컨트롤</strong>
          <small>할 일 연동 · 상단 배너 · 바탕화면 위젯</small>
        </div>
        <button type="button" class="ctrl-close" aria-label="닫기" onclick={closeModal}>
          <X size={15} strokeWidth={2.3} />
        </button>
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
              onclick={() => { targetLabel = w.label; focusDdayId = null; contextMenu = null; }}
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
            onclick={() => { activeTab = 'list'; contextMenu = null; }}
          >
            <span>D-Day 목록</span>
            <span class="ctrl-tab-badge tnum">{activeItems.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'settings'}
            class="ctrl-tab"
            class:on={activeTab === 'settings'}
            onclick={() => { activeTab = 'settings'; contextMenu = null; }}
          >
            <span>설정 · 보관</span>
            <span class="ctrl-tab-badge tnum">{archivedItems.length}</span>
          </button>
        </div>
      </div>

      <div class="ctrl-scroll">
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
            <span class="ctrl-sec-title">진행 중 <strong class="tnum">{activeItems.length}</strong></span>
            <button
              type="button"
              class="ctrl-add-btn"
              onclick={() => { editingDdayId = null; subView = 'create'; }}
            >
              <Plus size={13} strokeWidth={2.6} />
              <span>새 D-Day</span>
            </button>
          </div>

          {#if activeItems.length === 0}
            <div class="ctrl-empty">
              <span class="ctrl-empty-icon"><Flag size={18} strokeWidth={2.2} /></span>
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
            <div class="ctrl-list" role="list" aria-label="진행 중인 D-Day 목록">
              {#each activeItems as item, idx (item.id)}
                <DdayRowCard
                  {item}
                  {todayKey}
                  {accent}
                  {dark}
                  forceCompact={compactCapsules}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < activeItems.length - 1}
                  highlighted={focusDdayId === item.id}
                  oncomplete={handleComplete}
                  ontogglechannel={handleToggleChannel}
                  onedit={(id) => { editingDdayId = id; subView = 'edit'; }}
                  onmove={handleMove}
                  oncontextopen={openRowContext}
                />
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
            onupdatesettings={handleUpdateSettings}
            onupdatewidgetprefs={handleUpdateWidgetPrefs}
            onopenarchive={() => (subView = 'archive')}
          />
        {/if}
      </div>

      <footer class="ctrl-foot">
        <button type="button" class="ctrl-widget-btn" onclick={launchWidget}>
          <LayoutGrid size={13} strokeWidth={2.2} />
          <span>위젯 띄우기</span>
        </button>
        <button type="button" class="ctrl-done-btn" onclick={closeModal}>완료</button>
      </footer>
    {/if}

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
        style="left: {contextMenu.x}px; top: {contextMenu.y}px; --surface: {ctxSurface}; --accent: {accent}; --ctx-width: {ctxWidth}px; font-size: {Math.max(9, uiFontSize)}pt;"
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
</div>

<style>
  .ctrl-host {
    width: 100%;
    height: 100dvh;
    padding: 4px;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: stretch;
  }
  .ctrl-host.is-preview {
    background: #ece7db;
    padding: 18px;
    align-items: center;
  }
  .ctrl-host :global(*) {
    box-sizing: border-box;
  }

  .ctrl-shell {
    position: relative;
    width: 372px;
    max-width: 100%;
    height: 100%;
    max-height: 620px;
    border-radius: 18px;
    background: #fdfaf3;
    color: #1e2430;
    border: 1px solid rgba(15, 23, 42, 0.1);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: var(--ctrl-font-size, 12px);
    user-select: none;
  }
  .ctrl-shell[data-scheme='dark'] {
    background: #1b1e26;
    color: #eef2f9;
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.45);
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .ctrl-head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 12px 12px 9px 14px;
    cursor: grab;
    flex-shrink: 0;
  }
  .ctrl-head:active {
    cursor: grabbing;
  }
  .ctrl-logo {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--dd-accent) 16%, #ffffff);
    color: var(--dd-accent);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-logo {
    background: color-mix(in srgb, var(--dd-accent) 26%, #242836);
    color: #ffffff;
  }

  .ctrl-head-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ctrl-head-copy strong {
    font-size: 13.5px;
    font-weight: 800;
    line-height: 1.25;
    white-space: nowrap;
  }
  .ctrl-head-copy small {
    font-size: 10px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-head-copy small {
    color: #94a3b8;
  }

  .ctrl-close {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #64748b;
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .ctrl-close:hover {
    background: rgba(15, 23, 42, 0.07);
    color: #1e2430;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-close {
    color: #94a3b8;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .ctrl-win-bar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 14px 8px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .ctrl-win-pill {
    height: 23px;
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: #ffffff;
    color: #64748b;
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
  }
  .ctrl-win-pill.on {
    border-color: var(--dd-accent);
    background: color-mix(in srgb, var(--dd-accent) 12%, #ffffff);
    color: var(--dd-accent);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-win-pill {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-win-pill.on {
    background: color-mix(in srgb, var(--dd-accent) 24%, #232733);
    color: #ffffff;
  }

  .ctrl-tabs-wrap {
    padding: 0 14px 9px;
    flex-shrink: 0;
  }
  .ctrl-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 3px;
    gap: 3px;
    border-radius: 11px;
    background: rgba(15, 23, 42, 0.055);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-tabs {
    background: #14171e;
  }
  .ctrl-tab {
    height: 30px;
    border: 0;
    border-radius: 8.5px;
    background: transparent;
    color: #64748b;
    font: inherit;
    font-size: 11.5px;
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
  .ctrl-tab.on {
    background: #ffffff;
    color: #1e2430;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.09);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-tab {
    color: #94a3b8;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-tab.on {
    background: #272c38;
    color: #f8fafc;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }
  .ctrl-tab-badge {
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.07);
    font-size: 10px;
    font-weight: 800;
    color: #475569;
  }
  .ctrl-tab.on .ctrl-tab-badge {
    background: color-mix(in srgb, var(--dd-accent) 16%, transparent);
    color: var(--dd-accent);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-tab-badge {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }

  .ctrl-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: thin;
  }

  .ctrl-banner-box {
    padding: 9px 10px;
    border-radius: 13px;
    background: #ffffff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-banner-box {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .ctrl-banner-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .ctrl-banner-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 800;
    color: #334155;
    white-space: nowrap;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-banner-label {
    color: #e2e8f0;
  }

  .ctrl-banner-modes {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    border-radius: 8px;
    background: #f1f5f9;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-banner-modes {
    background: #1a1d26;
  }
  .ctrl-banner-modes button {
    height: 21px;
    padding: 0 7px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #64748b;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .ctrl-banner-modes button.on {
    background: #ffffff;
    color: var(--dd-accent);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.09);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-banner-modes button {
    color: #94a3b8;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-banner-modes button.on {
    background: #2f3545;
    color: #ffffff;
  }

  .ctrl-banner-empty {
    margin: 0;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px dashed rgba(15, 23, 42, 0.12);
    font-size: 10.5px;
    color: #64748b;
    text-align: center;
    word-break: keep-all;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-banner-empty {
    border-color: rgba(255, 255, 255, 0.12);
    color: #94a3b8;
  }

  .ctrl-sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 2px 0;
  }
  .ctrl-sec-title {
    font-size: 11.5px;
    font-weight: 800;
    color: #475569;
  }
  .ctrl-sec-title strong {
    color: var(--dd-accent);
    margin-left: 2px;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-sec-title {
    color: #cbd5e1;
  }

  .ctrl-add-btn {
    height: 27px;
    padding: 0 10px 0 8px;
    border: 0;
    border-radius: 999px;
    background: var(--dd-accent);
    color: #ffffff;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 3.5px;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--dd-accent) 28%, transparent);
  }
  .ctrl-add-btn:hover {
    filter: brightness(0.95);
  }

  .ctrl-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .ctrl-empty {
    padding: 22px 14px;
    border-radius: 14px;
    border: 1.5px dashed rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-empty {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .ctrl-empty-icon {
    width: 36px;
    height: 36px;
    border-radius: 11px;
    background: color-mix(in srgb, var(--dd-accent) 13%, transparent);
    color: var(--dd-accent);
    display: grid;
    place-items: center;
  }
  .ctrl-empty strong {
    font-size: 12.5px;
    font-weight: 800;
  }
  .ctrl-empty small {
    font-size: 11px;
    color: #64748b;
    line-height: 1.45;
    word-break: keep-all;
  }
  .ctrl-empty-cta {
    margin-top: 4px;
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--dd-accent);
    color: #ffffff;
    font-size: 11.5px;
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
    padding: 10px 14px 12px;
    border-top: 1px solid rgba(15, 23, 42, 0.08);
    background: color-mix(in srgb, #ffffff 72%, #fdfaf3);
    flex-shrink: 0;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-foot {
    border-top-color: rgba(255, 255, 255, 0.08);
    background: #1f232c;
  }

  .ctrl-widget-btn {
    height: 33px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--dd-accent) 32%, rgba(15, 23, 42, 0.08));
    background: color-mix(in srgb, var(--dd-accent) 10%, #ffffff);
    color: var(--dd-accent);
    font: inherit;
    font-size: 11.5px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .ctrl-widget-btn:hover {
    background: color-mix(in srgb, var(--dd-accent) 18%, #ffffff);
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-widget-btn {
    background: color-mix(in srgb, var(--dd-accent) 20%, #232733);
    border-color: color-mix(in srgb, var(--dd-accent) 40%, transparent);
    color: #ffffff;
  }

  .ctrl-done-btn {
    height: 33px;
    padding: 0 18px;
    border: 0;
    border-radius: 10px;
    background: #1e2430;
    color: #ffffff;
    font: inherit;
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }
  .ctrl-done-btn:hover {
    opacity: 0.92;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-done-btn {
    background: var(--dd-accent);
    color: #ffffff;
  }

  .ctrl-toast {
    position: absolute;
    left: 50%;
    bottom: 58px;
    transform: translateX(-50%);
    max-width: calc(100% - 28px);
    padding: 7px 12px;
    border-radius: 999px;
    background: #1e2430;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
    z-index: 40;
    pointer-events: none;
  }
  .ctrl-shell[data-scheme='dark'] .ctrl-toast {
    background: #f8fafc;
    color: #0f172a;
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
