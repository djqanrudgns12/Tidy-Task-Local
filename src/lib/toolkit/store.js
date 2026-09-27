import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { defaults, normalizeSettings, applySettingsPatch, normalizeToolOrder } from './preferences.js';
export const native = isTauri();
const PREVIEW_KEY = 'tidy-toolkit-preview-v1';
const ORDER_PREVIEW_EVENT = 'toolkit-order-preview';
/** @type {BroadcastChannel|undefined} */ let orderChannel;
let orderPreviewQueue = Promise.resolve();
let orderPreviewRevision = 0;
/** @param {string[]|null} toolOrderIds */
export function previewToolOrder(toolOrderIds) {
  const payload = { toolOrderIds, expiresAt: Date.now() + 2000 };
  if (native) {
    const revision = ++orderPreviewRevision;
    // 전송 중 쌓인 중간 순서는 건너뛰고 최신 자리만 보냅니다.
    orderPreviewQueue = orderPreviewQueue.catch(() => {}).then(() => {
      if (revision === orderPreviewRevision) return emit(ORDER_PREVIEW_EVENT, { ...payload, expiresAt: Date.now() + 2000 });
    });
    return orderPreviewQueue;
  }
  orderChannel ??= new BroadcastChannel(ORDER_PREVIEW_EVENT);
  orderChannel.postMessage(payload);
  window.dispatchEvent(new CustomEvent(ORDER_PREVIEW_EVENT, { detail: payload }));
  return Promise.resolve();
}
/** @param {(ids:string[]|null)=>void} callback */
export async function subscribeToolOrderPreview(callback) {
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timeout;
  /** @param {any} payload */
  const receive = (payload) => {
    clearTimeout(timeout);
    const remaining = payload?.expiresAt - Date.now();
    if (!Array.isArray(payload?.toolOrderIds) || !(remaining > 0)) { callback(null); return; }
    callback(normalizeToolOrder(payload.toolOrderIds));
    timeout = setTimeout(() => callback(null), Math.min(remaining, 2000));
  };
  if (native) {
    const off = await listen(ORDER_PREVIEW_EVENT, (event) => receive(event.payload));
    return () => { clearTimeout(timeout); off(); };
  }
  const channel = new BroadcastChannel(ORDER_PREVIEW_EVENT);
  /** @param {Event} event */
  const local = (event) => receive(/** @type {CustomEvent} */ (event).detail);
  channel.onmessage = (event) => receive(event.data);
  window.addEventListener(ORDER_PREVIEW_EVENT, local);
  return () => { clearTimeout(timeout); channel.close(); window.removeEventListener(ORDER_PREVIEW_EVENT, local); };
}
let queue = Promise.resolve();
export async function readSettings() {
  if (native) return normalizeSettings(await invoke('toolkit_read'));
  const raw = localStorage.getItem(PREVIEW_KEY);
  return raw ? normalizeSettings(JSON.parse(raw)) : defaults();
}
/** @param {string} scope @param {Record<string,unknown>} patch */
export function patchSettings(scope, patch) {
  const run = async () => {
    if (native) return normalizeSettings(await invoke('toolkit_patch', { scope, patch }));
    const next = applySettingsPatch(await readSettings(), scope, patch);
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('toolkit-change'));
    return next;
  };
  const task = queue.then(run, run);
  queue = task.then(
    () => {},
    () => {},
  );
  return task;
}
/** @param {boolean} enabled */
export async function setEnabled(enabled) {
  if (native) return invoke('toolkit_set_enabled', { enabled });
  return patchSettings('toolkit', { enabled });
}
/** @param {(settings:import("./preferences.js").Settings)=>void} callback */
export async function subscribeSettings(callback) {
  if (native)
    return listen('toolkit-preferences-changed', (event) =>
      callback(normalizeSettings(event.payload)),
    );
  const handler = () => {
    void readSettings()
      .then(callback)
      .catch(() => {});
  };
  window.addEventListener('toolkit-change', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('toolkit-change', handler);
    window.removeEventListener('storage', handler);
  };
}
