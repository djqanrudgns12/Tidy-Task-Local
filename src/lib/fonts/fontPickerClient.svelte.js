// ═══════════════════════════════════════════════════════════════════
// [글꼴 선택 창 호출 클라이언트] 모든 호스트 창이 공유하는 'font-picker' IPC 창구입니다.
//
// 밀착·비이동 수명주기 보장:
//   ① 버튼 pointerdown 시점 열림 상태(TOGGLE_GRACE_MS=450ms)로 재클릭 토글 깜빡임을 막습니다.
//   ② 열려 있는 동안 호스트 창의 이동(onMoved)·리사이즈(onResized)·스크롤·바깥 클릭·숨김을 감시해
//      호스트가 움직이면 즉시 팝업을 닫아 허공에 붕 뜨는 고아 현상을 0건으로 막습니다.
//   ③ 앱 시작 1.8초 뒤 유휴 시간에 숨긴 창을 미리 만들어(prewarm) 첫 클릭 지연을 줄입니다.
// ═══════════════════════════════════════════════════════════════════
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import {
  FONT_PICKER_EVENTS as EV,
  FONT_PICKER_LABEL,
  FONT_PICKER_WINDOW_OPTIONS,
  changesValue,
  normalizeClosedPayload,
  resolvePickerWidth,
  returnsFocus,
} from './fontPickerProtocol.js';

/**
 * @typedef {import('./fontPickerProtocol.js').ExtraFontOption} ExtraFontOption
 * @typedef {{
 *   key: string,
 *   anchor: HTMLElement,
 *   onSelect: (value: string) => void,
 *   focusAfter?: (reason: string) => (HTMLElement | null | undefined),
 *   preserveEditorSelection?: boolean,
 *   at: number,
 *   acked: boolean,
 *   ackTimer: ReturnType<typeof setTimeout> | null,
 * }} PendingRequest
 */

const READY_TIMEOUT_MS = 6000;
const PING_TIMEOUT_MS = 800;
const ACK_TIMEOUT_MS = 1500;
const TOGGLE_GRACE_MS = 450;
const REQUEST_TTL_MS = 5 * 60 * 1000;
// 호스트 창 이동 감시 임계값(물리 px). 1~2px 미세 반올림 흔들림은 무시하고 실제 이동 시에만 닫습니다.
const HOST_MOVE_THRESHOLD = 3;

class FontPickerClient {
  /** 지금 열려 있는 트리거의 키. 버튼 강조·FloatingRTE 자동 숨김 가드에 씁니다.
   * @type {string | null} */
  openKey = $state(null);

  /** @type {string | null} */ #currentId = null;
  /** @type {Map<string, PendingRequest>} */ #requests = new Map();
  #seq = 0;
  #ready = false;
  /** @type {Set<(ok: boolean) => void>} */ #readyWaiters = new Set();
  /** @type {Promise<boolean> | null} */ #listeners = null;
  /** @type {Promise<boolean> | null} */ #preparing = null;
  #lastClosed = { key: '', at: 0 };
  /** @type {Array<() => void>} */ #dockCleanups = [];
  /** @type {ReturnType<typeof setTimeout> | null} */ #prewarmTimer = null;

  get #label() {
    return getCurrentWindow().label;
  }

  #ensureListeners() {
    if (!this.#listeners) {
      const win = getCurrentWindow();
      this.#listeners = Promise.all([
        win.listen(EV.ready, () => this.#markReady()),
        win.listen(EV.opened, (e) => this.#onOpened(e.payload)),
        win.listen(EV.closed, (e) => this.#onClosed(e.payload)),
      ]).then(() => true, (e) => {
        console.warn('글꼴 선택 창 리스너를 준비하지 못했습니다:', e);
        this.#listeners = null;
        return false;
      });
    }
    return this.#listeners;
  }

  #markReady() {
    this.#ready = true;
    for (const resolve of [...this.#readyWaiters]) resolve(true);
    this.#readyWaiters.clear();
  }

  /** @param {number} timeout */
  #waitForReady(timeout) {
    if (this.#ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      /** @param {boolean} ok */
      const done = (ok) => {
        clearTimeout(timer);
        this.#readyWaiters.delete(done);
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), timeout);
      this.#readyWaiters.add(done);
    });
  }

  #prepare() {
    if (this.#ready) return Promise.resolve(true);
    if (!this.#preparing) {
      this.#preparing = this.#prepareOnce().finally(() => { this.#preparing = null; });
    }
    return this.#preparing;
  }

  async #prepareOnce() {
    if (!(await this.#ensureListeners())) return false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const existing = await WebviewWindow.getByLabel(FONT_PICKER_LABEL).catch(() => null);
      if (existing) {
        const answered = this.#waitForReady(PING_TIMEOUT_MS);
        void emitTo(FONT_PICKER_LABEL, EV.ping, { from: this.#label }).catch(() => {});
        if (await answered) return true;
        if (await this.#waitForReady(READY_TIMEOUT_MS)) return true;
        console.warn('글꼴 선택 창이 응답하지 않아 다시 만듭니다.');
        await existing.destroy().catch(() => {});
        continue;
      }
      const answered = this.#waitForReady(READY_TIMEOUT_MS);
      try {
        const created = new WebviewWindow(FONT_PICKER_LABEL, { ...FONT_PICKER_WINDOW_OPTIONS });
        created.once('tauri://error', (e) => console.warn('글꼴 선택 창을 만들지 못했습니다:', e?.payload));
      } catch (e) {
        console.warn('글꼴 선택 창을 만들지 못했습니다:', e);
      }
      if (await answered) return true;
    }
    return false;
  }

  /** 앱 시작 후 한가할 때 숨긴 팝업 창을 미리 띄워 두어 첫 클릭 지연을 줄입니다. */
  schedulePrewarm(delayMs = 1800) {
    if (!isTauri() || this.#prewarmTimer) return;
    this.#prewarmTimer = setTimeout(() => {
      const run = () => void this.#prepare();
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 4500 });
      } else {
        run();
      }
    }, delayMs);
  }

  /** @param {string} key */
  isToggleTarget(key) {
    return this.openKey === key
      || (this.#lastClosed.key === key && performance.now() - this.#lastClosed.at < TOGGLE_GRACE_MS);
  }

  /**
   * @param {{
   *   key: string,
   *   anchor: HTMLElement,
   *   value: string,
   *   align?: 'start' | 'end',
   *   viaKeyboard?: boolean,
   *   theme: { source: 'tidy' | 'toolkit', themeId: string, isDarkMode: boolean },
   *   customFonts?: Array<{ name: string, path: string }>,
   *   extraOptions?: ExtraFontOption[],
   *   onSelect: (value: string) => void,
   *   focusAfter?: (reason: string) => (HTMLElement | null | undefined),
   *   preserveEditorSelection?: boolean,
   * }} options
   */
  async open(options) {
    if (!isTauri()) return;
    this.#pruneRequests();
    const requestId = `${this.#label}:${Date.now().toString(36)}:${(this.#seq += 1)}`;
    this.#requests.set(requestId, {
      key: options.key,
      anchor: options.anchor,
      onSelect: options.onSelect,
      focusAfter: options.focusAfter,
      preserveEditorSelection: options.preserveEditorSelection === true,
      at: Date.now(),
      acked: false,
      ackTimer: null,
    });
    this.#currentId = requestId;
    this.openKey = options.key;

    const ready = await this.#prepare();
    if (this.#currentId !== requestId) return;
    if (!ready || !options.anchor.isConnected) {
      this.#finish(requestId);
      return;
    }

    const win = getCurrentWindow();
    let origin;
    let scale;
    let startPos;
    let startSize;
    try {
      [origin, scale, startPos, startSize] = await Promise.all([
        win.innerPosition(),
        win.scaleFactor(),
        win.outerPosition(),
        win.outerSize(),
      ]);
    } catch {
      this.#finish(requestId);
      return;
    }
    if (this.#currentId !== requestId || !options.anchor.isConnected) {
      this.#finish(requestId);
      return;
    }

    this.#watchHostDocking(requestId, startPos, startSize);

    const rect = options.anchor.getBoundingClientRect();
    const dpr = scale > 0 ? scale : (window.devicePixelRatio || 1);
    const payload = {
      requestId,
      requester: this.#label,
      value: options.value || '',
      align: options.align === 'end' ? 'end' : 'start',
      preferredWidth: resolvePickerWidth(rect.width),
      viaKeyboard: options.viaKeyboard === true,
      anchor: {
        x: Math.round(origin.x + rect.left * dpr),
        y: Math.round(origin.y + rect.top * dpr),
        width: Math.round(rect.width * dpr),
        height: Math.round(rect.height * dpr),
      },
      theme: options.theme,
      customFonts: Array.isArray(options.customFonts)
        ? options.customFonts.filter((f) => f?.name && f?.path).map((f) => ({ name: f.name, path: f.path }))
        : [],
      extraOptions: Array.isArray(options.extraOptions) ? options.extraOptions : [],
    };
    this.#send(payload, 0);
  }

  /** @param {{ requestId: string }} payload @param {number} attempt */
  #send(payload, attempt) {
    const id = payload.requestId;
    const request = this.#requests.get(id);
    if (!request) return;
    request.acked = false;
    void emitTo(FONT_PICKER_LABEL, EV.open, payload).catch(() => {});
    if (request.ackTimer) clearTimeout(request.ackTimer);
    request.ackTimer = setTimeout(async () => {
      const r = this.#requests.get(id);
      if (!r || r.acked || this.#currentId !== id) return;
      this.#ready = false;
      if (attempt >= 1 || !(await this.#prepare()) || this.#currentId !== id) {
        this.#finish(id);
        return;
      }
      this.#send(payload, attempt + 1);
    }, ACK_TIMEOUT_MS);
  }

  /** @param {unknown} payload */
  #onOpened(payload) {
    const id = /** @type {any} */ (payload)?.requestId;
    const request = typeof id === 'string' ? this.#requests.get(id) : undefined;
    this.#ready = true;
    if (!request) return;
    request.acked = true;
    if (request.ackTimer) clearTimeout(request.ackTimer);
    request.ackTimer = null;
  }

  /** @param {unknown} payload */
  #onClosed(payload) {
    const closed = normalizeClosedPayload(payload);
    if (!closed) return;
    const request = this.#requests.get(closed.requestId);
    if (!request) return;
    const wasCurrent = this.#currentId === closed.requestId;
    this.#finish(closed.requestId);
    if (changesValue(closed.reason)) {
      try {
        request.onSelect(closed.value);
      } catch (e) {
        console.warn('고른 글꼴을 적용하지 못했습니다:', e);
      }
    }
    if (returnsFocus(closed.reason) && (wasCurrent || this.#currentId === null)) {
      // 에디터 툴바에서 글꼴을 고른 직후에는 onSelect가 contenteditable 선택·초점을 복구하므로
      // 트리거 버튼으로 초점을 빼앗지 않습니다(Esc 취소 시에만 트리거로 초점 복귀).
      if (closed.reason === 'select' && request.preserveEditorSelection) return;
      const target = request.focusAfter?.(closed.reason) || request.anchor;
      if (target && target.isConnected) {
        try { target.focus({ preventScroll: true }); } catch {}
      }
    }
  }

  /** @param {string} id */
  #finish(id) {
    const request = this.#requests.get(id);
    if (request?.ackTimer) clearTimeout(request.ackTimer);
    this.#requests.delete(id);
    if (this.#currentId === id) this.#markClosedLocally(request?.key || '');
  }

  /** @param {string} key */
  #markClosedLocally(key) {
    this.#currentId = null;
    this.openKey = null;
    this.#lastClosed = { key, at: performance.now() };
    this.#unwatchHostDocking();
  }

  /**
   * @param {string} [reason]
   * @param {{ toggleGrace?: boolean }} [options]
   */
  close(reason = 'requester', { toggleGrace = true } = {}) {
    const id = this.#currentId;
    if (id) {
      const request = this.#requests.get(id);
      if (request?.ackTimer) {
        clearTimeout(request.ackTimer);
        request.ackTimer = null;
      }
      this.#markClosedLocally(request?.key || '');
      void emitTo(FONT_PICKER_LABEL, EV.close, { requestId: id, requester: this.#label, reason }).catch(() => {});
    }
    if (!toggleGrace) this.#lastClosed = { key: '', at: 0 };
  }

  #pruneRequests() {
    const now = Date.now();
    for (const [id, request] of this.#requests) {
      if (id !== this.#currentId && now - request.at > REQUEST_TTL_MS) this.#requests.delete(id);
    }
  }

  /**
   * 호스트 창이 이동·리사이즈·스크롤·숨김·바깥 클릭되면 즉시 팝업을 닫아
   * "드롭다운 버튼에 착 달라붙은" 일체감을 유지합니다.
   * @param {string} requestId
   * @param {{ x: number, y: number }} startPos
   * @param {{ width: number, height: number }} startSize
   */
  #watchHostDocking(requestId, startPos, startSize) {
    this.#unwatchHostDocking();
    let active = true;
    const openedAt = performance.now();

    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
      if (!active || this.#currentId !== requestId) return;
      const req = this.#requests.get(requestId);
      if (req && e.target instanceof Node && req.anchor.contains(e.target)) return;
      this.close('outside');
    };
    const onScroll = () => {
      if (!active || this.#currentId !== requestId) return;
      // 열기 직후 100ms 안의 관성·포커스 잔여 스크롤 이벤트는 무시합니다.
      if (performance.now() - openedAt < 100) return;
      this.close('host-scrolled', { toggleGrace: false });
    };
    const onVisibility = () => {
      if (!active || this.#currentId !== requestId) return;
      if (document.hidden) this.close('host-closed', { toggleGrace: false });
    };
    const onContextMenuOpen = () => {
      if (!active || this.#currentId !== requestId) return;
      this.close('context-menu', { toggleGrace: false });
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('tidy-context-menu-open', onContextMenuOpen);
    this.#dockCleanups.push(
      () => { active = false; },
      () => document.removeEventListener('pointerdown', onPointerDown, true),
      () => window.removeEventListener('scroll', onScroll, true),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('tidy-context-menu-open', onContextMenuOpen),
    );

    const win = getCurrentWindow();
    void Promise.all([
      win.onMoved(({ payload }) => {
        if (!active || this.#currentId !== requestId) return;
        if (Math.abs(payload.x - startPos.x) > HOST_MOVE_THRESHOLD || Math.abs(payload.y - startPos.y) > HOST_MOVE_THRESHOLD) {
          this.close('host-moved', { toggleGrace: false });
        }
      }),
      win.onResized(({ payload }) => {
        if (!active || this.#currentId !== requestId) return;
        if (Math.abs(payload.width - startSize.width) > HOST_MOVE_THRESHOLD || Math.abs(payload.height - startSize.height) > HOST_MOVE_THRESHOLD) {
          this.close('host-resized', { toggleGrace: false });
        }
      }),
    ]).then((unsubs) => {
      if (!active) {
        for (const fn of unsubs) fn();
      } else {
        this.#dockCleanups.push(...unsubs);
      }
    }).catch(() => {});
  }

  #unwatchHostDocking() {
    for (const fn of this.#dockCleanups) {
      try { fn(); } catch {}
    }
    this.#dockCleanups = [];
  }
}

export const fontPicker = new FontPickerClient();
