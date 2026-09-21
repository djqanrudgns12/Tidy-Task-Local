<script lang="ts">
  import { onMount } from 'svelte';
  import { BellRing, Bomb, Wind, Siren, Volume2, VolumeX, Square, Maximize2, Minimize2, Pin, X } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { SOUNDS, createFocusAudio, normalizeVolume } from '../../lib/focus-bell/audio.js';
  import FocusArt from './FocusArt.svelte';
  import './focus-bell.css';
  const icons = { bell: BellRing, bomb: Bomb, fart: Wind, siren: Siren };
  const key = 'tidy-focus-bell-settings-v1';
  let selected = $state('bell'), status = $state('idle'), run = $state(0);
  let volume = $state(40), muted = $state(false), error = $state('');
  let pinned = $state(false), fullscreen = $state(false), ready = $state(false);
  const current = $derived(SOUNDS.find(s => s.id === selected)!);
  const audio = createFocusAudio(state => {
    status = state.status;
    if (state.status === 'playing') run++;
  });
  const draggable = (node: HTMLElement) => native ? dragRegion(node) : { destroy() {} };
  function save() {
    audio.setVolume(volume, muted);
    try { localStorage.setItem(key, JSON.stringify({ version: 1, volume, muted })); error = ''; }
    catch { error = '음량은 변경했지만 설정을 저장하지 못했어요.'; }
  }
  function play(id: string) { selected = id; void audio.play(id); }
  async function windowAction(action: () => Promise<unknown>) {
    try { await action(); } catch { error = '창을 조작하지 못했어요. 다시 시도해 주세요.'; }
  }
  async function toggleFullscreen() {
    if (native) {
      const win = getCurrentWindow(); const next = !(await win.isFullscreen());
      await win.setFullscreen(next); fullscreen = next;
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }
  async function togglePin() {
    if (native) { await getCurrentWindow().setAlwaysOnTop(!pinned); pinned = !pinned; }
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      audio.stop();
      if (fullscreen) void windowAction(toggleFullscreen);
    }
  }
  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved?.version === 1) { volume = normalizeVolume(saved.volume); muted = saved.muted === true; }
    } catch { error = '저장된 음량을 읽지 못해 기본 음량으로 시작해요.'; }
    audio.setVolume(volume, muted); ready = true;
    const sync = () => { fullscreen = Boolean(document.fullscreenElement); };
    const stop = () => audio.stop();
    window.addEventListener('pagehide', stop);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      audio.dispose(); window.removeEventListener('pagehide', stop);
      document.removeEventListener('fullscreenchange', sync);
    };
  });
</script>

<svelte:window onkeydown={onKey} />
<section class="fb-app" data-sound={selected} data-status={status}>
  <header class="fb-titlebar" use:draggable>
    <div class="fb-brand"><BellRing size={19} /><strong>집중벨</strong><span>Tidy 툴킷</span></div>
    <div class="fb-window-actions">
      {#if native}<button class:active={pinned} aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={() => windowAction(togglePin)}><Pin size={17} /></button>{/if}
      <button aria-label={fullscreen ? '전체화면 종료' : '전체화면'} title={fullscreen ? '전체화면 종료' : '전체화면'} onclick={() => windowAction(toggleFullscreen)}>{#if fullscreen}<Minimize2 size={18}/>{:else}<Maximize2 size={18}/>{/if}</button>
      <button aria-label="닫기" title="닫기" onclick={() => { audio.stop(); void windowAction(closeWindow); }}><X size={19}/></button>
    </div>
  </header>
  <main class="fb-main">
    <div class="fb-intro"><span class="fb-eyebrow">우리 반, 집중할 시간</span><h1>잠깐, 여기 봐요!</h1><p>소리를 누르면 즐겁게 시선이 모여요.</p></div>
    <div class="fb-stage" class:playing={status === 'playing'}>
      <span class="fb-spark fb-spark-one" aria-hidden="true">✦</span><span class="fb-spark fb-spark-two" aria-hidden="true">✧</span>
      <div class="fb-art">{#key selected + ':' + run}<FocusArt kind={selected} playing={status === 'playing'} />{/key}</div>
      <div class="fb-stage-label"><span class="fb-status-dot" class:on={status === 'playing'}></span>{current.label}<span class="fb-stage-note">{status === 'playing' ? (muted || volume === 0 ? '소리 없이 재생 중' : '재생 중') : status === 'loading' ? '준비 중' : '준비 완료'}</span></div>
    </div>
    <div class="fb-sounds" aria-label="집중벨 소리">
      {#each SOUNDS as sound}
        {@const Icon = icons[sound.id as keyof typeof icons]}
        <button class="fb-sound" class:selected={selected === sound.id} disabled={!ready} data-kind={sound.id} aria-label={`${sound.label} 재생`} onclick={() => play(sound.id)}>
          <span class="fb-sound-icon"><Icon size={25} strokeWidth={1.8}/></span><span><strong>{sound.label}</strong><small>{sound.description}</small></span><span class="fb-play-mark" aria-hidden="true">▶</span>
        </button>
      {/each}
    </div>
    <footer class="fb-controls">
      <div class="fb-volume"><button aria-label={muted ? '음소거 해제' : '음소거'} aria-pressed={muted} onclick={() => { muted = !muted; save(); }}>{#if muted || volume === 0}<VolumeX size={21}/>{:else}<Volume2 size={21}/>{/if}</button><label for="fb-volume">음량</label><input id="fb-volume" type="range" min="0" max="100" step="1" bind:value={volume} oninput={(event) => { volume = Number(event.currentTarget.value); muted = false; save(); }} /><output for="fb-volume">{muted ? '음소거' : `${volume}%`}</output></div>
      <button class="fb-stop" disabled={status !== 'playing' && status !== 'loading'} onclick={audio.stop}><Square size={15} fill="currentColor"/>정지</button>
    </footer>
    <p class="fb-help" role="status">{status === 'error' ? '소리를 불러오지 못했어요. 버튼을 다시 눌러주세요.' : '한 번 누르면 한 번 재생 · 다시 누르면 처음부터'}</p>
    {#if error}<p class="fb-error" role="alert">{error}</p>{/if}
  </main>
</section>
