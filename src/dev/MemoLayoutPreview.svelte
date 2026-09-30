<script>
  // 개발 전용 확인 화면: ?memo-layout-preview
  // 실제 앱과 같은 몸통(MemoBody)과 배치 컨트롤러를 "창을 흉내 낸 상자"에 넣고,
  // 위쪽·아래쪽 테두리 끌기와 스플리터 끌기를 Tauri 창 알림과 같은 방식으로 흉내 냅니다.
  // 브라우저 콘솔: __memoPreview.drag('bottom', -40) · .measure() · .scenario('bottom-shrink')
  import { onMount, tick } from 'svelte';
  import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
  import { appState } from '../lib/appState.svelte.js';
  import MemoBody from '../components/MemoBody.svelte';
  import Titlebar from '../components/Titlebar.svelte';
  import MainToolbar from '../components/MainToolbar.svelte';
  import { getTidyTheme, TIDY_THEMES } from '../lib/themes.js';
  import { createMemoLayoutController } from '../lib/layout/memoLayoutController.js';
  import { DEFAULT_NOTES_H, GESTURE_IDLE_MS, TODOS_MIN_H, resolveNotesPreference, splitterWindowHeight } from '../lib/layout/memoLayout.js';
  import { observeTodoSort } from './todoSortQA.js';

  const HEADER_H = 92; // 제목줄 + 툴바 두 줄(스크린샷과 비슷한 높이)
  const params = new URLSearchParams(location.search);
  const fullUI = params.has('full-ui');
  const sortQA = params.has('sort-qa');
  // 자동 검수 브라우저는 '동작 줄이기'가 켜져 있으므로 일반 애니메이션 모드도 별도로 검수합니다.
  const nativeMatchMedia = window.matchMedia.bind(window);
  if (sortQA && params.get('sort-motion') === 'full') {
    window.matchMedia = query => nativeMatchMedia(query === '(prefers-reduced-motion: reduce)' ? 'not all' : query);
  }
  let sortSaves = $state(0);
  let sortEvidence = $state({});
  // 실제 사용자 저장소와 분리한 화면으로 크기·글꼴을 바꿔 검수합니다.
  mockIPC((command) => {
    if (command.endsWith('get_all_webviews') || command.endsWith('get_all_windows')) return [];
    if (command.endsWith('is_fullscreen') || command.endsWith('is_maximized')) return false;
    return null;
  }, { shouldMockEvents: true });
  mockWindows('main');
  appState.save = async () => {};
  appState.saveNow = async () => { if (sortQA) sortSaves++; };
  appState.uiFontSize = Number(params.get('ui-size')) || 10;
  appState.fontSize = Number(params.get('text-size')) || 10;
  appState.uiFontFamily = params.get('font') || (fullUI ? '메이플스토리 L' : '굴림');
  appState.fontFamily = appState.uiFontFamily;
  appState.headerDesign = params.get('design') || 'classic';
  appState.themeColor = params.get('theme') || 'purple';
  appState.isDarkMode = params.has('dark');

  let frameY = $state(40);
  let frameH = $state(Number(params.get('height')) || 660);
  let frameW = $state(Number(params.get('width')) || 330);
  let minH = $state(0);
  let eventFirst = $state(false);
  let status = $state('');
  /** @type {HTMLElement | null} */
  let frameEl = $state(null);

  // 스크린샷과 같은 내용
  appState.todos = [
    { id: 'a', text: '투닝 계정 찾기', completed: false, deadline: '2026-09-30' },
    { id: 'b', text: '5학년 4반 보결(2,3)', completed: false, deadline: '2026-10-01' },
    { id: 'c', text: '기초학력 2차 향상도 검사', completed: false, deadline: '2026-10-13' },
    { id: 'd', text: '기초학력 운영비 소진', completed: false, deadline: '2026-10-15' },
  ];
  if (params.get('sort-fixture') === 'long') {
    appState.todos[1].text = '긴 일정 내용입니다. 기초학력 향상도 검사 준비물을 확인하고 담당 선생님과 세부 일정을 조율합니다.';
    appState.todos[2].text = 'https://example.test/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  }
  if (params.get('sort-fixture') === 'many') {
    appState.todos = Array.from({ length: 24 }, (_, i) => ({ id: `t${i}`, text: `일정 ${i + 1}${i % 5 === 1 ? ' — 여러 줄로 이어지는 긴 일정의 세부 내용입니다. 준비물을 확인합니다.' : ''}`, completed: false, deadline: '' }));
  }
  appState.archivedTodos = [];
  appState.notes = '<div>dfasasdfsdf</div>';
  appState.notesPaneHeight = 230;

  const controller = createMemoLayoutController({
    readNotesPreference: () => resolveNotesPreference(appState.notesPaneHeight, appState.notesHeight),
    commitNotesPreference: (px) => { appState.notesPaneHeight = px; },
    applyMinHeight: (h) => {
      minH = h;
      // OS처럼: 창이 새 최소보다 작으면 창을 키웁니다(아래쪽으로).
      if (frameH < h) {
        frameH = h;
        queueMicrotask(() => controller.noteResized(frameH));
      }
    },
    getWorkAreaHeight: () => 1040,
    headerSelector: '.main-header',
    getWindowRect: () => {
      const r = frameEl?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom } : { top: 0, bottom: window.innerHeight };
    },
  });

  $effect(() => {
    const root = document.documentElement;
    const fontStack = (/** @type {string} */ name) => appState.allFonts.find(f => f.name === name)?.family || '"Malgun Gothic", sans-serif';
    root.style.setProperty('--global-font-family', fontStack(appState.fontFamily));
    root.style.setProperty('--ui-font-family', fontStack(appState.uiFontFamily));
    root.style.setProperty('--global-font-size', `${appState.fontSize}pt`);
    root.style.setProperty('--ui-font-size', `${appState.uiFontSize}pt`);
    root.style.fontSize = `${appState.uiFontSize}pt`;
    const theme = (getTidyTheme(appState.themeColor) || getTidyTheme('purple') || TIDY_THEMES[0]).tidy;
    root.style.setProperty('--global-theme-color', appState.isDarkMode ? '#23272e' : theme.bg);
    root.style.setProperty('--global-section-bg', appState.isDarkMode ? '#2b3039' : theme.section);
    root.style.setProperty('--global-border-color', appState.isDarkMode ? 'rgba(255,255,255,.08)' : theme.border);
    controller.requestRecomputeNextFrame();
  });

  // 화면이 가려져 있으면 requestAnimationFrame·ResizeObserver가 멈추므로 시간 제한을 함께 둡니다.
  // 그때는 ResizeObserver 대신 직접 다시 계산해, 계산·적용 경로만이라도 똑같이 검사합니다.
  function nextFrames(n = 2) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (/** @type {boolean} */ stalled) => {
        if (done) return;
        done = true;
        if (stalled) controller.recompute(); // 화면 갱신이 멈춰 ResizeObserver가 오지 않음
        resolve(undefined);
      };
      const step = (/** @type {number} */ left) => (left <= 0 ? finish(false) : requestAnimationFrame(() => step(left - 1)));
      step(n);
      setTimeout(() => finish(true), 40 * n);
    });
  }

  /** 창 크기 알림(Tauri)을 흉내 냅니다. eventFirst면 화면보다 알림이 먼저, 아니면 화면이 먼저 바뀝니다. */
  async function emitGeometry(/** @type {boolean} */ moved) {
    if (eventFirst) {
      if (moved) controller.noteMoved(frameY);
      controller.noteResized(frameH);
      await tick();
      await nextFrames();
    } else {
      await tick();
      await nextFrames(1);
      if (moved) controller.noteMoved(frameY);
      controller.noteResized(frameH);
      await nextFrames(1);
    }
  }

  /** 테두리 한 걸음. OS처럼 최소 높이 아래로는 줄지 않습니다. @param {'top' | 'bottom'} edge @param {number} dy */
  async function drag(edge, dy) {
    if (edge === 'bottom') {
      frameH = Math.max(minH, frameH + dy);
      await emitGeometry(false);
    } else {
      const nextH = Math.max(minH, frameH - dy);
      frameY += frameH - nextH;
      frameH = nextH;
      await emitGeometry(true);
    }
    return measure();
  }

  /** 여러 걸음에 나눠 끕니다(실제 끌기처럼). */
  async function dragBy(/** @type {'top' | 'bottom'} */ edge, /** @type {number} */ total, steps = 8) {
    const each = total / steps;
    for (let i = 0; i < steps; i++) await drag(edge, Math.round(each * (i + 1)) - Math.round(each * i));
    return measure();
  }

  async function release() {
    await new Promise((r) => setTimeout(r, GESTURE_IDLE_MS + 80));
    await nextFrames();
    return measure();
  }

  /** 스플리터 끌기(앱의 startSplitterDrag와 같은 계산). */
  async function splitter(/** @type {number} */ total, steps = 8) {
    const startTodosH = controller.beginSplitterDrag() ?? TODOS_MIN_H;
    const startWindowH = frameH;
    for (let i = 1; i <= steps; i++) {
      frameH = splitterWindowHeight({ startWindowH, startTodosH, todosMin: TODOS_MIN_H, pointerDelta: Math.round(total * i / steps), maxWindowH: 1040 });
      await emitGeometry(false);
    }
    controller.endSplitterDrag();
    return release();
  }

  function measure() {
    const q = (/** @type {string} */ s) => /** @type {HTMLElement | null} */ (frameEl?.querySelector(s));
    const body = frameEl?.querySelector('.memo-preview-body > div');
    const kids = body ? /** @type {HTMLElement[]} */ ([...body.children]) : [];
    const todos = kids[0];
    const archive = kids.find((k) => k.querySelector('.archived-root'));
    const notes = kids.find((k) => k.querySelector('.note-wrapper'));
    const list = q('.archived-scroll');
    const state = controller.debugState();
    return {
      window: frameH,
      body: /** @type {HTMLElement | undefined} */ (body)?.clientHeight ?? 0,
      todos: todos?.offsetHeight ?? 0,
      archive: archive?.offsetHeight ?? 0,
      archiveList: list?.clientHeight ?? null,
      notes: notes?.offsetHeight ?? 0,
      mode: state.gesture?.mode ?? 'idle',
      notesPref: appState.notesPaneHeight,
      minH,
    };
  }

  /** @param {string} name */
  async function scenario(name) {
    /** @type {any[]} */
    const log = [];
    const snap = (/** @type {string} */ label) => log.push({ label, ...measure() });
    if (name === 'bottom-shrink') {
      snap('start');
      for (const d of [-60, -60, -60, -60, -60, -60, -60]) { await drag('bottom', d); snap(`bottom ${d}`); }
      await release(); snap('released');
    } else if (name === 'bottom-roundtrip') {
      snap('start');
      await dragBy('bottom', -260); snap('shrunk 260 (same drag)');
      await dragBy('bottom', 260); snap('back to start (same drag)');
      await release(); snap('released');
    } else if (name === 'top') {
      snap('start');
      for (const d of [40, 40, 40, 40, 40, 40, 40, 40]) { await drag('top', d); snap(`top +${d}`); }
      for (const d of [-80, -80, -80, -80]) { await drag('top', d); snap(`top ${d}`); }
      await release(); snap('released');
    } else if (name === 'splitter') {
      snap('start');
      await splitter(-120); snap('splitter -120');
      await splitter(-400); snap('splitter -400 (min)');
      await splitter(150); snap('splitter +150');
    }
    return log;
  }

  function addArchived(/** @type {number} */ n) {
    const start = appState.archivedTodos.length;
    appState.archivedTodos = [
      ...appState.archivedTodos,
      ...Array.from({ length: n }, (_, i) => ({ id: `x${start + i}`, text: `끝난 일 ${start + i + 1}`, completed: true, deadline: '' })),
    ];
  }

  function reset() {
    frameY = 40;
    frameH = 660;
    appState.notesPaneHeight = 230;
    appState.notes = '<div>dfasasdfsdf</div>';
    appState.archivedTodos = [];
    controller.markProgrammatic();
    // 실제 창처럼 위치가 바뀌면 이동 알림도 보냅니다(빠뜨리면 옛 위치로 테두리를 판별함).
    queueMicrotask(() => {
      controller.noteMoved(frameY);
      controller.noteResized(frameH);
    });
  }

  // 실제 테두리를 손으로 끌어 보는 손잡이
  /** @param {PointerEvent} e @param {'top' | 'bottom'} edge */
  function handleDown(e, edge) {
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    target.setPointerCapture(e.pointerId);
    let lastY = e.clientY;
    let busy = false;
    const move = async (/** @type {PointerEvent} */ ev) => {
      if (busy) return;
      busy = true;
      const dy = ev.clientY - lastY;
      lastY = ev.clientY;
      if (dy) await drag(edge, dy);
      busy = false;
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  /** 앱의 스플리터와 같은 계산으로 손으로 끌어 봅니다. @param {PointerEvent} e */
  function onsplitterdown(e) {
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    target.setPointerCapture(e.pointerId);
    const startTodosH = controller.beginSplitterDrag() ?? TODOS_MIN_H;
    const startWindowH = frameH;
    const startY = e.clientY;
    const move = (/** @type {PointerEvent} */ ev) => {
      frameH = splitterWindowHeight({ startWindowH, startTodosH, todosMin: TODOS_MIN_H, pointerDelta: ev.clientY - startY, maxWindowH: 1040 });
      queueMicrotask(() => controller.noteResized(frameH));
    };
    const up = () => {
      controller.endSplitterDrag();
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  onMount(() => {
    const stopSortQA = sortQA && frameEl ? observeTodoSort(frameEl,
      () => appState.todos.map(todo => todo.id), () => sortSaves,
      evidence => { sortEvidence = evidence; }) : () => {};
    controller.noteGeometry({ y: frameY, height: frameH });
    /** @type {any} */ (window).__memoPreview = { drag, dragBy, release, splitter, measure, scenario, addArchived, reset, controller, appState,
      setEventFirst: (/** @type {boolean} */ v) => { eventFirst = v; },
      configure: async (/** @type {{ width?: number, height?: number, uiSize?: number, textSize?: number }} */ values) => {
        if (values.width) frameW = values.width;
        if (values.height) frameH = values.height;
        if (values.uiSize) appState.uiFontSize = values.uiSize;
        if (values.textSize) appState.fontSize = values.textSize;
        controller.markProgrammatic();
        await tick(); await nextFrames(); controller.recompute();
      } };
    status = '준비됨';
    return () => { stopSortQA(); window.matchMedia = nativeMatchMedia; controller.destroy(); };
  });

</script>

<div class="page" class:standalone={params.has('standalone')}>
  {#if sortQA}
    <output hidden data-sort-qa data-order={appState.todos.map(todo => todo.id).join(',')} data-saves={sortSaves} data-evidence={JSON.stringify(sortEvidence)}></output>
    <div class="sort-qa-controls" style="left: {frameW + 40}px">
      <button onclick={() => { appState.isUpdateFrozen = !appState.isUpdateFrozen; }}>검수: 입력 잠금</button>
      <button onclick={() => { appState.searchQuery = appState.searchQuery ? '' : '기초'; }}>검수: 검색</button>
      <button onclick={() => { appState.todos = [...appState.todos, { id: 'qa-new', text: '추가된 일정', completed: false, deadline: '' }]; }}>검수: 일정 추가</button>
      <button onclick={() => { appState.todos = appState.todos.filter(todo => todo.id !== 'b'); }}>검수: 일정 삭제</button>
    </div>
  {/if}
  <div class="panel">
    <strong>메모 창 세로 배치 확인</strong>
    <p>회색 띠(위·아래)를 끌면 창 테두리 끌기를, 가운데 줄을 끌면 스플리터를 흉내 냅니다.</p>
    <label><input type="checkbox" bind:checked={eventFirst} /> 창 알림이 화면보다 먼저 옴</label>
    <div class="buttons">
      <button onclick={() => addArchived(3)}>마감된 일 +3</button>
      <button onclick={() => addArchived(12)}>마감된 일 +12</button>
      <button onclick={() => { appState.notes = '<div>' + Array.from({ length: 14 }, (_, i) => `메모 줄 ${i + 1}`).join('</div><div>') + '</div>'; }}>메모 길게</button>
      <button onclick={() => { appState.notes = '<div>dfasasdfsdf</div>'; }}>메모 한 줄</button>
      <button onclick={() => { appState.showArchived = !appState.showArchived; }}>마감된 일 보이기</button>
      <button onclick={() => { appState.showNotes = !appState.showNotes; }}>메모 보이기</button>
      <button onclick={() => { appState.fontSize = appState.fontSize === 10 ? 14 : 10; document.documentElement.style.setProperty('--global-font-size', `${appState.fontSize}pt`); controller.requestRecomputeNextFrame(); }}>글자 10↔14pt</button>
      <button onclick={() => { appState.uiFontSize = appState.uiFontSize === 10 ? 15 : 10; }}>UI 글자 10↔15pt</button>
      <button onclick={reset}>처음으로</button>
    </div>
    <p>{status} · 창 {frameH}px · 최소 {minH}px · 메모 선호 {appState.notesPaneHeight ?? DEFAULT_NOTES_H}px</p>
  </div>

  <div class="frame" bind:this={frameEl} style="top: {frameY}px; height: {frameH}px; width: {frameW}px;">
    <div class="edge top" role="presentation" onpointerdown={(e) => handleDown(e, 'top')}></div>
    {#if fullUI}
      <Titlebar />
      <MainToolbar />
    {:else}
      <div class="main-header" style="height: {HEADER_H}px;">Tidy Task (제목줄 · 툴바 자리)</div>
    {/if}
    <div class="memo-preview-body">
      <MemoBody layout={controller} {onsplitterdown} />
    </div>
    <div class="edge bottom" role="presentation" onpointerdown={(e) => handleDown(e, 'bottom')}></div>
  </div>
</div>

<style>
  .page { position: relative; min-height: 1200px; font-family: 'Malgun Gothic', sans-serif; }
  .sort-qa-controls { position: absolute; top: 10px; display: flex; flex-direction: column; gap: 8px; }
  .standalone .frame { left: 0; top: 0 !important; }
  .standalone .panel, .standalone .edge { display: none; }
  .panel { position: absolute; left: 420px; top: 40px; width: 360px; font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
  .buttons { display: flex; flex-wrap: wrap; gap: 6px; }
  .buttons button { border: 1px solid #ccc; border-radius: 6px; padding: 3px 8px; background: #fff; }
  .frame {
    position: absolute; left: 40px; width: 330px; display: flex; flex-direction: column; overflow: hidden;
    border: 2px solid rgba(120,53,15,0.10); border-radius: 8px; background: var(--global-theme-color);
    font-family: var(--ui-font-family); font-size: var(--ui-font-size);
  }
  .main-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid rgba(0,0,0,0.06); color: #777; }
  .memo-preview-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .edge { position: absolute; left: 0; right: 0; height: 6px; background: rgba(0,0,0,0.12); cursor: ns-resize; z-index: 30; }
  .edge.top { top: 0; }
  .edge.bottom { bottom: 0; }
</style>
