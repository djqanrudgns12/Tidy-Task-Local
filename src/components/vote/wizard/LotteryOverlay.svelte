<script lang="ts">
  // 기호 추첨 연출(PRD 4절): 카드가 모여 섞이고(1.2초) → 1번부터 차례로 자리에 내려앉으며 뒤집힙니다(한 장 0.35초).
  // 결과는 lottery.js가 먼저 정했고, 연출은 보여 주기만 합니다. 움직임 줄이기면 바로 결과를 보여 줍니다.
  import { onMount, tick } from 'svelte';
  import Keycap from '../common/Keycap.svelte';
  import Sticker from '../common/Sticker.svelte';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import { lotteryDuration } from '../../../lib/vote/lottery.js';
  let { items, type, reduced, audio, onaccept, onretry, onclose } = $props<{
    items: any[]; type: string; reduced: boolean; audio: any; onaccept: () => void; onretry: () => void; onclose: () => void;
  }>();
  let stage = $state<HTMLDivElement>();
  let ready = $state(false);
  let done = $state(false);
  let offsets = $state<{ dx: number; dy: number; rot: number }[]>([]);
  onMount(() => {
    if (reduced) {
      done = true;
      ready = true;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    void tick().then(() => {
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      offsets = Array.from(stage.querySelectorAll<HTMLElement>('.vt-lot-slot')).map((el, i) => {
        const r = el.getBoundingClientRect();
        return { dx: cx - (r.left + r.width / 2), dy: cy - (r.top + r.height / 2), rot: (i % 2 ? 1 : -1) * (4 + (i * 7) % 9) };
      });
      ready = true;
      audio.play('lot.shuffle');
      items.forEach((_: unknown, i: number) => audio.play('lot.deal', { index: i, delay: (1200 + i * 350 + 180) / 1000 }));
      audio.play('lot.done', { delay: lotteryDuration(items.length) / 1000 + 0.15 });
      timer = setTimeout(() => (done = true), lotteryDuration(items.length) + 300);
    });
    return () => clearTimeout(timer);
  });
</script>

<div class="vt-lot" role="dialog" aria-label="기호 추첨">
  <div class="vt-lot-card vt-card">
    <h2>{done ? '기호가 정해졌어요' : '기호를 뽑고 있어요…'}</h2>
    <div class="vt-lot-stage" bind:this={stage} class:ready class:animate={!reduced}>
      {#each items as item, i (item.id)}
        {@const c = paletteOf(item.color)}
        <div class="vt-lot-slot" style:--i={i} style:--dx={`${offsets[i]?.dx ?? 0}px`} style:--dy={`${offsets[i]?.dy ?? 0}px`} style:--rot={`${offsets[i]?.rot ?? 0}deg`}>
          <div class="vt-lot-flip">
            <div class="vt-lot-back" aria-hidden="true"><span>?</span></div>
            <div class="vt-lot-front vt-c" style:--c-bg={c.bg} style:--c-line={c.line} style:--c-ink={c.ink}>
              <Keycap label={item.number} size={42} />
              <Sticker {item} {type} size={60} />
              <b>{item.name || '(이름)'}</b>
            </div>
          </div>
        </div>
      {/each}
    </div>
    <div class="vt-lot-actions" class:hidden={!done}>
      <button class="vt-btn ghost" onclick={onclose}>추첨 전으로</button>
      <button class="vt-btn" onclick={onretry}>다시 추첨</button>
      <button class="vt-btn primary" onclick={onaccept}>이대로 할게요</button>
    </div>
  </div>
</div>

<style>
  .vt-lot {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in srgb, var(--vt-ink) 30%, transparent);
  }
  .vt-lot-card {
    width: min(920px, 100%);
    padding: 24px;
    border-radius: 28px;
    text-align: center;
  }
  .vt-lot-card h2 {
    margin: 0 0 18px;
    font-size: 22px;
  }
  .vt-lot-stage {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 14px;
    min-height: 200px;
    perspective: 900px;
  }
  .vt-lot-slot {
    height: 150px;
    visibility: hidden;
  }
  .vt-lot-stage.ready .vt-lot-slot {
    visibility: visible;
  }
  .vt-lot-flip {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
  }
  .vt-lot-back,
  .vt-lot-front {
    position: absolute;
    inset: 0;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 8px;
    border-radius: 20px;
    backface-visibility: hidden;
    box-shadow: 0 0 0 4px #fff, 0 8px 18px color-mix(in srgb, var(--vt-ink) 14%, transparent);
  }
  .vt-lot-back {
    background: repeating-linear-gradient(45deg, #d6e9a3 0 10px, #e7f2c6 10px 20px);
    color: #4d6b14;
    font-size: 44px;
    font-weight: 900;
    transform: rotateY(180deg);
  }
  .vt-lot-front {
    background: var(--cbg);
  }
  .vt-lot-front b {
    max-width: 90%;
    overflow: hidden;
    font-size: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* 연출: 가운데 더미(뒷면)에서 섞였다가 자리로 날아가 뒤집힘 */
  .vt-lot-stage.animate.ready .vt-lot-slot {
    animation:
      vt-lot-pile 1200ms var(--vt-ease) both,
      vt-lot-deal 420ms var(--vt-ease-pop) calc(1200ms + var(--i) * 350ms) both;
  }
  .vt-lot-stage.animate.ready .vt-lot-flip {
    animation: vt-lot-flip 420ms var(--vt-ease) calc(1200ms + var(--i) * 350ms + 120ms) both;
  }
  @keyframes vt-lot-pile {
    0% {
      transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.9);
    }
    25% {
      transform: translate(calc(var(--dx) - 14px), var(--dy)) rotate(calc(var(--rot) * -1)) scale(0.9);
    }
    50% {
      transform: translate(calc(var(--dx) + 14px), var(--dy)) rotate(var(--rot)) scale(0.9);
    }
    75% {
      transform: translate(calc(var(--dx) - 8px), var(--dy)) rotate(calc(var(--rot) * -0.5)) scale(0.9);
    }
    100% {
      transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.9);
    }
  }
  @keyframes vt-lot-deal {
    from {
      transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.9);
    }
    to {
      transform: none;
    }
  }
  @keyframes vt-lot-flip {
    from {
      transform: rotateY(180deg);
    }
    to {
      transform: rotateY(0deg);
    }
  }
  .vt-lot-stage.animate:not(.ready) .vt-lot-flip,
  .vt-lot-stage.animate.ready .vt-lot-flip {
    transform: rotateY(180deg);
  }
  .vt-lot-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 20px;
  }
  .vt-lot-actions.hidden {
    visibility: hidden;
  }
</style>
