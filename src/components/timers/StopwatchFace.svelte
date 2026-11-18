<script lang="ts">
  let {
    time,
    variant = 'illustrated',
    lapCount = 0,
  }: {
    time: string;
    variant?: 'illustrated' | 'minimal';
    lapCount?: number;
  } = $props();
  const main = $derived(time.split('.')[0]);
  const centi = $derived(time.split('.')[1] ?? '00');
</script>

{#if variant === 'minimal'}
  <div class="stopwatch-minimal" aria-label={time}>
    <div class="sw-minimal-meta">
      <span class="sw-minimal-label">경과</span>
      {#if lapCount > 0}<span class="sw-minimal-lap">#{String(lapCount).padStart(2, '0')}</span>{/if}
    </div>
    <div class="sw-minimal-time" class:long={main.length > 5}>
      <span>{main}</span><small>.{centi}</small>
    </div>
  </div>
{:else}
  <div class="stopwatch-face">
    <img src="/images/toolkit/stopwatch-face.png" alt="" width="1536" height="1024" />
    <div class="stopwatch-readout">
      <span class="elapsed-label">경과 시간</span>
      <div class="elapsed-time" class:long={main.length > 5} aria-label={time}>
        <span>{main}</span><small>.{centi}</small>
      </div>
      <span class="elapsed-unit"
        >{main.includes(':') && main.length > 5 ? '시 · 분 · 초' : '분 · 초'} <span>· 1/100초</span></span
      >
    </div>
  </div>
{/if}

<style>
  .stopwatch-face {
    position: relative;
    width: min(100%, 144cqh, 820px);
    aspect-ratio: 3 / 2;
    flex: none;
    container-type: inline-size;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
  }
  .stopwatch-readout {
    position: absolute;
    inset: 29% 15% 24%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2.5cqw;
    color: var(--tk-ink);
  }
  .elapsed-label {
    font-size: clamp(10px, 2.5cqw, 18px);
    font-weight: 650;
    color: var(--tk-muted);
  }
  .elapsed-time {
    display: flex;
    align-items: baseline;
    white-space: nowrap;
    font-family: var(--tk-font);
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum';
    font-size: clamp(22px, 16.5cqw, 148px);
    font-weight: 700;
    line-height: 1;
    letter-spacing: calc(clamp(-0.045, var(--tk-num-track-min, 0.006), 0.08) * 1em);
  }
  .elapsed-time.long {
    font-size: clamp(16px, 10.5cqw, 96px);
  }
  .elapsed-time small {
    margin-left: 0.12em;
    font-size: 0.38em;
    color: var(--tk-muted);
    letter-spacing: 0;
  }
  .elapsed-unit {
    font-size: clamp(9px, 1.9cqw, 13px);
    color: var(--tk-muted);
  }
  .elapsed-unit span {
    margin-left: 0.25em;
  }

  /* 작은 위젯(strip · tile)에서는 두꺼운 이미지 베젤 대신 숫자가 가득 차는 크로노그래프 보드로 전환합니다. */
  .stopwatch-minimal {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 2cqh, 6px);
    color: var(--tk-ink);
    container-type: size;
  }
  .sw-minimal-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: clamp(10px, 9cqh, 12px);
    font-weight: 700;
    color: var(--tk-muted);
  }
  .sw-minimal-lap {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--tk-soft);
    color: var(--tk-accent);
    font-variant-numeric: tabular-nums;
  }
  .sw-minimal-time {
    display: flex;
    align-items: baseline;
    white-space: nowrap;
    font-family: var(--tk-font);
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum';
    font-size: clamp(20px, min(26cqw, 62cqh), 64px);
    font-weight: 700;
    line-height: 1;
    letter-spacing: calc(clamp(-0.045, var(--tk-num-track-min, 0.006), 0.08) * 1em);
  }
  .sw-minimal-time.long {
    font-size: clamp(16px, min(19cqw, 56cqh), 52px);
  }
  .sw-minimal-time small {
    margin-left: 0.1em;
    font-size: 0.42em;
    color: var(--tk-muted);
    letter-spacing: 0;
  }
</style>
