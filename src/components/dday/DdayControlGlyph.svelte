<script>
  /**
   * @type {{
   *   state: import('../../lib/dday/ddayBadge.js').DdayControlGlyphState,
   *   size?: number,
   *   className?: string,
   * }}
   */
  let {
    state,
    size = 18,
    className = '',
  } = $props();
</script>

<svg
  class={`dday-ctrl-glyph ${className}`.trim()}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <!-- 둥근 미니 플립 캘린더 몸통 + 파스텔 상단 띠 -->
  <rect
    x="3"
    y="5"
    width="18"
    height="16.5"
    rx="4.5"
    fill={state.palette.bodyFill}
    stroke={state.palette.stroke}
    stroke-width="1.8"
  />
  <path
    d="M7.5 5h9A4.5 4.5 0 0 1 21 9.5v.8H3v-.8A4.5 4.5 0 0 1 7.5 5Z"
    fill={state.palette.headerFill}
  />
  <path
    d="M3.2 10.3h17.6"
    stroke={state.palette.stroke}
    stroke-width="1.45"
  />
  <!-- 상단 링 스터드 2개 -->
  <path
    d="M8.2 3.1v3.2M15.8 3.1v3.2"
    stroke={state.palette.stroke}
    stroke-width="1.9"
    stroke-linecap="round"
  />

  <!-- D- (차감식·빈 상태) 또는 D+ (추산/누적식) 기하학 path -->
  <path
    d="M7 12.8h2.1a2.6 2.6 0 0 1 0 5.2H7v-5.2Z"
    stroke={state.palette.letter}
    stroke-width="1.85"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  {#if state.sign === '+'}
    <path
      d="M13.5 15.4h3.8M15.4 13.5v3.8"
      stroke={state.palette.letter}
      stroke-width="1.85"
      stroke-linecap="round"
    />
  {:else}
    <path
      d="M13.6 15.4h3.6"
      stroke={state.palette.letter}
      stroke-width="1.9"
      stroke-linecap="round"
    />
  {/if}

  <!-- 활성 D-Day 상태 포인트 (당일 스파클 / 진행 중·임박 도트) -->
  {#if state.palette.showDot}
    {#if state.palette.sparkleDot}
      <path
        d="M19.5 2.1 20.3 4.3 22.5 5.1 20.3 5.9 19.5 8.1 18.7 5.9 16.5 5.1 18.7 4.3Z"
        fill={state.palette.dotColor}
        stroke={state.palette.dotRing}
        stroke-width="0.9"
        stroke-linejoin="round"
      />
    {:else}
      <circle
        cx="19.5"
        cy="5.2"
        r="2.75"
        fill={state.palette.dotColor}
        stroke={state.palette.dotRing}
        stroke-width="1.45"
      />
    {/if}
  {/if}
</svg>

<style>
  .dday-ctrl-glyph {
    display: block;
    flex: none;
  }
</style>
