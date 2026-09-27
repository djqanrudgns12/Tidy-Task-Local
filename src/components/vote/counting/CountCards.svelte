<script lang="ts">
  // 반전 공개 · 골라 공개(PRD 8절). 후보 카드는 결과 칸(득표 또는 순위)을 덮개로 가린 채 나란히 있습니다.
  //  - 반전 공개: 득표가 낮은 묶음부터 덮개가 뒤집힘(같은 득표는 함께). 당선 묶음 앞에서는 드럼롤(주변이 살짝 어두워지고 카드가 미세하게 떨림).
  //  - 골라 공개: 선생님이 누른 카드부터(선생님 창에서도 가능). 당선 표시는 모두 연 뒤에 한꺼번에(먼저 연 카드로 결과를 미리 알 수 없게).
  //  - 당선자만 공개(반전 공개만 가능): 다른 후보는 보여 주지 않고, 드럼롤 뒤 당선 카드만 등장.
  import { untrack } from 'svelte';
  import { countItems, rankRows, decide } from '../../../lib/vote/tally.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import Sticker from '../common/Sticker.svelte';
  import Keycap from '../common/Keycap.svelte';
  import Crown from '../art/Crown.svelte';
  import BallotBox from '../art/BallotBox.svelte';
  import OutlookTag from './OutlookTag.svelte';
  import type { Outlook } from '../../../lib/vote/outlook.js';
  let { s, cursor, revealed, groups, drumroll, audio, reduced, outlook, finished, onpick } = $props<{
    s: any; cursor: number; revealed: string[]; groups: any[]; drumroll: boolean; audio: any; reduced: boolean; outlook: Outlook; finished: boolean; onpick: (id: string) => void;
  }>();
  const mode = $derived(s.reveal.mode);
  const visibility = $derived(s.reveal.visibility);
  const winnerOnly = $derived(mode === 'reverse' && visibility === 'winner');
  const full = $derived(countItems(s.items, s.ballots));
  const rows = $derived(rankRows(s.items, full.counts));
  const decision = $derived(decide(rows, s.rules.seats));
  const rankOf = $derived(new Map(rows.map((r: any) => [r.item.id, r.rank])));
  const open = $derived(new Set<string>(mode === 'pick' ? revealed : groups.slice(0, cursor).flatMap((g: any) => g.ids)));
  const allOpen = $derived(open.size >= s.items.length || (winnerOnly && cursor >= 1));
  const nextGroup = $derived(mode === 'reverse' ? groups[cursor] : null);
  const cards = $derived(winnerOnly ? s.items.filter((it: any) => open.has(it.id)) : [...s.items].sort((a: any, b: any) => a.number - b.number));
  let gridW = $state(0);
  let gridH = $state(0);
  const grid = $derived.by(() => {
    const cols = cards.length <= 3 ? Math.max(1, cards.length) : 3;
    const rows = Math.ceil(Math.max(1, cards.length) / cols);
    return { cols, rows, cardW: (gridW - (cols - 1) * 18) / cols, cardH: (gridH - (rows - 1) * 18) / rows };
  });
  const wide = $derived(grid.cardW / Math.max(1, grid.cardH) > 1.5);
  const art = $derived(wide ? Math.max(28, Math.min(grid.cardH - 82, grid.cardW * .25, 150)) : Math.max(24, Math.min(grid.cardH - 100 - Math.max(16, Math.min(grid.cardW / 8, grid.cardH / 9, 36)) * 2.9, grid.cardW * .46, 190)));
  const nameSize = $derived(Math.max(16, Math.min(grid.cardW / 8, grid.cardH / 9, 36)));

  // 반전 공개: 걸음이 늘면 새로 열린 카드마다 뒤집히는 소리.
  let prev = untrack(() => cursor);
  $effect(() => {
    const c = cursor;
    untrack(() => {
      if (mode === 'reverse' && c === prev + 1 && !reduced) audio.play('reveal.flip');
      prev = c;
    });
  });
  const winnersShown = $derived(allOpen || finished);
</script>

<div class="vt-cards" class:drumroll>
  {#if winnerOnly && !cards.length}
    <div class="vt-cards-curtain">
      <BallotBox size={260} state="open" fill={1} />
      <h2>{drumroll ? '두구두구…' : '당선자를 발표할게요'}</h2>
      <p>{drumroll ? '' : 'Space나 [다음]을 누르면 발표해요'}</p>
    </div>
  {:else}
    <div class="vt-cards-grid" bind:clientWidth={gridW} bind:clientHeight={gridH}
      style:grid-template-columns={`repeat(${grid.cols}, minmax(0, 1fr))`} style:grid-template-rows={`repeat(${grid.rows}, minmax(0, 1fr))`}>
      {#each cards as item (item.id)}
        {@const c = paletteOf(item.color)}
        {@const isOpen = open.has(item.id)}
        {@const win = winnersShown && decision.winners.includes(item.id)}
        {@const tied = winnersShown && decision.tied.includes(item.id)}
        {@const pending = drumroll && nextGroup?.ids.includes(item.id)}
        <button class="vt-rcard vt-c" data-leading={outlook.leaders.includes(item.id)} title={outlook.leaders.includes(item.id) ? '현재 단독 선두' : undefined} class:wide class:open={isOpen} class:win class:pending class:dim={drumroll && !pending && !isOpen} class:pickable={mode === 'pick' && !isOpen}
          style:--c-bg={c.bg} style:--c-line={c.line} style:--c-ink={c.ink} style:--name={`${nameSize}px`}
          disabled={mode !== 'pick' || isOpen} onclick={() => onpick(item.id)} aria-label={`${item.number}번 ${item.name}${isOpen ? '' : ' 공개하기'}`}>
          {#if win}<span class="vt-rcard-crown" class:animate={!reduced}><Crown size={Math.max(48, art * 0.4)} /></span>{/if}
          <span class="vt-rcard-key">기호 <Keycap label={item.number} size={30} /></span>
          <span class="vt-rcard-art"><Sticker {item} type={s.type} size={art} /></span>
          <b class="vt-rcard-name vt-leader-name">{item.name}</b>
          <span class="vt-rcard-flap">
            <span class="vt-rcard-flip" class:turned={isOpen} class:animate={!reduced}>
              <span class="vt-rcard-back">?</span>
              <!-- 결과 글자는 연 카드에만 넣습니다. 뒷면 숨김(backface-visibility)이 그래픽 환경에 따라 깨져도 미리 비치지 않게. -->
              <span class="vt-rcard-front">
                {#if isOpen}
                  {#if visibility === 'all'}<em>{full.counts[item.id] ?? 0}</em>표
                  {:else if visibility === 'rank'}<em>{rankOf.get(item.id)}</em>위
                  {:else}{decision.winners.includes(item.id) ? '당선' : '동점'}{/if}
                {/if}
              </span>
            </span>
          </span>
          {#if win}<span class="vt-rcard-ribbon">{s.type === 'opinion' ? '선정' : '당선'}</span>{:else if tied}<span class="vt-rcard-ribbon tie">동점</span>
          {:else if isOpen && outlook.byId[item.id]}<span class="vt-rcard-outlook"><OutlookTag status={outlook.byId[item.id]} {reduced} /></span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .vt-cards {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    padding: clamp(18px, 2.6cqi, 36px);
    transition: background var(--vt-slow) var(--vt-ease);
  }
  /* 드럼롤: 주변이 살짝 어두워지고 스포트라이트가 비칩니다 */
  .vt-cards.drumroll {
    background: radial-gradient(60% 70% at 50% 45%, transparent, color-mix(in srgb, var(--vt-ink) 10%, transparent));
  }
  .vt-cards-curtain {
    margin: auto;
    display: grid;
    justify-items: center;
    gap: 12px;
    text-align: center;
  }
  .vt-cards-curtain h2 {
    margin: 0;
    font-size: clamp(30px, 4.4cqi, 60px);
  }
  .vt-cards-curtain p {
    margin: 0;
    color: var(--vt-muted);
    font-size: 18px;
    font-weight: 800;
  }
  .vt-cards-grid {
    flex: 1;
    display: grid;
    gap: 22px;
    min-height: 0;
  }
  .vt-rcard {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto auto;
    justify-items: center;
    align-items: center;
    gap: 8px;
    min-height: 0;
    padding: 18px 14px 16px;
    border: 0;
    border-radius: 26px;
    background: var(--cbg);
    color: var(--vt-ink);
    box-shadow:
      0 0 0 6px #fff,
      0 9px 0 0 var(--cline),
      0 14px 30px color-mix(in srgb, var(--vt-ink) 12%, transparent);
    transition: transform var(--vt-standard) var(--vt-ease), opacity var(--vt-slow) var(--vt-ease), box-shadow var(--vt-standard) var(--vt-ease);
    cursor: default;
  }
  .vt-rcard:disabled {
    opacity: 1;
  }
  .vt-rcard.pickable {
    cursor: pointer;
  }
  .vt-rcard.pickable:hover {
    transform: translateY(-4px);
  }
  .vt-rcard.dim {
    opacity: 0.45;
  }
  .vt-rcard.pending {
    animation: vt-tremble 120ms linear infinite;
  }
  @keyframes vt-tremble {
    0%, 100% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(1px, 0);
    }
    75% {
      transform: translate(-1px, 0);
    }
  }
  .vt-rcard.win {
    box-shadow:
      0 0 0 6px #fff,
      0 0 0 11px var(--vt-gold),
      0 9px 0 6px var(--cline),
      0 20px 40px color-mix(in srgb, var(--vt-ink) 18%, transparent);
  }
  .vt-rcard-key {
    position: absolute;
    top: 14px;
    left: 14px;
  }
  .vt-rcard-crown {
    position: absolute;
    top: -34px;
    left: 50%;
    z-index: 2;
    transform: translateX(-50%) rotate(-6deg);
  }
  .vt-rcard-crown.animate {
    animation: vt-crown-in 520ms var(--vt-ease-pop) both;
  }
  @keyframes vt-crown-in {
    from {
      opacity: 0;
      transform: translate(-50%, -30px) rotate(-30deg) scale(0.5);
    }
  }
  .vt-rcard-name {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--name);
    font-weight: 900;
    word-break: keep-all;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vt-rcard-flap {
    width: min(80%, 220px);
    height: calc(var(--name) * 1.7);
    perspective: 600px;
  }
  .vt-rcard-flip {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
  }
  .vt-rcard-flip.animate {
    transition: transform 520ms var(--vt-ease);
  }
  .vt-rcard-flip.turned {
    transform: rotateY(180deg);
  }
  .vt-rcard-back,
  .vt-rcard-front {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 14px;
    backface-visibility: hidden;
    font-weight: 900;
  }
  .vt-rcard-back {
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--cline) 80%, #fff) 0 8px, color-mix(in srgb, var(--cline) 50%, #fff) 8px 16px);
    color: var(--cink);
    font-size: calc(var(--name) * 1.1);
  }
  .vt-rcard-front {
    grid-auto-flow: column;
    align-items: baseline;
    justify-content: center;
    gap: 2px;
    background: #fff;
    color: var(--cink);
    font-size: calc(var(--name) * 0.8);
    transform: rotateY(180deg);
  }
  .vt-rcard-front em {
    font-size: 1.7em;
    font-style: normal;
    font-variant-numeric: tabular-nums;
  }
  .vt-rcard-ribbon {
    position: absolute;
    top: 16px;
    right: -8px;
    padding: 4px 14px 4px 12px;
    border-radius: 8px 0 0 8px;
    background: var(--vt-stamp);
    color: #fff;
    font-size: 16px;
    font-weight: 900;
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.15);
    animation: vt-pop-in var(--vt-standard) var(--vt-ease-pop) both;
  }
  .vt-rcard-ribbon.tie {
    background: var(--vt-gold);
    color: #5a4108;
  }
  .vt-cards { padding: 18px 28px 24px; }
  .vt-cards-grid { gap: 18px; }
  .vt-rcard { padding: 52px 16px 14px; gap: 6px; border: 1px solid var(--cline); border-radius: 22px; box-shadow: 0 5px 0 color-mix(in srgb, var(--cline) 55%, var(--vt-card)); }
  .vt-rcard-key { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 800; color: var(--cink); top: 13px; left: 16px; }
  .vt-rcard-crown { top: 10px; left: auto; right: 16px; transform: none; }
  .vt-rcard-crown :global(svg) { width: 30px; height: 25px; }
  .vt-rcard-crown.animate { animation: none; }
  .vt-rcard-ribbon { top: 15px; right: 54px; border-radius: 8px; box-shadow: none; font-size: 14px; }
  .vt-rcard-outlook { position: absolute; top: 16px; right: 16px; display: flex; }
  .vt-rcard.win { box-shadow: inset 0 0 0 3px #cba34d, 0 5px 0 #e3c77e; }
  .vt-rcard-flap { width: min(90%, 260px); height: calc(var(--name) * 1.55); }
  .vt-rcard-front { align-items: center; gap: 6px; }
  .vt-rcard-front em { line-height: 1; font-size: 1.45em; }
  .vt-rcard.wide { grid-template-columns: minmax(0, .8fr) minmax(0, 1.4fr); grid-template-rows: minmax(0, 1fr) auto; gap: 8px 16px; padding: 50px 20px 16px; }
  .vt-rcard.wide .vt-rcard-art { grid-column: 1; grid-row: 1 / 3; }
  .vt-rcard.wide .vt-rcard-name { grid-column: 2; grid-row: 1; font-size: clamp(18px, 2.2cqi, 30px); }
  .vt-rcard.wide .vt-rcard-flap { grid-column: 2; grid-row: 2; width: 100%; }
</style>
