<script lang="ts">
  // ③ 투표 규칙: 설정 이름과 조작을 한 줄에 배치합니다.
  import { Minus, Plus, Users, Vote, Award, Scale, CircleSlash, Undo2 } from 'lucide-svelte';
  import StepHeading from './StepHeading.svelte';
  import ToolkitSwitch from '../../toolkit/ToolkitSwitch.svelte';
  import { LIMITS, itemNoun } from '../../../lib/vote/model.js';
  let { config, showProblems, problems, onchange } = $props<{ config: any; showProblems: boolean; problems: any[]; onchange: (c: any) => void }>();
  const r = $derived(config.rules);
  const set = (patch: Record<string, unknown>) => onchange({ ...config, rules: { ...config.rules, ...patch } });
  const yesno = $derived(config.type === 'yesno');
  const noun = $derived(itemNoun(config.type));
  const problem = (field: string) => (showProblems ? problems.find((p: any) => p.field === field && !p.warning) : null);
  function setVoters(n: number) {
    if (!Number.isFinite(n)) return;
    set({ voters: Math.min(LIMITS.votersMax, Math.max(LIMITS.votersMin, Math.round(n))) });
  }
  const RULES = [
    { id: 'yesOverNo', label: '찬성 > 반대' },
    { id: 'majority', label: '참여자 과반' },
    { id: 'twoThirds', label: '3분의 2 이상' },
    { id: 'none', label: '판정 없음' },
  ];
</script>

<section class="vt-step">
  <StepHeading step={2} title="학생들은 어떻게 투표할까요?" />
  <div class="vt-rules">
    <div class="vt-rule vt-card">
      <div class="vt-rule-top">
        <b><Users size={20} aria-hidden="true" />총 투표 인원</b>
        <div class="vt-stepper-lg">
          <button aria-label="인원 줄이기" disabled={r.voters <= LIMITS.votersMin} onclick={() => setVoters(r.voters - 1)}><Minus size={18} /></button>
          <input type="number" min={LIMITS.votersMin} max={LIMITS.votersMax} value={r.voters} aria-label="총 투표 인원" aria-invalid={!!problem('voters')}
            onchange={(e) => setVoters(Number((e.currentTarget as HTMLInputElement).value))} />
          <span>명</span>
          <button aria-label="인원 늘리기" disabled={r.voters >= LIMITS.votersMax} onclick={() => setVoters(r.voters + 1)}><Plus size={18} /></button>
        </div>
      </div>
      {#if problem('voters')}<p class="vt-problem">{problem('voters')?.message}</p>{/if}
    </div>

    {#if !yesno}
      <div class="vt-rule vt-card">
        <div class="vt-rule-top">
          <b><Vote size={20} aria-hidden="true" />한 사람이 고르는 표</b>
          <div class="vt-chips" role="radiogroup" aria-label="1인 표 수">
            {#each [1, 2, 3, 4, 5] as n}<button class="vt-chip" role="radio" aria-checked={r.votesPerVoter === n} onclick={() => set({ votesPerVoter: n })}>{n}표</button>{/each}
          </div>
        </div>
        {#if problem('votesPerVoter')}<p class="vt-problem">{problem('votesPerVoter')?.message}</p>{/if}
        {#if r.votesPerVoter > 1}
          <div class="vt-rule-sub">
            <span>같은 {noun}에 여러 표 주기</span>
            <ToolkitSwitch checked={r.allowRepeat} label={`같은 ${noun}에 여러 표 주기`} onchange={(v) => set({ allowRepeat: v })} />
          </div>
        {/if}
      </div>

      <div class="vt-rule vt-card">
        <div class="vt-rule-top">
          <b><Award size={20} aria-hidden="true" />{config.type === 'opinion' ? '선정 개수' : '당선 인원'}</b>
          <div class="vt-chips" role="radiogroup" aria-label="당선 인원">
            {#each [1, 2, 3, 4] as n}<button class="vt-chip" role="radio" aria-checked={r.seats === n} onclick={() => set({ seats: n })}>{n}{config.type === 'opinion' ? '개' : '명'}</button>{/each}
          </div>
        </div>
        {#if problem('seats')}<p class="vt-problem">{problem('seats')?.message}</p>{/if}
      </div>
    {:else}
      <div class="vt-rule vt-card">
        <div class="vt-rule-top">
          <b><Scale size={20} aria-hidden="true" />통과 기준</b>
          <div class="vt-chips" role="radiogroup" aria-label="통과 기준">
            {#each RULES as rule}<button class="vt-chip" role="radio" aria-checked={r.passRule === rule.id} onclick={() => set({ passRule: rule.id })}>{rule.label}</button>{/each}
          </div>
        </div>
      </div>
    {/if}

    <div class="vt-rule vt-card">
      <div class="vt-rule-top">
        <b><CircleSlash size={20} aria-hidden="true" />기권(0번)</b>
        <ToolkitSwitch checked={r.allowAbstain} label="기권 허용" onchange={(v) => set({ allowAbstain: v })} />
      </div>
    </div>

    <div class="vt-rule vt-card">
      <div class="vt-rule-top">
        <b><Undo2 size={20} aria-hidden="true" />다시 투표하기</b>
        <span>다음 친구 투표 전까지</span>
      </div>
      <p>번호를 누르면 ‘투표했어요!’ 뒤 다음 친구의 투표판이 저절로 열려요. 잘못 눌렀으면 투표판 오른쪽 위 ‘다시 투표하기’나 백스페이스 → 확인 창에서 방금 표를 빼고 다시 골라요.</p>
    </div>
  </div>
</section>

<style>
  .vt-step {
    width: min(980px, 100%);
    margin: 0 auto;
    display:grid;
    gap:10px;
  }
  .vt-rules {
    display: grid;
    gap: 8px;
  }
  .vt-rule {
    padding: 13px 18px;
    border-radius: 16px;
    box-shadow:none;
  }
  .vt-rule-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .vt-rule-top b {
    display:flex;
    align-items:center;
    gap:10px;
    font-size: 17px;
  }
  .vt-rule .vt-problem {
    margin:8px 0 0;
    color: var(--vt-danger);
  }
  .vt-rule-top b :global(svg) { flex:none; color:var(--vt-accent); }
  .vt-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .vt-rule-sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--vt-line);
    font-size: 15px;
    font-weight: 800;
  }
  .vt-stepper-lg {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .vt-stepper-lg button {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--vt-line);
    border-radius: 12px;
    background: var(--vt-card);
    color: var(--vt-ink);
  }
  .vt-stepper-lg input {
    width: 70px;
    height: 40px;
    border: 1px solid var(--vt-line);
    border-radius: 12px;
    background: var(--vt-card);
    color: var(--vt-ink);
    font-size: 20px;
    font-weight: 900;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .vt-stepper-lg span {
    font-weight: 800;
    color: var(--vt-muted);
  }
</style>
