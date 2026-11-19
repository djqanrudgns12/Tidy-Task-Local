<script>
  import { LayoutGrid, Plus, Redo2, Undo2 } from 'lucide-svelte';
  import ContextRibbonHeader from './ContextRibbonHeader.svelte';
  import ContextSegmentRow from './ContextSegmentRow.svelte';
  import ContextTileGrid from './ContextTileGrid.svelte';
  import ContextUtilityDock from './ContextUtilityDock.svelte';

  /**
   * 패널 D-Day 배너 및 헤더 D-N 알약 전용 우클릭 메뉴 (확정 시안 1 · 포켓 리본 3단 독)
   * 할 일 우클릭 메뉴와 4단 골격(리본 → 4칸 Soft-Duotone 타일 → 중앙 카드 → 22px 유틸 독)을 1:1 통일합니다.
   *
   * @type {{
   *   meta: import('../../lib/windows/contextMenuLayout.js').buildDdayBannerMeta extends (...args: any[]) => infer R ? NonNullable<R> : any,
   *   canUndo?: boolean,
   *   canRedo?: boolean,
   *   onaction: (action: string) => void,
   *   onliveaction: (detail: Record<string, any>) => void,
   * }}
   */
  let {
    meta,
    canUndo = false,
    canRedo = false,
    onaction,
    onliveaction,
  } = $props();

  const isLinked = $derived(Boolean(meta?.linkedTodoId));
  const showBentoHint = $derived(meta?.bannerMode === 'bento' && (meta?.bannerCount ?? 0) < 2);
  const showHiddenChannelHint = $derived(meta?.showInBanner === false);

  const tiles = $derived([
    {
      id: 'dday-open-control',
      icon: /** @type {const} */ ('flag'),
      label: '컨트롤',
      tone: /** @type {const} */ ('accent'),
      active: true,
      tip: 'D-Day 컨트롤',
      title: 'D-Day 컨트롤 타워에서 전체 관리',
      onclick: () => onaction('dday-open-control'),
    },
    {
      id: 'dday-edit',
      icon: /** @type {const} */ ('pencil'),
      label: '편집',
      tone: /** @type {const} */ ('sky'),
      tip: '편집하기',
      title: '제목 · 날짜 · 아이콘 바로 편집',
      onclick: () => onaction('dday-edit'),
    },
    {
      id: 'dday-complete',
      icon: /** @type {const} */ ('checkCircle'),
      label: '완료',
      tone: /** @type {const} */ ('ok'),
      tip: '완료 처리',
      title: '완료 처리 (아카이브로 이동)',
      onclick: () => onaction('dday-complete'),
    },
    {
      id: 'dday-delete',
      icon: isLinked ? /** @type {const} */ ('pinOff') : /** @type {const} */ ('trash'),
      label: isLinked ? '해제' : '삭제',
      tone: /** @type {const} */ ('danger'),
      tip: isLinked ? '고정 해제' : '영구 삭제',
      title: isLinked ? 'D-Day 고정 해제 (할 일 유지)' : 'D-Day 영구 삭제',
      onclick: () => onaction('dday-delete'),
    },
  ]);

  const channelOptions = $derived([
    {
      id: 'showInTodo',
      label: '할 일',
      active: Boolean(meta?.showInTodo),
      title: meta?.showInTodo ? '할 일 목록에서 숨기기' : '할 일 목록에 표시',
      onclick: () => onliveaction({ kind: 'toggle', action: 'dday-channel', value: { channel: 'showInTodo' } }),
    },
    {
      id: 'showInBanner',
      label: '배너',
      active: Boolean(meta?.showInBanner),
      title: meta?.showInBanner ? '메모 상단 배너에서 숨기기' : '메모 상단 배너에 표시',
      onclick: () => onliveaction({ kind: 'toggle', action: 'dday-channel', value: { channel: 'showInBanner' } }),
    },
    {
      id: 'showInWidget',
      label: '위젯',
      active: Boolean(meta?.showInWidget),
      title: meta?.showInWidget ? '바탕화면 위젯에서 숨기기' : '바탕화면 위젯에 표시',
      onclick: () => onliveaction({ kind: 'toggle', action: 'dday-channel', value: { channel: 'showInWidget' } }),
    },
  ]);

  const bannerModeOptions = $derived([
    {
      id: 'single',
      label: '대표 1개',
      active: (meta?.bannerMode || 'single') === 'single',
      title: '대표 D-Day 1줄 배너로 표시',
      onclick: () => onliveaction({ kind: 'toggle', action: 'dday-banner-mode', value: 'single' }),
    },
    {
      id: 'bento',
      label: '2열',
      active: meta?.bannerMode === 'bento',
      title: (meta?.bannerCount ?? 0) < 2 ? '2열 그리드 (배너 항목 2건 이상일 때 적용)' : '2열 그리드로 표시',
      onclick: () => onliveaction({ kind: 'toggle', action: 'dday-banner-mode', value: 'bento' }),
    },
    {
      id: 'hidden',
      label: '숨김',
      active: meta?.bannerMode === 'hidden',
      title: '메모 상단 배너 숨기기 (헤더 D-Day 알약에서 다시 표시 가능)',
      onclick: () => onliveaction({ kind: 'toggle', action: 'dday-banner-mode', value: 'hidden' }),
    },
  ]);
</script>

<!-- ① 파스텔 미니 리본 헤더: D-N 솔리드 칩 + 제목 + 날짜 -->
<ContextRibbonHeader
  leftChip={meta?.counterLabel || 'D-Day'}
  leftSolid={true}
  title={meta?.title || ''}
  emptyTitle="D-Day"
  rightMeta={meta?.shortDate || ''}
/>

<!-- ② 4칸 Soft-Duotone 퀵 액션 타일 -->
<ContextTileGrid {tiles} ariaLabel="D-Day 빠른 동작" />

<!-- ③ D-Day 전용 컴팩트 컨트롤 카드 (메뉴 유지 연속 조작) -->
<div class="dday-ctrl-card" role="group" aria-label="표시 및 배너 설정">
  <ContextSegmentRow
    label="표시"
    mode="multi"
    options={channelOptions}
    ariaLabel="D-Day 표시 위치"
  />
  <ContextSegmentRow
    label="배너"
    mode="radio"
    options={bannerModeOptions}
    ariaLabel="배너 보기 형식"
  />
  {#if showHiddenChannelHint}
    <p class="dday-hint" role="status">이 항목이 배너에서 숨겨졌어요 · 다시 누르면 복구</p>
  {:else if showBentoHint}
    <p class="dday-hint" role="status">배너 항목 2건 이상일 때 2열로 표시돼요</p>
  {/if}
</div>

<!-- ④ 하단 모노라인 아이콘 유틸 독 -->
<ContextUtilityDock ariaLabel="D-Day 추가 및 기록">
  {#snippet left()}
    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip tip-left"
      data-tip="새 D-Day"
      title="새 D-Day 추가"
      aria-label="새 D-Day 추가"
      onclick={() => onaction('dday-create')}
    ><Plus size={12.5} strokeWidth={2.05} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip"
      data-tip="위젯 창"
      title="바탕화면 D-Day 위젯 띄우기"
      aria-label="바탕화면 D-Day 위젯 띄우기"
      onclick={() => onaction('open-dday-widget')}
    ><LayoutGrid size={12} strokeWidth={1.9} /></button>
  {/snippet}

  {#snippet right()}
    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip"
      disabled={!canUndo}
      data-tip="실행 취소"
      title="실행 취소 (Ctrl+Z)"
      aria-label="실행 취소"
      onclick={() => onliveaction({ kind: 'history', action: 'undo' })}
    ><Undo2 size={12.5} strokeWidth={1.95} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip tip-right"
      disabled={!canRedo}
      data-tip="다시 실행"
      title="다시 실행 (Ctrl+Y)"
      aria-label="다시 실행"
      onclick={() => onliveaction({ kind: 'history', action: 'redo' })}
    ><Redo2 size={12.5} strokeWidth={1.95} /></button>
  {/snippet}
</ContextUtilityDock>

<style>
  .dday-ctrl-card {
    margin-top: 5px;
    padding: 5px;
    border-radius: var(--ctx-radius-card, 8px);
    background: var(--ctx-field);
    border: 1px solid var(--ctx-line);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dday-hint {
    margin: 0;
    padding-top: 2px;
    font-size: 9px;
    font-weight: 600;
    line-height: 1.25;
    color: var(--ctx-muted);
    text-align: center;
    letter-spacing: -0.02em;
  }
</style>
