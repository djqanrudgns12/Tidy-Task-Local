<script lang="ts">
  // 개표 무대(PRD 8절). 진실은 "몇 걸음 공개했나(cursor)" 하나이고, 모드 화면은 이 값을 그리기만 합니다.
  // 그래서 건너뛰기·앱 재시작·창 가림 뒤에도 숫자가 어긋나지 않습니다(reveal.js).
  //  - live: 진행 중 투표(session). 걸음은 1초에 한 번까지만 저장합니다(자동 재생의 초당 여러 번 쓰기를 줄임).
  //  - 다시 보기: 기록함 항목(entry). 저장하지 않습니다.
  // 키(선생님): Space 재생/멈춤(한 장씩·반전 공개는 한 걸음) · → 한 걸음 · Enter 결과로 건너뛰기.
  import { onMount, onDestroy, untrack } from 'svelte';
  import { Play, Pause, SkipForward, StepForward, Gauge, UsersRound } from 'lucide-svelte';
  import { modeName } from '../../../lib/vote/model.js';
  import { countingOutlook } from '../../../lib/vote/outlook.js';
  import * as B from '../../../lib/vote/ballots.js';
  import { stepCount, ballotsShown, reverseGroups, autoDelay, DRUMROLL_MS, isComplete } from '../../../lib/vote/reveal.js';
  import { send } from '../../../lib/vote/remote.js';
  import BallotBox from '../art/BallotBox.svelte';
  import CountPaper from './CountPaper.svelte';
  import CountRace from './CountRace.svelte';
  import CountTug from './CountTug.svelte';
  import CountBroadcast from './CountBroadcast.svelte';
  import CountCards from './CountCards.svelte';
  import OutlookTag from './OutlookTag.svelte';
  let { session = null, entry = null, audio, reduced, fontFamily = '', remoteCmd, live, onpersist = () => {}, onfinish } = $props<{
    session?: any; entry?: any; audio: any; reduced: boolean; fontFamily?: string; remoteCmd: any; live: boolean;
    onpersist?: (fn: (s: any) => any) => void; onfinish: () => void;
  }>();

  // 다시 보기면 기록함 항목으로 개표용 세션 모양을 만듭니다(표는 이미 개표 순서로 보관됨).
  const s = $derived.by(() => {
    if (session) return session;
    const e = entry;
    return { ...e.config, id: e.id, phase: 'counting', ballots: e.ballots, counting: { order: e.ballots.map((b: any) => b.id), cursor: 0, agenda: 0, revealed: [] } };
  });
  const mode = $derived(s.reveal.mode);
  const yesno = $derived(s.type === 'yesno');
  const lastAgenda = $derived(yesno ? Math.max(0, s.agendas.length - 1) : 0);
  const steps = $derived(stepCount(s));
  const groups = $derived(mode === 'reverse' ? reverseGroups(s) : []);

  const start = untrack(() => s.counting ?? { cursor: 0, agenda: 0, revealed: [] });
  let cursor = $state(start.cursor);
  let agenda = $state(start.agenda);
  let revealed = $state<string[]>([...start.revealed]);
  const outlook = $derived(countingOutlook(s, { cursor, agenda, revealed }));
  const resumed = start.cursor > 0 || start.agenda > 0 || start.revealed.length > 0;
  const alreadyCounted = untrack(() => isComplete(s));
  let opening = $state(!resumed);
  let finishing = $state(false);
  let verdict = $state(false);
  let drumroll = $state(false);
  let speed = $state<'slow' | 'normal' | 'fast'>('normal');
  let playing = $state(false);
  let confirmSkip = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flow: ReturnType<typeof setTimeout> | undefined;

  // ── 저장(1초에 한 번까지) ──
  let lastPersist = 0;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  function persist(now = false) {
    if (!live) return;
    clearTimeout(persistTimer);
    const run = () => {
      lastPersist = performance.now();
      const c = cursor;
      const a = agenda;
      const r = [...revealed];
      onpersist((d: any) => r.reduce((acc: any, id: string) => B.revealItem(id)(acc), B.setCursor(c, a)(d)));
    };
    if (now || performance.now() - lastPersist >= 1000) run();
    else persistTimer = setTimeout(run, 1000 - (performance.now() - lastPersist));
  }

  // ── 진행 ──
  function complete() {
    if (finishing) return;
    finishing = true;
    playing = false;
    clearTimeout(timer);
    persist(true);
    // 마지막 장면(결승·당선 확실·마지막 카드)을 잠깐 보여 준 뒤 결과로.
    flow = setTimeout(() => onfinish(), mode === 'broadcast' ? 4200 : reduced ? 500 : 1800);
  }
  function afterStep() {
    if (cursor < steps) return;
    if (yesno && agenda < lastAgenda) {
      // 안건 하나가 끝나면 통과/부결 도장을 1.6초 보여 준 뒤 다음 안건.
      verdict = true;
      clearTimeout(timer);
      flow = setTimeout(() => {
        verdict = false;
        agenda += 1;
        cursor = 0;
        persist(true);
        schedule();
      }, mode === 'broadcast' ? 3600 : reduced ? 900 : 1800);
      return;
    }
    complete();
  }
  function advance() {
    if (opening || finishing || verdict || drumroll) return;
    if (mode === 'pick') return;
    if (cursor >= steps) return afterStep();
    if (mode === 'reverse' && groups[cursor]?.drumroll && !reduced) {
      // 당선 묶음 앞에서는 드럼롤 뒤에 뒤집습니다.
      drumroll = true;
      audio.play('reveal.drumroll');
      flow = setTimeout(() => {
        drumroll = false;
        step();
      }, DRUMROLL_MS);
      return;
    }
    step();
  }
  function step() {
    cursor += 1;
    persist();
    if (cursor >= steps) afterStep();
    else schedule();
  }
  function pick(id: string) {
    if (mode !== 'pick' || opening || finishing || revealed.includes(id)) return;
    revealed = [...revealed, id];
    audio.play('reveal.flip');
    persist();
    if (revealed.length >= s.items.length) complete();
  }
  function schedule() {
    clearTimeout(timer);
    if (!playing || opening || finishing || verdict || drumroll || mode === 'pick') return;
    const drumNext = mode === 'reverse' && !!groups[cursor]?.drumroll;
    timer = setTimeout(advance, autoDelay(mode, cursor, steps, speed, { drumrollNext: drumNext }));
  }
  function togglePlay() {
    if (finishing || opening || verdict || drumroll) return;
    playing = !playing;
    if (playing) {
      advance();
    } else clearTimeout(timer);
  }
  function skip() {
    if (finishing) return;
    confirmSkip = false;
    clearTimeout(timer);
    clearTimeout(flow);
    drumroll = false;
    verdict = false;
    opening = false;
    if (mode === 'pick') revealed = s.items.map((it: any) => it.id);
    else {
      agenda = lastAgenda;
      cursor = stepCount(s);
    }
    complete();
  }

  // 모든 방식·공개 범위·다시 보기는 선생님의 명시적인 조작 후에만 진행합니다.
  onMount(() => {
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    if (!resumed) {
      audio.play('count.open');
      flow = setTimeout(() => {
        opening = false;
      }, reduced ? 300 : 1100);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
  onDestroy(() => {
    clearTimeout(timer);
    clearTimeout(flow);
    clearTimeout(persistTimer);
    void send('vote-state', { kind: 'counting-end' });
  });

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof Element && e.target.closest('input, textarea, button, [role=dialog]')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (playing) togglePlay();
      else if (mode === 'paper' || mode === 'reverse') advance();
      else togglePlay();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      advance();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (confirmSkip) skip();
      else confirmSkip = true;
    } else if (e.key === 'Escape') confirmSkip = false;
  }
  // 창이 가려지면 자동 재생을 멈춥니다. 돌아오면 저장된 걸음 그대로 다시 그립니다.
  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      playing = false;
      clearTimeout(timer);
    }
  }

  // ── 선생님 창(원격) ──
  let lastSeq = untrack(() => remoteCmd?.seq ?? 0);
  $effect(() => {
    const cmd = remoteCmd;
    if (!cmd || cmd.seq === lastSeq || (cmd.kind !== 'counting' && cmd.kind !== 'reveal')) return;
    lastSeq = cmd.seq;
    untrack(() => {
      if (cmd.kind === 'reveal') pick(cmd.id);
      else if (cmd.action === 'next') advance();
      else if (cmd.action === 'toggle') togglePlay();
      else if (cmd.action === 'skip') skip();
      else if (cmd.action === 'speed' && ['slow', 'normal', 'fast'].includes(cmd.value)) speed = cmd.value;
    });
  });
  // 다른 창(선생님 창)이 저장한 걸음이 앞서 있으면 따라갑니다.
  $effect(() => {
    if (!live || !session?.counting) return;
    const c = session.counting;
    untrack(() => {
      if (c.agenda > agenda || (c.agenda === agenda && c.cursor > cursor)) {
        agenda = c.agenda;
        cursor = c.cursor;
      }
      const extra = c.revealed.filter((id: string) => !revealed.includes(id));
      if (extra.length) revealed = [...revealed, ...extra];
    });
  });
  // 선생님 창에 개표 상태를 알립니다(선생님 창이 새로 열려 sync를 보내면 다시 알림).
  $effect(() => {
    void remoteCmd;
    void send('vote-state', {
      kind: 'counting', mode, playing, speed, cursor, steps, agenda, agendas: yesno ? s.agendas.length : 1, finishing,
      readyResult: mode === 'instant' || alreadyCounted || (steps === 0 && mode !== 'pick'),
      pickable: mode === 'pick' ? s.items.filter((it: any) => !revealed.includes(it.id)).map((it: any) => ({ id: it.id, number: it.number, name: it.name })) : [],
    });
  });

  const SPEEDS: { id: 'slow' | 'normal' | 'fast'; label: string }[] = [{ id: 'slow', label: '느리게' }, { id: 'normal', label: '보통' }, { id: 'fast', label: '빠르게' }];
  const progress = $derived(mode === 'pick' ? revealed.length / Math.max(1, s.items.length) : ['paper', 'race', 'broadcast'].includes(mode) ? ballotsShown(s, cursor) / Math.max(1, s.ballots.length) : steps ? cursor / steps : 1);
</script>

<section class="vt-count" class:broadcast={mode === 'broadcast'} class:finished={finishing} class:tension={mode === 'race' && !yesno && steps > 4 && cursor >= steps * 0.85 && !finishing}>
  <header class="vt-count-heading" aria-label="투표 정보">
    <div class="vt-count-title">
      <span class="vt-count-mode" class:done={finishing}>{finishing ? '개표 완료' : modeName(mode, yesno)}</span>
      <h2>{s.title}</h2>
    </div>
    <div class="vt-count-participation" aria-label={`참여 인원 ${s.ballots.length}명 / 총 ${s.rules.voters}명`}>
      <span class="vt-participation-icon" aria-hidden="true"><UsersRound size={21} strokeWidth={1.7} /></span>
      <div><span class="vt-participation-label">참여 인원</span><p><strong>{s.ballots.length}</strong><span class="vt-participation-slash">/</span><span class="vt-participation-total">{s.rules.voters}<small>명</small></span></p></div>
    </div>
  </header>
  {#if opening}
    <div class="vt-count-open">
      <BallotBox size={300} state="open" fill={1} />
      <div class="vt-count-papers" class:animate={!reduced} aria-hidden="true">{#each Array.from({ length: 7 }) as _, i}<span style:--i={i}></span>{/each}</div>
      <h2>투표함을 열어요</h2>
    </div>
  {:else}
    <div class="vt-count-stage">
      {#if yesno}
        <section class="vt-count-agenda" aria-label="현재 개표 중인 안건">
          <div class="vt-agenda-index"><span>현재 안건</span><strong>{String(agenda + 1).padStart(2, '0')}<small> / {String(s.agendas.length).padStart(2, '0')}</small></strong></div>
          <h3>{s.agendas[agenda]?.text}</h3>
          {#if outlook.outcome}<span class="vt-agenda-outlook"><OutlookTag status={outlook.outcome} {reduced} /></span>{/if}
        </section>
      {/if}
      {#if mode === 'paper'}
        <CountPaper {s} {cursor} {agenda} {audio} {reduced} {outlook} verdict={verdict || finishing} onnext={advance} disabled={finishing || opening || playing || verdict || drumroll} />
      {:else if mode === 'race' && yesno}
        <CountTug {s} {cursor} {agenda} {audio} {reduced} {outlook} {verdict} finished={finishing} />
      {:else if mode === 'race'}
        <CountRace {s} {cursor} {playing} {audio} {reduced} {outlook} finished={finishing} />
      {:else if mode === 'broadcast'}
        <CountBroadcast {s} {cursor} {playing} {agenda} {audio} {reduced} {outlook} {verdict} finished={finishing} />
      {:else if mode === 'reverse' || mode === 'pick'}
        <CountCards {s} {cursor} {revealed} {groups} {drumroll} {audio} {reduced} {outlook} finished={finishing} onpick={pick} />
      {:else}
        <div class="vt-count-open"><BallotBox size={300} state="open" fill={0} /><h2>{finishing ? '결과를 모으고 있어요' : '준비되면 결과를 공개해 주세요'}</h2></div>
      {/if}
    </div>
  {/if}

  <footer class="vt-count-bar">
    <span class="vt-count-progress"><i style:transform={`scaleX(${progress})`}></i></span>
    <div class="vt-count-controls">
      {#if mode === 'instant' || alreadyCounted || (steps === 0 && mode !== 'pick')}
        <button class="vt-btn vt-count-action autoplay" onclick={skip} disabled={finishing || opening}><Play size={18} />결과 공개</button>
      {:else if mode !== 'pick'}
        <button class="vt-btn vt-count-action autoplay" aria-pressed={playing} onclick={togglePlay} disabled={finishing || opening || verdict || drumroll}>{#if playing}<Pause size={18} />멈춤{:else}<Play size={18} />자동 재생{/if}</button>
        <button class="vt-btn vt-count-action next" onclick={advance} disabled={finishing || opening || playing || verdict || drumroll}><StepForward size={18} />다음</button>
        <div class="vt-count-speed" role="radiogroup" aria-label="속도"><Gauge size={16} />
          {#each SPEEDS as sp}<button class="vt-chip" role="radio" aria-checked={speed === sp.id} onclick={() => (speed = sp.id)}>{sp.label}</button>{/each}
        </div>
      {:else if mode === 'pick'}
        <span class="vt-count-tip">공개할 카드를 눌러 주세요 · {revealed.length} / {s.items.length}</span>
      {/if}
      <span class="vt-count-spacer"></span>
      <div class="vt-count-skip-panel" class:confirming={confirmSkip} role="group" aria-label="결과로 건너뛰기">
        {#if confirmSkip}
          <span class="vt-count-confirm">결과로 건너뛸까요?</span>
          <button class="vt-btn vt-count-cancel" onclick={() => (confirmSkip = false)}>아니요</button>
          <button class="vt-btn vt-count-action skip" onclick={skip}><SkipForward size={18} />건너뛰기</button>
        {:else}
          <button class="vt-btn vt-count-action skip" onclick={() => (confirmSkip = true)} disabled={finishing}><SkipForward size={18} />결과로 건너뛰기</button>
        {/if}
      </div>
    </div>
  </footer>
</section>

<style>
  .vt-count.broadcast { background: #091525; }
  .broadcast .vt-count-heading { margin: 0; padding: 14px 24px; border: 0; border-bottom: 1px solid #32445a; border-radius: 0; background: #0c1c30; box-shadow: none; color: #f5f8ff; }
  .broadcast .vt-count-mode { background: #183751; color: #a5e5ed; border-color: #315b75; border-radius: 3px; }
  .broadcast .vt-count-heading h2 { font-size: clamp(22px,2.5cqi,34px); }
  .broadcast .vt-count-participation { border-color: #344b64; }
  .broadcast .vt-participation-icon { background: #20364e; color: #9bdfea; }
  .broadcast .vt-participation-label, .broadcast .vt-participation-total { color: #b9cee5; }
  .broadcast .vt-count-participation strong { color: #fff; }
  .broadcast .vt-count-bar { background: #102138; border-color: #344b64; padding: 10px 24px 12px; }
  .broadcast .vt-count-progress { display: none; }
  .broadcast .vt-count-speed { color: #c9d9eb; }
  .broadcast .vt-count-speed .vt-chip { background: #203650; color: #d8e8fb; border-color: #47617e; }
  .broadcast .vt-count-speed .vt-chip[aria-checked='true'] { background: #8de0ed; color: #09263d; border-color: #8de0ed; }
  .broadcast .vt-count-agenda { background: #152b44; border-color: #34516e; color: #f5f8ff; margin-block: 10px 0; padding-block: 10px; }
  .broadcast .vt-agenda-index > span, .broadcast .vt-agenda-index small { color: #b9cee5; }
  .broadcast .vt-agenda-index strong { color: #88dfea; }
  .broadcast .vt-count-open { color: #fff; }
  .broadcast .vt-count-confirm { color: #f5f8ff; }
  @media (max-height: 800px) {
    .broadcast .vt-count-heading { padding: 8px 20px; }
    .broadcast .vt-count-heading h2 { font-size: 26px; line-height: 1.2; }
    .broadcast .vt-count-participation strong { font-size: 26px; }
    .broadcast .vt-count-bar { padding: 8px 16px; }
  }

  .vt-count {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    transition: background var(--vt-slow) var(--vt-ease);
  }
  /* 레이스 막판: 배경이 아주 살짝 어두워집니다(4%) */
  .vt-count.tension {
    background: color-mix(in srgb, var(--vt-ink) 4%, transparent);
  }
  .vt-count-stage {
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .vt-count-agenda {
    flex: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    margin: 14px 28px 0;
    padding: 18px 22px;
    border: 1px solid color-mix(in srgb, #6288b9 30%, var(--vt-line));
    border-left: 5px solid #4478b8;
    border-radius: 16px;
    background: var(--vt-card);
    box-shadow: 0 3px 12px color-mix(in srgb, var(--vt-ink) 4%, transparent);
  }
  .vt-agenda-index { display: grid; gap: 5px; padding-right: 24px; border-right: 1px solid var(--vt-line); white-space: nowrap; }
  .vt-agenda-index > span { color: var(--vt-muted); font-size: 15px; font-weight: 800; }
  .vt-agenda-index strong { color: #35699f; font-size: 28px; line-height: 1; font-variant-numeric: tabular-nums; }
  .vt-agenda-index small { color: var(--vt-muted); font-size: 16px; }
  .vt-count-agenda h3 { min-width: 0; margin: 0; font-size: clamp(24px, 2.3cqi, 34px); line-height: 1.4; font-weight: 900; word-break: keep-all; overflow-wrap: anywhere; }
  .vt-agenda-outlook { display: inline-flex; align-items: center; }
  @container (max-width: 1100px) {
    .vt-count-agenda { margin: 12px 18px 0; padding: 14px 18px; gap: 18px; }
    .vt-agenda-index { padding-right: 18px; }
  }
  @container (max-width: 640px) {
    .vt-agenda-outlook { grid-column: 2; }
    .vt-count-agenda { margin: 12px 12px 0; padding: 14px; gap: 12px; }
    .vt-agenda-index { padding-right: 12px; }
    .vt-agenda-index > span { font-size: 12px; }
    .vt-agenda-index strong { font-size: 24px; }
    .vt-agenda-index small { font-size: 13px; }
    .vt-count-agenda h3 { font-size: 22px; }
  }
  .vt-count-open {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 16px;
    height: 100%;
  }
  .vt-count-open h2 {
    margin: 0;
    font-size: clamp(26px, 3.6cqi, 50px);
  }
  .vt-count-papers {
    position: absolute;
    top: 30%;
    left: 50%;
  }
  .vt-count-papers span {
    position: absolute;
    width: 34px;
    height: 44px;
    margin-left: -17px;
    border-radius: 4px;
    background: #fff;
    border: 2px solid color-mix(in srgb, var(--vt-ink) 30%, transparent);
    opacity: 0;
  }
  .vt-count-papers.animate span {
    animation: vt-papers-out 900ms var(--vt-ease) both;
    animation-delay: calc(200ms + var(--i) * 60ms);
  }
  @keyframes vt-papers-out {
    0% {
      opacity: 0;
      transform: translate(0, 30px) rotate(0);
    }
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(calc((var(--i) - 3) * 46px), -120px) rotate(calc((var(--i) - 3) * 14deg));
    }
  }
  .vt-count-bar {
    display: grid;
    gap: 10px;
    padding: 10px 22px 14px;
    border-top: 1px solid color-mix(in srgb, var(--vt-line) 70%, transparent);
    background: color-mix(in srgb, var(--vt-card) 82%, transparent);
  }
  .vt-count-progress {
    display: block;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--vt-line) 70%, transparent);
  }
  .vt-count-progress i {
    display: block;
    height: 100%;
    background: var(--vt-accent);
    transform-origin: left;
    transition: transform var(--vt-standard) var(--vt-ease);
  }
  .vt-count-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .vt-count-speed {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: 6px;
    color: var(--vt-muted);
  }
  .vt-count-speed .vt-chip {
    height: 34px;
    font-size: 13px;
  }
  .vt-count-spacer {
    flex: 1;
  }
  .vt-count-tip {
    color: var(--vt-muted);
    font-size: 15px;
    font-weight: 800;
  }
  .vt-count-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    margin: 18px 28px 0;
    padding: 14px 22px;
    border: 1px solid var(--vt-line);
    border-radius: 16px;
    background: linear-gradient(110deg, var(--vt-card), color-mix(in srgb, var(--vt-card) 94%, var(--vt-accent)));
    box-shadow: 0 3px 12px color-mix(in srgb, var(--vt-ink) 4%, transparent);
  }
  .vt-count-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-width: 0; }
  .vt-count-heading h2 { flex: 1 1 240px; min-width: 0; margin: 0; font-size: clamp(20px, 2.4cqi, 32px); line-height: 1.25; font-weight: 900; overflow-wrap: anywhere; }
  .vt-count-mode { flex: none; padding: 6px 10px; border: 1px solid color-mix(in srgb, var(--vt-accent) 16%, var(--vt-line)); border-radius: 8px; background: var(--vt-soft); color: var(--vt-muted); font-size: 12px; line-height: 1.2; font-weight: 800; white-space: nowrap; }
  .vt-count-mode.done { color: var(--vt-accent); }
  .vt-count-participation { display: flex; align-items: center; gap: 12px; padding-left: 24px; border-left: 1px solid var(--vt-line); }
  .vt-participation-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: color-mix(in srgb, var(--vt-accent) 9%, var(--vt-card)); color: var(--vt-accent); }
  .vt-participation-label { display: block; color: var(--vt-muted); font-size: 12px; line-height: 1.2; font-weight: 700; }
  .vt-count-participation p { display: flex; align-items: baseline; gap: 8px; margin: 3px 0 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .vt-count-participation strong { color: var(--vt-ink); font-size: 30px; line-height: 1; font-weight: 900; }
  .vt-participation-slash { color: var(--vt-line); font-size: 22px; font-weight: 400; }
  .vt-participation-total { color: var(--vt-muted); font-size: 21px; line-height: 1; font-weight: 800; }
  .vt-participation-total small { margin-left: 3px; font-size: 14px; font-weight: 700; }
  @container (max-width: 1100px) {
    .vt-count-heading { margin: 14px 18px 0; padding: 12px 16px; gap: 16px; }
    .vt-count-participation { padding-left: 16px; }
  }
  @container (max-width: 850px) {
    .vt-count-heading { margin: 12px 12px 0; padding: 10px 14px; gap: 14px; border-radius: 12px; }
    .vt-count-title { gap: 6px 10px; }
    .vt-count-heading h2 { flex-basis: 180px; font-size: 20px; }
    .vt-count-mode { padding: 5px 7px; font-size: 11px; }
    .vt-count-participation { padding-left: 14px; gap: 8px; }
    .vt-participation-icon { width: 32px; height: 32px; border-radius: 9px; }
    .vt-count-participation strong { font-size: 26px; }
    .vt-participation-total { font-size: 18px; }
  }
  @container (max-width: 500px) {
    .vt-count-mode, .vt-participation-icon { display: none; }
    .vt-count-heading { gap: 10px; }
    .vt-count-heading h2 { font-size: 18px; }
    .vt-count-participation { padding-left: 10px; }
    .vt-count-participation p { gap: 5px; }
  }
  .vt-count-controls :global(button) { white-space: nowrap; }
  /* One quiet edge and stronger name ink, without changing candidate colors. */
  .vt-count :global([data-leading='true']) { box-shadow: inset 3px 0 0 var(--vt-accent); }
  .vt-count :global([data-leading='true'] .vt-leader-name) { color: var(--vt-accent); }
  .vt-count :global([data-leading]) { transition: box-shadow 260ms cubic-bezier(.2,0,0,1); }
  .vt-count :global(.vt-leader-name) { transition: color 260ms cubic-bezier(.2,0,0,1); }
  @media (forced-colors: active) { .vt-count :global([data-leading='true']) { outline: 2px solid Highlight; outline-offset: -2px; } }
  :global(.vt-root.reduced .vt-count *) { animation: none !important; transition: none !important; }
</style>
