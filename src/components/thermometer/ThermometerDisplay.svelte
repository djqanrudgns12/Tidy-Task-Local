<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { X, Thermometer as ThermometerIcon, Check, ArrowUpRight, Pin, PinOff, Ellipsis, LocateFixed, Rocket } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  // 라이브러리가 이 타입을 내보내지 않으므로 공개 메서드의 인수에서 읽습니다.
  type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>['startResizeDragging']>[0];
  import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow, openTool } from '../../lib/toolkit/windows.js';
  import { ensureWindowOnScreen, getMonitorGeometries } from '../../lib/windows/windowRegistry.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { createSection } from '../../lib/scores/section.js';
  import { subscribeStore } from '../../lib/scores/store.js';
  import { readRoster, subscribeRoster } from '../../lib/classroom/repository.js';
  import { normalizeMain, type Thermometer } from '../../lib/thermometer/model.js';
  import { normalizeDisplay, savedGeometry } from '../../lib/thermometer/display.js';
  import { MOODS, moodOf } from '../../lib/thermometer/moods.js';
  import MiniThermometer, { miniAccent } from './MiniThermometer.svelte';
  import BulbFace from './BulbFace.svelte';
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
  const resizeDirections: ResizeDirection[] = ['NorthWest', 'NorthEast', 'SouthWest', 'SouthEast'];
  const patch = (value:Partial<typeof prefs>) => settings.mutate(d => ({ ...d, ...value }));
  const toggleShown = (id:string) => settings.mutate(d => ({ ...d, hiddenIds: d.hiddenIds.includes(id) ? d.hiddenIds.filter(x => x !== id) : [...d.hiddenIds, id] }));
  async function act(fn:()=>Promise<unknown>) { try { await fn(); } catch { error = '설정을 적용하지 못했어요. 다시 시도해 주세요.'; } }
  function resize(e: MouseEvent, direction: ResizeDirection) {
    if (!native || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    void act(() => getCurrentWindow().startResizeDragging(direction));
  }
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
  // "Tidy Task와 함께 열기" 하나가 다음 실행 때 다시 뜨기와 위치·크기 기억을 함께 켭니다(display.js savedGeometry).
  // 켜는 순간의 자리를 바로 적어 둡니다 — 창을 옮기지 않고 앱을 꺼도 다음에 이 자리에서 뜨게.
  // Windows 시작 프로그램 등록은 앱 전체 설정이라 여기서 다루지 않습니다(설정 창이 맡음).
  async function toggleStay() {
    const on = !prefs.autoOpen;
    patch({ autoOpen: on });
    if (on) await saveGeometry(true);
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
  /** @param force "함께 열기"를 막 켠 참이라 아직 prefs에 비치지 않았어도 적습니다. */
  async function saveGeometry(force = false) {
    if (!native || !ready || !(force || prefs.autoOpen)) return;
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
        const g = savedGeometry(prefs);
        if (g) {
          await w.setPosition(new PhysicalPosition(g.x, g.y));
          const monitors = await getMonitorGeometries();
          const monitor = monitors.find(m => g.x >= m.bounds.x && g.x < m.bounds.x + m.bounds.width && g.y >= m.bounds.y && g.y < m.bounds.y + m.bounds.height) ?? monitors[0];
          await w.setSize(new LogicalSize(monitor ? Math.min(g.width, monitor.work.width / monitor.scale) : g.width, monitor ? Math.min(g.height, monitor.work.height / monitor.scale) : g.height));
        }
        await ensureWindowOnScreen(w);
        await w.setAlwaysOnTop(prefs.alwaysOnTop);
        const schedule = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => void act(() => saveGeometry()), 350); };
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
      <button aria-label="미니 온도계 닫기" title={prefs.autoOpen ? '닫기 · 다음에 앱을 켜면 다시 떠요' : '닫기'} onclick={() => act(close)}><X size={17} /></button>
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
  {#if native}{#each resizeDirections as direction}<div class="td-resize" data-direction={direction} aria-hidden="true" onmousedown={e => resize(e, direction)}></div>{/each}{/if}
  {#if error}<div class="td-error" role="alert">{error}<button onclick={() => error = ''} aria-label="오류 닫기"><X size={14} /></button></div>{/if}
</section>
<!-- 크기 컨테이너 안에 두면 fixed도 카드에 붙어 투명한 위쪽 여백을 놓칩니다.
     창 전체 위쪽 테두리에서 크기 조절이 먼저 입력을 받도록 바깥에 둡니다. -->
{#if native}<div class="td-resize" data-direction="North" aria-hidden="true" onmousedown={e => resize(e, 'North')}></div>{/if}
{#if menu}
  <button class="td-dismiss" tabindex="-1" aria-label="설정 닫기" onclick={dismiss}></button>
  <div class="td-menu" role="dialog" aria-modal="true" aria-label="미니 온도계 설정" bind:this={menuEl} style:left={`${menu.x}px`} style:top={`${menu.y}px`}>
    <header>
      <svg class="td-mascot" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill={MOODS.positive.from} stroke={MOODS.positive.accent} stroke-width="1.6" /><BulbFace cx={13} cy={13} r={12} face="smile" reduced /></svg>
      <strong>미니 온도계 설정</strong>
      <button aria-label="설정 닫기" onclick={dismiss}><X size={16} /></button>
    </header>
    <!-- 묶음은 둘입니다: 무엇을 보여 줄지(고르기 = 체크) · 창이 어떻게 굴지(켜고 끄기 = 스위치). 한 번 하는 동작은 맨 아래 버튼.
         예전에는 글자 줄 열 개가 세 묶음에 흩어져 있어 "고르는 것 · 켜는 것 · 누르는 것"이 구분되지 않았습니다. -->
    <section class="td-set" aria-labelledby="td-set-show">
      <h3 id="td-set-show">보여 줄 온도계</h3>
      {#if Object.keys(data.sets).length > 1}<label class="td-class"><span>학급</span><select value={key} onchange={e => patch({ setKey: e.currentTarget.value })}>{#each Object.keys(data.sets) as id}<option value={id}>{roster.classes.find((c:any) => c.id === id)?.name ?? (id === 'default' ? '우리 반' : '보관된 학급')}</option>{/each}</select></label>{/if}
      <!-- 온도계마다 작은 얼굴 딱지 하나: 보이는 중이면 눈을 뜨고, 숨기면 잠듭니다. -->
      <div class="td-tiles">
        {#each thermos as t (t.id)}
          {@const on = !prefs.hiddenIds.includes(t.id)}
          <button class="td-tile" role="switch" aria-checked={on} title={t.title} style:--td-accent={miniAccent(t.mood)} onclick={() => toggleShown(t.id)}>
            {@render glyph(t.mood, on)}<span class="td-tile-name">{t.title}</span><i class="td-check"><Check size={11} strokeWidth={3.5} /></i>
          </button>
        {/each}
      </div>
      {#if !thermos.length}<p class="td-set-empty">관리 창에서 온도계를 먼저 만들어 주세요.</p>{/if}
      <div class="td-chips" role="group" aria-label="카드에 함께 보일 정보" title="창이 작으면 자동으로 숨겨져요">
        <span>함께 보기</span>
        <button class="td-chip" role="switch" aria-checked={prefs.showToday} onclick={() => patch({showToday:!prefs.showToday})}><i class="td-check"><Check size={10} strokeWidth={3.5} /></i>오늘의 변화</button>
        <button class="td-chip" role="switch" aria-checked={prefs.showUpcoming} onclick={() => patch({showUpcoming:!prefs.showUpcoming})}><i class="td-check"><Check size={10} strokeWidth={3.5} /></i>다음 목표</button>
      </div>
    </section>
    <section class="td-set" aria-labelledby="td-set-window">
      <h3 id="td-set-window">창</h3>
      <button class="td-row" role="switch" aria-checked={prefs.alwaysOnTop} onclick={() => act(toggleTop)}><span class="td-bubble" data-tone="gold"><Pin size={15} /></span><span class="td-row-text">항상 위에 두기</span>{@render knob()}</button>
      <button class="td-row" role="switch" aria-checked={prefs.autoOpen} onclick={() => act(toggleStay)}><span class="td-bubble" data-tone="peach"><Rocket size={15} /></span><span class="td-row-text">Tidy Task와 함께 열기<small>자리와 크기도 기억해요</small></span>{@render knob()}</button>
    </section>
    <div class="td-actions">
      {#if native}<button onclick={() => act(async () => { await getCurrentWindow().center(); await saveGeometry(); dismiss(); })}><LocateFixed size={14} />화면 가운데로</button>{/if}
      <button class="td-action-main" onclick={() => act(async () => { await openTool('thermometer'); dismiss(); })}>온도계 관리<ArrowUpRight size={14} /></button>
    </div>
  </div>
{/if}
<!-- 스위치 손잡이. 켜짐 · 꺼짐은 줄(button)의 aria-checked를 CSS가 읽어 그립니다. -->
{#snippet knob()}<span class="td-switch" aria-hidden="true"><i></i></span>{/snippet}
<!-- 작은 온도계 얼굴. 관리 창 설정의 무드 그림과 같은 모양에 구의 얼굴(BulbFace)을 얹었습니다. -->
{#snippet glyph(mood: string, awake: boolean)}
  {@const md = moodOf(mood)}
  <svg class="td-glyph" width="30" height="43" viewBox="0 0 32 46" aria-hidden="true">
    <rect x="11" y="2" width="10" height="30" rx="5" fill="#fff" stroke={md.accent} stroke-width="1.8" />
    <rect x="14" y="12" width="4" height="20" rx="2" fill={md.to} />
    <circle cx="16" cy="33" r="11" fill={md.from} stroke={md.accent} stroke-width="1.8" />
    <BulbFace cx={16} cy={33} r={11} face={awake ? 'smile' : 'sleepy'} reduced={data.shared.reduced} />
  </svg>
{/snippet}
