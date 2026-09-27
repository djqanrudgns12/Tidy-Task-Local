<script lang="ts">
  // 키보드 키 모양의 기호(PRD 9절). 학생이 "이 키를 누르면 된다"를 바로 알아보게, 후보 번호를 실제 키처럼 그립니다.
  // 색은 부모의 후보 색(--cink · --cline)을 따르고, 없으면 기본 잉크색입니다.
  let { label, size = 64, wide = false, lit = false } = $props<{ label: string | number; size?: number; wide?: boolean; lit?: boolean }>();
</script>

<span class="vt-keycap" class:wide class:lit style:--k={`${size}px`} aria-hidden="true">{label}</span>

<style>
  .vt-keycap {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--k);
    height: var(--k);
    padding-bottom: calc(var(--k) * 0.04);
    border: max(1px, calc(var(--k) * 0.02)) solid color-mix(in srgb, var(--cline, var(--vt-line)) 90%, #000 4%);
    border-radius: calc(var(--k) * 0.26);
    background: linear-gradient(#fff, #fbf9f4);
    color: var(--cink, var(--vt-ink));
    font-size: calc(var(--k) * 0.56);
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    box-shadow:
      0 calc(var(--k) * 0.075) 0 var(--cline, var(--vt-line)),
      0 calc(var(--k) * 0.12) calc(var(--k) * 0.14) color-mix(in srgb, var(--vt-ink) 14%, transparent);
    transition: transform var(--vt-quick) var(--vt-ease), box-shadow var(--vt-quick) var(--vt-ease);
  }
  .vt-keycap.wide {
    width: auto;
    min-width: calc(var(--k) * 3.4);
    padding: 0 calc(var(--k) * 0.34) calc(var(--k) * 0.04);
    font-size: calc(var(--k) * 0.34);
    letter-spacing: 0.02em;
  }
  /* 안내 그림에서 "지금 누르는 키"를 보여 줄 때만 씁니다(투표판에서는 절대 쓰지 않음). */
  .vt-keycap.lit {
    transform: translateY(calc(var(--k) * 0.06));
    background: linear-gradient(#fff7d6, #ffeaa0);
    box-shadow:
      0 calc(var(--k) * 0.015) 0 var(--cline, var(--vt-line)),
      0 0 0 calc(var(--k) * 0.06) color-mix(in srgb, var(--vt-gold) 45%, transparent);
  }
  :global(.vt-root[data-scheme='dark']) .vt-keycap {
    background: linear-gradient(#3b4252, #343a48);
    border-color: color-mix(in srgb, var(--cline, #64748b) 70%, #000);
  }
</style>
