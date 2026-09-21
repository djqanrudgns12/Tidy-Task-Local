<script lang="ts">
  import { onMount } from "svelte";
  import {
    X,
    ArrowRight,
    Volume2,
    VolumeX,
    SkipForward,
    RotateCcw,
  } from "lucide-svelte";
  import Trophy from "./Trophy.svelte";
  import {
    REVEAL_DELAY_MS,
    CELEBRATION_END_MS,
  } from "../../lib/tournament/audio.js";
  let {
    name,
    title,
    reduced,
    sound,
    audioReady,
    audio,
    onclose,
    onsound,
    onaudioerror,
  } = $props<{
    name: string;
    title: string;
    reduced: boolean;
    sound: boolean;
    audioReady: Promise<boolean>;
    audio: ReturnType<
      typeof import("../../lib/tournament/audio.js").createTournamentAudio
    >;
    onclose: () => void;
    onsound: () => void;
    onaudioerror: () => void;
  }>();
  let dialog: HTMLDialogElement;
  let phase = $state("anticipation"),
    run = $state(0),
    live = $state("우승자를 발표합니다.");
  let timers: ReturnType<typeof setTimeout>[] = [],
    disposed = false,
    generation = 0;
  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
    audio.stop();
    generation++;
  }
  function close() {
    clear();
    dialog.close();
    onclose();
  }
  async function start(ready: Promise<boolean>) {
    clear();
    const token = generation;
    run++;
    phase = reduced ? "reveal" : "anticipation";
    live = reduced ? `${name}, 우승! 축하합니다!` : "우승자를 발표합니다.";
    const available = await ready;
    if (disposed || token !== generation) return;
    if (sound && (!available || !audio.play(reduced))) onaudioerror();
    if (!reduced)
      timers.push(
        setTimeout(() => {
          phase = "reveal";
          live = `${name}, 우승! 축하합니다!`;
        }, REVEAL_DELAY_MS),
      );
    timers.push(
      setTimeout(
        () => (phase = "settled"),
        reduced ? 3500 : CELEBRATION_END_MS,
      ),
    );
  }
  function skip() {
    clear();
    phase = "reveal";
    live = `${name}, 우승! 축하합니다!`;
    if (sound) audio.play(true);
    timers.push(setTimeout(() => (phase = "settled"), 3800));
  }
  onMount(() => {
    dialog.showModal();
    void start(audioReady);
    return () => {
      disposed = true;
      clear();
    };
  });
</script>

<dialog
  bind:this={dialog}
  class="tn-show"
  class:quiet={reduced}
  class:revealed={phase !== "anticipation"}
  aria-label="우승 축하"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <div class="tn-show-top">
    <button
      onclick={() => {
        onsound();
      }}
      aria-label={sound ? "효과음 끄기" : "효과음 켜기"}
      >{#if sound}<Volume2 size={21} />{:else}<VolumeX size={21} />{/if}{sound
        ? "소리 켜짐"
        : "소리 꺼짐"}</button
    ><button onclick={close} aria-label="우승 화면 닫기"
      ><X size={24} /> 닫기</button
    >
  </div>
  <p class="tn-sr" aria-live="polite">{live}</p>
  {#key run}
    <div class="tn-show-lights" aria-hidden="true"><i></i><i></i><i></i></div>
    {#if phase === "anticipation"}
      <div class="tn-anticipation">
        <span>마지막 경기의 주인공</span>
        <div class="tn-podium-silhouette"><Trophy large /></div>
        <h2>우리 반 우승자는…</h2>
        <div class="tn-drum-beats" aria-hidden="true">
          <i></i><i></i><i></i>
        </div>
        <button onclick={skip}><SkipForward size={18} /> 바로 발표하기</button>
      </div>
    {:else}
      <div class="tn-show-bloom" aria-hidden="true"></div>
      {#if !reduced && phase !== "settled"}<div
          class="tn-burst"
          aria-hidden="true"
        >
          {#each Array(100) as _, i}<i
              style={`--sx:${i % 2 === 0 ? "-8vw" : "108vw"};--dx:${(i % 2 === 0 ? 1 : -1) * (25 + ((i * 31) % 75))}vw;--dy:${-25 - ((i * 17) % 85)}vh;--delay:${(i % 8) * 0.06}s;--spin:${(i * 137) % 1000}deg;--color:${["#ffd76f", "#ff8d79", "#a8a5ff", "#6ed9d0", "#fff2c8"][i % 5]};--size:${5 + (i % 7)}px`}
            ></i>{/each}
        </div>{/if}
      <div class="tn-show-result">
        <span class="tn-champion-ribbon">우리 반 챔피언</span>
        <div class="tn-show-trophy">
          <div class="tn-trophy-halo"></div>
          <Trophy large />
        </div>
        <p>축하합니다!</p>
        <h1 style:--winner-size={name.length > 16 ? "3.2vw" : "5.6vw"}>
          {name}
        </h1>
        <strong>{title} 우승</strong>
        <div class="tn-show-actions">
          <button class="tn-primary" onclick={close}
            >대진표로 돌아가기 <ArrowRight size={20} /></button
          ><button
            class="tn-show-replay"
            onclick={() =>
              start(sound ? audio.unlock() : Promise.resolve(false))}
            ><RotateCcw size={18} /> 한 번 더 축하하기</button
          >
        </div>
      </div>
    {/if}
  {/key}
</dialog>

<style>
  .tn-show {
    position: fixed;
    inset: 0;
    border: 0;
    margin: 0;
    padding: 0;
    max-width: none;
    max-height: none;
    width: 100vw;
    height: 100dvh;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 35%, var(--tk-soft), var(--tk-bg) 75%);
    color: var(--tk-ink);
    font-family: var(--tk-font);
    animation: stage-in 0.45s ease-out both;
  }
  .tn-show::backdrop {
    background: #101931b3;
    animation: stage-in 0.45s both;
  }
  .tn-show-top {
    position: absolute;
    top: 18px;
    left: 22px;
    right: 22px;
    z-index: 8;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .tn-show button {
    min-height: 44px;
    border: 1px solid var(--tk-line);
    border-radius: 10px;
    color: var(--tk-ink);
    background: var(--tk-panel);
    padding: 10px 16px;
    font-size: 15px;
    font-weight: 650;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    cursor: pointer;
  }
  .tn-show button:focus-visible {
    outline: 3px solid #ffe293;
    outline-offset: 4px;
  }
  .tn-show button:hover {
    background: var(--tk-soft);
  }
  .tn-show-lights {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    opacity: 0.6;
  }
  .tn-show-lights i {
    position: absolute;
    top: -60%;
    left: 15%;
    width: 26%;
    height: 160%;
    background: linear-gradient(180deg, #cfdbff20, #cfdbff00);
    transform: rotate(25deg);
    transform-origin: top;
    animation: spotlight 3s ease-in-out infinite alternate;
  }
  .tn-show-lights i:nth-child(2) {
    left: 68%;
    transform: rotate(-25deg);
    animation-direction: alternate-reverse;
  }
  .tn-show-lights i:nth-child(3) {
    left: 42%;
    width: 16%;
    animation-delay: -1s;
  }
  .tn-anticipation,
  .tn-show-result {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 76px 30px 28px;
  }
  .tn-anticipation > span {
    color: var(--tk-ink);
    font-size: 19px;
    letter-spacing: 3px;
    animation: rise 0.5s both;
  }
  .tn-anticipation h2 {
    font-size: clamp(26px, 4vw, 42px);
    margin: 18px 0;
    color: var(--tk-ink);
    animation: rise 0.6s 0.15s both;
  }
  .tn-podium-silhouette {
    width: clamp(130px, 27vh, 240px);
    height: clamp(130px, 27vh, 240px);
    filter: brightness(0.26) saturate(0.2);
    animation: charging 1.9s ease-in both;
  }
  .tn-drum-beats {
    display: flex;
    gap: 15px;
    margin: 10px 0 30px;
  }
  .tn-drum-beats i {
    height: 12px;
    width: 12px;
    border-radius: 50%;
    background: #ffdb83;
    animation: beat 0.6s infinite;
  }
  .tn-drum-beats i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .tn-drum-beats i:nth-child(3) {
    animation-delay: 0.4s;
  }
  .tn-show-bloom {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 42%, #ffda7666, transparent 65%);
    animation: bloom 1.5s ease-out both;
    pointer-events: none;
  }
  .tn-champion-ribbon {
    padding: 10px 34px;
    background: linear-gradient(100deg, #e7ad38, #ffe79a, #e7ad38);
    color: #513208;
    font-size: 18px;
    letter-spacing: 4px;
    font-weight: 800;
    clip-path: polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%);
    animation: rise 0.65s both;
  }
  .tn-show-trophy {
    position: relative;
    width: clamp(130px, 29vh, 270px);
    height: clamp(130px, 29vh, 270px);
    animation: trophy-arrival 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .tn-trophy-halo {
    position: absolute;
    inset: 10%;
    border: 1px solid #fbd88280;
    border-radius: 50%;
    box-shadow: 0 0 75px #fbd88233;
    animation: halo 2s ease-out both;
    z-index: -1;
  }
  .tn-show-result > p {
    margin: 0;
    font-size: clamp(20px, 3vw, 28px);
    color: var(--tk-ink);
    animation: rise 0.55s 0.4s both;
  }
  .tn-show-result h1 {
    font-size: clamp(28px, var(--winner-size), 72px);
    line-height: 1.25;
    font-weight: 850;
    letter-spacing: -1px;
    margin: 12px 0;
    max-width: min(900px, 85vw);
    overflow-wrap: anywhere;
    flex-shrink: 0;
    overflow: visible;
    color: var(--tk-ink);
    text-shadow: 0 4px 28px #ffc75745;
    animation: name-arrival 0.8s 0.55s both;
  }
  .tn-show-result > strong {
    font-size: 16px;
    font-weight: 500;
    color: var(--tk-ink);
    max-width: 85vw;
    overflow-wrap: anywhere;
    animation: rise 0.6s 0.8s both;
  }
  .tn-show-actions {
    margin-top: 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    animation: rise 0.65s 1.1s both;
  }
  .tn-show .tn-primary {
    color: #483015;
    background: #ffda7b;
    border-color: #ffe3a0;
    font-size: 17px;
    padding: 13px 28px;
    box-shadow: 0 5px 30px #f9cd4930;
  }
  .tn-show .tn-show-replay {
    border: 0;
    background: transparent;
    color: var(--tk-ink);
    font-size: 14px;
    min-height: 35px;
    padding: 6px 12px;
  }
  .tn-burst {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 3;
  }
  .tn-burst i {
    position: absolute;
    left: var(--sx);
    top: 85%;
    width: var(--size);
    height: calc(var(--size) * 1.8);
    background: var(--color);
    border-radius: 1px;
    animation: confetti-flight 3.7s var(--delay)
      cubic-bezier(0.12, 0.65, 0.3, 1) both;
  }
  .tn-burst i:nth-child(3n) {
    border-radius: 50%;
    height: var(--size);
  }
  .tn-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    overflow: hidden;
  }
  @keyframes stage-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes spotlight {
    to {
      transform: rotate(-13deg);
    }
  }
  @keyframes charging {
    0% {
      transform: scale(0.8);
      filter: brightness(0.16) saturate(0.2);
    }
    100% {
      transform: scale(1);
      filter: brightness(0.55) saturate(0.6);
    }
  }
  @keyframes beat {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }
  @keyframes bloom {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0.35;
      transform: scale(1.4);
    }
  }
  @keyframes trophy-arrival {
    0% {
      opacity: 0;
      transform: translateY(65px) scale(0.3) rotate(-16deg);
    }
    65% {
      opacity: 1;
      transform: translateY(-10px) scale(1.08) rotate(3deg);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes halo {
    from {
      opacity: 1;
      transform: scale(0.5);
    }
    to {
      opacity: 0;
      transform: scale(2.8);
    }
  }
  @keyframes name-arrival {
    0% {
      opacity: 0;
      transform: translateY(20px) scale(0.82);
    }
    70% {
      opacity: 1;
      transform: scale(1.04);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes confetti-flight {
    0% {
      opacity: 0;
      transform: translate(0, 0) rotate(0);
    }
    7% {
      opacity: 1;
    }
    43% {
      opacity: 1;
      transform: translate(var(--dx), var(--dy)) rotate(var(--spin));
    }
    100% {
      opacity: 0;
      transform: translate(calc(var(--dx) * 1.1), 40vh)
        rotate(calc(var(--spin) * 2));
    }
  }
  .quiet * {
    animation: none !important;
  }
  .quiet .tn-show-lights,
  .quiet .tn-show-bloom,
  .quiet .tn-trophy-halo {
    display: none;
  }
  @media (max-height: 620px) {
    .tn-anticipation,
    .tn-show-result {
      padding-top: 58px;
      padding-bottom: 14px;
    }
    .tn-show-top {
      top: 10px;
    }
    .tn-show-top button {
      min-height: 36px;
      font-size: 13px;
      padding: 6px 10px;
    }
    .tn-champion-ribbon {
      font-size: 14px;
      padding: 6px 25px;
    }
    .tn-show-trophy {
      width: 24vh;
      height: 24vh;
    }
    .tn-show-result h1 {
      font-size: clamp(28px, 5vw, 48px);
      margin: 5px 0;
    }
    .tn-show-result > p {
      font-size: 20px;
    }
    .tn-show-result > strong {
      font-size: 13px;
    }
    .tn-show-actions {
      gap: 4px;
      margin-top: 16px;
    }
    .tn-show .tn-primary {
      font-size: 14px;
      min-height: 40px;
      padding: 9px 18px;
    }
  }
</style>
