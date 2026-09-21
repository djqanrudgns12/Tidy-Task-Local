import { LazyStore } from '@tauri-apps/plugin-store';
import { native, readSettings, subscribeSettings } from './store.js';
import { toolkitColors } from './themes.js';

const DEFAULT_FONT = '메이플스토리 L';

/** @typedef {{theme?:string,darkMode?:boolean,uiFontFamily?:string}} Appearance */

/** @param {unknown} main */
const fontOf = (main) =>
  /** @type {{uiFontFamily?:string}|null|undefined} */ (main)?.uiFontFamily || DEFAULT_FONT;

/** @param {(value:Appearance)=>void} callback */
export async function watchAppearance(callback) {
  /** @type {{theme?:string,darkMode?:boolean}} */
  let current = {};
  let font = DEFAULT_FONT;
  let revision = -1;
  let published = '';
  // 왜 비교하는가: 툴바 위치 저장·메모 저장 같은 무관한 변경도 같은 이벤트로 모든 창에 퍼집니다.
  // 테마·다크 모드·글꼴이 그대로면 알리지 않아 창마다 스타일 문자열을 다시 계산하지 않게 합니다.
  const publish = () => {
    const key = `${current.theme}|${current.darkMode}|${font}`;
    if (key === published) return;
    published = key;
    callback({ theme: current.theme, darkMode: current.darkMode, uiFontFamily: font });
  };
  /** @param {import('./preferences.js').Settings} settings */
  const accept = (settings) => {
    if (settings.revision < revision) return;
    revision = settings.revision;
    current = { theme: settings.toolkit.theme, darkMode: settings.toolkit.darkMode };
    publish();
  };
  const off = await subscribeSettings(accept);
  let offFont = () => {};
  try {
    accept(await readSettings());
    if (native) {
      const store = new LazyStore('tidy-task-config.json');
      // 변경 이벤트가 새 값을 싣고 오므로 store.get()으로 main 전체(메모 본문 포함)를 다시 받지 않습니다.
      offFont = await store.onKeyChange('main', (main) => {
        font = fontOf(main);
        publish();
      });
      font = fontOf(await store.get('main'));
      publish();
    }
    return () => { off(); offFont(); };
  } catch (error) {
    off(); offFont();
    throw error;
  }
}
/** @param {Appearance} [value] */
export function appearanceStyle(value = {}) {
  const font = String(value.uiFontFamily || DEFAULT_FONT).replace(/[";{}<>\\]/g, '');
  const colors = toolkitColors(value.theme, value.darkMode);
  return Object.entries(colors).map(([key, color]) => `--tk-${key}:${color};`).join('')
    + `color-scheme:${value.darkMode ? 'dark' : 'light'};--tk-font:"${font}","Malgun Gothic",sans-serif;`;
}
