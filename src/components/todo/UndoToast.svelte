<script>
  // 되돌리기 알림 — 할 일·마감된 일을 지운 직후 새 할 일 입력줄 바로 위에 뜹니다.
  // 설계: docs/PRD-todo-row-gestures.md §7 (점무늬 바탕 · 딱지 받침 · 남은 시간 실선 · 휴지통 친구)
  //
  // 시간 규칙(6초, 올리면 멈춤, 나가면 최소 2초, 창이 숨으면 멈춤, 또 지우면 합침)은 undoToastModel.js가 맡고,
  // 여기서는 그 상태를 그리기만 합니다. [되돌리기]는 전역 Ctrl+Z가 아니라 삭제 기록으로 "지운 것만" 살립니다.
  import { onMount } from 'svelte';
  import { backOut, cubicOut } from 'svelte/easing';
  import { Flag, Undo2 } from 'lucide-svelte';
  import { appState } from '../../lib/appState.svelte.js';
  import { UNDO_TOAST_MS, describeToast } from '../../lib/todos/undoToastModel.js';
  import TrashBuddy from './TrashBuddy.svelte';

  const toast = $derived(appState.deletionToast);
  const text = $derived(describeToast(toast));
  const open = $derived(toast.phase !== 'hidden');
  const accent = $derived(appState.getThemeAccentColor());
  const dark = $derived(appState.isDarkMode);
  // 남은 시간 실선은 "지금 남은 비율 → 0"으로 줄어듭니다. 멈추면 그 자리에 섭니다.
  const barFrom = $derived(Math.max(0, Math.min(1, toast.remainingMs / UNDO_TOAST_MS)));
  const barKey = $derived(`${toast.group}:${toast.startedAt}:${toast.remainingMs}:${toast.paused}`);
  // 화면 읽기 프로그램용 문장. 늘 있는 상자에 글만 바꿔 넣어야 안정적으로 읽어 줍니다.
  const liveText = $derived(open
    ? [text.quoted ? `‘${text.quoted}’` : '', text.title, text.sub ?? '', toast.phase === 'shown' ? '되돌리기 단추가 있어요.' : '']
        .filter(Boolean).join(' ')
    : '');

  let reduced = false;

  onMount(() => {
    reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const onVisibility = () => {
      if (document.hidden) appState.pauseDeletionToast('hidden');
      else appState.resumeDeletionToast('hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.hidden) onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  /** 아래에서 톡 튀어 올라옵니다. @param {Element} _node */
  function toastIn(_node) {
    if (reduced) return { duration: 160, css: (/** @type {number} */ t) => `opacity: ${t}` };
    return {
      duration: 300,
      easing: backOut,
      css: (/** @type {number} */ t, /** @type {number} */ u) =>
        `opacity: ${Math.min(1, t * 1.8)}; transform: translateY(${u * 10}px) scale(${0.94 + 0.06 * t})`,
    };
  }

  /** 살짝 내려가며 사라집니다. @param {Element} _node */
  function toastOut(_node) {
    return {
      duration: 160,
      easing: cubicOut,
      css: (/** @type {number} */ t, /** @type {number} */ u) =>
        reduced ? `opacity: ${t}` : `opacity: ${t}; transform: translateY(${u * 6}px)`,
    };
  }

  /** 알림 안에서 초점이 빠져나갈 때만 다시 갑니다(알림 안 단추끼리 옮길 때는 계속 멈춤). @param {FocusEvent} e */
  function handleFocusOut(e) {
    const box = /** @type {HTMLElement} */ (e.currentTarget);
    if (!(e.relatedTarget instanceof Node && box.contains(e.relatedTarget))) appState.resumeDeletionToast('focus');
  }
</script>

<!-- 높이 0인 닻: 알림은 입력줄 바로 위에 겹쳐 뜨고 배치(measureLayout)를 바꾸지 않습니다. -->
<div class="undo-anchor">
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveText}</div>
  <div class="undo-stage">
    {#if open}
      {#key toast.group}
        <div
          class="undo-toast"
          class:is-dark={dark}
          class:has-sub={!!text.sub}
          class:is-done={toast.phase === 'restored'}
          style="--toast-accent: {accent};"
          role="group"
          aria-label="삭제 알림"
          in:toastIn|global
          out:toastOut|global
          onpointerenter={() => appState.pauseDeletionToast('hover')}
          onpointerleave={() => appState.resumeDeletionToast('hover')}
          onfocusin={() => appState.pauseDeletionToast('focus')}
          onfocusout={handleFocusOut}
        >
          <span class="buddy-seat">
            <TrashBuddy mood={toast.phase === 'restored' ? 'happy' : 'oops'} {accent} {dark} wiggle={toast.bump} />
          </span>

          <span class="msg">
            {#key `${toast.bump}:${toast.phase}`}
              <span class="line1">
                {#if text.quoted}
                  <!-- 제목만 말줄임되고 "지웠어요"는 늘 보이게 나눠 둡니다. 따옴표는 제목과 함께 말줄임됩니다. -->
                  <span class="q-text">‘{text.quoted}’</span>
                  <span class="verb">&nbsp;{text.title}</span>
                {:else}
                  <span class="q-text">{text.title}</span>
                {/if}
              </span>
            {/key}
            {#if text.sub}
              <span class="line2"><Flag size={10} strokeWidth={2.4} /><span class="q-text">{text.sub}</span></span>
            {/if}
          </span>

          {#if toast.phase === 'shown'}
            <button
              type="button"
              class="undo-btn"
              onclick={() => appState.undoRecentDeletions()}
              aria-label="지운 항목 되돌리기"
            >
              <Undo2 size={12} strokeWidth={2.7} />
              <span>되돌리기</span>
            </button>
            {#key barKey}
              <span
                class="time-bar"
                class:is-paused={toast.paused}
                style="--bar-from: {barFrom}; --bar-ms: {toast.remainingMs}ms;"
                aria-hidden="true"
              ></span>
            {/key}
          {/if}
        </div>
      {/key}
    {/if}
  </div>
</div>

<style>
  .undo-anchor {
    position: relative;
    height: 0;
    z-index: 30;
    container-type: inline-size;
  }
  .undo-stage {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 6px;
    display: grid;
    justify-items: center;
    pointer-events: none;
  }

  .undo-toast {
    --t-bg: #fffdf8;
    --t-border: rgba(120, 80, 20, 0.18);
    --t-dot: rgba(120, 80, 20, 0.075);
    --t-base: rgba(120, 80, 20, 0.22);
    --t-ink: #7c4a12;
    --t-sub: #a16207;
    --t-seat: #fff1f2;
    --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    grid-area: 1 / 1;
    pointer-events: auto;
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    box-sizing: border-box;
    max-width: min(340px, 100%);
    min-height: 36px;
    padding: 4px 4px 4px 5px;
    border-radius: 999px;
    border: 1.5px solid var(--t-border);
    background-color: var(--t-bg);
    /* 점무늬 바탕 — 관리 창 말씨 */
    background-image: radial-gradient(var(--t-dot) 1px, transparent 1.3px);
    background-size: 8px 8px;
    /* 아래쪽 2px 받침 = 딱지 느낌, 그 아래 아주 옅은 그림자 */
    box-shadow: 0 2px 0 var(--t-base), 0 8px 20px rgba(15, 23, 42, 0.1);
    overflow: hidden;
    font-family: var(--ui-font-family);
    font-size: calc(var(--ui-font-size, 10pt) * 0.95);
    color: var(--t-ink);
    user-select: none;
  }
  .undo-toast.is-dark {
    --t-bg: #2b3039;
    --t-border: rgba(255, 255, 255, 0.12);
    --t-dot: rgba(255, 255, 255, 0.05);
    --t-base: rgba(0, 0, 0, 0.35);
    --t-ink: #e5e7eb;
    --t-sub: #fcd34d;
    --t-seat: rgba(244, 63, 94, 0.14);
    box-shadow: 0 2px 0 var(--t-base), 0 10px 24px rgba(0, 0, 0, 0.35);
  }
  .undo-toast.has-sub {
    border-radius: 20px;
    padding-block: 5px 7px;
  }
  /* 되돌린 뒤에는 단추가 사라지므로 오른쪽 여백을 글자에 맞게 둡니다. */
  .undo-toast.is-done { padding-right: 13px; }

  .buddy-seat {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    /* 테마 강조색을 아주 옅게 깐 방석 — 분홍 볼·강조색 몸통과 어울리게 */
    background-color: color-mix(in srgb, var(--toast-accent) 11%, var(--t-seat));
    box-shadow: inset 0 -1.5px 0 color-mix(in srgb, var(--toast-accent) 18%, transparent);
  }

  .msg {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.25;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .line1 {
    display: flex;
    min-width: 0;
    white-space: nowrap;
    animation: toast-pop 200ms var(--spring);
  }
  .q-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .verb { flex: none; }
  .line2 {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    font-size: 0.86em;
    font-weight: 600;
    color: var(--t-sub);
  }
  .line2 :global(svg) { flex: none; }

  .undo-btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    /* 기본 글자(10pt)에서 24px, 화면 글자를 키우면 함께 커집니다. */
    min-height: 24px;
    padding: 0.3em 0.85em 0.3em 0.7em;
    border: 0;
    border-radius: 999px;
    border-bottom: 2px solid color-mix(in srgb, var(--toast-accent) 62%, black);
    background-color: var(--toast-accent);
    color: #ffffff;
    font: inherit;
    font-size: 0.92em;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    transition: transform 200ms var(--spring), filter 150ms ease;
  }
  /* 다크 모드 강조색은 밝은 색이라 글자를 어둡게 둡니다(대비). */
  .undo-toast.is-dark .undo-btn {
    color: #111827;
    border-bottom-color: color-mix(in srgb, var(--toast-accent) 55%, black);
  }
  .undo-btn:hover { transform: scale(1.04); filter: brightness(1.06); }
  .undo-btn:active { transform: scale(1.05, 0.88); transition-duration: 90ms; }
  .undo-btn:focus-visible {
    outline: 2px solid var(--toast-accent);
    outline-offset: 2px;
  }

  .time-bar {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 1px;
    height: 2px;
    border-radius: 2px;
    background-color: color-mix(in srgb, var(--toast-accent) 48%, transparent);
    transform-origin: left center;
    transform: scaleX(var(--bar-from));
    animation: toast-time var(--bar-ms) linear forwards;
  }
  .time-bar.is-paused { animation: none; }

  @keyframes toast-time {
    from { transform: scaleX(var(--bar-from)); }
    to { transform: scaleX(0); }
  }
  @keyframes toast-pop {
    0% { transform: scale(1.06); }
    100% { transform: scale(1); }
  }

  /* 아주 좁은 창: 휴지통 친구를 빼고 글과 단추를 살립니다. */
  @container (max-width: 240px) {
    .buddy-seat { display: none; }
    .undo-toast { padding-left: 10px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .line1 { animation: none; }
    .undo-btn,
    .undo-btn:hover,
    .undo-btn:active { transform: none; }
  }
</style>
