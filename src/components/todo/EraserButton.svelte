<script>
  // 노트북 지우개 단추 — 할 일·마감된 일 목록 공용 삭제 단추 (docs/PRD-todo-row-gestures.md §6)
  // 22px 스퀘어클 칩 안에 15px 라인 지우개. 평소엔 100% 선으로 단정하게 뜨고,
  // 마우스를 올리면 슬리브에 연한 로즈 면이 차오르며 지우개가 살짝 기울어집니다.
  //
  // 왜 누름(pointerdown) 때 판정하는가:
  //   단추는 줄에 마우스가 들어온 직후 0.15초 동안 무장되지 않습니다(글 끝을 노린 누름이 삭제가 되지 않게).
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

<!-- 누를 때 초점을 가져가지 않습니다: 다른 줄을 편집하던 커서가 지우개를 누르는 순간 튀지 않게. -->
<button
  type="button"
  class="eraser-btn"
  class:is-dark={dark}
  aria-label={label}
  {title}
  onpointerdown={handlePointerDown}
  onmousedown={(e) => e.preventDefault()}
  onclick={handleClick}
>
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
    <!-- 바닥 지움선: 호버·누름 시 제자리에 남아 지우개가 선 위를 문지르는 기준선이 됩니다. -->
    <path class="eraser-line" d="M8 13.3h5.2" />
    <g class="eraser-body">
      <!-- 호버 듀오톤 슬리브: 평소엔 투명, 올리면 연한 로즈로 채워져 지우개 질감을 살립니다. -->
      <path
        class="eraser-sleeve"
        d="M5.7 6.5L8.5 3.7a1.2 1.2 0 0 1 1.7 0l3.1 3.1a1.2 1.2 0 0 1 0 1.7L10.5 11.3Z"
      />
      <path d="M4.2 13.3L2.4 11.5a1.2 1.2 0 0 1 0-1.7l6.1-6.1a1.2 1.2 0 0 1 1.7 0l3.1 3.1a1.2 1.2 0 0 1 0 1.7l-4.8 4.8H4.2z" />
      <path d="M5.7 6.5l4.8 4.8" />
    </g>
  </svg>
</button>

<style>
  .eraser-btn {
    /* 15개 라이트 테마 배경을 자연스럽게 투과하는 반투명 중립 잉크 */
    --eb-bg: transparent;
    --eb-ink: rgba(51, 65, 85, 0.52);
    --eb-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    flex: none;
    border: 0;
    border-radius: 6px;
    background: var(--eb-bg);
    color: var(--eb-ink);
    cursor: pointer;
    transition:
      background-color 150ms ease,
      color 150ms ease,
      transform 200ms var(--eb-spring);
  }
  /* 실제로 누를 수 있는 영역은 26px — 보이는 22px 칩보다 바깥 2px 넓혀 마감된 일(29px) 행 안에 안전하게 수용합니다. */
  .eraser-btn::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
  }
  .eraser-btn.is-dark {
    --eb-ink: rgba(203, 213, 225, 0.58);
  }
  .eraser-btn svg {
    display: block;
    overflow: visible;
  }
  .eraser-btn path:not(.eraser-sleeve) {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .eraser-body {
    transform-origin: 8px 10px;
    transform-box: view-box;
    transition: transform 220ms var(--eb-spring);
  }
  .eraser-sleeve {
    fill: currentColor;
    stroke: none;
    opacity: 0;
    transition: opacity 160ms ease;
  }
  .eraser-btn:hover {
    --eb-bg: rgba(225, 29, 72, 0.11);
    --eb-ink: #e11d48;
  }
  .eraser-btn.is-dark:hover {
    --eb-bg: rgba(251, 113, 133, 0.16);
    --eb-ink: #fb7185;
  }
  .eraser-btn:hover .eraser-body {
    transform: rotate(-12deg) translate(-0.4px, -0.5px);
  }
  .eraser-btn:hover .eraser-sleeve {
    opacity: 0.22;
  }
  /* 누르면 종이 위를 꾹 눌러 쓱 지우는 손맛 */
  .eraser-btn:active {
    transform: scale(0.92);
    transition-duration: 150ms, 150ms, 90ms;
  }
  .eraser-btn:active .eraser-body {
    transform: rotate(-18deg) translate(-1.2px, 0.3px);
    transition-duration: 90ms;
  }
  .eraser-btn:focus-visible {
    outline: 2px solid var(--todo-accent, #d97706);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .eraser-btn {
      transition: background-color 150ms ease, color 150ms ease;
    }
    .eraser-body {
      transition: none;
    }
    .eraser-btn:hover,
    .eraser-btn:active,
    .eraser-btn:hover .eraser-body,
    .eraser-btn:active .eraser-body {
      transform: none;
    }
  }
</style>
