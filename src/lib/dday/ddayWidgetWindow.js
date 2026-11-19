// D-Day 바탕화면 위젯 창(`dday`)의 단일 열기·닫기·ON/OFF 토글·실시간 상태 구독 모듈
// 왜 한곳으로 모으는가:
//   우클릭 메뉴(DdayBannerContextView · ContextMenu todo), 상단 메뉴 팝오버(DdayWidgetToggle),
//   D-Day 컨트롤 타워(DdayControlModal)가 각자 openTool을 부르던 구조에서 역할명 오타('dday-widget')와
//   ON/OFF 상태 불일치가 발생했습니다. 모든 호출처가 같은 규칙(안전 저장 닫기, 연타 잠금, 상태 방송)을 따르게 합니다.

import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { openTool } from '../toolkit/windows.js';
import { getMonitorGeometries } from '../windows/windowRegistry.js';
import { DDAY_WIDGET_BOUNDS } from './ddayModel.js';
import { computeWidgetSidePlacement } from './ddayWindowBounds.js';

/** Rust toolkit.rs::TOOL_ROLES에 등록된 D-Day 위젯 창의 공식 라벨/역할명 */
export const DDAY_WIDGET_LABEL = 'dday';

/** D-Day 위젯 창 열림/닫힘 방송 이벤트 (급식창 meal-window-state와 동일 규약) */
export const DDAY_WIDGET_STATE_EVENT = 'dday-widget-window-state';

const PREVIEW_STATE_EVENT = 'tidy-dday-widget-preview-state';

/**
 * @typedef {{
 *   preferSideOfCurrentWindow?: boolean,
 *   hasSavedGeometry?: boolean,
 * }} OpenDdayWidgetOptions
 *
 * @typedef {{
 *   open: boolean,
 *   ok: boolean,
 *   changed: boolean,
 * }} ToggleDdayWidgetResult
 */

/**
 * 테스트·네이티브 공용 D-Day 위젯 창 컨트롤러를 생성합니다.
 * @param {{
 *   isNative?: () => boolean,
 *   getByLabel?: (label: string) => Promise<any>,
 *   openRole?: (role: string) => Promise<unknown>,
 *   getCurrentWin?: () => any,
 *   getMonitors?: () => Promise<any[]>,
 *   listenEvent?: (event: string, cb: (ev: { payload: unknown }) => void) => Promise<() => void>,
 *   createPosition?: (x: number, y: number) => any,
 *   addWindowListener?: (type: string, cb: (ev: any) => void) => () => void,
 *   dispatchPreviewEvent?: (open: boolean) => void,
 * }} [deps]
 */
export function createDdayWidgetController(deps = {}) {
  const isNative = deps.isNative ?? (() => isTauri());
  const getByLabel = deps.getByLabel ?? ((label) => WebviewWindow.getByLabel(label));
  const openRole = deps.openRole ?? ((role) => openTool(role));
  const getCurrentWin = deps.getCurrentWin ?? (() => getCurrentWindow());
  const getMonitors = deps.getMonitors ?? (() => getMonitorGeometries());
  const listenEvent = deps.listenEvent ?? ((event, cb) => listen(event, cb));
  const createPosition = deps.createPosition ?? ((x, y) => new PhysicalPosition(x, y));
  const addWindowListener =
    deps.addWindowListener ??
    ((type, cb) => {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener(type, cb);
      return () => window.removeEventListener(type, cb);
    });
  const dispatchPreviewEvent =
    deps.dispatchPreviewEvent ??
    ((open) => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent(PREVIEW_STATE_EVENT, { detail: open }));
    });

  let previewOpen = false;
  /** @type {Promise<ToggleDdayWidgetResult> | null} */
  let pendingToggle = null;

  /** @returns {Promise<boolean>} */
  async function isDdayWidgetOpen() {
    if (!isNative()) return previewOpen;
    const win = await getByLabel(DDAY_WIDGET_LABEL).catch(() => null);
    return Boolean(win);
  }

  /**
   * 위젯을 띄우거나 이미 열려 있으면 앞으로 가져옵니다.
   * widgetPrefs.autoOpen("Tidy Task와 함께 열기") 설정은 건드리지 않습니다.
   * @param {OpenDdayWidgetOptions} [opts]
   * @returns {Promise<boolean>}
   */
  async function openDdayWidget(opts = {}) {
    if (!isNative()) {
      previewOpen = true;
      dispatchPreviewEvent(true);
      return true;
    }

    const existing = await getByLabel(DDAY_WIDGET_LABEL).catch(() => null);
    await openRole(DDAY_WIDGET_LABEL);
    const win = existing || (await getByLabel(DDAY_WIDGET_LABEL).catch(() => null));
    if (!win) return false;

    // 처음 띄울 때 호출 창(특히 항상 위인 컨트롤 타워) 뒤에 가리지 않도록 옆자리에 놓습니다.
    if (!existing && opts.preferSideOfCurrentWindow && !opts.hasSavedGeometry) {
      try {
        const anchorWin = getCurrentWin();
        const [cPos, cSize, scale, monitors] = await Promise.all([
          anchorWin.outerPosition(),
          anchorWin.outerSize(),
          anchorWin.scaleFactor(),
          getMonitors(),
        ]);
        const safeScale = Number(scale) || 1;
        const side = computeWidgetSidePlacement({
          controlPos: { x: cPos.x, y: cPos.y },
          controlSize: { width: cSize.width, height: cSize.height },
          widgetSize: {
            width: Math.round(DDAY_WIDGET_BOUNDS.defaultWidth * safeScale),
            height: Math.round(DDAY_WIDGET_BOUNDS.defaultHeight * safeScale),
          },
          monitors,
        });
        if (side) {
          await win.setPosition(createPosition(side.x, side.y)).catch(() => {});
        }
      } catch {
        // 옆자리 배치는 보조 동작이므로 실패해도 위젯 표시를 막지 않습니다.
      }
    }

    await win.unminimize?.().catch(() => {});
    await win.show?.().catch(() => {});
    await win.setFocus?.().catch(() => {});
    return true;
  }

  /**
   * 열려 있는 D-Day 위젯 창을 안전하게 닫습니다.
   * 왜 destroy()가 아니라 close()를 부르는가:
   *   DdayWidget.svelte의 onCloseRequested 처리기가 독립 설정 팝업 정리·위치/크기 저장·
   *   저장 큐 완료(settle)·상태 방송(false)을 끝낸 뒤 스스로 닫히게 하기 위함입니다.
   * @returns {Promise<boolean>} 실제로 닫기 요청을 보냈으면 true
   */
  async function closeDdayWidget() {
    if (!isNative()) {
      const wasOpen = previewOpen;
      previewOpen = false;
      dispatchPreviewEvent(false);
      return wasOpen;
    }

    const existing = await getByLabel(DDAY_WIDGET_LABEL).catch(() => null);
    if (!existing) return false;
    await existing.close();
    return true;
  }

  /**
   * D-Day 위젯 창을 ON/OFF 전환합니다.
   * 연타 경합을 막기 위해 진행 중인 전환 Promise를 공유해 중복 생성/닫기를 차단합니다.
   * @param {OpenDdayWidgetOptions} [opts]
   * @returns {Promise<ToggleDdayWidgetResult>}
   */
  async function toggleDdayWidget(opts = {}) {
    if (pendingToggle) return pendingToggle;

    const run = (async () => {
      try {
        const currentlyOpen = await isDdayWidgetOpen();
        if (currentlyOpen) {
          await closeDdayWidget();
          return { open: false, ok: true, changed: true };
        }
        const opened = await openDdayWidget(opts);
        return { open: opened, ok: opened, changed: opened };
      } catch {
        const fallback = await isDdayWidgetOpen().catch(() => false);
        return { open: fallback, ok: false, changed: false };
      }
    })();

    pendingToggle = run;
    try {
      return await run;
    } finally {
      if (pendingToggle === run) pendingToggle = null;
    }
  }

  /**
   * D-Day 위젯 창의 열림 상태를 실시간으로 구독합니다.
   * @param {(open: boolean) => void} onChange
   * @returns {{ refresh: () => Promise<void>, dispose: () => void }}
   */
  function watchDdayWidgetOpen(onChange) {
    let disposed = false;
    /** @type {(() => void)[]} */
    const cleanups = [];
    let seq = 0;

    const emitState = (/** @type {boolean} */ open) => {
      if (!disposed) onChange(Boolean(open));
    };

    const refresh = async () => {
      if (disposed) return;
      const mine = ++seq;
      const open = await isDdayWidgetOpen().catch(() => false);
      if (!disposed && mine === seq) emitState(open);
    };

    if (!isNative()) {
      emitState(previewOpen);
      cleanups.push(
        addWindowListener(PREVIEW_STATE_EVENT, (ev) => {
          emitState(Boolean(ev?.detail));
        }),
      );
      return {
        refresh,
        dispose() {
          disposed = true;
          cleanups.splice(0).forEach((fn) => fn());
        },
      };
    }

    void refresh();

    void listenEvent(DDAY_WIDGET_STATE_EVENT, (ev) => {
      if (disposed) return;
      // 진행 중이던 오래된 초기 조회 응답이 최신 이벤트를 덮어쓰지 않도록 순번을 올립니다.
      seq += 1;
      emitState(Boolean(ev?.payload));
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else cleanups.push(unlisten);
      })
      .catch(() => {});

    // 창이 포커스를 되찾을 때 혹시 누락된 창 상태를 한 번 더 맞춥니다.
    cleanups.push(
      addWindowListener('focus', () => {
        void refresh();
      }),
    );

    return {
      refresh,
      dispose() {
        disposed = true;
        cleanups.splice(0).forEach((fn) => fn());
      },
    };
  }

  return {
    isDdayWidgetOpen,
    openDdayWidget,
    closeDdayWidget,
    toggleDdayWidget,
    watchDdayWidgetOpen,
  };
}

const defaultController = createDdayWidgetController();

export const isDdayWidgetOpen = defaultController.isDdayWidgetOpen;
export const openDdayWidget = defaultController.openDdayWidget;
export const closeDdayWidget = defaultController.closeDdayWidget;
export const toggleDdayWidget = defaultController.toggleDdayWidget;
export const watchDdayWidgetOpen = defaultController.watchDdayWidgetOpen;
