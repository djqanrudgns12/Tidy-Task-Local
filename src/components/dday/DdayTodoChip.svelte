<script>
  import { badgePaletteToStyle, resolveTodoBadgeModel } from '../../lib/dday/ddayBadge.js';

  /**
   * @type {{
   *   item: import('../../lib/dday/ddayModel.js').DdayItem,
   *   todayKey: string,
   *   themeColor?: string,
   *   dark?: boolean,
   *   variant?: 'todo' | 'header',
   *   titleOverride?: string,
   *   dataSurface?: string,
   *   dataDdayId?: string,
   *   onclick?: (event: MouseEvent) => void,
   * }}
   */
  let {
    item,
    todayKey,
    themeColor = 'amber',
    dark = false,
    variant = 'todo',
    titleOverride = '',
    dataSurface = '',
    dataDdayId = '',
    onclick = undefined,
  } = $props();

  const model = $derived(resolveTodoBadgeModel(item, todayKey, { themeColor, dark }));
</script>

<button
  type="button"
  class="dday-smart-chip"
  class:is-header={variant === 'header'}
  class:is-dashed={model.dashed}
  class:is-solid={model.palette.solid}
  class:is-today={model.badgeKind === 'countdown-today'}
  data-scheme={dark ? 'dark' : 'light'}
  data-dday-kind={model.badgeKind}
  data-dday-surface={dataSurface || undefined}
  data-dday-id={dataDdayId || undefined}
  style={badgePaletteToStyle(model.palette)}
  title={titleOverride || model.title}
  aria-label={model.ariaLabel}
  onmousedown={(e) => e.preventDefault()}
  {onclick}
>
  <svg
    class="chip-glyph"
    viewBox="0 0 16 16"
    fill="none"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {#if model.glyph === 'bell-spark'}
      <path d="M6.3 12.7a1.8 1.8 0 0 0 3.4 0" stroke="var(--dd-icon)" stroke-width="1.5" />
      <path
        d="M4.1 11.4c1.1-1.2 1-3.1 1.3-4.9a2.65 2.65 0 0 1 5.2 0c.3 1.8.2 3.7 1.3 4.9H4.1Z"
        fill="var(--dd-icon-soft)"
        stroke="var(--dd-icon)"
        stroke-width="1.45"
      />
      <path d="M8 1.9v1.3M2.8 5.2l-.9 1.3m11.3-1.3.9 1.3" stroke="var(--dd-icon)" stroke-width="1.45" />
    {:else if model.glyph === 'star-burst'}
      <path
        d="M8 1.8 9.6 5.9 13.8 7.5 9.6 9.1 8 13.2 6.4 9.1 2.2 7.5 6.4 5.9Z"
        fill="var(--dd-icon)"
        stroke="var(--dd-icon-soft)"
        stroke-width="0.9"
      />
      <circle cx="13.2" cy="3.1" r="1.05" fill="var(--dd-icon)" />
    {:else if model.glyph === 'clock-past'}
      <circle cx="8" cy="8" r="5.3" fill="var(--dd-icon-soft)" stroke="var(--dd-icon)" stroke-width="1.5" />
      <path d="M8 5.1V8l-2.1 1.4" stroke="var(--dd-icon)" stroke-width="1.55" />
    {:else if model.glyph === 'loop-mini'}
      <path
        d="M3.7 7.1A4.5 4.5 0 0 1 11.4 4.7M12.3 8.9A4.5 4.5 0 0 1 4.6 11.3"
        stroke="var(--dd-icon)"
        stroke-width="1.55"
      />
      <path
        d="M10.1 2.9 12 4.9l-2.3.5M5.9 13.1 4 11.1l2.3-.5"
        stroke="var(--dd-icon)"
        stroke-width="1.5"
      />
      <circle cx="8" cy="8" r="1.45" fill="var(--dd-icon)" />
    {:else if model.glyph === 'sprout-mini'}
      <path d="M8 13.6V7.4M5 13.6h6" stroke="var(--dd-icon)" stroke-width="1.55" />
      <path
        d="M8 8.8c-3.1 0-4.9-1.8-4.9-4.5 3 0 4.9 1.4 4.9 4.5Z"
        fill="var(--dd-icon-soft)"
        stroke="var(--dd-icon)"
        stroke-width="1.4"
      />
      <path
        d="M8 7.5c3.1 0 4.9-1.8 4.9-4.5-3 0-4.9 1.4-4.9 4.5Z"
        fill="var(--dd-icon)"
        stroke="var(--dd-icon)"
        stroke-width="1.3"
      />
    {:else if model.glyph === 'seed-plus'}
      <circle cx="6.1" cy="10.4" r="3" fill="var(--dd-icon-soft)" stroke="var(--dd-icon)" stroke-width="1.5" />
      <path d="M11.6 3.1v4.2M9.5 5.2h4.2" stroke="var(--dd-icon)" stroke-width="1.65" />
    {:else}
      <!-- hourglass-mini: 차감식 기본 모래시계 -->
      <path d="M4.2 2.5h7.6M4.2 13.5h7.6" stroke="var(--dd-icon)" stroke-width="1.6" />
      <path
        d="M5.2 2.7v2.1c0 1.6 2.8 2.4 2.8 3.2s-2.8 1.6-2.8 3.2v2.1h5.6v-2.1c0-1.6-2.8-2.4-2.8-3.2s2.8-1.6 2.8-3.2V2.7Z"
        fill="var(--dd-icon-soft)"
        stroke="var(--dd-icon)"
        stroke-width="1.4"
      />
      <path d="M6.2 12.8h3.6c0-1.1-.8-2-1.8-2.4-1 .4-1.8 1.3-1.8 2.4Z" fill="var(--dd-icon)" />
    {/if}
  </svg>
  <span class="chip-label tnum">{model.label}</span>
</button>

<style>
  .dday-smart-chip {
    --dd-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3.5px;
    min-height: 20px;
    padding: 0.22em 0.56em 0.22em 0.42em;
    border-radius: 999px;
    border: 1px solid var(--dd-border);
    background-color: var(--dd-bg);
    color: var(--dd-ink);
    /* UndoToast와 동일한 아래쪽 안쪽 받침으로 딱지처럼 도톰한 손맛을 줍니다. */
    box-shadow: inset 0 -1.5px 0 var(--dd-rim);
    font-family: var(--ui-font-family);
    font-size: clamp(9.5px, calc(var(--global-font-size, 10pt) * 0.78), 13.5px);
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      transform 200ms var(--dd-spring);
  }

  /* 머리 영역(제목줄 옆) 칩은 할 일 줄이 아니라 화면 글자 크기를 따릅니다. 배율 범위는 DdayBanner와 같습니다. */
  .dday-smart-chip.is-header {
    --dd-s: clamp(0.8, var(--ui-font-scale, 1), 1.5);
    min-height: 0;
    height: calc(22px * var(--dd-s));
    padding: 0 7px 0 5.5px;
    font-size: calc(10.5px * var(--dd-s));
  }

  .dday-smart-chip.is-dashed {
    border-style: dashed;
  }

  .dday-smart-chip:hover {
    background-color: var(--dd-hover-bg);
    border-color: var(--dd-hover-border);
    transform: translateY(-0.5px) scale(1.05);
  }

  .dday-smart-chip:active {
    transform: scale(1.03, 0.90);
    transition-duration: 140ms, 140ms, 90ms;
  }

  .dday-smart-chip:focus-visible {
    outline: 2px solid var(--dd-focus);
    outline-offset: 1.5px;
  }

  .chip-glyph {
    width: 1.15em;
    height: 1.15em;
    min-width: 11px;
    min-height: 11px;
    display: block;
    flex: none;
    /* 하단 1.5px 딱지 받침을 제외한 시각 표면에 아이콘 중심을 맞춥니다. */
    transform: translateY(-0.5px);
  }

  .chip-label {
    display: inline-block;
    line-height: 1;
    /* 한글 폰트 em-box 하단 descender 공백으로 글자가 위로 뜨는 현상을 실측 기준으로 광학 보정합니다. */
    transform: translateY(var(--dd-label-nudge, 0.065em));
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.025em;
  }

  @media (prefers-reduced-motion: reduce) {
    .dday-smart-chip {
      transition: background-color 140ms ease, border-color 140ms ease;
    }
    .dday-smart-chip:hover,
    .dday-smart-chip:active {
      transform: none;
    }
  }
</style>
