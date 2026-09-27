<script lang="ts">
  // 캐릭터·색·무늬 고르기(PRD 4절 배정 규칙). 다른 후보가 쓰는 것에는 "n번"이 붙고, 고르면 두 후보가 서로 바꿉니다.
  import { onMount } from 'svelte';
  import { charactersOf } from '../../../lib/vote/characters.js';
  import { PALETTE, PATTERNS } from '../../../lib/vote/palette.js';
  import { withJosa } from '../../../lib/vote/model.js';
  import Sticker from '../common/Sticker.svelte';
  let { kind, item, items, type, anchor, onchoose, onclose } = $props<{
    kind: 'character' | 'color' | 'pattern'; item: any; items: any[]; type: string; anchor: HTMLButtonElement | undefined; onchoose: (value: string) => void; onclose: () => void;
  }>();
  let box = $state<HTMLDivElement>();
  const label = $derived(kind === 'character' ? '캐릭터' : kind === 'color' ? '색' : '무늬');
  const usedBy = (field: string, value: string) => items.find((it: any) => it.id !== item.id && it[field] === value)?.number ?? null;
  function choose(value: string) {
    anchor?.focus({ preventScroll: true });
    onchoose(value);
  }
  onMount(() => {
    const panel = box;
    const trigger = anchor;
    if (!panel || !trigger) return;
    // 최상위 레이어에서 열어 스크롤 영역의 overflow에 잘리지 않도록 합니다.
    const parent = panel.parentElement;
    const sibling = panel.nextSibling;
    const native = typeof panel.showPopover === 'function';
    if (native) panel.showPopover();
    else panel.closest('.vt-root')?.appendChild(panel);

    const position = () => {
      const padding = 12;
      const gap = 8;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + padding;
      const topEdge = (viewport?.offsetTop ?? 0) + padding;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - padding * 2;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - padding * 2;
      const rect = trigger.getBoundingClientRect();
      panel.style.width = `${Math.min(460, rightEdge - leftEdge)}px`;
      panel.style.maxHeight = `${bottomEdge - topEdge}px`;
      const below = Math.max(0, bottomEdge - rect.bottom - gap);
      const above = Math.max(0, rect.top - gap - topEdge);
      const down = below >= panel.offsetHeight || below >= above;
      panel.style.maxHeight = `${down ? below : above}px`;
      const top = down ? rect.bottom + gap : rect.top - gap - panel.offsetHeight;
      panel.style.left = `${Math.max(leftEdge, Math.min(rect.right - panel.offsetWidth, rightEdge - panel.offsetWidth))}px`;
      panel.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - panel.offsetHeight))}px`;
    };
    const outside = (e: Event) => {
      if (!panel.contains(e.target as Node) && !trigger.contains(e.target as Node)) onclose();
    };
    const scroll = (e: Event) => {
      if (!(e.target instanceof Node) || !panel.contains(e.target)) onclose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        trigger.focus({ preventScroll: true });
        onclose();
      }
    };
    position();
    const selected = panel.querySelector<HTMLElement>('[aria-checked="true"]') ?? panel.querySelector<HTMLElement>('button');
    selected?.focus({ preventScroll: true });
    if (selected) panel.scrollTop = Math.max(0, selected.offsetTop + selected.offsetHeight - panel.clientHeight);
    // 여는 클릭이 곧바로 닫기로 잡히지 않게 다음 틱에 붙입니다.
    const t = setTimeout(() => window.addEventListener('pointerdown', outside), 0);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('focusin', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('focusin', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      if (panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
      if (native && panel.matches(':popover-open')) panel.hidePopover();
      else if (!native && parent?.isConnected) parent.insertBefore(panel, sibling);
    };
  });
</script>

<div class="vt-picker vt-card vt-pop-in" bind:this={box} popover="manual" role="dialog" aria-label={`${label} 고르기`}>
  <p class="vt-picker-note">{withJosa(label, '을/를')} 골라요 · 다른 {withJosa(type === 'opinion' ? '항목' : '후보', '이/가')} 쓰는 것을 고르면 서로 바꿔요</p>
  <div class="vt-picker-grid" data-kind={kind} role="radiogroup">
    {#if kind === 'character'}
      {#each charactersOf(item.gender) as c (c.id)}
        {@const owner = usedBy('character', c.id)}
        <button role="radio" aria-checked={item.character === c.id} title={c.label} onclick={() => choose(c.id)}>
          <Sticker item={{ ...item, character: c.id }} {type} size={64} />
          <small>{c.label.split(' · ')[0]}</small>
          {#if owner}<span class="vt-picker-owner">{owner}번</span>{/if}
        </button>
      {/each}
    {:else if kind === 'color'}
      {#each PALETTE as c (c.id)}
        {@const owner = usedBy('color', c.id)}
        <button role="radio" aria-checked={item.color === c.id} title={c.label} onclick={() => choose(c.id)}>
          <span class="vt-swatch" style:background={c.bg} style:border-color={c.line}><i style:background={c.ink}></i></span>
          <small>{c.label}</small>
          {#if owner}<span class="vt-picker-owner">{owner}번</span>{/if}
        </button>
      {/each}
    {:else}
      {#each PATTERNS as p (p.id)}
        {@const owner = usedBy('pattern', p.id)}
        <button role="radio" aria-checked={item.pattern === p.id} title={p.label} onclick={() => choose(p.id)}>
          <Sticker item={{ ...item, pattern: p.id }} type="opinion" size={56} />
          <small>{p.label}</small>
          {#if owner}<span class="vt-picker-owner">{owner}번</span>{/if}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .vt-picker {
    position: fixed;
    inset: auto;
    margin: 0;
    z-index: 30;
    width: min(460px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 14px;
    border-radius: 20px;
    color: var(--vt-ink);
    box-shadow: var(--vt-shadow-lift);
  }
  .vt-picker-note {
    margin: 0 4px 10px;
    color: var(--vt-muted);
    font-size: 13px;
    font-weight: 700;
    white-space: normal;
    word-break: keep-all;
  }
  .vt-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 8px;
  }
  .vt-picker-grid[data-kind='color'] {
    grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  }
  .vt-picker-grid button {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 10px 4px 8px;
    border: 2px solid transparent;
    border-radius: 16px;
    background: transparent;
    color: var(--vt-ink);
  }
  .vt-picker-grid button:hover {
    background: var(--vt-soft);
  }
  .vt-picker-grid button[aria-checked='true'] {
    border-color: var(--vt-accent);
    background: color-mix(in srgb, var(--vt-accent) 8%, var(--vt-card));
  }
  .vt-picker-grid small {
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .vt-picker-owner {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--vt-ink);
    color: var(--tk-panel);
    font-size: 11px;
    font-weight: 900;
  }
  .vt-swatch {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 3px solid;
    border-radius: 50%;
  }
  .vt-swatch i {
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }
</style>
