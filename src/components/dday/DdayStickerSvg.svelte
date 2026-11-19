<script>
  // Tidy Task 툴킷(ToolIcon.svelte)의 크림 종이(#fffdf8) + 파스텔 면 + 둥근 윤곽 감성을 계승한
  // D-Day 전용 21종 파스텔 스티커 SVG 렌더러입니다.
  // 왜 정적 Svelte SVG로 두는가: 오프라인 데스크톱 앱에서 네트워크 요청·OS 이모지 편차 없이
  // 4K 200% 배율과 20px 초소형 배너까지 선명하게 유지하고, {@html} 없이 안전하게 렌더링하기 위함입니다.

  import { DDAY_ICONS } from '../../lib/dday/ddayModel.js';

  /** @type {{ icon?: string, size?: number }} */
  let { icon = 'flag', size = 20 } = $props();

  const resolvedIcon = $derived(
    DDAY_ICONS.includes(/** @type {import('../../lib/dday/ddayModel.js').DdayIconId} */ (icon))
      ? icon
      : 'flag',
  );
</script>

<svg
  class="dday-sticker-svg"
  width={size}
  height={size}
  viewBox="0 0 32 32"
  fill="none"
  aria-hidden="true"
>
  <g stroke="var(--dd-ink, #4c4340)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    {#if resolvedIcon === 'flag'}
      <path d="M9 27V6" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
      <path d="M9 7.5c4.5-2 9 1.5 14 0v10c-5 1.5-9.5-2-14 0Z" fill="#ff9aa2" />
      <circle cx="9" cy="6" r="1.7" fill="#ffd166" />
    {:else if resolvedIcon === 'cal'}
      <rect x="5.5" y="7.5" width="21" height="19" rx="4.5" fill="#fffdf8" />
      <path d="M10 7.5h12a4.5 4.5 0 0 1 4.5 4.5v1h-21v-1A4.5 4.5 0 0 1 10 7.5Z" fill="#ffb8a6" />
      <path d="M11 5.5v4m10-4v4" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
      <g stroke="none">
        <circle cx="11.5" cy="18" r="1.4" fill="#4c4340" />
        <circle cx="16" cy="18" r="1.5" fill="#ef6f86" />
        <circle cx="20.5" cy="18" r="1.4" fill="#4c4340" />
        <circle cx="11.5" cy="22.3" r="1.4" fill="#4c4340" />
        <circle cx="16" cy="22.3" r="1.4" fill="#4c4340" />
      </g>
    {:else if resolvedIcon === 'bell'}
      <path d="M13 25a3 3 0 0 0 6 0" fill="#f6c95b" />
      <path d="M8.5 22.5c2.2-2.2 2-6 2.5-9.2a5 5 0 0 1 10 0c.5 3.2.3 7 2.5 9.2H8.5Z" fill="#ffe28a" />
      <path d="M13.2 13.5c-.5 1.1-.6 2.4-.7 3.7" stroke="#fffdf8" stroke-width="1.4" />
      <path d="M16 5.5v2.5M6.5 11l-1.5 2.5m20.5-2.5 1.5 2.5" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
    {:else if resolvedIcon === 'hourglass'}
      <path d="M11 6.8v3.2c0 2.7 5 4.5 5 6s-5 3.3-5 6v3.2h10V22c0-2.7-5-4.5-5-6s5-3.3 5-6V6.8Z" fill="#fffdf8" />
      <path d="M12.5 24.4h7c0-2.2-1.8-3.8-3.5-4.5-1.7.7-3.5 2.3-3.5 4.5Z" fill="#a6e6cc" stroke="none" />
      <path d="M13 9h6c0 1.4-1.4 2.8-3 3.5-1.6-.7-3-2.1-3-3.5Z" fill="#f6d47c" stroke="none" />
      <path d="M9 6.5h14M9 25.5h14" stroke="var(--dd-stem, #4c4340)" stroke-width="1.9" />
    {:else if resolvedIcon === 'book'}
      <path d="M16 10c-3.2-2.3-6.8-2.3-10-1.5v16c3.2-.8 6.8-.8 10 1.5 3.2-2.3 6.8-2.3 10-1.5v-16c-3.2-.8-6.8-.8-10 1.5Z" fill="#fffdf8" />
      <path d="M16 10v16" />
      <path d="M9.2 13.2l3.6.7m-3.6 3.5l3.6.7m6-4.2 3.6-.7m-3.6 4.2 3.6-.7" stroke="#7aa0c4" stroke-width="1.5" />
      <path d="M21 8.5v5.8l1.6-1 1.6 1V8.5" fill="#ef6f86" stroke="none" />
    {:else if resolvedIcon === 'pencil'}
      <g transform="rotate(-12 16 16)">
        <path d="M19.8 6.5l5.2 5.2-11.8 11.8-6.2 1 1-6.2Z" fill="#ffe28a" />
        <path d="M19.8 6.5l5.2 5.2-2.8 2.8-5.2-5.2Z" fill="#ff9aa2" />
        <path d="M8 18.3l5.2 5.2-6.2 1Z" fill="#fffdf8" />
        <path d="M7.5 22.8l2 2-2.5.4Z" fill="#4c4340" stroke="none" />
      </g>
    {:else if resolvedIcon === 'puzzle'}
      <path d="M13 8a2.3 2.3 0 1 1 4.6 0h3.9a2 2 0 0 1 2 2v3.7a2.3 2.3 0 1 1 0 4.6V22a2 2 0 0 1-2 2H17a2.3 2.3 0 1 0-4.6 0H9a2 2 0 0 1-2-2v-3.7a2.3 2.3 0 1 0 0-4.6V10a2 2 0 0 1 2-2h4Z" fill="#b8e6cf" />
      <path d="M10.5 11.5h3.2" stroke="#fffdf8" stroke-width="1.5" />
    {:else if resolvedIcon === 'trophy'}
      <path d="M10.5 9.5H6.5v3.5c0 2.8 2 4.5 4.8 4.5m10.2-8h4v3.5c0 2.8-2 4.5-4.8 4.5" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
      <path d="M10.5 7.5h11v7.5a5.5 5.5 0 0 1-11 0V7.5Z" fill="#f6d47c" />
      <path d="M16 20.5V25m-4.5.5h9" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
      <path d="m16 10.6.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3Z" fill="#fffdf8" stroke="none" />
    {:else if resolvedIcon === 'party'}
      <path d="M7.5 24.5 11.8 11l9.2 9.2Z" fill="#ffb8a6" />
      <path d="M10.2 16l5.8 5.8" stroke="#fffdf8" stroke-width="1.8" />
      <path d="M18.5 10.5c1-2 2.5-3 4.5-3m-1.5 6.5c2-.5 3.5 0 4.5 1.5" stroke="var(--dd-stem, #4c4340)" stroke-width="1.8" />
      <g stroke="none">
        <circle cx="17" cy="7" r="1.5" fill="#7ec8e3" />
        <circle cx="25" cy="11.5" r="1.6" fill="#f6c95b" />
        <circle cx="22.5" cy="19.5" r="1.4" fill="#c3a6f5" />
      </g>
    {:else if resolvedIcon === 'cake'}
      <rect x="7" y="15.5" width="18" height="10" rx="3" fill="#fffdf8" />
      <path d="M7 18.5c2 1.8 4 1.8 6 0 2 1.8 4 1.8 6 0 2 1.8 4 1.8 6 0v-1.2A2.5 2.5 0 0 0 22.5 15h-13A2.5 2.5 0 0 0 7 17.3Z" fill="#ffb3c1" />
      <path d="M16 11v4" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
      <path d="M16 6.2c1.8 1.8 2 3.2 0 4.3-2-1.1-1.8-2.5 0-4.3Z" fill="#ffd166" />
      <g stroke="none">
        <circle cx="11.5" cy="22" r="1.15" fill="#ff8f96" />
        <circle cx="16" cy="22.2" r="1.1" fill="#f6c95b" />
        <circle cx="20.5" cy="22" r="1.15" fill="#a6e6cc" />
      </g>
    {:else if resolvedIcon === 'gift'}
      <rect x="7.5" y="14" width="17" height="12" rx="2.5" fill="#fffdf8" />
      <rect x="6" y="10.5" width="20" height="4.5" rx="2" fill="#d9c6fa" />
      <path d="M16 10.5V26" stroke="#ef6f86" stroke-width="3" />
      <path d="M16 10.5V26" />
      <path d="M16 10.5c-1.5-3-5.2-3.5-5.2-1 0 1.8 3.2 1 5.2 1Zm0 0c1.5-3 5.2-3.5 5.2-1 0 1.8-3.2 1-5.2 1Z" fill="#ff9aa2" />
    {:else if resolvedIcon === 'heart'}
      <path d="M16 25.5c-1-.7-9.5-5.7-9.5-11.8A5.2 5.2 0 0 1 16 10.2a5.2 5.2 0 0 1 9.5 3.5c0 6.1-8.5 11.1-9.5 11.8Z" fill="#ff9aa2" />
      <path d="M10.4 12.4a2.4 2.4 0 0 1 2.3-1.6" stroke="#fffdf8" stroke-width="1.8" />
    {:else if resolvedIcon === 'plane'}
      <path d="M25.5 7.5 19 25l-3.5-6.5L9 15l16.5-7.5Z" fill="#9bd5f5" />
      <path d="M25.5 7.5 15.5 18.5" />
      <path d="M7 23.5c1.5-.8 3-1 4.2-.6" stroke="var(--dd-trail, #94a3b8)" stroke-width="1.6" stroke-dasharray="2 2.5" />
    {:else if resolvedIcon === 'camera'}
      <rect x="6" y="10.5" width="20" height="14.5" rx="4" fill="#b8dff5" />
      <path d="M11.5 10.5l1.5-3h6l1.5 3Z" fill="#fffdf8" />
      <circle cx="16" cy="17.8" r="4.3" fill="#fffdf8" />
      <circle cx="16" cy="17.8" r="2" fill="#4c4340" stroke="none" />
      <circle cx="15.2" cy="17" r="0.65" fill="#fffdf8" stroke="none" />
      <circle cx="22.3" cy="13.8" r="1.1" fill="#ff8f96" stroke="none" />
    {:else if resolvedIcon === 'sprout'}
      <path d="M16 25.5V15M11 25.5h10" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
      <path d="M16 17c-5.5 0-8.5-3.2-8.5-8 5.2 0 8.5 2.5 8.5 8Z" fill="#a6e6cc" />
      <path d="M16 15.5c5.5 0 8.5-3.2 8.5-8-5.2 0-8.5 2.5-8.5 8Z" fill="#82d6a6" />
    {:else if resolvedIcon === 'flower'}
      <g fill="#ffc2d1">
        <circle cx="16" cy="9.5" r="3.8" />
        <circle cx="22.2" cy="14" r="3.8" />
        <circle cx="19.8" cy="21.2" r="3.8" />
        <circle cx="12.2" cy="21.2" r="3.8" />
        <circle cx="9.8" cy="14" r="3.8" />
      </g>
      <circle cx="16" cy="16" r="3.6" fill="#ffe28a" />
    {:else if resolvedIcon === 'sun'}
      <circle cx="16" cy="16" r="6.2" fill="#ffe28a" />
      <path d="M16 5.5v2.2m0 16.6v2.2M5.5 16h2.2m16.6 0h2.2M8.6 8.6l1.6 1.6m11.6 11.6 1.6 1.6m0-14.8-1.6 1.6M10.2 21.8l-1.6 1.6" stroke="#e5a93b" stroke-width="2" />
      <g fill="#4c4340" stroke="none">
        <circle cx="14" cy="15.5" r="0.95" />
        <circle cx="18" cy="15.5" r="0.95" />
      </g>
      <path d="M14.6 18c.8.8 2 .8 2.8 0" stroke="#4c4340" stroke-width="1.35" />
    {:else if resolvedIcon === 'snow'}
      <circle cx="16" cy="16" r="9.6" fill="#e0f2fe" stroke="none" />
      <path d="M16 6.5v19M7.8 11.2l16.4 9.6m0-9.6L7.8 20.8" stroke="#4b83b3" stroke-width="1.9" />
      <path d="M13.8 8.7 16 10.6l2.2-1.9m-4.4 14.6L16 21.4l2.2 1.9M8.8 14l2.3-1.4-.4-2.6m12.5 12-.4-2.6 2.3-1.4" stroke="#4b83b3" stroke-width="1.5" />
      <circle cx="16" cy="16" r="2.2" fill="#fffdf8" stroke="#4b83b3" stroke-width="1.6" />
    {:else if resolvedIcon === 'star'}
      <path d="m16 6.2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1Z" fill="#ffe28a" />
      <g fill="#4c4340" stroke="none">
        <circle cx="14.2" cy="15.7" r="0.9" />
        <circle cx="17.8" cy="15.7" r="0.9" />
      </g>
    {:else if resolvedIcon === 'sparkle'}
      <path d="M16 5.5 18.4 13l7.6 2.5-7.6 2.5L16 25.5 13.6 18 6 15.5l7.6-2.5Z" fill="#ffe28a" />
      <path d="M24 6.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" fill="#ffb8a6" stroke-width="1.25" />
      <circle cx="8.5" cy="23.5" r="1.6" fill="#9bd5f5" stroke="none" />
    {:else if resolvedIcon === 'clover'}
      <path d="M16 19.5c0 3 1.5 5 3.5 6" stroke="var(--dd-stem, #4c4340)" stroke-width="1.85" />
      <g fill="#9ee3b8">
        <circle cx="12.5" cy="12" r="4" />
        <circle cx="19.5" cy="12" r="4" />
        <circle cx="12.5" cy="19" r="4" />
        <circle cx="19.5" cy="19" r="4" />
      </g>
      <circle cx="16" cy="15.5" r="1.5" fill="#fffdf8" stroke="none" />
    {/if}
  </g>
</svg>

<style>
  .dday-sticker-svg {
    display: block;
    flex: none;
  }
</style>
