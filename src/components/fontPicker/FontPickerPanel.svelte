<script>
  // ═══════════════════════════════════════════════════════════════════
  // [글꼴 선택 패널 코어] H3(미니 카테고리 탭 + 인라인 굵기 캡슐) + D1(에어리 포스트잇).
  //
  // 공유 구조:
  //   · 독립 팝업 창(FontPickerWindow)은 variant="window"로 Zero-Halo Flush Edge 전체를 채웁니다.
  //   · 우클릭 서식 드로어(ContextFormatBar)는 variant="inline"으로 이중 팝업 충돌 없이 내부에 그립니다.
  //   · 브라우저 미리보기(!isTauri)에서도 FontPickerTrigger 포탈이 이 컴포넌트를 그대로 사용합니다.
  // ═══════════════════════════════════════════════════════════════════
  import { tick } from 'svelte';
  import { Check } from 'lucide-svelte';
  import { buildFontCatalog } from '../../lib/fonts/fontCatalog.js';

  /**
   * @typedef {import('../../lib/fonts/fontCatalog.js').FontCategoryId} FontCategoryId
   * @typedef {import('../../lib/fonts/fontCatalog.js').FontFamilyGroup} FontFamilyGroup
   * @typedef {import('../../lib/fonts/fontCatalog.js').FontVariant} FontVariant
   * @typedef {import('../../lib/fonts/fontPickerProtocol.js').ExtraFontOption} ExtraFontOption
   */

  /**
   * @type {{
   *   value?: string,
   *   customFonts?: Array<{ name: string, path?: string }>,
   *   extraOptions?: ExtraFontOption[],
   *   themeStyle?: string,
   *   side?: 'below' | 'above' | 'right' | 'left' | 'overlay',
   *   variant?: 'window' | 'inline' | 'portal',
   *   maxHeight?: number,
   *   onselect?: (value: string) => void,
   *   oncancel?: () => void,
   * }}
   */
  let {
    value = '',
    customFonts = [],
    extraOptions = [],
    themeStyle = '',
    side = 'below',
    variant = 'window',
    maxHeight = 332,
    onselect = undefined,
    oncancel = undefined,
  } = $props();

  /** @type {'all' | FontCategoryId} */
  let activeCat = $state('all');
  /** 굵기 칩에 커서/포커스를 올리면 해당 패밀리 행의 이름 글꼴만 실시간으로 그 굵기로 미리 보여 줍니다.
   * @type {{ famId: string, family: string } | null} */
  let preview = $state(null);

  /** @type {HTMLDivElement | null} */ let rootEl = $state(null);
  /** @type {HTMLDivElement | null} */ let scrollEl = $state(null);
  /** @type {HTMLDivElement | null} */ let tabBarEl = $state(null);
  let canScrollUp = $state(false);
  let canScrollDown = $state(false);

  const sections = $derived(buildFontCatalog(customFonts));
  const tabs = $derived([
    { id: /** @type {'all' | FontCategoryId} */ ('all'), label: '전체' },
    ...sections.map((sec) => ({ id: sec.id, label: sec.tabLabel })),
  ]);
  const visibleSections = $derived(
    activeCat === 'all' ? sections : sections.filter((sec) => sec.id === activeCat),
  );
  const showSectionHeaders = $derived(activeCat === 'all');

  function updateScrollFade() {
    if (!scrollEl) {
      canScrollUp = false;
      canScrollDown = false;
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollEl;
    canScrollUp = scrollTop > 4;
    canScrollDown = scrollTop + clientHeight < scrollHeight - 4;
  }

  $effect(() => {
    // 커스텀 글꼴이 모두 삭제되어 활성 탭이 사라지면 자동으로 전체 탭으로 복귀합니다.
    if (activeCat !== 'all' && !sections.some((sec) => sec.id === activeCat)) {
      activeCat = 'all';
    }
    // 카테고리나 목록이 바뀔 때마다 스크롤 페이드 마스크 상태를 다시 잽니다.
    void visibleSections;
    void tick().then(updateScrollFade);
  });

  $effect(() => {
    if (!scrollEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateScrollFade);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  });

  /**
   * 외부 문서나 설정창 스크롤을 건드리지 않고 오직 내부 목록(.fp-scroll)만 부드럽게 맞춥니다.
   * 왜 scrollIntoView 대신 직접 계산하는가: scrollIntoView는 조상 스크롤 컨테이너까지 연쇄 스크롤해
   * 호스트 창의 scroll-to-close 감시기가 오작동할 수 있기 때문입니다.
   * @param {HTMLElement} el
   * @param {'center' | 'nearest'} mode
   */
  function scrollRowIntoList(el, mode = 'nearest') {
    if (!scrollEl) return;
    const sRect = scrollEl.getBoundingClientRect();
    const rRect = el.getBoundingClientRect();
    if (mode === 'center') {
      const delta = (rRect.top - sRect.top) - (scrollEl.clientHeight - rRect.height) / 2;
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);
    } else {
      const topGap = rRect.top - sRect.top;
      const bottomGap = rRect.bottom - sRect.bottom;
      if (topGap < 4) scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + topGap - 4);
      else if (bottomGap > -4) scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + bottomGap + 4);
    }
  }

  /**
   * 패널이 열릴 때 호출됩니다: 전체 탭으로 맞추고 현재 선택된 글꼴을 중앙 부근으로 스크롤합니다.
   * @param {boolean} [viaKeyboard]
   */
  export async function focusAndReveal(viaKeyboard = false) {
    activeCat = 'all';
    preview = null;
    await tick();
    const selected = scrollEl?.querySelector('[data-selected="true"]');
    if (selected instanceof HTMLElement) {
      scrollRowIntoList(selected, 'center');
      if (viaKeyboard) selected.focus({ preventScroll: true });
      else if (variant === 'window') rootEl?.focus({ preventScroll: true });
    } else if (scrollEl) {
      scrollEl.scrollTop = 0;
      if (viaKeyboard) {
        const first = scrollEl.querySelector('[data-fp-focusable="row"]');
        if (first instanceof HTMLElement) first.focus({ preventScroll: true });
      } else if (variant === 'window') {
        rootEl?.focus({ preventScroll: true });
      }
    }
    updateScrollFade();
  }

  /**
   * 마우스로 연 뒤 방향키(↓/↑)를 누르면 현재 탭을 유지한 채 선택 행 또는 첫 행으로 키보드 탐색을 시작합니다.
   */
  export function focusSelectedOrFirst() {
    if (!scrollEl) return;
    const target = scrollEl.querySelector('[data-selected="true"]')
      || scrollEl.querySelector('[data-fp-focusable="row"]');
    if (target instanceof HTMLElement) {
      target.focus({ preventScroll: true });
      scrollRowIntoList(target, 'nearest');
    }
  }

  /** @param {'all' | FontCategoryId} catId */
  function selectCategory(catId) {
    // 특정 카테고리를 다시 누르면 '전체'로 되돌려 빠르게 전체 목록을 훑을 수 있게 합니다.
    activeCat = activeCat === catId && catId !== 'all' ? 'all' : catId;
    preview = null;
    if (scrollEl) scrollEl.scrollTop = 0;
    void tick().then(updateScrollFade);
  }

  /** @param {FontFamilyGroup} fam */
  function activeVariantOf(fam) {
    return fam.variants.find((item) => item.name === value) || null;
  }

  /** @param {FontFamilyGroup} fam */
  function displayVariantOf(fam) {
    const active = activeVariantOf(fam);
    if (active) return active;
    if (fam.defaultVariant) {
      const def = fam.variants.find((item) => item.name === fam.defaultVariant);
      if (def) return def;
    }
    return fam.variants[0];
  }

  /** @param {FontFamilyGroup} fam */
  function effectiveFontFamily(fam) {
    if (preview && preview.famId === fam.id) return preview.family;
    return displayVariantOf(fam).family;
  }

  /** @param {string} fontName */
  function choose(fontName) {
    preview = null;
    onselect?.(fontName);
  }

  /** @param {KeyboardEvent} e */
  function handleRootKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      oncancel?.();
    }
  }

  /** @param {KeyboardEvent} e @param {number} index */
  function handleTabKeydown(e, index) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextIdx = e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
      activeCat = tabs[nextIdx].id;
      preview = null;
      if (scrollEl) scrollEl.scrollTop = 0;
      void tick().then(() => {
        const nextBtn = tabBarEl?.querySelectorAll('[role="tab"]')[nextIdx];
        if (nextBtn instanceof HTMLElement) nextBtn.focus();
        updateScrollFade();
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstRow = scrollEl?.querySelector('[data-fp-focusable="row"]');
      if (firstRow instanceof HTMLElement) firstRow.focus();
    }
  }

  /** @param {KeyboardEvent} e */
  function handleListKeydown(e) {
    if (!scrollEl) return;
    const rows = Array.from(scrollEl.querySelectorAll('[data-fp-focusable="row"]'));
    if (rows.length === 0) return;

    const active = document.activeElement;
    const currentRow = active instanceof HTMLElement ? active.closest('[data-fp-focusable="row"]') : null;
    const rowIdx = currentRow ? rows.indexOf(currentRow) : -1;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      preview = null;
      const nextIdx = rowIdx < 0
        ? (e.key === 'ArrowDown' ? 0 : rows.length - 1)
        : Math.max(0, Math.min(rows.length - 1, rowIdx + (e.key === 'ArrowDown' ? 1 : -1)));
      const target = rows[nextIdx];
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
        scrollRowIntoList(target, 'nearest');
      }
      return;
    }

    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      preview = null;
      const target = e.key === 'Home' ? rows[0] : rows[rows.length - 1];
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
        scrollRowIntoList(target, 'nearest');
      }
      return;
    }

    // 좌/우 방향키: 다중 굵기 행에서는 칩 사이를 오가며 실시간으로 굵기 폰트를 미리 봅니다.
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && currentRow instanceof HTMLElement) {
      const chips = Array.from(currentRow.querySelectorAll('[data-fp-chip="true"]'));
      if (chips.length === 0) return;
      e.preventDefault();
      const chipIdx = active instanceof HTMLElement ? chips.indexOf(active) : -1;
      let nextChipIdx;
      if (chipIdx < 0) {
        nextChipIdx = e.key === 'ArrowRight' ? 0 : chips.length - 1;
      } else if (e.key === 'ArrowLeft' && chipIdx === 0) {
        preview = null;
        currentRow.focus();
        return;
      } else {
        nextChipIdx = Math.max(0, Math.min(chips.length - 1, chipIdx + (e.key === 'ArrowRight' ? 1 : -1)));
      }
      const chip = chips[nextChipIdx];
      if (chip instanceof HTMLElement) chip.focus();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={rootEl}
  class="fp-root"
  class:is-window={variant === 'window'}
  class:is-portal={variant === 'portal'}
  class:is-inline={variant === 'inline'}
  data-side={side}
  style="{themeStyle};{variant !== 'window' ? `max-height:${maxHeight}px;` : ''}"
  role="dialog"
  aria-label="글꼴 선택"
  tabindex="-1"
  onkeydown={handleRootKeydown}
>
  <!-- H3 상단 미니 카테고리 탭 바 (기본 7탭 1줄 · 커스텀 글꼴 존재 시 8탭 자동 2줄) -->
  <div
    bind:this={tabBarEl}
    class="fp-cat-bar"
    class:is-multi-row={tabs.length > 7}
    role="tablist"
    aria-label="글꼴 분류"
  >
    {#each tabs as tab, idx (tab.id)}
      {@const isActive = activeCat === tab.id}
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        tabindex={isActive ? 0 : -1}
        class="fp-cat-pill"
        class:is-active={isActive}
        onmousedown={(e) => { if (variant !== 'window') e.preventDefault(); }}
        onclick={() => selectCategory(tab.id)}
        onkeydown={(e) => handleTabKeydown(e, idx)}
      >{tab.label}</button>
    {/each}
  </div>

  <!-- 스크롤 본문 + 상·하단 페이드 마스크 -->
  <div class="fp-list-wrap">
    <div class="fp-fade fp-fade-top" class:is-visible={canScrollUp} aria-hidden="true"></div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={scrollEl}
      class="fp-scroll"
      role="listbox"
      aria-label="글꼴 목록"
      tabindex="-1"
      onscroll={updateScrollFade}
      onkeydown={handleListKeydown}
    >
      {#if extraOptions.length > 0 && activeCat === 'all'}
        <div class="fp-extra-group">
          {#each extraOptions as opt (opt.value)}
            {@const isSelected = value === opt.value}
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              data-selected={isSelected ? 'true' : undefined}
              data-fp-focusable="row"
              class="fp-row fp-extra-row"
              class:is-selected={isSelected}
              onmousedown={(e) => { if (variant !== 'window') e.preventDefault(); }}
              onclick={() => choose(opt.value)}
            >
              <span class="fp-row-main">
                <span class="fp-name fp-extra-name">{opt.label}</span>
                {#if opt.note}<span class="fp-note">{opt.note}</span>{/if}
              </span>
              {#if isSelected}
                <span class="fp-check" aria-hidden="true"><Check size={12} strokeWidth={2.9} /></span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      {#each visibleSections as sec (sec.id)}
        <section class="fp-sec" aria-label={sec.label}>
          {#if showSectionHeaders}
            <div class="fp-cat-head" aria-hidden="true">
              <span class="fp-cat-dot"></span>
              <span class="fp-cat-title">{sec.label}</span>
              <span class="fp-cat-rule"></span>
            </div>
          {/if}

          {#each sec.families as fam (fam.id)}
            {@const isMulti = fam.variants.length > 1}
            {@const activeVar = activeVariantOf(fam)}
            {@const isFamSelected = Boolean(activeVar)}
            {@const defVar = displayVariantOf(fam)}

            {#if !isMulti}
              <button
                type="button"
                role="option"
                aria-selected={isFamSelected}
                data-selected={isFamSelected ? 'true' : undefined}
                data-fp-focusable="row"
                class="fp-row"
                class:is-selected={isFamSelected}
                title={fam.fullName}
                onmousedown={(e) => { if (variant !== 'window') e.preventDefault(); }}
                onclick={() => choose(defVar.name)}
              >
                <span class="fp-row-main">
                  <span class="fp-name" style:font-family={defVar.family}>{fam.label}</span>
                </span>
                {#if isFamSelected}
                  <span class="fp-check" aria-hidden="true"><Check size={12} strokeWidth={2.9} /></span>
                {/if}
              </button>
            {:else}
              <!-- 다중 굵기/시리즈 행: 본문 클릭 시 대표/현재 굵기 즉시 적용, 칩 호버 시 실시간 폰트 프리뷰 -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                role="option"
                aria-selected={isFamSelected}
                aria-label={fam.fullName}
                data-selected={isFamSelected ? 'true' : undefined}
                data-fp-focusable="row"
                tabindex="0"
                class="fp-row fp-multi-row"
                class:is-selected={isFamSelected}
                title={fam.fullName}
                onmousedown={(e) => { if (variant !== 'window') e.preventDefault(); }}
                onclick={() => choose(defVar.name)}
                onkeydown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choose(defVar.name);
                  }
                }}
              >
                <span class="fp-row-main">
                  <span class="fp-name" style:font-family={effectiveFontFamily(fam)}>{fam.label}</span>
                </span>
                <span class="fp-wchips" role="group" aria-label={`${fam.fullName} 스타일`}>
                  {#each fam.variants as item (item.name)}
                    {@const chipActive = item.name === value}
                    <button
                      type="button"
                      data-fp-chip="true"
                      class="fp-wchip"
                      class:is-word={item.isWordChip}
                      class:is-active={chipActive}
                      style:font-family={item.isWordChip ? item.family : undefined}
                      title={item.fullLabel}
                      aria-label={item.fullLabel}
                      aria-pressed={chipActive}
                      onmousedown={(e) => {
                        e.stopPropagation();
                        if (variant !== 'window') e.preventDefault();
                      }}
                      onmouseenter={() => { preview = { famId: fam.id, family: item.family }; }}
                      onmouseleave={() => { if (preview?.famId === fam.id) preview = null; }}
                      onfocus={() => { preview = { famId: fam.id, family: item.family }; }}
                      onblur={() => { if (preview?.famId === fam.id) preview = null; }}
                      onclick={(e) => {
                        e.stopPropagation();
                        choose(item.name);
                      }}
                    >{item.chip}</button>
                  {/each}
                </span>
              </div>
            {/if}
          {/each}
        </section>
      {/each}
    </div>

    <div class="fp-fade fp-fade-bottom" class:is-visible={canScrollDown} aria-hidden="true"></div>
  </div>
</div>

<style>
  .fp-root {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 11px;
    background: var(--fp-surface, #ffffff);
    background-clip: padding-box;
    color: var(--fp-ink, #1e293b);
    overflow: hidden;
    isolation: isolate;
    box-shadow: none;
    user-select: none;
    font-family: "Malgun Gothic", -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.3;
    letter-spacing: 0;
    outline: none;
  }

  /* Zero-Halo Flush Edge: 고DPI 모서리 번짐을 0px로 막는 불투명 내측 1px 림 */
  .fp-root::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 50;
    border-radius: inherit;
    pointer-events: none;
    box-shadow: inset 0 0 0 1px var(--fp-edge-solid, #d6dce5);
  }

  /* 트리거 버튼과 맞닿는 변에 미세 포인트 심을 두어 착 달라붙은 일체감을 강화합니다. */
  .fp-root.is-window[data-side="below"]::before,
  .fp-root.is-portal[data-side="below"]::before {
    content: '';
    position: absolute;
    top: 1px;
    left: 10px;
    right: 10px;
    height: 1.5px;
    z-index: 45;
    border-radius: 99px;
    background: var(--fp-seam, rgba(217, 119, 6, 0.35));
    pointer-events: none;
  }
  .fp-root.is-window[data-side="above"]::before,
  .fp-root.is-portal[data-side="above"]::before {
    content: '';
    position: absolute;
    bottom: 1px;
    left: 10px;
    right: 10px;
    height: 1.5px;
    z-index: 45;
    border-radius: 99px;
    background: var(--fp-seam, rgba(217, 119, 6, 0.35));
    pointer-events: none;
  }

  .fp-root.is-portal {
    box-shadow: 0 10px 26px -8px rgba(15, 23, 42, 0.22);
  }

  .fp-root.is-inline {
    height: auto;
    border-radius: 8px;
  }

  /* ── H3 상단 미니 카테고리 탭 바 ── */
  .fp-cat-bar {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 2px 1px;
    padding: 6px 5px 5px;
    background: var(--fp-catbar, #f5f6f8);
    border-bottom: 1px solid var(--fp-line, rgba(15, 23, 42, 0.08));
  }
  .fp-cat-bar.is-multi-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3px;
  }
  .fp-cat-bar.is-multi-row .fp-cat-pill {
    text-align: center;
    padding: 0 3px;
  }
  .fp-root.is-inline .fp-cat-bar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 4px 4px 4px;
    gap: 2px;
  }
  .fp-cat-pill {
    height: 21px;
    padding: 0 4.5px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--fp-muted, #5b677a);
    font-family: inherit;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease;
    white-space: nowrap;
  }
  .fp-root.is-inline .fp-cat-pill {
    text-align: center;
    height: 19px;
    padding: 0 2px;
    font-size: 9px;
  }
  .fp-cat-pill:hover {
    background: var(--fp-accent-soft, rgba(217, 119, 6, 0.12));
    color: var(--fp-accent-ink, #b45309);
  }
  .fp-cat-pill.is-active {
    background: var(--fp-accent-solid, #b45309);
    color: var(--fp-on-accent, #ffffff);
  }
  .fp-cat-pill:focus-visible {
    outline: 1.5px solid var(--fp-accent, #d97706);
    outline-offset: 1px;
  }

  /* ── 스크롤 리스트 + 상하단 페이드 ── */
  .fp-list-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .fp-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 5px 5px 7px;
    scrollbar-gutter: stable;
    outline: none;
  }
  .fp-root.is-inline .fp-scroll {
    padding: 4px 4px 6px;
  }
  .fp-scroll::-webkit-scrollbar {
    width: 5px;
  }
  .fp-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .fp-scroll::-webkit-scrollbar-thumb {
    background: var(--fp-scroll, rgba(217, 119, 6, 0.26));
    border-radius: 999px;
  }
  .fp-scroll:hover::-webkit-scrollbar-thumb {
    background: var(--fp-scroll-hover, rgba(217, 119, 6, 0.5));
  }

  .fp-fade {
    position: absolute;
    left: 1px;
    right: 7px;
    height: 14px;
    pointer-events: none;
    z-index: 15;
    opacity: 0;
    transition: opacity 130ms ease;
  }
  .fp-fade.is-visible {
    opacity: 1;
  }
  .fp-fade-top {
    top: 0;
    background: linear-gradient(to bottom, var(--fp-fade-color, #ffffff), transparent);
  }
  .fp-fade-bottom {
    bottom: 0;
    background: linear-gradient(to top, var(--fp-fade-color, #ffffff), transparent);
  }

  /* ── 특수 최상단 항목 (예: 급식창 '메인 창과 동일') ── */
  .fp-extra-group {
    padding-bottom: 4px;
    margin-bottom: 2px;
    border-bottom: 1px solid var(--fp-line, rgba(15, 23, 42, 0.08));
  }
  .fp-extra-name {
    font-size: 12px;
    font-weight: 600;
  }
  .fp-note {
    font-size: 10px;
    color: var(--fp-muted, #5b677a);
    flex-shrink: 0;
  }

  /* ── 카테고리 헤더 (D1 파스텔 도트 + 실선) ── */
  .fp-cat-head {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 6px 3px 7px;
  }
  .fp-sec:first-child .fp-cat-head {
    padding-top: 3px;
  }
  .fp-cat-dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--fp-accent, #d97706);
    opacity: 0.78;
    flex-shrink: 0;
  }
  .fp-cat-title {
    font-size: 10px;
    font-weight: 700;
    color: var(--fp-muted, #5b677a);
    letter-spacing: 0.01em;
    flex-shrink: 0;
  }
  .fp-cat-rule {
    flex: 1;
    height: 1px;
    background: var(--fp-line, rgba(15, 23, 42, 0.08));
    margin-left: 2px;
  }

  /* ── 패밀리 행 (D1: 좌측 2.5px 포인트 막대 + 부드러운 틴트) ── */
  .fp-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    min-height: 30px;
    padding: 3px 6px 3px 9px;
    margin-bottom: 1px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--fp-ink, #1e293b);
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 110ms ease, color 110ms ease;
  }
  .fp-root.is-inline .fp-row {
    min-height: 27px;
    padding: 2px 5px 2px 8px;
    gap: 4px;
  }
  .fp-row::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 5px;
    bottom: 5px;
    width: 2.5px;
    border-radius: 999px;
    background: var(--fp-accent, #d97706);
    opacity: 0;
    transform: scaleY(0.45);
    transition: opacity 110ms ease, transform 130ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  .fp-row:hover,
  .fp-row:focus-visible {
    background: var(--fp-accent-soft, rgba(217, 119, 6, 0.12));
    outline: none;
  }
  .fp-row:hover::before,
  .fp-row:focus-visible::before {
    opacity: 1;
    transform: scaleY(1);
  }
  .fp-row:hover .fp-name,
  .fp-row:focus-visible .fp-name {
    color: var(--fp-accent-ink, #b45309);
  }
  .fp-row.is-selected {
    background: var(--fp-accent-med, rgba(217, 119, 6, 0.19));
  }
  .fp-row.is-selected::before {
    opacity: 1;
    transform: scaleY(1);
  }
  .fp-row.is-selected .fp-name {
    color: var(--fp-accent-ink, #b45309);
  }

  .fp-row-main {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }
  .fp-name {
    font-size: 13px;
    line-height: 1.32;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 100ms ease;
  }
  .fp-root.is-inline .fp-name {
    font-size: 11.5px;
  }
  .fp-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fp-accent, #d97706);
    flex-shrink: 0;
  }

  /* ── 인라인 굵기/시리즈 캡슐 ── */
  .fp-wchips {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .fp-wchip {
    height: 19px;
    min-width: 19px;
    padding: 0 4px;
    border-radius: 5px;
    border: 1px solid var(--fp-line, rgba(15, 23, 42, 0.08));
    background: var(--fp-chip-bg, rgba(15, 23, 42, 0.05));
    color: var(--fp-muted, #5b677a);
    font-family: "Malgun Gothic", -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 9.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 100ms ease, color 100ms ease, border-color 100ms ease, transform 90ms ease;
  }
  .fp-wchip.is-word {
    min-width: auto;
    padding: 0 4.5px;
    font-weight: 500;
    font-size: 9.5px;
  }
  .fp-root.is-inline .fp-wchip {
    height: 17px;
    min-width: 16px;
    padding: 0 3px;
    font-size: 8.5px;
  }
  .fp-wchip:hover,
  .fp-wchip:focus-visible {
    background: var(--fp-accent-solid, #b45309);
    color: var(--fp-on-accent, #ffffff);
    border-color: var(--fp-accent-solid, #b45309);
    transform: translateY(-0.5px);
    outline: none;
  }
  .fp-wchip.is-active {
    background: var(--fp-accent-solid, #b45309);
    color: var(--fp-on-accent, #ffffff);
    border-color: var(--fp-accent-solid, #b45309);
  }
</style>
