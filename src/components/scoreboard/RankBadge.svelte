<script lang="ts">
  // 1~3위 동그라미 배지(금·은·동). 색만으로 구분하지 않도록 안에 순위 숫자를 쓰고, 1위에는 작은 왕관을 얹습니다.
  let { rank, size = 28, pop = false } = $props<{ rank: number; size?: number; pop?: boolean }>();
  const COLORS: Record<number, [string, string, string]> = {
    1: ['#FFD86B', '#C9952A', '#7A5310'],
    2: ['#E3E8EF', '#8A94A3', '#46505E'],
    3: ['#F2BE98', '#A8683E', '#5E3217'],
  };
  const c = $derived(COLORS[rank] ?? COLORS[3]);
</script>

<span class="sb-rank" class:pop style:--rs={`${size}px`} aria-label={`${rank}위`} role="img">
  <svg viewBox="0 0 32 36" width={size} height={size * 1.125} aria-hidden="true">
    {#if rank === 1}<path d="M9 9.5 11 3l5 4.2L21 3l2 6.5Z" fill="#FFD86B" stroke="#C9952A" stroke-width="1.4" stroke-linejoin="round" />{/if}
    <circle cx="16" cy="21" r="12.5" fill={c[0]} stroke={c[1]} stroke-width="2" />
    <circle cx="16" cy="21" r="9" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" />
    <text x="16" y="21" dy=".36em" text-anchor="middle" font-size="13" font-weight="800" fill={c[2]}>{rank}</text>
  </svg>
</span>

<style>
  .sb-rank {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--rs);
    line-height: 0;
  }
  .sb-rank svg {
    overflow: visible;
    filter: drop-shadow(0 1px 1px rgb(60 40 10 / 0.18));
  }
  /* 새로 1위가 되면 왕관 배지가 톡 튀어나옵니다. */
  .sb-rank.pop svg {
    animation: sb-rank-pop 520ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes sb-rank-pop {
    0% { transform: scale(0.3) rotate(-20deg); opacity: 0; }
    60% { transform: scale(1.25) rotate(6deg); opacity: 1; }
    100% { transform: none; }
  }
</style>
