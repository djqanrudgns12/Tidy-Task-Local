import { STABLE_MAX_PT } from '../fontSize.js';
import {
  applyInlineStyleToRange,
  normalizeFontSizePt,
  readSelectionFormat,
  toggleInlineFormatOnRange,
} from '../editor/richTextFormat.js';

/**
 * @typedef {{
 *   editor: HTMLElement,
 *   range: Range | null,
 *   start: number | null,
 *   end: number | null,
 *   hasSelection: boolean,
 *   selectionFormat: import('../editor/richTextFormat.js').SelectionFormat | null,
 * }} EditorContext
 */

/**
 * 우클릭 직전의 편집 대상과 선택 범위·현재 서식 상태를 보관합니다.
 * 메뉴 창으로 초점이 넘어가도 원래 자리에 정확히 적용하며,
 * 할 일 텍스트 경계를 2~3px 벗어난 .todo-row 여백에서 우클릭해도 행 내부 선택을 유지합니다.
 * @param {EventTarget | null} target
 * @param {Array<{ name: string, family: string }>} [allFonts]
 * @param {{ fontFamily?: string, fontSize?: number }} [defaults]
 * @returns {EditorContext | null}
 */
export function captureEditorContext(target, allFonts = [], defaults = {}) {
  if (!(target instanceof Element)) return null;
  const editor =
    target.closest('input, textarea, [contenteditable="true"]')
    || target.closest('.todo-row')?.querySelector('.todo-text[contenteditable="true"]')
    || target.closest('.note-wrapper')?.querySelector('[contenteditable="true"]')
    || target.closest('.sticker-body')?.querySelector('[contenteditable="true"]');
  if (!(editor instanceof HTMLElement)) return null;

  const isInput = editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement;
  if (isInput) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    return {
      editor,
      range: null,
      start,
      end,
      hasSelection: start !== null && end !== null && start !== end,
      selectionFormat: null,
    };
  }

  const selection = window.getSelection();
  let range = null;
  if (selection?.rangeCount) {
    const candidate = selection.getRangeAt(0);
    // 선택 범위가 현재 편집기 경계 안에 온전히 들어 있을 때만 보관합니다.
    // 왜: 두 할 일을 가로질러 드래그된 Range에 extractContents()를 호출하면 .todo-row DOM 구조가 깨집니다.
    if (editor.contains(candidate.commonAncestorContainer)) {
      range = candidate.cloneRange();
    }
  }

  const hasSelection = Boolean(range && !range.collapsed && range.toString().length > 0);
  const selectionFormat = hasSelection && range
    ? readSelectionFormat(range, allFonts, defaults)
    : null;

  return {
    editor,
    range,
    start: null,
    end: null,
    hasSelection,
    selectionFormat,
  };
}

/** @param {EditorContext | null} context */
export function restoreEditorContext(context) {
  if (!context?.editor.isConnected) return false;
  const { editor, range, start, end } = context;
  editor.focus({ preventScroll: true });
  if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
    if (start !== null && end !== null) editor.setSelectionRange(start, end);
  } else {
    const selection = window.getSelection();
    const next = range && editor.contains(range.commonAncestorContainer) ? range.cloneRange() : document.createRange();
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      next.selectNodeContents(editor);
      next.collapse(false);
    }
    selection?.removeAllRanges();
    selection?.addRange(next);
  }
  return true;
}

/**
 * 독립 우클릭 창이 포커스를 가진 상태에서도 보관된 Range에 리치텍스트 서식을 실시간 적용합니다.
 * @param {EditorContext | null} context
 * @param {{ op: 'font' | 'size' | 'bold' | 'italic' | 'underline' | 'color' | 'bg', value?: unknown }} payload
 * @param {Array<{ name: string, family: string }>} [allFonts]
 * @param {{ maxPt?: number, defaults?: { fontFamily?: string, fontSize?: number } }} [options]
 * @returns {{ ok: boolean, selectionFormat: import('../editor/richTextFormat.js').SelectionFormat | null } | null}
 */
export function applyEditorContextFormat(context, payload, allFonts = [], options = {}) {
  if (!context || !context.editor?.isConnected || !context.range || context.range.collapsed) {
    return null;
  }
  if (!context.editor.contains(context.range.commonAncestorContainer)) {
    return null;
  }

  const maxPt = options.maxPt ?? STABLE_MAX_PT;
  const defaults = options.defaults ?? {};
  const { op, value } = payload;

  /** @type {Range | null} */
  let nextRange = null;

  if (op === 'font') {
    const name = String(value || '');
    const fontObj = allFonts.find((f) => f.name === name);
    if (!fontObj) return null;
    nextRange = applyInlineStyleToRange(context.range, { fontFamily: fontObj.family }, { editable: context.editor });
  } else if (op === 'size') {
    const pt = normalizeFontSizePt(value, maxPt);
    if (pt === null) return null;
    nextRange = applyInlineStyleToRange(
      context.range,
      { fontSize: `${pt}pt`, lineHeight: '1.5' },
      { editable: context.editor }
    );
  } else if (op === 'bold' || op === 'italic' || op === 'underline') {
    nextRange = toggleInlineFormatOnRange(context.range, op, allFonts, context.editor);
  } else if (op === 'color') {
    nextRange = applyInlineStyleToRange(
      context.range,
      { color: typeof value === 'string' ? value : '' },
      { editable: context.editor }
    );
  } else if (op === 'bg') {
    nextRange = applyInlineStyleToRange(
      context.range,
      { backgroundColor: typeof value === 'string' ? value : '' },
      { editable: context.editor }
    );
  } else {
    return null;
  }

  if (!nextRange) return null;

  // 연속 서식 적용을 위해 컨텍스트 Range와 문서 Selection 하이라이트를 함께 갱신합니다.
  context.range = nextRange.cloneRange();
  context.hasSelection = !nextRange.collapsed;
  try {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(nextRange.cloneRange());
  } catch {}

  const selectionFormat = readSelectionFormat(context.range, allFonts, defaults);
  context.selectionFormat = selectionFormat;
  return { ok: true, selectionFormat };
}

/** @param {EditorContext | null} context @param {string} action */
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
