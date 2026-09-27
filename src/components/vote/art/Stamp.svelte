<script lang="ts">
  // 고무 도장(당선 · 당선 확실 · 통과 · 부결 · 기권 · O · X). 가장자리가 살짝 번진 도장 질감을 SVG 필터로 냅니다.
  let { text, color = 'var(--vt-stamp)', size = 120, tilt = -8, round = false } = $props<{ text: string; color?: string; size?: number; tilt?: number; round?: boolean }>();
  const uid = `vt-stamp-${Math.random().toString(36).slice(2, 9)}`;
  const wide = $derived(!round && Array.from(text).length > 2);
  // 번진 질감은 큰 도장에만 씁니다. 작게 줄이면 얼룩이 촘촘해져 글자가 흐려 보입니다(기록함 목록 등).
  const textured = $derived(size >= 90);
</script>

<svg class="vt-stamp" viewBox={round ? '0 0 120 120' : wide ? '0 0 260 110' : '0 0 180 110'} width={size} style:--tilt={`${tilt}deg`} aria-hidden="true">
  <defs>
    <filter id={uid} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.55" result="spots" />
      <feComposite in="SourceGraphic" in2="spots" operator="in" />
    </filter>
  </defs>
  <g filter={textured ? `url(#${uid})` : undefined} style:color={color}>
    {#if round}
      <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="8" />
      <text x="60" y="61" text-anchor="middle" dominant-baseline="central" font-size={Array.from(text).length > 1 ? 34 : 58} font-weight="900" fill="currentColor">{text}</text>
    {:else}
      <rect x="8" y="8" width={wide ? 244 : 164} height="94" rx="20" fill="none" stroke="currentColor" stroke-width="8" />
      <rect x="20" y="20" width={wide ? 220 : 140} height="70" rx="12" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".6" />
      <text x={wide ? 130 : 90} y="57" text-anchor="middle" dominant-baseline="central" font-size={wide ? 50 : 54} font-weight="900" fill="currentColor" letter-spacing="2">{text}</text>
    {/if}
  </g>
</svg>

<style>
  .vt-stamp {
    display: block;
    overflow: visible;
    transform: rotate(var(--tilt));
  }
  .vt-stamp text {
    font-family: inherit;
  }
</style>
