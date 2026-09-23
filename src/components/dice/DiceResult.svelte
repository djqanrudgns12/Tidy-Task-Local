<script lang="ts">
  import { MATCH_LABELS } from '../../lib/dice/engine.js';

  // 결과줄: "4 + 2 + 1 = 7". 칩 색은 주사위 자리 색과 같아 "어느 주사위가 몇"인지 바로 이어집니다.
  let { phase, count, values, filled, showTotal, badge, rollKey, reduced, tones } = $props<{
    phase: 'idle' | 'rolling' | 'result';
    count: number;
    values: number[];
    filled: boolean[];
    showTotal: boolean;
    badge: 'double' | 'triple' | null;
    rollKey: number;
    reduced: boolean;
    tones: readonly string[];
  }>();

  const total = $derived(values.slice(0, count).reduce((sum: number, v: number) => sum + v, 0));
  let equationEl = $state<HTMLElement>();

  type Pop = { on: boolean; from?: number; peak?: number; duration?: number };
  /** 숫자가 들어오는 순간 톡 커졌다 제자리로. 줄임 모드에서는 움직이지 않습니다. */
  function pop(node: HTMLElement, { on, from = 0.6, peak = 1.08, duration = 180 }: Pop) {
    if (!on) return;
    node.animate(
      [
        { transform: `scale(${from})`, opacity: 0.35 },
        { transform: `scale(${peak})`, opacity: 1, offset: 0.62 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
  }
  /** 굴리는 동안 빈 칩·물음표가 흐려진 옛 결과 자리에 부드럽게 나타납니다. */
  function fadeIn(node: HTMLElement, on: boolean) {
    if (on) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' });
  }
  /** 합계를 기다리는 물음표가 숨 쉬듯 커졌다 작아집니다. */
  function breathe(node: HTMLElement, on: boolean) {
    if (!on) return;
    const animation = node.animate(
      [{ transform: 'scale(.94)', opacity: 0.35 }, { transform: 'scale(1.04)', opacity: 0.6 }],
      { duration: 520, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );
    return { destroy: () => animation.cancel() };
  }
  // 배지는 CSS 전환이 아니라 JS 틱으로 움직입니다. 툴킷 공통 CSS가 OS 동작 줄이기에서 CSS 애니메이션을 모두 끄기 때문입니다.
  function badgeIn(_node: HTMLElement) {
    if (reduced) return { duration: 160, tick: (t: number) => (_node.style.opacity = String(t)) };
    return {
      duration: 240,
      tick: (t: number) => {
        // 0 → 1.1 → 1로 살짝 넘쳤다 돌아오는 크기
        const scale = t < 0.65 ? 0.5 + (0.6 * t) / 0.65 : 1.1 - (0.1 * (t - 0.65)) / 0.35;
        _node.style.opacity = String(Math.min(1, t * 2));
        _node.style.transform = `rotate(-8deg) scale(${scale})`;
      },
    };
  }
  function badgeOut(_node: HTMLElement) {
    return { duration: 200, tick: (t: number) => (_node.style.opacity = String(t)) };
  }
  // 배지가 뜨는 순간 칩들이 한 번 더 통 튀어 "무엇이 같은지" 보여 줍니다.
  $effect(() => {
    if (!badge || reduced || !equationEl) return;
    for (const chip of equationEl.querySelectorAll<HTMLElement>('.dice-chip')) {
      chip.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-22%)', offset: 0.4 }, { transform: 'translateY(0)' }],
        { duration: 320, easing: 'cubic-bezier(.3,.7,.4,1)' },
      );
    }
  });
</script>

<div class="dice-result" aria-hidden="true">
  {#if phase === 'idle'}
    <p class="dice-hint">던지기를 눌러 보세요</p>
  {:else}
    <div class="dice-equation" bind:this={equationEl} class:single={count === 1}>
      {#if count > 1}
        {#each Array.from({ length: count }, (_, i) => i) as i (i)}
          {#if i > 0}<span class="dice-op">+</span>{/if}
          {#key `${rollKey}:${i}:${filled[i]}`}
            <span class="dice-chip" class:empty={!filled[i]} data-tone={tones[i]}
              use:pop={{ on: !!filled[i] && !reduced }} use:fadeIn={!filled[i] && !reduced}>{filled[i] ? values[i] : ''}</span>
          {/key}
        {/each}
        <span class="dice-op">=</span>
      {/if}
      <span class="dice-total-slot">
        {#key `${rollKey}:${showTotal}`}
          {#if showTotal}
            <span class="dice-total" use:pop={{ on: !reduced, peak: 1.12, duration: 260 }}>{total}</span>
          {:else}
            <span class="dice-total pending" use:breathe={!reduced}>?</span>
          {/if}
        {/key}
        {#if badge}
          <span class="dice-badge" data-kind={badge} in:badgeIn out:badgeOut>{MATCH_LABELS[badge as 'double' | 'triple']}</span>
        {/if}
      </span>
    </div>
  {/if}
</div>
