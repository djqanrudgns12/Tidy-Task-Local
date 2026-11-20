<script>
  // 상자 친구 — 다중 선택 [아카이브] 드롭다운 머리글의 얼굴 달린 골판지 상자 (docs/PRD-bulk-archive-dropdown.md §8)
  // 되돌리기 알림의 휴지통 친구(TrashBuddy)와 짝입니다. 몸은 테마와 상관없이 골판지색이라 어느 테마에서도 "상자"로 읽히고,
  // 볼 터치만 테마 강조색을 섞습니다(--am-cheek). 크기는 em이라 메뉴 글자 크기를 따라갑니다.
  //   idle = 방긋 · copy = 눈 반짝(복사해서 보관에 올림) · move = 두 팔 번쩍 + 입 "o"(옮겨서 보관에 올림)
  import { ARCHIVE_BUDDY_COLORS as C } from '../../lib/todos/archiveMenuPalette.js';

  /** @type {{ mood?: 'idle' | 'copy' | 'move', size?: string, count?: string }} */
  let { mood = 'idle', size = '1.9em', count = '' } = $props();
</script>

<span class="buddy" style="--bd-size: {size};" aria-hidden="true">
  <svg class="art" class:is-move={mood === 'move'} viewBox="0 0 32 32" focusable="false">
    <!-- 두 팔: 평소엔 몸 옆에 내려 있다가 "옮겨서 보관"에서 번쩍 -->
    <g class="arms" stroke={C.outline} stroke-width="1.6" stroke-linecap="round" fill="none">
      <path class="arm arm-l" d="M5.4 19.2 2.6 21.4" />
      <path class="arm arm-r" d="M26.6 19.2 29.4 21.4" />
    </g>
    <!-- 뚜껑 날개 -->
    <path d="M6 11.2 3.4 7.6l8.8-1.1 3.8 4.7z" fill={C.flap} stroke={C.outline} stroke-width="1.2" stroke-linejoin="round" />
    <path d="M26 11.2l2.6-3.6-8.8-1.1-3.8 4.7z" fill={C.flap} stroke={C.outline} stroke-width="1.2" stroke-linejoin="round" />
    <!-- 몸통 + 아래 받침 그림자(딱지 느낌) -->
    <rect x="5.4" y="12" width="21.2" height="16.4" rx="2.6" fill={C.shade} />
    <rect x="5.4" y="10.8" width="21.2" height="16.2" rx="2.6" fill={C.body} stroke={C.outline} stroke-width="1.3" />
    <rect x="14.2" y="10.8" width="3.6" height="4.6" fill={C.tape} />
    <!-- 볼 -->
    <ellipse cx="10" cy="21.6" rx="1.7" ry="1.05" fill="var(--am-cheek, #f2a7a0)" opacity="0.85" />
    <ellipse cx="22" cy="21.6" rx="1.7" ry="1.05" fill="var(--am-cheek, #f2a7a0)" opacity="0.85" />
    <!-- 눈: 기본은 동그란 점(깜빡임), 복사에 올리면 반짝 하이라이트 -->
    <g class="eyes" fill={C.face}>
      <ellipse cx="12.4" cy="18.6" rx="1.05" ry="1.3" />
      <ellipse cx="19.6" cy="18.6" rx="1.05" ry="1.3" />
    </g>
    {#if mood === 'copy'}
      <circle cx="12.75" cy="18.1" r="0.38" fill="#ffffff" />
      <circle cx="19.95" cy="18.1" r="0.38" fill="#ffffff" />
    {/if}
    <!-- 입 -->
    {#if mood === 'move'}
      <ellipse cx="16" cy="22.4" rx="1.05" ry="1.15" fill={C.face} />
    {:else}
      <path d="M14.4 21.6q1.6 1.5 3.2 0" fill="none" stroke={C.face} stroke-width="1.15" stroke-linecap="round" />
    {/if}
  </svg>
  {#if count}
    <span class="count" class:is-wide={count.length > 2}>{count}</span>
  {/if}
</span>

<style>
  .buddy {
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--bd-size);
    height: var(--bd-size);
    /* 친구는 장식입니다 — 누름이 그대로 아래 버튼·바깥으로 통과합니다. */
    pointer-events: none;
  }
  .art {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .arm {
    transform-box: fill-box;
    transition: transform 120ms ease;
  }
  .arm-l { transform-origin: 100% 0; }
  .arm-r { transform-origin: 0 0; }
  .is-move .arm-l { transform: rotate(68deg) translate(-0.4px, -1px); }
  .is-move .arm-r { transform: rotate(-68deg) translate(0.4px, -1px); }
  .eyes {
    transform-box: fill-box;
    transform-origin: center;
    animation: blink 4.6s infinite;
  }
  @keyframes blink {
    0%, 95%, 100% { transform: scaleY(1); }
    97% { transform: scaleY(0.12); }
  }
  /* 개수 방울: 친구 오른쪽 위에 0.35em 겹쳐 붙고, 카드색 테두리로 친구와 떨어져 보이게 합니다.
     100 이상('99+')이면 가로로 늘어나되 왼쪽 끝을 고정해 친구 얼굴을 가리지 않습니다. */
  /* 방울 치수는 방울 자신의 글자 크기(0.62em) 기준입니다: 1.65em × 0.62 ≈ 메뉴 글자 1em(10pt에서 약 13.6px). */
  .count {
    position: absolute;
    top: -0.5em;
    left: calc(100% - 1.15em);
    min-width: 1.65em;
    height: 1.65em;
    padding: 0 0.32em;
    box-sizing: border-box;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    border: 1.5px solid var(--am-card, #ffffff);
    background: var(--am-bubble, #b45309);
    color: var(--am-on-accent, #ffffff);
    font-size: 0.62em;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .count.is-wide { font-size: 0.56em; }
  @media (prefers-reduced-motion: reduce) {
    .eyes { animation: none; }
    .arm { transition: none; }
  }
</style>
