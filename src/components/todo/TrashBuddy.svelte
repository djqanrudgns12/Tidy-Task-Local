<script>
  // 휴지통 친구 — 되돌리기 알림 왼쪽의 얼굴 달린 작은 휴지통 (docs/PRD-todo-row-gestures.md §7.2)
  // 지웠을 때는 "앗"(동그란 입), 되돌렸을 때는 눈웃음 + 웃는 입 + 뚜껑이 톡 열렸다 닫힙니다.
  // 몸 색은 테마 강조색을 연하게 섞어 테마마다 어울리게 합니다.

  /** @type {{ mood?: 'oops' | 'happy', accent?: string, dark?: boolean, wiggle?: number }} */
  let { mood = 'oops', accent = '#d97706', dark = false, wiggle = 0 } = $props();

  const body = $derived(dark
    ? `color-mix(in srgb, ${accent} 62%, #3a404b)`
    : `color-mix(in srgb, ${accent} 34%, #ffffff)`);
  // 얇은 테두리로 스티커처럼 또렷하게 — 20px 그림이 방석 색에 묻히지 않게 합니다.
  const outline = $derived(dark
    ? `color-mix(in srgb, ${accent} 40%, #111827)`
    : `color-mix(in srgb, ${accent} 72%, #3b2410)`);
  const ink = $derived(dark ? '#111827' : '#4a2c12');
</script>

<!-- wiggle 값이 바뀔 때마다(삭제가 합쳐질 때) 몸을 한 번 살랑 흔듭니다. -->
{#key wiggle}
  <svg
    class="buddy"
    class:is-happy={mood === 'happy'}
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    focusable="false"
    style="--buddy-body: {body}; --buddy-ink: {ink}; --buddy-outline: {outline};"
  >
    <g class="lid">
      <rect x="4.5" y="5" width="15" height="3" rx="1.5" />
      <rect x="10" y="3.2" width="4" height="2" rx="1" />
    </g>
    <path class="body" d="M6 9h12l-1.1 10.2a2 2 0 0 1-2 1.8H9.1a2 2 0 0 1-2-1.8z" />
    <!-- 몸통 결(세로 줄 두 개) — 너무 밋밋하지 않게 아주 옅게 -->
    <path class="grain" d="M10 18.6v-1.2M14 18.6v-1.2" />
    {#if mood === 'happy'}
      <path class="face-line" d="M8.9 14.1q1.1-1.4 2.2 0M12.9 14.1q1.1-1.4 2.2 0" />
      <path class="face-line" d="M10.5 16.2q1.5 1.5 3 0" />
    {:else}
      <circle class="face" cx="10" cy="13.6" r="1" />
      <circle class="face" cx="14" cy="13.6" r="1" />
      <circle class="face-line" cx="12" cy="16.8" r="0.75" />
    {/if}
    <ellipse class="cheek" cx="8.4" cy="15.7" rx="1.05" ry="0.62" />
    <ellipse class="cheek" cx="15.6" cy="15.7" rx="1.05" ry="0.62" />
  </svg>
{/key}

<style>
  .buddy {
    display: block;
    overflow: visible;
    transform-origin: 50% 90%;
    animation: buddy-wiggle 420ms ease-in-out 120ms;
  }
  .lid,
  .body {
    fill: var(--buddy-body);
    stroke: var(--buddy-outline);
    stroke-width: 0.9;
    stroke-linejoin: round;
  }
  .lid { transform-origin: 4.5px 8px; transform-box: view-box; }
  .grain {
    fill: none;
    stroke: var(--buddy-ink);
    stroke-width: 0.8;
    stroke-linecap: round;
    opacity: 0.18;
  }
  .face { fill: var(--buddy-ink); }
  .face-line {
    fill: none;
    stroke: var(--buddy-ink);
    stroke-width: 0.95;
    stroke-linecap: round;
  }
  .cheek { fill: #fda4af; opacity: 0.85; }
  .is-happy .lid { animation: buddy-lid 520ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  .is-happy { animation: buddy-hop 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }

  @keyframes buddy-wiggle {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-6deg); }
    50% { transform: rotate(5deg); }
    75% { transform: rotate(-3deg); }
  }
  @keyframes buddy-lid {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(-18deg); }
  }
  @keyframes buddy-hop {
    0%, 100% { transform: translateY(0); }
    40% { transform: translateY(-2px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .buddy,
    .is-happy,
    .is-happy .lid { animation: none; }
  }
</style>
