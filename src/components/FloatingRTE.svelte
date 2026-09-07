<script>
  import { onMount, onDestroy } from "svelte";
  import { Bold, Underline, Italic, Link, AlignJustify, GripVertical } from "lucide-svelte";
  import { appState } from "../lib/appState.svelte.js";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import FontSizeInput from "./FontSizeInput.svelte";
  import { STABLE_MAX_PT } from "../lib/fontSize.js";

  // ✨ [글자 크기 상한] Tiny Note는 무제한(Infinity), 그 외(메인/노트 창)는 안정 표출을 위해 40pt 캡
  // 왜 창별로 다른가: Tiny Note는 자유 저작 공간이고, Tidy Task 본창은 할 일/노트 레이아웃 안정이 우선입니다.
  let fontMax = $state(STABLE_MAX_PT);

 // ── Palette Data (구글 문서 표준 60색) ──────────────────────────────────────
  const PALETTE = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
    "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
    "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc",
    "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0",
    "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79",
    "#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"
  ];

  // ── Reactive state ──────────────────────────────────────────────────────────
  let visible = $state(false);
  let pos = $state({ x: 0, y: 0 });
  let toolbarEl = $state(null);
  let selTimeout = null;
  let activePopup = $state(null);

  let selFontName = $state("굴림");
  let selFontSize = $state(10);
  let selTextColor = $state("");
  let selBgColor = $state("");

  let isBoldActive = $state(false);
  let isItalicActive = $state(false);
  let isUnderlineActive = $state(false);
  let selAlign = $state('left');
  
  let linkUrl = $state('https://');
  let linkText = $state('');

  // ── 드래그 이동 손잡이 로직 ──────────────────────────────────────────────
  let isDragging = $state(false);
  let isUserMoved = $state(false);

  function handleDragStart(e) {
    if (["BUTTON", "SELECT", "OPTION", "INPUT"].includes(e.target.tagName) || e.target.closest("button")) return;
    isDragging = true;
    isUserMoved = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleDragMove(e) {
    if (!isDragging) return;
    pos.x += e.movementX;
    pos.y += e.movementY;
  }
  function handleDragEnd() {
    isDragging = false;
  }

  let formatFreezeTimeout = null;
  function lockPosition() {
    if (formatFreezeTimeout) clearTimeout(formatFreezeTimeout);
    formatFreezeTimeout = setTimeout(() => { formatFreezeTimeout = null; }, 300);
  }

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
        editable.focus({ preventScroll: true });
      }
    }
    
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.cloneRange());
    return true;
  }

  function applyStyleDirect(styles = {}, requireFocus = true) {
    lockPosition();
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
    syncState();
  }

  function applyFormat(cmd, val = null) {
    lockPosition(); 
    if (appState.isEditMode && appState.selectedTodoIds.length > 0) {
      if (cmd === 'hiliteColor') appState.applyStyleToSelected('style', { backgroundColor: val });
      else if (cmd === 'foreColor') appState.applyStyleToSelected('style', { color: val });
      else appState.applyStyleToSelected('format', cmd);
      return;
    }
    restoreSelectionToEditor(true);
    document.execCommand(cmd, false, val);
    syncState();
  }

  function handleAlignCycle() {
    lockPosition(); 
    restoreSelectionToEditor(true);
    if (selAlign === 'left' || selAlign === 'start') applyFormat("justifyCenter");
    else if (selAlign === 'center') applyFormat("justifyRight");
    else applyFormat("justifyLeft");
  }

  // ✨ 하이퍼링크 100% 서식 보존 엔진 (가짜 형광펜 찌꺼기 완전 제거)
  function insertLink() {
    if (!linkUrl) return;
    lockPosition(); 
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
    syncState();
  }

  function syncState() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      // 왜 range.startContainer에서 drill-down하는가:
      //   applyStyleDirect()에서 selectNode(wrapper)로 선택을 설정하면,
      //   startContainer가 wrapper의 부모가 되어 부모의 computedStyle을 읽게 됩니다.
      //   startOffset으로 실제 자식 노드를 찾아야 방금 적용한 스타일을 정확히 읽습니다.
      const range = sel.getRangeAt(0);
      let node = range.startContainer;
      if (node.nodeType === Node.ELEMENT_NODE && range.startOffset < node.childNodes.length) {
        node = node.childNodes[range.startOffset];
      }
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      if (!(node instanceof Element) || !node.closest('[contenteditable="true"]')) return;
      const style = window.getComputedStyle(node);

      isBoldActive = document.queryCommandState('bold') || style.fontWeight === '700' || style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 600;
      isItalicActive = document.queryCommandState('italic') || style.fontStyle === 'italic';
      isUnderlineActive = document.queryCommandState('underline') || style.textDecorationLine?.includes('underline') || style.textDecoration?.includes('underline');
      
      selAlign = style.textAlign || 'left';
      if (document.queryCommandState('justifyCenter')) selAlign = 'center';
      else if (document.queryCommandState('justifyRight')) selAlign = 'right';

      let rawFont = style.fontFamily.replace(/["']/g, ""); 
      let cleanFont = rawFont.split(",")[0].trim();
      const matchedFont = appState.allFonts.find(f => {
        const baseFamily = f.family.split(',')[0].replace(/['"]/g, '').trim();
        return rawFont.toLowerCase().includes(baseFamily.toLowerCase()) || rawFont.toLowerCase().includes(f.name.toLowerCase());
      });
      selFontName = matchedFont ? matchedFont.name : cleanFont;

      const fs = style.fontSize;
      if (fs) {
        const ptSize = Math.round(parseFloat(fs) * 0.75);
        if (!isNaN(ptSize)) selFontSize = ptSize;
      }
      selTextColor = style.color;
      const bg = style.backgroundColor;
      selBgColor = (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') ? '' : bg;
    } catch (err) {}
  }

  function calcPos(rect) {
    const W = 280; 
    const H = 34;
    const GAP = 10;
    const flip = rect.top < H + GAP + 10;
    let y = flip ? rect.bottom + GAP + H : rect.top - GAP;
    let x = rect.left + rect.width / 2;
    x = Math.max(W / 2 + 10, Math.min(x, window.innerWidth - W / 2 - 10));
    return { x, y };
  }

  let floatingSyncId = null;

  function onSelChange() {
    if (appState.isEditMode) {
      visible = false;
      activePopup = null;
      return;
    }
    if (floatingSyncId) return;

    floatingSyncId = requestAnimationFrame(() => {
      try {
        if (toolbarEl && toolbarEl.contains(document.activeElement)) return;
        const sel = window.getSelection();
        
        if (!sel || sel.isCollapsed || sel.rangeCount === 0 || sel.toString().trim().length === 0) {
          if (!toolbarEl?.contains(document.activeElement) && !activePopup) {
            visible = false;
            activePopup = null;
            isUserMoved = false; 
          }
          return;
        }

        const anchorNode = sel.anchorNode;
        if (!anchorNode) return;
        
        const isInsideEditor = anchorNode.nodeType === Node.TEXT_NODE
          ? anchorNode.parentElement?.closest('[contenteditable="true"]')
          : (anchorNode.closest ? anchorNode.closest('[contenteditable="true"]') : null);

        if (!isInsideEditor) {
          if (!activePopup) {
            visible = false;
            activePopup = null;
          }
          return;
        }

        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          if (!activePopup) visible = false;
          return;
        }

        clearTimeout(selTimeout);
        selTimeout = setTimeout(() => {
          saveSelection();
          syncState();
          
          if (!isUserMoved && !activePopup && !formatFreezeTimeout) {
            pos = calcPos(rect);
          }
          visible = true;
        }, 50);
      } finally {
        floatingSyncId = null;
      }
    });
  }

  function handleGlobalMousedown(e) {
    if (!visible && !activePopup) return;
    const isInsideToolbar = toolbarEl && toolbarEl.contains(e.target);
    const isInsidePopup = e.target.closest('.popup-safe-area');
    
    if (activePopup && !isInsidePopup) {
      activePopup = null;
    }
    if (visible && !isInsideToolbar && !isInsidePopup) {
      visible = false;
      activePopup = null;
    }
  }

  onMount(() => {
    // 현재 창이 Tiny Note면 글자 크기 상한을 해제(무제한), 그 외에는 40pt로 캡
    try {
      fontMax = getCurrentWindow().label.startsWith("tinynote-") ? Infinity : STABLE_MAX_PT;
    } catch (e) {}
    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("mousedown", handleGlobalMousedown);
  });
  
  onDestroy(() => {
    if (floatingSyncId) cancelAnimationFrame(floatingSyncId);
    if (selTimeout) clearTimeout(selTimeout);
    if (formatFreezeTimeout) clearTimeout(formatFreezeTimeout);
    document.removeEventListener("selectionchange", onSelChange);
    document.removeEventListener("mousedown", handleGlobalMousedown);
  });

  $effect(() => {
    if (appState.fontFamily) selFontName = appState.fontFamily;
    if (appState.fontSize) selFontSize = appState.fontSize; 
  });

  $effect(() => {
    if (appState.isEditMode) {
      visible = false;
      activePopup = null;
    }
  });
</script>

{#if visible}
  <div
    bind:this={toolbarEl}
    role="toolbar" tabindex="-1"
    style="position:fixed; left:{pos.x}px; top:{pos.y}px; transform:translateX(-50%) translateY(-100%); transform-origin: center bottom; z-index:9999;"
    class="rounded-xl shadow-2xl border border-black/10 select-none bg-white/98 backdrop-blur-md toolbar-anim popup-safe-area overflow-hidden"
    onmousedown={(e) => {
      e.stopPropagation();
      if (["INPUT", "SELECT", "OPTION"].includes(e.target.tagName)) return;
      e.preventDefault();
    }}
  >
    {#if !activePopup}
      <div class="flex items-center gap-0.5 px-1.5 py-1">
        <div
          class="cursor-move pr-1 pl-0.5 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          onpointerdown={handleDragStart}
          onpointermove={handleDragMove}
          onpointerup={handleDragEnd}
          onpointercancel={handleDragEnd}
          title="잡고 이동"
        >
          <GripVertical size={14} strokeWidth={2.5} />
        </div>

        <select
          value={selFontName}
          onmousedown={() => { saveSelection(); }}
          onchange={(e) => {
            selFontName = e.currentTarget.value;
            const fontObj = appState.allFonts.find(f => f.name === selFontName);
            if (fontObj) applyStyleDirect({ fontFamily: fontObj.family }, true);
          }}
          class="text-[10px] bg-black/5 border-none rounded px-1 h-[20px] outline-none cursor-pointer hover:bg-amber-100 transition-colors w-[68px] truncate shrink-0"
          title="글꼴"
        >
          {#each appState.allFonts as font}
            <option value={font.name} style="font-family: {font.family.replace(/"/g, "'")}">{font.name}</option>
          {/each}
        </select>

        <!-- 글자 크기 (직접 입력 + 프리셋; Tiny Note는 무제한, 그 외 최대 40pt) — 옆 글꼴 박스와 외형 통일 -->
        <FontSizeInput
          value={selFontSize}
          max={fontMax}
          dark={false}
          boxClass="bg-black/5 rounded h-[20px] text-gray-700 hover:bg-amber-100 transition-colors"
          onBeforeInteract={saveSelection}
          onApply={(pt) => { selFontSize = pt; applyStyleDirect({ fontSize: `${pt}pt`, lineHeight: '1.5' }, true); }}
        />

        <div class="w-px h-3 bg-black/10 mx-0.5 shrink-0"></div>

        <button
          onmousedown={(e) => { e.preventDefault(); saveSelection(); applyFormat("bold"); }}
          class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isBoldActive ? 'text-amber-600 bg-amber-50' : 'text-gray-600 hover:text-amber-700 hover:bg-amber-100'}"
          title="굵게"
        >
          <Bold size={13} strokeWidth={isBoldActive ? 3.5 : 2.5} />
        </button>
        
        <button
          onmousedown={(e) => { e.preventDefault(); saveSelection(); applyFormat("italic"); }}
          class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isItalicActive ? 'text-amber-600 bg-amber-50' : 'text-gray-600 hover:text-amber-700 hover:bg-amber-100'}"
          title="기울임"
        >
          <Italic size={13} strokeWidth={isItalicActive ? 3.5 : 2.5} />
        </button>
        
        <button
          onmousedown={(e) => { e.preventDefault(); saveSelection(); applyFormat("underline"); }}
          class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {isUnderlineActive ? 'text-amber-600 bg-amber-50' : 'text-gray-600 hover:text-amber-700 hover:bg-amber-100'}"
          title="밑줄"
        >
          <Underline size={13} strokeWidth={isUnderlineActive ? 3.5 : 2.5} />
        </button>

        <button
          onmousedown={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'textColor' ? null : 'textColor'; lockPosition(); }}
          class="relative w-6 h-6 rounded-md hover:bg-amber-100 transition-colors flex items-center justify-center shrink-0 mx-0.5"
          title="글자 색상"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600" style="margin-top: -2px;">
            <path d="m6 15 6-11 6 11" /><path d="M9 11h6" />
          </svg>
          <div class="absolute bottom-1 left-1 right-1 h-[4.5px] rounded-full" style="background-color: {selTextColor || '#374151'};"></div>
        </button>

        <button
          onmousedown={(e) => { e.preventDefault(); saveSelection(); activePopup = activePopup === 'bgColor' ? null : 'bgColor'; lockPosition(); }}
          class="relative w-6 h-6 rounded-md hover:bg-amber-100 transition-colors flex items-center justify-center shrink-0 mx-0.5"
          title="형광펜"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600" style="margin-top: -2px;">
            <path d="m9 11 6-6 3 3-6 6z" /><path d="m5 15 4 4" /><path d="m21 21-2-2" />
          </svg>
          <div class="absolute bottom-1 left-1 right-1 h-[4.5px] rounded-full" style="background-color: {selBgColor || '#e5e7eb'};"></div>
        </button>

        <div class="w-px h-3 bg-black/10 mx-0.5 shrink-0"></div>

        <button
          onmousedown={(e) => { e.preventDefault(); saveSelection(); handleAlignCycle(); }}
          class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 {selAlign !== 'left' && selAlign !== 'start' ? 'text-amber-600 bg-amber-50' : 'text-gray-600 hover:text-amber-700 hover:bg-amber-100'}"
          title="정렬 변경 (현재: {selAlign})"
        >
          <AlignJustify size={13} strokeWidth={2.5} />
        </button>
        
        <button
          onmousedown={(e) => { 
            e.preventDefault(); 
            saveSelection(); 
            activePopup = activePopup === 'link' ? null : 'link'; 
            if (activePopup === 'link') {
              const sel = window.getSelection();
              linkText = sel.toString().trim();
            }
            lockPosition(); 
          }}
          class="w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 text-gray-600 hover:text-amber-700 hover:bg-amber-100"
          title="링크 추가"
        >
          <Link size={13} strokeWidth={2.5} />
        </button>
      </div>

    {:else}
      {#if activePopup === 'link'}
        <div class="p-2 w-[240px] flex flex-col gap-1.5 popup-anim">
          <input type="text" bind:value={linkUrl} onkeydown={(e) => { if(e.key === 'Enter') { e.preventDefault(); insertLink(); } }} placeholder="https:// URL 입력" class="w-full text-[10px] px-2 py-1.5 border border-black/10 rounded outline-none focus:border-amber-400" />
          <input type="text" bind:value={linkText} onkeydown={(e) => { if(e.key === 'Enter') { e.preventDefault(); insertLink(); } }} placeholder="표시할 텍스트 (선택사항)" class="w-full text-[10px] px-2 py-1.5 border border-black/10 rounded outline-none focus:border-amber-400" />
          <div class="flex gap-1 mt-0.5">
            <button onmousedown={(e) => { e.preventDefault(); activePopup = null; }} class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-1.5 rounded text-[10px] transition-colors">취소</button>
            <button onmousedown={(e) => { e.preventDefault(); insertLink(); }} class="flex-1 bg-amber-400 hover:bg-amber-500 text-white font-bold py-1.5 rounded text-[10px] transition-colors">적용</button>
          </div>
        </div>
      {:else}
        <div class="p-1.5 w-[180px] popup-anim">
          {#if activePopup === 'bgColor'}
            <button 
              onmousedown={(e) => { 
                e.preventDefault();
                applyFormat('hiliteColor', 'transparent'); 
                activePopup = null; 
              }} 
              class="w-full flex items-center justify-center gap-1 py-1.5 mb-1.5 text-[9px] font-bold text-gray-600 bg-black/5 hover:bg-amber-100 rounded-md border border-black/5 transition-colors"
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
    {/if}
  </div>
{/if} 

<style>
  .toolbar-anim {
    animation: popIn 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }
  @keyframes popIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-85%) scale(0.95); }
    to { opacity: 1; transform: translateX(-50%) translateY(-100%) scale(1); }
  }
  .popup-anim {
    animation: fadeIn 0.1s ease-out forwards;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>