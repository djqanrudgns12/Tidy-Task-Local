<script lang="ts">
  // 투표 부스(PRD 6절): 투표판 → 저장 → "투표했어요!"(잠깐) → 봉인 → "다음 친구 차례예요"(잠깐) → 투표판.
  // 스페이스바 · Enter 없이 흐릅니다(2026-09-26): 첫 친구는 곧바로 투표판, 번호를 누르면 두 장면이 저절로 지나고 다음 투표판이 열립니다.
  // 다시 투표하기는 투표판 오른쪽 위 버튼이나 백스페이스 → 확인 팝업(UndoDialog) → 직전 표(저장소 lastBallotId)를 뺍니다.
  // 상태 기계는 ballot.js의 reduce, 화면은 view()만 봅니다. 저장·소리는 상태 기계가 돌려준 효과를 여기서 실행합니다.
  // 키는 VoteApp이 창 전체에서 잡아 key()로 넘겨 줍니다(선생님 메뉴·경고·확인창이 떠 있으면 held로 막힘).
  // 멈춤 화면("잠시 쉬어요")과 초점 가림막("키보드를 기다려요")은 없앴습니다(2026-09-26) — 선생님이 멈추지 않았는데
  // 투표가 멈춘 것처럼 보였습니다. 창이 키보드를 잃어도 되찾지 않고, 투표판 왼쪽 위에 작은 알림만 띄웁니다(keyboardAway).
  import { onDestroy, untrack } from 'svelte';
  import { Flag, Trash2, Undo2, Keyboard } from 'lucide-svelte';
  import { boothConfig, initialBooth, reduce, view, dueAt, HINT_MS, HANDOFF_MS } from '../../../lib/vote/ballot.js';
  import BallotScreen from './BallotScreen.svelte';
  import UndoDialog from './UndoDialog.svelte';
  import BallotBox from '../art/BallotBox.svelte';
  import Keycap from '../common/Keycap.svelte';
  let {
    session, audio, reduced, held, keyboardAway = false, fontFamily = '',
    onSave, onRemove, onSealed, onclosevote, oncancel,
  } = $props<{
    session: any; audio: any; reduced: boolean; held: boolean; keyboardAway?: boolean; fontFamily?: string;
    onSave: (ballot: any, u: number) => Promise<string>; onRemove: (id: string) => Promise<boolean>; onSealed: () => void;
    onclosevote: () => void; oncancel: () => void;
  }>();

  const config = $derived(boothConfig(session));
  // 부스 상태 기계의 현재 값. 이름을 state로 두면 Svelte가 $state를 'state 스토어 구독'으로 읽으므로 machine이라 부릅니다.
  let machine = $state.raw(initialBooth());
  let now = $state(performance.now());
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  let sessionId = untrack(() => session.id);
  let alive = true, generation = 0;
  // 저절로 넘어가는 시각(투표했어요 → 봉인, 다음 친구 → 새 투표판)에 tick 하나만 걸어 둡니다.
  let dueTimer: ReturnType<typeof setTimeout> | undefined;
  let scheduledDue: number | null = null;
  function scheduleDue() {
    const due = dueAt(machine);
    if (due === scheduledDue) return;
    if (dueTimer) {
      clearTimeout(dueTimer);
      timers.delete(dueTimer);
    }
    scheduledDue = due;
    dueTimer = due === null ? undefined : later(() => {
      dueTimer = undefined;
      scheduledDue = null;
      dispatch({ type: 'tick' });
    }, Math.max(0, due - now) + 5);
  }
  // 백스페이스·[다시 투표하기]가 뺄 표: 선생님의 [직전 표 취소]와 같은 "가장 최근에 들어온 표".
  const undoId = () => untrack(() => (session.id && session.phase === 'voting' ? session.lastBallotId ?? null : null));

  function dispatch(event: any) {
    now = event.now ?? performance.now();
    const before = machine;
    const r = reduce(machine, { ...event, now }, config);
    machine = r.state;
    for (const effect of r.effects) run(effect);
    // 투표했어요 · 다음 친구 화면은 시간이 되면 저절로 넘어갑니다(막혔거나 팝업이 떠 있으면 풀릴 때 — ballot.js).
    scheduleDue();
    // 안내 문구는 2초 뒤 스스로 사라지게 다시 그립니다.
    if (machine.hint && machine.hint !== before.hint) later(() => dispatch({ type: 'tick' }), HINT_MS + 10);
  }

  function run(effect: any) {
    const mine = generation;
    const current = () => alive && mine === generation;
    switch (effect.type) {
      case 'save': {
        const go = () => { if (!current()) return; return onSave(effect.ballot, effect.u).then((result: string) => {
          if (current()) dispatch({ type: result === 'saved' ? 'saved' : result === 'rejected' ? 'rejected' : 'failed' });
        }).catch(() => { if (current()) dispatch({ type:'failed' }); }); };
        if (effect.delay) later(go, effect.delay);
        else void go();
        break;
      }
      case 'remove':
        void onRemove(effect.id).then((removed: boolean) => { if (current()) dispatch({ type: removed ? 'removed' : 'removeFailed' }); }).catch(() => { if (current()) dispatch({type:'removeFailed'}); });
        break;
      case 'play':
        audio.play(effect.cue);
        break;
      case 'sealed':
        onSealed();
        break;
    }
  }

  /** VoteApp이 학생 키를 넘겨 줍니다. */
  export function key(code: string, repeat: boolean) {
    dispatch({ type: 'key', code, repeat, undoId: undoId() });
  }
  /** 아직 저장하지 않은 상태인지(다음 친구 기다림·고르는 중). 선생님이 인원을 받은 표 수로 줄였을 때 곧바로 마감해도 되는지 VoteApp이 묻습니다.
   * 투표했어요 화면이면 false — 곧 저절로 봉인되고 onSealed가 마감합니다. */
  export function idle() {
    return machine.screen === 'next' || machine.screen === 'open';
  }

  // 선생님 메뉴·경고·확인창이 떠 있으면 키를 받지 않습니다.
  $effect(() => {
    const h = held;
    untrack(() => dispatch({ type: h ? 'hold' : 'release' }));
  });
  // 다른 투표로 바뀌면(결선 등) 부스를 처음 상태로.
  $effect(() => {
    const id = session.id;
    if (id !== untrack(() => sessionId)) {
      sessionId = id;
      generation++;
      timers.forEach(clearTimeout); timers.clear();
      dueTimer = undefined;
      scheduledDue = null;
      untrack(() => dispatch({ type: 'reset' }));
    }
  });
  onDestroy(() => { alive = false; generation++; timers.forEach((t) => clearTimeout(t)); });
  // 선생님 창에서 방금 표를 취소했으면, 이미 없는 표의 "투표했어요" 화면을 남기지 않고 곧바로 새 투표판으로.
  $effect(() => {
    const ballots = session.ballots;
    if (machine.screen === 'done' && machine.ballot && !ballots.some((b:any) => b.id === machine.ballot?.id)) {
      untrack(() => { generation++; dispatch({type:'reset'}); });
    }
  });
  // 다시 투표하기 팝업이 떠 있는 사이 그 표가 사라지면(선생님 창의 [직전 표 취소] · 마감 · 다음 표) 팝업만 닫습니다.
  $effect(() => {
    const target = machine.asking;
    const last = session.id && session.phase === 'voting' ? session.lastBallotId : null;
    if (target && target !== last) untrack(() => dispatch({ type: 'undoGone' }));
  });

  const vm = $derived(view(machine, config, now));
  const participation = $derived(session.rules.voters ? session.ballots.length / session.rules.voters : 0);
  // 마지막 친구까지 투표했으면 "다음 친구" 대신 "모두 투표했어요" — 곧 개표 대기 화면으로 바뀝니다.
  const full = $derived(session.ballots.length >= session.rules.voters);
  const next = $derived(vm.screen === 'next');
  // 오른쪽 위 [다시 투표하기]: 뺄 직전 표가 있을 때만 보입니다(첫 친구 · 이미 다시 한 뒤에는 숨김).
  const canUndo = $derived(vm.screen === 'open' && !!session.id && session.phase === 'voting' && !!session.lastBallotId);
  // 표가 함에 들어갈 때 터지는 반짝이(모든 표에 같은 자리·색·순서 — 비밀 원칙).
  const SPARKS = [
    { x: -104, y: -30, s: 22, c: 'var(--vt-gold)', d: 0 },
    { x: 96, y: -46, s: 19, c: '#f29a8f', d: 50 },
    { x: -58, y: -92, s: 14, c: '#95d9bf', d: 90 },
    { x: 60, y: -104, s: 16, c: 'var(--vt-gold)', d: 30 },
    { x: -128, y: 18, s: 12, c: '#9cc8f0', d: 120 },
    { x: 126, y: 10, s: 13, c: '#95d9bf', d: 70 },
  ];
</script>

<!-- 투표판 오른쪽 아래의 선생님 버튼(선생님 메뉴의 [마감하고 개표하기]·[투표 그만두기]와 같은 동작).
     마우스로만 눌립니다: tabindex=-1이라 키보드 초점이 가지 않고, 학생 키(Enter·Space 포함)는 VoteApp이 창 전체에서 먼저 잡습니다.
     누르면 곧바로 실행하지 않고 확인창(마우스 전용)을 거칩니다 — 학생이 실수로 눌러도 투표가 끝나지 않게. -->
{#snippet teacherActions()}
  <button class="vt-corner-btn" tabindex="-1" onclick={onclosevote}><Flag size={16} />마감하고 개표하기</button>
  <button class="vt-corner-btn danger" tabindex="-1" onclick={oncancel}><Trash2 size={16} />투표 그만두기</button>
{/snippet}
<!-- 투표판 오른쪽 위: 방금 친구가 다시 투표하기(백스페이스와 같음). 누르면 곧바로 빼지 않고 팝업을 거칩니다. tabindex=-1 — 키는 VoteApp이 잡음. -->
{#snippet undoButton()}
  {#if canUndo}
    <button class="vt-redo-btn" tabindex="-1" disabled={held} onclick={() => dispatch({ type: 'undo', undoId: undoId() })}>
      <Undo2 size={20} /><span>다시 투표하기</span><Keycap label="← 백스페이스" size={38} wide />
    </button>
  {/if}
{/snippet}
<!-- 투표판 왼쪽 위: 다른 창을 눌러 키보드가 그쪽에 있을 때만. 막지도, 초점을 빼앗지도 않고 알려 주기만 합니다. -->
{#snippet keyboardNotice()}
  {#if keyboardAway}
    <span class="vt-kb-away" role="status"><Keyboard size={18} /><span><b>키보드가 다른 창에 있어요</b>투표판을 한 번 누르면 숫자를 받아요</span></span>
  {/if}
{/snippet}

<div class="vt-booth" data-screen={vm.screen}>
  {#if vm.screen === 'open' || vm.screen === 'removing'}
    <!-- 다시 투표하기로 표를 빼는 동안(removing)도 같은 투표판을 둡니다(투표했어요 장면이 번쩍 지나가지 않게). -->
    <BallotScreen {session} {vm} {reduced} actions={teacherActions} lead={keyboardNotice} trail={undoButton} />
  {:else if vm.screen === 'error'}
    <section class="vt-booth-msg vt-stage-enter">
      <h2>표가 아직 함에 들어가지 않았어요</h2>
      <p>선생님을 불러 주세요.</p>
      <button class="vt-btn primary big" tabindex="-1" onclick={() => dispatch({ type: 'retry' })}>다시 저장</button>
    </section>
  {:else}
    <!-- 저장 중·투표했어요·다음 친구: 모두 같은 그림(어떤 번호였든, 기권이었든 같음).
         한 장면으로 저절로 이어집니다: 용지가 함에 쏙 → 함이 꿀꺽·하트·반짝 → (DONE_MS 뒤) 함이 폴짝 인사하며 "다음 친구 차례예요" → 점 셋이 차면 새 투표판. -->
    <section class="vt-done" class:animate={!reduced} class:next>
      {#key vm.doneSeq}
        <div class="vt-done-art" class:landed={vm.screen !== 'saving'}>
          {#if vm.screen !== 'saving'}
            <div class="vt-drop" aria-hidden="true">
              <svg class="vt-paper" viewBox="0 0 80 100"><rect x="4" y="4" width="72" height="92" rx="8" /><path d="M4 50h72" class="fold" /><path d="m26 52 10 10 18-20" class="check" /></svg>
            </div>
            <div class="vt-burst" aria-hidden="true">
              <svg class="vt-heart" viewBox="0 0 24 24"><path d="M12 20.6c-.5-.3-8.6-5-8.6-10.6 0-2.8 2.1-5 4.8-5 1.7 0 3.1.9 3.8 2.2.7-1.3 2.1-2.2 3.8-2.2 2.7 0 4.8 2.2 4.8 5 0 5.6-8.1 10.3-8.6 10.6Z" /></svg>
              {#each SPARKS as sp}
                <svg class="vt-spark" viewBox="0 0 24 24" style:--x={`${sp.x}px`} style:--y={`${sp.y}px`} style:--s={`${sp.s}px`} style:--c={sp.c} style:--d={`${sp.d}ms`}><path d="M12 2.5Q13.3 10.7 21.5 12 13.3 13.3 12 21.5 10.7 13.3 2.5 12 10.7 10.7 12 2.5Z" /></svg>
              {/each}
            </div>
          {/if}
          <div class="vt-done-box"><BallotBox size={250} fill={participation} /></div>
        </div>
      {/key}
      {#key next}
        <h2 class="vt-done-title">{next ? (full ? '모두 투표했어요!' : '다음 친구 차례예요') : vm.screen === 'saving' ? '표를 저장하고 있어요' : '투표했어요!'}</h2>
      {/key}
      <!-- 투표했어요 줄은 비워 두고(곧 저절로 넘어감 — Enter·버튼 없음), 다음 친구 줄에서 남은 시간을 점 셋으로 보여 줍니다.
           높이를 고정해 제목이 흔들리지 않게 합니다. -->
      <div class="vt-done-foot">
        {#if next && !full}
          <p class="vt-next-copy">
            투표판이 곧 열려요
            <span class="vt-next-dots" style:--ms={`${HANDOFF_MS}ms`} aria-hidden="true"><i style:--i={0}></i><i style:--i={1}></i><i style:--i={2}></i></span>
          </p>
        {/if}
      </div>
      {#if vm.hint}<p class="vt-booth-hint">{vm.hint}</p>{/if}
    </section>
  {/if}
  {#if vm.asking}
    <UndoDialog onyes={() => dispatch({ type: 'undoYes' })} onno={() => dispatch({ type: 'undoNo' })} />
  {/if}
</div>

<style>
  .vt-booth {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* ── 완료 · 다음 친구(한 장면) ── */
  .vt-done {
    flex: 1;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 14px;
    padding: 20px;
    text-align: center;
  }
  .vt-done-art {
    position: relative;
    display: grid;
    place-items: end center;
    height: 300px;
  }
  .vt-drop {
    position: absolute;
    top: 0;
    left: 50%;
    width: 80px;
    margin-left: -40px;
    z-index: 0;
  }
  .vt-paper {
    display: block;
    width: 80px;
  }
  .vt-paper rect {
    fill: #fff;
    stroke: color-mix(in srgb, var(--vt-ink) 40%, transparent);
    stroke-width: 2.5;
  }
  .vt-paper .fold {
    stroke: color-mix(in srgb, var(--vt-ink) 20%, transparent);
    stroke-width: 2;
    stroke-dasharray: 4 4;
  }
  .vt-paper .check {
    fill: none;
    stroke: var(--vt-accent);
    stroke-width: 7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .vt-done-box {
    position: relative;
    z-index: 1;
    transform-origin: 50% 100%;
  }
  /* 하트·반짝이는 투표함 틈(위에서 약 150px) 앞에서 퍼집니다. */
  .vt-burst {
    position: absolute;
    top: 150px;
    left: 50%;
    z-index: 2;
    width: 0;
    height: 0;
  }
  .vt-heart {
    position: absolute;
    left: -21px;
    top: -30px;
    width: 42px;
    height: 42px;
    fill: #f29a8f;
    stroke: #fff;
    stroke-width: 1.6;
    opacity: 0;
  }
  .vt-spark {
    position: absolute;
    left: calc(var(--s) / -2);
    top: calc(var(--s) / -2);
    width: var(--s);
    height: var(--s);
    fill: var(--c);
    opacity: 0;
  }
  /* 용지가 반으로 접힌 뒤(180ms) 틈으로 미끄러져 들어가고(340ms), 들어가는 순간 함이 "꿀꺽" 눌렸다 튀어 오르며
     하트가 퐁 떠오르고 반짝이가 톡톡 터집니다. 모든 표가 같은 움직임·같은 순서입니다(비밀 원칙). */
  .vt-done.animate .vt-drop {
    animation: vt-drop 520ms var(--vt-ease) both;
  }
  .vt-done.animate .vt-paper {
    animation: vt-fold 180ms var(--vt-ease) both;
    transform-origin: 50% 50%;
  }
  .vt-done.animate .landed .vt-done-box {
    animation: vt-gulp 520ms var(--vt-ease) 330ms both;
  }
  .vt-done.animate .vt-heart {
    animation: vt-heart-float 1100ms var(--vt-ease) 380ms both;
  }
  .vt-done.animate .vt-spark {
    animation: vt-spark 720ms var(--vt-ease) calc(360ms + var(--d)) both;
  }
  /* 다음 친구 차례: 함이 폴짝 뛰며 고개를 갸웃(인사) — 한 번만 */
  .vt-done.animate.next .vt-done-box {
    animation: vt-hello 760ms var(--vt-ease) both;
  }
  @keyframes vt-fold {
    from {
      transform: scaleY(1);
    }
    to {
      transform: scaleY(0.52);
    }
  }
  @keyframes vt-drop {
    0% {
      transform: translateY(-10px);
      opacity: 1;
    }
    35% {
      transform: translateY(20px);
      opacity: 1;
    }
    100% {
      transform: translateY(150px);
      opacity: 0;
    }
  }
  @keyframes vt-gulp {
    0%, 100% {
      transform: none;
    }
    28% {
      transform: scale(1.06, 0.9);
    }
    58% {
      transform: scale(0.97, 1.05) translateY(-4px);
    }
    80% {
      transform: scale(1.01, 0.99);
    }
  }
  @keyframes vt-heart-float {
    0% {
      opacity: 0;
      transform: translateY(10px) scale(0.3);
    }
    22% {
      opacity: 1;
      transform: translateY(-14px) scale(1.12);
    }
    40% {
      transform: translateY(-26px) scale(1) rotate(-6deg);
    }
    70% {
      opacity: 1;
      transform: translateY(-62px) scale(0.96) rotate(5deg);
    }
    100% {
      opacity: 0;
      transform: translateY(-92px) scale(0.9) rotate(-3deg);
    }
  }
  @keyframes vt-spark {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0) rotate(0deg);
    }
    35% {
      opacity: 1;
      transform: translate(var(--x), var(--y)) scale(1) rotate(25deg);
    }
    100% {
      opacity: 0;
      transform: translate(calc(var(--x) * 1.12), calc(var(--y) * 1.12 - 8px)) scale(0.2) rotate(70deg);
    }
  }
  @keyframes vt-hello {
    0%, 100% {
      transform: none;
    }
    22% {
      transform: translateY(-16px) rotate(-5deg);
    }
    44% {
      transform: translateY(0) scale(1.04, 0.95);
    }
    62% {
      transform: rotate(4deg);
    }
    82% {
      transform: rotate(-1.5deg);
    }
  }
  .vt-done:not(.animate) :is(.vt-drop, .vt-burst) {
    display: none;
  }
  /* 동작 줄이기: 튀어 오르지 않고 살짝 나타나기만 합니다(vote.css의 vt-fade). */
  .vt-done:not(.animate) :is(.vt-done-title, .vt-next-copy) {
    animation: vt-fade 120ms linear both;
  }
  .vt-done-title {
    margin: 0;
    font-size: clamp(34px, 5cqi, 72px);
    font-weight: 900;
    letter-spacing: -0.02em;
    word-break: keep-all;
    animation: vt-pop-in var(--vt-standard) var(--vt-ease-pop) 180ms both;
  }
  .vt-done.next .vt-done-title {
    animation-delay: 60ms;
  }
  /* "투표판이 곧 열려요" 줄. 투표했어요 화면에서도 자리를 지켜 제목이 흔들리지 않게 높이를 고정합니다. */
  .vt-done-foot {
    display: grid;
    place-items: start center;
    min-height: 76px;
  }
  .vt-next-copy {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    color: var(--vt-muted);
    font-size: clamp(16px, 1.7cqi, 24px);
    font-weight: 800;
    animation: vt-stage-in var(--vt-standard) var(--vt-ease) 140ms both;
  }
  /* 점 셋이 차례로 톡톡 차오르면 새 투표판이 열립니다(남은 시간을 눈으로 보여 주는 작은 초시계). */
  .vt-next-dots {
    display: inline-flex;
    gap: 7px;
  }
  .vt-next-dots i {
    width: 0.62em;
    height: 0.62em;
    border: 2.5px solid color-mix(in srgb, var(--vt-accent) 55%, transparent);
    border-radius: 50%;
    animation: vt-next-dot 300ms var(--vt-ease-pop) calc(var(--i) * var(--ms) / 3 + 120ms) both;
  }
  @keyframes vt-next-dot {
    from {
      transform: scale(1);
    }
    55% {
      transform: scale(1.35);
    }
    to {
      border-color: var(--vt-accent);
      background: var(--vt-accent);
      transform: scale(1);
    }
  }
  .vt-done:not(.animate) .vt-next-dots i {
    animation-name: vt-next-dot-still;
    animation-timing-function: linear;
    animation-duration: 1ms;
  }
  @keyframes vt-next-dot-still {
    to {
      border-color: var(--vt-accent);
      background: var(--vt-accent);
    }
  }
  .vt-booth-hint {
    margin: 0;
    padding: 10px 20px;
    border-radius: 999px;
    background: var(--vt-card);
    box-shadow: var(--vt-shadow);
    font-size: clamp(15px, 1.6cqi, 22px);
    font-weight: 800;
  }
  .vt-booth-msg {
    margin: auto;
    display: grid;
    justify-items: center;
    gap: 10px;
    text-align: center;
  }
  .vt-booth-msg h2 {
    margin: 0;
    font-size: clamp(26px, 3.4cqi, 44px);
  }
  .vt-booth-msg p {
    margin: 0 0 12px;
    color: var(--vt-muted);
    font-size: 20px;
    font-weight: 800;
  }
  /* ── 선생님 버튼(투표판 오른쪽 아래) ── 학생 화면을 가리지 않게 평소에는 옅게, 마우스를 올리면 또렷하게 */
  .vt-corner-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 14px;
    border: 1px solid var(--vt-line);
    border-radius: 999px;
    background: var(--vt-card);
    color: var(--vt-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
    opacity: 0.75;
    cursor: pointer;
    transition: opacity var(--vt-quick) var(--vt-ease), background var(--vt-quick) var(--vt-ease), color var(--vt-quick) var(--vt-ease);
  }
  .vt-corner-btn:hover {
    opacity: 1;
    background: var(--vt-soft);
    color: var(--vt-ink);
  }
  .vt-corner-btn.danger:hover {
    color: var(--vt-danger);
  }
  /* ── 다시 투표하기(투표판 오른쪽 위) ── 학생도 알아보게 선생님 버튼보다 또렷하지만, 투표 카드보다는 차분하게 */
  .vt-redo-btn {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 52px;
    padding: 0 10px 0 16px;
    border: 1px solid var(--vt-line);
    border-radius: 999px;
    background: var(--vt-card);
    color: var(--vt-ink);
    font: inherit;
    font-size: clamp(15px, 1.35cqi, 18px);
    font-weight: 800;
    white-space: nowrap;
    box-shadow: var(--vt-shadow);
    cursor: pointer;
    animation: vt-fade var(--vt-standard) var(--vt-ease) 200ms both;
    transition: background var(--vt-quick) var(--vt-ease), transform var(--vt-quick) var(--vt-ease);
  }
  .vt-redo-btn :global(svg) {
    color: var(--vt-accent);
  }
  .vt-redo-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--vt-soft) 60%, var(--vt-card));
  }
  .vt-redo-btn:active:not(:disabled) {
    transform: translateY(2px);
  }
  /* 창이 좁으면 키 그림을 빼고 글자만(제목 자리를 넉넉히) */
  @container (max-width: 980px) {
    .vt-redo-btn :global(.vt-keycap) {
      display: none;
    }
    .vt-redo-btn {
      padding-right: 16px;
    }
  }
  /* ── 키보드가 다른 창에 있음(투표판 왼쪽 위) ── 막지 않는 작은 알림 */
  .vt-kb-away {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    max-width: 300px;
    padding: 9px 14px;
    border: 1px solid color-mix(in srgb, var(--vt-gold) 70%, var(--vt-line));
    border-radius: 16px;
    background: color-mix(in srgb, var(--vt-gold) 16%, var(--vt-card));
    color: var(--vt-ink);
    font-size: 13px;
    font-weight: 700;
    text-align: left;
    word-break: keep-all;
    animation: vt-fade var(--vt-standard) var(--vt-ease) both;
  }
  .vt-kb-away > :global(svg) {
    flex: none;
    color: #8a6512;
  }
  .vt-kb-away span {
    display: grid;
    gap: 1px;
  }
  .vt-kb-away b {
    font-size: 14.5px;
    font-weight: 900;
  }
  :global(.vt-root[data-scheme='dark']) .vt-kb-away > :global(svg) {
    color: var(--vt-gold);
  }
</style>
