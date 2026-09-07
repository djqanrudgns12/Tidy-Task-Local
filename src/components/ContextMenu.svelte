<script>
  import { appState } from '../lib/appState.svelte.js';
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit, emitTo } from '@tauri-apps/api/event';
  import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";

  let { isStandalone = false } = $props();

  let type = $state('bar');
  let config = $state(appState.takeSnapshot());
  let visible = $state(false);
  let menuRef = $state(null);
  let requesterLabel = $state('');

  onMount(() => {
    if (isStandalone) {
      document.body.style.backgroundColor = 'transparent'; // 투명 활성화
      document.body.style.overflow = 'hidden';

      getCurrentWindow().listen('show-ctx-menu', async (ev) => {
        const { x, y, type: t, state, requester } = ev.payload;
        type = t;
        config = state;
        requesterLabel = requester;
        visible = true;

        setTimeout(async () => {
          if (menuRef) {
            let win = getCurrentWindow();
            await win.setSize(new LogicalSize(menuRef.offsetWidth, menuRef.offsetHeight));
            await win.setPosition(new LogicalPosition(x, y));
            await win.show();
            await win.setFocus();
          }
        }, 10);
      });

      getCurrentWindow().onFocusChanged(async ({ payload: focused }) => {
        if (!focused) {
          visible = false;
          await getCurrentWindow().hide();
        }
      });
    }
  });

  function close() {
    visible = false;
    if (isStandalone) getCurrentWindow().hide();
  }

  async function triggerAction(actionName) {
    if (isStandalone) {
      if (requesterLabel) await emitTo(requesterLabel, 'ctx-action', actionName);
      else await emit('ctx-action', actionName);
    }
    close();
  }

  // ── 설정창 열기 ───────────────────────────────────────────────────────────
  async function openSettingsWindow() {
    close();
    if (isStandalone) {
      if (requesterLabel) await emitTo(requesterLabel, 'ctx-action', 'open-settings');
      else await emit('ctx-action', 'open-settings');
    }
  }

  // ── 기능 설명 창 ─────────────────────────────────────────────────────────
  async function openHelp() {
    close();
    if (isStandalone) {
      if (requesterLabel) await emitTo(requesterLabel, 'ctx-action', 'open-help');
      else await emit('ctx-action', 'open-help');
    }
  }

  // ── TXT 내보내기/가져오기 — 메인 창에 처리 위임 ──────────────────────────
  async function handleExport() {
    close();
    if (isStandalone) {
      if (requesterLabel) await emitTo(requesterLabel, 'ctx-action', 'export');
      else await emit('ctx-action', 'export');
    }
  }

  async function handleImport() {
    close();
    if (isStandalone) {
      if (requesterLabel) await emitTo(requesterLabel, 'ctx-action', 'import');
      else await emit('ctx-action', 'import');
    }
  }

  // ── 색상 매핑 ──────────────────────────────────────────────────────────────
  const themeColorMap = {
    white: { bg: "#ffffff", border: "#e5e7eb", text: "#374151", accent: "#d97706" },
    amber: { bg: "#fdfaf3", border: "#e8ddb7", text: "#374151", accent: "#d97706" },
    blue:  { bg: "#f0f7ff", border: "#c4e1f6", text: "#374151", accent: "#3b82f6" },
    green: { bg: "#f2fbf5", border: "#c7ecd5", text: "#374151", accent: "#16a34a" },
    rose:  { bg: "#fff7f8", border: "#f2c9d1", text: "#374151", accent: "#e11d48" },
    purple:{ bg: "#f9f7ff", border: "#ddd3f5", text: "#374151", accent: "#7c3aed" },
    slate: { bg: "#f8fafc", border: "#dce3ea", text: "#374151", accent: "#475569" },
  };

  function bg() { 
    if (config.isDarkMode) return '#1e2028';
    return (themeColorMap[config.themeColor] || themeColorMap.amber).bg;
  }
  function border() { return config.isDarkMode ? 'rgba(255,255,255,0.08)' : (themeColorMap[config.themeColor] || themeColorMap.amber).border; }
  function textC()  { return config.isDarkMode ? '#d1d5db'              : '#374151'; }
  function accent() { return config.isDarkMode ? '#f59e0b'              : (themeColorMap[config.themeColor] || themeColorMap.amber).accent; }
  function sepC()   { return config.isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'; }
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- 독립 창에서는 전체 창을 덮는 오버레이 대신, 창 외부 클릭은 onFocusChanged로 처리됨 -->
  <!-- 그러나 혹시 남는 빈공간(패딩) 처리용으로 투명 div -->
  <div class="context-overlay" onclick={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}></div>

  <div
    bind:this={menuRef}
    class="context-menu"
    style="
      background-color: {bg()};
      border-color: {border()};
      font-family: '{config.uiFontFamily || 'Gulim'}', sans-serif;
      font-size: {config.uiFontSize || 10}pt;
      color: {textC()};
    "
    role="menu"
    onclick={(e) => e.stopPropagation()}
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#if type === 'bar'}
      <!-- ═══ 상단바 우클릭 메뉴 ═══ -->
      <button class="ctx-item" onclick={() => triggerAction('undo')}>
        <span class="ctx-icon">↩</span><span>실행 취소</span>
      </button>
      <button class="ctx-item" onclick={() => triggerAction('redo')}>
        <span class="ctx-icon">↪</span><span>다시 실행</span>
      </button>

      <div class="ctx-sep" style="background:{sepC()}"></div>

      <button class="ctx-item" onclick={handleExport}>
        <span class="ctx-icon">📤</span><span>메모장으로 내보내기</span>
      </button>
      <button class="ctx-item" onclick={handleImport}>
        <span class="ctx-icon">📥</span><span>메모장 가져오기</span>
      </button>

      <div class="ctx-sep" style="background:{sepC()}"></div>

      <button class="ctx-item" onclick={() => triggerAction('toggle-edit')}>
        <span class="ctx-icon">{config.isEditMode ? '🔒' : '✏️'}</span>
        <span style="font-weight: {config.isEditMode ? 'normal' : 'bold'}; color: {config.isEditMode ? '' : accent()};">
          {config.isEditMode ? '편집 모드 OFF' : '편집 모드 ON'}
        </span>
      </button>
      <button class="ctx-item" onclick={() => triggerAction('spawn-window')}>
        <span class="ctx-icon">🪟</span><span>새 창 띄우기</span>
      </button>
      <button class="ctx-item" onclick={() => triggerAction('toggle-archived')}>
        <span class="ctx-icon">{config.showArchived ? '🙈' : '👁️'}</span>
        <span>{config.showArchived ? '마감된 일 숨기기' : '마감된 일 표시'}</span>
      </button>
      <button class="ctx-item" onclick={() => triggerAction('toggle-notes')}>
        <span class="ctx-icon">{config.showNotes ? '🙈' : '👁️'}</span>
        <span>{config.showNotes ? '중요한 일 메모 숨기기' : '중요한 일 메모 표시'}</span>
      </button>

      <div class="ctx-sep" style="background:{sepC()}"></div>

      <button class="ctx-item" onclick={openHelp}>
        <span class="ctx-icon">❔</span><span>기능 설명</span>
      </button>
      <button class="ctx-item" onclick={openSettingsWindow}>
        <span class="ctx-icon">⚙️</span><span>설정</span>
      </button>

    {:else}
      <!-- ═══ 텍스트 영역 우클릭 메뉴 ═══ -->
      <button class="ctx-item" onclick={() => triggerAction('undo')}>
        <span class="ctx-icon">↩</span><span>실행 취소</span>
      </button>
      <button class="ctx-item" onclick={() => triggerAction('redo')}>
        <span class="ctx-icon">↪</span><span>다시 실행</span>
      </button>

      <div class="ctx-sep" style="background:{sepC()}"></div>

      <button class="ctx-item" onclick={() => triggerAction('symbols')}>
        <span class="ctx-icon">Ω</span><span>특수문자</span>
      </button>

      <div class="ctx-sep" style="background:{sepC()}"></div>

      <button class="ctx-item" onclick={() => triggerAction('toggle-edit')}>
        <span class="ctx-icon">{config.isEditMode ? '🔒' : '✏️'}</span>
        <span style="font-weight: {config.isEditMode ? 'normal' : 'bold'}; color: {config.isEditMode ? '' : accent()};">
          {config.isEditMode ? '편집 모드 OFF' : '편집 모드 ON'}
        </span>
      </button>

      <div class="ctx-sep" style="background:{sepC()}"></div>

      <button class="ctx-item" onclick={openHelp}>
        <span class="ctx-icon">❔</span><span>기능 설명</span>
      </button>
      <button class="ctx-item" onclick={openSettingsWindow}>
        <span class="ctx-icon">⚙️</span><span>설정</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .context-overlay {
    position: fixed;
    inset: 0;
    z-index: 89998;
  }
  .context-menu {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 89999;
    min-width: 200px;
    max-width: 260px;
    border-radius: 10px;
    border: 1px solid;
    box-shadow:
      0 8px 32px rgba(0,0,0,0.18),
      0 2px 8px rgba(0,0,0,0.10);
    padding: 4px 0;
    background-color: var(--global-theme-color);
    border-color: var(--global-border-color);
    user-select: none;
    overflow: hidden;
    animation: ctx-pop 0.12s cubic-bezier(.22,.68,0,1.4) both;
  }
  @keyframes ctx-pop {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }
  :global(.ctx-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    line-height: 1.4;
    transition: background-color 0.1s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.ctx-item:hover) {
    background-color: rgba(0,0,0,0.06);
  }
  :global(.ctx-icon) {
    font-size: 12px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }
  .ctx-sep {
    height: 1px;
    margin: 3px 8px;
  }
</style>
