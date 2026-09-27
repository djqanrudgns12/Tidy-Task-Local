<script lang="ts">
  // 안내 슬라이드의 키보드 그림: 윗줄 숫자키 + 오른쪽 숫자패드 + 백스페이스(스페이스바는 2026-09-26부터 쓰지 않음).
  // lit에 든 키가 차례로 "눌렸다 떼어지는" 모습을 보여 줍니다(안내 전용 — 투표판에는 이런 움직임이 없습니다).
  import { onMount } from 'svelte';
  import Keycap from '../common/Keycap.svelte';
  let { lit = [], size = 58, show = 'digits', reduced = false } = $props<{ lit?: string[]; size?: number; show?: 'digits' | 'back' | 'zero'; reduced?: boolean }>();
  let active = $state(0);
  onMount(() => {
    if (reduced || lit.length < 1) return;
    const timer = setInterval(() => (active = (active + 1) % Math.max(1, lit.length)), 900);
    return () => clearInterval(timer);
  });
  const current = $derived(lit[active] ?? '');
  const ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const PAD = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0']];
</script>

<div class="vt-kb" style:--k={`${size}px`}>
  {#if show === 'back'}
    <div class="vt-kb-row"><Keycap label="← 백스페이스" size={size} wide lit={current === 'Backspace' || reduced} /></div>
  {:else}
    <div class="vt-kb-block">
      <span class="vt-kb-label">위쪽 숫자키</span>
      <div class="vt-kb-row">{#each ROW as k}<Keycap label={k} size={size * 0.82} lit={current === k || (reduced && lit.includes(k))} />{/each}</div>
    </div>
    <span class="vt-kb-or">또는</span>
    <div class="vt-kb-block">
      <span class="vt-kb-label">숫자패드</span>
      <div class="vt-kb-pad">
        {#each PAD as row}<div class="vt-kb-row">{#each row as k}<Keycap label={k} size={size * 0.82} lit={current === k || (reduced && lit.includes(k))} />{/each}</div>{/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .vt-kb {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: calc(var(--k) * 0.5);
    flex-wrap: wrap;
  }
  .vt-kb-block {
    display: grid;
    justify-items: center;
    gap: 10px;
  }
  .vt-kb-label {
    color: var(--vt-muted);
    font-size: 15px;
    font-weight: 800;
  }
  .vt-kb-row {
    display: flex;
    gap: calc(var(--k) * 0.14);
    justify-content: center;
  }
  .vt-kb-pad {
    display: grid;
    gap: calc(var(--k) * 0.14);
    padding: calc(var(--k) * 0.18);
    border-radius: calc(var(--k) * 0.3);
    background: color-mix(in srgb, var(--vt-soft) 70%, transparent);
  }
  .vt-kb-or {
    color: var(--vt-muted);
    font-size: 16px;
    font-weight: 800;
  }
</style>
