<script lang="ts">
  // 기록 서랍(PRD 10.9): 위 = 주간 그래프(월~금 막대), 아래 = 변화 기록 목록과 도장 날짜.
  // big이면 온도계 자리에 그래프만 크게 그립니다(학급 회의용, G 키).
  import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-svelte';
  import { weekBuckets, weekTotal, filterLog } from '../../lib/thermometer/history.js';
  import { addDays, weekStart } from '../../lib/thermometer/calendar.js';
  import { moodOf, unitMark } from '../../lib/thermometer/moods.js';

  let { t, today, big = false, onclose, onbig } = $props<{ t: any; today: string; big?: boolean; onclose: () => void; onbig?: () => void }>();
  let weekOffset = $state(0);
  let range = $state<'today' | 'week' | 'all'>('week');
  const mood = $derived(moodOf(t.mood));
  const u = $derived(unitMark(t.unit) || '');
  const anchor = $derived(addDays(weekStart(today), weekOffset * 7));
  const bars = $derived(weekBuckets(t.daily, anchor, today));
  const total = $derived(weekTotal(bars));
  const peak = $derived(Math.max(1, ...bars.map((b) => Math.max(b.up, b.down + b.auto))));
  const label = $derived.by(() => {
    const [, m, d] = anchor.split('-').map(Number);
    return weekOffset === 0 ? '이번 주' : `${m}월 ${d}일 주`;
  });
  const entries = $derived(filterLog(t.log, range, Date.now()).slice(0, 120));
  const time = (at: number) => {
    const d = new Date(at);
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    return `${md} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const kindLabel = (k: string) => (k === 'auto' ? '자동' : k === 'restart' ? '새로 시작' : '');
</script>

<div class="th-history" class:big data-mood={t.mood} style:--th-accent={mood.accent} style:--th-to={mood.to}>
  {#if !big}
    <header class="th-drawer-head"><strong>기록 · {t.title}</strong><button class="th-icon-btn" aria-label="기록 닫기" title="닫기 (Esc)" onclick={onclose}><X size={18} /></button></header>
  {/if}
  <section class="th-week">
    <div class="th-week-head">
      <button class="th-icon-btn" aria-label="지난주" disabled={weekOffset <= -11} onclick={() => weekOffset--}><ChevronLeft size={18} /></button>
      <strong>{label}</strong>
      <button class="th-icon-btn" aria-label="다음 주" disabled={weekOffset >= 0} onclick={() => weekOffset++}><ChevronRight size={18} /></button>
      <span class="th-week-total"><b class="up">+{total.up}{u}</b> · <b class="down">−{total.down}{u}</b></span>
      {#if !big && onbig}<button class="th-btn" onclick={onbig} title="크게 보기 (G)"><Maximize2 size={15} />크게 보기</button>{/if}
      {#if big}<button class="th-btn" onclick={onclose}>돌아가기 (Esc)</button>{/if}
    </div>
    <div class="th-chart" role="img" aria-label={`${label} 오른 도 ${total.up}, 내린 도 ${total.down}`}>
      {#each bars as b (b.key)}
        <div class="th-bar" class:today={b.today}>
          <div class="th-bar-up"><span class="th-bar-num">{b.up ? `+${b.up}` : ''}</span><i style:height={`${(b.up / peak) * 100}%`}></i></div>
          <div class="th-bar-down"><i class="manual" style:height={`${(b.down / peak) * 100}%`}></i><i class="auto" style:height={`${(b.auto / peak) * 100}%`}></i><span class="th-bar-num">{b.down + b.auto ? `−${b.down + b.auto}` : ''}</span></div>
          <span class="th-bar-label">{b.label}</span>
        </div>
      {/each}
    </div>
    <p class="th-legend"><i class="up"></i>올린 도 <i class="down"></i>내린 도 <i class="auto"></i>자동 식힘</p>
  </section>

  {#if !big}
    <section class="th-log">
      <div class="th-seg" role="radiogroup" aria-label="기록 범위">
        {#each [['today', '오늘'], ['week', '이번 주'], ['all', '전체']] as [id, text] (id)}<button role="radio" aria-checked={range === id} onclick={() => (range = id as typeof range)}>{text}</button>{/each}
      </div>
      <ul>
        {#each entries as e (e.id)}
          <li><time>{time(e.at)}</time><b class:up={e.delta > 0} class:down={e.delta < 0}>{e.delta > 0 ? '+' : '−'}{Math.abs(e.delta)}{u}</b><span class="th-log-value">→ {e.value}{u}</span>{#if e.reason}<span class="th-log-reason">{e.reason}</span>{/if}{#if kindLabel(e.kind)}<small>{kindLabel(e.kind)}</small>{/if}</li>
        {:else}
          <li class="th-empty-line">이 기간에는 기록이 없어요.</li>
        {/each}
      </ul>
    </section>
    {#if t.stamps.dates.length}
      <section class="th-stamp-dates">
        <p class="th-label">도장 받은 날 <small>도장판 {t.stamps.completedBoards}번 완성</small></p>
        <p>{t.stamps.dates.slice(-20).map((d: string) => d.slice(5).replace('-', '/')).join(' · ')}</p>
      </section>
    {/if}
  {/if}
</div>
