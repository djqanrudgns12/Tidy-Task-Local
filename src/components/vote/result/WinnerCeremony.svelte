<script lang="ts">
  import { onMount } from 'svelte';
  import { Award, ArrowRight } from 'lucide-svelte';
  import Sticker from '../common/Sticker.svelte';
  import Confetti from '../common/Confetti.svelte';
  import { paletteOf } from '../../../lib/vote/palette.js';

  let { winners, title, pendingTie = false, reduced, onreveal, ondone } = $props<{
    winners: any[]; title: string; pendingTie?: boolean; reduced: boolean;
    onreveal: () => void; ondone: () => void;
  }>();
  let revealed = $state(false);
  let leaving = $state(false);
  let closed = false;
  let exitTimer: ReturnType<typeof setTimeout>;
  const colors = $derived(['#D8AD48', '#F5D982', '#608D77', ...winners.map((w: any) => paletteOf(w.color).line)]);
  function finish() {
    if (closed) return;
    closed = true;
    leaving = true;
    exitTimer = setTimeout(ondone, reduced ? 0 : 360);
  }
  onMount(() => {
    const revealTimer = setTimeout(() => {
      if (closed) return;
      revealed = true;
      onreveal();
    }, reduced ? 0 : 650);
    // More names deserve more reading time; every winner shares the same reveal.
    const endTimer = setTimeout(finish, 6500 + Math.max(0, winners.length - 2) * 650);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', key);
    return () => {
      clearTimeout(revealTimer); clearTimeout(endTimer); clearTimeout(exitTimer);
      window.removeEventListener('keydown', key);
    };
  });
</script>

<section class="ceremony" class:revealed class:leaving class:reduced class:multiple={winners.length > 1} class:many={winners.length > 4} aria-label="당선 축하">
  <span class="ceremony-announcement" role="status">{revealed ? `${winners.map((w: any) => `기호 ${w.number} ${w.name}`).join(', ')}. 당선을 축하합니다!` : ''}</span>
  <div class="ceremony-halo" aria-hidden="true"></div>
  <div class="ceremony-frame" aria-hidden="true"></div>
  <header class="ceremony-heading">
    <p>{title}</p>
    <div class="ceremony-kicker"><span></span><Award size={24} strokeWidth={1.5} /><b>당선 발표</b><span></span></div>
    <h2>{revealed ? '당선을 축하합니다!' : '새로운 시작을 함께해요'}</h2>
  </header>
  <div class="ceremony-winners" class:visible={revealed} style:--columns={Math.min(winners.length, winners.length > 4 ? 3 : 4)} aria-hidden={!revealed}>
    {#each winners as winner (winner.id)}
      <article class="ceremony-winner">
        <div class="ceremony-portrait">
          <svg class="ceremony-laurel" viewBox="0 0 240 210" aria-hidden="true">
            {#each [false, true] as mirror}
              <g transform={mirror ? 'translate(240 0) scale(-1 1)' : ''}>
                <path d="M99 190C25 168 12 90 48 34" fill="none" stroke="currentColor" stroke-width="2" />
                {#each [0, 1, 2, 3, 4, 5] as leaf}
                  <ellipse cx="35" cy="62" rx="6" ry="15" transform={`rotate(${-22 + leaf * 17} 120 105)`} fill="currentColor" />
                {/each}
              </g>
            {/each}
          </svg>
          <Sticker item={winner} type="candidate" size={winners.length > 4 ? 78 : winners.length > 2 ? 108 : 154} />
        </div>
        <span class="ceremony-number">기호 {winner.number}</span>
        <h3>{winner.name}</h3>
        <span class="ceremony-ribbon">당 선</span>
      </article>
    {/each}
  </div>
  <footer class="ceremony-foot">
    <p>{pendingTie ? '확정된 당선자를 축하해 주세요. 남은 자리는 동점입니다.' : '함께한 모든 후보와 투표해 준 여러분께도 박수를 보내요.'}</p>
    <button type="button" onclick={finish}>결과 보기 <ArrowRight size={17} /></button>
  </footer>
  {#if revealed}<Confetti {colors} {reduced} count={144} duration={4400} waves={3} />{/if}
</section>

<style>
  .ceremony { position: absolute; inset: 0; z-index: 4; isolation: isolate; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 28px 40px 20px; overflow: auto; color: #343d30; background: #fbf8ed; border: 1px solid #ddc991; border-radius: 22px; }
  .ceremony-frame { position: absolute; inset: 12px; border: 1px solid #c6a35b66; border-radius: 14px; pointer-events: none; z-index: -1; }
  .ceremony-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .ceremony :global(.vt-confetti-still) { top: auto; bottom: 24px; left: 24px; width: 100px; transform: none; }
  .ceremony-halo { position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 50% 48%, #f8dda480, transparent 62%), linear-gradient(120deg, #e6ecd34d, transparent 35%, #f4d99d33); }
  .revealed .ceremony-halo { animation: ceremony-light 1800ms ease-out both; }
  .ceremony-heading { text-align: center; flex: none; max-width: 100%; }
  .ceremony-heading p { margin: 0 0 12px; color: #73745f; font-size: 16px; overflow-wrap: anywhere; }
  .ceremony-kicker { display: flex; align-items: center; justify-content: center; gap: 10px; color: #927027; font-size: 16px; letter-spacing: .12em; }
  .ceremony-kicker span { height: 1px; width: 46px; background: #c6a35b80; }
  h2 { margin: 10px 0 0; font-size: clamp(25px, 3.4cqw, 48px); line-height: 1.3; letter-spacing: -.04em; }
  .ceremony-winners { position: relative; z-index: 31; width: min(100%, 1120px); flex: 1; display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); align-content: center; gap: 22px; opacity: 0; }
  .ceremony-winners.visible { opacity: 1; animation: ceremony-arrive 700ms cubic-bezier(.16,.8,.2,1) both; }
  .ceremony-winner { display: flex; flex-direction: column; align-items: center; min-width: 0; text-align: center; }
  .ceremony-portrait { position: relative; display: grid; place-items: center; width: 238px; max-width: 100%; height: 192px; }
  .ceremony-laurel { position: absolute; width: 100%; height: 100%; color: #b99544; }
  .ceremony-number { color: #78745b; font-size: 16px; margin-top: 4px; }
  h3 { max-width: 100%; margin: 8px 0 12px; font-size: clamp(26px, 4.2cqw, 60px); line-height: 1.2; overflow-wrap: anywhere; letter-spacing: -.025em; }
  .ceremony-ribbon { padding: 7px 32px; background: #356550; color: #fff9e9; font-size: 17px; font-weight: 800; clip-path: polygon(0 0,100% 0,94% 50%,100% 100%,0 100%,6% 50%); }
  .multiple .ceremony-portrait { width: 190px; height: 150px; }
  .multiple h3 { display: grid; place-items: center; min-height: 2.4em; font-size: clamp(26px, 3cqw, 40px); }
  .visible .ceremony-ribbon { animation: ceremony-arrive 420ms 240ms both; }
  .ceremony-foot { flex: none; display: flex; flex-direction: column; align-items: center; gap: 12px; z-index: 31; text-align: center; }
  .ceremony-foot p { margin: 0; color: #74735f; font-size: 15px; line-height: 1.5; }
  .ceremony-foot button { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border: 1px solid #b4a77f; border-radius: 99px; background: #fffdf6; color: #5b604b; font: inherit; font-size: 14px; cursor: pointer; }
  .ceremony-foot button:hover { background: #f0e7cf; }
  .ceremony-foot button:focus-visible { outline: 3px solid #356550; outline-offset: 3px; }
  .many { gap: 8px; padding-top: 20px; }
  .many .ceremony-winners { gap: 14px 24px; }
  .many .ceremony-portrait { width: 112px; height: 94px; }
  .many h3 { font-size: clamp(20px, 2.5cqw, 32px); margin: 3px 0 7px; }
  .many .ceremony-ribbon { padding: 3px 25px; font-size: 13px; }
  .many .ceremony-number { font-size: 13px; }
  .leaving { animation: ceremony-exit 360ms ease-in both; pointer-events: none; }
  @keyframes ceremony-arrive { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes ceremony-light { from { opacity: .25; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes ceremony-exit { to { opacity: 0; transform: translateY(-8px); } }
  @container (max-height: 600px) { .ceremony { padding-top: 20px; gap: 8px; } .ceremony-portrait { height: 150px; width: 190px; } .ceremony-portrait :global(.vt-sticker) { --s: 110px !important; } h3 { font-size: 36px; margin: 5px 0 9px; } .many .ceremony-portrait { height: 74px; width: 96px; } .many .ceremony-portrait :global(.vt-sticker) { --s: 60px !important; } }
  @container (max-width: 700px) { .ceremony { padding: 24px 20px; } .ceremony-winners { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; } .ceremony-winner:only-child { grid-column: 1 / -1; } .ceremony-portrait { width: 150px; height: 140px; } .ceremony-portrait :global(.vt-sticker) { --s: 96px !important; } h3 { font-size: 30px; } }
  .reduced *, .reduced.leaving { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { .ceremony *, .ceremony { animation: none !important; } }
</style>
