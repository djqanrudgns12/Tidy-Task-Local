<script lang="ts">
  // 아날로그 문자판. 귀여움보다 "한눈에 몇 시인지 읽힌다"를 먼저 지킵니다(PRD 4절 가독성 규칙).
  // - 숫자 1~12를 모두 굵게, 분 눈금 60개(5분마다 길고 굵게)
  // - 시침·분침·초침은 길이·굵기·색이 모두 달라 헷갈리지 않게
  import { untrack } from 'svelte';
  import { nextRotation } from '../../lib/clock/clockTime.js';
  let { hour, minute, second, showSeconds, minuteNumbers } = $props<{
    /** 바늘 각도(12시 방향 0°, 시계 방향) */
    hour: number;
    minute: number;
    second: number;
    showSeconds: boolean;
    minuteNumbers: boolean;
  }>();

  type Turn = { rotation: number; animate: boolean };
  // 누적 회전값: 59초 → 0초에서 바늘이 거꾸로 한 바퀴 돌지 않게 앞으로만 늘려 갑니다.
  let hourTurn = $state<Turn>({ rotation: 0, animate: false });
  let minuteTurn = $state<Turn>({ rotation: 0, animate: false });
  let secondTurn = $state<Turn>({ rotation: 0, animate: false });
  let started = false;
  $effect(() => {
    const [h, m, s] = [hour, minute, second];
    // 이전 회전값은 추적하지 않고 읽습니다. 추적하면 여기서 바꾼 값 때문에 효과가 다시 돌아 움직임이 지워집니다.
    untrack(() => {
      const first = !started;
      started = true;
      hourTurn = nextRotation(first ? null : hourTurn.rotation, h);
      minuteTurn = nextRotation(first ? null : minuteTurn.rotation, m);
      secondTurn = nextRotation(first ? null : secondTurn.rotation, s);
    });
  });

  const NUMBER_RADIUS = 70;
  const numbers = Array.from({ length: 12 }, (_, i) => {
    const value = i + 1;
    const angle = (value * 30 * Math.PI) / 180;
    return { value, x: Math.sin(angle) * NUMBER_RADIUS, y: -Math.cos(angle) * NUMBER_RADIUS };
  });
  const ticks = Array.from({ length: 60 }, (_, i) => ({ angle: i * 6, major: i % 5 === 0 }));
  const minuteLabels = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180;
    return { value: i * 5, x: Math.sin(angle) * 114, y: -Math.cos(angle) * 114 };
  });
  const extent = $derived(minuteNumbers ? 126 : 104);

  // 초침은 "톡" 하고 살짝 튕기듯, 시침·분침은 조용히 움직입니다. 크게 건너뛸 때는 움직임 없이 옮깁니다.
  const handStyle = (turn: Turn, kind: 'slow' | 'tick') =>
    `transform: rotate(${turn.rotation}deg); transition: ${
      turn.animate ? (kind === 'tick' ? 'transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 0.16s linear') : 'none'
    };`;
</script>

<svg
  class="clk-analog"
  viewBox="{-extent} {-extent} {extent * 2} {extent * 2}"
  preserveAspectRatio="xMidYMid meet"
  aria-hidden="true"
>
  {#if minuteNumbers}
    <g class="clk-minute-numbers">
      {#each minuteLabels as label}
        <text x={label.x} y={label.y} text-anchor="middle" dominant-baseline="central">{label.value}</text>
      {/each}
    </g>
  {/if}
  <circle class="clk-dial" r="100" />
  <circle class="clk-dial-ring" r="95" />
  <g class="clk-ticks">
    {#each ticks as tick}
      <line class:major={tick.major} x1="0" y1="-93" x2="0" y2={tick.major ? -82 : -88} transform="rotate({tick.angle})" />
    {/each}
  </g>
  <g class="clk-numbers">
    {#each numbers as n}
      <text x={n.x} y={n.y} text-anchor="middle" dominant-baseline="central">{n.value}</text>
    {/each}
  </g>
  <g class="clk-hand clk-hand-hour" style={handStyle(hourTurn, 'slow')}>
    <line x1="0" y1="12" x2="0" y2="-50" />
  </g>
  <g class="clk-hand clk-hand-minute" style={handStyle(minuteTurn, 'slow')}>
    <line x1="0" y1="14" x2="0" y2="-80" />
  </g>
  {#if showSeconds}
    <g class="clk-hand clk-hand-second" style={handStyle(secondTurn, 'tick')}>
      <line x1="0" y1="22" x2="0" y2="-84" />
      <circle cx="0" cy="-66" r="5.2" />
    </g>
  {/if}
  <circle class="clk-cap" r="7.5" />
  <circle class="clk-cap-dot" r="3" />
</svg>
