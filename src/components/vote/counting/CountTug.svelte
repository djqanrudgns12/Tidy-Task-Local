<script lang="ts">
  // 찬반 줄다리기(PRD 8절, 레이스의 찬반판). 표마다 밧줄 가운데 리본이 찬성(왼쪽)·반대(오른쪽)로 한 칸 끌려갑니다(280ms).
  // 기권은 줄을 당기지 않고 가운데 아래 칸에 쌓입니다. 안건이 끝나면 통과/부결 도장.
  import { untrack } from 'svelte';
  import { ballotsInOrder, partialAgenda } from '../../../lib/vote/reveal.js';
  import { passes } from '../../../lib/vote/tally.js';
  import Stamp from '../art/Stamp.svelte';
  import OutlookTag from './OutlookTag.svelte';
  import type { Outlook } from '../../../lib/vote/outlook.js';
  let { s, cursor, agenda, audio, reduced, outlook, verdict, finished } = $props<{ s: any; cursor: number; agenda: number; audio: any; reduced: boolean; outlook: Outlook; verdict: boolean; finished: boolean }>();
  const t = $derived(partialAgenda(s, agenda, cursor));
  const total = $derived(Math.max(1, s.ballots.length));
  // -1(찬성 끝) ~ 1(반대 끝). 모든 표가 한쪽이어도 줄 끝을 넘지 않게 45%까지만 움직입니다.
  const offset = $derived(((t.no - t.yes) / total) * 45);
  let prev = untrack(() => cursor);
  $effect(() => {
    const c = cursor;
    untrack(() => {
      const stepped = c === prev + 1;
      prev = c;
      if (stepped && !reduced) {
        const v = ballotsInOrder(s)[c - 1]?.p[agenda];
        if (v === 'y' || v === 'n') audio.play('tug.pull');
      }
    });
  });
  const result = $derived(passes(s.rules.passRule, t));
  const show = $derived((verdict || finished) && result !== null);
  let stamped = -1;
  $effect(() => {
    if (show && stamped !== agenda) {
      stamped = agenda;
      untrack(() => audio.play(result ? 'result.pass' : 'result.fail'));
    }
  });
</script>

<div class="vt-tug">
  <div class="vt-tug-progress">{cursor} / {s.ballots.length}장 공개</div>
  <div class="vt-tug-teams">
    <div class="vt-tug-team yes" data-leading={outlook.leaders.includes('y')} title={outlook.leaders.includes('y') ? '현재 단독 선두' : undefined}><Stamp text="O" round size={120} color="#1F6E57" /><div class="vt-tug-label"><b class="vt-leader-name">찬성</b><div class="vt-tug-outlook"><OutlookTag status={outlook.byId.y} {reduced} /></div></div><span>{t.yes}<small>표</small></span></div>
    <div class="vt-tug-team no" data-leading={outlook.leaders.includes('n')} title={outlook.leaders.includes('n') ? '현재 단독 선두' : undefined}><Stamp text="X" round size={120} color="#96491A" tilt={8} /><div class="vt-tug-label"><b class="vt-leader-name">반대</b><div class="vt-tug-outlook"><OutlookTag status={outlook.byId.n} {reduced} /></div></div><span>{t.no}<small>표</small></span></div>
  </div>
  <div class="vt-tug-rope">
    <span class="vt-tug-line"></span>
    <span class="vt-tug-center"></span>
    <span class="vt-tug-ribbon" style:--o={`${offset}%`}></span>
  </div>
  {#if s.rules.allowAbstain}<p class="vt-tug-abstain">기권 {t.abstain}</p>{/if}
  {#if show}
    <div class="vt-tug-verdict"><Stamp text={result ? '통과' : '부결'} size={260} color={result ? '#1F6E57' : '#6B6760'} /></div>
  {/if}
</div>

<style>
  .vt-tug {
    position: relative;
    flex: 1;
    display: grid;
    align-content: center;
    gap: clamp(20px, 4cqi, 60px);
    padding: 20px clamp(20px, 5cqi, 80px);
  }
  .vt-tug-teams {
    display: flex;
    justify-content: space-between;
  }
  .vt-tug-team {
    display: grid;
    justify-items: center;
    gap: 6px;
  }
  .vt-tug-team b {
    font-size: clamp(22px, 3cqi, 44px);
  }
  .vt-tug-team span {
    font-size: clamp(36px, 6cqi, 96px);
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  .vt-tug-team.yes {
    color: #1f6e57;
  }
  .vt-tug-team.no {
    color: #96491a;
  }
  .vt-tug-rope {
    position: relative;
    height: 60px;
  }
  .vt-tug-line {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 14px;
    border-radius: 999px;
    background: repeating-linear-gradient(60deg, #c89a63 0 10px, #b4854f 10px 20px);
    transform: translateY(-50%);
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.12);
  }
  .vt-tug-center {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--vt-ink) 50%, transparent);
  }
  .vt-tug-ribbon {
    position: absolute;
    top: 50%;
    left: calc(50% + var(--o));
    width: 34px;
    height: 54px;
    margin-left: -17px;
    border-radius: 8px 8px 50% 50%;
    background: var(--vt-stamp);
    box-shadow: 0 0 0 4px #fff, 0 6px 14px rgba(0, 0, 0, 0.18);
    transform: translateY(-50%);
    transition: left 280ms var(--vt-ease-pop);
  }
  .vt-tug-abstain {
    margin: 0;
    color: var(--vt-muted);
    font-size: 20px;
    font-weight: 800;
    text-align: center;
  }
  .vt-tug-verdict {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--tk-bg) 55%, transparent);
    animation: vt-pop-in var(--vt-standard) var(--vt-ease-pop) both;
  }
  .vt-tug { min-height: 0; padding: 12px 50px 24px; gap: clamp(16px, 2.4cqi, 34px); }
  .vt-tug-progress { text-align: center; font-weight: 800; color: var(--vt-muted); }
  .vt-tug-teams { gap: 40px; }
  .vt-tug-team { flex: 1; grid-template-columns: auto 1fr auto; padding: clamp(16px, 2.5cqi, 34px); border-radius: 24px; border: 1px solid var(--vt-line); background: var(--vt-card); align-items: center; gap: 14px; }
  .vt-tug-team :global(svg) { width: clamp(60px, 7cqi, 100px); }
  .vt-tug-team span { font-size: clamp(34px, 5.5cqi, 72px); white-space: nowrap; }
  .vt-tug-team small { font-size: 18px; margin-left: 8px; }
  .vt-tug-team.yes { border-top: 5px solid #95d9bf; }
  .vt-tug-team.no { border-top: 5px solid #f5b98c; }
  .vt-tug-label { display: grid; justify-items: start; gap: 8px; }
  .vt-tug-outlook { display: flex; min-height: 32px; }
  .vt-tug-team :global(.vt-outlook-tag svg) { width: 14px; }
  .vt-tug-team :global(.vt-outlook-tag) { font-size: 15px; }
  .vt-tug-rope { margin: 12px 40px; }
  .vt-tug-verdict { position: static; background: transparent; height: 110px; }
  .vt-tug-verdict :global(svg) { height: 110px; }
</style>
