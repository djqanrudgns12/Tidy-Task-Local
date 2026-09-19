import { LazyStore } from '@tauri-apps/plugin-store';
import { native } from './store.js';
/** @param {(value:{themeColor?:string,isDarkMode?:boolean,uiFontFamily?:string})=>void} callback */
export async function watchAppearance(callback) {
  if (!native) {
    const q = new URLSearchParams(location.search);
    callback({
      themeColor: q.get('theme') || 'amber',
      isDarkMode: q.has('dark'),
      uiFontFamily: '메이플스토리 L',
    });
    return () => {};
  }
  const store = new LazyStore('tidy-task-config.json');
  const refresh = async () => callback((await store.get('main')) || {});
  const off = await store.onKeyChange('main', refresh);
  await refresh();
  return off;
}
/** @param {{themeColor?:string,isDarkMode?:boolean,uiFontFamily?:string}} [value] */
export function appearanceStyle(value = {}) {
  const font = String(value.uiFontFamily || '메이플스토리 L').replace(/[";{}<>]/g, '');
  return `--tk-bg:#f7f8f2;--tk-panel:#ffffff;--tk-soft:#e9f3ed;--tk-line:#e1e7df;--tk-accent:#287768;--tk-ink:#253b40;--tk-muted:#61736f;--tk-gold:#ffcf73;--tk-peach:#ffd1bb;--tk-font:"${font}","Malgun Gothic",sans-serif;`;
}
