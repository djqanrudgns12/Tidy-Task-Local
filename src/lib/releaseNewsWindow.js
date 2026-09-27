import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor, primaryMonitor } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { getReleaseNewsOptions, RELEASE_NEWS_LABEL } from './releaseNews.js';

/** @type {Promise<void>|null} */
let opening = null;
/** 사용자 직접 열기는 숨김 기록을 바꾸거나 검사하지 않습니다. 연속 클릭도 하나로 합칩니다. */
export function openReleaseNews() {
  if (!opening) opening = showReleaseNews().finally(() => { opening = null; });
  return opening;
}

async function showReleaseNews() {
  const existing = await WebviewWindow.getByLabel(RELEASE_NEWS_LABEL);
  if (existing) {
    await existing.unminimize(); await existing.show(); await existing.setFocus();
    return;
  }
  const monitor = await currentMonitor().catch(() => null)
    ?? await primaryMonitor().catch(() => null);
  const options = getReleaseNewsOptions(monitor?.workArea ?? null, monitor?.scaleFactor);
  const win = new WebviewWindow(RELEASE_NEWS_LABEL, options);
  await new Promise((resolve, reject) => {
    /** @type {Array<()=>void>} */ const offs = [];
    let settled = false;
    /** @param {unknown} [error] */
    const finish = (error) => { if (settled) return; settled = true; offs.forEach(off => off()); error ? reject(error) : resolve(undefined); };
    /** @param {Promise<()=>void>} p */
    const track = (p) => p.then(off => settled ? off() : offs.push(off)).catch(finish);
    track(win.once('tauri://error', e => finish(new Error(String(e.payload)))));
    track(win.once('tauri://created', async () => {
      try {
        if (monitor?.workArea) {
          const a = monitor.workArea, s = monitor.scaleFactor || 1;
          await win.setPosition(new PhysicalPosition(Math.round(a.position.x + (a.size.width - options.width * s) / 2), Math.round(a.position.y + (a.size.height - options.height * s) / 2)));
        }
        await win.show(); await win.setFocus(); finish();
      } catch (e) { finish(e); }
    }));
  });
}
