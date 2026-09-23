<script>
  // ✨ [업데이트 안내 · 2단계] 배너를 누르면 열리는 안내 창입니다.
  //
  // 이 화면의 목표:
  //   컴퓨터에 익숙하지 않은 분도 버튼 하나로 업데이트를 끝낼 수 있게 하는 것.
  //   그래서 (1) 데이터가 안전하다는 안심 문구를 먼저 보여주고,
  //         (2) 누른 뒤 무슨 일이 일어나는지(잠시 닫혔다가 다시 열림)를 미리 알려 주고,
  //         (3) 앱 안 설치가 안 될 때만 예전 방식(직접 내려받기)과 윈도우 경고창 대처법을 보여 줍니다.
  //   (앱이 직접 받은 설치 파일은 "Windows의 PC 보호" 경고창이 뜨지 않습니다)
  import { fade, scale } from 'svelte/transition';
  import { X, Download, ExternalLink, RotateCw } from 'lucide-svelte';
  import { appState } from '../lib/appState.svelte.js';
  import {
    describeDownloadProgress,
    describeInstallError,
    downloadPercent,
    formatBytes,
    formatReleaseDate,
    isInstallActive,
  } from '../lib/updateChecker.js';

  const accent = $derived(appState.getThemeAccentColor());
  const info = $derived(appState.updateInfo);
  const fileSize = $derived(formatBytes(info?.assetSize));
  const releaseDate = $derived(formatReleaseDate(info?.publishedAt));

  const phase = $derived(appState.updateInstallPhase);
  const isActive = $derived(isInstallActive(phase));
  const isFailed = $derived(phase === 'failed');
  // 확인·내려받기 단계까지만 취소할 수 있습니다. (저장 확인부터는 Rust가 되돌리지 않습니다)
  const canCancel = $derived(phase === 'checking' || phase === 'downloading');
  const percent = $derived(
    phase === 'downloading' ? downloadPercent(appState.updateInstallDownloaded, appState.updateInstallTotal) : null,
  );
  const statusText = $derived.by(() => {
    if (phase === 'checking') return '새 버전 정보를 확인하고 있어요…';
    if (phase === 'downloading') {
      return `내려받는 중 · ${describeDownloadProgress(appState.updateInstallDownloaded, appState.updateInstallTotal)}`;
    }
    if (phase === 'preparing') return '모든 창의 내용을 저장하고 있어요…';
    if (phase === 'installing') return '설치를 시작해요. 잠시 뒤 새 버전으로 다시 열려요';
    return '';
  });

  // 직접 내려받기 버튼을 이미 눌렀는지 표시합니다.
  // 왜: 브라우저가 뒤에서 열리면 "눌렸나?" 싶어 여러 번 누르게 되는데,
  //     그러면 같은 파일이 여러 개 받아져 어떤 걸 실행할지 헷갈립니다.
  let hasClickedDownload = $state(false);
  let isCancelling = $state(false);

  function handleInstall() {
    hasClickedDownload = false;
    appState.installUpdate();
  }

  async function handleCancel() {
    isCancelling = true;
    try {
      await appState.cancelUpdateInstall();
    } finally {
      isCancelling = false;
    }
  }

  async function handleManualDownload() {
    const ok = await appState.openUpdateDownload();
    if (ok) hasClickedDownload = true;
  }

  // 색상 토큰: 다크 모드에서도 대비가 유지되도록 한곳에서 계산합니다.
  const surface = $derived(appState.isDarkMode ? '#20232b' : '#ffffff');
  const cardBg = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)');
  const borderColor = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)');
  const textMain = $derived(appState.isDarkMode ? '#e2e8f0' : '#1f2937');
  const textSub = $derived(appState.isDarkMode ? '#94a3b8' : '#6b7280');
  const trackBg = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)');
</script>

{#if info}
  <div
    transition:fade={{ duration: 140 }}
    class="absolute inset-0 flex items-center justify-center p-2"
    style="z-index: 100000; background-color: {appState.isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)'}; backdrop-filter: blur(2px);"
    role="presentation"
  >
    <div
      transition:scale={{ duration: 200, start: 0.94, opacity: 0 }}
      class="w-full h-full max-h-full rounded-xl shadow-2xl border flex flex-col overflow-hidden"
      style="background-color: {surface}; border-color: {borderColor}; color: {textMain};"
    >
      <!-- ── 머리말 ─────────────────────────────────────────────── -->
      <div
        class="shrink-0 flex items-start justify-between gap-2 px-3 pt-2.5 pb-2 border-b"
        style="border-color: {borderColor};"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] leading-none">🎉</span>
            <span class="text-[11px] font-extrabold tracking-tight">새 버전이 나왔어요!</span>
          </div>
          <!-- 지금 버전 → 새 버전을 한눈에 보여 줍니다. -->
          <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              class="text-[9px] font-bold px-1.5 py-[2px] rounded-md"
              style="background-color: {cardBg}; color: {textSub};"
            >
              지금 v{appState.appVersion || '?'}
            </span>
            <span class="text-[9px] font-black" style="color: {textSub};">→</span>
            <span
              class="text-[9px] font-black px-1.5 py-[2px] rounded-md text-white"
              style="background-color: {accent};"
            >
              새 버전 v{info.version}
            </span>
          </div>
        </div>

        <!-- 닫아도 진행 중인 내려받기는 멈추지 않습니다(알림 띠에 진행률이 보입니다). -->
        <button
          onclick={() => appState.closeUpdateGuide()}
          class="p-1 rounded-md shrink-0 transition-colors hover:bg-black/10"
          aria-label="안내 닫기"
        >
          <X size={13} strokeWidth={3} style="color: {textSub};" />
        </button>
      </div>

      <!-- ── 본문 (작은 창에서도 전부 읽을 수 있도록 스크롤) ────── -->
      <div class="flex-1 overflow-y-auto px-3 py-2.5 flex flex-col gap-2.5 update-guide-scroll">

        <!-- 안심 문구를 가장 먼저 보여 줍니다.
             왜: "업데이트하면 내가 쓴 게 지워지나?"가 가장 큰 망설임이기 때문입니다. -->
        <div
          class="rounded-lg px-2.5 py-2 border"
          style="background-color: {appState.isDarkMode ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.08)'}; border-color: {appState.isDarkMode ? 'rgba(52,211,153,0.25)' : 'rgba(16,185,129,0.25)'};"
        >
          <div class="flex items-start gap-1.5">
            <span class="text-[11px] leading-[1.4] shrink-0">🔒</span>
            <p
              class="text-[9.5px] font-bold leading-[1.5]"
              style="color: {appState.isDarkMode ? '#6ee7b7' : '#047857'};"
            >
              지금까지 쓰신 할 일과 메모는 그대로 남습니다.<br />
              설치하기 직전에 모든 창의 내용을 자동으로 저장해요.
            </p>
          </div>
        </div>

        <!-- 앱 안 설치가 멈춘 이유와 대안 -->
        {#if isFailed}
          <div
            class="rounded-lg px-2.5 py-2 border flex flex-col gap-1.5"
            style="background-color: {appState.isDarkMode ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.06)'}; border-color: {appState.isDarkMode ? 'rgba(248,113,113,0.28)' : 'rgba(239,68,68,0.25)'};"
          >
            <p
              class="text-[9.5px] font-bold leading-[1.55]"
              style="color: {appState.isDarkMode ? '#fca5a5' : '#b91c1c'};"
              role="alert"
            >
              {describeInstallError(appState.updateInstallErrorCode)}
            </p>
            <p class="text-[9px] font-medium leading-[1.55]" style="color: {textSub};">
              직접 내려받을 때는 받은 파일을 실행해 주세요. <b>“Windows의 PC 보호”</b> 창이 뜨면
              <b>[추가 정보]</b> → <b>[실행]</b>을 누르시면 됩니다(제작자가 등록되지 않은 프로그램에 뜨는 일반 안내예요).
            </p>
          </div>
        {/if}

        <!-- 이번 버전에서 달라진 점 -->
        {#if info.notes && info.notes.length > 0}
          <div class="rounded-lg px-2.5 py-2 border" style="background-color: {cardBg}; border-color: {borderColor};">
            <p class="text-[9.5px] font-extrabold mb-1.5" style="color: {accent};">
              이번에 좋아진 점
            </p>
            <ul class="flex flex-col gap-1">
              {#each info.notes as note}
                <li class="flex items-start gap-1.5">
                  <span class="text-[8px] leading-[1.9] shrink-0" style="color: {accent};">●</span>
                  <span class="text-[9.5px] font-medium leading-[1.5]" style="color: {textMain};">{note}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- 누른 뒤 일어나는 일을 순서대로 알려 줍니다.
             왜: 앱이 갑자기 닫히면 "고장 났나?" 싶으므로, 닫혔다가 다시 열린다는 것을 미리 말해 둡니다. -->
        <div class="rounded-lg px-2.5 py-2 border" style="background-color: {cardBg}; border-color: {borderColor};">
          <p class="text-[9.5px] font-extrabold mb-2" style="color: {accent};">
            이렇게 진행돼요
          </p>

          <div class="flex flex-col gap-2">
            <div class="flex items-start gap-2">
              <span
                class="shrink-0 w-[15px] h-[15px] rounded-full flex items-center justify-center text-[8px] font-black text-white mt-[1px]"
                style="background-color: {accent};"
              >1</span>
              <p class="text-[9.5px] font-medium leading-[1.55]" style="color: {textMain};">
                아래 <b style="color: {accent};">[지금 업데이트]</b>를 누르면 새 버전을 내려받아요{fileSize ? ` (${fileSize})` : ''}.
              </p>
            </div>

            <div class="flex items-start gap-2">
              <span
                class="shrink-0 w-[15px] h-[15px] rounded-full flex items-center justify-center text-[8px] font-black text-white mt-[1px]"
                style="background-color: {accent};"
              >2</span>
              <p class="text-[9.5px] font-medium leading-[1.55]" style="color: {textMain};">
                내려받기가 끝나면 모든 창의 내용을 저장하고, Tidy Task가 <b style="color: {accent};">잠시 닫혀요</b>.
              </p>
            </div>

            <div class="flex items-start gap-2">
              <span
                class="shrink-0 w-[15px] h-[15px] rounded-full flex items-center justify-center text-[8px] font-black text-white mt-[1px]"
                style="background-color: {accent};"
              >3</span>
              <p class="text-[9.5px] font-medium leading-[1.55]" style="color: {textMain};">
                설치가 끝나면 <b style="color: {accent};">새 버전으로 저절로 다시 열려요</b>. 따로 누를 것은 없어요.
              </p>
            </div>
          </div>
        </div>

        {#if releaseDate}
          <p class="text-[8.5px] font-medium text-center" style="color: {textSub};">
            {releaseDate}에 배포된 버전입니다
          </p>
        {/if}
      </div>

      <!-- ── 행동 버튼 ──────────────────────────────────────────── -->
      <div
        class="shrink-0 px-3 py-2.5 border-t flex flex-col gap-2"
        style="border-color: {borderColor}; background-color: {appState.isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)'};"
      >
        {#if isActive}
          <!-- 진행 상황: 내려받는 동안은 비율 막대, 그 밖의 단계는 흐르는 막대를 보여 줍니다. -->
          <div class="flex flex-col gap-1.5" role="status" aria-live="polite">
            <div class="h-[6px] w-full rounded-full overflow-hidden" style="background-color: {trackBg};">
              {#if percent !== null}
                <div class="h-full rounded-full transition-[width] duration-200" style="width: {percent}%; background-color: {accent};"></div>
              {:else}
                <div class="h-full w-1/3 rounded-full update-progress-flow" style="background-color: {accent};"></div>
              {/if}
            </div>
            <p class="text-[9.5px] font-bold text-center leading-[1.5]" style="color: {textMain};">
              {statusText}
            </p>
          </div>

          {#if canCancel}
            <button
              onclick={handleCancel}
              disabled={isCancelling}
              class="w-full py-1.5 rounded-lg text-[9.5px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
              style="background-color: {cardBg}; color: {textSub};"
            >
              {isCancelling ? '취소하는 중…' : '취소'}
            </button>
          {/if}
        {:else}
          <button
            onclick={handleInstall}
            class="w-full py-2 rounded-lg text-[10.5px] font-extrabold text-white shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
            style="background-color: {accent}; box-shadow: 0 6px 16px {accent}33;"
          >
            {#if isFailed}
              <RotateCw size={12} strokeWidth={3} />
              다시 시도
            {:else}
              <Download size={12} strokeWidth={3} />
              지금 업데이트
            {/if}
          </button>

          {#if isFailed}
            <!-- 앱 안 설치가 안 될 때의 대안: 예전처럼 브라우저로 설치 파일을 받습니다. -->
            <button
              onclick={handleManualDownload}
              class="w-full py-1.5 rounded-lg text-[9.5px] font-extrabold border transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
              style="border-color: {accent}66; color: {accent};"
            >
              <ExternalLink size={11} strokeWidth={3} />
              직접 내려받기
            </button>
            {#if hasClickedDownload}
              <p
                class="text-[8.5px] font-bold text-center leading-[1.5]"
                style="color: {appState.isDarkMode ? '#6ee7b7' : '#047857'};"
              >
                인터넷 창을 열었습니다. 내려받기가 끝나면 그 파일을 실행해 주세요.<br />
                (창이 안 보이면 작업 표시줄에서 인터넷 아이콘을 확인해 보세요)
              </p>
            {/if}
          {/if}

          <div class="flex items-center gap-2">
            <button
              onclick={() => appState.snoozeUpdate()}
              class="flex-1 py-1.5 rounded-lg text-[9.5px] font-bold transition-all active:scale-[0.98]"
              style="background-color: {cardBg}; color: {textSub};"
            >
              나중에 (내일 다시 알림)
            </button>
            <button
              onclick={() => appState.skipUpdateVersion()}
              class="flex-1 py-1.5 rounded-lg text-[9.5px] font-bold transition-all active:scale-[0.98]"
              style="background-color: {cardBg}; color: {textSub};"
              title="이 버전은 다시 알리지 않습니다. 더 새로운 버전이 나오면 다시 알려 드려요."
            >
              이 버전 건너뛰기
            </button>
          </div>

          <!-- 자동 설치가 막힌 환경(학교 보안 프로그램 등)을 위한 대안 경로입니다. -->
          <button
            onclick={() => appState.openReleasePage()}
            class="flex items-center justify-center gap-1 text-[8.5px] font-bold transition-opacity hover:opacity-100 opacity-60"
            style="color: {textSub};"
          >
            <ExternalLink size={9} strokeWidth={3} />
            설치가 안 되면 여기서 직접 받으세요
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .update-guide-scroll::-webkit-scrollbar { width: 4px; }
  .update-guide-scroll::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.35);
    border-radius: 10px;
  }

  /* 전체 크기를 모르는 단계(확인·저장·설치 시작)에서는 막대가 흘러가며 "진행 중"임을 보여 줍니다. */
  .update-progress-flow {
    animation: update-progress-flow 1.1s ease-in-out infinite;
  }
  @keyframes update-progress-flow {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .update-progress-flow { animation: none; width: 100%; opacity: 0.6; }
  }
</style>
