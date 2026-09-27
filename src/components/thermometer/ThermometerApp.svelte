<script lang="ts">
  // 학급 온도계 창(PRD 10절). 학급마다 온도계 묶음(1~2개)을 따로 기억하고, 바꾸는 즉시 저장합니다.
  // 날짜 따라잡기(자동 식힘·기한 판정)는 창을 열 때·초점이 올 때·10분마다 합니다(rules.js catchUp).
  import { onMount, tick, untrack } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Pin, Maximize2, Minimize2, X, Undo2, Settings2, History, UsersRound, ArrowRight, Copy, Plus } from 'lucide-svelte';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow, openTool, growToolWindow, setToolMinSize } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { createSection } from '../../lib/scores/section.js';
  import { subscribeStore } from '../../lib/scores/store.js';
  import { createScoreAudio } from '../../lib/scores/audio.js';
  import { readRoster, subscribeRoster } from '../../lib/classroom/repository.js';
  import { newId } from '../../lib/ids.js';
  import { normalizeMain, makeSet, copySet, presetThermometer, switchMood, DEFAULT_SET, LIMITS } from '../../lib/thermometer/model.js';
  import { bump, restart, repeatPeriod, tagReason, newStampBoard, applySettings, catchUp, ackNotices } from '../../lib/thermometer/rules.js';
  import { dateKey, addDays } from '../../lib/thermometer/calendar.js';
  import { moodOf, unitMark } from '../../lib/thermometer/moods.js';
  import ToolIcon from '../toolkit/ToolIcon.svelte';
  import ToolkitSelect from '../toolkit/ToolkitSelect.svelte';
  import ThermoColumn from './ThermoColumn.svelte';
  import ThermoSettings from './ThermoSettings.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import './thermometer.css';

  // ── 저장소 ──
  let data = $state.raw(normalizeMain(undefined));
  let ready = $state(false);
  let error = $state('');
  let undoVersion = $state(0);
  const client = createSection({ store: 'thermometer', section: 'main', normalize: normalizeMain, onChange: (d) => (data = d), onError: (m) => (error = m), onNotice: (m) => showToast(m) });

  // 개발용: ?toolkit-preview=thermometer&thermo-today=2026-09-28 로 날짜를 바꿔 자동 식힘·기한을 확인합니다.
  const fakeToday = (() => {
    if (native || !import.meta.env.DEV) return null;
    const v = new URLSearchParams(location.search).get('thermo-today');
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  })();
  let today = $state(fakeToday ?? dateKey());
  const refreshToday = () => (today = fakeToday ?? dateKey());

  // ── 학급 명단(학급 목록만) ──
  let roster = $state<any>({ revision: 0, defaultClassId: null, classes: [] });
  let rosterReady = $state(false);
  const classes = $derived<any[]>(roster.classes);
  const classIds = $derived(classes.map((c) => c.id));
  const setKey = $derived.by(() => {
    if (!classes.length) return DEFAULT_SET;
    if (classIds.includes(data.lastSetKey)) return data.lastSetKey;
    return roster.defaultClassId && classIds.includes(roster.defaultClassId) ? roster.defaultClassId : classIds[0];
  });
  const set = $derived(data.sets[setKey] ?? null);
  const className = $derived(classes.find((c) => c.id === setKey)?.name ?? '우리 반');
  const archived = $derived(
    Object.keys(data.sets)
      .filter((k) => k !== DEFAULT_SET && !classIds.includes(k))
      .map((key) => ({ key, label: `지워진 학급${data.sets[key].usedAt ? ` (${new Date(data.sets[key].usedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 사용)` : ''}` })),
  );
  const thermos = $derived<any[]>(set?.thermometers ?? []);
  const selectedId = $derived(set?.selectedId ?? thermos[0]?.id ?? '');
  const selected = $derived(thermos.find((x) => x.id === selectedId) ?? thermos[0] ?? null);

  // ── 소리 ──
  const audio = createScoreAudio();
  $effect(() => {
    audio.setEnabled(data.shared.sound);
    audio.setVolume(data.shared.volume);
  });
  const reduced = $derived(data.shared.reduced);

  // ── 알림 띠·확인 ──
  let toast = $state<{ text: string; undoKey?: string } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(text: string, undoKey?: string, ms = 6000) {
    clearTimeout(toastTimer);
    toast = { text, undoKey };
    toastTimer = setTimeout(() => (toast = null), ms);
  }
  let confirm = $state<{ text: string; detail?: string; ok: string; action: () => void } | null>(null);
  let confirmCancel = $state<HTMLButtonElement>();
  async function ask(text: string, detail: string, ok: string, action: () => void) {
    confirm = { text, detail, ok, action };
    await tick();
    confirmCancel?.focus();
  }

  // ── 바꾸기 ──
  const when = (logId?: string) => ({ now: Date.now(), today, ...(logId ? { logId } : {}) });
  function setUndo(key: string, name: string) {
    return {
      key: `${name}:${key}`,
      pick: (d: any) => d.sets[key] ?? null,
      put: (d: any, snap: any) => (snap ? { ...d, sets: { ...d.sets, [key]: snap } } : d),
    };
  }
  function thermoUndo(key: string, id: string) {
    return {
      key: `thermo:${key}:${id}`,
      limit: 30,
      pick: (d: any) => d.sets[key]?.thermometers.find((x: any) => x.id === id) ?? null,
      put: (d: any, snap: any) => {
        const s = d.sets[key];
        if (!s || !snap) return d;
        return { ...d, sets: { ...d.sets, [key]: { ...s, thermometers: s.thermometers.map((x: any) => (x.id === id ? snap : x)) } } };
      },
    };
  }
  function updateSet(fn: (s: any) => any, undo?: any) {
    const key = setKey;
    return client.mutate((d) => (d.sets[key] ? { ...d, sets: { ...d.sets, [key]: { ...fn(d.sets[key]), usedAt: Date.now() } } } : d), undo);
  }
  function updateT(id: string, fn: (t: any) => any, undoable = false) {
    const key = setKey;
    const ok = client.mutate((d) => {
      const s = d.sets[key];
      if (!s) return d;
      return { ...d, sets: { ...d.sets, [key]: { ...s, usedAt: Date.now(), thermometers: s.thermometers.map((x: any) => (x.id === id ? fn(x) : x)) } } };
    }, undoable ? thermoUndo(key, id) : undefined);
    if (ok && undoable) undoVersion++;
    return ok;
  }
  const undoKey = $derived(`thermo:${setKey}:${selectedId}`);
  const setUndoKey = $derived(`thermo-set:${setKey}`);
  const canUndo = $derived((void undoVersion, client.undoDepth(undoKey) > 0 || client.undoDepth(setUndoKey) > 0));
  function undo(key = client.undoDepth(undoKey) > 0 ? undoKey : setUndoKey) {
    if (client.undo(key)) {
      undoVersion++;
      audio.play('rewind');
      if (toast?.undoKey === key) toast = null;
    }
  }

  // ── 연출 신호(칸별) ──
  let fx = $state<Record<string, { seq: number; kind: string; text?: string }>>({});
  let fxSeq = 0;
  const signal = (id: string, kind: string, text?: string) => (fx = { ...fx, [id]: { seq: ++fxSeq, kind, text } });
  let chips = $state<{ id: string; logId: string } | null>(null);
  let chipTimer: ReturnType<typeof setTimeout> | undefined;

  function bumpT(id: string, dir: 1 | -1) {
    const t = thermos.find((x) => x.id === id);
    if (!t) return;
    selectT(id);
    const m = moodOf(t.mood);
    const w = when(newId());
    const preview = bump(t, dir, w);
    if (preview.events.clamped) {
      audio.play(m.sounds.blocked);
      signal(id, 'blocked');
      showToast(preview.events.clamped === 'top' ? (t.mood === 'positive' ? '가득 찼어요! 새로 시작해 보세요' : '이미 한계예요') : '더 내려갈 수 없어요', undefined, 2500);
      return;
    }
    updateT(id, (x) => bump(x, dir, w).t, true);
    const e = preview.events;
    const u = unitMark(t.unit);
    audio.play(dir > 0 ? m.sounds.up : m.sounds.down);
    if (dir > 0) signal(id, 'up');
    if (e.freeze) setTimeout(() => audio.play(m.sounds.freeze), 120);
    if (e.stages.length) {
      const s = e.stages[e.stages.length - 1];
      setTimeout(() => {
        audio.play(m.sounds.stage);
        signal(id, 'stage', `${s.at}${u}${s.label ? ` ${s.label}` : ''}!`);
      }, 180);
    }
    if (e.top) setTimeout(() => { audio.play(m.sounds.top); signal(id, 'top'); }, 240);
    if (e.stamp) setTimeout(() => audio.play('stamp'), e.top ? 900 : 200);
    if (e.boardComplete) setTimeout(() => { audio.play('stampBoard'); signal(id, 'board'); }, 1700);
    // 사유 칩: 올린 직후 4초 동안, 연달아 누르면 마지막 변화에 붙습니다.
    // 내릴 때는 띄우지 않습니다 — 칩(칭찬: 협동·발표…, 경고: 소란·지각…)은 모두 "올린 이유"라 내림에 붙으면 기록이 어긋납니다.
    clearTimeout(chipTimer);
    chips = dir > 0 ? { id, logId: e.logId ?? '' } : null;
    if (chips) chipTimer = setTimeout(() => (chips = null), 4000);
  }
  function tag(id: string, reason: string) {
    if (!chips || chips.id !== id) return;
    const logId = chips.logId;
    updateT(id, (x) => tagReason(x, logId, reason));
    audio.play('tick');
    clearTimeout(chipTimer);
    chips = null;
    showToast(`사유 “${reason}”을 붙였어요`, undefined, 2000);
  }
  function selectT(id: string) {
    if (set && set.selectedId !== id) updateSet((s) => ({ ...s, selectedId: id }));
  }
  function restartT(id: string) {
    updateT(id, (x) => restart(x, when()), true);
    audio.play('sweep');
    showToast('0부터 새로 시작했어요', `thermo:${setKey}:${id}`);
  }
  function addThermo(preset: 'warning' | 'praise' | 'blank') {
    if (!set || thermos.length >= LIMITS.thermometers) return;
    const t = presetThermometer(preset, thermos[0]?.mood ?? 'positive');
    updateSet((s) => ({ ...s, thermometers: [...s.thermometers, t], selectedId: t.id }));
    client.clearUndo(setUndoKey);
    undoVersion++;
    if (toast?.undoKey === setUndoKey) toast = null;
    audio.play('toc');
  }
  function removeThermo(id: string) {
    const t = thermos.find((x) => x.id === id);
    if (!t) return;
    const last = thermos.length === 1;
    const spec = setUndo(setKey, 'thermo-set');
    updateSet((s) => {
      const rest = s.thermometers.filter((x: any) => x.id !== id);
      return { ...s, thermometers: rest, selectedId: rest[0]?.id ?? '' };
    }, spec);
    if (last) drawer = null;
    undoVersion++;
    showToast(`${t.title}를 삭제했어요`, spec.key, 10000);
  }
  function moveThermo(id: string, dir: -1 | 1) {
    updateSet((s) => {
      const list = [...s.thermometers];
      const i = list.findIndex((x: any) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return s;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...s, thermometers: list };
    });
  }

  // ── 날짜 따라잡기 ──
  function catchUpAll() {
    refreshToday();
    if (!set) return;
    const w = when();
    if (!thermos.some((x) => catchUp(x, w).changed)) return;
    const spec = setUndo(setKey, 'thermo-auto');
    updateSet((s) => ({ ...s, thermometers: s.thermometers.map((x: any) => catchUp(x, w).t) }), spec);
    // 저장된 알림을 한 번 보여 주고 지웁니다(다른 날 열어도 다시 뜨지 않게).
    const noticed = untrack(() => data.sets[setKey]?.thermometers ?? []);
    for (const t of noticed) {
      const u = unitMark(t.unit);
      for (const n of t.notices) {
        if (n.kind === 'cooled') showToast(`${t.title}: 밤사이 ${n.amount}${u} 식었어요`, spec.key, 10000);
        else if (n.kind === 'reset') showToast(`${t.title}: 새 날이라 0부터 시작해요`, spec.key, 10000);
        else if (n.kind === 'missed') showToast(`${t.title}: 기한이 지났어요`);
        else if (n.kind === 'kept') {
          audio.play(moodOf(t.mood).sounds.kept);
          setTimeout(() => signal(t.id, 'kept'), 300);
        }
      }
    }
    if (noticed.some((t: any) => t.notices.length)) updateSet((s) => ({ ...s, thermometers: s.thermometers.map(ackNotices) }));
  }

  // ── 학급 묶음 연결 ──
  let attaching = false;
  $effect(() => {
    if (!ready || !rosterReady || attaching) return;
    const d = data;
    if (classes.length && d.sets[DEFAULT_SET] && !classIds.some((id) => d.sets[id])) {
      // 명단에 학급이 처음 생겼습니다: "우리 반" 온도계를 기본 학급에 그대로 연결합니다.
      const target = roster.defaultClassId && classIds.includes(roster.defaultClassId) ? roster.defaultClassId : classIds[0];
      const name = classes.find((c) => c.id === target)?.name ?? '';
      attaching = true;
      untrack(() => client.mutate((x: any) => {
        const sets = { ...x.sets, [target]: x.sets[DEFAULT_SET] };
        delete sets[DEFAULT_SET];
        return { ...x, sets, lastSetKey: target };
      }));
      attaching = false;
      untrack(() => showToast(`우리 반 온도계를 ${name}에 연결했어요`));
    } else if (!classes.length && !d.sets[DEFAULT_SET]) {
      attaching = true;
      untrack(() => client.mutate((x) => ({ ...x, sets: { ...x.sets, [DEFAULT_SET]: makeSet() }, lastSetKey: DEFAULT_SET })));
      attaching = false;
    }
  });
  function chooseClass(id: string) {
    if (!id || id === data.lastSetKey) return;
    client.mutate((d) => ({ ...d, lastSetKey: id }));
    drawer = null;
    queueMicrotask(catchUpAll);
  }
  function prepareSet(copy: boolean) {
    const key = setKey;
    const source = data.sets[data.lastSetKey] ?? Object.values(data.sets)[0];
    client.mutate((d) => ({ ...d, sets: { ...d.sets, [key]: copy && source ? copySet(source) : { ...makeSet(), usedAt: Date.now() } }, lastSetKey: key }));
    audio.play('toc');
  }

  // ── 배치 ──
  let mainW = $state(0);
  let drawer = $state<'settings' | 'history' | null>(null);
  let graphBig = $state(false);
  const count = $derived(thermos.length);
  const colW = $derived(count > 1 ? (mainW - 16) / 2 : mainW);
  // 두 개를 띄운 채 서랍을 열어 칸이 너무 좁아지면, 설정 중인(선택된) 온도계 하나만 크게 보여 줍니다.
  // 서랍의 설정은 선택된 온도계에만 적용되므로, 그 결과를 바로 보는 편이 두 칸을 욱여넣는 것보다 낫습니다.
  const tight = $derived(drawer !== null && count > 1 && colW < 250);
  const shown = $derived(tight && selected ? [selected] : thermos);

  // 온도계 수가 바뀌면(더하기·빼기·되돌리기·다른 학급으로 바꾸기) 창 최소 크기를 맞춥니다.
  // 값은 Rust toolkit.rs의 thermometer(380×520)·thermometer_pair_size(760×520)와 같아야 합니다.
  // 늘어날 때는 먼저 창을 넓힌 뒤 최소 크기를 올립니다(두 칸이 좁은 창에 끼어 넘치지 않게).
  let lastCount = 0;
  $effect(() => {
    const n = count;
    const grew = lastCount > 0 && n > lastCount;
    lastCount = n;
    untrack(() => {
      void (grew ? growToolWindow(1180) : Promise.resolve()).then(() => setToolMinSize(n > 1 ? 760 : 380, 520)).catch(() => {});
    });
  });

  // ── 창 ──
  let pinned = $state(false);
  let fullscreen = $state(false);
  const draggable = (node: HTMLElement) => (native ? dragRegion(node, { onDoubleClick: () => void windowAction(toggleFullscreen) }) : { destroy() {} });
  async function windowAction(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      error = '창을 조작하지 못했어요. 다시 시도해 주세요.';
    }
  }
  async function toggleFullscreen() {
    if (native) {
      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      fullscreen = next;
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }
  async function togglePin() {
    if (!native) return;
    await getCurrentWindow().setAlwaysOnTop(!pinned);
    pinned = !pinned;
  }
  async function close() {
    audio.stop();
    await client.settle().catch(() => {});
    await windowAction(closeWindow);
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (confirm) confirm = null;
      else if (graphBig) graphBig = false;
      else if (drawer) drawer = null;
      else if (fullscreen) void windowAction(toggleFullscreen);
      return;
    }
    if (!selected) return;
    if (e.code === 'ArrowUp' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault();
      bumpT(selected.id, 1);
    } else if (e.code === 'ArrowDown' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      bumpT(selected.id, -1);
    } else if ((e.code === 'Digit1' || e.code === 'Digit2') && thermos[Number(e.code.slice(-1)) - 1]) selectT(thermos[Number(e.code.slice(-1)) - 1].id);
    else if (e.code === 'KeyG') graphBig = !graphBig;
    else if (e.code === 'KeyF') void windowAction(toggleFullscreen);
    else if (e.code === 'KeyM') client.mutate((d) => ({ ...d, shared: { ...d.shared, sound: !d.shared.sound } }));
  }

  async function refreshRoster() {
    try {
      roster = await readRoster();
    } catch {
      // 명단을 못 읽어도 온도계는 "우리 반" 묶음으로 계속 씁니다.
    }
    rosterReady = true;
  }

  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    const syncFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreen);
    void (async () => {
      try {
        await client.load();
        offs.push(await subscribeStore('thermometer', ({ revision }) => void client.external(revision)));
        offs.push(await subscribeRoster(() => void refreshRoster()));
        await refreshRoster();
      } catch {
        error = '학급 온도계를 불러오지 못했어요. 창을 다시 열어 주세요.';
      }
      if (disposed) offs.forEach((off) => off());
      ready = true;
      await tick();
      catchUpAll();
    })();
    const focus = () => {
      void refreshRoster();
      catchUpAll();
    };
    window.addEventListener('focus', focus);
    // 켜 둔 채 자정이 지나도 10분 안에 따라잡습니다.
    const interval = setInterval(catchUpAll, 10 * 60 * 1000);
    const stop = () => audio.stop();
    window.addEventListener('pagehide', stop);
    return () => {
      disposed = true;
      offs.forEach((off) => off());
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pagehide', stop);
      clearInterval(interval);
      clearTimeout(toastTimer);
      clearTimeout(chipTimer);
      client.dispose();
      audio.dispose();
    };
  });
  const classOptions = $derived(classes.map((c) => ({ value: c.id, label: c.name })));
</script>

<svelte:window onkeydown={onKey} />
<section class="th-app" class:reduced aria-label="학급 온도계">
  <header class="th-titlebar" use:draggable>
    <div class="th-brand">
      <ToolIcon kind="thermometer" size={24} /><strong>학급 온도계</strong>
      {#if classes.length > 1}<span class="th-divider"></span><ToolkitSelect value={setKey} label="학급 선택" options={classOptions} onchange={chooseClass} />
      {:else}<span class="th-divider"></span><span class="th-context">{className}</span>{/if}
    </div>
    <div class="th-actions-top">
      <button class="th-top-btn" disabled={!canUndo} onclick={() => undo()} title="되돌리기 (Ctrl+Z)" aria-label="되돌리기"><Undo2 size={17} /></button>
      <button class="th-top-btn" class:active={drawer === 'history'} aria-pressed={drawer === 'history'} disabled={!selected} onclick={() => { drawer = drawer === 'history' ? null : 'history'; graphBig = false; }} title="기록" aria-label="기록"><History size={17} /><span>기록</span></button>
      <button class="th-top-btn" class:active={drawer === 'settings'} aria-pressed={drawer === 'settings'} disabled={!selected} onclick={() => { drawer = drawer === 'settings' ? null : 'settings'; graphBig = false; }} title="설정" aria-label="설정"><Settings2 size={17} /><span>설정</span></button>
      <span class="th-sep" aria-hidden="true"></span>
      {#if native}<button class="th-win" class:active={pinned} aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={() => windowAction(togglePin)}><Pin size={17} /></button>{/if}
      <button class="th-win" aria-label={fullscreen ? '전체화면 종료' : '전체화면'} title={fullscreen ? '전체화면 종료 (F)' : '전체화면 (F)'} onclick={() => windowAction(toggleFullscreen)}>{#if fullscreen}<Minimize2 size={18} />{:else}<Maximize2 size={18} />{/if}</button>
      <button class="th-win" aria-label="닫기" title="닫기" onclick={close}><X size={19} /></button>
    </div>
  </header>

  {#if ready && rosterReady && !classes.length && !data.rosterHintDismissed}
    <div class="th-hintbar" role="note">
      <UsersRound size={16} /><span>학급 명단을 만들면 반마다 온도계를 따로 쓸 수 있어요</span>
      <button onclick={() => openTool('roster')}>학급 명단 열기<ArrowRight size={14} /></button>
      <button class="th-hintbar-x" aria-label="안내 닫기" onclick={() => client.mutate((d) => ({ ...d, rosterHintDismissed: true }))}><X size={14} /></button>
    </div>
  {/if}

  <div class="th-body">
    <main class="th-stage" bind:clientWidth={mainW} data-count={count}>
      {#if !ready}<p class="th-loading">학급 온도계를 준비하고 있어요…</p>
      {:else if !set}
        <div class="th-prepare">
          <div class="th-prepare-art" aria-hidden="true"><ToolIcon kind="thermometer" size={64} /></div>
          <h2>{className}의 온도계를 준비할게요</h2>
          <p>다른 반과 같은 규칙이면 설정을 복사해서 바로 시작하세요.</p>
          <div class="th-prepare-actions">
            <button class="th-btn primary big" onclick={() => prepareSet(true)}><Copy size={17} />지금 설정 복사해서 시작</button>
            <button class="th-btn big" onclick={() => prepareSet(false)}><Plus size={17} />새 온도계로 시작</button>
          </div>
          <small>값·기록·도장은 0부터 시작해요</small>
        </div>
      {:else if !count}
        <div class="th-empty-thermos">
          <p>표시할 온도계가 없어요</p>
          <button onclick={() => addThermo('praise')}><Plus size={22} />학급 온도계 추가하기</button>
        </div>
      {:else if graphBig && selected}
        <HistoryPanel t={selected} {today} big onclose={() => (graphBig = false)} />
      {:else}
        {#each shown as t (t.id)}
          <ThermoColumn {t} {today} layout={shown.length === 1 && mainW >= 640 ? 'split' : 'stack'} compact={shown.length > 1 && colW < 380}
            selected={t.id === selectedId} selectable={shown.length > 1} {reduced} fx={fx[t.id] ?? null} chipsFor={chips && chips.id === t.id ? chips.logId : null}
            onbump={(dir) => bumpT(t.id, dir)} onrestart={() => restartT(t.id)}
            onextend={() => updateT(t.id, (x) => applySettings(x, { deadline: addDays(today, 7) }), true)}
            onrepeat={() => updateT(t.id, (x) => repeatPeriod(x, when()), true)}
            onenddeadline={() => updateT(t.id, (x) => ({ ...x, deadline: null, deadlineOutcome: null }))}
            onnewboard={() => { updateT(t.id, newStampBoard); audio.play('toc'); }}
            onselect={() => selectT(t.id)} onreason={(r) => tag(t.id, r)}
            onremove={() => ask(`${t.title}를 삭제할까요?`, '10초 안에 되돌릴 수 있어요.', '삭제', () => removeThermo(t.id))}
            onreset={() => ask(`${t.title}를 0으로 초기화할까요?`, '도장·기록은 그대로 남고, 되돌리기로 되살릴 수 있어요.', '초기화', () => restartT(t.id))} />
        {/each}
      {/if}
    </main>
    {#if drawer === 'settings' && set && selected}
      <ThermoSettings thermometers={thermos} selectedId={selected.id} shared={data.shared} {today} {archived}
        onselect={selectT}
        onpatch={(id, patch) => updateT(id, (x) => applySettings(x, patch, today))}
        onmood={(id, m) => { updateT(id, (x) => switchMood(x, m)); audio.play(moodOf(m).sounds.up); }}
        onstages={(id, stages) => updateT(id, (x) => ({ ...x, stages }))}
        onadd={addThermo} onremove={removeThermo} onmove={moveThermo} onrestart={restartT}
        onclearstamps={(id) => updateT(id, (x) => ({ ...x, stamps: { ...x.stamps, count: 0 } }), true)}
        onclearlog={(id) => updateT(id, (x) => ({ ...x, log: [], daily: {} }))}
        onshared={(patch) => client.mutate((d) => ({ ...d, shared: { ...d.shared, ...patch } }))}
        ondeleteset={(key) => client.mutate((d) => { const sets = { ...d.sets }; delete sets[key]; return { ...d, sets }; })}
        {ask} onclose={() => (drawer = null)} />
    {:else if drawer === 'history' && selected}
      <HistoryPanel t={selected} {today} onclose={() => (drawer = null)} onbig={() => { graphBig = true; drawer = null; }} />
    {/if}
  </div>

  {#if confirm}
    <div class="th-confirm" role="alertdialog" aria-label={confirm.text}>
      <p><b>{confirm.text}</b>{#if confirm.detail}<small>{confirm.detail}</small>{/if}</p>
      <div><button class="th-btn" bind:this={confirmCancel} onclick={() => (confirm = null)}>취소</button><button class="th-btn danger-fill" onclick={() => { const a = confirm?.action; confirm = null; a?.(); }}>{confirm.ok}</button></div>
    </div>
  {/if}
  {#if toast}<div class="th-toast" role="status"><span>{toast.text}</span>{#if toast.undoKey}<button onclick={() => undo(toast?.undoKey)}>되돌리기</button>{/if}<button class="th-toast-x" aria-label="알림 닫기" onclick={() => (toast = null)}><X size={14} /></button></div>{/if}
  {#if error}<p class="th-error" role="alert">{error}<button aria-label="오류 닫기" onclick={() => (error = '')}><X size={14} /></button></p>{/if}
</section>
