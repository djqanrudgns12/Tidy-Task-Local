<script lang="ts">
  // 오른쪽 옆 칸의 학생 안내 설정. 예전 "투표 설정" 요약 자리입니다 — 요약은 지금까지 고른 것을 다시 보여 줄 뿐이라
  // 치웠고(사용자 의견, 2026-09-27), 그 자리에 어느 단계에서나 바로 바꿀 수 있는 안내 설정을 둡니다.
  // 4단계(개표 방식)에 있던 같은 설정은 두 곳에서 바뀌지 않도록 이쪽으로만 옮겼습니다.
  import { Presentation } from 'lucide-svelte';
  import ToolkitSwitch from '../../toolkit/ToolkitSwitch.svelte';
  import { PACE } from '../../../lib/vote/tutorial.js';
  let { config, speechAvailable, onchange } = $props<{ config: any; speechAvailable: boolean; onchange: (c: any) => void }>();
  const tutorial = $derived(config.tutorial);
  const setTutorial = (patch: Record<string, unknown>) => onchange({ ...config, tutorial: { ...config.tutorial, ...patch } });
  // 한 장에 머무는 시간을 알려 주면 "느리게/보통"이 실제로 얼마나 다른지 짐작할 수 있습니다.
  const secondsPerSlide = (speed: 'slow' | 'normal') => Math.round(PACE(speed).baseMs / 1000);
</script>

<section class="vt-tut-panel" aria-label="학생 안내 설정">
  <div class="vt-tut-head">
    <span class="vt-tut-icon" aria-hidden="true"><Presentation size={18} strokeWidth={1.9} /></span>
    <h2>학생 안내</h2>
  </div>

  <div class="vt-tut-row">
    <span><b>안내 슬라이드</b><small>{tutorial.enabled ? '투표 전에 투표 방법을 먼저 보여 줘요' : '안내 없이 바로 투표판을 열어요'}</small></span>
    <ToolkitSwitch checked={tutorial.enabled} label="안내 슬라이드" onchange={(v) => setTutorial({ enabled: v })} />
  </div>

  {#if tutorial.enabled}
    <div class="vt-tut-row">
      <span><b>넘기는 속도</b><small>한 장에 약 {secondsPerSlide(tutorial.speed)}초</small></span>
      <div class="vt-chips" role="radiogroup" aria-label="넘기는 속도">
        <button class="vt-chip" role="radio" aria-checked={tutorial.speed === 'slow'} onclick={() => setTutorial({ speed: 'slow' })}>느리게</button>
        <button class="vt-chip" role="radio" aria-checked={tutorial.speed === 'normal'} onclick={() => setTutorial({ speed: 'normal' })}>보통</button>
      </div>
    </div>
    <div class="vt-tut-row">
      <span><b>음성으로 읽어 주기</b><small>{speechAvailable ? '슬라이드 글을 소리 내어 읽어요' : '이 PC에 한국어 음성이 없어요'}</small></span>
      <ToolkitSwitch checked={tutorial.speech && speechAvailable} disabled={!speechAvailable} label="음성으로 읽어 주기" onchange={(v) => setTutorial({ speech: v })} />
    </div>
  {/if}
</section>

<style>
  .vt-tut-panel {
    display: grid;
    flex: none;
    padding: 12px 16px 4px;
    border: 1px solid var(--vt-line);
    border-radius: 16px;
    background: var(--vt-card);
  }
  .vt-tut-head { display:flex; align-items:center; gap:9px; padding-bottom:10px; }
  .vt-tut-head h2 { margin:0; font-size:17px; line-height:1.3; }
  .vt-tut-icon { display:grid; place-items:center; flex:none; width:32px; height:32px; border-radius:10px; background:color-mix(in srgb, var(--vt-soft) 70%, transparent); color:var(--vt-accent); }
  .vt-tut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 54px;
    padding: 7px 0;
    border-top: 1px solid color-mix(in srgb, var(--vt-line) 80%, transparent);
  }
  .vt-tut-row > span { display:grid; gap:3px; min-width:0; }
  .vt-tut-row b { font-size:16px; }
  .vt-tut-panel small {
    color: var(--vt-muted);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
    word-break: keep-all;
  }
  .vt-chips { display:flex; flex:none; gap:6px; }
</style>
