<script lang="ts">
  // 후보·의견 스티커(PRD 9절). 흰 다이컷 테두리 + 후보 색 바탕.
  //  - 후보: 동그란 스티커 안에 캐릭터 흉상 그림(원 모양으로 잘라 어깨가 원에 걸침). 그림 파일이 없거나 못 읽으면 같은 색의 큰 번호(PRD 12절).
  //  - 의견: 둥근 사각 스티커 + 무늬 9종 + 큰 번호.
  //  - 남/녀를 아직 안 고른 후보: 옅은 실루엣.
  import { CHARACTER_IMAGES } from '../../../lib/vote/assetFiles.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  let { item, type, size = 96, placeholder = false } = $props<{ item: any; type: string; size?: number; placeholder?: boolean }>();
  const uid = `vt-p-${Math.random().toString(36).slice(2, 9)}`;
  const color = $derived(paletteOf(item.color));
  const src = $derived(type === 'candidate' && item.character ? CHARACTER_IMAGES[item.character] ?? null : null);
  let broken = $state(false);
  $effect(() => {
    void src;
    broken = false;
  });
  const showImage = $derived(!!src && !broken);
</script>

<span class="vt-sticker vt-c" class:square={type === 'opinion'} style:--s={`${size}px`} style:--c-bg={color.bg} style:--c-line={color.line} style:--c-ink={color.ink} aria-hidden="true">
  {#if type === 'opinion'}
    <svg class="vt-sticker-pattern" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <pattern id={uid} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={item.pattern === 'stripes' || item.pattern === 'gingham' ? 'rotate(35)' : ''}>
          {#if item.pattern === 'dots'}<circle cx="7" cy="7" r="2.6" />
          {:else if item.pattern === 'stripes'}<rect x="0" y="0" width="4.5" height="14" />
          {:else if item.pattern === 'gingham'}<rect x="0" y="0" width="7" height="14" opacity=".55" /><rect x="0" y="0" width="14" height="7" opacity=".55" />
          {:else if item.pattern === 'waves'}<path d="M0 8c3.5-4 7-4 10.5 0S17.5 12 21 8" fill="none" stroke="currentColor" stroke-width="2.2" transform="scale(.667 1)" />
          {:else if item.pattern === 'stars'}<path d="m7 2.2 1.4 3 3.2.4-2.4 2.2.6 3.2L7 9.4l-2.8 1.6.6-3.2-2.4-2.2 3.2-.4Z" />
          {:else if item.pattern === 'hearts'}<path d="M7 11.4C6.4 11 2.6 8.6 2.6 5.8 2.6 4.3 3.8 3.2 5.2 3.2c.8 0 1.5.4 1.8 1 .3-.6 1-1 1.8-1 1.4 0 2.6 1.1 2.6 2.6 0 2.8-3.8 5.2-4.4 5.6Z" />
          {:else if item.pattern === 'grid'}<path d="M0 .75h14M.75 0v14" fill="none" stroke="currentColor" stroke-width="1.5" />
          {:else if item.pattern === 'petals'}<g transform="translate(7 7)"><ellipse rx="1.7" ry="3.4" /><ellipse rx="1.7" ry="3.4" transform="rotate(90)" /><circle r="1.4" fill="#fff" opacity=".8" /></g>
          {:else}<path d="M0 10 3.5 4 7 10 10.5 4 14 10" fill="none" stroke="currentColor" stroke-width="2" />{/if}
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={`url(#${uid})`} />
    </svg>
    <b class="vt-sticker-number">{item.number}</b>
  {:else if placeholder}
    <svg class="vt-sticker-ghost" viewBox="0 0 100 100"><circle cx="50" cy="38" r="17" /><path d="M20 90c2-20 15-32 30-32s28 12 30 32Z" /></svg>
  {:else if showImage}
    <img src={src} alt="" draggable="false" onerror={() => (broken = true)} />
  {:else}
    <b class="vt-sticker-number">{item.number}</b>
  {/if}
</span>

<style>
  .vt-sticker {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: var(--cbg);
    /* 흰 다이컷 테두리 + 스티커가 살짝 떠 있는 그림자 */
    box-shadow:
      0 0 0 calc(var(--s) * 0.05) #fff,
      0 calc(var(--s) * 0.05) calc(var(--s) * 0.12) color-mix(in srgb, var(--vt-ink) 16%, transparent);
    overflow: visible;
    color: var(--cink);
  }
  .vt-sticker.square {
    border-radius: calc(var(--s) * 0.26);
    overflow: hidden;
  }
  .vt-sticker img {
    /* 흉상 그림은 색 원과 같은 크기로 놓고 원 모양으로 자릅니다(결과 이미지 resultImage.js와 같은 규칙). */
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    pointer-events: none;
    -webkit-user-drag: none;
  }
  .vt-sticker-number {
    position: relative;
    font-size: calc(var(--s) * 0.5);
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 0 color-mix(in srgb, #fff 70%, transparent);
  }
  .vt-sticker-pattern {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    fill: currentColor;
    color: var(--cink);
    opacity: 0.17;
  }
  .vt-sticker.square::after {
    /* 오른쪽 위 작은 반짝 점 — 코팅 스티커 느낌 */
    content: '';
    position: absolute;
    top: 12%;
    right: 13%;
    width: 11%;
    height: 11%;
    border-radius: 50%;
    background: #fff;
    opacity: 0.75;
  }
  .vt-sticker-ghost {
    width: 70%;
    height: 70%;
    fill: color-mix(in srgb, var(--cink) 22%, transparent);
  }
  :global(.vt-root[data-scheme='dark']) .vt-sticker {
    box-shadow:
      0 0 0 calc(var(--s) * 0.05) #e9e4d8,
      0 calc(var(--s) * 0.05) calc(var(--s) * 0.12) rgba(0, 0, 0, 0.35);
  }
</style>
