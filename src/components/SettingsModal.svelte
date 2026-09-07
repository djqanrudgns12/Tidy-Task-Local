<script>
  import { X, Palette, Type, PenLine, Monitor, Layout, Upload, Moon, Archive, FileText, Database, RefreshCw, Bell, VolumeX } from 'lucide-svelte';
  import { appState } from '../lib/appState.svelte.js';
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emitTo, listen, emit } from '@tauri-apps/api/event';
  import { onMount, onDestroy } from 'svelte';
  import ThemePicker from './ThemePicker.svelte';
  import { getTidyTheme } from '../lib/themes.js';

  let targetLabel = 'main';
  let unlistenTarget;

  let isUploading = $state(false);
  let isLoaded = $state(false);
  // ✨ initialSettings 삭제됨
  let initialCustomFonts = []; 

  let localFontSize = $state(appState.fontSize || 10);
  let localUiFontSize = $state(appState.uiFontSize || 10);
  let localThemeColor = $state(appState.themeColor);
  let localUiFontFamily = $state(appState.uiFontFamily || '메이플스토리 L');
  let localIsDarkMode = $state(appState.isDarkMode);
  let localGlobalFont = $state(appState.fontFamily);
  let localShowArchived = $state(appState.showArchived ?? true);
  let localShowNotes = $state(appState.showNotes ?? true);
  let localShowReminders = $state(appState.showReminders ?? true);
  let localGlobalMuteSound = $state(appState.globalMuteSound ?? false);
  
  let showResetDataConfirm = $state(false);
  let showResetConfigConfirm = $state(false);

  onMount(async () => {
    // ✨ 1. 무전을 받으면 타겟 이름과 그 창의 최신 설정값으로 화면을 덮어씁니다!
    unlistenTarget = await listen('set-settings-target', (event) => {
      const data = event.payload;
      targetLabel = data.targetLabel;
      const s = data.settings;

      // 나를 부른 메모장의 진짜 설정으로 UI를 즉시 맞춥니다.
      localFontSize = s.fontSize;
      localUiFontSize = s.uiFontSize;
      localThemeColor = s.themeColor;
      localUiFontFamily = s.uiFontFamily;
      localIsDarkMode = s.isDarkMode;
      localGlobalFont = s.fontFamily; // 주의: appState는 fontFamily로 저장함
      localShowArchived = s.showArchived;
      localShowNotes = s.showNotes;
      localShowReminders = s.showReminders ?? true;
      localGlobalMuteSound = s.globalMuteSound ?? false;

      console.log("타겟 및 설정 동기화 완료:", targetLabel);
    });

    // 커스텀 폰트 목록은 공통으로 사용하므로 그대로 둡니다.
    // (appState.init()은 App.svelte onMount에서 이미 완료됨 — 재호출 불필요)
    initialCustomFonts = [...appState.customFonts];
    isLoaded = true;

    // ✨ 2. 수신기 세팅이 완벽히 끝났으니, 메모장들에게 "나 준비됐어!" 라고 알립니다.
    await emit('settings-ready');
  });

  async function handleCancel() {
    appState.customFonts = [...initialCustomFonts];
    await getCurrentWindow().close();
  }

  async function handleCloseAction() {
    await getCurrentWindow().close();
  }

  async function resetContent() {
    await emitTo(targetLabel, 'req-reset-data');
    showResetDataConfirm = false;
    await handleCloseAction();
  }

  async function resetConfig() {
    await emitTo(targetLabel, 'req-reset-config'); // ✨ 1:1 무전
    showResetConfigConfirm = false;
    await handleCloseAction();
  }

  async function handleFontUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    isUploading = true;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      const fullPath = await invoke('save_custom_font', { name: file.name, bytes });
      const fontName = file.name.split('.')[0].replace(/[^a-zA-Z0-9\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]/g, '');
      await emit('req-add-custom-font', { name: fontName, path: fullPath });

      localGlobalFont = fontName;
      localUiFontFamily = fontName;
    } catch (err) {
      console.error('Font upload error:', err);
    } finally {
      isUploading = false;
    }
  }
  
  async function applySettings() {
    // ✨ Phase 4: 글로벌 킬 스위치 및 통합 리마인더 설정 적용을 전역으로 브로드캐스트
    await emit('req-apply-settings', {
      targetWindow: targetLabel,
      fontSize: localFontSize,
      uiFontSize: localUiFontSize, 
      themeColor: localThemeColor,
      uiFontFamily: localUiFontFamily,
      isDarkMode: localIsDarkMode,
      globalFont: localGlobalFont,
      showArchived: localShowArchived,
      showNotes: localShowNotes,
      showReminders: localShowReminders,
      globalMuteSound: localGlobalMuteSound
    });
    await getCurrentWindow().close();
  }

    onDestroy(() => {
    if (unlistenTarget) unlistenTarget();
  });
</script>

<!-- 루트에 여백을 두지 않습니다.
     왜: p-1(4px)을 주면 창 가장자리에 4px 투명 띠가 생기는데,
       이 창은 transparent:true 라서 그 띠로 뒤 화면이 그대로 비칩니다.
       둥근 모서리와 맞물려 네 귀퉁이에 각진 잔재처럼 보이던 원인입니다.
       메인 창처럼 배경 컨테이너가 창을 꽉 채우도록 맞췄습니다. -->
<div class="h-screen w-screen flex" style="font-family: {localUiFontFamily}; font-size: {localUiFontSize}pt;">
  <div
    class="w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden border relative transition-colors duration-300"
    style="
      background-color: {localIsDarkMode ? '#232530' : getTidyTheme(localThemeColor).tidy.bg};
      border-color: {localIsDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'}; 
      color: {localIsDarkMode ? '#e2e8f0' : '#1f2937'};
    "
  >
    <div
      class="flex items-center justify-between px-4 py-3 border-b cursor-move select-none"
      style="
        background-color: {localIsDarkMode ? '#2d303e' : 'rgba(0,0,0,0.03)'}; 
        border-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
      "
      data-tauri-drag-region
    >
      <span class="font-bold tracking-wide text-[0.9em]" data-tauri-drag-region>시스템 설정</span>
      <button onclick={handleCancel} class="p-1 rounded-full hover:bg-white/10 transition-colors">
        <X size="1.2em" style="color: {localIsDarkMode ? '#94a3b8' : '#6b7280'};" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 custom-scrollbar">
      
      <div class="p-3.5 rounded-xl border transition-all duration-300 shadow-sm" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};">
        <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
          <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
            <Palette size={14} strokeWidth={2.5} />
          </span>
          테마 색상
        </label>
        <div class="pl-[34px] mt-2">
          <ThemePicker bind:value={localThemeColor} isDarkMode={localIsDarkMode} />
        </div>
      </div>

      <div class="p-3.5 rounded-xl border transition-all duration-300 shadow-sm" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};">
        <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
          <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
            <Type size={14} strokeWidth={2.5} />
          </span>
          기본 글자 크기 (<span class="text-amber-600">{localFontSize}pt</span>)
        </label>
        <div class="pl-[34px] mt-2">
          <input type="range" min="6" max="14" step="1" bind:value={localFontSize} class="w-full h-1.5 bg-gray-200 rounded-full appearance-none accent-amber-500 cursor-pointer" />
          <p class="text-[0.75em] font-medium mt-2 tracking-tight transition-colors" style="color: {localIsDarkMode ? '#94a3b8' : '#64748b'};">
            할 일과 메모장에 작성되는 기본 글자 크기 조정
          </p>
        </div>
      </div>

      <div class="p-3.5 rounded-xl border transition-all duration-300 shadow-sm" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};">
        <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
          <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
            <PenLine size={14} strokeWidth={2.5} />
          </span>
          기본 글꼴 변경
        </label>
        <div class="pl-[34px] mt-2">
          <select
            bind:value={localGlobalFont}
            class="w-full border rounded-lg py-2 px-2 text-[0.85em] outline-none cursor-pointer transition-colors duration-300" 
            style="background-color: {localIsDarkMode ? '#2d303e' : '#ffffff'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; color: {localIsDarkMode ? '#e2e8f0' : '#1f2937'};"
          >
            {#each appState.allFonts as font}
              <option value={font.name} style="font-family: {font.family};">{font.name}</option>
            {/each}
          </select>
          <p class="text-[0.75em] font-medium mt-2 tracking-tight transition-colors" style="color: {localIsDarkMode ? '#94a3b8' : '#64748b'};">
            사용자가 작성한 글꼴을 일괄 변경
          </p>
        </div>
      </div>

      <div class="p-3.5 rounded-xl border transition-all duration-300 shadow-sm" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};">
        <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
          <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
            <Monitor size={14} strokeWidth={2.5} />
          </span>
          UI 글자 크기 (<span class="text-amber-600">{localUiFontSize}pt</span>)
        </label>
        <div class="pl-[34px] mt-2">
          <input type="range" min="6" max="15" step="1" bind:value={localUiFontSize} class="w-full h-1.5 bg-gray-200 rounded-full appearance-none accent-amber-500 cursor-pointer" />
          <p class="text-[0.75em] font-medium mt-2 tracking-tight transition-colors" style="color: {localIsDarkMode ? '#94a3b8' : '#64748b'};">
            사용자 인터페이스 글자 크기 변경
          </p>
        </div>
      </div>

      <div class="p-3.5 rounded-xl border transition-all duration-300 shadow-sm" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};">
        <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
          <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
            <Layout size={14} strokeWidth={2.5} />
          </span>
          UI 글꼴 변경
        </label>
        <div class="pl-[34px] mt-2">
          <select
            bind:value={localUiFontFamily}
            class="w-full border rounded-lg py-2 px-2 text-[0.85em] outline-none cursor-pointer transition-colors duration-300" 
            style="background-color: {localIsDarkMode ? '#2d303e' : '#ffffff'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; color: {localIsDarkMode ? '#e2e8f0' : '#1f2937'};"
          >
            {#each appState.allFonts as font}
              <option value={font.name} style="font-family: {font.family};">{font.name}</option>
            {/each}
          </select>
          <p class="text-[0.75em] font-medium mt-2 tracking-tight transition-colors" style="color: {localIsDarkMode ? '#94a3b8' : '#64748b'};">
            사용자 인터페이스 폰트 변경
          </p>
        </div>
      </div>

      <div class="p-3.5 rounded-xl border transition-all duration-300 shadow-sm" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};">
        <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
          <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
            <Upload size={14} strokeWidth={2.5} />
          </span>
          커스텀 폰트 등록
        </label>
        <div class="pl-[34px] mt-2">
          <div class="relative w-full border border-dashed rounded-lg p-2 flex flex-col items-center justify-center" style="border-color: {localIsDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}; background-color: {localIsDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)'};">
            <input type="file" accept=".ttf,.otf" onchange={handleFontUpload} class="absolute inset-0 opacity-0 cursor-pointer" disabled={isUploading} />
            <span class="text-[0.75em] font-medium" style="color: {isUploading ? '#f59e0b' : (localIsDarkMode ? '#94a3b8' : '#6b7280')};">
              {isUploading ? '글꼴을 안전하게 설치하는 중...' : '클릭하여 파일 선택 (.ttf, .otf)'}
            </span>
          </div>
        </div>
      </div>

      <div class="p-3.5 rounded-xl border transition-all duration-300 shadow-sm flex flex-col gap-4" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};">
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
            <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
              <Moon size={14} strokeWidth={2.5} />
            </span>
            다크 모드
          </label>
          <button
            onclick={() => { localIsDarkMode = !localIsDarkMode; }} 
            class="relative inline-flex items-center w-9 h-5 rounded-full transition-all" 
            style="background-color: {localIsDarkMode ? '#f59e0b' : '#d1d5db'};"
          >
            <span class="inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform" style="translate: {localIsDarkMode ? '18px' : '2px'};"></span>
          </button>
        </div>
      
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
            <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
              <Archive size={14} strokeWidth={2.5} />
            </span>
            마감된 일 표시
          </label>
          <button
            onclick={() => { localShowArchived = !localShowArchived; }} 
            class="relative inline-flex items-center w-9 h-5 rounded-full transition-all" 
            style="background-color: {localShowArchived ? '#f59e0b' : '#d1d5db'};"
          >
            <span class="inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform" style="translate: {localShowArchived ? '18px' : '2px'};"></span>
          </button>
        </div>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
            <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
              <FileText size={14} strokeWidth={2.5} />
            </span>
            중요한 메모 표시
          </label>
          <button
            onclick={() => { localShowNotes = !localShowNotes; }} 
            class="relative inline-flex items-center w-9 h-5 rounded-full transition-all" 
            style="background-color: {localShowNotes ? '#f59e0b' : '#d1d5db'};"
          >
            <span class="inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform" style="translate: {localShowNotes ? '18px' : '2px'};"></span>
          </button>
        </div>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
            <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
              <Bell size={14} strokeWidth={2.5} />
            </span>
            통합 리마인더 (모든 창에 적용)
          </label>
          <button
            onclick={() => { localShowReminders = !localShowReminders; }} 
            class="relative inline-flex items-center w-9 h-5 rounded-full transition-all" 
            style="background-color: {localShowReminders ? '#f59e0b' : '#d1d5db'};"
          >
            <span class="inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform" style="translate: {localShowReminders ? '18px' : '2px'};"></span>
          </button>
        </div>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2.5 text-[0.85em] font-bold" style="color: {localIsDarkMode ? '#cbd5e1' : '#4b5563'};">
            <span class="flex items-center justify-center w-6 h-6 rounded-md transition-colors" style="background-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: {localIsDarkMode ? '#fbbf24' : '#d97706'};">
              <VolumeX size={14} strokeWidth={2.5} />
            </span>
            전체 무음 모드
          </label>
          <button
            onclick={() => { localGlobalMuteSound = !localGlobalMuteSound; }} 
            class="relative inline-flex items-center w-9 h-5 rounded-full transition-all" 
            style="background-color: {localGlobalMuteSound ? '#f59e0b' : '#d1d5db'};"
          >
            <span class="inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform" style="translate: {localGlobalMuteSound ? '18px' : '2px'};"></span>
          </button>
        </div>
      </div>

    </div>

    <div
      class="flex flex-col border-t transition-colors duration-300"  
      style="
        background-color: {localIsDarkMode ? '#1a1b23' : 'rgba(0,0,0,0.02)'}; 
        border-color: {localIsDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
      "
    >
      <div class="flex items-center justify-between px-4 py-2.5 border-b transition-colors duration-300" style="background-color: {localIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)'}; border-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};">
        <div class="flex gap-3">
          <button onclick={() => showResetDataConfirm = true} class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold transition-all active:scale-95 group" style="color: {localIsDarkMode ? '#f87171' : '#ef4444'};">
            <Database size={12} class="opacity-70 group-hover:opacity-100 transition-opacity" />
            <span class="opacity-80 group-hover:opacity-100">데이터 초기화</span>
          </button>
          <button onclick={() => showResetConfigConfirm = true} class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold transition-all active:scale-95 group" style="color: {localIsDarkMode ? '#94a3b8' : '#64748b'};">
            <RefreshCw size={12} class="opacity-70 group-hover:opacity-100 transition-opacity" />
            <span class="opacity-80 group-hover:opacity-100">설정 초기화</span>
          </button>
        </div>
        <span class="text-[9px] font-medium opacity-30 select-none uppercase tracking-widest" style="color: {localIsDarkMode ? '#ffffff' : '#000000'};">v.4.5.0</span>
      </div>

      <div class="flex items-center justify-end px-5 py-4 gap-3">
        <button onclick={handleCancel} class="px-5 py-2 rounded-xl text-[0.85em] font-bold transition-all active:scale-95" style="color: {localIsDarkMode ? '#94a3b8' : '#64748b'}; background-color: {localIsDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};">
          취소
        </button>
        <button onclick={applySettings} class="px-6 py-2 rounded-xl text-[0.85em] font-bold text-white shadow-lg shadow-amber-500/20 active:scale-95 transition-all" style="background-color: #f59e0b;">
          반영
        </button>
      </div>
    </div>

    {#if showResetDataConfirm}
      <div class="absolute inset-0 z-50 flex items-center justify-center" style="background-color: {localIsDarkMode ? 'rgba(35, 37, 48, 0.95)' : 'rgba(255, 255, 255, 0.95)'};">
        <div class="w-full px-8 text-center">
          <p class="font-bold mb-5 tracking-tight" style="color: {localIsDarkMode ? '#e2e8f0' : '#1f2937'};">정말 모든 데이터를 초기화할까요?</p>
          <div class="flex gap-3">
            <button onclick={() => showResetDataConfirm = false} class="flex-1 py-2.5 rounded-xl text-sm font-medium" style="background-color: {localIsDarkMode ? '#3e4150' : '#f3f4f6'}; color: {localIsDarkMode ? '#94a3b8' : '#4b5563'};">취소</button>
            <button onclick={resetContent} class="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-500/20">초기화</button>
          </div>
        </div>
      </div>
    {/if}

    {#if showResetConfigConfirm}
      <div class="absolute inset-0 z-50 flex items-center justify-center" style="background-color: {localIsDarkMode ? 'rgba(35, 37, 48, 0.95)' : 'rgba(255, 255, 255, 0.95)'};">
        <div class="w-full px-8 text-center">
          <p class="font-bold mb-5 tracking-tight" style="color: {localIsDarkMode ? '#e2e8f0' : '#1f2937'};">시스템 설정을 처음으로 되돌릴까요?</p>
          <div class="flex gap-3">
            <button onclick={() => showResetConfigConfirm = false} class="flex-1 py-2.5 rounded-xl text-sm font-medium" style="background-color: {localIsDarkMode ? '#3e4150' : '#f3f4f6'}; color: {localIsDarkMode ? '#94a3b8' : '#4b5563'};">취소</button>
            <button onclick={resetConfig} class="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-500/20">초기화</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
  :global(body) { background: transparent !important; }
</style>
