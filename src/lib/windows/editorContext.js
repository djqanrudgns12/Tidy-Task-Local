/** @typedef {{editor:HTMLElement, range:Range|null, start:number|null, end:number|null, hasSelection:boolean}} EditorContext */

/** 우클릭 직전의 편집 대상과 선택 범위를 보관합니다. 메뉴 창으로 초점이 넘어가도 원래 자리에 적용합니다.
 * @param {EventTarget|null} target
 * @returns {EditorContext|null} */
export function captureEditorContext(target) {
  if (!(target instanceof Element)) return null;
  const editor = target.closest('input, textarea, [contenteditable="true"]')
    || target.closest('.note-wrapper')?.querySelector('[contenteditable="true"]');
  if (!(editor instanceof HTMLElement)) return null;
  const selection = window.getSelection();
  const isInput = editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement;
  const range = !isInput && selection?.rangeCount && editor.contains(selection.anchorNode)
    ? selection.getRangeAt(0).cloneRange() : null;
  return { editor, range, start: isInput ? editor.selectionStart : null, end: isInput ? editor.selectionEnd : null,
    hasSelection: isInput ? editor.selectionStart !== editor.selectionEnd : !!range && !range.collapsed };
}

/** @param {EditorContext|null} context */
export function restoreEditorContext(context) {
  if (!context?.editor.isConnected) return false;
  const { editor, range, start, end } = context;
  editor.focus({ preventScroll: true });
  if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
    if (start !== null && end !== null) editor.setSelectionRange(start, end);
  } else {
    const selection = window.getSelection();
    const next = range && editor.contains(range.startContainer) ? range : document.createRange();
    if (next !== range) { next.selectNodeContents(editor); next.collapse(false); }
    selection?.removeAllRanges();
    selection?.addRange(next);
  }
  return true;
}

/** @param {EditorContext|null} context @param {string} action */
export async function runEditorContextAction(context, action) {
  if (!context || !restoreEditorContext(context)) return;
  if (action === 'select-all') {
    const editor = context.editor;
    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) editor.select();
    else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  } else if (action === 'copy' || action === 'cut') {
    const editor = context.editor;
    const text = editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement
      ? editor.value.slice(editor.selectionStart ?? 0, editor.selectionEnd ?? 0)
      : window.getSelection()?.toString() ?? '';
    if (!text) return;
    // 별도 메뉴 창에서 온 이벤트에서도 동작하도록, 초점 복원 후 텍스트 API를 사용합니다.
    await navigator.clipboard.writeText(text);
    if (action === 'cut') {
      restoreEditorContext(context);
      document.execCommand('delete');
    }
  } else if (action === 'paste') {
    const text = await navigator.clipboard.readText();
    restoreEditorContext(context);
    document.execCommand('insertText', false, text);
  } else document.execCommand(action);
}
