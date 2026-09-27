<script lang="ts">
  // 원래 비율 그대로 용지 안착 → 기표 확인 → 집계. 글자는 접거나 늘리지 않습니다.
  // 한 걸음씩 늘 때만 연출하고, 건너뛰기·이어서 개표처럼 한꺼번에 바뀌면 연출 없이 바로 그립니다.
  import { untrack } from 'svelte';
  import { ballotsInOrder, partialCounts, partialAgenda, tallyMarks } from '../../../lib/vote/reveal.js';
  import { passes } from '../../../lib/vote/tally.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import Sticker from '../common/Sticker.svelte';
  import Keycap from '../common/Keycap.svelte';
  import Stamp from '../art/Stamp.svelte';
  import OutlookTag from './OutlookTag.svelte';
  import type { Outlook } from '../../../lib/vote/outlook.js';
  let { s, cursor, agenda, audio, reduced, outlook, verdict, onnext, disabled } = $props<{ s: any; cursor: number; agenda: number; audio: any; reduced: boolean; outlook: Outlook; verdict: boolean; onnext: () => void; disabled: boolean }>();
  const yesno = $derived(s.type === 'yesno');
  const ballots = $derived(ballotsInOrder(s));
  const current = $derived(cursor > 0 ? ballots[cursor - 1] : null);
  const items = $derived([...s.items].sort((a: any, b: any) => a.number - b.number));
  const counts = $derived(yesno ? null : partialCounts(s, cursor));
  const yn = $derived(yesno ? partialAgenda(s, agenda, cursor) : null);
  type Row = { id: string; label: string; count: number; color: string | null; item?: any };
  const rows = $derived.by((): Row[] => {
    if (yesno && yn) return [
      { id: 'y', label: '찬성', count: yn.yes, color: 'mint' },
      { id: 'n', label: '반대', count: yn.no, color: 'apricot' },
      ...(s.rules.allowAbstain ? [{ id: 'a', label: '기권', count: yn.abstain, color: null }] : []),
    ];
    return [
      ...items.map((it: any) => ({ id: it.id, label: it.name, count: counts?.counts[it.id] ?? 0, color: it.color, item: it })),
      ...(s.rules.allowAbstain ? [{ id: 'abstain', label: '기권', count: counts?.abstain ?? 0, color: null }] : []),
    ];
  });
  // 이번 걸음에서 새로 그어진 획(행 id → 몇 획)
  let fresh = $state<Record<string, number>>({});
  let paperSeq = $state(0);
  let prev = untrack(() => cursor);
  let prevAgenda = untrack(() => agenda);
  $effect(() => {
    const c = cursor;
    const a = agenda;
    untrack(() => {
      const stepped = a === prevAgenda && c === prev + 1 && current;
      prev = c;
      prevAgenda = a;
      if (!stepped || !current) {
        fresh = {};
        return;
      }
      paperSeq++;
      const add: Record<string, number> = {};
      if (yesno) add[current.p[a]] = 1;
      else {
        for (const id of current.p) add[id] = (add[id] ?? 0) + 1;
        if (current.a) add.abstain = current.a;
      }
      fresh = add;
      if (reduced) return;
      audio.play('count.unfold', { variant: c });
      audio.play('count.stamp', { delay: 0.18 });
      let k = 0;
      for (const [id, n] of Object.entries(add)) {
        for (let j = 0; j < n; j++, k++) {
          const row = rows.find((r) => r.id === id);
          const total = row?.count ?? 0;
          audio.play(total % 5 === 0 && j === n - 1 ? 'count.chalk5' : 'count.chalk', { variant: k, delay: 0.3 + Math.min(k, 8) * 0.025 });
        }
      }
    });
  });
  // 용지 위 칸: 후보 번호(또는 찬성·반대) + 도장
  const picked = $derived.by(() => {
    if (!current) return new Map<string, number>();
    const m = new Map<string, number>();
    if (yesno) m.set(current.p[agenda], 1);
    else for (const id of current.p) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  });
  let paperHeight = $state(0);
  let tableWidth = $state(0);
  const longestName = $derived(Math.max(2, ...items.map((it: any) => Array.from(it.name).length)));
  let boardHeight = $state(0);
  const boardRowHeight = $derived(Math.max(1, (boardHeight - 8) / rows.length));
  const keySize = $derived(Math.max(18, Math.min(48, Math.floor(boardRowHeight * .72))));
  const artSize = $derived(Math.max(16, Math.min(40, Math.floor(boardRowHeight * .64))));
  const sheetRows = $derived(yesno ? (s.rules.allowAbstain ? 3 : 2) : items.length + (s.rules.allowAbstain ? 1 : 0));
  // Fit every row into the paper, including abstention. The sheet never scrolls.
  const rowHeight = $derived(Math.max(1, (paperHeight - 92) / sheetRows));
  const nameSize = $derived(Math.max(8, Math.min(23, Math.floor(rowHeight * .55), Math.floor((tableWidth * .64 - 18) / longestName))));
  const numberSize = $derived(Math.max(12, Math.min(38, Math.floor(rowHeight * .7))));
  const stampSize = $derived(Math.max(10, Math.min(48, Math.floor(rowHeight * .78))));
  // 正 획(40×40): ①위 가로 ②가운데 세로 ③가운데 오른쪽 짧은 가로 ④왼쪽 짧은 세로 ⑤아래 가로
  const STROKES = ['M6 7H34', 'M20 7V34', 'M20 20H31', 'M10 22V34', 'M4 34H36'];
  const agendaResult = $derived(yesno && yn ? passes(s.rules.passRule, yn) : null);
  // 안건 하나가 끝나 도장이 찍히는 순간의 소리(통과는 밝게, 부결은 차분하게).
  let stamped = -1;
  $effect(() => {
    if (verdict && agendaResult !== null && stamped !== agenda) {
      stamped = agenda;
      untrack(() => audio.play(agendaResult ? 'result.pass' : 'result.fail'));
    }
  });
</script>

<div class="vt-paper-stage" class:yesno class:dense={rows.length > 6}>
  <div class="vt-paper-left">
    <button class="vt-ballot-action" type="button" onclick={onnext} {disabled} bind:clientHeight={paperHeight} aria-label={`다음 투표용지 개표하기 · ${cursor} / ${ballots.length}장`}>
    {#key paperSeq}
      <div class="vt-ballot-sheet" class:animate={!reduced && paperSeq > 0} style:--sheet-name-size={`${nameSize}px`} style:--sheet-number-size={`${numberSize}px`}>
          <header class="vt-sheet-heading"><h3 class="vt-sheet-title">투표 용지</h3><span class="vt-sheet-sequence">{cursor} / {ballots.length}장</span></header>
          <div class="vt-sheet-table-wrap" bind:clientWidth={tableWidth}>
          <table class="vt-sheet-table" aria-label="현재 투표용지의 기표 내역">
            <colgroup><col class="vt-sheet-number-col" /><col /><col class="vt-sheet-mark-col" /></colgroup>
            <thead><tr><th scope="col">{yesno ? '선택' : '기호'}</th><th scope="col">{yesno ? '의견' : s.type === 'candidate' ? '이름' : '항목'}</th><th scope="col">기표란</th></tr></thead>
            <tbody>
            {#if yesno}
              {#each [['y', '찬성'], ['n', '반대'], ...(s.rules.allowAbstain ? [['a', '기권']] : [])] as [id, label]}
                <tr class="vt-sheet-row" class:abstain={id === 'a'} class:selected={picked.has(id)}><td class="vt-sheet-number">{id === 'y' ? '○' : id === 'n' ? '×' : '—'}</td><th scope="row" class="vt-sheet-name">{label}</th><td class="vt-sheet-mark" aria-label={picked.has(id) ? '기표됨' : '기표 없음'}>{#if picked.has(id)}<span class="vt-sheet-stamp"><Stamp text="卜" round size={stampSize} tilt={-12} /></span>{/if}</td></tr>
              {/each}
            {:else}
              {#each items as it (it.id)}
                <tr class="vt-sheet-row" class:selected={picked.has(it.id)}><td class="vt-sheet-number">{it.number}</td><th scope="row" class="vt-sheet-name">{it.name}</th><td class="vt-sheet-mark" aria-label={picked.has(it.id) ? `${picked.get(it.id)}표 기표됨` : '기표 없음'}>{#if picked.has(it.id)}<span class="vt-sheet-stamp"><Stamp text={(picked.get(it.id) ?? 0) > 1 ? `×${picked.get(it.id)}` : '卜'} round size={stampSize} tilt={-12} /></span>{/if}</td></tr>
              {/each}
              {#if s.rules.allowAbstain}<tr class="vt-sheet-row abstain" class:selected={!!current?.a}><td class="vt-sheet-number">—</td><th scope="row" class="vt-sheet-name">기권</th><td class="vt-sheet-mark" aria-label={current?.a ? `${current.a}표 기권` : '기표 없음'}>{#if current?.a}<span class="vt-sheet-stamp"><Stamp text={current.a > 1 ? `×${current.a}` : '卜'} round size={stampSize} tilt={-12} color="#6B6760" /></span>{/if}</td></tr>{/if}
            {/if}
            </tbody>
          </table>
          </div>
      </div>
    {/key}
    </button>

  </div>

  <div class="vt-chalkboard">
    <header><b>{yesno ? '찬반 집계' : '한 표씩, 차곡차곡'}</b><span>{yesno ? `${cursor} / ${ballots.length}장 개표` : '기호 순 집계'}</span></header>
    <ul style:--rows={rows.length} bind:clientHeight={boardHeight} style:--mark-size={`${Math.max(18, Math.min(38, boardRowHeight * .55))}px`} style:--name-size={`${Math.max(13, Math.min(30, boardRowHeight * .42))}px`} style:--count-size={`${Math.max(18, Math.min(44, boardRowHeight * .7))}px`}>
      {#each rows as row (row.id)}
        {@const marks = tallyMarks(row.count)}
        {@const c = row.color ? paletteOf(row.color) : null}
        <li data-leading={outlook.leaders.includes(row.id)} title={outlook.leaders.includes(row.id) ? '현재 단독 선두' : undefined} class:yes={yesno && row.id === 'y'} class:no={yesno && row.id === 'n'} class:abstain={!row.color} class:receiving={(fresh[row.id] ?? 0) > 0}>
          <div class="vt-cb-content">
          <span class="vt-cb-name">
            {#if yesno && row.id !== 'a'}<span class="vt-cb-choice" aria-hidden="true">{row.id === 'y' ? '○' : '×'}</span>{/if}
            {#if row.item}<Keycap label={row.item.number} size={keySize} /><Sticker item={row.item} type={s.type} size={artSize} />{/if}
            <b class="vt-leader-name">{row.label}</b>
            {#if yesno && row.id !== 'a'}<span class="vt-cb-outlook"><OutlookTag status={outlook.byId[row.id]} {reduced} /></span>{/if}
          </span>
          {#if row.count > 0}
          <span class="vt-cb-marks">
            {#key paperSeq}
            {#each Array.from({ length: Math.min(5, marks.full) }) as _, g}
              <svg viewBox="0 0 40 40" class="vt-mark">{#each STROKES as d, k}{@const isNew = (fresh[row.id] ?? 0) > 0 && g === marks.full - 1 && marks.rest === 0 && k >= 5 - (fresh[row.id] ?? 0)}<path {d} class:new={isNew && !reduced} style:--d={`${(k - (5 - (fresh[row.id] ?? 0))) * 25 + 300}ms`} style:--col={c?.line ?? '#f4f1e8'} />{/each}</svg>
            {/each}
            {#if marks.rest}
              <svg viewBox="0 0 40 40" class="vt-mark">{#each STROKES.slice(0, marks.rest) as d, k}{@const isNew = k >= marks.rest - (fresh[row.id] ?? 0)}<path {d} class:new={isNew && !reduced} style:--d={`${(k - (marks.rest - (fresh[row.id] ?? 0))) * 25 + 300}ms`} style:--col={c?.line ?? '#f4f1e8'} />{/each}</svg>
            {/if}
            {#if marks.full > 5}<small class="vt-mark-extra">+{(marks.full - 5) * 5}</small>{/if}
            {/key}
          </span>
          {/if}
          </div>
          {#if !yesno}<span class="vt-cb-outlook"><OutlookTag status={outlook.byId[row.id]} {reduced} /></span>{/if}
          <span class="vt-cb-count">{#if (fresh[row.id] ?? 0) > 0}<span class="vt-cb-gain" aria-label={`이번 투표에서 ${fresh[row.id]}표 추가`}>+{fresh[row.id]}</span>{/if}<span class="vt-cb-total"><b class="vt-cb-value">{row.count}</b><small class="vt-cb-unit">표</small></span></span>
        </li>
      {/each}
    </ul>
    {#if verdict && agendaResult !== null}
      <div class="vt-cb-verdict"><Stamp text={agendaResult ? '통과' : '부결'} size={220} color={agendaResult ? '#9BE3C3' : '#E6E4DF'} /></div>
    {/if}
  </div>
</div>

<style>
  .vt-paper-stage {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(320px, .95fr) minmax(0, 1.65fr);
    gap: 24px;
    padding: 18px 28px 24px;
  }
  .vt-paper-left {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
  }
  .vt-ballot-action {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: transparent;
    font: inherit;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
  .vt-ballot-action:disabled { cursor: default; opacity: 1; }
  .vt-ballot-action:focus-visible { outline: 3px solid var(--vt-accent); outline-offset: 4px; }
  .vt-ballot-sheet {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    padding: 12px 16px;
    border: 1px solid #ced3c8;
    border-top: 6px solid #527d69;
    border-radius: 10px;
    background: #fffef9;
    color: #283d32;
    box-shadow: 0 3px 0 #e4e3d8, 0 12px 28px color-mix(in srgb, var(--vt-ink) 9%, transparent);
    transform-origin: 50% 0;
    overflow: hidden;
  }
  .vt-sheet-heading { position: relative; padding-bottom: 8px; text-align: center; }
  .vt-sheet-sequence { position: absolute; right: 0; top: 6px; color: #69716d; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .vt-sheet-title { margin: 0; font-size: 24px; line-height: 1.2; font-weight: 900; }
  .vt-sheet-table-wrap { min-height: 0; overflow: hidden; border: 1.5px solid #879588; }
  .vt-sheet-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; border-spacing: 0; }
  .vt-sheet-number-col, .vt-sheet-mark-col { width: 18%; }
  .vt-sheet-table thead { background: #edf1e8; }
  .vt-sheet-table thead th { height: 26px; padding: 0 4px; color: #536551; font-size: 13px; font-weight: 800; line-height: 1.2; text-align: center; }
  .vt-sheet-table th, .vt-sheet-table td { border-right: 1px solid #bdc6b8; border-bottom: 1px solid #bdc6b8; vertical-align: middle; }
  .vt-sheet-table th:last-child, .vt-sheet-table td:last-child { border-right: 0; }
  .vt-sheet-table tbody tr:last-child th, .vt-sheet-table tbody tr:last-child td { border-bottom: 0; }
  .vt-sheet-row.selected { background: #fff0ef; color: #943942; }
  .vt-sheet-number { padding: 0; text-align: center; font-size: var(--sheet-number-size); line-height: 1; font-weight: 900; font-variant-numeric: tabular-nums; }
  .vt-sheet-name { padding: 0 8px; text-align: left; font-size: var(--sheet-name-size); line-height: 1.15; font-weight: 800; white-space: normal; overflow-wrap: anywhere; }
  .vt-sheet-mark { padding: 0; text-align: center; }
  .vt-sheet-stamp { display: inline-flex; justify-content: center; align-items: center; vertical-align: middle; }
  .vt-sheet-row.abstain { background: #f1f2f2; color: #69716d; }
  .vt-sheet-row.abstain.selected { background: #e6e8e8; }
  .vt-chalkboard { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 1px solid var(--vt-line); border-radius: 20px; background: var(--vt-card); box-shadow: var(--vt-shadow); color: var(--vt-ink); overflow: hidden; }
  .vt-chalkboard header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 24px; background: #315f4e; color: #fff; }
  .vt-chalkboard header b { font-size: 23px; line-height: 1.2; }
  .vt-chalkboard header span { font-size: 14px; font-weight: 700; white-space: nowrap; opacity: .85; }
  .vt-chalkboard ul { flex: 1; display: grid; grid-template-rows: repeat(var(--rows), minmax(min-content, 1fr)); min-height: 0; overflow: auto; margin: 0; padding: 4px 18px; list-style: none; }
  .vt-chalkboard li { display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; gap: 16px; padding: 6px 8px; min-height: 0; border-bottom: 1px solid var(--vt-line); }
  .vt-chalkboard li:not(.abstain) { grid-template-columns: minmax(0, 1fr) 112px max-content; }
  .vt-cb-outlook { display: flex; align-items: center; justify-content: flex-end; min-height: 32px; }
  .abstain .vt-cb-outlook { display: none; }
  .vt-chalkboard li:last-child { border-bottom: 0; }
  .vt-chalkboard li.abstain { background: color-mix(in srgb, #9b9fa3 12%, var(--vt-card)); border-radius: 10px; }
  .vt-chalkboard li.receiving { --vt-receiving-color: #b83c48; background: color-mix(in srgb, #aed9bb 20%, var(--vt-card)); border-radius: 10px; }
  .vt-chalkboard li.abstain.receiving { background: color-mix(in srgb, #9b9fa3 20%, var(--vt-card)); }
  :global(.vt-root[data-scheme='dark']) .vt-chalkboard li.receiving { --vt-receiving-color: #ff969e; }
  /* 실제 이름·획 너비로 줄바꿈을 판단합니다. 여유 공간은 획 영역에 주어 가운데에 놓습니다. */
  .vt-cb-content { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; min-width: 0; }
  .vt-cb-name { display: flex; align-items: center; flex: 0 1 max-content; max-width: 100%; gap: 12px; min-width: 0; }
  .vt-cb-name b { flex: 1; min-width: 0; font-size: var(--name-size); line-height: 1.25; white-space: normal; overflow-wrap: anywhere; }
  .vt-cb-marks { display: flex; flex: 1 1 max-content; align-items: center; justify-content: center; flex-wrap: nowrap; min-width: 0; max-width: 100%; overflow: hidden; gap: 4px; }
  .vt-mark { flex: 0 1 var(--mark-size, 38px); min-width: 12px; width: var(--mark-size, 38px); height: var(--mark-size, 38px); }
  .vt-mark path { fill: none; stroke: var(--vt-receiving-color, #527d69); stroke-width: 3.6; stroke-linecap: round; }
  .vt-mark path.new { stroke-dasharray: 40; stroke-dashoffset: 40; animation: vt-chalk 120ms var(--vt-ease) var(--d) forwards, vt-chalk-glow 900ms var(--vt-ease) var(--d) both; }
  .vt-mark-extra { flex: none; color: var(--vt-receiving-color, var(--vt-muted)); font-size: 15px; font-weight: 800; }
  .vt-cb-count { display: flex; flex-direction: row; align-items: baseline; justify-content: flex-end; gap: 7px; min-width: max-content; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  .vt-cb-total { display: inline-flex; flex-flow: row nowrap; align-items: baseline; justify-content: flex-end; gap: 5px; width: max-content; white-space: nowrap; }
  .vt-cb-value { display: inline; font-size: var(--count-size); font-weight: 900; line-height: 1; }
  .vt-cb-unit { display: inline; margin: 0; color: var(--vt-muted); font-size: 18px; font-weight: 800; line-height: 1; }
  .vt-cb-gain { font-size: 16px; font-weight: 900; line-height: 1; }
  .vt-chalkboard li.receiving .vt-cb-count, .vt-chalkboard li.receiving .vt-cb-unit { color: var(--vt-receiving-color); }
  .vt-cb-verdict { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(36, 73, 63, .55); }
  .dense .vt-cb-gain { font-size: 14px; }
  .dense:not(.yesno) .vt-chalkboard li { padding-block: 4px; }
  .yesno.vt-paper-stage { min-height: 320px; grid-template-columns: minmax(260px, .8fr) minmax(0, 1.7fr); gap: 20px; padding-top: 14px; }
  .yesno .vt-chalkboard { border-color: #d4dee9; background: #fff; color: #293c50; border-radius: 16px; }
  .yesno .vt-chalkboard header { background: #fff; color: #293c50; border-bottom: 1px solid #d4dee9; padding: 16px 20px; }
  .yesno .vt-chalkboard header span { color: #64748b; }
  .yesno .vt-chalkboard ul { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: minmax(160px, 1fr); gap: 0; padding: 0; }
  .yesno .vt-chalkboard ul:has(.abstain) { grid-template-rows: minmax(160px, 1fr) minmax(62px, .24fr); }
  .yesno .vt-chalkboard li { --choice-ink: #2868b5; --vt-receiving-color: var(--choice-ink); display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 12px; padding: 12px 24px; border: 0; border-radius: 0; background: #f1f6ff; color: var(--choice-ink); }
  .yesno .vt-chalkboard li.no { --choice-ink: #bd404b; background: #fff3f3; border-left: 1px solid #d4dee9; }
  .yesno .vt-chalkboard li.receiving { box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--choice-ink) 40%, transparent); }
  .yesno .vt-cb-content { display: grid; grid-template-rows: auto 32px; align-items: start; gap: 10px; }
  .yesno .vt-cb-name { flex: none; gap: 10px; }
  .yesno .vt-cb-name b { font-size: clamp(24px, 2.6cqi, 38px); }
  .vt-cb-choice { display: grid; place-items: center; flex: none; width: 42px; height: 42px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 12px; background: #ffffffb3; font-size: 30px; line-height: 1; }
  .yesno .vt-cb-marks { flex: none; justify-content: flex-start; min-height: 32px; height: 32px; }
  .yesno .vt-mark { flex-basis: 32px; width: 32px; height: 32px; }
  .yesno .vt-mark path { stroke: var(--choice-ink); }
  .yesno .vt-cb-count { justify-content: flex-start; gap: 10px; }
  .yesno .vt-cb-value { font-size: clamp(48px, 5.6cqi, 82px); }
  .yesno .vt-cb-unit { color: var(--choice-ink); font-size: 22px; }
  .yesno .vt-cb-gain { order: 1; font-size: 20px; }
  .yesno .vt-chalkboard li.abstain { --choice-ink: #657181; grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; padding: 12px 24px; border-top: 1px solid #d4dee9; background: #f6f7f9; }
  .yesno .vt-cb-outlook { justify-content: flex-start; }
  .yesno .abstain .vt-cb-content { display: flex; flex-direction: row; align-items: center; }
  .yesno .abstain .vt-cb-name b { font-size: 20px; }
  .yesno .abstain .vt-cb-value { font-size: 30px; }
  .yesno .abstain .vt-cb-unit { font-size: 17px; }
  .yesno .vt-sheet-row:not(.abstain) { color: #2868b5; }
  .yesno .vt-sheet-row:nth-child(2) { color: #bd404b; }
  .yesno .vt-sheet-row.selected:first-child { background: #edf4ff; }
  .yesno .vt-sheet-row.selected:nth-child(2) { background: #fff0f1; }
  .yesno .vt-ballot-sheet.animate .vt-sheet-row.selected { animation: none; }
  .vt-ballot-sheet.animate { animation: vt-sheet-settle 240ms cubic-bezier(.2,.8,.2,1) both; }
  .vt-ballot-sheet.animate .vt-sheet-stamp { animation: vt-stamp-hit 180ms cubic-bezier(.2,.8,.2,1) 180ms both; }
  .vt-ballot-sheet.animate .vt-sheet-row.selected { animation: vt-selection-wash 420ms ease-out both; }
  @keyframes vt-sheet-settle { from { transform: translateY(12px); } to { transform: translateY(0); } }
  @keyframes vt-selection-wash { from { background-color: #ffe0d8; } }
  @keyframes vt-stamp-hit { from { transform: translateY(-5px) scale(1.12); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
  @keyframes vt-chalk { to { stroke-dashoffset: 0; } }
  @keyframes vt-chalk-glow { from { stroke: var(--vt-receiving-color, #cc8b24); } to { stroke: var(--vt-receiving-color, #527d69); } }
  @container (max-width: 1100px) {
    .vt-paper-stage { grid-template-columns: 320px minmax(0, 1fr); gap: 18px; padding: 14px 18px 18px; }
    .vt-ballot-sheet { padding: 12px; }
    .vt-chalkboard header { padding: 18px; }
    .vt-chalkboard header b { font-size: 20px; }
    .vt-chalkboard li { gap: 10px; }
    .vt-cb-name { gap: 8px; }
  }
  @container (max-width: 850px) {
    .vt-paper-stage { grid-template-columns: 280px minmax(0, 1fr); padding: 12px; gap: 12px; }
    .vt-chalkboard li { grid-template-columns: minmax(0, 1fr) max-content; }
    .vt-cb-marks { display: none; }
    .vt-chalkboard header { flex-wrap: wrap; gap: 5px; }
    .vt-chalkboard ul { padding: 4px 8px; }
    .vt-cb-name { gap: 6px; }
    .yesno.vt-paper-stage { grid-template-columns: 260px minmax(0, 1fr); gap: 12px; }
    .yesno .vt-chalkboard li { padding: 12px; }
    .yesno .vt-cb-choice { width: 32px; height: 32px; font-size: 24px; border-radius: 9px; }
  }
  @container (max-width: 640px) {
    .yesno.vt-paper-stage { grid-template-columns: 1fr; grid-template-rows: minmax(320px, auto) minmax(300px, 1fr); }
    .vt-paper-stage { overflow: auto; grid-template-columns: 1fr; grid-template-rows: minmax(470px, auto) minmax(440px, 1fr); }
    .vt-paper-left { min-height: 470px; }
    .vt-cb-name { flex-wrap: nowrap; }
  }
</style>
