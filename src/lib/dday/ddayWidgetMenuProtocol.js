// ═══════════════════════════════════════════════════════════════════
// [D-Day 위젯 설정 팝업 ↔ D-Day 위젯 약속]
//
// 권위 호스트 프로토콜 (Authoritative Host Protocol):
//   · `dday-widget-menu` 창은 UI 표시와 사용자 입력 전달만 맡고, `tidy-task-dday.json`을 직접 쓰지 않습니다.
//   · 모든 설정 변경(`select-skin`, `set-appearance`, `set-scope`, `toggle-hidden`, `toggle-top`,
//     `toggle-stay`, `enable-startup`, `center`, `open-control`)은 `action` IPC로 호스트(`dday`)에 보냅니다.
//   · 호스트 창(`dday`)이 단일 직렬 큐(`widgetSection`)로 저장·검증한 뒤 최신 스냅샷을 `sync`로 되돌려줍니다.
// ═══════════════════════════════════════════════════════════════════

import { pickMonitorForRect } from '../windows/popupPlacement.js';
import { resolveMenuWidth } from '../windows/contextMenuLayout.js';
import {
  DDAY_APPEARANCE_MODES,
  DDAY_SKINS,
  DDAY_TONES,
  normalizeDdayWidgetPrefs,
  stripHtmlToTitle,
} from './ddayModel.js';

export const DDAY_WIDGET_MENU_LABEL = 'dday-widget-menu';

export const DDAY_WIDGET_MENU_EVENTS = Object.freeze({
  open: 'dday-widget-menu:open',
  sync: 'dday-widget-menu:sync',
  reposition: 'dday-widget-menu:reposition',
  close: 'dday-widget-menu:close',
  ping: 'dday-widget-menu:ping',
  ready: 'dday-widget-menu:ready',
  opened: 'dday-widget-menu:opened',
  closed: 'dday-widget-menu:closed',
  action: 'dday-widget-menu:action',
  raise: 'dday-widget-menu:raise',
});

export const DDAY_WIDGET_MENU_ACTIONS = Object.freeze([
  'select-skin',
  'set-appearance',
  'set-scope',
  'toggle-hidden',
  'toggle-top',
  'toggle-stay',
  'enable-startup',
  'center',
  'open-control',
]);

export const DDAY_WIDGET_MENU_CLOSE_REASONS = Object.freeze([
  'escape',
  'close-btn',
  'blur',
  'outside',
  'toggle',
  'superseded',
  'requester',
  'action',
  'widget-moved',
  'widget-resized',
  'widget-closed',
  'error',
]);

/** @param {string} reason */
export const returnsFocusToWidget = (reason) => reason === 'escape' || reason === 'close-btn';

export const DEFAULT_MENU_GAP = 8;
export const DEFAULT_MENU_EDGE = 8;
export const MAX_MENU_HEIGHT = 540;

export const DDAY_WIDGET_MENU_WINDOW_OPTIONS = Object.freeze({
  url: 'index.html',
  title: 'D-Day 위젯 설정',
  width: 268,
  height: 460,
  decorations: false,
  transparent: true,
  shadow: false,
  resizable: false,
  maximizable: false,
  minimizable: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  visible: false,
  focus: false,
});

/** @param {unknown} v @returns {v is number} */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {unknown} v @param {number} max */
const shortText = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/** @param {unknown} v */
const isHexColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** @param {unknown} v */
const cssFontFamily = (v) => {
  const text = shortText(v, 300);
  return text && !/[;{}<>\\]/.test(text) ? text : null;
};

/**
 * `--dw-*` CSS 변수 선언 문자열만 허용하고 외부 URL/괄호/중괄호 주입을 차단합니다.
 * @param {unknown} v
 * @returns {string}
 */
export function sanitizeThemeStyle(v) {
  if (typeof v !== 'string' || !v.trim() || v.length > 4096) return '';
  if (/[{}<>\\]/.test(v)) return '';
  const safeParts = [];
  for (const decl of v.split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    if (/^--dw-[a-z0-9-]+:\s*(?:rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[0-9.]+)?\s*\)|#[0-9a-f]{3,8})$/i.test(trimmed)) {
      safeParts.push(trimmed);
    }
  }
  return safeParts.join(';');
}

/** @param {number} value @param {number} min @param {number} max */
function clampInto(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {unknown} raw
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
function normalizeAnchorRect(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const a = /** @type {any} */ (raw);
  if (![a.x, a.y, a.width, a.height].every(isFiniteNumber)) return null;
  if (a.width <= 0 || a.height <= 0) return null;
  return {
    x: Math.round(a.x),
    y: Math.round(a.y),
    width: Math.round(a.width),
    height: Math.round(a.height),
  };
}

/**
 * D-Day 위젯 설정 팝업의 물리 위치·크기를 계산합니다.
 * 위젯 본체를 가리지 않고 스킨·배경 미리보기를 옆에서 볼 수 있도록 `right → left → below → above → overlay` 순서를 씁니다.
 * @param {{
 *   anchor: { x: number, y: number, width: number, height: number },
 *   size: { width: number, height: number },
 *   monitors: import('../windows/windowPlacement.js').MonitorGeometry[],
 *   gap?: number,
 *   edge?: number,
 *   fallbackScale?: number,
 * }} input
 * @returns {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   scale: number,
 *   side: 'right' | 'left' | 'below' | 'above' | 'overlay',
 *   maxLogicalHeight: number,
 * }}
 */
export function placeDdayWidgetMenu({
  anchor,
  size,
  monitors,
  gap = DEFAULT_MENU_GAP,
  edge = DEFAULT_MENU_EDGE,
  fallbackScale = 1,
}) {
  const monitor = pickMonitorForRect(anchor, monitors);
  const scale = monitor && monitor.scale > 0
    ? monitor.scale
    : isFiniteNumber(fallbackScale) && fallbackScale > 0
      ? fallbackScale
      : 1;

  const width = Math.max(1, Math.ceil(size.width * scale));
  const height = Math.max(1, Math.ceil(size.height * scale));
  const g = Math.round(gap * scale);

  const availLogicalH = monitor
    ? Math.floor(monitor.work.height / scale - edge * 2)
    : MAX_MENU_HEIGHT;
  const maxLogicalHeight = Math.min(MAX_MENU_HEIGHT, Math.max(220, availLogicalH));

  /** @type {'right' | 'left' | 'below' | 'above' | 'overlay'} */
  let side = 'right';
  let x = anchor.x + anchor.width + g;
  let y = anchor.y;

  if (monitor) {
    const inset = Math.round(edge * scale);
    const work = monitor.work;
    const area = work.width > inset * 2 && work.height > inset * 2
      ? { x: work.x + inset, y: work.y + inset, width: work.width - inset * 2, height: work.height - inset * 2 }
      : work;
    const areaRight = area.x + area.width;
    const areaBottom = area.y + area.height;
    const anchorRight = anchor.x + anchor.width;
    const anchorBottom = anchor.y + anchor.height;

    const fits = {
      right: anchorRight + g + width <= areaRight,
      left: anchor.x - g - width >= area.x,
      below: anchorBottom + g + height <= areaBottom,
      above: anchor.y - g - height >= area.y,
    };

    if (fits.right) {
      side = 'right';
      x = anchorRight + g;
      y = clampInto(anchor.y, area.y, areaBottom - height);
    } else if (fits.left) {
      side = 'left';
      x = anchor.x - g - width;
      y = clampInto(anchor.y, area.y, areaBottom - height);
    } else if (fits.below) {
      side = 'below';
      x = clampInto(anchor.x, area.x, areaRight - width);
      y = anchorBottom + g;
    } else if (fits.above) {
      side = 'above';
      x = clampInto(anchor.x, area.x, areaRight - width);
      y = anchor.y - g - height;
    } else {
      side = 'overlay';
      x = clampInto(anchor.x, area.x, areaRight - width);
      y = clampInto(anchor.y, area.y, areaBottom - height);
    }
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
    scale,
    side,
    maxLogicalHeight,
  };
}

/**
 * @typedef {{
 *   prefs: import('./ddayModel.js').DdayWidgetPrefs,
 *   effectiveSkin: 'w1' | 'w4',
 *   effectiveDark: boolean,
 *   startupEnabled: boolean,
 *   startupBusy: boolean,
 *   pinBusy: boolean,
 *   themeStyle: string,
 *   accentHex: string,
 *   fontFamily: string,
 *   uiFontSize: number,
 *   menuWidth: number,
 *   windows: { label: string, title: string }[],
 *   entries: { key: string, title: string, tone: import('./ddayModel.js').DdayToneId, checked: boolean, counterLabel: string, windowTitle: string }[],
 * }} DdayWidgetMenuState
 */

/**
 * @param {unknown} raw
 * @returns {DdayWidgetMenuState | null}
 */
export function normalizeMenuState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {any} */ (raw);
  const prefs = normalizeDdayWidgetPrefs(r.prefs);
  const effectiveSkin = DDAY_SKINS.includes(r.effectiveSkin) ? r.effectiveSkin : prefs.skin;
  const rawFontPt = Number(r.uiFontSize);
  const uiFontSize = Number.isFinite(rawFontPt) && rawFontPt >= 6 && rawFontPt <= 32 ? rawFontPt : 10;
  const rawWidth = Number(r.menuWidth);
  const menuWidth = Number.isFinite(rawWidth) && rawWidth >= 220 && rawWidth <= 360
    ? Math.round(rawWidth)
    : resolveMenuWidth('dw-menu', uiFontSize);

  const windows = Array.isArray(r.windows)
    ? r.windows
        .map((/** @type {any} */ w) => {
          const label = shortText(w?.label, 80);
          if (!label) return null;
          return {
            label,
            title: stripHtmlToTitle(w?.title, 20) || (label === 'main' ? '기본 할 일' : label),
          };
        })
        .filter((/** @type {any} */ v) => v !== null)
    : [];

  const entries = Array.isArray(r.entries)
    ? r.entries
        .map((/** @type {any} */ e) => {
          const key = shortText(e?.key, 120);
          if (!key) return null;
          const tone = DDAY_TONES.includes(e?.tone) ? e.tone : 'accent';
          return {
            key,
            title: stripHtmlToTitle(e?.title, 30) || 'D-Day',
            tone,
            checked: e?.checked !== false,
            counterLabel: shortText(e?.counterLabel, 24) || '',
            windowTitle: stripHtmlToTitle(e?.windowTitle, 18) || '',
          };
        })
        .filter((/** @type {any} */ v) => v !== null)
    : [];

  return {
    prefs,
    effectiveSkin,
    effectiveDark: r.effectiveDark === true,
    startupEnabled: r.startupEnabled !== false,
    startupBusy: r.startupBusy === true,
    pinBusy: r.pinBusy === true,
    themeStyle: sanitizeThemeStyle(r.themeStyle),
    accentHex: isHexColor(r.accentHex) ? r.accentHex : '#d97706',
    fontFamily: cssFontFamily(r.fontFamily) || '"Gulim", sans-serif',
    uiFontSize,
    menuWidth,
    windows,
    entries,
  };
}

/** @param {unknown} payload */
export function normalizeOpenPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {any} */ (payload);
  const requestId = shortText(p.requestId, 120);
  const requester = shortText(p.requester, 80);
  const anchor = normalizeAnchorRect(p.anchor);
  const state = normalizeMenuState(p.state);
  if (!requestId || !requester || !anchor || !state) return null;
  return {
    requestId,
    requester,
    anchor,
    viaKeyboard: p.viaKeyboard === true,
    state,
  };
}

/** @param {unknown} payload */
export function normalizeSyncPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {any} */ (payload);
  const requestId = p.requestId === undefined ? null : shortText(p.requestId, 120);
  if (p.requestId !== undefined && !requestId) return null;
  const state = normalizeMenuState(p.state);
  if (!state) return null;
  const anchor = p.anchor ? normalizeAnchorRect(p.anchor) : null;
  return { requestId, state, anchor };
}

/** @param {unknown} payload */
export function normalizeActionPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {any} */ (payload);
  const requestId = shortText(p.requestId, 120);
  const action = DDAY_WIDGET_MENU_ACTIONS.includes(p.action) ? p.action : null;
  if (!requestId || !action) return null;
  const raw = p.payload && typeof p.payload === 'object' ? p.payload : {};

  switch (action) {
    case 'select-skin': {
      if (!DDAY_SKINS.includes(raw.skin)) return null;
      return { requestId, action, payload: { skin: raw.skin } };
    }
    case 'set-appearance': {
      if (!DDAY_APPEARANCE_MODES.includes(raw.appearanceMode)) return null;
      return { requestId, action, payload: { appearanceMode: raw.appearanceMode } };
    }
    case 'set-scope': {
      const displayScope = shortText(typeof raw.displayScope === 'string' ? raw.displayScope.trim() : '', 80);
      if (!displayScope) return null;
      return { requestId, action, payload: { displayScope } };
    }
    case 'toggle-hidden': {
      const entryKey = shortText(raw.entryKey, 120);
      if (!entryKey) return null;
      return { requestId, action, payload: { entryKey } };
    }
    default:
      return { requestId, action, payload: {} };
  }
}

/** @param {unknown} payload */
export function normalizeClosedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {any} */ (payload);
  const requestId = shortText(p.requestId, 120);
  const reason = DDAY_WIDGET_MENU_CLOSE_REASONS.includes(p.reason) ? p.reason : null;
  if (!requestId || !reason) return null;
  return { requestId, reason };
}
