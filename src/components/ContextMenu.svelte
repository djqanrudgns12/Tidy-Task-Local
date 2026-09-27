<script>
  // @ts-nocheck
  import { onMount, tick } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit, emitTo } from '@tauri-apps/api/event';
  import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
  import { getThemeAccent, getTidyTheme } from '../lib/themes.js';
  import { watchCustomFonts } from '../lib/toolkit/appearance.js';
  import { registerFontFace } from '../lib/fonts.js';
  import { getMonitorGeometries } from '../lib/windows/windowRegistry.js';
  import { Undo2, Redo2, Pencil, Check, Download, Upload, Settings2, CircleHelp, PanelsTopLeft, Utensils, CopyPlus, StickyNote, Archive, NotebookPen, Omega, Scissors, Copy, ClipboardPaste, TextSelect, Pin, Palette, ChevronUp, ChevronDown } from 'lucide-svelte';

  let { isStandalone = false, preview = false, previewType = 'bar', previewDark = false, previewConfig = {}, onaction = undefined }  = $props();
  let type = $state('bar');
  let config = $state({ themeColor: 'amber', isDarkMode: false, showArchived: true, showNotes: true, isEditMode: false, isPinned: false, isRolledUp: false, isFullscreen: false });
  let visible = $state(false);
  let menuRef = $state(null);
  let requesterLabel = $state('');
  let maxHeight = $state(760);
  const launchers = [
    { action: 'open-toolkit', label: 'Tidy 툴킷 열기', icon: PanelsTopLeft },
    { action: 'open-meal', label: '급식창 열기', icon: Utensils },
    { action: 'spawn-window', label: '새 Tidy Task 노트', icon: CopyPlus },
    { action: 'spawn-tiny', label: '새 Tiny Note', icon: StickyNote },
  ];
  onMount(() => {
    if (preview) { type = previewType; config = { ...config, hasEditor: true, ...previewConfig, isDarkMode: previewDark }; visible = true; }
    if (!isStandalone) return;
    document.body.style.backgroundColor = 'transparent';
    document.body.style.overflow = 'hidden';
    let disposed = false;
    const offs = [];
    const register = (off) => disposed ? off() : offs.push(off);
    void watchCustomFonts(fonts => { for (const font of fonts) void registerFontFace(font.name, font.path); }).then(register).catch(() => {});
    let requestId = 0;
    let opening = false;
    getCurrentWindow().listen('show-ctx-menu', async ({ payload }) => {
      const id = ++requestId;
      opening = true;
      try {
        const { x, y, state, requester } = payload;
        type = payload.type;
        config = state;
        requesterLabel = requester;
        const win = getCurrentWindow();
        const monitors = await getMonitorGeometries();
        const monitor = monitors.find(m => x >= m.work.x && x < m.work.x + m.work.width && y >= m.work.y && y < m.work.y + m.work.height) || monitors[0];
        // Move first so the menu measures at the destination monitor's scale.
        await win.setPosition(new PhysicalPosition(x, y));
        const scale = await win.scaleFactor();
        maxHeight = monitor ? Math.floor(monitor.work.height / scale) - 8 : 760;
        if (disposed || id !== requestId) return;
        visible = true;
        await tick();
        if (!menuRef) return;
        const width = menuRef.offsetWidth, height = menuRef.offsetHeight;
        await win.setSize(new LogicalSize(width, height));
        const left = monitor ? Math.max(monitor.work.x, Math.min(x, monitor.work.x + monitor.work.width - width * scale)) : x;
        const top = monitor ? Math.max(monitor.work.y, Math.min(y, monitor.work.y + monitor.work.height - height * scale)) : y;
        await win.setPosition(new PhysicalPosition(Math.round(left), Math.round(top)));
        if (disposed || id !== requestId) return;
        await win.show();
        await win.setFocus();
        menuRef?.querySelector('button')?.focus();
      } catch (error) {
        console.error('[ContextMenu] 표시 실패:', error);
      } finally {
        if (id === requestId) opening = false;
      }
    }).then(async off => {
      register(off);
      // 준비 응답은 실제 열기 리스너가 등록된 다음에만 보냅니다.
      const offPing = await getCurrentWindow().listen('ctx-menu-ping', ({ payload }) => {
        void emitTo(payload.requester, 'ctx-menu-ready', payload.token);
      });
      register(offPing);
    });
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused && !opening) close();
    }).then(register);
    return () => { disposed = true; requestId++; offs.forEach(off => off()); };
  });
  async function close() {
    visible = false;
    if (isStandalone) await getCurrentWindow().hide();
  }
  async function triggerAction(action) {
    const target = requesterLabel;
    await close();
    onaction?.(action);
    if (isStandalone) {
      if (target) await emitTo(target, 'ctx-action', action);
      else await emit('ctx-action', action);
    }
  }
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    const buttons = [...menuRef.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown' || event.key === 'Tab' && !event.shiftKey) next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp' || event.key === 'Tab' && event.shiftKey) next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
  }
</script>

{#snippet item(action, label, Icon, checked = undefined, disabled = false)}
  <button class="item" {disabled} role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={checked} onclick={() => triggerAction(action)}>
    <Icon size={17} strokeWidth={1.7} /><span>{label}</span>
    {#if checked !== undefined}<span class="state" class:active={checked}>{#if checked}<Check size={13} />{:else}<span class="off-dot"></span>{/if}</span>{/if}
  </button>
{/snippet}

{#if visible}
  <div bind:this={menuRef} class="context-menu" class:dark={config.isDarkMode} role="menu" tabindex="-1" aria-label={type === 'tiny' ? 'Tiny Note 메뉴' : 'Tidy Task 메뉴'} onkeydown={keydown} oncontextmenu={e => e.preventDefault()}
    style="--surface:{config.isDarkMode ? '#24262c' : getTidyTheme(config.themeColor).tidy.bg}; --accent:{getThemeAccent(config.themeColor, config.isDarkMode)}; --limit:{maxHeight}px; font-family:'{config.uiFontFamily || 'Gulim'}',sans-serif; font-size:{Math.max(10, config.uiFontSize || 10)}pt;">
    <div class="brand" aria-hidden="true">{type === 'tiny' ? 'Tiny Note' : 'Tidy Task'}<span>빠른 메뉴</span></div>
    <div class="launchers">
      {#each launchers as entry}
        <button role="menuitem" class="launcher" onclick={() => triggerAction(entry.action)}><entry.icon size={18} strokeWidth={1.7}/><span>{entry.label}</span></button>
      {/each}
    </div>
    <div class="separator" role="separator"></div>
    <div class="pair">
      {@render item('undo', '실행 취소', Undo2)}
      {@render item('redo', '다시 실행', Redo2)}
    </div>
    {#if type === 'text' || type === 'tiny'}
      <div class="pair">
        {@render item('cut', '잘라내기', Scissors, undefined, !config.hasSelection)}
        {@render item('copy', '복사', Copy, undefined, !config.hasSelection)}
        {@render item('paste', '붙여넣기', ClipboardPaste, undefined, !config.hasEditor)}
        {@render item('select-all', '모두 선택', TextSelect, undefined, !config.hasEditor)}
      </div>
      <div class="separator" role="separator"></div>
    {/if}
    {#if type !== 'tiny'}{@render item('toggle-edit', '편집 모드', Pencil, config.isEditMode)}{/if}
    {#if type === 'tiny'}
      {@render item('tiny-pin', '항상 위에 표시', Pin, config.isPinned)}
      <div class="pair">
        {@render item('tiny-theme', '테마 바꾸기', Palette)}
        {@render item('tiny-rollup', config.isRolledUp ? '펼치기' : '접기', config.isRolledUp ? ChevronDown : ChevronUp, undefined, config.isFullscreen)}
      </div>
      {@render item('tiny-archive', '보관함에 보관', Archive)}
    {:else if type === 'text'}
      {@render item('symbols', '특수문자', Omega)}
    {:else}
      <div class="separator" role="separator"></div>
      {@render item('toggle-archived', '마감된 일 표시', Archive, config.showArchived)}
      {@render item('toggle-notes', '중요한 일 메모 표시', NotebookPen, config.showNotes)}
      <div class="separator" role="separator"></div>
      {@render item('import', '메모장 가져오기', Download)}
      {@render item('export', '메모장으로 내보내기', Upload)}
    {/if}
    <div class="separator" role="separator"></div>
    <div class="pair footer">
      {@render item('open-help', '기능 설명', CircleHelp)}
      {@render item('open-settings', '설정', Settings2)}
    </div>
  </div>
{/if}

<style>
  .context-menu { --ink:#343b47; --muted:#79808b; --line:rgba(50,60,70,.12); --hover:rgba(50,60,70,.065); box-sizing:border-box; width:max-content; min-width:304px;  max-height:var(--limit); overflow:auto; padding:10px; border:1px solid var(--line); border-radius:14px; background:var(--surface); color:var(--ink); user-select:none; }
  .dark { --ink:#e6e8ef; --muted:#a4aab8; --line:rgba(255,255,255,.12); --hover:rgba(255,255,255,.08); color-scheme:dark; }
  .brand { display:flex; align-items:center; justify-content:space-between; padding:3px 7px 11px; font:600 12px/1.4 system-ui,sans-serif; letter-spacing:.02em; }
  .brand span { color:var(--muted); font-size:11px; font-weight:400; }
  .launchers { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  button { color:inherit; font:inherit; cursor:pointer; border:0; background:transparent; }
  .launcher { display:flex; align-items:center; gap:8px; padding:11px 9px; border:1px solid var(--line); border-radius:8px; text-align:left; font-size:.9em; white-space:nowrap; }
  .launcher :global(svg) { color:var(--accent); flex-shrink:0; }
  .item { display:flex; align-items:center; width:100%; gap:10px; padding:8px 9px; min-height:36px; border-radius:7px; text-align:left; line-height:1.4; white-space:nowrap; }
  .item > :global(svg) { flex-shrink:0; color:var(--muted); }
  .item > span:first-of-type { flex:1; }
  button:disabled { opacity:.38; cursor:default; }
  button:hover:not(:disabled) { background:var(--hover); }
  button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; background:var(--hover); }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  .state { width:24px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:5px; background:var(--hover); color:var(--muted); }
  .state.active { background:var(--accent); color:white; }
  .off-dot { width:7px; height:1px; background:currentColor; }
  .separator { height:1px; background:var(--line); margin:7px 4px; }
  .footer { font-size:.94em; }
</style>
