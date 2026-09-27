<script lang="ts">
  // 배경 음악 켜기/끄기 스위치(투표판 제목줄 · 선생님 창 공통 — 모든 화면에 같은 자리).
  // 값은 설정(prefs.music)에 저장되므로 한 화면에서 끄면 다른 화면으로 넘어가도, 창을 다시 열어도 꺼진 채로 있습니다.
  // 마우스 전용(tabindex=-1)이고 누른 뒤 초점을 놓습니다: 투표 중 학생의 숫자키·스페이스가 이 버튼을 다시 누르지 않게(학급 투표 원칙).
  // waiting: 켜져 있지만 소리 장치가 아직 잠겨 있음(자동 재생 제한) — 음표가 천천히 깜빡이고, 화면을 한 번 누르면 시작합니다.
  let { on, waiting = false, quiet = false, compact = false, onpress } = $props<{
    on: boolean; waiting?: boolean; quiet?: boolean; compact?: boolean; onpress: () => void;
  }>();
  const hint = $derived(!on ? '배경 음악 켜기' : waiting ? '배경 음악 — 화면을 한 번 누르면 시작해요' : '배경 음악 끄기');
</script>

<button type="button" class="vt-music" class:on class:quiet class:compact class:waiting={on && waiting} role="switch" aria-checked={on}
  aria-label="배경 음악" title={hint} tabindex="-1"
  onclick={(e) => { (e.currentTarget as HTMLButtonElement).blur(); onpress(); }}>
  <span class="vt-music-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><path class="vt-music-slash" d="M3 3l18 18" /></svg>
  </span>
  {#if !compact}<span class="vt-music-text">음악</span>{/if}
  <span class="vt-music-track" aria-hidden="true"><span class="vt-music-thumb"></span></span>
</button>

<style>
  .vt-music {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 7px 0 11px;
    border: 1px solid var(--vt-line);
    border-radius: 999px;
    background: transparent;
    color: var(--vt-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, opacity 0.15s;
  }
  .vt-music:hover {
    background: var(--vt-soft);
    color: var(--vt-ink);
  }
  .vt-music.on {
    color: var(--vt-ink);
  }
  .vt-music-icon {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    transition: color 0.15s;
  }
  .vt-music.on .vt-music-icon {
    color: var(--vt-accent);
  }
  .vt-music-icon svg {
    display: block;
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    overflow: visible;
  }
  /* 끄면 음표 위로 빗금이 그어집니다(켜면 거둬짐) */
  .vt-music-slash {
    stroke-dasharray: 26;
    stroke-dashoffset: 26;
    transition: stroke-dashoffset 0.22s var(--vt-ease, ease);
  }
  .vt-music:not(.on) .vt-music-slash {
    stroke-dashoffset: 0;
  }
  .vt-music-track {
    position: relative;
    flex: none;
    width: 30px;
    height: 18px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--vt-muted) 34%, transparent);
    transition: background-color 0.18s;
  }
  .vt-music.on .vt-music-track {
    background: var(--vt-accent);
  }
  .vt-music-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition: transform 0.18s var(--vt-ease, ease);
  }
  .vt-music.on .vt-music-thumb {
    transform: translateX(12px);
  }
  .vt-music.waiting .vt-music-icon {
    animation: vt-music-wait 1.6s ease-in-out infinite;
  }
  @keyframes vt-music-wait {
    50% {
      opacity: 0.35;
    }
  }
  /* 투표 중에는 눈에 덜 띄게(선생님 버튼과 같은 규칙) */
  .vt-music.quiet {
    opacity: 0.55;
  }
  .vt-music.quiet:hover {
    opacity: 1;
  }
  .vt-music.compact {
    height: 30px;
    gap: 6px;
    padding: 0 5px 0 8px;
  }
  :global(.vt-root.reduced) .vt-music *,
  :global(.vt-root.reduced) .vt-music {
    transition: none;
    animation: none;
  }
</style>
