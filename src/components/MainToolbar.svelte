<script>
  import {
    Eye, BellOff, Archive,
    AlignJustify,
    Bold,
    Italic,
    Underline,
    MousePointer2,
    Link,
    Bell,
    ChevronDown,
    Check,
    Type,
    MoreHorizontal
  } from "lucide-svelte";
  import { onMount } from "svelte";
  import HeaderActions from './HeaderActions.svelte';
  import '../lib/header.css';
  import { isTauri } from '@tauri-apps/api/core';
  let formatOpen = $state(true);
  function toggleFormat() {
    saveSelection();
    formatOpen = !formatOpen;
    activePopup = null;
    try { localStorage.setItem('tidy:header:format-open', String(formatOpen)); } catch {}
  }
  function toggleReminders() {
    const payload = appState.takeSnapshot();
    payload.globalFont = appState.fontFamily;
    payload.showReminders = !appState.showReminders;
    payload.targetWindow = appState.windowLabel;
    emit('req-apply-settings', payload);
  }
  onMount(() => {
    try { formatOpen = localStorage.getItem('tidy:header:format-open') !== 'false'; } catch {}
  });
  import MealIcon from './meal/MealIcon.svelte';
  import { toggleMeal } from '../lib/meal/mealWindows.js';
  import { listen } from '@tauri-apps/api/event';
  let mealOpen = $state(false);
  let mealError = $state('');
  onMount(() => {
    if (!isTauri()) return;
    let disposed = false;
    /** @type {undefined | (() => void)} */ let off;
    void WebviewWindow.getByLabel('meal').then(win => { if (!disposed) mealOpen = Boolean(win); }).catch(() => {});
    void listen('meal-window-state', event => mealOpen = Boolean(event.payload)).then(fn => { if(disposed) fn(); else off=fn; }).catch(() => {});
    return () => { disposed=true; off?.(); };
  });
  async function handleMeal() { try { await toggleMeal(); mealError=''; } catch { mealError='급식창을 전환하지 못했어요. 다시 눌러 주세요.'; } }
  import { appState } from "../lib/appState.svelte.js";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { emit } from "@tauri-apps/api/event";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import FontSizeInput from "./FontSizeInput.svelte";
  import { STABLE_MAX_PT } from "../lib/fontSize.js";
  import { PALETTE, SYM_PAGES } from "../lib/editorConstants.js";

  async function handleOpenArchive() {
    const existingArchive = await WebviewWindow.getByLabel('archive');
    if (existingArchive) {
      await existingArchive.show();
      await existingArchive.setFocus();
    } else {
      const win = new WebviewWindow('archive', {
        url: "index.html",
        title: "Tidy Task 아카이브",
        width: 450,
        height: 550,
        minWidth: 350,
        minHeight: 400,
        decorations: false,
        transparent: true,
        resizable: true,
        center: true
      });
    }
  }

// ── Palette Data (구글 문서 표준 60색) ──────────────────────────────────────
  // 60색 팔레트·특수기호 표는 editorConstants.js(세 툴바 공용)에서 가져옵니다.

// ── Selection-synced state ─────────────────────────────────────────────────
  let selFontFamily = $state(appState.fontFamily || "굴림");
  let selFontSize = $state(appState.fontSize || 10);
  let selLetterSp = $state(0);
  let selTextColor = $state('');
  let selBgColor = $state('');
  
  let isBold = $state(false);
  let isItalic = $state(false);
  let isUnderline = $state(false);
  let selAlign = $state('left');

  /** @type {null | 'symbols' | 'link' | 'more' | 'textColor' | 'bgColor'} */
  let activePopup = $state(null);
  let symPage = $state(0);
  
  let linkUrl = $state('https://');
  let linkText = $state('');

  // 링크 삭제 확인 모달
  let showDeleteLinkModal = $state(false);
  let pendingDeleteATag = $state(null);

  /** @type {Range | null} */
  let savedRange = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node instanceof Element ? node : node.parentElement;
      if (element?.closest('[contenteditable="true"]')) savedRange = range.cloneRange();
    }
  }

  function restoreSelectionToEditor(requireFocus = true) {
    if (!savedRange) return false;
    
    if (requireFocus) {
      const node = savedRange.commonAncestorContainer;
      const container = node instanceof Element ? node : node.parentElement;
      const editable = container?.closest('[contenteditable="true"]');
      if (editable && document.activeElement !== editable) {
        /** @type {HTMLElement} */ (editable).focus({ preventScroll: true }); // 화면 떨림 완벽 방어
      }
    }
    
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.cloneRange());
    return true;
  }

  function applyStyleDirect(styles = {}, requireFocus = true) {
    if (appState.isEditMode && appState.selectedTodoIds.length > 0) {
      appState.applyStyleToSelected('style', styles);
      return;
    }
    if (!restoreSelectionToEditor(requireFocus)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const fragment = range.extractContents();

    // ✨ [TCREI: Integrity] 내부 자식 요소의 동일 CSS 속성을 재귀적으로 제거합니다.
    // 왜: 서로 다른 서식(폰트 A, 폰트 B)이 섞인 텍스트를 드래그하여 일괄 변경할 때,
    //     바깥 span에 새 스타일을 넣어도 내부 span의 인라인 스타일이 CSS 우선순위에서 이겨
    //     실제 렌더링에 반영되지 않는 버그가 발생합니다.
    const cssPropsToClean = Object.keys(styles).map(
      k => k.replace(/([A-Z])/g, '-$1').toLowerCase()
    );
    function stripInnerStyles(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      cssPropsToClean.forEach(prop => /** @type {HTMLElement} */ (node).style.removeProperty(prop));
      // 스타일이 비어졌으면 style 어트리뷰트 자체를 제거 (DOM 정리)
      if (!node.getAttribute('style')?.trim()) node.removeAttribute('style');
      for (const child of node.childNodes) stripInnerStyles(child);
    }
    for (const child of fragment.childNodes) stripInnerStyles(child);

    let wrapper;
    if (fragment.childNodes.length === 1 && fragment.firstChild.nodeName === "SPAN") {
      wrapper = fragment.firstChild;
      Object.assign(wrapper.style, styles);
    } else {
      wrapper = document.createElement("span");
      Object.assign(wrapper.style, styles);
      wrapper.appendChild(fragment);
    }
    range.insertNode(wrapper);

    // ✨ 부모 노드들의 잉여 스타일 정리 및 블록 전파
    // 왜: 드래그 후 폰트를 작게 바꿀 때, 기존에 폰트를 키웠던 span 껍데기(큰 font-size 유지)가 남아
    //     빈 여백(줄 간격)을 비정상적으로 차지합니다. 
    //     새로 감싼 wrapper와 텍스트가 완전히 동일한 부모라면 껍데기에 불과하므로 중복 스타일을 제거합니다.
    let current = wrapper.parentElement;
    const editable = wrapper.closest('[contenteditable="true"]');
    while (current && current !== editable) {
      if (current.textContent.trim() === wrapper.textContent.trim()) {
        const isBlock = ['DIV', 'P', 'LI'].includes(current.tagName);
        if (isBlock) {
          if (styles.fontSize) current.style.fontSize = styles.fontSize;
          if (styles.lineHeight) current.style.lineHeight = styles.lineHeight;
        } else {
          Object.keys(styles).forEach(key => {
            current.style[key] = '';
          });
          if (!current.getAttribute('style')?.trim()) current.removeAttribute('style');
        }
      }
      current = current.parentElement;
    }

    const newRange = document.createRange();
    newRange.selectNode(wrapper);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedRange = newRange.cloneRange();
    wrapper.closest("[contenteditable]")?.dispatchEvent(new Event("input", { bubbles: true }));
    syncFromSelection();
  }

  function applyFormat(cmd, val = null) {
    if (appState.isEditMode && appState.selectedTodoIds.length > 0) {
      if (cmd === 'hiliteColor') appState.applyStyleToSelected('style', { backgroundColor: val });
      else if (cmd === 'foreColor') appState.applyStyleToSelected('style', { color: val });
      else appState.applyStyleToSelected('format', cmd);
      return;
    }
    restoreSelectionToEditor(true);
    document.execCommand(cmd, false, val);
    syncFromSelection();
  }

  function handleAlignCycle() {
    restoreSelectionToEditor(true);
    if (selAlign === 'left' || selAlign === 'start') applyFormat("justifyCenter");
    else if (selAlign === 'center') applyFormat("justifyRight");
    else applyFormat("justifyLeft");
  }

  // ✨ 하이퍼링크 서식 100% 보존 엔진 적용
  function insertLink() {
    if (!linkUrl) return;
    restoreSelectionToEditor(true); 
    
    let url = linkUrl;
    if (!url.match(/^https?:\/\//i)) url = 'http://' + url;
    
    let customText = linkText.trim();
    const originalText = savedRange ? savedRange.toString().trim() : "";
    const linkStyle = "color: #3b82f6; text-decoration: underline; cursor: pointer;";

    if (customText && customText !== originalText) {
      document.execCommand("insertHTML", false, `<a href="${url}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${customText}</a>`);
    } else {
      if (originalText === "") {
        document.execCommand("insertHTML", false, `<a href="${url}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${url}</a>`);
      } else {
        const fragment = savedRange?.cloneContents();
        if (!fragment) return;
        const div = document.createElement('div');
        div.appendChild(fragment);
        let innerHTML = div.innerHTML;
        innerHTML = innerHTML.replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1");

        document.execCommand("insertHTML", false, `<a href="${url}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${innerHTML}</a>`);
      }
    }
    
    activePopup = null;
    linkUrl = 'https://'; 
    linkText = '';
    syncFromSelection();
  }

  function insertSymbol(sym) {
    restoreSelectionToEditor(true);
    document.execCommand("insertText", false, sym);
    activePopup = null;
  }

  function syncFromSelection() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      let node = range.startContainer;
      // selectNode() anchors the range on its parent. Read the selected text's style,
      // otherwise a just-applied size/color is immediately replaced by the editor default.
      if (!range.collapsed && node instanceof Element) {
        node = node.childNodes[range.startOffset] || node;
        while (node.firstChild) node = node.firstChild;
      }
      if (node.nodeType === Node.ELEMENT_NODE && range.collapsed && range.startOffset > 0) {
        let prevNode = node.childNodes[range.startOffset - 1];
        while (prevNode && prevNode.lastChild) prevNode = prevNode.lastChild;
        node = prevNode || node;
      }
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      if (!(node instanceof Element) || !node.closest('[contenteditable="true"]')) return;
      const style = window.getComputedStyle(node);
      
      isBold = document.queryCommandState('bold') || style.fontWeight === '700' || style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 600;
      isItalic = document.queryCommandState('italic') || style.fontStyle === 'italic';
      isUnderline = document.queryCommandState('underline') || style.textDecorationLine?.includes('underline') || style.textDecoration?.includes('underline');
      
      selAlign = style.textAlign || 'left';
      if (document.queryCommandState('justifyCenter')) selAlign = 'center';
      else if (document.queryCommandState('justifyRight')) selAlign = 'right';

      let rawFont = style.fontFamily.replace(/["']/g, ""); 
      let cleanFont = rawFont.split(",")[0].trim();
      const matchedFont = appState.allFonts.find(f => {
        const baseFamily = f.family.split(',')[0].replace(/['"]/g, '').trim();
        return rawFont.toLowerCase().includes(baseFamily.toLowerCase()) || rawFont.toLowerCase().includes(f.name.toLowerCase());
      });
      selFontFamily = matchedFont ? matchedFont.name : cleanFont;

      const fs = style.fontSize;
      if (fs) {
        const ptSize = Math.round(parseFloat(fs) * 0.75);
        if (!isNaN(ptSize)) selFontSize = ptSize;
      }
      
      // ✨ 자간 혼합 상태 감지 로직
      let mixedLs = false;
      let uniformLs = null;
      if (!range.collapsed) {
        const treeWalker = document.createTreeWalker(
          range.commonAncestorContainer,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(n) {
              if (range.intersectsNode(n)) return NodeFilter.FILTER_ACCEPT;
              return NodeFilter.FILTER_REJECT;
            }
          }
        );
        let firstLs = undefined;
        let currentNode = treeWalker.nextNode();
        while(currentNode) {
          if (currentNode.textContent.trim().length > 0 && currentNode.parentElement) {
             const currentStyle = window.getComputedStyle(currentNode.parentElement);
             const currentLs = currentStyle.letterSpacing;
             const val = currentLs === "normal" ? 0 : parseFloat(currentLs) || 0;
             if (firstLs === undefined) {
               firstLs = val;
             } else if (firstLs !== val) {
               mixedLs = true;
               break;
             }
          }
          currentNode = treeWalker.nextNode();
        }
        if (!mixedLs && firstLs !== undefined) {
          uniformLs = firstLs;
        }
      }

      if (mixedLs) {
        selLetterSp = ""; // 혼합 상태
      } else {
        if (uniformLs !== null) {
          selLetterSp = uniformLs;
        } else {
          const ls = style.letterSpacing;
          selLetterSp = ls === "normal" ? 0 : parseFloat(ls) || 0;
        }
      }

      selTextColor = style.color;
      const bg = style.backgroundColor;
      selBgColor = (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') ? '' : bg;
    } catch (err) {}
  }

  // ✨ 상대적 자간 증감 일괄 적용
  function applyRelativeLetterSpacing(delta) {
    if (!savedRange) return;
    const sel = window.getSelection();
    
    if (savedRange.collapsed) {
      let currentVal = selLetterSp === "" ? 0 : parseFloat(selLetterSp) || 0;
      let newVal = currentVal + delta;
      selLetterSp = newVal;
      applyStyleDirect({ letterSpacing: `${newVal}px` }, false);
      return;
    }

    const treeWalker = document.createTreeWalker(
      savedRange.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          if (savedRange?.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_REJECT;
        }
      }
    );
    
    let textNodes = [];
    let currentNode = treeWalker.nextNode();
    while(currentNode) {
      if (currentNode.textContent.trim().length > 0) {
        textNodes.push(currentNode);
      }
      currentNode = treeWalker.nextNode();
    }

    for (let i = textNodes.length - 1; i >= 0; i--) {
      let node = textNodes[i];
      let currentStyle = window.getComputedStyle(node.parentElement);
      let currentLs = currentStyle.letterSpacing;
      let val = currentLs === "normal" ? 0 : parseFloat(currentLs) || 0;
      let newVal = val + delta;
      
      let rng = document.createRange();
      let startOffset = 0;
      let endOffset = node.length;
      if (node === savedRange.startContainer) startOffset = savedRange.startOffset;
      if (node === savedRange.endContainer) endOffset = savedRange.endOffset;
      
      if (startOffset === endOffset) continue;
      
      rng.setStart(node, startOffset);
      rng.setEnd(node, endOffset);
      
      sel.removeAllRanges();
      sel.addRange(rng);
      applyStyleDirect({ letterSpacing: `${newVal}px` }, false);
    }
    
    syncFromSelection();
  }

  $effect(() => {
    if (appState.fontFamily) selFontFamily = appState.fontFamily;
    if (appState.fontSize) selFontSize = appState.fontSize;
  });

  $effect(() => {
    if (appState.isEditMode && appState.selectedTodoIds.length > 0) {
      const lastId = appState.selectedTodoIds[appState.selectedTodoIds.length - 1]; 
      const allItems = [...appState.todos, ...appState.archivedTodos];
      const firstTodo = allItems.find(t => t.id === lastId);
      
      if (firstTodo && firstTodo.text) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(firstTodo.text, 'text/html');
        const target = doc.body.firstElementChild || doc.body;
        const style = /** @type {HTMLElement} */ (target).style;

        let rawFont = style.fontFamily.replace(/["']/g, "").split(",")[0].trim();
        const matchedFont = appState.allFonts.find(f => 
          f.name === rawFont || 
          (f.family && f.family.includes(rawFont))
        );
        selFontFamily = matchedFont ? matchedFont.name : rawFont;

        const fs = style.fontSize;
        if (fs) {
          const ptSize = Math.round(parseFloat(fs) * (fs.endsWith('pt') ? 1 : 0.75));
          if (!isNaN(ptSize)) selFontSize = ptSize;
        }

        const ls = style.letterSpacing;
        selLetterSp = ls === "normal" ? 0 : parseFloat(ls) || 0;
        
        selTextColor = style.color;
        const bg = style.backgroundColor;
        selBgColor = (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') ? '' : bg;
      }
    }
  });


  /** @type {HTMLElement | null} */ let popupTrigger = null;
  /** @param {HTMLElement} node */
  function editorControls(node) {
    /** @param {MouseEvent} event */
    function down(event) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('input, select, option')) return;
      saveSelection();
      event.preventDefault();
    }
    /** @param {Event} event */
    function remember(event) {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (button && !button.closest('.editor-popup')) popupTrigger = button;
    }
    node.addEventListener('mousedown', down);
    node.addEventListener('click', remember, true);
    return { destroy() { node.removeEventListener('mousedown', down); node.removeEventListener('click', remember, true); } };
  }
  /** @param {HTMLDivElement} node */
  function editorPopup(node) {
    // The top layer avoids clipping by the rounded, overflow-hidden native window shell.
    if (typeof node.showPopover === 'function') node.showPopover();
    document.dispatchEvent(new CustomEvent('tidy-header-popover', { detail: 'format' }));
    function position() {
      const anchor = popupTrigger?.isConnected ? popupTrigger.getBoundingClientRect() : document.querySelector('.note-tools')?.getBoundingClientRect();
      if (!anchor) return;
      node.style.maxHeight = (window.innerHeight - 16) + 'px';
      const height = Math.min(node.scrollHeight + 2, window.innerHeight - 16);
      node.style.top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - height - 8)) + 'px';
      node.style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - node.offsetWidth - 8)) + 'px';
    }
    const resize = new ResizeObserver(position); resize.observe(node);
    window.addEventListener('resize', position);
    /** @param {KeyboardEvent} event */
    function escape(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); activePopup = null; popupTrigger?.focus(); }
    }
    document.addEventListener('keydown', escape, true);
    position();
    return { destroy() { resize.disconnect(); window.removeEventListener('resize', position); document.removeEventListener('keydown', escape, true); } };
  }

  function handleGlobalMousedown(e) {
    if (!activePopup) return;
    if (!e.target.closest('.popup-safe-area')) {
      activePopup = null;
    }
  }

  let syncFrameId = null;
  $effect(() => {
    function handler() {
      if (syncFrameId) return;

      syncFrameId = requestAnimationFrame(() => {
        try {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;

          const anchorNode = sel.anchorNode;
          if (!anchorNode) return;
          
          const isInsideEditor = anchorNode.nodeType === Node.TEXT_NODE
            ? anchorNode.parentElement?.closest('[contenteditable="true"]')
            : (anchorNode.nodeType === Node.ELEMENT_NODE ? /** @type {HTMLElement} */ (anchorNode).closest('[contenteditable="true"]') : null);

          if (!isInsideEditor) return;
          syncFromSelection();
          saveSelection(); 
        } catch (e) {
        } finally {
          syncFrameId = null;
        }
      });
    }

    document.addEventListener("selectionchange", handler);
    document.addEventListener("keyup", handler);
    document.addEventListener("mouseup", handler);
    document.addEventListener("mousedown", handleGlobalMousedown);

    // ✨ 링크 클릭 → Tauri opener로 실제 브라우저 열기
    async function handleLinkClick(e) {
      const aTag = e.target.closest('a');
      if (aTag && aTag.closest('[contenteditable="true"]')) {
        e.preventDefault();
        e.stopPropagation();
        const href = aTag.getAttribute('href') || aTag.href;
        if (href) {
          try { await openUrl(href); } catch(_) {}
        }
      }
    }

    // ✨ 링크 삭제 가로채기 → 확인 모달 표시
    function handleLinkKeydown(e) {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // 커서(또는 선택 범위)가 링크 내부에 있는지 확인
      let node = range.startContainer;
      if (node.nodeType === 3) node = node.parentNode;
      const aTag = /** @type {Element} */ (node)?.closest('a');

      if (aTag && aTag.closest('[contenteditable="true"]')) {
        // 링크 바깥쪽 경계에서의 이동은 허용 (링크를 건드리지 않는 경우)
        if (range.collapsed) {
          const textNode = range.startContainer;
          const isFirstNode = textNode === aTag.firstChild || (aTag.childNodes.length === 0);
          const isLastNode  = textNode === aTag.lastChild  || (aTag.childNodes.length === 0);
          const atVeryStart = isFirstNode && range.startOffset === 0;
          const atVeryEnd   = isLastNode  && range.startOffset === (textNode.textContent?.length ?? 0);

          // 링크 완전 바깥에서 진입하는 경우만 통과 허용
          if (atVeryStart && e.key === 'Backspace') return; // 링크 바로 앞 → 허용
          if (atVeryEnd   && e.key === 'Delete')    return; // 링크 바로 뒤 → 허용
        }

        // 그 외 모든 경우(링크 내부 텍스트 삭제 시도) → 모달 표시
        e.preventDefault();
        pendingDeleteATag = aTag;
        showDeleteLinkModal = true;
      }
    }

    /** @param {Event} event */
    function closeForHeader(event) { if (/** @type {CustomEvent} */ (event).detail !== 'format') activePopup = null; }
    document.addEventListener('tidy-header-popover', closeForHeader);
    function handleOpenSymbol() {
      activePopup = 'symbols';
      symPage = 0;
    }
    window.addEventListener('open-symbol-popup', handleOpenSymbol);
    document.addEventListener('click', handleLinkClick, true);
    document.addEventListener('keydown', handleLinkKeydown, true);
    
    return () => {
      if (syncFrameId) {
        cancelAnimationFrame(syncFrameId);
        syncFrameId = null;
      }
      document.removeEventListener("selectionchange", handler);
      document.removeEventListener("keyup", handler);
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("mousedown", handleGlobalMousedown);
      document.removeEventListener('tidy-header-popover', closeForHeader);
      window.removeEventListener('open-symbol-popup', handleOpenSymbol);
      document.removeEventListener('click', handleLinkClick, true);
      document.removeEventListener('keydown', handleLinkKeydown, true);
    };
  });

  // ✨ 링크 삭제 확인 → 실제 제거
  function confirmDeleteLink() {
    if (!pendingDeleteATag) { showDeleteLinkModal = false; return; }
    const aTag = pendingDeleteATag;
    const parent = aTag.parentNode;
    if (parent) {
      while (aTag.firstChild) parent.insertBefore(aTag.firstChild, aTag);
      parent.removeChild(aTag);
      aTag.closest('[contenteditable]')?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    pendingDeleteATag = null;
    showDeleteLinkModal = false;
  }

  function cancelDeleteLink() {
    pendingDeleteATag = null;
    showDeleteLinkModal = false;
  }

  
</script>

<div class="tidy-header-surface main-header relative w-full" class:header-dark={appState.isDarkMode} class:classic={appState.headerDesign !== 'modern'} style="z-index: 50; --header-accent: {appState.getThemeAccentColor()};">

  {#if showDeleteLinkModal}
    <div
      class="absolute inset-0 z-[200000] flex items-center justify-center"
      style="background: rgba(0,0,0,0.28); backdrop-filter: blur(4px);"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="rounded-2xl shadow-2xl border flex flex-col items-center gap-3 px-5 py-4 mx-3 max-w-[200px] w-full"
        style="background: {appState.isDarkMode ? '#1e2028' : '#fffbf0'}; border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(245,158,11,0.25)'};"
      >
        <span style="font-size: 1.6em; line-height:1;">🔗</span>
        <p class="text-center font-bold text-[11px] leading-snug" style="color: {appState.isDarkMode ? '#e2e8f0' : '#374151'};">
          링크를 지우겠습니까?
        </p>
        <div class="flex gap-2 w-full">
          <button
            onclick={cancelDeleteLink}
            class="flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-95"
            style="background: {appState.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}; color: {appState.isDarkMode ? '#d1d5db' : '#6b7280'};"
          >아니오</button>
          <button
            onclick={confirmDeleteLink}
            class="flex-1 py-1.5 rounded-xl text-[10px] font-bold text-white bg-red-400 hover:bg-red-500 active:scale-95 transition-all"
          >예</button>
        </div>
      </div>
    </div>
  {/if}

  {#if appState.headerDesign !== 'modern'}
  <div class="main-toolbar-row grid items-center px-2.5 py-1 border-b w-full" style="border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};">
    
    <div class="main-toolbar-left flex items-center gap-1.5 justify-start min-w-0 pr-2">
      <button
        onclick={() => appState.toggleEditMode()}
        onmousedown={(e) => e.preventDefault()}
        class="flex items-center justify-center w-[24px] h-[22px] rounded-md border transition-all shrink-0 hover:scale-105 active:scale-95"
        style="background-color: {appState.isEditMode ? appState.getThemeAccentColor() : (appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)')}; border-color: {appState.isEditMode ? appState.getThemeAccentColor() : (appState.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')};"
        title={appState.isEditMode ? "편집 모드 종료" : "다중 선택 편집 모드"}
      >
        <MousePointer2 size={11} class="transition-colors" style="color: {appState.isEditMode ? '#ffffff' : '#9ca3af'};" />
      </button>

      <button
        onclick={() => {
          const payload = appState.takeSnapshot();
          payload.globalFont = appState.fontFamily; // ✨ Prevent font reset
          payload.showReminders = !appState.showReminders;
          // 대상 창을 반드시 밝힙니다.
          // 왜: targetWindow가 없으면 모든 창이 "나에게 온 설정"으로 받아들여
          //     이 창의 테마·글꼴이 다른 창 전체(Tiny Note 포함)에 덮어써졌습니다.
          //     다른 창들은 리마인더 켜기/끄기(매니저 전용 분기)만 반영합니다.
          payload.targetWindow = appState.windowLabel;
          emit('req-apply-settings', payload);
        }}
        onmousedown={(e) => e.preventDefault()}
        class="flex items-center justify-center w-[24px] h-[22px] rounded-md border transition-all shrink-0 hover:scale-105 active:scale-95"
        style="background-color: {appState.showReminders ? appState.getThemeAccentColor() : (appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)')}; border-color: {appState.showReminders ? appState.getThemeAccentColor() : (appState.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')};"
        title="리마인더"
      >
        {#if appState.showReminders}
          <Bell size={11} class="transition-colors" style="color: #ffffff;" />
        {:else}
          <BellOff size={11} class="transition-colors" style="color: #9ca3af;" />
        {/if}
      </button>

      <button
        onclick={() => handleOpenArchive()}
        onmousedown={(e) => e.preventDefault()}
        class="flex items-center justify-center w-[24px] h-[22px] rounded-md border transition-all shrink-0 hover:scale-105 active:scale-95"
        style="background-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)'}; border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};"
        title="아카이브 열기"
      >
        <Archive size={11} class="transition-colors" style="color: {appState.isDarkMode ? '#d1d5db' : '#6b7280'};" />
      </button>
    </div>

    <div class="flex items-center justify-center w-full min-w-0">
      <input
        type="text"
        bind:value={appState.title}
        onblur={() => appState.save()}
        placeholder="제목 쓰기"
        maxlength="15"
        class="w-full bg-transparent outline-none text-[11px] font-bold text-center border-b border-transparent focus:border-amber-400 transition-all py-0.5 truncate"
        style="color: {appState.isDarkMode ? '#d1d5db' : '#374151'};"
      />
    </div>

    <div class="meal-toolbar-actions flex items-center justify-end gap-1.5 min-w-0 pl-1">
      <span class="opacity-eye"><Eye size={10} class="text-gray-400 shrink-0" /></span>
      <input
        type="range" min="0.2" max="1.0" step="0.05"
        bind:value={appState.opacity}
        aria-label="창 불투명도"
        class="opacity-slider w-[44px] h-1.5 appearance-none rounded-full bg-black/15 cursor-pointer custom-slider"
      />
      <button onclick={handleMeal} onmousedown={(e) => e.preventDefault()} aria-label={mealOpen ? '급식창 닫기' : '급식창 열기'} aria-pressed={mealOpen} title={mealError || (mealOpen ? '급식창 닫기' : '급식창 열기')} class="flex items-center justify-center w-[24px] h-[22px] rounded-md border shrink-0 transition-all hover:scale-105 active:scale-95" style="background: {mealOpen ? appState.getThemeAccentColor() : (appState.isDarkMode ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.6)')}; color: {mealOpen ? '#fff' : appState.getThemeAccentColor()}; border-color: {appState.isDarkMode ? '#ffffff22' : '#00000022'};"><MealIcon size={14}/></button>
    </div>
  </div>

  {:else}
  <div class="note-heading">
    <input class="note-title" type="text" bind:value={appState.title} onblur={() => appState.save()} placeholder="제목 쓰기" aria-label="노트 제목" maxlength="15" />
    <HeaderActions kind="create" />
  </div>
  <div class="note-tools" aria-label="노트 도구" role="group">
    <button class="tidy-header-button" aria-expanded={formatOpen} aria-controls="main-format-tools" onmousedown={(e) => { e.preventDefault(); saveSelection(); }} onclick={toggleFormat}><Type size={14}/><span>서식</span><ChevronDown size={10} class={formatOpen ? 'rotate-180' : ''}/></button>
    <button class="tidy-header-button reminder-button" aria-pressed={appState.showReminders} title={appState.showReminders ? '알림 표시 끄기' : '알림 표시 켜기'} onclick={toggleReminders}><Bell size={14}/><span>알림</span><span class="tool-status" aria-hidden="true">{#if appState.showReminders}<Check size={9}/>{/if}</span></button>
    <button class="tidy-header-button meal-button" onclick={handleMeal} aria-label={mealOpen ? '급식창 닫기' : '급식창 열기'} aria-pressed={mealOpen} title={mealOpen ? '급식창 닫기' : '급식창 열기'}><MealIcon size={15}/><span>급식</span></button>
    <HeaderActions kind="tools" onArchive={handleOpenArchive}/>
  </div>
  {/if}
  {#if appState.isEditMode}<div class="selection-status"><MousePointer2 size={13}/><span>여러 항목 선택 중</span><button class="tidy-header-button" onclick={() => appState.toggleEditMode()}>완료</button></div>{/if}
  {#if mealError}<p class="meal-error" role="alert">{mealError}</p>{/if}

  {#if formatOpen || appState.headerDesign !== 'modern'}
  <div id="main-format-tools" class="format-tools" role="group" aria-label="글자 서식"
       style="border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};" use:editorControls>
    <div class="format-fields">
    <select
      value={selFontFamily}
      onmousedown={() => { saveSelection(); }}
      onchange={(e) => {
        selFontFamily = e.currentTarget.value;
        const fontObj = appState.allFonts.find(f => f.name === selFontFamily);
        if (fontObj) applyStyleDirect({ fontFamily: fontObj.family });
      }}
      class="text-[10px] bg-white/60 border border-black/10 rounded-md px-0.5 h-5 outline-none cursor-pointer hover:border-amber-400 transition-colors w-[72px] truncate shrink-0"
      title="글꼴" aria-label="글꼴"
    >
      {#each appState.allFonts as font}
        <option value={font.name} style="font-family: {font.family.replace(/"/g, "'")}">{font.name}</option>
      {/each}
    </select>

    <!-- 글자 크기 (직접 입력 + 프리셋, 안정 표출 위해 최대 40pt로 캡) — 옆 글꼴 박스와 외형 통일 -->
    <FontSizeInput
      value={selFontSize}
      max={STABLE_MAX_PT}
      dark={appState.isDarkMode}
      boxClass="header-font-size rounded-md"
      onBeforeInteract={saveSelection}
      onApply={(pt) => { selFontSize = pt; applyStyleDirect({ fontSize: `${pt}pt`, lineHeight: '1.5' }); }}
    />

    </div>
    <div class="format-buttons">

    <button
      onclick={(e) => { e.preventDefault(); applyFormat("bold"); }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isBold ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:text-black hover:bg-black/5'}"
      title="굵게" aria-label="굵게" aria-pressed={isBold}
    >
      <Bold size={13} strokeWidth={isBold ? 3.5 : 2.5} />
    </button>
    
    <button
      onclick={(e) => { e.preventDefault(); applyFormat("italic"); }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isItalic ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:text-black hover:bg-black/5'}"
      title="기울임" aria-label="기울임" aria-pressed={isItalic}
    >
      <Italic size={13} strokeWidth={isItalic ? 3.5 : 2.5} />
    </button>

    <button
      onclick={(e) => { e.preventDefault(); applyFormat("underline"); }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isUnderline ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:text-black hover:bg-black/5'}"
      title="밑줄" aria-label="밑줄" aria-pressed={isUnderline}
    >
      <Underline size={13} strokeWidth={isUnderline ? 3.5 : 2.5} />
    </button>

    <button
      onclick={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'textColor' ? null : 'textColor'; }}
      class="relative w-6 h-6 rounded-md hover:bg-amber-100 transition-colors flex items-center justify-center shrink-0 mx-0.5 popup-safe-area"
      title="글자 색상"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600" style="margin-top: -2px;">
        <path d="m6 15 6-11 6 11" /><path d="M9 11h6" />
      </svg>
      <div class="absolute bottom-1 left-1 right-1 h-[4.5px] rounded-full" style="background-color: {selTextColor || (appState.isDarkMode ? '#e2e8f0' : '#374151')};"></div>
    </button>

    <button
      onclick={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'bgColor' ? null : 'bgColor'; }}
      class="relative w-6 h-6 rounded-md hover:bg-amber-100 transition-colors flex items-center justify-center shrink-0 mx-0.5 popup-safe-area"
      title="형광펜"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600" style="margin-top: -2px;">
        <path d="m9 11 6-6 3 3-6 6z" /><path d="m5 15 4 4" /><path d="m21 21-2-2" />
      </svg>
      <div class="absolute bottom-1 left-1 right-1 h-[4.5px] rounded-full" style="background-color: {selBgColor || '#e5e7eb'};"></div>
    </button>



    <button
      onclick={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'more' ? null : 'more'; }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {activePopup === 'more' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-black hover:bg-black/5'} popup-safe-area"
      title="더보기"
    >
      <MoreHorizontal size={14} strokeWidth={2.5} />
    </button>
    </div>
  </div>

  {/if}

  {#if activePopup}
    <div
      role="dialog" aria-label="서식 옵션" popover="manual" use:editorPopup use:editorControls
      tabindex="-1"
      class="editor-popup popup-safe-area"


    >
      {#if activePopup === 'symbols'}
        <div class="flex items-center gap-1.5 border-b border-black/5 px-2 py-1.5 bg-black/5 w-[320px]">
          {#each SYM_PAGES as _, i}
            <button
              onclick={(e) => { e.preventDefault(); symPage = i; }}
              class="w-4 h-4 flex items-center justify-center rounded-sm text-[9px] font-bold transition-all {symPage === i ? 'bg-amber-400 text-white shadow-sm' : 'bg-white/50 text-gray-400 hover:text-gray-600'}"
            >
              {i + 1}
            </button>
          {/each}
          <div class="flex-1"></div>
          <span class="text-[9px] font-bold text-amber-600 pr-1">{SYM_PAGES[symPage].label}</span>
        </div>
        <div class="symbol-grid">
          {#each SYM_PAGES[symPage].syms as sym}
            <button
              onclick={(e) => { e.preventDefault(); insertSymbol(sym); }}
              class="w-6 h-6 flex items-center justify-center text-[12px] rounded-lg hover:bg-amber-100 hover:text-amber-700 active:scale-90 cursor-pointer transition-all"
              title={sym}
            >
              {sym}
            </button>
          {/each}
        </div>

      {:else if activePopup === 'link'}
        <div class="p-2 w-[220px] flex flex-col gap-1.5">
          <input type="text" bind:value={linkUrl} onkeydown={(e) => { if(e.key === 'Enter') { e.preventDefault(); insertLink(); } }} placeholder="https:// URL 입력" class="w-full text-[10px] px-2 py-1.5 border border-black/10 rounded outline-none focus:border-amber-400" />
          <input type="text" bind:value={linkText} onkeydown={(e) => { if(e.key === 'Enter') { e.preventDefault(); insertLink(); } }} placeholder="표시할 텍스트 (선택사항)" class="w-full text-[10px] px-2 py-1.5 border border-black/10 rounded outline-none focus:border-amber-400" />
          <div class="flex gap-1 mt-0.5">
            <button onclick={(e) => { e.preventDefault(); activePopup = null; }} class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-1.5 rounded text-[10px] transition-colors">취소</button>
            <button onclick={(e) => { e.preventDefault(); insertLink(); }} class="popup-primary flex-1 bg-amber-400 hover:bg-amber-500 text-white font-bold py-1.5 rounded text-[10px] transition-colors">적용</button>
          </div>
        </div>

      {:else if activePopup === 'more'}
        <div class="p-2 w-[220px] flex flex-col gap-2">
          <!-- 자간 -->
          <div class="flex items-center justify-between gap-2 px-1 py-1">
            <span class="text-[10px] font-bold text-gray-600 shrink-0">자간 조절</span>
            <div class="flex items-center gap-1">
              <button 
                onclick={(e) => {
                  e.preventDefault();
                  saveSelection();
                  if (selLetterSp === "") {
                    applyRelativeLetterSpacing(-0.5);
                  } else {
                    let newVal = selLetterSp - 0.5;
                    selLetterSp = newVal;
                    applyStyleDirect({ letterSpacing: `${newVal}px` }, false);
                  }
                }}
                class="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold active:scale-90 transition-all"
              >-</button>
              <input
                type="text"
                value={selLetterSp === "" ? "" : selLetterSp}
                placeholder="-"
                onmousedown={() => { saveSelection(); }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    let parsed = parseFloat(e.currentTarget.value);
                    if (!isNaN(parsed)) {
                      selLetterSp = parsed;
                      applyStyleDirect({ letterSpacing: `${parsed}px` }, false);
                    }
                  }
                }}
                onblur={(e) => {
                  let parsed = parseFloat(e.currentTarget.value);
                  if (!isNaN(parsed)) {
                    selLetterSp = parsed;
                    applyStyleDirect({ letterSpacing: `${parsed}px` }, false);
                  }
                }}
                class="w-8 h-5 text-center text-[10px] border border-gray-200 rounded outline-none focus:border-amber-400 hide-spinners bg-transparent"
                style="color: {appState.isDarkMode ? '#e2e8f0' : '#1f2937'};"
              />
              <button 
                onclick={(e) => {
                  e.preventDefault();
                  saveSelection();
                  if (selLetterSp === "") {
                    applyRelativeLetterSpacing(0.5);
                  } else {
                    let newVal = selLetterSp + 0.5;
                    selLetterSp = newVal;
                    applyStyleDirect({ letterSpacing: `${newVal}px` }, false);
                  }
                }}
                class="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold active:scale-90 transition-all"
              >+</button>
            </div>
          </div>
          <div class="h-px bg-black/5 my-0.5"></div>
          <!-- 정렬, 특수기호, 링크 버튼 -->
          <div class="flex items-center gap-1">
            <button
              onclick={(e) => { e.preventDefault(); saveSelection(); handleAlignCycle(); }}
              class="flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-md transition-all {selAlign !== 'left' && selAlign !== 'start' ? 'text-amber-600 bg-amber-50' : 'text-gray-600 hover:text-black hover:bg-black/5'}"
            >
              <AlignJustify size={14} strokeWidth={2.5} />
              <span class="text-[8px] font-bold">정렬</span>
            </button>
            <button
              aria-label="기호" onclick={(e) => { e.preventDefault(); saveSelection(); activePopup = 'symbols'; symPage = 0; }}
              class="flex-1 py-1.5 flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-black hover:bg-black/5 rounded-md transition-all font-bold popup-safe-area"
            >
              <span style="font-size: 14px; line-height: 1;">Ω</span>
              <span class="text-[8px] font-bold">기호</span>
            </button>
            <button
              onclick={(e) => {
                e.preventDefault(); 
                saveSelection(); 
                activePopup = 'link'; 
                const sel = window.getSelection();
                linkText = sel.toString().trim();
              }}
              class="flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-md transition-all text-gray-600 hover:text-black hover:bg-black/5 popup-safe-area"
            >
              <Link size={14} strokeWidth={2.5} />
              <span class="text-[8px] font-bold">링크</span>
            </button>
          </div>
        </div>

      {:else if activePopup === 'textColor' || activePopup === 'bgColor'}
        <div class="p-2 w-[180px]">
          {#if activePopup === 'bgColor'}
            <button
              onclick={(e) => {
                e.preventDefault();
                applyFormat('hiliteColor', 'transparent');
                activePopup = null;
              }}
              class="w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 text-[10px] font-bold text-gray-600 bg-black/5 hover:bg-amber-100 rounded-md border border-black/5 transition-colors"
            >
              🚫 색상 없음 (투명)
            </button>
          {/if}
          <div class="color-grid">
            {#each PALETTE as color}
              <button
                onclick={(e) => {
                  e.preventDefault();
                  if (activePopup === 'textColor') applyStyleDirect({ color: color }, true);
                  if (activePopup === 'bgColor') applyFormat('hiliteColor', color);
                  activePopup = null;
                }}
                class="w-3.5 h-3.5 rounded-[2px] border border-black/10 hover:scale-[1.3] hover:shadow-md hover:border-black/30 hover:z-10 transition-all cursor-pointer"
                style="background-color: {color};"
                title={color}
              ></button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .main-toolbar-row { grid-template-columns:minmax(0,1fr) clamp(60px,calc(100% - 184px),140px) minmax(0,1fr); }
  .classic .format-tools { padding:2px 8px; gap:3px; background:transparent; }
  .classic .format-fields > select { height:22px; }
  .classic .format-tools :global(.header-font-size) { height:22px; }


  input[type=range].custom-slider { appearance:none; outline:none; }
  input[type=range].custom-slider::-webkit-slider-thumb { appearance:none; width:10px; height:10px; border-radius:50%; background:var(--header-accent); cursor:pointer; }
  @media(max-width:350px) { .opacity-eye { display:none; } }
  @media(max-width:290px) { .opacity-slider { display:none; } }

  .editor-popup { display:block; position:fixed; inset:auto; margin:0; border:1px solid var(--header-line); border-radius:12px; background:var(--header-panel); color:var(--header-ink); box-shadow:0 12px 32px #14203328; overflow:auto; max-width:calc(100vw - 16px); z-index:200000; }
  .editor-popup > div { max-width:100%; }
  .editor-popup :global(button), .editor-popup :global(input), .editor-popup :global(span) { color:var(--header-ink); }
  .editor-popup :global(button) { min-height:28px; font-size:12px; }
  .editor-popup :global(span) { font-size:12px; }
  .editor-popup :global(input) { background:var(--header-field); min-height:28px; font-size:12px; }
  .editor-popup .popup-primary { background:var(--header-ink); color:var(--header-panel); }
  .symbol-grid { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:3px; padding:8px; }
  .color-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:5px; }
  .color-grid > button { width:22px; height:22px; min-height:22px; }
  .main-header { flex-shrink:0; border-bottom:1px solid var(--header-line); }
  .note-heading { display:flex; align-items:center; gap:8px; padding:3px 10px 3px; }
  .note-title { flex:1; min-width:0; width:0; border:1px solid transparent; border-radius:5px; padding:3px 0; background:transparent; color:var(--header-ink); font-family:inherit; font-size:14px; font-weight:600; letter-spacing:-.2px; text-overflow:ellipsis; }
  .note-title::placeholder { color:var(--header-muted); opacity:1; font-weight:400; }
  .note-title:hover { border-bottom-color:var(--header-line); }
  .note-title:focus { background:var(--header-field); }
  .note-tools { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; padding:1px 10px 5px; }
  .note-tools :global(.tidy-header-button) { width:auto; justify-self:center; padding:3px 5px; gap:4px; font-size:11px; font-weight:500; border-radius:5px; border-color:transparent; background:transparent; }
  .note-tools :global(.tidy-header-button[aria-expanded="true"]), .note-tools :global(.tidy-header-button[aria-pressed="true"]) { background:color-mix(in srgb,var(--header-accent) 6%,transparent); border-color:transparent; }
  .note-tools :global(.tidy-header-button:hover) { background:var(--header-hover); border-color:transparent; }
  .note-tools > .tidy-header-button:first-child { justify-self:start; }
  .note-tools :global(.tidy-header-button > svg) { flex-shrink:0; }
  .tool-status { width:9px; }
  .reminder-button[aria-pressed="true"] :global(svg) { color:var(--header-accent); }
  .selection-status { display:flex; align-items:center; gap:6px; padding:4px 12px; background:var(--header-tint); font-size:12px; }
  .selection-status button { margin-left:auto; min-height:28px; }
  .meal-button :global(svg) { color:var(--header-accent); }
  .meal-error { font-size:12px; padding:6px 12px; color:var(--header-ink); }
  /* Both groups shrink together; no wrap or clipped controls at the minimum window width. */
  .format-tools { display:flex; flex-wrap:nowrap; align-items:center; gap:clamp(2px,1vw,5px); padding:4px 10px; border-top:1px solid var(--header-line); background:color-mix(in srgb,var(--header-hover) 30%,transparent); }
  .format-fields, .format-buttons { display:flex; align-items:center; min-width:0; }
  .format-fields { gap:3px; flex:0 1 130px; }
  .format-buttons { flex:0 1 149px; gap:1px; margin-left:auto; }
  .format-buttons > button { flex:1 1 0; min-width:0; margin:0; width:0; height:25px; border-radius:6px; color:var(--header-ink); }
  .format-fields > select { flex:1 1 64px; min-width:0; width:0; height:23px; font-size:clamp(9px,3.65vw,11px); color:var(--header-ink); background:var(--header-field); border-color:var(--header-line); border-radius:7px; }
  .format-fields > :global(div) { flex:0 1 61px; min-width:0; }
  .format-tools :global(input) { min-width:0; width:clamp(15px,8vw,26px); font-size:clamp(9px,3.65vw,11px); flex:1 1 auto; }
  .format-tools :global(.header-font-size) { height:23px; padding-inline:clamp(1px,1vw,4px); gap:1px; border:1px solid var(--header-line); border-radius:7px; background:var(--header-field); color:var(--header-ink); }
  .format-tools :global(.header-font-size > span) { font-size:clamp(7px,3vw,9px); }
  .format-tools :global(.header-font-size > button) { width:clamp(9px,4vw,14px); }
  .format-buttons > button :global(svg) { width:clamp(10px,4.3vw,14px); height:clamp(10px,4.3vw,14px); color:inherit; }
  .format-buttons > button > div { left:3px; right:3px; height:3px; bottom:3px; }
  .format-buttons > button:hover { background:var(--header-tint); }
  .format-buttons > button[aria-pressed="true"] { background:var(--header-tint); outline:1px solid var(--header-accent); }
  @media(max-width:279px) {
    .note-heading { padding-inline:8px; gap:6px; }
    .note-title { font-size:14px; }
    .note-tools { padding-inline:8px; gap:2px; }
    .note-tools :global(.tidy-header-button) { font-size:11px; gap:3px; padding-inline:2px; }
    .format-tools { padding-inline:8px; }
    .tool-status { display:none; }
  }

  @media(max-width:229px) { .note-tools { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
