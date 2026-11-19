<script lang="ts">
  // 모둠 모양 12가지(PRD 8.2). 색을 구분하기 어려운 학생도 모양으로 모둠을 알아보게 합니다.
  import { SYMBOL_PATHS } from '../../lib/scoreboard/symbolPaths.js';
  let { symbol, color = 'currentColor', size = 20 } = $props<{ symbol: string; color?: string; size?: number }>();
  const def = $derived(SYMBOL_PATHS[symbol] ?? SYMBOL_PATHS.acorn);
</script>

<svg class="sb-symbol" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={color} stroke="#fff" stroke-width="1.2" stroke-linejoin="round">
  <path d={def.d} fill-rule={def.fillRule ?? 'nonzero'} />
  {#if def.strokePaths}
    {#each def.strokePaths as sd}
      <path d={sd} fill="none" stroke={color} stroke-width="2.2" stroke-linecap="round" />
    {/each}
  {/if}
</svg>

<style>
  .sb-symbol {
    flex: none;
    overflow: visible;
    filter: drop-shadow(0 1px 0 rgb(0 0 0 / 0.12));
  }
</style>
