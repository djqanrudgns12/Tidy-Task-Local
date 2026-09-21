<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    Settings2,
    Timer,
    UsersRound,
    BookOpenText,
    Dices,
  } from 'lucide-svelte';
  import {
    native,
    readSettings,
    subscribeSettings,
    patchSettings,
  } from '../../lib/toolkit/store.js';
  import { TOOL_REGISTRY, PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
  import { defaults } from '../../lib/toolkit/preferences.js';
  import { toolkitDrag } from '../../lib/toolkit/drag.js';
  import { openTool, openPlatform, showTimerMenu, resizeToolbar } from '../../lib/toolkit/windows.js';
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
    if (bar) await resizeToolbar(bar.offsetWidth + 14, bar.offsetHeight + 14);
  }
  async function patch(patch: Record<string, unknown>) {
    try {
      previewMenu = false;
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
      <button
        class="toolkit-home"
        title={config.collapsed ? 'Tidy 툴킷 펼치기' : 'Tidy 툴킷 접기'}
        aria-expanded={!config.collapsed}
        aria-label={config.collapsed ? '툴킷 펼치기' : '툴킷 접기'}
        onclick={() => patch({ collapsed: !config.collapsed })}
        ><span class="toolkit-brand-mark"
          ><img src="/images/toolkit/toolkit-icon.png" alt="" draggable="false" /></span
        ></button
      >
      {#if !config.collapsed}<div class="toolkit-crescent">
        {#each TOOL_REGISTRY.filter( (tool) => config.visibleToolIds.includes(tool.id) && tool.id !== 'roster', ) as tool}<button
            class="toolkit-tool"
            class:menu-open={previewMenu}
            onclick={(e) => tool.id !== 'timer' ? openTool(tool.id).catch(() => error = '도구를 열지 못했어요.') : menu(e.currentTarget)}
            aria-haspopup={tool.id === 'timer' ? 'menu' : undefined}
            aria-expanded={tool.id === 'timer' ? previewMenu : undefined}
            ><span class="toolkit-tool-icon">{#if tool.id === 'picker'}<Dices size={18} strokeWidth={2} />{:else if tool.id === 'noticeboard'}<BookOpenText size={18} strokeWidth={2} />{:else}<Timer size={18} strokeWidth={2} />{/if}</span
            ><span class="toolkit-tool-copy"><strong>{tool.label}</strong></span></button
          >{/each}
        {#each PLATFORM_TOOLS.filter((tool) => !config.hiddenPlatformIds.includes(tool.id)) as tool}
          <button class="toolkit-tool" title={`${tool.label} 웹사이트 열기`}
            onclick={() => { previewMenu = false; void openPlatform(tool.id).catch(() => (error = '웹사이트를 열지 못했어요. 다시 눌러 주세요.')); }}>
            <span class="toolkit-platform-icon"><img src={tool.icon} alt="" draggable="false" /></span>
            <span class="toolkit-tool-copy"><strong>{tool.label}</strong></span>
          </button>
        {/each}
        {#if config.visibleToolIds.includes('roster')}<button class="toolkit-tool" onclick={() => { previewMenu = false; void openTool('roster').catch(() => error = '학급 명단을 열지 못했어요.'); }}><span class="toolkit-tool-icon"><UsersRound size={18} strokeWidth={2} /></span><span class="toolkit-tool-copy"><strong>학급 명단</strong></span></button>{/if}
        <button
          class="toolkit-settings"
          aria-label="툴킷 설정"
          title="툴킷 설정"
          onclick={() =>
            openTool('toolkit-settings').catch(() => (error = '설정을 열지 못했어요.'))}
          ><Settings2 size={18} strokeWidth={1.9} /></button
        ></div>{/if}
    </div>
    {#if error}<p role="alert" class="tk-error">{error}</p>{/if}{#if previewMenu}<div
        class="toolkit-preview-menu"
      >
        <ToolkitMenu />
      </div>{/if}
  </div>{/if}
