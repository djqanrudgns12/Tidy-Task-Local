<script>
  // ✨ [업데이트 안내 · 1단계] 새 버전을 발견했을 때 창 상단에 뜨는 얇은 알림 띠입니다.
  //
  // 왜 모달이 아니라 얇은 띠인가:
  //   앱을 켜자마자 커다란 창이 화면을 막으면 "일단 닫고 보자"가 되어 안내가 무시됩니다.
  //   작업을 방해하지 않는 띠로 먼저 알리고, 사용자가 누를 때 자세한 안내를 펼칩니다.
  import { slide } from 'svelte/transition';
  import { X } from 'lucide-svelte';
  import { appState } from '../lib/appState.svelte.js';

  const accent = $derived(appState.getThemeAccentColor());
  const version = $derived(appState.updateInfo?.version || '');
</script>

<div
  transition:slide={{ duration: 180 }}
  class="shrink-0 flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 border-b"
  style="
    background-color: {appState.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.025)'};
    border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
  "
>
  <!-- 새 버전이 있다는 사실 자체를 누르면 자세한 안내가 열립니다.
       왜 띠 전체를 버튼으로 만들었나: 작은 아이콘만 누를 수 있으면 찾기 어렵기 때문입니다. -->
  <button
    onclick={() => appState.openUpdateGuide()}
    class="flex-1 min-w-0 flex items-center gap-1.5 text-left transition-opacity hover:opacity-80 active:scale-[0.99]"
    title="업데이트 방법을 자세히 안내해 드립니다"
  >
    <span class="text-[12px] leading-none shrink-0">🎉</span>
    <span
      class="text-[10px] font-extrabold tracking-tight truncate"
      style="color: {accent};"
    >
      새 버전 v{version} 이 나왔어요
    </span>
    <span
      class="text-[9px] font-bold px-1.5 py-[1px] rounded-full shrink-0 border"
      style="color: {accent}; border-color: {accent}44;"
    >
      눌러서 보기
    </span>
  </button>

  <!-- 닫기는 "영구 무시"가 아니라 "하루 미루기"입니다.
       왜: 실수로 닫아도 내일 다시 안내되므로 업데이트를 영영 놓치지 않습니다. -->
  <button
    onclick={() => appState.snoozeUpdate()}
    class="p-1 rounded-md shrink-0 transition-colors hover:bg-black/5"
    title="오늘은 그만 보기 (내일 다시 알려 드려요)"
    aria-label="업데이트 알림 오늘 하루 숨기기"
  >
    <X size={11} strokeWidth={3} style="color: {appState.isDarkMode ? '#94a3b8' : '#9ca3af'};" />
  </button>
</div>
