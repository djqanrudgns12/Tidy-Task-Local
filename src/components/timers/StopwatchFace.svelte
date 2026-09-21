<script lang="ts">
  let { time }: { time: string } = $props();
  const main = $derived(time.split('.')[0]);
</script>

<div class="stopwatch-face">
  <img src="/images/toolkit/stopwatch-face.png" alt="" width="1536" height="1024" />
  <div class="stopwatch-readout">
    <span class="elapsed-label">경과 시간</span>
    <div class="elapsed-time" class:long={main.length > 5} aria-label={time}>
      <span>{main}</span><small>.{time.split('.')[1]}</small>
    </div>
    <span class="elapsed-unit">{main.includes(':') && main.length > 5 ? '시 · 분 · 초' : '분 · 초'} <span>· 1/100초</span></span>
  </div>
</div>

<style>
  .stopwatch-face {
    position: relative;
    width: min(100%, 138cqh, 760px);
    aspect-ratio: 3 / 2;
    flex: none;
    container-type: inline-size;
  }
  img { display: block; width: 100%; height: auto; }
  .stopwatch-readout {
    position: absolute;
    inset: 29% 15% 24%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2.5cqw;
    color: #29463f;
  }
  .elapsed-label { font-size: clamp(10px, 2.5cqw, 18px); font-weight: 650; color: #647363; }
  .elapsed-time {
    display: flex;
    align-items: baseline;
    white-space: nowrap;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    font-size: 16cqw;
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.045em;
  }
  .elapsed-time.long { font-size: 10cqw; }
  .elapsed-time small { margin-left: 0.12em; font-size: 0.38em; color: #71816d; letter-spacing: 0; }
  .elapsed-unit { font-size: clamp(9px, 1.9cqw, 13px); color: #768071; }
  .elapsed-unit span { margin-left: 0.25em; }
</style>
