<script lang="ts">
  // ① 방식(PRD 4절): 후보 · 의견 · 찬반 카드 + 빠른 시작 틀 한 줄.
  import Sticker from '../common/Sticker.svelte';
  import Stamp from '../art/Stamp.svelte';
  import { ArrowRight, Zap } from 'lucide-svelte';
  import StepHeading from './StepHeading.svelte';
  import { TEMPLATES, configFromTemplate } from '../../../lib/vote/templates.js';
  import { addItem } from '../../../lib/vote/assign.js';
  import { randomId } from '../../../lib/vote/random.js';
  let { config, prefs, reduced, onchoose } = $props<{ config: any; prefs: any; reduced: boolean; onchoose: (type: string, fromTemplate?: any) => void }>();
  const TYPES = [
    { id: 'candidate', title: '후보 투표', say: '사람을 뽑아요', use: '회장 · 부회장 · 도우미' },
    { id: 'opinion', title: '의견 투표', say: '하나를 골라요', use: '장소 · 메뉴 · 이름 정하기' },
    { id: 'yesno', title: '찬반 투표', say: '찬성? 반대?', use: '규칙 · 학급회의 안건' },
  ];
  const s = (n: number, color: string, pattern: string | null = null) => ({ number: n, color, pattern, character: null, gender: null });
  function useTemplate(id: string) {
    const seed = randomId('v');
    const c = configFromTemplate(id, { voters: prefs.lastVoters }, (type) => {
      let items: any[] = [];
      for (let i = 0; i < 3; i++) items = addItem(items, type);
      return items;
    }, () => randomId('a', 6));
    if (c) onchoose(c.type, { config: c, seed, templateId: id });
  }
</script>

<section class="vt-step">
  <StepHeading step={0} title="무엇을 투표할까요?" lead="가장 가까운 방식을 고르면 다음 단계로 넘어가요." />
  <div class="vt-type-grid">
    {#each TYPES as t (t.id)}
      <button class="vt-type vt-card" data-type={t.id} class:current={config.type === t.id} onclick={() => onchoose(t.id)}>
        <span class="vt-type-category">{t.id === 'candidate' ? '사람 뽑기' : t.id === 'opinion' ? '의견 고르기' : '찬성 · 반대'}</span>
        <span class="vt-type-art" aria-hidden="true">
          {#if t.id === 'candidate'}
            <span class="a"><Sticker item={s(1, 'berry')} type="candidate" size={70} /></span>
            <span class="b"><Sticker item={s(2, 'sky')} type="candidate" size={60} /></span>
          {:else if t.id === 'opinion'}
            <span class="a"><Sticker item={s(1, 'mint', 'dots')} type="opinion" size={66} /></span>
            <span class="b"><Sticker item={s(2, 'lilac', 'hearts')} type="opinion" size={58} /></span>
          {:else}
            <span class="a"><Stamp text="O" round size={72} color="#1F6E57" tilt={-8} /></span>
            <span class="b"><Stamp text="X" round size={60} color="#96491A" tilt={8} /></span>
          {/if}
        </span>
        <b>{t.title}</b>
        <span class="vt-type-say">{t.say}</span>
        <small>예: {t.use}</small>
        <span class="vt-type-go">이 방식으로 만들기 <ArrowRight size={16} /></span>
      </button>
    {/each}
  </div>

  <div class="vt-step-panel vt-type-shortcuts">
    <div class="vt-type-shortcuts-head"><h2><Zap size={18} aria-hidden="true" />빠른 시작</h2><p>클릭하면 기본 규칙을 자동으로 설정해요</p></div>
    <div class="vt-template-row">
      {#each TEMPLATES as t (t.id)}
        <button class="vt-chip" onclick={() => useTemplate(t.id)} title={t.hint}>{t.title}<ArrowRight size={15} /></button>
      {/each}
    </div>
  </div>
</section>

<style>
  .vt-step {
    width: min(980px, 100%);
    margin: 0 auto;
    display:grid;
    gap:12px;
  }
  .vt-type-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  @container (max-width: 820px) {
    .vt-type-grid {
      grid-template-columns: 1fr;
    }
  }
  .vt-type {
    --type-wash:#f5f6f1;
    --type-line:var(--vt-line);
    display: grid;
    justify-items: center;
    gap: 7px;
    min-height:246px;
    padding: 16px 18px 14px;
    border-radius: 18px;
    color: var(--vt-ink);
    text-align: center;
    white-space: normal !important;
    background:color-mix(in srgb,var(--vt-card) 72%,var(--type-wash));
    border-color:var(--type-line);
    transition: transform var(--vt-standard) var(--vt-ease), box-shadow var(--vt-standard) var(--vt-ease), border-color var(--vt-quick);
  }
  .vt-type[data-type='candidate'] { --type-wash:#fff0f2; --type-line:#e9c9d2; }
  .vt-type[data-type='opinion'] { --type-wash:#e9f7f4; --type-line:#bee4d8; }
  .vt-type[data-type='yesno'] { --type-wash:#edf3fc; --type-line:#c9d9ee; }
  .vt-type-category { justify-self:start; padding:4px 9px; border-radius:8px; background:var(--vt-card); color:var(--vt-accent); font-size:13px; font-weight:800; }
  .vt-type:hover {
    transform: translateY(-3px);
    box-shadow: var(--vt-shadow-lift);
  }
  .vt-type.current {
    border-color:var(--vt-accent);
    box-shadow:0 0 0 2px color-mix(in srgb,var(--vt-accent) 16%,transparent),var(--vt-shadow);
  }
  .vt-type-art {
    position: relative;
    width: 150px;
    height: 94px;
  }
  .vt-type-art .a {
    position: absolute;
    left: 14px;
    top: 10px;
    transform: rotate(-8deg);
    transition: transform var(--vt-slow) var(--vt-ease-pop);
  }
  .vt-type-art .b {
    position: absolute;
    right: 10px;
    bottom: 4px;
    transform: rotate(9deg);
    transition: transform var(--vt-slow) var(--vt-ease-pop);
  }
  .vt-type:hover .vt-type-art .a {
    transform: rotate(-12deg) translateY(-4px);
  }
  .vt-type:hover .vt-type-art .b {
    transform: rotate(13deg) translateY(-3px);
  }
  .vt-type b {
    font-size: 22px;
  }
  .vt-type-say {
    font-size: 16px;
    font-weight: 800;
    color: var(--vt-accent);
  }
  .vt-type small {
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 600;
  }
  .vt-type-go { display:inline-flex; align-items:center; gap:5px; margin-top:9px; color:var(--vt-accent); font-size:14px; font-weight:800; }
  .vt-type-shortcuts-head { display:flex; align-items:center; flex-wrap:wrap; gap:6px 14px; margin-bottom:10px; }
  .vt-type-shortcuts h2 { display:flex; align-items:center; gap:7px; margin:0; font-size:17px; }
  .vt-type-shortcuts p { margin:0; color:var(--vt-muted); font-size:14px; font-weight:600; }
  .vt-template-row {
    display:grid;
    grid-template-columns:repeat(auto-fill,minmax(185px,1fr));
    gap:8px;
  }
  .vt-template-row .vt-chip { justify-content:space-between; height:auto; min-height:46px; border-radius:12px; text-align:left; white-space:normal; }
</style>
