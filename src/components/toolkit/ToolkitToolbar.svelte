<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    Settings2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Timer,
  } from 'lucide-svelte';
  import {
    native,
    readSettings,
    subscribeSettings,
    patchSettings,
  } from '../../lib/toolkit/store.js';
  import { TOOL_REGISTRY } from '../../lib/toolkit/registry.js';
  import { defaults } from '../../lib/toolkit/preferences.js';
  import { toolkitDrag } from '../../lib/toolkit/drag.js';
  import { openTool, showTimerMenu, resizeToolbar } from '../../lib/toolkit/windows.js';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { PhysicalPosition } from '@tauri-apps/api/dpi';
  import { resolveSavedPosition } from '../../lib/windows/windowPlacement.js';
  import { getMonitorGeometries, ensureWindowOnScreen } from '../../lib/windows/windowRegistry.js';
  import ToolkitMenu from './ToolkitMenu.svelte';
  let config = $state(defaults().toolkit),
    ready = $state(false),
    error = $state(''),
    previewMenu = $state(false);
  let bar = $state<HTMLDivElement>();
  async function fit() {
    await tick();
    if (bar) await resizeToolbar(bar.offsetWidth + 10, bar.offsetHeight + 10);
  }
  async function patch(patch: Record<string, unknown>) {
    try {
      config = (await patchSettings('toolkit', patch)).toolkit;
      await fit();
    } catch {
      error = '설정을 저장하지 못했어요.';
    }
  }
  async function menu(trigger: HTMLButtonElement) {
    try {
      if (!(await showTimerMenu(trigger!))) previewMenu = !previewMenu;
    } catch {
      error = '타이머 메뉴를 열지 못했어요.';
    }
  }
  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    let saveTimer: ReturnType<typeof setTimeout>;
    void (async () => {
      try {
        const off = await subscribeSettings((s) => {
          if (!disposed) {
            config = s.toolkit;
            void fit();
          }
        });
        if (disposed) {
          off();
          return;
        }
        offs.push(off);
        config = (await readSettings()).toolkit;
        if (native) {
          const win = getCurrentWindow();
          const pos = resolveSavedPosition(config.position || {}, await getMonitorGeometries());
          if (pos) await win.setPosition(new PhysicalPosition(pos.x, pos.y));
          const moved = await win.onMoved(() => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(async () => {
              try {
                const p = await win.outerPosition(),
                  s = await win.outerSize(),
                  scale = await win.scaleFactor();
                await patchSettings('toolkit', {
                  position: {
                    physicalX: p.x,
                    physicalY: p.y,
                    logicalX: p.x / scale,
                    logicalY: p.y / scale,
                    width: s.width / scale,
                    height: s.height / scale,
                  },
                });
              } catch {}
            }, 250);
          });
          if (disposed) moved();
          else offs.push(moved);
        }
        ready = true;
        await fit();
        if (native) {
          await ensureWindowOnScreen(getCurrentWindow());
          await getCurrentWindow().show();
        }
      } catch {
        error = '툴킷 설정을 불러오지 못했어요.';
        ready = true;
        if (native) await getCurrentWindow().show();
      }
    })();
    return () => {
      disposed = true;
      offs.forEach((fn) => fn());
      clearTimeout(saveTimer);
    };
  });
</script>

{#if ready}<div class="toolkit-wrap">
    <div
      bind:this={bar}
      use:toolkitDrag
      class="toolkit-bar"
      class:vertical={config.orientation === 'vertical'}
      class:collapsed={config.collapsed}
    >
      <span class="toolkit-grip" aria-hidden="true">
        {#each Array(6) as _}<i></i>{/each}
      </span>
      <button
        class="toolkit-home"
        aria-expanded={!config.collapsed}
        aria-label={config.collapsed ? '툴킷 펼치기' : '툴킷 접기'}
        onclick={() => patch({ collapsed: !config.collapsed })}
        ><span class="toolkit-brand-mark"
          ><img src="/images/toolkit/toolkit-icon.png" alt="" draggable="false" /></span
        ><span class="toolkit-home-copy"><strong>Tidy 툴킷</strong></span
        ><span class="toolkit-collapse-icon" aria-hidden="true"
          >{#if config.collapsed}{#if config.orientation === 'vertical'}<ChevronDown
                size={14}
              />{:else}<ChevronRight size={14} />{/if}{:else if config.orientation === 'vertical'}<ChevronUp
              size={14}
            />{:else}<ChevronLeft size={14} />{/if}</span
        ></button
      >
      {#if !config.collapsed}<span class="toolkit-divider"
        ></span>{#each TOOL_REGISTRY.filter( (tool) => config.visibleToolIds.includes(tool.id), ) as tool}<button
            class="toolkit-tool"
            class:menu-open={previewMenu}
            onclick={(e) => menu(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={previewMenu}
            ><span class="toolkit-tool-icon"><Timer size={18} strokeWidth={2} /></span
            ><span class="toolkit-tool-copy"><strong>{tool.label}</strong></span
            ><ChevronDown class="toolkit-caret" size={14} /></button
          >{/each}<button
          class="toolkit-settings"
          aria-label="툴킷 설정"
          title="툴킷 설정"
          onclick={() =>
            openTool('toolkit-settings').catch(() => (error = '설정을 열지 못했어요.'))}
          ><Settings2 size={18} strokeWidth={1.9} /><span class="settings-indicator"></span></button
        >{/if}
    </div>
    {#if error}<p role="alert" class="tk-error">{error}</p>{/if}{#if previewMenu}<div
        class="toolkit-preview-menu"
      >
        <ToolkitMenu />
      </div>{/if}
  </div>{/if}
