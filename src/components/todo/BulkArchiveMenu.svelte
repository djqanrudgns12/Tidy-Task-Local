<script>
  // ═══════════════════════════════════════════════════════════════════
  // [다중 선택 [아카이브] 고르기 드롭다운] 시안 A 딱지 두 장 + 시안 C 상자 친구 (docs/PRD-bulk-archive-dropdown.md)
  //
  // 이 컴포넌트는 "재고 그리기"만 합니다. 얼마나 크게(menuPt·폭) · 어느 단계로(L/M/S) · 어디에(꼭지 위치) 여는지는
  // 모두 todos/archiveMenuLayout.js의 순수 함수가 정합니다(창 폭·화면 글자·남은 높이 조합을 테스트로 확인하기 위해).
  //
  // 왜 body로 옮겨 position: fixed로 그리는가:
  //   메모 창 안쪽 상자(.memo-body·도크)는 overflow·쌓임 순서가 제각각이라, 그 안에 두면 잘리거나 할 일 목록 밑에 깔립니다.
  //   좌표는 버튼·도크의 getBoundingClientRect(웹뷰 화면 기준)를 그대로 씁니다.
  // ═══════════════════════════════════════════════════════════════════
  import { onDestroy, tick } from 'svelte';
  import ArchiveBuddy from './ArchiveBuddy.svelte';
  import {
    countBubbleLabel,
    measureArchiveMenuRoom,
    pickArchiveMenuTier,
    placeArchiveMenu,
    ptToPx,
    resolveArchiveMenuPt,
    resolveArchiveMenuWidth,
  } from '../../lib/todos/archiveMenuLayout.js';
  import { archiveMenuPaletteToStyle, resolveArchiveMenuPalette } from '../../lib/todos/archiveMenuPalette.js';

  /** @typedef {'copy' | 'move'} ArchiveMode */

  /**
   * @type {{
   *   open?: boolean,
   *   count?: number,
   *   anchor?: HTMLElement | null,
   *   rail?: HTMLElement | null,
   *   themeColor?: string,
   *   dark?: boolean,
   *   uiFontSizePt?: number,
   *   onchoose: (mode: ArchiveMode) => void,
   *   onclose: (returnFocus: boolean) => void,
   * }}
   */
  let {
    open = false,
    count = 0,
    anchor = null,
    rail = null,
    themeColor = 'amber',
    dark = false,
    uiFontSizePt = 10,
    onchoose,
    onclose,
  } = $props();

  // 딱지에는 짧은 한 줄 설명만 두고(세로 크기를 줄인 가장 큰 요인), 긴 설명은 title·화면 낭독기로만 줍니다.
  /** @type {ReadonlyArray<{ id: ArchiveMode, label: string, short: string, long: string }>} */
  const CHOICES = [
    { id: 'copy', label: '복사해서 보관', short: '목록엔 그대로', long: '할 일은 목록에 그대로 두고 아카이브에 복사해요' },
    { id: 'move', label: '옮겨서 보관', short: '목록에선 빠져요', long: '목록에서 빼고 아카이브(보관함)로 옮겨요' },
  ];
  const NUB_EM = 0.45;
  const NUB_INSET_EM = 1.5;
  // 열린 직후 이 시간 안의 딱지 클릭은 무시합니다(위로 열린 경우 더블클릭의 둘째 클릭이 딱지에 떨어지는 사고 방지).
  const ARM_MS = 150;
  // 열린 채 창 크기가 바뀌어 여는 방향(위↔아래)이 달라져도, 이 시간 동안 그대로일 때만 뒤집습니다(끌기 중 깜빡임 방지).
  const FLIP_SETTLE_MS = 300;

  const uid = `am-${Math.random().toString(36).slice(2, 8)}`;
  const menuPt = $derived(resolveArchiveMenuPt(uiFontSizePt));
  const emPx = $derived(ptToPx(menuPt));
  const paletteStyle = $derived(archiveMenuPaletteToStyle(resolveArchiveMenuPalette(themeColor, dark)));
  const countLabel = $derived(countBubbleLabel(count));

  /** @type {null | { tier: 'l' | 'm' | 's', direction: 'down' | 'up', left: number, top: number, nubX: number, width: number, clipHeight: number | null }} */
  let layout = $state(null);
  let measureWidth = $state(200);
  /** @type {Record<'l' | 'm' | 's', HTMLElement | null>} */
  let measureEls = $state({ l: null, m: null, s: null });
  /** @type {HTMLElement | null} */
  let cardEl = $state(null);
  /** @type {ArchiveMode | ''} */
  let hovered = $state('');
  /** @type {ArchiveMode | ''} */
  let focused = $state('');
  const mood = $derived((hovered || focused || 'idle'));

  let armedAt = 0;
  let computing = false;
  let rerun = false;
  let raf = 0;
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let flipTimer = 0;
  let focusedOnce = false;

  /** body로 옮겨 그립니다. @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  /** @param {boolean} [settleFlip] 방향 뒤집기를 기다린 끝에 부른 것인지 */
  async function compute(settleFlip = false) {
    if (!open || !anchor?.isConnected) return;
    if (computing) { rerun = true; return; }
    computing = true;
    try {
      const anchorBox = anchor.getBoundingClientRect();
      const railBox = rail?.isConnected ? rail.getBoundingClientRect() : null;
      const width = resolveArchiveMenuWidth(menuPt, railBox ? railBox.width : window.innerWidth - 8);
      if (measureWidth !== width) {
        measureWidth = width;
        await tick();
      }
      // 글꼴이 다 불러와진 뒤의 실제 높이를 잽니다(글꼴이 바뀌며 넘치는 일 방지).
      await document.fonts?.ready;
      if (!open) return;
      const heights = {
        l: measureEls.l?.offsetHeight || 0,
        m: measureEls.m?.offsetHeight || 0,
        s: measureEls.s?.offsetHeight || 0,
      };
      const nubPx = NUB_EM * emPx;
      const room = measureArchiveMenuRoom({ anchor: anchorBox, rail: railBox, viewportHeight: window.innerHeight, nubPx });
      let pick = pickArchiveMenuTier({ heights, below: room.below, above: room.above });

      // 이미 열려 있고 방향만 바뀌었다면 잠깐 기다렸다가 그대로일 때 뒤집습니다.
      if (layout && pick.direction !== layout.direction && !settleFlip) {
        if (!flipTimer) {
          flipTimer = setTimeout(() => { flipTimer = 0; void compute(true); }, FLIP_SETTLE_MS);
        }
        const keep = layout.direction;
        const fits = /** @type {const} */ (['l', 'm', 's']).find((t) => heights[t] <= (keep === 'down' ? room.below : room.above));
        pick = { tier: fits ?? 's', direction: keep, clipped: !fits };
      }

      const height = heights[pick.tier];
      const placed = placeArchiveMenu({
        anchor: anchorBox,
        rail: railBox,
        viewportWidth: window.innerWidth,
        width,
        height,
        direction: pick.direction,
        tipDown: room.tipDown,
        tipUp: room.tipUp,
        nubPx,
        nubInset: NUB_INSET_EM * emPx,
      });
      layout = {
        tier: pick.tier,
        direction: pick.direction,
        left: placed.left,
        top: placed.top,
        nubX: placed.nubX,
        width,
        clipHeight: pick.clipped ? Math.max(0, pick.direction === 'down' ? room.below : room.above) : null,
      };
      if (!focusedOnce) {
        focusedOnce = true;
        armedAt = performance.now() + ARM_MS;
        await tick();
        // 열자마자 지워지지 않는 쪽(복사해서 보관)에 초점 — 키보드만으로 바로 고를 수 있게.
        /** @type {HTMLElement | null | undefined} */ (cardEl?.querySelector('[role="menuitem"]'))?.focus({ preventScroll: true });
      }
    } finally {
      computing = false;
      if (rerun) { rerun = false; schedule(); }
    }
  }

  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; void compute(); });
  }

  // 열기·닫기: 닫히면 다음 열림을 위해 상태를 비웁니다.
  $effect(() => {
    if (open) {
      schedule();
    } else {
      layout = null;
      focusedOnce = false;
      hovered = '';
      focused = '';
      if (flipTimer) { clearTimeout(flipTimer); flipTimer = 0; }
    }
  });

  // 설정 창 [적용](화면 글자·테마·다크)·고른 개수가 바뀌면 다시 재고 다시 놓습니다.
  $effect(() => {
    void [menuPt, count, themeColor, dark, anchor, rail];
    if (open) schedule();
  });

  // 창 크기·도크·버튼 크기 변화를 따라갑니다. 바깥 누름 · 창이 초점을 잃음 · Ctrl+Z/Y는 닫습니다.
  $effect(() => {
    if (!open) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());
    observer?.observe(document.documentElement);
    if (anchor) observer?.observe(anchor);
    if (rail) observer?.observe(rail);
    const onResize = () => schedule();
    const onFonts = () => schedule();
    /** @param {PointerEvent} event */
    const onOutside = (event) => {
      const target = /** @type {Node | null} */ (event.target);
      if (!target) return;
      if (cardEl?.contains(target) || anchor?.contains(target)) return;
      onclose(false);
    };
    const onBlur = () => onclose(false);
    /** @param {KeyboardEvent} event */
    const onUndoKeys = (event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) onclose(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onUndoKeys, true);
    document.addEventListener('pointerdown', onOutside, true);
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onUndoKeys, true);
      document.removeEventListener('pointerdown', onOutside, true);
      document.fonts?.removeEventListener?.('loadingdone', onFonts);
    };
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    if (flipTimer) clearTimeout(flipTimer);
  });

  /** @param {KeyboardEvent} event */
  function handleKeydown(event) {
    const items = /** @type {HTMLElement[]} */ ([...(cardEl?.querySelectorAll('[role="menuitem"]') ?? [])]);
    if (!items.length) return;
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    /** @param {number} index */
    const go = (index) => items[(index + items.length) % items.length]?.focus({ preventScroll: true });
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onclose(true);
        break;
      // 딱지가 가로로 나란해서 ←→가 자연스럽고, 목록 메뉴 습관대로 ↑↓도 같은 일을 합니다.
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        go(at + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        go(at - 1);
        break;
      case 'Home':
        event.preventDefault();
        go(0);
        break;
      case 'End':
        event.preventDefault();
        go(items.length - 1);
        break;
      case 'Tab':
        // 메뉴 안에서만 돕니다(바깥으로 나가면 열린 채 길을 잃음).
        event.preventDefault();
        go(at + (event.shiftKey ? -1 : 1));
        break;
      default:
        break;
    }
  }

  /** @param {ArchiveMode} mode */
  function choose(mode) {
    if (performance.now() < armedAt) return;
    onchoose(mode);
  }

  /** 편집 중 커서를 뺏지 않도록 마우스 누름의 기본 초점 이동을 막습니다(키보드 초점은 그대로). @param {MouseEvent} e */
  function keepFocus(e) {
    e.preventDefault();
  }
</script>

{#snippet picto(/** @type {ArchiveMode} */ mode)}
  <!-- 두 그림은 같은 틀("목록 → 상자")에 같은 자리. 차이는 하나뿐:
       복사 = 목록이 꽉 찬 채 카드 한 장이 상자로 / 옮김 = 목록 한 줄이 점선 빈칸으로 남고 그 줄이 상자로 -->
  <svg class="am-picto" viewBox="0 0 76 34" fill="none" aria-hidden="true" focusable="false">
    <rect class="pk-paper" x="3" y="3" width="24" height="28" rx="4" />
    <path class="pk-line" d="M9 10h12M9 17h12" />
    {#if mode === 'copy'}
      <path class="pk-line" d="M9 24h9" />
      <rect class="pk-card" x="31" y="5" width="13" height="15" rx="2.6" />
      <path class="pk-line thin" d="M34.5 10h6M34.5 14.5h4" />
      <path class="pk-arrow" d="M38 24.5h9.5m-3-3 3 3-3 3" />
    {:else}
      <path class="pk-gap" d="M9 24h12" />
      <path class="pk-line" d="M31 24h8" />
      <path class="pk-arrow" d="M31 17h16.5m-3-3 3 3-3 3" />
    {/if}
    <path class="pk-box" d="M52 14h21v17H52z" />
    <path class="pk-lid" d="M50 10h25v5.5H50z" />
    <path class="pk-line" d="M59.5 22.5h6" />
  </svg>
{/snippet}

{#snippet body(/** @type {'l' | 'm' | 's'} */ tier, /** @type {boolean} */ live)}
  {#if tier === 's'}
    <!-- S: 남은 높이가 아주 적을 때. 이름만 담은 알약 두 개(설명은 title·화면 낭독기). 상자 친구까지 넣을 가로 자리가 없습니다. -->
    <div class="am-pills">
      {#each CHOICES as c (c.id)}
        <button
          type="button"
          class="am-pill"
          role={live ? 'menuitem' : undefined}
          tabindex={live ? -1 : undefined}
          title={c.long}
          aria-describedby={live ? `${uid}-${c.id}` : undefined}
          onmousedown={keepFocus}
          onpointerenter={() => { hovered = c.id; }}
          onpointerleave={() => { hovered = ''; }}
          onfocus={() => { focused = c.id; }}
          onblur={() => { focused = ''; }}
          onclick={() => choose(c.id)}
        >
          {c.label}
        </button>
      {/each}
    </div>
  {:else}
    <div class="am-head">
      <ArchiveBuddy mood={live ? mood : 'idle'} size={tier === 'm' ? '1.5em' : '1.8em'} count={countLabel} />
      <span class="am-head-text">할 일 <b>{count}개</b>를 아카이브에</span>
    </div>
    <div class="am-tiles">
      {#each CHOICES as c (c.id)}
        <button
          type="button"
          class="am-tile"
          class:is-hover={live && hovered === c.id}
          role={live ? 'menuitem' : undefined}
          tabindex={live ? -1 : undefined}
          title={c.long}
          aria-describedby={live ? `${uid}-${c.id}` : undefined}
          onmousedown={keepFocus}
          onpointerenter={() => { hovered = c.id; }}
          onpointerleave={() => { hovered = ''; }}
          onfocus={() => { focused = c.id; }}
          onblur={() => { focused = ''; }}
          onclick={() => choose(c.id)}
        >
          {#if tier === 'l'}{@render picto(c.id)}{/if}
          <strong class="am-label">{c.label}</strong>
          <span class="am-caption">{c.short}</span>
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

{#if open}
  <div use:portal class="am-layer" style="{paletteStyle}; font-size: {menuPt}pt;">
    <!-- 단계별 실제 높이를 재는 숨은 사본(같은 폭·같은 글자). 화면 낭독기·초점에서 빠집니다. -->
    <div class="am-measure" aria-hidden="true" inert style="width: {measureWidth}px;">
      <div class="am-card tier-l" bind:this={measureEls.l}>{@render body('l', false)}</div>
      <div class="am-card tier-m" bind:this={measureEls.m}>{@render body('m', false)}</div>
      <div class="am-card tier-s" bind:this={measureEls.s}>{@render body('s', false)}</div>
    </div>

    <div
      bind:this={cardEl}
      class="am-card am-live tier-{layout?.tier ?? 'l'}"
      class:is-up={layout?.direction === 'up'}
      class:is-ready={!!layout}
      class:is-clipped={layout?.clipHeight != null}
      role="menu"
      tabindex="-1"
      aria-label={`할 일 ${count}개 · 아카이브(보관함)`}
      data-bulk-archive-menu
      data-tier={layout?.tier ?? ''}
      data-direction={layout?.direction ?? ''}
      style="left: {layout?.left ?? -9999}px; top: {layout?.top ?? -9999}px; width: {layout?.width ?? measureWidth}px; --am-nub-x: {layout?.nubX ?? 0}px;{layout?.clipHeight != null ? ` max-height: ${layout.clipHeight}px;` : ''}"
      onkeydown={handleKeydown}
    >
      <span class="am-nub" aria-hidden="true" data-archive-menu-nub></span>
      {@render body(layout?.tier ?? 'l', true)}
      {#each CHOICES as c (c.id)}
        <span class="am-sr" id={`${uid}-${c.id}`}>{c.long}</span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .am-layer {
    /* 카드만 보이는 투명 층. 크기·글자는 em이라 menuPt(9~12pt)를 따라 함께 움직입니다. */
    position: fixed;
    inset: 0 auto auto 0;
    width: 0;
    height: 0;
    z-index: 60;
    font-family: var(--ui-font-family, inherit);
    line-height: 1.25;
    color: var(--am-ink);
  }
  .am-measure {
    position: fixed;
    left: -10000px;
    top: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .am-measure .am-card { position: relative; margin-bottom: 4px; }

  /* ── 카드: 점무늬 · 1.5px 테두리 · 아래 받침(딱지 느낌) ── */
  .am-card {
    box-sizing: border-box;
    padding: 0.55em;
    border: 1.5px solid var(--am-card-border);
    border-radius: 1.1em;
    background-color: var(--am-card);
    /* space 반복: 점을 온전한 것만 고르게 놓아 모서리에서 반쪽 점이 잘리지 않습니다. */
    background-image: radial-gradient(var(--am-dot) 0.09em, transparent 0.13em);
    background-size: 1.35em 1.35em;
    background-repeat: space;
    box-shadow: 0 0.15em 0 var(--am-card-rim), 0 0.6em 1.4em rgba(15, 23, 42, 0.14);
    font-size: 1em;
  }
  .am-live {
    position: fixed;
    visibility: hidden;
    overflow: visible;
    transform-origin: calc(var(--am-nub-x) - 1.5px) 0;
  }
  .am-live.is-up { transform-origin: calc(var(--am-nub-x) - 1.5px) 100%; }
  .am-live.is-ready {
    visibility: visible;
    animation: am-pop 140ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .am-live.is-clipped { overflow: hidden auto; }
  .am-live:focus { outline: none; }
  @keyframes am-pop {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }

  /* ── 꼭지(▲): 끝이 [아카이브] 가운데를 가리킵니다. 카드와 같은 색·테두리라 한 몸처럼 보입니다. ── */
  .am-nub {
    position: absolute;
    top: -0.45em;
    /* absolute는 카드 테두리(1.5px) 안쪽에서 재므로, 꼭지 끝이 버튼 가운데에 정확히 오도록 테두리만큼 당깁니다. */
    left: calc(var(--am-nub-x) - 1.5px);
    width: 0.9em;
    height: 0.45em;
    margin-left: -0.45em;
    overflow: hidden;
    pointer-events: none;
  }
  .am-nub::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 0.18em;
    width: 0.62em;
    height: 0.62em;
    box-sizing: border-box;
    background: var(--am-card);
    border-top: 1.5px solid var(--am-card-border);
    border-left: 1.5px solid var(--am-card-border);
    border-radius: 0.12em 0 0 0;
    transform: translateX(-50%) rotate(45deg);
  }
  .is-up .am-nub { top: auto; bottom: -0.45em; }
  .is-up .am-nub::before {
    top: auto;
    bottom: 0.18em;
    border: 0;
    border-bottom: 1.5px solid var(--am-card-border);
    border-right: 1.5px solid var(--am-card-border);
    border-radius: 0 0 0.12em 0;
  }
  .am-live.is-clipped .am-nub { display: none; }

  /* ── 머리글: 친구 왼쪽 끝 = 딱지 왼쪽 끝, 글자는 친구 눈높이에 ── */
  .am-head {
    display: flex;
    align-items: center;
    gap: 0.6em;
    height: 1.8em;
    margin-bottom: 0.4em;
    padding-left: 0.05em;
  }
  /* M: 높이가 모자랄 때라 머리글도 친구 크기(1.5em)에 맞춰 낮춥니다. */
  .tier-m .am-head { height: 1.5em; margin-bottom: 0.35em; }
  .tier-m .am-tile { padding-block: 0.36em 0.34em; }
  .am-head-text {
    min-width: 0;
    overflow: hidden;
    font-size: 0.8em;
    white-space: nowrap;
    text-overflow: ellipsis;
    /* 상자 친구의 눈은 위에서 약 58% — 글자 가운데를 눈에 맞춰 친구가 "말하는" 느낌을 줍니다. */
    transform: translateY(0.14em);
    color: var(--am-ink);
  }
  .am-head-text b { color: var(--am-accent-ink); font-weight: 800; }

  /* ── 딱지 두 장 (L·M) ── */
  .am-tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45em;
  }
  .am-tile {
    display: grid;
    grid-template-rows: auto auto auto;
    justify-items: center;
    align-content: start;
    row-gap: 0.15em;
    min-width: 0;
    padding: 0.4em 0.35em 0.38em;
    border: 1.5px solid var(--am-tile-border);
    border-radius: 0.85em;
    background: var(--am-tile);
    color: var(--am-ink);
    box-shadow: 0 0.15em 0 var(--am-tile-rim);
    font: inherit;
    line-height: 1.2;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease, border-color 120ms ease;
  }
  .am-tile:hover,
  .am-tile:focus-visible,
  .am-tile.is-hover,
  .am-pill:hover,
  .am-pill:focus-visible {
    border-color: var(--am-tile-hover-border);
    background: var(--am-tile-hover);
  }
  .am-tile:hover,
  .am-tile.is-hover,
  .am-tile:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 0.2em 0 var(--am-tile-rim);
  }
  /* 초점 표시는 카드 안쪽 여백(0.55em) 안에 들어가 잘리지 않습니다. */
  .am-tile:focus-visible,
  .am-pill:focus-visible {
    outline: 1.5px solid var(--am-accent);
    outline-offset: 0.1em;
  }
  .am-tile:active,
  .am-pill:active { transform: translateY(0) scale(0.98); box-shadow: 0 0.08em 0 var(--am-tile-rim); }
  .am-label {
    font-size: 0.86em;
    font-weight: 800;
    letter-spacing: -0.03em;
    white-space: nowrap;
  }
  .am-tile:hover .am-label,
  .am-tile.is-hover .am-label,
  .am-tile:focus-visible .am-label { color: var(--am-accent-ink); }
  .am-caption {
    font-size: 0.7em;
    color: var(--am-muted);
    white-space: nowrap;
  }
  .am-picto {
    width: 4em;
    height: 1.55em;
    margin-bottom: 0.08em;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pk-paper { fill: var(--am-tile); stroke: var(--am-picto-ink); }
  .pk-line { stroke: var(--am-picto-ink); }
  .pk-line.thin { stroke-width: 1.3; }
  .pk-card { fill: var(--am-picto-fill); stroke: var(--am-accent); }
  .pk-box { fill: var(--am-picto-fill); stroke: var(--am-accent); }
  .pk-lid { fill: var(--am-tile); stroke: var(--am-accent); }
  .pk-arrow { stroke: var(--am-picto-ink); }
  .pk-gap { stroke: var(--am-accent); stroke-dasharray: 2 2.2; }

  /* ── S: 알약 두 개 한 줄 ── */
  .am-pills {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45em;
  }
  .am-pill {
    min-width: 0;
    padding: 0.42em 0.4em;
    border: 1.5px solid var(--am-tile-border);
    border-radius: 999px;
    background: var(--am-tile);
    color: var(--am-ink);
    box-shadow: 0 0.12em 0 var(--am-tile-rim);
    font: inherit;
    font-size: 0.86em;
    font-weight: 800;
    letter-spacing: -0.03em;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
  }

  .am-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .am-live.is-ready { animation: am-fade 120ms ease; }
    .am-tile, .am-pill { transition: none; }
    .am-tile:hover, .am-tile.is-hover, .am-tile:focus-visible { transform: none; }
  }
  @keyframes am-fade { from { opacity: 0; } to { opacity: 1; } }
</style>
