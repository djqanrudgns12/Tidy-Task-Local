// ═══════════════════════════════════════════════════════════════════
// [D-Day 위젯 설정 팝업 부르기] DdayWidget 창에서 독립 팝업(dday-widget-menu)을 여닫고 동기화합니다.
//
// 권위 호스트(DdayWidget) 단일 쓰기 패턴:
//   · 팝업이 설정 파일(tidy-task-dday.json)을 직접 쓰지 않습니다.
//   · 팝업에서 오는 액션(`action`)을 `onAction` 콜백으로 받아 `dday` 창의 `widgetSection`이 저장·확정합니다.
//   · `alwaysOnTop` 변경 시 팝업을 호스트 위로 재상승시켜 창 순서가 뒤집히지 않게 방어합니다.
// ═══════════════════════════════════════════════════════════════════

import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import {
  DDAY_WIDGET_MENU_EVENTS as EV,
  DDAY_WIDGET_MENU_LABEL,
  DDAY_WIDGET_MENU_WINDOW_OPTIONS,
  normalizeActionPayload,
  normalizeClosedPayload,
} from './ddayWidgetMenuProtocol.js';

const READY_TIMEOUT_MS = 6000;
const PING_TIMEOUT_MS = 800;
const ACK_TIMEOUT_MS = 1500;
const TOGGLE_GRACE_MS = 380;

class DdayWidgetMenuClient {
  isOpen = $state(false);

  /** @type {string | null} */
  #currentId = null;
  #seq = 0;
  #ready = false;
  /** @type {Set<(ok: boolean) => void>} */
  #readyWaiters = new Set();
  /** @type {Promise<boolean> | null} */
  #listeners = null;
  /** @type {Promise<boolean> | null} */
  #preparing = null;
  #lastClosedAt = 0;
  /** @type {((action: string, payload: Record<string, any>) => void) | null} */
  #onAction = null;
  /** @type {((reason: string) => void) | null} */
  #onClosed = null;
  /** @type {HTMLElement | null} */
  #triggerEl = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  #ackTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  #prewarmTimer = null;
  /** @type {((e: PointerEvent) => void) | null} */
  #outsideHandler = null;
  /** @type {Array<() => void>} */
  #unlistenFns = [];

  get #label() {
    return getCurrentWindow().label;
  }

  #ensureListeners() {
    if (!this.#listeners) {
      const win = getCurrentWindow();
      this.#listeners = Promise.all([
        win.listen(EV.ready, () => this.#markReady()),
        win.listen(EV.opened, (e) => this.#onOpened(e.payload)),
        win.listen(EV.action, (e) => this.#handleAction(e.payload)),
        win.listen(EV.closed, (e) => this.#handleClosed(e.payload)),
      ]).then(
        (fns) => {
          this.#unlistenFns.push(...fns);
          return true;
        },
        (e) => {
          console.warn('D-Day 위젯 설정 팝업 리스너를 등록하지 못했습니다:', e);
          this.#listeners = null;
          return false;
        },
      );
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
      this.#preparing = this.#prepareOnce().finally(() => {
        this.#preparing = null;
      });
    }
    return this.#preparing;
  }

  async #prepareOnce() {
    if (!(await this.#ensureListeners())) return false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const existing = await WebviewWindow.getByLabel(DDAY_WIDGET_MENU_LABEL).catch(() => null);
      if (existing) {
        const answered = this.#waitForReady(PING_TIMEOUT_MS);
        void emitTo(DDAY_WIDGET_MENU_LABEL, EV.ping, { from: this.#label }).catch(() => {});
        if (await answered) return true;
        if (await this.#waitForReady(READY_TIMEOUT_MS)) return true;
        await existing.destroy().catch(() => {});
        continue;
      }
      const answered = this.#waitForReady(READY_TIMEOUT_MS);
      try {
        const created = new WebviewWindow(DDAY_WIDGET_MENU_LABEL, {
          ...DDAY_WIDGET_MENU_WINDOW_OPTIONS,
        });
        created.once('tauri://error', (e) => {
          console.warn('D-Day 위젯 설정 창 생성 실패:', e?.payload);
        });
      } catch (e) {
        console.warn('D-Day 위젯 설정 창 생성 예외:', e);
      }
      if (await answered) return true;
    }
    return false;
  }

  /** @param {number} [delayMs] */
  schedulePrewarm(delayMs = 1200) {
    if (!isTauri() || this.#prewarmTimer) return;
    this.#prewarmTimer = setTimeout(() => {
      const run = () => void this.#prepare();
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 4000 });
      } else {
        run();
      }
    }, delayMs);
  }

  isToggleTarget() {
    return this.isOpen || performance.now() - this.#lastClosedAt < TOGGLE_GRACE_MS;
  }

  async captureHostAnchor() {
    const win = getCurrentWindow();
    const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
    return {
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
    };
  }

  /**
   * @param {{
   *   viaKeyboard?: boolean,
   *   triggerEl?: HTMLElement | null,
   *   state: Record<string, any>,
   *   onAction: (action: string, payload: Record<string, any>) => void,
   *   onClosed?: (reason: string) => void,
   * }} options
   */
  async open(options) {
    if (!isTauri()) return;
    const requestId = `${this.#label}:${Date.now().toString(36)}:${(this.#seq += 1)}`;
    this.#currentId = requestId;
    this.#onAction = options.onAction;
    this.#onClosed = options.onClosed ?? null;
    this.#triggerEl = options.triggerEl ?? null;
    this.isOpen = true;
    this.#watchOutside();

    const ready = await this.#prepare();
    if (this.#currentId !== requestId) return;
    if (!ready) {
      this.#markClosed('error');
      return;
    }

    /** @type {{ x: number, y: number, width: number, height: number }} */
    let anchor;
    try {
      anchor = await this.captureHostAnchor();
    } catch {
      this.#markClosed('error');
      return;
    }
    if (this.#currentId !== requestId) return;

    this.#send(
      {
        requestId,
        requester: this.#label,
        anchor,
        viaKeyboard: options.viaKeyboard === true,
        state: options.state,
      },
      0,
    );
  }

  /** @param {Record<string, any>} payload @param {number} attempt */
  #send(payload, attempt) {
    const id = payload.requestId;
    if (this.#currentId !== id) return;
    void emitTo(DDAY_WIDGET_MENU_LABEL, EV.open, payload).catch(() => {});
    if (this.#ackTimer) clearTimeout(this.#ackTimer);
    this.#ackTimer = setTimeout(async () => {
      if (this.#currentId !== id) return;
      this.#ready = false;
      if (attempt >= 1 || !(await this.#prepare()) || this.#currentId !== id) {
        this.#markClosed('error');
        return;
      }
      this.#send(payload, attempt + 1);
    }, ACK_TIMEOUT_MS);
  }

  /** @param {unknown} payload */
  #onOpened(payload) {
    const id = /** @type {any} */ (payload)?.requestId;
    this.#ready = true;
    if (id && id === this.#currentId && this.#ackTimer) {
      clearTimeout(this.#ackTimer);
      this.#ackTimer = null;
    }
  }

  /** @param {unknown} payload */
  #handleAction(payload) {
    const msg = normalizeActionPayload(payload);
    if (!msg || msg.requestId !== this.#currentId) return;
    this.#onAction?.(msg.action, msg.payload);
  }

  /** @param {unknown} payload */
  #handleClosed(payload) {
    const closed = normalizeClosedPayload(payload);
    if (!closed || closed.requestId !== this.#currentId) return;
    const onClosed = this.#onClosed;
    this.#markClosed(closed.reason);
    onClosed?.(closed.reason);
  }

  /** @param {Record<string, any>} state @param {{ x: number, y: number, width: number, height: number } | null} [anchor] */
  sync(state, anchor = null) {
    if (!isTauri() || !this.isOpen || !this.#currentId) return;
    void emitTo(DDAY_WIDGET_MENU_LABEL, EV.sync, {
      requestId: this.#currentId,
      state,
      anchor,
    }).catch(() => {});
  }

  async reposition() {
    if (!isTauri() || !this.isOpen || !this.#currentId) return;
    try {
      const anchor = await this.captureHostAnchor();
      if (!this.isOpen || !this.#currentId) return;
      await emitTo(DDAY_WIDGET_MENU_LABEL, EV.reposition, {
        requestId: this.#currentId,
        anchor,
      });
    } catch {}
  }

  async raiseAboveHost() {
    if (!isTauri() || !this.isOpen || !this.#currentId) return;
    try {
      const menuWin = await WebviewWindow.getByLabel(DDAY_WIDGET_MENU_LABEL).catch(() => null);
      if (menuWin) await menuWin.setAlwaysOnTop(true).catch(() => {});
      await emitTo(DDAY_WIDGET_MENU_LABEL, EV.raise, {
        requestId: this.#currentId,
      }).catch(() => {});
    } catch {}
  }

  /** @param {string} [reason] @param {{ toggleGrace?: boolean }} [options] */
  close(reason = 'requester', { toggleGrace = true } = {}) {
    const id = this.#currentId;
    if (id) {
      this.#markClosed(reason);
      if (isTauri()) {
        void emitTo(DDAY_WIDGET_MENU_LABEL, EV.close, {
          requestId: id,
          requester: this.#label,
          reason,
        }).catch(() => {});
      }
    }
    if (!toggleGrace) this.#lastClosedAt = 0;
  }

  /** @param {string} _reason */
  #markClosed(_reason) {
    if (this.#ackTimer) {
      clearTimeout(this.#ackTimer);
      this.#ackTimer = null;
    }
    this.#currentId = null;
    this.isOpen = false;
    this.#lastClosedAt = performance.now();
    this.#unwatchOutside();
  }

  #watchOutside() {
    if (this.#outsideHandler) return;
    this.#outsideHandler = (e) => {
      if (!this.isOpen) return;
      if (e.target instanceof Node && this.#triggerEl?.contains(e.target)) return;
      this.close('outside');
    };
    document.addEventListener('pointerdown', this.#outsideHandler, true);
  }

  #unwatchOutside() {
    if (!this.#outsideHandler) return;
    document.removeEventListener('pointerdown', this.#outsideHandler, true);
    this.#outsideHandler = null;
  }

  dispose() {
    if (this.#prewarmTimer) {
      clearTimeout(this.#prewarmTimer);
      this.#prewarmTimer = null;
    }
    this.close('widget-closed', { toggleGrace: false });
    this.#unwatchOutside();
    for (const fn of this.#unlistenFns) {
      try {
        fn();
      } catch {}
    }
    this.#unlistenFns = [];
    this.#listeners = null;
  }
}

export const ddayWidgetMenu = new DdayWidgetMenuClient();
