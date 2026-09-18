import { invoke, isTauri } from '@tauri-apps/api/core';
import { shouldReportActivity } from './analyticsActivity.js';

/** No text/DOM/error objects accepted. Native code independently validates all properties.
 * @param {string} event
 * @param {{count?:number, choice?:string}} [properties]
 */
export function track(event, { count, choice } = {}) {
  if (!isTauri()) return;
  void invoke('analytics_track', { event, count, choice }).catch(() => {});
}

const lastEvents = new Map();
/** @param {string} event @param {{count?:number, choice?:string}} [properties] @param {number} [interval] */
export function trackThrottled(event, properties = {}, interval = 60000) {
  const key = `${event}:${properties.choice || ''}`;
  const now = Date.now();
  if (now - (lastEvents.get(key) ?? -Infinity) < interval) return;
  lastEvents.set(key, now);
  track(event, properties);
}

/** Listen only for trusted interaction; no keystrokes, targets or content are inspected. */
export function initAnalytics() {
  if (!isTauri()) return;
  let lastActivity = -Infinity;
  /** @param {Event} event */
  const active = (event) => {
    if (!event.isTrusted || document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (!shouldReportActivity(lastActivity, now)) return;
    lastActivity = now;
    track('activity');
  };
  for (const type of ['pointerdown', 'keydown', 'input', 'wheel']) {
    document.addEventListener(type, active, { capture: true, passive: true });
  }
  window.addEventListener('error', () => trackThrottled('app_error', { choice: 'frontend_error' }));
  window.addEventListener('unhandledrejection', () => trackThrottled('app_error', { choice: 'unhandled_rejection' }));
}
