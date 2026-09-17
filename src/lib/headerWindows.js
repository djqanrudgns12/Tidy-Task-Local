import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { appState } from './appState.svelte.js';
  export async function handleSettings() {
    const currentWin = getCurrentWindow();
    const existingWin = await WebviewWindow.getByLabel('settings');

    // ✨ [핵심 1] 내 창의 현재 설정 상태를 찰칵! 찍어서 보낼 준비를 합니다.
    const payload = {
      targetLabel: currentWin.label,
      settings: { ...appState.takeSnapshot(), headerDesign: appState.headerDesign }
    };

    if (existingWin) {
      try {
        await existingWin.show();
        await existingWin.unminimize();
        await existingWin.setFocus();
        
        // ✨ 이미 열려있을 땐 혹시 모르니 아주 살짝(0.05초) 기다렸다가 쏴줍니다.
        setTimeout(() => {
          emitTo('settings', 'set-settings-target', payload);
        }, 50);
      } catch(e) {
        console.error("기존 창 표시 실패:", e);
      }
    } else {
      // ✨ [핵심 2] 설정창이 "나 준비됐어!(settings-ready)"라고 외치면 그때 데이터를 쏴줍니다.
      const unlisten = await listen('settings-ready', async () => {
        await emitTo('settings', 'set-settings-target', payload);
        unlisten(); // 한 번 쏘고 나면 수신기 끄기
      });

      const settingsWindow = new WebviewWindow('settings', {
        url: 'index.html', 
        title: '시스템 설정',
        width: 320,
        height: 500,
        resizable: false,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        visible: true
      });
    }
  }


