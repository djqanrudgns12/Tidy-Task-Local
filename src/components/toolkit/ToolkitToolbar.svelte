<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import ToolIcon from './ToolIcon.svelte';
  import { Ellipsis } from 'lucide-svelte';
  import {
    native,
    readSettings,
    subscribeSettings,
    subscribeToolOrderPreview,
    patchSettings,
  } from '../../lib/toolkit/store.js';
  import { TOOL_REGISTRY, PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
  import { defaults, TOOLBAR_SIZES } from '../../lib/toolkit/preferences.js';
  import { toolkitDrag } from '../../lib/toolkit/drag.js';
  import {
    openTool,
    showToolkitMenu,
    showToolkitContextMenu,
    resizeToolbar,
    centerToolbarIfRequested,
  } from '../../lib/toolkit/windows.js';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';
  import { PhysicalPosition } from '@tauri-apps/api/dpi';
  import { resolveSavedPosition } from '../../lib/windows/windowPlacement.js';
  import { getMonitorGeometries, ensureWindowOnScreen } from '../../lib/windows/windowRegistry.js';
  import ToolkitMenu from './ToolkitMenu.svelte';
  let config = $state(defaults().toolkit),
    ready = $state(false),
    error = $state(''),
    previewMenu = $state<'' | 'timer' | 'picker' | 'scoreboard' | 'external' | 'more' | 'context'>('');
  const visiblePlatforms = $derived(
    PLATFORM_TOOLS.filter((tool) => config.externalToolsEnabled && !config.hiddenPlatformIds.includes(tool.id)),
  );
  const toolsById: Record<string, (typeof TOOL_REGISTRY)[number]> = Object.fromEntries(TOOL_REGISTRY.map((tool) => [tool.id, tool]));
  let previewOrder = $state<string[] | null>(null);
  const orderedVisibleIds = $derived((previewOrder ?? config.toolOrderIds).filter((id) =>
    id === 'external' ? visiblePlatforms.length > 0 : config.visibleToolIds.includes(id),
  ));
  let bar = $state<HTMLDivElement>();
  let menuTrigger: HTMLButtonElement | undefined;
  function closePreviewMenu() {
    previewMenu = '';
    menuTrigger?.focus();
  }
  let fittedSize = '';
  let fitQueue = Promise.resolve();
  let isDragging = $state(false);
  let pendingFitAfterDrag = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  // 왜 컴포넌트 최상위에 두는가(M4): onDragEnd와 onMoved가 같은 중복 제거 키를 공유해야
  // 드래그 종료 직후 늦게 도착하는 tauri://move 이벤트가 중복 toolkit_patch를 부르지 않습니다.
  let savedPosition = '';

  async function savePositionFromGeometry(geometry: {
    physicalX: number;
    physicalY: number;
    outerWidth: number;
    outerHeight: number;
    scaleFactor: number;
  }) {
    // 최소화 좌표(-32000)나 크기 0은 실제 위치가 아니므로 저장하지 않습니다(claude.md 3.2.2).
    if (
      !Number.isFinite(geometry.physicalX) ||
      !Number.isFinite(geometry.physicalY) ||
      geometry.physicalX <= -32000 ||
      geometry.physicalY <= -32000 ||
      !(geometry.outerWidth > 0) ||
      !(geometry.outerHeight > 0) ||
      !(geometry.scaleFactor > 0)
    ) {
      return;
    }
    const position = {
      physicalX: geometry.physicalX,
      physicalY: geometry.physicalY,
      logicalX: geometry.physicalX / geometry.scaleFactor,
      logicalY: geometry.physicalY / geometry.scaleFactor,
      width: geometry.outerWidth / geometry.scaleFactor,
      height: geometry.outerHeight / geometry.scaleFactor,
    };
    const key = JSON.stringify(position);
    if (key === savedPosition) return;
    await patchSettings('toolkit', { position });
    savedPosition = key;
  }

  function handleDragStart() {
    isDragging = true;
    clearTimeout(saveTimer);
  }

  function handleDragEnd(payload: import('../../lib/toolkit/dragMachine.js').DragEndEvent) {
    isDragging = false;
    clearTimeout(saveTimer);
    if (native && payload.moved && !payload.cancelled && payload.geometry) {
      void savePositionFromGeometry(payload.geometry).catch(() => {});
    }
    if (pendingFitAfterDrag) {
      pendingFitAfterDrag = false;
      void fit().catch(() => (error = '툴바 크기를 맞추지 못했어요.'));
    }
  }

  async function fit() {
    // 드래그 중에는 ResizeObserver(DPI 1px 반올림 등)나 설정 방송으로 resizeToolbar/setPosition이 끼어들지 못하게 미룹니다.
    if (isDragging) {
      pendingFitAfterDrag = true;
      return fitQueue;
    }
    await tick();
    if (!bar || isDragging) {
      if (isDragging) pendingFitAfterDrag = true;
      return fitQueue;
    }
    const rect = bar.getBoundingClientRect();
    const width = Math.ceil(rect.width) + 14;
    const height = Math.ceil(rect.height) + 14;
    const size = `${width}x${height}`;
    if (size === fittedSize) return fitQueue;
    fittedSize = size;
    // Serialize native resizes so an earlier measurement cannot win a race.
    fitQueue = fitQueue.catch(() => {}).then(() => resizeToolbar(width, height));
    try {
      await fitQueue;
    } catch (cause) {
      if (fittedSize === size) fittedSize = '';
      throw cause;
    }
  }
  // 트레이로 불려 왔을 때 둘레가 2초 동안 몇 번 깜빡여 "여기 있어요"를 알립니다.
  // 길이는 toolkit.css의 toolkit-summon 애니메이션(2s)과 같아야 합니다.
  const SUMMON_MS = 2000;
  let summoned = $state(false);
  let summonTimer: ReturnType<typeof setTimeout> | undefined;
  async function signalArrival() {
    // 숨어 있던 창은 보이기 전까지 화면을 그리지 않습니다. 첫 프레임이 그려진 뒤에 시작해야
    // 깜빡임이 안 보이는 동안 흘러가 버리지 않습니다.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    clearTimeout(summonTimer);
    // 깜빡이는 도중 또 불려도 처음부터 다시 깜빡이도록, 뗀 상태를 한 번 화면에 확정한 뒤 다시 붙입니다.
    summoned = false;
    await tick();
    void bar?.offsetWidth;
    summoned = true;
    summonTimer = setTimeout(() => (summoned = false), SUMMON_MS);
  }
  function observeToolbar(node: HTMLDivElement) {
    // CSS, font loading, and tool visibility can change the dock after mount.
    const observer = new ResizeObserver(() => {
      void fit().catch(() => (error = '툴바 크기를 맞추지 못했어요.'));
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  async function patch(patch: Record<string, unknown>) {
    try {
      previewMenu = '';
      config = (await patchSettings('toolkit', patch)).toolkit;
      await fit();
    } catch {
      error = '설정을 저장하지 못했어요.';
    }
  }
  async function menu(trigger: HTMLButtonElement, kind: 'timer' | 'picker' | 'scoreboard' | 'external' | 'more') {
    menuTrigger = trigger;
    try {
      if (!(await showToolkitMenu(trigger, kind, kind === 'external' ? visiblePlatforms.length : undefined)))
        previewMenu = previewMenu === kind ? '' : kind;
    } catch {
      error = `${kind === 'timer' ? '타이머' : kind === 'picker' ? '간단 뽑기' : kind === 'scoreboard' ? '점수판' : kind === 'more' ? '더보기' : '외부 툴'} 메뉴를 열지 못했어요.`;
    }
  }
  // 항목이 여럿인 도구(타이머·간단 뽑기·점수판)는 드롭다운을 열고, 나머지는 바로 창을 엽니다.
  const menuKind = (id: string) => (id === 'timer' || id === 'picker' || id === 'scoreboard' ? id : null);
  // 아이콘·패널 어디서 우클릭해도 WebView 기본 메뉴(뒤로·새로 고침·검사) 대신 툴킷 메뉴를 띄웁니다.
  async function contextMenu(e: MouseEvent) {
    e.preventDefault();
    if (isDragging) return;
    // 키보드(Shift+F10·메뉴 키)로 열면 좌표가 0이므로, 초점 받은 요소 아래에 붙입니다.
    let x = e.clientX,
      y = e.clientY;
    if (!x && !y && e.target instanceof Element) {
      const rect = e.target.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom;
    }
    try {
      if (!(await showToolkitContextMenu(x, y))) previewMenu = 'context';
    } catch {
      error = '툴킷 메뉴를 열지 못했어요.';
    }
  }
  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    void (async () => {
      try {
        const offPreview = await subscribeToolOrderPreview((ids) => {
          if (!disposed) previewOrder = ids;
        });
        if (disposed) { offPreview(); return; }
        offs.push(offPreview);
        const off = await subscribeSettings((s) => {
          if (!disposed) {
            config = s.toolkit;
            void fit().catch(() => (error = '툴바 크기를 맞추지 못했어요.'));
          }
        });
        if (disposed) {
          off();
          return;
        }
        offs.push(off);
        if (native) {
          // 이미 떠 있던 툴바를 트레이로 불렀을 때 Rust(open_from_tray)가 보내는 신호입니다.
          const offSummon = await listen('toolkit-summoned', async () => {
            try {
              config = (await readSettings()).toolkit;
              config = { ...config, collapsed: false };
              await fit();
              await centerToolbarIfRequested();
              await signalArrival();
            } catch { error = '툴킷을 펼치지 못했어요.'; }
          });
          if (disposed) {
            offSummon();
            return;
          }
          offs.push(offSummon);
        }
        config = (await readSettings()).toolkit;
        if (native) {
          const win = getCurrentWindow();
          const pos = resolveSavedPosition(config.position || {}, await getMonitorGeometries());
          if (pos) await win.setPosition(new PhysicalPosition(pos.x, pos.y));
          // 왜 비교하는가: 저장은 디스크 쓰기와 모든 툴킷 창으로의 방송을 부르므로,
          // 같은 자리로 다시 놓였을 때(크기 맞춤 뒤 보정 등)는 건너뜁니다.
          savedPosition = JSON.stringify(config.position);
          const moved = await win.onMoved(() => {
            // 직접 드래그 중에는 종료 시점에 1회만 저장하므로 250ms 중도 저장을 막습니다.
            // 외부 이동(트레이 좌표 초기화·우클릭 좌표 초기화·resizeToolbar)은 기존처럼 저장합니다.
            if (isDragging) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(async () => {
              if (isDragging) return;
              try {
                const [p, s, scale] = await Promise.all([
                  win.outerPosition(),
                  win.outerSize(),
                  win.scaleFactor(),
                ]);
                await savePositionFromGeometry({
                  physicalX: p.x,
                  physicalY: p.y,
                  outerWidth: s.width,
                  outerHeight: s.height,
                  scaleFactor: scale,
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
          // 가운데 배치에 실패해도 툴바는 저장된 자리에 보여야 하므로 오류를 삼킵니다.
          const summonedByTray = await centerToolbarIfRequested().catch(() => false);
          await ensureWindowOnScreen(getCurrentWindow());
          await getCurrentWindow().show();
          if (summonedByTray) void signalArrival();
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
      clearTimeout(summonTimer);
    };
  });
</script>

<svelte:window onpointerdown={(event) => {
  if (!native && previewMenu && event.target instanceof Element &&
      !event.target.closest('.toolkit-preview-menu') && !event.target.closest('.toolkit-tool')) previewMenu = '';
}} />

{#if ready}<div class="toolkit-wrap" role="presentation" oncontextmenu={contextMenu}>
    <div
      bind:this={bar}
      use:observeToolbar
      use:toolkitDrag={{ onDragStart: handleDragStart, onDragEnd: handleDragEnd }}
      class="toolkit-bar"
      style:zoom={TOOLBAR_SIZES[config.toolbarSize].scale}
      class:vertical={config.orientation === 'vertical'}
      class:collapsed={config.collapsed}
      class:is-dragging={isDragging}
      class:summoned
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
        {#each orderedVisibleIds as id (id)}
          <button
            class="toolkit-tool"
            animate:flip={{ duration: 180, easing: cubicOut }}
            class:menu-open={(id === 'external' || menuKind(id) !== null) && previewMenu === id}
            onclick={(e) => { const kind = id === 'external' ? 'external' : menuKind(id); if (kind) void menu(e.currentTarget, kind); else openTool(id).catch(() => error = '도구를 열지 못했어요.'); }}
            aria-haspopup={id === 'external' || menuKind(id) ? 'menu' : undefined}
            aria-expanded={id === 'external' || menuKind(id) ? previewMenu === id : undefined}
            ><span class="toolkit-tool-icon"><ToolIcon kind={id} /></span
            ><span class="toolkit-tool-copy"><strong>{id === 'external' ? '외부 툴' : toolsById[id].label}</strong></span></button>
        {/each}
        <button class="toolkit-tool toolkit-more" class:menu-open={previewMenu === 'more'}
          aria-haspopup="menu" aria-expanded={previewMenu === 'more'}
          onclick={(e) => menu(e.currentTarget, 'more')}>
          <span class="toolkit-tool-icon"><Ellipsis size={28} /></span>
          <span class="toolkit-tool-copy"><strong>더보기</strong></span>
        </button>
        <button
          class="toolkit-settings"
          aria-label="툴킷 설정"
          title="툴킷 설정"
          onclick={() =>
            openTool('toolkit-settings').catch(() => (error = '설정을 열지 못했어요.'))}
          ><ToolIcon kind="settings" size={26} /><span class="toolkit-settings-label">설정</span></button
        ></div>{/if}
    </div>
    {#if error}<p role="alert" class="tk-error">{error}</p>{/if}{#if previewMenu}<div
        class="toolkit-preview-menu"
      >
        {#key previewMenu}<ToolkitMenu kind={previewMenu} ondone={closePreviewMenu} />{/key}
      </div>{/if}
  </div>{/if}
