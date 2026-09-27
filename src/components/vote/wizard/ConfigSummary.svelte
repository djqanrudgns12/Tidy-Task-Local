<script lang="ts">
  import { ClipboardCheck, Vote, Megaphone, Presentation } from 'lucide-svelte';
  import { typeLabel, itemNoun, modeName } from '../../../lib/vote/model.js';
  let { config, speechAvailable } = $props<{ config: any; speechAvailable: boolean }>();
  const yesno = $derived(config.type === 'yesno');
  const unit = $derived(config.type === 'opinion' ? '개' : '명');
  const visibility: Record<string, string> = { all: '모두 공개', rank: '순위만', winner: '당선자만', result: '결과만' };
  const passRule: Record<string, string> = { yesOverNo: '찬성 > 반대', majority: '참여자 과반', twoThirds: '3분의 2 이상', none: '판정 없음' };
  const groups = $derived([
    { label: '참여', icon: Vote, tags: [
      `투표 ${config.rules.voters}명`,
      yesno ? passRule[config.rules.passRule] : `1인 ${config.rules.votesPerVoter}표`,
      ...(!yesno && config.rules.votesPerVoter > 1 ? [config.rules.allowRepeat ? '몰아주기 가능' : '중복 선택 없음'] : []),
      ...(!yesno ? [`${config.type === 'opinion' ? '선정' : '당선'} ${config.rules.seats}${unit}`] : []),
      config.rules.allowAbstain ? '기권 가능' : '기권 없음',
      '다시 투표하기 · 다음 친구 전까지',
    ] },
    { label: '개표', icon: Megaphone, tags: [modeName(config.reveal.mode, yesno), visibility[config.reveal.visibility]] },
    { label: '안내', icon: Presentation, tags: config.tutorial.enabled
      ? ['슬라이드 켬', config.tutorial.speed === 'slow' ? '느리게' : '보통', config.tutorial.speech && speechAvailable ? '음성 켬' : '음성 끔']
      : ['슬라이드 끔'] },
  ]);
</script>

<section class="vt-config-summary" aria-label="현재 투표 설정 요약">
  <div class="vt-config-summary-head"><h2><ClipboardCheck size={18} aria-hidden="true" />투표 설정</h2><span>{typeLabel(config.type)} · {yesno ? `안건 ${config.agendas.length}개` : `${itemNoun(config.type)} ${config.items.length}${unit}`}</span></div>
  {#each groups as group}
    {@const Icon = group.icon}
    <div class="vt-config-group">
      <h3><Icon size={15} aria-hidden="true" />{group.label}</h3>
      <ul>{#each group.tags as tag}<li>{tag}</li>{/each}</ul>
    </div>
  {/each}
</section>

<style>
  .vt-config-summary { display:grid; flex:none; gap:8px; padding:13px 14px; border:1px solid var(--vt-line); border-radius:16px; background:color-mix(in srgb,var(--vt-card) 90%,var(--vt-soft)); }
  .vt-config-summary-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; }
  .vt-config-summary-head h2 { display:flex; align-items:center; gap:7px; margin:0; font-size:16px; }
  .vt-config-summary-head h2 :global(svg) { color:var(--vt-accent); }
  .vt-config-summary-head > span { padding:3px 7px; border-radius:7px; background:var(--vt-soft); color:var(--vt-accent); font-size:12px; font-weight:800; }
  .vt-config-group { display:grid; grid-template-columns:45px minmax(0,1fr); align-items:baseline; gap:8px; }
  .vt-config-group h3 { display:flex; align-items:center; gap:4px; margin:0; color:var(--vt-muted); font-size:12px; font-weight:700; white-space:nowrap; }
  .vt-config-group h3 :global(svg) { align-self:center; flex:none; }
  .vt-config-group ul { display:flex; flex-wrap:wrap; gap:5px; margin:0; padding:0; list-style:none; }
  .vt-config-group li { padding:4px 7px; border:1px solid color-mix(in srgb,var(--vt-line) 75%,transparent); border-radius:7px; background:var(--vt-card); color:var(--vt-ink); font-size:12px; font-weight:700; line-height:1.4; }
</style>
