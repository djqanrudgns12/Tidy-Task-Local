<script lang="ts">
  // 만들기 마법사(PRD 4절): ① 방식 ② 내용 ③ 규칙 ④ 개표(학생 안내는 옆 칸에서 언제나). 위 단계 표시 · 아래 [이전][다음]은 항상 같은 자리.
  // 바꾼 내용은 0.4초 뒤 draft 구역에 저장되어, 창을 닫아도 홈의 "만들던 투표 이어 만들기"로 돌아옵니다.
  // [다음]은 항상 눌립니다: 빠진 것이 있으면 첫 문제 칸으로 스크롤하고 그 아래에 이유를 보여 줍니다(비활성 버튼은 이유를 말하지 못하므로).
  import { onDestroy, tick, untrack } from 'svelte';
  import { ArrowLeft, ArrowRight, X, Check, Eye } from 'lucide-svelte';
  import { defaultConfig, normalizeConfig, typeLabel } from '../../../lib/vote/model.js';
  import type { VoteType } from '../../../lib/vote/model.js';
  import { validateConfig } from '../../../lib/vote/validate.js';
  import { randomId } from '../../../lib/vote/random.js';
  import StepType from './StepType.svelte';
  import StepContent from './StepContent.svelte';
  import StepRules from './StepRules.svelte';
  import StepReveal from './StepReveal.svelte';
  import BoothPreview from './BoothPreview.svelte';
  import TutorialPanel from './TutorialPanel.svelte';
  import { WIZARD_STEPS } from './steps.js';
  let { draft, prefs, reduced, speechAvailable, fontFamily, audio, onchange, onexit, oncreate } = $props<{
    draft: any; prefs: any; reduced: boolean; speechAvailable: boolean; fontFamily: string; audio: any;
    onchange: (d: any) => void; onexit: () => void; oncreate: (config: any) => void;
  }>();

  const initial = untrack(() => draft);
  // 틀로 시작하면 씨앗이 바뀌고, 내용 단계(StepContent)가 그 씨앗으로 캐릭터 순서를 정하므로 반응형이어야 합니다.
  const initialSeed = initial.seed || randomId('v');
  let seed = $state(initialSeed);
  let templateId = initial.templateId || '';
  let config = $state.raw<any>(initial.config ? normalizeConfig(initial.config, initialSeed) : withLast(defaultConfig('candidate')));
  let step = $state(initial.config ? initial.step : 0);
  let reached = $state(initial.config ? Math.max(initial.step, 1) : 0);
  let tried = $state<boolean[]>([false, false, false, false]);
  let body = $state<HTMLElement>();
  let previewOpen = $state(false);

  function withLast(c: any) {
    return { ...c, rules: { ...c.rules, voters: prefs.lastVoters } };
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function save(now = false) {
    clearTimeout(saveTimer);
    const payload = () => onchange({ config, step, seed, templateId });
    if (now) payload();
    else saveTimer = setTimeout(payload, 400);
  }
  onDestroy(() => {
    // 창을 닫거나 화면을 떠나도 마지막 입력이 남도록 곧바로 저장합니다.
    if (saveTimer) {
      clearTimeout(saveTimer);
      onchange({ config, step, seed, templateId });
    }
  });

  function update(next: any) {
    config = next;
    save();
  }
  const problems = $derived(validateConfig(config));
  const stepProblems = (s: number) => problems.filter((p) => p.step === s && !p.warning);

  async function showFirstProblem(s: number) {
    tried[s] = true;
    tried = [...tried];
    await tick();
    const el = body?.querySelector<HTMLElement>('[aria-invalid="true"], .vt-problem:not(.warning)');
    el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    if (el instanceof HTMLInputElement) el.focus();
  }
  async function go(to: number) {
    step = Math.max(0, Math.min(3, to));
    reached = Math.max(reached, step);
    save(true);
    await tick();
    body?.scrollTo({ top: 0 });
  }
  function next() {
    if (stepProblems(step).length) {
      void showFirstProblem(step);
      return;
    }
    if (step < 3) void go(step + 1);
    else finish();
  }
  function finish() {
    for (let s = 1; s <= 3; s++) {
      if (stepProblems(s).length) {
        void go(s).then(() => showFirstProblem(s));
        return;
      }
    }
    clearTimeout(saveTimer);
    saveTimer = undefined;
    oncreate(config);
  }
  function exit() {
    save(true);
    saveTimer = undefined;
    onexit();
  }
  function chooseType(type: string, fromTemplate?: any) {
    if (fromTemplate) {
      config = fromTemplate.config;
      seed = fromTemplate.seed;
      templateId = fromTemplate.templateId;
      void go(1);
      return;
    }
    templateId = '';
    if (type !== config.type) {
      // 후보 ↔ 의견은 적은 이름을 그대로 옮기고(성별·캐릭터·무늬는 새로), 찬반과는 오갈 수 없으니 새로 시작합니다.
      if (type !== 'yesno' && config.type !== 'yesno') config = normalizeConfig({ ...config, type, items: config.items.map((it: any) => ({ ...it, gender: null, character: null, pattern: null })) }, seed);
      else config = withLast({ ...defaultConfig(type as VoteType), title: config.title });
    }
    void go(1);
  }
</script>

<div class="vt-wizard vt-stage-enter">
  <header class="vt-wizard-head">
    <div class="vt-wizard-topline">
      <div class="vt-wizard-identity"><span>투표 만들기</span><small>{step + 1} / 4단계 · {WIZARD_STEPS[step].label}</small></div>
      <div class="vt-wizard-head-actions">
        {#if step > 0}<button class="vt-btn ghost vt-preview-toggle" aria-expanded={previewOpen} aria-controls="vt-student-preview" onclick={() => (previewOpen = !previewOpen)}><Eye size={18} />학생 화면·안내</button>{/if}
        <button class="vt-btn vt-wizard-exit" title="만들던 내용은 저장되어 홈에서 이어 만들 수 있어요" onclick={exit}><span class="vt-exit-mark" aria-hidden="true"><X size={14} strokeWidth={2.6} /></span>나가기</button>
      </div>
    </div>
    <ol class="vt-steps" aria-label="만들기 단계">
      {#each WIZARD_STEPS as info, i}
        {@const Icon = info.icon}
        <li>
          <button class:current={i === step} class:done={i < step || (i <= reached && i !== step)} disabled={i > reached} aria-current={i === step ? 'step' : undefined} onclick={() => void go(i)}>
            <span class="vt-step-dot">{#if i < step}<Check size={16} />{:else}{i + 1}{/if}</span>
            <span class="vt-step-copy"><b>{info.label}</b><small>{info.hint}</small></span>
            <span class="vt-step-nav-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
          </button>
        </li>
      {/each}
    </ol>
  </header>

  <div class="vt-wizard-body" class:with-preview={step > 0}>
    <div class="vt-wizard-scroll" bind:this={body}>
      {#if step === 0}
        <StepType {config} {prefs} {reduced} onchoose={chooseType} />
      {:else if step === 1}
        <StepContent {config} {seed} {audio} {reduced} showProblems={tried[1]} {problems} onchange={update} />
      {:else if step === 2}
        <StepRules {config} showProblems={tried[2]} {problems} onchange={update} />
      {:else}
        <StepReveal {config} {reduced} onchange={update} />
      {/if}
    </div>
    {#if step > 0}
      <aside id="vt-student-preview" class="vt-wizard-preview" class:open={previewOpen} aria-label="학생 화면 미리보기와 안내 설정">
        <div class="vt-preview-heading"><b><Eye size={18} aria-hidden="true" />학생 화면 미리보기</b><button class="vt-preview-close" aria-label="미리보기 닫기" onclick={() => (previewOpen = false)}><X size={19} /></button></div>
        <BoothPreview {config} />
        <TutorialPanel {config} {speechAvailable} onchange={update} />
      </aside>
    {/if}
  </div>

  <footer class="vt-wizard-foot">
    <button class="vt-btn" disabled={step === 0} onclick={() => void go(step - 1)}><ArrowLeft size={17} />이전</button>
    <span class="vt-wizard-summary">{config.type ? typeLabel(config.type) : ''}{config.title ? ` · ${config.title}` : ''}</span>
    {#if step < 3}
      <button class="vt-btn primary" onclick={next}>다음<ArrowRight size={17} /></button>
    {:else}
      <button class="vt-btn primary big" onclick={next}>투표 준비하기<ArrowRight size={19} /></button>
    {/if}
  </footer>
</div>

<style>
  .vt-wizard {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .vt-wizard-head {
    display: grid;
    gap: 9px;
    padding: 10px 24px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--vt-line) 70%, transparent);
    background: color-mix(in srgb, var(--vt-card) 88%, var(--vt-soft));
  }
  .vt-wizard-topline { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .vt-wizard-identity { display:flex; align-items:baseline; gap:12px; min-width:0; }
  .vt-wizard-identity span { font-size:20px; font-weight:800; white-space:nowrap; }
  .vt-wizard-identity small { color:var(--vt-muted); font-size:14px; font-weight:700; white-space:nowrap; }
  .vt-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .vt-steps li { min-width:0; }
  .vt-steps button {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    min-height: 56px;
    padding: 8px 12px;
    border: 1px solid var(--vt-line);
    border-radius: 14px;
    background: var(--vt-card);
    color: var(--vt-muted);
    text-align: left;
  }
  .vt-steps button:disabled {
    opacity: 0.65;
  }
  .vt-steps button.current {
    border-color: var(--vt-accent);
    background: color-mix(in srgb, var(--vt-card) 80%, var(--vt-soft));
    color: var(--vt-ink);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--vt-accent) 18%, transparent);
  }
  .vt-step-copy { display:grid; gap:1px; min-width:0; }
  .vt-step-copy b { font-size:16px; line-height:1.2; }
  .vt-step-nav-icon { display:grid; place-items:center; flex:none; margin-left:auto; width:31px; height:31px; border-radius:9px; background:color-mix(in srgb,var(--vt-soft) 58%,transparent); color:var(--vt-accent); }
  .vt-step-copy small { overflow:hidden; font-size:12px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .vt-step-dot {
    display: grid;
    place-items: center;
    width: 33px;
    height: 33px;
    flex:none;
    border-radius: 11px;
    background: var(--vt-soft);
    color: var(--vt-ink);
    font-size: 15px;
    font-weight: 900;
  }
  .vt-steps button.current .vt-step-dot {
    background: var(--vt-action);
    color: var(--vt-on-action);
  }
  .vt-steps button.done .vt-step-dot {
    background: color-mix(in srgb, var(--vt-accent) 22%, var(--vt-card));
    color: var(--vt-accent);
  }
  .vt-wizard-head-actions {
    display: flex;
    gap: 6px;
  }
  /* 나가기: 글자만 있으면 눌리는 곳인지 잘 안 보여, 단계 카드와 같은 얇은 테두리 + 작은 X 칩으로 버튼임을 알립니다.
     그림자·강조색은 쓰지 않습니다(작업 흐름의 주인공은 아래 [다음]이라 시선을 뺏지 않게). */
  .vt-wizard-head-actions .vt-wizard-exit {
    min-height: 40px;
    gap: 8px;
    padding: 0 14px 0 6px;
    border-color: var(--vt-line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--vt-card) 70%, transparent);
    color: var(--vt-muted);
    font-size: 15px;
    box-shadow: none;
    transition: border-color var(--vt-quick) var(--vt-ease), background var(--vt-quick) var(--vt-ease), color var(--vt-quick) var(--vt-ease), transform var(--vt-quick) var(--vt-ease);
  }
  .vt-exit-mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: var(--vt-soft);
    color: var(--vt-muted);
    transition: background var(--vt-quick) var(--vt-ease), color var(--vt-quick) var(--vt-ease), transform var(--vt-standard) var(--vt-ease);
  }
  .vt-wizard-head-actions .vt-wizard-exit:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--vt-ink) 22%, var(--vt-line));
    background: var(--vt-card);
    color: var(--vt-ink);
  }
  .vt-wizard-exit:hover .vt-exit-mark {
    background: color-mix(in srgb, var(--vt-ink) 10%, var(--vt-soft));
    color: var(--vt-ink);
    transform: rotate(90deg);
  }
  .vt-wizard-head-actions .vt-wizard-exit:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--vt-accent) 60%, transparent);
    outline-offset: 2px;
  }
  :global(.vt-root.reduced) .vt-exit-mark { transition: none; }
  :global(.vt-root.reduced) .vt-wizard-exit:hover .vt-exit-mark { transform: none; }
  /* 공용 .vt-root .vt-btn(inline-flex)과 우선순위가 같아 CSS 순서에 따라 넓은 창에서도 보였으므로, 한 단계 더 좁혀 씁니다. */
  .vt-wizard-head-actions .vt-preview-toggle {
    display: none;
  }
  .vt-wizard-body {
    display: grid;
    min-height: 0;
  }
  .vt-wizard-body.with-preview {
    grid-template-columns: minmax(0, 1fr) minmax(360px, 34%);
  }
  .vt-wizard-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 16px 22px 20px;
  }
  .vt-wizard-preview {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y:auto;
    padding: 18px;
    border-left: 1px solid color-mix(in srgb, var(--vt-line) 70%, transparent);
    background: color-mix(in srgb, var(--vt-soft) 45%, var(--tk-bg));
  }
  .vt-preview-heading { display:flex; align-items:start; justify-content:space-between; gap:12px; }
  .vt-preview-heading b { display:flex; align-items:center; gap:7px; font-size:17px; }
  .vt-preview-heading b :global(svg) { color:var(--vt-accent); }
  .vt-preview-close { display:none; place-items:center; width:40px; height:40px; flex:none; border:0; border-radius:10px; background:var(--vt-soft); color:var(--vt-ink); }
  /* 좁은 창(1100px 미만)에서는 미리보기를 [미리보기] 버튼으로 여닫습니다(PRD 4절). */
  @container (max-width: 1100px) {
    .vt-steps button { gap:7px; padding:8px 9px; }
    .vt-step-dot { width:29px; height:29px; }
    .vt-step-copy b { font-size:14px; }
    .vt-step-nav-icon { width:24px; height:24px; border-radius:8px; }
    .vt-step-nav-icon :global(svg) { width:18px; height:18px; }
    .vt-wizard-body.with-preview {
      grid-template-columns: 1fr;
    }
    .vt-wizard-head-actions .vt-preview-toggle {
      display: inline-flex;
    }
    .vt-wizard-preview {
      position: absolute;
      top: 68px;
      right: 16px;
      z-index: 10;
      width: min(540px, calc(100% - 32px));
      max-height:calc(100% - 88px);
      display: none;
      border: 1px solid var(--vt-line);
      border-radius: 20px;
      background: var(--vt-card);
      box-shadow: var(--vt-shadow-lift);
    }
    .vt-wizard-preview.open {
      display: flex;
    }
    .vt-preview-close { display:grid; }
  }
  @container (max-width: 760px) {
    .vt-wizard-head { gap:8px; padding:9px 12px 11px; }
    .vt-wizard-identity { display:grid; gap:0; }
    .vt-wizard-identity span { font-size:17px; }
    .vt-wizard-identity small { font-size:12px; }
    .vt-steps { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .vt-steps button { min-height:44px; gap:7px; padding:5px 7px; }
    .vt-step-dot { width:27px; height:27px; border-radius:9px; font-size:13px; }
    .vt-step-copy b { font-size:14px; }
    .vt-step-nav-icon { width:25px; height:25px; border-radius:7px; }
    .vt-step-copy small { display:none; }
    .vt-wizard-head-actions { justify-content:flex-end; }
    .vt-wizard-head-actions .vt-btn { min-height:40px; padding:0 9px; font-size:13px; }
    .vt-wizard-head-actions .vt-wizard-exit { min-height:36px; padding:0 10px 0 5px; gap:6px; }
    .vt-exit-mark { width:24px; height:24px; border-radius:8px; }
    .vt-wizard-scroll { padding:14px 12px 20px; }
    .vt-wizard-summary { display:none; }
  }
  .vt-wizard-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 24px;
    border-top: 1px solid color-mix(in srgb, var(--vt-line) 70%, transparent);
    background: color-mix(in srgb, var(--vt-card) 80%, transparent);
  }
  .vt-wizard-summary {
    max-width: 50%;
    overflow: hidden;
    padding: 8px 12px;
    border: 1px solid var(--vt-line);
    border-radius: 10px;
    background: var(--vt-soft);
    color: var(--vt-ink);
    font-size: 14px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
