<script lang="ts">
  // 몽글 세그먼트 숫자판.
  // 왜 글꼴이 아니라 SVG로 그리는가: 사용자가 고른 글꼴마다 숫자 폭이 달라 초가 바뀔 때마다 줄이 흔들리고,
  // 창 크기에 맞춰 키울 때도 글꼴 측정이 필요합니다. 도형으로 그리면 어떤 크기·글꼴에서도 똑같이 또렷합니다.
  type Digit = number | null;
  let { hourDigits, minuteDigits, secondDigits, meridiem, second } = $props<{
    hourDigits: [Digit, number];
    minuteDigits: [number, number];
    secondDigits: [number, number] | null;
    meridiem: string | null;
    /** 콜론이 초마다 한 번 숨쉬도록 초 값을 받습니다. */
    second: number;
  }>();

  // 숫자 하나의 크기(시·분 기준). 획은 끝이 둥근 알약 모양입니다.
  const W = 56, H = 100, T = 12, G = 4, R = T / 2;
  const ADVANCE = 70, COLON = 26, SIDE_GAP = 22, SMALL = 0.56;
  const SEGMENTS: Record<string, { x: number; y: number; w: number; h: number }> = {
    a: { x: R + G, y: 0, w: W - T - 2 * G, h: T },
    g: { x: R + G, y: H / 2 - R, w: W - T - 2 * G, h: T },
    d: { x: R + G, y: H - T, w: W - T - 2 * G, h: T },
    f: { x: 0, y: R + G, w: T, h: H / 2 - R - 2 * G },
    b: { x: W - T, y: R + G, w: T, h: H / 2 - R - 2 * G },
    e: { x: 0, y: H / 2 + G, w: T, h: H / 2 - R - 2 * G },
    c: { x: W - T, y: H / 2 + G, w: T, h: H / 2 - R - 2 * G },
  };
  const LIT = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  const ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  // 시(두 자리) · 콜론 · 분(두 자리). 콜론 칸은 두 숫자 사이 한가운데에 둡니다.
  const MINUTE_X = ADVANCE * 2 + COLON;
  const mainWidth = MINUTE_X + ADVANCE + W;
  const colonX = (ADVANCE + W + MINUTE_X) / 2;
  const smallWidth = ADVANCE * SMALL + W * SMALL;
  const hasSide = $derived(Boolean(secondDigits || meridiem));
  const sideX = mainWidth + SIDE_GAP;
  const width = $derived(hasSide ? sideX + smallWidth : mainWidth);
  // 초가 있으면 오전·오후 배지는 위, 초는 아래. 초가 없으면 배지를 숫자 밑줄에 맞춥니다.
  const badgeY = $derived(secondDigits ? 0 : H - 30);
  const isAfternoon = $derived(meridiem === '오후');
</script>

{#snippet digit(value: Digit, x: number, y: number, scale: number)}
  <g transform="translate({x} {y}) scale({scale})">
    {#each ORDER as key}
      {@const s = SEGMENTS[key]}
      <rect
        class="clk-seg"
        class:on={value != null && LIT[value].includes(key)}
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        rx={R}
      />
    {/each}
  </g>
{/snippet}

<svg
  class="clk-digital"
  viewBox="-6 -6 {width + 12} {H + 12}"
  preserveAspectRatio="xMidYMid meet"
  aria-hidden="true"
>
  {@render digit(hourDigits[0], 0, 0, 1)}
  {@render digit(hourDigits[1], ADVANCE, 0, 1)}
  <g class="clk-colon" data-phase={second % 2}>
    <circle cx={colonX} cy={H * 0.3} r="6.5" />
    <circle cx={colonX} cy={H * 0.7} r="6.5" />
  </g>
  {@render digit(minuteDigits[0], MINUTE_X, 0, 1)}
  {@render digit(minuteDigits[1], MINUTE_X + ADVANCE, 0, 1)}
  {#if meridiem}
    <g class="clk-meridiem" transform="translate({sideX} {badgeY})">
      <rect width={smallWidth} height="30" rx="15" />
      <g transform="translate(15 15)">
        {#if isAfternoon}
          <path class="clk-moon" d="M3.5-7.2A7.6 7.6 0 1 0 7.4 4.1 6.1 6.1 0 1 1 3.5-7.2Z" />
        {:else}
          <circle class="clk-sun" r="4.2" />
          {#each [0, 45, 90, 135, 180, 225, 270, 315] as angle}
            <line class="clk-ray" x1="0" y1="-6.6" x2="0" y2="-8.4" transform="rotate({angle})" />
          {/each}
        {/if}
      </g>
      <text x={smallWidth - 8} y="15.5" text-anchor="end" dominant-baseline="central" textLength="36" lengthAdjust="spacingAndGlyphs">{meridiem}</text>
    </g>
  {/if}
  {#if secondDigits}
    {@render digit(secondDigits[0], sideX, H - H * SMALL, SMALL)}
    {@render digit(secondDigits[1], sideX + ADVANCE * SMALL, H - H * SMALL, SMALL)}
  {/if}
</svg>
