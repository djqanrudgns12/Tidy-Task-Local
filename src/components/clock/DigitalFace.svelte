<script lang="ts">
  type Digit = number | null;
  let { hourDigits, minuteDigits, secondDigits, meridiem, monthDay, weekday, weekend } = $props<{
    hourDigits: [Digit, number];
    minuteDigits: [number, number];
    secondDigits: [number, number] | null;
    meridiem: string | null;
    monthDay: string;
    weekday: string;
    weekend: string | null;
  }>();

  // 꺼진 획을 그리지 않아 멀리서도 실제 숫자만 보이게 합니다.
  const SEGMENTS: Record<string, string> = {
    a: 'M13 0 H47 L54 6 L47 12 H13 L6 6 Z',
    b: 'M60 12 L54 6 L48 12 V49 L54 55 L60 49 Z',
    c: 'M60 63 L54 57 L48 63 V100 L54 106 L60 100 Z',
    d: 'M13 100 H47 L54 106 L47 112 H13 L6 106 Z',
    e: 'M0 63 L6 57 L12 63 V100 L6 106 L0 100 Z',
    f: 'M0 12 L6 6 L12 12 V49 L6 55 L0 49 Z',
    g: 'M13 50 H47 L54 56 L47 62 H13 L6 56 Z',
  };
  const LIT = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  const ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const ADVANCE = 72;
  const DIGIT_WIDTH = 60;
  const SMALL = 0.52;
  const hourCount = $derived(hourDigits[0] == null ? 1 : 2);
  const minuteX = $derived(hourCount * ADVANCE + 24);
  const mainWidth = $derived(minuteX + ADVANCE + DIGIT_WIDTH);
  const width = $derived(secondDigits ? mainWidth + 24 + (ADVANCE + DIGIT_WIDTH) * SMALL : mainWidth);
</script>

{#snippet digit(value: Digit, x: number, y: number, scale: number)}
  {#if value !== null}
    <g transform="translate({x} {y}) scale({scale})">
      {#each ORDER as key}
        {#if LIT[value].includes(key)}
          <path d={SEGMENTS[key]} />
        {/if}
      {/each}
    </g>
  {/if}
{/snippet}

<div class="clk-digital" aria-hidden="true">
  <div class="clk-readout">
    {#if meridiem}<span class="clk-period">{meridiem}</span>{/if}
    <svg class="clk-led" viewBox="0 0 {width} 112" preserveAspectRatio="xMidYMid meet">
      {#if hourDigits[0] !== null}
        {@render digit(hourDigits[0], 0, 0, 1)}
      {/if}
      {@render digit(hourDigits[1], hourDigits[0] === null ? 0 : ADVANCE, 0, 1)}
      <circle cx={hourCount * ADVANCE + 12} cy="38" r="5" />
      <circle cx={hourCount * ADVANCE + 12} cy="74" r="5" />
      {@render digit(minuteDigits[0], minuteX, 0, 1)}
      {@render digit(minuteDigits[1], minuteX + ADVANCE, 0, 1)}
      {#if secondDigits}
        <g class="clk-led-seconds">
          <circle cx={mainWidth + 12} cy="78" r="3" />
          <circle cx={mainWidth + 12} cy="99" r="3" />
          {@render digit(secondDigits[0], mainWidth + 24, 112 * (1 - SMALL), SMALL)}
          {@render digit(secondDigits[1], mainWidth + 24 + ADVANCE * SMALL, 112 * (1 - SMALL), SMALL)}
        </g>
      {/if}
    </svg>
  </div>
  <div class="clk-digital-date">
    <span class="clk-digital-day">{monthDay}</span>
    <span class="clk-digital-weekday" data-weekend={weekend}>{weekday}</span>
  </div>
</div>
