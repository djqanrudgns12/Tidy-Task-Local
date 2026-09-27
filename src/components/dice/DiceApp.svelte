<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Dices, Volume2, VolumeX, Maximize2, Minimize2, Pin, X } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { MAX_DICE, clampCount, rollValues, matchKind, spokenResult, randomWord } from '../../lib/dice/engine.js';
  import { createRng, rollPlan, readableAt, impactsOf, fitDieSize, fitResultSize, slotOffset } from '../../lib/dice/motion.js';
  import type { DiePlan } from '../../lib/dice/motion.js';
  import { loadPrefs, savePrefs } from '../../lib/dice/preferences.js';
  import { createDiceAudio } from '../../lib/dice/audio.js';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import ToolIcon from '../toolkit/ToolIcon.svelte';
  import Die from './Die.svelte';
  import DiceResult from './DiceResult.svelte';
  import './dice.css';

  // 색은 자리에 묶습니다(왼쪽부터 복숭아·민트·레몬). 결과줄 칩도 같은 색이라 "어느 주사위가 몇"인지 바로 이어집니다.
  const TONES = ['peach', 'mint', 'lemon'] as const;
  const COUNTS = Array.from({ length: MAX_DICE }, (_, i) => i + 1);
  type Phase = 'idle' | 'rolling' | 'result';
  type Slot = { id: number; leaving: boolean; x: number; s: number };

  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const saved = loadPrefs(storage);
  let count = $state(saved.prefs.count);
  let sound = $state(saved.prefs.sound);
  let reducedChoice = $state<boolean | null>(saved.prefs.reduced);
  let error = $state(saved.error);
  // 사용자가 스위치를 누른 적이 없으면 움직임을 켭니다. Windows "애니메이션 효과" 설정은 따르지 않습니다
  // (학교 PC는 꺼진 경우가 많아, 따르면 주사위가 굴러가지 않고 숫자만 바뀌었습니다).
  const reduced = $derived(reducedChoice ?? false);

  let phase = $state<Phase>('idle');
  let values = $state<number[]>([]);
  let filled = $state<boolean[]>([]);
  let showTotal = $state(false);
  let badge = $state<'double' | 'triple' | null>(null);
  let rollKey = $state(0);
  let spoken = $state('');
  let pinned = $state(false);
  let fullscreen = $state(false);

  // 창 크기 → 주사위 한 변. 굴리는 동안에는 크기를 고정해 날아가는 거리와 모양이 어긋나지 않게 합니다.
  let area = $state({ w: 900, h: 560 });
  let rollSize = $state(0);
  const fitSize = $derived(fitDieSize(count, area.w, area.h));
  const size = $derived(phase === 'rolling' && rollSize ? rollSize : fitSize);
  // 결과 패널: 합계 글자 크기·패널 폭을 창 폭과 개수로 계산해 "a + b + c = 합"이 어떤 창에서도 한 줄에 들어가게 합니다.
  const result = $derived(fitResultSize(count, area.w, size));

  let slots = $state<Slot[]>(Array.from({ length: saved.prefs.count }, (_, id) => ({ id, leaving: false, x: 0, s: 0 })));
  // 나가는 주사위는 사라지는 동안 옛 자리·크기를 유지하고, 남는 주사위만 새 자리로 미끄러집니다.
  const placed = $derived(slots.map((slot) => (slot.leaving ? slot : { ...slot, x: slotOffset(slot.id, count, size), s: size })));

  const dice: Record<number, Die | undefined> = {};
  const slotEls: Record<number, HTMLElement | undefined> = {};
  const exits = new Map<number, Animation>();
  const audio = createDiceAudio();
  audio.setEnabled(saved.prefs.sound);
  let timers: number[] = [];
  let rollToken = 0;
  let mainEl = $state<HTMLElement>();
  let rollButton = $state<HTMLButtonElement>();
  const countButtons: HTMLButtonElement[] = [];

  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function persist() {
    error = savePrefs(storage, { count, sound, reduced: reducedChoice });
  }

  function resetResult() {
    clearTimers();
    phase = 'idle';
    values = [];
    filled = [];
    showTotal = false;
    badge = null;
    spoken = '';
  }

  async function setCount(next: number) {
    next = clampCount(next);
    if (phase === 'rolling' || next === count) return;
    const before = new Map<number, DOMRect>();
    for (const slot of slots) {
      const el = slotEls[slot.id];
      if (!slot.leaving && el) before.set(slot.id, el.getBoundingClientRect());
    }
    const prevCount = count;
    const prevSize = size;
    for (let id = 0; id < next; id++) {
      exits.get(id)?.cancel();
      exits.delete(id);
    }
    slots = [
      ...Array.from({ length: next }, (_, id) => ({ id, leaving: false, x: 0, s: 0 })),
      ...slots
        .filter((slot) => slot.id >= next)
        .map((slot) => (slot.leaving ? slot : { id: slot.id, leaving: true, x: slotOffset(slot.id, prevCount, prevSize), s: prevSize })),
    ];
    count = next;
    resetResult();
    persist();
    await tick();
    if (reduced) {
      slots = slots.filter((slot) => !slot.leaving);
      return;
    }
    for (const slot of slots) {
      const el = slotEls[slot.id];
      if (!el) continue;
      if (slot.leaving) {
        if (exits.has(slot.id)) continue;
        const exit = el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
        exits.set(slot.id, exit);
        exit.finished
          .then(() => {
            if (exits.get(slot.id) !== exit) return;
            exits.delete(slot.id);
            slots = slots.filter((s) => !(s.id === slot.id && s.leaving));
          })
          .catch(() => {});
        continue;
      }
      const old = before.get(slot.id);
      if (old) {
        // FLIP: 옛 자리·크기에서 새 자리로 보간해 레이아웃이 뚝 바뀌지 않게 합니다.
        const now = el.getBoundingClientRect();
        const dx = old.left + old.width / 2 - (now.left + now.width / 2);
        const dy = old.bottom - now.bottom;
        const ratio = now.width ? old.width / now.width : 1;
        if (Math.abs(dx) > 0.5 || Math.abs(ratio - 1) > 0.01)
          el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${ratio})` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
      } else {
        // 새 주사위는 위에서 톡 떨어져 들어옵니다.
        el.animate(
          [
            { transform: `translateY(${-0.4 * size}px) scale(.6)`, opacity: 0 },
            { transform: 'translateY(0) scale(1.06, .94)', opacity: 1, offset: 0.62 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 280, easing: 'cubic-bezier(.3,.7,.4,1)' },
        );
      }
    }
  }

  /** 던지는 순간 "달그락·휙", 이어서 주사위마다 부딪힐 때마다 "톡"(세기에 따라 크기가 다름)을 예약합니다. */
  async function playSounds(plans: DiePlan[]) {
    const started = performance.now();
    await audio.unlock();
    if (!plans.length) return;
    const late = performance.now() - started;
    audio.play('throw');
    for (const plan of plans) for (const hit of impactsOf(plan)) audio.play('land', hit.at - late, hit.strength);
  }

  async function roll() {
    if (phase === 'rolling') return;
    const token = ++rollToken;
    clearTimers();
    const next = rollValues(count);
    const plans = rollPlan(count, createRng(randomWord()), reduced);
    rollSize = size;
    phase = 'rolling';
    values = next;
    filled = next.map(() => false);
    showTotal = false;
    badge = null;
    spoken = '';
    rollKey++;
    // 줄임 모드에서는 "딩" 한 번만 냅니다(PRD 5.5). 소리를 꺼도 unlock은 해 둬야 나중에 켰을 때 바로 납니다.
    void playSounds(sound && !reduced ? plans : []);
    plans.forEach((plan, i) => later(readableAt(plan), () => { if (token === rollToken) filled[i] = true; }));
    await Promise.all(next.map((value, i) => dice[i]?.roll(value, plans[i]) ?? Promise.resolve()));
    if (token !== rollToken) return;
    finalize(token, next);
  }

  function finalize(token: number, next: number[]) {
    clearTimers();
    filled = next.map(() => true);
    const quick = reduced || document.hidden;
    const reveal = () => {
      if (token !== rollToken) return;
      showTotal = true;
      phase = 'result';
      spoken = spokenResult(next);
      const kind = matchKind(next);
      audio.play(kind === 'triple' ? 'triple' : 'total');
      if (!kind) return;
      const show = () => {
        badge = kind;
        later(1500, () => { if (token === rollToken) badge = null; });
      };
      if (quick) show();
      else later(120, show);
    };
    if (quick) reveal();
    else later(60, reveal);
  }

  function toggleSound() {
    sound = !sound;
    audio.setEnabled(sound);
    persist();
  }
  function setReduced(value: boolean) {
    reducedChoice = value;
    persist();
  }

  async function windowAction(action: () => Promise<unknown>) {
    try { await action(); } catch { error = '창을 조작하지 못했어요. 다시 시도해 주세요.'; }
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

  function focusCount(n: number) {
    void tick().then(() => countButtons[n - 1]?.focus());
  }
  /** 개수 선택은 라디오 묶음이라 좌우 화살표로 옮깁니다. */
  function onCountKey(event: KeyboardEvent) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    if (phase === 'rolling') return;
    const next = clampCount(count + step);
    void setCount(next);
    focusCount(next);
  }
  function onKey(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (event.key === 'Enter') {
      if (target?.closest('button') && !target.closest('.dice-roll')) return;
      event.preventDefault();
      if (!event.repeat) void roll();
      return;
    }
    // 한글 입력 상태에서도 되도록 글자(key) 대신 자판 위치(code)로 봅니다.
    const digit = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
    if (digit) {
      event.preventDefault();
      void setCount(Number(digit[1]));
      return;
    }
    if (event.code === 'KeyM') {
      event.preventDefault();
      toggleSound();
      return;
    }
    if (event.key === 'Escape' && fullscreen) void windowAction(toggleFullscreen);
  }
  /** 어느 버튼에 초점이 있든 Space는 던지기입니다. 창 단계에서 먼저 가로채야 합니다 — 초점이 "동작 줄이기" 스위치에 있으면
   * 스위치가 keydown에서 스스로 켜고 끄기 때문에, 마우스로 스위치를 켠 뒤 Space로 던지면 스위치가 도로 꺼졌습니다.
   * 그 버튼 자체의 클릭은 keyup에서 막습니다. */
  function onSpaceCapture(event: KeyboardEvent) {
    if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) void roll();
  }
  function onKeyUp(event: KeyboardEvent) {
    if (event.code === 'Space') event.preventDefault();
  }

  function close() {
    audio.stop();
    void windowAction(closeWindow);
  }

  onMount(() => {
    // 창이 가려지면 애니메이션 시계가 멈추므로 남은 연출을 건너뛰고 결과를 바로 확정합니다.
    const onVisibility = () => {
      if (!document.hidden || phase !== 'rolling') return;
      audio.stop();
      for (let i = 0; i < count; i++) dice[i]?.finish();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const syncFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreen);
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      area = { w: width, h: height };
    });
    if (mainEl) observer.observe(mainEl);
    const stop = () => audio.stop();
    window.addEventListener('pagehide', stop);
    rollButton?.focus();
    return () => {
      rollToken++;
      clearTimers();
      exits.forEach((exit) => exit.cancel());
      audio.dispose();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('pagehide', stop);
    };
  });
</script>

<svelte:window onkeydowncapture={onSpaceCapture} onkeydown={onKey} onkeyup={onKeyUp} />
<section class="dice-app" data-phase={phase} style:--s={`${size}px`} style:--dice-total={`${result.total}px`}
  style:--dice-panel={`${result.panel}px`} style:--dice-hint={`${result.hint}px`}>
  <header class="dice-titlebar" use:draggable>
    <div class="dice-brand"><ToolIcon kind="dice" size={24} /><strong>주사위</strong><span>Tidy 툴킷</span></div>
    <div class="dice-window-actions">
      {#if native}<button class:active={pinned} aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={() => windowAction(togglePin)}><Pin size={17} /></button>{/if}
      <button aria-label={fullscreen ? '전체화면 종료' : '전체화면'} title={fullscreen ? '전체화면 종료' : '전체화면'} onclick={() => windowAction(toggleFullscreen)}>{#if fullscreen}<Minimize2 size={18} />{:else}<Maximize2 size={18} />{/if}</button>
      <button aria-label="닫기" title="닫기" onclick={close}><X size={19} /></button>
    </div>
  </header>

  <main class="dice-main" bind:this={mainEl}>
    <div class="dice-stage" role="img" aria-label={`주사위 ${count}개`}>
      <div class="dice-floor">
        {#each placed as slot (slot.id)}
          <div class="dice-slot" bind:this={slotEls[slot.id]} style:--x={`${slot.x}px`} style:--slot-s={`${slot.s}px`}>
            <Die bind:this={dice[slot.id]} size={slot.s} tone={TONES[slot.id]} waiting={phase === 'idle'} />
          </div>
        {/each}
      </div>
    </div>
    <DiceResult {phase} {count} {values} {filled} {showTotal} {badge} {rollKey} {reduced} tones={TONES} />
    <p class="dice-live" aria-live="polite">{spoken}</p>
  </main>

  <footer class="dice-controls">
    <div class="dice-count" role="radiogroup" aria-label="주사위 개수" tabindex="-1" onkeydown={onCountKey}>
      <span class="dice-count-label">주사위 개수</span>
      {#each COUNTS as n (n)}
        <!-- 숫자키로도 바꿀 수 있다는 것을 마우스를 올렸을 때 알려 줍니다. -->
        <button role="radio" aria-checked={count === n} tabindex={count === n ? 0 : -1} class:selected={count === n} title={`주사위 ${n}개 (숫자 ${n}키)`}
          disabled={phase === 'rolling'} bind:this={countButtons[n - 1]} onclick={() => setCount(n)}>
          <span class="dice-count-dots" aria-hidden="true">{#each TONES.slice(0, n) as tone}<i data-tone={tone}></i>{/each}</span>{n}개
        </button>
      {/each}
    </div>
    <button class="dice-roll" class:rolling={phase === 'rolling'} aria-disabled={phase === 'rolling'} bind:this={rollButton} onclick={roll}>
      <Dices size={24} strokeWidth={2.1} /><span>{phase === 'rolling' ? '굴리는 중…' : '던지기'}</span>
    </button>
    <div class="dice-options">
      <label class="dice-motion" title="동작 줄이기"><span>동작 줄이기</span><ToolkitSwitch label="동작 줄이기" checked={reduced} onchange={setReduced} /></label>
      <button class="dice-sound" aria-label={sound ? '효과음 끄기 (M)' : '효과음 켜기 (M)'} aria-pressed={sound} title={sound ? '효과음 끄기 (M)' : '효과음 켜기 (M)'} onclick={toggleSound}>
        {#if sound}<Volume2 size={20} />{:else}<VolumeX size={20} />{/if}
      </button>
    </div>
  </footer>
  {#if error}<p class="dice-error" role="alert">{error}</p>{/if}
</section>
