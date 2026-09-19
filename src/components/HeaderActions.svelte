<script>
  import ToolkitToggle from './toolkit/ToolkitToggle.svelte';
  import { Plus, ChevronDown, Menu, StickyNote, CopyPlus, Archive, MousePointer2, Settings, CircleHelp, Trash2, Check } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { handleSettings } from '../lib/headerWindows.js';
  import { emitTo } from '@tauri-apps/api/event';
  import { appState } from '../lib/appState.svelte.js';
  import HeaderPopover from './HeaderPopover.svelte';
  import { version } from '../../package.json';
  /** @type {{kind: 'create' | 'tools' | 'reset', onArchive?: () => void}} */
  let { kind, onArchive = () => {} } = $props();
  /** @type {HTMLDialogElement | undefined} */ let resetDialog = $state();
  let resetError = $state('');
  let resetting = $state(false);
  let actionError = $state('');
  /** @param {() => unknown} action */
  async function run(action) { try { actionError = ''; await action(); } catch { actionError = '열지 못했어요. 잠시 후 다시 시도해 주세요.'; } }
  async function confirmReset() {
    if (resetting) return;
    resetting = true; resetError = '';
    try { await appState.resetContent(); resetDialog?.close(); }
    catch { resetError = '초기화하지 못했어요. 다시 시도해 주세요.'; }
    finally { resetting = false; }
  }
</script>

{#if kind === 'create'}
  <HeaderPopover id="header-create" label="새 노트" heading="새 노트" buttonClass="tidy-header-create">
    {#snippet trigger()}<Plus size={13} /><span>새 노트</span><ChevronDown size={11} />{/snippet}
    {#snippet children(close)}
      
      <button class="tidy-header-menuitem" onclick={() => { close(); run(() => appState.spawnNewWindow()); }}><CopyPlus size={19}/><span><strong>Tidy Task 노트</strong><small>To do list 창 추가하기</small></span></button>
      <button class="tidy-header-menuitem" onclick={() => { close(); run(() => appState.spawnTinyNote()); }}><StickyNote size={19}/><span><strong>Tiny Note</strong><small>스티커 메모 추가하기</small></span></button>
    {/snippet}
  </HeaderPopover>
{:else}
  {#if kind === 'reset'}
    <button class="tidy-header-button header-reset-shortcut" aria-label="모든 내용 초기화" title="모든 내용 초기화" onclick={() => { resetError = ''; resetDialog?.showModal(); }}><Trash2 size={12}/></button>
  {:else}
  <HeaderPopover id="header-tools" label="메뉴" heading="노트 도구">
    {#snippet trigger()}<Menu size={14}/><span>메뉴</span><ChevronDown size={10}/>{/snippet}
    {#snippet children(close)}
      
      <button class="tidy-header-menuitem" onclick={() => { close(); run(onArchive); }}><Archive size={17}/><span>보관함</span></button>
      <button class="tidy-header-menuitem" aria-pressed={appState.isEditMode} onclick={() => { appState.toggleEditMode(); close(); }}><MousePointer2 size={17}/><span>{appState.isEditMode ? '여러 항목 선택 종료' : '여러 항목 선택'}</span>{#if appState.isEditMode}<Check size={15}/>{/if}</button>
      <div class="tidy-header-divider"></div>
      <ToolkitToggle/>
      <label class="tidy-header-opacity"><span>창 불투명도</span><output>{Math.round(appState.opacity * 100)}%</output><input aria-label="창 불투명도" type="range" min="0.2" max="1" step="0.05" bind:value={appState.opacity} onchange={() => appState.save()}/></label>
      <div class="tidy-header-divider"></div>
      <button class="tidy-header-menuitem" onclick={() => { close(); run(handleSettings); }}><Settings size={17}/><span>설정</span></button>
      <button class="tidy-header-menuitem" onclick={() => { close(); run(() => emitTo(getCurrentWindow().label, 'ctx-action', 'open-help')); }}><CircleHelp size={17}/><span>기능 설명</span></button>
      <div class="tidy-header-meta">Tidy Task · v{version}<br/>© 2026 찰떡쌤. All rights reserved.</div>
      <div class="tidy-header-divider"></div>
      <button class="tidy-header-menuitem tidy-header-danger" onclick={() => { close(); resetError = ''; resetDialog?.showModal(); }}><Trash2 size={17}/><span>모든 내용 초기화…</span></button>
    {/snippet}
  </HeaderPopover>
  {/if}
  <dialog bind:this={resetDialog} class="reset-dialog" aria-labelledby="header-reset-title" oncancel={(e) => { if (resetting) e.preventDefault(); }}>
    <div class="reset-icon"><Trash2 size={22}/></div>
    <h2 id="header-reset-title">모든 내용을 초기화할까요?</h2>
    <p>이 창의 할 일, 마감된 일과 메모가 지워집니다.<br/>필요한 내용은 먼저 보관해 주세요.</p>
    {#if resetError}<p role="alert">{resetError}</p>{/if}
    <div class="reset-actions"><button disabled={resetting} class="tidy-header-button" onclick={() => resetDialog?.close()}>취소</button><button disabled={resetting} class="tidy-header-button reset-confirm" onclick={confirmReset}>{resetting ? '초기화 중…' : '초기화'}</button></div>
  </dialog>
{/if}
{#if actionError}<p class="header-action-error" role="alert">{actionError}</p>{/if}
<style>
  .header-reset-shortcut { min-height:20px; width:18px; padding:0; color:var(--header-muted); }
  .header-reset-shortcut:hover { color:#b43e3e; }
  .reset-dialog { margin:auto; width:min(290px,calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; padding:20px; border:1px solid var(--header-line); border-radius:16px; background:var(--header-panel); color:var(--header-ink); box-shadow:0 20px 60px #0003; }
  .reset-dialog::backdrop { background:#17202c60; }
  .reset-icon { color:#b43e3e; margin-bottom:12px; }
  h2 { font-size:15px; font-weight:700; margin:0 0 8px; }
  p { font-size:12px; line-height:1.7; color:var(--header-muted); }
  .reset-actions { display:flex; gap:8px; margin-top:18px; }
  .reset-actions button { flex:1; border-color:var(--header-line); }
  .reset-confirm { background:#ad3434; color:white; }
  .reset-confirm:hover { background:#942828 !important; }
  .header-action-error { position:fixed; bottom:12px; left:12px; right:12px; background:var(--header-panel); padding:12px; border:1px solid var(--header-line); border-radius:10px; z-index:200001; }
</style>
