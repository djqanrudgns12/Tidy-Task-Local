<script lang="ts">
  // 선생님 창(vote-teacher, PRD 7절 "선생님 창 따로 열기"): 두 번째 모니터·노트북 화면에 띄우는 조종실.
  //  - 멈춤·인원·직전 표 취소·마감·개표 시작은 투표판과 같은 저장소(session)를 같은 변경 함수(ballots.js)로 고칩니다.
  //  - 안내 넘기기·개표 재생/다음/속도·골라 공개는 저장하지 않는 신호(remote.js)로 투표판에 부탁합니다.
  //  - 투표 중에 이 창을 누르면 키보드가 이 창으로 옵니다. 누른 뒤 0.15초 만에 투표판으로 돌려줘 다음 학생의 숫자키가 투표판에 가게 합니다.
  //  - 학생 키가 이 창의 버튼을 누르지 않도록, 투표 단계에서는 Esc 말고 모든 키를 막습니다(확인창도 마우스로만).
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Pin, X, Pause, Play, Undo2, BookOpen, Flag, PartyPopper, Minus, Plus, ArrowLeft, ArrowRight, SkipForward, StepForward, MonitorUp, Keyboard, Trash2, Eye } from 'lucide-svelte';
  import { native } from '../../lib/toolkit/store.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import ToolIcon from '../toolkit/ToolIcon.svelte';
  import { createVoteStore } from '../../lib/vote/store.js';
  import { EMPTY_SESSION, LIMITS, normalizePrefs, typeLabel, modeName, phaseLabel } from '../../lib/vote/model.js';
  import * as B from '../../lib/vote/ballots.js';
  import { resultModel, resultSummary } from '../../lib/vote/result.js';
  import { paletteOf } from '../../lib/vote/palette.js';
  import { setPinned, focusBoard, showBoard, openVoteWindows, BOARD_LABEL } from '../../lib/vote/windows.js';
  import { send, receive } from '../../lib/vote/remote.js';
  import Sticker from './common/Sticker.svelte';
  import ConfirmDialog from './teacher/ConfirmDialog.svelte';
  import MusicToggle from './common/MusicToggle.svelte';
  import { musicTogglePatch } from '../../lib/vote/music.js';
  import './vote.css';

  // ── 저장소(투표판과 같은 파일·구역) ──
  let session = $state.raw<any>(EMPTY_SESSION);
  let archive = $state.raw<any>({ entries: [] });
  let prefs = $state.raw<any>(normalizePrefs(undefined));
  let ready = $state(false);
  const store = createVoteStore({
    onSession: (d) => (session = d),
    onArchive: (d) => (archive = d),
    onDraft: () => {},
    onPrefs: (d) => (prefs = d),
    onError: (m) => { if (m) showToast(m); },
    onNotice: (m) => showToast(m),
  });

  const phase = $derived(session.id ? session.phase : 'none');
  const voting = $derived(phase === 'voting' || phase === 'paused');
  // 학생이 키보드 앞에 있는 단계: 이 창이 키를 받으면 안 됩니다.
  const studentPhase = $derived(voting || phase === 'closed');
  const participation = $derived(session.id && session.rules.voters ? session.ballots.length / session.rules.voters : 0);

  // ── 투표판에서 온 상태 ──
  let boardFocused = $state<boolean | null>(null);
  let tutorial = $state<{ index: number; total: number; title: string; playing: boolean } | null>(null);
  let counting = $state<any>(null);
  let boardOpen = $state(true);
  function onState(p: any) {
    if (!p || typeof p !== 'object') return;
    if (p.kind === 'focus') boardFocused = !!p.focused;
    else if (p.kind === 'tutorial') tutorial = { index: p.index, total: p.total, title: p.title, playing: p.playing };
    else if (p.kind === 'tutorial-end') tutorial = null;
    else if (p.kind === 'counting') counting = p;
    else if (p.kind === 'counting-end') counting = null;
  }
  const remote = (payload: Record<string, unknown>) => void send('vote-remote', payload);

  // ── 알림 띠·확인창 ──
  let toast = $state<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(text: string, action?: { label: string; run: () => void }, ms = 5000) {
    clearTimeout(toastTimer);
    toast = { text, action };
    toastTimer = setTimeout(() => (toast = null), ms);
  }
  type Ask = { title: string; detail?: string; ok: string; danger?: boolean; action: () => void };
  let confirmState = $state<Ask | null>(null);

  // ── 누른 뒤 키보드를 투표판으로 돌려주기 ──
  let refocusTimer: ReturnType<typeof setTimeout> | undefined;
  function handBack() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!studentPhase && phase !== 'tutorial') return;
    clearTimeout(refocusTimer);
    refocusTimer = setTimeout(() => void focusBoard().catch(() => {}), 150);
  }
  /** 버튼 동작 + 키보드 돌려주기. */
  const act = (run: () => void) => () => {
    run();
    handBack();
  };

  // ── 조작 ──
  // 배경 음악은 투표판 창에서만 나옵니다(이 창은 설정만 바꿈 — 두 창에서 음악이 겹치지 않게). 같은 설정(prefs.music)이라
  // 여기서 끄면 투표판의 모든 화면에서도 꺼진 채로 있고, 켜는데 전체 소리가 꺼져 있으면 함께 켭니다.
  function toggleMusic() {
    const on = !prefs.music;
    store.prefs.mutate((p: any) => ({ ...p, ...musicTogglePatch(p, on) }));
    showToast(on ? '배경 음악을 켰어요' : '배경 음악을 껐어요 — 다시 켤 때까지 모든 화면에서 꺼져 있어요', undefined, 3000);
  }
  const setVoters = (n: number) => store.session.mutate(B.setVoters(n));
  const begin = (p: 'tutorial' | 'voting') => store.session.mutate(B.begin(p));
  function startCounting() {
    if (!boardOpen) {
      showToast('투표판을 먼저 열어 주세요 — 개표는 투표판에서 보여요');
      return;
    }
    store.session.mutate(B.startCounting);
  }
  function askVoidLast() {
    confirmState = {
      title: '직전에 들어온 표 1장을 취소할까요?',
      detail: '표의 내용은 보이지 않아요. 취소한 친구는 다시 투표하면 돼요.',
      ok: '취소하기',
      danger: true,
      action: async () => {
        const r = await store.session.mutateAndConfirm(B.voidLast, (d: any) => !d.lastBallotId);
        showToast(r === 'saved' ? '직전 표 1장을 취소했어요' : '취소할 표가 없어요');
      },
    };
  }
  function askClose() {
    const s = session;
    confirmState = {
      title: `${s.rules.voters}명 중 ${s.ballots.length}명이 투표했어요. 지금 마감할까요?`,
      detail: '마감하면 투표판이 개표를 기다리는 화면으로 바뀌어요.',
      ok: '마감하기',
      action: async () => {
        const cur = session;
        if (cur.phase !== 'voting' && cur.phase !== 'paused') return;
        const r = await store.session.mutateAndConfirm(B.close(B.countingOrder(cur)), (d: any) => d.phase === 'closed');
        if (r !== 'saved') showToast('마감하지 못했어요. 다시 눌러 주세요.');
      },
    };
  }
  function askSkip() {
    confirmState = {
      title: '개표를 끝까지 건너뛸까요?',
      detail: '남은 표를 한꺼번에 세고 결과로 넘어가요.',
      ok: '건너뛰기',
      action: () => remote({ kind: 'counting', action: 'skip' }),
    };
  }
  function askCancel() {
    const s = session;
    confirmState = {
      title: s.ballots.length ? `투표를 그만두면 받은 표 ${s.ballots.length}장이 사라져요` : '이 투표를 그만둘까요?',
      detail: '10초 안에는 되돌릴 수 있어요.',
      ok: '그만두기',
      danger: true,
      action: async () => {
        const r = await store.session.mutateAndConfirm(() => ({ id: null }), (d: any) => !d.id);
        if (r !== 'saved') return;
        showToast('투표를 그만뒀어요', { label: '되돌리기', run: () => void store.session.mutateAndConfirm(B.restoreCancelled(s), (d: any) => d.id === s.id) }, 10000);
      },
    };
  }
  async function openBoard() {
    await showBoard().catch(() => {});
    boardOpen = true;
    remote({ kind: 'sync' });
  }

  // ── 최근 결과(선생님만 — 공개 범위와 상관없이 모든 득표) ──
  const latest = $derived(archive.entries[0] ?? null);
  const latestModel = $derived(latest ? resultModel(latest, { teacher: true }) : null);
  // 펼친 기록의 id를 기억합니다. 새 결과가 들어오면 저절로 접혀, 다음 투표의 득표가 누르지 않았는데 펼쳐져 보이지 않게 합니다.
  let shownLatestId = $state<string | null>(null);
  const showLatest = $derived(!!latest && shownLatestId === latest.id);

  // ── 창 ──
  let pinned = $state(false);
  let scheme = $state<'light' | 'dark'>('light');
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });
  async function doPin() {
    try {
      await setPinned(!pinned);
      pinned = !pinned;
    } catch {}
  }
  async function doClose() {
    await store.settle().catch(() => {});
    await closeWindow();
  }
  function readAppearance() {
    scheme = document.documentElement.style.colorScheme === 'dark' ? 'dark' : 'light';
  }

  // 투표 단계에서는 학생 키가 이 창의 버튼을 누르지 않게 막습니다(Esc는 확인창 닫기만).
  function onKeyCapture(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (confirmState) confirmState = null;
      return;
    }
    if (!studentPhase) return;
    if (e.target instanceof Element && e.target.closest('input, textarea')) return;
    e.preventDefault();
    e.stopPropagation();
    // 키가 이 창으로 잘못 왔다면 투표판으로 돌려줍니다.
    handBack();
  }
  function onKeyUpCapture(e: KeyboardEvent) {
    if (!studentPhase || e.key === 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
  }
  // 투표 중에는 이 창의 빈 곳을 눌러도(버튼이 아니어도) 키보드를 투표판에 돌려줍니다.
  // 투표판은 키보드를 스스로 되찾지 않으므로(2026-09-26 — 다른 창 입력을 방해했음), 선생님 창을 쓴 뒤에는 여기서 꼭 돌려줘야 합니다.
  // 이 창을 쓴 직후에만 돌려주고, 다른 프로그램의 창은 건드리지 않습니다.
  function onPointerUp() {
    if (studentPhase) handBack();
  }

  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    readAppearance();
    const observer = new MutationObserver(readAppearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('keydown', onKeyCapture, { capture: true });
    window.addEventListener('keyup', onKeyUpCapture, { capture: true });
    window.addEventListener('pointerup', onPointerUp);
    let poll: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      try {
        await store.load();
      } catch {
        showToast('투표 정보를 불러오지 못했어요. 창을 다시 열어 주세요.');
      }
      ready = true;
      offs.push(await receive('vote-state', onState));
      // 투표판에 지금 상태(초점·안내 장·개표 위치)를 한 번 알려 달라고 부탁합니다.
      remote({ kind: 'sync' });
      if (native) {
        const check = async () => {
          const labels = await openVoteWindows().catch(() => [BOARD_LABEL]);
          const open = labels.includes(BOARD_LABEL);
          if (open && !boardOpen) remote({ kind: 'sync' });
          boardOpen = open;
        };
        await check();
        poll = setInterval(() => void check(), 2000);
        // 제목줄을 끌어 이 창을 옮기면 손을 뗄 때 pointerup이 웹뷰에 오지 않습니다.
        // 옮김 알림이 0.5초 동안 없으면 끌기가 끝난 것으로 보고 키보드를 투표판에 돌려줍니다(마감일 달력과 같은 방식).
        let movedTimer: ReturnType<typeof setTimeout> | undefined;
        offs.push(() => clearTimeout(movedTimer));
        offs.push(await getCurrentWindow().onMoved(() => {
          clearTimeout(movedTimer);
          movedTimer = setTimeout(() => { if (studentPhase) handBack(); }, 500);
        }));
        offs.push(await getCurrentWindow().onCloseRequested((event) => {
          event.preventDefault();
          void doClose();
        }));
      }
      if (disposed) offs.forEach((off) => off());
    })();
    return () => {
      disposed = true;
      offs.forEach((off) => off());
      clearInterval(poll);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyCapture, { capture: true });
      window.removeEventListener('keyup', onKeyUpCapture, { capture: true });
      window.removeEventListener('pointerup', onPointerUp);
      clearTimeout(toastTimer);
      clearTimeout(refocusTimer);
      store.dispose();
    };
  });

  const COUNT_SPEEDS: { id: string; label: string }[] = [{ id: 'slow', label: '느리게' }, { id: 'normal', label: '보통' }, { id: 'fast', label: '빠르게' }];
  const countProgress = $derived(!counting ? 0 : counting.mode === 'pick' ? 1 - counting.pickable.length / Math.max(1, session.items?.length ?? 1) : counting.steps ? counting.cursor / counting.steps : 1);
</script>

<section class="vt-root vt-teacher" data-scheme={scheme} aria-label="학급 투표 선생님 창">
  <header class="vt-t-bar" use:draggable>
    <ToolIcon kind="vote" size={22} /><strong>선생님 창</strong>
    <span class="vt-t-spacer"></span>
    <MusicToggle on={prefs.music} compact quiet={studentPhase} onpress={act(toggleMusic)} />
    {#if native}<button class:active={pinned} aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={doPin}><Pin size={16} /></button>{/if}
    <button aria-label="닫기" title="닫기" onclick={() => void doClose()}><X size={18} /></button>
  </header>

  <main class="vt-t-main">
    {#if !ready}
      <p class="vt-t-empty">불러오는 중…</p>
    {:else}
      {#if !boardOpen}
        <div class="vt-t-alert vt-card">
          <MonitorUp size={20} />
          <span><b>투표판이 닫혀 있어요</b><small>학생들이 보는 창을 먼저 열어 주세요</small></span>
          <button class="vt-btn primary" onclick={() => void openBoard()}>투표판 열기</button>
        </div>
      {/if}

      {#if session.id}
        <!-- 지금 투표 -->
        <section class="vt-t-card vt-card">
          <div class="vt-t-head">
            <span class="vt-t-phase" data-phase={phase}>{phaseLabel(phase)}</span>
            <span class="vt-t-type">{typeLabel(session.type)}{session.runoffOf ? ' · 결선' : ''}</span>
          </div>
          <h1>{session.title}</h1>
          <div class="vt-t-count">
            <b>{session.ballots.length}</b><span>/ {session.rules.voters}명 투표</span>
          </div>
          <div class="vt-t-meter" role="progressbar" aria-valuemin={0} aria-valuemax={session.rules.voters} aria-valuenow={session.ballots.length}><i style:transform={`scaleX(${participation})`}></i></div>
          {#if studentPhase && boardOpen && boardFocused !== null}
            <p class="vt-t-focus" class:lost={!boardFocused}>
              <Keyboard size={15} />
              {#if boardFocused}투표판이 키보드를 받고 있어요
              {:else}투표판이 키보드를 받지 않아요 <button class="vt-link" onclick={() => void focusBoard()}>투표판으로 돌려주기</button>{/if}
            </p>
          {/if}
        </section>

        {#if phase === 'ready'}
          <label>안내 목소리
            <select value={prefs.speechVoice ?? 'female'} onchange={(e) => { const speechVoice = e.currentTarget.value; store.prefs.mutate((p:any) => ({...p,speechVoice})); }}>
              <option value="female">여성</option><option value="male">남성</option>
            </select>
          </label>
          <section class="vt-t-group">
            {#if session.tutorial.enabled}
              <button class="vt-t-action primary" onclick={act(() => begin('tutorial'))}><BookOpen size={19} /><span>안내부터 시작<small>천천히 넘어가는 안내 슬라이드를 먼저 보여 줘요</small></span></button>
              <button class="vt-t-action" onclick={act(() => begin('voting'))}><Play size={19} /><span>바로 투표 시작<small>안내 없이 첫 번째 친구부터 받아요</small></span></button>
            {:else}
              <button class="vt-t-action primary" onclick={act(() => begin('voting'))}><Play size={19} /><span>투표 시작<small>첫 번째 친구부터 받아요</small></span></button>
            {/if}
          </section>
        {/if}

        {#if phase === 'tutorial' || (voting && tutorial)}
          <section class="vt-t-group">
            <h2>안내 슬라이드</h2>
            {#if tutorial}
              <p class="vt-t-slide"><b>{tutorial.index + 1} / {tutorial.total}</b> {tutorial.title}</p>
              <div class="vt-t-row">
                <button class="vt-btn icon" aria-label="이전 장" disabled={tutorial.index <= 0} onclick={act(() => remote({ kind: 'tutorial', action: 'prev' }))}><ArrowLeft size={18} /></button>
                <button class="vt-btn" onclick={act(() => remote({ kind: 'tutorial', action: 'toggle' }))}>{#if tutorial.playing}<Pause size={17} />멈춤{:else}<Play size={17} />자동 넘김{/if}</button>
                <button class="vt-btn icon" aria-label="다음 장" onclick={act(() => remote({ kind: 'tutorial', action: 'next' }))}><ArrowRight size={18} /></button>
              </div>
              <button class="vt-t-action primary" onclick={act(() => remote({ kind: 'tutorial', action: 'finish' }))}><Flag size={19} /><span>{voting ? '안내 끝내기' : '안내 끝내고 투표 시작'}<small>{voting ? '투표판으로 돌아가 이어서 받아요' : '첫 번째 친구부터 받아요'}</small></span></button>
            {:else}
              <p class="vt-t-note">투표판에서 안내가 보이지 않아요. 투표판이 열려 있는지 확인해 주세요.</p>
            {/if}
          </section>
        {/if}

        {#if voting}
          <!-- 잠시 멈춤은 없앴습니다(2026-09-26): 선생님이 멈추지 않았는데 멈춘 화면이 보여 헷갈렸음. 멈추려면 마감하세요. -->
          <section class="vt-t-group">
            <button class="vt-t-action" disabled={!session.lastBallotId} onclick={askVoidLast}><Undo2 size={19} /><span>직전 표 취소<small>{session.lastBallotId ? '가장 최근에 들어온 표 1장' : '다음 표가 들어오면 다시 쓸 수 있어요'}</small></span></button>
            {#if !tutorial}<button class="vt-t-action" onclick={act(() => remote({ kind: 'tutorial-replay' }))}><BookOpen size={19} /><span>안내 다시 보기<small>끝나면 투표판으로 돌아와 이어서 받아요</small></span></button>{/if}
          </section>
        {/if}

        {#if studentPhase || phase === 'ready' || phase === 'tutorial'}
          <section class="vt-t-group">
            <div class="vt-t-action static">
              <span>투표 인원<small>{phase === 'closed' ? '늘리면 마감을 풀고 다시 받아요' : voting ? '받은 표 수까지 줄이면 곧바로 마감해요' : '이만큼 투표하면 자동으로 마감해요'}</small></span>
              <div class="vt-stepper">
                <button aria-label="인원 줄이기" disabled={session.rules.voters <= Math.max(LIMITS.votersMin, session.ballots.length)} onclick={act(() => setVoters(session.rules.voters - 1))}><Minus size={16} /></button>
                <b>{session.rules.voters}</b>
                <button aria-label="인원 늘리기" disabled={session.rules.voters >= LIMITS.votersMax} onclick={act(() => setVoters(session.rules.voters + 1))}><Plus size={16} /></button>
              </div>
            </div>
            {#if voting}
              <button class="vt-t-action accent" onclick={askClose}><Flag size={19} /><span>마감하고 개표하기<small>더 이상 표를 받지 않아요</small></span></button>
            {/if}
            {#if phase === 'closed'}
              <button class="vt-t-action primary" disabled={!boardOpen} onclick={act(startCounting)}><PartyPopper size={19} /><span>개표 시작하기<small>{modeName(session.reveal.mode, session.type === 'yesno')} · {session.ballots.length}장의 표를 공개해요</small></span></button>
            {/if}
          </section>
        {/if}

        {#if phase === 'counting'}
          <section class="vt-t-group">
            <h2>개표 · {modeName(session.reveal.mode, session.type === 'yesno')}</h2>
            {#if counting}
              <div class="vt-t-meter small"><i style:transform={`scaleX(${countProgress})`}></i></div>
              {#if counting.finishing}
                <p class="vt-t-note">결과를 발표하고 있어요.</p>
              {:else if counting.readyResult || counting.mode === 'instant'}
                <p class="vt-t-note">준비되면 결과 공개를 눌러 주세요.</p>
                <button class="vt-btn vt-count-action autoplay" onclick={() => remote({ kind: 'counting', action: 'skip' })}><Play size={18} />결과 공개</button>
              {:else if counting.mode === 'pick'}
                <p class="vt-t-note">누른 카드부터 투표판에서 뒤집혀요.</p>
                <div class="vt-t-picks">
                  {#each counting.pickable as it (it.id)}
                    {@const item = session.items.find((x: any) => x.id === it.id)}
                    {@const c = paletteOf(item?.color)}
                    <button class="vt-t-pick vt-c" style:--c-bg={c.bg} style:--c-line={c.line} style:--c-ink={c.ink} onclick={() => remote({ kind: 'reveal', id: it.id })}>
                      {#if item}<Sticker {item} type={session.type} size={34} />{/if}<span>{it.number}번 {it.name}</span><Eye size={16} />
                    </button>
                  {/each}
                </div>
              {:else}
                <p class="vt-t-slide"><b>{counting.cursor} / {counting.steps}</b>{counting.agendas > 1 ? ` · 안건 ${counting.agenda + 1}/${counting.agendas}` : ''}</p>
                <div class="vt-t-row">
                  <button class="vt-btn vt-count-action autoplay" aria-pressed={counting.playing} onclick={() => remote({ kind: 'counting', action: 'toggle' })}>{#if counting.playing}<Pause size={18} />멈춤{:else}<Play size={18} />자동 재생{/if}</button>
                  <button class="vt-btn vt-count-action next" onclick={() => remote({ kind: 'counting', action: 'next' })}><StepForward size={18} />한 장 더</button>
                  <button class="vt-btn vt-count-action skip" onclick={askSkip}><SkipForward size={18} />끝까지</button>
                </div>
                <div class="vt-t-row" role="radiogroup" aria-label="개표 속도">
                  {#each COUNT_SPEEDS as sp (sp.id)}
                    <button class="vt-chip" role="radio" aria-checked={counting.speed === sp.id} onclick={() => remote({ kind: 'counting', action: 'speed', value: sp.id })}>{sp.label}</button>
                  {/each}
                </div>
              {/if}
            {:else}
              <p class="vt-t-note">투표판에서 개표가 보이지 않아요. 투표판이 열려 있는지 확인해 주세요.</p>
            {/if}
          </section>
        {/if}

        {#if phase !== 'counting' && phase !== 'done'}
          <button class="vt-t-cancel" onclick={askCancel}><Trash2 size={15} />투표 그만두기</button>
        {/if}
      {:else}
        <!-- 진행 중인 투표 없음 -->
        <section class="vt-t-card vt-card idle">
          <h1>진행 중인 투표가 없어요</h1>
          <p>투표판에서 새 투표를 만들면 이 창에서 멈춤·인원·마감·개표를 조종할 수 있어요.</p>
        </section>
        {#if latest && latestModel}
          <section class="vt-t-group">
            <h2>최근 결과 · 선생님만</h2>
            <p class="vt-t-slide"><b>{latestModel.title}</b> · {resultSummary(latestModel)}</p>
            {#if !showLatest}
              <button class="vt-btn" onclick={() => (shownLatestId = latest.id)}><Eye size={17} />전체 득표 보기</button>
            {:else if latestModel.type === 'yesno'}
              <ol class="vt-t-rows">
                {#each latestModel.agendas as a, i}
                  <li><span>안건 {i + 1}</span><b>{a.text}</b><em>찬 {a.yes} · 반 {a.no} · 기권 {a.abstain}</em></li>
                {/each}
              </ol>
            {:else}
              <ol class="vt-t-rows">
                {#each latestModel.rows as r (r.item.id)}
                  <li class:win={r.winner}><span>{r.rank}위</span><b>{r.item.number}번 {r.item.name}</b><em>{r.count}표</em></li>
                {/each}
              </ol>
              <p class="vt-t-note">기권 {latestModel.abstain ?? 0} · 이 창의 득표는 학생들에게 보이지 않아요</p>
            {/if}
          </section>
        {/if}
      {/if}
    {/if}
  </main>

  {#if confirmState}
    <ConfirmDialog {...confirmState} mouseOnly={studentPhase}
      oncancel={() => { confirmState = null; handBack(); }}
      onok={() => { const run = confirmState?.action; confirmState = null; run?.(); handBack(); }} />
  {/if}
  {#if toast}
    <div class="vt-toast" role="status"><span>{toast.text}</span>
      {#if toast.action}<button onclick={() => { toast?.action?.run(); toast = null; }}>{toast.action.label}</button>{/if}
      <button aria-label="알림 닫기" onclick={() => (toast = null)}><X size={14} /></button>
    </div>
  {/if}
</section>

<style>
  .vt-teacher {
    background-size: 20px 20px;
  }
  .vt-t-bar {
    flex: none;
    height: 46px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--vt-line) 80%, transparent);
    background: color-mix(in srgb, var(--vt-card) 90%, transparent);
  }
  .vt-t-bar strong {
    font-size: 14px;
  }
  .vt-t-spacer {
    flex: 1;
  }
  .vt-t-bar button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--vt-muted);
  }
  .vt-t-bar button:hover {
    background: var(--vt-soft);
    color: var(--vt-ink);
  }
  .vt-t-bar button.active {
    background: var(--vt-soft);
    color: var(--vt-accent);
  }
  .vt-t-main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 14px 20px;
  }
  .vt-t-empty {
    margin: auto;
    color: var(--vt-muted);
    font-weight: 700;
  }
  .vt-t-alert {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 12px 14px;
    border-color: var(--vt-gold);
    border-radius: 16px;
    background: color-mix(in srgb, var(--vt-gold) 14%, var(--vt-card));
  }
  .vt-t-alert span {
    display: grid;
    flex: 1;
    font-size: 14px;
  }
  .vt-t-alert small {
    color: var(--vt-muted);
    font-weight: 700;
  }
  .vt-t-card {
    display: grid;
    gap: 6px;
    padding: 16px 18px;
    border-radius: 20px;
  }
  .vt-t-card h1 {
    margin: 0;
    font-size: 21px;
    line-height: 1.3;
    word-break: keep-all;
  }
  .vt-t-card.idle p {
    margin: 0;
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 700;
    word-break: keep-all;
  }
  .vt-t-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .vt-t-phase {
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--vt-soft);
    font-size: 12.5px;
    font-weight: 900;
  }
  .vt-t-phase[data-phase='voting'] {
    background: color-mix(in srgb, var(--vt-accent) 16%, var(--vt-card));
    color: var(--vt-accent);
  }
  .vt-t-phase[data-phase='paused'] {
    background: var(--vt-gold);
    color: #5a4108;
  }
  .vt-t-type {
    color: var(--vt-muted);
    font-size: 13px;
    font-weight: 800;
  }
  .vt-t-count {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .vt-t-count b {
    font-size: 40px;
    line-height: 1;
  }
  .vt-t-count span {
    color: var(--vt-muted);
    font-size: 16px;
    font-weight: 800;
  }
  .vt-t-meter {
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--vt-line) 70%, transparent);
  }
  .vt-t-meter.small {
    height: 7px;
  }
  .vt-t-meter i {
    display: block;
    height: 100%;
    background: var(--vt-accent);
    transform-origin: left;
    transition: transform var(--vt-slow) var(--vt-ease);
  }
  .vt-t-focus {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin: 4px 0 0;
    color: #1f6e57;
    font-size: 13px;
    font-weight: 800;
  }
  .vt-t-focus.lost {
    color: var(--vt-danger);
  }
  .vt-root[data-scheme='dark'] .vt-t-focus:not(.lost) {
    color: #7fd6b5;
  }
  .vt-t-group {
    display: grid;
    gap: 4px;
    padding: 10px;
    border: 1px solid var(--vt-line);
    border-radius: 18px;
    background: var(--vt-card);
  }
  .vt-t-group h2 {
    margin: 2px 6px 4px;
    color: var(--vt-muted);
    font-size: 13px;
  }
  .vt-t-action {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--vt-ink);
    font-size: 15px;
    font-weight: 800;
    text-align: left;
    white-space: normal !important;
  }
  .vt-t-action:hover:not(:disabled):not(.static) {
    background: var(--vt-soft);
  }
  .vt-t-action:disabled {
    opacity: 0.5;
  }
  .vt-t-action span {
    display: grid;
    flex: 1;
    gap: 2px;
  }
  .vt-t-action small {
    color: var(--vt-muted);
    font-size: 12.5px;
    font-weight: 700;
  }
  .vt-t-action.primary {
    background: var(--vt-action);
    color: var(--vt-on-action);
  }
  .vt-t-action.primary small {
    color: color-mix(in srgb, var(--vt-on-action) 80%, transparent);
  }
  .vt-t-action.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--vt-action) 88%, #fff);
  }
  .vt-t-action.accent {
    color: var(--vt-accent);
  }
  .vt-t-action.static {
    cursor: default;
  }
  .vt-stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .vt-stepper button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--vt-line);
    border-radius: 10px;
    background: var(--vt-card);
    color: var(--vt-ink);
  }
  .vt-stepper b {
    min-width: 34px;
    text-align: center;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
  .vt-t-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 4px 4px 6px;
  }
  .vt-t-slide {
    margin: 0 6px;
    font-size: 14px;
    font-weight: 700;
    word-break: keep-all;
  }
  .vt-t-slide b {
    font-variant-numeric: tabular-nums;
  }
  .vt-t-note {
    margin: 2px 6px;
    color: var(--vt-muted);
    font-size: 13px;
    font-weight: 700;
    word-break: keep-all;
  }
  .vt-t-picks {
    display: grid;
    gap: 6px;
    padding: 4px;
  }
  .vt-t-pick {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 6px 8px;
    border: 1px solid var(--cline);
    border-radius: 14px;
    background: var(--cbg);
    color: var(--vt-ink);
    font-size: 15px;
    font-weight: 800;
    text-align: left;
  }
  .vt-t-pick span {
    flex: 1;
  }
  .vt-t-pick:hover {
    box-shadow: var(--vt-shadow);
  }
  .vt-t-rows {
    display: grid;
    gap: 4px;
    margin: 4px 0;
    padding: 0 6px;
    list-style: none;
  }
  .vt-t-rows li {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 10px;
    font-size: 14px;
  }
  .vt-t-rows li.win {
    background: color-mix(in srgb, var(--vt-gold) 22%, transparent);
  }
  .vt-t-rows span {
    color: var(--vt-muted);
    font-weight: 800;
  }
  .vt-t-rows b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vt-t-rows em {
    font-style: normal;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  .vt-t-cancel {
    display: inline-flex;
    align-items: center;
    align-self: center;
    gap: 6px;
    margin-top: 4px;
    padding: 6px 12px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--vt-danger);
    font-size: 13px;
    font-weight: 800;
  }
  .vt-t-cancel:hover {
    background: color-mix(in srgb, var(--vt-danger) 10%, transparent);
  }
</style>
