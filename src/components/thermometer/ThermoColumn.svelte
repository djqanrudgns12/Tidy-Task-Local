<script lang="ts">
  // 온도계 한 칸(PRD 10.3): 제목 리본 → 목표/한계 스티커 → 관과 단계 스티커 → 큰 숫자 → 다음 단계 한 줄 → 오늘 요약·도장 → 버튼.
  // 온도계 1개·넓은 창이면 왼쪽 관 | 오른쪽 정보(split), 그 밖에는 위에서 아래로(stack).
  import { untrack } from 'svelte';
  import { Heart, AlertTriangle, Cloud, Star, Shield, RotateCcw, CalendarPlus, Repeat, Flag, X } from 'lucide-svelte';
  import RollingNumber from '../scores/RollingNumber.svelte';
  import ThermoTube from './ThermoTube.svelte';
  import Confetti from './Confetti.svelte';
  import { moodOf, unitMark } from '../../lib/thermometer/moods.js';
  import { nextLine, stageStatus } from '../../lib/thermometer/stages.js';
  import { deadlineText } from '../../lib/thermometer/calendar.js';
  import { todaySummary } from '../../lib/thermometer/history.js';

  let {
    t,
    today,
    layout = 'stack',
    compact = false,
    selected = false,
    selectable = false,
    reduced = false,
    fx = null,
    chipsFor = null,
    onbump,
    onrestart,
    onextend,
    onrepeat,
    onenddeadline,
    onnewboard,
    onselect,
    onreason,
    onremove,
    onreset,
  } = $props<{
    t: any;
    today: string;
    layout?: 'split' | 'stack';
    compact?: boolean;
    selected?: boolean;
    selectable?: boolean;
    reduced?: boolean;
    fx?: { seq: number; kind: string; text?: string } | null;
    chipsFor?: string | null;
    onbump: (dir: 1 | -1) => void;
    onrestart: () => void;
    onextend: () => void;
    onrepeat: () => void;
    onenddeadline: () => void;
    onnewboard: () => void;
    onselect: () => void;
    onreason: (reason: string) => void;
    onremove: () => void;
    onreset: () => void;
  }>();

  const mood = $derived(moodOf(t.mood));
  const u = $derived(unitMark(t.unit));
  const down = $derived(t.linkSteps ? t.upStep : t.downStep);
  const next = $derived(nextLine(t.mood, t.stages, t.value, t.max, t.unit));
  const deadline = $derived(t.deadline ? deadlineText(t.deadline, today, { mood: t.mood, outcome: t.deadlineOutcome }) : null);
  const summary = $derived(todaySummary(t.daily, today));
  const showStamps = $derived(t.mood === 'positive' || !!t.deadline || t.stamps.count > 0 || !!t.stamps.rewardText);
  const atTop = $derived(t.value >= t.max);
  const ladder = $derived(stageStatus(t.stages, t.value, t.max).filter((s) => !s.hidden).reverse());

  let areaW = $state(0);
  let areaH = $state(0);

  // ── 사건 연출 ──
  let bubbleSeq = $state(0);
  let shakeSeq = $state(0);
  let sirenSeq = $state(0);
  let banner = $state<{ text: string; tone: string } | null>(null);
  let confetti = $state(0);
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFx = untrack(() => fx?.seq ?? 0);
  $effect(() => {
    const f = fx;
    if (!f || f.seq === lastFx) return;
    lastFx = f.seq;
    untrack(() => play(f));
  });
  function showBanner(text: string, tone: string, ms = 2600) {
    clearTimeout(bannerTimer);
    banner = { text, tone };
    bannerTimer = setTimeout(() => (banner = null), ms);
  }
  function play(f: { kind: string; text?: string }) {
    if (f.kind === 'up') bubbleSeq++;
    else if (f.kind === 'blocked') shakeSeq++;
    else if (f.kind === 'stage') {
      showBanner(f.text ?? '', t.mood === 'positive' ? 'reward' : 'warn', 2200);
      if (t.mood === 'negative') shakeSeq++;
    } else if (f.kind === 'top') {
      if (t.mood === 'positive') {
        showBanner(`목표 달성!${t.topText ? ` · ${t.topText}` : ''}`, 'reward', 3000);
        if (!reduced) confetti++;
      } else {
        showBanner(t.topText ? `한계에 닿았어요 · ${t.topText}` : '한계에 닿았어요', 'warn', 3200);
        sirenSeq++;
        shakeSeq++;
      }
    } else if (f.kind === 'kept') {
      showBanner('약속을 지켰어요!', 'reward', 3000);
      if (!reduced) confetti++;
    } else if (f.kind === 'board') {
      showBanner(`도장판 완성!${t.stamps.rewardText ? ` · ${t.stamps.rewardText}` : ''}`, 'reward', 3400);
      if (!reduced) confetti++;
    }
  }
  const confettiColors = $derived(t.mood === 'positive' ? ['#8FD3FF', '#2F7BE0', '#FFD86B', '#9BE3B8', '#C7A6FF'] : ['#FFC3A0', '#FF8FA3', '#FFD86B', '#9BE3B8', '#8FD3FF']);
</script>

<article class="th-col" data-mood={t.mood} data-layout={layout} class:no-stages={!t.stages.some((s: any) => s.at < t.max)} class:compact class:selected={selected && selectable} class:selectable
  style:--th-accent={mood.accent} style:--th-soft={mood.soft} style:--th-from={mood.from} style:--th-to={mood.to}
  onpointerdown={() => selectable && onselect()} aria-label={`${t.title} ${t.value}${u}`}>
  <header class="th-ribbon">
    <span class="th-ribbon-icon" aria-hidden="true">{#if t.mood === 'positive'}<Heart size={16} fill="currentColor" />{:else}<AlertTriangle size={16} />{/if}</span>
    <strong>{t.title}</strong>
    {#if selectable && selected}<span class="th-selected-tag">선택됨</span>{/if}
    <!-- 이미 0이면 되돌릴 것도 없으니 누를 수 없게 둡니다(빈 확인창·빈 되돌리기 기록이 생기지 않게). -->
    <button class="th-reset" title={`${t.title} 0으로 초기화`} aria-label={`${t.title} 0으로 초기화`} disabled={t.value === 0}
      onpointerdown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); onreset(); }}><RotateCcw size={15} />{#if !compact}<span>초기화</span>{/if}</button>
    <button class="th-remove" title={`${t.title} 삭제`} aria-label={`${t.title} 삭제`} onpointerdown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); onremove(); }}><X size={17} /></button>
  </header>

  <div class="th-top" class:reached={atTop}>
    <span class="th-top-icon" aria-hidden="true">{#if t.mood === 'positive'}<Cloud size={18} fill="currentColor" />{:else}<Flag size={16} fill="currentColor" />{/if}</span>
    <b>{t.max}{u}</b><span class="th-top-text">{t.topText || mood.topName}</span>
    {#if deadline}<small class="th-deadline" class:urgent={deadline.urgent} class:past={deadline.left < 0 && !deadline.done} class:done={deadline.done}>{deadline.text}</small>{/if}
  </div>

  <div class="th-main">
    <div class="th-tube-area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
      {#if areaW > 0 && areaH > 0}<ThermoTube {t} width={areaW} height={areaH} {reduced} {bubbleSeq} {shakeSeq} {sirenSeq} stickerLabels={layout !== 'split'} />{/if}
    </div>

    <div class="th-info">
      <div class="th-number" class:cold={t.value < 0} aria-live="polite"><RollingNumber value={t.value} {reduced} /><span class="th-unit">{u}</span></div>
      <p class="th-next" class:urgent={t.mood === 'negative' && t.max - t.value <= 1}>{next}</p>
      <div class="th-meta">
        <!-- 0인 항목은 빼고 보여 줍니다("+0°"처럼 뜻 없는 숫자가 눈에 걸리지 않게). -->
        <span class="th-today">오늘 {#if summary.empty}0{u}{:else}{#if summary.up}<b class="up">+{summary.up}{u}</b>{/if}{#if summary.up && summary.down} · {/if}{#if summary.down}<b class="down">−{summary.down}{u}</b>{/if}{#if summary.auto}{summary.up || summary.down ? ' ' : ''}<small>자동 −{summary.auto}{u}</small>{/if}{/if}</span>
        {#if showStamps}
          <span class="th-stamps" title={`${t.mood === 'positive' ? '도장' : '약속 지킴'} ${t.stamps.count}/${t.stamps.size}`}>
            <span class="th-stamp-label">{t.mood === 'positive' ? '도장' : '약속 지킴'}</span>
            <span class="th-stamp-row" style:--n={t.stamps.size}>
              {#each Array.from({ length: t.stamps.size }, (_, i) => i) as i (i)}
                <i class:on={i < t.stamps.count}>{#if i < t.stamps.count}{#if t.mood === 'positive'}<Star size={10} fill="currentColor" />{:else}<Shield size={10} fill="currentColor" />{/if}{/if}</i>
              {/each}
            </span>
            <span class="th-stamp-count">{t.stamps.count}/{t.stamps.size}</span>
          </span>
        {/if}
      </div>
      {#if t.stamps.rewardText}
        <div class="th-stamp-goal" class:complete={t.stamps.count >= t.stamps.size}>
          <span>도장판 목표</span><strong>{t.stamps.rewardText}</strong>
        </div>
      {/if}
      {#if layout === 'split' && ladder.length}
        <ol class="th-ladder" aria-label={mood.stageName}>
          {#each ladder as s (s.id)}<li data-status={s.status}><b>{s.at}{u}</b><span>{s.label || mood.stageName}</span>{#if s.status === 'next'}<small>{s.remain}{u} 남음</small>{/if}</li>{/each}
        </ol>
      {/if}

      {#if chipsFor && t.reasons.show && t.reasons.chips.length}
        <div class="th-chips" role="group" aria-label="사유 붙이기">
          {#each t.reasons.chips as c (c)}<button onclick={(e) => { e.stopPropagation(); onreason(c); }}>{c}</button>{/each}
        </div>
      {/if}

      <div class="th-actions">
        <button class="th-down" onclick={(e) => { e.stopPropagation(); onbump(-1); }} aria-label={`${down}${u} 내리기`}>−{down}{#if !compact}<span>내리기</span>{/if}</button>
        <button class="th-up" onclick={(e) => { e.stopPropagation(); onbump(1); }} aria-label={`${t.upStep}${u} 올리기`}>+{t.upStep}{#if !compact}<span>올리기</span>{/if}</button>
      </div>
      {#if t.deadlineOutcome === 'missed'}
        <div class="th-followup"><button onclick={onextend}><CalendarPlus size={15} />기한 연장</button><button onclick={onrestart}><RotateCcw size={15} />새로 시작</button></div>
      {:else if t.deadlineOutcome === 'kept'}
        <div class="th-followup"><button onclick={onrepeat}><Repeat size={15} />같은 기간 다시</button><button onclick={onenddeadline}>끝내기</button></div>
      {:else if atTop}
        <div class="th-followup"><button class="strong" onclick={onrestart}><RotateCcw size={15} />새로 시작</button></div>
      {/if}
      {#if t.stamps.count >= t.stamps.size && showStamps}
        <div class="th-followup"><button onclick={onnewboard}><Star size={15} />새 도장판</button></div>
      {/if}
    </div>
  </div>

  {#if banner}<div class="th-banner" data-tone={banner.tone} role="status">{banner.text}</div>{/if}
  {#key confetti}{#if confetti}<Confetti colors={confettiColors} ondone={() => (confetti = 0)} />{/if}{/key}
</article>
