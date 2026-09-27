<script lang="ts">
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { broadcastSnapshot } from '../../../lib/vote/broadcast.js';
  import { percent, ruleSentence } from '../../../lib/vote/tally.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import Sticker from '../common/Sticker.svelte';
  import OutlookTag from './OutlookTag.svelte';
  import type { Outlook } from '../../../lib/vote/outlook.js';
  let { s, cursor, agenda, audio, reduced, outlook, verdict, finished, playing = false } = $props<{ s: any; cursor: number; agenda: number; audio: any; reduced: boolean; outlook: Outlook; verdict: boolean; finished: boolean; playing?: boolean }>();
  const yesno = $derived(s.type === 'yesno');
  const v = $derived(broadcastSnapshot(s, cursor, agenda));
  const done = $derived(finished || verdict || (v.total > 0 && v.remaining === 0));
  const rate = $derived(v.total ? percent(v.shown, v.total) : 0);
  const leader = $derived(v.leaders.length === 1 ? v.leaders[0] : null);
  const sure = $derived(Object.keys(outlook.byId).filter(id => outlook.byId[id]?.kind === 'certain'));
  const ynSure = $derived(outlook.outcome?.kind === 'certain' ? `${agenda}:${outlook.outcome.label}` : null);
  let prev = untrack(() => cursor);
  let prevAgenda = untrack(() => agenda);
  let known = new Set<string>(untrack(() => sure));
  let knownYn = untrack(() => ynSure);
  $effect(() => {
    const c = cursor, a = agenda, now = sure, yn = ynSure;
    untrack(() => {
      if (c > prev && a === prevAgenda) audio.play('cast.tick');
      if (a !== prevAgenda) known = new Set();
      if (now.some(id => !known.has(id)) || (yn && yn !== knownYn)) audio.play('cast.sure', { delay: 0.2 });
      prev = c; prevAgenda = a; known = new Set(now); knownYn = yn;
    });
  });
</script>

<div class="vt-cast" class:dense={v.rows.length > 4} class:crowded={v.rows.length > 6} class:many={v.rows.length > 4} style:--short-rows={Math.ceil(v.rows.length / 2)} class:still={reduced} class:yesno class:done>
  <header class="cast-masthead">
    <div class="cast-brand"><span class="cast-signal" aria-hidden="true"><i></i><i></i><i></i><i></i></span><b>개표 방송</b><span class="cast-onair" class:paused={!playing || done}><i></i>{done ? '개표 완료' : playing ? '개표 중' : v.shown ? '일시 정지' : '방송 준비'}</span></div>
    <span class="cast-edition">우리 반의 선택 <span aria-hidden="true">/</span> {yesno ? '찬반 투표' : s.type === 'opinion' ? '의견 투표' : '학급 선거'}</span>
  </header>

  <div class="cast-studio">
    <aside class="cast-focus" aria-label="현재 개표 판세">
      <div class="cast-eyebrow">{done ? '최종 집계' : '현재 판세'}<span>{String(agenda + 1).padStart(2, '0')}</span></div>
      <div class="cast-lead-scene">
        {#if leader && !yesno}
          <div class="cast-portrait" style:--portrait-color={paletteOf(leader.item.color).line}><Sticker item={leader.item} type={s.type} size={112} /></div>
        {:else}
          <div class="cast-orbit" aria-hidden="true"><span>{!v.shown ? '…' : v.leaders.length > 1 ? '=' : yesno ? (leader?.item.id === 'y' ? '찬성' : leader ? '반대' : '—') : '—'}</span></div>
        {/if}
        <p class="cast-lead-label">{v.changed && !done ? '선두가 바뀌었습니다' : !v.shown ? '집계 준비' : v.leaders.length > 1 ? '같은 득표 수' : done ? '최다 득표' : '현재 선두'}</p>
        <h3>{leader ? leader.item.name : v.leaders.length > 1 ? '공동 선두' : v.shown ? '유효 득표 없음' : '첫 공개를 기다려요'}</h3>
        {#if v.top > 0}<div class="cast-hero-count"><strong>{v.top}</strong><span>표</span></div>{/if}
        {#if v.leaders.length > 1}<p class="cast-tied-names">{v.leaders.map(r => r.item.name).join(' · ')}</p>{/if}
        <div class="cast-focus-status">
          {#if leader && outlook.byId[leader.item.id]}<OutlookTag status={outlook.byId[leader.item.id]} {reduced} />
          {:else}<span>{!v.shown ? '준비되면 다음을 눌러 주세요' : v.leaders.length > 1 ? '동률인 항목을 모두 표시합니다' : done ? '전체 결과로 이어집니다' : '공개된 표로만 집계합니다'}</span>{/if}
        </div>
      </div>
      <div class="cast-focus-bottom"><span>{yesno ? '찬반 표 차이' : '1·2위 표 차이'}</span><b>{v.valid && v.rows.length > 1 ? `${v.gap}표` : '—'}</b></div>
      <p class="cast-caveat">{yesno ? ruleSentence(s.rules.passRule) : `${s.rules.seats}${s.type === 'candidate' ? '명 선출' : '개 항목 선정'} · 선두와 최종 선정은 다를 수 있어요`}</p>
    </aside>

    <section class="cast-board" aria-label="실시간 득표 현황">
      <div class="cast-board-title"><h3>실시간 득표 현황</h3><span>{yesno ? '찬성 · 반대' : '득표순'} <i aria-hidden="true">/</i> {v.rows.length}{yesno || s.type === 'opinion' ? '개 항목' : '명 후보'}</span></div>
      <div class="cast-progress-panel">
        <div class="cast-rate"><span>개표율</span><strong>{rate}<small>%</small></strong></div>
        <div class="cast-progress-detail"><div><span><b>{v.shown}</b> / {v.total}장 공개</span><span>남은 용지 <b>{v.remaining}장</b></span></div><div class="cast-meter" role="progressbar" aria-label="개표율" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}><i style:transform={`scaleX(${rate / 100})`}></i></div></div>
      </div>
      <div class="cast-columns" aria-hidden="true"><span>{yesno ? '선택' : '순위 / 기호 / 이름'}</span><span>득표 수 / 득표율 / 추가</span></div>
      <ol class="vt-cast-list" style:--n={v.rows.length}>
        {#each v.rows as row (row.item.id)}
          {@const c = paletteOf(row.item.color)}
          {@const leading = v.top > 0 && row.count === v.top}
          <li class="vt-cast-row" class:leading animate:flip={{ duration: reduced ? 0 : 460 }} style:--candidate={c.line} aria-label={`${yesno ? '' : `기호 ${row.item.number}, `}${row.item.name}, ${row.count}표, ${percent(row.count, v.denominator)}퍼센트. ${outlook.byId[row.item.id]?.label ?? ''} 이번 공개 ${row.delta}표 추가.`}>
            <span class="cast-rank">{#if yesno}{row.item.id === 'y' ? '+' : '−'}{:else if row.count > 0}{row.rank}<small>위</small>{:else}—{/if}</span>
            <div class="cast-identity">
              {#if !yesno}<span class="cast-symbol" style:background={c.bg} style:color={c.ink}>{row.item.number}</span><span class="cast-row-art"><Sticker item={row.item} type={s.type} size={v.rows.length > 6 ? 30 : 40} /></span>{/if}
              <div class="cast-name-block"><b class="cast-name" class:long-name={row.item.name.length > 8} title={row.item.name}>{row.item.name}</b></div>
            </div>
            <span class="cast-row-status"><OutlookTag status={outlook.byId[row.item.id]} {reduced} /></span>
            <div class="cast-votes"><strong>{row.count}<small>표</small></strong><span>{percent(row.count, v.denominator)}<small>%</small></span></div>
            <div class="cast-track" aria-hidden="true"><i style:transform={`scaleX(${v.denominator ? row.count / v.denominator : 0})`}></i></div>
            <span class="cast-delta" aria-label={`이번 공개에서 ${row.delta}표 추가`}>{row.delta ? `+${row.delta}` : '—'}</span>
          </li>
        {/each}
      </ol>
      <div class="cast-board-foot"><span>{v.basis}</span><b>기권 {v.abstain}{yesno ? '명' : '표'}</b></div>
    </section>
  </div>

  <footer class="cast-newsline"><b>{done ? '집계 완료' : v.changed ? '선두 교체' : '집계 소식'}</b><p role="status" aria-live="polite">{v.headline}</p><span>{v.batch ? `이번 공개 ${v.batch}장` : '공개 전'}<i aria-hidden="true">·</i>미공개 {v.remaining}장</span></footer>
</div>

<style>
  .vt-cast { --cast-muted: #aabdd7; flex: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0,1fr) auto; color: #f5f8ff; padding: 0 24px 16px; gap: 14px; background: radial-gradient(ellipse at 15% 40%,#17396380,transparent 55%),#091525; font-family: '엘리스 DX 널리 M', 'Malgun Gothic', sans-serif; font-variant-numeric: tabular-nums; }
  .cast-masthead { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; border-bottom: 1px solid #ffffff20; }
  .cast-brand { display: flex; gap: 14px; align-items: center; font-size: 19px; letter-spacing: -.03em; }
  .cast-signal { display: flex; align-items: end; gap: 3px; height: 20px; }
  .cast-signal i { width: 4px; height: 40%; background: #66dbed; }.cast-signal i:nth-child(2) { height: 65%; }.cast-signal i:nth-child(3) {height: 100%;}.cast-signal i:nth-child(4) {height: 80%;}
  .cast-onair { display: inline-flex; align-items: center; gap: 7px; color: #ffd9df; background: #6d2538; border: 1px solid #b9546b; border-radius: 4px; padding: 5px 9px; font-size: 12px; letter-spacing: .03em; white-space: nowrap; }
  .cast-onair i { width: 6px; height: 6px; background: #ffb2bf; border-radius: 50%; animation: signal 2s ease-in-out infinite; }.cast-onair.paused { background: #20334b; border-color: #455b76; color: #d7e5f7; }.cast-onair.paused i {animation:none;background:#8adbe9;}
  .cast-edition {font-size:12px;color:var(--cast-muted);letter-spacing:.08em;}.cast-edition span {margin:0 10px;color:#55718f;}
  .cast-studio {display:grid;grid-template-columns:minmax(215px,.72fr) minmax(0,2fr);gap:20px;min-height:0;}
  .cast-focus {display:flex;flex-direction:column;min-height:0;border:1px solid #47678880;border-top:3px solid #77ddec;padding:20px 22px 14px;background:linear-gradient(155deg,#1d3d62a8,#0d2138b0);position:relative;overflow:auto;}
  .cast-eyebrow {display:flex;justify-content:space-between;font-size:12px;color:#b4d0e9;letter-spacing:.13em;}.cast-eyebrow span {color:#718eae;}
  .cast-lead-scene {flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;padding:16px 0;text-align:center;}
  .cast-portrait,.cast-orbit {flex:none;position:relative;display:grid;place-items:center;width:146px;height:146px;border:1px solid #5d86ac50;border-radius:50%;background:radial-gradient(circle,#37628c40,transparent 68%);margin-bottom:18px;}
  .cast-portrait::before,.cast-orbit::before {content:'';position:absolute;inset:-12px;border:1px solid #5d86ac25;border-radius:50%;}
  .cast-portrait::after {content:'';position:absolute;inset:-1px;border-top:2px solid var(--portrait-color);border-bottom:2px solid var(--portrait-color);border-radius:50%;}
  .cast-orbit span {font-size:44px;font-weight:800;color:#97ddec;}
  .cast-lead-label {font-size:13px;color:#8adbe9;margin:0 0 8px;}.cast-lead-scene h3 {font-size:clamp(24px,2.8cqi,40px);line-height:1.3;margin:0;overflow-wrap:anywhere;letter-spacing:-.04em;}
  .cast-hero-count {display:flex;align-items:baseline;gap:7px;margin:8px 0;}.cast-hero-count strong {font-size:clamp(48px,6cqi,84px);font-weight:800;line-height:1;letter-spacing:-.06em;}.cast-hero-count span {font-size:20px;color:#b7cbe1;}
  .cast-tied-names {max-height:4.4em;overflow:auto;font-size:15px;line-height:1.5;margin:10px 0;color:#dbe7f8;overflow-wrap:anywhere;}
  .cast-focus-status {margin-top:12px;min-height:32px;display:grid;place-items:center;font-size:12px;line-height:1.6;color:#b6c9df;}
  .cast-focus-bottom {display:flex;align-items:center;justify-content:space-between;border-top:1px solid #ffffff20;padding-top:12px;gap:8px;color:#b7cbe1;font-size:13px;}.cast-focus-bottom b {color:#fff;font-size:25px;}.cast-caveat {font-size:11px;color:#aabdd7;line-height:1.6;margin:8px 0 0;word-break:keep-all;}
  .cast-board {display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;min-height:0;min-width:0;}
  .cast-board-title {display:flex;justify-content:space-between;align-items:center;gap:12px;padding:0 0 12px;}.cast-board-title h3 {font-size:18px;margin:0;letter-spacing:-.03em;}.cast-board-title span {font-size:12px;color:var(--cast-muted);}.cast-board-title i {font-style:normal;margin:0 7px;color:#6a849f;}
  .cast-progress-panel {display:flex;gap:26px;align-items:center;padding:14px 20px;background:#14273f;border:1px solid #324a64;}
  .cast-rate {display:flex;align-items:baseline;gap:10px;white-space:nowrap;}.cast-rate>span {font-size:13px;color:#c4d2e7;}.cast-rate strong {font-size:36px;line-height:1;color:#7ee7f2;letter-spacing:-.04em;}.cast-rate small {font-size:18px;margin-left:3px;}
  .cast-progress-detail {flex:1;min-width:0;}.cast-progress-detail>div:first-child {display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#b8cbe1;margin-bottom:10px;}.cast-progress-detail b {color:#fff;}.cast-meter {height:5px;background:#324760;overflow:hidden;}.cast-meter i {display:block;height:100%;background:#7ee7f2;transform-origin:left;transition:transform 600ms cubic-bezier(.2,0,0,1);}
  .cast-columns {display:flex;justify-content:space-between;padding:12px 22px 8px 14px;font-size:11px;color:#8fa8c4;letter-spacing:.04em;}
  .vt-cast-list {display:grid;grid-template-rows:repeat(var(--n),minmax(68px,1fr));gap:6px;min-height:0;overflow:auto;margin:0;padding:0;list-style:none;}
  .vt-cast-row {display:grid;grid-template-columns:34px minmax(0,1fr) auto 40px;grid-template-rows:1fr 5px;column-gap:14px;row-gap:7px;align-items:center;position:relative;padding:10px 16px 9px 12px;background:#12243a;border:1px solid #293d55;border-left:3px solid var(--candidate);min-width:0;}
  .vt-cast-row.leading {background:linear-gradient(100deg,#234366,#152a43);border-top-color:#597491;border-bottom-color:#597491;border-right-color:#597491;}
  .cast-rank {grid-row:1 / 3;color:#97aec8;font-size:21px;font-weight:800;}.leading .cast-rank {color:#91e8f2;}
  .cast-identity {display:flex;align-items:center;gap:12px;min-width:0;}.cast-symbol {flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:4px;font-size:18px;font-weight:800;}.cast-row-art {flex:none;display:flex;margin:0 3px;}
  .cast-name-block {min-width:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}.cast-name {font-size:clamp(20px,2.1cqi,30px);line-height:1.2;overflow-wrap:anywhere;letter-spacing:-.03em;}
  .cast-votes {display:flex;align-items:baseline;justify-content:flex-end;gap:18px;white-space:nowrap;}.cast-votes strong {font-size:clamp(28px,3cqi,42px);line-height:1;font-weight:800;letter-spacing:-.04em;}.cast-votes strong small {font-size:15px;margin-left:4px;font-weight:600;color:#c5d4e7;}.cast-votes>span {min-width:4em;text-align:right;font-size:18px;color:#adc3de;}.cast-votes>span small {font-size:12px;margin-left:2px;}
  .cast-track {grid-column:2 / 4;height:5px;background:#ffffff0b;overflow:hidden;}.cast-track i {display:block;height:100%;background:var(--candidate);transform-origin:left;transition:transform 600ms cubic-bezier(.2,0,0,1);}
  .cast-delta {grid-column:4;grid-row:1 / 3;font-size:16px;color:#8de4e5;text-align:right;}
  .cast-board-foot {display:flex;justify-content:space-between;gap:12px;padding-top:10px;color:#aabdd7;font-size:11px;line-height:1.4;}.cast-board-foot b {color:#dce9f8;white-space:nowrap;}
  .cast-newsline {display:flex;align-items:center;gap:16px;min-height:44px;background:#e7edf5;color:#10253c;padding-right:16px;}.cast-newsline>b {align-self:stretch;display:grid;place-items:center;padding:9px 18px;background:#71dce9;color:#09263d;font-size:13px;white-space:nowrap;}.cast-newsline p {flex:1;min-width:0;margin:0;font-size:16px;font-weight:750;overflow-wrap:anywhere;}.cast-newsline>span {font-size:12px;white-space:nowrap;color:#41566e;}.cast-newsline i {font-style:normal;margin:0 8px;}
  .dense .vt-cast-list {gap:4px;grid-template-rows:repeat(var(--n),minmax(44px,1fr));}.dense .vt-cast-row {padding-block:5px;row-gap:3px;grid-template-rows:1fr 3px;}.dense .cast-name {font-size:20px;}.dense .cast-votes strong {font-size:27px;}.dense .cast-track {height:3px;}.dense .cast-symbol {height:24px;width:24px;font-size:15px;}.dense .cast-row-art {margin:0;}
  .yesno .vt-cast-row {grid-template-columns:34px minmax(0,1fr) auto 40px;padding-block:24px;}.yesno .cast-name {font-size:32px;}.yesno .cast-votes strong {font-size:56px;}.yesno .cast-track {height:8px;}.yesno .vt-cast-list {grid-template-rows:repeat(2,minmax(90px,1fr));}
  @container (max-width:1100px) {.vt-cast{padding:0 16px 12px;gap:10px;}.cast-studio{grid-template-columns:minmax(190px,.65fr) minmax(0,2fr);gap:14px;}.cast-focus{padding:14px;}.cast-portrait,.cast-orbit{width:120px;height:120px;}.cast-portrait :global(.vt-sticker){--s:92px!important;}.cast-votes{gap:10px;}.cast-votes>span{font-size:15px;}.cast-identity{gap:8px;}.cast-name-block{gap:3px 7px;}.vt-cast-row{column-gap:8px;grid-template-columns:28px minmax(0,1fr) auto 30px;padding-inline:10px;}.cast-row-art{display:none;}.cast-progress-panel{gap:18px;padding:12px;}.cast-lead-scene{padding:14px 0;}.cast-hero-count strong{font-size:60px;}}
  @container (max-width:760px) {.cast-studio{grid-template-columns:1fr;}.cast-focus{display:none;}.cast-edition{display:none;}.cast-newsline>span{display:none;}.cast-newsline{gap:10px;}.cast-board-title{padding-bottom:8px;}.cast-board-title h3{font-size:16px;}.cast-progress-panel{padding:10px;gap:14px;}.cast-rate strong{font-size:30px;}.vt-cast-list{grid-template-rows:repeat(var(--n),minmax(60px,1fr));}.cast-votes strong{font-size:30px;}.cast-newsline p{font-size:14px;}.cast-name{font-size:20px;}}
  @container (max-width:480px) {.vt-cast{padding-inline:10px;}.cast-progress-detail>div:first-child{font-size:10px;}.cast-rate{gap:5px;}.cast-rate>span{font-size:11px;}.cast-votes{gap:6px;}.cast-votes>span{font-size:13px;min-width:3em;}.vt-cast-row{grid-template-columns:22px minmax(0,1fr) auto 24px;gap:5px;padding-inline:7px;}.cast-rank{font-size:16px;}.cast-symbol{width:22px;height:22px;font-size:15px;}.cast-name{font-size:17px;}.cast-identity{gap:6px;}.cast-votes strong{font-size:26px;}.cast-delta{font-size:13px;}.cast-board-foot{font-size:10px;}.yesno .cast-votes strong{font-size:40px;}}
  @media (max-height:800px) {.cast-portrait,.cast-orbit{width:100px;height:100px;margin-bottom:12px;}.cast-portrait :global(.vt-sticker){--s:78px!important;}.cast-lead-scene{padding:12px 0;}.cast-hero-count strong{font-size:56px;}.cast-focus-status{margin-top:6px;}.cast-focus{padding-top:14px;}.cast-caveat{font-size:10px;}.cast-progress-panel{padding-block:10px;}.cast-board-title{padding-bottom:8px;}.cast-rate strong{font-size:30px;}}
  @keyframes signal {50%{opacity:.45;transform:scale(.85);}}
  .still *, .still *::before, .still *::after {animation:none!important;transition:none!important;}
  /* Forecast has its own column: it cannot push the name into the vote total. */
  .vt-cast .vt-cast-row { grid-template-columns: 28px minmax(80px, 1fr) 106px auto 28px; column-gap: 8px; }
  .cast-row-status { grid-column: 3; grid-row: 1; display: flex; justify-content: flex-end; }
  .cast-votes { grid-column: 4; grid-row: 1; }
  .cast-track { grid-column: 2 / 5; }
  .cast-delta { grid-column: 5; }
  .cast-name-block { flex-wrap: nowrap; }
  .cast-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vt-cast.dense { gap: 8px; }
  .dense .cast-board { grid-template-rows: auto minmax(0, 1fr) auto; }
  .dense .cast-board-title, .dense .cast-columns { display: none; }
  .dense .cast-progress-panel { padding-block: 8px; margin-bottom: 8px; }
  .dense .cast-rate strong { font-size: 26px; }
  .dense .cast-progress-detail > div:first-child { margin-bottom: 6px; }
  .dense .cast-masthead { min-height: 40px; }
  .dense .cast-newsline { min-height: 36px; }
  .dense .vt-cast-list { grid-template-rows: repeat(var(--n), minmax(38px, 1fr)); gap: 3px; }
  .dense .vt-cast-row { grid-template-rows: 1fr; padding-block: 2px; row-gap: 0; }
  .dense .cast-track { position: absolute; left: 40px; right: 8px; bottom: 0; height: 2px; }
  @container (max-width: 540px) {
    .vt-cast .vt-cast-row { grid-template-columns: 22px minmax(70px, 1fr) 106px auto; }
    .cast-delta { display: none; }
    .cast-votes > span { display: none; }
  }
  .cast-name.long-name { white-space: normal; overflow-wrap: anywhere; font-size: 17px; line-height: 1.25; }
  .cast-rank { white-space: nowrap; }
  .cast-rank small { font-size: 10px; margin-left: 1px; font-weight: 600; }
  .cast-lead-scene { flex-shrink: 0; }
  .yesno .vt-cast-row { padding-block: 12px; grid-template-rows: 1fr 8px; }
  .yesno .vt-cast-list { grid-template-rows: repeat(2,minmax(78px,1fr)); }
  @media (max-height: 800px) {
    .dense .vt-cast-list { grid-template-rows: repeat(var(--n),minmax(34px,1fr)); }
    .dense .cast-row-status :global(.vt-outlook-tag) { min-height: 26px; padding-block: 3px; font-size: 12px; }
    .dense .cast-masthead { min-height: 34px; }
    .yesno .cast-orbit { display: none; }
    .yesno .cast-lead-scene { padding-block: 8px; }
    .yesno .cast-votes strong { font-size: 44px; }
  }
  @media (max-height: 650px) {
    .cast-studio { grid-template-columns: 1fr; }
    .cast-focus { display: none; }
    .cast-masthead { min-height: 34px; }
    .cast-board-title, .cast-columns { display: none; }
    .cast-board { grid-template-rows: auto minmax(0,1fr) auto; }
    .cast-progress-panel { margin-bottom: 8px; padding-block: 7px; }
    .vt-cast-list { grid-template-rows: repeat(var(--n),minmax(45px,1fr)); }
    .vt-cast-row { padding-block: 4px; }
    .cast-newsline { min-height: 34px; }
    .yesno .vt-cast-list { grid-template-rows: repeat(2,minmax(64px,1fr)); }
    .yesno .vt-cast-row { padding-block: 6px; row-gap: 4px; }
    .yesno .cast-votes strong { font-size: 36px; }
  }
  @media (max-height: 650px) and (min-width: 700px) {
    .many .vt-cast-list { grid-template-columns: repeat(2,minmax(0,1fr)); grid-template-rows: repeat(var(--short-rows),minmax(42px,1fr)); grid-auto-flow: column; gap: 4px 10px; }
    .many .vt-cast-row { grid-template-columns: 22px minmax(0,1fr) auto 22px; column-gap: 6px; }
    .many .cast-row-status { display: none; }
    .many .cast-votes { grid-column: 3; }
    .many .cast-delta { grid-column: 4; }
    .many .cast-votes > span { min-width: 3em; font-size: 13px; }
    .many .cast-votes { gap: 7px; }
    .many .cast-name { font-size: 20px; }
    .many .cast-votes strong { font-size: 27px; }
    .many .cast-rank { font-size: 18px; }
    .many .cast-identity { gap: 7px; }
  }
  @media (min-height: 850px) {
    .dense:not(.crowded) .cast-name { font-size: clamp(24px,2.1cqi,30px); }
    .dense:not(.crowded) .cast-name.long-name { font-size: 20px; }
    .dense:not(.crowded) .cast-votes strong { font-size: clamp(34px,3cqi,42px); }
    .dense:not(.crowded) .cast-symbol { width: 28px; height: 28px; font-size: 18px; }
    .dense:not(.crowded) .cast-track { height: 4px; }
  }
  @media (prefers-reduced-motion:reduce){.vt-cast *{animation:none!important;transition:none!important;}}
  @media (forced-colors:active){.vt-cast,.cast-focus,.vt-cast-row,.cast-newsline{background:Canvas;color:CanvasText;border:1px solid CanvasText;}.cast-track i,.cast-meter i{background:Highlight;}}
</style>
