<script lang="ts">
  import { tick } from 'svelte';
  import { ArrowRight, Archive, ChevronDown, ClipboardList, Sparkles, Zap, Vote, MessageSquare, Check, Plus, ChevronRight } from 'lucide-svelte';
  import BallotBox from '../art/BallotBox.svelte';
  import Sticker from '../common/Sticker.svelte';
  import ArchivePanel from '../archive/ArchivePanel.svelte';
  import { TEMPLATES, configFromTemplate } from '../../../lib/vote/templates.js';
  import { addItem } from '../../../lib/vote/assign.js';
  import { randomId } from '../../../lib/vote/random.js';
  import { typeLabel, dateLabel } from '../../../lib/vote/model.js';
  import { WIZARD_STEPS } from '../wizard/steps.js';
  let { archive, draft, prefs, fontFamily, design = 0, archiveOpen = $bindable(false), onnew, oncontinue, ondiscard, ontemplate,
    onreplay, onduplicate, ondelete, onupdate, onrunoff, ontoast } = $props<{
    archive: any; draft: any; prefs: any; fontFamily: string; design?: number; archiveOpen?: boolean;
    onnew: () => void; oncontinue: () => void; ondiscard: () => void; ontemplate: (d: any) => void;
    onreplay: (e: any) => void; onduplicate: (e: any) => void; ondelete: (e: any) => void;
    onupdate: (e: any, patch: { title: string; note: string }) => Promise<boolean>;
    onrunoff: (e: any) => void; ontoast: (t: string) => void;
  }>();
  function useTemplate(id: string) {
    const seed = randomId('v');
    const config = configFromTemplate(id, { voters: prefs.lastVoters }, (type) => {
      let items: any[] = [];
      for (let i = 0; i < 3; i++) items = addItem(items, type);
      return items;
    }, () => randomId('a', 6));
    if (config) ontemplate({ config, step: 1, seed, templateId: id });
  }
  const sample = (n: number, color: string, pattern: string | null = null) => ({ number: n, color, pattern, character: null, gender: null });
  const groups = [{ type: 'candidate', label: '사람 뽑기', icon: Vote }, { type: 'opinion', label: '의견 고르기', icon: MessageSquare }, { type: 'yesno', label: '찬성 · 반대', icon: Check }];
  const latest = $derived(archive.entries[0]);
  async function toggleArchive() {
    archiveOpen = !archiveOpen;
    if (archiveOpen) {
      await tick();
      document.getElementById('vt-archive-title')?.closest('section')?.scrollIntoView({ block: 'start' });
    }
  }
</script>

{#snippet procedure()}
  <div class="vt-procedure-title"><span class="vt-procedure-icon" aria-hidden="true"><ClipboardList size={21} /></span><div><span class="vt-procedure-kicker">시작 전, 네 가지만 정해요</span><h1 id="vt-home-title">투표 절차</h1></div></div>
  <ol class="vt-home-steps" aria-label="투표 절차">
    {#each WIZARD_STEPS as step, i}<li><span class="vt-procedure-number">0{i + 1}</span><span class="vt-procedure-copy"><b>{step.label}</b><small>{step.hint}</small></span></li>{/each}
  </ol>
{/snippet}

{#snippet ballotArt()}
  <span class="vt-create-art" aria-hidden="true"><span class="vt-art-disc"></span>
    <span class="s1"><Sticker item={sample(1, 'berry')} type="opinion" size={62} /></span><span class="s2"><Sticker item={sample(2, 'sky', 'dots')} type="opinion" size={56} /></span><span class="s3"><Sticker item={sample(3, 'lemon', 'stars')} type="opinion" size={49} /></span><BallotBox size={195} fill={0.6} />
  </span>
{/snippet}

{#snippet createCard()}
  <button class="vt-home-create" onclick={onnew}>
    <span class="vt-create-top"><span class="vt-create-eyebrow">우리 반의 선택</span><span class="vt-create-tag"><Plus size={13} />직접 만들기</span></span>
    <span class="vt-create-body"><span class="vt-create-copy"><b>새 투표<br class="vt-create-break" /> 만들기</b><small>후보부터 발표 방식까지,<br class="vt-description-break" /> 우리 반에 맞게 준비해요.</small><span class="vt-create-types"><span>사람 뽑기</span><span>의견 고르기</span><span>찬반 투표</span></span></span>{@render ballotArt()}</span>
    <span class="vt-create-bottom"><span>방식 · 내용 · 규칙 · 발표</span><span class="vt-create-cta">새 투표 만들기 <ArrowRight size={20} /></span></span>
  </button>
{/snippet}

{#snippet quickStart()}
  <section class="vt-home-quick" aria-labelledby="vt-quick-title">
    <div class="vt-quick-head"><span class="vt-quick-title"><Zap size={19} aria-hidden="true" /><h2 id="vt-quick-title">빠른 시작</h2></span><p>자주 쓰는 투표를 한 번에 준비해요.</p></div>
    <div class="vt-quick-groups">
      {#each groups as group}<div class="vt-quick-group" data-type={group.type}><h3><group.icon size={15} aria-hidden="true" />{group.label}</h3>
        <div class="vt-quick-group-items">{#each TEMPLATES.filter(t => t.type === group.type) as t (t.id)}<button class="vt-template" onclick={() => useTemplate(t.id)}><span><b>{t.title}</b><small>{t.hint}</small></span><ChevronRight size={17} aria-hidden="true" /></button>{/each}</div>
      </div>{/each}
    </div>
  </section>
{/snippet}

<div class="vt-home vt-stage-enter" data-design={design} class:archive-expanded={archiveOpen}>
  {#if design !== 4}<section class="vt-home-intro" aria-labelledby="vt-home-title">{@render procedure()}</section>{/if}
  {#if draft.config}<div class="vt-home-draft vt-home-panel"><Sparkles size={20} aria-hidden="true" /><span class="vt-draft-copy"><b>만들던 투표가 있어요</b><small>{draft.config.title || typeLabel(draft.config.type)} · {draft.step + 1}단계부터 계속</small></span><button class="vt-btn primary" onclick={oncontinue}>이어 만들기 <ArrowRight size={17} /></button><button class="vt-btn ghost" onclick={ondiscard}>지우기</button></div>{/if}
  {#if design === 4}
    <section class="vt-editorial-panel" aria-label="새 투표 준비">
      <div class="vt-editorial-lead"><div><span class="vt-editorial-eyebrow">우리 반의 생각이 모이는 시간</span><h2>새 투표 만들기</h2><p>함께 정할 일이 있나요? 네 단계로 준비해요.</p></div>{@render ballotArt()}<button class="vt-editorial-cta" onclick={onnew}>새 투표 만들기 <ArrowRight size={22} /></button></div>
      <div class="vt-editorial-procedure">{@render procedure()}</div>
    </section>
    {@render quickStart()}
  {:else}<div class="vt-home-main">{@render createCard()}{@render quickStart()}</div>{/if}
  <section class="vt-home-archive vt-home-panel" aria-labelledby="vt-archive-title"><h2 class="vt-archive-heading"><button class="vt-archive-toggle" aria-expanded={archiveOpen} aria-controls="vt-home-records" onclick={() => void toggleArchive()}><span class="vt-archive-icon" aria-hidden="true"><Archive size={22} /></span><span class="vt-archive-copy"><b id="vt-archive-title">기록함 <span>{archive.entries.length}</span></b><small>{latest ? `최근 투표 · ${latest.config.title} · ${dateLabel(latest.finishedOn, true)}` : '투표를 마치면 결과가 이곳에 차곡차곡 쌓여요.'}</small></span><span class="vt-archive-toggle-label">{archiveOpen ? '접기' : '펼치기'}</span><ChevronDown size={20} class={archiveOpen ? 'vt-rollup-chevron open' : 'vt-rollup-chevron'} aria-hidden="true" /></button></h2>
    {#if archiveOpen}<div id="vt-home-records" class="vt-home-records"><ArchivePanel {archive} {fontFamily} {onreplay} {onduplicate} {ondelete} {onupdate} {onrunoff} {ontoast} /></div>{/if}
  </section>
</div>

<style>
  .vt-home { --home-hero:color-mix(in srgb,var(--vt-card) 70%,var(--vt-soft)); --home-primary:var(--vt-action); --home-hero-ink:var(--vt-ink); --home-hero-muted:var(--vt-muted); --home-hero-line:var(--vt-line); --home-on-primary:var(--vt-on-action); flex:1; min-height:0; width:min(1380px,100%); margin:0 auto; padding:24px 28px; display:flex; flex-direction:column; gap:18px; overflow-y:auto; }
  .vt-home-panel { border:1px solid var(--vt-line); border-radius:18px; background:var(--vt-card); }
  .vt-home-intro,.vt-editorial-procedure { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:25px; padding:22px 25px; }
  .vt-home-intro { margin-top:auto; border:1px solid var(--vt-line); border-radius:16px; background:var(--vt-card); box-shadow:0 2px 0 color-mix(in srgb,var(--vt-line) 40%,transparent); }
  .vt-procedure-title { display:flex; align-items:center; gap:11px; }
  .vt-procedure-icon { display:grid; place-items:center; width:41px; height:45px; border:1px solid var(--vt-line); border-radius:11px; color:var(--vt-muted); }
  .vt-procedure-kicker { color:var(--vt-muted); font-size:11px; font-weight:500; }
  .vt-home h1 { margin:4px 0 0; font-size:20px; line-height:1.3; white-space:nowrap; }
  .vt-home-steps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.28fr); margin:0; padding:0; list-style:none; }
  .vt-home-steps li { display:flex; align-items:center; gap:11px; padding:3px 16px; border-left:1px solid var(--vt-line); }
  .vt-procedure-number { align-self:start; margin-top:1px; color:var(--vt-accent); font-size:23px; font-weight:800; line-height:1.25; font-variant-numeric:tabular-nums; letter-spacing:-.05em; }
  .vt-procedure-copy { display:grid; gap:5px; min-width:0; }
  .vt-procedure-copy b { font-size:15px; white-space:nowrap; }
  .vt-procedure-copy small { color:var(--vt-muted); font-size:11px; font-weight:500; word-break:keep-all; }
  .vt-home-draft { display:flex; align-items:center; gap:12px; padding:12px 18px; color:var(--vt-accent); }
  .vt-draft-copy { display:grid; gap:3px; min-width:0; margin-right:auto; color:var(--vt-ink); }
  .vt-draft-copy b { font-size:15px; }
  .vt-draft-copy small { color:var(--vt-muted); font-size:13px; }
  .vt-home-main { display:grid; grid-template-columns:minmax(0,1.16fr) minmax(0,1fr); gap:20px; align-items:stretch; }
  .vt-home-create { position:relative; display:flex; flex-direction:column; gap:18px; min-width:0; min-height:355px; padding:26px 28px 23px; border:1px solid var(--home-hero-line); border-radius:22px; background:var(--home-hero); color:var(--home-hero-ink); text-align:left; box-shadow:0 8px 24px color-mix(in srgb,var(--vt-ink) 5%,transparent); }
  .vt-home-create:hover { border-color:var(--home-primary); box-shadow:var(--vt-shadow-lift); }
  .vt-create-top { display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .vt-create-eyebrow { font-size:13px; font-weight:700; color:var(--home-hero-muted); }
  .vt-create-tag { display:flex; align-items:center; gap:5px; color:var(--home-hero-muted); font-size:12px; font-weight:600; }
  .vt-create-body { flex:1; display:grid; grid-template-columns:minmax(0,1fr) 210px; align-items:center; gap:8px; }
  .vt-create-copy { display:grid; gap:15px; }
  .vt-create-copy b { font-size:clamp(36px,3.6cqi,49px); line-height:1.13; letter-spacing:-.045em; }
  .vt-create-copy small { font-size:15px; line-height:1.55; color:var(--home-hero-muted); font-weight:500; }
  .vt-create-types { display:flex; flex-wrap:wrap; gap:6px; margin-top:2px; }
  .vt-create-types > span { padding:4px 7px; border:1px solid color-mix(in srgb,var(--home-hero-line) 80%,transparent); border-radius:5px; color:var(--home-hero-muted); font-size:10px; font-weight:500; }
  .vt-create-art { position:relative; display:grid; place-items:center; min-height:230px; isolation:isolate; }
  .vt-create-art > span { position:absolute; }
  .vt-art-disc { z-index:-1; width:200px; height:200px; border-radius:50%; background:color-mix(in srgb,var(--vt-card) 45%,transparent); }
  .vt-create-art .s1 { left:0; top:3%; transform:rotate(-12deg); }
  .vt-create-art .s2 { right:0; top:0; transform:rotate(10deg); }
  .vt-create-art .s3 { right:5%; top:43%; transform:rotate(-6deg); }
  .vt-create-bottom { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-top:19px; border-top:1px solid var(--home-hero-line); }
  .vt-create-bottom > span:first-child { font-size:11px; font-weight:500; color:var(--home-hero-muted); word-break:keep-all; }
  .vt-create-cta { display:flex; align-items:center; justify-content:center; gap:22px; padding:14px 19px; border-radius:11px; background:var(--home-primary); color:var(--home-on-primary); font-size:15px; font-weight:800; white-space:nowrap; }
  .vt-home-quick { padding:22px; min-width:0; border:1px solid var(--vt-line); border-radius:20px; background:var(--vt-card); }
  .vt-quick-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:5px 12px; padding-bottom:16px; }
  .vt-quick-title { display:flex; align-items:center; gap:7px; color:var(--vt-muted); }
  .vt-quick-head h2 { margin:0; font-size:19px; color:var(--vt-ink); }
  .vt-quick-head p { margin:0; font-size:11px; line-height:1.5; color:var(--vt-muted); font-weight:500; }
  .vt-quick-groups { display:grid; gap:16px; }
  .vt-quick-group { --kind-color:var(--vt-muted); }
  .vt-quick-group[data-type='candidate'] { --kind-color:#a74d6c; }
  .vt-quick-group[data-type='opinion'] { --kind-color:#287465; }
  .vt-quick-group[data-type='yesno'] { --kind-color:#39688e; }
  .vt-quick-group h3 { display:flex; align-items:center; gap:6px; margin:0 0 5px; color:var(--kind-color); font-size:11px; font-weight:700; }
  .vt-quick-group-items { display:grid; }
  .vt-template { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; min-height:39px; padding:8px 4px; border:0; border-bottom:1px solid color-mix(in srgb,var(--vt-line) 70%,transparent); border-radius:4px; background:transparent; color:var(--vt-ink); text-align:left; }
  .vt-template:hover { background:var(--vt-soft); }
  .vt-template > span { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 9px; }
  .vt-template b { font-size:14px; font-weight:700; }
  .vt-template small { font-size:11px; color:var(--vt-muted); font-weight:500; }
  .vt-template :global(svg) { flex:none; color:var(--vt-muted); opacity:.7; }
  .vt-home-archive { margin-bottom:auto; }
  .vt-archive-heading { margin:0; }
  .vt-archive-toggle { display:flex; align-items:center; gap:13px; width:100%; min-height:78px; padding:15px 21px; border:0; border-radius:18px; background:transparent; color:var(--vt-ink); text-align:left; }
  .vt-archive-toggle:hover { background:color-mix(in srgb,var(--vt-soft) 45%,transparent); }
  .vt-archive-icon { display:grid; place-items:center; flex:none; width:42px; height:42px; border-radius:11px; background:var(--vt-soft); color:var(--vt-accent); }
  .vt-archive-copy { display:grid; gap:5px; min-width:0; margin-right:auto; }
  .vt-archive-copy b { display:flex; align-items:center; gap:9px; font-size:18px; }
  .vt-archive-copy b > span { min-width:22px; padding:2px 6px; border-radius:6px; background:var(--vt-soft); color:var(--vt-accent); font-size:11px; text-align:center; }
  .vt-archive-copy small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:500; color:var(--vt-muted); }
  .vt-archive-toggle-label { flex:none; color:var(--vt-muted); font-size:12px; font-weight:500; }
  :global(.vt-rollup-chevron) { flex:none; color:var(--vt-muted); }
  :global(.vt-rollup-chevron.open) { transform:rotate(180deg); }
  .vt-home-records { border-top:1px solid var(--vt-line); }
  .archive-expanded .vt-home-intro { margin-top:0; }
  .vt-home[data-design='1'] { --home-hero:#e4ece6; --home-primary:#2e5545; --home-hero-ink:#233d32; --home-hero-muted:#53665b; --home-hero-line:#c7d4cb; --home-on-primary:#fff; }
  .vt-home[data-design='1'] .vt-home-create { border-radius:24px; }
  .vt-home[data-design='1'] .vt-create-cta { border-radius:10px; box-shadow:0 4px 9px #24493817; }
  .vt-home[data-design='2'] .vt-home-main { grid-template-columns:1fr; gap:17px; }
  .vt-home[data-design='2'] .vt-home-create { min-height:200px; display:grid; grid-template-columns:minmax(0,1fr) auto; padding:24px 30px; gap:12px 28px; border-left:5px solid var(--vt-action); border-radius:15px; background:var(--vt-card); }
  .vt-home[data-design='2'] .vt-create-top { grid-column:1; justify-content:start; gap:15px; }
  .vt-home[data-design='2'] .vt-create-body { grid-column:1; grid-row:2; grid-template-columns:minmax(0,1fr) 140px; }
  .vt-home[data-design='2'] .vt-create-break { display:none; }
  .vt-home[data-design='2'] .vt-create-copy { gap:11px; }
  .vt-home[data-design='2'] .vt-create-copy b { font-size:37px; }
  .vt-home[data-design='2'] .vt-description-break { display:none; }
  .vt-home[data-design='2'] .vt-create-art { height:125px; min-height:125px; transform:scale(.62); }
  .vt-home[data-design='2'] .vt-create-bottom { grid-column:2; grid-row:1 / span 2; flex-direction:column; justify-content:center; border:0; padding:0 0 0 28px; border-left:1px solid var(--vt-line); }
  .vt-home[data-design='2'] .vt-create-bottom > span:first-child { order:1; }
  .vt-home[data-design='2'] .vt-create-cta { padding:18px 22px; }
  .vt-home[data-design='2'] .vt-home-quick { padding:17px 23px; border-radius:15px; }
  .vt-home[data-design='2'] .vt-quick-groups { grid-template-columns:repeat(3,minmax(0,1fr)); gap:23px; }
  .vt-home[data-design='2'] .vt-template { min-height:48px; }
  .vt-home[data-design='2'] .vt-template > span { display:grid; gap:3px; }
  .vt-home[data-design='3'] { --home-hero:#2e353d; --home-primary:#eef1ee; --home-hero-ink:#fff; --home-hero-muted:#c5cdd0; --home-hero-line:#535f67; --home-on-primary:#283039; }
  .vt-home[data-design='3'] .vt-home-main { grid-template-columns:minmax(0,.86fr) minmax(0,1.4fr); }
  .vt-home[data-design='3'] .vt-home-create { padding:24px; border:0; border-radius:18px; min-height:390px; }
  .vt-home[data-design='3'] .vt-create-body { position:relative; display:block; }
  .vt-home[data-design='3'] .vt-create-copy { position:relative; z-index:1; gap:13px; }
  .vt-home[data-design='3'] .vt-create-copy b { font-size:42px; }
  .vt-home[data-design='3'] .vt-create-types { display:none; }
  .vt-home[data-design='3'] .vt-create-art { position:absolute; right:-13px; bottom:-36px; width:190px; min-height:220px; transform:scale(.7); transform-origin:right bottom; }
  .vt-home[data-design='3'] .vt-art-disc { background:#687d7940; }
  .vt-home[data-design='3'] .vt-create-bottom { border:0; padding-top:16px; }
  .vt-home[data-design='3'] .vt-create-bottom > span:first-child { display:none; }
  .vt-home[data-design='3'] .vt-create-cta { width:100%; justify-content:space-between; }
  .vt-home[data-design='3'] .vt-home-quick { border:0; background:transparent; padding:15px 4px; }
  .vt-home[data-design='3'] .vt-quick-head { padding-bottom:23px; }
  .vt-home[data-design='3'] .vt-quick-groups { gap:19px; }
  .vt-home[data-design='3'] .vt-quick-group { display:grid; grid-template-columns:95px minmax(0,1fr); gap:15px; align-items:start; }
  .vt-home[data-design='3'] .vt-quick-group h3 { padding-top:13px; }
  .vt-home[data-design='3'] .vt-quick-group-items { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .vt-home[data-design='3'] .vt-template { min-height:64px; padding:11px 13px; border:1px solid var(--vt-line); border-radius:10px; background:var(--vt-card); }
  .vt-home[data-design='3'] .vt-template > span { display:grid; gap:5px; }
  .vt-home[data-design='4'] { gap:0; }
  .vt-editorial-panel { margin-top:auto; border:1px solid var(--vt-line); border-radius:20px 20px 0 0; background:var(--vt-card); }
  .vt-editorial-lead { display:grid; grid-template-columns:minmax(0,1fr) 170px auto; align-items:center; gap:22px; padding:26px 30px 21px; }
  .vt-editorial-eyebrow { color:var(--vt-muted); font-size:13px; }
  .vt-editorial-lead h2 { margin:10px 0; font-size:clamp(35px,3.8cqi,49px); line-height:1.2; letter-spacing:-.04em; }
  .vt-editorial-lead p { margin:0; color:var(--vt-muted); font-size:15px; }
  .vt-editorial-lead .vt-create-art { height:150px; min-height:150px; transform:scale(.72); }
  .vt-editorial-cta { display:flex; align-items:center; gap:27px; padding:20px; border:0; border-radius:12px; background:var(--vt-action); color:var(--vt-on-action); font-size:16px; font-weight:800; white-space:nowrap; }
  .vt-editorial-procedure { grid-template-columns:1fr; gap:17px; padding:18px 30px 20px; border-top:1px solid var(--vt-line); }
  .vt-editorial-procedure .vt-procedure-title { gap:8px; }
  .vt-editorial-procedure .vt-procedure-icon { width:auto; height:auto; border:0; }
  .vt-editorial-procedure .vt-procedure-kicker { display:none; }
  .vt-editorial-procedure h1 { margin:0; font-size:14px; color:var(--vt-muted); }
  .vt-editorial-procedure .vt-home-steps { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .vt-editorial-procedure .vt-home-steps li { padding:4px 18px; }
  .vt-editorial-procedure .vt-home-steps li:first-child { border:0; padding-left:0; }
  .vt-home[data-design='4'] > .vt-home-quick { border-top:0; border-radius:0 0 20px 20px; padding:23px 30px; }
  .vt-home[data-design='4'] .vt-quick-groups { grid-template-columns:repeat(3,minmax(0,1fr)); gap:25px; }
  .vt-home[data-design='4'] .vt-template { padding:10px 4px; }
  .vt-home[data-design='4'] .vt-template > span { display:grid; gap:3px; }
  .vt-home[data-design='4'] .vt-home-archive { margin-top:18px; }
  .vt-home[data-design='4'].archive-expanded .vt-editorial-panel { margin-top:0; }
  .vt-home[data-design='5'] .vt-home-intro { padding:16px 23px; }
  .vt-home[data-design='5'] .vt-procedure-kicker,.vt-home[data-design='5'] .vt-procedure-copy small { display:none; }
  .vt-home[data-design='5'] .vt-home-main { grid-template-columns:1fr; gap:16px; }
  .vt-home[data-design='5'] .vt-home-create { min-height:126px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:0 20px; padding:20px 25px; border-radius:15px; border:2px solid color-mix(in srgb,var(--vt-action) 45%,var(--vt-line)); background:var(--vt-card); }
  .vt-home[data-design='5'] .vt-create-top,.vt-home[data-design='5'] .vt-create-types { display:none; }
  .vt-home[data-design='5'] .vt-create-body { display:flex; flex-direction:row-reverse; justify-content:end; gap:20px; }
  .vt-home[data-design='5'] .vt-create-copy { flex:1; gap:8px; }
  .vt-home[data-design='5'] .vt-create-copy b { font-size:29px; }
  .vt-home[data-design='5'] .vt-create-break,.vt-home[data-design='5'] .vt-description-break { display:none; }
  .vt-home[data-design='5'] .vt-create-copy small { font-size:13px; }
  .vt-home[data-design='5'] .vt-create-art { width:100px; height:95px; min-height:95px; transform:scale(.45); transform-origin:center; margin-right:8px; }
  .vt-home[data-design='5'] .vt-create-bottom { border:0; padding:0; }
  .vt-home[data-design='5'] .vt-create-bottom > span:first-child { display:none; }
  .vt-home[data-design='5'] .vt-create-cta { padding:16px 20px; border-radius:10px; }
  .vt-home[data-design='5'] .vt-home-quick { border:0; padding:10px 0 2px; background:transparent; }
  .vt-home[data-design='5'] .vt-quick-head { padding:0 2px 15px; }
  .vt-home[data-design='5'] .vt-quick-groups { grid-template-columns:1.4fr 1fr 1fr; gap:16px; }
  .vt-home[data-design='5'] .vt-quick-group-items { gap:8px; }
  .vt-home[data-design='5'] .vt-template { padding:14px; min-height:65px; background:var(--vt-card); border:1px solid var(--vt-line); border-radius:10px; }
  .vt-home[data-design='5'] .vt-template > span { display:grid; gap:4px; }
  :global(.vt-root[data-scheme='dark']) .vt-home[data-design='1'] { --home-hero:#293c34; --home-primary:#bdd0c4; --home-hero-ink:#f0f6f1; --home-hero-muted:#bdcfc3; --home-hero-line:#4a6256; --home-on-primary:#24372d; }
  :global(.vt-root[data-scheme='dark']) .vt-quick-group { --kind-color:var(--vt-muted); }
  @container (max-width:1120px) {
    .vt-home { padding:20px; gap:16px; }
    .vt-home-intro { gap:18px; padding:19px; }
    .vt-home-steps li { padding:4px 10px; gap:8px; }
    .vt-procedure-copy b { font-size:14px; }
    .vt-procedure-copy small { font-size:11px; }
    .vt-home-create { padding:22px; }
    .vt-create-body { grid-template-columns:minmax(0,1fr) 170px; }
    .vt-create-art { transform:scale(.85); }
    .vt-create-copy b { font-size:37px; }
    .vt-home-quick { padding:19px; }
    .vt-quick-head { display:block; }
    .vt-quick-head p { margin-top:6px; }
    .vt-home[data-design='3'] .vt-quick-group { grid-template-columns:1fr; gap:4px; }
    .vt-home[data-design='3'] .vt-quick-group h3 { padding-top:0; }
    .vt-editorial-lead { grid-template-columns:minmax(0,1fr) 120px auto; gap:16px; }
    .vt-editorial-lead .vt-create-art { transform:scale(.6); }
  }
  @container (max-width:900px) {
    .vt-home-intro { grid-template-columns:1fr; gap:16px; }
    .vt-home-steps li:first-child { border-left:0; padding-left:0; }
    .vt-home-main,.vt-home[data-design='3'] .vt-home-main { grid-template-columns:1fr; }
    .vt-home-create { min-height:305px; }
    .vt-create-body { grid-template-columns:minmax(0,1fr) 220px; }
    .vt-create-copy b { font-size:36px; }
    .vt-create-art { transform:none; }
    .vt-home[data-design='3'] .vt-home-create { min-height:330px; }
    .vt-home[data-design='3'] .vt-create-art { right:15px; bottom:-45px; transform:scale(.8); }
    .vt-home[data-design='2'] .vt-home-create { grid-template-columns:1fr; }
    .vt-home[data-design='2'] .vt-create-bottom { grid-row:3; grid-column:1; flex-direction:row; justify-content:space-between; border-left:0; border-top:1px solid var(--vt-line); padding:15px 0 0; }
    .vt-home[data-design='2'] .vt-create-bottom > span:first-child { order:0; }
    .vt-home[data-design='2'] .vt-quick-groups,.vt-home[data-design='4'] .vt-quick-groups,.vt-home[data-design='5'] .vt-quick-groups { gap:14px; }
    .vt-editorial-lead { grid-template-columns:minmax(0,1fr) auto; }
    .vt-editorial-lead .vt-create-art { display:none; }
    .vt-editorial-cta { padding:16px; gap:13px; }
  }
  @container (max-width:660px) {
    .vt-home { padding:14px; }
    .vt-home-steps,.vt-editorial-procedure .vt-home-steps { grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 0; }
    .vt-home-steps li:nth-child(3) { border-left:0; padding-left:0; }
    .vt-procedure-copy b { white-space:normal; }
    .vt-home-draft { flex-wrap:wrap; }
    .vt-create-body { grid-template-columns:minmax(0,1fr) 140px; }
    .vt-create-art { transform:scale(.7); transform-origin:center; }
    .vt-create-copy b { font-size:32px; }
    .vt-create-types { display:none; }
    .vt-create-bottom { align-items:start; flex-direction:column; }
    .vt-create-cta { width:100%; }
    .vt-home[data-design='2'] .vt-quick-groups,.vt-home[data-design='4'] .vt-quick-groups,.vt-home[data-design='5'] .vt-quick-groups { grid-template-columns:1fr; }
    .vt-home[data-design='2'] .vt-create-copy b { font-size:29px; }
    .vt-home[data-design='2'] .vt-create-body { grid-template-columns:minmax(0,1fr) 70px; }
    .vt-home[data-design='2'] .vt-create-art { transform:scale(.45); }
    .vt-home[data-design='2'] .vt-create-bottom { align-items:center; }
    .vt-home[data-design='2'] .vt-create-bottom > span:first-child { display:none; }
    .vt-home[data-design='3'] .vt-quick-group-items { grid-template-columns:1fr; }
    .vt-editorial-lead { grid-template-columns:1fr; gap:20px; padding:24px; }
    .vt-editorial-lead h2 { font-size:33px; }
    .vt-editorial-cta { justify-content:space-between; }
    .vt-editorial-procedure { padding:20px 24px; }
    .vt-home[data-design='4'] > .vt-home-quick { padding:22px 24px; }
    .vt-home[data-design='5'] .vt-home-create { grid-template-columns:1fr; gap:14px; padding:18px; }
    .vt-home[data-design='5'] .vt-create-art { display:none; }
    .vt-home[data-design='5'] .vt-create-copy b { font-size:27px; }
    .vt-home[data-design='5'] .vt-create-bottom { align-items:stretch; }
    .vt-archive-toggle { padding:14px; gap:10px; }
    .vt-archive-toggle-label { display:none; }
  }
</style>
