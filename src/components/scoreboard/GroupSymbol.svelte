<script lang="ts">
  // 모둠 모양 12가지(PRD 8.2). 색을 구분하기 어려운 학생도 모양으로 모둠을 알아보게 합니다.
  let { symbol, color = 'currentColor', size = 20 } = $props<{ symbol: string; color?: string; size?: number }>();
</script>

<svg class="sb-symbol" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={color} stroke="#fff" stroke-width="1.2" stroke-linejoin="round">
  {#if symbol === 'star'}<path d="m12 2.8 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
  {:else if symbol === 'heart'}<path d="M12 20.5c-.7-.6-8.5-5.6-8.5-11 0-2.7 2-4.6 4.5-4.6 1.7 0 3.1.9 4 2.3.9-1.4 2.3-2.3 4-2.3 2.5 0 4.5 1.9 4.5 4.6 0 5.4-7.8 10.4-8.5 11Z" />
  {:else if symbol === 'cloud'}<path d="M7 19a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.4 4.8 4.8 0 0 1 17.6 19Z" />
  {:else if symbol === 'flower'}<path d="M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6Zm0-6.7a3.3 3.3 0 0 1 3.3 3.8 3.3 3.3 0 0 1 4.2 3.9 3.3 3.3 0 0 1-1.1 5.6 3.3 3.3 0 0 1-4.7 3.4 3.3 3.3 0 0 1-3.4 0 3.3 3.3 0 0 1-4.7-3.4 3.3 3.3 0 0 1-1.1-5.6 3.3 3.3 0 0 1 4.2-3.9A3.3 3.3 0 0 1 12 2.5Z" fill-rule="evenodd" />
  {:else if symbol === 'drop'}<path d="M12 2.8c3.5 4.4 6.5 8.2 6.5 11.6a6.5 6.5 0 0 1-13 0c0-3.4 3-7.2 6.5-11.6Z" />
  {:else if symbol === 'leaf'}<path d="M4 20c0-9 5.5-15 16-16 .3 10.5-6 16-15 16Zm1.5-1.5 8-8" />
  {:else if symbol === 'bolt'}<path d="M13.5 2 5 13.5h6L9.8 22 19 10h-6.2Z" />
  {:else if symbol === 'moon'}<path d="M15.5 3.2A8.8 8.8 0 1 0 20.8 16 7.2 7.2 0 0 1 15.5 3.2Z" />
  {:else if symbol === 'sun'}<path d="M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10Zm0-5v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke={color} stroke-width="2.2" stroke-linecap="round" />
  {:else if symbol === 'note'}<path d="M9 18.5a3 3 0 1 1-2-2.8V5.2l11-2.2v12.5a3 3 0 1 1-2-2.8V7.4L9 8.8Z" />
  {:else if symbol === 'clover'}<path d="M12 11.5a4 4 0 1 1 0-6.5 4 4 0 1 1 0 6.5Zm0 0a4 4 0 1 1 6.5 0 4 4 0 1 1-6.5 0Zm0 0a4 4 0 1 1 0 6.5 4 4 0 1 1 0-6.5Zm0 0a4 4 0 1 1-6.5 0 4 4 0 1 1 6.5 0ZM12 12l3 9" />
  {:else}<path d="M12 21c-3.8 0-6.2-3.5-6-8h12c.2 4.5-2.2 8-6 8ZM5.3 12c-.3-3 2.8-5 6.7-5s7 2 6.7 5Zm6.7-5V3.5" />
  {/if}
</svg>

<style>
  .sb-symbol {
    flex: none;
    overflow: visible;
    filter: drop-shadow(0 1px 0 rgb(0 0 0 / 0.12));
  }
</style>
