<script lang="ts">
  // 개표 방법 카드의 작은 그림(툴킷 아이콘과 같은 선·면 규칙). 카드에 마우스를 올리면 살짝 움직입니다(.vt-mode:hover).
  let { mode, yesno = false, size = 64 } = $props<{ mode: string; yesno?: boolean; size?: number }>();
</script>

<svg class="vt-mode-art" data-mode={mode} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
  <rect x="2" y="3" width="60" height="58" rx="18" class="bg" />
  {#if mode === 'instant'}
    <path d="M17 34h30l-2.5 16a3 3 0 0 1-3 2.6H22.5a3 3 0 0 1-3-2.6Z" class="paper" />
    <rect x="14" y="28" width="36" height="8" rx="3" class="lid" />
    <g class="pop"><path d="M32 9v8M22 14l4 6M42 14l-4 6" class="line" /><circle cx="32" cy="24" r="3" class="gold" /></g>
  {:else if mode === 'paper'}
    <g class="pop"><rect x="12" y="12" width="22" height="28" rx="3" class="paper" transform="rotate(-8 23 26)" /><path d="m18 26 4 4 7-8" class="line accent" transform="rotate(-8 23 26)" /></g>
    <rect x="30" y="30" width="24" height="22" rx="4" class="board" />
    <path d="M35 36h12M41 36v12M36 42h10M37 48h11" class="chalk" />
  {:else if mode === 'race'}
    {#if yesno}
      <path d="M8 36h48" class="rope" /><path d="M32 30v12" class="line" />
      <circle cx="14" cy="36" r="6" class="mint" /><circle cx="50" cy="36" r="6" class="apricot" />
      <path d="M27 32l5 4-5 4" class="line pop" />
    {:else}
      <path d="M8 24h48M8 40h48" class="lane" /><path d="M52 16v34" class="finish" />
      <g class="pop"><circle cx="30" cy="24" r="6" class="berry" /><circle cx="22" cy="40" r="6" class="sky" /></g>
    {/if}
  {:else if mode === 'broadcast'}
    <rect x="12" y="38" width="9" height="14" rx="2" class="sky" /><rect x="27" y="26" width="9" height="26" rx="2" class="berry pop" /><rect x="42" y="32" width="9" height="20" rx="2" class="lime" />
    <text x="32" y="17" text-anchor="middle" class="pct">38%</text>
  {:else if mode === 'reverse'}
    <rect x="10" y="20" width="14" height="20" rx="3" class="card" /><rect x="25" y="16" width="14" height="24" rx="3" class="card" /><rect x="40" y="12" width="14" height="28" rx="3" class="card gold pop" />
    <path d="M17 50h30" class="line" /><path d="m41 46 6 4-6 4" class="line" />
  {:else}
    <rect x="10" y="18" width="14" height="20" rx="3" class="card" /><rect x="25" y="18" width="14" height="20" rx="3" class="card open" /><rect x="40" y="18" width="14" height="20" rx="3" class="card" />
    <path d="M35 46c2-4 7-4 8 0l1 6-7 2Z" class="hand pop" />
  {/if}
</svg>

<style>
  .vt-mode-art {
    display: block;
    overflow: visible;
  }
  .bg {
    fill: var(--vt-soft);
  }
  .paper,
  .card {
    fill: #fff;
    stroke: color-mix(in srgb, var(--vt-ink) 55%, transparent);
    stroke-width: 1.8;
  }
  .card.open {
    fill: #fad4dc;
  }
  .card.gold {
    fill: var(--vt-gold);
  }
  .lid {
    fill: #d6e9a3;
    stroke: color-mix(in srgb, var(--vt-ink) 55%, transparent);
    stroke-width: 1.8;
  }
  .line {
    fill: none;
    stroke: color-mix(in srgb, var(--vt-ink) 65%, transparent);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .line.accent {
    stroke: var(--vt-accent);
    stroke-width: 3;
  }
  .gold {
    fill: var(--vt-gold);
  }
  .board {
    fill: var(--vt-chalkboard);
  }
  .chalk {
    fill: none;
    stroke: var(--vt-chalk);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .lane {
    stroke: color-mix(in srgb, var(--vt-ink) 20%, transparent);
    stroke-width: 10;
    stroke-linecap: round;
  }
  .finish {
    stroke: color-mix(in srgb, var(--vt-ink) 60%, transparent);
    stroke-width: 2.4;
    stroke-dasharray: 3 3;
  }
  .rope {
    stroke: #c89a63;
    stroke-width: 4;
    stroke-linecap: round;
  }
  .berry {
    fill: #f2a9b9;
  }
  .sky {
    fill: #a6cdef;
  }
  .lime {
    fill: #bedd86;
  }
  .mint {
    fill: #95d9bf;
  }
  .apricot {
    fill: #f5b98c;
  }
  .hand {
    fill: #ffe2c6;
    stroke: color-mix(in srgb, var(--vt-ink) 55%, transparent);
    stroke-width: 1.6;
  }
  .pct {
    fill: var(--vt-ink);
    font-size: 11px;
    font-weight: 900;
    font-family: inherit;
  }
  .pop {
    transform-box: fill-box;
    transform-origin: center;
    transition: transform var(--vt-standard) var(--vt-ease-pop);
  }
  :global(.vt-mode:hover) .pop {
    transform: translateY(-3px) scale(1.06);
  }
</style>
