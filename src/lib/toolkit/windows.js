import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { native } from './store.js';
import { getMonitorGeometries, ensureWindowOnScreen } from '../windows/windowRegistry.js';
/** @param {string} role */
export async function openTool(role) {
  if (native) return invoke('toolkit_open', { role });
  window.open(`/?toolkit-preview=${role}`, '_blank', 'width=960,height=680');
}
export async function closeWindow() {
  if (native) await getCurrentWindow().destroy();
  else window.close();
}
export async function dismissMenu() {
  if (native) {
    const menu = await WebviewWindow.getByLabel('toolkit-menu');
    if (menu) await menu.hide();
  }
}
/** @param {HTMLElement} trigger */
export async function showTimerMenu(trigger) {
  if (!native) return false;
  await openTool('toolkit-menu');
  const menu = await WebviewWindow.getByLabel('toolkit-menu');
  const host = getCurrentWindow(),
    pos = await host.innerPosition(),
    scale = await host.scaleFactor();
  const rect = trigger.getBoundingClientRect();
  const monitors = await getMonitorGeometries();
  const anchor = { x: pos.x + rect.left * scale, y: pos.y + rect.bottom * scale };
  const m =
    monitors.find(
      (m) =>
        anchor.x >= m.work.x &&
        anchor.x < m.work.x + m.work.width &&
        anchor.y >= m.work.y &&
        anchor.y <= m.work.y + m.work.height,
    ) || monitors[0];
  if (menu && m) {
    const w = 244 * scale,
      h = 250 * scale,
      gap = 6 * scale;
    const x = Math.max(m.work.x, Math.min(anchor.x, m.work.x + m.work.width - w));
    const y =
      anchor.y + gap + h <= m.work.y + m.work.height
        ? anchor.y + gap
        : pos.y + rect.top * scale - h - gap;
    await menu.setSize(new LogicalSize(244, 250));
    await menu.setPosition(new PhysicalPosition(Math.round(x), Math.round(Math.max(m.work.y, y))));
    await menu.show();
    await menu.setFocus();
  }
  return true;
}
/** @param {number} width @param {number} height */
export async function resizeToolbar(width, height) {
  if (!native) return;
  await dismissMenu();
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
  await ensureWindowOnScreen(win);
}
