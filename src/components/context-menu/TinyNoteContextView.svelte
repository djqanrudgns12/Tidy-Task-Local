<script>
  import {
    ClipboardPaste,
    Copy,
    Plus,
    Redo2,
    Scissors,
    StickyNote,
    TextSelect,
    Undo2,
  } from 'lucide-svelte';
  import { BUILTIN_FONTS } from '../../lib/builtinFonts.js';
  import ContextFormatBar from './ContextFormatBar.svelte';
  import ContextRibbonHeader from './ContextRibbonHeader.svelte';
  import ContextTileGrid from './ContextTileGrid.svelte';
  import ContextUtilityDock from './ContextUtilityDock.svelte';

  /**
   * Tiny Note (StickerWindow) 우클릭 메뉴 (Tier S · 220px)
   * 항상 위 · 테마 순환은 메뉴를 닫지 않고 실시간 반영해 스티커 메모와 메뉴가 함께 반응합니다.
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

  const canFormat = $derived(Boolean(config.hasSelection && config.isRichTextEditor !== false));

  const tiles = $derived([
    {
      id: 'tiny-pin',
      icon: /** @type {const} */ ('pin'),
      label: '항상 위',
      tone: config.isPinned ? /** @type {const} */ ('accent') : /** @type {const} */ ('neutral'),
      active: Boolean(config.isPinned),
      role: /** @type {const} */ ('menuitemcheckbox'),
      checked: Boolean(config.isPinned),
      tip: config.isPinned ? '항상 위 해제' : '항상 위 고정',
      title: config.isPinned ? '항상 위에 표시 끄기' : '항상 위에 표시 켜기',
      onclick: () => onliveaction({ kind: 'toggle', action: 'tiny-pin' }),
    },
    {
      id: 'tiny-theme',
      icon: /** @type {const} */ ('palette'),
      label: '테마',
      tone: /** @type {const} */ ('warn'),
      tip: '다음 테마',
      title: '다음 테마로 바꾸기 (연속 클릭 가능)',
      onclick: () => onliveaction({ kind: 'toggle', action: 'tiny-theme' }),
    },
    {
      id: 'tiny-rollup',
      icon: config.isRolledUp ? /** @type {const} */ ('chevDown') : /** @type {const} */ ('chevUp'),
      label: config.isRolledUp ? '펼치기' : '접기',
      tone: /** @type {const} */ ('sky'),
      disabled: Boolean(config.isFullscreen),
      tip: config.isFullscreen ? '전체화면 불가' : (config.isRolledUp ? '노트 펼치기' : '노트 접기'),
      title: config.isFullscreen ? '전체화면에서는 접을 수 없어요' : (config.isRolledUp ? '펼치기' : '접기'),
      onclick: () => onaction('tiny-rollup'),
    },
    {
      id: 'tiny-archive',
      icon: /** @type {const} */ ('archive'),
      label: '보관',
      tone: /** @type {const} */ ('ok'),
      tip: '보관함 보관',
      title: '보관함에 보관',
      onclick: () => onaction('tiny-archive'),
    },
  ]);
</script>

<!-- ① 파스텔 미니 리본 헤더 -->
<ContextRibbonHeader
  title="Tiny Note"
  rightChip={config.isPinned ? '항상 위' : ''}
>
  {#snippet left()}
    <StickyNote size={12} strokeWidth={2.1} />
  {/snippet}
</ContextRibbonHeader>

<!-- ② 4칸 Soft-Duotone 스티커 제어 타일 -->
<ContextTileGrid {tiles} ariaLabel="Tiny Note 빠른 동작" />

<!-- ③ 드래그 선택 시 공용 서식 카드 (Tiny Note는 크기 상한 무제한 정책 유지) -->
{#if canFormat}
  <ContextFormatBar
    bind:this={formatBarRef}
    format={config.selectionFormat}
    fonts={config.fonts || BUILTIN_FONTS}
    maxFontPt={config.maxFontPt ?? Infinity}
    onformat={(detail) => onliveaction({ kind: 'format', ...detail })}
  />
{/if}

<!-- ④ 하단 컴팩트 유틸 독 (좌: 클립보드·새 Tiny / 우: 실행취소·다시실행) -->
<ContextUtilityDock ariaLabel="편집 및 기록">
  {#snippet left()}
    <button
      type="button"
      role="menuitem"
      class="dock-btn compact ctx-tip tip-left"
      disabled={!config.hasSelection}
      data-tip="잘라내기"
      title="잘라내기"
      aria-label="잘라내기"
      onclick={() => onaction('cut')}
    ><Scissors size={12} strokeWidth={1.85} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn compact ctx-tip"
      disabled={!config.hasSelection}
      data-tip="복사"
      title="복사"
      aria-label="복사"
      onclick={() => onaction('copy')}
    ><Copy size={12} strokeWidth={1.85} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn compact ctx-tip"
      disabled={!config.hasEditor}
      data-tip="붙여넣기"
      title="붙여넣기"
      aria-label="붙여넣기"
      onclick={() => onaction('paste')}
    ><ClipboardPaste size={12} strokeWidth={1.85} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn compact ctx-tip"
      disabled={!config.hasEditor}
      data-tip="모두 선택"
      title="모두 선택"
      aria-label="모두 선택"
      onclick={() => onaction('select-all')}
    ><TextSelect size={12} strokeWidth={1.85} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn compact ctx-tip"
      data-tip="새 Tiny"
      title="새 Tiny Note 열기"
      aria-label="새 Tiny Note 열기"
      onclick={() => onaction('spawn-tiny')}
    ><Plus size={12.5} strokeWidth={2.05} /></button>
  {/snippet}

  {#snippet right()}
    <button
      type="button"
      role="menuitem"
      class="dock-btn compact ctx-tip"
      disabled={config.canUndo === false}
      data-tip="실행 취소"
      title="실행 취소 (Ctrl+Z)"
      aria-label="실행 취소"
      onclick={() => onliveaction({ kind: 'history', action: 'undo' })}
    ><Undo2 size={12} strokeWidth={1.95} /></button>

    <button
      type="button"
      role="menuitem"
      class="dock-btn compact ctx-tip tip-right"
      disabled={config.canRedo === false}
      data-tip="다시 실행"
      title="다시 실행 (Ctrl+Y)"
      aria-label="다시 실행"
      onclick={() => onliveaction({ kind: 'history', action: 'redo' })}
    ><Redo2 size={12} strokeWidth={1.95} /></button>
  {/snippet}
</ContextUtilityDock>
