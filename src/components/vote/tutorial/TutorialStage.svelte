<script lang="ts">
  // 학생 안내(PRD 5절). 슬라이드는 투표 설정에서 자동으로 만들어지고(tutorial.js), 천천히 자동으로 넘어갑니다.
  // 한 장의 시간 = max(기본 시간, 음성 끝 + 쉬는 시간). 마지막 장은 자동으로 투표를 시작하지 않습니다(선생님이 눌러야 시작).
  // 안내 중 키보드는 선생님 몫입니다: ←/→ 이전·다음, Space 멈춤/재생.
  import { onMount, onDestroy, untrack } from 'svelte';
  import { ArrowLeft, ArrowRight, Pause, Play, Flag } from 'lucide-svelte';
  import { buildSlides, PACE } from '../../../lib/vote/tutorial.js';
  import { send } from '../../../lib/vote/remote.js';
  import { staggerDelay } from '../../../lib/vote/motion.js';
  import BallotBox from '../art/BallotBox.svelte';
  import Stamp from '../art/Stamp.svelte';
  import KeyboardArt from '../art/KeyboardArt.svelte';
  import Keycap from '../common/Keycap.svelte';
  import Sticker from '../common/Sticker.svelte';
  import ItemCard from '../common/ItemCard.svelte';
  let { session, prefs, speech, speechAvailable, audio, reduced, remoteCmd, replay, onfinish } = $props<{
    session: any; prefs: any; speech: any; speechAvailable: boolean; audio: any; reduced: boolean; remoteCmd: any; replay: boolean; onfinish: () => void;
  }>();
  const slides = $derived(buildSlides(session));
  const pace = $derived(PACE(session.tutorial.speed));
  const useSpeech = $derived(speechAvailable && prefs.speech && session.tutorial.speech);
  let index = $state(0);
  let playing = $state(true);
  let speechError = $state(false);
  let silent = $state(false);
  let progressKey = $state(0);
  let token = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const last = $derived(index >= slides.length - 1);
  const slide = $derived(slides[Math.min(index, slides.length - 1)]);
  const items = $derived([...session.items].sort((a: any, b: any) => a.number - b.number));

  async function runSlide() {
    const my = ++token;
    clearTimeout(timer);
    speech.cancel();
    speechError = false;
    progressKey++;
    if (!playing) return;
    const start = performance.now();
    const i = untrack(() => index);
    const s = untrack(() => slides[i]);
    if (untrack(() => useSpeech && !silent && !prefs.muted && prefs.volume > 0)) {
      const result = await speech.speakSlide(untrack(() => session), s.id);
      if (my !== token) return;
      if (result !== 'completed') { speechError = true; playing = false; return; }
    }
    if (my !== token) return;
    const elapsed = performance.now() - start;
    const wait = Math.max(untrack(() => pace.baseMs) - elapsed, untrack(() => useSpeech) ? untrack(() => pace.restMs) : 0);
    timer = setTimeout(() => {
      if (my === token && playing && i < untrack(() => slides.length) - 1) go(i + 1);
    }, wait);
  }
  function go(i: number) {
    const next = Math.max(0, Math.min(slides.length - 1, i));
    if (next !== index) audio.play('tut.page');
    index = next;
    void runSlide();
  }
  function toggle() {
    playing = !playing;
    if (playing) void runSlide();
    else {
      token++;
      clearTimeout(timer);
      speech.cancel();
    }
  }
  function finish() {
    token++;
    clearTimeout(timer);
    speech.cancel();
    onfinish();
  }

  // 선생님 창에서 온 조작
  let lastSeq = untrack(() => remoteCmd?.seq ?? 0);
  $effect(() => {
    const cmd = remoteCmd;
    if (!cmd || cmd.kind !== 'tutorial' || cmd.seq === lastSeq) return;
    lastSeq = cmd.seq;
    untrack(() => {
      if (cmd.action === 'prev') go(index - 1);
      else if (cmd.action === 'next') go(index + 1);
      else if (cmd.action === 'toggle') toggle();
      else if (cmd.action === 'finish') finish();
    });
  });
  // 선생님 창에 지금 장을 알립니다(선생님 창이 새로 열려 sync를 보내면 다시 알림).
  $effect(() => {
    void remoteCmd;
    void send('vote-state', { kind: 'tutorial', index, total: slides.length, title: slide?.title ?? '', playing });
  });

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof Element && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.code === 'Space') {
      e.preventDefault();
      toggle();
    }
  }
  // 창이 가려지면 자동 넘김을 멈춥니다(아무도 못 본 장이 지나가지 않게).
  function onVisibility() {
    if (document.visibilityState === 'hidden' && playing) toggle();
  }
  onMount(() => {
    void audio.unlock();
    void runSlide();
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
  onDestroy(() => {
    token++;
    clearTimeout(timer);
    speech.cancel();
    void send('vote-state', { kind: 'tutorial-end' });
  });
  const dots = $derived(Math.max(2, session.rules.votesPerVoter));
</script>

<section class="vt-tut">
  {#key index}
    <div class="vt-slide vt-stage-enter" data-art={slide.art}>
      <h1>{slide.title}</h1>
      <div class="vt-slide-art">
        {#if slide.art === 'title'}
          <div class="vt-slide-hero"><BallotBox size={260} fill={0.1} /><span class="vt-slide-chip">{session.title}</span></div>
        {:else if slide.art === 'items'}
          <div class="vt-slide-items" style:--n={items.length}>
            {#each items as item, i (item.id)}
              <div class="vt-slide-item vt-pop-in" style:animation-delay={reduced ? '0ms' : `${staggerDelay(i, items.length) * 4}ms`}>
                <ItemCard {item} type={session.type} orient="tall" key={44} art={items.length > 6 ? 96 : 120} name={items.length > 6 ? 26 : 32} intro={15} />
              </div>
            {/each}
          </div>
        {:else if slide.art === 'agendas'}
          <ol class="vt-slide-agendas">{#each session.agendas as a, i (a.id)}<li class="vt-card vt-pop-in" style:animation-delay={reduced ? '0ms' : `${i * 160}ms`}><span>{i + 1}</span>{a.text}</li>{/each}</ol>
        {:else if slide.art === 'line'}
          <div class="vt-slide-line" class:animate={!reduced}>
            {#each items.slice(0, 4) as item, i (item.id)}<span class:front={i === 0} style:--i={i}><Sticker {item} type={session.type === 'yesno' ? 'opinion' : session.type} size={i === 0 ? 110 : 84} /></span>{/each}
            {#if !items.length}{#each [0, 1, 2] as i}<span style:--i={i}><Sticker item={{ number: i + 1, color: ['berry', 'sky', 'lemon'][i], pattern: 'dots' }} type="opinion" size={i === 0 ? 110 : 84} /></span>{/each}{/if}
            <span class="vt-slide-desk"><Keycap label="1" size={36} /><Keycap label="2" size={36} /><Keycap label="3" size={36} /></span>
          </div>
        {:else if slide.art === 'keys'}
          <div class="vt-slide-keys">
            <KeyboardArt lit={session.type === 'yesno' ? ['1', '2'] : items.map((it: any) => String(it.number))} size={54} {reduced} />
            <ul class="vt-slide-map">
              {#if session.type === 'yesno'}
                <li><Keycap label="1" size={40} /> 찬성</li><li><Keycap label="2" size={40} /> 반대</li>
              {:else}
                {#each items as item (item.id)}<li><Keycap label={item.number} size={40} /> {item.name}</li>{/each}
              {/if}
            </ul>
          </div>
        {:else if slide.art === 'dots'}
          <div class="vt-slide-dots" class:animate={!reduced}>{#each Array.from({ length: dots }) as _, i}<span style:--i={i}></span>{/each}</div>
        {:else if slide.art === 'agendaSteps'}
          <div class="vt-slide-steps">{#each session.agendas as a, i (a.id)}<div class="vt-card" style:--i={i} class:animate={!reduced}><b>안건 {i + 1}</b><span><Keycap label="1" size={30} />찬성 <Keycap label="2" size={30} />반대</span></div>{/each}</div>
        {:else if slide.art === 'zero'}
          <div class="vt-slide-zero"><Keycap label="0" size={120} lit /><Stamp text="기권" size={200} color="#6B6760" tilt={-8} /></div>
        {:else if slide.art === 'undo'}
          <div class="vt-slide-undo vt-card">
            <b>투표했어요!</b>
            <p>잘못 눌렀나요? <Keycap label="← 백스페이스" size={36} wide lit /></p>
            <span>다음 친구가 투표하기 전까지 다시 고를 수 있어요</span>
          </div>
        {:else if slide.art === 'secret'}
          <div class="vt-slide-secret"><BallotBox size={250} state="locked" fill={0.4} /><Stamp text="비밀" size={170} tilt={-10} /></div>
        {:else}
          <div class="vt-slide-ready">
            {#each items.slice(0, 5) as item, i (item.id)}<span class:hop={!reduced} style:--i={i}><Sticker {item} type={session.type} size={92} /></span>{/each}
            {#if session.type === 'yesno'}<Stamp text="O" round size={120} color="#1F6E57" /><Stamp text="X" round size={120} color="#96491A" tilt={8} />{/if}
          </div>
        {/if}
      </div>
      <!-- 문장은 " · "로 나뉜 짧은 말 묶음이라 한 묶음씩 줄을 바꿉니다(칠판에서 어중간한 곳이 끊겨 한 단어만 다음 줄로 넘어가지 않게). -->
      <p class="vt-slide-text">{#each slide.text.split(' · ') as clause}<span>{clause}</span>{/each}</p>
    </div>
  {/key}

  <footer class="vt-tut-foot">
    {#if speechError}
      <div role="alert">음성이 끝까지 재생되지 않았어요.
        <button class="vt-btn" onclick={() => { playing = true; void runSlide(); }}>다시 듣기</button>
        <button class="vt-btn" onclick={() => { silent = true; playing = true; void runSlide(); }}>음성 없이 계속</button>
      </div>
    {/if}
    <div class="vt-tut-progress" aria-hidden="true">
      {#each slides as _, i}<span class:on={i < index} class:current={i === index}>{#if i === index && playing && !last}{#key progressKey}<i style:animation-duration={`${pace.baseMs}ms`}></i>{/key}{/if}</span>{/each}
    </div>
    <div class="vt-tut-controls">
      <button class="vt-btn" disabled={index === 0} onclick={() => go(index - 1)} aria-label="이전 장"><ArrowLeft size={17} />이전</button>
      <button class="vt-btn" onclick={toggle} aria-label={playing ? '멈춤' : '재생'}>{#if playing}<Pause size={17} />멈춤{:else}<Play size={17} />재생{/if}</button>
      {#if !last}<button class="vt-btn" onclick={() => go(index + 1)} aria-label="다음 장">다음<ArrowRight size={17} /></button>{/if}
      <span class="vt-tut-count">{index + 1} / {slides.length}{useSpeech ? ' · 음성 켬' : ''}</span>
      <button class="vt-btn primary" class:big={last} onclick={finish}><Flag size={17} />{replay ? '안내 끝내기' : last ? '투표 시작' : '안내 끝내고 투표 시작'}</button>
    </div>
  </footer>
</section>

<style>
  .vt-tut {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .vt-slide {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    justify-items: center;
    gap: clamp(10px, 2cqi, 26px);
    padding: clamp(18px, 3cqi, 40px) clamp(20px, 4cqi, 60px) 10px;
    text-align: center;
  }
  .vt-slide h1 {
    margin: 0;
    font-size: clamp(30px, 4.6cqi, 68px);
    font-weight: 900;
    letter-spacing: -0.02em;
  }
  .vt-slide-art {
    display: grid;
    place-items: center;
    width: 100%;
    min-height: 0;
  }
  .vt-slide-text span {
    display: block;
  }
  .vt-slide-text {
    max-width: 30em;
    margin: 0;
    color: var(--vt-ink);
    font-size: clamp(18px, 2.4cqi, 34px);
    font-weight: 800;
    line-height: 1.45;
    word-break: keep-all;
  }
  .vt-slide-hero {
    display: grid;
    justify-items: center;
    gap: 14px;
  }
  .vt-slide-chip {
    padding: 8px 20px;
    border-radius: 999px;
    background: var(--vt-card);
    box-shadow: var(--vt-shadow);
    font-size: clamp(18px, 2.2cqi, 30px);
    font-weight: 900;
  }
  .vt-slide-items {
    display: grid;
    grid-template-columns: repeat(min(var(--n), 5), minmax(0, 1fr));
    gap: 20px;
    width: 100%;
    max-width: 1300px;
    height: 100%;
    max-height: 520px;
  }
  .vt-slide-item {
    min-height: 200px;
  }
  .vt-slide-agendas {
    display: grid;
    gap: 12px;
    width: min(900px, 100%);
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 100%;
    overflow: auto;
  }
  .vt-slide-agendas li {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    border-radius: 20px;
    font-size: clamp(18px, 2cqi, 28px);
    font-weight: 800;
    text-align: left;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .vt-slide-agendas li span {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--vt-soft);
    font-weight: 900;
  }
  .vt-slide-line {
    display: flex;
    align-items: flex-end;
    gap: 18px;
  }
  .vt-slide-line > span {
    opacity: calc(1 - var(--i) * 0.18);
  }
  /* 줄 선 친구들이 차례로 폴짝 — 맨 앞 친구부터 한 명씩 나온다는 느낌(안내 전용 움직임) */
  .vt-slide-line.animate > span:not(.vt-slide-desk) {
    animation: vt-queue-hop 2.8s var(--vt-ease) infinite;
    animation-delay: calc(var(--i) * 200ms);
  }
  @keyframes vt-queue-hop {
    0%, 30%, 100% {
      transform: translateY(0);
    }
    12% {
      transform: translateY(-14px) rotate(-3deg);
    }
    22% {
      transform: translateY(0) scale(1.03, 0.97);
    }
  }
  .vt-slide-desk {
    display: flex;
    gap: 8px;
    margin-left: 26px;
    padding: 18px 20px;
    border-radius: 18px 18px 6px 6px;
    background: var(--vt-wood);
    box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.12);
  }
  .vt-slide-keys {
    display: grid;
    justify-items: center;
    gap: 20px;
  }
  .vt-slide-map {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px 22px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .vt-slide-map li {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: clamp(16px, 1.8cqi, 24px);
    font-weight: 800;
  }
  .vt-slide-dots {
    display: flex;
    gap: 22px;
  }
  .vt-slide-dots span {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 7px solid color-mix(in srgb, var(--vt-ink) 30%, transparent);
    background: var(--vt-accent);
    border-color: var(--vt-accent);
  }
  .vt-slide-dots.animate span {
    animation: vt-dot-fill 4.5s var(--vt-ease) infinite;
    animation-delay: calc(var(--i) * 900ms);
  }
  @keyframes vt-dot-fill {
    0%, 8% {
      background: transparent;
      border-color: color-mix(in srgb, var(--vt-ink) 30%, transparent);
      transform: scale(1);
    }
    14% {
      transform: scale(1.12);
    }
    20%, 85% {
      background: var(--vt-accent);
      border-color: var(--vt-accent);
      transform: scale(1);
    }
    100% {
      background: transparent;
      border-color: color-mix(in srgb, var(--vt-ink) 30%, transparent);
    }
  }
  .vt-slide-steps {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .vt-slide-steps > div {
    display: grid;
    gap: 10px;
    padding: 18px 22px;
    border-radius: 20px;
    font-size: 18px;
  }
  .vt-slide-steps > div span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
  }
  .vt-slide-steps > div.animate {
    animation: vt-pop-in var(--vt-standard) var(--vt-ease-pop) both;
    animation-delay: calc(var(--i) * 500ms);
  }
  .vt-slide-zero,
  .vt-slide-secret {
    display: flex;
    align-items: center;
    gap: 40px;
  }
  .vt-slide-undo {
    display: grid;
    justify-items: center;
    gap: 14px;
    padding: 30px 48px;
    border-radius: 28px;
  }
  .vt-slide-undo b {
    font-size: clamp(30px, 4cqi, 54px);
  }
  .vt-slide-undo p {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    color: var(--vt-muted);
    font-size: 20px;
    font-weight: 800;
  }
  .vt-slide-ready {
    display: flex;
    align-items: flex-end;
    gap: 16px;
  }
  .vt-slide-ready .hop {
    animation: vt-hop 1.6s var(--vt-ease) infinite;
    animation-delay: calc(var(--i) * 160ms);
  }
  @keyframes vt-hop {
    0%, 60%, 100% {
      transform: translateY(0);
    }
    30% {
      transform: translateY(-16px) rotate(-3deg);
    }
  }
  .vt-tut-foot {
    display: grid;
    gap: 10px;
    padding: 12px 22px 16px;
    border-top: 1px solid color-mix(in srgb, var(--vt-line) 70%, transparent);
    background: color-mix(in srgb, var(--vt-card) 80%, transparent);
  }
  .vt-tut-progress {
    display: flex;
    gap: 6px;
  }
  .vt-tut-progress span {
    position: relative;
    flex: 1;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--vt-line) 70%, transparent);
  }
  .vt-tut-progress span.on {
    background: var(--vt-accent);
  }
  .vt-tut-progress i {
    position: absolute;
    inset: 0;
    background: var(--vt-accent);
    transform-origin: left;
    animation: vt-progress linear both;
  }
  @keyframes vt-progress {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
  .vt-tut-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .vt-tut-count {
    margin: 0 auto 0 8px;
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 800;
  }
</style>
