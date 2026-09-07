import DOMPurify from 'dompurify';

// Tags and attributes permitted by our own toolbar (DOMPurify whitelist for display/save)
const SAVE_CONFIG = {
  ALLOWED_TAGS: ['a', 'b', 'i', 'em', 'strong', 'u', 's', 'strike', 'span', 'font', 'br', 'p', 'div'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'color', 'face', 'size'],
  // ✨ [보완] 스마트 엔진이 사용하는 모든 CSS 속성을 허용합니다.
  ALLOWED_CSS_PROPS: [
    'color', 'background-color', 'font-family', 'font-size', 'line-height',
    'letter-spacing', 'text-align', 'font-weight', 'font-style', 'text-decoration',
    'cursor'
  ],
  ALLOW_DATA_ATTR: false,
  // ✨ a[href] 외부 링크 허용 (javascript: 프로토콜만 차단)
  FORBID_ATTR: [],
};

// Strict config for pasted external content – strips all attributes (styles, classes, etc.)
const PASTE_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'strike', 's', 'br'],
  ALLOWED_ATTR: []
};

export function sanitizeForDisplay(html) {
  return DOMPurify.sanitize(html || '', SAVE_CONFIG);
}

/**
 * contenteditable 노드를 IME-안전 + DOMPurify 정제와 함께 제어하는 Svelte 액션
 * @param {HTMLElement} node
 * @param {{ html: string, onUpdate?: (html: string) => void, onSave?: (() => void) | null }} params
 */
export function editable(node, { html, onUpdate, onSave = null }) {
  // Initial controlled assignment — no caret because node not yet focused
  node.innerHTML = sanitizeForDisplay(html);

  // ✨ [TCREI: Composition-Safe] 한글 IME 조합 상태 추적 플래그
  // 왜: 한글은 ㄱ→가→간 처럼 여러 키 입력이 하나의 글자로 "조합"됩니다.
  //     조합이 진행 중일 때 외부에서 innerHTML을 건드리면 브라우저가 조합을 강제 중단하여
  //     글자가 씹히거나, 다음 글자를 쳐야 이전 글자가 확정되는 버그가 발생합니다.
  let isComposing = false;

  function handleCompositionStart() {
    isComposing = true;
  }

  function handleCompositionEnd() {
    isComposing = false;
    // ✨ 조합이 완료된 직후, 밀렸던 상태 동기화를 한 번에 수행합니다.
    // 왜: 조합 중에는 onUpdate를 건너뛰었으므로, 완성된 최종 결과물을 이 시점에 반영해야
    //     Svelte 상태(appState.notes 등)와 실제 DOM이 일치합니다.
    if (onUpdate) {
      onUpdate(node.innerHTML);
    }
  }

  function handleInput() {
    // ✨ [TCREI: Composition-Safe] 조합 중이면 상태 업데이트를 건너뜁니다.
    // 왜: onUpdate → appState 변경 → $effect 트리거 → editable update() → innerHTML 덮어쓰기
    //     라는 연쇄 반응이 조합을 파괴하기 때문입니다. compositionend에서 일괄 반영합니다.
    if (isComposing) return;

    if (onUpdate) {
      onUpdate(node.innerHTML);
    }
  }

  function handleBlur() {
    // ✨ blur 시 혹시 조합이 남아있었다면 플래그를 안전하게 초기화합니다.
    isComposing = false;

    const raw = node.innerHTML;
    const clean = sanitizeForDisplay(raw);

    if (raw !== clean) {
      // Preserve caret — sanitize only if content actually changed
      node.innerHTML = clean;
      if (onUpdate) onUpdate(clean);
    }

    if (onSave) onSave();
  }

  function handleCopy(e) {
    e.preventDefault();

    // ✨ [TCREI: Integrity] 앱 내부에서 복사할 때도 순수 텍스트만 클립보드에 넣습니다.
    // 왜: contenteditable 영역에서 브라우저 기본 복사는 HTML(배경색, 폰트 등)을
    //     text/html로 클립보드에 포함시킵니다. 이 상태로 워드/한글에 붙여넣으면
    //     앱의 서식 찌꺼기가 그대로 따라갑니다.
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      e.clipboardData.setData('text/plain', selection.toString());
    }
  }

  function handlePaste(e) {
    e.preventDefault();

    // ✨ [TCREI: Integrity] 항상 순수 텍스트만 붙여넣기합니다.
    // 왜: 외부(웹페이지, 한글, 엑셀 등)에서 복사하면 text/html에 배경색·폰트·서식이
    //     포함되어 있어, DOMPurify로 정제해도 찌꺼기가 남을 수 있습니다.
    //     text/plain만 사용하면 서식을 원천 차단하여 깨끗한 텍스트만 삽입됩니다.
    const clipboardText = e.clipboardData.getData('text/plain');
    if (clipboardText) {
      document.execCommand('insertText', false, clipboardText.trim());
    }

    // Trigger reactive state sync
    handleInput();
  }

  node.addEventListener('compositionstart', handleCompositionStart);
  node.addEventListener('compositionend', handleCompositionEnd);
  node.addEventListener('input', handleInput);
  node.addEventListener('blur', handleBlur);
  node.addEventListener('copy', handleCopy);
  node.addEventListener('paste', handlePaste);

  return {
    update(newParams) {
      // ✨ [TCREI: Composition-Safe] 조합 진행 중이면 innerHTML 덮어쓰기를 완전히 차단합니다.
      // 왜: Svelte의 반응성으로 인해 input → onUpdate → 상태 변경 → update() 호출이
      //     동기적으로 발생할 수 있는데, 이때 innerHTML을 건드리면 IME 조합이 파괴됩니다.
      if (isComposing) {
        onUpdate = newParams.onUpdate;
        onSave = newParams.onSave ?? null;
        return;
      }

      const newSanitized = sanitizeForDisplay(newParams.html);
      const currentSanitized = sanitizeForDisplay(node.innerHTML);

      // 포커스 중이라 하더라도, 외부 상태가 명시적으로 비워졌다면('') 강제로 덮어씌웁니다. 
      if ((document.activeElement !== node || newSanitized === '') && currentSanitized !== newSanitized) {
        node.innerHTML = newSanitized;
      }
      onUpdate = newParams.onUpdate;
      onSave = newParams.onSave ?? null;
    },
    destroy() {
      node.removeEventListener('compositionstart', handleCompositionStart);
      node.removeEventListener('compositionend', handleCompositionEnd);
      node.removeEventListener('input', handleInput);
      node.removeEventListener('blur', handleBlur);
      node.removeEventListener('copy', handleCopy);
      node.removeEventListener('paste', handlePaste);
    }
  };
}
