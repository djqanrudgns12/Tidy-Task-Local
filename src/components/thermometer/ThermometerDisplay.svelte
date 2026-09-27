<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { X, Thermometer as ThermometerIcon, Check, ArrowUpRight, Pin, PinOff, Ellipsis } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
  import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow, openTool } from '../../lib/toolkit/windows.js';
  import { ensureWindowOnScreen, getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { createSection } from '../../lib/scores/section.js';
  import { subscribeStore } from '../../lib/scores/store.js';
  import { readRoster, subscribeRoster } from '../../lib/classroom/repository.js';
  import { normalizeMain, type Thermometer } from '../../lib/thermometer/model.js';
  import { normalizeDisplay } from '../../lib/thermometer/display.js';
  import MiniThermometer from './MiniThermometer.svelte';
  import { adjustMini } from '../../lib/thermometer/miniActions.js';
  import { newId } from '../../lib/ids.js';
  import { dateKey } from '../../lib/thermometer/calendar.js';
  import { catchUp, renameThermometer } from '../../lib/thermometer/rules.js';
  import './thermometer-display.css';

  let data = $state.raw(normalizeMain(undefined));
  let prefs = $state.raw(normalizeDisplay(undefined));
  let ready = $state(false);
  let error = $state('');
  let today = $state(dateKey());
  let roster = $state<any>({ classes: [] });
  let boot = $state(false);
  let busy = $state(false);
  let menu = $state<{x:number;y:number}|null>(null);
  let menuEl = $state<HTMLDivElement>();
  let boardEl = $state<HTMLElement>();
  const main = createSection({ store: 'thermometer', section: 'main', normalize: normalizeMain, onChange: d => data = d, onError: m => error = m });
  const settings = createSection({ store: 'thermometer', section: 'display', normalize: normalizeDisplay, onChange: d => prefs = d, onError: m => error = m });
  const key = $derived(data.sets[prefs.setKey] ? prefs.setKey : data.lastSetKey);
  const thermos = $derived(data.sets[key]?.thermometers ?? []);
  const shown = $derived(thermos.filter(t => !prefs.hiddenIds.includes(t.id)));
  const className = $derived(roster.classes.find((c:any) => c.id === key)?.name ?? (key === 'default' ? '우리 반' : '학급 온도계'));
  const draggable = (node:HTMLElement) => native ? dragRegion(node) : { destroy() {} };
  const patch = (value:Partial<typeof prefs>) => settings.mutate(d => ({ ...d, ...value }));
  async function act(fn:()=>Promise<unknown>) { try { await fn(); } catch { error = '설정을 적용하지 못했어요. 다시 시도해 주세요.'; } }
  let pinBusy = $state(false);
  async function toggleTop() {
    if (pinBusy || !ready) return;
    pinBusy = true;
    const previous = prefs.alwaysOnTop;
    const value = !previous;
    try {
      if (native) await getCurrentWindow().setAlwaysOnTop(value);
      const result = await settings.mutateAndConfirm(d => ({ ...d, alwaysOnTop: value }), d => d.alwaysOnTop === value);
      if (result !== 'saved') {
        if (native) await getCurrentWindow().setAlwaysOnTop(previous);
        throw new Error('고정 설정 저장 실패');
      }
    } finally { pinBusy = false; }
  }
  /** 보이는 학급의 온도계 하나를 최신 저장값 위에서 바꿉니다(다른 창이 먼저 바꾼 것을 덮지 않게). */
  function updateThermo(id:string, fn:(t:Thermometer)=>Thermometer) {
    const setKey = key;
    return main.mutate(d => {
      const set = d.sets[setKey];
      if (!set || !set.thermometers.some(t => t.id === id)) return d;
      return { ...d, sets: { ...d.sets, [setKey]: { ...set, thermometers: set.thermometers.map(t => t.id === id ? fn(t) : t) } } };
    });
  }
  function adjust(id:string, direction:1|-1) {
    if (!ready) return;
    const when = { today: dateKey(), now: Date.now(), logId: newId() };
    today = when.today;
    if (!updateThermo(id, t => adjustMini(t, direction, when))) error = '온도를 저장할 수 없어요. 관리 화면에서 자료 상태를 확인해 주세요.';
  }
  // 이름은 치는 대로 저장합니다 — 관리 창도 같은 구역을 지켜보고 있어 곧바로 바뀝니다.
  function rename(id:string, title:string) {
    if (!ready) return;
    if (!updateThermo(id, t => renameThermometer(t, title))) error = '이름을 저장할 수 없어요. 관리 화면에서 자료 상태를 확인해 주세요.';
  }
  async function toggleBoot() {
    busy = true;
    try {
      if (boot) await disable(); else await enable();
      boot = await isEnabled();
      const saved = await settings.mutateAndConfirm(d => ({ ...d, windowsStart: boot, autoOpen: boot ? true : d.autoOpen }), d => d.windowsStart === boot);
      if (saved !== 'saved') throw new Error('자동 시작 설정을 저장하지 못했어요.');
    } finally { busy = false; }
  }
  async function context(e:MouseEvent|KeyboardEvent) {
    e.preventDefault();
    menu = { x: e instanceof MouseEvent ? e.clientX : 16, y: e instanceof MouseEvent ? e.clientY : 48 };
    await tick();
    if (menu && menuEl) {
      const r = menuEl.getBoundingClientRect();
      menu = { x: Math.max(8, Math.min(menu.x, innerWidth-r.width-8)), y: Math.max(8, Math.min(menu.y, innerHeight-r.height-8)) };
      menuEl.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }
  function dismiss() { menu = null; boardEl?.focus(); }
  function keydown(e:KeyboardEvent) {
    if (e.key === 'Escape' && menu) { e.preventDefault(); dismiss(); }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) void context(e);
    if (menu && menuEl && e.key === 'Tab') {
      const nodes = [...menuEl.querySelectorAll<HTMLElement>('button:not(:disabled), select')];
      const first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }
  let saveTimer:ReturnType<typeof setTimeout>;
  async function saveGeometry() {
    if (!native || !ready || !prefs.rememberPosition) return;
    const w = getCurrentWindow();
    if (await w.isMinimized()) return;
    const [p, s, scale] = await Promise.all([w.outerPosition(), w.innerSize(), w.scaleFactor()]);
    patch({ geometry: { x: p.x, y: p.y, width: s.width/scale, height: s.height/scale } });
  }
  async function close() {
    clearTimeout(saveTimer);
    await saveGeometry();
    await settings.settle();
    await main.settle();
    await closeWindow();
  }
  function refreshDay() {
    today = dateKey();
    if (!ready) return;
    const when = { today, now: Date.now() };
    if (!thermos.some(t => catchUp(t, when).changed)) return;
    const setKey = key;
    main.mutate(d => ({ ...d, sets: { ...d.sets, [setKey]: { ...d.sets[setKey], thermometers: d.sets[setKey].thermometers.map(t => catchUp(t, when).t) } } }));
  }
  onMount(() => {
    let disposed = false;
    const offs:(()=>void)[] = [];
    const register = (off:()=>void) => { if (disposed) off(); else offs.push(off); };
    void act(async () => {
      register(await subscribeStore('thermometer', ({ section, revision }) => {
        if (section === 'main') void main.external(revision);
        if (section === 'display') void settings.external(revision);
      }));
      await Promise.all([main.load(), settings.load()]);
      const refreshRoster = async () => { roster = await readRoster(); };
      await refreshRoster();
      register(await subscribeRoster(() => void refreshRoster()));
      if (disposed) return;
      if (native) {
        const w = getCurrentWindow();
        if (prefs.rememberPosition && prefs.geometry) {
          await w.setPosition(new PhysicalPosition(prefs.geometry.x, prefs.geometry.y));
          const monitors = await getMonitorGeometries();
          const g = prefs.geometry;
          const monitor = monitors.find(m => g.x >= m.bounds.x && g.x < m.bounds.x + m.bounds.width && g.y >= m.bounds.y && g.y < m.bounds.y + m.bounds.height) ?? monitors[0];
          await w.setSize(new LogicalSize(monitor ? Math.min(g.width, monitor.work.width / monitor.scale) : g.width, monitor ? Math.min(g.height, monitor.work.height / monitor.scale) : g.height));
        }
        await ensureWindowOnScreen(w);
        await w.setAlwaysOnTop(prefs.alwaysOnTop);
        boot = await isEnabled();
        const schedule = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => void act(saveGeometry), 350); };
        register(await w.onMoved(schedule));
        register(await w.onResized(schedule));
        register(await w.onCloseRequested(e => { e.preventDefault(); void act(close); }));
        await w.show();
      }
      ready = true;
      refreshDay();
    }).finally(() => { if (native && !disposed) void getCurrentWindow().show().catch(() => {}); });
    const interval = setInterval(refreshDay, 60_000);
    window.addEventListener('focus', refreshDay);
    return () => { disposed = true; offs.forEach(off => off()); clearInterval(interval); clearTimeout(saveTimer); window.removeEventListener('focus', refreshDay); main.dispose(); settings.dispose(); };
  });
</script>

<svelte:window onkeydown={keydown} onblur={() => menu = null} />
<section class="td-board" bind:this={boardEl} tabindex="-1" aria-label="미니 온도계. 우클릭 또는 Shift F10으로 설정" oncontextmenu={context}>
  <header class="td-header" use:draggable>
    <ThermometerIcon size={16} /><strong title={className}>{className}</strong><span>미니 온도계</span>
    <div class="td-window-actions">
      <button class="td-pin" class:active={prefs.alwaysOnTop} aria-label="항상 위" aria-pressed={prefs.alwaysOnTop} disabled={!ready || pinBusy} title={prefs.alwaysOnTop ? '항상 위 켜짐 · 클릭하여 고정 해제' : '항상 위 꺼짐 · 클릭하여 고정'} onclick={() => act(toggleTop)}>{#if prefs.alwaysOnTop}<Pin size={16} />{:else}<PinOff size={16} />{/if}</button>
      <button aria-label="미니 온도계 설정" title="설정" onclick={context}><Ellipsis size={18} /></button>
      <button aria-label="미니 온도계 닫기" title="닫기 · 자동 열기 설정은 유지됩니다" onclick={() => act(close)}><X size={17} /></button>
    </div>
  </header>
  <main class="td-content" data-count={shown.length} use:draggable>
    {#if !ready}<p class="td-empty">온도계를 불러오고 있어요…</p>
    {:else if !shown.length}<div class="td-empty">표시 중인 온도계가 없어요.<small>설정에서 표시할 온도계를 선택하세요.</small><button onclick={context}>표시할 온도계 선택</button><button onclick={() => act(() => openTool('thermometer'))}>온도계 관리 열기</button></div>
    {:else}
      {#each shown as t (t.id)}
        <MiniThermometer {t} {today} showToday={prefs.showToday} showUpcoming={prefs.showUpcoming} onchange={adjust} onrename={rename} />
      {/each}
    {/if}
  </main>
  <div class="td-hint" use:draggable>빈 곳을 드래그해 이동 · + −로 온도 조절</div>
  {#if native}{#each ['NorthWest','NorthEast','SouthWest','SouthEast'] as direction}<div class="td-resize" data-direction={direction} aria-hidden="true" onmousedown={e => { if(e.button === 0) { e.preventDefault(); e.stopPropagation(); void act(() => getCurrentWindow().startResizeDragging(direction as 'NorthWest')); } }}></div>{/each}{/if}
  {#if error}<div class="td-error" role="alert">{error}<button onclick={() => error = ''} aria-label="오류 닫기"><X size={14} /></button></div>{/if}
</section>
{#if menu}
  <button class="td-dismiss" tabindex="-1" aria-label="설정 닫기" onclick={dismiss}></button>
  <div class="td-menu" role="dialog" aria-modal="true" aria-label="미니 온도계 설정" bind:this={menuEl} style:left={`${menu.x}px`} style:top={`${menu.y}px`}>
    <header><strong>미니 온도계 설정</strong><button aria-label="설정 닫기" onclick={dismiss}><X size={16} /></button></header>
    <div class="td-menu-group"><small>표시할 온도계</small>
      {#if Object.keys(data.sets).length > 1}<label>학급<select value={key} onchange={e => patch({ setKey: e.currentTarget.value })}>{#each Object.keys(data.sets) as id}<option value={id}>{roster.classes.find((c:any) => c.id === id)?.name ?? (id === 'default' ? '우리 반' : '보관된 학급')}</option>{/each}</select></label>{/if}
      {#each thermos as t (t.id)}<button role="switch" aria-checked={!prefs.hiddenIds.includes(t.id)} onclick={() => settings.mutate(d => ({ ...d, hiddenIds: d.hiddenIds.includes(t.id) ? d.hiddenIds.filter(id => id !== t.id) : [...d.hiddenIds,t.id] }))}><span>{t.title}</span><b>{prefs.hiddenIds.includes(t.id) ? '숨김' : '보이는 중'}</b></button>{/each}
      {#if !thermos.length}<p>관리 화면에서 온도계를 추가하세요.</p>{/if}
    </div>
    <div class="td-menu-group"><small>창과 시작</small>
      <button role="switch" aria-checked={prefs.alwaysOnTop} onclick={() => act(toggleTop)}><span>다른 창보다 항상 위</span>{#if prefs.alwaysOnTop}<Check size={16} />{/if}</button>
      <button role="switch" aria-checked={prefs.autoOpen} onclick={() => patch({autoOpen:!prefs.autoOpen})}><span>Tidy Task 실행 시 자동 열기</span>{#if prefs.autoOpen}<Check size={16} />{/if}</button>
      {#if native}<button role="switch" aria-checked={boot} disabled={busy} onclick={() => act(toggleBoot)}><span>컴퓨터를 켜면 Tidy Task 시작<small>앱 전체의 Windows 시작 설정</small></span>{#if boot}<Check size={16} />{/if}</button>{/if}
      <button role="switch" aria-checked={prefs.rememberPosition} onclick={() => patch({rememberPosition:!prefs.rememberPosition})}><span>위치와 크기 기억</span>{#if prefs.rememberPosition}<Check size={16} />{/if}</button>
      {#if native}<button onclick={() => act(async () => { await getCurrentWindow().center(); await saveGeometry(); dismiss(); })}>화면 가운데로 이동</button>{/if}
    </div>
    <div class="td-menu-group"><small>정보 표시 · 작은 창에서는 자동으로 간소화</small>
      <button role="switch" aria-checked={prefs.showToday} onclick={() => patch({showToday:!prefs.showToday})}><span>오늘의 변화</span>{#if prefs.showToday}<Check size={16} />{/if}</button>
      <button role="switch" aria-checked={prefs.showUpcoming} onclick={() => patch({showUpcoming:!prefs.showUpcoming})}><span>다음 목표</span>{#if prefs.showUpcoming}<Check size={16} />{/if}</button>
    </div>
    <button class="td-open-editor" onclick={() => act(async () => { await openTool('thermometer'); dismiss(); })}><span>온도계 관리 열기</span><ArrowUpRight size={16} /></button>
    <p class="td-menu-note">닫기는 이번에만 창을 닫아요. 자동 열기를 끄면 다음 실행에는 나타나지 않아요.</p>
  </div>
{/if}
