<script>
  // ═══════════════════════════════════════════════════════════════════
  // [설정 창] 묶음(탭) 넷으로 나눈 설정 화면입니다.
  //   모양 — 테마·다크 모드 / 상단 디자인 / 보이는 영역
  //   글자 — 메모 글자(글꼴·크기) / 화면 글자(글꼴·크기) / 글꼴 추가
  //   동작 — 컴퓨터를 켜면 자동 실행 / 알림과 소리 / Tidy 툴킷
  //   관리 — 새로운 소식 / 앱 업데이트 / 초기화(설정 · 데이터)
  //
  // 적용 시점은 두 가지입니다.
  //   · "바로 적용" 꼬리표가 붙은 것(상단 디자인 · Tidy 툴킷)은 고르는 즉시 바뀝니다.
  //   · 나머지는 아래 [반영]을 눌러야 바뀝니다. 바꾼 것이 있으면 탭 이름 옆 점과 아래쪽 문구로 알려 줍니다.
  //
  // 이 창은 저장소에 직접 쓰지 않습니다. 값은 메모 창에 이벤트로 보내고(req-apply-settings 등),
  // 받은 메모 창이 자기 데이터로 저장합니다. (보조 창이 저장하면 다른 창의 데이터를 덮을 수 있습니다)
  // ═══════════════════════════════════════════════════════════════════
  import { onMount, onDestroy, tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import {
    ALargeSmall, Archive, ArrowUpRight, Bell, BellRing, ChevronDown, Download, Eye, FileText, FileType, LoaderCircle,
    Monitor, Moon, Palette, PanelTop, PenLine, Power, RotateCcw, Shapes, SlidersHorizontal, Sparkles, Trash2,
    TriangleAlert, Upload, VolumeX, Wrench, X,
  } from 'lucide-svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit, emitTo, listen } from '@tauri-apps/api/event';
  import { version as packageVersion } from '../../package.json';
  import { appState } from '../lib/appState.svelte.js';
  import { track } from '../lib/analytics.js';
  import { TIDY_THEMES, getTidyTheme } from '../lib/themes.js';
  import { openReleaseNews } from '../lib/releaseNewsWindow.js';
  import { readLaunchAtStartup, setLaunchAtStartup } from '../lib/autostart.js';
  import {
    describeDownloadProgress, describeInstallError, describeUpdateError, downloadPercent, formatBytes, isInstallActive,
  } from '../lib/updateChecker.js';
  import {
    FIELD_TABS, FONT_SIZE_RANGE, SETTINGS_DEFAULTS, SETTINGS_TABS, UI_FONT_SIZE_RANGE,
    changedFields, nextTab, readSettingsForm, toApplyPayload, wipeArmSecondsLeft,
  } from '../lib/settings/settingsForm.js';
  import HeaderLayoutIcon from './HeaderLayoutIcon.svelte';
  import ThemeSwatches from './settings/ThemeSwatches.svelte';
  import ToolkitToggle from './toolkit/ToolkitToggle.svelte';
  import SettingsPanel from './settings/SettingsPanel.svelte';
  import SwitchRow from './settings/SwitchRow.svelte';

  /** @typedef {import('../lib/settings/settingsForm.js').SettingsTabId} SettingsTabId */

  const TAB_ICONS = { look: Palette, text: ALargeSmall, behavior: SlidersHorizontal, manage: Wrench };

  // 이 설정을 받을 메모 창. 설정 창을 연 창이 'set-settings-target'으로 알려 줍니다.
  let targetLabel = 'main';
  /** @type {(() => void) | undefined} */
  let unlistenTarget;

  // 화면에 보이는 값(form)과 창을 열었을 때의 값(initial). 둘이 다르면 "반영 전 변경"입니다.
  let form = $state(readSettingsForm(appState));
  let initial = $state.raw(readSettingsForm(appState));

  /** @type {SettingsTabId} */
  let activeTab = $state('look');

  // ── 테마에 맞춘 색 ──
  // 스위치·슬라이더·[반영] 버튼까지 모두 고른 테마의 강조색을 따릅니다.
  // (getTidyTheme은 모르는 이름이면 기본 테마를 돌려주지만 타입으로는 드러나지 않아 한 번 더 받쳐 둡니다)
  const theme = $derived((getTidyTheme(form.themeColor) ?? TIDY_THEMES[0]).tidy);
  const accent = $derived(form.isDarkMode ? theme.accentDark : theme.accent);

  // 글꼴 이름(예: "맑은고딕")을 실제 font-family 값으로 바꿉니다.
  /** @param {string} name */
  function fontStack(name) {
    return appState.allFonts.find((font) => font.name === name)?.family ?? `"${name}", sans-serif`;
  }
  const uiFontStack = $derived(fontStack(form.uiFontFamily));
  const memoFontStack = $derived(fontStack(form.fontFamily));

  // 슬라이더의 채워진 길이(%)
  /** @param {number} value @param {{ min: number, max: number }} range */
  function fillPercent(value, range) {
    return Math.min(100, Math.max(0, ((value - range.min) / (range.max - range.min)) * 100));
  }

  // ── 반영 전 변경 ──
  const pendingFields = $derived(changedFields(form, initial));

  // ── 컴퓨터를 켜면 자동 실행 (앱 전체 · [반영]을 누를 때 적용) ──
  // 처음 값은 실제 Windows 등록 상태입니다. 읽기 전에는 스위치를 잠가 둡니다.
  let launchAtStartup = $state(true);
  let initialLaunch = $state(true);
  let launchReady = $state(false);
  let launchError = $state('');
  const launchChanged = $derived(launchReady && launchAtStartup !== initialLaunch);

  const pendingCount = $derived(pendingFields.length + (launchChanged ? 1 : 0));
  const pendingTabs = $derived(
    new Set([...pendingFields.map((name) => FIELD_TABS[name]), ...(launchChanged ? ['behavior'] : [])]),
  );

  // ── 탭 ──
  /** @type {HTMLDivElement | null} */
  let scrollBox = $state(null);

  /** @param {SettingsTabId} id */
  function selectTab(id) {
    if (activeTab === id) return;
    releasePin();
    activeTab = id;
    // 탭마다 길이가 달라, 앞 탭의 스크롤 위치가 남으면 새 탭이 중간부터 보입니다.
    if (scrollBox) scrollBox.scrollTop = 0;
  }

  /** @param {KeyboardEvent} event */
  function handleTabKeydown(event) {
    const next = nextTab(activeTab, event.key);
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    tick().then(() => document.getElementById(`st-tab-${next}`)?.focus());
  }

  // ── 상단 디자인 (바로 적용) ──
  let designError = $state('');
  /** @param {'classic' | 'modern'} design */
  async function chooseHeaderDesign(design) {
    form.headerDesign = design;
    designError = '';
    try { await emit('req-set-header-design', { targetWindow: targetLabel, headerDesign: design }); }
    catch { designError = '디자인을 적용하지 못했어요. 다시 선택해 주세요.'; }
  }

  // ── 새로운 소식 ──
  let newsError = $state('');
  async function showNews() {
    newsError = '';
    try { await openReleaseNews(); }
    catch { newsError = '새로운 소식을 열지 못했어요. 다시 눌러 주세요.'; }
  }

  // ✨ [제자리 조절] UI 글자 크기·글꼴은 이 설정 창 글자에도 바로 적용됩니다.
  //   그러면 위쪽 카드들 높이가 달라진 만큼 지금 만지는 컨트롤이 위아래로 밀려 커서에서 벗어납니다.
  //   조절을 시작한 순간의 화면 위치를 기억해 두고, 글자 전환이 끝날 때까지 매 프레임 밀린 만큼
  //   스크롤을 되돌려 그 자리에 붙잡아 둡니다.
  const PIN_HOLD_MS = 450;
  // 화면이 계속 움직이는 이상한 경우에도 붙잡기가 끝없이 이어지지 않도록 둔 상한입니다.
  const PIN_MAX_EXTRA_MS = 1500;
  /** @type {{ anchor: Element, top: number, until: number, frame: number } | null} */
  let pin = null;

  /** @param {Event} event */
  function holdInPlace(event) {
    const anchor = event.currentTarget;
    if (!scrollBox || !(anchor instanceof Element)) return;
    // 같은 컨트롤을 연달아 움직이는 동안에는 처음 잡은 위치를 그대로 기준으로 씁니다.
    // 왜: 매번 새로 재면 전환 중 조금씩 밀린 위치가 기준이 되어 오차가 쌓입니다.
    // 이 시점은 값만 바뀌고 화면(DOM)은 아직 옛 글자 크기라 "바뀌기 전 위치"가 잡힙니다.
    if (!pin || pin.anchor !== anchor) {
      releasePin();
      pin = { anchor, top: anchor.getBoundingClientRect().top, until: 0, frame: 0 };
    }
    pin.until = performance.now() + PIN_HOLD_MS;
    // 새 글자 크기가 DOM에 들어간 직후(그리기 전)에 한 번, 이후 전환 동안 매 프레임 맞춥니다.
    tick().then(correctDrift);
    if (!pin.frame) pin.frame = requestAnimationFrame(followPin);
  }

  /** 밀린 만큼 스크롤을 되돌리고, 실제로 되돌렸는지(=아직 화면이 움직이는 중인지) 알려 줍니다. */
  function correctDrift() {
    if (!pin || !scrollBox || !pin.anchor.isConnected) return false;
    const drift = pin.anchor.getBoundingClientRect().top - pin.top;
    if (Math.abs(drift) < 0.5) return false;
    scrollBox.scrollTop += drift;
    return true;
  }

  function followPin() {
    if (!pin) return;
    pin.frame = 0;
    const now = performance.now();
    // 상한을 넘긴 뒤 늦게 도착한 프레임은 보정하지 않습니다(그사이 사용자가 옮긴 스크롤을 되돌리지 않도록).
    if (now >= pin.until + PIN_MAX_EXTRA_MS) { pin = null; return; }
    const stillMoving = correctDrift();
    // 정해 둔 시간이 지나도 방금 보정했다면 전환이 아직 끝나지 않은 것이므로 한 프레임 더 따라갑니다.
    // 왜: 창이 가려져 프레임이 늦게 오면 시간만 보고 멈출 때 마지막 전환분이 그대로 밀려 남습니다.
    if (now < pin.until || stillMoving) pin.frame = requestAnimationFrame(followPin);
    else pin = null;
  }

  // 사용자가 직접 스크롤하면 그 뜻이 우선이므로 붙잡기를 바로 풉니다.
  function releasePin() {
    if (pin?.frame) cancelAnimationFrame(pin.frame);
    pin = null;
  }

  // 스크롤바를 잡거나 다른 곳을 누르면 붙잡기를 풉니다. 조절 중인 컨트롤을 다시 누른 것은 그대로 둡니다.
  /** @param {PointerEvent} event */
  function releasePinOnOtherPointer(event) {
    if (pin && event.target !== pin.anchor) releasePin();
  }

  // 휠·누르기는 "사용자가 넘겨받았다"는 신호일 뿐 조작이 아니므로 마크업 대신 리스너로 답니다.
  $effect(() => {
    const box = scrollBox;
    if (!box) return;
    box.addEventListener('wheel', releasePin, { passive: true });
    box.addEventListener('pointerdown', releasePinOnOtherPointer);
    return () => {
      box.removeEventListener('wheel', releasePin);
      box.removeEventListener('pointerdown', releasePinOnOtherPointer);
    };
  });

  // ── 글꼴 추가 ──
  let isUploading = $state(false);
  let fontNotice = $state('');
  let fontError = $state('');

  /** @param {Event & { currentTarget: HTMLInputElement }} event */
  async function handleFontUpload(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    isUploading = true;
    fontNotice = '';
    fontError = '';
    try {
      const fontName = file.name.split('.')[0].replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
      // 이름이 비면 매니저 창이 등록을 조용히 건너뛰므로, 파일을 저장하기 전에 알려 줍니다.
      if (!fontName) throw new Error('글꼴 이름을 만들 수 없는 파일 이름입니다.');
      // 글꼴 파일은 원본 바이트로, 이름은 헤더로 보냅니다(헤더는 ASCII만 되므로 한글 이름은 encodeURIComponent).
      // 왜: 예전의 Array.from(bytes)는 JSON 숫자 배열(원래 크기의 약 3.6배)이 되어, 몇 MB짜리 한글 글꼴을
      //   등록하는 동안 변환·해석 때문에 모든 창이 잠깐 멈췄습니다(claude.md 5번 IPC 규칙).
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fullPath = await invoke('save_custom_font', bytes, {
        headers: { name: encodeURIComponent(file.name) },
      });
      await emit('req-add-custom-font', { name: fontName, path: fullPath });

      form.fontFamily = fontName;
      form.uiFontFamily = fontName;
      fontNotice = `‘${fontName}’ 글꼴을 추가하고 메모 · 화면 글꼴로 골라 두었어요.`;
    } catch (err) {
      console.error('Font upload error:', err);
      fontError = '글꼴을 추가하지 못했어요. 파일을 확인하고 다시 시도해 주세요.';
    } finally {
      isUploading = false;
      // 같은 파일을 다시 골라도 change 이벤트가 오도록 비웁니다.
      input.value = '';
    }
  }

  // ── 앱 업데이트 ──
  // 설정 창은 매니저가 아니므로 직접 네트워크를 부르지 않습니다.
  // requestUpdateCheck()가 매니저 창에 요청을 넘기고, 결과는 IPC로 되돌아옵니다.
  function handleCheckUpdate() {
    appState.requestUpdateCheck();
  }

  // [지금 업데이트] — 앱이 직접 내려받아 설치합니다. 진행 상황은 Rust가 모든 창에 방송합니다.
  function handleInstallUpdate() {
    appState.installUpdate();
  }

  // 앱 안 설치가 안 될 때의 대안: 브라우저로 설치 파일을 받습니다.
  async function handleDownloadUpdate() {
    await appState.openUpdateDownload();
  }

  // 버전을 코드에 박아두면 배포 때 갱신을 빠뜨려 실제 버전과 어긋납니다.
  // appState.appVersion은 tauri.conf.json의 version을 그대로 읽어 오고, 읽기 전에는 package.json 값을 보입니다.
  const currentVersion = $derived(appState.appVersion || packageVersion);
  const installPhase = $derived(appState.updateInstallPhase);
  const isInstalling = $derived(isInstallActive(installPhase));
  const installPercent = $derived(
    installPhase === 'downloading' ? downloadPercent(appState.updateInstallDownloaded, appState.updateInstallTotal) : null,
  );
  const installStatusText = $derived.by(() => {
    if (installPhase === 'checking') return '새 버전 정보를 확인하고 있어요…';
    if (installPhase === 'downloading') return `내려받는 중 · ${describeDownloadProgress(appState.updateInstallDownloaded, appState.updateInstallTotal)}`;
    if (installPhase === 'preparing') return '모든 창의 내용을 저장하고 있어요…';
    if (installPhase === 'installing') return '설치를 시작해요. 잠시 뒤 새 버전으로 다시 열려요';
    return '';
  });
  const showUpdateBox = $derived(
    (appState.updatePhase === 'available' && appState.updateInfo) || isInstalling || installPhase === 'failed',
  );

  // ── 초기화 · 확인 창 ──
  // 'config'     설정 초기화 확인
  // 'wipe-warn'  데이터 초기화 첫 번째 경고 (무엇이 지워지는지)
  // 'wipe-final' 데이터 초기화 두 번째 경고 (마지막 확인, 잠깐 기다려야 눌림)
  // 'wiping'     지우는 중 (성공하면 곧 앱이 다시 시작됩니다)
  /** @type {null | 'config' | 'wipe-warn' | 'wipe-final' | 'wiping'} */
  let dialog = $state(null);
  let dialogError = $state('');
  let dialogBusy = $state(false);
  /** @type {HTMLDivElement | null} */
  let dialogEl = $state(null);
  /** @type {HTMLElement | null} */
  let focusBeforeDialog = null;

  let wipeSecondsLeft = $state(0);
  /** @type {ReturnType<typeof setInterval> | null} */
  let wipeTimer = null;

  function stopWipeCountdown() {
    if (wipeTimer) clearInterval(wipeTimer);
    wipeTimer = null;
  }

  /** @param {'config' | 'wipe-warn' | 'wipe-final'} kind */
  function openDialog(kind) {
    if (!dialog && document.activeElement instanceof HTMLElement) focusBeforeDialog = document.activeElement;
    stopWipeCountdown();
    dialogError = '';
    dialog = kind;
    if (kind === 'wipe-final') {
      // 첫 번째 [계속]과 같은 자리에 [모두 지우기]가 나타나므로, 빠르게 두 번 눌러도 지나가지 않게 잠깐 잠급니다.
      const openedAt = Date.now();
      wipeSecondsLeft = wipeArmSecondsLeft(openedAt, openedAt);
      wipeTimer = setInterval(() => {
        wipeSecondsLeft = wipeArmSecondsLeft(openedAt, Date.now());
        if (wipeSecondsLeft === 0) stopWipeCountdown();
      }, 200);
    }
  }

  function closeDialog() {
    // 지우기가 시작된 뒤에는 닫아도 멈추지 않으므로, 실패했을 때만 닫을 수 있습니다.
    if (dialogBusy || (dialog === 'wiping' && !dialogError)) return;
    stopWipeCountdown();
    dialog = null;
    dialogError = '';
    // 확인 창을 연 버튼으로 초점을 돌려줍니다.
    // 뒤 화면의 잠금(inert)이 풀린 다음이어야 초점이 들어가므로 화면이 갱신된 뒤에 옮깁니다.
    const opener = focusBeforeDialog;
    focusBeforeDialog = null;
    tick().then(() => opener?.focus());
  }

  // 확인 창이 뜨거나 단계가 바뀌면 [취소]에 초점을 둡니다(Enter를 눌러도 지워지지 않는 쪽).
  $effect(() => {
    const current = dialog;
    const box = dialogEl;
    if (!current || !box) return;
    tick().then(() => /** @type {HTMLElement | null} */ (box.querySelector('[data-autofocus]'))?.focus());
  });

  /** @param {KeyboardEvent} event */
  function handleWindowKeydown(event) {
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    // 확인 창이 떠 있는 동안 Tab은 그 안의 버튼 사이에서만 돕니다.
    if (event.key === 'Tab' && dialogEl) {
      const buttons = /** @type {HTMLElement[]} */ ([...dialogEl.querySelectorAll('button:not(:disabled)')]);
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      if (!dialogEl.contains(active)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }
  }

  // 설정 초기화: 이 메모 창의 모양·글자·창 크기와, 앱 전체의 알림·소리·자동 실행을 처음 상태로 되돌립니다.
  // 할 일·메모 같은 내용은 건드리지 않습니다.
  async function resetConfig() {
    if (dialogBusy) return;
    dialogBusy = true;
    dialogError = '';
    try {
      // 등록 변경이 실패하면 다른 설정을 먼저 초기화하지 않고, 확인 창에서 다시 시도하게 합니다.
      launchAtStartup = initialLaunch = await setLaunchAtStartup(true);
      // 1) 메모 창이 자기 모양·글자·창 크기를 되돌립니다.
      await emitTo(targetLabel, 'req-reset-config');
      // 2) 알림·무음은 리마인더를 맡은 매니저 창도 함께 바꿔야 하므로, [반영]과 같은 방송으로 기본값을 보냅니다.
      await emit('req-apply-settings', toApplyPayload(SETTINGS_DEFAULTS, targetLabel));
      await getCurrentWindow().close();
    } catch (e) {
      console.error('설정 초기화 실패:', e);
      dialogError = '설정을 초기화하지 못했어요. 다시 시도해 주세요.';
    } finally {
      dialogBusy = false;
    }
  }

  // 데이터 초기화: 앱 데이터 폴더를 통째로 비우고 처음 설치한 상태로 다시 시작합니다.
  // 실제 삭제는 Rust(factory_reset.rs)가 다시 시작한 직후, 어떤 창도 파일을 열기 전에 합니다.
  async function wipeEverything() {
    if (dialog !== 'wipe-final' || wipeSecondsLeft > 0) return;
    stopWipeCountdown();
    dialog = 'wiping';
    dialogError = '';
    try {
      await invoke('factory_reset');
      // 성공하면 잠시 뒤 앱이 닫혔다가 다시 열립니다. 그때까지 "지우는 중" 화면을 그대로 둡니다.
    } catch (e) {
      console.error('데이터 초기화 실패:', e);
      dialogError = e === 'BUSY'
        ? '앱을 종료하거나 업데이트하는 중에는 초기화할 수 없어요. 잠시 뒤 다시 시도해 주세요.'
        : '초기화를 시작하지 못했어요. 지워진 것은 없어요. 다시 시도해 주세요.';
    }
  }

  // ── 반영 · 취소 ──
  let applying = $state(false);

  async function closeWindow() {
    await getCurrentWindow().close();
  }

  async function applySettings() {
    if (applying) return;
    applying = true;
    launchError = '';
    try {
      // 자동 실행은 Windows 등록을 바꾸는 일이라 실패할 수 있습니다.
      // 실패하면 창을 닫지 않고 그 자리에서 알려, 바뀐 줄 알고 넘어가지 않게 합니다.
      if (launchChanged) {
        try {
          await setLaunchAtStartup(launchAtStartup);
          initialLaunch = launchAtStartup;
        } catch (e) {
          console.error('자동 실행 설정 실패:', e);
          launchError = '자동 실행 설정을 바꾸지 못했어요. 다시 시도해 주세요.';
          selectTab('behavior');
          return;
        }
      }
      // ✨ Phase 4: 글로벌 킬 스위치 및 통합 리마인더 설정 적용을 전역으로 브로드캐스트
      await emit('req-apply-settings', toApplyPayload(form, targetLabel));
      track('settings_applied');
      if (form.themeColor !== initial.themeColor) track('theme_changed', { choice: form.themeColor });
      await getCurrentWindow().close();
    } finally {
      applying = false;
    }
  }

  onMount(async () => {
    // ✨ 1. 무전을 받으면 타겟 이름과 그 창의 최신 설정값으로 화면을 덮어씁니다!
    unlistenTarget = await listen('set-settings-target', (event) => {
      const data = /** @type {{ targetLabel: string, settings: Record<string, any> }} */ (event.payload);
      targetLabel = data.targetLabel;
      // 나를 부른 메모장의 진짜 설정으로 화면을 맞춥니다.
      // 전체 무음은 앱 전체 값이라, 보낸 값에 없으면 이 창이 읽어 둔 값을 씁니다.
      const received = readSettingsForm(data.settings, { globalMuteSound: appState.globalMuteSound });
      form = received;
      initial = { ...received };
    });

    // ✨ 2. 수신기 세팅이 끝났으니, 메모장들에게 "나 준비됐어!" 라고 알립니다.
    // (appState.init()은 App.svelte onMount에서 이미 완료됨 — 재호출 불필요)
    await emit('settings-ready');

    // 자동 실행의 현재 상태(Windows 등록)를 읽어 스위치를 엽니다.
    try {
      launchAtStartup = initialLaunch = await readLaunchAtStartup();
    } catch (e) {
      console.warn('자동 실행 상태를 읽지 못했습니다:', e);
    } finally {
      launchReady = true;
    }
  });

  onDestroy(() => {
    if (unlistenTarget) unlistenTarget();
    releasePin();
    stopWipeCountdown();
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- 루트에 여백을 두지 않습니다.
     왜: 여백을 주면 창 가장자리에 투명 띠가 생기는데, 이 창은 transparent:true 라서 그 띠로 뒤 화면이 그대로 비칩니다.
       둥근 모서리와 맞물려 네 귀퉁이에 각진 잔재처럼 보이던 원인입니다. 배경 컨테이너가 창을 꽉 채웁니다. -->
<div
  class="st-root"
  class:st-dark={form.isDarkMode}
  style="font-family:{uiFontStack}; font-size:{form.uiFontSize}pt; --st-bg:{form.isDarkMode ? '#232530' : theme.bg}; --st-accent:{accent};"
>
  <!-- 확인 창이 떠 있는 동안 뒤 화면은 누르거나 Tab으로 들어갈 수 없습니다(inert). -->
  <div class="st-main" inert={dialog !== null}>
    <header class="st-head" data-tauri-drag-region>
      <h1 data-tauri-drag-region>시스템 설정</h1>
      <button type="button" class="st-close" aria-label="설정 닫기" title="닫기" onclick={closeWindow}><X size="1.15em" /></button>
    </header>

    <div class="st-tabs" role="tablist" aria-label="설정 묶음">
      {#each SETTINGS_TABS as tab (tab.id)}
        {@const TabIcon = TAB_ICONS[tab.id]}
        <button
          type="button"
          role="tab"
          id="st-tab-{tab.id}"
          class="st-tab"
          class:is-active={activeTab === tab.id}
          aria-selected={activeTab === tab.id}
          aria-controls="st-page"
          tabindex={activeTab === tab.id ? 0 : -1}
          onclick={() => selectTab(tab.id)}
          onkeydown={handleTabKeydown}
        >
          <TabIcon size="1.15em" strokeWidth={2.2} aria-hidden="true" />
          <!-- 점은 글자 크기가 달라져도 이름 바로 옆에 붙어 있도록 이름표 안에 둡니다. -->
          <span class="st-tab-label">
            {tab.label}{#if pendingTabs.has(tab.id)}<i class="st-tab-dot" title="반영 전 변경이 있어요"></i>{/if}
          </span>
        </button>
      {/each}
    </div>

    <!-- custom-scrollbar: ThemePicker가 이 이름으로 스크롤 상자를 찾아, 스크롤하면 열린 목록을 닫습니다. -->
    <div
      bind:this={scrollBox}
      id="st-page"
      class="st-body custom-scrollbar"
      role="tabpanel"
      aria-labelledby="st-tab-{activeTab}"
      tabindex="-1"
    >
      {#key activeTab}
        <div class="st-page">
          {#if activeTab === 'look'}
            <!-- 다크 모드는 테마의 밝기 선택이라 같은 묶음의 제목 옆에 둡니다(예전에는 맨 아래 스위치 목록에 떨어져 있었습니다). -->
            <SettingsPanel icon={Palette} title="테마">
              {#snippet aside()}
                <button
                  type="button"
                  role="switch"
                  class="st-mini-switch"
                  aria-checked={form.isDarkMode}
                  onclick={() => { form.isDarkMode = !form.isDarkMode; }}
                >
                  <Moon size={13} strokeWidth={2.4} aria-hidden="true" />
                  <span>다크 모드</span>
                  <span class="st-mini-knob" aria-hidden="true"><i></i></span>
                </button>
              {/snippet}
              <ThemeSwatches bind:value={form.themeColor} />
            </SettingsPanel>

            <SettingsPanel icon={PanelTop} title="상단 디자인" tag="바로 적용">
              <div class="st-choices" role="radiogroup" aria-label="상단 디자인">
                <label class="st-choice" class:is-selected={form.headerDesign === 'classic'}>
                  <input type="radio" name="header-design" value="classic" checked={form.headerDesign === 'classic'} onchange={() => chooseHeaderDesign('classic')} />
                  <span class="st-choice-art"><HeaderLayoutIcon variant="classic" /></span>
                  <span class="st-choice-text"><strong>클래식</strong><small>익숙한 아이콘 배치</small></span>
                </label>
                <label class="st-choice" class:is-selected={form.headerDesign === 'modern'}>
                  <input type="radio" name="header-design" value="modern" checked={form.headerDesign === 'modern'} onchange={() => chooseHeaderDesign('modern')} />
                  <span class="st-choice-art"><HeaderLayoutIcon variant="modern" /></span>
                  <span class="st-choice-text"><strong>모던</strong><small>이름이 보이는 도구</small></span>
                </label>
              </div>
              {#if designError}<p class="st-error" role="alert">{designError}</p>{/if}
            </SettingsPanel>

            <SettingsPanel icon={Eye} title="보이는 영역">
              <SwitchRow
                icon={Archive}
                label="마감된 일"
                description="끝낸 할 일 목록을 보여 줘요"
                checked={form.showArchived}
                onchange={(value) => { form.showArchived = value; }}
              />
              <SwitchRow
                icon={FileText}
                label="중요한 일 메모"
                description="맨 아래 메모 칸을 보여 줘요"
                checked={form.showNotes}
                onchange={(value) => { form.showNotes = value; }}
              />
            </SettingsPanel>

          {:else if activeTab === 'text'}
            <SettingsPanel icon={PenLine} title="메모 글자" caption="할 일과 메모에 쓰는 글자">
              <label class="st-field">
                <span class="st-field-label">글꼴</span>
                <span class="st-select">
                  <select bind:value={form.fontFamily} style="font-family:{memoFontStack};">
                    {#each appState.allFonts as font}
                      <option value={font.name} style="font-family:{font.family};">{font.name}</option>
                    {/each}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
              </label>
              <div class="st-field">
                <span class="st-field-label" id="st-memo-size">크기</span>
                <span class="st-slider">
                  <input
                    class="st-range"
                    type="range"
                    min={FONT_SIZE_RANGE.min}
                    max={FONT_SIZE_RANGE.max}
                    step="1"
                    bind:value={form.fontSize}
                    aria-labelledby="st-memo-size"
                    style="--fill:{fillPercent(form.fontSize, FONT_SIZE_RANGE)}%;"
                  />
                  <output class="st-value">{form.fontSize}pt</output>
                </span>
              </div>
              <!-- 미리보기: 고른 글꼴·크기 그대로 보여 줍니다. 상자 높이는 고정이라 크기를 바꿔도 아래가 밀리지 않습니다. -->
              <p class="st-sample" style="font-family:{memoFontStack}; font-size:{form.fontSize}pt;" aria-hidden="true">오늘 할 일 · Abc 123</p>
              <p class="st-note">글꼴을 바꾸면 이미 적어 둔 글의 글꼴도 함께 바뀌어요.</p>
            </SettingsPanel>

            <SettingsPanel icon={Monitor} title="화면 글자" caption="버튼 · 메뉴 · 제목에 쓰는 글자">
              <label class="st-field">
                <span class="st-field-label">글꼴</span>
                <span class="st-select">
                  <select bind:value={form.uiFontFamily} onchange={holdInPlace}>
                    {#each appState.allFonts as font}
                      <option value={font.name} style="font-family:{font.family};">{font.name}</option>
                    {/each}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
              </label>
              <div class="st-field">
                <span class="st-field-label" id="st-ui-size">크기</span>
                <span class="st-slider">
                  <input
                    class="st-range"
                    type="range"
                    min={UI_FONT_SIZE_RANGE.min}
                    max={UI_FONT_SIZE_RANGE.max}
                    step="1"
                    bind:value={form.uiFontSize}
                    oninput={holdInPlace}
                    aria-labelledby="st-ui-size"
                    style="--fill:{fillPercent(form.uiFontSize, UI_FONT_SIZE_RANGE)}%;"
                  />
                  <output class="st-value">{form.uiFontSize}pt</output>
                </span>
              </div>
              <!-- 따로 미리보기를 두지 않습니다: 이 설정 창의 글자가 고르는 즉시 바뀌어 그대로 보입니다. -->
            </SettingsPanel>

            <!-- 글꼴 추가는 한 줄짜리 묶음입니다. 결과 안내가 있을 때만 아래 칸이 생깁니다. -->
            {#snippet fontPicker()}
              <label class="st-btn st-btn-small st-btn-outline st-file" class:is-busy={isUploading}>
                <input type="file" accept=".ttf,.otf" onchange={handleFontUpload} disabled={isUploading} />
                {#if isUploading}
                  <LoaderCircle size={12} class="st-spin" aria-hidden="true" />설치 중…
                {:else}
                  <Upload size={12} strokeWidth={2.6} aria-hidden="true" />파일 고르기
                {/if}
              </label>
            {/snippet}
            {#snippet fontResult()}
              {#if fontNotice}<p class="st-note st-good st-flush" role="status">{fontNotice}</p>{/if}
              {#if fontError}<p class="st-error st-flush" role="alert">{fontError}</p>{/if}
            {/snippet}
            <SettingsPanel
              icon={FileType}
              title="글꼴 추가"
              caption=".ttf · .otf 글꼴 파일을 등록해요"
              aside={fontPicker}
              children={fontNotice || fontError ? fontResult : undefined}
            />

          {:else if activeTab === 'behavior'}
            <SettingsPanel icon={Power} title="시작" tag="앱 전체">
              <SwitchRow
                icon={Power}
                label="컴퓨터를 켜면 자동 실행"
                description="Windows와 함께 Tidy Task가 시작되고, 창이 마지막에 있던 위치와 크기 그대로 열려요."
                checked={launchAtStartup}
                disabled={!launchReady || applying}
                onchange={(value) => { launchAtStartup = value; launchError = ''; }}
              />
              {#if launchError}<p class="st-error" role="alert">{launchError}</p>{/if}
            </SettingsPanel>

            <SettingsPanel icon={BellRing} title="알림과 소리" tag="모든 창">
              <SwitchRow
                icon={Bell}
                label="통합 리마인더"
                description="마감이 가까운 할 일을 모아 알려 줘요"
                checked={form.showReminders}
                onchange={(value) => { form.showReminders = value; }}
              />
              <SwitchRow
                icon={VolumeX}
                label="전체 무음 모드"
                description="시작음과 알림음을 모두 꺼요"
                checked={form.globalMuteSound}
                onchange={(value) => { form.globalMuteSound = value; }}
              />
            </SettingsPanel>

            <SettingsPanel icon={Shapes} title="수업 도구" tag="바로 적용">
              <ToolkitToggle variant="panel" isDarkMode={form.isDarkMode} {accent} />
            </SettingsPanel>

          {:else}
            <button type="button" class="st-news" onclick={showNews}>
              <span class="st-news-icon" aria-hidden="true"><Sparkles size={15} strokeWidth={2.3} /></span>
              <span class="st-news-text">
                <strong>새로운 소식</strong>
                <small>5.6.3 업데이트 · 지난 소식 · 롤링 썬더</small>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            {#if newsError}<p class="st-error" role="alert">{newsError}</p>{/if}

            <!-- ✨ [앱 업데이트] 사용자가 직접 확인하고 싶을 때 쓰는 자리입니다.
                 왜 설정 안에 두는가: 자동 알림을 "나중에/건너뛰기"로 넘긴 사용자도
                 원할 때 스스로 확인할 수 있는 고정된 경로가 반드시 하나는 필요합니다. -->
            <SettingsPanel icon={Download} title="앱 업데이트" caption="지금 쓰는 버전 · v{currentVersion}">
              <div class="st-update-line">
                <!-- 확인 결과를 이 자리에서 바로 알려 줍니다(창을 옮겨 다니지 않아도 되도록). -->
                {#if appState.updatePhase === 'uptodate' && !showUpdateBox}
                  <p class="st-note st-good" role="status">이미 최신 버전을 쓰고 계세요.</p>
                {:else if appState.updatePhase === 'error' && !showUpdateBox}
                  <p class="st-error" role="alert">{describeUpdateError(appState.updateErrorCode)}</p>
                {:else}
                  <p class="st-note">새 버전은 앱이 자동으로 확인해 알려 드려요.</p>
                {/if}
                <button
                  type="button"
                  class="st-btn st-btn-small st-btn-outline"
                  onclick={handleCheckUpdate}
                  disabled={appState.updatePhase === 'checking'}
                >
                  {appState.updatePhase === 'checking' ? '확인 중…' : '업데이트 확인'}
                </button>
              </div>

              {#if showUpdateBox}
                <div class="st-update-box">
                  {#if appState.updateInfo}
                    <p class="st-update-title">
                      새 버전 v{appState.updateInfo.version} 이 나왔어요
                      {#if appState.updateInfo.assetSize}<span>({formatBytes(appState.updateInfo.assetSize)})</span>{/if}
                    </p>
                  {/if}

                  {#if isInstalling}
                    <!-- 진행 상황: 내려받는 동안만 비율을 보여 주고, 그 밖의 단계는 문구로 알립니다. -->
                    <div class="st-progress" role="status" aria-live="polite">
                      {#if installPercent !== null}
                        <div class="st-progress-track"><div class="st-progress-fill" style="width:{installPercent}%;"></div></div>
                      {/if}
                      <p>{installStatusText}</p>
                    </div>
                    {#if installPhase === 'checking' || installPhase === 'downloading'}
                      <button type="button" class="st-btn st-btn-small st-btn-block" onclick={() => appState.cancelUpdateInstall()}>취소</button>
                    {/if}
                  {:else}
                    {#if installPhase === 'failed'}
                      <p class="st-error" role="alert">{describeInstallError(appState.updateInstallErrorCode)}</p>
                    {:else}
                      <p class="st-note">
                        누르면 새 버전을 내려받아 설치합니다. 설치하는 동안 Tidy Task가 잠시 닫혔다가
                        새 버전으로 다시 열려요. 작성하신 할 일과 메모는 설치 직전에 모두 저장됩니다.
                      </p>
                    {/if}
                    <button type="button" class="st-btn st-btn-small st-btn-block st-btn-primary" onclick={handleInstallUpdate}>
                      <Download size={12} strokeWidth={3} aria-hidden="true" />
                      {installPhase === 'failed' ? '다시 시도' : '지금 업데이트'}
                    </button>
                    {#if installPhase === 'failed'}
                      <!-- 앱 안 설치가 안 될 때의 대안: 예전처럼 브라우저로 설치 파일을 받습니다. -->
                      <button type="button" class="st-btn st-btn-small st-btn-block st-btn-outline" onclick={handleDownloadUpdate}>
                        직접 내려받기 (인터넷 창에서 받아 실행)
                      </button>
                    {/if}
                  {/if}
                </div>
              {/if}
            </SettingsPanel>

            <SettingsPanel icon={RotateCcw} title="초기화">
              <div class="st-action">
                <span class="st-action-text">
                  <strong>설정 초기화</strong>
                  <small>모양 · 글자 · 동작 설정만 처음으로 되돌려요. 할 일과 메모는 그대로예요.</small>
                </span>
                <button type="button" class="st-btn st-btn-small st-btn-outline" onclick={() => openDialog('config')}>초기화</button>
              </div>
              <div class="st-action">
                <span class="st-action-text">
                  <strong class="st-danger-text">데이터 초기화</strong>
                  <small>메모 · 툴킷 자료 · 설정을 전부 지우고 처음 설치한 상태로 돌아가요.</small>
                </span>
                <!-- 업데이트를 설치하는 중에는 막습니다. 두 절차 모두 앱을 다시 시작해 순서가 엉킵니다. -->
                <button type="button" class="st-btn st-btn-small st-btn-danger-outline" disabled={isInstalling} onclick={() => openDialog('wipe-warn')}>
                  모두 지우기
                </button>
              </div>
            </SettingsPanel>

            <p class="st-credit">
              <img src="/chaltteok.webp" alt="" />
              <span>© 2026 찰떡쌤. All rights reserved.</span>
              <span class="st-version">v{currentVersion}</span>
            </p>
          {/if}
        </div>
      {/key}
    </div>

    <footer class="st-foot">
      <p class="st-pending" aria-live="polite">
        {#if pendingCount > 0}<i aria-hidden="true"></i>바꾼 설정 {pendingCount}개 · 반영 전{/if}
      </p>
      <button type="button" class="st-btn" onclick={closeWindow}>취소</button>
      <button type="button" class="st-btn st-btn-primary st-btn-apply" onclick={applySettings} disabled={applying}>반영</button>
    </footer>
  </div>

  {#if dialog}
    <!-- 가림막을 잡고도 창을 옮길 수 있게 끌기 영역으로 둡니다. -->
    <div class="st-scrim" transition:fade={{ duration: 130 }} data-tauri-drag-region>
      <div
        bind:this={dialogEl}
        class="st-dialog"
        class:is-danger={dialog !== 'config'}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="st-dialog-title"
        aria-describedby="st-dialog-desc"
        transition:scale={{ duration: 160, start: 0.96 }}
      >
        {#if dialog === 'config'}
          <span class="st-dialog-icon" aria-hidden="true"><RotateCcw size={20} strokeWidth={2.3} /></span>
          <h2 id="st-dialog-title">설정을 처음 상태로 되돌릴까요?</h2>
          <p id="st-dialog-desc">
            이 메모 창의 테마 · 글자 · 보이는 영역 · 창 크기와, 알림 · 소리 · 자동 실행 설정이 처음 상태로 돌아가요.
            <b>할 일과 메모는 지워지지 않아요.</b>
          </p>
          {#if dialogError}<p class="st-error" role="alert">{dialogError}</p>{/if}
          <div class="st-dialog-actions">
            <button type="button" class="st-btn" data-autofocus disabled={dialogBusy} onclick={closeDialog}>취소</button>
            <button type="button" class="st-btn st-btn-primary" disabled={dialogBusy} onclick={resetConfig}>
              {dialogBusy ? '되돌리는 중…' : '설정 초기화'}
            </button>
          </div>

        {:else if dialog === 'wipe-warn'}
          <span class="st-dialog-step">1 / 2</span>
          <span class="st-dialog-icon" aria-hidden="true"><TriangleAlert size={20} strokeWidth={2.3} /></span>
          <h2 id="st-dialog-title">모든 데이터를 지울까요?</h2>
          <div id="st-dialog-desc">
            <p>Tidy Task에 저장된 내용이 <b>전부</b> 사라져요.</p>
            <ul>
              <li>모든 메모 창 · Tiny Note · 보관함의 할 일과 메모</li>
              <li>툴킷 자료 — 학급 명단, 점수판, 온도계, 투표 기록, 알림장, 자리 배치 등</li>
              <li>급식 설정, 등록한 글꼴, 모든 설정과 백업 파일</li>
            </ul>
          </div>
          <div class="st-dialog-actions">
            <button type="button" class="st-btn" data-autofocus onclick={closeDialog}>취소</button>
            <button type="button" class="st-btn st-btn-danger" onclick={() => openDialog('wipe-final')}>계속</button>
          </div>

        {:else if dialog === 'wipe-final'}
          <span class="st-dialog-step">2 / 2</span>
          <span class="st-dialog-icon" aria-hidden="true"><Trash2 size={20} strokeWidth={2.3} /></span>
          <h2 id="st-dialog-title">정말 모두 지울까요?</h2>
          <p id="st-dialog-desc">
            마지막 확인이에요. 지운 뒤에는 <b>되돌릴 수 없어요.</b>
            [모두 지우기]를 누르면 Tidy Task가 닫혔다가 처음 설치한 상태로 다시 열려요.
          </p>
          <div class="st-dialog-actions">
            <button type="button" class="st-btn" data-autofocus onclick={closeDialog}>취소</button>
            <button type="button" class="st-btn st-btn-danger" disabled={wipeSecondsLeft > 0} onclick={wipeEverything}>
              {wipeSecondsLeft > 0 ? `모두 지우기 (${wipeSecondsLeft})` : '모두 지우기'}
            </button>
          </div>

        {:else}
          {#if dialogError}
            <span class="st-dialog-icon" aria-hidden="true"><TriangleAlert size={20} strokeWidth={2.3} /></span>
            <h2 id="st-dialog-title">초기화하지 못했어요</h2>
            <p id="st-dialog-desc" role="alert">{dialogError}</p>
            <div class="st-dialog-actions">
              <button type="button" class="st-btn" data-autofocus onclick={closeDialog}>닫기</button>
            </div>
          {:else}
            <span class="st-dialog-icon" aria-hidden="true"><LoaderCircle size={20} strokeWidth={2.3} class="st-spin" /></span>
            <h2 id="st-dialog-title">지우는 중이에요…</h2>
            <p id="st-dialog-desc" role="status">곧 Tidy Task가 닫혔다가 처음 상태로 다시 열려요.</p>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* ── 색 · 공통 값 ─────────────────────────────────────────────
     --st-bg(창 배경)와 --st-accent(강조색)는 고른 테마에서 옵니다(위 style 속성).
     나머지는 밝은 화면 / 다크 모드 두 벌입니다. 하위 컴포넌트(SettingsPanel · SwitchRow)도 이 값을 씁니다.
     글자 크기는 모두 em이라 "UI 글자 크기"를 바꾸면 창 전체가 함께 커지고 작아집니다. */
  .st-root {
    --st-ink: #1f2937;
    --st-sub: #4b5563;
    --st-muted: #6b7280;
    --st-edge: rgba(15, 23, 42, 0.12);
    --st-line: rgba(15, 23, 42, 0.09);
    --st-line-soft: rgba(15, 23, 42, 0.07);
    --st-panel: rgba(255, 255, 255, 0.72);
    --st-field: #ffffff;
    --st-card: #ffffff;
    --st-piece: rgba(15, 23, 42, 0.025);
    --st-piece-hover: rgba(15, 23, 42, 0.055);
    --st-tone-accent: var(--st-accent);
    --st-bubble-mix: 13%;
    --st-bubble-ink: 90%;
    --st-chrome: rgba(15, 23, 42, 0.035);
    --st-hover: rgba(15, 23, 42, 0.06);
    --st-track: rgba(15, 23, 42, 0.2);
    --st-on-accent: #ffffff;
    /* 밝은 화면에서 흰 글자가 읽히도록 채운 버튼은 강조색을 조금 짙게 씁니다. */
    --st-accent-fill: color-mix(in srgb, var(--st-accent) 84%, #000);
    --st-accent-soft: color-mix(in srgb, var(--st-accent) 12%, transparent);
    --st-accent-line: color-mix(in srgb, var(--st-accent) 42%, transparent);
    --st-good: #047857;
    --st-danger: #b9322a;
    --st-danger-fill: #b9322a;
    --st-danger-soft: rgba(185, 50, 42, 0.09);
    --st-danger-line: rgba(185, 50, 42, 0.4);

    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    border: 1px solid var(--st-edge);
    border-radius: 14px;
    background: var(--st-bg);
    color: var(--st-ink);
    line-height: 1.5;
    letter-spacing: 0;
    /* 한글 설명이 낱말 중간에서 끊기지 않게 띄어쓰기에서 줄을 바꿉니다(너무 긴 낱말만 중간에서 끊음). */
    word-break: keep-all;
    overflow-wrap: anywhere;
    transition: background-color 0.25s, color 0.25s;
  }
  .st-root.st-dark {
    --st-ink: #e5e7eb;
    --st-sub: #cbd5e1;
    --st-muted: #9aa5b8;
    --st-edge: rgba(255, 255, 255, 0.16);
    --st-line: rgba(255, 255, 255, 0.1);
    --st-line-soft: rgba(255, 255, 255, 0.07);
    --st-panel: rgba(255, 255, 255, 0.045);
    --st-field: #2d303e;
    --st-card: #2d303e;
    --st-piece: rgba(255, 255, 255, 0.035);
    --st-piece-hover: rgba(255, 255, 255, 0.07);
    --st-bubble-mix: 20%;
    --st-bubble-ink: 90%;
    --st-chrome: rgba(0, 0, 0, 0.2);
    --st-hover: rgba(255, 255, 255, 0.08);
    --st-track: rgba(255, 255, 255, 0.22);
    --st-on-accent: #1a1b23;
    --st-accent-fill: var(--st-accent);
    --st-accent-soft: color-mix(in srgb, var(--st-accent) 16%, transparent);
    --st-good: #6ee7b7;
    --st-danger: #fca5a5;
    --st-danger-fill: #dc2626;
    --st-danger-soft: rgba(248, 113, 113, 0.13);
    --st-danger-line: rgba(248, 113, 113, 0.45);
  }
  :global(body) { background: transparent !important; }

  .st-main {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* ── 머리 ── */
  .st-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px 8px 16px;
    cursor: move;
    user-select: none;
  }
  .st-head h1 {
    margin: 0;
    font-size: 0.94em;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .st-close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--st-muted);
    cursor: pointer;
    transition: background-color 0.12s, color 0.12s;
  }
  .st-close:hover { background: var(--st-hover); color: var(--st-ink); }

  /* ── 탭 ── */
  .st-tabs {
    flex: none;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
    margin: 0 12px;
    padding: 3px;
    border-radius: 12px;
    background: var(--st-chrome);
  }
  .st-tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    padding: 6px 4px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--st-muted);
    font: inherit;
    font-size: 0.82em;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .st-tab-label { position: relative; white-space: nowrap; }
  .st-tab:hover { color: var(--st-ink); }
  .st-tab.is-active {
    background: var(--st-field);
    color: var(--st-accent);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
  }
  .st-dark .st-tab.is-active {
    background: rgba(255, 255, 255, 0.1);
    box-shadow: none;
  }
  .st-tab-dot {
    position: absolute;
    top: -1px;
    right: -8px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--st-accent);
  }

  /* ── 본문 ── */
  .st-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px 12px;
    outline: none;
  }
  .st-page {
    display: flex;
    flex-direction: column;
    gap: 9px;
    animation: st-page-in 0.16s ease-out;
  }
  @keyframes st-page-in {
    from { opacity: 0; transform: translateY(4px); }
  }
  .custom-scrollbar::-webkit-scrollbar { width: 5px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--st-track); border-radius: 10px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }

  .st-note,
  .st-error {
    margin: 8px 0 0;
    font-size: 0.72em;
    font-weight: 500;
    line-height: 1.55;
    color: var(--st-muted);
    text-wrap: pretty;
  }
  .st-error { color: var(--st-danger); font-weight: 700; }
  .st-good { color: var(--st-good); font-weight: 700; }

  /* ── 상단 디자인 고르기 ── */
  .st-choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .st-choice {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 9px;
    border: 1px solid var(--st-line);
    border-radius: 10px;
    background: var(--st-field);
    cursor: pointer;
    transition: border-color 0.14s, background-color 0.14s, box-shadow 0.14s;
  }
  .st-dark .st-choice { background: rgba(255, 255, 255, 0.03); }
  .st-choice:hover { border-color: var(--st-accent-line); }
  .st-choice.is-selected {
    border-color: var(--st-accent);
    background: var(--st-accent-soft);
    box-shadow: 0 0 0 1px var(--st-accent) inset;
  }
  /* 라디오 버튼은 보이지 않게 두고(키보드·화면 낭독기는 그대로 씀) 카드 전체로 고릅니다. */
  .st-choice input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .st-choice:has(input:focus-visible) { outline: 2px solid var(--st-accent); outline-offset: 2px; }
  .st-choice-art { flex: none; display: flex; color: var(--st-muted); }
  .st-choice-text { min-width: 0; display: flex; flex-direction: column; }
  .st-choice.is-selected .st-choice-art { color: var(--st-accent); }
  .st-choice strong { font-size: 0.84em; font-weight: 700; line-height: 1.35; }
  .st-choice small { font-size: 0.68em; line-height: 1.4; color: var(--st-muted); white-space: nowrap; }

  /* ── 글자 탭: 이름표 + 컨트롤 한 줄 ── */
  .st-field {
    display: grid;
    grid-template-columns: 2.6em minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }
  .st-field + .st-field { margin-top: 9px; }
  .st-field-label {
    font-size: 0.8em;
    font-weight: 700;
    color: var(--st-sub);
  }
  .st-select {
    position: relative;
    display: block;
  }
  .st-select select {
    width: 100%;
    padding: 0.5em 2em 0.5em 0.7em;
    border: 1px solid var(--st-line);
    border-radius: 9px;
    background: var(--st-field);
    color: var(--st-ink);
    font-size: 0.84em;
    appearance: none;
    cursor: pointer;
    outline: none;
    transition: border-color 0.14s, box-shadow 0.14s;
  }
  .st-select select:hover,
  .st-select select:focus-visible {
    border-color: var(--st-accent-line);
    box-shadow: 0 0 0 3px var(--st-accent-soft);
  }
  .st-select option { background: var(--st-field); color: var(--st-ink); }
  .st-select :global(svg) {
    position: absolute;
    top: 50%;
    right: 9px;
    transform: translateY(-50%);
    color: var(--st-muted);
    pointer-events: none;
  }
  .st-slider {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .st-value {
    flex: none;
    min-width: 3.4em;
    padding: 1px 6px;
    border-radius: 7px;
    background: var(--st-accent-soft);
    color: var(--st-accent);
    font-size: 0.76em;
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .st-range {
    flex: 1;
    min-width: 0;
    height: 18px;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    outline: none;
  }
  .st-range::-webkit-slider-runnable-track {
    height: 5px;
    border-radius: 99px;
    background: linear-gradient(to right, var(--st-accent) var(--fill), var(--st-track) var(--fill));
  }
  .st-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -5.5px;
    border: 2px solid var(--st-accent);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
    transition: transform 0.12s;
  }
  .st-range:active::-webkit-slider-thumb { transform: scale(1.12); }
  .st-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px var(--st-accent-soft); }
  .st-sample {
    height: 40px;
    margin: 10px 0 0;
    padding: 0 10px;
    display: flex;
    align-items: center;
    overflow: hidden;
    border: 1px dashed var(--st-line);
    border-radius: 9px;
    background: var(--st-field);
    color: var(--st-ink);
    line-height: 1.2;
    white-space: nowrap;
  }
  .st-dark .st-sample { background: rgba(0, 0, 0, 0.18); }

  /* ── 글꼴 추가: 버튼 모양의 파일 고르기 ──
     파일 입력은 보이지 않게 버튼 위에 겹쳐 두어, 버튼을 누르면 파일 고르는 창이 뜹니다. */
  .st-file { position: relative; overflow: hidden; }
  .st-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 0; }
  .st-file:has(input:focus-visible) { outline: 2px solid var(--st-accent); outline-offset: 2px; }
  .st-file.is-busy { opacity: 0.7; }
  .st-file.is-busy input { cursor: wait; }
  .st-flush { margin-top: 0; }

  /* ── 테마 묶음 제목 옆의 다크 모드 스위치 ── */
  .st-mini-switch {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 4px 3px 8px;
    border: 1px solid var(--st-line);
    border-radius: 99px;
    background: var(--st-field);
    color: var(--st-sub);
    font: inherit;
    font-size: 0.74em;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 0.14s, color 0.14s;
  }
  .st-dark .st-mini-switch { background: rgba(255, 255, 255, 0.05); }
  .st-mini-switch:hover { border-color: var(--st-accent-line); }
  .st-mini-switch[aria-checked='true'] { color: var(--st-accent); border-color: var(--st-accent-line); }
  .st-mini-knob {
    width: 28px;
    height: 16px;
    padding: 2px;
    border-radius: 99px;
    background: var(--st-track);
    transition: background-color 0.16s;
  }
  .st-mini-knob i {
    display: block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
    transition: transform 0.16s;
  }
  .st-mini-switch[aria-checked='true'] .st-mini-knob { background: var(--st-accent); }
  .st-mini-switch[aria-checked='true'] .st-mini-knob i { transform: translateX(12px); }

  /* ── 관리 탭 ── */
  .st-news {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 11px 12px;
    border: 1px solid var(--st-accent-line);
    border-radius: 13px;
    background: var(--st-accent-soft);
    color: var(--st-accent);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.14s, transform 0.12s;
  }
  .st-news:hover { border-color: var(--st-accent); }
  .st-news:active { transform: scale(0.99); }
  .st-news-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: var(--st-accent-fill);
    color: var(--st-on-accent);
  }
  .st-news-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .st-news-text strong { font-size: 0.86em; font-weight: 700; color: var(--st-ink); }
  .st-news-text small { font-size: 0.72em; color: var(--st-muted); }

  .st-update-line {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .st-update-line p { flex: 1; min-width: 0; margin: 0; }
  .st-update-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
    padding: 10px;
    border: 1px solid var(--st-accent-line);
    border-radius: 10px;
    background: var(--st-accent-soft);
  }
  .st-update-box p { margin: 0; }
  .st-update-title { font-size: 0.78em; font-weight: 800; line-height: 1.5; color: var(--st-accent); }
  .st-update-title span { font-weight: 700; opacity: 0.7; }
  .st-progress { display: flex; flex-direction: column; gap: 6px; }
  .st-progress p { font-size: 0.72em; font-weight: 700; color: var(--st-sub); }
  .st-progress-track { height: 6px; overflow: hidden; border-radius: 99px; background: var(--st-track); }
  .st-progress-fill { height: 100%; border-radius: 99px; background: var(--st-accent); transition: width 0.2s; }

  .st-action {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .st-action + .st-action {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--st-line-soft);
  }
  .st-action-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .st-action-text strong { font-size: 0.84em; font-weight: 700; }
  .st-action-text small { font-size: 0.72em; line-height: 1.5; color: var(--st-muted); text-wrap: pretty; }
  .st-danger-text { color: var(--st-danger); }

  .st-credit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin: 2px 0 0;
    font-size: 0.68em;
    color: var(--st-muted);
  }
  .st-credit img { width: 22px; height: 22px; object-fit: contain; }
  .st-version { margin-left: 6px; opacity: 0.7; font-variant-numeric: tabular-nums; }

  /* ── 버튼 ── */
  .st-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: none;
    padding: 0.55em 1.25em;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--st-hover);
    color: var(--st-sub);
    font: inherit;
    font-size: 0.84em;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: filter 0.12s, transform 0.1s, background-color 0.12s, border-color 0.12s, opacity 0.12s;
  }
  .st-btn:hover:not(:disabled) { filter: brightness(0.96); }
  .st-dark .st-btn:hover:not(:disabled) { filter: brightness(1.15); }
  .st-btn:active:not(:disabled) { transform: scale(0.97); }
  .st-btn:disabled { opacity: 0.5; cursor: default; }
  .st-btn-small { padding: 0.42em 0.85em; border-radius: 8px; font-size: 0.76em; }
  .st-btn-block { width: 100%; }
  .st-btn-primary { background: var(--st-accent-fill); color: var(--st-on-accent); }
  .st-btn-outline { background: var(--st-field); border-color: var(--st-line); color: var(--st-accent); }
  .st-btn-outline:hover:not(:disabled) { border-color: var(--st-accent-line); }
  .st-btn-danger { background: var(--st-danger-fill); color: #fff; }
  .st-btn-danger-outline { background: transparent; border-color: var(--st-danger-line); color: var(--st-danger); }
  .st-btn-danger-outline:hover:not(:disabled) { background: var(--st-danger-soft); }

  .st-root :global(button:focus-visible) {
    outline: 2px solid var(--st-accent);
    outline-offset: 2px;
  }

  /* ── 아래 줄 ── */
  .st-foot {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 12px 16px;
    border-top: 1px solid var(--st-line-soft);
    background: var(--st-chrome);
  }
  .st-pending {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    overflow: hidden;
    color: var(--st-accent);
    font-size: 0.72em;
    font-weight: 700;
    white-space: nowrap;
  }
  .st-pending i {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--st-accent);
  }
  .st-btn-apply { min-width: 5.2em; box-shadow: 0 4px 12px color-mix(in srgb, var(--st-accent) 28%, transparent); }

  /* ── 확인 창 ── */
  .st-scrim {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 18px;
    border-radius: inherit;
    background: color-mix(in srgb, var(--st-bg) 72%, rgba(15, 23, 42, 0.55));
    backdrop-filter: blur(3px);
  }
  .st-dialog {
    position: relative;
    width: 100%;
    max-height: 100%;
    overflow-y: auto;
    padding: 18px 16px 14px;
    border: 1px solid var(--st-line);
    border-radius: 16px;
    background: var(--st-bg);
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.3);
    cursor: default;
  }
  .st-dark .st-dialog { background: #2b2e3b; }
  .st-dialog-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    margin-bottom: 10px;
    border-radius: 12px;
    background: var(--st-accent-soft);
    color: var(--st-accent);
  }
  .st-dialog.is-danger .st-dialog-icon { background: var(--st-danger-soft); color: var(--st-danger); }
  .st-dialog-step {
    position: absolute;
    top: 16px;
    right: 16px;
    padding: 1px 8px;
    border-radius: 99px;
    background: var(--st-danger-soft);
    color: var(--st-danger);
    font-size: 0.68em;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .st-dialog h2 {
    margin: 0 0 6px;
    font-size: 1em;
    font-weight: 800;
    line-height: 1.4;
  }
  .st-dialog p,
  .st-dialog li {
    font-size: 0.78em;
    line-height: 1.65;
    color: var(--st-sub);
    text-wrap: pretty;
  }
  .st-dialog p { margin: 0; }
  .st-dialog p.st-error { margin-top: 8px; color: var(--st-danger); }
  .st-dialog b { color: var(--st-ink); font-weight: 800; }
  .st-dialog.is-danger b { color: var(--st-danger); }
  .st-dialog ul {
    margin: 8px 0 0;
    padding: 9px 10px 9px 24px;
    border-radius: 10px;
    background: var(--st-danger-soft);
    list-style: disc;
  }
  .st-dialog li + li { margin-top: 3px; }
  .st-dialog li::marker { color: var(--st-danger); }
  .st-dialog-actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
  .st-dialog-actions .st-btn { flex: 1; padding-inline: 0.6em; }

  .st-root :global(.st-spin) { animation: st-spin 0.9s linear infinite; }
  @keyframes st-spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .st-page { animation: none; }
    .st-root :global(.st-spin) { animation-duration: 2.4s; }
    .st-root, .st-tab, .st-btn, .st-choice, .st-range::-webkit-slider-thumb, .st-progress-fill { transition: none; }
  }
</style>
