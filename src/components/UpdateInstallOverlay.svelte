<script>
  // ✨ [업데이트 설치 직전] 창 전체를 덮어 새 입력을 막는 덮개입니다.
  //
  // 왜 필요한가:
  //   설치 직전에 각 창은 마지막 저장을 마치고, 그 뒤로는 디스크에 쓰지 않습니다(appState의 writesFrozen).
  //   그 사이에 입력한 글자는 설치와 함께 사라지므로, 입력 자체를 막고 곧 다시 열린다는 것을 알려 줍니다.
  //   마우스는 덮개가 가리고, 키보드·붙여넣기·끌어놓기는 창 전체에서 가로챕니다.
  //   (Tab으로 편집기에 다시 들어가 글자를 치는 경우까지 막기 위해서입니다)
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { appState } from '../lib/appState.svelte.js';

  /** @type {HTMLDivElement | undefined} */
  let overlay = $state();
  const accent = $derived(appState.getThemeAccentColor());

  /** @param {Event} event */
  function block(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  onMount(() => {
    // 편집기에 남은 커서를 덮개로 옮깁니다.
    overlay?.focus();
  });
</script>

<svelte:window
  onkeydowncapture={block}
  onpastecapture={block}
  ondropcapture={block}
  onbeforeinputcapture={block}
/>

<div
  bind:this={overlay}
  transition:fade={{ duration: 120 }}
  class="fixed inset-0 flex flex-col items-center justify-center gap-1.5 px-3 overflow-hidden text-center outline-none"
  style="
    z-index: 2147483000;
    cursor: progress;
    background-color: {appState.isDarkMode ? 'rgba(15,17,23,0.82)' : 'rgba(255,255,255,0.86)'};
    backdrop-filter: blur(3px);
  "
  role="alertdialog"
  aria-live="assertive"
  aria-label="새 버전을 설치하고 있어요"
  tabindex="-1"
>
  <span
    class="update-overlay-spinner shrink-0"
    style="border-color: {accent}33; border-top-color: {accent};"
    aria-hidden="true"
  ></span>
  <p
    class="text-[11px] font-extrabold leading-tight whitespace-nowrap"
    style="color: {appState.isDarkMode ? '#e2e8f0' : '#1f2937'};"
  >
    새 버전을 설치하고 있어요
  </p>
  <p
    class="update-overlay-detail text-[9.5px] font-bold leading-[1.5]"
    style="color: {appState.isDarkMode ? '#94a3b8' : '#6b7280'};"
  >
    지금까지 쓰신 내용은 저장했어요.<br />잠시 뒤 새 버전으로 다시 열려요.
  </p>
</div>

<style>
  .update-overlay-spinner {
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    border-width: 2.5px;
    border-style: solid;
    animation: update-overlay-spin 0.8s linear infinite;
  }
  @keyframes update-overlay-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .update-overlay-spinner { animation-duration: 2.4s; }
  }
  /* 말아 둔 Tiny Note(띠 높이)처럼 아주 낮은 창에서는 제목 한 줄만 보여 줍니다. */
  @media (max-height: 90px) {
    .update-overlay-spinner,
    .update-overlay-detail { display: none; }
  }
</style>
