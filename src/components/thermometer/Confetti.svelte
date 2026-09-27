<script lang="ts">
  // 꽃가루(목표 달성·도장판 완성). 조각 60개 이내, 2.5초 뒤 스스로 사라집니다. 동작 줄이기면 그리지 않습니다.
  import { onMount } from 'svelte';
  let { colors = ['#FFD86B', '#FF8FA3', '#8FD3FF', '#9BE3B8', '#C7A6FF'], count = 56, ondone } = $props<{ colors?: string[]; count?: number; ondone?: () => void }>();
  let host = $state<HTMLDivElement>();
  onMount(() => {
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    const pieces: Animation[] = [];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('i');
      el.className = 'th-confetti-piece';
      el.style.background = colors[i % colors.length];
      el.style.left = `${width * (0.2 + Math.random() * 0.6)}px`;
      el.style.top = `${height * 0.35}px`;
      if (i % 3 === 0) el.style.borderRadius = '50%';
      host.appendChild(el);
      const dx = (Math.random() - 0.5) * width * 0.9;
      const up = -height * (0.25 + Math.random() * 0.3);
      const down = height * (0.4 + Math.random() * 0.4);
      const spin = (Math.random() - 0.5) * 900;
      pieces.push(el.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${up}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${down}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 1800 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' },
      ));
    }
    const timer = setTimeout(() => ondone?.(), 2600);
    return () => {
      clearTimeout(timer);
      pieces.forEach((p) => p.cancel());
    };
  });
</script>

<div class="th-confetti" bind:this={host} aria-hidden="true"></div>
