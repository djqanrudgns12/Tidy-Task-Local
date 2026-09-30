import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { PLATFORM_TOOLS } from './registry.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize, LogicalSize } from '@tauri-apps/api/dpi';
import { native, readSettings } from './store.js';
import { moreTools } from './moreTools.js';
import { getMonitorGeometries, ensureWindowOnScreen } from '../windows/windowRegistry.js';
import { menuPlacement } from './menuPlacement.js';
import { fitToolbarPosition, centerToolbarPosition } from './toolbarPlacement.js';
/** @param {string} role */
export async function openTool(role) {
  if (native) return invoke('toolkit_open', { role });
  const size = role === 'picker' || role === 'vote' || role.startsWith('scoreboard-') ? 'width=1440,height=888' : role === 'vote-teacher' ? 'width=440,height=760' : role === 'thermometer' ? 'width=880,height=888' : role === 'dice' ? 'width=960,height=720' : 'width=960,height=680';
  window.open(`/?toolkit-preview=${role}`, '_blank', size);
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
  // 점수판 드롭다운 — 항목 3개(아이콘·이름·한 줄 설명). 크기는 Rust toolkit.rs와 같습니다.
  scoreboard: { label: 'toolkit-scoreboard-menu', width: 264, height: 222 },
  more: { label: 'toolkit-more-menu', width: 264, height: 480 },
  external: { label: 'toolkit-external-menu', width: 244, height: 162 },
  // 우클릭 메뉴 — 높이는 ToolkitMenu의 context 항목 높이(CSS)와 맞춘 값입니다.
  context: { label: 'toolkit-context-menu', width: 340, height: 640 },
};
/** @param {'timer'|'scoreboard'|'external'|'more'|'context'} [kind] */
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
 * @param {'timer'|'scoreboard'|'external'|'more'} kind
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
  let logicalHeight =
    kind === 'external' && typeof entryCount === 'number' && Number.isFinite(entryCount)
      ? 66 + Math.max(1, entryCount) * 48
      : definition.height;
  if (kind === 'more') {
    // 첫 표시부터 항목 수에 맞추고, 글꼴·줄바꿈·하위 목록의 실제 높이는 메뉴에서 다시 잽니다.
    const count = moreTools((await readSettings()).toolkit).length;
    logicalHeight = count ? 88 + count * 46 : 163;
  }
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
  const placement = menuPlacement({
    point: anchor, top: pos.y + anchorRect.top * scale,
    size: { width: definition.width, height: logicalHeight }, monitors, gap: logicalGap,
  });
  if (menu && placement) {
    await applyMenuPlacement(menu, placement);
    await menu.show();
    await menu.setFocus();
  }

}
/** 크기 제한을 풀고 목적지의 물리 크기를 적용합니다. DPI 변경 후에도 같은 작업영역 안에 맞춥니다.
 * @param {import('@tauri-apps/api/window').Window} menu
 * @param {NonNullable<ReturnType<typeof menuPlacement>>} placement */
export async function applyMenuPlacement(menu, placement) {
  await menu.setMinSize(null);
  // 다른 배율 화면으로 이동하면 OS가 창 크기를 다시 계산하므로, 이동 후 크기를 한 번 더 적용합니다.
  for (let pass = 0; pass < 2; pass++) {
    await menu.setPosition(new PhysicalPosition(placement.x, placement.y));
    await menu.setSize(new PhysicalSize(placement.width, placement.height));
  }
}
/** 더보기의 실제 내용 높이를 창에 반영합니다. 화면보다 길면 기존 배치 규칙으로 제한해 스크롤합니다.
 * @param {number} logicalHeight */
export async function fitMoreMenu(logicalHeight) {
  if (!native || !Number.isFinite(logicalHeight) || logicalHeight <= 0) return;
  const win = getCurrentWindow();
  const [pos, size, monitors, toolbar] = await Promise.all([
    win.outerPosition(), win.outerSize(), getMonitorGeometries(), WebviewWindow.getByLabel('toolkit'),
  ]);
  const point = { x: pos.x + size.width / 2, y: pos.y + size.height / 2 };
  const placement = menuPlacement({ point, position: pos, size: { ...MENU_WINDOWS.more, height: logicalHeight }, monitors });
  if (!placement) return;
  // 툴바 위로 열린 메뉴는 아래 끝을 유지해야 하위 목록을 열어도 버튼에서 멀어지지 않습니다.
  if (toolbar && pos.y + size.height <= (await toolbar.outerPosition()).y) {
    const above = menuPlacement({ point, position: { x: pos.x, y: pos.y + size.height - placement.height },
      size: { ...MENU_WINDOWS.more, height: logicalHeight }, monitors });
    if (above) placement.y = above.y;
  }
  if (pos.x !== placement.x || pos.y !== placement.y || size.width !== placement.width || size.height !== placement.height) {
    await applyMenuPlacement(win, placement);
  }
}
/** 관리 패널을 이동한 화면의 크기와 배율로 다시 맞춥니다.
 * @param {{point?:{x:number,y:number}, position?:{x:number,y:number}, size?:{width:number,height:number}}} [options] */
export async function fitContextPanel(options = {}) {
  if (!native) return null;
  const win = getCurrentWindow();
  const [pos, size, monitors] = await Promise.all([win.outerPosition(), win.outerSize(), getMonitorGeometries()]);
  const placement = menuPlacement({
    point: options.point ?? { x: pos.x + size.width / 2, y: pos.y + Math.min(size.height / 2, 24) },
    position: options.position ?? { x: pos.x, y: pos.y },
    size: options.size ?? MENU_WINDOWS.context, monitors,
  });
  if (placement && (pos.x !== placement.x || pos.y !== placement.y || size.width !== placement.width || size.height !== placement.height)) {
    await applyMenuPlacement(win, placement);
  }
  return placement;
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
/** 도구 창을 최소 폭까지 넓힙니다(온도계를 두 개로 늘릴 때). 이미 넓으면 그대로 둡니다.
 * 작업 영역 안으로 제한한 뒤 화면 밖으로 나가지 않게 보정합니다.
 * @param {number} minLogicalWidth */
export async function growToolWindow(minLogicalWidth) {
  if (!native) return;
  const win = getCurrentWindow();
  const [size, scale, position, monitors] = await Promise.all([
    win.innerSize(), win.scaleFactor(), win.outerPosition(), getMonitorGeometries(),
  ]);
  const width = size.width / scale;
  if (width >= minLogicalWidth) return;
  const monitor = monitors.find((m) => position.x >= m.work.x && position.x < m.work.x + m.work.width) || monitors[0];
  const room = monitor ? monitor.work.width / scale - 32 : minLogicalWidth;
  await win.setSize(new LogicalSize(Math.min(minLogicalWidth, room), size.height / scale));
  await ensureWindowOnScreen(win);
}
/** 창을 연 뒤 내용이 바뀌어 최소 크기가 달라질 때(온도계 1개 ↔ 2개) 씁니다.
 * 왜: 창을 만들 때 정한 최소 크기는 그대로 남아, 두 번째 온도계를 더한 뒤에도 창을 좁게 줄일 수 있었습니다.
 * @param {number} minLogicalWidth @param {number} minLogicalHeight */
export async function setToolMinSize(minLogicalWidth, minLogicalHeight) {
  if (!native) return;
  await getCurrentWindow().setMinSize(new LogicalSize(minLogicalWidth, minLogicalHeight));
}
/** @param {number} width @param {number} height */
export async function resizeToolbar(width, height) {
  if (!native) return;
  // 도구 관리 중 툴바 폭이 바뀌어도 우클릭 패널은 유지합니다.
  await Promise.all(['timer', 'scoreboard', 'external'].map(kind => dismissMenu(/** @type {any} */ (kind))));
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
  const [position, size, monitors] = await Promise.all([
    win.outerPosition(), win.outerSize(), getMonitorGeometries(),
  ]);
  const target = fitToolbarPosition({ x: position.x, y: position.y, width: size.width, height: size.height }, monitors);
  if (target && (target.x !== position.x || target.y !== position.y))
    await win.setPosition(new PhysicalPosition(target.x, target.y));
}
