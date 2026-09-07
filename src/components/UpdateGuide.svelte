<script>
  // ✨ [업데이트 안내 · 2단계] 배너를 누르면 열리는 "따라 하기" 안내 창입니다.
  //
  // 이 화면의 목표:
  //   컴퓨터에 익숙하지 않은 분도 혼자서 업데이트를 끝낼 수 있게 하는 것.
  //   그래서 (1) 데이터가 안전하다는 안심 문구를 먼저 보여주고,
  //         (2) 눌러야 할 순서를 1·2·3으로 못 박고,
  //         (3) 실제로 겪게 될 윈도우 경고창까지 미리 알려 줍니다.
  import { fade, scale } from 'svelte/transition';
  import { X, Download, ExternalLink } from 'lucide-svelte';
  import { appState } from '../lib/appState.svelte.js';
  import { formatBytes, formatReleaseDate } from '../lib/updateChecker.js';

  const accent = $derived(appState.getThemeAccentColor());
  const info = $derived(appState.updateInfo);
  const fileSize = $derived(formatBytes(info?.assetSize));
  const releaseDate = $derived(formatReleaseDate(info?.publishedAt));

  // 다운로드 버튼을 이미 눌렀는지 표시합니다.
  // 왜: 브라우저가 뒤에서 열리면 "눌렸나?" 싶어 여러 번 누르게 되는데,
  //     그러면 같은 파일이 여러 개 받아져 어떤 걸 실행할지 헷갈립니다.
  let hasClickedDownload = $state(false);

  async function handleDownload() {
    const ok = await appState.openUpdateDownload();
    if (ok) hasClickedDownload = true;
  }

  // 색상 토큰: 다크 모드에서도 대비가 유지되도록 한곳에서 계산합니다.
  const surface = $derived(appState.isDarkMode ? '#20232b' : '#ffffff');
  const cardBg = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)');
  const borderColor = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)');
  const textMain = $derived(appState.isDarkMode ? '#e2e8f0' : '#1f2937');
  const textSub = $derived(appState.isDarkMode ? '#94a3b8' : '#6b7280');
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
              업데이트해도 내용이 사라지지 않으니 안심하세요.
            </p>
          </div>
        </div>

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

        <!-- 설치 방법: 사용자가 실제로 누를 순서 그대로 적습니다. -->
        <div class="rounded-lg px-2.5 py-2 border" style="background-color: {cardBg}; border-color: {borderColor};">
          <p class="text-[9.5px] font-extrabold mb-2" style="color: {accent};">
            이렇게 하시면 됩니다 (3단계)
          </p>

          <div class="flex flex-col gap-2">
            <div class="flex items-start gap-2">
              <span
                class="shrink-0 w-[15px] h-[15px] rounded-full flex items-center justify-center text-[8px] font-black text-white mt-[1px]"
                style="background-color: {accent};"
              >1</span>
              <p class="text-[9.5px] font-medium leading-[1.55]" style="color: {textMain};">
                아래 <b style="color: {accent};">파란 버튼</b>을 누르시면 인터넷 창이 열리면서
                설치 파일이 자동으로 내려받아집니다.
              </p>
            </div>

            <div class="flex items-start gap-2">
              <span
                class="shrink-0 w-[15px] h-[15px] rounded-full flex items-center justify-center text-[8px] font-black text-white mt-[1px]"
                style="background-color: {accent};"
              >2</span>
              <div class="min-w-0">
                <p class="text-[9.5px] font-medium leading-[1.55]" style="color: {textMain};">
                  {#if info.hasInstaller}
                    화면 아래쪽이나 브라우저 오른쪽 위에 나타난 파일을
                    <b style="color: {accent};">두 번 눌러</b> 실행해 주세요.
                  {:else}
                    열린 페이지에서 이름이 <b style="color: {accent};">.exe</b> 로 끝나는 파일을 눌러
                    내려받은 뒤, 그 파일을 실행해 주세요.
                  {/if}
                </p>
                {#if info.assetName}
                  <p
                    class="text-[8.5px] font-bold mt-1 px-1.5 py-1 rounded break-all leading-[1.4]"
                    style="background-color: {appState.isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)'}; color: {textSub};"
                  >
                    파일 이름: {info.assetName}{fileSize ? ` (${fileSize})` : ''}
                  </p>
                {/if}
              </div>
            </div>

            <div class="flex items-start gap-2">
              <span
                class="shrink-0 w-[15px] h-[15px] rounded-full flex items-center justify-center text-[8px] font-black text-white mt-[1px]"
                style="background-color: {accent};"
              >3</span>
              <p class="text-[9.5px] font-medium leading-[1.55]" style="color: {textMain};">
                설치 창이 뜨면 <b style="color: {accent};">[다음]</b> 만 계속 누르시면 끝입니다.
                설치가 시작되면 Tidy Task는 저절로 닫혔다가 새 버전으로 다시 열립니다.
              </p>
            </div>
          </div>
        </div>

        <!-- 실제로 마주치게 될 윈도우 경고창을 미리 알려 둡니다.
             왜: 이 파란 경고창에서 대부분의 사용자가 겁을 먹고 설치를 포기합니다. -->
        <div
          class="rounded-lg px-2.5 py-2 border"
          style="background-color: {appState.isDarkMode ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.08)'}; border-color: {appState.isDarkMode ? 'rgba(251,191,36,0.25)' : 'rgba(245,158,11,0.28)'};"
        >
          <div class="flex items-start gap-1.5">
            <span class="text-[11px] leading-[1.4] shrink-0">💡</span>
            <p
              class="text-[9px] font-bold leading-[1.55]"
              style="color: {appState.isDarkMode ? '#fcd34d' : '#b45309'};"
            >
              설치할 때 <b>“Windows의 PC 보호”</b> 파란 창이 뜰 수 있습니다.<br />
              당황하지 마시고 <b>[추가 정보]</b> → <b>[실행]</b> 을 눌러 주세요.<br />
              제작자가 등록되지 않은 프로그램에 뜨는 일반 안내이며, 정상 파일입니다.
            </p>
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
        <button
          onclick={handleDownload}
          class="w-full py-2 rounded-lg text-[10.5px] font-extrabold text-white shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
          style="background-color: {accent}; box-shadow: 0 6px 16px {accent}33;"
        >
          <Download size={12} strokeWidth={3} />
          새 버전 내려받기
        </button>

        {#if hasClickedDownload}
          <!-- 버튼을 눌렀다는 사실을 눈에 보이게 확인시켜 줍니다. -->
          <p
            class="text-[8.5px] font-bold text-center leading-[1.5]"
            style="color: {appState.isDarkMode ? '#6ee7b7' : '#047857'};"
          >
            인터넷 창을 열었습니다. 내려받기가 끝나면 그 파일을 실행해 주세요.<br />
            (창이 안 보이면 작업 표시줄에서 인터넷 아이콘을 확인해 보세요)
          </p>
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

        <!-- 직링크가 막힌 환경(학교 방화벽 등)을 위한 대안 경로입니다. -->
        <button
          onclick={() => appState.openReleasePage()}
          class="flex items-center justify-center gap-1 text-[8.5px] font-bold transition-opacity hover:opacity-100 opacity-60"
          style="color: {textSub};"
        >
          <ExternalLink size={9} strokeWidth={3} />
          내려받기가 안 되면 여기서 직접 받으세요
        </button>
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
</style>
