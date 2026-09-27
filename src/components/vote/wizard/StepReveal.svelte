<script lang="ts">
  // ④ 개표 방식·안내: 공개 범위와 개표 장면, 학생 안내를 설정합니다.
  import { Eye, Clapperboard, Presentation } from 'lucide-svelte';
  import StepHeading from './StepHeading.svelte';
  import ToolkitSwitch from '../../toolkit/ToolkitSwitch.svelte';
  import ModeArt from '../art/ModeArt.svelte';
  import { MODES, VISIBILITIES, availableModes, modeBlockedReason, modeName } from '../../../lib/vote/model.js';
  import type { VoteType } from '../../../lib/vote/model.js';
  let { config, speechAvailable, reduced, onchange } = $props<{ config: any; speechAvailable: boolean; reduced: boolean; onchange: (c: any) => void }>();
  const yesno = $derived(config.type === 'yesno');
  const VIS: Record<string, { title: string; say: string }> = {
    all: { title: '모두 공개', say: '득표수 · 비율' },
    rank: { title: '순위만', say: '득표수·비율 숨김' },
    winner: { title: '당선자만', say: '전체 득표는 선생님만' },
    result: { title: '결과만', say: '통과 · 부결' },
  };
  const MODE_INFO = $derived<Record<string, { title: string; say: string }>>({
    instant: { title: modeName('instant'), say: '결과를 한 번에' },
    paper: { title: modeName('paper'), say: '투표용지 · 正 집계' },
    race: { title: modeName('race', yesno), say: yesno ? '찬성·반대 줄다리기' : '캐릭터가 표마다 전진' },
    broadcast: { title: modeName('broadcast'), say: yesno ? '개표율 · 찬반 현황' : '개표율 · 당선 확실' },
    reverse: { title: modeName('reverse'), say: '낮은 순위부터 공개' },
    pick: { title: modeName('pick'), say: '고른 카드부터 공개' },
  });
  const modes = $derived(yesno ? MODES.filter((m) => m !== 'reverse' && m !== 'pick') : MODES);
  const allowed = $derived(availableModes(config.type, config.reveal.visibility));
  function setVisibility(v: string) {
    const ok = availableModes(config.type, v);
    onchange({ ...config, reveal: { visibility: v, mode: ok.includes(config.reveal.mode) ? config.reveal.mode : ok.includes('reverse') ? 'reverse' : 'instant' } });
  }
  const setMode = (m: string) => onchange({ ...config, reveal: { ...config.reveal, mode: m } });
  const setTutorial = (patch: Record<string, unknown>) => onchange({ ...config, tutorial: { ...config.tutorial, ...patch } });
</script>

<section class="vt-step">
  <StepHeading step={3} title="결과는 어떻게 발표할까요?" />

  <div class="vt-step-panel vt-reveal-section">
    <div class="vt-reveal-heading"><h2><Eye size={19} aria-hidden="true" />공개 범위</h2></div>
    <div class="vt-vis-grid" style:--vis-columns={VISIBILITIES[config.type as VoteType].length} role="radiogroup" aria-label="공개 범위">
      {#each VISIBILITIES[config.type as VoteType] as v}
        <button class="vt-vis vt-card" role="radio" aria-checked={config.reveal.visibility === v} onclick={() => setVisibility(v)}>
          <b>{VIS[v].title}</b><small>{VIS[v].say}</small>
        </button>
      {/each}
    </div>
  </div>

  <div class="vt-step-panel vt-reveal-section">
    <div class="vt-reveal-heading"><h2><Clapperboard size={19} aria-hidden="true" />개표 방법</h2></div>
    <div class="vt-mode-grid" style:--mode-columns={yesno ? 2 : 3} role="radiogroup" aria-label="개표 방법">
      {#each modes as m}
        {@const blocked = !allowed.includes(m)}
        <button class="vt-mode vt-card" role="radio" aria-checked={config.reveal.mode === m} aria-disabled={blocked} disabled={blocked}
          title={blocked ? modeBlockedReason(config.type, config.reveal.visibility, m) : MODE_INFO[m].say}
          aria-label={blocked ? `${MODE_INFO[m].title}: ${modeBlockedReason(config.type, config.reveal.visibility, m)}` : undefined} onclick={() => setMode(m)}>
          <ModeArt mode={m} {yesno} size={42} />
          <span><b>{MODE_INFO[m].title}</b><small>{blocked ? '공개 범위 제한' : MODE_INFO[m].say}</small></span>
        </button>
      {/each}
    </div>
  </div>

  <div class="vt-step-panel vt-reveal-section">
    <div class="vt-reveal-heading"><h2><Presentation size={19} aria-hidden="true" />학생 안내</h2></div>
    <div class="vt-tut">
    <div class="vt-tut-row">
      <span><b>안내 슬라이드</b></span>
      <ToolkitSwitch checked={config.tutorial.enabled} label="안내 슬라이드" onchange={(v) => setTutorial({ enabled: v })} />
    </div>
    {#if config.tutorial.enabled}
      <div class="vt-tut-row">
        <span><b>넘기는 속도</b></span>
        <div class="vt-chips" role="radiogroup" aria-label="넘기는 속도">
          <button class="vt-chip" role="radio" aria-checked={config.tutorial.speed === 'slow'} onclick={() => setTutorial({ speed: 'slow' })}>느리게</button>
          <button class="vt-chip" role="radio" aria-checked={config.tutorial.speed === 'normal'} onclick={() => setTutorial({ speed: 'normal' })}>보통</button>
        </div>
      </div>
      <div class="vt-tut-row">
        <span><b>음성으로 읽어 주기</b>{#if !speechAvailable}<small>한국어 음성 없음</small>{/if}</span>
        <ToolkitSwitch checked={config.tutorial.speech && speechAvailable} disabled={!speechAvailable} label="음성으로 읽어 주기" onchange={(v) => setTutorial({ speech: v })} />
      </div>
    {/if}
    </div>
  </div>

</section>

<style>
  .vt-step {
    width: min(980px, 100%);
    margin: 0 auto;
    display:grid;
    gap:8px;
  }
  .vt-reveal-section { padding:12px 16px; }
  .vt-reveal-heading { margin-bottom:9px; }
  .vt-reveal-heading h2 { display:flex; align-items:center; gap:8px; margin:0; font-size:17px; line-height:1.3; }
  .vt-reveal-heading h2 :global(svg) { color:var(--vt-accent); }
  .vt-vis-grid {
    display: grid;
    grid-template-columns: repeat(var(--vis-columns), minmax(0, 1fr));
    gap: 8px;
  }
  .vt-vis {
    display: grid;
    gap: 4px;
    padding: 11px 13px;
    border-radius: 12px;
    color: var(--vt-ink);
    text-align: left;
    white-space: normal !important;
    box-shadow:none;
  }
  .vt-vis b {
    font-size: 16px;
  }
  .vt-vis small,
  .vt-mode small,
  .vt-tut small {
    color: var(--vt-muted);
    font-size: 13px;
    font-weight: 600;
    line-height:1.5;
    word-break: keep-all;
  }
  .vt-vis[aria-checked='true'],
  .vt-mode[aria-checked='true'] {
    border-color: var(--vt-accent);
    background:color-mix(in srgb, var(--vt-card) 76%, var(--vt-soft));
    box-shadow: 0 0 0 1px var(--vt-accent);
  }
  .vt-mode-grid {
    display: grid;
    grid-template-columns: repeat(var(--mode-columns), minmax(0, 1fr));
    gap: 8px;
  }
  .vt-mode {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px 12px;
    border-radius: 12px;
    color: var(--vt-ink);
    text-align: left;
    white-space: normal !important;
    box-shadow:none;
    transition: transform var(--vt-quick) var(--vt-ease), box-shadow var(--vt-quick) var(--vt-ease);
  }
  .vt-mode:hover:not(:disabled) {
    transform: translateY(-2px);
  }
  .vt-mode:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .vt-mode span {
    display: grid;
    gap: 3px;
  }
  .vt-mode b {
    font-size: 15px;
  }
  .vt-tut {
    display: grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:0 24px;
  }
  .vt-tut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height:44px;
    padding: 5px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--vt-line) 80%, transparent);
  }
  .vt-tut-row:last-child {
    border-bottom: 0;
  }
  .vt-tut-row:first-child { grid-column:1 / -1; }
  .vt-tut-row:nth-child(n+2) { border-bottom:0; }
  .vt-tut-row span {
    display: grid;
    gap: 3px;
  }
  .vt-tut-row b {
    font-size: 16px;
  }
  .vt-chips {
    display: flex;
    gap: 6px;
  }
  @container (max-width: 760px) { .vt-mode-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .vt-tut { grid-template-columns:1fr; } }
  @container (max-width: 480px) { .vt-mode-grid, .vt-vis-grid { grid-template-columns:1fr; } }
</style>
