<script lang="ts">
  // 준비(PRD 5절): 학생들이 볼 수 있게 창을 칠판에 띄우고 크게 만든 뒤 안내(또는 바로 투표)로 넘어갑니다.
  // 확인 카드 4개는 필수가 아닙니다. 카드의 체크는 "지금 실제 상태"를 따라갑니다:
  //   전체 화면을 끝내거나 원래 모니터로 돌아오거나 소리를 끄면 체크와 카드 강조도 함께 풀립니다.
  //   (예전에는 한 번 찍힌 체크가 그대로 남았고, 전체 화면 체크를 $effect 안에서 읽고 다시 쓰다가
  //    무한 반복 오류(effect_update_depth_exceeded)로 창 전체의 화면 갱신이 멈춰 모든 버튼이 먹통이 됐습니다.
  //    그래서 체크는 모두 $derived로 계산하고, $effect에서 체크 상태를 쓰지 않습니다.)
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { MonitorUp, Maximize2, Minimize2, Volume2, VolumeX, Keyboard, MonitorSmartphone, ArrowRight, ArrowLeft, ArrowLeftRight, Check, X } from 'lucide-svelte';
  import Stamp from '../art/Stamp.svelte';
  import Keycap from '../common/Keycap.svelte';
  import Sticker from '../common/Sticker.svelte';
  import { native } from '../../../lib/toolkit/store.js';
  import { fitName } from '../../../lib/picker/nameCard.js';
  import { staggerDelay } from '../../../lib/vote/motion.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  import { boardMonitor, moveToNextMonitor } from '../../../lib/vote/windows.js';
  import { lineupGrid } from '../../../lib/vote/layout.js';
  import { digitOf } from '../../../lib/vote/keys.js';
  import { typeLabel } from '../../../lib/vote/model.js';
  import SpeechSettings from './SpeechSettings.svelte';
  let { session, prefs, speechAvailable, speech, audio, fullscreen, reduced, onfullscreen, onmoved, onteacher, ontutorial, onvote, onedit, oncancel, onprefs, oncontent } = $props<{
    oncontent: (p:any) => void;
    session: any; prefs: any; speechAvailable: boolean; speech: any; audio: any; fullscreen: boolean; reduced: boolean;
    onfullscreen: () => void; onmoved: () => void; onteacher: () => void; ontutorial: () => void; onvote: () => void; onedit: () => void; oncancel: () => void; onprefs: (p: any) => void;
  }>();

  // ── 1. 칠판(TV)에 띄우기 ──
  // 모니터가 여러 대: 준비 화면을 처음 연 모니터(선생님 책상 쪽)에서 다른 모니터로 옮겨져 있으면 체크.
  //   버튼으로 옮기든 끌어서 옮기든 같고, 다시 돌아오면 풀립니다.
  // 모니터가 1대(복제 모드 등): 선생님이 [칠판에 보여요]로 직접 표시하고, 한 번 더 누르면 풀립니다.
  let monitors = $state(1);
  let homeMonitor = $state<string | null>(null);
  let hereMonitor = $state<string | null>(null);
  let shownByHand = $state(false);
  let moving = $state(false);
  const screenDone = $derived(monitors > 1 ? !!homeMonitor && !!hereMonitor && hereMonitor !== homeMonitor : shownByHand);
  async function readMonitor() {
    try {
      const m = await boardMonitor();
      monitors = m.count;
      if (!m.key) return;
      if (!homeMonitor) homeMonitor = m.key;
      hereMonitor = m.key;
    } catch {}
  }
  async function move() {
    if (moving) return;
    moving = true;
    try {
      await moveToNextMonitor();
    } catch {
      // 옮기지 못해도 체크는 실제 위치를 다시 읽어 정합니다.
    } finally {
      moving = false;
    }
    await readMonitor();
    onmoved();
  }

  // ── 2. 전체 화면: 창의 실제 상태 그대로 ──
  const fullDone = $derived(fullscreen);

  // ── 3. 소리: 한 번 들어 봤고, 지금 소리가 켜져 있을 때 ──
  let listened = $state(false);
  let listening = $state(false);
  const audible = $derived(!prefs.muted && prefs.volume > 0);
  const soundDone = $derived(listened && audible);
  async function listen() {
    if (listening) return;
    listening = true;
    try {
      await audio.unlock();
      // 소리를 꺼 둔 채 [들어 보기]를 누르면 아무것도 안 들려 고장처럼 보이므로 켭니다.
      // 저장된 설정은 다음 화면 갱신 때 반영되므로 소리 장치에는 바로 알립니다.
      if (prefs.muted) {
        onprefs({ muted: false });
        audio.setMuted(false);
      }
      audio.play('vote.cast');
      speech.configure({ ...prefs, muted: false });
      speech.setSpeed(session.tutorial.speed);
      if (prefs.speech && speechAvailable) await speech.speakSlide(session, 'preview');
    } finally {
      listening = false;
    }
  }

  // ── 4. 키보드: 교탁 키보드(무선 숫자패드)로 숫자를 눌러 보면 체크(투표에 스페이스바는 쓰지 않음 — 2026-09-26) ──
  // 투표판과 같은 규칙(keys.js)으로 읽어, NumLock이 꺼진 숫자패드나 한글 입력 상태에서도 똑같이 잡힙니다.
  const yesno = $derived(session.type === 'yesno');
  const sampleKeys = $derived(yesno ? (session.rules.allowAbstain ? ['1', '2', '0'] : ['1', '2']) : ['1', '2', '3']);
  let litKey = $state<string | null>(null);
  let lastKey = $state<string | null>(null);
  let litTimer: ReturnType<typeof setTimeout> | undefined;
  const keysDone = $derived(lastKey !== null);
  /** 글자를 치는 칸이 아니면 키보드 확인으로 받습니다(소리 크기 막대에 초점이 있어도 숫자키는 확인으로). */
  const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest('textarea, input:not([type="range"])');
  /** 확인창·선생님 메뉴·알림 띠처럼 위에 겹친 창에 초점이 있으면 그 창의 키로 둡니다(스페이스로 [취소] 누르기 등).
   * 제목줄 버튼(전체 화면 등)은 겹친 창이 아니므로 여기서 막습니다 — 마우스로 누른 뒤 스페이스가 다시 누르지 않게. */
  const outside = (t: EventTarget | null) => t instanceof Element && !!t.closest('.vt-confirm, .vt-warn, .vt-drawer, .vt-toast');
  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey || e.metaKey || typing(e.target) || outside(e.target)) return;
    // 마우스로 누른 버튼에 초점이 남아 있으면 스페이스가 그 버튼(예: 전체 화면)을 다시 누르므로 막습니다.
    // 스페이스는 투표에 쓰지 않으므로 키보드 확인으로 세지는 않습니다.
    if (e.code === 'Space') {
      e.preventDefault();
      return;
    }
    const d = digitOf(e.code);
    if (d === null) return;
    const name = String(d);
    e.preventDefault();
    if (e.repeat) return;
    litKey = name;
    lastKey = name;
    clearTimeout(litTimer);
    litTimer = setTimeout(() => (litKey = null), 700);
  }
  function onKeyUp(e: KeyboardEvent) {
    // 버튼은 스페이스를 "뗄 때" 누르므로 keyup도 막아야 합니다.
    if (e.code === 'Space' && !typing(e.target) && !outside(e.target)) e.preventDefault();
  }

  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    void readMonitor();
    if (native) {
      // 끌어서 옮긴 경우도 체크가 따라가게 이동을 지켜봅니다(이동 알림은 연달아 오므로 멈춘 뒤 한 번 읽음).
      let moveTimer: ReturnType<typeof setTimeout> | undefined;
      void getCurrentWindow().onMoved(() => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => void readMonitor(), 250);
      }).then((off) => (disposed ? off() : offs.push(off)));
      // 준비하는 동안 TV를 새로 꽂거나 빼도 1번 카드가 맞게 바뀌도록 모니터 수를 가끔 다시 봅니다.
      const poll = setInterval(() => void readMonitor(), 3000);
      offs.push(() => {
        clearTimeout(moveTimer);
        clearInterval(poll);
      });
    }
    return () => {
      disposed = true;
      offs.forEach((off) => off());
      clearTimeout(litTimer);
    };
  });

  // ── 오늘의 후보 판 ──
  const lineupTitle = $derived(yesno ? '오늘의 안건' : session.type === 'opinion' ? '오늘의 항목' : '오늘의 후보');
  const count = $derived(yesno ? `안건 ${session.agendas.length}개` : `${session.type === 'opinion' ? '항목' : '후보'} ${session.items.length}${session.type === 'opinion' ? '개' : '명'}`);
  const rule = $derived.by(() => {
    if (yesno) return `1 찬성 · 2 반대${session.rules.allowAbstain ? ' · 0 기권' : ''}`;
    const votes = `한 사람이 ${session.rules.votesPerVoter}표`;
    return session.type === 'candidate' && session.rules.seats > 1 ? `${votes} · ${session.rules.seats}명 뽑아요` : votes;
  });
  const items = $derived([...session.items].sort((a: any, b: any) => a.number - b.number));
  const hasIntro = $derived(session.type === 'candidate' && items.some((it: any) => it.intro));
  // 의견 항목은 문장이라 두 줄까지, 후보 이름은 한 줄로 둡니다(이름 중간에서 줄이 바뀌지 않게).
  const nameLines = $derived(session.type === 'opinion' ? 2 : 1);
  let stageW = $state(0);
  let stageH = $state(0);
  // 스티커 그림자·흰 테두리가 잘리지 않도록 판 안쪽 여백(위아래 20 · 좌우 16)을 빼고 잽니다.
  const grid = $derived(lineupGrid(items.length, stageW - 16, stageH - 20, { intro: hasIntro, nameLines }));
  // 안건 글자: 판 높이를 안건 수로 나눈 한 줄 높이의 약 1/3(18~40px). 칠판 전체 화면에서는 크게, 작은 창에서는 넘치지 않게.
  const agendaFont = $derived(Math.round(Math.min(40, Math.max(18, ((stageH - 20 - 12 * (session.agendas.length - 1)) / Math.max(1, session.agendas.length)) * 0.34))));
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

{#snippet mark(no: number, done: boolean)}
  <span class="vt-prep-mark">
    {#if done}
      <span class="vt-prep-stamp"><Stamp text="✓" round size={44} color="var(--vt-accent)" /></span>
      <span class="vt-visually-hidden">확인됨</span>
    {:else}
      <span class="vt-prep-no" aria-hidden="true">{no}</span>
    {/if}
  </span>
{/snippet}

<section class="vt-prep vt-stage-enter">
  <header class="vt-prep-head">
    <div class="vt-prep-titles">
      <span class="vt-prep-type">{typeLabel(session.type)}{session.runoffOf ? ' · 결선' : ''}</span>
      <h1>학생들이 볼 수 있게 준비해 주세요</h1>
      <p>{session.title} · {count} · {session.rules.voters}명</p>
    </div>
    <!-- 투표 흐름과 상관없는 일(선생님 창·나가기)은 위 오른쪽에 모아, 아래 줄에는 앞뒤로 움직이는 버튼만 남깁니다.
         나가기는 만들기 화면의 [나가기]와 같은 모양으로 맞춥니다(동작은 투표 지우기 — 확인창·10초 되돌리기를 거침). -->
    <div class="vt-prep-head-actions">
      <button class="vt-btn ghost" onclick={onteacher}><MonitorSmartphone size={17} />선생님 창 따로 열기</button>
      <button class="vt-btn vt-prep-exit" title="이 투표를 지우고 첫 화면으로 돌아가요" onclick={oncancel}><span class="vt-exit-mark" aria-hidden="true"><X size={14} strokeWidth={2.6} /></span>나가기</button>
    </div>
  </header>

  <ol class="vt-prep-cards">
    <li class="vt-card vt-prep-card" class:done={screenDone}>
      <div class="vt-prep-top"><MonitorUp size={28} />{@render mark(1, screenDone)}</div>
      <b>칠판(TV)에 이 창을 띄워 주세요</b>
      {#if monitors > 1}
        <small>모니터가 여러 대라면 버튼 하나로 옮길 수 있어요</small>
        <div class="vt-prep-action">
          <button class="vt-btn" disabled={moving} onclick={move}><ArrowLeftRight size={17} />다른 모니터로 이동</button>
        </div>
      {:else}
        <small>칠판(TV)에 이 화면이 똑같이 보이면 눌러 주세요</small>
        <div class="vt-prep-action">
          <button class="vt-btn" class:on={shownByHand} aria-pressed={shownByHand} onclick={() => (shownByHand = !shownByHand)}>
            {#if shownByHand}확인 취소{:else}<Check size={17} />칠판에 보여요{/if}
          </button>
        </div>
      {/if}
    </li>
    <li class="vt-card vt-prep-card" class:done={fullDone}>
      <div class="vt-prep-top"><Maximize2 size={28} />{@render mark(2, fullDone)}</div>
      <b>전체 화면으로 크게</b>
      <small>뒷자리에서도 이름이 또렷하게 보여요</small>
      <div class="vt-prep-action">
        <button class="vt-btn" onclick={onfullscreen}>
          {#if fullscreen}<Minimize2 size={17} />전체 화면 끝내기{:else}<Maximize2 size={17} />전체 화면{/if}
        </button>
      </div>
    </li>
    <li class="vt-card vt-prep-card" class:done={soundDone}>
      <div class="vt-prep-top"><Volume2 size={28} />{@render mark(3, soundDone)}</div>
      <b>소리를 확인해 주세요</b>
      <small>투표 소리{prefs.speech && speechAvailable ? '와 안내 음성' : ''}이 교실 뒤까지 들리는지</small>
      <div class="vt-prep-action">
        <button class="vt-btn" disabled={listening} onclick={listen}>
          {#if audible}<Volume2 size={17} />{:else}<VolumeX size={17} />{/if}들어 보기
        </button>
        <button class="vt-btn" aria-pressed={listened} disabled={!audible || listening} onclick={() => (listened = !listened)}>잘 들려요</button>
        <input type="range" min="0" max="100" step="5" value={prefs.volume} aria-label="소리 크기" oninput={(e) => onprefs({ volume: Number((e.currentTarget as HTMLInputElement).value), muted: false })} />
      </div>
    </li>
    <li class="vt-card vt-prep-card" class:done={keysDone}>
      <div class="vt-prep-top"><Keyboard size={28} />{@render mark(4, keysDone)}</div>
      <b>키보드를 교탁에 놓아 주세요</b>
      <small>학생은 키보드로만 투표해요. 무선 숫자패드도 돼요.</small>
      <div class="vt-prep-action keys">
        <span class="vt-prep-keys">
          {#each sampleKeys as k (k)}<Keycap label={k} size={32} lit={litKey === k} />{/each}
        </span>
        <!-- 한 줄 자리를 늘 비워 두어, 키를 눌러 문구가 바뀌어도 카드 높이가 흔들리지 않게 합니다 -->
        <span class="vt-prep-keynote" class:ok={keysDone} role="status">
          {#if lastKey}<Check size={15} />‘{lastKey}’ 키가 잘 들어와요{:else}숫자 키를 눌러 확인해 보세요{/if}
        </span>
      </div>
    </li>
  </ol>

  <!-- 준비하는 동안 칠판에 오늘의 후보(안건)를 걸어 둡니다. 학생들이 미리 이름·기호를 익혀 투표가 빨라집니다. -->
  <section class="vt-card vt-prep-lineup" aria-label={lineupTitle}>
    <header class="vt-lineup-head">
      <h2>{lineupTitle}</h2>
      <span class="vt-lineup-count">{yesno ? `${session.agendas.length}개` : `${items.length}${session.type === 'opinion' ? '개' : '명'}`}</span>
      <span class="vt-lineup-rule">{rule}</span>
    </header>
    <div class="vt-lineup-stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
      <div class="vt-lineup-fit">
        {#if yesno}
          <ol class="vt-lineup-agendas" style:--agenda={`${agendaFont}px`}>
            {#each session.agendas as a, i (a.id)}
              <li class="vt-pop-in" style:animation-delay={reduced ? '0ms' : `${staggerDelay(i, session.agendas.length)}ms`}><span>안건 {i + 1}</span><b>{a.text}</b></li>
            {/each}
          </ol>
        {:else}
          <ul class="vt-lineup-items" style:--cols={grid.cols} style:--cell={`${grid.cellW}px`} style:--name={`${grid.name}px`} style:--intro={`${grid.intro}px`} style:--lines={nameLines}>
            {#each items as it, i (it.id)}
              {@const c = paletteOf(it.color)}
              <li class="vt-c vt-pop-in" style:--c-bg={c.bg} style:--c-line={c.line} style:--c-ink={c.ink} style:animation-delay={reduced ? '0ms' : `${staggerDelay(i, items.length)}ms`}>
                <span class="vt-lineup-art">
                  <Sticker item={it} type={session.type} size={grid.art} />
                  <span class="vt-lineup-key"><Keycap label={it.number} size={grid.key} /></span>
                </span>
                <span class="vt-lineup-name"><b use:fitName={it.name}>{it.name}</b></span>
                {#if grid.showIntro}<small>{it.intro}</small>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </section>

  <footer class="vt-prep-foot">
    <SpeechSettings {session} {prefs} {speech} {onprefs} {oncontent} />
    <div class="vt-prep-right">
      <!-- 뒤로 가기: 만들기 화면(내용 단계)으로 돌아가 고칩니다. 받은 표가 있거나 결선이면 고칠 수 없어 숨깁니다. -->
      {#if !session.ballots.length && !session.runoffOf}<button class="vt-btn ghost" onclick={onedit}><ArrowLeft size={17} />뒤로 가기</button>{/if}
      {#if session.tutorial.enabled}
        <button class="vt-btn" onclick={onvote}>안내 없이 바로 투표</button>
        <button class="vt-btn primary big" onclick={ontutorial}>안내 시작<ArrowRight size={19} /></button>
      {:else}
        <button class="vt-btn primary big" onclick={onvote}>투표 시작<ArrowRight size={19} /></button>
      {/if}
    </div>
  </footer>
</section>

<style>
  .vt-prep {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    /* 후보 판은 남는 높이를 모두 쓰되, 아주 작은 창에서도 240px은 지키고 대신 화면이 스크롤됩니다 */
    grid-template-rows: auto auto minmax(240px, 1fr) auto;
    gap: 18px;
    /* 칠판(TV) 전체 화면에서 후보 판이 넓게 쓰이도록 조금 넓게 둡니다 */
    width: min(1320px, 100%);
    margin: 0 auto;
    padding: 24px 30px 20px;
  }
  .vt-prep-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 20px;
    flex-wrap: wrap;
  }
  .vt-prep-titles {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .vt-prep-head-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .vt-prep-head-actions .vt-btn {
    white-space: nowrap;
  }
  /* 나가기: 만들기 화면(VoteWizard)의 [나가기]와 같은 얇은 테두리 + 작은 X 칩.
     그림자·강조색은 쓰지 않습니다(이 화면의 주인공은 아래 [안내 시작]이라 시선을 뺏지 않게). */
  .vt-prep-head-actions .vt-prep-exit {
    min-height: 40px;
    gap: 8px;
    padding: 0 14px 0 6px;
    border-color: var(--vt-line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--vt-card) 70%, transparent);
    color: var(--vt-muted);
    font-size: 15px;
    box-shadow: none;
    transition: border-color var(--vt-quick) var(--vt-ease), background var(--vt-quick) var(--vt-ease), color var(--vt-quick) var(--vt-ease);
  }
  .vt-exit-mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: var(--vt-soft);
    color: var(--vt-muted);
    transition: background var(--vt-quick) var(--vt-ease), color var(--vt-quick) var(--vt-ease), transform var(--vt-standard) var(--vt-ease);
  }
  .vt-prep-head-actions .vt-prep-exit:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--vt-ink) 22%, var(--vt-line));
    background: var(--vt-card);
    color: var(--vt-ink);
  }
  .vt-prep-exit:hover .vt-exit-mark {
    background: color-mix(in srgb, var(--vt-ink) 10%, var(--vt-soft));
    color: var(--vt-ink);
    transform: rotate(90deg);
  }
  .vt-prep-head-actions .vt-prep-exit:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--vt-accent) 60%, transparent);
    outline-offset: 2px;
  }
  :global(.vt-root.reduced) .vt-exit-mark { transition: none; }
  :global(.vt-root.reduced) .vt-prep-exit:hover .vt-exit-mark { transform: none; }
  .vt-prep-type {
    justify-self: start;
    padding: 3px 12px;
    border-radius: 999px;
    background: var(--vt-soft);
    font-size: 13px;
    font-weight: 900;
  }
  .vt-prep-head h1 {
    margin: 0;
    font-size: clamp(24px, 2.8cqi, 36px);
    word-break: keep-all;
  }
  .vt-prep-head p {
    margin: 0;
    color: var(--vt-muted);
    font-size: 16px;
    font-weight: 800;
  }

  /* ── 확인 카드 ── */
  .vt-prep-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @container (max-width: 1000px) {
    .vt-prep-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .vt-prep-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 18px 16px;
    border-radius: 24px;
    color: var(--vt-accent);
    transition: border-color var(--vt-standard) var(--vt-ease), background var(--vt-standard) var(--vt-ease);
  }
  .vt-prep-card.done {
    border-color: color-mix(in srgb, var(--vt-accent) 50%, transparent);
    background: color-mix(in srgb, var(--vt-accent) 5%, var(--vt-card));
  }
  /* 아이콘과 번호(체크 도장)를 한 줄에 둡니다. 도장이 버튼·제목 위로 겹치지 않고, 번호 ↔ 도장이 같은 자리에서 바뀝니다. */
  .vt-prep-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    margin-right: -6px;
  }
  /* 도장(44px, 살짝 기울어짐)이 이 칸 안에 다 들어가 제목 줄에 닿지 않습니다 */
  .vt-prep-mark {
    display: grid;
    place-items: center;
    width: 50px;
    height: 48px;
  }
  .vt-prep-no {
    color: color-mix(in srgb, var(--vt-ink) 20%, transparent);
    font-size: 30px;
    font-weight: 900;
    line-height: 1;
  }
  .vt-prep-stamp {
    display: block;
    animation: vt-pop-in var(--vt-standard) var(--vt-ease-pop) both;
  }
  .vt-prep-card b {
    color: var(--vt-ink);
    font-size: 17px;
    line-height: 1.4;
    word-break: keep-all;
  }
  .vt-prep-card small {
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.5;
    word-break: keep-all;
  }
  .vt-prep-action {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: auto;
    padding-top: 6px;
  }
  .vt-prep-action .vt-btn {
    white-space: nowrap;
  }
  .vt-prep-action .vt-btn.on {
    border-color: color-mix(in srgb, var(--vt-accent) 55%, transparent);
    background: color-mix(in srgb, var(--vt-accent) 10%, var(--vt-card));
    color: var(--vt-accent);
    box-shadow: none;
  }
  .vt-prep-action input {
    flex: 1;
    min-width: 72px;
    max-width: 120px;
    accent-color: var(--vt-action);
  }
  .vt-prep-action.keys {
    display: grid;
    gap: 8px;
  }
  .vt-prep-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 4px;
  }
  .vt-prep-keynote {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 20px;
    color: var(--vt-muted);
    font-size: 13.5px;
    font-weight: 800;
    word-break: keep-all;
  }
  .vt-prep-keynote.ok {
    color: var(--vt-accent);
  }

  /* ── 오늘의 후보 판 ── */
  .vt-prep-lineup {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    padding: 14px 20px 12px;
    border-radius: 26px;
  }
  .vt-lineup-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 0 4px 8px;
    border-bottom: 1px dashed color-mix(in srgb, var(--vt-line) 90%, transparent);
  }
  .vt-lineup-head h2 {
    margin: 0;
    font-size: 19px;
  }
  .vt-lineup-count {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--vt-soft);
    font-size: 14px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  .vt-lineup-rule {
    margin-left: auto;
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 800;
  }
  /* 판 크기는 준비 화면 격자가 정하고(남는 높이), 안의 후보 수·크기는 그 크기를 재서 정합니다.
     안쪽을 absolute로 띄워 두어야 후보 크기가 다시 판 크기를 밀어내는 되먹임이 생기지 않습니다. */
  .vt-lineup-stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .vt-lineup-fit {
    position: absolute;
    inset: 0;
    display: flex;
    overflow: auto;
    padding: 10px 8px;
  }
  .vt-lineup-items {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 18px 20px;
    /* 한 줄에 --cols칸이 들어가는 폭으로 묶어, 마지막 줄도 가운데로 모입니다 */
    width: calc(var(--cols) * var(--cell) + (var(--cols) - 1) * 20px);
    max-width: 100%;
    margin: auto;
    padding: 0;
    list-style: none;
  }
  .vt-lineup-items li {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 12px;
    width: var(--cell);
    min-width: 0;
  }
  .vt-lineup-art {
    position: relative;
    display: grid;
  }
  /* 기호 키캡은 스티커 왼쪽 아래에 이름표처럼 붙입니다(투표할 때 누를 번호). */
  .vt-lineup-key {
    position: absolute;
    left: -10%;
    bottom: -4%;
  }
  .vt-lineup-name {
    display: grid;
    place-items: safe center;
    width: 100%;
    height: calc(var(--name) * 1.2 * var(--lines));
    overflow: hidden;
  }
  .vt-lineup-name b {
    display: block;
    max-width: 100%;
    color: color-mix(in srgb, var(--cink) 55%, var(--vt-ink));
    font-size: calc(var(--name) * var(--fit, 1));
    font-weight: 900;
    line-height: 1.2;
    letter-spacing: -0.01em;
    text-align: center;
    word-break: keep-all;
    overflow-wrap: normal;
    text-wrap: balance;
  }
  :global(.vt-root[data-scheme='dark']) .vt-lineup-name b {
    color: #f1f5f9;
  }
  /* data-squeezed는 fitName이 실행 중에 붙이므로 컴파일러가 모릅니다(:global로 남김) */
  .vt-lineup-name b:global([data-squeezed]) {
    overflow-wrap: anywhere;
  }
  .vt-lineup-items small {
    max-width: 100%;
    height: 22px;
    overflow: hidden;
    color: var(--vt-muted);
    font-size: var(--intro);
    font-weight: 800;
    line-height: 22px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .vt-lineup-agendas {
    display: grid;
    gap: 12px;
    width: min(980px, 100%);
    margin: auto;
    padding: 0;
    list-style: none;
  }
  .vt-lineup-agendas li {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 16px;
    padding: 12px 22px;
    border: 1px solid var(--vt-line);
    border-radius: 18px;
    background: color-mix(in srgb, var(--vt-soft) 45%, var(--vt-card));
  }
  .vt-lineup-agendas span {
    flex: none;
    color: var(--vt-accent);
    font-size: calc(var(--agenda) * 0.62);
    font-weight: 900;
  }
  .vt-lineup-agendas b {
    min-width: 0;
    font-size: var(--agenda);
    line-height: 1.35;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  /* 아래 줄은 흐름 버튼만: 오른쪽에 [뒤로 가기] [안내 없이 바로 투표] [안내 시작] */
  .vt-prep-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }
  .vt-prep-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
