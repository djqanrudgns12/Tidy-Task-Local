<script>
  import { isTauri } from '@tauri-apps/api/core';
  import { Archive, ArrowLeft, RotateCcw, Trash2 } from 'lucide-svelte';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { formatDotDate, resolveToneColor } from '../../lib/dday/ddayModel.js';
  import DdayIcon from './DdayIcon.svelte';

  /**
   * @type {{
   *   items: import('../../lib/dday/ddayModel.js').DdayItem[],
   *   accent?: string,
   *   dark?: boolean,
   *   wideGrid?: boolean,
   *   fullDate?: boolean,
   *   veryNarrow?: boolean,
   *   onheaderdblclick?: (() => void) | undefined,
   *   onback: () => void,
   *   onrestore: (id: string) => void,
   *   ondelete: (id: string) => void,
   *   onclearall: () => void,
   * }}
   */
  let {
    items,
    accent = '#d97706',
    dark = false,
    wideGrid = false,
    fullDate = false,
    veryNarrow = false,
    onheaderdblclick = undefined,
    onback,
    onrestore,
    ondelete,
    onclearall,
  } = $props();

  /** @param {HTMLElement} node */
  const draggable = (node) =>
    isTauri()
      ? dragRegion(node, { onDoubleClick: onheaderdblclick ?? null })
      : { update() {}, destroy() {} };

  /** @type {'all' | 'todo' | 'standalone'} */
  let filter = $state('all');
  let confirmClear = $state(false);

  /** @param {string | null | undefined} dateKey */
  function shortDotDate(dateKey) {
    const full = formatDotDate(dateKey);
    if (fullDate && !wideGrid) return full;
    return full ? full.split(' ')[0] : '';
  }

  const filtered = $derived.by(() => {
    const list = items || [];
    if (filter === 'todo') return list.filter((d) => d.linkedTodoId !== null);
    if (filter === 'standalone') return list.filter((d) => d.linkedTodoId === null);
    return list;
  });

  const todoCount = $derived((items || []).filter((d) => d.linkedTodoId !== null).length);
  const standaloneCount = $derived((items || []).filter((d) => d.linkedTodoId === null).length);

  function handleConfirmClear() {
    confirmClear = false;
    onclearall();
  }
</script>

<div class="ar-view" class:wide-grid={wideGrid} class:very-narrow={veryNarrow} data-scheme={dark ? 'dark' : 'light'} style="--dd-accent: {accent};">
  <div class="ar-top" use:draggable>
    <button type="button" class="ar-back" data-no-drag aria-label="설정으로 돌아가기" onclick={onback}>
      <ArrowLeft size={14} strokeWidth={2.3} />
      {#if !veryNarrow}
        <span>설정으로</span>
      {/if}
    </button>
    <strong class="ar-heading tnum">완료 아카이브 ({items.length})</strong>
    <button
      type="button"
      class="ar-clear-btn"
      data-no-drag
      disabled={items.length === 0}
      onclick={() => (confirmClear = true)}
    >
      비우기
    </button>
  </div>

  <div class="ar-filters" role="tablist" aria-label="아카이브 필터">
    <button
      type="button"
      role="tab"
      aria-selected={filter === 'all'}
      class="ar-chip"
      class:on={filter === 'all'}
      onclick={() => (filter = 'all')}
    >
      전체 <span class="tnum">{items.length}</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={filter === 'todo'}
      class="ar-chip"
      class:on={filter === 'todo'}
      onclick={() => (filter = 'todo')}
    >
      To-do 연동 <span class="tnum">{todoCount}</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={filter === 'standalone'}
      class="ar-chip"
      class:on={filter === 'standalone'}
      onclick={() => (filter = 'standalone')}
    >
      D-Day 전용 <span class="tnum">{standaloneCount}</span>
    </button>
  </div>

  <div class="ar-scroll">
    {#if filtered.length === 0}
      <div class="ar-empty">
        <span class="ar-empty-icon">
          <Archive size={20} strokeWidth={2} />
        </span>
        <strong>
          {items.length === 0 ? '완료된 D-Day가 아직 없어요' : '해당 조건의 완료 항목이 없어요'}
        </strong>
        <small>완료 처리한 D-Day가 이곳에 깔끔하게 모여 언제든 복원할 수 있습니다.</small>
      </div>
    {:else}
      <div class="ar-list" role="list" aria-label="완료된 D-Day 목록">
        {#each filtered as item (item.id)}
          {@const toneColor = resolveToneColor(item.tone, accent)}
          <div class="ar-card" style="--dd-tone: {toneColor};" role="listitem">
            <DdayIcon icon={item.icon} tone={item.tone} {accent} size="var(--dd-icon-sz, 26px)" {dark} />
            <div class="ar-copy">
              <strong class="ar-title" title={item.title}>{item.title}</strong>
              <div class="ar-sub">
                <span class="ar-origin" class:linked={item.linkedTodoId !== null}>
                  {item.linkedTodoId ? 'To-do 연동' : 'D-Day 전용'}
                </span>
                <span class="ar-dates tnum" title={`목표 ${formatDotDate(item.date)}${item.completedAt ? ` · 완료 ${formatDotDate(item.completedAt)}` : ''}`}>
                  목표 {shortDotDate(item.date)}{#if item.completedAt} · 완료 {shortDotDate(item.completedAt)}{/if}
                </span>
              </div>
            </div>
            <div class="ar-actions">
              <button
                type="button"
                class="ar-restore"
                class:icon-only={veryNarrow}
                aria-label={`${item.title} 복원`}
                title="활성 D-Day로 복원"
                onclick={() => onrestore(item.id)}
              >
                <RotateCcw size={11} strokeWidth={2.4} />
                {#if !veryNarrow}
                  <span>복원</span>
                {/if}
              </button>
              <button
                type="button"
                class="ar-del"
                aria-label={`${item.title} 영구 삭제`}
                title="영구 삭제"
                onclick={() => ondelete(item.id)}
              >
                <Trash2 size={12} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if confirmClear}
    <div class="ar-dialog-backdrop" role="presentation">
      <div class="ar-dialog" role="alertdialog" aria-modal="true" aria-label="완료 아카이브 비우기 확인">
        <strong>완료 아카이브 비우기</strong>
        <p>보관된 완료 D-Day <span class="tnum">{items.length}건</span>을 모두 영구 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.</p>
        <div class="ar-dialog-actions">
          <button type="button" class="ar-dlg-cancel" onclick={() => (confirmClear = false)}>취소</button>
          <button type="button" class="ar-dlg-danger" onclick={handleConfirmClear}>모두 비우기</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .ar-view {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .ar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px var(--dd-pad-x, 14px) 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.07);
    cursor: grab;
    flex-shrink: 0;
  }
  .ar-top:active {
    cursor: grabbing;
  }
  .ar-view[data-scheme='dark'] .ar-top {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .ar-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 8px 0 6px;
    border: 0;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.05);
    color: #334155;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .ar-back:hover {
    background: rgba(15, 23, 42, 0.09);
  }
  .ar-view[data-scheme='dark'] .ar-back {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }

  .ar-heading {
    font-size: var(--dd-fs-head, 13px);
    font-weight: 800;
    color: #1e2430;
    white-space: nowrap;
  }
  .ar-view[data-scheme='dark'] .ar-heading {
    color: #f1f5f9;
  }

  .ar-clear-btn {
    height: 26px;
    padding: 0 9px;
    border-radius: 8px;
    border: 1px solid rgba(225, 29, 72, 0.25);
    background: rgba(225, 29, 72, 0.07);
    color: #be123c;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .ar-clear-btn:hover:not(:disabled) {
    background: #e11d48;
    color: #ffffff;
    border-color: transparent;
  }
  .ar-clear-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .ar-view[data-scheme='dark'] .ar-clear-btn {
    color: #fda4af;
    border-color: rgba(251, 113, 133, 0.3);
    background: rgba(244, 63, 94, 0.14);
  }

  .ar-filters {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px var(--dd-pad-x, 14px) 4px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .ar-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(15, 23, 42, 0.09);
    background: #ffffff;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .ar-chip.on {
    border-color: var(--dd-accent);
    background: color-mix(in srgb, var(--dd-accent) 12%, #ffffff);
    color: var(--dd-accent);
  }
  .ar-view[data-scheme='dark'] .ar-chip {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.09);
    color: #94a3b8;
  }
  .ar-view[data-scheme='dark'] .ar-chip.on {
    background: color-mix(in srgb, var(--dd-accent) 22%, #232733);
    border-color: var(--dd-accent);
    color: #ffffff;
  }

  .ar-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px var(--dd-pad-x, 14px) 14px;
    scrollbar-width: thin;
  }

  .ar-empty {
    margin-top: 24px;
    padding: 24px 16px;
    border-radius: 14px;
    border: 1.5px dashed rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
  }
  .ar-view[data-scheme='dark'] .ar-empty {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .ar-empty-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--dd-accent) 12%, transparent);
    color: var(--dd-accent);
    display: grid;
    place-items: center;
    margin-bottom: 2px;
  }
  .ar-empty strong {
    font-size: 12.5px;
    font-weight: 800;
    color: #334155;
  }
  .ar-view[data-scheme='dark'] .ar-empty strong {
    color: #e2e8f0;
  }
  .ar-empty small {
    font-size: 11px;
    color: #64748b;
    line-height: 1.45;
    word-break: keep-all;
  }

  .ar-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .ar-view.wide-grid .ar-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .ar-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    min-width: 0;
  }
  .ar-view[data-scheme='dark'] .ar-card {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .ar-view.wide-grid .ar-card {
    gap: 7px;
    padding: 9px;
  }
  .ar-view.wide-grid .ar-sub {
    gap: 4px;
    font-size: calc(var(--dd-fs-sub, 10px) - 0.5px);
  }
  .ar-view.wide-grid .ar-restore {
    padding: 0 7px;
  }

  .ar-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .ar-title {
    font-size: var(--dd-fs-title, 12px);
    font-weight: 700;
    color: #1e2430;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ar-view[data-scheme='dark'] .ar-title {
    color: #f1f5f9;
  }

  .ar-sub {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    font-size: var(--dd-fs-sub, 10px);
    color: #64748b;
    white-space: nowrap;
  }
  .ar-dates {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ar-view[data-scheme='dark'] .ar-sub {
    color: #94a3b8;
  }
  .ar-origin {
    flex-shrink: 0;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(15, 23, 42, 0.055);
    color: #475569;
    font-weight: 700;
    font-size: 9.5px;
  }
  .ar-origin.linked {
    background: color-mix(in srgb, var(--dd-accent) 12%, transparent);
    color: var(--dd-accent);
  }
  .ar-view[data-scheme='dark'] .ar-origin {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }

  .ar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .ar-restore {
    height: 26px;
    padding: 0 8px;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--dd-accent) 28%, transparent);
    background: color-mix(in srgb, var(--dd-accent) 10%, #ffffff);
    color: var(--dd-accent);
    font-size: var(--dd-fs-sub, 10.5px);
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .ar-restore.icon-only {
    width: 26px;
    padding: 0;
    justify-content: center;
  }
  .ar-restore:hover {
    background: var(--dd-accent);
    color: #ffffff;
  }
  .ar-view[data-scheme='dark'] .ar-restore {
    background: color-mix(in srgb, var(--dd-accent) 22%, #232733);
    color: #ffffff;
  }

  .ar-del {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 0;
    background: rgba(15, 23, 42, 0.045);
    color: #64748b;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .ar-del:hover {
    background: rgba(225, 29, 72, 0.12);
    color: #e11d48;
  }
  .ar-view[data-scheme='dark'] .ar-del {
    background: rgba(255, 255, 255, 0.07);
    color: #94a3b8;
  }

  .ar-dialog-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.42);
    backdrop-filter: blur(2px);
    display: grid;
    place-items: center;
    padding: 18px;
    z-index: 30;
  }
  .ar-dialog {
    width: 100%;
    max-width: 300px;
    padding: 16px;
    border-radius: 16px;
    background: #ffffff;
    border: 1px solid rgba(15, 23, 42, 0.1);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ar-view[data-scheme='dark'] .ar-dialog {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.12);
  }
  .ar-dialog strong {
    font-size: 13px;
    font-weight: 800;
    color: #1e2430;
  }
  .ar-view[data-scheme='dark'] .ar-dialog strong {
    color: #f8fafc;
  }
  .ar-dialog p {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: #475569;
    word-break: keep-all;
  }
  .ar-view[data-scheme='dark'] .ar-dialog p {
    color: #cbd5e1;
  }
  .ar-dialog-actions {
    display: flex;
    gap: 7px;
    margin-top: 4px;
  }
  .ar-dialog-actions button {
    flex: 1;
    height: 32px;
    border: 0;
    border-radius: 9px;
    font: inherit;
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }
  .ar-dlg-cancel {
    background: rgba(15, 23, 42, 0.07);
    color: #475569;
  }
  .ar-view[data-scheme='dark'] .ar-dlg-cancel {
    background: rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
  }
  .ar-dlg-danger {
    background: #e11d48;
    color: #ffffff;
  }
</style>
