<script>
  // ═══════════════════════════════════════════════════════════════════
  // [날짜 선택 창] 'date-picker' 라벨의 별도 창. 숨긴 채 상주하다가 요청이 오면 버튼 옆에 떠서 날짜를 받습니다.
  //
  // 왜 메모 앱(App·appState)을 쓰지 않는가: 이 창은 저장할 데이터가 없습니다. appState를 초기화하면
  //   이 라벨로 저장소 키를 만들 위험이 있고(CLAUDE.md "잘못된 윈도우 라벨 기반 스토어 덮어쓰기"), 뜨는 속도도 느려집니다.
  //   고른 날짜는 요청한 창으로 돌려보내고, 저장은 그 창이 늘 쓰던 경로(appState.setTodoDeadline)로 합니다.
  //
  // 순서 보장: 보여 주기(present)·숨기기(close)는 모두 한 줄(serial queue)로 실행합니다.
  //   창 API는 비동기라, 줄을 세우지 않으면 "앞 요청의 숨기기"가 "새 요청의 보여 주기"보다 늦게 끝나
  //   방금 뜬 달력이 사라집니다.
  // ═══════════════════════════════════════════════════════════════════
  import { onMount, tick } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { emit, emitTo, listen } from '@tauri-apps/api/event';
  import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
  import CalendarPanel from './CalendarPanel.svelte';
  import {
    CARD_MARGIN,
    CLOSE_REASONS,
    DATE_PICKER_EVENTS as EV,
    normalizeOpenRequest,
    returnsFocus,
  } from '../../lib/datePicker/protocol.js';
  import { calendarPalette, toStyleText } from '../../lib/datePicker/palette.js';
  import { placePopup } from '../../lib/windows/popupPlacement.js';
  import { ensureWindowOnScreen, getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { windowDrag } from '../../lib/windows/windowDrag.js';
  import { createSerialQueue } from '../../lib/storage/serialQueue.js';
  import { registerFontFace } from '../../lib/fonts.js';
  import { todayKey as makeTodayKey } from '../../lib/dateUtils.js';

  const win = getCurrentWindow();
  const ops = createSerialQueue();
  // 글꼴 파일을 기다리는 최대 시간. 늦게 오면 크기 감시(ResizeObserver)가 창을 다시 맞춥니다.
  const FONT_WAIT_MS = 250;

  /** @typedef {import('../../lib/datePicker/protocol.js').OpenRequest} OpenRequest */
  /** @typedef {import('../../lib/windows/popupPlacement.js').PopupPlacement} PopupPlacement */

  /** @type {OpenRequest | null} */
  let session = $state(null);
  let today = $state(makeTodayKey());
  let side = $state('below');
  let styleText = $state('');
  // 창을 보여 준 뒤에만 카드를 드러냅니다. 숨기기 직전에도 먼저 감춥니다.
  // 왜: 숨긴 창을 다시 보이면 Windows가 숨기기 직전의 마지막 화면을 한 순간 먼저 보여 줍니다.
  //   마지막 화면을 "빈 화면"으로 남겨 두면 지난 달력이 번쩍 비치지 않습니다.
  let revealed = $state(false);
  /** @type {{ focusCursor: () => void } | null} */
  let panel = $state(null);
  /** @type {HTMLDivElement | null} */
  let slotEl = $state(null);

  // 화면에 그릴 필요가 없는 진행 상태 (반응형이 아니어도 됩니다)
  /** @type {string | null} 가장 최근에 받은 open 요청 번호 */
  let latestOpenId = null;
  /** @type {'hidden' | 'preparing' | 'shown' | 'hiding'} */
  let phase = 'hidden';
  let hadFocus = false;
  // 사용자가 끌어서 옮겼으면 크기가 바뀌어도 그 자리를 지킵니다.
  let detached = false;
  /** @type {PopupPlacement | null} */
  let lastPlacement = null;
  // 창을 끌어 옮기는 중으로 보는 시각(이때까지는 "초점 잃음"을 믿지 않습니다).
  // 왜: Windows가 창을 OS 이동 모드로 넘기면 최상위 창과 웹뷰 자식 창 사이로 초점이 오가며
  //   가짜 "초점 잃음"이 옵니다. 이 신호로 닫으면 달력을 잡는 순간 꺼집니다.
  let dragUntil = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let dragEndTimer = null;
  // 우리가 옮긴 직후의 이동 알림은 "사용자가 옮긴 것"으로 보지 않습니다.
  let programmaticMoveUntil = 0;
  let blurCheckPending = false;
  // 창 이동이 끝났다고 보기까지 조용히 기다리는 시간
  const DRAG_QUIET_MS = 500;
  // "초점 잃음"이 진짜인지 창에 되물어 보기 전 기다리는 시간
  const BLUR_CONFIRM_MS = 70;

  const isDragging = () => performance.now() < dragUntil;

  /** @param {number} ms */
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // 다음 화면 한 장이 그려질 때까지. 가려진 창은 requestAnimationFrame이 멈출 수 있어 시간 제한을 둡니다.
  const nextFrame = () => Promise.race([
    new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))),
    delay(50),
  ]);

  /** @param {OpenRequest['appearance']} look */
  function buildStyle(look) {
    return `${toStyleText(calendarPalette(look.themeColor, look.isDarkMode))};font-family:${look.fontFamily};font-size:${look.fontSizePt}pt`;
  }

  /** @param {OpenRequest['appearance']} look */
  async function prepareFont(look) {
    /** @type {Promise<unknown>[]} */
    const tasks = [];
    if (look.customFont) tasks.push(registerFontFace(look.customFont.name, look.customFont.path));
    // 글꼴 파일을 아직 읽지 않았으면 읽을 때까지 잠깐 기다립니다.
    // 왜: 기다리지 않으면 대체 글꼴 크기로 창을 맞춘 직후 글꼴이 바뀌어 달력이 창보다 커집니다.
    tasks.push(document.fonts.load(`${look.fontSizePt}pt ${look.fontFamily}`, '가1').catch(() => {}));
    await Promise.race([Promise.all(tasks), delay(FONT_WAIT_MS)]);
  }

  // 카드의 논리 크기(CSS px). 드러내기 전(변형 없음)에 재므로 getBoundingClientRect가 곧 실제 크기입니다.
  function measureCard() {
    const rect = slotEl?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  }

  /** @param {PopupPlacement} p @param {number} currentScale 지금 이 창이 놓인 모니터의 배율 */
  async function applyGeometry(p, currentScale) {
    const size = new LogicalSize(p.width / p.scale, p.height / p.scale);
    const position = new PhysicalPosition(p.x, p.y);
    // 배율이 다른 모니터로 옮길 때는 Windows가 옮긴 직후 크기·위치를 새 배율로 다시 잡습니다.
    // 옮긴 뒤 목표 모니터 기준으로 한 번 더 맞춥니다. (toolkit.rs create_window와 같은 방식)
    const crossesScale = Math.abs(currentScale - p.scale) > 0.01;
    for (let pass = 0; pass < (crossesScale ? 2 : 1); pass += 1) {
      // 우리가 옮기는 동안 오는 이동 알림은 "사용자가 옮겼다"로 세지 않습니다.
      programmaticMoveUntil = performance.now() + 250;
      await win.setSize(size);
      await win.setPosition(position);
    }
    programmaticMoveUntil = performance.now() + 250;
  }

  // 보여 준 뒤 실제 자리를 한 번 확인합니다. 숨은 창은 배율 변경 알림을 늦게 받을 수 있어,
  // 어긋났으면(2배/절반 크기 등) 바로 고칩니다.
  /** @param {PopupPlacement} p */
  async function verifyGeometry(p) {
    try {
      const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
      const off = Math.abs(pos.x - p.x) > 1 || Math.abs(pos.y - p.y) > 1
        || Math.abs(size.width - p.width) > 2 || Math.abs(size.height - p.height) > 2;
      // 사용자가 벌써 잡고 옮기는 중이면 그 자리를 빼앗지 않습니다.
      if (!off || detached || isDragging()) return;
      programmaticMoveUntil = performance.now() + 250;
      await win.setSize(new PhysicalSize(p.width, p.height));
      await win.setPosition(new PhysicalPosition(p.x, p.y));
    } catch (e) {
      console.warn('날짜 선택 창 위치를 확인하지 못했습니다:', e);
    }
  }

  // 창 이동이 진행 중임을 알립니다. 이동 알림이 올 때마다 시간을 늘려, 손을 뗀 뒤에야 끝난 것으로 봅니다.
  // 왜 시간으로 판단하는가: OS 이동 모드에서는 마우스를 OS가 가져가므로 웹뷰가 pointerup을 못 받기도 합니다.
  function noteDragActivity() {
    dragUntil = performance.now() + DRAG_QUIET_MS;
    if (dragEndTimer) return;
    const check = () => {
      if (isDragging()) {
        dragEndTimer = setTimeout(check, 120);
        return;
      }
      dragEndTimer = null;
      void finishDrag();
    };
    dragEndTimer = setTimeout(check, DRAG_QUIET_MS);
  }

  // 이동이 끝나면 초점과 키보드 커서를 되살립니다.
  // 왜: 이동 중에는 초점이 최상위 창으로 옮겨 가 있어, 그대로 두면 방향키·Esc가 먹지 않고
  //   바깥을 눌러도 "초점 잃음"이 오지 않아 달력이 닫히지 않습니다.
  async function finishDrag() {
    if (phase !== 'shown') return;
    try {
      if (!(await win.isFocused())) await win.setFocus();
    } catch (e) {}
    panel?.focusCursor();
    // 화면 밖으로 끌고 나가 다시 잡을 수 없게 된 경우에만 보이는 곳으로 되돌립니다.
    // (판정 규칙은 메모 창 복원과 같은 windowPlacement — 제목줄 80×24가 보이는지)
    programmaticMoveUntil = performance.now() + 250;
    await ensureWindowOnScreen(win);
  }

  /** @param {OpenRequest} s @param {string} reason @param {string} [value] */
  function notifyClosed(s, reason, value = '') {
    void emitTo(s.requester, EV.closed, { requestId: s.requestId, reason, value }).catch(() => {});
  }

  /** @param {string} label */
  async function focusRequester(label) {
    try {
      const target = await WebviewWindow.getByLabel(label);
      if (target) await target.setFocus();
    } catch (e) {}
  }

  /** @param {unknown} payload */
  function handleOpen(payload) {
    const req = normalizeOpenRequest(payload);
    if (!req) return;
    // 받자마자 "받았다"고 답합니다. 답이 없으면 요청 창이 이 창을 다시 준비해 한 번 더 보냅니다.
    void emitTo(req.requester, EV.opened, { requestId: req.requestId }).catch(() => {});
    latestOpenId = req.requestId;
    void ops.enqueue(() => present(req));
  }

  /** @param {OpenRequest} req */
  async function present(req) {
    // 뒤에 더 새 요청이 줄 서 있으면 이 요청은 건너뜁니다(새 요청이 곧 보여짐).
    if (latestOpenId !== req.requestId) return;
    const previous = session;
    if (previous && previous.requestId !== req.requestId) notifyClosed(previous, 'superseded');
    try {
      await presentSteps(req);
    } catch (e) {
      // 창 API가 실패해도 요청 창이 "열려 있음"에 갇히지 않도록 닫혔다고 알립니다.
      console.warn('날짜 선택 창을 띄우지 못했습니다:', e);
      if (session === req) {
        notifyClosed(req, 'error');
        session = null;
        revealed = false;
        phase = 'hidden';
        try { await win.hide(); } catch (err) {}
      }
    }
  }

  /** @param {OpenRequest} req */
  async function presentSteps(req) {
    phase = 'preparing';
    hadFocus = false;
    detached = false;
    // 이미 떠 있던 달력을 다른 요청이 이어받는 경우에도 새 달력이 처음부터 나타나게 합니다.
    revealed = false;
    // 자정을 넘겨 켜 둔 창에서도 "오늘" 표시가 맞도록 열 때마다 다시 읽습니다.
    today = makeTodayKey();
    styleText = buildStyle(req.appearance);
    session = req;
    await prepareFont(req.appearance);
    await tick();
    if (latestOpenId !== req.requestId) return;

    const size = measureCard();
    // 카드를 재지 못하면(화면이 그려지지 않은 이상 상황) 창을 띄우지 않고 닫혔다고 알립니다.
    // 이미 떠 있던 창을 이어받는 중이었다면 빈 창이 남지 않도록 숨깁니다.
    if (!size) throw new Error('달력 카드 크기를 재지 못했습니다');
    // 모니터 목록과 이 창의 현재 배율을 한 번에 물어봅니다(왕복 1회).
    const [monitors, currentScale] = await Promise.all([
      getMonitorGeometries(),
      win.scaleFactor().catch(() => window.devicePixelRatio || 1),
    ]);
    if (latestOpenId !== req.requestId) return;
    const placement = placePopup({
      anchor: req.anchor,
      size,
      monitors,
      prefer: 'below',
      margin: CARD_MARGIN,
      fallbackScale: currentScale,
    });
    side = placement.side;
    await applyGeometry(placement, currentScale);
    if (latestOpenId !== req.requestId) return;
    lastPlacement = placement;

    await win.show();
    await win.setFocus();
    revealed = true;
    phase = 'shown';
    panel?.focusCursor();
    await verifyGeometry(placement);
    scheduleFocusCheck(req.requestId);
  }

  // 보여 주고 잠시 뒤 초점을 확인합니다.
  //  - 한 번도 초점을 받지 못했으면(다른 프로그램이 앞으로 나오기를 막은 경우 등) 한 번 더 요청합니다.
  //    초점이 없으면 "바깥을 누르면 닫힘"이 동작하지 않기 때문입니다. (요청 창도 바깥 클릭을 따로 감시합니다)
  //  - 준비하는 사이 초점을 받았다가 이미 잃었다면(그 사이 다른 곳을 누름) 그 blur는 무시됐으므로 여기서 닫습니다.
  /** @param {string} id */
  function scheduleFocusCheck(id) {
    setTimeout(async () => {
      if (phase !== 'shown' || session?.requestId !== id || isDragging()) return;
      try {
        if (await win.isFocused()) {
          hadFocus = true;
          return;
        }
        if (hadFocus) requestClose('blur');
        else await win.setFocus();
      } catch (e) {}
    }, 250);
  }

  // "초점을 잃었다"는 신호가 진짜인지 창에 되물어 본 뒤에만 닫습니다.
  // 왜: 창을 끌어 옮기거나 웹뷰 안팎으로 초점이 오갈 때 가짜 신호가 옵니다. 그대로 믿으면
  //   달력을 잡는 순간 꺼집니다. 진짜로 다른 창이 앞에 있으면 확인 뒤(70ms) 닫히므로 느낌은 그대로입니다.
  async function confirmBlurThenClose() {
    if (blurCheckPending) return;
    blurCheckPending = true;
    try {
      // 두 번 확인합니다. 진짜로 다른 창이 앞에 오면 첫 확인(70ms)에서 닫히고,
      // 창 이동처럼 잠깐 오갔던 초점은 두 번째 확인(약 0.4초 뒤)까지 기다렸다가 그대로 둡니다.
      for (const wait of [BLUR_CONFIRM_MS, 350]) {
        await delay(wait);
        if (phase !== 'shown') return;
        if (isDragging()) continue; // 옮기는 중에는 판단을 미룹니다
        if (!(await win.isFocused().catch(() => false))) {
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
    // 아직 보여 주는 중이면 그 준비를 멈추게 합니다(present가 매 단계 확인합니다).
    if (phase === 'preparing' && latestOpenId === s.requestId) latestOpenId = null;
    phase = 'hiding';
    void ops.enqueue(async () => {
      if (session !== s) {
        // 줄을 서는 사이 다른 요청이 이 창을 이어받았습니다. 'hiding'인 채로 두면 다음 닫기가 막히므로 되돌립니다.
        if (phase === 'hiding') phase = session ? 'shown' : 'hidden';
        return;
      }
      notifyClosed(s, reason, value);
      // 날짜를 고르거나 Esc로 닫았으면 요청 창에 초점을 돌려줍니다. 숨기기 "전에" 해야 합니다.
      // 왜: 초점을 가진 창이 먼저 숨으면 Windows가 아무 창(다른 프로그램일 수도)이나 앞으로 올립니다.
      if (returnsFocus(reason)) await focusRequester(s.requester);
      revealed = false;
      await nextFrame();
      if (session === s) session = null;
      try { await win.hide(); } catch (e) {}
      phase = 'hidden';
    });
  }

  /** @param {any} payload */
  function handleCloseRequest(payload) {
    const id = payload?.requestId;
    if (typeof id !== 'string') return;
    const reason = CLOSE_REASONS.includes(payload?.reason) ? payload.reason : 'requester';
    if (session?.requestId === id) {
      requestClose(reason);
      return;
    }
    // 아직 줄 서 있던(보여 주기 전) 요청이면 취소하고 닫혔다고 알려 요청 창이 정리하게 합니다.
    if (latestOpenId === id && typeof payload?.requester === 'string') {
      latestOpenId = null;
      void emitTo(payload.requester, EV.closed, { requestId: id, reason, value: '' }).catch(() => {});
    }
  }

  // 글꼴이 늦게 도착하거나 "날짜 지우기" 줄이 생기는 등 카드 크기가 바뀌면 창을 다시 맞춥니다.
  async function refit() {
    if (phase !== 'shown' || !session || !lastPlacement || !slotEl) return;
    // 드러나는 중(변형 애니메이션)에도 정확하도록 변형과 무관한 레이아웃 크기를 씁니다.
    const size = { width: Math.ceil(slotEl.offsetWidth), height: Math.ceil(slotEl.offsetHeight) };
    if (size.width < 1 || size.height < 1) return;
    const { scale, card } = lastPlacement;
    if (Math.abs(size.width * scale - card.width) < 2 && Math.abs(size.height * scale - card.height) < 2) return;
    if (detached) {
      // 사용자가 옮긴 자리는 그대로 두고 크기만 맞춥니다.
      await win.setSize(new LogicalSize(size.width + CARD_MARGIN * 2, size.height + CARD_MARGIN * 2));
      lastPlacement = {
        ...lastPlacement,
        card: { ...card, width: Math.ceil(size.width * scale), height: Math.ceil(size.height * scale) },
      };
      return;
    }
    const [monitors, currentScale] = await Promise.all([
      getMonitorGeometries(),
      win.scaleFactor().catch(() => scale),
    ]);
    if (phase !== 'shown' || !session) return;
    const placement = placePopup({ anchor: session.anchor, size, monitors, prefer: 'below', margin: CARD_MARGIN, fallbackScale: currentScale });
    side = placement.side;
    await applyGeometry(placement, currentScale);
    lastPlacement = placement;
  }

  $effect(() => {
    const el = slotEl;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void ops.enqueue(refit));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  // 사용자가 창을 잡고 끌기 시작했습니다.
  function startWindowDrag() {
    detached = true;
    noteDragActivity();
  }

  onMount(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';

    /** @type {Array<() => void>} */
    const offs = [];
    let disposed = false;
    (async () => {
      const handlers = await Promise.all([
        win.listen(EV.open, (e) => handleOpen(e.payload)),
        win.listen(EV.close, (e) => handleCloseRequest(e.payload)),
        win.listen(EV.ping, (e) => {
          const from = /** @type {any} */ (e.payload)?.from;
          if (typeof from === 'string') void emitTo(from, EV.ready, {}).catch(() => {});
        }),
        win.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            hadFocus = true;
            return;
          }
          // 다른 곳(요청 창·다른 프로그램)을 누르면 닫습니다. 한 번도 초점을 받지 못한 상태의 blur는 무시합니다.
          if (phase === 'shown' && hadFocus) void confirmBlurThenClose();
        }),
        // 창이 움직이면 "이동 중"으로 표시합니다. 우리가 옮긴 직후의 알림은 셈에 넣지 않습니다.
        // 왜 여기서도 보는가: 끌기 손잡이를 거치지 않은 이동(OS 단축키 등)에도 같은 보호가 걸립니다.
        win.onMoved(() => {
          if (phase !== 'shown' || performance.now() < programmaticMoveUntil) return;
          // 사용자가 직접 옮긴 자리는 지켜야 하므로, 크기가 바뀌어도 다시 배치하지 않습니다.
          detached = true;
          noteDragActivity();
        }),
        // 요청한 메모 창이 닫히면 결과를 받을 곳이 없으므로 닫습니다.
        listen('window-roster-changed', (e) => {
          const closed = /** @type {any} */ (e.payload)?.closed;
          if (session && closed === session.requester) requestClose('requester-closed');
        }),
      ]);
      if (disposed) handlers.forEach((off) => off());
      else offs.push(...handlers);
      // 모든 창에 "준비됨"을 알립니다. 이 창을 만든 창뿐 아니라, 만들어지는 동안 기다리던 다른 창도 듣습니다.
      await emit(EV.ready, {});
    })().catch((e) => console.warn('날짜 선택 창을 준비하지 못했습니다:', e));

    return () => {
      disposed = true;
      if (dragEndTimer) clearTimeout(dragEndTimer);
      offs.forEach((off) => off());
    };
  });
</script>

<!-- 창 전체(카드 + 그림자 자리인 투명 여백)를 잡아 옮길 수 있습니다.
     왜 여백까지인가: 여백은 눈에 보이지 않아, 달력 가장자리를 잡으려다 몇 px 빗나가면 "바깥 클릭"이 되어
     달력이 닫혀 버렸습니다. 여백은 달력의 일부로 보고, 진짜 바깥(다른 창)을 누르면 초점이 빠져 닫힙니다. -->
<div
  class="dp-root"
  style="padding:{CARD_MARGIN}px;{styleText}"
  role="presentation"
  use:windowDrag={{ onstart: startWindowDrag }}
>
  <div class="dp-slot" class:revealed data-side={side} bind:this={slotEl}>
    {#if session}
      <!-- 요청마다 카드를 새로 만듭니다: 보이는 달·커서·키보드 표시가 이전 요청에서 이어지지 않게 합니다. -->
      {#key session.requestId}
        <CalendarPanel
          bind:this={panel}
          value={session.value}
          todayKey={today}
          viaKeyboard={session.viaKeyboard}
          draggable
          onpick={(key) => requestClose('select', key)}
          onclear={() => requestClose('clear')}
          onescape={() => requestClose('escape')}
        />
      {/key}
    {/if}
  </div>
</div>

<style>
  :global(html),
  :global(body) {
    background: transparent !important;
    margin: 0;
    overflow: hidden;
  }
  .dp-root {
    box-sizing: border-box;
    width: 100vw;
    height: 100vh;
    line-height: 1.4;
    cursor: grab;
  }
  .dp-root:active { cursor: grabbing; }
  .dp-slot {
    display: inline-block;
    vertical-align: top;
    opacity: 0;
  }
  .dp-slot.revealed {
    opacity: 1;
    animation: dp-pop 130ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transform-origin: top left;
  }
  /* 위로 뜬 달력은 아래(버튼 쪽)에서, 아래로 뜬 달력은 위(버튼 쪽)에서 자라나듯 나타납니다. */
  .dp-slot[data-side='above'] { transform-origin: bottom left; --dp-enter-y: 4px; }
  .dp-slot[data-side='below'] { --dp-enter-y: -4px; }
  @keyframes dp-pop {
    from { opacity: 0; transform: translateY(var(--dp-enter-y, 0)) scale(0.97); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dp-slot.revealed { animation: none; }
  }
</style>
