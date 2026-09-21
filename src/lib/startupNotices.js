import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { primaryMonitor } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { LazyStore } from '@tauri-apps/plugin-store';
import { UPDATE_NOTICE_STORE_KEY, UPDATE_NOTICE_WINDOW_LABEL, getWelcomeWindowOptions, getUpdateNoticeWindowOptions, shouldShowUpdateNotice } from './updateNotice.js';
import { TOOLKIT_RELEASE_LABEL, TOOLKIT_RELEASE_STORE_KEY, getToolkitReleaseOptions, runNoticeQueue, fitNoticeSize } from './toolkitRelease.js';
import {
  INITIAL_SETUP_STORE_KEY,
  INITIAL_SETUP_WINDOW_LABEL,
  getInitialSetupWindowOptions,
  isInitialSetupComplete,
} from './initialSetup.js';
import { launchMealOnce } from './meal/mealWindows.js';
import { readSettings as readToolkitSettings } from './toolkit/store.js';
import { openTool } from './toolkit/windows.js';

/** @type {Promise<void> | null} */
let startupPromise = null;

/** @typedef {{label:string,key?:string,shouldShow?:(value:unknown)=>boolean,options:()=>any}} NoticeEntry */
/** @param {NoticeEntry} entry */
async function showUntilClosed(entry) {
  const store = new LazyStore('tidy-task-config.json');
  if (entry.key) {
    let storedValue;
    try { storedValue = await store.get(entry.key); } catch { /* 읽기 실패 시 안내를 보여 줍니다. */ }
    const shouldShow = entry.shouldShow
      ? entry.shouldShow(storedValue)
      : shouldShowUpdateNotice(storedValue);
    if (!shouldShow) return false;
  }
  const monitor = await primaryMonitor().catch(() => null);
  const options = fitNoticeSize(entry.options(), monitor?.workArea, monitor?.scaleFactor);
  const existing = await WebviewWindow.getByLabel(entry.label);
  const win = existing ?? new WebviewWindow(entry.label, { ...options, visible: false });
  await new Promise((resolve, reject) => {
    /** @type {Array<()=>void>} */
    const offs = [];
    let settled = false;
    /** @param {unknown} [error] */
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      offs.forEach(off => off());
      if (error) reject(error); else resolve(undefined);
    };
    /** @param {Promise<()=>void>} subscription */
    const track = (subscription) => subscription.then(off => settled ? off() : offs.push(off)).catch(finish);
    const show = async () => {
      try {
        if (monitor?.workArea) {
          const area = monitor.workArea, scale = monitor.scaleFactor || 1;
          await win.setPosition(new PhysicalPosition(
            Math.round(area.position.x + (area.size.width - options.width * scale) / 2),
            Math.round(area.position.y + (area.size.height - options.height * scale) / 2),
          ));
        }
        await win.show();
        await win.setFocus();
      } catch (error) { finish(error); }
    };
    track(win.once('tauri://destroyed', () => finish()));
    track(win.once('tauri://error', e => finish(new Error(String(e.payload)))));
    if (existing) void show();
    else track(win.once('tauri://created', show));
  });
  return true;
}

async function launchStartupFeatures() {
  const results = await Promise.allSettled([
    launchMealOnce(),
    (async () => {
      const settings = await readToolkitSettings();
      if (settings.toolkit.enabled) await openTool('toolkit');
    })(),
  ]);
  if (results[0].status === 'rejected') console.warn('급식창을 자동으로 열지 못했습니다.');
  if (results[1].status === 'rejected') console.warn('Tidy 툴킷을 자동으로 열지 못했습니다.');
}

/** @param {boolean} showWelcome */
async function runStartup(showWelcome) {
  try {
    await showUntilClosed({
      label: INITIAL_SETUP_WINDOW_LABEL,
      key: INITIAL_SETUP_STORE_KEY,
      shouldShow: (value) => !isInitialSetupComplete(value),
      options: getInitialSetupWindowOptions,
    });
  } catch (error) {
    // 창 생성 실패가 기존 사용자의 저장된 자동 실행까지 막지 않게 합니다.
    console.warn('처음 설정 창을 열지 못했습니다:', error);
  }

  // 급식과 툴킷은 최초 선택이 끝난 뒤에만 자동 실행합니다.
  await launchStartupFeatures();

  const entries = [
    ...(showWelcome ? [{ label: 'welcome', options: getWelcomeWindowOptions }] : []),
    { label: TOOLKIT_RELEASE_LABEL, key: TOOLKIT_RELEASE_STORE_KEY, options: getToolkitReleaseOptions },
    { label: UPDATE_NOTICE_WINDOW_LABEL, key: UPDATE_NOTICE_STORE_KEY, options: getUpdateNoticeWindowOptions },
  ];
  // 실패한 창의 상태를 알 수 없을 때 다음 공지를 겹쳐 열지 않습니다.
  try { await runNoticeQueue(entries, showUntilClosed); }
  catch (error) { console.warn('시작 안내를 열지 못했습니다:', error); }
}

/** @param {boolean} showWelcome */
export function startStartupNotices(showWelcome) {
  // 메인 창 초기화가 중복되어도 시작 절차와 표시 횟수는 한 번으로 합칩니다.
  if (!startupPromise) startupPromise = runStartup(showWelcome);
  return startupPromise;
}
