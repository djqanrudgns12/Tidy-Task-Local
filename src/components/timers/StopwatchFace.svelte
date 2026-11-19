<script lang="ts">
  let {
    time,
    variant = 'illustrated',
    lapCount = 0,
    dark = false,
  }: {
    time: string;
    variant?: 'illustrated' | 'minimal';
    lapCount?: number;
    dark?: boolean;
  } = $props();
  const main = $derived(time.split('.')[0]);
  const centi = $derived(time.split('.')[1] ?? '00');
</script>

{#if variant === 'minimal'}
  <div class="stopwatch-minimal" aria-label={time}>
    <div class="sw-minimal-meta" class:has-lap={lapCount > 0}>
      <span class="sw-minimal-label">경과</span>
      {#if lapCount > 0}<span class="sw-minimal-lap">#{String(lapCount).padStart(2, '0')}</span>{/if}
    </div>
    <div class="sw-minimal-time" class:long={main.length > 5}>
      <span>{main}</span><small>.{centi}</small>
    </div>
  </div>
{:else}
  <div class="stopwatch-face" class:dark>
    {#if dark}
      <!-- 다크 모드에서는 흰 배경 PNG 대신 어두운 패널과 어우러지는 전용 크로노그래프 베젤을 그립니다. -->
      <svg class="stopwatch-dark-svg" viewBox="0 0 480 320" width="1536" height="1024" aria-hidden="true">
        <g stroke="var(--tk-line)" stroke-width="2" fill="color-mix(in srgb, var(--tk-soft) 88%, #64748b)">
          <g transform="rotate(-17 118 44)">
            <rect x="92" y="25" width="52" height="26" rx="10" />
          </g>
          <g transform="rotate(17 362 44)">
            <rect x="336" y="25" width="52" height="26" rx="10" />
          </g>
          <rect x="210" y="13" width="60" height="32" rx="10" />
        </g>
        <rect
          x="26"
          y="42"
          width="428"
          height="260"
          rx="130"
          fill="color-mix(in srgb, var(--tk-soft) 92%, black)"
          stroke="var(--tk-line)"
          stroke-width="2.5"
        />
        <rect
          x="44"
          y="58"
          width="392"
          height="228"
          rx="114"
          fill="#171d25"
          stroke="rgba(255, 255, 255, 0.12)"
          stroke-width="1.5"
        />
        <rect
          class="sw-dark-track"
          x="56"
          y="70"
          width="368"
          height="204"
          rx="102"
          fill="none"
          stroke="rgba(255, 255, 255, 0.18)"
          stroke-width="2"
          stroke-dasharray="2 14"
        />
      </svg>
    {:else}
      <img src="/images/toolkit/stopwatch-face.png" alt="" width="1536" height="1024" />
    {/if}
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
  img,
  .stopwatch-dark-svg {
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
    /* 라이트 일러스트(#fcfaf2 크림 문자판) 위 글씨는 테마에 휩쓸리지 않도록 어두운 잉크로 고정합니다. */
    color: #1f332c;
  }
  .stopwatch-face.dark .stopwatch-readout {
    inset: 27% 14% 19%;
    color: var(--tk-ink);
  }
  .elapsed-label {
    font-size: clamp(10px, 2.5cqw, 18px);
    font-weight: 650;
    color: #52685e;
  }
  .stopwatch-face.dark .elapsed-label,
  .stopwatch-face.dark .elapsed-time small,
  .stopwatch-face.dark .elapsed-unit {
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
    color: #52685e;
    letter-spacing: 0;
  }
  .elapsed-unit {
    font-size: clamp(9px, 1.9cqw, 13px);
    color: #52685e;
    white-space: nowrap;
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
