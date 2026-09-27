<script lang="ts">
  import { drawResult } from '../../../lib/vote/resultImage.js';
  import { resultNote } from '../../../lib/vote/result.js';
  import { prepareResultAssets } from '../../../lib/vote/exportImage.js';
  let { model, fontFamily, animate = false, reduced = false, onready = () => {} } = $props<{
    model: any; fontFamily: string; animate?: boolean; reduced?: boolean; onready?: () => void;
  }>();
  let canvas = $state<HTMLCanvasElement>();
  let failed = $state(false);
  let loading = $state(true);
  $effect(() => {
    const target = canvas, m = model, font = fontFamily, motion = animate && !reduced;
    if (!target) return;
    let cancelled = false, frame = 0;
    loading = true;
    failed = false;
    prepareResultAssets(m, font).then(assets => {
      if (cancelled) return;
      const start = performance.now();
      const paint = (now: number) => {
        if (cancelled) return;
        const elapsed = motion ? now - start : Infinity;
        drawResult(target, m, { ...assets, elapsed, scale: Math.min(2, window.devicePixelRatio || 1) });
        loading = false;
        if (elapsed < 900) frame = requestAnimationFrame(paint);
      };
      paint(start);
      onready();
    }).catch(() => { if (!cancelled) { failed = true; loading = false; onready(); } });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  });
</script>

<div class="result-sheet" aria-busy={loading}>
  <canvas bind:this={canvas} width="1600" height="900" aria-hidden="true"></canvas>
  {#if loading}<p class="sheet-loading" role="status">결과판을 준비하고 있어요…</p>{/if}
  <div class:accessible={!failed} class="sheet-text">
    <h1>{model.title}</h1><p>{model.voters}명 중 {model.participants}명 참여</p>
    {#if model.type === 'yesno'}
      <ol>{#each model.agendas as a}<li>{a.text}: {a.passed === null ? '판정 없음' : a.passed ? '통과' : '부결'}{#if model.showCounts} · 찬성 {a.yes}표 ({a.yesPercent}%) · 반대 {a.no}표 ({a.noPercent}%) · 기권 {a.abstain}표{#if a.yes !== a.no} · 최다 득표: {a.yes > a.no ? '찬성' : '반대'}{:else if a.tie} · 찬반 동률{/if}{/if}</li>{/each}</ol>
    {:else}
      <p>{model.winners.map((w: any) => `기호 ${w.number} ${w.name}`).join(', ')}{model.winners.length ? (model.type === 'opinion' ? ' 선정' : ' 당선') : ''}</p>
      {#if model.pendingTie.length}<p>동점: {model.pendingTie.map((w: any) => `기호 ${w.number} ${w.name}`).join(', ')}</p>{/if}
      {#if model.noneVoted}<p>{model.type === 'opinion' ? '선정된 항목이 없습니다' : '당선자가 없습니다'}</p>{/if}
      <table><caption>전체 결과</caption><thead><tr><th>순위</th><th>기호</th><th>이름</th><th>결과</th>{#if model.showCounts}<th>득표수</th><th>득표율</th>{/if}</tr></thead>
        <tbody>{#each model.rows as r}<tr><td>{r.rank}위</td><td>{r.item.number}</td><td>{r.item.name}</td><td>{r.tied ? '동점' : r.winner ? (model.type === 'opinion' ? '선정' : '당선') : ''}</td>{#if model.showCounts}<td>{r.count}표</td><td>{r.percent}%</td>{/if}</tr>{/each}</tbody></table>
    {/if}
    <p class="sheet-note">{resultNote(model)}</p>
    <p>총 투표자 {model.participants}명{#if model.showCounts && model.validVotes != null && model.abstain != null} · {model.type === 'yesno' && model.agendas.length > 1 ? '유효표 합계' : '유효표'} {model.validVotes}표 · {model.type === 'yesno' && model.agendas.length > 1 ? '기권 합계' : '기권'} {model.abstain}표{/if}</p>
  </div>
</div>

<style>
  .result-sheet { position: relative; min-height: 0; min-width: 0; display: grid; place-items: center; overflow: auto; }
  canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; }
  .sheet-loading { position: absolute; margin: 0; color: var(--vt-muted); }
  .sheet-note { color: #4d5359; }
  :global(.vt-root[data-scheme='dark']) .sheet-note { color: #bdc2c7; }
  .accessible { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .sheet-text:not(.accessible) { position: absolute; inset: 0; padding: 24px; background: var(--vt-card); overflow: auto; }
  table { width: 100%; text-align: left; }
</style>
