<script>
  import { appState } from '../lib/appState.svelte.js';
  import { editable } from '../lib/editable.js';
  import { PenLine } from 'lucide-svelte';

  let editorRef = $state(null);

  // 특수문자 팝업 트리거 — MainToolbar의 심볼 팝업을 열기 위해 커스텀 이벤트 dispatch
  function triggerSymbolPopup() {
    window.dispatchEvent(new CustomEvent('open-symbol-popup'));
  }

  // ✨ [TCREI: Composition-Safe] 플레이스홀더는 CSS :empty 기반으로 처리합니다.
  // 왜: $derived(appState.notes)는 한글 IME 조합 중 상태가 업데이트되지 않아
  //     플레이스홀더가 입력 글자와 겹치는 버그가 발생합니다.

  // 테마 색상 계산
  let borderC = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'var(--global-border-color, rgba(120,53,15,0.12))');
  let bgC     = $derived(appState.isDarkMode ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.45)');
  // ✨ [컴러 시스템 통일] 라이트: 딥 그라파이트(#374151), 다크: 저쉘도 흰색(#94a3b8)
  let titleC  = $derived(appState.isDarkMode ? '#94a3b8' : '#374151');
  
  // 창 라벨은 초기화 후 바뀌지 않으며, App이 준비된 뒤에만 에디터를 마운트합니다.
  // 따라서 마운트 후 상태를 뒤집지 않고 첫 렌더부터 올바른 Tiny Note 레이아웃을 사용합니다.
  const isTinyNote = appState.windowLabel.startsWith("tinynote-");
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="note-wrapper"
  style="
    border-top: {isTinyNote ? 'none' : '1px solid ' + borderC};
    background-color: {isTinyNote ? 'transparent' : 'inherit'};
    font-family: var(--ui-font-family, var(--global-font-family));
    font-size: var(--ui-font-size, 10pt);
  "
>
  <!-- 헤더 -->
  {#if !isTinyNote}
    <div class="note-header">
      <PenLine size={11} strokeWidth={2.5} style="color: {appState.getThemeAccentColor()}; flex-shrink:0;" />
      <span class="section-title" style="color: {titleC};">중요한 일 메모</span>
    </div>
  {/if}

  <!-- 에디터 스크롤 영역 -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="note-scroll"
    role="presentation"
    onclick={() => {
      if (editorRef && document.activeElement !== editorRef) editorRef.focus();
      document.execCommand('defaultParagraphSeparator', false, 'div');
    }}
  >
    <div
      bind:this={editorRef}
      contenteditable="true"
      spellcheck="false"
      data-placeholder={isTinyNote ? 'Tiny Note에 마음껏 기록해보세요' : '중요 내용 메모하기'}
      use:editable={{
        html: appState.notes,
        onUpdate: (val) => {
          appState.notes = val;
          appState.save();
        },
        onSave: () => appState.saveNow()
      }}
      class="note-editor"
      style="
        color: {appState.isDarkMode ? '#cbd5e1' : '#4b5563'};
        font-family: var(--global-font-family);
        font-size: var(--global-font-size, 10pt);
        --placeholder-color: {appState.isDarkMode ? 'rgba(203,213,225,0.3)' : 'rgba(107,114,128,0.45)'};
      "
      role="textbox"
      tabindex="0"
    ></div>
  </div>
</div>

<style>
  .note-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .note-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 3px;
    flex-shrink: 0;
    user-select: none;
  }

  .note-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .note-scroll {
    flex: 1 1 0;
    overflow-y: auto;
    cursor: text;
    padding: 0 10px 8px;
    position: relative;
    min-height: 0;
    /* 커스텀 스크롤바 */
    scrollbar-width: thin;
    scrollbar-color: rgba(0,0,0,0.15) transparent;
  }

  .note-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .note-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .note-scroll::-webkit-scrollbar-thumb {
    background-color: rgba(0,0,0,0.15);
    border-radius: 4px;
  }

  .note-editor {
    min-height: 50px;
    height: 100%;
    outline: none;
    font-weight: 500;
    line-height: 1.6;
    /* 한국어는 어절(띄어쓰기) 단위로 줄을 넘겨야 자연스럽습니다.
       break-word 는 단어 한가운데를 잘라 가독성을 해칩니다. */
    word-break: keep-all;
    /* 다만 URL처럼 띄어쓰기 없는 긴 문자열은 강제로 잘라 가로 넘침을 막습니다. */
    overflow-wrap: anywhere;
    padding-bottom: 16px;
    position: relative;
  }

  /* ✨ [TCREI: Composition-Safe] CSS 기반 플레이스홀더
     DOM이 비어있을 때만 ::before로 표시하여 IME 조합과 완전히 독립적으로 동작 */
  .note-editor:empty::before {
    content: attr(data-placeholder);
    color: var(--placeholder-color, rgba(107,114,128,0.45));
    pointer-events: none;
    user-select: none;
    font-weight: 500;
  }
</style>
