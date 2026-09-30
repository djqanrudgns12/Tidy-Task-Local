// ═══════════════════════════════════════════════════════════════════
// [메모 창 세로 배치 · 화면 연결] memoLayout.js의 규칙을 실제 DOM과 창 이벤트에 잇습니다.
//
// 하는 일
//   1. 영역(몸통·할 일·마감된 일·메모) 높이와 내용 높이를 잽니다(자식 컴포넌트의 measureLayout).
//   2. 지금이 "아래쪽 테두리 끌기"인지 판별해 hold / bottom 배치를 고르고, 결과를 DOM에 바로 씁니다.
//   3. 창 최소 높이(OS)를 영역 최소에 맞춥니다.
//
// 왜 ResizeObserver 콜백 안에서 바로 DOM에 쓰는가:
//   한 프레임 늦게(requestAnimationFrame) 쓰면, 창 크기가 바뀐 첫 프레임은 할 일이 변화를 다 받고
//   다음 프레임에 메모가 따라가며 매 프레임 몇 px씩 출렁였습니다. 콜백 안에서 쓰면 브라우저가
//   그리기 전에 다시 배치하므로 흔들림이 없습니다. 몸통만 관찰하고, 높이를 쓰는 요소(메모·마감된 일)는
//   관찰하지 않아 "ResizeObserver loop" 경고도 생기지 않습니다.
//
// 왜 아래쪽 끌기를 Tauri 창 이벤트로 판별하는가: memoLayout.classifyResize 주석 참고.
//   브라우저 resize보다 Tauri 알림이 늦게 와도 괜찮습니다. 끌기의 기준 배치(settled)는 크기가 바뀌기
//   전 값을 그대로 쥐고 있다가, 판별이 끝나는 순간 기준부터 다시 계산합니다.
// ═══════════════════════════════════════════════════════════════════
import {
  GESTURE_IDLE_MS,
  TODOS_MIN_H,
  bottomDragLayout,
  classifyResize,
  holdLayout,
  isInstantResize,
  minWindowHeight,
} from './memoLayout.js';

/** 프로그램이 창 크기를 바꾼 뒤(스플리터·최소 크기·복원) 그 알림이 도착할 때까지 "사용자 끌기 아님"으로 보는 시간 */
const PROGRAMMATIC_GRACE_MS = 600;
/** 스플리터를 놓은 뒤 마지막 창 크기 알림을 기다리는 시간 */
const SPLITTER_SETTLE_MS = 200;

/**
 * 자식 컴포넌트가 알려 주는 측정값 (모두 CSS px)
 * @typedef {{ viewport: number, content: number }} TodosProbe  목록 보이는 높이 · 목록 전체 높이
 * @typedef {{ viewport: number, content: number, cap: number }} ArchiveProbe  목록 보이는 높이 · 전체 높이 · 최대 높이(5.5줄)
 * @typedef {{ viewport: number, padding: number, line: number, text: number }} NotesProbe  스크롤 칸 높이 · 아래 여백 · 한 줄 높이 · 글 높이
 * @typedef {'body' | 'todos' | 'archive' | 'notes'} RegionName
 * @typedef {import('./memoLayout.js').LayoutFrame & { todosFit: number, notesFit: number }} MeasuredFrame
 * @typedef {import('./memoLayout.js').LayoutResult} LayoutResult
 * @typedef {{ y: number | null, height: number | null }} Geometry  창 위치(물리 px)·안쪽 높이(물리 px)
 */

/**
 * @param {object} options
 * @param {() => number} options.readNotesPreference 사용자가 고른 메모 높이
 * @param {(px: number) => void} options.commitNotesPreference 아래쪽 끌기가 끝났을 때 새 메모 높이를 저장
 * @param {(px: number) => void} [options.applyMinHeight] OS 창 최소 높이 적용 (없으면 건너뜀)
 * @param {() => number} [options.getWorkAreaHeight]
 * @param {() => boolean} [options.isProgrammaticResize] 다른 곳(세로 스냅 등)이 창 크기를 바꾸는 중인지
 * @param {string} [options.headerSelector] 고정 머리(제목줄·툴바)의 마지막 요소
 * @param {() => { top: number, bottom: number }} [options.getWindowRect] 창의 위·아래 경계(CSS px). 기본은 브라우저 창 전체.
 *   개발 확인 화면처럼 창을 흉내 낸 상자 안에서 잴 때만 넘깁니다.
 */
export function createMemoLayoutController(options) {
  const { readNotesPreference, commitNotesPreference } = options;
  /** 자식 컴포넌트의 측정 함수 (components/MemoBody.svelte가 setProbes로 넣음)
   * @type {{ todos?: () => TodosProbe | null | undefined, archive?: () => ArchiveProbe | null | undefined, notes?: () => NotesProbe | null | undefined }} */
  let probes = {};

  /** @type {Record<RegionName, HTMLElement | null>} */
  const regions = { body: null, todos: null, archive: null, notes: null };
  /** @type {{ frame: MeasuredFrame, layout: LayoutResult } | null} 마지막으로 그린 배치 */
  let current = null;
  /** @type {{ bodyH: number, layout: LayoutResult, geom: Geometry } | null} 창이 멈춰 있던 마지막 배치(끌기 기준) */
  let settled = null;
  /** @type {{ start: Geometry | null, base: import('./memoLayout.js').DragBase | null, forcedHold: boolean, mode: 'hold' | 'bottom' } | null} */
  let gesture = null;
  /** @type {Geometry} */
  const geom = { y: null, height: null };
  /** @type {ReturnType<typeof setTimeout> | null} */
  let settleTimer = null;
  let programmaticUntil = 0;
  let splitterDragging = false;
  let appliedMinH = 0;
  let queued = false;
  let frameRequest = 0;
  let destroyed = false;

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => recompute());

  // 사용자 글꼴이 늦게 내려받아지면 줄 높이가 바뀌어 메모 최소 높이도 바뀝니다.
  const onFontsLoaded = () => requestRecomputeNextFrame();
  if (typeof document !== 'undefined' && document.fonts?.addEventListener) {
    document.fonts.addEventListener('loadingdone', onFontsLoaded);
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function isProgrammaticNow() {
    return splitterDragging || now() < programmaticUntil || !!options.isProgrammaticResize?.();
  }

  // ── 측정 ──────────────────────────────────────────────────────────

  /** @returns {MeasuredFrame | null} */
  function measureFrame() {
    const body = regions.body;
    if (!body || !body.isConnected) return null;
    const bodyH = body.clientHeight;
    if (bodyH <= 0) return null; // 최소화된 창은 크기가 0으로 보고됩니다.

    /** @type {MeasuredFrame} */
    const frame = { bodyH, todosMin: TODOS_MIN_H, archive: null, notes: null, todosFit: 0, notesFit: 0 };

    const archiveEl = regions.archive;
    if (archiveEl) {
      const probe = probes.archive?.();
      const viewport = probe ? Math.max(0, probe.viewport) : 0;
      // 목록 보이는 칸을 뺀 나머지(머리글·여백)가 최소, 거기에 목록 전체(최대 5.5줄)를 더한 것이 자연 높이
      const min = Math.max(0, archiveEl.offsetHeight - viewport);
      const content = probe ? Math.min(Math.max(0, probe.content), Math.max(0, probe.cap)) : 0;
      frame.archive = { min, natural: min + Math.ceil(content) };
    }

    const notesEl = regions.notes;
    if (notesEl) {
      const probe = probes.notes?.();
      const line = probe && probe.line > 0 ? probe.line : 21;
      const padding = probe ? Math.max(0, probe.padding) : 0;
      // 스크롤 칸을 뺀 나머지 = 머리글 + 테두리
      const chrome = Math.max(0, notesEl.offsetHeight - (probe ? probe.viewport : notesEl.offsetHeight));
      frame.notes = { min: Math.ceil(chrome + padding + line * 2) };
      frame.notesFit = Math.ceil(chrome + padding + Math.max(probe ? probe.text : 0, line));
    }

    const todosEl = regions.todos;
    if (todosEl) {
      const probe = probes.todos?.();
      frame.todosFit = probe ? Math.ceil(todosEl.offsetHeight - probe.viewport + probe.content) : todosEl.offsetHeight;
    }
    return frame;
  }

  /** 제목줄·툴바(고정 머리)와 아래 테두리 높이. 편집 모드 띠 같은 잠깐 생기는 띠는 넣지 않습니다. */
  function measureFixedChrome() {
    const body = regions.body;
    if (!body) return null;
    const bodyRect = body.getBoundingClientRect();
    const win = options.getWindowRect?.() ?? { top: 0, bottom: window.innerHeight };
    const header = options.headerSelector ? document.querySelector(options.headerSelector) : null;
    const headerBottom = header ? header.getBoundingClientRect().bottom : bodyRect.top;
    return (headerBottom - win.top) + Math.max(0, win.bottom - bodyRect.bottom);
  }

  // ── 계산 · 적용 ────────────────────────────────────────────────────

  /** @param {MeasuredFrame} frame @param {LayoutResult} layout */
  function apply(frame, layout) {
    const notesEl = regions.notes;
    if (notesEl && frame.notes) {
      const height = `${layout.notes}px`;
      if (notesEl.style.height !== height) notesEl.style.height = height;
    }
    const archiveEl = regions.archive;
    if (archiveEl && frame.archive) {
      // 양보 중일 때만 높이를 묶습니다. 평소엔 내용대로 두어 열고 닫는 움직임이 그대로 보이게 합니다.
      const max = layout.archive < frame.archive.natural ? `${layout.archive}px` : 'none';
      if (archiveEl.style.maxHeight !== max) archiveEl.style.maxHeight = max;
    }
  }

  /** @param {MeasuredFrame} frame */
  function updateMinHeight(frame) {
    if (!options.applyMinHeight) return;
    const fixedChromeH = measureFixedChrome();
    if (fixedChromeH == null) return;
    const minH = minWindowHeight({
      fixedChromeH,
      frame,
      workAreaH: options.getWorkAreaHeight?.() ?? 900,
    });
    if (minH === appliedMinH) return;
    appliedMinH = minH;
    // 지금 창이 새 최소보다 작으면 OS가 창을 키웁니다. 그 알림을 사용자의 아래쪽 끌기로 오해하지 않게 합니다.
    markProgrammatic();
    options.applyMinHeight(minH);
  }

  function recompute() {
    if (destroyed) return;
    const frame = measureFrame();
    if (!frame) return;
    const layout = gesture?.mode === 'bottom' && gesture.base
      ? bottomDragLayout(gesture.base, frame)
      : holdLayout(frame, readNotesPreference());
    apply(frame, layout);
    current = { frame, layout };

    if (!gesture && !settleTimer) {
      if (settled && settled.bodyH !== frame.bodyH) {
        // 창 크기 알림보다 화면 변화가 먼저 왔거나(끌기 시작), 머리 띠가 생겨 몸통이 바뀌었습니다.
        // 끌기 기준은 옛 배치로 남겨 두고, 잠잠해지면 그때 새 기준으로 삼습니다.
        bumpSettle();
      } else {
        settled = { bodyH: frame.bodyH, layout, geom: { ...geom } };
      }
    }
    updateMinHeight(frame);
  }

  function scheduleRecompute() {
    if (queued || destroyed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      recompute();
    });
  }

  /** 글꼴·테마처럼 CSS 변수가 바뀐 뒤에 재야 하는 변화 */
  function requestRecomputeNextFrame() {
    if (destroyed || typeof requestAnimationFrame === 'undefined') return;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(() => {
      frameRequest = 0;
      recompute();
    });
  }

  // ── 끌기(창 크기 변경 한 번) 추적 ───────────────────────────────────

  function bumpSettle() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, GESTURE_IDLE_MS);
  }

  function beginGesture() {
    const base = settled ?? (current ? { bodyH: current.frame.bodyH, layout: current.layout, geom: { ...geom } } : null);
    // 내용 높이는 끌기 동안 바뀌지 않으므로 시작할 때 한 번만 잽니다.
    const fits = measureFrame();
    gesture = {
      start: base ? base.geom : null,
      base: base ? {
        bodyH: base.bodyH,
        archive: base.layout.archive,
        notes: base.layout.notes,
        todosFit: fits ? fits.todosFit : base.layout.todos,
        notesFit: fits ? fits.notesFit : base.layout.notes,
      } : null,
      forcedHold: !base,
      mode: 'hold',
    };
  }

  function settle() {
    settleTimer = null;
    const ending = gesture;
    gesture = null;
    if (ending && ending.mode === 'bottom' && current?.frame.notes) {
      // 아래쪽 끌기로 정한 메모 높이를 사용자의 선택으로 저장합니다. hold로 돌아가도 배치는 그대로입니다.
      commitNotesPreference(current.layout.notes);
    }
    settled = null; // 지금 배치를 새 기준으로 삼습니다.
    recompute();
  }

  /** Tauri 창 이동 알림 (바깥 위치, 물리 px) @param {number} y */
  function noteMoved(y) {
    if (!Number.isFinite(y) || y <= -10000) return; // 최소화 좌표(-32000)
    geom.y = y;
    bumpSettle();
  }

  /** Tauri 창 크기 알림 (안쪽 높이, 물리 px) @param {number} height */
  function noteResized(height) {
    if (!Number.isFinite(height) || height <= 0) return; // 최소화
    geom.height = height;
    const starting = !gesture;
    if (starting) beginGesture();
    const active = /** @type {NonNullable<typeof gesture>} */ (gesture);
    if (isProgrammaticNow()) active.forcedHold = true;
    // 첫 알림부터 크게 뛰면 최대화·복원·스냅입니다(화면 맨 위 창은 위쪽 좌표가 그대로라 아래쪽 끌기처럼 보임).
    if (starting && isInstantResize(active.start?.height ?? null, height, window.devicePixelRatio)) active.forcedHold = true;
    const kind = classifyResize(active.start, geom);
    active.mode = !active.forcedHold && kind === 'bottom' ? 'bottom' : 'hold';
    bumpSettle();
    recompute();
  }

  /** 처음 연결할 때의 창 위치·높이 @param {Geometry} value */
  function noteGeometry(value) {
    geom.y = value.y;
    geom.height = value.height;
    if (settled) settled.geom = { ...geom };
  }

  function markProgrammatic(ms = PROGRAMMATIC_GRACE_MS) {
    programmaticUntil = Math.max(programmaticUntil, now() + ms);
  }

  // ── 스플리터 ──────────────────────────────────────────────────────

  /** 스플리터를 잡았을 때: 지금 할 일 높이를 돌려주고, 끝날 때까지 창 크기 변화를 hold로 처리합니다. */
  function beginSplitterDrag() {
    splitterDragging = true;
    recompute();
    return current ? current.layout.todos : null;
  }

  function endSplitterDrag() {
    splitterDragging = false;
    // 마지막 창 크기 알림이 도착할 짧은 시간만 기다리고 끌기를 끝냅니다.
    // (오래 붙잡아 두면 곧바로 아래쪽 테두리를 잡았을 때 그 끌기까지 hold로 처리됨)
    markProgrammatic(SPLITTER_SETTLE_MS);
    if (gesture) {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, SPLITTER_SETTLE_MS);
    }
  }

  // ── 영역 등록 (Svelte 액션) ─────────────────────────────────────────

  /**
   * @param {HTMLElement} node
   * @param {RegionName} name
   */
  function region(node, name) {
    regions[name] = node;
    if (name === 'body') observer?.observe(node);
    // 같은 화면 갱신에서 등록되는 영역을 모두 모은 뒤 한 번만 계산합니다(그리기 전).
    scheduleRecompute();
    return {
      destroy() {
        if (regions[name] === node) regions[name] = null;
        if (name === 'body') observer?.unobserve(node);
        scheduleRecompute();
      },
    };
  }

  function destroy() {
    destroyed = true;
    observer?.disconnect();
    if (settleTimer) clearTimeout(settleTimer);
    if (frameRequest) cancelAnimationFrame(frameRequest);
    if (typeof document !== 'undefined' && document.fonts?.removeEventListener) {
      document.fonts.removeEventListener('loadingdone', onFontsLoaded);
    }
  }

  /** @param {typeof probes} next */
  function setProbes(next) {
    probes = next || {};
    scheduleRecompute();
  }

  return {
    region,
    setProbes,
    recompute,
    scheduleRecompute,
    requestRecomputeNextFrame,
    noteMoved,
    noteResized,
    noteGeometry,
    markProgrammatic,
    beginSplitterDrag,
    endSplitterDrag,
    destroy,
    /** 개발 확인용: 마지막 배치와 끌기 상태 */
    debugState: () => ({ current, settled, gesture, geom: { ...geom }, appliedMinH }),
  };
}

/**
 * Tauri 창 이벤트를 배치 컨트롤러에 잇습니다. 돌려준 함수를 부르면 연결을 끊습니다.
 * @param {ReturnType<typeof createMemoLayoutController>} controller
 * @param {import('@tauri-apps/api/window').Window} win
 */
export async function connectMemoLayoutToWindow(controller, win) {
  /** @type {Array<() => void>} */
  const unlisteners = [];
  try {
    const [position, size] = await Promise.all([win.outerPosition(), win.innerSize()]);
    controller.noteGeometry({ y: position.y, height: size.height });
  } catch {
    // 위치를 모르면 판별은 hold로 안전하게 물러납니다.
  }
  try {
    unlisteners.push(await win.onMoved(({ payload }) => controller.noteMoved(payload.y)));
    unlisteners.push(await win.onResized(({ payload }) => controller.noteResized(payload.height)));
  } catch (error) {
    console.warn('[메모 배치] 창 이벤트를 연결하지 못했습니다:', error);
  }
  return () => {
    for (const unlisten of unlisteners) unlisten();
  };
}
