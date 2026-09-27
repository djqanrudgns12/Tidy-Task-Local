<script lang="ts">
  // 공개된 득표만 거리로 표현합니다. 최종 득표를 미리 드러내지 않도록
  // 현재 선두 + 여유로 축척을 늘리고, 마지막 표에서 선두가 결승선에 닿습니다.
  import { untrack } from 'svelte';
  import { ballotsInOrder, partialCounts, raceGoal } from '../../../lib/vote/reveal.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import { fitRaceNames } from '../../../lib/vote/fitRaceNames.js';
  import { decide, rankRows } from '../../../lib/vote/tally.js';
  import Sticker from '../common/Sticker.svelte';
  import Confetti from '../common/Confetti.svelte';
  import OutlookTag from './OutlookTag.svelte';
  import type { Outlook } from '../../../lib/vote/outlook.js';
  let { s, cursor, playing = false, audio, reduced, outlook, finished } = $props<{ s: any; cursor: number; playing?: boolean; audio: any; reduced: boolean; outlook: Outlook; finished: boolean }>();
  const items = $derived([...s.items].sort((a: any, b: any) => a.number - b.number));
  const ballots = $derived(ballotsInOrder(s));
  const counts = $derived(partialCounts(s, cursor).counts);
  const leader = $derived(Math.max(0, ...items.map((it: any) => counts[it.id] ?? 0)));
  const goal = $derived(raceGoal(leader, finished));
  const tension = $derived(ballots.length > 4 && cursor >= ballots.length * 0.85 && !finished);
  let lanesH = $state(0);
  const runnerSize = $derived(Math.max(26, Math.min(64, (lanesH / Math.max(1, items.length) - 18) * .70)));
  let hops = $state<Record<string, number>>({});
  let prev = untrack(() => cursor);
  $effect(() => {
    const c = cursor;
    untrack(() => {
      const stepped = c === prev + 1;
      prev = c;
      if (!stepped) return;
      const b = ballots[c - 1];
      if (!b) return;
      const next = { ...hops };
      b.p.forEach((id: string, k: number) => {
        next[id] = (next[id] ?? 0) + 1;
        const it = items.find((x: any) => x.id === id);
        if (!reduced) audio.play('race.hop', { index: (it?.number ?? 1) - 1, delay: k * 0.08 });
      });
      hops = next;
      if (tension && !reduced) audio.play('race.tension', { delay: 0.1 });
    });
  });
  let cheered = false;
  $effect(() => {
    if (finished && !cheered) {
      cheered = true;
      untrack(() => audio.play('race.finish'));
    }
  });
  const winners = $derived(finished ? decide(rankRows(s.items, counts), s.rules.seats).winners : []);
</script>

<div class="vt-race" class:finished class:still={reduced} class:dense={items.length > 5}>
  <div class="race-arena">
    <header class="race-dashboard">
      <div class="race-state" class:running={playing} role="status">
        <span class="race-lights" aria-hidden="true"><i></i><i></i><i></i></span>
        <div><strong>{finished ? '레이스 완료' : playing ? '레이스 진행 중' : cursor > 0 ? '잠시 멈춤' : '출발 대기'}</strong><span>{finished ? '모든 투표용지를 확인했어요' : playing ? '한 표씩, 결승을 향해!' : cursor > 0 ? '자동 재생으로 이어서 진행해요' : '자동 재생을 누르면 출발해요'}</span></div>
      </div>
      <div class="race-counter"><span>개표한 투표용지</span><strong>{cursor}<small> / {ballots.length}장</small></strong></div>
    </header>
    <div class="race-course" use:fitRaceNames={items.map((item: any) => item.name)}>
      <div class="race-column-head" aria-hidden="true"><span>{s.type === 'opinion' ? '선택 항목' : '출전 후보'}</span><div><span>출발</span><span>결승 방향 <b>→</b></span></div><span>현재 득표</span></div>
      <div class="vt-race-lanes" style:--n={items.length} style:--runner={`${runnerSize}px`} bind:clientHeight={lanesH}>
        {#each items as item (item.id)}
          {@const c = paletteOf(item.color)}
          {@const n = counts[item.id] ?? 0}
          {@const leading = leader > 0 && n === leader}
          <div class="vt-lane" class:leading style:--lane-bg={c.bg} style:--lane-line={c.line} style:--lane-ink={c.ink} style:--p={Math.min(1, n / goal)}>
            <div class="vt-lane-label">
              <span class="race-bib">{item.number}</span>
              <div class="race-candidate"><b title={item.name}>{item.name}</b><span class="race-standing">{leading ? (items.filter((it: any) => counts[it.id] === leader).length > 1 ? '공동 선두' : '현재 선두') : '레인 ' + String(item.number).padStart(2, '0')}</span></div>
            </div>
            <div class="vt-lane-track">
              <span class="race-grid" aria-hidden="true"></span>
              <span class="race-start" aria-hidden="true"></span>
              <span class="race-checker" aria-hidden="true"></span>
              <div class="race-runway">
                <span class="race-trail" aria-hidden="true"></span>
                <span class="vt-lane-runner" class:win={winners.includes(item.id)}>
                  {#key hops[item.id] ?? 0}<span class="vt-hop" class:animate={!reduced && (hops[item.id] ?? 0) > 0}><Sticker {item} type={s.type} size={runnerSize} /></span>{/key}
                </span>
              </div>
            </div>
            <div class="race-result"><strong class="vt-race-score">{n}<small>표</small></strong><span class="vt-race-outlook"><OutlookTag status={outlook.byId[item.id]} {reduced} /></span></div>
          </div>
        {/each}
      </div>
      <div class="race-curb" aria-hidden="true"></div>
    </div>
    <footer class="race-track-note"><span><i></i> 한 표가 모일 때마다 앞으로 나아가요</span><span>모든 표를 열면 레이스가 끝나요 <b>⚑</b></span></footer>
  </div>
  {#if finished && winners.length && !reduced}<Confetti colors={items.map((it: any) => paletteOf(it.color).line)} count={60} />{/if}
</div>

<style>
  .vt-race { flex: 1; min-height: 0; display: flex; position: relative; padding: 8px 28px 20px; }
  .race-arena { --race-name: clamp(168px, 21cqi, 300px); --race-score: 128px; flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 0 18px; border: 1px solid #315b55; border-radius: 22px; background: #183e39; box-shadow: 0 8px 20px #153d3618, inset 0 1px #ffffff18; }
  .race-dashboard { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 12px; color: #f4fbf5; }
  .race-state { display: flex; align-items: center; gap: 16px; }
  .race-state strong { display: block; font-size: clamp(19px, 2cqi, 28px); font-weight: 900; }
  .race-state div > span { display: block; margin-top: 4px; font-size: 14px; color: #bed5ce; }
  .race-lights { display: flex; gap: 6px; padding: 11px; border: 1px solid #66847b; border-radius: 99px; background: #0e2d29; box-shadow: inset 0 2px 5px #0003; }
  .race-lights i { width: 13px; height: 13px; border-radius: 50%; background: #f3cd80; box-shadow: 0 0 9px #efbd5035; }
  .running .race-lights i, .finished .race-lights i { background: #a7edbe; box-shadow: 0 0 9px #a7edbe40; }
  .race-counter { display: flex; align-items: center; gap: 16px; }
  .race-counter > span { font-size: 14px; color: #bed5ce; }
  .race-counter strong { font-size: 30px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .race-counter small { color: #bed5ce; font-size: 17px; }
  .race-course { flex: 1; min-height: 0; display: flex; flex-direction: column; border: 1px solid #b5c9bd; border-radius: 14px; background: #eef2e9; overflow: auto; scrollbar-width: thin; }
  .race-column-head { display: grid; grid-template-columns: var(--race-name) minmax(0, 1fr) var(--race-score); flex: none; min-height: 34px; align-items: center; color: #4e665d; background: #e4ebdf; font-size: 12px; font-weight: 800; }
  .race-column-head > span:first-child { padding-left: 22px; }
  .race-column-head > span:last-child { text-align: center; }
  .race-column-head > div { display: flex; justify-content: space-between; padding: 0 16px; }
  .race-column-head b { margin-left: 7px; }
  .vt-race-lanes { display: grid; grid-template-rows: repeat(var(--n), minmax(var(--race-row-min, 62px), 1fr)); flex: 1; min-height: calc(var(--n) * var(--race-row-min, 62px)); }
  .vt-lane { display: grid; grid-template-columns: var(--race-name) minmax(0, 1fr) var(--race-score); min-height: 0; border-bottom: 2px solid #fff; }
  .vt-lane:last-child { border-bottom: 0; }
  .vt-lane-label { min-width: 0; display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: #f8faf3; color: #243e35; border-left: 5px solid var(--lane-line); }
  .race-bib { flex: none; display: grid; place-items: center; width: 36px; height: 40px; border-radius: 6px 6px 10px 10px; border: 1px solid var(--lane-line); background: var(--lane-bg); color: var(--lane-ink); font-size: 25px; font-weight: 900; box-shadow: 0 2px 0 #243e3512; }
  .race-candidate { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }
  .race-candidate b { font-size: clamp(20px, 1.9cqi, 29px); line-height: 1.22; font-weight: 900; white-space: normal; word-break: normal; overflow-wrap: anywhere; text-wrap: wrap; }
  .race-standing { color: #66756b; font-size: 12px; }
  .leading .race-standing { color: #27654b; font-weight: 900; }
  .leading .vt-lane-label { background: #ecf5df; }
  .vt-lane-track { position: relative; min-width: 0; isolation: isolate; background: color-mix(in srgb, var(--lane-bg) 38%, #f1f3e8); border-left: 1px solid #ffffff; border-right: 1px solid #fff; }
  .race-grid { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0, transparent calc(20% - 1px), #ffffff9c calc(20% - 1px), #ffffff9c 20%); }
  .race-grid::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: repeating-linear-gradient(90deg, #5b756b38 0 8px, transparent 8px 20px); }
  .race-start { position: absolute; left: calc(18px + var(--runner) / 2); top: 0; bottom: 0; width: 6px; border-inline: 2px solid #fff; background: #7d948242; }
  .race-checker { position: absolute; right: calc(18px + var(--runner) / 2 - 8px); top: 0; bottom: 0; width: 16px; opacity: .65; background: conic-gradient(#3f574b 25%, #fff 0 50%, #3f574b 0 75%, #fff 0) 0 0 / 16px 16px; border-inline: 2px solid #fff; }
  .race-runway { position: absolute; top: 0; bottom: 0; left: calc(18px + var(--runner) / 2); right: calc(18px + var(--runner) / 2); }
  .race-trail { position: absolute; left: 0; top: calc(50% - 7px); width: calc(var(--p) * 100%); height: 14px; border-radius: 99px; background: linear-gradient(90deg, color-mix(in srgb, var(--lane-line) 15%, transparent), var(--lane-line)); box-shadow: 0 1px 0 #ffffff90; transition: width 360ms cubic-bezier(.2,0,0,1); }
  .vt-lane-runner { position: absolute; top: 50%; left: calc(var(--p) * 100%); width: var(--runner); height: var(--runner); transform: translate(-50%, -50%); transition: left 360ms cubic-bezier(.2,0,0,1); z-index: 1; }
  .vt-lane-runner::before { content: ''; position: absolute; width: 80%; height: 15%; bottom: -9%; left: 10%; border-radius: 50%; background: #193e3930; filter: blur(3px); }
  .vt-hop { display: block; line-height: 0; }
  .vt-hop.animate { animation: race-stride 360ms cubic-bezier(.2,0,0,1); }
  @keyframes race-stride { 0% { transform: translateY(0) rotate(0); } 42% { transform: translateY(-10px) rotate(5deg); } 78% { transform: translateY(1px) scale(1.04,.97); } 100% { transform: none; } }
  .race-result { min-height: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; padding: 3px; background: #f8faf3; color: #243e35; }
  .vt-race-score { font-size: clamp(27px, 3cqi, 43px); font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .vt-race-score small { margin-left: 5px; font-size: 14px; color: #68766b; }
  .vt-race-outlook { display: flex; }
  .vt-race-outlook:empty { display: none; }
  .race-curb { flex: none; height: 7px; border-top: 2px solid #fff; background: repeating-linear-gradient(110deg, #e4ba79 0 22px, #f9f5e8 22px 44px); }
  .race-track-note { display: flex; justify-content: space-between; gap: 12px; padding: 12px 8px; color: #c6d9cd; font-size: 12px; }
  .race-track-note span { display: flex; align-items: center; gap: 8px; }
  .race-track-note i { width: 6px; height: 6px; border-radius: 50%; background: #d8ba7d; }
  .race-track-note b { font-size: 18px; line-height: 1; }
  .finished .race-checker { opacity: 1; }
  .finished .vt-lane-runner.win { filter: drop-shadow(0 0 7px #d5ac43); }
  .still .vt-lane-runner, .still .race-trail { transition: none; }
  /* Keep the enlarged status readable beside the score when nine lanes share
     the screen. This also keeps the last candidates inside the race course. */
  .dense .race-arena { --race-score: 184px; }
  .dense .vt-race-lanes { grid-template-rows: repeat(var(--n), minmax(var(--race-row-min, 36px), 1fr)); min-height: calc(var(--n) * var(--race-row-min, 36px)); }
  .dense .race-result { flex-direction: row; gap: 8px; padding: 0 4px; }
  .dense .vt-race-score { font-size: 24px; }
  .dense .vt-race-outlook { justify-content: flex-end; width: 106px; min-width: 106px; }
  .dense .vt-race-outlook:empty { display: flex; }
  .dense .vt-lane-label { padding-block: 2px; }
  .dense .race-bib { width: 28px; height: 30px; font-size: 21px; }
  .dense .race-standing { display: none; }
  .dense .race-dashboard { padding-block: 10px; }
  .dense .race-track-note { padding-block: 8px; }
  @container (max-width: 1050px) {
    .vt-race { padding: 6px 16px 14px; }
    .race-arena { --race-name: 195px; --race-score: 116px; padding: 0 12px; }
    .race-dashboard { padding: 12px 6px; }
    .vt-lane-label { gap: 9px; padding: 6px 10px; }
  }
  @container (max-width: 720px) {
    .race-arena { --race-name: 145px; --race-score: 106px; padding: 0 8px; }
    .race-lights { display: none; }
    .race-counter { gap: 5px; flex-direction: column; align-items: flex-end; }
    .race-counter strong { font-size: 24px; }
    .race-counter > span { font-size: 12px; }
    .race-bib { width: 25px; height: 30px; font-size: 20px; }
    .race-track-note { font-size: 11px; }
    .race-track-note span:last-child { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .vt-lane-runner, .race-trail { transition: none; } .vt-hop.animate { animation: none; } }
  @media (forced-colors: active) { .race-arena, .vt-lane, .race-bib { border: 1px solid CanvasText; } .race-start, .race-checker { background: CanvasText; } }
</style>
