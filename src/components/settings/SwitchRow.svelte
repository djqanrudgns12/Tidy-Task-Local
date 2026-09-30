<script>
  // 켜고 끄는 설정 한 줄 — 줄마다 따로 떨어진 둥근 조각입니다.
  // 줄 전체가 스위치라서 글자를 눌러도 바뀝니다(작은 손잡이만 겨냥하지 않아도 됨).
  // 켜짐 · 꺼짐 그림은 aria-checked를 CSS가 읽어 그립니다.
  import IconBubble from './IconBubble.svelte';

  /** @type {{
   *   icon: any, tone?: string,
   *   label: string, description?: string,
   *   checked: boolean, disabled?: boolean,
   *   onchange: (value: boolean) => void,
   * }} */
  let { icon, tone = 'accent', label, description = '', checked, disabled = false, onchange } = $props();
</script>

<button type="button" role="switch" class="row" aria-checked={checked} {disabled} onclick={() => onchange(!checked)}>
  <IconBubble {icon} {tone} />
  <span class="row-text">
    <strong>{label}</strong>
    {#if description}<small>{description}</small>{/if}
  </span>
  <span class="knob" aria-hidden="true"><i></i></span>
</button>

<style>
  .row {
    width: 100%;
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 11px 5px 8px;
    border: 0;
    border-radius: 16px;
    background: var(--st-piece);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.16s;
  }
  .row:hover:not(:disabled) {
    background: var(--st-piece-hover);
  }
  .row:focus-visible {
    outline: 2px solid var(--st-accent);
    outline-offset: 2px;
  }
  .row:disabled {
    cursor: default;
    opacity: 0.6;
  }
  /* 꺼진 줄은 색 방울이 바래서, 스위치를 보지 않아도 켜짐 · 꺼짐이 구분됩니다. */
  .row[aria-checked='false'] :global(.bubble) {
    filter: grayscale(0.85);
    opacity: 0.7;
  }
  .row-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  strong {
    font-size: 0.92em;
    font-weight: 700;
    line-height: 1.35;
    color: var(--st-ink);
  }
  small {
    font-size: 0.76em;
    font-weight: 500;
    line-height: 1.45;
    color: var(--st-muted);
    text-wrap: pretty;
  }
  /* 스위치 — 통통 튀게 움직입니다. */
  .knob {
    position: relative;
    flex: none;
    width: 36px;
    height: 22px;
    border-radius: 99px;
    background: var(--st-track);
    transition: background-color 0.18s;
  }
  .knob i {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
    transition: transform 0.2s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .row[aria-checked='true'] .knob {
    background: var(--st-accent);
  }
  .row[aria-checked='true'] .knob i {
    transform: translateX(14px);
  }
  @media (prefers-reduced-motion: reduce) {
    .row,
    .knob,
    .knob i {
      transition: none;
    }
  }
</style>
