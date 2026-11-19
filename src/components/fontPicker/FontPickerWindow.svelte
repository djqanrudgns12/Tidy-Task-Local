<script>
  // ═══════════════════════════════════════════════════════════════════
  // [글꼴 선택 독립 팝업 창] 'font-picker' 라벨 전용 창입니다.
  //
  // 핵심 설계 원칙:
  //   ① 비이동(Non-Draggable) 고정: windowDrag·drag-region을 절대 쓰지 않아
  //      드롭다운 버튼에 착 달라붙어 움직이지 않습니다.
  //   ② Zero-Halo Flush Edge: 투명 여백 0px, shadow: false, 불투명 내측 1px 림.
  //   ③ 권위 호스트: 저장소(tidy-task-config.json 등)에 직접 쓰지 않고,
  //      고른 글꼴 이름만 요청 창으로 돌려보냅니다.
  //   ④ 직렬 큐(ops) + 2-Pass DPI 보정 + revealed 2단계 표시로
  //      다중 모니터·고속 재열기에서도 잔상과 좌표 어긋남을 0건으로 막습니다.
  // ═══════════════════════════════════════════════════════════════════
  import { onMount, tick } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { emit, emitTo, listen } from '@tauri-apps/api/event';
  import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
  import FontPickerPanel from './FontPickerPanel.svelte';
  import {
    ANCHOR_GAP,
    EDGE_PADDING,
    FONT_PICKER_EVENTS as EV,
    MIN_SNAP_HEIGHT,
    STANDARD_HEIGHT,
    normalizeOpenPayload,
    placeFontPicker,
    returnsFocus,
  } from '../../lib/fonts/fontPickerProtocol.js';
  import { fontPickerThemeToStyle, resolveFontPickerTokens } from '../../lib/fonts/fontPickerTheme.js';
  import { getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { createSerialQueue } from '../../lib/storage/serialQueue.js';
  import { registerFontFace } from '../../lib/fonts.js';
  import { watchCustomFonts } from '../../lib/toolkit/appearance.js';

  const win = getCurrentWindow();
  const ops = createSerialQueue();

  // 커스텀 폰트 등록을 기다리는 상한(로컬 파일이라 보통 10ms 미만, 느린 디스크 보호용)
  const FONT_WAIT_MS = 160;
  // 비이동 창이므로 짧은 2단계 blur 확인(60ms → 160ms)으로 WebView2 자식 창 초점 튐만 거릅니다.
  const BLUR_STEPS_MS = [60, 160];

  /** @typedef {import('../../lib/fonts/fontPickerProtocol.js').FontPickerOpenRequest} OpenReq */
  /** @typedef {import('../../lib/fonts/fontPickerProtocol.js').FontPickerPlacement} Placement */

  /** @type {OpenReq | null} */
  let session = $state(null);
  let themeStyle = $state('');
  /** @type {'below' | 'above' | 'right' | 'left' | 'overlay'} */
  let side = $state('below');
  /** @type {Array<{ name: string, path: string }>} */
  let watchedCustomFonts = $state([]);
  // 숨김 직전에 카드를 먼저 감춰 두어야 다음 열기 때 Windows가 직전 프레임을 번쩍 보여주지 않습니다.
  let revealed = $state(false);
  /** @type {{ focusAndReveal: (viaKeyboard?: boolean) => Promise<void>, focusSelectedOrFirst: () => void } | null} */
  let panelRef = $state(null);

  /** @type {string | null} */
  let latestOpenId = null;
  /** @type {string | null} */
  let latestOpenRequester = null;
  /** @type {'hidden' | 'preparing' | 'shown' | 'hiding'} */
  let phase = 'hidden';
  let hadFocus = false;
  let blurCheckPending = false;

  // 요청 창이 넘긴 customFonts를 권위 목록으로 사용해 추가·삭제를 즉시 반영합니다.
  const activeCustomFonts = $derived.by(() => {
    const s = /** @type {OpenReq | null} */ (session);
    return s ? s.customFonts : watchedCustomFonts;
  });

  /** @param {number} ms */
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => Promise.race([
    new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))),
    delay(45),
  ]);

  /** @param {Array<{ name: string, path: string }>} list */
  async function registerCustomFontList(list) {
    if (!list.length) return;
    await Promise.race([
      Promise.all(list.map((f) => registerFontFace(f.name, f.path))),
      delay(FONT_WAIT_MS),
    ]);
  }

  /** @param {Placement} p @param {number} currentScale */
  async function applyGeometry(p, currentScale) {
    const size = new LogicalSize(p.width / p.scale, p.height / p.scale);
    const position = new PhysicalPosition(p.x, p.y);
    const crossesScale = Math.abs(currentScale - p.scale) > 0.01;
    for (let pass = 0; pass < (crossesScale ? 2 : 1); pass += 1) {
      await win.setSize(size);
      await win.setPosition(position);
    }
  }

  /** @param {Placement} p */
  async function verifyGeometry(p) {
    try {
      const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
      const off = Math.abs(pos.x - p.x) > 1 || Math.abs(pos.y - p.y) > 1
        || Math.abs(size.width - p.width) > 2 || Math.abs(size.height - p.height) > 2;
      if (!off) return;
      await win.setSize(new PhysicalSize(p.width, p.height));
      await win.setPosition(new PhysicalPosition(p.x, p.y));
    } catch (e) {
      console.warn('글꼴 선택 창 위치를 보정하지 못했습니다:', e);
    }
  }

  /** @param {OpenReq} s @param {string} reason @param {string} [value] */
  function notifyClosed(s, reason, value = '') {
    void emitTo(s.requester, EV.closed, { requestId: s.requestId, reason, value }).catch(() => {});
  }

  /** @param {string} label */
  async function focusRequester(label) {
    try {
      const target = await WebviewWindow.getByLabel(label);
      if (target) await target.setFocus();
    } catch {}
  }

  /** @param {unknown} payload */
  function handleOpen(payload) {
    const req = normalizeOpenPayload(payload);
    if (!req) return;
    void emitTo(req.requester, EV.opened, { requestId: req.requestId }).catch(() => {});
    latestOpenId = req.requestId;
    latestOpenRequester = req.requester;
    void ops.enqueue(() => present(req));
  }

  /** @param {OpenReq} req */
  async function present(req) {
    if (latestOpenId !== req.requestId) return;
    const previous = session;
    if (previous && previous.requestId !== req.requestId) {
      notifyClosed(previous, 'superseded');
    }
    try {
      await presentSteps(req);
    } catch (e) {
      console.warn('글꼴 선택 창을 띄우지 못했습니다:', e);
      if (session === req) {
        notifyClosed(req, 'error');
        session = null;
        revealed = false;
        phase = 'hidden';
        try { await win.hide(); } catch {}
      }
    }
  }

  /** @param {OpenReq} req */
  async function presentSteps(req) {
    phase = 'preparing';
    hadFocus = false;
    revealed = false;

    const tokens = resolveFontPickerTokens(req.theme);
    themeStyle = fontPickerThemeToStyle(tokens);
    session = req;

    const [monitors, currentScale] = await Promise.all([
      getMonitorGeometries(),
      win.scaleFactor().catch(() => window.devicePixelRatio || 1),
      registerCustomFontList(req.customFonts),
    ]);
    if (latestOpenId !== req.requestId) return;

    const placement = placeFontPicker({
      anchor: req.anchor,
      width: req.preferredWidth,
      idealHeight: STANDARD_HEIGHT,
      minSnapHeight: MIN_SNAP_HEIGHT,
      align: req.align,
      gap: ANCHOR_GAP,
      edge: EDGE_PADDING,
      monitors,
      fallbackScale: currentScale,
    });
    side = placement.side;

    await tick();
    await applyGeometry(placement, currentScale);
    if (latestOpenId !== req.requestId) return;

    await win.setAlwaysOnTop(true).catch(() => {});
    await win.show();
    await win.setFocus();
    revealed = true;
    phase = 'shown';
    await tick();
    await panelRef?.focusAndReveal(req.viaKeyboard);
    await verifyGeometry(placement);
    scheduleFocusCheck(req.requestId);
  }

  /** @param {string} id */
  function scheduleFocusCheck(id) {
    setTimeout(async () => {
      if (phase !== 'shown' || session?.requestId !== id) return;
      try {
        if (await win.isFocused()) {
          hadFocus = true;
          return;
        }
        if (hadFocus) requestClose('blur');
        else await win.setFocus();
      } catch {}
    }, 220);
  }

  async function confirmBlurThenClose() {
    if (blurCheckPending) return;
    const expectedId = session?.requestId;
    if (!expectedId) return;
    blurCheckPending = true;
    try {
      for (const wait of BLUR_STEPS_MS) {
        await delay(wait);
        // 대기 중 새 요청으로 교체되었다면 이전 요청의 blur 판정을 폐기합니다.
        if (phase !== 'shown' || session?.requestId !== expectedId) return;
        if (!(await win.isFocused().catch(() => false))) {
          if (phase !== 'shown' || session?.requestId !== expectedId) return;
          requestClose('blur');
          return;
        }
      }
    } finally {
      blurCheckPending = false;
    }
  }

  /** @param {string} reason @param {string} [value] */
  function requestClose(reason, value = '') {
    const s = session;
    if (!s || phase === 'hiding' || phase === 'hidden') return;
    if (phase === 'preparing' && latestOpenId === s.requestId) latestOpenId = null;
    phase = 'hiding';
    void ops.enqueue(async () => {
      if (session !== s) {
        if (phase === 'hiding') phase = session ? 'shown' : 'hidden';
        return;
      }
      revealed = false;
      await tick();
      await nextFrame();
      notifyClosed(s, reason, value);
      if (returnsFocus(reason)) {
        await focusRequester(s.requester);
      }
      try {
        await win.hide();
      } catch {}
      if (session === s) {
        session = null;
        phase = 'hidden';
      }
    });
  }

  onMount(() => {
    /** @type {Array<() => void>} */
    const cleanups = [];
    let disposed = false;

    void watchCustomFonts((fonts) => {
      if (disposed) return;
      watchedCustomFonts = fonts;
      void registerCustomFontList(fonts);
    }).then((off) => {
      if (disposed) off();
      else cleanups.push(off);
    }).catch(() => {});

    void (async () => {
      const unsubs = await Promise.all([
        win.listen(EV.open, (e) => handleOpen(e.payload)),
        win.listen(EV.close, (e) => {
          const p = /** @type {any} */ (e.payload);
          // 직렬 큐에서 아직 실행 전인 open 요청에 대해 close가 먼저 도착하면 곧바로 취소합니다.
          if (p?.requestId && latestOpenId === p.requestId && session?.requestId !== p.requestId) {
            latestOpenId = null;
            latestOpenRequester = null;
          }
          if (!session) return;
          if (p?.requestId && session.requestId !== p.requestId) return;
          if (p?.requester && session.requester !== p.requester) return;
          requestClose(typeof p?.reason === 'string' ? p.reason : 'requester');
        }),
        win.listen(EV.ping, (e) => {
          const from = /** @type {any} */ (e.payload)?.from;
          if (typeof from === 'string' && from) {
            void emitTo(from, EV.ready, {}).catch(() => {});
          }
        }),
        listen(EV.requesterDestroyed, (e) => {
          const destroyedLabel = /** @type {any} */ (e.payload)?.label;
          if (typeof destroyedLabel !== 'string') return;
          if (latestOpenRequester === destroyedLabel && session?.requester !== destroyedLabel) {
            latestOpenId = null;
            latestOpenRequester = null;
          }
          if (session && session.requester === destroyedLabel) {
            requestClose('host-closed');
          }
        }),
        win.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            hadFocus = true;
          } else if (phase === 'shown') {
            void confirmBlurThenClose();
          }
        }),
        win.onCloseRequested((event) => {
          // 숨김 상주 창이므로 Alt+F4 등으로 파괴되지 않고 조용히 숨깁니다.
          event.preventDefault();
          requestClose('escape');
        }),
      ]);
      if (disposed) {
        for (const fn of unsubs) fn();
        return;
      }
      cleanups.push(...unsubs);
      void emit(EV.ready, {}).catch(() => {});
    })();

    return () => {
      disposed = true;
      for (const fn of cleanups) {
        try { fn(); } catch {}
      }
    };
  });
  /** @param {KeyboardEvent} e */
  function handleWindowKeydown(e) {
    if (!session || phase !== 'shown') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose('escape');
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp')
      && !(document.activeElement instanceof HTMLElement && document.activeElement.closest('[role="listbox"], [role="tablist"]'))) {
      e.preventDefault();
      panelRef?.focusSelectedOrFirst();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="fp-win-stage" class:is-revealed={revealed} data-side={side}>
  {#if session}
    <FontPickerPanel
      bind:this={panelRef}
      value={session.value}
      customFonts={activeCustomFonts}
      extraOptions={session.extraOptions}
      {themeStyle}
      {side}
      variant="window"
      onselect={(fontName) => requestClose('select', fontName)}
      oncancel={() => requestClose('escape')}
    />
  {/if}
</div>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    background: transparent !important;
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .fp-win-stage {
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    opacity: 0;
    transform: translateY(-3px) scale(0.99);
    transform-origin: top left;
    transition: opacity 95ms ease-out, transform 110ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  .fp-win-stage[data-side="above"] {
    transform: translateY(3px) scale(0.99);
    transform-origin: bottom left;
  }
  .fp-win-stage.is-revealed {
    opacity: 1;
    transform: none;
  }
</style>
