<script lang="ts">
  // 투표함(PRD 9절). 상태: closed(평소) · open(개표 — 뚜껑이 열림) · locked(모두 투표 — 자물쇠).
  // fill(0~1)은 앞면 창으로 보이는 용지 높이(참여율)입니다. 투표 순서와 무관한 값만 받습니다.
  let { state = 'closed', fill = 0, size = 200 } = $props<{ state?: 'closed' | 'open' | 'locked'; fill?: number; size?: number }>();
  const level = $derived(Math.max(0, Math.min(1, fill)));
</script>

<svg class="vt-box" data-state={state} viewBox="0 0 220 190" width={size} height={size * 0.864} aria-hidden="true">
  <ellipse cx="110" cy="180" rx="84" ry="8" class="shadow" />
  <g class="body">
    <path class="front" d="M30 74h160l-10 92a11 11 0 0 1-11 10H51a11 11 0 0 1-11-10Z" />
    <!-- 앞면 창: 안에 쌓인 용지가 비칩니다 -->
    <clipPath id="vt-box-window"><rect x="64" y="100" width="92" height="52" rx="12" /></clipPath>
    <rect class="window" x="64" y="100" width="92" height="52" rx="12" />
    <g clip-path="url(#vt-box-window)">
      <g class="papers" style:transform={`translateY(${(1 - level) * 52}px)`}>
        <rect x="70" y="112" width="34" height="46" rx="3" transform="rotate(-9 87 135)" />
        <rect x="96" y="108" width="34" height="46" rx="3" transform="rotate(6 113 131)" />
        <rect x="120" y="114" width="30" height="42" rx="3" transform="rotate(-4 135 135)" />
      </g>
    </g>
    <rect class="window-rim" x="64" y="100" width="92" height="52" rx="12" />
    <path class="heart" d="M110 170c-.8-.6-6-3.8-6-7.8 0-2.2 1.7-3.8 3.8-3.8 1.1 0 2 .6 2.2 1.4.3-.8 1.2-1.4 2.2-1.4 2.1 0 3.8 1.6 3.8 3.8 0 4-5.2 7.2-6 7.8Z" />
  </g>
  <g class="lid">
    <rect class="lid-top" x="20" y="54" width="180" height="26" rx="10" />
    <rect class="slot" x="72" y="63" width="76" height="8" rx="4" />
  </g>
  <g class="lock">
    <path class="shackle" d="M98 86v-9a12 12 0 0 1 24 0v9" />
    <rect class="lock-body" x="92" y="84" width="36" height="28" rx="7" />
    <circle cx="110" cy="96" r="3.4" class="keyhole" /><rect x="108.6" y="97" width="2.8" height="8" rx="1.4" class="keyhole" />
  </g>
</svg>

<style>
  .vt-box {
    overflow: visible;
    --line: color-mix(in srgb, var(--vt-ink) 62%, transparent);
  }
  .shadow {
    fill: color-mix(in srgb, var(--vt-ink) 9%, transparent);
  }
  .front {
    fill: var(--vt-paper);
    stroke: var(--line);
    stroke-width: 3;
    stroke-linejoin: round;
  }
  .window {
    fill: color-mix(in srgb, #d6e9a3 55%, var(--vt-paper));
  }
  .window-rim {
    fill: none;
    stroke: var(--line);
    stroke-width: 2.5;
  }
  .papers rect {
    fill: #fff;
    stroke: color-mix(in srgb, var(--vt-ink) 30%, transparent);
    stroke-width: 1.5;
  }
  .papers {
    transition: transform var(--vt-slow) var(--vt-ease);
  }
  .heart {
    fill: #f29a8f;
  }
  .lid {
    transform-origin: 26px 67px;
    transition: transform var(--vt-slow) var(--vt-ease-pop);
  }
  .lid-top {
    fill: #d6e9a3;
    stroke: var(--line);
    stroke-width: 3;
  }
  .slot {
    fill: color-mix(in srgb, var(--vt-ink) 78%, transparent);
  }
  .body {
    transform-origin: 110px 176px;
  }
  .lock {
    opacity: 0;
    transform: translateY(-22px);
    transition: opacity var(--vt-standard) var(--vt-ease), transform var(--vt-slow) var(--vt-ease-pop);
  }
  .shackle {
    fill: none;
    stroke: #8a6a1c;
    stroke-width: 6;
    stroke-linecap: round;
  }
  .lock-body {
    fill: var(--vt-gold);
    stroke: #8a6a1c;
    stroke-width: 2.5;
  }
  .keyhole {
    fill: #6d5313;
  }
  [data-state='open'] .lid {
    transform: translate(4px, -26px) rotate(-26deg);
  }
  [data-state='locked'] .lock {
    opacity: 1;
    transform: none;
  }
  :global(.vt-root.reduced) .vt-box * {
    transition-duration: 120ms !important;
  }
</style>
