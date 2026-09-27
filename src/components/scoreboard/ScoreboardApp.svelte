<script lang="ts">
  // 점수판 창(개인·모둠·커스텀 공통). 제목줄 → 도구줄 → 카드 판(PRD 6절).
  // 모든 변경은 누르는 즉시 화면에 보이고 곧바로 저장됩니다(section.js). 되돌리기는 점수판마다 최근 50개.
  import { onMount, tick, untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Pin, Maximize2, Minimize2, X, Undo2, RotateCcw, Settings2, ListChecks, MoreHorizontal, Minus, Plus, ChevronDown, ArrowRight, UsersRound, Pencil, Check } from 'lucide-svelte';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow, openTool } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { createSection } from '../../lib/scores/section.js';
  import { subscribeStore } from '../../lib/scores/store.js';
  import { createScoreAudio } from '../../lib/scores/audio.js';
  import { DURATION } from '../../lib/scores/motion.js';
  import { readRoster, subscribeRoster } from '../../lib/classroom/repository.js';
  import { openRosterFor } from '../../lib/classroom/intent.js';
  import { normalizeShared, normalizePersonal, normalizeGroup, normalizeCustom, defaultBoardPrefs, LIMITS } from '../../lib/scoreboard/model.js';
  import * as B from '../../lib/scoreboard/boards.js';
  import { cardsFor, clusters } from '../../lib/scoreboard/personal.js';
  import { badges as computeBadges } from '../../lib/scoreboard/ranking.js';
  import { fitGrid, fitClusters, densityOf, cardMetrics } from '../../lib/scoreboard/layout.js';
  import { chipsFor, parseStep, signed, scoreText } from '../../lib/scoreboard/steps.js';
  import { clearFitCache } from '../../lib/scoreboard/fitText.js';
  import ToolIcon from '../toolkit/ToolIcon.svelte';
  import ToolkitSelect from '../toolkit/ToolkitSelect.svelte';
  import ScoreCard from './ScoreCard.svelte';
  import SbSettings from './SbSettings.svelte';
  import SbMenu from './SbMenu.svelte';
  import CustomCreate from './CustomCreate.svelte';
  import './scoreboard.css';

  type Kind = 'personal' | 'group' | 'custom';
  let { kind } = $props<{ kind: Kind }>();
  const K = untrack(() => kind) as Kind;
  const TITLES: Record<Kind, string> = { personal: '개인 점수판', group: '모둠 점수판', custom: '커스텀 점수판' };
  const NORMALIZE = { personal: normalizePersonal, group: normalizeGroup, custom: normalizeCustom } as const;
  const unit = K === 'personal' ? '명' : '개';

  // ── 저장소 ──
  let shared = $state.raw(normalizeShared(undefined));
  let data = $state.raw<any>(NORMALIZE[K](undefined));
  let ready = $state(false);
  let error = $state('');
  let undoVersion = $state(0);
  const sharedClient = createSection({ store: 'scoreboard', section: 'shared', normalize: normalizeShared, onChange: (d) => (shared = d), onError: (m) => (error = m) });
  const client = createSection({ store: 'scoreboard', section: K, normalize: NORMALIZE[K] as (raw: any) => any, onChange: (d) => (data = d), onError: (m) => (error = m), onNotice: (m) => showToast(m) });

  // ── 학급 명단(개인만) ──
  let roster = $state<any>({ revision: 0, defaultClassId: null, classes: [] });
  let rosterState = $state<'loading' | 'ready' | 'error'>(K === 'personal' ? 'loading' : 'ready');
  const classes = $derived<any[]>(roster.classes);
  const classDeleted = $derived(K === 'personal' && !!data.lastClassId && classes.length > 0 && !classes.some((c) => c.id === data.lastClassId));
  const classroom = $derived.by(() => {
    if (K !== 'personal' || classDeleted) return null;
    const id = data.lastClassId ?? roster.defaultClassId ?? classes[0]?.id;
    return classes.find((c) => c.id === id) ?? classes[0] ?? null;
  });
  const hasGroups = $derived(!!classroom?.groups?.length);

  // ── 지금 점수판 ──
  let creating = $state(false);
  const board = $derived(K === 'custom' ? data.boards.find((b: any) => b.id === data.lastBoardId) ?? null : null);
  const prefs = $derived<any>(K === 'custom' ? board?.prefs ?? defaultBoardPrefs() : data.prefs);
  type Card = { id: string; name: string; number?: number; showNumber?: boolean; color: string | null; symbol?: string; sub?: string; score: number; groupId?: string | null };
  const cards = $derived.by<Card[]>(() => {
    if (K === 'personal') return cardsFor(classroom, B.personalScores(data, classroom?.id ?? ''), data.prefs).map((c) => ({ ...c, sub: c.groupName }));
    if (K === 'group') return data.groups.map((g: any) => ({ id: g.id, name: g.name, color: g.color, symbol: g.symbol, score: g.score }));
    return (board?.items ?? []).map((it: any) => ({ id: it.id, name: it.name, color: it.color, score: it.score }));
  });
  const badgeList = $derived(prefs.badges ? computeBadges(cards.map((c) => c.score)) : cards.map(() => 0));
  const undoKey = $derived(K === 'personal' ? `personal:${classroom?.id ?? ''}` : K === 'group' ? 'group' : `custom:${board?.id ?? ''}`);
  const canUndo = $derived((void undoVersion, client.undoDepth(undoKey) > 0));
  const view = $derived.by(() => {
    if (!ready) return 'loading';
    if (K === 'personal') {
      if (rosterState === 'loading') return 'loading';
      if (rosterState === 'error') return 'roster-error';
      if (!classes.length) return 'no-class';
      if (classDeleted) return 'class-deleted';
      if (!classroom?.students.length) return 'no-student';
    }
    if (K === 'custom' && (creating || !board)) return 'create';
    return 'board';
  });

  // ── 소리 ──
  const audio = createScoreAudio();
  $effect(() => {
    audio.setEnabled(shared.sound);
    audio.setVolume(shared.volume);
  });
  const reduced = $derived(shared.reduced);
  let lastLocal = 0;
  const play = (name: string, opts?: { combo?: boolean }) => audio.play(name, opts);

  // ── 알림 띠·확인 ──
  let toast = $state<{ text: string; undoKey?: string } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(text: string, undo?: string) {
    clearTimeout(toastTimer);
    toast = { text, undoKey: undo };
    toastTimer = setTimeout(() => (toast = null), 6000);
  }
  let confirm = $state<{ text: string; detail?: string; ok: string; action: () => void } | null>(null);
  let confirmCancel = $state<HTMLButtonElement>();
  async function ask(text: string, detail: string, ok: string, action: () => void) {
    confirm = { text, detail, ok, action };
    await tick();
    confirmCancel?.focus();
  }

  // ── 바꾸기 ──
  function undoSpec() {
    if (K === 'personal') return B.personalUndo(classroom.id);
    if (K === 'group') return B.groupUndo();
    return B.customUndo(board.id);
  }
  function mutateScores(fn: (d: any) => any) {
    if (client.mutate(fn, undoSpec())) {
      undoVersion++;
      lastLocal = performance.now();
    }
  }
  function adjust(ids: string[], delta: number) {
    if (!ids.length || !delta || (K === 'personal' && !classroom) || (K === 'custom' && !board)) return;
    if (K === 'personal') mutateScores((d) => B.personalAdjust(d, classroom.id, ids, delta));
    else if (K === 'group') mutateScores((d) => B.groupAdjust(d, ids, delta));
    else mutateScores((d) => B.boardAdjust(d, board.id, ids, delta));
    if (ids.length > 1) {
      play('chord');
      showToast(`${ids.length}${unit}에게 ${signed(delta)}`, undoKey);
    } else play(delta > 0 ? 'pop' : 'boop', { combo: delta > 0 });
  }
  function setScore(id: string, value: number) {
    if (K === 'personal') mutateScores((d) => B.personalSet(d, classroom.id, id, value));
    else if (K === 'group') mutateScores((d) => B.groupSet(d, id, value));
    else mutateScores((d) => B.boardSet(d, board.id, id, value));
    play('toc');
  }
  function resetScores() {
    const key = undoKey;
    if (K === 'personal') mutateScores((d) => B.personalReset(d, classroom.id));
    else if (K === 'group') mutateScores((d) => B.groupReset(d));
    else mutateScores((d) => B.boardReset(d, board.id));
    play('sweep');
    showToast('점수를 초기화했어요', key);
  }
  function undo(key = undoKey) {
    if (client.undo(key)) {
      undoVersion++;
      play('rewind');
      if (toast?.undoKey === key) toast = null;
    }
  }
  function setPrefs(patch: Record<string, unknown>) {
    if (K === 'custom') {
      if (board) client.mutate((d) => B.updateBoard(d, board.id, { prefs: patch }));
    } else client.mutate((d) => ({ ...d, prefs: { ...d.prefs, ...patch } }));
  }
  const setShared = (patch: Record<string, unknown>) => sharedClient.mutate((d) => ({ ...d, ...patch }));

  // ── 1위가 바뀌면 짧은 팡파르(연타 중엔 1.5초에 한 번) ──
  let prevLeaders: string[] = [];
  let lastFanfare = 0;
  $effect(() => {
    const leaders = cards.filter((_, i) => badgeList[i] === 1).map((c) => c.id);
    untrack(() => {
      const now = performance.now();
      const fresh = leaders.some((id) => !prevLeaders.includes(id));
      if (fresh && now - lastLocal < 600 && now - lastFanfare > 1500) {
        lastFanfare = now;
        setTimeout(() => play('fanfare3'), 120);
      }
      prevLeaders = leaders;
    });
  });

  // ── 단위 ──
  const step = $derived<number>(prefs.step);
  let customStepEditing = $state(false);
  let customStepText = $state('');
  function chooseStep(n: number) {
    setPrefs({ step: n });
    play('tick');
  }
  function commitCustomStep() {
    const n = parseStep(customStepText);
    customStepEditing = false;
    if (n) {
      setPrefs({ step: n, customStep: n });
      play('tick');
    }
  }
  function stepKeys(e: KeyboardEvent) {
    const chips = chipsFor(prefs.customStep);
    const i = chips.indexOf(step);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    chooseStep(chips[(i + d + chips.length) % chips.length]);
  }

  // 직접 입력칸이 열리면 바로 입력할 수 있게 초점을 줍니다.
  const autofocus = (node: HTMLInputElement) => node.focus();

  // ── 여러 개 고르기(개인·커스텀) ──
  let selecting = $state(false);
  let selected = $state<string[]>([]);
  $effect(() => {
    const ids = new Set(cards.map((c) => c.id));
    const kept = untrack(() => selected).filter((id) => ids.has(id));
    if (kept.length !== untrack(() => selected).length) selected = kept;
  });
  const toggleSelect = (id: string) => (selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  function toggleGroupSelect(groupId: string | null) {
    const members = cards.filter((c) => (c.groupId ?? null) === groupId).map((c) => c.id);
    const all = members.every((id) => selected.includes(id));
    selected = all ? selected.filter((id) => !members.includes(id)) : [...new Set([...selected, ...members])];
  }
  function endSelect() {
    selecting = false;
    selected = [];
  }

  // ── 모둠 수 ──
  function changeGroupCount(d: number) {
    const n = data.groups.length + d;
    if (n < LIMITS.groupMin || n > LIMITS.groupMax) return;
    const last = data.groups[data.groups.length - 1];
    const run = () => {
      mutateScores((x) => B.setGroupCount(x, n));
      play('toc');
      if (d < 0) showToast(`${last.name}을 뺐어요`, 'group');
    };
    if (d < 0 && last.score !== 0) void ask(`${last.name}(${scoreText(last.score)}점)을 뺄까요?`, '되돌리기로 복구할 수 있어요.', '빼기', run);
    else run();
  }

  // ── 커스텀 점수판 관리 ──
  const sortedBoards = $derived(K === 'custom' ? [...data.boards].sort((a: any, b: any) => b.usedAt - a.usedAt) : []);
  function createBoard(input: { title: string; names: string[]; startScore: number }) {
    client.mutate((d) => B.createBoard(d, input));
    creating = false;
    play('chord');
  }
  function deleteBoard() {
    if (!board) return;
    const id = board.id;
    const title = board.title;
    void ask(`“${title}” 점수판을 지울까요?`, '되돌리기로 복구할 수 있어요.', '지우기', () => {
      client.mutate((d) => B.deleteBoard(d, id), B.customUndo(id));
      undoVersion++;
      drawer = false;
      play('sweep');
      showToast(`“${title}”을 지웠어요`, `custom:${id}`);
    });
  }

  // ── 카드 판 배치 ──
  let boardW = $state(0);
  let boardH = $state(0);
  let density = $state<'wide' | 'normal' | 'tight'>('normal');
  const PAD = 14;
  const clusterList = $derived(K === 'personal' && data.prefs.clusterByGroup && hasGroups ? clusters(cards as any, classroom.groups) : null);
  const grid = $derived(
    clusterList
      ? { rows: 0, ...fitClusters(clusterList.map((c) => c.cards.length), boardW - PAD * 2, boardH - PAD * 2) }
      : fitGrid(cards.length, boardW - PAD * 2, boardH - PAD * 2),
  );
  $effect(() => {
    const next = densityOf(grid.cardH, untrack(() => density));
    if (next !== untrack(() => density)) density = next;
  });
  const maxChars = $derived(Math.max(2, ...cards.map((c) => scoreText(c.score).length)));
  const metrics = $derived(cardMetrics(grid.cardW, grid.cardH, density, maxChars, K === 'personal' && hasGroups));

  // ── 글꼴(이름 크기 맞춤) ──
  let fontFamily = $state('');
  let fontEpoch = $state(0);
  const readFont = () => {
    const f = getComputedStyle(document.documentElement).getPropertyValue('--tk-font').trim();
    if (f !== fontFamily) {
      fontFamily = f;
      clearFitCache();
      fontEpoch++;
    }
  };

  // ── 창 ──
  let pinned = $state(false);
  let fullscreen = $state(false);
  let drawer = $state(false);
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let hintVisible = $state(false);
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  const draggable = (node: HTMLElement) => (native ? dragRegion(node, { onDoubleClick: () => void windowAction(toggleFullscreen) }) : { destroy() {} });
  async function windowAction(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      error = '창을 조작하지 못했어요. 다시 시도해 주세요.';
    }
  }
  async function toggleFullscreen() {
    if (native) {
      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      fullscreen = next;
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    wake();
  }
  async function togglePin() {
    if (!native) return;
    await getCurrentWindow().setAlwaysOnTop(!pinned);
    pinned = !pinned;
  }
  async function close() {
    audio.stop();
    await Promise.all([client.settle(), sharedClient.settle()]).catch(() => {});
    await windowAction(closeWindow);
  }
  // 전체화면에서 마우스가 3초 멈추면 도구줄을 숨겨 카드 판을 키웁니다(PRD 6.9).
  function wake() {
    idle = false;
    clearTimeout(idleTimer);
    if (fullscreen && !drawer && !confirm) idleTimer = setTimeout(() => (idle = true), 3000);
  }

  // ── 키보드 ──
  function onKey(e: KeyboardEvent) {
    wake();
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, [contenteditable="true"]')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (confirm) confirm = null;
      else if (selecting) endSelect();
      else if (drawer) drawer = false;
      else if (fullscreen) void windowAction(toggleFullscreen);
      return;
    }
    if (view !== 'board') return;
    if (e.code === 'KeyF') void windowAction(toggleFullscreen);
    else if (e.code === 'KeyM') setShared({ sound: !shared.sound });
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    if (digit && K !== 'personal' && cards.length <= 10) {
      e.preventDefault();
      const card = cards[digit[1] === '0' ? 9 : Number(digit[1]) - 1];
      if (card) adjust([card.id], e.shiftKey ? -step : step);
      hintVisible = true;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => (hintVisible = false), 3000);
      return;
    }
    if (e.key.startsWith('Arrow')) {
      const els = Array.from(document.querySelectorAll<HTMLElement>('.sb-card'));
      const i = els.indexOf(document.activeElement as HTMLElement);
      const cols = grid.cols || 1;
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : -cols;
      const next = els[i < 0 ? 0 : Math.max(0, Math.min(els.length - 1, i + d))];
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  }

  // ── 툴바 폭에 따른 접기(줄바꿈 대신, PRD 4.4) ──
  let toolbarW = $state(1200);
  const level = $derived(toolbarW >= 940 ? 0 : toolbarW >= 820 ? 1 : toolbarW >= 720 ? 2 : toolbarW >= 620 ? 3 : 4);
  const stepChips = $derived(chipsFor(prefs.customStep).filter((n) => !(level >= 4 && n === 2)));
  const moreItems = $derived([
    ...(level >= 3 ? [{ id: 'all-plus', label: `모두 ${signed(step)}`, onselect: () => adjust(cards.map((c) => c.id), step) }] : []),
    { id: 'all-minus', label: `모두 ${signed(-step)}`, onselect: () => adjust(cards.map((c) => c.id), -step) },
    ...(level >= 2 ? [{ id: 'reset', label: '점수 초기화', danger: true, onselect: () => askReset() }] : []),
  ]);
  function askReset() {
    const text = K === 'custom' ? `모든 점수를 시작 점수(${scoreText(board?.startScore ?? 0)}점)로 되돌릴까요?` : '모든 점수를 0점으로 만들까요?';
    void ask(text, '되돌리기로 바로 복구할 수 있어요.', '초기화', resetScores);
  }

  // ── 명단이 바뀌면 곧바로 반영 ──
  let knownStudents = -1;
  async function refreshRoster() {
    try {
      const next = await readRoster();
      const before = knownStudents;
      roster = next;
      rosterState = 'ready';
      const cl = untrack(() => classroom);
      const count = cl?.students.length ?? 0;
      if (before === 0 && count > 0) showToast(`${cl.name} 명단을 불러왔어요(${count}명)`);
      knownStudents = count;
    } catch {
      rosterState = 'error';
    }
  }

  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    readFont();
    const styleObserver = new MutationObserver(readFont);
    styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const fontsDone = () => {
      clearFitCache();
      fontEpoch++;
    };
    document.fonts?.addEventListener('loadingdone', fontsDone);
    const syncFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreen);
    void (async () => {
      try {
        await Promise.all([client.load(), sharedClient.load()]);
        offs.push(await subscribeStore('scoreboard', ({ section, revision }) => {
          if (section === 'shared') void sharedClient.external(revision);
          else if (section === K) void client.external(revision);
        }));
        if (K === 'personal') {
          offs.push(await subscribeRoster(() => void refreshRoster()));
          await refreshRoster();
        }
        if (K === 'custom' && !data.boards.length) creating = true;
      } catch {
        error = '점수판을 불러오지 못했어요. 창을 다시 열어 주세요.';
      }
      if (disposed) offs.forEach((off) => off());
      ready = true;
    })();
    const focus = () => {
      if (K === 'personal') void refreshRoster();
    };
    window.addEventListener('focus', focus);
    const stop = () => audio.stop();
    window.addEventListener('pagehide', stop);
    return () => {
      disposed = true;
      offs.forEach((off) => off());
      styleObserver.disconnect();
      document.fonts?.removeEventListener('loadingdone', fontsDone);
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pagehide', stop);
      clearTimeout(toastTimer);
      clearTimeout(idleTimer);
      clearTimeout(hintTimer);
      client.dispose();
      sharedClient.dispose();
      audio.dispose();
    };
  });

  const classOptions = $derived(classes.map((c) => ({ value: c.id, label: c.name })));
  function chooseClass(id: string) {
    if (id && id !== data.lastClassId) {
      client.mutate((d) => ({ ...d, lastClassId: id }));
      endSelect();
    }
  }
  const boardMenu = $derived([
    ...sortedBoards.map((b: any) => ({ id: b.id, label: b.title, hint: `${b.items.length}개`, checked: b.id === board?.id, onselect: () => { client.mutate((d) => B.openBoard(d, b.id)); creating = false; endSelect(); } })),
    { id: 'div', label: '', divider: true },
    { id: 'new', label: '+ 새 점수판', hint: data.boards?.length >= LIMITS.boards ? `${LIMITS.boards}개가 가득 찼어요` : undefined, disabled: data.boards?.length >= LIMITS.boards, onselect: () => { creating = true; drawer = false; endSelect(); } },
    { id: 'dup', label: '이 점수판 복제', disabled: !board || data.boards?.length >= LIMITS.boards, onselect: () => client.mutate((d) => B.duplicateBoard(d, board.id)) },
    { id: 'del', label: '이 점수판 삭제', danger: true, disabled: !board, onselect: deleteBoard },
  ]);
</script>

<svelte:window onkeydown={onKey} onpointermove={wake} />
<section class="sb-app" class:idle class:reduced data-kind={K} aria-label={TITLES[K]}>
  <header class="sb-titlebar" use:draggable>
    <div class="sb-brand">
      <ToolIcon kind={`scoreboard-${K}`} size={24} /><strong>{TITLES[K]}</strong>
      {#if K === 'personal' && classes.length > 1 && !classDeleted}<span class="sb-divider"></span><ToolkitSelect value={classroom?.id ?? ''} label="학급 선택" options={classOptions} onchange={chooseClass} />
      {:else if K === 'personal' && classroom}<span class="sb-divider"></span><span class="sb-context">{classroom.name}</span>{/if}
      {#if K === 'custom' && board && !creating}<span class="sb-divider"></span>
        <SbMenu label="점수판 고르기" items={boardMenu} triggerClass="sb-board-trigger">{#snippet trigger()}<span class="sb-context">{board.title}</span><ChevronDown size={15} />{/snippet}</SbMenu>{/if}
    </div>
    <div class="sb-window-actions">
      {#if native}<button class:active={pinned} aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={() => windowAction(togglePin)}><Pin size={17} /></button>{/if}
      <button aria-label={fullscreen ? '전체화면 종료' : '전체화면'} title={fullscreen ? '전체화면 종료 (F)' : '전체화면 (F)'} onclick={() => windowAction(toggleFullscreen)}>{#if fullscreen}<Minimize2 size={18} />{:else}<Maximize2 size={18} />{/if}</button>
      <button aria-label="닫기" title="닫기" onclick={close}><X size={19} /></button>
    </div>
  </header>

  {#if view === 'board'}
    <div class="sb-toolbar" bind:clientWidth={toolbarW} data-level={level}>
      <div class="sb-steps" role="radiogroup" aria-label="한 번에 바꿀 점수" tabindex="-1" onkeydown={stepKeys}>
        {#if level < 1}<span class="sb-steps-label">한 번에</span>{/if}
        {#each stepChips as n (n)}<button role="radio" aria-checked={step === n} class:active={step === n} tabindex={step === n ? 0 : -1} onclick={() => chooseStep(n)}>{n}</button>{/each}
        {#if customStepEditing}<input class="sb-step-input" inputmode="numeric" maxlength="3" bind:value={customStepText} aria-label="직접 입력(1~999)"
            onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitCustomStep(); if (e.key === 'Escape') customStepEditing = false; }} onblur={commitCustomStep} use:autofocus />
        {:else}<button class="sb-step-edit" title="직접 입력(1~999)" aria-label="단위 직접 입력" onclick={() => { customStepText = ''; customStepEditing = true; }}><Pencil size={14} />{#if level < 1}<span>직접</span>{/if}</button>{/if}
      </div>

      <div class="sb-center">
        {#if K === 'group'}
          <div class="sb-count" role="group" aria-label="모둠 수">
            <span>모둠</span>
            <button class="sb-round" aria-label="모둠 하나 빼기" disabled={data.groups.length <= LIMITS.groupMin} onclick={() => changeGroupCount(-1)}><Minus size={16} /></button>
            <b aria-live="polite">{data.groups.length}</b>
            <button class="sb-round" aria-label="모둠 하나 더하기" disabled={data.groups.length >= LIMITS.groupMax} onclick={() => changeGroupCount(1)}><Plus size={16} /></button>
          </div>
        {:else if selecting}
          <div class="sb-selectbar" role="group" aria-label="고른 카드">
            <span class="sb-count-label"><b>{selected.length}</b>{unit} 선택</span>
            <button class="sb-tool-btn" disabled={!selected.length} onclick={() => adjust(selected, -step)}>{signed(-step)}</button>
            <button class="sb-tool-btn primary" disabled={!selected.length} onclick={() => adjust(selected, step)}>{signed(step)}</button>
            <button class="sb-tool-btn ghost" onclick={() => (selected = cards.map((c) => c.id))}>전체</button>
            <button class="sb-tool-btn ghost" disabled={!selected.length} onclick={() => (selected = [])}>해제</button>
            <button class="sb-tool-btn" onclick={endSelect}><Check size={16} />끝</button>
          </div>
        {:else}
          <button class="sb-tool-btn" onclick={() => (selecting = true)} title={`여러 ${unit === '명' ? '명' : '개'}을 골라 한꺼번에 주기`}><ListChecks size={17} />{level < 1 ? (K === 'personal' ? '여러 명 선택' : '여러 개 선택') : '선택'}</button>
        {/if}
        {#if !selecting && level < 3}<button class="sb-tool-btn" onclick={() => adjust(cards.map((c) => c.id), step)} title={`모든 카드에 ${signed(step)}`}>모두 {signed(step)}</button>{/if}
      </div>

      <div class="sb-right">
        <button class="sb-tool-btn" disabled={!canUndo} onclick={() => undo()} title="되돌리기 (Ctrl+Z)" aria-label="되돌리기"><Undo2 size={17} />{#if level < 1}되돌리기{/if}</button>
        <span class="sb-sep" aria-hidden="true"></span>
        {#if level < 2}<button class="sb-tool-btn outline-danger" onclick={askReset} title="점수 초기화"><RotateCcw size={16} />초기화</button>{/if}
        <SbMenu label="더보기" items={moreItems} align="right" triggerClass="sb-tool-btn icon">{#snippet trigger()}<MoreHorizontal size={18} />{/snippet}</SbMenu>
        <button class="sb-tool-btn icon" class:active={drawer} aria-pressed={drawer} aria-label="설정" title="설정" onclick={() => (drawer = !drawer)}><Settings2 size={18} /></button>
      </div>
    </div>
    {#if K === 'personal' && selecting && hasGroups}
      <div class="sb-group-chips" role="group" aria-label="모둠으로 고르기">
        <span>모둠으로 고르기</span>
        {#each classroom.groups as g (g.id)}<button class="sb-chip" class:on={cards.filter((c) => c.groupId === g.id).length > 0 && cards.filter((c) => c.groupId === g.id).every((c) => selected.includes(c.id))} onclick={() => toggleGroupSelect(g.id)}>{g.name}</button>{/each}
        {#if cards.some((c) => !c.groupId)}<button class="sb-chip" onclick={() => toggleGroupSelect(null)}>모둠 없음</button>{/if}
      </div>
    {/if}
  {/if}

  <div class="sb-body-wrap">
    <main class="sb-board" class:scroll={grid.scroll} class:with-drawer={drawer} bind:clientWidth={boardW} bind:clientHeight={boardH} onclick={(e) => { if (e.target === e.currentTarget && confirm) confirm = null; }} role="presentation">
      {#if view === 'loading'}<p class="sb-loading">점수판을 준비하고 있어요…</p>
      {:else if view === 'roster-error'}
        <div class="sb-empty"><UsersRound size={40} /><h2>학급 명단을 불러오지 못했어요</h2><div class="sb-empty-actions"><button class="sb-tool-btn primary big" onclick={() => { rosterState = 'loading'; void refreshRoster(); }}>다시 시도</button></div></div>
      {:else if view === 'no-class'}
        <div class="sb-empty">
          <div class="sb-empty-art" aria-hidden="true"><ToolIcon kind="scoreboard-personal" size={64} /></div>
          <h2>학급 명단이 아직 없어요</h2>
          <p>개인 점수판은 학급 명단의 학생으로 만들어져요.</p>
          <ol class="sb-steps-guide" aria-label="시작하는 순서"><li><b>1</b>{level >= 3 ? '만들기' : '학급 만들기'}</li><li><b>2</b>{level >= 3 ? '붙여넣기' : '학생 이름 붙여넣기'}</li><li><b>3</b>{level >= 3 ? '돌아오기' : '여기로 돌아오기'}</li></ol>
          <div class="sb-empty-actions"><button class="sb-tool-btn primary big" onclick={() => openRosterFor({ action: 'create-class' })}>학급 명단 등록하러 가기<ArrowRight size={18} /></button></div>
          <button class="sb-link" onclick={() => openTool('scoreboard-custom')}>명단 없이 쓰려면 · 커스텀 점수판 열기</button>
        </div>
      {:else if view === 'no-student'}
        <div class="sb-empty">
          <div class="sb-empty-art" aria-hidden="true"><ToolIcon kind="scoreboard-personal" size={64} /></div>
          <h2>{classroom?.name}에 학생이 아직 없어요</h2>
          <p>학생을 넣으면 창을 다시 열지 않아도 바로 시작해요.</p>
          <div class="sb-empty-actions"><button class="sb-tool-btn primary big" onclick={() => openRosterFor({ action: 'add-students', classId: classroom.id })}>학생 추가하러 가기<ArrowRight size={18} /></button></div>
        </div>
      {:else if view === 'class-deleted'}
        <div class="sb-empty">
          <UsersRound size={40} />
          <h2>보던 학급이 명단에서 지워졌어요</h2>
          <p>점수는 보관해 두었어요. 명단에서 되돌리면 그대로 다시 나타나요.</p>
          <div class="sb-empty-actions">
            <ToolkitSelect value="" label="다른 학급 고르기" options={[{ value: '', label: '다른 학급 고르기' }, ...classOptions]} onchange={chooseClass} />
            <button class="sb-tool-btn" onclick={() => openTool('roster')}>학급 명단 열기</button>
          </div>
        </div>
      {:else if view === 'create'}
        <CustomCreate draft={data.draft} canCancel={data.boards.length > 0} full={data.boards.length >= LIMITS.boards} oncreate={createBoard}
          oncancel={() => (creating = false)} ondraft={(draft) => client.mutate((d) => ({ ...d, draft }))} />
      {:else}
        {#snippet cardOf(card: Card, i: number)}
          <ScoreCard {card} {density} cardW={grid.cardW} {metrics} badge={badgeList[cards.indexOf(card)] ?? 0} {step} {reduced}
            selectMode={selecting} selected={selected.includes(card.id)} colorize={prefs.colorCards}
            keyHint={K !== 'personal' && hintVisible && cards.length <= 10 && i < 10 ? String((i + 1) % 10) : ''}
            editableName={K !== 'personal'} {fontFamily} {fontEpoch}
            onadjust={(d) => adjust([card.id], d)} onset={(v) => setScore(card.id, v)} ontoggle={() => toggleSelect(card.id)}
            onrename={(name) => K === 'group' ? client.mutate((d) => B.updateGroup(d, card.id, { name })) : client.mutate((d) => B.setBoardItems(d, board.id, board.items.map((it: any) => (it.id === card.id ? { ...it, name } : it))))} />
        {/snippet}
        {#if clusterList}
          <div class="sb-clusters" style:--cols={grid.cols} style:--cw={`${grid.cardW}px`} style:--ch={`${grid.cardH}px`}>
            {#each clusterList as cl (cl.id)}
              <div class="sb-cluster"><span class="sb-cluster-name">{cl.name}</span>
                <div class="sb-grid">{#each cl.cards as card (card.id)}<div class="sb-cell" animate:flip={{ duration: reduced ? 0 : DURATION.enter }}>{@render cardOf(card, cards.indexOf(card))}</div>{/each}</div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="sb-grid" style:--cols={grid.cols} style:--cw={`${grid.cardW}px`} style:--ch={`${grid.cardH}px`}>
            {#each cards as card, i (card.id)}
              <div class="sb-cell" animate:flip={{ duration: reduced ? 0 : DURATION.enter }} in:scale={{ duration: reduced ? 0 : DURATION.enter, start: 0.6 }} out:scale={{ duration: reduced ? 0 : 180, start: 0.6 }}>{@render cardOf(card, i)}</div>
            {/each}
          </div>
        {/if}
      {/if}
    </main>
    {#if drawer && view === 'board'}
      <SbSettings kind={K} {prefs} {shared} {hasGroups} groups={K === 'group' ? data.groups : []} board={K === 'custom' ? board : null}
        onprefs={setPrefs} onshared={setShared} onclose={() => (drawer = false)}
        ongroup={(id, patch) => client.mutate((d) => B.updateGroup(d, id, patch))}
        onremovegroup={(id) => { const g = data.groups.find((x: any) => x.id === id); const run = () => { mutateScores((d) => B.removeGroup(d, id)); play('toc'); showToast(`${g?.name ?? '모둠'}을 뺐어요`, 'group'); }; if (g?.score) void ask(`${g.name}(${scoreText(g.score)}점)을 뺄까요?`, '되돌리기로 복구할 수 있어요.', '빼기', run); else run(); }}
        onboard={(patch) => client.mutate((d) => B.updateBoard(d, board.id, patch))}
        onitems={(items) => { mutateScores((d) => B.setBoardItems(d, board.id, items)); }}
        onduplicate={() => client.mutate((d) => B.duplicateBoard(d, board.id))} ondelete={deleteBoard} />
    {/if}
  </div>

  {#if confirm}
    <div class="sb-confirm" role="alertdialog" aria-label={confirm.text}>
      <p><b>{confirm.text}</b>{#if confirm.detail}<small>{confirm.detail}</small>{/if}</p>
      <div><button class="sb-tool-btn" bind:this={confirmCancel} onclick={() => (confirm = null)}>취소</button><button class="sb-tool-btn danger-fill" onclick={() => { const a = confirm?.action; confirm = null; a?.(); }}>{confirm.ok}</button></div>
    </div>
  {/if}
  {#if toast}<div class="sb-toast" role="status"><span>{toast.text}</span>{#if toast.undoKey}<button onclick={() => undo(toast?.undoKey)}>되돌리기</button>{/if}<button class="sb-toast-x" aria-label="알림 닫기" onclick={() => (toast = null)}><X size={14} /></button></div>{/if}
  {#if error}<p class="sb-error" role="alert">{error}<button aria-label="오류 닫기" onclick={() => (error = '')}><X size={14} /></button></p>{/if}
</section>

