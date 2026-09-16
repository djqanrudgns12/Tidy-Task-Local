import { LazyStore } from '@tauri-apps/plugin-store';
import { getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit, listen } from '@tauri-apps/api/event';
import { LogicalPosition, PhysicalPosition } from '@tauri-apps/api/dpi';
import { TINY_NOTE_MIN_WIDTH, TINY_NOTE_ROLLED_HEIGHT } from './tinyNoteWindow.js';
import { NOTE_PREFIX, TINY_NOTE_PREFIX, isDataWindowLabel } from './windows/windowLabels.js';
import { pickManager } from './windows/managerElection.js';
import { findSlot, isSlotLimitReached, noteWindowOptions, tinyNoteWindowOptions } from './windows/windowSlots.js';
import { getOpenWindowLabels, openWindow } from './windows/windowRegistry.js';
import { isPlausibleCoordinate } from './windows/windowPlacement.js';
import { registerFontFace } from './fonts.js';
import { createSerialQueue } from './storage/serialQueue.js';
import { collectImminentTodos } from './reminders/reminderEngine.js';
import { buildExportText, escapeHtml, htmlToLines, linesToHtml, parseExportText } from './io/txtPorter.js';
import { newId } from './ids.js';
import { playChime } from './sound.js';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import {
  SNAPSHOT_FIELDS,
  decodeWindowData,
  encodeWindowData,
  hasWindowContent,
  pickSnapshot,
  restoreSnapshotValue,
} from './storage/windowDataCodec.js';
import { getThemeAccent, isTinyNoteDarkTheme, nextTinyNoteThemeState, normalizeThemeId } from './themes.js';
import {
  AUTO_CHECK_INTERVAL_MS,
  BOOT_CHECK_DELAY_MS,
  RELAY_TIMEOUT_MS,
  RELEASES_PAGE_URL,
  SNOOZE_DURATION_MS,
  buildUpdateInfo,
  fetchLatestRelease,
  isNewerVersion,
  shouldAutoCheck,
  shouldNotifyUser,
} from './updateChecker.js';

let tauriStore = null;

// 모든 창이 공유하는 통합 저장 파일
const STORE_FILE = 'tidy-task-config.json';

// 창 명부·폰트 목록처럼 "모든 창이 함께 쓰는 키"를 읽고 쓸 때 사용하는 실제 저장소입니다.
// 왜 tauriStore를 쓰지 않는가: 이 창의 읽기 검증이 실패하면 tauriStore는 빈 값을 돌려주는 안전 스텁으로
//   바뀌는데, 그 상태로 빈 번호를 찾으면 내용이 있는 창을 빈 창으로 오판할 수 있습니다. (5.0.0과 같은 방식)
let sharedStoreInstance = null;
function sharedStore() {
  if (!sharedStoreInstance) sharedStoreInstance = new LazyStore(STORE_FILE);
  return sharedStoreInstance;
}

// ✨ [업데이트 안내] 앱 전체가 공유하는 저장 키.
// 왜 창별 데이터(winData)가 아니라 전역 키인가:
//   1) 새 버전 정보는 창마다 다를 이유가 전혀 없는 "앱 단위" 정보입니다.
//   2) 창별 데이터는 "유령 청소기"가 빈 창을 지울 때 함께 삭제되므로,
//      사용자가 누른 "건너뛰기 / 나중에" 선택이 창을 닫는 순간 증발해 버립니다.
const UPDATE_STATE_KEY = 'updateState';

// 저장소를 읽지 못했을 때 끼워 넣는 "안전 스텁".
// 왜 필요한가: get()이 예외를 던지면 init() 전체가 중단되어 IPC 이벤트 리스너 등록까지
//   실패합니다(매니저 승계, 리마인더 동기화 등이 통째로 죽습니다).
//   빈 값을 돌려주는 스텁으로 대체하면 앱은 평소처럼 동작하고,
//   실제 쓰기는 _hydrated 가드가 막아 주므로 디스크의 원본 데이터는 안전합니다.
function createStubStore() {
  return {
    async keys() { return []; },
    async entries() { return []; },
    async length() { return 0; },
    async get() { return undefined; },
    async has() { return false; },
    async set() {},
    async delete() {},
    async clear() {},
    async save() {},
    async reload() {}
  };
}

// ── 기본 내장 폰트 목록 (시스템 10종 + 로컬 커스텀 13종) ─────────────────────
export const BUILTIN_FONTS = [
  // 1. 시스템 기본 폰트 (10종)
  { name: '맑은고딕', family: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  { name: '돋움', family: '"Dotum", sans-serif' },
  { name: '함초롬돋움', family: '"Hamchorom Dotum", sans-serif' },
  { name: '굴림', family: '"Gulim", sans-serif' },
  { name: '새굴림', family: '"New Gulim", sans-serif' },
  { name: '바탕', family: '"Batang", serif' },
  { name: '바탕체', family: '"BatangChe", serif' },
  { name: '함초롬바탕', family: '"Hamchorom Batang", serif' },
  { name: '궁서', family: '"Gungsuh", serif' },
  { name: '궁서체', family: '"GungsuhChe", serif' },

  // 2. 고가독성 본문용 (4종)
  { name: '리디바탕', family: '"리디바탕", serif' },
  { name: '엘리스 디지털배움', family: '"엘리스 디지털배움", sans-serif' },
  { name: '엘리스 DX 널리 L', family: '"엘리스 DX 널리 L", sans-serif' },
  { name: '엘리스 DX 널리 M', family: '"엘리스 DX 널리 M", sans-serif' },

  // 3. 제목 및 강조용 (9종)
  { name: '여기어때 잘난체', family: '"여기어때 잘난체", sans-serif' },
  { name: 'KCC 간판체', family: '"KCC 간판체", sans-serif' },
  { name: '배달의민족 도현', family: '"배달의민족 도현", sans-serif' },
  { name: '배달의민족 주아', family: '"배달의민족 주아", sans-serif' },
  { name: '배달의민족 을지로', family: '"배달의민족 을지로", sans-serif' },
  { name: '메이플스토리 L', family: '"메이플스토리 L", sans-serif' },
  { name: '메이플스토리 B', family: '"메이플스토리 B", sans-serif' },
  { name: '학교안심 돌담 M', family: '"학교안심 돌담 M", sans-serif' },
  { name: '학교안심 돌담 B', family: '"학교안심 돌담 B", sans-serif' },

  // 4. 감성적인 손글씨 (11종)
  { name: '교보 손글씨 2019', family: '"교보 손글씨 2019", sans-serif' },
  { name: '교보 손글씨 2023', family: '"교보 손글씨 2023", sans-serif' },
  { name: '교보 손글씨 2024', family: '"교보 손글씨 2024", sans-serif' },
  { name: '교보 손글씨 2025', family: '"교보 손글씨 2025", sans-serif' },
  { name: '온글잎 의연체', family: '"온글잎 의연체", sans-serif' },
  { name: '배달의민족 연성', family: '"배달의민족 연성", sans-serif' },
  { name: 'Cafe24 동동', family: '"Cafe24 동동", sans-serif' },
  { name: 'Cafe24 쑥쑥', family: '"Cafe24 쑥쑥", sans-serif' },
  { name: 'KCC 도담도담', family: '"KCC 도담도담", sans-serif' },
  { name: 'J개구쟁이체 L', family: '"J개구쟁이체 L", sans-serif' },
  { name: 'J개구쟁이체 M', family: '"J개구쟁이체 M", sans-serif' },

  // 5. 다양한 꾸밈용 (14종)
  { name: '학교안심 봄방학', family: '"학교안심 봄방학", sans-serif' },
  { name: '학교안심 분필', family: '"학교안심 분필", sans-serif' },
  { name: '학교안심 붓펜 L', family: '"학교안심 붓펜 L", sans-serif' },
  { name: '학교안심 붓펜 M', family: '"학교안심 붓펜 M", sans-serif' },
  { name: '학교안심 은하수', family: '"학교안심 은하수", sans-serif' },
  { name: '학교안심 가을소풍 L', family: '"학교안심 가을소풍 L", sans-serif' },
  { name: '학교안심 가을소풍 B', family: '"학교안심 가을소풍 B", sans-serif' },
  { name: '학교안심 꾸러기', family: '"학교안심 꾸러기", sans-serif' },
  { name: '학교안심 꼬꼬마', family: '"학교안심 꼬꼬마", sans-serif' },
  { name: '학교안심 맑은날 M', family: '"학교안심 맑은날 M", sans-serif' },
  { name: '학교안심 몽글', family: '"학교안심 몽글", sans-serif' },
  { name: '학교안심 투호', family: '"학교안심 투호", sans-serif' },
  { name: '학교안심 나들이 L', family: '"학교안심 나들이 L", sans-serif' },
  { name: '학교안심 나들이 B', family: '"학교안심 나들이 B", sans-serif' }
];

// ── [저장 엔진 코어] 창마다 독립된 웹뷰 컨텍스트를 가지므로 모듈 스코프로 충분합니다 ──
// 왜 타이머를 둘로 나눴는가:
//   예전에는 본문 저장(save)과 설정 저장(saveSettingsOnly)이 saveTimeout 하나를 공유했습니다.
//   그래서 글을 쓰는 도중 테마/폰트/창 크기 같은 설정이 바뀌면 "본문 저장 예약"이 취소되고
//   설정 키만 부분 저장되어, 마지막에 입력한 할 일·메모가 통째로 사라졌습니다.
let contentSaveTimer = null;
let settingsSaveTimer = null;

// ✨ [직렬화 큐] 디스크 쓰기를 한 줄로 세웁니다.
// 왜: performSave()는 "읽기 → 병합 → 쓰기" 구조라, 두 번의 저장이 겹치면
//     나중 작업이 옛 스냅샷을 읽어 방금 저장한 내용을 덮어씁니다.
//     큐에 태워 한 번에 하나씩만 실행하면 이 경합(race)이 원천 차단됩니다.
const writeQueue = createSerialQueue();
function enqueueWrite(task) {
  return writeQueue.enqueue(task);
}
export function whenWritesSettled() {
  return writeQueue.settled();
}

export class AppState {

  todos = $state([]);
  archivedTodos = $state([]);
  notes = $state('');
  themeColor = $state('amber');
  opacity = $state(1.0);
  reminderOpacity = $state(1.0);
  isReady = $state(false);

  // ✨ [영속성 안전장치] 디스크에서 데이터를 "확실히" 읽어냈는지 여부
  // 왜 필요한가: 컴퓨터를 막 켠 직후에는 디스크 지연·백신 검사 때문에 저장소 첫 읽기가
  //   실패할 수 있습니다. 예전 코드는 실패해도 그냥 빈 상태로 진행한 뒤 저장까지 해버려서,
  //   멀쩡히 남아 있던 메모가 빈 값으로 덮여 영구 삭제됐습니다.
  //   읽기가 검증되기 전에는 단 한 글자도 디스크에 쓰지 않습니다.
  _hydrated = false;
  _hydrationRetryTimer = null;
  // 창이 준비된 시각. 부팅 직후 몇백 ms 동안은 "유령 청소기"를 잠가 두기 위해 씁니다.
  _readyAt = 0;
  // 이 창이 이번 세션에서 한 번이라도 실제 내용을 가진 적이 있는지.
  // 왜 필요한가: 사용자가 직접 내용을 지워서 빈 창이 된 경우(= 청소해도 되는 상황)와,
  //   아직 데이터가 안 올라온 시작 직후의 빈 상태(= 절대 지우면 안 되는 상황)를 구분합니다.
  _everHadContent = false;
  // 저장이 잠겨 있음을 UI에 알리기 위한 플래그 (App.svelte 상단 배너)
  storageError = $state(false);

  fontFamily = $state('메이플스토리 L');
  uiFontFamily = $state('메이플스토리 L');
  fontSize = $state(10);
  uiFontSize = $state(10);
  letterSpacing = $state(0);

  customFonts = $state([]);
  isPinned = $state(false);
  searchQuery = $state('');
  title = $state('');
  isDarkMode = $state(false);
  showArchived = $state(true);
  showNotes = $state(true);
  showReminders = $state(true);
  globalMuteSound = $state(false);
  reminderSuppressUntil = $state(0);
  popupImminentTodos = $state([]);
  isEditMode = $state(false);

  // ✨ 테마 기반 동적 액센트 색상 반환
  // 왜 일반 메서드인가: .svelte.js에서 화살표 함수 클래스 필드(= () => {})는
  // Svelte 5 컴파일러의 $state() 매크로 변환과 충돌하여 런타임 에러를 유발할 수 있습니다.
  getThemeAccentColor() {
    try {
      return getThemeAccent(this.themeColor, this.isDarkMode);
    } catch(e) {
      return '#d97706';
    }
  }
  selectedTodoIds = $state([]);
  hideWelcomeMessage = $state(false);
  isManager = false; // ✨ Phase 3: 매니저 창 권한 식별자

  // ═══════════════════════════════════════════════════════════════════
  // ✨ [업데이트 안내 시스템] 새 버전 감지 → 친절한 안내 → 공식 다운로드
  //
  // 설계 원칙 (기존 아키텍처를 그대로 재사용합니다):
  //   · 네트워크 호출은 "매니저 창" 단 하나만 수행합니다.
  //     창을 10개 띄워도 GitHub 호출은 1회 — 리마인더 체크와 완전히 같은 패턴입니다.
  //   · 결과는 IPC(update-result) 이벤트로 모든 창에 방송합니다.
  //   · 사용자 선택(건너뛰기/나중에)은 전역 키에 저장해 앱을 꺼도 유지됩니다.
  // ═══════════════════════════════════════════════════════════════════

  appVersion = $state('');          // tauri.conf.json의 version (설치된 내 버전)
  updatePhase = $state('idle');     // idle | checking | available | uptodate | error
  updateInfo = $state(null);        // buildUpdateInfo()가 만든 새 버전 정보
  updateErrorCode = $state('');     // 실패 사유 코드 (사용자 안내 문구로 변환됨)
  updateCheckedAt = $state(0);      // 마지막으로 확인에 성공한 시각
  isUpdateBannerVisible = $state(false); // 상단 슬림 배너 표시 여부
  isUpdateGuideOpen = $state(false);     // 단계별 안내 모달 표시 여부
  showUpToDateToast = $state(false);      // "이미 최신입니다" 토스트

  // 디스크에 보존되는 사용자 선택 (전역 키 updateState)
  _updateSkippedVersion = '';
  _updateLastCheckedAt = 0;
  _updateSnoozeUntil = 0;

  // 내부 관리용 핸들 (스냅샷/저장 대상이 아닌 순수 런타임 값)
  _updateToastTimer = null;
  _updateRelayTimer = null;
  _updateScheduleStarted = false;
  // 확인이 진행되는 동안 "나도 결과를 알려 달라"고 요청한 창들의 명단
  _pendingUpdateRequesters = [];
  _unlistenUpdateResult = null;
  _unlistenUpdateDismissed = null;

// ✨ [멀티 윈도우 명단 관리 변수]
  activeExtraWindows = $state([]);
  windowLabel = 'main';
  showMaxWindowToast = $state(false);
  maxWindowToastTimer = null;

// ✨ [다중 복사/붙여넣기 시스템 알림 변수]
  showCopySuccessToast = $state(false);
  showPasteSuccessToast = $state(false);
  showPasteLimitToast = $state(false);
  toastTimer = null;
  reminderTitle = $state('통합 리마인더');

  // Ctrl+S 즉시 저장 안내 (도움말에 적힌 단축키)
  showSaveToast = $state(false);

  triggerToast(type) {
    this.showCopySuccessToast = false;
    this.showPasteSuccessToast = false;
    this.showPasteLimitToast = false;
    this.showSaveToast = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);

    if (type === 'copy') this.showCopySuccessToast = true;
    else if (type === 'paste') this.showPasteSuccessToast = true;
    else if (type === 'limit') this.showPasteLimitToast = true;
    else if (type === 'save') this.showSaveToast = true;

    this.toastTimer = setTimeout(() => {
      this.showCopySuccessToast = false;
      this.showPasteSuccessToast = false;
      this.showPasteLimitToast = false;
      this.showSaveToast = false;
    }, 2500);
  }

// ✨ [창 위치 및 크기 기억 변수 추가]
  windowPosX = $state(null);
  windowPosY = $state(null);
  // 5.0.5: 물리 좌표(모니터 배율과 무관한 실제 화면 픽셀). 창 위치 복원은 이 값을 우선합니다.
  windowPhysX = $state(null);
  windowPhysY = $state(null);
  windowWidth = $state(null);
  windowHeight = $state(null);
  // ✨ 전체화면 상태 보존: 앱 재시작 시 전체화면이 풀리지 않도록
  // 왜 takeSnapshot에 넣지 않는가: 전체화면은 Undo/Redo 대상이 아닌 "창 상태"이기 때문
  isFullscreen = $state(false);
  todoHeight = $state(145);
  notesHeight = $state(140);
  isNotesLocked = $state(false);
  sortOrder = $state('asc');

  isRolledUp = $state(false);
  previousHeight = $state(280);

  // ✨ [세로 스냅] 위쪽 테두리 더블클릭 시 세로 최대화 토글용 상태
  // 왜 별도 변수가 필요한가: 전체화면(isFullscreen)과 달리 너비는 유지하고 높이만 변경하므로 구분이 필요
  isVerticalSnapped = $state(false);
  preSnapPosY = $state(null);    // 스냅 전 Y 좌표 백업
  preSnapHeight = $state(null);  // 스냅 전 높이 백업
  isProgrammaticResize = $state(false); // ✨ [TCREI] 강제 리사이즈로 인한 스냅 해제 방지 락(Lock)

  // ✨ [타임머신 엔진] Undo / Redo 상태 관리
  // $state.raw: 스냅샷은 한 번 찍으면 바뀌지 않는 기록이라 속까지 추적할 필요가 없습니다.
  // (깊은 추적을 끄면 스냅샷 20개 × 할 일 전체에 프록시를 씌우던 비용이 사라집니다)
  historyStack = $state.raw([]);
  currentIndex = $state(-1);
  isRestoring = false; // 복원 중 무한루프 방지 락(Lock)
  historyTimeout = null; // 타자 입력 디바운스용

  // ✨ [타임머신 상태 확인] 이전/다음 버튼 활성화 여부 판단
  get canUndo() {
    return this.currentIndex > 0;
  }

  get canRedo() {
    return this.currentIndex >= 0 && this.currentIndex < this.historyStack.length - 1;
  }

  get allFonts() {
    const custom = this.customFonts.map(f => ({ name: f.name, family: `"${f.name}", sans-serif`, isCustom: true }));
    return [...BUILTIN_FONTS, ...custom];
  }

  get filteredTodos() {
    if (!this.searchQuery) return this.todos;
    const lowerQuery = this.searchQuery.toLowerCase();
    return this.todos.filter(t => t.text.replace(/<[^>]*>?/gm, '').toLowerCase().includes(lowerQuery));
  }

  get filteredArchivedTodos() {
    if (!this.searchQuery) return this.archivedTodos;
    const lowerQuery = this.searchQuery.toLowerCase();
    return this.archivedTodos.filter(t => t.text.replace(/<[^>]*>?/gm, '').toLowerCase().includes(lowerQuery));
  }

async init() {
    try {
      const win = getCurrentWindow();
      this.windowLabel = win.label;
      
      // ✨ [하이브리드 코어] 모든 창은 하나의 통합 파일을 공유합니다.
      // ✨ [부팅 병목 방어] reload() 대신 "읽기 검증(hydration)"을 수행합니다.
      // 왜 reload()를 제거했는가:
      //   @tauri-apps/plugin-store는 같은 파일 경로면 앱 전체가 인스턴스 하나를 공유합니다.
      //   새 창이 뜨면서 reload()를 호출하면, 다른 창이 set()만 하고 아직 디스크에 기록하지
      //   못한 내용이 옛 파일 내용으로 되돌려져 그대로 증발합니다.
      //   LazyStore는 첫 접근 시 알아서 디스크를 읽으므로 reload()는 애초에 불필요합니다.
      // 왜 재시도인가:
      //   부팅 직후 읽기 실패는 일시적입니다. 여기서 성공을 확인해야만 이후 저장이 열립니다.
      this._hydrated = await this._ensureStoreLoaded();
      this.storageError = !this._hydrated;
      if (!this._hydrated) {
        console.error(`🛑 [${this.windowLabel}] 저장소 읽기 실패 — 데이터 보호를 위해 저장을 잠급니다.`);
        tauriStore = createStubStore();
        this._scheduleHydrationRetry();
      }

      this.activeExtraWindows = await tauriStore.get('activeExtraWindows') || [];
      
      // 🚨 [유지] 구버전 앱에서 쓰던 레거시 커스텀 폰트 복구 로직
      const savedFonts = await tauriStore.get('customFonts');
      if (Array.isArray(savedFonts)) {
        this.customFonts = savedFonts;
      } else {
        const legacyPath = await tauriStore.get('customFontPath');
        const legacyName = await tauriStore.get('fontFamily');
        if (legacyPath && legacyName && !BUILTIN_FONTS.find(f => f.name === legacyName)) {
          this.customFonts = [{ name: legacyName, path: legacyPath }];
        } else {
          this.customFonts = [];
        }
      }

      // 🚨 [데이터 마이그레이션: 구버전 데이터 증발 완벽 방어]
      let winData = await tauriStore.get(this.windowLabel);

      if (!winData && this.windowLabel === 'main') {
        const oldTodos = await tauriStore.get('todos');
        if (oldTodos !== null && oldTodos !== undefined) {
          winData = {
            todos: oldTodos,
            archivedTodos: await tauriStore.get('archivedTodos') || [],
            notes: await tauriStore.get('notes') || '',
            themeColor: await tauriStore.get('themeColor') || 'amber',
            opacity: await tauriStore.get('opacity') ?? 1.0,
            fontFamily: await tauriStore.get('fontFamily') || '메이플스토리 L',
            uiFontFamily: await tauriStore.get('uiFontFamily') || '메이플스토리 L',
            fontSize: await tauriStore.get('fontSize') || 10,
            uiFontSize: await tauriStore.get('uiFontSize') || 10,
            isPinned: await tauriStore.get('isPinned') || false,
            title: await tauriStore.get('title') || '',
            isDarkMode: await tauriStore.get('isDarkMode') || false,
            showArchived: await tauriStore.get('showArchived') ?? true,
            showNotes: await tauriStore.get('showNotes') ?? true,
            showReminders: await tauriStore.get('showReminders') ?? true,
            reminderSuppressUntil: await tauriStore.get('reminderSuppressUntil') || 0,
            windowPosX: await tauriStore.get('windowPosX'),
            windowPosY: await tauriStore.get('windowPosY'),
            windowWidth: await tauriStore.get('windowWidth'),
            windowHeight: await tauriStore.get('windowHeight'),
            todoHeight: await tauriStore.get('todoHeight') ?? 145,
            notesHeight: await tauriStore.get('notesHeight') ?? 140,
            isNotesLocked: await tauriStore.get('isNotesLocked') ?? false,
            isVerticalSnapped: await tauriStore.get('isVerticalSnapped') || false,
            preSnapPosY: await tauriStore.get('preSnapPosY') ?? null,
            preSnapHeight: await tauriStore.get('preSnapHeight') ?? null
          };
          console.log("🚀 구버전 데이터를 완벽하게 하이브리드 엔진으로 이사 완료했습니다!");
        } else {
          winData = {};
        }
      } else {
        winData = winData || {};
      }

      // 🏠 각 창의 독립된 데이터로 화면 구성
      // 필드별 복원 규칙(기본값, `||`/`??` 차이, 테마 정규화, 전체화면·롤업 상태 등)은
      // windowDataCodec.js의 필드 표 한 곳에서 관리합니다. 저장·되돌리기도 같은 표를 씁니다.
      this.hideWelcomeMessage = await tauriStore.get('hideWelcomeMessage') || false;
      const decoded = decodeWindowData(winData, {
        label: this.windowLabel,
        globalMuteSound: await tauriStore.get('globalMuteSound'),
      });
      for (const [name, value] of Object.entries(decoded)) {
        this[name] = value;
      }
      // 디스크에서 실제 내용을 읽어왔다면, 이 창은 "내용을 가졌던 창"으로 표시합니다.
      if (hasWindowContent(decoded)) {
        this._everHadContent = true;
      }

      // ── 매니저 선출·승계 ─────────────────────────────────────────────
      // 매니저 창이 닫히면, 지금 "열려 있는" 데이터 창 중 우선순위 1위가 권한을 이어받습니다.
      // (우선순위: main → note-1..10 → tinynote-1..10 — windows/managerElection.js)
      // 왜 열린 창에서 고르는가: 예전에는 저장 명부(닫힌 창 포함)에서 골라서, 번호가 가장 작은 창이
      //   닫혀 있으면 아무도 매니저가 되지 못해 리마인더와 업데이트 확인이 조용히 멈췄습니다.
      listen('manager-closing', async (event) => {
        if (this.isManager) return;
        const closingLabel = event?.payload?.label || null;
        const openLabels = await getOpenWindowLabels();
        if (pickManager(openLabels, { exclude: closingLabel }) === this.windowLabel) {
          // 이어받는 즉시 한 번 점검합니다 (5.0.0과 같은 동작)
          await this.becomeManager({ bootDelay: 0 });
        }
      });

      // main 창이 새로 뜨면(트레이 "열기" 등) 임시로 권한을 맡던 창은 권한을 돌려줍니다.
      // 왜: 돌려주지 않으면 매니저가 둘이 되어 리마인더 팝업과 업데이트 확인이 중복됩니다.
      listen('manager-reclaim', () => {
        if (this.windowLabel !== 'main') this.resignManager();
      });

      if (this.windowLabel === 'main') {
        emit('manager-reclaim').catch(() => {});
        // ✨ 최초 기동 시 main 창이 매니저 (부팅 3초 뒤 첫 점검)
        await this.becomeManager({ bootDelay: 3000 });
      }

      // ✨ [업데이트 안내] 버전 확인·리스너 등록.
      // 왜 await하지 않는가: 여기서 기다리면 네트워크/IPC가 늦어질 때 isReady가 지연되어
      //   "내용을 불러오는 중..." 화면이 길어집니다. 업데이트 안내는 조금 늦게 준비돼도 무방합니다.
      this.initUpdater().catch((e) => console.warn('업데이트 확인 준비 실패:', e));

      listen('archive-reminder-item', async (e) => {
        const payload = e.payload;
        if (payload && payload.id && payload.sourceLabel === this.windowLabel) {
          this.toggleTodo(payload.id);
        }
      });

      // ── 데이터 창 전용 수신기 ──
      if (isDataWindowLabel(this.windowLabel)) {
        // 매니저가 "이 할 일은 오늘 알림을 보냈다"고 알려 오면 내 목록에 직접 기록합니다.
        // 왜 매니저가 대신 쓰지 않는가: 열린 창의 데이터를 밖에서 고치면 이 창이 다음에 저장할 때
        //   기록이 없는 옛 목록으로 덮어써, 같은 할 일이 매시간 다시 알림을 울렸습니다.
        listen('reminder-mark-notified', (event) => {
          const payload = event?.payload;
          if (!payload || payload.label !== this.windowLabel || !Array.isArray(payload.ids)) return;
          const ids = new Set(payload.ids);
          let changed = false;
          for (const todo of this.todos) {
            if (ids.has(todo.id) && todo.lastNotified !== payload.date) {
              todo.lastNotified = payload.date;
              changed = true;
            }
          }
          if (changed) this.saveNow(false);
        });

        // 트레이 "종료" 직전: 예약만 되어 있고 아직 기록되지 않은 입력을 즉시 저장합니다.
        listen('before-quit', () => {
          this.flushPendingSaves(true);
        });
      }

      // 새 커스텀 폰트가 등록되면 모든 창이 목록에 추가하고 글꼴을 불러옵니다.
      // 왜: 예전에는 main 창만 폰트를 불러와서, 메모 창에서 등록한 폰트가 그 창에서는 재시작 전까지 보이지 않았습니다.
      listen('custom-font-added', async (event) => {
        const { name, path } = event?.payload || {};
        if (!name || !path) return;
        if (!this.customFonts.find((f) => f.name === name)) {
          this.customFonts.push({ name, path });
        }
        await registerFontFace(name, path);
      });

    } catch (e) {
      console.error(e);
    } finally {
      this.isReady = true;
      this._readyAt = Date.now();
      this.pushToHistory(); 
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ✨ [매니저 권한] 리마인더 점검·업데이트 확인·트레이 요청을 맡는 창 하나
  // ═══════════════════════════════════════════════════════════════════

  // 매니저 전용 이벤트 수신기 해제 함수 모음 (권한을 내려놓을 때 한 번에 해제)
  _managerUnlisteners = [];
  _reminderBootTimer = null;
  _reminderIntervalTimer = null;
  _updateBootTimer = null;
  _updateIntervalTimer = null;
  _opacitySaveTimer = null;
  _isSpawningWindow = false;
  _isCreatingReminder = false;

  // 매니저 권한을 맡습니다. 최초 기동(main)과 승계 두 경로가 모두 이 함수 하나를 씁니다.
  // 왜 하나로 모았는가: 예전에는 승계 경로에서 "1시간마다 점검" 타이머가 빠져 있어서,
  //   main을 닫은 뒤로는 리마인더가 딱 한 번만 점검되고 멈췄습니다.
  async becomeManager({ bootDelay = 3000 } = {}) {
    if (this.isManager) return;
    this.isManager = true;
    await this.setupManagerListeners();
    this._reminderBootTimer = setTimeout(() => this.checkReminders(true), bootDelay);
    this._reminderIntervalTimer = setInterval(() => this.checkReminders(), 1000 * 60 * 60);
    // ✨ 매니저 권한을 맡았으니 업데이트 확인 임무도 함께 맡습니다.
    this._startUpdateSchedule();
  }

  // 매니저 권한을 내려놓습니다 (창이 닫히거나 main이 권한을 되찾을 때).
  // 왜 타이머까지 멈추는가: 멈추지 않으면 권한이 없는 창의 타이머가 계속 돌아 점검이 중복됩니다.
  resignManager() {
    if (!this.isManager) return;
    this.isManager = false;
    this._clearManagerListeners();
    if (this._reminderBootTimer) { clearTimeout(this._reminderBootTimer); this._reminderBootTimer = null; }
    if (this._reminderIntervalTimer) { clearInterval(this._reminderIntervalTimer); this._reminderIntervalTimer = null; }
    this._stopUpdateSchedule();
  }

  _clearManagerListeners() {
    for (const unlisten of this._managerUnlisteners) {
      try { unlisten(); } catch (e) {}
    }
    this._managerUnlisteners = [];
  }

  async _listenAsManager(eventName, handler) {
    this._managerUnlisteners.push(await listen(eventName, handler));
  }

  // ✨ Phase 3: 매니저 특화 이벤트 리스너 통합 관리
  async setupManagerListeners() {
    // 기존 수신기가 있다면 먼저 모두 해제합니다 (중복 등록 방지).
    this._clearManagerListeners();

    await this._listenAsManager('reminder-ready', () => {
      this.syncReminderWindow();
    });

    await this._listenAsManager('dismiss-reminder', (event) => {
      if (event.payload && event.payload.mode) {
        this.dismissReminderPopup(event.payload.mode, event.payload);
      }
    });

    // 다른 창의 할 일이 바뀌었으니 팝업 내용만 새로 맞춥니다.
    // 왜 미루기(reminderSuppressUntil)를 건드리지 않는가: 예전에는 여기서 0으로 초기화해서,
    //   다른 창에서 글자만 입력해도 사용자가 고른 "1시간 뒤/오늘은 그만"이 즉시 풀렸습니다.
    await this._listenAsManager('req-reminder-sync', () => {
      this.syncReminderWindow();
    });

    await this._listenAsManager('update-reminder-opacity', (event) => {
      if (event.payload && event.payload.opacity !== undefined) {
        this.reminderOpacity = event.payload.opacity;
        // 슬라이더를 움직이는 동안 칸마다 전체 저장하지 않도록, 멈춘 뒤 한 번만 저장합니다.
        if (this._opacitySaveTimer) clearTimeout(this._opacitySaveTimer);
        this._opacitySaveTimer = setTimeout(() => {
          this._opacitySaveTimer = null;
          this.saveNow(false);
        }, 300);
      }
    });

    // ✨ [업데이트] 다른 창(설정 창 등)이 "확인해 줘"라고 요청하면 매니저가 대신 확인합니다.
    // 왜 매니저만 확인하는가: 창마다 호출하면 GitHub 호출 제한(시간당 60회)에 금방 걸리고,
    //   같은 알림이 창 개수만큼 중복으로 뜨기 때문입니다.
    await this._listenAsManager('req-update-check', (event) => {
      const requesterLabel = event?.payload?.requesterLabel || null;
      this.checkForUpdates({ manual: true, requesterLabel });
    });

    // ✨ 트레이 메뉴 요청 (Rust가 모든 창에 방송하고, 매니저만 처리합니다)
    // 왜 매니저가 받는가: 예전에는 main 창만 받아서, main을 닫으면 트레이의
    //   "새 Tidy Task / 새 Tiny Note / 좌표 초기화"가 아무 반응이 없었습니다.
    await this._listenAsManager('spawn-new-window', () => this.spawnNewWindow());
    await this._listenAsManager('spawn-tiny-note', () => this.spawnTinyNote());
    await this._listenAsManager('req-reset-coordinates', () => this.resetAllCoordinates());

    // 설정 창의 커스텀 폰트 등록 요청 (저장은 매니저 한 곳에서만 합니다)
    await this._listenAsManager('req-add-custom-font', (event) => this._handleAddCustomFont(event.payload));

    // 리마인더에서 ✓(마감)를 눌렀는데 원래 창이 닫혀 있으면 매니저가 대신 처리합니다.
    await this._listenAsManager('archive-reminder-item', (event) => this._archiveTodoOfClosedWindow(event.payload));
  }

  // 트레이 "좌표 초기화": 열린 창들을 화면 왼쪽 위부터 계단식으로 모읍니다.
  // 위치 저장은 각 창의 "창 이동" 처리기가 스스로 합니다.
  // 왜 여기서 다른 창의 데이터를 직접 쓰지 않는가: 열려 있는 창의 데이터를 밖에서 덮어쓰면
  //   그 창이 막 입력한 내용과 경합해 한쪽이 사라질 수 있기 때문입니다.
  async resetAllCoordinates() {
    // 주 모니터 작업영역(작업 표시줄 제외)의 왼쪽 위를 기준으로, 물리 픽셀로 계단식 배치합니다.
    // 왜 물리 픽셀인가: 창마다 지금 놓인 모니터의 배율이 달라, 논리 좌표로 옮기면 기준점이 창마다 달라집니다.
    let originX = 0;
    let originY = 0;
    let scale = 1;
    try {
      const primary = await primaryMonitor();
      if (primary) {
        originX = primary.workArea.position.x;
        originY = primary.workArea.position.y;
        scale = primary.scaleFactor || 1;
      }
    } catch (e) {}

    let step = 0;
    const bringHere = async (win) => {
      const offset = Math.round((100 + step * 30) * scale);
      step += 1;
      const target = new PhysicalPosition(originX + offset, originY + offset);
      await win.setPosition(target);
      await win.show();
      await win.unminimize();
      await win.setFocus();
      return target;
    };

    const mainWin = await WebviewWindow.getByLabel('main');
    if (mainWin) {
      try {
        const target = await bringHere(mainWin);
        // main 창 자신의 상태와 동기화 (main이 매니저일 때)
        if (this.windowLabel === 'main') {
          this.rememberWindowPosition(target, scale);
          this.saveNow();
        }
      } catch (e) {}
    }

    const activeWindows = (await sharedStore().get('activeExtraWindows')) || [];
    for (const label of activeWindows) {
      const win = await WebviewWindow.getByLabel(label);
      if (!win) continue;
      try {
        await bringHere(win);
      } catch (e) {}
    }
  }

  // 커스텀 폰트를 전역 목록에 저장한 뒤 모든 창에 알립니다.
  async _handleAddCustomFont(payload) {
    const { name, path } = payload || {};
    if (!name || !path) return;
    try {
      await enqueueWrite(async () => {
        const store = sharedStore();
        const latestFonts = (await store.get('customFonts')) || [];
        if (!latestFonts.find((f) => f.name === name)) {
          latestFonts.push({ name, path });
          await store.set('customFonts', latestFonts);
          await store.save();
        }
      });
    } catch (e) {
      console.error('커스텀 폰트 목록을 저장하지 못했습니다:', e);
    }
    emit('custom-font-added', { name, path }).catch(() => {});
  }

  // 리마인더의 ✓(마감) 처리 — 원래 창이 닫혀 있을 때만 매니저가 저장소를 직접 고칩니다.
  // (열린 창은 그 창이 toggleTodo로 처리합니다. 닫힌 창은 경합할 상대가 없어 안전합니다.)
  async _archiveTodoOfClosedWindow(payload) {
    const { id, sourceLabel } = payload || {};
    if (!id || !sourceLabel || sourceLabel === this.windowLabel) return;

    const openLabels = await getOpenWindowLabels();
    if (openLabels.includes(sourceLabel)) return;

    try {
      await enqueueWrite(async () => {
        const store = sharedStore();
        const winData = await store.get(sourceLabel);
        const todos = Array.isArray(winData?.todos) ? winData.todos : [];
        const index = todos.findIndex((t) => t.id === id);
        if (index === -1) return;

        // toggleTodo와 같은 규칙: 완료 표시 후 마감된 일 맨 앞으로 이동
        const moved = { ...todos[index], completed: true };
        await store.set(sourceLabel, {
          ...winData,
          todos: todos.filter((_, i) => i !== index),
          archivedTodos: [moved, ...(winData.archivedTodos || [])],
        });
        await store.save();
      });
    } catch (e) {
      console.error('닫힌 창의 할 일을 마감 처리하지 못했습니다:', e);
    }
    this.syncReminderWindow().catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════════
  // ✨ [업데이트 안내] 초기화 · 확인 · 안내 · 사용자 선택 보존
  // ═══════════════════════════════════════════════════════════════════

  // init() 마지막에 호출됩니다. 모든 창이 공통으로 수행하는 준비 작업입니다.
  async initUpdater() {
    // 1) 지금 설치된 내 버전을 읽습니다 (tauri.conf.json의 version).
    // 왜 하드코딩하지 않는가: 버전을 코드에 박아두면 배포 때 빠뜨려
    //   "업데이트했는데 계속 알림이 뜨는" 무한 루프가 생깁니다.
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      this.appVersion = await getVersion();
    } catch (e) {
      console.warn('앱 버전을 읽지 못했습니다:', e);
      this.appVersion = '';
    }

    // 2) 지난번에 저장해 둔 사용자 선택과 마지막 확인 결과를 복원합니다.
    //    왜 결과까지 저장하는가: 인터넷이 끊긴 환경에서도 "새 버전이 있었다"는 안내를
    //    계속 보여줄 수 있어야 합니다.
    try {
      const saved = (await tauriStore.get(UPDATE_STATE_KEY)) || {};
      this._updateSkippedVersion = saved.skippedVersion || '';
      this._updateLastCheckedAt = Number(saved.lastCheckedAt) || 0;
      this._updateSnoozeUntil = Number(saved.snoozeUntil) || 0;
      this.updateCheckedAt = this._updateLastCheckedAt;

      if (saved.latest && saved.latest.version) {
        this.updateInfo = saved.latest;
        // 저장된 정보가 여전히 새 버전이고, 사용자가 미루지 않았다면 매니저 창에서 다시 안내합니다.
        if (isNewerVersion(saved.latest.version, this.appVersion)) {
          this.updatePhase = 'available';
          if (this.isManager && shouldNotifyUser({
            latestVersion: saved.latest.version,
            skippedVersion: this._updateSkippedVersion,
            snoozeUntil: this._updateSnoozeUntil,
            now: Date.now(),
          })) {
            this.isUpdateBannerVisible = true;
          }
        }
      }
    } catch (e) {
      console.warn('업데이트 상태를 불러오지 못했습니다:', e);
    }

    // 3) 모든 창: 매니저가 방송하는 확인 결과를 받습니다.
    if (this._unlistenUpdateResult) this._unlistenUpdateResult();
    this._unlistenUpdateResult = await listen('update-result', (event) => {
      this._applyUpdateResult(event.payload);
    });

    // 4) 모든 창: 어느 창에서든 "나중에/건너뛰기"를 누르면 다 같이 조용해집니다.
    if (this._unlistenUpdateDismissed) this._unlistenUpdateDismissed();
    this._unlistenUpdateDismissed = await listen('update-dismissed', (event) => {
      const payload = event?.payload || {};
      if (payload.snoozeUntil !== undefined) this._updateSnoozeUntil = Number(payload.snoozeUntil) || 0;
      if (payload.skippedVersion !== undefined) this._updateSkippedVersion = payload.skippedVersion || '';
      this.isUpdateBannerVisible = false;
      this.isUpdateGuideOpen = false;
    });
  }

  // 매니저 창만 실행하는 백그라운드 확인 일정입니다.
  // 왜 별도 메서드인가: 최초 기동(main)과 매니저 권한 승계(note-N) 두 경로에서
  //   똑같이 호출돼야 하므로, 중복 실행 방지 플래그와 함께 한곳에 모았습니다.
  _startUpdateSchedule() {
    if (this._updateScheduleStarted) return;
    this._updateScheduleStarted = true;

    // 부팅 직후 바로 네트워크를 쓰면 앱이 느리게 켜지는 것처럼 보이므로 잠시 뒤에 확인합니다.
    this._updateBootTimer = setTimeout(() => this.checkForUpdates(), BOOT_CHECK_DELAY_MS);
    // 앱을 며칠씩 켜 두는 사용자를 위해 주기적으로도 확인합니다.
    this._updateIntervalTimer = setInterval(() => this.checkForUpdates(), AUTO_CHECK_INTERVAL_MS);
  }

  // 매니저 권한을 내려놓을 때 확인 일정도 함께 멈춥니다 (두 창이 동시에 확인하지 않도록).
  _stopUpdateSchedule() {
    if (this._updateBootTimer) { clearTimeout(this._updateBootTimer); this._updateBootTimer = null; }
    if (this._updateIntervalTimer) { clearInterval(this._updateIntervalTimer); this._updateIntervalTimer = null; }
    this._updateScheduleStarted = false;
  }

  // 실제 확인. manual=true면 사용자가 직접 버튼을 누른 경우입니다.
  async checkForUpdates({ manual = false, requesterLabel = null } = {}) {
    // 매니저가 아닌 창이 실수로 직접 호출해도 네트워크를 건드리지 않도록 막습니다.
    if (!this.isManager) return;

    // 직접 확인을 요청한 창을 명단에 올립니다.
    // 왜 명단인가: 이미 확인이 진행 중일 때 들어온 요청을 그냥 버리면,
    //   요청한 창은 "확인 중…"에 멈춘 채 답을 영영 못 받습니다.
    //   진행 중인 확인에 요청자를 태워 보내면 한 번의 호출로 모두에게 답할 수 있습니다.
    if (requesterLabel) this._pendingUpdateRequesters.push(requesterLabel);
    if (this.updatePhase === 'checking') return;

    // 자동 확인은 주기를 지킵니다(호출 제한 보호). 사용자가 직접 누른 확인은 항상 진행합니다.
    if (!manual && !shouldAutoCheck({ lastCheckedAt: this._updateLastCheckedAt, now: Date.now() })) {
      return;
    }

    this.updatePhase = 'checking';
    this.updateErrorCode = '';

    let result;
    try {
      const release = await fetchLatestRelease();
      const info = buildUpdateInfo(release);

      if (!info) {
        result = { phase: 'error', errorCode: 'BAD_RESPONSE' };
      } else {
        this._updateLastCheckedAt = Date.now();
        result = {
          phase: isNewerVersion(info.version, this.appVersion) ? 'available' : 'uptodate',
          info,
          checkedAt: this._updateLastCheckedAt,
        };
      }
    } catch (e) {
      result = { phase: 'error', errorCode: e?.code || 'UNKNOWN' };
    }

    // 확인이 도는 동안 쌓인 요청자까지 모두 답을 받도록 여기서 명단을 확정합니다.
    const requesterLabels = [...new Set(this._pendingUpdateRequesters)];
    this._pendingUpdateRequesters = [];

    const payload = {
      ...result,
      requesterLabels,
      // 직접 요청한 창이 하나라도 있으면 "사용자가 부른 확인"으로 취급합니다.
      manual: manual || requesterLabels.length > 0,
    };

    // 매니저 자신에게 먼저 반영한 뒤, 나머지 창에 방송합니다.
    this._applyUpdateResult(payload);
    await this._persistUpdateState();
    emit('update-result', payload).catch(() => {});
  }

  // 어느 창에서든 부를 수 있는 "확인해 주세요" 진입점입니다.
  async requestUpdateCheck() {
    this.updateErrorCode = '';

    // 매니저 창은 직접 확인합니다.
    // 주의: 여기서 updatePhase를 미리 'checking'으로 바꾸면 checkForUpdates의
    //   "이미 확인 중" 가드에 스스로 걸려 아무 일도 일어나지 않습니다. 상태 변경은 그쪽에 맡깁니다.
    if (this.isManager) {
      await this.checkForUpdates({ manual: true, requesterLabel: this.windowLabel });
      return;
    }

    this.updatePhase = 'checking';

    // 매니저에게 대신 확인해 달라고 요청합니다.
    emit('req-update-check', { requesterLabel: this.windowLabel }).catch(() => {});

    // 답이 영영 오지 않을 때 "확인 중..." 상태로 굳어버리지 않도록 안전장치를 겁니다.
    if (this._updateRelayTimer) clearTimeout(this._updateRelayTimer);
    this._updateRelayTimer = setTimeout(() => {
      if (this.updatePhase === 'checking') {
        this.updatePhase = 'error';
        this.updateErrorCode = 'RELAY_TIMEOUT';
      }
    }, RELAY_TIMEOUT_MS);
  }

  // 확인 결과를 이 창의 화면 상태에 반영합니다(모든 창에서 실행됩니다).
  _applyUpdateResult(payload) {
    if (!payload) return;

    // 이 창이 직접 확인을 요청했던 대상인지 판별합니다.
    const isRequester = Array.isArray(payload.requesterLabels)
      && payload.requesterLabels.includes(this.windowLabel);

    // 내가 기다리던 답이거나 확실한 결과(성공)가 왔으면 릴레이 안전장치를 해제합니다.
    // 왜 조건을 다는가: 남의 요청에 대한 실패 응답 때문에 내 대기 타이머가 풀리면,
    //   정작 내 답이 오지 않았을 때 "확인 중…"에 그대로 멈춰버립니다.
    if (this._updateRelayTimer && (isRequester || payload.phase !== 'error')) {
      clearTimeout(this._updateRelayTimer);
      this._updateRelayTimer = null;
    }

    if (payload.phase === 'error') {
      // 자동 확인 실패는 사용자를 방해하지 않습니다(조용히 다음 주기를 기다립니다).
      if (payload.manual && isRequester) {
        this.updatePhase = 'error';
        this.updateErrorCode = payload.errorCode || 'UNKNOWN';
      } else if (this.updatePhase === 'checking' && !this._updateRelayTimer) {
        // 내 요청을 기다리는 중(_updateRelayTimer 살아 있음)이 아니라면 원래 상태로 되돌립니다.
        this.updatePhase = this.updateInfo ? 'available' : 'idle';
      }
      return;
    }

    this.updateErrorCode = '';
    if (payload.info) this.updateInfo = payload.info;
    if (payload.checkedAt) {
      this.updateCheckedAt = payload.checkedAt;
      this._updateLastCheckedAt = payload.checkedAt;
    }
    this.updatePhase = payload.phase;

    if (payload.phase === 'available') {
      // 사용자가 직접 누른 확인이라면 "건너뛰기/나중에" 설정을 넘어서 즉시 보여줍니다.
      // (직접 확인했다는 것 자체가 "지금 알고 싶다"는 명확한 의사 표시이기 때문)
      const allowed = payload.manual || shouldNotifyUser({
        latestVersion: payload.info?.version,
        skippedVersion: this._updateSkippedVersion,
        snoozeUntil: this._updateSnoozeUntil,
        now: Date.now(),
      });

      // 자동 발견은 매니저 창에만 배너를 띄웁니다(창 10개에 같은 배너가 뜨는 것 방지).
      if (allowed && (this.isManager || isRequester)) {
        this.isUpdateBannerVisible = true;
      }
      return;
    }

    if (payload.phase === 'uptodate') {
      this.isUpdateBannerVisible = false;
      this.isUpdateGuideOpen = false;
      // 직접 확인을 누른 창에서만 "이미 최신입니다" 안내를 보여줍니다.
      if (payload.manual && isRequester) this._flashUpToDateToast();
    }
  }

  _flashUpToDateToast() {
    if (this._updateToastTimer) clearTimeout(this._updateToastTimer);
    this.showUpToDateToast = true;
    this._updateToastTimer = setTimeout(() => { this.showUpToDateToast = false; }, 2600);
  }

  // 단계별 안내 모달 열기/닫기
  openUpdateGuide() { this.isUpdateGuideOpen = true; }
  closeUpdateGuide() { this.isUpdateGuideOpen = false; }

  // 사용자가 [새 버전 내려받기]를 누르면 기본 브라우저로 공식 설치 파일을 엽니다.
  // 왜 앱이 직접 받지 않는가: B 방식의 핵심은 "다운로드/설치는 사용자와 OS가 하게 두는 것"입니다.
  //   앱이 파일을 만지지 않으므로 사용자의 메모·할 일 데이터가 위험해질 여지가 없습니다.
  async openUpdateDownload() {
    const url = this.updateInfo?.downloadUrl || RELEASES_PAGE_URL;
    try {
      await openUrl(url);
      return true;
    } catch (e) {
      console.error('다운로드 페이지를 열지 못했습니다:', e);
      return false;
    }
  }

  // 릴리스 페이지(설명 + 모든 파일 목록)를 엽니다. 직링크가 막힌 환경의 대안입니다.
  async openReleasePage() {
    const url = this.updateInfo?.pageUrl || RELEASES_PAGE_URL;
    try {
      await openUrl(url);
      return true;
    } catch (e) {
      console.error('릴리스 페이지를 열지 못했습니다:', e);
      return false;
    }
  }

  // "나중에 알림" — 하루 동안 조용히 있습니다.
  async snoozeUpdate() {
    this._updateSnoozeUntil = Date.now() + SNOOZE_DURATION_MS;
    this.isUpdateBannerVisible = false;
    this.isUpdateGuideOpen = false;
    await this._persistUpdateState();
    emit('update-dismissed', {
      snoozeUntil: this._updateSnoozeUntil,
      skippedVersion: this._updateSkippedVersion,
    }).catch(() => {});
  }

  // "이 버전 건너뛰기" — 이 버전은 다시 알리지 않되, 더 새 버전이 나오면 다시 알립니다.
  async skipUpdateVersion() {
    this._updateSkippedVersion = this.updateInfo?.version || '';
    this.isUpdateBannerVisible = false;
    this.isUpdateGuideOpen = false;
    await this._persistUpdateState();
    emit('update-dismissed', {
      snoozeUntil: this._updateSnoozeUntil,
      skippedVersion: this._updateSkippedVersion,
    }).catch(() => {});
  }

  // 업데이트 상태를 전역 키에 저장합니다.
  // 왜 enqueueWrite를 쓰는가: 본문 저장과 동시에 실행되면 "읽기→쓰기" 경합으로
  //   서로의 결과를 덮어쓸 수 있어, 기존 저장 엔진과 같은 줄에 세웁니다.
  async _persistUpdateState() {
    if (!tauriStore || !this._hydrated) return false;

    return enqueueWrite(async () => {
      try {
        await tauriStore.set(UPDATE_STATE_KEY, {
          skippedVersion: this._updateSkippedVersion,
          lastCheckedAt: this._updateLastCheckedAt,
          snoozeUntil: this._updateSnoozeUntil,
          latest: this.updateInfo ? $state.snapshot(this.updateInfo) : null,
        });
        await tauriStore.save();
        return true;
      } catch (e) {
        console.error(`❌ [${this.windowLabel}] 업데이트 상태 저장 실패:`, e);
        return false;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ✨ 새 노트 창 / 새 Tiny Note
  // 빈 번호 찾기·창 옵션 규칙은 windows/windowSlots.js(단위 테스트됨) 한 곳에 있습니다.
  // 왜 한 곳인가: 예전에는 거의 같은 코드가 세 벌(새 창·새 Tiny Note·꺼내기) 복사돼 있어서
  //   한쪽만 고쳐진 채 남는 문제가 있었습니다.
  // ═══════════════════════════════════════════════════════════
  async spawnNewWindow() {
    await this._spawnSlotWindow(NOTE_PREFIX, noteWindowOptions);
  }

  async spawnTinyNote() {
    await this._spawnSlotWindow(TINY_NOTE_PREFIX, tinyNoteWindowOptions);
  }

  async _spawnSlotWindow(prefix, buildOptions) {
    // 버튼을 빠르게 두 번 눌러도 같은 번호의 창을 두 번 만들지 않도록 잠급니다.
    if (this._isSpawningWindow) return;
    this._isSpawningWindow = true;

    try {
      const store = sharedStore();

      // ✨ 1. 논리적 공간 분리: 지금 떠 있는 같은 종류의 창만 셉니다 (열린 창 목록은 한 번만 조회).
      const openLabels = await getOpenWindowLabels();
      if (isSlotLimitReached(prefix, openLabels)) {
        this._flashMaxWindowToast();
        return;
      }

      // ✨ 2. 데이터 우선 복구: 닫혀 있는 번호 중 내용이 남은 창을 먼저 되살리고, 없으면 첫 빈 번호.
      const targetLabel = await findSlot({
        prefix,
        openLabels,
        getData: (label) => store.get(label),
        mode: 'reuse-data-first',
      });
      if (!targetLabel) return;

      // 명부에 없으면 기존 데이터 손실 없이 안전하게 추가
      await this._addToWindowRegistry(targetLabel);

      // ✨ 저장된 크기/위치로 엽니다 (없으면 기본 크기, 롤업 상태면 띠 높이)
      const winData = await store.get(targetLabel);
      openWindow(targetLabel, buildOptions(targetLabel, winData));
    } catch (e) {
      console.error('새 창을 열지 못했습니다:', e);
    } finally {
      this._isSpawningWindow = false;
    }
  }

  // 다음 실행 때 되살릴 창 명부에 라벨을 추가합니다.
  // 왜 쓰기 줄(enqueueWrite)에 태우는가: 이 창의 본문 저장도 같은 명부를 고치므로, 순서대로 실행해야
  //   서로 옛 명부로 덮어쓰지 않습니다.
  async _addToWindowRegistry(label) {
    await enqueueWrite(async () => {
      const store = sharedStore();
      const activeWindows = (await store.get('activeExtraWindows')) || [];
      if (!activeWindows.includes(label)) {
        activeWindows.push(label);
        await store.set('activeExtraWindows', activeWindows);
        await store.save();
      }
    });
  }

  _flashMaxWindowToast() {
    this.showMaxWindowToast = true;
    if (this.maxWindowToastTimer) clearTimeout(this.maxWindowToastTimer);
    this.maxWindowToastTimer = setTimeout(() => {
      this.showMaxWindowToast = false;
    }, 2500);
  }

  // 창 위치를 기억합니다. 물리 좌표(실제 화면 픽셀)와 논리 좌표를 함께 남깁니다.
  // 왜 물리 좌표까지: 배율이 다른 모니터(예: 200% + 100%)를 함께 쓰면 논리 좌표만으로는 어느 모니터 기준인지
  //   알 수 없어, 다음 실행 때 창이 화면 밖(좌표가 배율만큼 커진 곳)에 복원됐습니다. (windows/windowPlacement.js)
  // 최소화 좌표(-32000) 같은 비정상 값은 기억하지 않고 false를 돌려줍니다.
  /** @param {{ x: number, y: number } | null | undefined} physicalPosition @param {number} scaleFactor */
  rememberWindowPosition(physicalPosition, scaleFactor) {
    if (!physicalPosition || !isPlausibleCoordinate(physicalPosition.x) || !isPlausibleCoordinate(physicalPosition.y)) {
      return false;
    }
    const scale = Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
    this.windowPhysX = Math.round(physicalPosition.x);
    this.windowPhysY = Math.round(physicalPosition.y);
    this.windowPosX = physicalPosition.x / scale;
    this.windowPosY = physicalPosition.y / scale;
    return true;
  }

  cycleTinyNoteTheme() {
    const next = nextTinyNoteThemeState(this.themeColor, this.isDarkMode);
    this.themeColor = next.themeId;
    this.isDarkMode = next.isDarkMode;
    this.saveNow();
  }

  // ═══════════════════════════════════════════════════════════
  // ✨ [영속성 안전장치] 저장소 읽기 검증 & 자동 복구
  // ═══════════════════════════════════════════════════════════

  // keys() 호출이 성공했다는 것은 디스크 로딩이 정상적으로 끝났다는 뜻입니다.
  // (키가 0개면 "첫 실행"이라는 정상 상태이고, 예외가 나면 "읽기 실패"입니다.)
  //
  // 왜 시도할 때마다 LazyStore를 새로 만드는가:
  //   LazyStore는 로딩 Promise를 인스턴스 내부에 캐시합니다. 한 번 실패하면
  //   같은 인스턴스로는 몇 번을 다시 불러도 캐시된 같은 에러만 돌아옵니다.
  //   새 인스턴스를 만들어야 진짜 재시도가 됩니다.
  async _ensureStoreLoaded(attempts = 4) {
    for (let i = 1; i <= attempts; i++) {
      const candidate = new LazyStore(STORE_FILE);
      try {
        const keys = await candidate.keys();
        // 저장소가 비어 있는데 디스크 파일에는 데이터가 있다면 "읽기 실패"입니다.
        // 왜 이 확인이 필요한가: 저장 플러그인은 파일을 못 읽어도 오류 없이 빈 저장소로 시작하므로,
        //   keys() 성공만으로는 실패를 알 수 없습니다. 이 상태로 저장하면 모든 창의 데이터가 빈 값으로 덮입니다.
        // 왜 이 경우에만 reload()를 쓰는가: 메모리가 완전히 비어 있어 되돌려질 내용이 없고,
        //   디스크를 다시 읽는 것만이 데이터를 살리는 방법이기 때문입니다.
        if (keys.length === 0 && await this._diskHasData()) {
          await candidate.reload();
          if ((await candidate.keys()).length === 0) {
            throw new Error('디스크에는 데이터가 있지만 저장소를 읽지 못했습니다.');
          }
        }
        // 읽기가 검증된 인스턴스만 실제 저장소로 채택합니다.
        tauriStore = candidate;
        return true;
      } catch (e) {
        console.warn(`[${this.windowLabel}] 저장소 로딩 ${i}차 실패 — 재시도합니다.`, e);
        // 지수 백오프: 디스크가 안정될 시간을 점점 더 길게 줍니다.
        await new Promise((r) => setTimeout(r, 200 * i));
      }
    }
    return false;
  }

  // 디스크의 저장 파일에 실제 데이터가 있는지 Rust에 물어봅니다. (확인할 수 없으면 false)
  async _diskHasData() {
    try {
      const health = await invoke('store_health');
      return Boolean(health && health.parse_ok && health.key_count > 0);
    } catch (e) {
      return false;
    }
  }

  // 읽기가 실패한 창은 저장이 잠긴 채로 방치되지 않고, 살아날 때까지 스스로 재시도합니다.
  _scheduleHydrationRetry(delay = 2000) {
    if (this._hydrationRetryTimer) return;
    this._hydrationRetryTimer = setTimeout(async () => {
      this._hydrationRetryTimer = null;
      const ok = await this._ensureStoreLoaded(2);
      if (!ok) {
        // 최대 30초 간격까지 늘리며 계속 재시도합니다.
        this._scheduleHydrationRetry(Math.min(delay * 2, 30000));
        return;
      }
      this._hydrated = true;
      this.storageError = false;
      await this._rehydrateFromDisk();
    }, delay);
  }

  // 저장소가 살아난 뒤, 화면이 아직 빈 상태라면 디스크의 진짜 데이터를 되살립니다.
  // 왜 "빈 상태일 때만"인가: 그 사이 사용자가 뭔가 입력했다면 그쪽이 최신이므로 덮으면 안 됩니다.
  async _rehydrateFromDisk() {
    try {
      const winData = await tauriStore.get(this.windowLabel);
      if (!winData) return;

      const isEmptyNow = !hasWindowContent({
        todos: this.todos,
        archivedTodos: this.archivedTodos,
        notes: this.notes,
      });
      if (!isEmptyNow) return;

      this.isRestoring = true;
      this.todos = winData.todos || [];
      this.archivedTodos = winData.archivedTodos || [];
      this.notes = winData.notes || '';
      this.title = winData.title || this.title;
      this.activeExtraWindows = (await tauriStore.get('activeExtraWindows')) || this.activeExtraWindows;
      setTimeout(() => { this.isRestoring = false; }, 50);

      console.log(`♻️ [${this.windowLabel}] 저장소 복구 성공 — 디스크 데이터를 되살렸습니다.`);
    } catch (e) {
      console.error(`[${this.windowLabel}] 데이터 재복원 실패:`, e);
    }
  }

  // 되돌리기 기록용 사진을 찍습니다. (대상 필드는 windowDataCodec.js의 SNAPSHOT_FIELDS)
  // 왜 JSON 왕복 복사를 없앴는가: $state.snapshot()이 이미 프록시 없는 깊은 복사본을 돌려주므로
  //   예전의 JSON.parse(JSON.stringify(...))는 같은 복사를 한 번 더 하는 낭비였습니다.
  takeSnapshot() {
    return pickSnapshot((name) => $state.snapshot(this[name]));
  }

  // ✨ [엔진 코어 2] 사진(스냅샷)을 역사 앨범에 끼워넣기 (최대 20개)
  pushToHistory() {
    // 복원 중이거나 준비되지 않았으면 무시
    if (this.isRestoring || !this.isReady) return;
    
    const snap = this.takeSnapshot();

    // 중복 저장 방지 (직전 기록과 똑같으면 기록 안 함)
    if (this.currentIndex >= 0) {
      const currentSnap = this.historyStack[this.currentIndex];
      if (JSON.stringify(currentSnap) === JSON.stringify(snap)) return;
    }

    // 만약 '이전'으로 돌아온 상태에서 새로운 행동을 했다면, 미래의 기록은 지워버림
    // 왜 새 배열을 만들어 통째로 바꾸는가: historyStack은 $state.raw(깊은 추적 없음)라서
    //   push/shift 같은 제자리 수정은 화면(되돌리기 버튼 활성화)에 전달되지 않기 때문입니다.
    const next = [...this.historyStack.slice(0, this.currentIndex + 1), snap];

    // 🚀 과부하 방지: 히스토리가 20개를 넘어가면 제일 오래된 것 폐기
    if (next.length > 20) {
      next.shift();
      this.historyStack = next;
    } else {
      this.historyStack = next;
      this.currentIndex++;
    }
  }

  // ✨ [엔진 코어 3] 이전으로 되돌리기 (Undo)
  async undo() {
    if (this.canUndo) {
      this.currentIndex--;
      await this.applySnapshot(this.historyStack[this.currentIndex]);
    }
  }

  // ✨ [엔진 코어 4] 다시 실행하기 (Redo)
  async redo() {
    if (this.canRedo) {
      this.currentIndex++;
      await this.applySnapshot(this.historyStack[this.currentIndex]);
    }
  }

  // ✨ [엔진 코어 5] 스냅샷을 현실 화면에 적용시키기
  async applySnapshot(snap) {
    this.isRestoring = true; // 무한 루프 락(Lock) ON

    // 상태 덮어쓰기 (필드 목록·옛 스냅샷 보정 규칙은 windowDataCodec.js를 따릅니다)
    for (const name of SNAPSHOT_FIELDS) {
      const value = restoreSnapshotValue(name, snap[name]);
      // 배열(할 일 목록)은 복사해서 넣어, 화면에서 고쳐도 기록 앨범의 원본이 바뀌지 않게 합니다.
      this[name] = Array.isArray(value) ? structuredClone(value) : value;
    }

    // 화면엔 반영되었으니, 하드디스크에도 조용히 저장 (역사에 남기진 않음)
    await this.performSave(); 

    // 화면 렌더링 시간을 주기 위해 0.05초 뒤에 락 해제
    setTimeout(() => { this.isRestoring = false; }, 50);
  }

  // ✨ [하이브리드 저장 & 유령 청소기]
  // 이 메서드는 "경비원" 역할만 합니다. 실제 디스크 쓰기는 _writeToDisk가 담당합니다.
  // 왜 분리했는가:
  //   ① 저장소 읽기가 검증되지 않은 창(_hydrated=false)은 아예 쓰기를 못 하게 막아야 하고,
  //   ② 동시에 들어온 저장 요청은 큐에 세워 하나씩 처리해야 서로 덮어쓰지 않기 때문입니다.
  async performSave() {
    if (!tauriStore) return false;

    // 보조 창(리마인더·환영·우클릭 메뉴·설정)은 자기 데이터가 없으므로 절대 쓰지 않습니다.
    // 왜: 보조 창이 저장하면 매니저에게 동기화 신호가 가고, 빈 키를 지우는 청소 작업까지 돌아
    //     불필요한 디스크 쓰기와 리마인더 미루기 초기화가 발생했습니다.
    if (!isDataWindowLabel(this.windowLabel)) return true;

    // 🛑 [데이터 보호] 디스크 읽기가 검증되지 않았으면 단 한 글자도 쓰지 않습니다.
    //    이 방어가 없으면 "부팅 직후 읽기 실패 → 빈 상태 저장 → 메모 영구 삭제"가 발생합니다.
    if (!this._hydrated) {
      console.warn(`⏸️ [${this.windowLabel}] 저장소 미검증 상태 — 저장을 보류합니다(데이터 보호).`);
      this._scheduleHydrationRetry();
      return false;
    }

    return enqueueWrite(() => this._writeToDisk());
  }

  // 실제 디스크 기록 본체 (항상 큐를 통해서만 호출됩니다)
  async _writeToDisk() {
    try {
      // 저장할 필드 목록·순서는 windowDataCodec.js의 표 하나를 따릅니다 (init·되돌리기와 같은 목록).
      // 전체화면·롤업·세로 스냅·창 위치 같은 창 상태도 모두 이 표에 들어 있습니다.
      const winDataToSave = encodeWindowData((name) => $state.snapshot(this[name]));

      // ✨ HTML 찌꺼기(<br>, &nbsp; 등)만 남은 창은 "빈 창"으로 봅니다 (판정 기준은 코덱과 공유).
      const hasContent = hasWindowContent(winDataToSave);

      // ⏳ [부팅 유예] 창이 열린 직후 1.5초 동안은 빈 창이어도 아무것도 건드리지 않습니다.
      // 왜: 시작 직후에는 아직 사용자가 아무 조작도 하지 않은 시점이라,
      //     이때의 "비어 있음"은 사용자의 의도가 아니라 로딩 경합일 가능성이 있습니다.
      //     실수로 디스크의 멀쩡한 메모를 지우는 사고를 원천 차단합니다.
      if (hasContent) this._everHadContent = true;

      // 한 번도 내용을 가진 적 없는 창이 시작 직후 1.5초 안에 "비어 있다"고 판정되면
      // 그것은 사용자의 의도가 아니라 로딩 경합일 수 있으므로 아무것도 건드리지 않습니다.
      // 반대로 내용을 가졌던 창이 비워진 것은 사용자의 명확한 의도이므로 즉시 청소합니다.
      const isBootGrace = !this._everHadContent && (Date.now() - this._readyAt < 1500);
      if (!hasContent && this.windowLabel !== 'main' && isBootGrace) {
        return true;
      }

      if (!hasContent && this.windowLabel !== 'main') {
        await tauriStore.delete(this.windowLabel);
        
        // 🚨 [핵심 방어 1] 내 옛날 기억으로 명부를 덮어쓰면 안 됩니다!
        // 반드시 하드디스크의 최신 명부를 실시간으로 읽어와서 '나'만 쏙 빼고 다시 넣어야 합니다.
        let latestRegistry = await tauriStore.get('activeExtraWindows') || [];
        if (latestRegistry.includes(this.windowLabel)) {
          latestRegistry = latestRegistry.filter(l => l !== this.windowLabel);
          await tauriStore.set('activeExtraWindows', latestRegistry);
        }
        console.log(`🧹 [${this.windowLabel}] 빈 창 감지: 유령 데이터 청소 완료`);
      } else {
        // 🚨 [핵심 방어 2] 오직 '내 창의 데이터(winDataToSave)'만 저장합니다.
        await tauriStore.set(this.windowLabel, winDataToSave);

        // ✨ globalMuteSound는 전역 공유 키로도 저장 (모든 창이 이 값을 읽습니다)
        await tauriStore.set('globalMuteSound', this.globalMuteSound);

        // ✨ [핵심 방어 3] 내용이 추가되어 유효한 창이 되었으므로, 명부에 내가 확실히 존재하는지 강제 확인합니다.
        // init() 시점에 일시적으로 빈 창으로 판정되어 명부에서 삭제되었을 경우를 완벽히 롤백합니다.
        if (this.windowLabel !== 'main' && (this.windowLabel.startsWith('note-') || this.windowLabel.startsWith('tinynote-'))) {
          let latestRegistry = await tauriStore.get('activeExtraWindows') || [];
          if (!latestRegistry.includes(this.windowLabel)) {
            latestRegistry.push(this.windowLabel);
            await tauriStore.set('activeExtraWindows', latestRegistry);
            console.log(`✨ [${this.windowLabel}] 명부 누락 감지: 안전하게 다시 등록 완료`);
          }
        }
      }

      await tauriStore.save(); 
      
      // ✨ Phase 1: 파일 쓰기가 완전히 완료된 직후 동기화 트리거
      // 단, 리마인더 팝업에 보이는 내용이 바뀌었을 때만 합니다.
      // 왜: 메모 입력·창 이동처럼 팝업과 무관한 저장에도 매번 매니저가 모든 창을 다시 읽었습니다.
      const reminderSignature = this._reminderSignature(winDataToSave);
      if (reminderSignature !== this._lastReminderSignature) {
        this._lastReminderSignature = reminderSignature;
        if (this.isManager) {
          this.syncReminderWindow().catch(console.error);
        } else {
          emit('req-reminder-sync');
        }
      }
      
      return true;
    } catch (e) {
      console.error(`❌ [${this.windowLabel}] 저장 엔진 오류:`, e);
      return false;
    }
  }

  // 리마인더 팝업에 보이는 내용의 "요약값". 이 값이 바뀔 때만 팝업 동기화를 요청합니다.
  _lastReminderSignature = null;
  _reminderSignature(data) {
    const base = {
      title: data.title,
      todos: (data.todos || []).map((t) => [t.id, t.text, t.deadline, Boolean(t.completed)]),
    };
    // 매니저는 팝업의 모양(테마·글꼴·투명도)과 표시 여부(켜기·미루기)도 결정하므로 함께 봅니다.
    if (this.isManager) {
      base.manager = [
        this.themeColor, this.isDarkMode, this.uiFontFamily, this.uiFontSize, this.letterSpacing,
        this.reminderOpacity, this.reminderTitle, this.globalMuteSound, this.showReminders, this.reminderSuppressUntil,
      ];
    }
    return JSON.stringify(base);
  }

  // ✨ [본문 디바운스 저장] 타자 입력용. 타임머신 기록은 조금 더 늦게 남깁니다.
  async save() {
    if (!this.isReady || this.isRestoring) return;

    // ✨ 타자 씹힘 방지: 한글 조합 시간을 벌어주기 위해 500ms 유지
    if (contentSaveTimer) clearTimeout(contentSaveTimer);
    contentSaveTimer = setTimeout(() => {
      contentSaveTimer = null;
      this.saveNow(false);
    }, 500);

    if (this.historyTimeout) clearTimeout(this.historyTimeout);
    this.historyTimeout = setTimeout(() => this.pushToHistory(), 1000);
  }

  // ✨ [즉각 저장] 예약된 지연 저장이 있으면 이 호출이 그 역할을 대신하므로 함께 취소합니다.
  async saveNow(pushHistory = true) {
    if (!this.isReady) return;

    if (contentSaveTimer) { clearTimeout(contentSaveTimer); contentSaveTimer = null; }
    if (settingsSaveTimer) { clearTimeout(settingsSaveTimer); settingsSaveTimer = null; }

    await this.performSave();

    if (pushHistory && !this.isRestoring) {
      if (this.historyTimeout) clearTimeout(this.historyTimeout);
      this.pushToHistory();
    }
  }

  // ✨ [종료 직전 안전 저장] 예약만 되어 있고 아직 기록되지 않은 변경분을 즉시 밀어넣습니다.
  // 왜 필요한가: 창을 닫거나 PC를 종료하면 500ms 디바운스 타이머가 그대로 증발해
  //   "방금 친 마지막 문장"이 저장되지 않은 채 사라집니다.
  //   큐에 남은 다른 쓰기 작업까지 모두 끝난 뒤에야 반환하므로, 종료 시점에 안전합니다.
  // force=false: 예약된 지연 저장이 있을 때만 기록합니다.
  //   (창을 오갈 때마다 불필요한 디스크 쓰기가 쌓이는 것을 막습니다.)
  // force=true : 창을 닫는 등 "지금 반드시 남겨야 하는" 순간에 사용합니다.
  //   (창 위치·크기처럼 타이머 없이 방금 바뀐 값도 확실히 기록됩니다.)
  async flushPendingSaves(force = false) {
    if (!this.isReady) return false;

    const hadPending = !!(contentSaveTimer || settingsSaveTimer);

    if (contentSaveTimer) { clearTimeout(contentSaveTimer); contentSaveTimer = null; }
    if (settingsSaveTimer) { clearTimeout(settingsSaveTimer); settingsSaveTimer = null; }
    if (this.historyTimeout) { clearTimeout(this.historyTimeout); this.historyTimeout = null; }

    if (!force && !hadPending) {
      // 남아 있는 쓰기 작업만 끝까지 기다리고 새로 쓰지는 않습니다.
      try { await whenWritesSettled(); } catch (e) {}
      return true;
    }

    const ok = await this.performSave();
    try { await whenWritesSettled(); } catch (e) {}
    return ok;
  }

  // 👇 [수정 적용] 이제 사용자의 명확한 행동(버튼 클릭 등)은 즉시 타임머신에 기록됩니다 (save -> saveNow)
  async resetContent() {
    this.todos = [];
    this.archivedTodos = [];
    this.notes = '';
    await this.saveNow();
  }

  // ═══════════════════════════════════════════════════════════
  // ✨ [Feature] 마감일 기준 자동 정렬 유틸리티
  // 왜 별도 메서드인가:
  //   addTodo, 마감일 변경, 마감일 제거 등 여러 시점에서 동일한 정렬을 호출해야 하므로
  //   단일 책임 원칙(SRP)에 따라 독립 함수로 분리합니다.
  // ═══════════════════════════════════════════════════════════
  _sortTodosByDeadline() {
    this.todos.sort((a, b) => {
      const hasA = !!a.deadline;
      const hasB = !!b.deadline;

      // 규칙 1: 마감일 없는 항목은 항상 맨 아래 (오름차순·내림차순 공통)
      if (!hasA && !hasB) return 0; // 둘 다 없으면 원래 순서 유지
      if (!hasA) return 1;          // a만 없으면 a가 뒤로
      if (!hasB) return -1;         // b만 없으면 b가 뒤로

      // 규칙 2: 둘 다 마감일이 있으면 sortOrder에 따라 정렬
      const timeA = new Date(a.deadline).getTime();
      const timeB = new Date(b.deadline).getTime();

      return this.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }

  addTodo(text, deadline = "") {
    this.todos.push({ id: newId(), text, completed: false, deadline });
    // ✨ 마감일이 있든 없든, 정렬 유틸리티를 호출하여 올바른 위치에 배치
    this._sortTodosByDeadline();
    this.saveNow();
    if (deadline) setTimeout(() => this.checkReminders(), 100);
  }

  addMultipleTodos(texts) {
    if (!texts || texts.length === 0) return;
    const newItems = texts.map((text) => ({
      id: newId(),
      text,
      completed: false
    }));
    this.todos = [...this.todos, ...newItems];
    this.saveNow();
  }

  toggleTodo(id) {
    const idx = this.todos.findIndex(t => t.id === id);
    if (idx !== -1) {
      const movedItem = { ...this.todos[idx], completed: true };
      this.todos.splice(idx, 1);
      this.archivedTodos.unshift(movedItem);
      this.saveNow();
    }
  }

  restoreTodo(id) {
    const idx = this.archivedTodos.findIndex(t => t.id === id);
    if (idx !== -1) {
      const restoredItem = { ...this.archivedTodos[idx], completed: false };
      this.archivedTodos.splice(idx, 1);
      this.todos.push(restoredItem);
      this.saveNow();
    }
  }

  deleteTodo(id) {
    this.todos = this.todos.filter(t => t.id !== id);
    this.saveNow();
  }

  deleteArchivedTodo(id) {
    this.archivedTodos = this.archivedTodos.filter(t => t.id !== id);
    this.saveNow();
  }

  deleteAllArchivedTodos() {
    this.archivedTodos = [];
    this.saveNow();
  }

  reorderTodos(newList) {
    this.todos = newList;
    this.saveNow();
  }

  adjustLetterSpacing(delta) {
    const sel = window.getSelection();
    let hasSelectionText = false;
    
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      
      if (node instanceof Element && node.closest('[contenteditable="true"]')) {
        hasSelectionText = true;
      }
    }

    // ✨ 1순위: 다중 선택 편집 모드인 경우, 마우스 드래그를 무시하고 일괄 적용합니다.
    if (this.isEditMode && this.selectedTodoIds.length > 0) {
      this._applyInlineLetterSpacingToSelectedTodos(delta);
      return;
    }

    // ✨ 2순위: 다중 선택 모드가 아닐 때만, 마우스로 긁은 부분에만 적용합니다.
    if (hasSelectionText) {
      this._applyInlineLetterSpacingToSelection(delta);
      return;
    }
  }

  _applyInlineLetterSpacingToSelection(delta) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);

    let baseVal = 0;
    const clone = range.cloneContents();
    const firstSpan = clone.querySelector ? clone.querySelector('span[style*="letter-spacing"]') : null;
    
    if (firstSpan && firstSpan.style.letterSpacing && firstSpan.style.letterSpacing.includes('em')) {
       baseVal = parseFloat(firstSpan.style.letterSpacing) || 0;
    } else {
       let n = range.commonAncestorContainer;
       if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
       const editor = n.closest('[contenteditable="true"]');
       while (n && n !== editor) {
         if (n.style && n.style.letterSpacing && n.style.letterSpacing.includes('em')) {
           baseVal = parseFloat(n.style.letterSpacing) || 0;
           break;
         }
         n = n.parentElement;
       }
    }

    const fragment = range.extractContents();
    
    if (fragment.querySelectorAll) {
      fragment.querySelectorAll('*').forEach(el => {
        if (el.style) el.style.removeProperty('letter-spacing');
        if (!el.getAttribute('style')) el.removeAttribute('style');
      });
    } else {
       const walk = (node) => {
         if (node.nodeType === 1) {
           node.style.removeProperty('letter-spacing');
           if (!node.getAttribute('style')) node.removeAttribute('style');
         }
         node.childNodes.forEach(walk);
       };
       fragment.childNodes.forEach(walk);
    }
    
    let wrapper;
    if (fragment.childNodes.length === 1 && fragment.firstChild.nodeName === "SPAN") {
      wrapper = fragment.firstChild;
    } else {
      wrapper = document.createElement("span");
      wrapper.appendChild(fragment);
    }
    
    const nextVal = Math.round((baseVal + delta) * 100) / 100;
    wrapper.style.letterSpacing = `${nextVal}em`;

    range.insertNode(wrapper);
    const newRange = document.createRange();
    newRange.selectNode(wrapper);
    sel.removeAllRanges();
    sel.addRange(newRange);
    
    wrapper.closest("[contenteditable]")?.dispatchEvent(new Event("input", { bubbles: true }));
    this.saveNow();
  }

  _applyInlineLetterSpacingToSelectedTodos(delta) {
    if (this.selectedTodoIds.length === 0) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const parser = new DOMParser();

    const processItemHtml = (html) => {
      if (!html) return html;
      const doc = parser.parseFromString(html, 'text/html');
      let root = doc.body.firstElementChild;
      if (!root || doc.body.childNodes.length > 1 || root.nodeName !== 'DIV') {
        const wrapper = doc.createElement('div');
        wrapper.innerHTML = doc.body.innerHTML;
        doc.body.innerHTML = '';
        doc.body.appendChild(wrapper);
        root = wrapper;
      }
      
      let baseVal = 0;
      if (root.style.letterSpacing && root.style.letterSpacing.includes('em')) {
         baseVal = parseFloat(root.style.letterSpacing) || 0;
      } else {
         const spanChild = root.querySelector('span[style*="letter-spacing"]');
         if (spanChild && spanChild.style.letterSpacing && spanChild.style.letterSpacing.includes('em')) {
            baseVal = parseFloat(spanChild.style.letterSpacing) || 0;
         }
      }

      root.querySelectorAll('*').forEach(el => {
         if (el.style) el.style.removeProperty('letter-spacing');
         if (!el.getAttribute('style')) el.removeAttribute('style');
      });

      const nextVal = Math.round((baseVal + delta) * 100) / 100;
      root.style.letterSpacing = `${nextVal}em`;

      return doc.body.innerHTML;
    };

    this.todos = this.todos.map(todo => 
      this.selectedTodoIds.includes(todo.id) ? { ...todo, text: processItemHtml(todo.text) } : todo
    );
    this.archivedTodos = this.archivedTodos.map(todo => 
      this.selectedTodoIds.includes(todo.id) ? { ...todo, text: processItemHtml(todo.text) } : todo
    );

    this.saveNow();
  }

  toggleDeadlineSort() {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    // ✨ [Composition] 정렬 로직을 _sortTodosByDeadline에 위임하여 중복 제거
    this._sortTodosByDeadline();
    this.saveNow();
  }

  async checkReminders(force = false) {
    if (!this.isManager || !this.showReminders) return;

    if (!force && this.reminderSuppressUntil && Date.now() < this.reminderSuppressUntil) {
      return;
    }

    // ✨ Phase 1: 모든 창의 할 일을 읽어 마감 임박 항목을 모읍니다 (계산은 reminders/reminderEngine.js)
    const store = sharedStore();
    const entries = await this._readReminderEntries(store);
    const { list: imminentList, unnotified, today } = collectImminentTodos(entries);

    // 오늘 처음 알리는 항목에 "알림 보냄" 표시를 남깁니다 (같은 날 다시 울리지 않도록).
    // 열린 창은 그 창이 직접 기록하도록 알리고, 닫힌 창만 매니저가 저장소에 씁니다.
    // 왜: 열린 창의 데이터를 밖에서 고치면 그 창이 다음에 저장할 때 옛 목록으로 덮어써
    //     기록이 사라지고, 같은 할 일이 매시간 다시 알림을 울렸습니다.
    const byLabel = new Map();
    for (const item of unnotified) {
      if (!byLabel.has(item.label)) byLabel.set(item.label, []);
      byLabel.get(item.label).push(item);
    }
    const openLabels = byLabel.size > 0 ? await getOpenWindowLabels() : [];
    let needsSave = false;

    for (const [label, items] of byLabel) {
      if (label === this.windowLabel) {
        for (const { index } of items) {
          if (this.todos[index]) this.todos[index].lastNotified = today;
        }
        needsSave = true;
      } else if (openLabels.includes(label)) {
        emit('reminder-mark-notified', { label, ids: items.map((item) => item.id), date: today }).catch(() => {});
      } else {
        const raw = entries.find((entry) => entry.label === label)?.raw;
        if (!raw) continue;
        const indexes = new Set(items.map((item) => item.index));
        const todos = (raw.todos || []).map((todo, i) => (indexes.has(i) ? { ...todo, lastNotified: today } : todo));
        await enqueueWrite(async () => {
          await store.set(label, { ...raw, todos });
          await store.save();
        });
      }
    }

    if (needsSave) {
      this.saveNow(false);
    }

    if (force || (imminentList.length > 0 && unnotified.length > 0)) {
      this.popupImminentTodos = imminentList;
      this._showFloatingReminder(imminentList);
    }
  }

  // 리마인더 계산에 쓸 "창별 할 일" 목록을 읽습니다.
  // 내 창은 아직 저장 전일 수 있으므로 디스크가 아니라 지금 화면의 값을 씁니다.
  async _readReminderEntries(store) {
    const labels = ['main', ...((await store.get('activeExtraWindows')) || [])];
    const entries = [];
    for (const label of labels) {
      if (label === this.windowLabel) {
        entries.push({ label, title: this.title, todos: this.todos, raw: null });
        continue;
      }
      const raw = (await store.get(label)) || {};
      entries.push({ label, title: raw.title, todos: raw.todos || [], raw });
    }
    return entries;
  }

  _playNotificationSound() {
    if (this.globalMuteSound) return;
    playChime('alert');
  }

  // 리마인더 창을 동시에 두 번 만들지 않도록 잠급니다.
  // 왜 1초 동안 잠그는가: 창 생성은 비동기라, 만들자마자 "이미 있나?"를 물으면 아직 없다고 답할 수 있습니다.
  async _showFloatingReminder(imminentList) {
    if (this._isCreatingReminder) return;
    this._isCreatingReminder = true;
    try {
      await this._openFloatingReminder(imminentList);
    } finally {
      setTimeout(() => { this._isCreatingReminder = false; }, 1000);
    }
  }

  async _openFloatingReminder(imminentList) {
    const existingWindow = await WebviewWindow.getByLabel('reminder');
    if (existingWindow) {
      this.syncReminderWindow(true);
      return;
    }

    // 메인 창에서 사운드 재생 (브라우저 정책 우회)
    this._playNotificationSound();

    try {
      const pm = await primaryMonitor();
      let x = 0, y = 0;
      const w = 280;
      const h = 250;

      if (pm && pm.workArea) {
        const scale = pm.scaleFactor || 1;
        // workArea가 물리 좌표인 경우 스케일로 나눔
        const wX = pm.workArea.position.x / scale;
        const wY = pm.workArea.position.y / scale;
        const wW = pm.workArea.size.width / scale;
        const wH = pm.workArea.size.height / scale;

        x = wX + wW - w - 24; // 우측 여백
        y = wY + wH - h - 24; // 하단 여백 (작업표시줄 위)
      }

      const webview = new WebviewWindow('reminder', {
        url: '/index.html?window=reminder',
        title: 'Tidy Task Reminder',
        width: w,
        height: h,
        minWidth: 200,   // 최소 너비 제한
        minHeight: 150,  // ✨ 최소 높이를 150px까지 허용 (절반 이상 축소 가능)
        x: x !== 0 ? x : undefined,
        y: y !== 0 ? y : undefined,
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        resizable: true,
        skipTaskbar: true,
        focus: false
      });

      // Payload 초기 전달 지연 처리 (창 로드 대기)은 ReminderPopup에서 onMount 시 fetch하거나 이후 update로 처리
    } catch (e) {
      console.error("플로팅 리마인더 생성 실패:", e);
    }
  }

  async syncReminderWindow(playSound = false) {
    if (!this.isManager) return;

    if (!this.showReminders || (this.reminderSuppressUntil && Date.now() < this.reminderSuppressUntil)) {
      await this._closeReminderWindow();
      return;
    }

    // ✨ 점검(checkReminders)과 같은 계산 함수를 써서 두 경로의 결과가 항상 같게 합니다.
    const { list: imminentList } = collectImminentTodos(await this._readReminderEntries(sharedStore()));

    if (imminentList.length === 0) {
      await this._closeReminderWindow();
      return;
    }

    // ✨ Phase 1: 읽기 전용 (보내기만 함)
    const payload = {
      todos: imminentList,
      themeColor: this.themeColor,
      isDarkMode: this.isDarkMode,
      uiFontFamily: this.uiFontFamily,
      uiFontSize: this.uiFontSize,
      letterSpacing: this.letterSpacing,
      opacity: this.reminderOpacity,
      reminderTitle: this.reminderTitle,
      playSound,
      globalMuteSound: this.globalMuteSound,
    };
    await emit('reminder-update', payload);
  }

  async _closeReminderWindow() {
    try {
      const win = await WebviewWindow.getByLabel('reminder');
      if (win) await win.close();
    } catch (e) {}
  }

  dismissReminderPopup(mode, payload = {}) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    if (mode === 'off') {
      this.showReminders = false;
    } else if (mode === '1hour') {
      this.reminderSuppressUntil = now.getTime() + 1000 * 60 * 60;
    } else if (mode === 'custom') {
      // 입력칸이 비었거나 음수면 0으로 봅니다. (음수가 들어가면 과거 시각이 되어 미루기가 무시됐습니다.)
      const h = Math.max(0, Number(payload.hours) || 0);
      const m = Math.max(0, Number(payload.minutes) || 0);
      this.reminderSuppressUntil = now.getTime() + (h * 3600000) + (m * 60000);
    } else if (mode === 'today') {
      let needsSave = false;
      const updatedTodos = [...this.todos];
      for (let i = 0; i < updatedTodos.length; i++) {
        const t = updatedTodos[i];
        if (this.popupImminentTodos.find(p => p.id === t.id)) {
          updatedTodos[i] = { ...t, lastNotified: todayStr };
          needsSave = true;
        }
      }
      if (needsSave) {
        this.todos = updatedTodos;
      }
      // 내일 자정까지 팝업 강제 금지
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      this.reminderSuppressUntil = tomorrow.getTime();
    }
    
    this.saveNow();
  }

  applyFontToAllText(newFontName) {
    const fontObj = this.allFonts.find(f => f.name === newFontName);
    const familyTag = fontObj ? fontObj.family : `"${newFontName}", sans-serif`;

    this.fontFamily = newFontName;
    const safeFamilyTag = familyTag.replace(/"/g, "'");

    const replaceFontInHtml = (html) => {
      if (!html) return html;
      let newHtml = html;
      let styleUpdated = false;

      if (newHtml.toLowerCase().includes('style=')) {
        newHtml = newHtml.replace(/(style\s*=\s*)(["'])(.*?)\2/gi, (match, prefix, quote, styles) => {
          let cleanedStyles = styles.replace(/font-family\s*:\s*([^;]+)/gi, '').trim();
          cleanedStyles = cleanedStyles.replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').trim();
          if (cleanedStyles && !cleanedStyles.endsWith(';')) cleanedStyles += ';';
          styleUpdated = true;
          return `${prefix}${quote}${cleanedStyles} font-family: ${safeFamilyTag};${quote}`;
        });
      }

      if (newHtml.toLowerCase().includes('face=')) {
        newHtml = newHtml.replace(/(<font[^>]*?\sface\s*=\s*)(["'])(.*?)\2/gi, (match, prefix, quote, faceVal) => {
          styleUpdated = true;
          return `${prefix}${quote}${safeFamilyTag}${quote}`;
        });
      }

      if (!styleUpdated) {
        return `<span style="font-family: ${safeFamilyTag};">${newHtml}</span>`;
      }
      return newHtml;
    };

    this.todos = this.todos.map(todo => ({ ...todo, text: replaceFontInHtml(todo.text) }));
    this.archivedTodos = this.archivedTodos.map(todo => ({ ...todo, text: replaceFontInHtml(todo.text) }));
    this.notes = replaceFontInHtml(this.notes);
    this.saveNow();
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
      this.selectedTodoIds = [];
    }
  }

  toggleTodoSelection(id) {
    if (!this.selectedTodoIds.includes(id)) {
      this.selectedTodoIds = [...this.selectedTodoIds, id];
    } else {
      this.selectedTodoIds = this.selectedTodoIds.filter(itemId => itemId !== id);
    }
  }

  selectAll() {
    this.selectedTodoIds = this.filteredTodos.map(t => t.id);
  }

  deselectAll() {
    this.selectedTodoIds = [];
  }

  async deleteSelected() {
    if (this.selectedTodoIds.length === 0) return;
    this.todos = this.todos.filter(t => !this.selectedTodoIds.includes(t.id));
    this.archivedTodos = this.archivedTodos.filter(t => !this.selectedTodoIds.includes(t.id));
    this.selectedTodoIds = [];
    await this.saveNow(); 
  }

  // ✨ 초강력 텍스트 정제 및 HTML 태그 제거 유틸 (외부 복붙 찌꺼기 완벽 차단)
  _stripHtml(html) {
    if (!html) return '';
    
    // 1단계: 브라우저 기본 엔진으로 악성 스크립트 실행 없이 텍스트만 1차 추출
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    let cleanText = tmp.innerText || tmp.textContent || '';

    // 2단계: 정규표현식을 통한 찌꺼기 특수문자 및 연속 공백 완벽 제거
    cleanText = cleanText
      .replace(/&nbsp;/g, ' ')                  // 눈에 안보이는 강제 공백을 일반 공백으로
      .replace(/[\u200B-\u200D\uFEFF]/g, '')    // 폭탄(Zero-width) 문자 제거 (줄바꿈 오류 주범)
      .replace(/<[^>]*>?/gm, '')                // 혹시 모를 잔류 HTML 태그 강제 삭제
      .replace(/\r\n|\r|\n/g, ' ')              // 엑셀/한글 복붙 시 딸려오는 불법 줄바꿈을 공백으로 병합
      .replace(/\s{2,}/g, ' ')                  // 스페이스바를 여러 번 친 연속 공백을 하나로 압축
      .trim();

    return cleanText;
  }

  // ✨ TXT 내보내기 — Tidy Task 양식 (형식 변환은 io/txtPorter.js)
  exportToTxt() {
    const toItem = (t) => ({ text: this._stripHtml(t.text), deadline: t.deadline });
    return buildExportText({
      todos: ($state.snapshot(this.todos) || []).map(toItem),
      archived: ($state.snapshot(this.archivedTodos) || []).map(toItem),
      // 메모는 줄바꿈을 살려 내보냅니다. (예전에는 한 줄로 합쳐져 백업 파일의 문단이 모두 붙었습니다)
      notesLines: htmlToLines(this.notes),
    });
  }

  // ✨ TXT 가져오기 — 위 양식 파싱 (5.0.0이 만든 파일도 읽습니다)
  async importFromTxt(content) {
    if (!content) return false;
    const { todos, archived, notesLines } = parseExportText(content);

    // 가져온 글은 "글자 그대로" 보이도록 HTML 특수문자를 바꿔 넣습니다.
    // (예전에는 "<b>" 같은 글자가 실제 서식으로 해석되었습니다)
    this.todos = todos.map((item) => ({
      id: newId(),
      text: escapeHtml(item.text),
      completed: false,
      deadline: item.deadline,
    }));
    this.archivedTodos = archived.map((item) => ({
      id: newId(),
      text: escapeHtml(item.text),
      completed: true,
      deadline: item.deadline,
    }));
    this.notes = linesToHtml(notesLines);

    await this.saveNow();
    return true;
  }

  async archiveSelected() {
    if (this.selectedTodoIds.length === 0) return;
    
    const activeToArchive = this.todos
      .filter(t => this.selectedTodoIds.includes(t.id))
      .map(t => ({ ...t, completed: true }));

    this.todos = this.todos.filter(t => !this.selectedTodoIds.includes(t.id));
    this.archivedTodos = [...activeToArchive, ...this.archivedTodos];
    
    this.selectedTodoIds = [];
    await this.saveNow();
  }

  applyStyleToSelected(actionType, payload) {
    if (this.selectedTodoIds.length === 0) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const parser = new DOMParser();

    const processItemHtml = (html) => {
      if (!html) return html;
      
      const doc = parser.parseFromString(html, 'text/html');
      let root = /** @type {HTMLElement|null} */ (doc.body.firstElementChild);

      if (!root || doc.body.childNodes.length > 1 || root.nodeName !== 'DIV') {
        const wrapper = doc.createElement('div');
        wrapper.innerHTML = doc.body.innerHTML;
        doc.body.innerHTML = '';
        doc.body.appendChild(wrapper);
        root = wrapper;
      }

      const clearInnerStyles = (cssProps, tagsToRemove = []) => {
        const elements = root.querySelectorAll('*');
        elements.forEach(el => {
          cssProps.forEach(prop => /** @type {HTMLElement} */ (el).style.removeProperty(prop));
          if (!el.getAttribute('style')) el.removeAttribute('style');
        });
        
        tagsToRemove.forEach(tag => {
          const els = root.querySelectorAll(tag);
          els.forEach(el => {
            const parent = el.parentNode;
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
          });
        });
      };

      if (actionType === 'style') {
        Object.entries(payload).forEach(([k, v]) => {
          const kebab = k.replace(/([A-Z])/g, '-$1').toLowerCase();
          /** @type {HTMLElement} */ (root).style.setProperty(kebab, v);
          
          if (kebab === 'font-family') clearInnerStyles(['font-family'], ['font']);
          if (kebab === 'font-size') clearInnerStyles(['font-size'], ['font']);
          if (kebab === 'color') clearInnerStyles(['color'], ['font']);
          if (kebab === 'background-color') clearInnerStyles(['background-color']);
          if (kebab === 'letter-spacing') clearInnerStyles(['letter-spacing']);
        });
      } else if (actionType === 'format') {
        const tagMap = { 
          bold: { tag: 'B', remove: ['STRONG'] }, 
          italic: { tag: 'I', remove: ['EM'] }, 
          underline: { tag: 'U', remove: [] }, 
          strikeThrough: { tag: 'STRIKE', remove: ['S'] } 
        };

        const formatSpec = tagMap[payload];

        if (formatSpec) {
          const targetTag = formatSpec.tag;
          const tagsToRemove = [targetTag, ...formatSpec.remove];
          
          if (root.childNodes.length === 1 && root.firstChild.nodeName === targetTag) {
            const child = root.firstChild;
            while (child.firstChild) {
              root.insertBefore(child.firstChild, child);
            }
            root.removeChild(child);
          } else {
            clearInnerStyles([], tagsToRemove); 
            const newWrapper = doc.createElement(targetTag);
            while (root.firstChild) {
              newWrapper.appendChild(root.firstChild);
            }
            root.appendChild(newWrapper);
          }
        } else if (payload.startsWith('justify')) {
          const align = payload.replace('justify', '').toLowerCase();
          /** @type {HTMLElement} */ (root).style.textAlign = align;
          /** @type {HTMLElement} */ (root).style.display = 'block'; 
          clearInnerStyles(['text-align']);
        }
      }

      return doc.body.innerHTML;
    };

    this.todos = this.todos.map(todo => 
      this.selectedTodoIds.includes(todo.id) ? { ...todo, text: processItemHtml(todo.text) } : todo
    );

    this.archivedTodos = this.archivedTodos.map(todo => 
      this.selectedTodoIds.includes(todo.id) ? { ...todo, text: processItemHtml(todo.text) } : todo
    );

    this.saveNow();
  }
}

export const appState = new AppState();
