<script>
  import { tick } from 'svelte';
  import { Bold, Italic, Underline, ChevronDown, Check } from 'lucide-svelte';
  import { PALETTE } from '../../lib/editorConstants.js';
  import { STABLE_MAX_PT } from '../../lib/fontSize.js';
  import {
    COMPACT_SIZE_PRESETS,
    QUICK_BG_COLORS,
    QUICK_TEXT_COLORS,
  } from '../../lib/contextMenuIcons.js';
  import { normalizeFontSizePt } from '../../lib/editor/richTextFormat.js';

  /**
   * @typedef {{
   *   fontFamily?: string,
   *   fontSize?: number | null,
   *   isBold?: boolean,
   *   isItalic?: boolean,
   *   isUnderline?: boolean,
   *   textColor?: string,
   *   bgColor?: string,
   *   isMixedFont?: boolean,
   *   isMixedSize?: boolean,
   * }} FormatState
   */

  /**
   * @type {{
   *   format?: FormatState | null,
   *   fonts?: Array<{ name: string, family: string }>,
   *   maxFontPt?: number,
   *   onformat?: (payload: { op: 'font' | 'size' | 'bold' | 'italic' | 'underline' | 'color' | 'bg', value?: unknown }) => void,
   * }}
   */
  let {
    format = null,
    fonts = [],
    maxFontPt = STABLE_MAX_PT,
    onformat = undefined,
  } = $props();

  /** @type {null | 'font' | 'size' | 'textColor' | 'bgColor'} */
  let activeDrawer = $state(null);
  let showFullPalette = $state(false);
  let sizeInputText = $state('10');
  let sizeInputFocused = $state(false);
  /** @type {HTMLInputElement | null} */ let sizeInputEl = $state(null);
  /** @type {HTMLDivElement | null} */ let fontListEl = $state(null);
  /** @type {HTMLButtonElement | null} */ let fontTriggerEl = $state(null);
  /** @type {HTMLButtonElement | null} */ let sizeTriggerEl = $state(null);
  /** @type {HTMLButtonElement | null} */ let textColorTriggerEl = $state(null);
  /** @type {HTMLButtonElement | null} */ let bgColorTriggerEl = $state(null);

  const curFormat = $derived({
    fontFamily: format?.fontFamily || '',
    fontSize: format?.fontSize ?? 10,
    isBold: Boolean(format?.isBold),
    isItalic: Boolean(format?.isItalic),
    isUnderline: Boolean(format?.isUnderline),
    textColor: format?.textColor || '',
    bgColor: format?.bgColor || '',
    isMixedFont: Boolean(format?.isMixedFont),
    isMixedSize: Boolean(format?.isMixedSize),
  });

  const visibleSizePresets = $derived(
    COMPACT_SIZE_PRESETS.filter((pt) => pt <= maxFontPt)
  );

  // 입력칸 포커스 중이 아닐 때만 외부 서식 크기를 입력칸에 동기화합니다.
  $effect(() => {
    if (sizeInputFocused) return;
    sizeInputText = curFormat.isMixedSize || curFormat.fontSize === null
      ? ''
      : String(curFormat.fontSize);
  });

  // 글꼴 드로어가 열리면 현재 선택된 글꼴 항목으로 자연스럽게 스크롤합니다.
  $effect(() => {
    if (activeDrawer !== 'font') return;
    void tick().then(() => {
      const selected = fontListEl?.querySelector('[aria-selected="true"]');
      if (selected instanceof HTMLElement) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    });
  });

  /** 외부(ContextMenu의 Esc 처리)에서 열린 드로어만 먼저 닫을 수 있도록 공개합니다. */
  export function closeDrawer() {
    if (!activeDrawer) return false;
    const prev = activeDrawer;
    activeDrawer = null;
    showFullPalette = false;
    if (prev === 'font') fontTriggerEl?.focus();
    else if (prev === 'size') sizeTriggerEl?.focus();
    else if (prev === 'textColor') textColorTriggerEl?.focus();
    else if (prev === 'bgColor') bgColorTriggerEl?.focus();
    return true;
  }

  /** @param {'font' | 'size' | 'textColor' | 'bgColor'} drawer */
  function toggleDrawer(drawer) {
    if (activeDrawer === drawer) {
      activeDrawer = null;
      return;
    }
    activeDrawer = drawer;
    if (drawer !== 'textColor' && drawer !== 'bgColor') {
      showFullPalette = false;
    }
  }

  /** @param {number} delta */
  function stepSize(delta) {
    const base = curFormat.fontSize ?? 10;
    const next = normalizeFontSizePt(base + delta, maxFontPt);
    if (next === null) return;
    sizeInputText = String(next);
    onformat?.({ op: 'size', value: next });
  }

  function commitSizeInput() {
    const parsed = normalizeFontSizePt(sizeInputText, maxFontPt);
    if (parsed === null) {
      sizeInputText = curFormat.isMixedSize || curFormat.fontSize === null ? '' : String(curFormat.fontSize);
      return;
    }
    sizeInputText = String(parsed);
    onformat?.({ op: 'size', value: parsed });
  }

  /** @param {number} pt */
  function pickSizePreset(pt) {
    const next = normalizeFontSizePt(pt, maxFontPt);
    if (next === null) return;
    sizeInputText = String(next);
    activeDrawer = null;
    onformat?.({ op: 'size', value: next });
  }

  /** @param {string} fontName */
  function pickFont(fontName) {
    activeDrawer = null;
    onformat?.({ op: 'font', value: fontName });
  }

  /** @param {'color' | 'bg'} op @param {string} value */
  function pickColor(op, value) {
    onformat?.({ op, value });
  }
</script>

<div class="ctx-format-card" role="group" aria-label="텍스트 서식">
  <!-- 1줄: 글꼴 + 크기 (상단 툴바 좌측 정렬과 동일) -->
  <div class="fmt-row-top">
    <button
      bind:this={fontTriggerEl}
      type="button"
      class="fmt-font-btn"
      class:active={activeDrawer === 'font'}
      class:mixed={curFormat.isMixedFont}
      aria-expanded={activeDrawer === 'font'}
      aria-label="글꼴 선택"
      title={curFormat.isMixedFont ? '글꼴 (혼합)' : `글꼴: ${curFormat.fontFamily || '기본'}`}
      onclick={() => toggleDrawer('font')}
    >
      <span class="fmt-font-label">
        {curFormat.isMixedFont ? '혼합' : (curFormat.fontFamily || '글꼴')}
      </span>
      <span class="fmt-chev" class:open={activeDrawer === 'font'} aria-hidden="true">
        <ChevronDown size={9} strokeWidth={2.4} />
      </span>
    </button>

    <div class="fmt-size-stepper" role="group" aria-label="글자 크기">
      <button
        type="button"
        class="step-btn"
        aria-label="글자 크기 작게"
        title="크기 줄이기"
        onclick={() => stepSize(-1)}
      >−</button>
      <div class="size-center">
        <input
          bind:this={sizeInputEl}
          type="text"
          inputmode="decimal"
          class="size-input"
          bind:value={sizeInputText}
          placeholder="-"
          aria-label="글자 크기(pt)"
          title="글자 크기 입력 (최대 {Number.isFinite(maxFontPt) ? `${maxFontPt}pt` : '무제한'})"
          onfocus={() => { sizeInputFocused = true; sizeInputEl?.select(); }}
          onblur={() => { sizeInputFocused = false; commitSizeInput(); }}
          onkeydown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitSizeInput(); sizeInputEl?.blur(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); stepSize(1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); stepSize(-1); }
          }}
        />
        <button
          bind:this={sizeTriggerEl}
          type="button"
          class="pt-btn"
          class:active={activeDrawer === 'size'}
          aria-expanded={activeDrawer === 'size'}
          aria-label="글자 크기 프리셋"
          title="크기 프리셋"
          onclick={() => toggleDrawer('size')}
        >pt</button>
      </div>
      <button
        type="button"
        class="step-btn"
        aria-label="글자 크기 크게"
        title="크기 키우기"
        onclick={() => stepSize(1)}
      >+</button>
    </div>
  </div>

  <!-- 2줄: B · I · U · 글자색 · 형광펜 (상단 툴바 우측 정렬과 1:1 일치) -->
  <div class="fmt-row-tools">
    <button
      type="button"
      class="fmt-tool-btn ctx-tip tip-left"
      class:active={curFormat.isBold}
      aria-pressed={curFormat.isBold}
      aria-label="굵게"
      data-tip="굵게"
      title="굵게"
      onclick={() => onformat?.({ op: 'bold' })}
    >
      <Bold size={12} strokeWidth={curFormat.isBold ? 3.0 : 2.35} />
    </button>

    <button
      type="button"
      class="fmt-tool-btn ctx-tip"
      class:active={curFormat.isItalic}
      aria-pressed={curFormat.isItalic}
      aria-label="기울임"
      data-tip="기울임"
      title="기울임"
      onclick={() => onformat?.({ op: 'italic' })}
    >
      <Italic size={12} strokeWidth={curFormat.isItalic ? 2.65 : 2.15} />
    </button>

    <button
      type="button"
      class="fmt-tool-btn ctx-tip"
      class:active={curFormat.isUnderline}
      aria-pressed={curFormat.isUnderline}
      aria-label="밑줄"
      data-tip="밑줄"
      title="밑줄"
      onclick={() => onformat?.({ op: 'underline' })}
    >
      <Underline size={12} strokeWidth={curFormat.isUnderline ? 2.65 : 2.15} />
    </button>

    <button
      bind:this={textColorTriggerEl}
      type="button"
      class="fmt-tool-btn ctx-tip"
      class:active={activeDrawer === 'textColor'}
      aria-expanded={activeDrawer === 'textColor'}
      aria-label="글자 색상"
      data-tip="글자색"
      title="글자 색상"
      onclick={() => toggleDrawer('textColor')}
    >
      <span class="color-glyph" aria-hidden="true">
        <svg width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 15 6-11 6 11" />
          <path d="M9 11h6" />
        </svg>
        <span class="color-bar" style="background:{curFormat.textColor || 'currentColor'};"></span>
      </span>
    </button>

    <button
      bind:this={bgColorTriggerEl}
      type="button"
      class="fmt-tool-btn ctx-tip tip-right"
      class:active={activeDrawer === 'bgColor'}
      aria-expanded={activeDrawer === 'bgColor'}
      aria-label="형광펜"
      data-tip="형광펜"
      title="형광펜"
      onclick={() => toggleDrawer('bgColor')}
    >
      <span class="color-glyph" aria-hidden="true">
        <svg width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 11 6-6 3 3-6 6z" />
          <path d="m5 15 4 4" />
          <path d="m21 21-2-2" />
        </svg>
        <span
          class="color-bar"
          class:empty={!curFormat.bgColor}
          style="background:{curFormat.bgColor || 'transparent'};"
        ></span>
      </span>
    </button>
  </div>

  <!-- 3줄: 상호 배타적 인라인 드로어 (글꼴 / 크기 프리셋 / 글자색 / 형광펜) -->
  {#if activeDrawer === 'font'}
    <div bind:this={fontListEl} class="fmt-drawer fmt-font-list" role="listbox" aria-label="글꼴 목록">
      {#each fonts as font (font.name)}
        {@const selected = !curFormat.isMixedFont && curFormat.fontFamily === font.name}
        <button
          type="button"
          role="option"
          aria-selected={selected}
          class="fmt-font-opt"
          class:selected
          style="font-family:{font.family};"
          onclick={() => pickFont(font.name)}
        >
          <span class="fmt-font-opt-name">{font.name}</span>
          {#if selected}<Check size={10} strokeWidth={2.8} />{/if}
        </button>
      {/each}
    </div>
  {:else if activeDrawer === 'size'}
    <div class="fmt-drawer" role="group" aria-label="글자 크기 프리셋">
      <div class="fmt-size-grid">
        {#each visibleSizePresets as pt (pt)}
          {@const selected = !curFormat.isMixedSize && curFormat.fontSize !== null && Math.round(curFormat.fontSize) === pt}
          <button
            type="button"
            class="fmt-size-chip"
            class:selected
            onclick={() => pickSizePreset(pt)}
          >{pt}</button>
        {/each}
      </div>
    </div>
  {:else if activeDrawer === 'textColor' || activeDrawer === 'bgColor'}
    {@const isBg = activeDrawer === 'bgColor'}
    {@const swatches = showFullPalette ? PALETTE : (isBg ? QUICK_BG_COLORS : QUICK_TEXT_COLORS)}
    {@const activeHex = (isBg ? curFormat.bgColor : curFormat.textColor).toLowerCase()}
    <div class="fmt-drawer" role="group" aria-label={isBg ? '형광펜 색상' : '글자 색상'}>
      <div class="fmt-pal-head">
        <span class="fmt-pal-title">{isBg ? '형광펜 색상' : '글자 색상'}</span>
        <div class="fmt-pal-actions">
          <button
            type="button"
            class="fmt-pal-mini"
            onclick={() => pickColor(isBg ? 'bg' : 'color', '')}
          >{isBg ? '없음' : '기본'}</button>
          <button
            type="button"
            class="fmt-pal-toggle"
            onclick={() => { showFullPalette = !showFullPalette; }}
          >{showFullPalette ? '간단히' : '60색'}</button>
        </div>
      </div>
      <div class="fmt-swatch-grid" class:full={showFullPalette}>
        {#each swatches as hex (hex)}
          <button
            type="button"
            class="fmt-swatch"
            class:selected={activeHex === hex.toLowerCase()}
            style="background:{hex};"
            title={hex}
            aria-label={hex}
            onclick={() => pickColor(isBg ? 'bg' : 'color', hex)}
          ></button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .ctx-format-card {
    margin-top: 5px;
    padding: 5px;
    border-radius: var(--ctx-radius-card, 8px);
    background: var(--ctx-field);
    border: 1px solid var(--ctx-line);
  }

  .fmt-row-top {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
  }

  .fmt-font-btn {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 5px 0 6px;
    border-radius: var(--ctx-radius-ctrl, 6px);
    border: 1px solid var(--ctx-line);
    background: var(--ctx-surface);
    color: var(--ctx-ink);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 110ms ease, background-color 110ms ease;
  }
  .fmt-font-btn:hover,
  .fmt-font-btn.active {
    border-color: var(--ctx-accent);
  }
  .fmt-font-btn.active {
    background: var(--ctx-accent-soft);
  }
  .fmt-font-btn.mixed .fmt-font-label {
    color: var(--ctx-muted);
    font-weight: 500;
  }
  .fmt-font-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fmt-chev {
    display: flex;
    flex-shrink: 0;
    color: var(--ctx-muted);
    transition: transform 120ms ease;
  }
  .fmt-chev.open {
    transform: rotate(180deg);
    color: var(--ctx-accent);
  }

  .fmt-size-stepper {
    display: flex;
    align-items: center;
    width: 72px;
    height: 22px;
    flex-shrink: 0;
    border-radius: var(--ctx-radius-ctrl, 6px);
    border: 1px solid var(--ctx-line);
    background: var(--ctx-surface);
    overflow: hidden;
  }
  .fmt-size-stepper:focus-within {
    border-color: var(--ctx-accent);
  }
  .step-btn {
    width: 17px;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ctx-muted);
    font-size: 11px;
    font-weight: 700;
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 100ms ease, color 100ms ease;
  }
  .step-btn:hover {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
  }
  .size-center {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1px;
  }
  .size-input {
    width: 19px;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ctx-ink);
    font-family: inherit;
    font-size: 9.5px;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .pt-btn {
    height: 100%;
    padding: 0 2px;
    border: 0;
    background: transparent;
    color: var(--ctx-muted);
    font-family: inherit;
    font-size: 8.5px;
    font-weight: 600;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: color 100ms ease, background-color 100ms ease;
  }
  .pt-btn:hover,
  .pt-btn.active {
    color: var(--ctx-accent);
    background: var(--ctx-accent-soft);
  }
  .ctx-format-card button:focus {
    outline: none;
  }
  .ctx-format-card button:focus-visible {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .fmt-row-tools {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 2px;
  }
  .fmt-tool-btn {
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--ctx-radius-ctrl, 6px);
    background: transparent;
    color: var(--ctx-ink);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, transform 90ms ease, box-shadow 110ms ease;
  }
  .fmt-tool-btn:hover {
    background: var(--ctx-hover);
  }
  .fmt-tool-btn:active {
    transform: scale(0.94);
  }
  .fmt-tool-btn.active {
    background: var(--ctx-accent-soft);
    color: var(--ctx-accent);
    box-shadow: inset 0 0 0 1px var(--ctx-accent-border);
  }

  .color-glyph {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
  }
  .color-glyph svg {
    margin-top: -2.5px;
  }
  .color-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2.5px;
    border-radius: 99px;
  }
  .color-bar.empty {
    border: 1px dashed var(--ctx-muted);
    opacity: 0.7;
  }

  .fmt-drawer {
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid var(--ctx-line);
    animation: fmtDrawerIn 120ms cubic-bezier(0.2, 0.85, 0.3, 1);
  }
  @keyframes fmtDrawerIn {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: none; }
  }

  .fmt-font-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 132px;
    overflow-y: auto;
    padding-right: 1px;
  }
  .fmt-font-list::-webkit-scrollbar {
    width: 4px;
  }
  .fmt-font-list::-webkit-scrollbar-thumb {
    background: rgba(120, 130, 145, 0.35);
    border-radius: 99px;
  }
  .fmt-font-opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    width: 100%;
    height: 22px;
    padding: 0 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ctx-ink);
    font-size: 10.5px;
    text-align: left;
    cursor: pointer;
    flex-shrink: 0;
  }
  .fmt-font-opt:hover {
    background: var(--ctx-hover);
  }
  .fmt-font-opt.selected {
    background: var(--ctx-accent-soft);
    color: var(--ctx-accent);
    font-weight: 700;
  }
  .fmt-font-opt-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fmt-size-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
  }
  .fmt-size-chip {
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ctx-ink);
    font-size: 9.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .fmt-size-chip:hover {
    background: var(--ctx-hover);
  }
  .fmt-size-chip.selected {
    background: var(--ctx-accent-soft);
    color: var(--ctx-accent);
    box-shadow: inset 0 0 0 1px var(--ctx-accent-border);
  }

  .fmt-pal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
  }
  .fmt-pal-title {
    font-size: 9.5px;
    font-weight: 700;
    color: var(--ctx-muted);
  }
  .fmt-pal-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .fmt-pal-mini {
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--ctx-line);
    background: transparent;
    color: var(--ctx-muted);
    font-size: 9px;
    font-weight: 600;
    cursor: pointer;
  }
  .fmt-pal-mini:hover {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
  }
  .fmt-pal-toggle {
    padding: 1px 4px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ctx-accent);
    font-size: 9px;
    font-weight: 700;
    cursor: pointer;
  }
  .fmt-pal-toggle:hover {
    background: var(--ctx-accent-soft);
  }

  .fmt-swatch-grid {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 3px;
  }
  .fmt-swatch {
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.14);
    cursor: pointer;
    transition: transform 90ms ease, box-shadow 90ms ease;
  }
  .fmt-swatch-grid.full .fmt-swatch {
    border-radius: 3px;
  }
  .fmt-swatch:hover {
    transform: scale(1.22);
    z-index: 2;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.24);
  }
  .fmt-swatch.selected {
    border: 2px solid var(--ctx-accent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.85);
  }
</style>
