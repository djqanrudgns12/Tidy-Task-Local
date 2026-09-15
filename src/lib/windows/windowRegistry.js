// Tauri 창 API를 부르는 얇은 도우미입니다. (순수 규칙은 windowSlots.js / managerElection.js)
import { WebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';

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
