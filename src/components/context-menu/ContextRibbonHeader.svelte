<script>
  /**
   * 공용 24px 파스텔 미니 리본 헤더 (Pocket Compact Design System v2.0)
   * todo · dday-banner · bar · text · tiny · DdayControlModal(.ctrl-ctx) 공용 부품.
   *
   * @type {{
   *   title?: string,
   *   emptyTitle?: string,
   *   leftChip?: string,
   *   leftChipStyle?: string,
   *   leftSolid?: boolean,
   *   leftDot?: boolean,
   *   rightChip?: string,
   *   rightMeta?: string,
   *   left?: import('svelte').Snippet,
   *   right?: import('svelte').Snippet,
   * }}
   */
  let {
    title = '',
    emptyTitle = '',
    leftChip = '',
    leftChipStyle = '',
    leftSolid = false,
    leftDot = false,
    rightChip = '',
    rightMeta = '',
    left = undefined,
    right = undefined,
  } = $props();
</script>

<div class="ctx-ribbon" aria-hidden={right ? undefined : 'true'}>
  {#if left}
    <span class="ctx-ribbon-slot">{@render left()}</span>
  {:else if leftChip}
    <span
      class="ctx-ribbon-chip"
      class:solid={leftSolid}
      style={leftChipStyle || undefined}
    >{leftChip}</span>
  {:else if leftDot}
    <span class="ctx-ribbon-dot"></span>
  {/if}

  <span class="ctx-ribbon-title" class:empty={!title}>
    {title || emptyTitle}
  </span>

  {#if right}
    <span class="ctx-ribbon-right">{@render right()}</span>
  {:else if rightChip}
    <span class="ctx-ribbon-chip solid">{rightChip}</span>
  {:else if rightMeta}
    <span class="ctx-ribbon-meta">{rightMeta}</span>
  {/if}
</div>

<style>
  .ctx-ribbon {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 6px;
    margin-bottom: 5px;
    border-radius: var(--ctx-radius-card, 8px);
    background: var(--ctx-accent-soft);
  }

  .ctx-ribbon-slot {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    color: var(--ctx-accent);
  }

  .ctx-ribbon-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: var(--ctx-radius-pill, 999px);
    background: var(--ctx-accent);
    box-shadow: 0 0 0 2px var(--ctx-accent-border);
  }

  .ctx-ribbon-chip {
    flex-shrink: 0;
    padding: 1.5px 5px;
    border-radius: var(--ctx-radius-pill, 999px);
    font-size: calc(9px * var(--ctx-fs-scale, 1));
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .ctx-ribbon-chip.solid {
    background: var(--ctx-accent);
    color: var(--ctx-accent-ink);
  }

  .ctx-ribbon-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(10px, 0.86em, calc(11.5px * var(--ctx-fs-scale, 1)));
    font-weight: 700;
    letter-spacing: -0.015em;
    color: var(--ctx-ink);
  }

  .ctx-ribbon-title.empty {
    color: var(--ctx-muted);
    font-weight: 600;
  }

  .ctx-ribbon-meta {
    flex-shrink: 0;
    font-size: clamp(8.5px, 0.72em, calc(9.5px * var(--ctx-fs-scale, 1)));
    font-weight: 600;
    color: var(--ctx-muted);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .ctx-ribbon-right {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    margin-right: -3px;
  }
</style>
