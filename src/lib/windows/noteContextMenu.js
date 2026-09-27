import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import { waitForMenuReady } from './noteContextMenuReady.js';

// 첫 우클릭도 웹뷰 로딩과 이벤트 등록을 기다린 뒤 전달합니다.
/** @type {Promise<void>|null} */ let opening = null;
let requestRevision = 0;
async function ensureMenu() {
  if (await WebviewWindow.getByLabel('ctx-menu')) return;
  const menu = new WebviewWindow('ctx-menu', {
    url: 'index.html', title: 'Tidy Task 메뉴', width: 340, height: 600,
    decorations: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, visible: false, resizable: false, shadow: false,
  });
  // 다른 노트가 동시에 생성했다면 준비 핸드셰이크가 그 창을 사용합니다.
  void menu.once('tauri://error', event => console.warn('[ContextMenu] 창 생성:', event.payload));
}

/** @param {string} requester */
async function prepareMenu(requester) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await ensureMenu();
    try {
      const token = crypto.randomUUID();
      await waitForMenuReady({
        token,
        subscribe: handler => getCurrentWindow().listen('ctx-menu-ready', event => handler(event.payload)),
        ping: () => emitTo('ctx-menu', 'ctx-menu-ping', { requester, token }),
      });
      return;
    } catch (error) {
      if (attempt) throw error;
      // 예전 코드로 열린 채 남아 있거나 로딩에 실패한 보조 메뉴만 재생성합니다.
      const stale = await WebviewWindow.getByLabel('ctx-menu');
      if (stale) await stale.destroy();
    }
  }
}

/** @param {{requester:string, [key:string]:unknown}} payload */
export async function showNoteContextMenu(payload) {
  const revision = ++requestRevision;
  if (!opening) opening = prepareMenu(payload.requester).finally(() => { opening = null; });
  await opening;
  // 빠르게 여러 곳을 우클릭했으면 마지막 요청만 표시합니다.
  if (revision === requestRevision) await emitTo('ctx-menu', 'show-ctx-menu', payload);
}
