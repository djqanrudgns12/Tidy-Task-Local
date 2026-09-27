<script lang="ts">
  // 학급 투표판 창(vote). 화면은 저장된 투표 단계(phase)를 따라 바뀝니다(PRD 3절):
  //   진행 중 투표 없음 → 홈 · 만들기 · 기록함 · 결과
  //   ready → 준비 · tutorial → 안내 · voting/paused → 투표 부스 · closed → 개표 대기 · counting → 개표 · done → 기록함에 옮기는 중
  // 투표 단계에서는 키보드 = 학생, 마우스 = 선생님(PRD 7절). 키는 이 창이 가장 먼저 받아 학생 키만 부스로 넘깁니다.
  import { onMount, tick, untrack } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Pin, Maximize2, Minimize2, X, Lock, Settings2 } from 'lucide-svelte';
  import { native } from '../../lib/toolkit/store.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import ToolIcon from '../toolkit/ToolIcon.svelte';
  import { createVoteStore } from '../../lib/vote/store.js';
  import { EMPTY_SESSION, normalizePrefs, sessionFromConfig, todayString, typeLabel } from '../../lib/vote/model.js';
  import * as B from '../../lib/vote/ballots.js';
  import { archiveSession, alreadyArchived, runoffConfig, removeEntry, restoreEntry, updateEntry } from '../../lib/vote/archive.js';
  import { randomId } from '../../lib/vote/random.js';
  import { createVoteAudio } from '../../lib/vote/audio.js';
  import { AUDIO_FILES, SPEECH_FILES, SPEECH_MANIFEST } from '../../lib/vote/assetFiles.js';
  import { createSpeech } from '../../lib/vote/speech.js';
  import { createVoteMusic, musicScene, musicTogglePatch } from '../../lib/vote/music.js';
  import { reducedMotion } from '../../lib/vote/motion.js';
  import { toggleFullscreen, isFullscreenNow, setPinned, openTeacherWindow, closeTeacherWindow } from '../../lib/vote/windows.js';
  import { send, receive } from '../../lib/vote/remote.js';
  import VoteHome from './home/VoteHome.svelte';
  import VoteWizard from './wizard/VoteWizard.svelte';
  import PrepScreen from './prep/PrepScreen.svelte';
  import TutorialStage from './tutorial/TutorialStage.svelte';
  import Booth from './booth/Booth.svelte';
  import ClosedScreen from './booth/ClosedScreen.svelte';
  import CountingStage from './counting/CountingStage.svelte';
  import ResultBoard from './result/ResultBoard.svelte';
  import TeacherWarn from './teacher/TeacherWarn.svelte';
  import TeacherDrawer from './teacher/TeacherDrawer.svelte';
  import ConfirmDialog from './teacher/ConfirmDialog.svelte';
  import MusicToggle from './common/MusicToggle.svelte';
  import './vote.css';

  // ── 저장소 ──
  let session = $state.raw<any>(EMPTY_SESSION);
  let archive = $state.raw<any>({ entries: [] });
  let draft = $state.raw<any>({ config: null, step: 0, seed: '', templateId: '' });
  let prefs = $state.raw<any>(normalizePrefs(undefined));
  let ready = $state(false);
  let loadError = $state('');
  const store = createVoteStore({
    onSession: (d) => (session = d),
    onArchive: (d) => (archive = d),
    onDraft: (d) => (draft = d),
    onPrefs: (d) => (prefs = d),
    onError: (m) => { if (m) showToast(m); },
    onNotice: (m) => showToast(m),
  });

  // ── 화면 ──
  type Screen = 'home' | 'wizard' | 'archive' | 'result' | 'replay' | 'devcheck';
  let screen = $state<Screen>('home');
  // Temporary DEV result checker: these hooks + dev/ResultCheck + lib/vote/devCheck can be removed together.
  let ResultCheck = $state<any>(null);
  let checkPhase = $state('counting');
  let checkToolsOpen = $state(true);
  let checkTitle = $state('');
  async function openResultCheck() {
    if (!import.meta.env.DEV) return;
    try {
      ResultCheck ??= (await import('./dev/ResultCheck.svelte')).default;
      checkPhase = 'counting';
      checkToolsOpen = true;
      screen = 'devcheck';
    } catch { showToast('점검 화면을 불러오지 못했어요. 다시 눌러 주세요.'); }
  }
  async function saveCheckEntry(entry: any) {
    const record = { ...entry, note: 'DEV 투표 결과 점검에서 생성한 가상 투표예요.' };
    const result = await store.archive.mutateAndConfirm(restoreEntry(record, 0), (a: any) => a.entries.some((e: any) => e.id === record.id));
    await store.archive.settle();
    if (result !== 'saved' && !store.archive.data.entries.some((e: any) => e.id === record.id)) {
      showToast('점검 결과를 기록함에 저장하지 못했어요.', { label: '다시 저장', run: () => void saveCheckEntry(entry) });
    }
  }
  let archiveOpen = $state(false);
  // 시안은 개발 미리보기에서만 선택합니다. 실제 버튼과 저장소를 공유해 최종 화면과 같은 조건으로 검토합니다.
  const homeDesign = !native && import.meta.env.DEV ? Math.max(0, Math.min(5, Number(new URLSearchParams(location.search).get('vote-home-design')) || 0)) : 0;
  let focusEntryId = $state<string | null>(null);
  let celebrate = $state(false);
  let tutorialReplay = $state(false);
  const view = $derived.by(() => {
    if (!ready) return 'loading';
    if (session.id) {
      switch (session.phase) {
        case 'ready': return 'prep';
        case 'tutorial': return 'tutorial';
        case 'voting':
        case 'paused': return tutorialReplay ? 'tutorial' : 'booth';
        case 'closed': return 'closed';
        case 'counting': return 'counting';
        default: return 'finishing';
      }
    }
    return screen;
  });
  // 학생 키보드를 받는 단계(키 잡기·커서 숨김·경고 팝업).
  const studentPhase = $derived(view === 'booth' || view === 'closed');
  const focusEntry = $derived(archive.entries.find((e: any) => e.id === focusEntryId) ?? null);

  // ── 소리·음성·움직임 ──
  const audio = createVoteAudio({ files: AUDIO_FILES });
  const speech = createSpeech({ audio, files: SPEECH_FILES, manifest: SPEECH_MANIFEST });
  let speechAvailable = $state(false);
  $effect(() => {
    audio.setVolume(prefs.volume);
    audio.setMuted(prefs.muted);
    speech.configure(prefs);
    speech.setSpeed(session.tutorial?.speed ?? 'slow');
    speechAvailable = speech.available(prefs.speechVoice);
  });
  const reduced = $derived(reducedMotion(prefs.reduced));
  const setPrefs = (patch: Record<string, unknown>) => store.prefs.mutate((p: any) => ({ ...p, ...patch }));

  // ── 배경 음악(music.js) ──
  // 이 창에 하나만 만듭니다(선생님 창은 만들지 않음 — 두 창에서 같은 곡이 겹쳐 나오지 않게).
  // 곡은 화면(view)에서 정해지고, 곡이 바뀔 때만 움직이므로 같은 곡을 쓰는 화면끼리는 끊기지 않습니다.
  let musicState = $state<{ track: string | null; status: string }>({ track: null, status: 'idle' });
  const music = createVoteMusic({
    channel: () => audio.musicChannel(),
    onRunning: (fn) => audio.onRunning(fn),
    isRunning: () => audio.running,
    onState: (s) => (musicState = s),
  });
  // 개발 미리보기 검수용: 콘솔에서 __voteMusic.snapshot()으로 곡·크기·재생 위치를 봅니다(배포 빌드에서는 빠짐).
  if (!native && import.meta.env.DEV) (window as any).__voteMusic = music;
  // ── 개발 전용: 효과음 청취 검수(&vote-sounds). 배포 빌드에서는 조건이 거짓이라 import째 빠집니다. ──
  let SoundBoard = $state<any>(null);
  // 효과음 청취 검수 화면(개발 전용)에서는 음악을 틀지 않습니다(효과음만 들어야 하니까).
  const scene = $derived(musicScene({ ready, view: view === 'devcheck' ? checkPhase : view, celebrate: view === 'devcheck' ? checkPhase === 'result' : celebrate, silentView: !!SoundBoard }));
  $effect(() => music.setScene(scene));
  // 음악 끄기(설정) · 전체 소리 끄기 · 크기 0이면 음악을 잠시 멈춥니다(다시 켜면 멈춘 자리에서).
  $effect(() => music.setSilenced(!prefs.music || prefs.muted || prefs.volume <= 0));
  // 첫 클릭 전에는 소리 장치가 잠겨 있을 수 있습니다(자동 재생 제한). 이때 음악 스위치를 누르면 "끄기"가 아니라 "틀기"로 받습니다 —
  // 음악이 안 들려 스위치를 눌렀는데 그 클릭이 장치를 깨우자마자 음악을 꺼 버리면 헷갈리니까.
  let gestured = false;
  let firstGesture = false;
  function onPointerDownCapture() {
    firstGesture = !gestured;
    gestured = true;
    void audio.unlock();
  }
  /** 배경 음악 켜기/끄기(제목줄 스위치 · 선생님 메뉴 공용). 설정에 저장되어 화면을 옮기거나 창을 다시 열어도 그대로입니다. */
  function setMusic(on: boolean) {
    const patch = musicTogglePatch(prefs, on);
    setPrefs(patch);
    if (!on) showToast('배경 음악을 껐어요 — 다시 켤 때까지 모든 화면에서 꺼져 있어요', undefined, 3500);
    else showToast(patch.muted === false || patch.volume ? '배경 음악과 소리를 켰어요' : '배경 음악을 켰어요', undefined, 2500);
  }
  function pressMusic() {
    if (prefs.music && firstGesture && musicState.status === 'waiting') {
      firstGesture = false;
      void audio.unlock();
      return;
    }
    firstGesture = false;
    setMusic(!prefs.music);
  }

  // ── 알림 띠·확인창 ──
  let toast = $state<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(text: string, action?: { label: string; run: () => void }, ms = 6000) {
    clearTimeout(toastTimer);
    toast = { text, action };
    toastTimer = setTimeout(() => (toast = null), ms);
  }
  type Ask = { title: string; detail?: string; ok: string; danger?: boolean; action: () => void };
  let confirmState = $state<Ask | null>(null);
  const ask = (a: Ask) => (confirmState = a);

  // ── 선생님 버튼(경고 팝업 → 서랍) ──
  let warnOpen = $state(false);
  let warnAction = $state<{ label: string; run: () => void } | null>(null);
  let drawerOpen = $state(false);
  function teacherClick() {
    warnAction = null;
    if (studentPhase || view === 'tutorial') warnOpen = true;
    else drawerOpen = !drawerOpen;
  }
  /** 경고 팝업을 지나 곧바로 할 일이 있는 버튼(개표 대기 화면의 [개표 시작]). */
  function teacherAction(label: string, run: () => void) {
    warnAction = { label, run: () => { warnOpen = false; run(); } };
    warnOpen = true;
  }

  // ── 창 ──
  let fullscreen = $state(false);
  let pinned = $state(false);
  let scheme = $state<'light' | 'dark'>('light');
  let fontFamily = $state('');
  const draggable = (node: HTMLElement) => (native ? dragRegion(node, { onDoubleClick: () => void doFullscreen() }) : { destroy() {} });
  async function doFullscreen() {
    try {
      fullscreen = await toggleFullscreen();
    } catch {
      showToast('전체 화면으로 바꾸지 못했어요.');
      await syncFullscreen();
    }
  }
  /** 창의 실제 전체 화면 상태로 맞춥니다(다른 모니터로 옮기기처럼 이 창 버튼 밖에서 바뀐 뒤). */
  async function syncFullscreen() {
    fullscreen = await isFullscreenNow().catch(() => fullscreen);
  }
  async function doPin() {
    try {
      await setPinned(!pinned);
      pinned = !pinned;
    } catch {}
  }
  async function doClose() {
    speech.cancel();
    audio.stop();
    // 음악은 뚝 끊지 않고 0.3초 동안 내립니다(저장 마무리와 함께 기다리므로 닫기가 더 느려지지는 않음).
    music.close();
    await Promise.all([store.settle().catch(() => {}), new Promise((r) => setTimeout(r, 320))]);
    await closeTeacherWindow().catch(() => {});
    await closeWindow();
  }
  function requestClose() {
    if (session.id && (session.phase === 'voting' || session.phase === 'paused')) {
      ask({ title: '투표가 진행 중이에요', detail: '받은 표는 안전하게 저장돼요. 다시 열면 이어서 받을 수 있어요.', ok: '닫기', action: () => void doClose() });
    } else void doClose();
  }

  // ── 키보드(초점)는 선생님 뜻대로 ──
  // 투표 중에 다른 창을 누르면 키보드는 그 창으로 가고, 투표판은 되찾지 않습니다(2026-09-26 사용자 요청).
  // 왜: 예전에는 0.25초 뒤 투표판이 setFocus()로 키보드를 되찾았는데, 선생님이 다른 창에 글을 쓰려고 누르면
  //   그 창이 잠깐 눌렸다가 곧바로 투표판으로 초점을 빼앗겨 투표 중에는 다른 창에 아무것도 입력할 수 없었습니다.
  //   (그 전의 "키보드를 기다려요" 가림막은 투표가 멈춘 것처럼 보여 없앴음 — 둘 다 다시 넣지 마세요.)
  // 대신 키보드가 다른 창에 있는 동안 투표판 왼쪽 위에 작은 알림만 띄웁니다(막지 않음). 투표판을 한 번 누르면 다시 받습니다.
  // 선생님 창은 자기 버튼을 누른 뒤에만 투표판에 돌려줍니다(VoteTeacherApp의 handBack — 선생님이 투표를 조작한 직후라서).
  const AWAY_NOTICE_MS = 600;
  let windowFocused = $state(true);
  let keyboardAway = $state(false);
  let awayTimer: ReturnType<typeof setTimeout> | undefined;
  function onFocusChange(focused: boolean) {
    windowFocused = focused;
    void send('vote-state', { kind: 'focus', focused });
    // 선생님 창 버튼을 누르면 잠깐(0.15초) 초점이 그쪽에 갔다 돌아오므로, 조금 기다렸다가 알림을 띄웁니다(깜빡임 방지).
    clearTimeout(awayTimer);
    if (focused) keyboardAway = false;
    else awayTimer = setTimeout(() => (keyboardAway = !windowFocused), AWAY_NOTICE_MS);
  }
  const held = $derived(view === 'booth' && (warnOpen || drawerOpen || !!confirmState));

  // ── 커서 숨김(투표 단계에서 마우스가 1초 멈추면) ──
  let cursorHidden = $state(false);
  let cursorTimer: ReturnType<typeof setTimeout> | undefined;
  function onPointerMove() {
    cursorHidden = false;
    clearTimeout(cursorTimer);
    if (studentPhase) cursorTimer = setTimeout(() => (cursorHidden = studentPhase && !warnOpen && !drawerOpen && !confirmState), 1000);
  }

  // ── 학생 키 잡기(투표 단계) ──
  let booth = $state<{ key: (code: string, repeat: boolean) => void; idle: () => boolean } | null>(null);
  function onKeyCapture(e: KeyboardEvent) {
    // 첫 키에서 소리 장치를 깨웁니다(브라우저 자동 재생 정책).
    void audio.unlock();
    if (!studentPhase) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && (confirmState || warnOpen || drawerOpen)) {
      // Esc는 선생님 창·확인창을 닫기만 합니다(닫히는 것은 해가 없음). 아무것도 없으면 부스로(다시 투표하기 팝업의 "아니요").
      if (confirmState) confirmState = null;
      else if (warnOpen) warnOpen = false;
      else drawerOpen = false;
      return;
    }
    if (view === 'booth' && !held) booth?.key(e.code, e.repeat);
  }
  // Space는 키를 뗄 때 버튼을 누르므로 keyup도 막습니다(마우스로 누른 뒤 초점이 남은 버튼을 학생 키가 다시 누르지 않게).
  function onKeyUpCapture(e: KeyboardEvent) {
    if (!studentPhase) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea')) return;
    e.preventDefault();
    e.stopPropagation();
  }
  function blockWheelZoom(e: WheelEvent) {
    if (e.ctrlKey) e.preventDefault();
  }
  function blockContext(e: Event) {
    if (studentPhase) e.preventDefault();
  }

  // ── 투표 흐름 ──
  // 만드는 중에 [만들기]·[결선 투표 시작]을 한 번 더 눌러도 투표가 두 번 만들어지지 않게 막습니다
  // (저장 확인 전에는 session.id가 아직 비어 있어 위의 검사만으로는 두 번째 누름을 못 막습니다).
  let starting = false;
  async function startSession(config: any, extra: Record<string, unknown> = {}) {
    if (session.id || starting) return false;
    starting = true;
    const id = randomId('v');
    const s = { ...sessionFromConfig(config, id, todayString()), ...extra };
    const r = await store.session.mutateAndConfirm(() => s, (d: any) => d.id === id).finally(() => (starting = false));
    if (r !== 'saved') {
      showToast('투표를 만들지 못했어요. 다시 눌러 주세요.');
      return false;
    }
    store.draft.mutate(() => ({ config: null, step: 0, seed: '', templateId: '' }));
    setPrefs({ lastVoters: s.rules.voters });
    return true;
  }
  async function clearSession() {
    return store.session.mutateAndConfirm(() => ({ id: null }), (d: any) => !d.id);
  }
  function configOf(s: any) {
    const { type, title, items, agendas, rules, reveal, tutorial } = s;
    return { type, title, items, agendas, rules, reveal, tutorial };
  }
  async function editFromPrep() {
    if (!session.id || session.ballots.length || session.runoffOf) return;
    const s = session;
    store.draft.mutate(() => ({ config: configOf(s), step: 1, seed: s.id, templateId: '' }));
    if ((await clearSession()) === 'saved') screen = 'wizard';
  }
  /** 투표를 통째로 없애고 첫 화면(홈)으로. 10초 동안 되돌릴 수 있습니다([투표 그만두기]·[투표 재시작하기 → 초기 페이지로] 공용). */
  async function discardVote(s: any, message: string) {
    drawerOpen = false;
    tutorialReplay = false;
    if ((await clearSession()) !== 'saved') return;
    screen = 'home';
    showToast(message, {
      label: '되돌리기',
      run: () => void store.session.mutateAndConfirm(B.restoreCancelled(s), (d: any) => d.id === s.id),
    }, 10000);
  }
  function cancelVote() {
    const s = session;
    ask({
      title: s.ballots.length ? `투표를 그만두면 받은 표 ${s.ballots.length}장이 사라져요` : '이 투표를 그만둘까요?',
      detail: '10초 안에는 되돌릴 수 있어요.',
      ok: '그만두기',
      danger: true,
      action: () => void discardVote(s, '투표를 그만뒀어요'),
    });
  }
  function begin(phase: 'tutorial' | 'voting') {
    void audio.unlock();
    store.session.mutate(B.begin(phase));
  }
  function endTutorial() {
    if (tutorialReplay) {
      tutorialReplay = false;
      return;
    }
    begin('voting');
  }
  // 안내를 다시 보는 동안에는 투표판이 화면에 없어 표가 들어오지 않습니다. 끝나면 멈춤 없이 곧바로 이어서 받습니다
  // (예전에는 멈춘 채 돌아와 [다시 받기]를 한 번 더 눌러야 해서 헷갈렸음).
  function replayTutorial() {
    drawerOpen = false;
    tutorialReplay = true;
  }
  async function closeVoting(auto: boolean) {
    const s = session;
    if (!s.id || (s.phase !== 'voting' && s.phase !== 'paused')) return;
    const order = B.countingOrder(s);
    const r = await store.session.mutateAndConfirm(B.close(order), (d: any) => d.phase === 'closed');
    if (r !== 'saved' && !auto) showToast('마감하지 못했어요. 다시 눌러 주세요.');
  }
  function askClose() {
    const s = session;
    ask({
      title: `${s.rules.voters}명 중 ${s.ballots.length}명이 투표했어요. 지금 마감할까요?`,
      detail: '마감하면 개표를 기다리는 화면으로 바뀌어요.',
      ok: '마감하기',
      action: () => {
        drawerOpen = false;
        void closeVoting(false);
      },
    });
  }
  function askVoidLast() {
    ask({
      title: '직전에 들어온 표 1장을 취소할까요?',
      detail: '표의 내용은 보이지 않아요. 취소한 친구는 다시 투표하면 돼요.',
      ok: '취소하기',
      danger: true,
      action: async () => {
        const r = await store.session.mutateAndConfirm(B.voidLast, (d: any) => !d.lastBallotId);
        showToast(r === 'saved' ? '직전 표 1장을 취소했어요' : '취소할 표가 없어요');
      },
    });
  }
  // [처음부터 다시 받기](선생님 메뉴 맨 아래): 투표(후보·설정)는 그대로, 받은 표만 비우고 곧바로 첫 친구부터 다시 받습니다.
  // 표가 사라지는 일이라 확인창을 거치고, 10초 동안 되돌릴 수 있게 합니다.
  // (예전 "잠시 쉬어요" 화면의 [투표 재시작하기]에서 옮겨 왔습니다. "초기 페이지로"는 바로 옆 [투표 그만두기]와 같아 뺐습니다.)
  function askRestart() {
    const s = session;
    if (!s.id || (s.phase !== 'voting' && s.phase !== 'paused') || !s.ballots.length) return;
    const seen = s.ballots.map((b: any) => b.id);
    async function revote() {
      drawerOpen = false;
      tutorialReplay = false;
      const r = await store.session.mutateAndConfirm(B.restart(seen), (d: any) => d.id === s.id && d.phase === 'voting' && !d.ballots.length);
      if (r !== 'saved') {
        showToast('다시 시작하지 못했어요. 다시 눌러 주세요.');
        return;
      }
      void audio.unlock();
      showToast('받은 표를 비우고 처음부터 다시 받아요', s.ballots.length ? {
        label: '되돌리기',
        run: () => void store.session.mutateAndConfirm(B.restoreRestarted(s), (d: any) => d.id === s.id && d.ballots.length === s.ballots.length),
      } : undefined, 10000);
    }
    ask({
      title: `받은 표 ${s.ballots.length}장을 비우고 처음부터 다시 받을까요?`,
      detail: '후보와 설정은 그대로예요. 첫 번째 친구부터 다시 투표해요. 10초 안에는 되돌릴 수 있어요.',
      ok: '처음부터 다시 받기',
      danger: true,
      action: () => void revote(),
    });
  }
  const setVoters = (n: number) => store.session.mutate(B.setVoters(n));
  function startCounting() {
    void audio.unlock();
    store.session.mutate(B.startCounting);
  }
  async function finishArchive(s: any, celebrateNow: boolean) {
    const r = await store.archive.mutateAndConfirm(archiveSession(s, todayString()), (a: any) => alreadyArchived(s, a));
    if (r !== 'saved' && !alreadyArchived(s, archive)) {
      showToast('기록함에 저장하지 못했어요. 창을 다시 열면 이어서 저장해요.');
      return;
    }
    // 결과 화면을 투표를 비우기 "전에" 정해 둡니다. 비우는 순간(저장 확인 전) 옛 화면 값(첫 화면)이 잠깐 보였다가 결과로 바뀌어,
    // 화면이 한 번 깜빡이고 배경 음악도 결과 연출(축하 소리 뒤에 메인 음악)과 어긋났습니다. 투표가 남아 있는 동안에는 screen 값이 화면에 쓰이지 않습니다.
    focusEntryId = s.runoffOf ?? s.id;
    celebrate = celebrateNow;
    screen = 'result';
    await clearSession();
  }
  async function finishCounting() {
    if (session.phase === 'counting') await store.session.mutateAndConfirm(B.finish, (d: any) => d.phase === 'done');
    await finishArchive(session, true);
  }
  async function startRunoff(entry: any) {
    const config = runoffConfig(entry);
    if (!config) return;
    if (await startSession(config, { runoffOf: entry.id, round: entry.runoffs.length + 1 })) celebrate = false;
  }
  async function duplicateEntry(entry: any) {
    const seed = randomId('v');
    const result = await store.draft.mutateAndConfirm(() => ({ config: { ...entry.config }, step: 1, seed, templateId: '' }), (d: any) => d.seed === seed && d.config?.title === entry.config.title);
    if (result === 'saved') screen = 'wizard';
    else showToast('투표를 복사하지 못했어요. 다시 시도해 주세요.');
  }
  function openArchive() {
    archiveOpen = true;
    screen = 'home';
    void tick().then(() => document.getElementById('vt-home-records')?.scrollIntoView({ block: 'nearest' }));
  }
  async function editEntry(entry: any, patch: { title: string; note: string }) {
    const change = updateEntry(entry.id, patch);
    const expected = change({ entries: [entry] }).entries[0];
    if (!patch.title.trim()) return false;
    const result = await store.archive.mutateAndConfirm(change, (a: any) => a.entries.some((e: any) => e.id === entry.id && e.config.title === expected.config.title && e.note === expected.note));
    if (result !== 'saved') return false;
    showToast('기록을 수정했어요');
    return true;
  }
  function deleteEntry(entry: any) {
    ask({
      title: `“${entry.config.title}” 기록을 삭제할까요?`,
      detail: '투표 결과와 결선 기록이 함께 삭제돼요. 삭제 후 10초 동안 되돌릴 수 있어요.',
      ok: '기록 삭제', danger: true,
      action: () => void (async () => {
        const latest = archive.entries.find((e: any) => e.id === entry.id);
        if (!latest) return;
        const index = archive.entries.findIndex((e: any) => e.id === entry.id);
        const result = await store.archive.mutateAndConfirm(removeEntry(entry.id), (a: any) => !a.entries.some((e: any) => e.id === entry.id));
        if (result !== 'saved') { showToast('기록을 삭제하지 못했어요. 다시 시도해 주세요.'); return; }
        if (focusEntryId === entry.id) { focusEntryId = null; openArchive(); }
        showToast(`“${latest.config.title}” 기록을 삭제했어요`, { label: '되돌리기', run: () => void (async () => {
          const restored = await store.archive.mutateAndConfirm(restoreEntry(latest, index), (a: any) => a.entries.some((e: any) => e.id === latest.id));
          showToast(restored === 'saved' ? '기록을 되돌렸어요' : '기록을 되돌리지 못했어요. 다시 시도해 주세요.');
        })() }, 10000);
      })(),
    });
  }

  // ── 부스 저장 콜백 ──
  const onSave = (ballot: any, u: number) => {
    const id = session.id;
    return store.session.mutateAndConfirm((s:any) => s.id === id ? B.insertBallot(ballot, u)(s) : s, (d: any) => d.id === id && d.ballots?.some((b: any) => b.id === ballot.id));
  };
  async function onRemove(id: string) {
    const currentId = session.id;
    const result = await store.session.mutateAndConfirm((s:any) => s.id === currentId ? B.removeBallot(id)(s) : s, (d: any) => d.id === currentId && !d.ballots?.some((b: any) => b.id === id));
    return result === 'saved' && session.id === currentId;
  }
  function onSealed() {
    const s = untrack(() => session);
    if (s.phase === 'voting' && s.ballots.length >= s.rules.voters) void closeVoting(true);
  }

  // ── 다시 열었을 때 정리(PRD 11·12절) ──
  async function recover() {
    const s = session;
    if (!s.id) {
      if (draft.config) screen = 'home';
      return;
    }
    if (s.phase === 'done' || alreadyArchived(s, archive)) {
      await finishArchive(s, false);
      return;
    }
    // 투표 중에 닫혔던 창을 다시 열면 멈추지 않고 이어서 받습니다(선생님이 멈추지 않았으니까).
    // 예전 판에서 멈춘 채 저장된 투표도 이제 멈춤을 푸는 버튼이 없으므로 이어서 받게 풉니다.
    if (s.phase === 'paused') await store.session.mutateAndConfirm(B.setPaused(false), (d: any) => d.phase !== 'paused');
    if (s.phase === 'voting' || s.phase === 'paused') showToast(`투표를 이어서 받아요 — 지금까지 ${s.ballots.length}장`);
    if (s.phase === 'tutorial') store.session.mutate((d: any) => (d.phase === 'tutorial' ? { ...d, phase: 'ready' } : d));
  }

  // ── 선생님 창의 원격 조작 ──
  let remoteSeq = $state(0);
  let remoteCmd = $state<any>(null);
  async function onRemote(p: any) {
    if (!p || typeof p !== 'object') return;
    if (p.kind === 'focus') {
      if (native) await getCurrentWindow().setFocus().catch(() => {});
      return;
    }
    if (p.kind === 'tutorial-replay') {
      replayTutorial();
      return;
    }
    // 선생님 창이 새로 열리면 지금 상태를 한 번 더 알립니다(개표·안내 화면은 remoteCmd가 바뀌면 다시 보냄).
    if (p.kind === 'sync') void send('vote-state', { kind: 'focus', focused: windowFocused });
    remoteCmd = { ...p, seq: ++remoteSeq };
  }

  // ── 개발 미리보기 채우기(&vote-fixture=…) ──
  async function applyFixture() {
    if (native || !import.meta.env.DEV) return;
    const params = new URLSearchParams(location.search);
    const name = params.get('vote-fixture');
    if (!name) return;
    const { fixture } = await import('../../lib/vote/fixtures.js');
    const f = fixture(name);
    const { session: fs, archive: fa } = f;
    if (fs) await store.session.mutateAndConfirm(() => fs, () => true);
    if (fa) await store.archive.mutateAndConfirm(() => fa, () => true);
    if (f.screen === 'archive') { screen = 'home'; archiveOpen = true; }
    else if (f.screen) screen = f.screen as Screen;
    if (f.focus) focusEntryId = f.focus;
    params.delete('vote-fixture');
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }

  // ── 글꼴·배색 읽기 ──
  function readAppearance() {
    const root = document.documentElement;
    scheme = root.style.colorScheme === 'dark' ? 'dark' : 'light';
    fontFamily = getComputedStyle(root).getPropertyValue('--tk-font').trim();
  }

  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    readAppearance();
    const observer = new MutationObserver(readAppearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('keydown', onKeyCapture, { capture: true });
    window.addEventListener('keyup', onKeyUpCapture, { capture: true });
    window.addEventListener('wheel', blockWheelZoom, { passive: false });
    window.addEventListener('contextmenu', blockContext);
    // 누를 때마다 소리 장치를 깨웁니다(첫 클릭 전에는 자동 재생 제한으로 잠겨 있을 수 있음). 먼저 받도록 capture로 겁니다.
    window.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
    const blur = () => onFocusChange(false);
    const focus = () => onFocusChange(true);
    if (!native) {
      window.addEventListener('blur', blur);
      window.addEventListener('focus', focus);
    }
    const onDocFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onDocFullscreen);
    const offSpeaking = speech.onSpeaking((on) => audio.duck(on));
    if (!native && import.meta.env.DEV && new URLSearchParams(location.search).has('vote-sounds')) {
      void import('./dev/SoundBoard.svelte').then((m) => (SoundBoard = m.default));
    }
    void (async () => {
      try {
        await store.load();
        await applyFixture();
        await recover();
      } catch {
        loadError = '학급 투표를 불러오지 못했어요. 창을 다시 열어 주세요.';
      }
      ready = true;
      speechAvailable = await speech.available();
      offs.push(await receive('vote-remote', (p) => void onRemote(p)));
      if (native) {
        const win = getCurrentWindow();
        fullscreen = await win.isFullscreen().catch(() => false);
        offs.push(await win.onFocusChanged(({ payload }) => onFocusChange(payload)));
        offs.push(await win.onCloseRequested((event) => {
          event.preventDefault();
          requestClose();
        }));
        // 전체 화면은 창 크기가 바뀔 때 다시 읽습니다(두 번 누르기·다른 모니터로 옮기기 등 어디서 바뀌어도 버튼 글자가 맞게).
        offs.push(await win.onResized(() => void syncFullscreen()));
      }
      if (disposed) offs.forEach((off) => off());
    })();
    return () => {
      disposed = true;
      offs.forEach((off) => off());
      offSpeaking();
      observer.disconnect();
      window.removeEventListener('keydown', onKeyCapture, { capture: true });
      window.removeEventListener('keyup', onKeyUpCapture, { capture: true });
      window.removeEventListener('wheel', blockWheelZoom);
      window.removeEventListener('contextmenu', blockContext);
      window.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('fullscreenchange', onDocFullscreen);
      clearTimeout(toastTimer);
      clearTimeout(awayTimer);
      clearTimeout(cursorTimer);
      speech.dispose();
      music.dispose();
      audio.dispose();
      store.dispose();
    };
  });

  // 투표 단계를 벗어나면 커서·팝업을 원래대로.
  $effect(() => {
    if (!studentPhase) {
      cursorHidden = false;
      warnOpen = false;
    }
  });
  // "안내 다시 보기" 중에 선생님 창에서 마감·그만두기를 하면 표시가 남아, 나중에 인원을 늘려 다시 받을 때
  // 투표판 대신 안내가 떠 버렸습니다. 투표 중(멈춤 포함)이 아니게 되면 내려 둡니다.
  $effect(() => {
    const phase = session.id ? session.phase : null;
    if (phase !== 'voting' && phase !== 'paused') untrack(() => { if (tutorialReplay) tutorialReplay = false; });
  });
  // 마감 소리는 "투표 중 → 마감"으로 바뀐 순간에 냅니다. 이 창·서랍·선생님 창 어디서 마감해도 투표판에서 한 번만 울립니다.
  // (다시 열었을 때 이미 마감이던 투표는 울리지 않음 — 처음 읽은 단계는 비교 대상이 없음)
  let lastPhase: string | null = null;
  $effect(() => {
    const phase = session.id ? session.phase : null;
    const loaded = ready;
    untrack(() => {
      if (loaded && phase === 'closed' && (lastPhase === 'voting' || lastPhase === 'paused')) audio.play('vote.allDone');
      lastPhase = loaded ? phase : null;
    });
  });
  // 선생님이 인원을 받은 표 수까지 줄이면 곧바로 마감합니다(인원이 차면 자동 마감 — PRD 6절).
  // 학생이 "투표했어요!" 화면에 있으면 곧 저절로 봉인되고, 그때 onSealed가 마감합니다.
  $effect(() => {
    const s = session;
    if (view !== 'booth' || !s.id || s.phase !== 'voting' || s.ballots.length < s.rules.voters) return;
    untrack(() => {
      if (booth?.idle()) void closeVoting(true);
    });
  });

  const participants = $derived(session.id ? session.ballots.length : 0);
  const title = $derived(view === 'devcheck' ? checkTitle : session.id ? session.title : view === 'result' || view === 'replay' ? focusEntry?.config.title ?? '' : '');
</script>

<svelte:window onpointermove={onPointerMove} />
<section class="vt-root" class:fullscreen class:reduced class:cursor-hidden={cursorHidden} data-scheme={scheme} data-view={view} aria-label="학급 투표">
  <header class="vt-titlebar" use:draggable>
    <div class="vt-brand">
      <ToolIcon kind="vote" size={24} /><strong>학급 투표</strong>
      {#if title}<span class="vt-divider"></span><span class="vt-context">{title}</span>{/if}
      <!-- 결선 제목에는 이미 "결선"이 붙어 있으므로, 두 번째 결선부터 몇 번째인지만 표시합니다 -->
      {#if session.id && session.runoffOf && session.round > 1}<span class="vt-tag">결선 {session.round}회</span>{/if}
    </div>
    {#if session.id && (view === 'booth' || view === 'closed' || view === 'prep' || view === 'tutorial')}
      <div class="vt-count-pill" aria-live="polite" title="참여 인원">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10h14l-1.2 9.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z" /><path d="M4 8.5h16v2H4ZM9.5 9.5h5" /></svg>
        <b>{participants}</b><span>/ {session.rules.voters}명</span>
      </div>
    {/if}
    <div class="vt-window-actions">
      {#if view === 'devcheck' && import.meta.env.DEV}<button id="vt-dev-tools-toggle" class="vt-dev-tools" aria-label="점검 도구" aria-expanded={checkToolsOpen} aria-controls="vt-dev-tools-panel" onclick={() => (checkToolsOpen = !checkToolsOpen)}><Settings2 size={16} /><span>점검 도구</span></button>{/if}
      <!-- 배경 음악 켜기/끄기: 제목줄이라 모든 화면에 같은 자리로 보입니다(설정에 저장되어 화면을 옮겨도 그대로) -->
      <MusicToggle on={prefs.music} waiting={musicState.status === 'waiting'} quiet={studentPhase} onpress={pressMusic} />
      <button class="vt-teacher-btn" class:quiet={studentPhase} onclick={teacherClick} aria-label="선생님 메뉴" title="선생님 메뉴">
        {#if studentPhase || view === 'tutorial'}<Lock size={15} />{:else}<Settings2 size={16} />{/if}<span>선생님</span>
      </button>
      {#if native}<button class:active={pinned} aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={doPin}><Pin size={17} /></button>{/if}
      <button aria-label={fullscreen ? '전체 화면 끝내기' : '전체 화면'} title={fullscreen ? '전체 화면 끝내기' : '전체 화면'} onclick={doFullscreen}>{#if fullscreen}<Minimize2 size={18} />{:else}<Maximize2 size={18} />{/if}</button>
      <button aria-label="닫기" title="닫기" onclick={requestClose}><X size={19} /></button>
    </div>
  </header>

  <main class="vt-main">
    {#if SoundBoard}
      <SoundBoard />
    {:else if view === 'loading'}
      <p class="vt-loading">{loadError || '학급 투표를 준비하고 있어요…'}</p>
    {:else if view === 'home' || view === 'archive'}
      {#if import.meta.env.DEV}<div class="vt-dev-launch"><button class="vt-btn" onclick={openResultCheck}>투표 결과 점검 <small>DEV</small></button></div>{/if}
      <VoteHome {archive} {draft} {prefs} {fontFamily} design={homeDesign} bind:archiveOpen
        onnew={() => { store.draft.mutate(() => ({ config: null, step: 0, seed: randomId('v'), templateId: '' })); screen = 'wizard'; }}
        oncontinue={() => (screen = 'wizard')}
        ondiscard={() => store.draft.mutate(() => ({ config: null, step: 0, seed: '', templateId: '' }))}
        ontemplate={(d) => { store.draft.mutate(() => d); screen = 'wizard'; }}
        onreplay={(e) => { focusEntryId = e.id; screen = 'replay'; }}
        onduplicate={duplicateEntry} ondelete={deleteEntry} onupdate={editEntry}
        onrunoff={(e) => void startRunoff(e)} ontoast={(t) => showToast(t)} />
    {:else if view === 'devcheck' && ResultCheck && import.meta.env.DEV}
      <ResultCheck {audio} {reduced} {fontFamily} bind:toolsOpen={checkToolsOpen} ontitle={(t: string) => (checkTitle = t)} onexit={() => (screen = 'home')} onarchive={openArchive} onsave={saveCheckEntry} ontoast={(t: string) => showToast(t)} onphase={(p: string) => (checkPhase = p)} />
    {:else if view === 'wizard'}
      <VoteWizard {draft} {prefs} {reduced} {speechAvailable} {fontFamily} {audio}
        onchange={(d) => store.draft.mutate(() => d)}
        onexit={() => (screen = 'home')}
        oncreate={async (config) => { if (await startSession(config)) screen = 'home'; }} />
    {:else if view === 'prep'}
      <PrepScreen {session} {prefs} {speechAvailable} {speech} {audio} {fullscreen} {reduced}
        oncontent={(speechContent) => store.session.mutate((s: any) => s.phase === 'ready' ? { ...s, speechContent } : s)}
        onfullscreen={doFullscreen}
        onmoved={() => void syncFullscreen()}
        onteacher={() => void openTeacherWindow()}
        ontutorial={() => begin('tutorial')}
        onvote={() => begin('voting')}
        onedit={editFromPrep}
        oncancel={cancelVote}
        onprefs={setPrefs} />
    {:else if view === 'tutorial'}
      <TutorialStage {session} {prefs} {speech} {speechAvailable} {audio} {reduced} {remoteCmd} replay={tutorialReplay}
        onfinish={endTutorial} />
    {:else if view === 'booth'}
      <Booth bind:this={booth} {session} {audio} {reduced} {held} {keyboardAway} {fontFamily}
        {onSave} {onRemove} {onSealed}
        onclosevote={askClose}
        oncancel={cancelVote} />
    {:else if view === 'closed'}
      <ClosedScreen {session} {reduced} onteacher={() => teacherAction('개표 시작', startCounting)} />
    {:else if view === 'counting'}
      <CountingStage {session} {audio} {reduced} {fontFamily} {remoteCmd} live
        onpersist={(patch) => store.session.mutate(patch)}
        onfinish={finishCounting} />
    {:else if view === 'finishing'}
      <p class="vt-loading">결과를 기록함에 옮기고 있어요…</p>
    {:else if view === 'result' && focusEntry}
      <ResultBoard entry={focusEntry} {audio} {reduced} {fontFamily} {celebrate}
        canRunoff={!session.id}
        onrunoff={() => void startRunoff(focusEntry)}
        onreplay={() => (screen = 'replay')}
        onarchive={openArchive}
        onhome={() => (screen = 'home')}
        ontoast={(t) => showToast(t)} />
    {:else if view === 'replay' && focusEntry}
      <CountingStage entry={focusEntry} {audio} {reduced} {fontFamily} {remoteCmd} live={false}
        onfinish={() => { celebrate = true; screen = 'result'; }} />
    {:else}
      <p class="vt-loading">기록을 찾지 못했어요. <button class="vt-link" onclick={() => (screen = 'home')}>처음으로</button></p>
    {/if}
  </main>

  {#if warnOpen}
    <TeacherWarn action={warnAction} onopen={() => { warnOpen = false; drawerOpen = true; }} onclose={() => (warnOpen = false)} />
  {/if}
  {#if drawerOpen}
    <TeacherDrawer {view} {session} {prefs} {speechAvailable}
      onclose={() => (drawerOpen = false)}
      onvoid={askVoidLast}
      onvoters={setVoters}
      ontutorial={replayTutorial}
      onclosevote={askClose}
      onstartcount={() => { drawerOpen = false; startCounting(); }}
      onrestart={askRestart}
      oncancel={cancelVote}
      onteacherwindow={() => { drawerOpen = false; void openTeacherWindow(); }}
      onprefs={setPrefs}
      onmusic={setMusic}
      onedit={() => { drawerOpen = false; void editFromPrep(); }}
      onarchive={() => { drawerOpen = false; openArchive(); }}
      onhome={() => { drawerOpen = false; screen = 'home'; }} />
  {/if}
  {#if confirmState}
    <ConfirmDialog {...confirmState} mouseOnly={studentPhase}
      oncancel={() => (confirmState = null)}
      onok={() => { const run = confirmState?.action; confirmState = null; run?.(); }} />
  {/if}
  {#if toast}
    <div class="vt-toast" role="status"><span>{toast.text}</span>
      {#if toast.action}<button onclick={() => { toast?.action?.run(); toast = null; }}>{toast.action.label}</button>{/if}
      <button aria-label="알림 닫기" onclick={() => (toast = null)}><X size={14} /></button>
    </div>
  {/if}
</section>

<style>
  .vt-window-actions .vt-dev-tools { display: inline-flex; align-items: center; gap: 6px; width: auto; padding: 0 10px; font-size: 13px; white-space: nowrap; }
  .vt-window-actions .vt-dev-tools[aria-expanded="true"] { background: var(--vt-soft); color: var(--vt-accent); }
  .vt-dev-launch { display: flex; justify-content: flex-end; padding: 12px 24px 0; }
  .vt-dev-launch small { font-size: 11px; color: var(--vt-muted); }
  .vt-titlebar {
    position: relative;
    z-index: 20;
    flex: none;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 10px 0 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--vt-line) 80%, transparent);
    background: color-mix(in srgb, var(--vt-card) 88%, transparent);
    backdrop-filter: blur(6px);
  }
  .vt-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    flex: 1;
    white-space: nowrap;
  }
  .vt-brand strong {
    flex: none;
    font-size: 16px;
  }
  .vt-divider {
    flex: none;
    width: 1px;
    height: 18px;
    background: var(--vt-line);
  }
  .vt-context {
    overflow: hidden;
    color: var(--vt-muted);
    font-size: 15px;
    font-weight: 800;
    text-overflow: ellipsis;
  }
  .vt-tag {
    flex: none;
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--vt-gold);
    color: #5a4108;
    font-size: 12px;
    font-weight: 900;
  }
  .vt-count-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px 0 10px;
    border-radius: 999px;
    background: var(--vt-soft);
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .vt-count-pill svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: var(--vt-accent);
    stroke-width: 1.8;
    stroke-linejoin: round;
  }
  .vt-count-pill b {
    font-size: 19px;
  }
  .vt-count-pill span {
    color: var(--vt-muted);
  }
  .vt-window-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
  }
  .vt-window-actions button {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--vt-muted);
  }
  .vt-window-actions button:hover {
    background: var(--vt-soft);
    color: var(--vt-ink);
  }
  .vt-window-actions button.active {
    color: var(--vt-accent);
    background: var(--vt-soft);
  }
  .vt-window-actions .vt-teacher-btn {
    display: inline-flex;
    width: auto;
    gap: 5px;
    padding: 0 12px;
    margin-right: 4px;
    border: 1px solid var(--vt-line);
    border-radius: 999px;
    color: var(--vt-ink);
    font-size: 14px;
    font-weight: 700;
  }
  /* 투표 중에는 눈에 덜 띄게(PRD 7절) */
  .vt-window-actions .vt-teacher-btn.quiet {
    opacity: 0.55;
  }
  .vt-window-actions .vt-teacher-btn.quiet:hover {
    opacity: 1;
  }
  .vt-main {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .vt-loading {
    margin: auto;
    color: var(--vt-muted);
    font-size: 16px;
    font-weight: 700;
  }
</style>
