<script>
  import { NotebookPen, Omega, Redo2, Undo2 } from 'lucide-svelte';
  import { BUILTIN_FONTS } from '../../lib/builtinFonts.js';
  import { STABLE_MAX_PT } from '../../lib/fontSize.js';
  import ContextFormatBar from './ContextFormatBar.svelte';
  import ContextRibbonHeader from './ContextRibbonHeader.svelte';
  import ContextTileGrid from './ContextTileGrid.svelte';
  import ContextUtilityDock from './ContextUtilityDock.svelte';

  /**
   * 중요한 일 메모(NoteEditor) 및 일반 텍스트 입력칸 우클릭 메뉴 (Tier S · 220px)
   *
   * @type {{
   *   config: Record<string, any>,
   *   formatBarRef?: any,
   *   onaction: (action: string) => void,
   *   onliveaction: (detail: Record<string, any>) => void,
   * }}
   */
  let {
    config,
    formatBarRef = $bindable(null),
    onaction,
    onliveaction,
  } = $props();

  const isRich = $derived(config.isRichTextEditor !== false);
  const canFormat = $derived(Boolean(config.hasSelection && isRich));

  const tiles = $derived([
    {
      id: 'cut',
      icon: /** @type {const} */ ('scissors'),
      label: '자르기',
      tone: /** @type {const} */ ('neutral'),
      disabled: !config.hasSelection,
      title: '잘라내기 (Ctrl+X)',
      onclick: () => onaction('cut'),
    },
    {
      id: 'copy',
      icon: /** @type {const} */ ('copy'),
      label: '복사',
      tone: /** @type {const} */ ('accent'),
      disabled: !config.hasSelection,
      title: '복사 (Ctrl+C)',
      onclick: () => onaction('copy'),
    },
    {
      id: 'paste',
      icon: /** @type {const} */ ('clipboardPaste'),
      label: '붙이기',
      tone: /** @type {const} */ ('ok'),
      disabled: !config.hasEditor,
      title: '붙여넣기 (Ctrl+V)',
      onclick: () => onaction('paste'),
    },
    {
      id: 'select-all',
      icon: /** @type {const} */ ('textSelect'),
      label: '전체',
      tone: /** @type {const} */ ('sky'),
      disabled: !config.hasEditor,
      title: '모두 선택 (Ctrl+A)',
      onclick: () => onaction('select-all'),
    },
  ]);
</script>

<!-- ① 파스텔 미니 리본 헤더 -->
<ContextRibbonHeader
  title={isRich ? '중요한 일 메모' : '텍스트 입력'}
  rightChip={config.hasSelection ? '선택됨' : ''}
>
  {#snippet left()}
    <NotebookPen size={12} strokeWidth={2.1} />
  {/snippet}
</ContextRibbonHeader>

<!-- ② 4칸 Soft-Duotone 편집 타일 -->
<ContextTileGrid {tiles} ariaLabel="텍스트 편집" />

<!-- ③ 리치텍스트 드래그 시 공용 서식 카드 (일반 <input>에서는 숨김) -->
{#if canFormat}
  <ContextFormatBar
    bind:this={formatBarRef}
    format={config.selectionFormat}
    fonts={config.fonts || BUILTIN_FONTS}
    themeColor={config.themeColor || 'amber'}
    isDarkMode={Boolean(config.isDarkMode)}
    maxFontPt={config.maxFontPt ?? STABLE_MAX_PT}
    onformat={(detail) => onliveaction({ kind: 'format', ...detail })}
  />
{/if}

<!-- ④ 하단 유틸 독 -->
<ContextUtilityDock ariaLabel="특수기호 및 기록">
  {#snippet left()}
    <button
      type="button"
      role="menuitem"
      class="dock-pill"
      disabled={!isRich}
      title="특수기호 입력"
      onclick={() => onaction('symbols')}
    ><Omega size={12} strokeWidth={1.9} /><span>특수기호</span></button>
  {/snippet}

  {#snippet right()}
    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip"
      disabled={config.canUndo === false}
      data-tip="실행 취소"
      title="실행 취소 (Ctrl+Z)"
      aria-label="실행 취소"
      onclick={() => onliveaction({ kind: 'history', action: 'undo' })}
    ><Undo2 size={12.5} strokeWidth={1.95} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn ctx-tip tip-right"
      disabled={config.canRedo === false}
      data-tip="다시 실행"
      title="다시 실행 (Ctrl+Y)"
      aria-label="다시 실행"
      onclick={() => onliveaction({ kind: 'history', action: 'redo' })}
    ><Redo2 size={12.5} strokeWidth={1.95} /></button>
  {/snippet}
</ContextUtilityDock>
