<script lang="ts">
  // 온도계 구의 얼굴(PRD 10.4). 표정이 바뀔 때 0.3초 동안 서로 겹치며 바뀌고, 눈을 뜬 표정은 가끔 깜빡입니다.
  // 부정 무드도 귀여움을 지킵니다 — 화난 얼굴은 "볼이 빨개지고 김이 폴폴" 정도까지만.
  import { fade } from 'svelte/transition';
  let { cx, cy, r, face, reduced = false } = $props<{ cx: number; cy: number; r: number; face: string; reduced?: boolean }>();
  const ex = $derived(r * 0.34);
  const ey = $derived(-r * 0.1);
  const er = $derived(r * 0.105);
  const my = $derived(r * 0.3);
  const mw = $derived(r * 0.25);
  const ink = '#4a2a2e';
  // 입: 가운데를 k만큼 내리면 웃음, 올리면 찡그림
  const mouth = (k: number) => `M ${-mw} ${my} Q 0 ${my + k * r} ${mw} ${my}`;
  const star = (x: number, y: number, s: number) => {
    const p: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 ? s * 0.45 : s;
      p.push(`${(x + Math.cos(a) * rad).toFixed(2)} ${(y + Math.sin(a) * rad).toFixed(2)}`);
    }
    return `M ${p.join(' L ')} Z`;
  };
  const open = $derived(['frozen', 'smile', 'excited', 'sheepish', 'worried'].includes(face));
</script>

<g transform={`translate(${cx} ${cy})`} class="th-face" class:blink={open && !reduced} aria-hidden="true">
  {#key face}
    <g transition:fade={{ duration: reduced ? 0 : 300 }}>
      <!-- 볼 -->
      {#if face === 'star'}
        {#each [-1, 1] as s}<path d={`M ${s * r * 0.55} ${r * 0.18} c ${-r * 0.1} ${-r * 0.12} ${-r * 0.26} 0 ${-r * 0.13} ${r * 0.14} l ${r * 0.13} ${r * 0.12} l ${r * 0.13} ${-r * 0.12} c ${r * 0.13} ${-r * 0.14} ${-r * 0.03} ${-r * 0.26} ${-r * 0.13} ${-r * 0.14} z`} fill="#ff7a93" />{/each}
      {:else}
        <g fill={face === 'flushed' || face === 'boiling' ? '#ff5f6d' : '#ff9aa9'} opacity={face === 'flushed' || face === 'boiling' ? 0.75 : 0.5}>
          <ellipse cx={-r * 0.55} cy={r * 0.2} rx={r * (face === 'flushed' || face === 'boiling' ? 0.2 : 0.14)} ry={r * 0.09} />
          <ellipse cx={r * 0.55} cy={r * 0.2} rx={r * (face === 'flushed' || face === 'boiling' ? 0.2 : 0.14)} ry={r * 0.09} />
        </g>
      {/if}
      <!-- 눈 -->
      <g class="th-eyes" fill={ink} stroke={ink} stroke-width={r * 0.07} stroke-linecap="round" fill-opacity="1">
        {#if face === 'star'}
          <path d={star(-ex, ey, er * 1.9)} fill="#ffd34d" stroke="#c9952a" stroke-width={r * 0.03} />
          <path d={star(ex, ey, er * 1.9)} fill="#ffd34d" stroke="#c9952a" stroke-width={r * 0.03} />
        {:else if face === 'sleepy' || face === 'chill'}
          <path d={`M ${-ex - er} ${ey} h ${er * 2} M ${ex - er} ${ey} h ${er * 2}`} fill="none" />
        {:else if face === 'calm'}
          <path d={`M ${-ex - er} ${ey + er * 0.4} q ${er} ${-er * 1.4} ${er * 2} 0 M ${ex - er} ${ey + er * 0.4} q ${er} ${-er * 1.4} ${er * 2} 0`} fill="none" />
        {:else if face === 'flushed' || face === 'boiling'}
          <path d={`M ${-ex - er} ${ey - er} l ${er * 1.6} ${er} l ${-er * 1.6} ${er} M ${ex + er} ${ey - er} l ${-er * 1.6} ${er} l ${er * 1.6} ${er}`} fill="none" />
        {:else}
          <circle cx={-ex} cy={ey} r={face === 'excited' ? er * 1.25 : er} stroke="none" />
          <circle cx={ex} cy={ey} r={face === 'excited' ? er * 1.25 : er} stroke="none" />
          {#if face === 'excited'}<circle cx={-ex + er * 0.4} cy={ey - er * 0.4} r={er * 0.42} fill="#fff" stroke="none" /><circle cx={ex + er * 0.4} cy={ey - er * 0.4} r={er * 0.42} fill="#fff" stroke="none" />{/if}
        {/if}
      </g>
      <!-- 눈썹(걱정: 八) -->
      {#if face === 'worried'}<path d={`M ${-ex - er * 1.3} ${ey - er * 1.6} l ${er * 2} ${-er * 0.9} M ${ex + er * 1.3} ${ey - er * 1.6} l ${-er * 2} ${-er * 0.9}`} stroke={ink} stroke-width={r * 0.06} stroke-linecap="round" />{/if}
      <!-- 입 -->
      {#if face === 'excited' || face === 'star'}
        <path d={`M ${-mw * 1.1} ${my - r * 0.04} Q 0 ${my + r * 0.42} ${mw * 1.1} ${my - r * 0.04} Z`} fill="#7a2a33" stroke={ink} stroke-width={r * 0.05} stroke-linejoin="round" />
      {:else if face === 'frozen'}
        <path d={`M ${-mw} ${my} l ${mw / 2} ${-r * 0.06} l ${mw / 2} ${r * 0.06} l ${mw / 2} ${-r * 0.06} l ${mw / 2} ${r * 0.06}`} fill="none" stroke={ink} stroke-width={r * 0.06} stroke-linecap="round" stroke-linejoin="round" />
      {:else if face === 'boiling'}
        <path d={`M ${-mw * 0.8} ${my + r * 0.12} Q 0 ${my - r * 0.18} ${mw * 0.8} ${my + r * 0.12} Z`} fill="#7a2a33" stroke={ink} stroke-width={r * 0.05} stroke-linejoin="round" />
      {:else}
        <path d={mouth(face === 'worried' ? -0.12 : face === 'flushed' ? -0.18 : face === 'sheepish' ? 0.05 : face === 'sleepy' ? 0.12 : 0.3)} fill="none" stroke={ink} stroke-width={r * 0.07} stroke-linecap="round" />
      {/if}
      <!-- 땀방울·김·느낌표 -->
      {#if face === 'sheepish' || face === 'worried'}<path d={`M ${r * 0.62} ${-r * 0.5} q ${r * 0.14} ${r * 0.2} 0 ${r * 0.28} q ${-r * 0.14} ${-r * 0.08} 0 ${-r * 0.28} z`} fill="#8fd0ff" stroke="#fff" stroke-width={r * 0.02} />{/if}
      {#if face === 'flushed' || face === 'boiling'}
        <g class="th-steam" fill="none" stroke="#ffffff" stroke-width={r * 0.07} stroke-linecap="round" opacity=".9">
          <path d={`M ${-r * 0.2} ${-r * 1.08} q ${-r * 0.12} ${-r * 0.14} 0 ${-r * 0.28} q ${r * 0.12} ${-r * 0.14} 0 ${-r * 0.28}`} />
          {#if face === 'boiling'}<path d={`M ${r * 0.25} ${-r * 1.02} q ${-r * 0.12} ${-r * 0.14} 0 ${-r * 0.28} q ${r * 0.12} ${-r * 0.14} 0 ${-r * 0.28}`} /><path d={`M ${-r * 0.62} ${-r * 0.86} q ${-r * 0.12} ${-r * 0.14} 0 ${-r * 0.28}`} />{/if}
        </g>
      {/if}
      {#if face === 'boiling'}<text x={r * 0.72} y={-r * 0.55} font-size={r * 0.6} font-weight="900" fill="#ffffff" stroke="#c0303a" stroke-width={r * 0.05} paint-order="stroke">!</text>{/if}
    </g>
  {/key}
</g>
