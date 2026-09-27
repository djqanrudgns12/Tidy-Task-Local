<script lang="ts">
  // 결과 화면(PRD 8절). 결과 모델(result.js)이 공개 범위를 이미 걸러 주므로, 화면과 PNG가 어긋나지 않습니다.
  // 결과판의 카드가 등장한 뒤 축하 효과와 소리를 함께 시작합니다(개표 직후에만).
  // 동점의 사실은 결과판에, 결선 조작은 별도 도구 영역에 표시합니다.
  import { onDestroy, tick } from 'svelte';
  import { Download, Copy, RotateCcw, Archive, Home, Vote, Eye, X } from 'lucide-svelte';
  import { resultModel } from '../../../lib/vote/result.js';
  import { renderResultPng, savePng, copyPng } from '../../../lib/vote/exportImage.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import ResultSheet from './ResultSheet.svelte';
  import WinnerCeremony from './WinnerCeremony.svelte';
  import Confetti from '../common/Confetti.svelte';
  import ConfirmDialog from '../teacher/ConfirmDialog.svelte';
  let { entry, audio, reduced, fontFamily, celebrate, canRunoff, onrunoff, onreplay, onarchive, onhome, ontoast } = $props<{
    entry: any; audio: any; reduced: boolean; fontFamily: string; celebrate: boolean; canRunoff: boolean;
    onrunoff: () => void; onreplay: () => void; onarchive: () => void; onhome: () => void; ontoast: (t: string) => void;
  }>();
  const m = $derived(resultModel(entry));
  const teacherModel = $derived(resultModel(entry, { teacher: true }));
  const yesno = $derived(m.type === 'yesno');
  const tie = $derived(!yesno && m.pendingTie.length > 0);
  const unit = $derived(m.type === 'opinion' ? '개' : '명');
  let promptOpen = $state(true);
  let askTeacher = $state(false);
  let teacherOpen = $state(false);
  let busy = $state(false);
  let party = $state(false);
  let ceremonyReady = $state(false);
  let ceremonyDone = $state(false);
  let resultContent = $state<HTMLDivElement>();
  const ceremony = $derived(celebrate && m.type === 'candidate' && m.winners.length > 0 && !ceremonyDone);
  async function finishCeremony() {
    const restoreFocus = !!document.activeElement?.closest('.ceremony');
    ceremonyDone = true;
    await tick();
    if (restoreFocus) resultContent?.focus({ preventScroll: true });
  }

  let celebrationTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(celebrationTimer));

  async function saveImage() {
    busy = true;
    try {
      const blob = await renderResultPng(m, fontFamily);
      if (await savePng(m, blob)) ontoast('결과 이미지를 저장했어요');
    } catch {
      ontoast('이미지를 저장하지 못했어요 — [이미지 복사]를 써 보세요');
    } finally {
      busy = false;
    }
  }
  async function copyImage() {
    busy = true;
    try {
      await copyPng(await renderResultPng(m, fontFamily));
      ontoast('결과 이미지를 복사했어요 — 한글·파워포인트에 붙여 넣을 수 있어요');
    } catch {
      ontoast('이미지를 복사하지 못했어요 — [PNG로 저장]을 써 보세요');
    } finally {
      busy = false;
    }
  }
  let readyCelebration = false;
  function resultReady() {
    if (!celebrate || readyCelebration) return;
    readyCelebration = true;
    if (ceremony) {
      ceremonyReady = true;
      return;
    }
    celebrationTimer = setTimeout(() => {
      party = m.winners.length > 0 || (yesno && m.agendas.some((a: any) => a.passed));
      if (yesno) {
        if (m.agendas.some((a: any) => a.passed)) audio.play('result.pass');
        else if (m.agendas.some((a: any) => a.passed !== null)) audio.play('result.fail');
      } else if (m.winners.length) audio.play('result.fanfare');
      else if (tie) audio.play('result.tie');
    }, reduced ? 0 : 420);
  }
</script>

<section class="vt-result vt-stage-enter" class:winner-only={m.visibility === 'winner' || yesno}>
  <div class="vt-result-presentation">
    <div class="vt-result-content" class:waiting={ceremony} inert={ceremony} bind:this={resultContent} tabindex="-1">
      <ResultSheet model={m} {fontFamily} animate={celebrate} {reduced} onready={resultReady} />
    </div>
    {#if ceremony && ceremonyReady}
      <WinnerCeremony winners={m.winners} title={m.title} pendingTie={tie} {reduced} onreveal={() => audio.play('result.fanfare')} ondone={finishCeremony} />
    {:else if ceremony}
      <p class="vt-ceremony-loading" role="status">당선 발표를 준비하고 있어요…</p>
    {/if}
  </div>

  {#if tie && promptOpen && canRunoff}
    <!-- 결선 제안은 결과를 가리지 않도록 목록 아래 흐름 안에 둡니다. -->
    <div class="vt-runoff vt-pop-in" role="group" aria-label="결선 투표 제안">
      <span class="vt-runoff-text">
        <b>동점 {m.pendingTie.length}{unit}</b>
        <small>필요한 경우 동점 항목으로 결선 투표를 진행할 수 있어요.</small>
      </span>
      <button class="vt-btn" onclick={() => (promptOpen = false)}>나중에</button>
      <button class="vt-btn primary" onclick={onrunoff}><Vote size={17} />결선 투표 시작</button>
    </div>
  {/if}

  <footer class="vt-result-foot">
    <button class="vt-btn" disabled={busy} onclick={saveImage}><Download size={17} />PNG로 저장</button>
    <button class="vt-btn" disabled={busy} onclick={copyImage}><Copy size={17} />이미지 복사</button>
    <button class="vt-btn" onclick={onreplay}><RotateCcw size={17} />다시 개표 보기</button>
    {#if m.visibility !== 'all' && !yesno}<button class="vt-btn ghost" onclick={() => (askTeacher = true)}><Eye size={17} />전체 득표(선생님만)</button>{/if}
    <span class="vt-foot-spacer"></span>
    {#if tie && canRunoff && !promptOpen}<button class="vt-btn primary" onclick={onrunoff}><Vote size={17} />결선 투표</button>{/if}
    <div class="vt-result-nav" role="group" aria-label="기록과 화면 이동">
      <button class="vt-btn ghost" onclick={onarchive}><Archive size={17} />기록함</button>
      <span class="vt-nav-divider" aria-hidden="true"></span>
      <button class="vt-btn ghost" onclick={onhome}><Home size={17} />처음으로</button>
    </div>
  </footer>

  {#if party && !reduced}<Confetti colors={m.winners.map((w: any) => paletteOf(w.color).line).concat(['#F4C95D', '#fff'])} />{/if}
  {#if party && reduced}<Confetti colors={['#F4C95D', '#F2A9B9', '#A6CDEF']} reduced />{/if}
  {#if askTeacher}
    <ConfirmDialog title="전체 득표를 열까요?" detail="칠판에 학생들이 보고 있지 않은지 확인해 주세요." ok="열기" oncancel={() => (askTeacher = false)} onok={() => { askTeacher = false; teacherOpen = true; }} />
  {/if}
  {#if teacherOpen}
    <div class="vt-teacher-panel vt-card" role="dialog" aria-label="전체 득표(선생님만)">
      <header><b>전체 득표 · 선생님만</b><button class="vt-btn ghost icon" aria-label="닫기" onclick={() => (teacherOpen = false)}><X size={18} /></button></header>
      <ol>{#each teacherModel.rows as r (r.item.id)}<li><span>{r.rank}위</span><b>{r.item.number}번 {r.item.name}</b><em>{r.count}표</em></li>{/each}</ol>
      <p>기권 {teacherModel.abstain ?? 0}</p>
    </div>
  {/if}
</section>

<style>
  .vt-result-presentation { position: relative; min-height: 0; min-width: 0; display: grid; container-type: size; }
  .vt-result-content { min-height: 0; min-width: 0; display: grid; opacity: 1; transition: opacity 420ms ease-out; }
  .vt-result-content.waiting { opacity: 0; }
  .vt-ceremony-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--vt-muted); }
  .vt-result {
    position: relative;
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px 20px 12px;
    background: #f7f8f2;
  }
  .vt-result:has(.vt-runoff) {
    grid-template-rows: minmax(0, 1fr) auto auto;
  }
  .vt-runoff {
    justify-self: center;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    width: 100%;
    padding: 12px 14px 12px 20px;
    border: 1px solid var(--vt-line);
    border-radius: 20px;
    background: color-mix(in srgb, var(--vt-gold) 12%, var(--vt-card));
    box-shadow: var(--vt-shadow);
    animation-delay: 600ms;
  }
  .vt-runoff-text {
    display: grid;
    flex: 1;
    gap: 2px;
    min-width: 260px;
  }
  .vt-runoff b {
    font-size: 18px;
  }
  .vt-runoff small {
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 700;
  }
  .vt-result-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--vt-line) 70%, transparent);
  }
  .vt-foot-spacer {
    flex: 1;
  }
  .vt-result-nav {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: auto;
    padding: 2px;
    border: 1px solid var(--vt-line);
    border-radius: 14px;
    background: var(--vt-card);
  }
  .vt-result-nav .vt-btn {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 11px;
    white-space: nowrap;
  }
  .vt-nav-divider {
    width: 1px;
    height: 20px;
    flex: none;
    background: var(--vt-line);
  }
  .vt-teacher-panel {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 30;
    width: min(360px, calc(100% - 32px));
    max-height: calc(100% - 32px);
    overflow: auto;
    padding: 14px 18px;
    border-radius: 20px;
    box-shadow: var(--vt-shadow-lift);
  }
  .vt-teacher-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .vt-teacher-panel ol {
    display: grid;
    gap: 6px;
    margin: 8px 0;
    padding: 0;
    list-style: none;
  }
  .vt-teacher-panel li {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    gap: 8px;
    font-size: 15px;
  }
  .vt-teacher-panel li span {
    color: var(--vt-muted);
    font-weight: 800;
  }
  .vt-teacher-panel em {
    font-style: normal;
    font-weight: 900;
  }
  .vt-teacher-panel p {
    margin: 0;
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 800;
  }
</style>
