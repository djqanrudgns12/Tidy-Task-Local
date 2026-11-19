<script>
  // 말랑 X 단추 — 할 일·마감된 일 목록 공용 삭제 단추 (docs/PRD-todo-row-gestures.md §6)
  // 18px 젤리 동그라미 + 끝이 동글동글한 X. 올리면 분홍으로 물들며 X가 빙그르, 누르면 젤리처럼 눌립니다.
  //
  // 왜 누름(pointerdown) 때 판정하는가:
  //   X는 줄에 마우스가 들어온 직후 0.15초 동안 무장되지 않습니다(글 끝을 노린 누름이 삭제가 되지 않게).
  //   그 판정은 "누른 순간" 기준이어야 하므로 pointerdown에서 받아 두고 click에서 씁니다.
  //   키보드(Enter·Space)로 누른 클릭(detail 0)은 늘 무장 상태입니다.

  /**
   * @type {{
   *   label?: string,
   *   title?: string,
   *   dark?: boolean,
   *   canPress?: (event: PointerEvent) => boolean,
   *   onremove: (event: MouseEvent) => void,
   * }}
   */
  let { label = '지우기', title = '지우기', dark = false, canPress = () => true, onremove } = $props();

  let pressArmed = false;

  /** @param {PointerEvent} event */
  function handlePointerDown(event) {
    pressArmed = event.button === 0 && canPress(event);
  }

  /** @param {MouseEvent} event */
  function handleClick(event) {
    const viaKeyboard = event.detail === 0;
    const armed = viaKeyboard || pressArmed;
    pressArmed = false;
    // 줄 클릭(마감된 일 = 진행 중으로 되돌리기)으로 번지지 않게 막습니다.
    event.stopPropagation();
    if (!armed) return;
    onremove(event);
  }
</script>

<!-- 누를 때 초점을 가져가지 않습니다: 다른 줄을 편집하던 커서가 X를 누르는 순간 튀지 않게. -->
<button
  type="button"
  class="soft-x"
  class:is-dark={dark}
  aria-label={label}
  {title}
  onpointerdown={handlePointerDown}
  onmousedown={(e) => e.preventDefault()}
  onclick={handleClick}
>
  <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
    <path d="M3.6 3.6l4.8 4.8M8.4 3.6l-4.8 4.8" />
  </svg>
</button>

<style>
  .soft-x {
    --sx-bg: rgba(0, 0, 0, 0.05);
    --sx-border: rgba(0, 0, 0, 0.08);
    --sx-ink: #a8a29e;
    --sx-base: rgba(0, 0, 0, 0.07);
    --sx-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    flex: none;
    border-radius: 999px;
    border: 1px solid var(--sx-border);
    background: var(--sx-bg);
    color: var(--sx-ink);
    /* 아래쪽 안쪽 받침으로 딱지처럼 도톰하게 보입니다(관리 창 말씨). */
    box-shadow: inset 0 -1.5px 0 var(--sx-base);
    cursor: pointer;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease,
      transform 220ms var(--sx-spring);
  }
  /* 실제로 누를 수 있는 영역은 22px — 보이는 동그라미보다 바깥 2px 넓게. */
  .soft-x::before {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: inherit;
  }
  .soft-x.is-dark {
    --sx-bg: rgba(255, 255, 255, 0.07);
    --sx-border: rgba(255, 255, 255, 0.1);
    --sx-ink: #94a3b8;
    --sx-base: rgba(0, 0, 0, 0.28);
  }
  .soft-x svg {
    display: block;
    overflow: visible;
    transition: transform 220ms var(--sx-spring);
  }
  .soft-x path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.3;
    stroke-linecap: round;
  }
  .soft-x:hover {
    --sx-bg: #ffe4e6;
    --sx-border: #fecdd3;
    --sx-ink: #f43f5e;
    --sx-base: rgba(244, 63, 94, 0.25);
    transform: scale(1.08);
  }
  .soft-x.is-dark:hover {
    --sx-bg: rgba(244, 63, 94, 0.2);
    --sx-border: rgba(251, 113, 133, 0.38);
    --sx-ink: #fb7185;
    --sx-base: rgba(0, 0, 0, 0.3);
  }
  .soft-x:hover svg { transform: rotate(90deg); }
  /* 누르면 젤리처럼: 가로로 살짝 퍼지고 세로로 눌립니다. */
  .soft-x:active {
    transform: scale(1.06, 0.86);
    transition-duration: 150ms, 150ms, 150ms, 90ms;
  }
  .soft-x:focus-visible {
    outline: 2px solid var(--todo-accent, #d97706);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .soft-x,
    .soft-x svg { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
    .soft-x:hover,
    .soft-x:active,
    .soft-x:hover svg { transform: none; }
  }
</style>
