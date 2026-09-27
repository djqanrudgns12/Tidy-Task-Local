<script lang="ts">
  import { tick } from 'svelte';
  import { Archive, RotateCcw, CopyPlus, Trash2, Vote, Pencil, Check, X, Image, Download, Copy, FileText, LoaderCircle, ChevronDown } from 'lucide-svelte';
  import { resultModel, resultSummary, resultVisibilityOptions, resultVisibilityLabel } from '../../../lib/vote/result.js';
  import { renderResultPng, savePng, copyPng } from '../../../lib/vote/exportImage.js';
  import { typeLabel, dateLabel, LIMITS } from '../../../lib/vote/model.js';
  import { RECORD_NOTE_MAX } from '../../../lib/vote/archive.js';
  import Sticker from '../common/Sticker.svelte';
  let { archive, fontFamily, onreplay, onduplicate, ondelete, onupdate, onrunoff, ontoast } = $props<{
    archive: any; fontFamily: string; onreplay: (e: any) => void; onduplicate: (e: any) => void; ondelete: (e: any) => void;
    onupdate: (e: any, patch: { title: string; note: string }) => Promise<boolean>;
    onrunoff: (e: any) => void; ontoast: (t: string) => void;
  }>();
  let selectedId = $state<string | null>(null);
  const selected = $derived(archive.entries.find((e: any) => e.id === selectedId) ?? archive.entries[0] ?? null);
  // 기록마다 교사용 전체 집계로 시작합니다. 이 선택은 저장된 투표 설정과 독립적입니다.
  let disclosure = $state<{ id: string; value: string } | null>(null);
  const visibility = $derived(disclosure && disclosure.id === selected?.id ? disclosure.value : 'all');
  const visibilityOptions = $derived(selected ? resultVisibilityOptions(selected.config.type) : []);
  const m = $derived(selected ? resultModel(selected, { visibility }) : null);
  const visibilityLabel = $derived(m ? resultVisibilityLabel(m.visibility, m.type) : '모두 공개');
  let tab = $state<'result' | 'image'>('result');
  let editing = $state(false);
  let editTitle = $state('');
  let editNote = $state('');
  let editError = $state('');
  let saving = $state(false);
  let titleInput = $state<HTMLInputElement>();
  let imageDialog = $state<HTMLDialogElement>();
  let imageData = $state.raw<{ blob: Blob; url: string; model: ReturnType<typeof resultModel>; font: string } | null>(null);
  // 공개 범위를 연속으로 바꿔도 이전 범위의 PNG를 저장하거나 잠깐 보여 주지 않습니다.
  const readyImage = $derived(imageData?.model === m && imageData?.font === fontFamily ? imageData : null);
  let imageError = $state('');
  let imageLoading = $state(false);
  let exportBusy = $state(false);
  let retry = $state(0);
  function select(id: string) {
    if (id !== selected?.id) disclosure = null;
    selectedId = id; editing = false; editError = '';
  }
  async function edit() {
    editTitle = selected.config.title;
    editNote = selected.note ?? '';
    editError = '';
    editing = true;
    await tick();
    titleInput?.focus();
  }
  async function saveRecord(event: SubmitEvent) {
    event.preventDefault();
    if (saving || !selected) return;
    if (!editTitle.trim()) { editError = '기록 제목을 입력해 주세요.'; titleInput?.focus(); return; }
    saving = true;
    editError = '';
    try {
      if (await onupdate(selected, { title: editTitle, note: editNote })) editing = false;
      else editError = '변경 내용을 저장하지 못했어요. 다시 시도해 주세요.';
    } catch { editError = '변경 내용을 저장하지 못했어요. 다시 시도해 주세요.'; }
    finally { saving = false; }
  }
  // 교사가 고른 공개 범위의 PNG를 미리보기·저장·복사에 공통 사용합니다.
  $effect(() => {
    const model = m;
    const font = fontFamily;
    const active = tab === 'image';
    const attempt = retry;
    let disposed = false;
    let url = '';
    imageData = null;
    imageError = '';
    imageLoading = active && !!model;
    if (active && model) {
      void renderResultPng(model, font).then(blob => {
        if (disposed) return;
        url = URL.createObjectURL(blob);
        imageData = { blob, url, model, font };
      }).catch(() => {
        if (!disposed) imageError = '결과 이미지를 만들지 못했어요. 다시 시도해 주세요.';
      }).finally(() => { if (!disposed) imageLoading = false; });
    }
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  });
  async function exportImage(action: 'save' | 'copy') {
    if (!readyImage || exportBusy) return;
    const { blob, model } = readyImage;
    exportBusy = true;
    try {
      if (action === 'copy') { await copyPng(blob); ontoast('결과 이미지를 복사했어요'); }
      else if (await savePng(model, blob)) ontoast('결과 이미지를 저장했어요');
    } catch {
      ontoast(action === 'copy' ? '이미지를 복사하지 못했어요. PNG로 저장을 이용해 주세요.' : '이미지를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { exportBusy = false; }
  }
</script>

<div class="vt-records">
  {#if !selected || !m}
    <div class="vt-records-empty"><Archive size={30} aria-hidden="true" /><b>아직 끝난 투표가 없어요</b><p>투표를 마치면 결과와 결과 이미지를 여기에서 다시 볼 수 있어요.</p></div>
  {:else}
    <div class="vt-records-layout">
      <nav class="vt-records-nav" aria-label="지난 투표 기록">
        <div class="vt-records-list-head"><b>지난 투표 <span>{archive.entries.length}</span></b><small>최근 {LIMITS.archiveMax}개 보관</small></div>
        <ol class="vt-records-list">
          {#each archive.entries as entry, i (entry.id)}
            <li><button class="vt-record-row" class:selected={selected.id === entry.id} aria-current={selected.id === entry.id ? 'true' : undefined} disabled={saving || exportBusy} onclick={() => select(entry.id)}>
              <span class="vt-record-row-meta">{dateLabel(entry.finishedOn, true)} · {typeLabel(entry.config.type)}{i === 0 ? ' · 최근' : ''}</span>
              <b>{entry.config.title}</b><span class="vt-record-row-summary">{resultSummary(resultModel(entry))}</span>
            </button></li>
          {/each}
        </ol>
      </nav>
      <section class="vt-record-detail" aria-label={`${m.title} 기록 상세`} aria-busy={saving}>
        {#if editing}
          <form class="vt-record-edit" onsubmit={saveRecord}>
            <div class="vt-record-section-head"><b>기록 수정</b><small>받은 표와 집계는 보존돼요</small></div>
            <label for="vt-record-edit-title">기록 제목 <span>{Array.from(editTitle).length}/{LIMITS.titleMax}</span></label>
            <input id="vt-record-edit-title" bind:this={titleInput} bind:value={editTitle} maxlength={LIMITS.titleMax} disabled={saving} aria-invalid={!!editError} aria-describedby={editError ? 'vt-record-edit-error' : undefined} />
            <label for="vt-record-edit-note">메모 <span>{Array.from(editNote).length}/{RECORD_NOTE_MAX}</span></label>
            <textarea id="vt-record-edit-note" bind:value={editNote} maxlength={RECORD_NOTE_MAX} rows={3} disabled={saving} placeholder="결정한 내용이나 다음에 참고할 점을 남겨요."></textarea>
            {#if editError}<p id="vt-record-edit-error" class="vt-record-error" role="alert">{editError}</p>{/if}
            <div class="vt-record-edit-actions"><button class="vt-btn ghost" type="button" disabled={saving} onclick={() => editing = false}><X size={16} />취소</button><button class="vt-btn primary" type="submit" disabled={saving}><Check size={16} />{saving ? '저장 중…' : '변경 저장'}</button></div>
          </form>
        {:else}
          <header class="vt-record-detail-head">
            <div><span class="vt-record-meta">{dateLabel(m.date)} · {typeLabel(m.type)}{m.runoffCount ? ` · 결선 ${m.runoffCount}회` : ''}</span><h3>{m.title}</h3><p>{m.voters}명 중 {m.participants}명 투표</p></div>
            <button class="vt-btn ghost" onclick={edit} disabled={exportBusy}><Pencil size={15} />기록 수정</button>
          </header>
          {#if selected.note}<p class="vt-record-note"><FileText size={15} aria-hidden="true" /><span>{selected.note}</span></p>{/if}
          <div class="vt-record-tabs" role="group" aria-label="결과 보기 방식">
            <button aria-pressed={tab === 'result'} class:active={tab === 'result'} disabled={exportBusy} onclick={() => tab = 'result'}><Vote size={16} />투표 결과</button>
            <button aria-pressed={tab === 'image'} class:active={tab === 'image'} disabled={exportBusy} onclick={() => tab = 'image'}><Image size={16} />결과 이미지</button>
          </div>
          <div class="vt-record-view-settings">
            <div class="vt-record-scope">
              <label for="vt-record-visibility">공개 범위</label>
              <div class="vt-record-select">
                <select id="vt-record-visibility" value={visibility} disabled={exportBusy}
                  aria-describedby="vt-record-visibility-help"
                  onchange={(event) => disclosure = { id: selected.id, value: event.currentTarget.value }}>
                  {#each visibilityOptions as option}<option value={option.value}>{option.label}</option>{/each}
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
            </div>
            <p id="vt-record-visibility-help">투표 결과와 저장·복사할 이미지에 함께 적용돼요.</p>
          </div>
          {#if tab === 'result'}
            <div class="vt-record-result">
              {#if m.showCounts}
                <dl class="vt-record-totals" aria-label="전체 득표 집계">
                  <div><dt>{m.type === 'yesno' && m.agendas.length > 1 ? '유효표 합계' : '유효표'}</dt><dd>{m.validVotes}<span>표</span></dd></div>
                  <div><dt>{m.type === 'yesno' && m.agendas.length > 1 ? '기권 합계' : '기권'}</dt><dd>{m.abstain}<span>표</span></dd></div>
                </dl>
              {/if}
              {#if m.type === 'yesno'}
                {#each m.agendas as agenda, i}
                  <article class="vt-record-agenda"><div><small>안건 {i + 1}</small><b>{agenda.text}</b>{#if m.showCounts}<span>찬성 {agenda.yes} · 반대 {agenda.no} · 기권 {agenda.abstain}</span>{/if}</div><span class="vt-record-verdict" class:passed={agenda.passed}>{agenda.passed === null ? '판정 없음' : agenda.passed ? '통과' : '부결'}</span></article>
                {/each}
                <p class="vt-record-disclosure">{m.rule} · {m.showCounts ? '전체 결과 공개' : '결과만 공개'}</p>
              {:else}
                <div class="vt-record-outcome"><span>{m.type === 'opinion' ? '최종 선택' : '최종 당선'}</span><b>{resultSummary(m)}</b></div>
                {#if m.pendingTie.length}<p class="vt-record-tie">{m.openSeats}{m.type === 'opinion' ? '개' : '명'} 자리를 두고 {m.pendingTie.map(item => item.name).join(', ')} 동점</p>{/if}
                {#if m.rows.length}
                  <ol class="vt-record-ranks" aria-label="투표 순위">
                    {#each m.rows as row (row.item.id)}
                      <li><span class="vt-record-rank">{row.rank}</span><Sticker item={row.item} type={m.type} size={32} /><b>{row.item.name}</b>{#if m.showCounts}<span class="vt-record-votes">{row.count}표 <small>{row.percent}%</small></span>{/if}{#if row.winner}<span class="vt-record-badge">{m.type === 'opinion' ? '선택' : '당선'}</span>{:else if row.tied}<span class="vt-record-badge tie">동점</span>{/if}</li>
                    {/each}
                  </ol>
                {/if}
                <p class="vt-record-disclosure">{visibilityLabel}{m.showCounts ? ' · 득표율은 유효 선택 수 기준' : ''}{m.round ? ' · 집계와 순위는 마지막 결선 기준' : ''}</p>
              {/if}
            </div>
          {:else}
            <div class="vt-record-image">
              <div class="vt-record-image-tools"><span aria-live="polite">{visibilityLabel} · PNG 미리보기</span><button class="vt-btn ghost" disabled={!readyImage || exportBusy} onclick={() => void exportImage('copy')}><Copy size={15} />이미지 복사</button><button class="vt-btn primary" disabled={!readyImage || exportBusy} onclick={() => void exportImage('save')}><Download size={15} />{exportBusy ? '처리 중…' : 'PNG로 저장'}</button></div>
              {#if imageLoading || (!readyImage && !imageError)}<p class="vt-record-image-state" role="status"><LoaderCircle size={22} />{visibilityLabel} 이미지를 만들고 있어요…</p>
              {:else if imageError}<div class="vt-record-image-state"><p role="alert">{imageError}</p><button class="vt-btn" onclick={() => retry++}>다시 시도</button></div>
              {:else if readyImage}<button class="vt-record-image-preview" onclick={() => imageDialog?.showModal()} aria-label={`${m.title} ${visibilityLabel} 결과 이미지 크게 보기`}><img src={readyImage.url} alt={`${m.title} · ${visibilityLabel}. ${resultSummary(m)}`} /></button><p class="vt-record-disclosure">미리보기 그대로 저장·복사돼요. 이미지를 누르면 크게 볼 수 있어요.</p>{/if}
            </div>
          {/if}
          <footer class="vt-record-actions">
            <div>{#if m.type !== 'yesno' && m.pendingTie.length}<button class="vt-btn primary" disabled={exportBusy} onclick={() => onrunoff(selected)}><Vote size={15} />결선 투표</button>{/if}<button class="vt-btn" disabled={exportBusy} onclick={() => onduplicate(selected)}><CopyPlus size={16} />복사해서 새 투표</button><button class="vt-btn ghost" disabled={exportBusy} onclick={() => onreplay(selected)}><RotateCcw size={15} />다시 개표</button></div>
            <button class="vt-btn ghost danger" disabled={exportBusy} onclick={() => ondelete(selected)}><Trash2 size={15} />기록 삭제</button>
          </footer>
        {/if}
      </section>
    </div>
  {/if}
</div>

<dialog class="vt-record-image-dialog" bind:this={imageDialog} aria-label="투표 결과 이미지 크게 보기">
  <div class="vt-record-image-dialog-head"><b>{m?.title ?? '투표 결과'} · {visibilityLabel}</b><button class="vt-btn ghost" aria-label="이미지 닫기" onclick={() => imageDialog?.close()}><X size={20} /></button></div>
  {#if readyImage && m}<img src={readyImage.url} alt={`${m.title} · ${visibilityLabel}. ${resultSummary(m)}`} />{/if}
</dialog>

<style>
  .vt-records { padding:20px; }
  .vt-records-empty { display:grid; justify-items:center; gap:12px; padding:36px 15px; color:var(--vt-muted); text-align:center; }
  .vt-records-empty b { font-size:18px; color:var(--vt-ink); }
  .vt-records-empty p { margin:0; font-size:14px; line-height:1.6; word-break:keep-all; }
  .vt-records-layout { display:grid; grid-template-columns:minmax(230px,.8fr) minmax(0,1.8fr); gap:22px; align-items:start; }
  .vt-records-nav { min-width:0; }
  .vt-records-list-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; }
  .vt-records-list-head b { font-size:13px; }
  .vt-records-list-head b > span { color:var(--vt-accent); margin-left:4px; }
  .vt-records-list-head small { font-size:11px; color:var(--vt-muted); }
  .vt-records-list { display:grid; gap:7px; max-height:560px; overflow-y:auto; list-style:none; margin:0; padding:2px; }
  .vt-record-row { display:grid; gap:6px; width:100%; padding:14px; border:1px solid transparent; border-radius:12px; background:color-mix(in srgb,var(--vt-soft) 40%,transparent); color:var(--vt-ink); text-align:left; }
  .vt-record-row:hover { background:var(--vt-soft); }
  .vt-record-row.selected { border-color:color-mix(in srgb,var(--vt-accent) 45%,var(--vt-line)); background:var(--vt-soft); box-shadow:inset 3px 0 var(--vt-accent); }
  .vt-record-row-meta { font-size:11px; color:var(--vt-muted); }
  .vt-record-row b { font-size:15px; line-height:1.4; overflow-wrap:anywhere; }
  .vt-record-row-summary { font-size:12px; color:var(--vt-muted); line-height:1.4; overflow-wrap:anywhere; }
  .vt-record-detail { min-width:0; padding:20px; border:1px solid var(--vt-line); border-radius:15px; }
  .vt-record-detail-head { display:flex; justify-content:space-between; align-items:start; gap:12px; }
  .vt-record-detail-head > div { min-width:0; }
  .vt-record-meta { font-size:12px; color:var(--vt-muted); }
  .vt-record-detail-head h3 { margin:7px 0; font-size:23px; line-height:1.35; overflow-wrap:anywhere; }
  .vt-record-detail-head p { margin:0; color:var(--vt-muted); font-size:13px; }
  .vt-record-detail-head .vt-btn { flex:none; padding:0 8px; min-height:34px; font-size:12px; }
  .vt-record-note { display:flex; align-items:start; gap:8px; margin:15px 0 0; padding:12px; border-radius:8px; background:var(--vt-soft); font-size:13px; line-height:1.6; color:var(--vt-muted); }
  .vt-record-note :global(svg) { flex:none; margin-top:3px; }
  .vt-record-note span { white-space:pre-wrap; overflow-wrap:anywhere; }
  .vt-record-tabs { display:flex; gap:22px; border-bottom:1px solid var(--vt-line); margin:18px 0; }
  .vt-record-tabs button { display:flex; align-items:center; gap:7px; padding:10px 1px; border:0; border-bottom:2px solid transparent; background:none; color:var(--vt-muted); font-size:13px; font-weight:700; }
  .vt-record-tabs button.active { border-bottom-color:var(--vt-accent); color:var(--vt-accent); }
  .vt-record-view-settings { display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; padding:13px 15px; margin-bottom:18px; border:1px solid var(--vt-line); border-radius:10px; background:color-mix(in srgb,var(--vt-soft) 35%,var(--vt-card)); }
  .vt-record-scope { display:flex; align-items:center; gap:10px; max-width:100%; }
  .vt-record-scope label { flex:none; font-size:13px; font-weight:700; }
  .vt-record-select { position:relative; min-width:0; }
  .vt-record-select select { width:100%; min-height:40px; appearance:none; border:1px solid var(--vt-line); border-radius:8px; padding:8px 36px 8px 12px; background:var(--vt-card); color:var(--vt-ink); font:inherit; font-size:14px; font-weight:700; cursor:pointer; }
  .vt-record-select select:focus-visible { outline:2px solid var(--vt-accent); outline-offset:3px; }
  .vt-record-select select:disabled { opacity:.55; cursor:wait; }
  .vt-record-select :global(svg) { position:absolute; right:12px; top:50%; transform:translateY(-50%); pointer-events:none; color:var(--vt-muted); }
  .vt-record-view-settings p { flex:1 1 190px; margin:0; color:var(--vt-muted); font-size:12px; line-height:1.6; word-break:keep-all; }
  .vt-record-totals { display:flex; flex-wrap:wrap; gap:12px 26px; margin:0 0 14px; }
  .vt-record-totals > div { display:flex; align-items:baseline; gap:9px; }
  .vt-record-totals dt { color:var(--vt-muted); font-size:12px; }
  .vt-record-totals dd { margin:0; font-size:21px; font-weight:800; font-variant-numeric:tabular-nums; }
  .vt-record-totals dd span { margin-left:3px; font-size:12px; font-weight:500; }
  .vt-record-outcome { display:grid; gap:6px; padding:15px; border-radius:11px; background:var(--vt-soft); }
  .vt-record-outcome > span { color:var(--vt-accent); font-size:12px; font-weight:700; }
  .vt-record-outcome b { font-size:21px; line-height:1.4; overflow-wrap:anywhere; }
  .vt-record-tie { font-size:13px; color:var(--vt-muted); line-height:1.5; }
  .vt-record-ranks { display:grid; margin:12px 0; padding:0; list-style:none; }
  .vt-record-ranks li { display:flex; align-items:center; gap:10px; min-height:49px; border-bottom:1px solid color-mix(in srgb,var(--vt-line) 60%,transparent); }
  .vt-record-rank { flex:none; width:18px; color:var(--vt-muted); font-size:13px; text-align:center; }
  .vt-record-ranks li > b { min-width:0; margin-right:auto; font-size:14px; overflow-wrap:anywhere; }
  .vt-record-votes { flex:none; display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; }
  .vt-record-votes small { font-size:11px; font-weight:500; color:var(--vt-muted); }
  .vt-record-badge { flex:none; width:34px; padding:4px 2px; border-radius:5px; background:var(--vt-soft); color:var(--vt-accent); font-size:10px; font-weight:700; text-align:center; }
  .vt-record-badge.tie { color:var(--vt-muted); }
  .vt-record-agenda { display:flex; align-items:center; gap:16px; padding:13px 0; border-bottom:1px solid var(--vt-line); }
  .vt-record-agenda > div { display:grid; gap:6px; min-width:0; margin-right:auto; }
  .vt-record-agenda small, .vt-record-agenda div > span { font-size:12px; color:var(--vt-muted); }
  .vt-record-agenda b { font-size:15px; line-height:1.5; overflow-wrap:anywhere; }
  .vt-record-verdict { flex:none; padding:6px 10px; border-radius:7px; background:var(--vt-soft); color:var(--vt-muted); font-size:13px; font-weight:800; }
  .vt-record-verdict.passed { color:var(--vt-accent); }
  .vt-record-disclosure { margin:13px 0 0; color:var(--vt-muted); font-size:11px; line-height:1.5; word-break:keep-all; }
  .vt-record-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:20px; padding-top:15px; border-top:1px solid var(--vt-line); }
  .vt-record-actions > div { display:flex; flex-wrap:wrap; gap:5px; margin-right:auto; }
  .vt-record-actions .vt-btn, .vt-record-edit .vt-btn, .vt-record-image .vt-btn { min-height:36px; padding:0 10px; font-size:12px; border-radius:9px; }
  .vt-record-edit { display:grid; gap:10px; }
  .vt-record-section-head { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:4px; }
  .vt-record-section-head b { font-size:19px; }
  .vt-record-section-head small { color:var(--vt-muted); font-size:12px; }
  .vt-record-edit label { display:flex; justify-content:space-between; font-size:13px; font-weight:700; }
  .vt-record-edit label > span { color:var(--vt-muted); font-size:11px; font-weight:500; }
  .vt-record-edit input, .vt-record-edit textarea { width:100%; border:1px solid var(--vt-line); border-radius:9px; padding:11px 12px; background:var(--vt-card); color:var(--vt-ink); font:inherit; font-size:14px; }
  .vt-record-edit textarea { resize:vertical; min-height:85px; }
  .vt-record-edit-actions { display:flex; justify-content:flex-end; gap:7px; }
  .vt-record-error { margin:0; color:var(--vt-danger); font-size:13px; }
  .vt-record-image-tools { display:flex; align-items:center; flex-wrap:wrap; gap:7px; margin-bottom:13px; }
  .vt-record-image-tools > span { color:var(--vt-muted); margin-right:auto; font-size:11px; }
  .vt-record-image-preview { display:block; width:100%; padding:10px; border:1px solid var(--vt-line); border-radius:9px; background:var(--vt-soft); cursor:zoom-in; }
  .vt-record-image-preview img { display:block; width:100%; height:auto; border-radius:4px; }
  .vt-record-image-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:200px; padding:20px; margin:0; color:var(--vt-muted); font-size:14px; text-align:center; }
  .vt-record-image-dialog { width:min(1280px,calc(100vw - 40px)); max-height:calc(100dvh - 40px); padding:14px; border:1px solid var(--vt-line); border-radius:17px; background:var(--vt-card); color:var(--vt-ink); box-shadow:var(--vt-shadow-lift); }
  .vt-record-image-dialog::backdrop { background:#10251dcc; }
  .vt-record-image-dialog-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:12px; }
  .vt-record-image-dialog-head b { font-size:18px; overflow-wrap:anywhere; }
  .vt-record-image-dialog img { display:block; width:100%; height:auto; border-radius:8px; }
  @container (max-width:900px) { .vt-records-layout { grid-template-columns:minmax(190px,.7fr) minmax(0,1.5fr); gap:14px; } .vt-records { padding:15px; } .vt-record-detail { padding:15px; } .vt-record-detail-head { flex-wrap:wrap; } }
  @container (max-width:660px) { .vt-records-layout { grid-template-columns:1fr; } .vt-records-list { max-height:220px; } .vt-record-detail-head h3 { font-size:21px; } .vt-record-votes { gap:4px; } .vt-record-ranks li { gap:7px; } }
</style>
