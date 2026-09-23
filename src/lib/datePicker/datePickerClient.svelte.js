// ═══════════════════════════════════════════════════════════════════
// [날짜 선택 창 부르기] 메모 창(main / note-N)에서 마감일 달력 창을 열고 결과를 받습니다.
//
// 지키는 약속:
//   ① 결과는 요청 번호로만 적용합니다. 늦게 온 옛 결과가 다른 할 일에 들어가지 않게.
//   ② 달력 창이 없거나 고장 나 있어도 한 번은 스스로 다시 만들어 보냅니다(대답 확인 → 재시도).
//   ③ 버튼을 다시 누르면 닫힙니다. 달력 창의 "초점 잃음(닫힘)"이 클릭보다 먼저 와도 다시 열리지 않게 합니다.
//   ④ 요청 창 안의 다른 곳을 눌러도 닫습니다. (달력 창이 초점을 받지 못한 드문 경우의 안전망)
// ═══════════════════════════════════════════════════════════════════
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import {
  DATE_PICKER_EVENTS as EV,
  DATE_PICKER_LABEL,
  DATE_PICKER_WINDOW_OPTIONS,
  changesValue,
  normalizeClosed,
  returnsFocus,
} from './protocol.js';

/** @typedef {import('./protocol.js').PickerAppearance} PickerAppearance */
/**
 * @typedef {{
 *   key: string,
 *   anchor: HTMLElement,
 *   onSelect: (value: string) => void,
 *   focusAfter?: () => (HTMLElement | null | undefined),
 *   at: number,
 *   acked: boolean,
 *   ackTimer: ReturnType<typeof setTimeout> | null,
 * }} PendingRequest
 */

// 창을 새로 만들 때 화면(JS)이 준비되기까지 기다리는 최대 시간 (느린 PC·백신 검사 포함)
const READY_TIMEOUT_MS = 6000;
// 이미 있는 창이 "살아 있음"을 대답하기까지
const PING_TIMEOUT_MS = 800;
// open을 받았다는 대답(opened)까지. 넘기면 창을 다시 준비해 한 번 더 보냅니다.
const ACK_TIMEOUT_MS = 1500;
// 달력이 닫힌 직후 같은 버튼을 누르면 "다시 열기"가 아니라 "닫기(토글)"로 봅니다.
// 왜: 버튼을 누르면 달력 창이 먼저 초점을 잃고 닫힌 뒤에 버튼의 click이 옵니다(툴킷 메뉴와 같은 현상).
const TOGGLE_GRACE_MS = 450;
// 닫힘 결과를 끝내 받지 못한 요청 기록을 버리는 시간 (달력 창이 사라진 경우 등)
const REQUEST_TTL_MS = 5 * 60 * 1000;

/** @param {HTMLElement} el */
function focusElement(el) {
  try {
    el.focus({ preventScroll: true });
    // 입력칸(contenteditable)이면 커서를 글 끝에 둡니다. 날짜를 고른 뒤 바로 이어 쓰기 위함입니다.
    if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  } catch (e) {}
}

class DatePickerClient {
  // 지금 열려 있는 달력의 대상 (예: 'todo:<id>', 'new'). 버튼 강조 표시에 씁니다.
  /** @type {string | null} */
  openKey = $state(null);

  /** @type {string | null} */
  #currentId = null;
  /** @type {Map<string, PendingRequest>} */
  #requests = new Map();
  #seq = 0;
  #ready = false;
  /** @type {Set<(ok: boolean) => void>} */
  #readyWaiters = new Set();
  /** @type {Promise<boolean> | null} */
  #listeners = null;
  /** @type {Promise<boolean> | null} */
  #preparing = null;
  #lastClosed = { key: '', at: 0 };
  /** @type {((e: PointerEvent) => void) | null} */
  #outsideHandler = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  #prewarmTimer = null;

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
        console.warn('날짜 선택 창 알림을 받을 준비를 하지 못했습니다:', e);
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

  // 달력 창이 대답할 수 있는 상태로 만듭니다. (없으면 만들고, 있으면 살아 있는지 확인)
  // 여러 곳에서 동시에 불러도 준비는 한 번만 합니다.
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
      const existing = await WebviewWindow.getByLabel(DATE_PICKER_LABEL).catch(() => null);
      if (existing) {
        const answered = this.#waitForReady(PING_TIMEOUT_MS);
        void emitTo(DATE_PICKER_LABEL, EV.ping, { from: this.#label }).catch(() => {});
        if (await answered) return true;
        // 대답이 없으면 다른 메모 창이 막 만들어 화면(JS)을 읽는 중일 수 있습니다. 준비되면 스스로 알려 옵니다.
        if (await this.#waitForReady(READY_TIMEOUT_MS)) return true;
        // 그래도 조용하면 고장 난 창으로 보고 새로 만듭니다.
        console.warn('날짜 선택 창이 대답하지 않아 다시 만듭니다.');
        await existing.destroy().catch(() => {});
        continue;
      }
      const answered = this.#waitForReady(READY_TIMEOUT_MS);
      try {
        const created = new WebviewWindow(DATE_PICKER_LABEL, { ...DATE_PICKER_WINDOW_OPTIONS });
        // 다른 메모 창이 한발 먼저 같은 이름으로 만들었다면 실패하지만, 그 창의 "준비됨" 알림을 받으면 됩니다.
        created.once('tauri://error', (e) => console.warn('날짜 선택 창을 만들지 못했습니다:', e?.payload));
      } catch (e) {
        console.warn('날짜 선택 창을 만들지 못했습니다:', e);
      }
      if (await answered) return true;
    }
    return false;
  }

  // 처음 누를 때 창을 만드느라 늦지 않도록, 메모 창이 뜬 뒤 한가할 때 미리 만들어 둡니다.
  schedulePrewarm(delayMs = 1500) {
    if (!isTauri() || this.#prewarmTimer) return;
    this.#prewarmTimer = setTimeout(() => {
      const run = () => void this.#prepare();
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 4000 });
      else run();
    }, delayMs);
  }

  /** 이 버튼(key)의 달력이 열려 있거나 방금 닫혔는지 — 버튼을 누른 순간(pointerdown)에 판단합니다. */
  /** @param {string} key */
  isToggleTarget(key) {
    return this.openKey === key
      || (this.#lastClosed.key === key && performance.now() - this.#lastClosed.at < TOGGLE_GRACE_MS);
  }

  /**
   * 달력을 엽니다.
   * @param {{
   *   key: string, anchor: HTMLElement, value: string, viaKeyboard?: boolean,
   *   appearance: PickerAppearance,
   *   onSelect: (value: string) => void,
   *   focusAfter?: () => (HTMLElement | null | undefined),
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
      at: Date.now(),
      acked: false,
      ackTimer: null,
    });
    this.#currentId = requestId;
    this.openKey = options.key;
    this.#watchOutside();

    const ready = await this.#prepare();
    if (this.#currentId !== requestId) return; // 기다리는 사이 닫혔거나 다른 달력을 열었음
    if (!ready || !options.anchor.isConnected) {
      this.#finish(requestId);
      return;
    }
    /** @type {import('@tauri-apps/api/dpi').PhysicalPosition} */
    let origin;
    /** @type {number} */
    let scale;
    try {
      // 두 값을 한 번에 물어봅니다(왕복 1회).
      // 왜 devicePixelRatio 대신 scaleFactor인가: 화면 배율의 정답은 창(OS) 쪽 값입니다.
      //   우클릭 메뉴(ContextMenu.svelte)도 같은 값을 써서 배율이 다른 모니터에서 자리를 맞춥니다.
      [origin, scale] = await Promise.all([
        getCurrentWindow().innerPosition(),
        getCurrentWindow().scaleFactor(),
      ]);
    } catch (e) {
      this.#finish(requestId);
      return;
    }
    if (this.#currentId !== requestId) return;
    // 기다리는 사이 버튼이 사라졌으면(할 일 삭제·검색으로 숨김) 열지 않고 "닫힘"으로 정리합니다.
    // 여기서 정리하지 않으면 뱃지가 계속 "열림"으로 표시된 채 남습니다.
    if (!options.anchor.isConnected) {
      this.#finish(requestId);
      return;
    }
    // 버튼 자리는 보내기 직전에 잽니다. (창을 만드는 동안 목록이 움직였을 수 있음)
    // 화면 좌표(물리 px) = 창 안쪽 왼쪽 위(물리) + 버튼 위치(CSS px) × 화면 배율
    const rect = options.anchor.getBoundingClientRect();
    const dpr = scale > 0 ? scale : (window.devicePixelRatio || 1);
    const payload = {
      requestId,
      requester: this.#label,
      value: options.value || '',
      viaKeyboard: options.viaKeyboard === true,
      anchor: {
        x: Math.round(origin.x + rect.left * dpr),
        y: Math.round(origin.y + rect.top * dpr),
        width: Math.round(rect.width * dpr),
        height: Math.round(rect.height * dpr),
      },
      appearance: options.appearance,
    };
    this.#send(payload, 0);
  }

  /** @param {{ requestId: string }} payload @param {number} attempt */
  #send(payload, attempt) {
    const id = payload.requestId;
    const request = this.#requests.get(id);
    if (!request) return;
    request.acked = false;
    void emitTo(DATE_PICKER_LABEL, EV.open, payload).catch(() => {});
    if (request.ackTimer) clearTimeout(request.ackTimer);
    request.ackTimer = setTimeout(async () => {
      const r = this.#requests.get(id);
      if (!r || r.acked || this.#currentId !== id) return;
      // 대답이 없으면 달력 창이 사라졌거나 고장 난 것입니다. 한 번만 다시 준비해 보냅니다.
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
    const closed = normalizeClosed(payload);
    if (!closed) return;
    const request = this.#requests.get(closed.requestId);
    if (!request) return;
    const wasCurrent = this.#currentId === closed.requestId;
    this.#finish(closed.requestId);
    if (changesValue(closed.reason)) {
      try {
        request.onSelect(closed.value);
      } catch (e) {
        console.warn('고른 날짜를 적용하지 못했습니다:', e);
      }
    }
    // 그사이 다른 달력을 새로 열었다면 초점을 옮기지 않습니다(새 달력이 초점을 가져야 합니다).
    if (returnsFocus(closed.reason) && (wasCurrent || this.#currentId === null)) {
      const target = request.focusAfter?.() || request.anchor;
      if (target && target.isConnected) focusElement(target);
    }
  }

  // 요청 기록을 지우고, 지금 열린 달력이었다면 "닫힘" 상태로 바꿉니다.
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
    this.#unwatchOutside();
  }

  /**
   * 요청 창 쪽에서 달력을 닫습니다. (바깥 클릭·할 일 삭제·업데이트 잠금 등)
   * 요청 기록은 달력 창의 closed 대답을 받을 때까지 남겨 둡니다 — 닫히기 직전에 고른 날짜가 오고 있을 수 있습니다.
   * @param {string} [reason]
   */
  close(reason = 'requester') {
    const id = this.#currentId;
    if (!id) return;
    const request = this.#requests.get(id);
    this.#markClosedLocally(request?.key || '');
    void emitTo(DATE_PICKER_LABEL, EV.close, { requestId: id, requester: this.#label, reason }).catch(() => {});
  }

  #pruneRequests() {
    const now = Date.now();
    for (const [id, request] of this.#requests) {
      if (id !== this.#currentId && now - request.at > REQUEST_TTL_MS) this.#requests.delete(id);
    }
  }

  #watchOutside() {
    if (this.#outsideHandler) return;
    this.#outsideHandler = (e) => {
      const request = this.#currentId ? this.#requests.get(this.#currentId) : undefined;
      if (!request) return;
      // 같은 버튼을 누른 경우는 버튼의 토글 처리에 맡깁니다.
      if (e.target instanceof Node && request.anchor.contains(e.target)) return;
      this.close('outside');
    };
    document.addEventListener('pointerdown', this.#outsideHandler, true);
  }

  #unwatchOutside() {
    if (!this.#outsideHandler) return;
    document.removeEventListener('pointerdown', this.#outsideHandler, true);
    this.#outsideHandler = null;
  }
}

// 창(웹뷰)마다 하나. 달력 창은 앱 전체에 하나라서 여러 메모 창이 번갈아 씁니다.
export const datePicker = new DatePickerClient();

/**
 * @typedef {{
 *   key: string,
 *   value: string,
 *   appearance: () => PickerAppearance,
 *   onSelect: (value: string) => void,
 *   focusAfter?: () => (HTMLElement | null | undefined),
 * }} DateTriggerOptions
 */

/**
 * 버튼을 누르면 날짜 선택 창을 여닫는 Svelte 액션입니다.
 * @param {HTMLElement} node
 * @param {DateTriggerOptions} params
 */
export function dateTrigger(node, params) {
  let options = params;
  // 누르는 순간(pointerdown)의 열림 상태. click이 올 때는 달력 창이 이미 초점을 잃고 닫혔을 수 있습니다.
  let toggleIntent = false;

  /** @param {PointerEvent} e */
  function handlePointerDown(e) {
    if (e.button !== 0) return;
    toggleIntent = datePicker.isToggleTarget(options.key);
  }

  /** @param {MouseEvent} e */
  function handleClick(e) {
    const intent = toggleIntent;
    toggleIntent = false;
    // e.detail === 0 은 키보드(Enter/Space)로 누른 것입니다. 키보드는 늘 "열기"입니다.
    const viaKeyboard = e.detail === 0;
    if (intent && !viaKeyboard) {
      if (datePicker.openKey === options.key) datePicker.close('toggle');
      return;
    }
    void datePicker.open({
      key: options.key,
      anchor: node,
      value: options.value,
      viaKeyboard,
      appearance: options.appearance(),
      onSelect: (value) => options.onSelect(value),
      focusAfter: () => options.focusAfter?.(),
    });
  }

  node.addEventListener('pointerdown', handlePointerDown);
  node.addEventListener('click', handleClick);
  node.setAttribute('aria-haspopup', 'dialog');
  return {
    /** @param {DateTriggerOptions} next */
    update(next) {
      options = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('click', handleClick);
      // 버튼이 사라지면(할 일 삭제 등) 그 버튼의 달력도 닫습니다. 떠 있는 달력이 가리킬 곳이 없습니다.
      if (datePicker.openKey === options.key) datePicker.close('anchor-removed');
    },
  };
}
