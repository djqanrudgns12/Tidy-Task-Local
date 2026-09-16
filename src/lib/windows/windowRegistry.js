// Tauri 창 API를 부르는 얇은 도우미입니다. (순수 규칙은 windowSlots.js / managerElection.js)
import { WebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { availableMonitors } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { findVisiblePlacement, toMonitorGeometry } from './windowPlacement.js';

// 지금 열려 있는 모든 창의 라벨을 한 번에 가져옵니다.
// 왜: 예전에는 note-1..10, tinynote-1..10을 하나씩 물어봐 새 창 버튼 한 번에 최대 20번 통신했습니다.
export async function getOpenWindowLabels() {
  try {
    return (await getAllWebviewWindows()).map((win) => win.label);
  } catch (e) {
    console.warn('열린 창 목록을 읽지 못했습니다:', e);
    return [];
  }
}

// 창을 숨긴 채 만든 뒤, 생성이 끝나면 보여 주고 포커스를 줍니다.
// (숨긴 채 만드는 이유: 크기·위치가 적용되기 전의 창이 잠깐 번쩍이는 것을 막기 위함)
/** @param {string} label @param {Record<string, any>} options */
export function openWindow(label, options) {
  const win = new WebviewWindow(label, options);
  win.once('tauri://created', async () => {
    try {
      await win.show();
      await win.setFocus();
    } catch (e) {}
  });
  win.once('tauri://error', (event) => {
    console.warn(`[${label}] 창을 만들지 못했습니다:`, event?.payload);
  });
  return win;
}

// 지금 연결된 모니터들의 물리 좌표 정보를 읽습니다. (읽지 못하면 빈 목록 → 위치 보정을 건너뜀)
export async function getMonitorGeometries() {
  /** @type {import('./windowPlacement.js').MonitorGeometry[]} */
  const list = [];
  try {
    for (const monitor of await availableMonitors()) {
      const geometry = toMonitorGeometry(monitor);
      if (geometry) list.push(geometry);
    }
  } catch (e) {
    console.warn('모니터 정보를 읽지 못했습니다:', e);
  }
  return list;
}

// 창이 어느 모니터에서도 제목줄을 잡을 수 없는 위치(화면 밖)라면 주 모니터 작업영역 가운데로 옮깁니다.
// 왜: 모니터를 빼거나 배율·배치가 바뀌면 저장된 좌표가 화면 밖을 가리켜, 창이 보이지 않았습니다.
/** @param {import('@tauri-apps/api/window').Window} win @param {import('./windowPlacement.js').MonitorGeometry[] | null} [monitors] */
export async function ensureWindowOnScreen(win, monitors = null) {
  try {
    // 최소화된 창의 좌표(-32000)는 위치가 아니므로 건드리지 않습니다.
    if (await win.isMinimized()) return false;
    const list = monitors && monitors.length > 0 ? monitors : await getMonitorGeometries();
    if (list.length === 0) return false;
    const position = await win.outerPosition();
    const size = await win.outerSize();
    const target = findVisiblePlacement(
      { x: position.x, y: position.y, width: size.width, height: size.height },
      list,
    );
    if (!target) return false;
    console.warn(`[${win.label}] 창이 화면 밖에 있어 주 모니터 가운데로 옮깁니다.`, {
      from: { x: position.x, y: position.y },
      to: target,
    });
    await win.setPosition(new PhysicalPosition(target.x, target.y));
    return true;
  } catch (e) {
    console.warn('창 위치를 확인하지 못했습니다:', e);
    return false;
  }
}
