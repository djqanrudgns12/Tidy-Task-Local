import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { appState } from './appState.svelte.js';
import { settingsSnapshotFor, settingsWindowSize } from './settings/settingsForm.js';
import { getMonitorGeometries } from './windows/windowRegistry.js';

// 설정 창을 열고(이미 있으면 앞으로 가져오고) 이 메모 창의 지금 설정을 보냅니다.
// 상단 메뉴의 [설정]과 우클릭 메뉴의 [설정]이 모두 이 함수 하나를 씁니다.
  export async function handleSettings() {
    const currentWin = getCurrentWindow();
    const existingWin = await WebviewWindow.getByLabel('settings');

    // ✨ [핵심 1] 내 창의 현재 설정 상태를 찰칵! 찍어서 보낼 준비를 합니다.
    const payload = {
      targetLabel: currentWin.label,
      settings: settingsSnapshotFor(appState)
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

      // 화면이 낮으면(작은 노트북·높은 배율) 아래 버튼이 화면 밖으로 나가지 않게 높이를 줄입니다.
      const monitors = await getMonitorGeometries();
      const size = settingsWindowSize(monitors.map((monitor) => monitor.work.height / monitor.scale));

      const settingsWindow = new WebviewWindow('settings', {
        url: 'index.html',
        title: '시스템 설정',
        width: size.width,
        height: size.height,
        resizable: false,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        visible: true
      });
    }
  }


