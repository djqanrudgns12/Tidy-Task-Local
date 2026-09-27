<script lang="ts">
  // 온도계 한 칸(PRD 10.3): 제목 리본 → 목표/한계 스티커 → 관과 단계 스티커 → 큰 숫자 → 오늘의 변화 한 줄 → 목표 패널 → 버튼 → 도장.
  // 온도계 1개·넓은 창이면 왼쪽 관 | 오른쪽 정보(split), 그 밖에는 위에서 아래로(stack).
  import { untrack } from 'svelte';
  import { Heart, AlertTriangle, Cloud, Star, Shield, RotateCcw, CalendarPlus, Repeat, Flag, X, PictureInPicture2, Check, ChevronDown } from 'lucide-svelte';
  import RollingNumber from '../scores/RollingNumber.svelte';
  import ThermoTube from './ThermoTube.svelte';
  import Confetti from './Confetti.svelte';
  import ThermoTitle from './ThermoTitle.svelte';
  import ThermoReasons from './ThermoReasons.svelte';
  import { moodOf, unitMark } from '../../lib/thermometer/moods.js';
  import { slide } from 'svelte/transition';
  import { goalPanel, NEXT_GOALS_SHOWN } from '../../lib/thermometer/display.js';
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
    onreasonhold,
    onrename,
    onremove,
    onreset,
    mini = false,
    miniBusy = false,
    onmini,
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
    onreasonhold: (holding: boolean) => void;
    onrename: (title: string) => void;
    onremove: () => void;
    onreset: () => void;
    mini?: boolean;
    miniBusy?: boolean;
    onmini: () => void;
  }>();

  const mood = $derived(moodOf(t.mood));
  const u = $derived(unitMark(t.unit));
  const down = $derived(t.linkSteps ? t.upStep : t.downStep);
  // ── 목표 패널: [지금 목표] → [다음 목표] → [이미 달성한 목표(기본 접힘)] ──
  const goal = $derived(goalPanel(t));
  const positive = $derived(t.mood === 'positive');
  let nextOpen = $state(false);
  let doneOpen = $state(false);
  const nextShown = $derived(nextOpen ? goal.next : goal.next.slice(0, NEXT_GOALS_SHOWN));
  // 새로 달성하면: 그 목표가 "이미 달성" 서랍으로 내려가므로 서랍을 접어 두고(목록이 길어져 버튼을 밀지 않게) 개수 뱃지를 톡 튀웁니다.
  // 지금 목표 자리도 다음 목표로 바뀌며 살짝 올라옵니다. 처음 그릴 때는 움직이지 않습니다(seq가 0).
  let doneCount = untrack(() => goal.done.length);
  let focusId = untrack(() => goal.focus?.id);
  let donePop = $state(0);
  let focusSeq = $state(0);
  $effect(() => {
    const n = goal.done.length;
    const id = goal.focus?.id;
    untrack(() => {
      if (n > doneCount) { donePop++; doneOpen = false; }
      if (id !== focusId) focusSeq++;
    });
    doneCount = n;
    focusId = id;
  });
  const deadline = $derived(t.deadline ? deadlineText(t.deadline, today, { mood: t.mood, outcome: t.deadlineOutcome }) : null);
  const summary = $derived(todaySummary(t.daily, today));
  const showStamps = $derived(t.mood === 'positive' || !!t.deadline || t.stamps.count > 0 || !!t.stamps.rewardText);
  const atTop = $derived(t.value >= t.max);


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
    <!-- 이름을 누르면 그 자리에서 바로 고칩니다(치는 대로 저장 → 미니 온도계에도 곧바로 비침). -->
    <ThermoTitle class="th-title" value={t.title} label="온도계 이름" onrename={onrename} />
    <!-- 미니 온도계: 이 온도계를 작은 보기 전용 창으로 띄워 두는 스위치. 켜 두면 다음에 앱을 켤 때도 다시 뜹니다.
         왜 버튼이 아니라 스위치인가: "지금 떠 있는지"를 한눈에 보고, 같은 자리에서 끌 수 있어야 해서입니다. -->
    <button class="th-mini" role="switch" aria-checked={mini} aria-busy={miniBusy} aria-label={`${t.title} 미니 온도계`}
      title={mini ? '미니 온도계에서 빼기' : '작은 온도계를 화면에 띄워 둡니다 · 다음에 켤 때도 다시 떠요'}
      onpointerdown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); onmini(); }}>
      <PictureInPicture2 size={15} aria-hidden="true" />
      <span class="th-mini-label">미니 온도계</span>
      <span class="th-mini-track" aria-hidden="true"><i></i></span>
    </button>
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
      <!-- 오늘의 변화는 큰 숫자 밑 한 줄 글자로 둡니다. 패널로 감싸면 목표 패널과 무게가 같아져 어디를 볼지 흐려졌습니다. -->
      <p class="th-today"><span>오늘의 변화</span>{#if summary.empty}<b>0{u}</b>{:else}{#if summary.up}<b class="up">+{summary.up}{u}</b>{/if}{#if summary.down}<b class="down">−{summary.down}{u}</b>{/if}{#if summary.auto}<small>자동 −{summary.auto}{u}</small>{/if}{/if}</p>
      {#if goal.focus}
        <!-- 목표는 한 패널 안에서 구역으로만 나눕니다: 지금 목표 → 다음 목표 → 이미 달성한 목표(기본 접힘).
             세 구역이 같은 머리글(작은 제목 + 오른쪽 정보)·같은 여백을 써서 따로 떨어진 카드가 아니라 한 덩어리로 읽힙니다. -->
        <section class="th-goals" class:finished={goal.finished} aria-label={positive ? '목표' : mood.stageName}>
          <div class="th-gsec th-gsec-focus">
            <div class="th-ghead">
              <span>{goal.finished ? (positive ? '최종 목표 달성' : '한계에 닿았어요') : (positive ? '지금 도전하는 목표' : '다음 경고 단계')}</span>
              {#if goal.finished}<em class="th-gpill"><Check size={14} strokeWidth={3.2} aria-hidden="true" />{positive ? '달성' : '도달'}</em>{:else}<em class="th-gpill">{goal.remain}{u} 남음</em>{/if}
            </div>
            {#key focusSeq}
              <div class="th-gfocus" class:enter={focusSeq > 0}><b>{goal.focus.at}{u}</b><strong>{goal.focus.label || mood.stageName}</strong></div>
            {/key}
            <div class="th-gbar" role="progressbar" aria-label={positive ? '지금 목표까지 온 정도' : '다음 경고 단계까지 온 정도'} aria-valuemin={0} aria-valuemax={goal.focus.at} aria-valuenow={Math.max(0, Math.min(goal.focus.at, t.value))}><i style:width={`${goal.progress * 100}%`}></i></div>
          </div>
          {#if goal.next.length}
            <div class="th-gsec th-gsec-next">
              <div class="th-ghead">
                <span>{positive ? '다음 목표' : '그다음 경고'}</span>
                {#if goal.next.length > NEXT_GOALS_SHOWN}
                  <button class="th-gfold" aria-expanded={nextOpen} onclick={(e) => { e.stopPropagation(); nextOpen = !nextOpen; }}>{nextOpen ? '접기' : `${goal.next.length - NEXT_GOALS_SHOWN}개 더 보기`}<ChevronDown size={15} aria-hidden="true" /></button>
                {/if}
              </div>
              <ol class="th-glist">{#each nextShown as s (s.id)}<li><b>{s.at}{u}</b><span>{s.label || mood.stageName}</span></li>{/each}</ol>
            </div>
          {/if}
          {#if goal.done.length}
            <div class="th-gsec th-gsec-done">
              <button class="th-ghead th-gdone-head" aria-expanded={doneOpen} onclick={(e) => { e.stopPropagation(); doneOpen = !doneOpen; }}>
                <span><i class="th-gmark" aria-hidden="true">{#if positive}<Check size={12} strokeWidth={3.6} />{:else}<AlertTriangle size={11} strokeWidth={3} />{/if}</i>{positive ? '이미 달성한 목표' : '이미 넘은 경고'}{#key donePop}<b class="th-gcount" class:pop={donePop > 0}>{goal.done.length}</b>{/key}</span>
                <span class="th-gfold">{doneOpen ? '접기' : '펼치기'}<ChevronDown size={15} aria-hidden="true" /></span>
              </button>
              {#if doneOpen}
                <ol class="th-glist done" transition:slide={{ duration: reduced ? 0 : 200 }}>{#each goal.done as s (s.id)}<li><b>{s.at}{u}</b><span>{s.label || mood.stageName}</span></li>{/each}</ol>
              {/if}
            </div>
          {/if}
        </section>
      {/if}

      <!-- 칩을 모두 지웠어도 "직접 입력" 칸은 남으므로 칩 개수와 상관없이 띄웁니다. -->
      {#if chipsFor && t.reasons.show}
        <ThermoReasons chips={t.reasons.chips} {onreason} onhold={onreasonhold} />
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
    </div>
  </div>

  {#if showStamps}
    <details class="th-stamp-panel">
      <!-- 머리글은 목표 패널의 "이미 달성한 목표"와 같은 모양(제목 · 개수 · 펼치기)입니다. -->
      <summary class="th-ghead"><span>{t.mood === 'positive' ? '도장 모아 보기' : '약속 지킴 도장'}<b class="th-gcount">{t.stamps.count} / {t.stamps.size}</b></span><span class="th-gfold"><span class="th-fold-label"></span><ChevronDown size={15} aria-hidden="true" /></span></summary>
      <div class="th-stamp-content">
        <div class="th-stamp-row" style:--n={t.stamps.size}>
          {#each Array.from({ length: t.stamps.size }, (_, i) => i) as i (i)}<i class:on={i < t.stamps.count}>{#if i < t.stamps.count}{#if t.mood === 'positive'}<Star size={16} fill="currentColor" />{:else}<Shield size={16} fill="currentColor" />{/if}{/if}</i>{/each}
        </div>
        {#if t.stamps.rewardText}<div class="th-stamp-goal" class:complete={t.stamps.count >= t.stamps.size}><span>도장판 목표</span><strong>{t.stamps.rewardText}</strong></div>{/if}
        {#if t.stamps.count >= t.stamps.size}<div class="th-followup"><button onclick={onnewboard}><Star size={15} />새 도장판</button></div>{/if}
      </div>
    </details>
  {/if}

  {#if banner}<div class="th-banner" data-tone={banner.tone} role="status">{banner.text}</div>{/if}
  {#key confetti}{#if confetti}<Confetti colors={confettiColors} ondone={() => (confetti = 0)} />{/if}{/key}
</article>
