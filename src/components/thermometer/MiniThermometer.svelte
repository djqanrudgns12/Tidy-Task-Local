<script module lang="ts">
  import { moodOf } from '../../lib/thermometer/moods.js';
  /** 미니 온도계 카드의 강조색(밝은 화면, 어두운 화면). 설정 패널의 온도계 점도 같은 색을 써서 카드와 짝을 알아보게 합니다. */
  export const miniAccent = (mood: string) => `light-dark(${moodOf(mood).accent}, ${mood === 'positive' ? '#9bc1ff' : '#ff9b9f'})`;
</script>
<script lang="ts">
  import { Plus, Minus, Check } from 'lucide-svelte';
  import { goalCards } from '../../lib/thermometer/display.js';
  import { unitMark } from '../../lib/thermometer/moods.js';
  import { todaySummary } from '../../lib/thermometer/history.js';
  import ThermoTitle from './ThermoTitle.svelte';
  let { t, today, showToday, showUpcoming, onchange, onrename }: {
    t: import('../../lib/thermometer/model.js').Thermometer; today: string;
    showToday: boolean; showUpcoming: boolean; onchange: (id: string, direction: 1|-1) => void;
    onrename: (id: string, title: string) => void;
  } = $props();
  const goals = $derived(goalCards(t));
  const u = $derived(unitMark(t.unit));
  const summary = $derived(todaySummary(t.daily, today));
  const down = $derived(t.linkSteps ? t.upStep : t.downStep);
  const fill = $derived(Math.max(0, Math.min(100, t.value / t.max * 100)));
</script>

<article class="td-card" style:--td-accent={miniAccent(t.mood)} style:--td-number-scale={Math.max(1, String(t.value).length / 2)} aria-label={t.title}>
  <div class="td-card-inner">
    <!-- 이름을 누르면 여기서 바로 고칩니다. 관리 창과 같은 저장 구역이라 치는 대로 관리 창에도 비칩니다. -->
    <div class="td-label"><span class="td-dot"></span><h2><ThermoTitle class="td-title" value={t.title} label="온도계 이름" onrename={(title) => onrename(t.id, title)} /></h2></div>
    <div class="td-hero">
      <div class="td-value-block">
        <div class="td-reading" aria-live="polite" aria-atomic="true"><strong>{t.value}</strong><span>{u}</span></div>
        <div class="td-maximum">최대 {t.max}{u}</div>
        <div class="td-step-note">한 번에 +{t.upStep} / −{down}{u}</div>
      </div>
      <div class="td-instrument" data-no-drag>
        <button class="td-adjust td-increase" disabled={t.value >= t.max} aria-label={`${t.title} ${t.upStep}${u} 올리기`} title={`+${t.upStep}${u} 올리기`} onclick={() => onchange(t.id, 1)}><Plus size={18} /></button>
        <div class="td-glass" role="meter" aria-label={`${t.title} 현재 온도`} aria-valuemin={t.allowBelowZero ? -t.max : 0} aria-valuemax={t.max} aria-valuenow={t.value} aria-valuetext={`${t.value}${u}, 최대 ${t.max}${u}`}>
          <div class="td-stem"><div class="td-liquid" style:height={`${fill}%`}></div><div class="td-ticks"></div></div>
          {#if goals.current}<i class="td-target-mark" style:bottom={`${14 + Math.max(0, Math.min(1, goals.current.at/t.max)) * 78}%`} title={`${goals.current.label} ${goals.current.at}${u}`}></i>{/if}
          <div class="td-bulb" class:below-zero={t.value < 0}></div>
        </div>
        <button class="td-adjust td-decrease" disabled={t.value <= (t.allowBelowZero ? -t.max : 0)} aria-label={`${t.title} ${down}${u} 내리기`} title={`−${down}${u} 내리기`} onclick={() => onchange(t.id, -1)}><Minus size={18} /></button>
      </div>
    </div>
    <div class="td-goal" class:td-complete={!goals.current}>
      <div class="td-goal-caption"><small>{goals.current ? (t.mood === 'positive' ? '가까운 목표' : '가까운 경고') : (t.mood === 'positive' ? '목표 달성' : '한계 도달')}</small>{#if !goals.current}<Check size={14} />{:else}<span>{Math.max(0, goals.current.at-t.value)}{u} 남음</span>{/if}</div>
      <strong title={goals.current ? `${goals.current.at}${u} ${goals.current.label}` : t.topText || '모든 단계에 도달했어요'}>{#if goals.current}<b>{goals.current.at}{u}</b><span>{goals.current.label}</span>{:else}<span>{t.topText || '모든 단계에 도달했어요'}</span>{/if}</strong>
    </div>
    {#if showUpcoming}<div class="td-upcoming" aria-hidden={!goals.upcoming.length}>{#if goals.upcoming.length}<span>다음</span><b>{goals.upcoming[0].at}{u}</b><strong title={goals.upcoming[0].label}>{goals.upcoming[0].label}</strong>{/if}</div>{/if}
    {#if showToday}<div class="td-today"><span>오늘</span><b>+{summary.up}{u}</b><b>−{summary.down}{u}</b>{#if summary.auto}<small title="자동 식힘">자동 −{summary.auto}{u}</small>{/if}</div>{/if}
    <footer class="td-card-foot"><span>{goals.achieved.length ? `달성 ${goals.achieved.length}개` : '차근차근 함께'}</span><span>도장 <b>{t.stamps.count}</b>/{t.stamps.size}</span></footer>
  </div>
</article>
