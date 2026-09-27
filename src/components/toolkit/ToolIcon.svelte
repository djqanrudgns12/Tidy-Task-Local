<script lang="ts">
  let { kind, size = 32 } = $props<{ kind: string; size?: number }>();
  const colors: Record<string, [string, string]> = {
    timer: ['#e3effb', '#426f9e'],
    clock: ['#fde8ef', '#b65a7a'],
    picker: ['#f1e7fa', '#8661a4'],
    noticeboard: ['#e5f1e6', '#4c8064'],
    tournament: ['#fff0d3', '#a9782c'],
    'focus-bell': ['#fbe6de', '#b96e53'],
    dice: ['#e4f6ee', '#4e9c81'],
    seating: ['#f1ebdd', '#747e5c'],
    roster: ['#e0f1f0', '#47817e'],
    scoreboard: ['#e7ecfb', '#4d63a8'],
    thermometer: ['#fde6e8', '#c24b57'],
    vote: ['#eef6dc', '#6b8a2a'],
    'scoreboard-personal': ['#e3effb', '#426f9e'],
    'scoreboard-group': ['#e4f6ee', '#4e9c81'],
    'scoreboard-custom': ['#fff0d3', '#a9782c'],
    external: ['#e6eafb', '#646eaa'],
    settings: ['#3d5878', '#ffffff'],
  };
  const palette = $derived(colors[kind] ?? colors.settings);
</script>

<svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" class="toolkit-art-icon">
  {#if kind !== 'settings'}
  <rect x="2" y="3" width="36" height="36" rx="11" fill="#243b53" opacity=".09" />
  <rect x="2" y="1.5" width="36" height="36" rx="11" fill={palette[0]} />
  <path d="M12 3.5h16" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".8" />
  {/if}
  <g stroke={palette[1]} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    {#if kind === 'timer'}
      <path d="M17 7h6m-3 0v3m8 2 2-2" />
      <circle cx="20" cy="22" r="11" fill="#fffdf8" />
      <path d="M20 14v8l5 3" /><circle cx="20" cy="22" r="1.4" fill={palette[1]} stroke="none" />
      <path d="M13 22h1m12 0h1m-7 7v1" opacity=".5" />
    {:else if kind === 'clock'}
      <!-- 타이머(꼭지 달린 초시계)와 헷갈리지 않게, 두 발로 선 탁상시계가 10시 10분을 가리키는 모양입니다. -->
      <path d="m13.5 30.5-2 3.2m15-3.2 2 3.2M18.6 8.6h2.8" />
      <circle cx="20" cy="20.5" r="11" fill="#fffdf8" />
      <g fill={palette[1]} stroke="none" opacity=".55"><circle cx="20" cy="12.6" r="1" /><circle cx="27.9" cy="20.5" r="1" /><circle cx="20" cy="28.4" r="1" /><circle cx="12.1" cy="20.5" r="1" /></g>
      <path d="M20 20.5 16 17.7m4 2.8 6.3-3.6" stroke-width="2" />
      <circle cx="20" cy="20.5" r="1.5" fill={palette[1]} stroke="none" />
    {:else if kind === 'picker'}
      <rect x="10" y="10" width="21" height="22" rx="5" fill="#fffdf8" transform="rotate(-9 20 21)" />
      <g fill={palette[1]} stroke="none"><circle cx="15" cy="16" r="1.8" /><circle cx="25" cy="15" r="1.8" /><circle cx="20" cy="21" r="1.8" /><circle cx="16" cy="27" r="1.8" /><circle cx="26" cy="26" r="1.8" /></g>
    {:else if kind === 'noticeboard'}
      <path d="M20 12c-4-3-8-3-12-2v21c4-1 8-1 12 2 4-3 8-3 12-2V10c-4-1-8-1-12 2Z" fill="#fffdf8" />
      <path d="M20 12v21m-8-17 4 1m-4 4 4 1m8-5 4-1m-4 6 4-1" />
      <path d="M27 10v7l2-1 2 1v-7" fill="#d4a452" stroke="none" />
    {:else if kind === 'tournament'}
      <path d="M13 12H8v5c0 4 3 6 7 6m12-11h5v5c0 4-3 6-7 6" />
      <path d="M13 9h14v10a7 7 0 0 1-14 0V9Z" fill="#f6d47c" />
      <path d="M20 26v5m-6 1h12" /><path d="m20 13 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4Z" fill="#fffdf8" stroke="none" />
    {:else if kind === 'focus-bell'}
      <path d="M17 30a3 3 0 0 0 6 0m-3-21V7" />
      <path d="M11 26c3-3 2-7 3-11a6 6 0 0 1 12 0c1 4 0 8 3 11H11Z" fill="#fff3cf" />
      <path d="M9 12 7 16m24-4 2 4m-15-1c-1 1-1 3-1 5" />
    {:else if kind === 'dice'}
      <!-- 간단 뽑기(흰 카드에 눈 5개)와 헷갈리지 않게, 주사위 도구의 복숭아·민트 주사위 두 개가 겹친 모양입니다. -->
      <rect x="17.5" y="8.5" width="15" height="15" rx="4.5" fill="#a6e6cc" stroke="#4e9c81" transform="rotate(14 25 16)" />
      <g fill="#22514a" stroke="none" transform="rotate(14 25 16)"><circle cx="21.6" cy="12.6" r="1.5" /><circle cx="28.4" cy="19.4" r="1.5" /></g>
      <rect x="7.5" y="15.5" width="18" height="18" rx="5.5" fill="#ffb8a6" stroke="#c96f5b" transform="rotate(-9 16.5 24.5)" />
      <path d="M16.5 28.4c-.5-.4-4.2-2.7-4.2-5.6 0-1.5 1.1-2.6 2.5-2.6.8 0 1.4.4 1.7 1 .3-.6.9-1 1.7-1 1.4 0 2.5 1.1 2.5 2.6 0 2.9-3.7 5.2-4.2 5.6Z" fill="#b8283a" stroke="none" transform="rotate(-9 16.5 24.5)" />
    {:else if kind === 'seating'}
      <!-- 칠판을 바라보는 책상 네 개와 책상마다 붙은 의자를 위에서 본 교실 배치. -->
      <rect x="9" y="8" width="22" height="5" rx="1.5" fill="#66856b" />
      <path d="M15 10.5h10" stroke="#fffdf8" stroke-width="1.2" opacity=".85" />
      <g fill="#f2d6a2">
        <rect x="8" y="16" width="10" height="4.5" rx="1.5" />
        <rect x="22" y="16" width="10" height="4.5" rx="1.5" />
        <rect x="8" y="26.5" width="10" height="4.5" rx="1.5" />
        <rect x="22" y="26.5" width="10" height="4.5" rx="1.5" />
      </g>
      <g fill="#fffdf8">
        <path d="M10.5 22h5v1a2.5 2.5 0 0 1-5 0v-1Z" />
        <path d="M24.5 22h5v1a2.5 2.5 0 0 1-5 0v-1Z" />
        <path d="M10.5 32.5h5v1a2.5 2.5 0 0 1-5 0v-1Z" />
        <path d="M24.5 32.5h5v1a2.5 2.5 0 0 1-5 0v-1Z" />
      </g>
    {:else if kind === 'roster'}
      <circle cx="14" cy="15" r="4" fill="#fffdf8" /><circle cx="27" cy="16" r="3.5" fill="#b2d8d1" />
      <path d="M22 30v-3a7 7 0 0 0-14 0v3h14Z" fill="#fffdf8" /><path d="M25 23c5-1 8 2 8 6v1h-7" fill="#b2d8d1" />
    {:else if kind === 'scoreboard'}
      <!-- 다리 달린 작은 전광판에 숫자 두 칸(1·2)과 별. 타이머(초시계)·주사위와 모양이 겹치지 않게 사각 판으로 그립니다. -->
      <path d="M13 29.5v4m14-4v4" />
      <rect x="6.5" y="10.5" width="27" height="19.5" rx="5" fill="#fffdf8" />
      <path d="M20 13.5v13.5" opacity=".3" />
      <path d="M11.8 17.3 14 15.8v9.6" stroke-width="2" />
      <path d="M24.1 17.6c.4-1.1 1.3-1.8 2.5-1.8 1.4 0 2.5 1 2.5 2.3 0 2.5-5 3.6-5 7.3h5.1" stroke-width="2" />
      <path d="m20 5.2 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z" fill="#f6c95b" stroke="#c9952a" stroke-width="1" />
    {:else if kind === 'thermometer'}
      <!-- 딸기색 구에 점 눈이 달린 온도계 — 학급 온도계 화면의 귀여운 구와 같은 모양입니다. -->
      <path d="M16.5 24.5V10.3a3.5 3.5 0 0 1 7 0v14.2" fill="#fffdf8" />
      <path d="M20 25V15.5" stroke="#e5484d" stroke-width="3" />
      <circle cx="20" cy="28.5" r="6" fill="#ff8f96" stroke="#c24b57" />
      <g fill="#7a2a33" stroke="none"><circle cx="18" cy="28" r=".9" /><circle cx="22" cy="28" r=".9" /></g>
      <path d="M26 12h3m-3 4h2m-2 4h3" stroke-width="1.6" />
    {:else if kind === 'vote'}
      <!-- 체크 표시한 용지가 투표함 틈으로 반쯤 들어가는 모양. 뽑기(카드)·점수판(전광판)과 겹치지 않게 상자 윤곽으로 그립니다. -->
      <g transform="rotate(-8 20 12)"><rect x="14" y="4.5" width="12" height="13.5" rx="2" fill="#fffdf8" /><path d="m17 11.2 2.1 2.1 4-4.4" stroke-width="2" /></g>
      <path d="M8.2 20.5h23.6l1.3 11.3a2.2 2.2 0 0 1-2.2 2.4H9.1a2.2 2.2 0 0 1-2.2-2.4Z" fill="#fffdf8" />
      <rect x="6.5" y="16.5" width="27" height="5" rx="2.2" fill="#d6e9a3" />
      <path d="M14.5 19h11" stroke-width="2.2" />
      <path d="M20 30.4c-.4-.3-3.3-2.1-3.3-4.4 0-1.2.9-2 2-2 .6 0 1.1.3 1.3.8.2-.5.7-.8 1.3-.8 1.1 0 2 .8 2 2 0 2.3-2.9 4.1-3.3 4.4Z" fill="#f29a8f" stroke="none" />
    {:else if kind === 'scoreboard-personal'}
      <circle cx="17" cy="15" r="4.6" fill="#fffdf8" />
      <path d="M9 31v-1.5a8 8 0 0 1 16 0V31Z" fill="#fffdf8" />
      <circle cx="28" cy="26" r="5" fill="#f6c95b" stroke="#c9952a" />
      <path d="M27.3 24.4 28.5 23.6v5" stroke="#8a5d12" stroke-width="1.4" />
    {:else if kind === 'scoreboard-group'}
      <circle cx="12" cy="16" r="3.6" fill="#fffdf8" /><circle cx="28" cy="16" r="3.6" fill="#fffdf8" />
      <circle cx="20" cy="13.5" r="4.2" fill="#b8e6cf" />
      <path d="M5.5 30v-1a6.5 6.5 0 0 1 13 0v1Zm16 0v-1a6.5 6.5 0 0 1 13 0v1Z" fill="#fffdf8" />
      <path d="M12.5 30v-2a7.5 7.5 0 0 1 15 0v2Z" fill="#b8e6cf" />
    {:else if kind === 'scoreboard-custom'}
      <rect x="7.5" y="9.5" width="20" height="23" rx="4.5" fill="#fffdf8" />
      <path d="M11.5 15.5h9m-9 5h7m-9 5h5" />
      <path d="m24.5 29 1-4.3 7.2-7.2a2.2 2.2 0 0 1 3.1 3.1L28.6 27.8Z" fill="#f6d47c" />
    {:else if kind === 'external'}
      <path d="M11 14h7l3 3h10v13H9V16a2 2 0 0 1 2-2Z" fill="#fffdf8" />
      <path d="m20 22 10-11m-7 0h7v7" stroke-width="2.4" />
    {:else}
      <path d="m17 8-.8 4-2.4 1.4-3.8-1.3-3 5.2 3 2.7v2.8l-3 2.7 3 5.2 3.8-1.3 2.4 1.4.8 4h6l.8-4 2.4-1.4 3.8 1.3 3-5.2-3-2.7V20l3-2.7-3-5.2-3.8 1.3-2.4-1.4L23 8h-6Z M24.5 21.5a4.5 4.5 0 1 0-9 0 4.5 4.5 0 1 0 9 0Z" fill="currentColor" fill-rule="evenodd" stroke="none" transform="translate(0 -1.5)" />
    {/if}
  </g>
</svg>
