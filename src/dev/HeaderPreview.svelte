<script>
  // Development-only fixture. Never loads or writes the user's Tauri store.
  import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
  import { listen } from '@tauri-apps/api/event';
  import { appState } from '../lib/appState.svelte.js';
  import { applyHeaderDesignChoice } from '../lib/headerDesign.js';
  import { getTidyTheme } from '../lib/themes.js';
  import SettingsModal from '../components/SettingsModal.svelte';
  import Titlebar from '../components/Titlebar.svelte';
  import MainToolbar from '../components/MainToolbar.svelte';
  import { CalendarDays, Plus, RotateCcw, Pencil } from 'lucide-svelte';

  const params = new URLSearchParams(location.search);
  // 공지용 캡처는 동일한 350px 배치를 3배 해상도로 렌더링합니다.
  const captureScale = params.has("capture-3x") ? 3 : 1;
  /** @type {{command: string, args?: unknown}[]} */
  const calls = [];
  // 설정 창 미리보기(?header-preview&settings)용 흉내: 자동 실행 등록 상태와 데이터 초기화.
  //   &autostart-off   등록이 꺼진 상태에서 시작
  //   &autostart-fail  등록 변경이 실패하는 경우
  //   &wipe-busy       데이터 초기화가 "종료·업데이트 중"으로 거절되는 경우 (없으면 "지우는 중" 화면에 머묾)
  let autostartEnabled = !params.has('autostart-off');
  mockIPC((command, args) => {
    calls.push({ command, args });
    if (command.endsWith('get_all_webviews') || command.endsWith('get_all_windows')) return [];
    if (command.endsWith('is_fullscreen') || command.endsWith('is_maximized')) return false;
    if (command === 'plugin:autostart|is_enabled') return autostartEnabled;
    if (command === 'plugin:autostart|enable' || command === 'plugin:autostart|disable') {
      if (params.has('autostart-fail')) throw new Error('registry');
      autostartEnabled = command.endsWith('enable');
      return null;
    }
    if (command === 'factory_reset') {
      if (params.has('wipe-busy')) throw 'BUSY';
      return new Promise(() => {});
    }
    return null;
  }, { shouldMockEvents: true });
  // 흉내 도구는 emitTo(특정 창에 보내기)를 조용히 삼킵니다. 검수에서 확인할 수 있게 호출만 기록해 둡니다.
  const internals = /** @type {any} */ (window).__TAURI_INTERNALS__;
  const mockedInvoke = internals.invoke;
  internals.invoke = (/** @type {string} */ command, /** @type {unknown} */ args, /** @type {unknown} */ options) => {
    if (command === 'plugin:event|emit_to') calls.push({ command, args });
    return mockedInvoke(command, args, options);
  };
  mockWindows('main');
  appState.save = async () => {};
  appState.saveNow = async () => {};
  appState.spawnNewWindow = async () => { calls.push({ command: 'create-note' }); };
  appState.spawnTinyNote = async () => { calls.push({ command: 'create-tiny' }); };
  appState.headerDesign = params.get('design') === 'classic' ? 'classic' : 'modern';
  appState.title = params.has('empty') ? '' : (params.get('title') || '오늘 할 일');
  appState.isDarkMode = params.has('dark');
  appState.themeColor = params.get('theme') || 'amber';
  appState.uiFontFamily = params.get('font') || '메이플스토리 L';
  appState.isPinned = false;
  appState.showReminders = true;
  appState.notes = '샘플 메모';
  listen('req-set-header-design', (event) => applyHeaderDesignChoice(appState, event.payload, 'main'));
  listen('req-apply-settings', (event) => { appState.showReminders = event.payload.showReminders; if (event.payload.headerDesign) appState.headerDesign = event.payload.headerDesign; });
  // 설정 창이 메모 창에 보내는 요청을 기록해 검수 스크립트(scripts/qa-settings.cjs)가 확인합니다.
  /** @type {{name: string, payload: unknown}[]} */
  const events = [];
  for (const name of ['req-apply-settings', 'req-reset-config', 'req-set-header-design', 'req-add-custom-font']) {
    listen(name, (event) => { events.push({ name, payload: event.payload }); });
  }
  Object.assign(window, { __headerQA: { appState, calls, events } });
  let theme = $derived(getTidyTheme(appState.themeColor)?.tidy || { bg: '#fdfaf3', section: '#f4ebce' });
</script>

{#if params.has('settings')}<SettingsModal/>{:else}
<main class="preview" style="zoom:{captureScale}; height:calc(100vh / {captureScale}); background:{appState.isDarkMode ? '#23272e' : theme.bg}; color:{appState.isDarkMode ? '#e2e8f0' : '#374151'}; --ui-font-family:'{appState.uiFontFamily}',sans-serif;">
  <Titlebar />
  <MainToolbar />
  <div class="preview-body">
    <div contenteditable="true" role="textbox" aria-label="할 일 편집" tabindex="0" class="sample-editor">학급 안내문 확인하기</div>
    <div class="sample-row"><span class="sample-check"></span><span>내일 수업 자료 준비하기</span></div>
    <div class="preview-add"><CalendarDays size={17}/><span>내용을 입력해주세요.</span><Plus size={17}/></div>
  </div>
  <div class="preview-bottom" style="background:{appState.isDarkMode ? '#2c3139' : theme.section}"><div><RotateCcw size={16}/>마감된 일 (0)</div><div><Pencil size={16}/>중요한 일 메모</div><p>중요 내용 메모하기</p></div>
</main>
{/if}
<style>
  .preview { height:100vh; display:flex; flex-direction:column; border:1px solid #9a918b55; border-radius:9px; overflow:hidden; font-family:var(--ui-font-family); }
  .preview-body { padding:14px 12px 12px; flex:1; min-height:90px; display:flex; flex-direction:column; gap:15px; overflow:auto; }
  .sample-editor { font-size:14px; outline:none; }
  .sample-row { display:flex; gap:9px; align-items:center; font-size:14px; }
  .sample-check { width:13px; height:13px; border:1px solid #9ca3af; border-radius:4px; }
  .preview-add { margin-top:auto; display:flex; gap:8px; align-items:center; font-size:12px; opacity:.65; }
  .preview-add span { flex:1; }
  .preview-bottom { min-height:125px; flex-shrink:0; }
  .preview-bottom div { display:flex; gap:8px; padding:12px; font-size:14px; }
  .preview-bottom div:first-child { border-bottom:1px solid #6b728020; }
  .preview-bottom p { opacity:.5; font-size:13px; padding:0 12px 12px; }
</style>
