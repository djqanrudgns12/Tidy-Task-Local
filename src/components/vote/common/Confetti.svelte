<script lang="ts">
  // 꽃가루: 종이 조각 5종, 후보 색상. 기본 80개, 당선 발표는 최대 160개·3차례로 제한합니다.
  // 한 번 계산한 포물선 경로를 WAAPI로 움직이고, 끝·취소·창 닫힘 때 반드시 지웁니다(잔상 방지).
  // 움직임 줄이기면 별 스티커 3개를 제자리에 붙입니다.
  import { onMount } from 'svelte';
  let { colors, count = 80, reduced = false, duration = 2400, waves = 1 } = $props<{ colors: string[]; count?: number; reduced?: boolean; duration?: number; waves?: number }>();
  let host = $state<HTMLDivElement>();
  const SHAPES = ['square', 'star', 'heart', 'ribbon', 'dot'];
  onMount(() => {
    if (!host || reduced) return;
    const { width, height } = host.getBoundingClientRect();
    const animations: Animation[] = [];
    const n = Math.min(160, count);
    const waveCount = Math.max(1, Math.min(3, waves));
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = `vt-confetti-piece ${SHAPES[i % SHAPES.length]}`;
      el.style.setProperty('--col', colors[i % colors.length]);
      const fromLeft = i % 2 === 0;
      el.style.left = `${fromLeft ? width * 0.035 : width * 0.965}px`;
      el.style.top = `${height * 0.72}px`;
      host.appendChild(el);
      const dx = (fromLeft ? 1 : -1) * width * (0.06 + Math.random() * 0.25);
      const up = -height * (0.35 + Math.random() * 0.35);
      const down = height * (0.25 + Math.random() * 0.3);
      const spin = (Math.random() - 0.5) * 1080;
      const sway = (Math.random() - 0.5) * 60;
      const a = el.animate(
        [
          { transform: 'translate(0,0) rotate(0deg) scale(.6)', opacity: 0 },
          { transform: `translate(${dx * 0.55}px, ${up}px) rotate(${spin * 0.4}deg) scale(1)`, opacity: 1, offset: 0.32 },
          { transform: `translate(${dx * 0.8 + sway}px, ${up * 0.35}px) rotate(${spin * 0.7}deg) scale(1)`, opacity: 1, offset: 0.65 },
          { transform: `translate(${dx + sway * 1.6}px, ${down}px) rotate(${spin}deg) scale(.9)`, opacity: 0 },
        ],
        { duration: duration * (0.75 + Math.random() * 0.35), delay: Math.floor(i / Math.ceil(n / waveCount)) * 680 + Math.random() * 180, easing: 'cubic-bezier(.22,.7,.36,1)', fill: 'both' },
      );
      a.onfinish = () => el.remove();
      animations.push(a);
    }
    const cleanup = setTimeout(() => host?.replaceChildren(), duration * 1.3 + (waveCount - 1) * 680 + 500);
    return () => {
      clearTimeout(cleanup);
      animations.forEach((a) => a.cancel());
      host?.replaceChildren();
    };
  });
</script>

<div class="vt-confetti" bind:this={host} aria-hidden="true">
  {#if reduced}
    <svg class="vt-confetti-still" viewBox="0 0 300 80">
      {#each [40, 150, 260] as x, i}<path transform={`translate(${x} ${30 + (i % 2) * 14}) rotate(${i * 12 - 12})`} d="m0-16 4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L0 7.9-9.4 12.8l1.8-10.4-7.6-7.4 10.5-1.5Z" fill={colors[i % colors.length]} stroke="#fff" stroke-width="3" />{/each}
    </svg>
  {/if}
</div>

<style>
  .vt-confetti {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 30;
  }
  .vt-confetti :global(.vt-confetti-piece) {
    position: absolute;
    display: block;
    width: 12px;
    height: 9px;
    background: var(--col);
    border-radius: 2px;
    box-shadow: 0 0 0 1.5px #fff;
    will-change: transform, opacity;
  }
  .vt-confetti :global(.vt-confetti-piece.dot) {
    width: 9px;
    border-radius: 50%;
  }
  .vt-confetti :global(.vt-confetti-piece.ribbon) {
    width: 5px;
    height: 16px;
    border-radius: 3px;
  }
  .vt-confetti :global(.vt-confetti-piece.star) {
    width: 14px;
    height: 14px;
    box-shadow: none;
    clip-path: polygon(50% 0, 62% 35%, 100% 38%, 70% 60%, 80% 100%, 50% 76%, 20% 100%, 30% 60%, 0 38%, 38% 35%);
  }
  .vt-confetti :global(.vt-confetti-piece.heart) {
    width: 13px;
    height: 12px;
    box-shadow: none;
    clip-path: path('M6.5 12C5.9 11.6 0 8 0 3.8 0 1.7 1.6 0 3.6 0c1.2 0 2.3.6 2.9 1.6C7.1.6 8.2 0 9.4 0 11.4 0 13 1.7 13 3.8 13 8 7.1 11.6 6.5 12Z');
  }
  .vt-confetti-still {
    position: absolute;
    left: 50%;
    top: 8%;
    width: min(60%, 420px);
    transform: translateX(-50%);
  }
</style>
