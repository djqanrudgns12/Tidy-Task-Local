<script>
  /**
   * 공용 22px 하단 모노라인 아이콘 유틸 독 (Pocket Compact Design System v2.0)
   *
   * @type {{
   *   ariaLabel?: string,
   *   left?: import('svelte').Snippet,
   *   right?: import('svelte').Snippet,
   * }}
   */
  let {
    ariaLabel = '보조 도구',
    left = undefined,
    right = undefined,
  } = $props();
</script>

<div class="ctx-dock" role="group" aria-label={ariaLabel}>
  <div class="ctx-dock-group">
    {#if left}{@render left()}{/if}
  </div>
  <div class="ctx-dock-group">
    {#if right}{@render right()}{/if}
  </div>
</div>

<style>
  .ctx-dock {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--ctx-line);
  }

  .ctx-dock-group {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .ctx-dock :global(.dock-btn) {
    width: 24px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--ctx-radius-ctrl, 6px);
    background: transparent;
    color: var(--ctx-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, transform 90ms ease;
  }
  .ctx-dock :global(.dock-btn.compact) {
    width: 23px;
  }
  .ctx-dock :global(.dock-btn:hover:not(:disabled)) {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
  }
  .ctx-dock :global(.dock-btn:active:not(:disabled)) {
    transform: scale(0.93);
  }
  .ctx-dock :global(.dock-btn:disabled) {
    opacity: 0.32;
    cursor: default;
  }
  .ctx-dock :global(.dock-btn:focus) {
    outline: none;
  }
  .ctx-dock :global(.dock-btn:focus-visible) {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .ctx-dock :global(.dock-pill) {
    height: 22px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--ctx-radius-ctrl, 6px);
    background: transparent;
    color: var(--ctx-muted);
    font-family: inherit;
    font-size: clamp(9px, 0.76em, calc(10px * var(--ctx-fs-scale, 1)));
    font-weight: 600;
    letter-spacing: -0.02em;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 3.5px;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, transform 90ms ease;
  }
  .ctx-dock :global(.dock-pill:hover:not(:disabled)) {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
  }
  .ctx-dock :global(.dock-pill:active:not(:disabled)) {
    transform: scale(0.95);
  }
  .ctx-dock :global(.dock-pill:disabled) {
    opacity: 0.32;
    cursor: default;
  }
  .ctx-dock :global(.dock-pill:focus) {
    outline: none;
  }
  .ctx-dock :global(.dock-pill:focus-visible) {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }
</style>
