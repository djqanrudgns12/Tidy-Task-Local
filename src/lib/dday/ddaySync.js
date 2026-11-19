import { isTauri } from '@tauri-apps/api/core';
import { emit, emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LazyStore } from '@tauri-apps/plugin-store';
import { createSection } from '../scores/section.js';
import { subscribeStore } from '../scores/store.js';
import { track } from '../analytics.js';
import { createSerialQueue } from '../storage/serialQueue.js';
import { hasWindowContent } from '../storage/windowDataCodec.js';
import { ensureWindowOnScreen, getMonitorGeometries } from '../windows/windowRegistry.js';
import { pickPrimaryMonitor } from '../windows/windowPlacement.js';
import { isDataWindowLabel, isTinyNoteLabel } from '../windows/windowLabels.js';
import { resolveControlSizeLimits } from './ddayWindowBounds.js';
import {
  DDAY_BANNER_MODES,
  DDAY_CONTROL_BOUNDS,
  computeDdayCounter,
  normalizeDdayList,
  normalizeDdaySettings,
  normalizeDdayWidgetPrefs,
  stripHtmlToTitle,
  todayDateKey,
} from './ddayModel.js';
import {
  clearArchivedDdays,
  completeDdayItem,
  createNewDday,
  deleteDdayItem,
  pinTodoAsDday,
  reorderActiveDdays,
  restoreDdayItem,
  updateDdayItem,
} from './ddayActions.js';

const STORE_FILE = 'tidy-task-config.json';
const PREVIEW_WINDOWS_KEY = 'tidy-dday-preview-windows-v1';

export const DDAY_CONTROL_LABEL = 'dday-control';

export const DDAY_EVENTS = Object.freeze({
  windowUpdated: 'dday:window-updated',
  command: 'dday:command',
  commandAck: 'dday:command-ack',
  queryOpen: 'dday:query-open',
  queryReply: 'dday:query-reply',
  controlReady: 'dday-control-ready',
  setTarget: 'dday:set-target',
});

const closedWindowWriteQueue = createSerialQueue();

/**
 * @typedef {{
 *   label: string,
 *   title: string,
 *   themeColor: string,
 *   isDarkMode: boolean,
 *   uiFontFamily: string,
 *   uiFontSize: number,
 *   ddayBannerMode: import('./ddayModel.js').DdayBannerMode,
 *   ddayItems: import('./ddayModel.js').DdayItem[],
 *   todos: { id: string, text: string, completed: boolean, deadline?: string }[],
 *   archivedTodos: { id: string, text: string, completed: boolean, deadline?: string }[],
 *   sortOrder: 'asc' | 'desc',
 * }} DdayWindowSnapshot
 */

/**
 * @param {string} label
 * @param {any} src
 * @returns {DdayWindowSnapshot}
 */
export function buildWindowDdaySnapshot(label, src) {
  const s = src || {};
  return {
    label,
    title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : label === 'main' ? '기본 할 일' : `노트 ${label.replace('note-', '')}`,
    themeColor: typeof s.themeColor === 'string' ? s.themeColor : 'amber',
    isDarkMode: Boolean(s.isDarkMode),
    uiFontFamily: typeof s.uiFontFamily === 'string' ? s.uiFontFamily : '메이플스토리 L',
    uiFontSize: Number.isFinite(Number(s.uiFontSize)) && Number(s.uiFontSize) > 0 ? Number(s.uiFontSize) : 10,
    ddayBannerMode: DDAY_BANNER_MODES.includes(s.ddayBannerMode) ? s.ddayBannerMode : 'single',
    ddayItems: normalizeDdayList(s.ddayItems),
    todos: Array.isArray(s.todos) ? s.todos.map((/** @type {any} */ t) => ({
      id: t.id,
      text: t.text || '',
      completed: Boolean(t.completed),
      deadline: t.deadline || '',
    })) : [],
    archivedTodos: Array.isArray(s.archivedTodos) ? s.archivedTodos.map((/** @type {any} */ t) => ({
      id: t.id,
      text: t.text || '',
      completed: true,
      deadline: t.deadline || '',
    })) : [],
    sortOrder: s.sortOrder === 'desc' ? 'desc' : 'asc',
  };
}

/** @param {DdayWindowSnapshot} snap */
export function ddayWindowSignature(snap) {
  return JSON.stringify([
    snap.title,
    snap.themeColor,
    snap.isDarkMode,
    snap.uiFontFamily,
    snap.uiFontSize,
    snap.ddayBannerMode,
    snap.ddayItems,
    snap.todos.map((t) => [t.id, t.deadline, t.text]),
  ]);
}

/** @param {{ onChange?: (next: import('./ddayModel.js').DdaySettings) => void, onError?: (msg: string) => void }} [handlers] */
export function createDdaySettingsSection(handlers = {}) {
  return createSection({
    store: 'dday',
    section: 'settings',
    normalize: normalizeDdaySettings,
    ...handlers,
  });
}

/** @param {{ onChange?: (next: import('./ddayModel.js').DdayWidgetPrefs) => void, onError?: (msg: string) => void }} [handlers] */
export function createDdayWidgetSection(handlers = {}) {
  return createSection({
    store: 'dday',
    section: 'widget',
    normalize: normalizeDdayWidgetPrefs,
    ...handlers,
  });
}

/** @param {(change: { section: string, revision: number }) => void} callback */
export function subscribeDdayStore(callback) {
  return subscribeStore('dday', callback);
}

/**
 * 컨트롤 타워나 위젯에서 오는 D-Day 명령을 단일 창 상태에 적용합니다.
 * @param {any} state
 * @param {string} action
 * @param {any} payload
 * @param {import('./ddayModel.js').DdaySettings} settings
 * @param {string} [today]
 */
export function applyDdayCommandToState(state, action, payload, settings, today = todayDateKey()) {
  /** @type {import('./ddayActions.js').DdayWindowState} */
  const base = {
    todos: Array.isArray(state.todos) ? [...state.todos] : [],
    archivedTodos: Array.isArray(state.archivedTodos) ? [...state.archivedTodos] : [],
    ddayItems: normalizeDdayList(state.ddayItems),
    sortOrder: state.sortOrder === 'desc' ? 'desc' : 'asc',
  };
  let nextBannerMode = DDAY_BANNER_MODES.includes(state.ddayBannerMode) ? state.ddayBannerMode : 'single';
  /** @type {import('./ddayActions.js').DdayWindowState} */
  let nextState = base;
  let resultItem = null;

  switch (action) {
    case 'pin-todo': {
      const res = pinTodoAsDday(base, payload?.todoId, settings, today, payload?.customPatch);
      nextState = res.state;
      resultItem = res.item;
      if (res.created) track('dday_created', { choice: 'todo' });
      break;
    }
    case 'create': {
      const res = createNewDday(base, payload || {}, settings, today);
      nextState = res.state;
      resultItem = res.item;
      if (res.item) track('dday_created', { choice: 'control' });
      break;
    }
    case 'update': {
      const res = updateDdayItem(base, payload?.ddayId, payload?.patch || {}, today);
      nextState = res.state;
      resultItem = res.item;
      break;
    }
    case 'complete': {
      const res = completeDdayItem(base, payload?.ddayId, settings, today);
      nextState = res.state;
      track('dday_completed', { count: 1 });
      break;
    }
    case 'restore': {
      const res = restoreDdayItem(base, payload?.ddayId);
      nextState = res.state;
      track('dday_restored', { count: 1 });
      break;
    }
    case 'delete': {
      nextState = deleteDdayItem(base, payload?.ddayId, { deleteLinkedTodo: Boolean(payload?.deleteLinkedTodo) });
      track('dday_deleted', { count: 1 });
      break;
    }
    case 'clear-archived': {
      const removedCount = base.ddayItems.filter((d) => d.status === 'archived').length;
      nextState = clearArchivedDdays(base);
      if (removedCount > 0) track('dday_deleted', { count: removedCount });
      break;
    }
    case 'reorder': {
      nextState = reorderActiveDdays(base, Array.isArray(payload?.orderedIds) ? payload.orderedIds : []);
      break;
    }
    case 'set-banner-mode': {
      if (DDAY_BANNER_MODES.includes(payload?.mode)) {
        nextBannerMode = payload.mode;
      }
      break;
    }
    default:
      break;
  }

  return {
    todos: nextState.todos,
    archivedTodos: nextState.archivedTodos,
    ddayItems: nextState.ddayItems,
    ddayBannerMode: nextBannerMode,
    item: resultItem,
  };
}

/** 날짜 기준 상대 D-Day 1줄 요약을 만듭니다 (프리뷰 & 보조 유틸). */
function previewDefaultWindows() {
  const base = new Date();
  const offsetKey = (/** @type {number} */ days) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    return todayDateKey(d);
  };
  return [
    buildWindowDdaySnapshot('main', {
      title: '기본 할 일',
      themeColor: 'amber',
      isDarkMode: false,
      ddayBannerMode: 'single',
      todos: [
        { id: 'prev-t1', text: '수학 퍼즐 페스티벌 아카이빙(패들렛)', completed: false, deadline: offsetKey(5) },
        { id: 'prev-t2', text: '학예발표회 음원 점검', completed: false, deadline: offsetKey(9) },
        { id: 'prev-t3', text: '마스터교원 성찰보고서 제출', completed: false, deadline: offsetKey(-1) },
      ],
      archivedTodos: [
        { id: 'prev-at1', text: '기초학력 운영비 소지 안내', completed: true, deadline: offsetKey(-6) },
      ],
      ddayItems: [
        {
          id: 'prev-d1', title: '수학 퍼즐 페스티벌', date: offsetKey(5), startDate: offsetKey(-14),
          countMode: 'countdown', repeatYearly: false, icon: 'puzzle', tone: 'emerald', status: 'active',
          completedAt: null, linkedTodoId: 'prev-t1', showInTodo: true, showInBanner: true, showInWidget: true, order: 0,
        },
        {
          id: 'prev-d2', title: '겨울방학식', date: offsetKey(36), startDate: offsetKey(-10),
          countMode: 'countdown', repeatYearly: false, icon: 'snow', tone: 'sky', status: 'active',
          completedAt: null, linkedTodoId: null, showInTodo: false, showInBanner: true, showInWidget: true, order: 1,
        },
        {
          id: 'prev-d3', title: '학예발표회 음원 점검', date: offsetKey(9), startDate: offsetKey(-7),
          countMode: 'countdown', repeatYearly: false, icon: 'sparkle', tone: 'rose', status: 'active',
          completedAt: null, linkedTodoId: 'prev-t2', showInTodo: true, showInBanner: false, showInWidget: true, order: 2,
        },
        {
          id: 'prev-d4', title: '성찰보고서 마감', date: offsetKey(-1), startDate: offsetKey(-12),
          countMode: 'countdown', repeatYearly: false, icon: 'trophy', tone: 'lilac', status: 'active',
          completedAt: null, linkedTodoId: 'prev-t3', showInTodo: true, showInBanner: true, showInWidget: false, order: 3,
        },
        {
          id: 'prev-a1', title: '기초학력 운영비 소지 안내', date: offsetKey(-6), startDate: offsetKey(-20),
          countMode: 'countdown', repeatYearly: false, icon: 'flag', tone: 'accent', status: 'archived',
          completedAt: offsetKey(-6), linkedTodoId: 'prev-at1', showInTodo: true, showInBanner: true, showInWidget: true, order: 0,
        },
        {
          id: 'prev-a2', title: '2학기 학부모 상담 주간', date: offsetKey(-16), startDate: offsetKey(-30),
          countMode: 'countdown', repeatYearly: false, icon: 'star', tone: 'lilac', status: 'archived',
          completedAt: offsetKey(-14), linkedTodoId: null, showInTodo: false, showInBanner: true, showInWidget: true, order: 1,
        },
      ],
    }),
  ];
}

/** @returns {DdayWindowSnapshot[]} */
export function loadPreviewWindows() {
  try {
    const raw = localStorage.getItem(PREVIEW_WINDOWS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((w) => buildWindowDdaySnapshot(w.label || 'main', w));
      }
    }
  } catch {}
  const seed = previewDefaultWindows();
  try { localStorage.setItem(PREVIEW_WINDOWS_KEY, JSON.stringify(seed)); } catch {}
  return seed;
}

/** @param {DdayWindowSnapshot[]} list */
export function savePreviewWindows(list) {
  try {
    localStorage.setItem(PREVIEW_WINDOWS_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * 모든 메모 창(`main`, `note-1..10`)의 D-Day 스냅샷 목록을 수집합니다.
 * 열려 있는 창은 라이브 IPC로, 닫혀 있는 창은 저장소에서 읽어 정합성을 지킵니다.
 * @returns {Promise<DdayWindowSnapshot[]>}
 */
export async function collectAllNoteWindowsDdays() {
  if (!isTauri()) {
    return loadPreviewWindows();
  }

  const requester = getCurrentWindow().label;
  const openWindows = await WebviewWindow.getAll().catch(() => []);
  const openNoteLabels = openWindows
    .map((w) => w.label)
    .filter((l) => isDataWindowLabel(l) && !isTinyNoteLabel(l));

  const store = new LazyStore(STORE_FILE);
  try { await store.reload(); } catch {}
  const extra = (await store.get('activeExtraWindows')) || [];
  const allLabels = [...new Set(['main', ...extra.filter((/** @type {string} */ l) => l.startsWith('note-')), ...openNoteLabels])];

  /** @type {Map<string, DdayWindowSnapshot>} */
  const collected = new Map();

  if (openNoteLabels.length > 0) {
    const requestId = `q:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
    await new Promise((resolve) => {
      let finished = false;
      /** @type {(() => void) | null} */
      let unlisten = null;
      /** @type {ReturnType<typeof setTimeout>} */
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          unlisten?.();
          resolve(undefined);
        }
      }, 280);

      void listen(DDAY_EVENTS.queryReply, (ev) => {
        const p = /** @type {any} */ (ev.payload);
        if (!p || p.requestId !== requestId || !p.snapshot?.label) return;
        collected.set(p.snapshot.label, buildWindowDdaySnapshot(p.snapshot.label, p.snapshot));
        if (openNoteLabels.every((l) => collected.has(l)) && !finished) {
          finished = true;
          clearTimeout(timer);
          unlisten?.();
          resolve(undefined);
        }
      }).then((fn) => {
        if (finished) fn();
        else {
          unlisten = fn;
          void emit(DDAY_EVENTS.queryOpen, { requestId, requester }).catch(() => {});
        }
      }).catch(() => {
        clearTimeout(timer);
        finished = true;
        resolve(undefined);
      });
    });
  }

  for (const label of allLabels) {
    if (collected.has(label)) continue;
    const raw = await store.get(label);
    if (!raw && label !== 'main') continue;
    collected.set(label, buildWindowDdaySnapshot(label, raw || {}));
  }

  return allLabels
    .filter((l) => collected.has(l))
    .map((l) => /** @type {DdayWindowSnapshot} */ (collected.get(l)));
}

function readPreviewIpcConfig() {
  if (typeof window === 'undefined') return { delayMs: 0, fail: false, frozen: false };
  const override = /** @type {any} */ (window).__ddayPreviewIpc || {};
  const params = new URLSearchParams(window.location?.search || '');
  const delayRaw = override.delayMs ?? Number(params.get('ipc-delay') || 0);
  const delayMs = Number.isFinite(delayRaw) && delayRaw > 0 ? Math.min(5000, delayRaw) : 0;
  const fail = Boolean(
    override.fail ??
      (params.get('ipc-fail') === '1' || (params.has('ipc-fail') && params.get('ipc-fail') !== '0')),
  );
  const frozen = Boolean(
    override.frozen ??
      (params.get('ipc-frozen') === '1' || (params.has('ipc-frozen') && params.get('ipc-frozen') !== '0')),
  );
  return { delayMs, fail, frozen };
}

/**
 * 특정 메모 창(`targetLabel`)에 D-Day 상태 변경 명령을 전달합니다.
 * 열려 있는 창은 IPC로 직접 반영하고(Undo 히스토리 보존), 닫혀 있는 창은 직렬 큐로 안전하게 저장합니다.
 * @param {string} targetLabel
 * @param {string} action
 * @param {any} payload
 * @param {import('./ddayModel.js').DdaySettings} settings
 * @returns {Promise<{ ok: boolean, snapshot?: DdayWindowSnapshot, item?: any }>}
 */
export async function dispatchDdayCommand(targetLabel, action, payload, settings) {
  if (!isTauri()) {
    const ipc = readPreviewIpcConfig();
    if (ipc.delayMs > 0) {
      await new Promise((r) => setTimeout(r, ipc.delayMs));
    }
    const windows = loadPreviewWindows();
    const idx = windows.findIndex((w) => w.label === targetLabel);
    const current = idx >= 0 ? windows[idx] : buildWindowDdaySnapshot(targetLabel, {});
    if (ipc.fail) {
      return { ok: false };
    }
    if (ipc.frozen) {
      return { ok: true, snapshot: current };
    }
    const applied = applyDdayCommandToState(current, action, payload, settings);
    const updated = buildWindowDdaySnapshot(targetLabel, { ...current, ...applied });
    if (idx >= 0) windows[idx] = updated;
    else windows.push(updated);
    savePreviewWindows(windows);
    window.dispatchEvent(new CustomEvent('tidy-dday-preview-sync', { detail: { label: targetLabel, snapshot: updated } }));
    return { ok: true, snapshot: updated, item: applied.item };
  }

  const openWin = await WebviewWindow.getByLabel(targetLabel).catch(() => null);
  if (openWin) {
    const requestId = `cmd:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
    const requester = getCurrentWindow().label;
    const res = await new Promise((resolve) => {
      let settled = false;
      /** @type {(() => void) | null} */
      let unlisten = null;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          unlisten?.();
          resolve(null);
        }
      }, 1500);

      void getCurrentWindow().listen(DDAY_EVENTS.commandAck, (ev) => {
        const p = /** @type {any} */ (ev.payload);
        if (!p || p.requestId !== requestId || settled) return;
        settled = true;
        clearTimeout(timer);
        unlisten?.();
        resolve(p);
      }).then((fn) => {
        if (settled) fn();
        else {
          unlisten = fn;
          void emitTo(targetLabel, DDAY_EVENTS.command, { requestId, requester, targetLabel, action, payload }).catch(() => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              unlisten?.();
              resolve(null);
            }
          });
        }
      }).catch(() => {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      });
    });

    if (res && typeof res === 'object') {
      const r = /** @type {any} */ (res);
      return { ok: Boolean(r.ok), snapshot: r.snapshot ? buildWindowDdaySnapshot(targetLabel, r.snapshot) : undefined, item: r.item };
    }
  }

  return closedWindowWriteQueue.enqueue(async () => {
    // 대기 중 창이 방금 열렸으면 직렬 큐를 빠져나와 오픈 경로로 재시도하지 않고 최신 store 확인
    if (await WebviewWindow.getByLabel(targetLabel).catch(() => null)) {
      return { ok: false };
    }
    const store = new LazyStore(STORE_FILE);
    try { await store.reload(); } catch {}
    const raw = (await store.get(targetLabel)) || {};
    const applied = applyDdayCommandToState(raw, action, payload, settings);
    const merged = {
      ...raw,
      todos: applied.todos,
      archivedTodos: applied.archivedTodos,
      ddayItems: applied.ddayItems.length > 0 ? applied.ddayItems : undefined,
      ddayBannerMode: applied.ddayBannerMode === 'bento' || applied.ddayBannerMode === 'hidden' ? applied.ddayBannerMode : undefined,
    };
    const nextContent = hasWindowContent(merged);
    if (!nextContent && targetLabel !== 'main') {
      await store.delete(targetLabel);
      const reg = ((await store.get('activeExtraWindows')) || []).filter((/** @type {string} */ l) => l !== targetLabel);
      await store.set('activeExtraWindows', reg);
    } else {
      await store.set(targetLabel, merged);
    }
    await store.save();
    const updated = buildWindowDdaySnapshot(targetLabel, merged);
    await emit(DDAY_EVENTS.windowUpdated, { label: targetLabel, snapshot: updated }).catch(() => {});
    return { ok: true, snapshot: updated, item: applied.item };
  });
}

/**
 * D-Day 컨트롤 타워 창(기본 380×580, 자유 리사이즈 가능)을 열거나 앞으로 가져옵니다.
 * @param {{ requesterLabel?: string, focusDdayId?: string | null, editDdayId?: string | null, initialTab?: 'list'|'settings'|'archive', openCreate?: boolean, appearance?: { themeColor?: string, isDarkMode?: boolean, uiFontFamily?: string, uiFontSize?: number } }} [opts]
 */
export async function openDdayControlWindow(opts = {}) {
  if (!isTauri()) return;
  const requesterLabel = opts.requesterLabel || getCurrentWindow().label || 'main';
  const payload = {
    targetLabel: isDataWindowLabel(requesterLabel) && !isTinyNoteLabel(requesterLabel) ? requesterLabel : 'main',
    focusDdayId: opts.focusDdayId ?? opts.editDdayId ?? null,
    editDdayId: opts.editDdayId ?? null,
    initialTab: opts.initialTab || 'list',
    openCreate: Boolean(opts.openCreate),
    appearance: opts.appearance || null,
  };

  const existing = await WebviewWindow.getByLabel(DDAY_CONTROL_LABEL);
  if (existing) {
    try {
      // C1: 기존 창 재표시 전 대상 창·외관(setTarget)을 먼저 전달해 이전 창 화면 번쩍임을 막습니다.
      await emitTo(DDAY_CONTROL_LABEL, DDAY_EVENTS.setTarget, payload).catch(() => {});
      await new Promise((r) => setTimeout(r, 32));
      await ensureWindowOnScreen(existing);
      await existing.unminimize();
      await existing.show();
      await existing.setFocus();
    } catch (e) {
      console.error('[DdayControl] 기존 창 포커스 실패:', e);
    }
    return;
  }

  let unlisten = /** @type {(() => void) | null} */ (null);
  let sent = false;
  const cleanup = () => { unlisten?.(); unlisten = null; };
  const timeout = setTimeout(() => {
    cleanup();
    void WebviewWindow.getByLabel(DDAY_CONTROL_LABEL).then((w) => w?.show()).catch(() => {});
  }, 6000);
  unlisten = await listen(DDAY_EVENTS.controlReady, async () => {
    if (sent) return;
    sent = true;
    clearTimeout(timeout);
    await emitTo(DDAY_CONTROL_LABEL, DDAY_EVENTS.setTarget, payload).catch(() => {});
    cleanup();
  });

  const monitors = await getMonitorGeometries();
  const targetMonitor = pickPrimaryMonitor(monitors) || monitors[0] || null;
  const limits = resolveControlSizeLimits(targetMonitor, DDAY_CONTROL_BOUNDS, 36);
  const width = Math.max(limits.minWidth, Math.min(limits.maxWidth, DDAY_CONTROL_BOUNDS.defaultWidth));
  const height = Math.max(limits.minHeight, Math.min(limits.maxHeight, DDAY_CONTROL_BOUNDS.defaultHeight));

  const boot = new URLSearchParams();
  boot.set('ddayCtrlTarget', payload.targetLabel);
  const ap = payload.appearance;
  if (ap) {
    if (ap.themeColor) boot.set('theme', String(ap.themeColor));
    if (typeof ap.isDarkMode === 'boolean') boot.set('dark', ap.isDarkMode ? '1' : '0');
    if (ap.uiFontFamily) boot.set('uifont', String(ap.uiFontFamily));
    if (Number.isFinite(Number(ap.uiFontSize))) boot.set('fs', String(ap.uiFontSize));
  }

  const win = new WebviewWindow(DDAY_CONTROL_LABEL, {
    url: `index.html?${boot.toString()}`,
    title: 'D-Day 컨트롤',
    width,
    height,
    minWidth: limits.minWidth,
    minHeight: limits.minHeight,
    maxWidth: limits.maxWidth,
    maxHeight: limits.maxHeight,
    maximizable: false,
    resizable: true,
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    center: true,
    visible: false,
  });
  win.once('tauri://error', () => {
    clearTimeout(timeout);
    cleanup();
  });
}

/**
 * 열린 창들에서 위젯/배너에 보일 D-Day를 정렬 우선순위로 정리합니다.
 * @param {DdayWindowSnapshot[]} windows
 * @param {string} [scope]
 * @param {string} [today]
 */
export function flattenWidgetItems(windows, scope = 'all', today = todayDateKey()) {
  /** @type {{ key: string, windowLabel: string, windowTitle: string, item: import('./ddayModel.js').DdayItem, counter: ReturnType<typeof computeDdayCounter> }[]} */
  const list = [];
  for (const win of windows) {
    if (scope !== 'all' && win.label !== scope) continue;
    for (const item of win.ddayItems) {
      if (item.status !== 'active' || !item.showInWidget) continue;
      list.push({
        key: `${win.label}:${item.id}`,
        windowLabel: win.label,
        windowTitle: stripHtmlToTitle(win.title, 18) || '메모',
        item,
        counter: computeDdayCounter(item, today),
      });
    }
  }
  return list;
}
