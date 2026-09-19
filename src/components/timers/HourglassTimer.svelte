<script lang="ts">
  import { sandHeights } from '../../lib/timers/geometry.js';
  let { fraction, running } = $props<{ fraction: number; running: boolean }>();
  const uid = $props.id();
  const heights = $derived(sandHeights(fraction));
</script>

<svg
  class="hourglass-visual"
  viewBox="0 0 320 360"
  role="img"
  aria-label={`모래시계, 약 ${Math.round(fraction * 100)}% 남음`}
>
  <defs>
    <clipPath id={`${uid}-top`}
      ><path d="M78 66 H242 Q242 120 167 174 H153 Q78 120 78 66 Z" /></clipPath
    >
    <clipPath id={`${uid}-bottom`}
      ><path d="M153 186 H167 Q242 240 242 294 H78 Q78 240 153 186 Z" /></clipPath
    >
  </defs>
  <rect x="53" y="54" width="11" height="250" rx="5.5" fill="#b3d3bd" />
  <rect x="256" y="54" width="11" height="250" rx="5.5" fill="#b3d3bd" />
  <path
    d="M79 58 H241 Q253 58 253 70 Q253 124 177 178 Q175 180 177 182 Q253 236 253 294 Q253 306 241 306 H79 Q67 306 67 294 Q67 236 143 182 Q145 180 143 178 Q67 124 67 70 Q67 58 79 58 Z"
    fill="#f3faf5"
    stroke="#8fb5a1"
    stroke-width="2.5"
  />
  <rect
    x="70"
    y={174 - heights.upper}
    width="180"
    height={heights.upper}
    fill="#f2c166"
    clip-path={`url(#${uid}-top)`}
  />
  <rect
    x="70"
    y={294 - heights.lower}
    width="180"
    height={heights.lower}
    fill="#f2c166"
    clip-path={`url(#${uid}-bottom)`}
  />
  {#if fraction > 0 && running}<g class="sand-stream"
      ><line
        x1="160"
        y1="170"
        x2="160"
        y2={294 - heights.lower}
        stroke="#e0aa45"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-dasharray="1 6"
      /><circle cx="156" cy={292 - heights.lower} r="1.7" fill="#e0aa45" /><circle
        cx="165"
        cy={292 - heights.lower}
        r="1.6"
        fill="#e0aa45"
      /></g
    >{/if}
  <path
    d="M83 80 Q88 119 126 148 M194 215 Q231 252 234 281"
    fill="none"
    stroke="white"
    stroke-width="5"
    stroke-linecap="round"
  />
  <rect x="39" y="37" width="242" height="25" rx="11" fill="#85b69a" />
  <rect x="39" y="300" width="242" height="25" rx="11" fill="#85b69a" />
  <path d="M53 330 H267" stroke="#ecf1e6" stroke-width="4" stroke-linecap="round" />
</svg>
