import { LazyStore } from '@tauri-apps/plugin-store';
import { native, readSettings, subscribeSettings } from './store.js';
import { toolkitColors } from './themes.js';
import { DEFAULT_UI_FONT } from './preferences.js';
import { registerFontFace } from '../fonts.js';
import { BUILTIN_FONTS } from '../builtinFonts.js';

/** @typedef {{theme?:string,darkMode?:boolean,uiFontFamily?:string,fontsReady?:number}} Appearance */
/** @typedef {{name:string,path:string}} CustomFont */

/** Tidy Task 저장소의 customFonts 값을 안전한 목록으로 바꿉니다(읽기만 합니다).
 * @param {unknown} value @returns {CustomFont[]} */
export function customFontsOf(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((font) => typeof font?.name === 'string' && font.name && typeof font?.path === 'string' && font.path)
    .map((font) => ({ name: font.name, path: font.path }));
}

/** 툴킷 설정의 글꼴 고르기 목록: Tidy Task와 같은 내장 글꼴 + Tidy Task에서 등록한 글꼴.
 * @param {CustomFont[]} custom */
export function uiFontChoices(custom) {
  const builtin = BUILTIN_FONTS.map((font) => ({ name: font.name, custom: false }));
  const names = new Set(builtin.map((font) => font.name));
  return [...builtin, ...custom.filter((font) => !names.has(font.name)).map((font) => ({ name: font.name, custom: true }))];
}

/** Tidy Task에서 등록한 글꼴 목록을 지켜봅니다. 툴킷은 이 목록을 읽기만 하고 절대 쓰지 않습니다.
 * @param {(fonts:CustomFont[])=>void} callback */
export async function watchCustomFonts(callback) {
  if (!native) {
    callback([]);
    return () => {};
  }
  const store = new LazyStore('tidy-task-config.json');
  const off = await store.onKeyChange('customFonts', (value) => callback(customFontsOf(value)));
  try {
    callback(customFontsOf(await store.get('customFonts')));
    return off;
  } catch (error) {
    off();
    throw error;
  }
}

/** @param {(value:Appearance)=>void} callback */
export async function watchAppearance(callback) {
  /** @type {{theme?:string,darkMode?:boolean,uiFontFamily?:string}} */
  let current = {};
  /** @type {CustomFont[]} */
  let customFonts = [];
  // 등록 글꼴 파일을 이 창에 불러올 때마다 늘립니다. 값이 바뀌면 타이머 숫자 크기를 새 글꼴로 다시 잽니다.
  let fontsReady = 0;
  let revision = -1;
  let published = '';
  let disposed = false;
  // 왜 비교하는가: 툴바 위치 저장 같은 무관한 변경도 같은 이벤트로 모든 창에 퍼집니다.
  // 테마·다크 모드·글꼴이 그대로면 알리지 않아 창마다 스타일 문자열을 다시 계산하지 않게 합니다.
  const publish = () => {
    const key = `${current.theme}|${current.darkMode}|${current.uiFontFamily}|${fontsReady}`;
    if (disposed || key === published) return;
    published = key;
    callback({ ...current, fontsReady });
  };
  // 고른 글꼴이 Tidy Task에서 등록한 글꼴이면 이 창(웹뷰)에도 파일을 불러와야 보입니다. 창마다 문서가 따로이기 때문입니다.
  const loadChosenFont = () => {
    const font = customFonts.find((item) => item.name === current.uiFontFamily);
    if (!font) return;
    void registerFontFace(font.name, font.path).then((ok) => {
      if (!ok || current.uiFontFamily !== font.name) return;
      fontsReady++;
      publish();
    });
  };
  /** @param {import('./preferences.js').Settings} settings */
  const accept = (settings) => {
    if (settings.revision < revision) return;
    revision = settings.revision;
    const fontChanged = settings.toolkit.uiFontFamily !== current.uiFontFamily;
    current = { theme: settings.toolkit.theme, darkMode: settings.toolkit.darkMode, uiFontFamily: settings.toolkit.uiFontFamily };
    publish();
    if (fontChanged) loadChosenFont();
  };
  const off = await subscribeSettings(accept);
  let offFonts = () => {};
  const dispose = () => { disposed = true; off(); offFonts(); };
  try {
    accept(await readSettings());
    // 등록 글꼴 목록을 읽지 못해도 테마·내장 글꼴은 그대로 쓸 수 있어야 하므로 실패를 삼킵니다.
    offFonts = await watchCustomFonts((fonts) => {
      customFonts = fonts;
      loadChosenFont();
    }).catch(() => () => {});
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
/** 툴킷 창이 쓰는 글꼴 목록(--tk-font 값). 숫자 크기 측정(fontMetrics.js)도 같은 목록으로 재야 화면과 맞습니다.
 * 고른 글꼴이 없거나(지워진 등록 글꼴) 불러오지 못하면 맑은 고딕으로 대신 그립니다.
 * @param {Appearance} [value] */
export function uiFontStack(value = {}) {
  const font = String(value.uiFontFamily || DEFAULT_UI_FONT).replace(/[";{}<>\\]/g, '');
  return `"${font}","Malgun Gothic",sans-serif`;
}
/** @param {Appearance} [value] */
export function appearanceStyle(value = {}) {
  const colors = toolkitColors(value.theme, value.darkMode);
  return Object.entries(colors).map(([key, color]) => `--tk-${key}:${color};`).join('')
    + `color-scheme:${value.darkMode ? 'dark' : 'light'};--tk-font:${uiFontStack(value)};`;
}
