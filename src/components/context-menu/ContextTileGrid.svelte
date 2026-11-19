<script>
  import { CONTEXT_DUOTONE_ICONS } from '../../lib/contextMenuIcons.js';

  /**
   * @typedef {{
   *   id: string,
   *   icon: keyof typeof CONTEXT_DUOTONE_ICONS,
   *   label: string,
   *   tone?: 'accent' | 'warn' | 'sky' | 'ok' | 'danger' | 'neutral',
   *   active?: boolean,
   *   activeBorder?: boolean,
   *   dot?: boolean,
   *   badge?: string | number,
   *   disabled?: boolean,
   *   title?: string,
   *   tip?: string,
   *   role?: 'menuitem' | 'menuitemcheckbox',
   *   checked?: boolean,
   *   onclick: () => void,
   * }} PocketTile
   */

  /**
   * 공용 35px 가로형 Soft-Duotone 파스텔 퀵 타일 그리드 (3~4칸)
   *
   * @type {{
   *   tiles: PocketTile[],
   *   ariaLabel?: string,
   *   columns?: number,
   * }}
   */
  let {
    tiles = [],
    ariaLabel = '빠른 동작',
    columns = undefined,
  } = $props();

  const colCount = $derived(columns ?? Math.max(1, tiles.length));
</script>

<div
  class="ctx-tiles"
  role="group"
  aria-label={ariaLabel}
  style="--ctx-tile-cols:{colCount};"
>
  {#each tiles as tile, idx (tile.id)}
    {@const iconSpec = CONTEXT_DUOTONE_ICONS[tile.icon] || CONTEXT_DUOTONE_ICONS.flag}
    {@const tipAlign = idx === 0 ? 'tip-left' : idx === tiles.length - 1 ? 'tip-right' : ''}
    {@const hasTip = Boolean(tile.tip)}
    <button
      type="button"
      role={tile.role || 'menuitem'}
      aria-checked={tile.role === 'menuitemcheckbox' ? Boolean(tile.checked) : undefined}
      class="ctx-tile tone-{tile.tone || 'neutral'} {hasTip ? `ctx-tip ${tipAlign}` : ''}"
      class:active-border={tile.activeBorder}
      disabled={tile.disabled}
      title={tile.title || tile.tip || tile.label}
      data-tip={tile.tip || undefined}
      onclick={() => tile.onclick()}
    >
      {#if tile.dot}
        <span class="ctx-tile-dot" aria-hidden="true"></span>
      {:else if tile.badge !== undefined && tile.badge !== '' && tile.badge !== 0}
        <span class="ctx-tile-badge" aria-hidden="true">{tile.badge}</span>
      {/if}
      <span class="ctx-tile-icon" aria-hidden="true">
        <svg
          width={iconSpec.size}
          height={iconSpec.size}
          viewBox="0 0 24 24"
          fill="none"
          style={iconSpec.shiftX ? `transform:translateX(${iconSpec.shiftX}px);` : undefined}
        >
          {@html iconSpec.renderBody(Boolean(tile.active))}
        </svg>
      </span>
      <span class="ctx-tile-label">{tile.label}</span>
    </button>
  {/each}
</div>

<style>
  .ctx-tiles {
    display: grid;
    grid-template-columns: repeat(var(--ctx-tile-cols, 4), minmax(0, 1fr));
    gap: 3px;
  }

  .ctx-tile {
    position: relative;
    height: 35px;
    padding: 3px 2px 4px;
    border-radius: var(--ctx-radius-card, 8px);
    border: 1px solid transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
    font-family: inherit;
    transition: transform 105ms ease, background-color 110ms ease, border-color 110ms ease, color 110ms ease;
  }
  .ctx-tile:hover:not(:disabled) {
    transform: translateY(-0.5px);
  }
  .ctx-tile:active:not(:disabled) {
    transform: scale(0.96);
  }
  .ctx-tile:disabled {
    opacity: 0.36;
    cursor: default;
  }
  .ctx-tile:focus {
    outline: none;
  }
  .ctx-tile:focus-visible {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .ctx-tile-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: var(--ctx-accent);
  }

  .ctx-tile-badge {
    position: absolute;
    top: 2px;
    right: 3.5px;
    font-size: 8px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    opacity: 0.92;
  }

  .ctx-tile-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .ctx-tile-label {
    font-size: clamp(9px, 0.76em, 10px);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.025em;
    white-space: nowrap;
  }

  /* ── 시맨틱 6톤 ── */
  .tone-accent {
    background: var(--ctx-accent-soft);
    border-color: var(--ctx-accent-border);
    color: var(--ctx-accent);
  }
  .tone-accent:hover:not(:disabled) {
    background: var(--ctx-accent-hover);
  }

  .tone-warn {
    background: var(--ctx-warn-soft);
    color: var(--ctx-ink);
  }
  .tone-warn .ctx-tile-icon { color: var(--ctx-warn); }
  .tone-warn.active-border { border-color: var(--ctx-warn-border); }
  .tone-warn:hover:not(:disabled) {
    background: var(--ctx-warn-hover);
    border-color: var(--ctx-warn-border);
  }

  .tone-sky {
    background: var(--ctx-sky-soft);
    color: var(--ctx-ink);
  }
  .tone-sky .ctx-tile-icon { color: var(--ctx-sky); }
  .tone-sky.active-border { border-color: var(--ctx-sky-border); }
  .tone-sky:hover:not(:disabled) {
    background: var(--ctx-sky-hover);
    border-color: var(--ctx-sky-border);
  }

  .tone-ok {
    background: var(--ctx-ok-soft);
    color: var(--ctx-ink);
  }
  .tone-ok .ctx-tile-icon { color: var(--ctx-ok); }
  .tone-ok.active-border { border-color: var(--ctx-ok-border); }
  .tone-ok:hover:not(:disabled) {
    background: var(--ctx-ok-hover);
    border-color: var(--ctx-ok-border);
  }

  .tone-danger {
    background: var(--ctx-danger-soft);
    color: var(--ctx-danger);
  }
  .tone-danger:hover:not(:disabled) {
    background: var(--ctx-danger-hover);
    border-color: var(--ctx-danger-border);
  }

  .tone-neutral {
    background: var(--ctx-field);
    border-color: var(--ctx-line);
    color: var(--ctx-muted);
  }
  .tone-neutral .ctx-tile-icon { color: var(--ctx-muted); }
  .tone-neutral:hover:not(:disabled) {
    background: var(--ctx-hover);
    color: var(--ctx-ink);
    border-color: var(--ctx-line-outer);
  }
</style>
