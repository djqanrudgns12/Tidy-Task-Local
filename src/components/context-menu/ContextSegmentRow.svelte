<script>
  /**
   * @typedef {{
   *   id: string,
   *   label: string,
   *   active: boolean,
   *   title?: string,
   *   disabled?: boolean,
   *   onclick: () => void,
   * }} SegmentOption
   */

  /**
   * 공용 콤팩트 세그먼트/채널 토글 줄 (D-Day 표시 채널 · 배너 모드 · 메인 화면 표시 공용)
   *
   * @type {{
   *   label?: string,
   *   mode?: 'multi' | 'radio',
   *   options: SegmentOption[],
   *   ariaLabel?: string,
   * }}
   */
  let {
    label = '',
    mode = 'multi',
    options = [],
    ariaLabel = '',
  } = $props();
</script>

<div class="ctx-seg-row" role={mode === 'radio' ? 'radiogroup' : 'group'} aria-label={ariaLabel || label || '옵션'}>
  {#if label}
    <span class="ctx-seg-label">{label}</span>
  {/if}
  <div
    class="ctx-seg-track"
    class:radio={mode === 'radio'}
    style="--ctx-seg-cols:{Math.max(1, options.length)};"
  >
    {#each options as opt (opt.id)}
      <button
        type="button"
        role={mode === 'radio' ? 'menuitemradio' : 'menuitemcheckbox'}
        aria-checked={opt.active}
        class="ctx-seg-btn"
        class:multi={mode === 'multi'}
        class:radio={mode === 'radio'}
        class:on={opt.active}
        disabled={opt.disabled}
        title={opt.title || opt.label}
        onclick={() => opt.onclick()}
      >
        {#if mode === 'multi'}
          <span class="ctx-seg-dot" class:on={opt.active} aria-hidden="true"></span>
        {/if}
        <span>{opt.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .ctx-seg-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ctx-seg-label {
    width: 26px;
    flex-shrink: 0;
    text-align: center;
    font-size: clamp(8.5px, 0.74em, calc(9.5px * var(--ctx-fs-scale, 1)));
    font-weight: 700;
    color: var(--ctx-muted);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .ctx-seg-track {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(var(--ctx-seg-cols, 3), minmax(0, 1fr));
    gap: 2px;
  }

  .ctx-seg-track.radio {
    padding: 2px;
    border-radius: var(--ctx-radius-ctrl, 6px);
    background: var(--ctx-hover);
  }

  .ctx-seg-btn {
    border: 1px solid transparent;
    background: transparent;
    color: var(--ctx-muted);
    font-family: inherit;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0 2px;
    transition: background-color 110ms ease, color 110ms ease, border-color 110ms ease, transform 90ms ease;
  }
  .ctx-seg-btn:hover:not(:disabled) {
    color: var(--ctx-ink);
    background: var(--ctx-hover);
  }
  .ctx-seg-btn:active:not(:disabled) {
    transform: scale(0.96);
  }
  .ctx-seg-btn:disabled {
    opacity: 0.36;
    cursor: default;
  }
  .ctx-seg-btn:focus {
    outline: none;
  }
  .ctx-seg-btn:focus-visible {
    outline: 1.5px solid var(--ctx-accent);
    outline-offset: -1px;
  }

  .ctx-seg-btn.multi {
    height: 23px;
    border-radius: var(--ctx-radius-ctrl, 6px);
    font-size: clamp(9px, 0.76em, calc(10px * var(--ctx-fs-scale, 1)));
  }
  .ctx-seg-btn.multi.on {
    background: var(--ctx-accent-soft);
    border-color: var(--ctx-accent-border);
    color: var(--ctx-accent);
  }
  .ctx-seg-btn.multi.on:hover:not(:disabled) {
    background: var(--ctx-accent-hover);
  }

  .ctx-seg-btn.radio {
    height: 20px;
    border-radius: 4.5px;
    font-size: clamp(8.5px, 0.74em, calc(9.5px * var(--ctx-fs-scale, 1)));
  }
  .ctx-seg-btn.radio.on {
    background: var(--ctx-surface);
    border-color: var(--ctx-accent-border);
    color: var(--ctx-accent);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  }

  .ctx-seg-dot {
    width: 4.5px;
    height: 4.5px;
    border-radius: 999px;
    background: var(--ctx-line-outer);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }
  .ctx-seg-dot.on {
    background: var(--ctx-accent);
  }
</style>
