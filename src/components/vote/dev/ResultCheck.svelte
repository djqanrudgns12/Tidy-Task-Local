<script lang="ts">
  // Temporary DEV-only screen. Removing this folder + lib/vote/devCheck* and
  // the marked VoteApp hooks removes the feature. VoteApp saves completed checks.
  import { tick } from 'svelte';
  import { X } from 'lucide-svelte';
  import CountingStage from '../counting/CountingStage.svelte';
  import ResultBoard from '../result/ResultBoard.svelte';
  import { CHECK_DEFAULTS, CHECK_PRESETS, normalizeCheck, createCheckEntry } from '../../../lib/vote/devCheck.js';
  import { availableModes, modeName, VISIBILITIES } from '../../../lib/vote/model.js';
  import { tallyItems, tallyYesNo } from '../../../lib/vote/tally.js';
  let { audio, reduced, fontFamily, onexit, onarchive, onsave, ontoast, onphase, ontitle, toolsOpen = $bindable(true) } = $props<{
    audio: any; reduced: boolean; fontFamily: string; onexit: () => void;
    onarchive: () => void; onsave: (entry: any) => Promise<void>;
    ontoast: (text: string) => void; onphase: (phase: string) => void; ontitle: (title: string) => void; toolsOpen?: boolean;
  }>();
  let options = $state<any>({ ...CHECK_DEFAULTS });
  let entry = $state.raw<any>(createCheckEntry(CHECK_DEFAULTS, 'check-0'));
  let phase = $state('counting');
  let sidebar = $state<HTMLElement | null>(null);
  let run = $state(0);
  const visibilityNames: Record<string, string> = { all: '모두 공개', rank: '순위만 공개', winner: '당선자만 공개', result: '결과만 공개' };
  const modes = $derived(availableModes(options.type, options.visibility));
  const visibilities = $derived(VISIBILITIES[options.type as keyof typeof VISIBILITIES]);
  const summary = $derived.by(() => {
    if (!entry) return '';
    if (entry.config.type === 'yesno') return tallyYesNo(entry.config, entry.ballots).map((a, i) => `${i + 1}번: 찬성 ${a.yes} · 반대 ${a.no} · 기권 ${a.abstain}`).join(' / ');
    const t = tallyItems(entry.config, entry.ballots);
    return t.rows.map(r => `${r.item.number}번 ${r.count}표`).join(' · ') + ` / 기권 ${t.abstain}표`;
  });
  $effect(() => { onphase(phase); ontitle(entry.config.title); });
  $effect(() => {
    const open = toolsOpen;
    void tick().then(() => {
      if (open && toolsOpen) sidebar?.querySelector<HTMLButtonElement>('[data-close]')?.focus();
      else if (!open && !toolsOpen) document.getElementById('vt-dev-tools-toggle')?.focus();
    });
  });
  function onSidebarKey(event: KeyboardEvent) {
    // Keep shortcuts inside the drawer from reaching the counting stage.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); toolsOpen = false; return; }
    if (event.key !== 'Tab' || !sidebar) return;
    const controls = [...sidebar.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function normalize() { options = normalizeCheck(options); }
  function start(target: string) {
    normalize();
    entry = createCheckEntry(options, `check-${++run}`);
    void audio.unlock();
    if (target === 'result') showResult();
    else phase = target;
    toolsOpen = false;
  }
  function replay() { run++; phase = 'counting'; toolsOpen = false; }
  function showResult() {
    phase = 'result';
    toolsOpen = false;
    void onsave(entry);
  }
</script>

<section class="dev-check" aria-label="투표 결과 점검">
  {#key `${run}-${phase}`}
    {#if phase === 'counting'}
      <CountingStage {entry} {audio} {reduced} {fontFamily} remoteCmd={null} live={false} onfinish={showResult} />
    {:else}
      <ResultBoard {entry} {audio} {reduced} {fontFamily} celebrate={true} canRunoff={false} onrunoff={() => {}} onreplay={replay} {onarchive} onhome={onexit} {ontoast} />
    {/if}
  {/key}
  {#if toolsOpen}
    <div class="dev-overlay" class:reduced>
      <button class="dev-backdrop" tabindex="-1" aria-label="점검 도구 닫기" onclick={() => toolsOpen = false}></button>
      <div id="vt-dev-tools-panel" class="dev-sidebar" role="dialog" aria-modal="true" aria-labelledby="dev-tools-title" bind:this={sidebar} onkeydown={onSidebarKey} tabindex="-1">
        <header class="dev-head"><div><h2 id="dev-tools-title">투표 결과 점검 <small>DEV</small></h2><p>가상 투표 · 결과를 보면 기록함에 저장돼요</p></div><button class="vt-btn ghost icon" data-close aria-label="사이드바 닫기" onclick={() => toolsOpen = false}><X size={18} /></button></header>
        <div class="dev-sidebar-scroll">
          <div class="dev-current"><b>현재 점검 중</b><span>{entry.ballots.length}명 · {modeName(entry.config.reveal.mode, entry.config.type === 'yesno')} · {visibilityNames[entry.config.reveal.visibility]}</span>
            <div class="dev-actions"><button class="vt-btn" onclick={replay}>같은 표로 재개표</button><button class="vt-btn" onclick={showResult}>현재 결과 보기</button></div>
          </div>
          <form class="dev-form" onsubmit={(event) => { event.preventDefault(); start('counting'); }}>
            <div class="dev-presets" aria-label="점검 상황 빠른 설정">
              {#each CHECK_PRESETS as preset}<button type="button" class="vt-btn" onclick={() => options = normalizeCheck({ ...CHECK_DEFAULTS, ...preset.patch })}>{preset.label}</button>{/each}
            </div>
            <div class="dev-fields">
              <label>투표 방식<select bind:value={() => options.type, (value) => options = normalizeCheck({ ...options, type: value })}><option value="candidate">사람 뽑기</option><option value="opinion">의견 고르기</option><option value="yesno">찬반 투표</option></select></label>
              <label>{options.type === 'yesno' ? '안건 수' : options.type === 'opinion' ? '항목 수' : '후보자 수'}<input type="number" min={options.type === 'yesno' ? 1 : 2} max={options.type === 'yesno' ? 5 : 9} step="1" required bind:value={() => options.count, (value) => options = normalizeCheck({ ...options, count: value })} /></label>
              <label>총 투표 인원<input type="number" min="2" max="60" step="1" required bind:value={() => options.voters, (value) => options = normalizeCheck({ ...options, voters: value })} /></label>
              {#if options.type !== 'yesno'}
                <label>한 사람이 고르는 표<input type="number" min="1" max={options.repeat ? 5 : Math.min(5, options.count - 1)} step="1" required bind:value={() => options.votes, (value) => options = normalizeCheck({ ...options, votes: value })} /></label>
                <label>뽑을 인원·항목 수<input type="number" min="1" max={Math.min(4, options.count - 1)} step="1" required bind:value={() => options.seats, (value) => options = normalizeCheck({ ...options, seats: value })} /></label>
                <label>같은 후보·항목에 몰아주기<select bind:value={() => options.repeat, (value) => options = normalizeCheck({ ...options, repeat: value })}><option value={false}>허용하지 않음</option><option value={true}>허용</option></select></label>
              {:else}
                <label>통과 기준<select bind:value={options.passRule}><option value="yesOverNo">찬성 &gt; 반대</option><option value="majority">참여자 과반</option><option value="twoThirds">참여자 3분의 2 이상</option><option value="none">판정 없음</option></select></label>
              {/if}
              <label>공개 범위<select bind:value={() => options.visibility, (value) => options = normalizeCheck({ ...options, visibility: value })}>{#each visibilities as visibility}<option value={visibility}>{visibilityNames[visibility]}</option>{/each}</select></label>
              <label>개표 방법<select bind:value={options.mode}>{#each modes as mode}<option value={mode}>{modeName(mode, options.type === 'yesno')}</option>{/each}</select></label>
              <label>표 분포·점검 상황<select bind:value={options.scenario}>
                <option value="random">무작위 · 일부 기권 포함</option><option value="landslide">{options.type === 'yesno' ? '전원 찬성' : '앞 번호에 집중'}</option>
                <option value="tie">{options.type === 'yesno' ? '찬반 동률' : '1·2번 동률'}</option><option value="equal">모두 동률</option><option value="abstain">전원 기권</option>
                {#if options.type === 'yesno'}<option value="fail">전원 반대</option><option value="threshold">통과 기준 경계</option><option value="mixed">안건별 통과·부결·동률·기권·경계</option>{:else}<option value="boundary">앞 3개에 분배 · 당선 경계 점검</option>{/if}
              </select></label>
            </div>
            <label class="dev-checkbox"><input type="checkbox" bind:checked={options.longNames} /> 긴 이름·긴 안건으로 배치 점검</label>
            <p class="dev-note">이름·캐릭터·투표지는 자동으로 만들어요. 공개 범위에 맞는 개표 방법만 표시해요.<br />동률은 같은 득표가 되도록 남는 표를 기권 처리해요. ‘당선 경계 동률’ 빠른 설정은 12·6·6표를 만들어요.</p>
            <div class="dev-actions"><button type="submit" class="vt-btn primary">개표 과정부터 보기</button><button type="button" class="vt-btn" onclick={() => start('result')}>결과만 바로 보기</button></div>
          </form>
          <details class="dev-summary"><summary>생성된 표 확인</summary><p>{summary}</p></details>
          <button class="vt-btn ghost dev-exit" onclick={onexit}>점검 끝내고 처음으로</button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .dev-check { position: relative; width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .dev-overlay { position: absolute; inset: 0; z-index: 60; overflow: hidden; }
  .dev-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: #172b242b; cursor: pointer; animation: dev-shade 240ms var(--vt-ease) both; }
  .dev-sidebar { position: absolute; inset: 0 0 0 auto; width: min(440px, 100%); display: flex; flex-direction: column; background: var(--vt-card); border-left: 1px solid var(--vt-line); box-shadow: -12px 0 36px #172b2426; animation: dev-enter 240ms var(--vt-ease) both; }
  .dev-head { flex: none; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 20px; border-bottom: 1px solid var(--vt-line); }
  .dev-head h2 { margin: 0; font-size: 20px; } .dev-head small { color: var(--vt-muted); font-size: 11px; }
  .dev-head p, .dev-note { color: var(--vt-muted); font-size: 12px; line-height: 1.6; margin: 6px 0 0; }
  .dev-sidebar-scroll { flex: 1; min-height: 0; overflow: auto; padding: 20px; }
  .dev-current { display: grid; gap: 8px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--vt-line); }
  .dev-current > span { font-size: 12px; color: var(--vt-muted); }
  .dev-form { display: grid; gap: 18px; }
  .dev-presets, .dev-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .dev-presets .vt-btn { min-height: 34px; padding: 7px 10px; font-size: 12px; }
  .dev-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; }
  label { display: flex; flex-direction: column; gap: 7px; font-size: 13px; font-weight: 700; }
  select, input[type='number'] { width: 100%; min-width: 0; box-sizing: border-box; padding: 9px; min-height: 40px; border-radius: 8px; border: 1px solid var(--vt-line); background: var(--vt-soft); color: var(--vt-ink); font: inherit; }
  .dev-checkbox { flex-direction: row; align-items: center; }
  .dev-summary { margin: 20px 0; font-size: 13px; color: var(--vt-muted); line-height: 1.6; } summary { cursor: pointer; }
  .dev-exit { width: 100%; }
  @keyframes dev-enter { from { transform: translateX(28px); opacity: .4; } to { transform: none; opacity: 1; } }
  @keyframes dev-shade { from { opacity: 0; } to { opacity: 1; } }
  .reduced .dev-backdrop, .reduced .dev-sidebar { animation: none; }
  @media (prefers-reduced-motion: reduce) { .dev-backdrop, .dev-sidebar { animation: none; } }
  @media (max-width: 380px) { .dev-fields { grid-template-columns: 1fr; } }
</style>
