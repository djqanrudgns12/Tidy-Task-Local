<script lang="ts">
  // 작은 펼침 메뉴(점수판 고르기·더보기). 바깥을 누르거나 Esc를 누르면 닫히고, ↑↓로 항목을 옮깁니다.
  import type { Snippet } from 'svelte';
  type Item = { id: string; label: string; hint?: string; danger?: boolean; disabled?: boolean; checked?: boolean; divider?: boolean; onselect?: () => void };
  let {
    label,
    items,
    align = 'left',
    triggerClass = '',
    trigger,
  } = $props<{ label: string; items: Item[]; align?: 'left' | 'right'; triggerClass?: string; trigger: Snippet }>();
  let open = $state(false);
  let root = $state<HTMLElement>();
  let list = $state<HTMLElement>();

  function toggle() {
    open = !open;
    if (open) queueMicrotask(() => list?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
  }
  function choose(item: Item) {
    if (item.disabled) return;
    open = false;
    item.onselect?.();
  }
  function keys(e: KeyboardEvent) {
    const buttons = Array.from(list?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      open = false;
      root?.querySelector<HTMLButtonElement>('.sb-menu-trigger')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }
  function outside(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={outside} />
<div class="sb-menu" bind:this={root}>
  <button class={`sb-menu-trigger ${triggerClass}`} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onclick={toggle}>{@render trigger()}</button>
  {#if open}
    <div class="sb-menu-list" class:right={align === 'right'} role="menu" tabindex="-1" bind:this={list} onkeydown={keys}>
      {#each items as item (item.id)}
        {#if item.divider}<hr />{:else}
          <button role="menuitem" class:danger={item.danger} class:checked={item.checked} disabled={item.disabled} onclick={() => choose(item)}>
            <span class="sb-menu-label">{item.label}</span>{#if item.hint}<small>{item.hint}</small>{/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>
