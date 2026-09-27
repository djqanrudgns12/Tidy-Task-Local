import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { primaryMonitor } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { LazyStore } from '@tauri-apps/plugin-store';
import { RELEASE_NEWS_KEY, STARTUP_PROFILE_KEY, classifyStartupProfile, shouldShowReleaseNews, runReleaseStartup } from './releaseNews.js';
import { openReleaseNews } from './releaseNewsWindow.js';
import { fitNoticeSize } from './toolkitRelease.js';
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
      : shouldShowReleaseNews(storedValue);
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

// appState.init() 전에 구분합니다. 신규 실행에서 생성한 main을 기존 데이터로 오인하지 않습니다.
export async function captureStartupProfile() {
  const store = new LazyStore('tidy-task-config.json');
  const [profile, main, todos] = await Promise.all([
    store.get(STARTUP_PROFILE_KEY), store.get('main'), store.get('todos'),
  ]);
  const kind = classifyStartupProfile(profile, main, todos);
  if (profile !== kind) { await store.set(STARTUP_PROFILE_KEY, kind); await store.save(); }
  return kind;
}

/** @param {'new'|'existing'|null} profile */
async function runStartup(profile) {
  const store = new LazyStore('tidy-task-config.json');
  const completed = await store.get(INITIAL_SETUP_STORE_KEY);
  const needsSetup = profile === 'new' && !isInitialSetupComplete(completed);
  await runReleaseStartup(needsSetup, {
    setup: () => showUntilClosed({ label: INITIAL_SETUP_WINDOW_LABEL, options: getInitialSetupWindowOptions }),
    launch: launchStartupFeatures,
    news: async () => {
      const hidden = await store.get(RELEASE_NEWS_KEY);
      if (shouldShowReleaseNews(hidden)) await openReleaseNews();
    },
  });
}

/** @param {'new'|'existing'|null} profile */
export function startStartupNotices(profile) {
  if (!startupPromise) startupPromise = runStartup(profile).catch(error => {
    console.warn('시작 안내를 열지 못했습니다:', error);
  });
  return startupPromise;
}
