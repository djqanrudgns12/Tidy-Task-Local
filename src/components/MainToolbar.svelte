<script>
  import {
    AlignJustify,
    Bold,
    Italic,
    Underline,
    Eye,
    MousePointer2,
    Link,
    Bell,
    BellOff,
    Archive,
    MoreHorizontal
  } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";
  import { appState } from "../lib/appState.svelte.js";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { emit } from "@tauri-apps/api/event";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import FontSizeInput from "./FontSizeInput.svelte";
  import { STABLE_MAX_PT } from "../lib/fontSize.js";

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
  const PALETTE = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
    "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
    "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc",
    "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0",
    "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79",
    "#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"
  ];

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

  let activePopup = $state(null);
  let symPage = $state(0);
  
  let linkUrl = $state('https://');
  let linkText = $state('');

  // 링크 삭제 확인 모달
  let showDeleteLinkModal = $state(false);
  let pendingDeleteATag = $state(null);

  let savedRange = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelectionToEditor(requireFocus = true) {
    if (!savedRange) return false;
    
    if (requireFocus) {
      let container = savedRange.commonAncestorContainer;
      if (container.nodeType === 3) container = container.parentNode;
      const editable = container.closest('[contenteditable="true"]');
      if (editable && document.activeElement !== editable) {
        editable.focus({ preventScroll: true }); // 화면 떨림 완벽 방어
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
        const fragment = savedRange.cloneContents();
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
          if (savedRange.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
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

  const SYM_PAGES = [
    { label: "말머리", syms: ["•", "◦", "▸", "▹", "▶", "►", "▷", "▪", "▫", "▬", "◼", "◻", "◾", "◽", "◉", "◎", "☑", "☐", "☒", "✔", "✘", "✖", "✚", "✦", "✧", "✩", "★", "☆", "✱", "※"] },
    { label: "문장부호", syms: ["。", "、", "，", "．", "·", ":", ";", "!", "?", "…", "‥", "—", "–", "‐", "〜", "~", "|", "‖", "¦", "/", "§", "¶", "†", "‡", "′", "″", "‴", "‰", "‱", "©"] },
    { label: "따옴표/괄호", syms: ["'", "'", "‚", "\u201C", "\u201D", "„", "«", "»", "‹", "›", "〈", "〉", "《", "》", "【", "】", "〔", "〕", "〖", "〗", "「", "」", "『", "』", "（", "）", "〘", "〙", "⟨", "⟩"] },
    { label: "수학", syms: ["+", "−", "×", "÷", "±", "∓", "=", "≠", "≈", "≡", "<", ">", "≤", "≥", "≪", "≫", "∑", "∏", "√", "∛", "∞", "∂", "∫", "∮", "∇", "∆", "∈", "∉", "∅", "⊂"] },
    { label: "화살표", syms: ["→", "←", "↑", "↓", "↔", "↕", "↗", "↘", "↙", "↖", "⇒", "⇐", "⇑", "⇓", "⇔", "⇕", "⇗", "⇘", "⇙", "⇖", "➜", "➡", "⬅", "⬆", "⬇", "↩", "↪", "↺", "↻", "⟳"] },
    { label: "통화/단위", syms: ["₩", "$", "€", "£", "¥", "₿", "¢", "₽", "₹", "₺", "₱", "₴", "₮", "₫", "₦", "฿", "₡", "₲", "₵", "֏", "°", "℃", "℉", "®", "™", "℠", "℗", "μ", "Ω", "‰"] },
    { label: "그리스/라틴", syms: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω", "Γ", "Δ", "Λ", "Σ", "Φ", "Ψ", "Ω", "∞"] },
    { label: "도형/장식", syms: ["■", "□", "▲", "△", "▼", "▽", "◆", "◇", "●", "○", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"] },
    { label: "이모지", syms: ["😊", "😂", "🥰", "😎", "🤔", "😅", "😢", "😤", "🥳", "👻", "❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "🖤", "💔", "💯", "👍", "👎", "👏", "🙏", "💪", "✌️", "🤞", "🫶", "👑", "🎉"] },
    { label: "특수기호", syms: ["☎", "✉", "✆", "⌨", "⌘", "⌥", "⌫", "⌦", "⏎", "⎋", "🔥", "💡", "⭐", "🌟", "💫", "✨", "🎯", "🏆", "🔔", "🔕", "🔒", "🔓", "🔑", "🗝️", "📌", "📍", "🏷️", "🔖", "📎", "📝"] }
  ];
</script>

<div class="relative w-full" style="z-index: 50; --slider-thumb-color: {appState.getThemeAccentColor()};">

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

  <div class="flex items-center justify-between px-2.5 py-1 border-b w-full" style="border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};">
    
    <div class="flex items-center gap-1.5 justify-start flex-1 min-w-0 pr-2">
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

    <div class="flex items-center justify-center shrink-0 w-[140px]">
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

    <div class="flex items-center justify-end gap-1.5 flex-1 min-w-0 pl-2" title="창 불투명도">
      <Eye size={10} class="text-gray-400 shrink-0" />
      <input
        type="range" min="0.2" max="1.0" step="0.05"
        bind:value={appState.opacity}
        class="w-[60px] h-1.5 appearance-none rounded-full bg-black/15 cursor-pointer custom-slider"
      />
    </div>
  </div>

  <div class="flex items-center gap-0.5 px-2 py-0.5 border-b w-full overflow-x-auto" 
       style="border-color: {appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};"
       onmousedown={(e) => {
         if (!["INPUT", "SELECT", "OPTION"].includes(e.target.tagName) && !e.target.closest('.popup-safe-area')) {
           e.preventDefault();
         }
       }}>
    <select
      value={selFontFamily}
      onmousedown={() => { saveSelection(); }}
      onchange={(e) => {
        selFontFamily = e.currentTarget.value;
        const fontObj = appState.allFonts.find(f => f.name === selFontFamily);
        if (fontObj) applyStyleDirect({ fontFamily: fontObj.family });
      }}
      class="text-[10px] bg-white/60 border border-black/10 rounded-md px-0.5 h-5 outline-none cursor-pointer hover:border-amber-400 transition-colors w-[72px] truncate shrink-0"
      title="글꼴"
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
      boxClass="bg-white/60 border border-black/10 rounded-md h-5 text-gray-700 hover:border-amber-400 transition-colors"
      onBeforeInteract={saveSelection}
      onApply={(pt) => { selFontSize = pt; applyStyleDirect({ fontSize: `${pt}pt`, lineHeight: '1.5' }); }}
    />

    <div class="w-px h-3 bg-black/10 mx-0.5 shrink-0"></div>

    <button
      onmousedown={(e) => { e.preventDefault(); applyFormat("bold"); }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isBold ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:text-black hover:bg-black/5'}"
      title="굵게"
    >
      <Bold size={13} strokeWidth={isBold ? 3.5 : 2.5} />
    </button>
    
    <button
      onmousedown={(e) => { e.preventDefault(); applyFormat("italic"); }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isItalic ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:text-black hover:bg-black/5'}"
      title="기울임"
    >
      <Italic size={13} strokeWidth={isItalic ? 3.5 : 2.5} />
    </button>

    <button
      onmousedown={(e) => { e.preventDefault(); applyFormat("underline"); }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isUnderline ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:text-black hover:bg-black/5'}"
      title="밑줄"
    >
      <Underline size={13} strokeWidth={isUnderline ? 3.5 : 2.5} />
    </button>

    <button
      onmousedown={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'textColor' ? null : 'textColor'; }}
      class="relative w-6 h-6 rounded-md hover:bg-amber-100 transition-colors flex items-center justify-center shrink-0 mx-0.5 popup-safe-area"
      title="글자 색상"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600" style="margin-top: -2px;">
        <path d="m6 15 6-11 6 11" /><path d="M9 11h6" />
      </svg>
      <div class="absolute bottom-1 left-1 right-1 h-[4.5px] rounded-full" style="background-color: {selTextColor || '#374151'};"></div>
    </button>

    <button
      onmousedown={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'bgColor' ? null : 'bgColor'; }}
      class="relative w-6 h-6 rounded-md hover:bg-amber-100 transition-colors flex items-center justify-center shrink-0 mx-0.5 popup-safe-area"
      title="형광펜"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600" style="margin-top: -2px;">
        <path d="m9 11 6-6 3 3-6 6z" /><path d="m5 15 4 4" /><path d="m21 21-2-2" />
      </svg>
      <div class="absolute bottom-1 left-1 right-1 h-[4.5px] rounded-full" style="background-color: {selBgColor || '#e5e7eb'};"></div>
    </button>

    <div class="w-px h-3 bg-black/10 mx-0.5 shrink-0"></div>

    <button
      onmousedown={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'more' ? null : 'more'; }}
      class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {activePopup === 'more' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-black hover:bg-black/5'} popup-safe-area"
      title="더보기"
    >
      <MoreHorizontal size={14} strokeWidth={2.5} />
    </button>
  </div>

  {#if activePopup}
    <div
      role="listbox"
      tabindex="-1"
      class="absolute z-[100000] bg-white/98 border border-black/8 rounded-xl shadow-xl overflow-hidden popup-safe-area right-2"
      style="backdrop-filter:blur(12px); margin-top: 4px;"
      onmousedown={(e) => { if(activePopup !== 'link') e.preventDefault(); }}
    >
      {#if activePopup === 'symbols'}
        <div class="flex items-center gap-1.5 border-b border-black/5 px-2 py-1.5 bg-black/5 w-[320px]">
          {#each SYM_PAGES as _, i}
            <button
              onmousedown={(e) => { e.preventDefault(); symPage = i; }}
              class="w-4 h-4 flex items-center justify-center rounded-sm text-[9px] font-bold transition-all {symPage === i ? 'bg-amber-400 text-white shadow-sm' : 'bg-white/50 text-gray-400 hover:text-gray-600'}"
            >
              {i + 1}
            </button>
          {/each}
          <div class="flex-1"></div>
          <span class="text-[9px] font-bold text-amber-600 pr-1">{SYM_PAGES[symPage].label}</span>
        </div>
        <div class="grid grid-cols-10 gap-0.5 p-1.5">
          {#each SYM_PAGES[symPage].syms as sym}
            <button
              onmousedown={(e) => { e.preventDefault(); insertSymbol(sym); }}
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
            <button onmousedown={(e) => { e.preventDefault(); activePopup = null; }} class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-1.5 rounded text-[10px] transition-colors">취소</button>
            <button onmousedown={(e) => { e.preventDefault(); insertLink(); }} class="flex-1 bg-amber-400 hover:bg-amber-500 text-white font-bold py-1.5 rounded text-[10px] transition-colors">적용</button>
          </div>
        </div>

      {:else if activePopup === 'more'}
        <div class="p-2 w-[220px] flex flex-col gap-2">
          <!-- 자간 -->
          <div class="flex items-center justify-between gap-2 px-1 py-1">
            <span class="text-[10px] font-bold text-gray-600 shrink-0">자간 조절</span>
            <div class="flex items-center gap-1">
              <button 
                onmousedown={(e) => {
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
                onmousedown={(e) => {
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
              onmousedown={(e) => { e.preventDefault(); saveSelection(); handleAlignCycle(); }}
              class="flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-md transition-all {selAlign !== 'left' && selAlign !== 'start' ? 'text-amber-600 bg-amber-50' : 'text-gray-600 hover:text-black hover:bg-black/5'}"
            >
              <AlignJustify size={14} strokeWidth={2.5} />
              <span class="text-[8px] font-bold">정렬</span>
            </button>
            <button
              onmousedown={(e) => { e.preventDefault(); saveSelection(); activePopup = 'symbols'; symPage = 0; }}
              class="flex-1 py-1.5 flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-black hover:bg-black/5 rounded-md transition-all font-bold popup-safe-area"
            >
              <span style="font-size: 14px; line-height: 1;">Ω</span>
              <span class="text-[8px] font-bold">기호</span>
            </button>
            <button
              onmousedown={(e) => { 
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
              onmousedown={(e) => {
                e.preventDefault();
                applyFormat('hiliteColor', 'transparent');
                activePopup = null;
              }}
              class="w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 text-[10px] font-bold text-gray-600 bg-black/5 hover:bg-amber-100 rounded-md border border-black/5 transition-colors"
            >
              🚫 색상 없음 (투명)
            </button>
          {/if}
          <div class="grid grid-cols-10 gap-1">
            {#each PALETTE as color}
              <button
                onmousedown={(e) => {
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
  input[type=range].custom-slider {
    -webkit-appearance: none;
    appearance: none;
    outline: none;
  }
  input[type=range].custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--slider-thumb-color, #9ca3af);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    cursor: pointer;
  }
  
  .hide-spinners::-webkit-outer-spin-button,
  .hide-spinners::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .hide-spinners {
    -moz-appearance: textfield;
  }
</style>