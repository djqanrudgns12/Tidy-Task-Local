<script lang="ts">
  // 후보·의견 카드(투표판 · 미리보기 · 안내 · 개표 카드 공개가 함께 씀). 다이컷 스티커 모양, 후보 색 바탕.
  // 모양(orient)과 글자·그림 크기는 layout.js의 boothGrid가 정합니다. 이름은 실제 글꼴로 재서 맞춥니다(fitName, keep-all).
  // 이 카드에는 눌림·호버·강조가 없습니다(투표판 비밀 원칙 — PRD 6절).
  import { fitName } from '../../../lib/picker/nameCard.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import Keycap from './Keycap.svelte';
  import Sticker from './Sticker.svelte';
  let { item, type, orient = 'wide', key = 64, art = 120, name = 40, intro = 16, showIntro = true } = $props<{
    item: any; type: string; orient?: 'wide' | 'tall'; key?: number; art?: number; name?: number; intro?: number; showIntro?: boolean;
  }>();
  const c = $derived(paletteOf(item.color));
</script>

<div class="vt-icard vt-c" data-orient={orient} style:--c-bg={c.bg} style:--c-line={c.line} style:--c-ink={c.ink} style:--name={`${name}px`} style:--intro={`${intro}px`}>
  <span class="vt-icard-key"><Keycap label={item.number} size={key} /></span>
  <span class="vt-icard-art"><Sticker {item} {type} size={art} /></span>
  <span class="vt-icard-text">
    <strong use:fitName={item.name}>{item.name}</strong>
    {#if showIntro && item.intro}<small>{item.intro}</small>{/if}
  </span>
</div>

<style>
  .vt-icard {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    min-width: 0;
    min-height: 0;
    padding: 12px;
    border-radius: 26px;
    background: var(--cbg);
    color: var(--vt-ink);
    /* 흰 다이컷 테두리 + 아래 단단한 선 + 퍼지는 그림자 */
    box-shadow:
      0 0 0 6px #fff,
      0 9px 0 0 var(--cline),
      0 14px 30px color-mix(in srgb, var(--vt-ink) 12%, transparent);
    pointer-events: none;
  }
  :global(.vt-root[data-scheme='dark']) .vt-icard {
    box-shadow:
      0 0 0 5px #3d4453,
      0 8px 0 0 var(--cline),
      0 14px 30px rgba(0, 0, 0, 0.35);
  }
  .vt-icard[data-orient='wide'] {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 14px;
    padding: 10px 18px 10px 14px;
  }
  .vt-icard[data-orient='tall'] {
    grid-template-rows: minmax(0, 1fr) auto;
    justify-items: center;
    align-items: center;
    padding: 14px 14px 16px;
  }
  .vt-icard[data-orient='tall'] .vt-icard-key {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1;
  }
  .vt-icard-art {
    display: grid;
    place-items: center;
  }
  .vt-icard-text {
    display: grid;
    align-content: center;
    gap: 4px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .vt-icard[data-orient='tall'] .vt-icard-text {
    justify-items: center;
    text-align: center;
    width: 100%;
  }
  /* 가로형: 이름을 캐릭터에서 글자 크기에 비례해 띄우고(작은 창에서도 붙지 않게),
     남은 칸 가운데에 놓아 카드마다 이름 길이가 달라도 [번호·캐릭터 | 이름] 두 덩어리로 정돈돼 보이게 합니다. */
  .vt-icard[data-orient='wide'] .vt-icard-text {
    justify-items: center;
    text-align: center;
    padding-left: calc(var(--name) * 0.35);
  }
  /* 가운데 정렬이면 칸 폭이 글자 폭만큼 늘어나 넘침이 안 잡히므로(fitName이 줄이지 못함) 칸 폭을 넘지 않게 막습니다. */
  .vt-icard-text > * {
    max-width: 100%;
  }
  .vt-icard-text strong {
    display: block;
    min-width: 0;
    font-size: calc(var(--name) * var(--fit, 1));
    font-weight: 900;
    line-height: 1.12;
    letter-spacing: -0.02em;
    word-break: keep-all;
    overflow-wrap: normal;
    text-wrap: balance;
    color: color-mix(in srgb, var(--cink) 60%, var(--vt-ink));
  }
  :global(.vt-root[data-scheme='dark']) .vt-icard-text strong {
    color: #f1f5f9;
  }
  /* data-squeezed는 fitName이 실행 중에 붙이므로 컴파일러가 모릅니다(:global로 남김) */
  .vt-icard-text strong:global([data-squeezed]) {
    overflow-wrap: anywhere;
  }
  .vt-icard-text small {
    overflow: hidden;
    color: var(--cink);
    font-size: var(--intro);
    font-weight: 800;
    line-height: 1.3;
    white-space: nowrap;
    text-overflow: ellipsis;
    opacity: 0.9;
  }
</style>
