import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { defaults, normalizeSettings, applySettingsPatch } from './preferences.js';
export const native = isTauri();
const PREVIEW_KEY = 'tidy-toolkit-preview-v1';
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
