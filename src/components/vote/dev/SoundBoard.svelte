<script lang="ts">
  // 효과음 청취 검수(개발 전용, `?toolkit-preview=vote&vote-sounds`). PRD 10절 "화면과 함께 듣기 · 교실 스피커 청취 검수"용.
  // 26종을 하나씩 또는 차례로 듣고, 같은 자리에서 BS.1770 음량·트루 피크를 재 봅니다(목표 ±1dB · −3dBTP).
  import { onDestroy } from 'svelte';
  import { Play, ListMusic, Gauge } from 'lucide-svelte';
  import { createVoteAudio, renderCue, CUES, CUE_IDS, LOUDNESS } from '../../../lib/vote/audio.js';
  import { AUDIO_FILES } from '../../../lib/vote/assetFiles.js';
  import { integratedLoudness, truePeak } from '../../../lib/vote/loudness.js';

  const GROUPS: { title: string; prefix: string[] }[] = [
    { title: '투표 · 안내', prefix: ['vote.', 'tut.'] },
    { title: '기호 추첨', prefix: ['lot.'] },
    { title: '개표', prefix: ['count.', 'race.', 'tug.', 'cast.', 'reveal.'] },
    { title: '결과', prefix: ['result.'] },
  ];
  const NAMES: Record<string, string> = {
    'vote.open': '투표판 열림', 'vote.cast': '투표 완료(모든 표 같음)', 'vote.undo': '다시 고르기', 'vote.hint': '잘못된 키', 'vote.allDone': '모두 투표', 'tut.page': '안내 넘김',
    'lot.shuffle': '카드 섞기', 'lot.deal': '카드 한 장', 'lot.done': '추첨 끝',
    'count.open': '투표함 열기', 'count.unfold': '용지 펼침', 'count.stamp': '번호 도장', 'count.chalk': '正 한 획', 'count.chalk5': '正 완성',
    'race.hop': '레이스 전진', 'race.tension': '레이스 막판', 'race.finish': '결승', 'tug.pull': '줄다리기', 'cast.tick': '개표 방송 반영', 'cast.sure': '당선 확실',
    'reveal.flip': '카드 뒤집기', 'reveal.drumroll': '드럼롤', 'result.fanfare': '당선 발표', 'result.tie': '동점', 'result.pass': '통과', 'result.fail': '부결',
  };
  const audio = createVoteAudio({ files: AUDIO_FILES });
  let volume = $state(70);
  $effect(() => audio.setVolume(volume));
  let measured = $state<Record<string, { lufs: number; tp: number }>>({});
  let playing = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  function play(id: string) {
    void audio.unlock().then(() => audio.play(id));
    playing = id;
    clearTimeout(timer);
    timer = setTimeout(() => (playing = ''), CUES[id as keyof typeof CUES] + 200);
  }
  async function playAll() {
    for (const id of CUE_IDS) {
      play(id);
      await new Promise((r) => setTimeout(r, CUES[id as keyof typeof CUES] + 700));
    }
  }
  async function measureAll() {
    const next: Record<string, { lufs: number; tp: number }> = {};
    for (const id of CUE_IDS) {
      const d = await renderCue(id);
      next[id] = { lufs: integratedLoudness(d, 48000), tp: truePeak(d) };
      measured = { ...measured, ...next };
    }
  }
  onDestroy(() => {
    clearTimeout(timer);
    audio.dispose();
  });
  // 목표 ±1dB면 맞음, 최고점 한도(−3dBTP)에 닿아 작게 둔 소리는 따로 표시(docs/QA-vote.md 표), 그 밖은 확인 필요.
  const status = (id: string) => {
    const m = measured[id];
    if (!m) return '';
    const off = m.lufs - LOUDNESS[id as keyof typeof LOUDNESS];
    if (Math.abs(off) <= 1 && m.tp <= -3) return 'ok';
    if (off < -1 && m.tp > -3.6 && m.tp <= -3) return 'peak';
    return 'bad';
  };
</script>

<section class="vt-sounds">
  <header>
    <h1>효과음 청취 검수</h1>
    <p>교실 스피커로 하나씩 들어 보세요. 거슬리거나 너무 크고 작은 소리가 있으면 이름을 알려 주세요.</p>
    <div class="vt-sounds-tools">
      <label>소리 크기 <input type="range" min="0" max="100" step="5" bind:value={volume} /> {volume}</label>
      <button class="vt-btn" onclick={playAll}><ListMusic size={17} />모두 차례로 듣기</button>
      <button class="vt-btn" onclick={measureAll}><Gauge size={17} />음량 재기</button>
    </div>
  </header>
  {#each GROUPS as g}
    <h2>{g.title}</h2>
    <ul>
      {#each CUE_IDS.filter((id) => g.prefix.some((p) => id.startsWith(p))) as id (id)}
        <li class:playing={playing === id}>
          <button class="vt-btn icon" aria-label={`${NAMES[id]} 듣기`} onclick={() => play(id)}><Play size={17} /></button>
          <span class="vt-sounds-name"><b>{NAMES[id]}</b><code>{id}</code>{#if AUDIO_FILES[id]}<em>녹음</em>{/if}</span>
          <span class="vt-sounds-num">목표 {LOUDNESS[id as keyof typeof LOUDNESS]} LUFS</span>
          <span class="vt-sounds-num" class:bad={status(id) === 'bad'}>{measured[id] ? `${measured[id].lufs.toFixed(1)} LUFS · ${measured[id].tp.toFixed(1)} dBTP${status(id) === 'peak' ? ' · 최고점 한도' : ''}` : '—'}</span>
        </li>
      {/each}
    </ul>
  {/each}
</section>

<style>
  .vt-sounds {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    width: min(960px, 100%);
    margin: 0 auto;
    padding: 24px 28px 40px;
  }
  .vt-sounds h1 {
    margin: 0;
    font-size: 28px;
  }
  .vt-sounds header p {
    margin: 6px 0 12px;
    color: var(--vt-muted);
    font-weight: 700;
  }
  .vt-sounds-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .vt-sounds-tools label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
  }
  .vt-sounds h2 {
    margin: 22px 4px 8px;
    color: var(--vt-muted);
    font-size: 15px;
  }
  .vt-sounds ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .vt-sounds li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto 280px;
    align-items: center;
    gap: 12px;
    padding: 6px 12px 6px 6px;
    border: 1px solid var(--vt-line);
    border-radius: 14px;
    background: var(--vt-card);
    transition: background var(--vt-quick) var(--vt-ease);
  }
  .vt-sounds li.playing {
    background: color-mix(in srgb, var(--vt-gold) 18%, var(--vt-card));
  }
  .vt-sounds-name {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .vt-sounds-name code {
    color: var(--vt-muted);
    font-size: 12px;
  }
  .vt-sounds-name em {
    padding: 0 6px;
    border-radius: 6px;
    background: var(--vt-soft);
    font-size: 12px;
    font-style: normal;
    font-weight: 800;
  }
  .vt-sounds-num {
    color: var(--vt-muted);
    font-size: 13px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .vt-sounds-num.bad {
    color: #9a6a12;
  }
</style>
