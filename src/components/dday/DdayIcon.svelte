<script>
  import { resolveToneColor } from '../../lib/dday/ddayModel.js';
  import DdayStickerSvg from './DdayStickerSvg.svelte';

  /**
   * @type {{
   *   icon?: string,
   *   tone?: string,
   *   accent?: string,
   *   size?: number,
   *   dark?: boolean,
   *   variant?: 'badge' | 'bare',
   * }}
   */
  let {
    icon = 'flag',
    tone = 'accent',
    accent = '#d97706',
    size = 26,
    dark = false,
    variant = 'badge',
  } = $props();

  const color = $derived(resolveToneColor(tone, accent));
  // 배지 내부에서는 테두리(1px) 안쪽 여백을 유지하면서 20px 초소형 배너에서도 뭉개지지 않게 82% 비율을 씁니다.
  const stickerSize = $derived(
    variant === 'bare' ? size : Math.max(14, Math.round(size * 0.82)),
  );
</script>

{#if variant === 'bare'}
  <span
    class="dday-bare"
    data-scheme={dark ? 'dark' : 'light'}
    style="--dd-size: {size}px;"
    aria-hidden="true"
  >
    <DdayStickerSvg {icon} size={stickerSize} />
  </span>
{:else}
  <span
    class="dday-bubble"
    data-scheme={dark ? 'dark' : 'light'}
    style="--dd-tone: {color}; --dd-size: {size}px;"
    aria-hidden="true"
  >
    <DdayStickerSvg {icon} size={stickerSize} />
  </span>
{/if}

<style>
  .dday-bare {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--dd-size, 20px);
    height: var(--dd-size, 20px);
    --dd-ink: #4c4340;
    --dd-stem: #4c4340;
    --dd-trail: #94a3b8;
  }

  .dday-bare[data-scheme='dark'] {
    --dd-ink: #3c3431;
    --dd-stem: #e2dad2;
    --dd-trail: #cbd5e1;
    filter: drop-shadow(0 0.8px 1.2px rgba(0, 0, 0, 0.35));
  }

  .dday-bubble {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--dd-size, 26px);
    height: var(--dd-size, 26px);
    box-sizing: border-box;
    border-radius: 36%;
    /* 멀티컬러 파스텔 스티커가 6가지 톤과 충돌하지 않도록 크림 베이스에 톤을 은은히 섞습니다 */
    background: color-mix(in srgb, var(--dd-tone) 11%, #fffdf8);
    border: 1px solid color-mix(in srgb, var(--dd-tone) 22%, rgba(15, 23, 42, 0.06));
    --dd-ink: #4c4340;
    --dd-stem: #4c4340;
    --dd-trail: #94a3b8;
    transition: background-color 150ms ease, border-color 150ms ease;
  }

  .dday-bubble[data-scheme='dark'] {
    background: color-mix(in srgb, var(--dd-tone) 18%, #2a3040);
    border-color: color-mix(in srgb, var(--dd-tone) 30%, rgba(255, 255, 255, 0.1));
    --dd-ink: #3c3431;
    --dd-stem: #e2dad2;
    --dd-trail: #cbd5e1;
  }

  .dday-bubble[data-scheme='dark'] :global(.dday-sticker-svg) {
    filter: drop-shadow(0 0.8px 1.2px rgba(0, 0, 0, 0.35));
  }
</style>
