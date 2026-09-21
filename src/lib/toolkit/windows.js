import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { PLATFORM_TOOLS } from './registry.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { native } from './store.js';
import { getMonitorGeometries } from '../windows/windowRegistry.js';
import { fitToolbarPosition, centerToolbarPosition } from './toolbarPlacement.js';
/** @param {string} role */
export async function openTool(role) {
  if (native) return invoke('toolkit_open', { role });
  window.open(`/?toolkit-preview=${role}`, '_blank', role === 'picker' ? 'width=1440,height=920' : 'width=960,height=680');
}
/** @param {string} id */
export async function openPlatform(id) {
  const platform = PLATFORM_TOOLS.find((tool) => tool.id === id);
  if (!platform) throw new Error('알 수 없는 플랫폼입니다.');
  if (native) await openUrl(platform.url);
  else window.open(platform.url, '_blank', 'noopener,noreferrer');
}
export async function closeWindow() {
  if (native) await getCurrentWindow().destroy();
  else window.close();
}
const MENU_WINDOWS = {
  timer: { label: 'toolkit-menu', width: 244, height: 250 },
  external: { label: 'toolkit-external-menu', width: 244, height: 162 },
  // 우클릭 메뉴 — 높이는 ToolkitMenu의 context 항목 높이(CSS)와 맞춘 값입니다.
  context: { label: 'toolkit-context-menu', width: 224, height: 226 },
};
/** @param {'timer'|'external'|'context'} [kind] */
export async function dismissMenu(kind) {
  if (native) {
    const menus = kind
      ? [MENU_WINDOWS[kind]]
      : Object.values(MENU_WINDOWS);
    await Promise.all(
      menus.map(async ({ label }) => {
        const menu = await WebviewWindow.getByLabel(label);
        if (menu) await menu.hide();
      }),
    );
  }
}
/**
 * @param {HTMLElement} trigger
 * @param {'timer'|'external'} kind
 * @param {number} [entryCount]
 */
export async function showToolkitMenu(trigger, kind, entryCount) {
  if (!native) return false;
  const definition = MENU_WINDOWS[kind];
  if (!definition) throw new Error('알 수 없는 메뉴입니다.');
  const visibleMenu = await WebviewWindow.getByLabel(definition.label);
  if (visibleMenu && (await visibleMenu.isVisible())) {
    await visibleMenu.hide();
    return true;
  }
  const logicalHeight =
    kind === 'external' && typeof entryCount === 'number' && Number.isFinite(entryCount)
      ? 66 + Math.max(1, entryCount) * 48
      : definition.height;
  const rect = trigger.getBoundingClientRect();
  await placeMenu(definition, logicalHeight, { left: rect.left, top: rect.top, bottom: rect.bottom }, 6);
  return true;
}
/** 툴바 아무 곳에서 우클릭 — 커서 끝에 메뉴를 붙입니다.
 * 왜 버튼 메뉴처럼 토글하지 않는가: 우클릭을 다시 하면 "다른 자리에서 다시 열기"를 기대하므로 매번 새로 놓습니다.
 * @param {number} clientX @param {number} clientY */
export async function showToolkitContextMenu(clientX, clientY) {
  if (!native) return false;
  const definition = MENU_WINDOWS.context;
  await placeMenu(definition, definition.height, { left: clientX, top: clientY, bottom: clientY }, 2);
  return true;
}
/**
 * @param {{label:string,width:number}} definition
 * @param {number} logicalHeight
 * @param {{left:number,top:number,bottom:number}} anchorRect 툴바 창 안의 CSS 좌표
 * @param {number} logicalGap
 */
async function placeMenu(definition, logicalHeight, anchorRect, logicalGap) {
  await dismissMenu();
  await openTool(definition.label);
  const menu = await WebviewWindow.getByLabel(definition.label);
  const host = getCurrentWindow(),
    pos = await host.innerPosition(),
    scale = await host.scaleFactor();
  const monitors = await getMonitorGeometries();
  const anchor = { x: pos.x + anchorRect.left * scale, y: pos.y + anchorRect.bottom * scale };
  const m =
    monitors.find(
      (m) =>
        anchor.x >= m.work.x &&
        anchor.x < m.work.x + m.work.width &&
        anchor.y >= m.work.y &&
        anchor.y <= m.work.y + m.work.height,
    ) || monitors[0];
  if (menu && m) {
    const w = definition.width * scale,
      h = logicalHeight * scale,
      gap = logicalGap * scale;
    const x = Math.max(m.work.x, Math.min(anchor.x, m.work.x + m.work.width - w));
    const y =
      anchor.y + gap + h <= m.work.y + m.work.height
        ? anchor.y + gap
        : pos.y + anchorRect.top * scale - h - gap;
    await menu.setSize(new LogicalSize(definition.width, logicalHeight));
    await menu.setPosition(new PhysicalPosition(Math.round(x), Math.round(Math.max(m.work.y, y))));
    await menu.show();
    await menu.setFocus();
  }
}
/** 우클릭 메뉴 "좌표 초기화". 새 위치 저장은 툴바 창의 onMoved 처리기가 맡습니다. */
export async function centerToolbar() {
  if (!native) return;
  const toolbar = await WebviewWindow.getByLabel('toolkit');
  if (!toolbar) return;
  const [position, size, monitors] = await Promise.all([
    toolbar.outerPosition(), toolbar.outerSize(), getMonitorGeometries(),
  ]);
  const target = centerToolbarPosition({ x: position.x, y: position.y, width: size.width, height: size.height }, monitors);
  if (target) await toolbar.setPosition(new PhysicalPosition(target.x, target.y));
}
/** 트레이 "Tidy 툴킷 열기"로 막 뜬 툴바면, 트레이를 누른 화면 한가운데로 옮깁니다. (요청이 없으면 그대로)
 * 왜 크기 맞춤 뒤에 부르는가: 저장 위치 복원과 크기 맞춤이 끝나야 실제 툴바 크기로 가운데를 잡을 수 있습니다.
 * @returns {Promise<boolean>} 트레이로 불려 와 옮겼으면 true (화면이 "도착 신호"를 보낼지 판단합니다) */
export async function centerToolbarIfRequested() {
  if (!native) return false;
  return Boolean(await invoke('toolkit_center_if_requested'));
}
/** @param {number} width @param {number} height */
export async function resizeToolbar(width, height) {
  if (!native) return;
  await dismissMenu();
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
  const [position, size, monitors] = await Promise.all([
    win.outerPosition(), win.outerSize(), getMonitorGeometries(),
  ]);
  const target = fitToolbarPosition({ x: position.x, y: position.y, width: size.width, height: size.height }, monitors);
  if (target && (target.x !== position.x || target.y !== position.y))
    await win.setPosition(new PhysicalPosition(target.x, target.y));
}
