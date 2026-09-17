<script>
  import { onMount, tick } from 'svelte';
  import { X } from 'lucide-svelte';

  /** @type {{ id: string, label: string, heading?: string, buttonClass?: string, trigger: import('svelte').Snippet, children: import('svelte').Snippet<[(restoreFocus?: boolean) => void]> }} */
  let { id, label, heading = label, buttonClass = '', trigger, children } = $props();
  /** @type {HTMLButtonElement} */ let button;
  /** @type {HTMLDivElement} */ let panel;
  let open = $state(false);
  let native = $state(false);

  function position() {
    if (!panel || !button) return;
    const anchor = button.getBoundingClientRect();
    const padding = 8;
    const width = Math.min(216, window.innerWidth - padding * 2);
    panel.style.width = `${width}px`;
    const below = Math.max(0, window.innerHeight - anchor.bottom - 4 - padding);
    const above = Math.max(0, anchor.top - 4 - padding);
    const down = below >= 120 || below >= above;
    const space = down ? below : above;
    panel.style.maxHeight = `${Math.max(40, space)}px`;
    const height = Math.min(panel.scrollHeight + 2, Math.max(40, space));
    const top = down ? anchor.bottom + 4 : anchor.top - height - 4;
    panel.style.left = `${Math.max(padding, Math.min(anchor.right - width, window.innerWidth - width - padding))}px`;
    panel.style.top = `${Math.max(padding, top)}px`;
  }

  function close(restoreFocus = true) {
    if (native && panel?.matches(':popover-open')) panel.hidePopover();
    open = false;
    if (restoreFocus) button?.focus({ preventScroll: true });
  }

  async function show() {
    if (open) { close(); return; }
    document.dispatchEvent(new CustomEvent('tidy-header-popover', { detail: id }));
    open = true;
    await tick();
    if (native) panel.showPopover();
    position();
    panel.querySelector(/** @type {'button'} */ ('.tidy-header-menuitem, input'))?.focus({ preventScroll: true });
  }

  /** @param {KeyboardEvent} event */
  function keys(event) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    // Range inputs retain their native arrow-key behavior.
    if (event.target instanceof HTMLInputElement) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(panel.querySelectorAll('button:not(:disabled), input'));
    const index = document.activeElement ? items.indexOf(document.activeElement) : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    /** @type {HTMLElement} */ (items[next])?.focus();
  }

  onMount(() => {
    native = typeof panel.showPopover === 'function';
    /** @param {Event} event */
    const outside = (event) => {
      if (open && !panel.contains(/** @type {Node} */ (event.target)) && !button.contains(/** @type {Node} */ (event.target))) close(false);
    };
    /** @param {Event} event */
    const other = (event) => { if (/** @type {CustomEvent} */ (event).detail !== id) close(false); };
    const resize = () => { if (open) position(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('tidy-header-popover', other);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('tidy-header-popover', other);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<button bind:this={button} type="button" class="tidy-header-button {buttonClass}" aria-label={label}
  aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onclick={show}
  onkeydown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) show(); } }}>
  {@render trigger()}
</button>
<div bind:this={panel} {id} class="tidy-header-popover" class:fallback-open={!native && open}
  popover={native ? 'auto' : undefined} role="dialog" aria-label={label} tabindex="-1"
  onkeydown={keys} ontoggle={(event) => { if (event.newState === 'closed') open = false; }}>
  <div class="header-popover-caption"><strong>{heading}</strong><button class="header-popover-close" aria-label={`${label} 닫기`} title="닫기" onclick={() => close()}><X size={13}/></button></div>
  {@render children(close)}
</div>
