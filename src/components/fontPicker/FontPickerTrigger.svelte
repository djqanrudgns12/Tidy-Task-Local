<script>
  // ═══════════════════════════════════════════════════════════════════
  // [공용 글꼴 선택 트리거 버튼]
  //   · Tauri 네이티브 환경: 독립 비이동 밀착 팝업 창(font-picker)을 엽니다.
  //   · 브라우저 미리보기(!isTauri): body 포탈로 동일한 FontPickerPanel(H3+D1)을 열어
  //     Playwright 시각 검수와 브라우저 프리뷰가 실기와 1:1 일치하게 합니다.
  // ═══════════════════════════════════════════════════════════════════
  import { onDestroy, onMount, tick } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { ChevronDown } from 'lucide-svelte';
  import { compactFontLabel, resolveFontFamilyStack } from '../../lib/fonts/fontCatalog.js';
  import { fontPicker } from '../../lib/fonts/fontPickerClient.svelte.js';
  import { fontPickerThemeToStyle, resolveFontPickerTokens } from '../../lib/fonts/fontPickerTheme.js';
  import {
    ANCHOR_GAP,
    MIN_SNAP_HEIGHT,
    STANDARD_HEIGHT,
    placeFontPicker,
    resolvePickerWidth,
  } from '../../lib/fonts/fontPickerProtocol.js';
  import FontPickerPanel from './FontPickerPanel.svelte';

  /**
   * @typedef {import('../../lib/fonts/fontPickerProtocol.js').ExtraFontOption} ExtraFontOption
   */

  /**
   * @type {{
   *   pickerKey: string,
   *   value?: string,
   *   variant?: 'toolbar' | 'toolbar-compact' | 'field',
   *   align?: 'start' | 'end',
   *   themeSource?: 'tidy' | 'toolkit',
   *   themeId?: string,
   *   isDarkMode?: boolean,
   *   customFonts?: Array<{ name: string, path: string }>,
   *   extraOptions?: ExtraFontOption[],
   *   disabled?: boolean,
   *   preserveEditorSelection?: boolean,
   *   ariaLabel?: string,
   *   triggerClass?: string,
   *   triggerStyle?: string,
   *   onbeforeopen?: () => void,
   *   onselect?: (value: string) => void,
   *   focusAfter?: () => (HTMLElement | null | undefined),
   * }}
   */
  let {
    pickerKey,
    value = '',
    variant = 'toolbar',
    align = 'start',
    themeSource = 'tidy',
    themeId = 'amber',
    isDarkMode = false,
    customFonts = [],
    extraOptions = [],
    disabled = false,
    preserveEditorSelection = false,
    ariaLabel = '글꼴',
    triggerClass = '',
    triggerStyle = '',
    onbeforeopen = undefined,
    onselect = undefined,
    focusAfter = undefined,
  } = $props();

  const native = isTauri();
  const listboxId = $derived(`fp-listbox-${pickerKey}`);
  /** @type {HTMLButtonElement | null} */ let buttonEl = $state(null);
  let toggleIntent = false;

  // 브라우저(!isTauri) 폴백 포탈 상태
  let portalOpen = $state(false);
  let portalOpenedAt = 0;
  let portalRect = $state({ x: 8, y: 40, width: 252, height: 332, side: /** @type {'below' | 'above' | 'right' | 'left' | 'overlay'} */ ('below') });
  /** @type {HTMLDivElement | null} */ let portalWrapEl = $state(null);
  /** @type {{ focusAndReveal: (viaKeyboard?: boolean) => Promise<void>, focusSelectedOrFirst: () => void } | null} */ let portalPanelRef = $state(null);

  const isOpen = $derived(native ? fontPicker.openKey === pickerKey : portalOpen);

  const extraMatch = $derived(extraOptions.find((o) => o.value === value) || null);
  const fullLabel = $derived(extraMatch ? extraMatch.label : (value || '글꼴'));
  const displayLabel = $derived(
    extraMatch
      ? extraMatch.label
      : compactFontLabel(value, {
          compact: variant === 'toolbar',
          ultraCompact: variant === 'toolbar-compact',
        }),
  );
  const previewStack = $derived(
    extraMatch ? 'inherit' : resolveFontFamilyStack(value, customFonts),
  );
  const portalThemeStyle = $derived(
    native ? '' : fontPickerThemeToStyle(resolveFontPickerTokens({ source: themeSource, themeId, isDarkMode })),
  );

  /** @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.parentNode?.removeChild(node); } };
  }

  /** @param {PointerEvent} e */
  function handlePointerDown(e) {
    if (disabled || e.button !== 0) return;
    if (preserveEditorSelection) {
      // contenteditable 선택 영역을 버튼 클릭/포커스 전환 전에 선행 저장합니다.
      onbeforeopen?.();
    }
    toggleIntent = native ? fontPicker.isToggleTarget(pickerKey) : portalOpen;
  }

  /** @param {MouseEvent} e */
  function handleMouseDown(e) {
    if (disabled || e.button !== 0) return;
    if (preserveEditorSelection) {
      // Chromium/WebView2에서는 mousedown.preventDefault()가 버튼 포커스 탈취와 선택 해제를 확실히 막습니다.
      e.preventDefault();
    }
  }

  /** @param {MouseEvent} e */
  async function handleClick(e) {
    if (disabled) return;
    const intent = toggleIntent;
    toggleIntent = false;
    const viaKeyboard = e.detail === 0;

    if (intent && !viaKeyboard) {
      if (native) {
        if (fontPicker.openKey === pickerKey) fontPicker.close('toggle');
      } else {
        closePortal(false);
      }
      return;
    }

    if (!preserveEditorSelection) onbeforeopen?.();

    if (native) {
      if (!buttonEl) return;
      void fontPicker.open({
        key: pickerKey,
        anchor: buttonEl,
        value,
        align,
        viaKeyboard,
        theme: { source: themeSource, themeId, isDarkMode },
        customFonts,
        extraOptions,
        preserveEditorSelection,
        onSelect: (next) => onselect?.(next),
        focusAfter: () => focusAfter?.() || buttonEl,
      });
    } else {
      await openPortal(viaKeyboard);
    }
  }

  /** @param {KeyboardEvent} e */
  function handleTriggerKeydown(e) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        toggleIntent = false;
        void handleClick(new MouseEvent('click', { detail: 0 }));
      }
    }
  }

  /** @param {boolean} viaKeyboard */
  async function openPortal(viaKeyboard) {
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    const viewport = {
      name: 'browser',
      scale: 1,
      bounds: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      work: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    };
    const placed = placeFontPicker({
      anchor: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      width: resolvePickerWidth(rect.width),
      idealHeight: STANDARD_HEIGHT,
      minSnapHeight: Math.min(MIN_SNAP_HEIGHT, Math.max(120, window.innerHeight - 16)),
      align,
      gap: ANCHOR_GAP,
      monitors: [viewport],
      fallbackScale: 1,
    });
    portalRect = {
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
      side: placed.side,
    };
    portalOpenedAt = performance.now();
    portalOpen = true;
    await tick();
    await portalPanelRef?.focusAndReveal(viaKeyboard);
  }

  /** @param {boolean} [restoreFocus] */
  function closePortal(restoreFocus = false) {
    if (!portalOpen) return;
    portalOpen = false;
    if (restoreFocus) {
      const target = focusAfter?.() || buttonEl;
      if (target && target.isConnected) target.focus({ preventScroll: true });
    }
  }

  /** @param {PointerEvent} e */
  function onDocPointerDown(e) {
    if (!portalOpen) return;
    const t = e.target;
    if (t instanceof Node && (buttonEl?.contains(t) || portalWrapEl?.contains(t))) return;
    closePortal(false);
  }

  /** @param {Event} e */
  function onDocScroll(e) {
    if (!portalOpen) return;
    // 열기 직후(100ms) 버튼 포커스·관성 스크롤 잔여 이벤트로 즉시 닫히는 오작동을 막습니다.
    if (performance.now() - portalOpenedAt < 100) return;
    if (e.target instanceof Node && portalWrapEl?.contains(e.target)) return;
    closePortal(false);
  }

  /** @param {KeyboardEvent} e */
  function onDocKeydown(e) {
    if (!portalOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePortal(true);
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp')
      && !(document.activeElement instanceof Node && portalWrapEl?.contains(document.activeElement))) {
      e.preventDefault();
      portalPanelRef?.focusSelectedOrFirst();
    }
  }

  function onWinResize() {
    if (portalOpen) closePortal(false);
  }

  $effect(() => {
    if (!portalOpen) return;
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeydown, true);
    window.addEventListener('scroll', onDocScroll, true);
    window.addEventListener('resize', onWinResize);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onDocKeydown, true);
      window.removeEventListener('scroll', onDocScroll, true);
      window.removeEventListener('resize', onWinResize);
    };
  });

  $effect(() => {
    if (!disabled) return;
    if (native && fontPicker.openKey === pickerKey) {
      fontPicker.close('frozen', { toggleGrace: false });
    } else if (portalOpen) {
      closePortal(false);
    }
  });

  onMount(() => {
    if (native) fontPicker.schedulePrewarm(1800);
  });

  onDestroy(() => {
    if (native && fontPicker.openKey === pickerKey) {
      fontPicker.close('anchor-removed', { toggleGrace: false });
    }
  });
</script>

<button
  bind:this={buttonEl}
  type="button"
  class="fp-trigger fp-variant-{variant} {triggerClass}"
  class:is-open={isOpen}
  style={triggerStyle}
  {disabled}
  role="combobox"
  aria-label={ariaLabel}
  aria-controls={listboxId}
  aria-haspopup="listbox"
  aria-expanded={isOpen}
  title={`글꼴: ${fullLabel}`}
  onpointerdown={handlePointerDown}
  onmousedown={handleMouseDown}
  onclick={handleClick}
  onkeydown={handleTriggerKeydown}
>
  <span class="fp-trigger-text" style:font-family={previewStack}>{displayLabel}</span>
  <span class="fp-trigger-chev" class:is-open={isOpen} aria-hidden="true">
    <ChevronDown size={variant === 'field' ? 14 : 11} strokeWidth={2.4} />
  </span>
</button>

{#if !native && portalOpen}
  <div
    bind:this={portalWrapEl}
    use:portal
    id={listboxId}
    class="fp-portal-float"
    style="left:{portalRect.x}px; top:{portalRect.y}px; width:{portalRect.width}px; height:{portalRect.height}px;"
  >
    <FontPickerPanel
      bind:this={portalPanelRef}
      {value}
      {customFonts}
      {extraOptions}
      themeStyle={portalThemeStyle}
      side={portalRect.side}
      variant="portal"
      maxHeight={portalRect.height}
      onselect={(next) => {
        closePortal(false);
        onselect?.(next);
      }}
      oncancel={() => closePortal(true)}
    />
  </div>
{/if}

<style>
  .fp-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
    transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
  }
  .fp-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .fp-trigger-text {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }
  .fp-trigger-chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.72;
    transition: transform 130ms ease, opacity 120ms ease;
  }
  .fp-trigger-chev.is-open {
    transform: rotate(180deg);
    opacity: 1;
  }

  /* 툴바형 (MainToolbar · ArchiveToolbar · Noticeboard) */
  .fp-variant-toolbar {
    padding: 0 5px 0 6px;
  }
  /* 초소형 툴바형 (FloatingRTE) */
  .fp-variant-toolbar-compact {
    padding: 0 4px 0 5px;
    gap: 2px;
  }
  /* 설정창 폼 필드형 (SettingsModal · MealSettings · ToolkitSettings) */
  .fp-variant-field {
    width: 100%;
    padding: 0 9px 0 11px;
  }

  .fp-portal-float {
    position: fixed;
    z-index: 210000;
    animation: fpPortalIn 110ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes fpPortalIn {
    from { opacity: 0; transform: translateY(-3px) scale(0.99); }
    to { opacity: 1; transform: none; }
  }
</style>
