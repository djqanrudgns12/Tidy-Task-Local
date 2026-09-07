<script>
  import { onMount, onDestroy } from "svelte";
  import { Bold, Italic, Underline, Link, AlignJustify, Type, Highlighter } from "lucide-svelte";
  import { archiveState } from "../lib/archiveStore.svelte.js";
  import FontSizeInput from "./FontSizeInput.svelte";
  import { STABLE_MAX_PT } from "../lib/fontSize.js";

  // ✨ [Full Toolbar] 아카이브 인라인 편집용 고정 서식 툴바 (Svelte 5 runes)
  // 왜 appState를 쓰지 않는가:
  //   아카이브 창은 appState.init()을 호출하면 windowLabel="archive"로 세팅되어
  //   performSave가 유령 데이터를 생성합니다. 따라서 서식 로직을 self-contained로 이식하고,
  //   현재 포커스된 contenteditable(각 노트 본문)의 선택 영역에 직접 서식을 적용합니다.

  // ── 구글 문서 표준 60색 팔레트 ──────────────────────────────────────────────
  const PALETTE = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
    "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
    "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc",
    "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0",
    "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79",
    "#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"
  ];

  let dark = $derived(archiveState.globalSettings.isDarkMode);

  // ── 선택 영역 동기화 상태 ────────────────────────────────────────────────────
  let selFontName = $state("");
  let selFontSize = $state(12);
  let selTextColor = $state("");
  let selBgColor = $state("");
  let isBold = $state(false);
  let isItalic = $state(false);
  let isUnderline = $state(false);
  let selAlign = $state("left");

  let activePopup = $state(null); // 'textColor' | 'bgColor' | 'link' | 'symbols' | null
  let linkUrl = $state("https://");
  let linkText = $state("");
  let symPage = $state(0); // 현재 선택된 기호 카테고리 페이지 인덱스

  // ── 특수 기호 데이터 (메인 툴바에서 이식) ─────────────────────────────────────
  // 왜 별도로 두는가: 아카이브 창은 appState를 import할 수 없으므로 독립 복사본이 필요합니다.
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

  // ✨ 선택된 기호를 커서 위치에 삽입합니다.
  function insertSymbol(sym) {
    restoreSelection(true);
    document.execCommand("insertText", false, sym);
    activePopup = null;
    fireInput();
  }

  // 마지막으로 아카이브 편집기 안에 있던 선택 영역을 보존합니다.
  let savedRange = null;

  function isInArchiveEditor(node) {
    if (!node) return false;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return !!(el && el.closest && el.closest('[contenteditable="true"]'));
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (isInArchiveEditor(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
      }
    }
  }

  function restoreSelection(requireFocus = true) {
    if (!savedRange) return false;
    if (requireFocus) {
      let container = savedRange.commonAncestorContainer;
      if (container.nodeType === Node.TEXT_NODE) container = container.parentNode;
      const editable = container?.closest?.('[contenteditable="true"]');
      if (editable && document.activeElement !== editable) {
        editable.focus({ preventScroll: true });
      }
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.cloneRange());
    return true;
  }

  // 서식 변경 후 편집기 상태를 저장 파이프라인(editable.js onUpdate)으로 흘려보냅니다.
  function fireInput() {
    let node = window.getSelection()?.anchorNode;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    el?.closest?.("[contenteditable]")?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ✨ 선택 영역을 span으로 감싸 스타일 직접 주입 (FloatingRTE 검증 로직 이식)
  // 왜 재귀적으로 내부 스타일을 제거하는가:
  //   서로 다른 서식이 섞인 텍스트를 드래그하여 일괄 변경할 때, 내부 span의 인라인 스타일이
  //   CSS 우선순위에서 이겨 새 스타일이 렌더에 반영되지 않는 버그를 막기 위함입니다.
  function applyStyleDirect(styles = {}) {
    if (!restoreSelection(true)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const fragment = range.extractContents();

    const cssPropsToClean = Object.keys(styles).map((k) => k.replace(/([A-Z])/g, "-$1").toLowerCase());
    function stripInnerStyles(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      cssPropsToClean.forEach((prop) => node.style.removeProperty(prop));
      if (!node.getAttribute("style")?.trim()) node.removeAttribute("style");
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
          // 블록 요소는 엔터 쳤을 때 스타일이 이어지도록 새 스타일로 덮어씌움
          if (styles.fontSize) current.style.fontSize = styles.fontSize;
          if (styles.lineHeight) current.style.lineHeight = styles.lineHeight;
        } else {
          // 인라인 요소(기존 span 껍데기)는 이전 스타일을 지워 충돌 방지
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

    fireInput();
    syncState();
  }

  function applyFormat(cmd, val = null) {
    restoreSelection(true);
    document.execCommand(cmd, false, val);
    fireInput();
    syncState();
  }

  function handleAlignCycle() {
    restoreSelection(true);
    if (selAlign === "left" || selAlign === "start") applyFormat("justifyCenter");
    else if (selAlign === "center") applyFormat("justifyRight");
    else applyFormat("justifyLeft");
  }

  // ✨ 하이퍼링크 삽입 (서식 보존, 가짜 형광펜 찌꺼기 제거)
  function insertLink() {
    if (!linkUrl) return;
    restoreSelection(true);

    let url = linkUrl;
    if (!url.match(/^https?:\/\//i)) url = "http://" + url;

    const customText = linkText.trim();
    const originalText = savedRange ? savedRange.toString().trim() : "";
    const linkStyle = "color: #3b82f6; text-decoration: underline; cursor: pointer;";

    if (customText && customText !== originalText) {
      document.execCommand("insertHTML", false, `<a href="${url}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${customText}</a>`);
    } else if (originalText === "") {
      document.execCommand("insertHTML", false, `<a href="${url}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${url}</a>`);
    } else {
      const div = document.createElement("div");
      div.appendChild(savedRange.cloneContents());
      let innerHTML = div.innerHTML.replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1");
      document.execCommand("insertHTML", false, `<a href="${url}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${innerHTML}</a>`);
    }

    activePopup = null;
    linkUrl = "https://";
    linkText = "";
    fireInput();
    syncState();
  }

  // 현재 선택 위치의 서식을 읽어 툴바 표시 상태를 동기화합니다.
  function syncState() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      // 왜 range.startContainer를 사용하는가:
      //   applyStyleDirect()에서 selectNode(wrapper)로 선택을 설정하면,
      //   anchorNode가 wrapper의 부모가 되어 부모의 computedStyle을 읽게 됩니다.
      //   range의 startContainer/startOffset에서 실제 자식 노드로 drill-down하면
      //   wrapper 자체의 스타일(방금 적용한 폰트 크기 등)을 정확히 읽을 수 있습니다.
      const range = sel.getRangeAt(0);
      let node = range.startContainer;
      if (node.nodeType === Node.ELEMENT_NODE && range.startOffset < node.childNodes.length) {
        node = node.childNodes[range.startOffset];
      }
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      if (!(node instanceof Element) || !node.closest('[contenteditable="true"]')) return;

      const style = window.getComputedStyle(node);
      isBold = document.queryCommandState("bold") || parseInt(style.fontWeight) >= 600;
      isItalic = document.queryCommandState("italic") || style.fontStyle === "italic";
      isUnderline = document.queryCommandState("underline") || (style.textDecorationLine || "").includes("underline");

      selAlign = style.textAlign || "left";
      if (document.queryCommandState("justifyCenter")) selAlign = "center";
      else if (document.queryCommandState("justifyRight")) selAlign = "right";

      const rawFont = style.fontFamily.replace(/["']/g, "");
      const matched = archiveState.allFonts.find((f) => {
        const base = f.family.split(",")[0].replace(/['"]/g, "").trim();
        return rawFont.toLowerCase().includes(base.toLowerCase()) || rawFont.toLowerCase().includes(f.name.toLowerCase());
      });
      selFontName = matched ? matched.name : rawFont.split(",")[0].trim();

      const fs = style.fontSize;
      if (fs) {
        const pt = Math.round(parseFloat(fs) * 0.75);
        if (!isNaN(pt)) selFontSize = pt;
      }
      selTextColor = style.color;
      const bg = style.backgroundColor;
      selBgColor = bg === "transparent" || bg === "rgba(0, 0, 0, 0)" ? "" : bg;
    } catch (e) {}
  }

  // 선택이 바뀔 때마다 아카이브 편집기 안이면 선택을 보존하고 상태를 갱신합니다.
  let rafId = null;
  function onSelChange() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      if (!isInArchiveEditor(sel.anchorNode)) return;
      saveSelection();
      syncState();
    });
  }

  // 툴바 바깥 클릭 시 팝업 닫기
  function onGlobalMousedown(e) {
    if (!activePopup) return;
    if (e.target.closest?.(".archive-toolbar-root")) return;
    activePopup = null;
  }

  onMount(() => {
    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("mousedown", onGlobalMousedown);
  });
  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener("selectionchange", onSelChange);
    document.removeEventListener("mousedown", onGlobalMousedown);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="archive-toolbar-root relative z-50 flex items-center gap-[3px] px-2 py-1.5 shrink-0 border-b select-none"
  style="
    background-color: {dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)'};
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-color: {dark ? 'rgba(255,255,255,0.06)' : 'rgba(251,191,36,0.25)'};
    box-shadow: {dark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.8)'};
  "
  onmousedown={(e) => {
    // 툴바 클릭 시 편집기 선택이 사라지지 않도록 방어 (select 드롭다운만 예외)
    if (["SELECT", "OPTION"].includes(e.target.tagName)) return;
    e.preventDefault();
  }}
>
  <!-- 글꼴 -->
  <select
    value={selFontName}
    onmousedown={saveSelection}
    onchange={(e) => {
      const fontObj = archiveState.allFonts.find((f) => f.name === e.currentTarget.value);
      if (fontObj) applyStyleDirect({ fontFamily: fontObj.family });
    }}
    class="text-[10px] rounded-md px-1 h-[24px] outline-none cursor-pointer transition-all flex-1 min-w-[50px] max-w-[90px] truncate"
    style="background-color: {dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}; color: {dark ? '#e2e8f0' : '#374151'}; border: 1px solid {dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};"
    title="글꼴"
  >
    <option value="" disabled hidden></option>
    {#each archiveState.allFonts as font}
      <option value={font.name} style="font-family: {font.family.replace(/\"/g, `'`)}">{font.name}</option>
    {/each}
  </select>

  <!-- 글자 크기 (직접 입력 + 프리셋, 안정 표출 위해 최대 40pt로 캡) — 옆 글꼴 박스와 외형 통일 -->
  <FontSizeInput
    value={selFontSize}
    max={STABLE_MAX_PT}
    {dark}
    boxClass="rounded-md h-[24px] transition-all"
    boxStyle="background-color: {dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}; color: {dark ? '#e2e8f0' : '#374151'}; border: 1px solid {dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};"
    onBeforeInteract={saveSelection}
    onApply={(pt) => { selFontSize = pt; applyStyleDirect({ fontSize: `${pt}pt`, lineHeight: '1.5' }); }}
  />

  <div class="w-px h-4 mx-0.5 shrink-0" style="background: {dark ? 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)' : 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.12), transparent)'};"></div>

  <!-- 굵게 / 기울임 / 밑줄 -->
  <button
    onmousedown={(e) => { e.preventDefault(); saveSelection(); applyFormat("bold"); }}
    class="min-w-[22px] h-[26px] flex items-center justify-center rounded-md transition-all duration-150 hover:scale-[1.08] {isBold ? 'text-amber-600 bg-amber-500/15 shadow-sm' : (dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-amber-100/70')}"
    title="굵게"
  >
    <Bold size={13} strokeWidth={isBold ? 3.5 : 2.5} />
  </button>
  <button
    onmousedown={(e) => { e.preventDefault(); saveSelection(); applyFormat("italic"); }}
    class="min-w-[22px] h-[26px] flex items-center justify-center rounded-md transition-all duration-150 hover:scale-[1.08] {isItalic ? 'text-amber-600 bg-amber-500/15 shadow-sm' : (dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-amber-100/70')}"
    title="기울임"
  >
    <Italic size={13} strokeWidth={isItalic ? 3.5 : 2.5} />
  </button>
  <button
    onmousedown={(e) => { e.preventDefault(); saveSelection(); applyFormat("underline"); }}
    class="min-w-[22px] h-[26px] flex items-center justify-center rounded-md transition-all duration-150 hover:scale-[1.08] {isUnderline ? 'text-amber-600 bg-amber-500/15 shadow-sm' : (dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-amber-100/70')}"
    title="밑줄"
  >
    <Underline size={13} strokeWidth={isUnderline ? 3.5 : 2.5} />
  </button>

  <!-- 글자 색상 -->
  <button
    onmousedown={(e) => { e.preventDefault(); e.stopPropagation(); saveSelection(); activePopup = activePopup === "textColor" ? null : "textColor"; }}
    class="relative min-w-[22px] h-[26px] rounded-md transition-all duration-150 flex items-center justify-center hover:scale-[1.08] {dark ? 'hover:bg-white/10' : 'hover:bg-amber-100/70'}"
    title="글자 색상"
  >
    <Type size={13} strokeWidth={2.5} style="margin-top:-2px; color: {dark ? '#e2e8f0' : '#374151'};" />
    <div class="absolute bottom-1 left-1 right-1 h-[4px] rounded-full" style="background-color: {selTextColor || (dark ? '#e2e8f0' : '#374151')};"></div>
  </button>

  <!-- 형광펜 -->
  <button
    onmousedown={(e) => { e.preventDefault(); e.stopPropagation(); saveSelection(); activePopup = activePopup === "bgColor" ? null : "bgColor"; }}
    class="relative min-w-[22px] h-[26px] rounded-md transition-all duration-150 flex items-center justify-center hover:scale-[1.08] {dark ? 'hover:bg-white/10' : 'hover:bg-amber-100/70'}"
    title="형광펜"
  >
    <Highlighter size={13} strokeWidth={2.2} style="margin-top:-2px; color: {dark ? '#e2e8f0' : '#374151'};" />
    <div class="absolute bottom-1 left-1 right-1 h-[4px] rounded-full" style="background-color: {selBgColor || (dark ? 'rgba(255,255,255,0.25)' : '#e5e7eb')};"></div>
  </button>

  <div class="w-px h-4 mx-0.5 shrink-0" style="background: {dark ? 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)' : 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.12), transparent)'};"></div>

  <!-- 정렬 (순환) -->
  <button
    onmousedown={(e) => { e.preventDefault(); saveSelection(); handleAlignCycle(); }}
    class="min-w-[22px] h-[26px] flex items-center justify-center rounded-md transition-all duration-150 hover:scale-[1.08] {selAlign !== 'left' && selAlign !== 'start' ? 'text-amber-600 bg-amber-500/15 shadow-sm' : (dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-amber-100/70')}"
    title="정렬 변경 (현재: {selAlign})"
  >
    <AlignJustify size={13} strokeWidth={2.5} />
  </button>

  <!-- 링크 -->
  <button
    onmousedown={(e) => {
      e.preventDefault();
      e.stopPropagation();
      saveSelection();
      activePopup = activePopup === "link" ? null : "link";
      if (activePopup === "link") linkText = window.getSelection()?.toString().trim() || "";
    }}
    class="min-w-[22px] h-[26px] flex items-center justify-center rounded-md transition-all duration-150 hover:scale-[1.08] {activePopup === 'link' ? 'text-amber-600 bg-amber-500/15 shadow-sm' : (dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-amber-100/70')}"
    title="링크 추가"
  >
    <Link size={13} strokeWidth={2.5} />
  </button>

  <!-- ✨ 특수 기호 (메인 툴바에서 이식) -->
  <button
    onmousedown={(e) => {
      e.preventDefault();
      e.stopPropagation();
      saveSelection();
      activePopup = activePopup === "symbols" ? null : "symbols";
      if (activePopup === "symbols") symPage = 0;
    }}
    class="min-w-[22px] h-[26px] flex items-center justify-center rounded-md transition-all duration-150 hover:scale-[1.08] {activePopup === 'symbols' ? 'text-amber-600 bg-amber-500/15 shadow-sm' : (dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-amber-100/70')}"
    title="특수 기호"
  >
    <span style="font-size: 13px; font-weight: 700; line-height: 1;">Ω</span>
  </button>

  <!-- ── 팝업 (색상 / 링크 / 기호) ──────────────────────────────────────────── -->
  {#if activePopup === "textColor" || activePopup === "bgColor"}
    <div
      onmousedown={(e) => e.stopPropagation()}
      class="absolute top-full left-2 mt-1.5 z-50 p-2 rounded-xl shadow-2xl border"
      style="background-color: {dark ? '#1e2028' : '#ffffff'}; border-color: {dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}; backdrop-filter: blur(16px);"
    >
      {#if activePopup === "bgColor"}
        <button
          onmousedown={(e) => { e.preventDefault(); applyFormat("hiliteColor", "transparent"); activePopup = null; }}
          class="w-full flex items-center justify-center gap-1 py-1 mb-1.5 text-[9px] font-bold rounded-md border transition-colors"
          style="color: {dark ? '#d1d5db' : '#4b5563'}; background-color: {dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}; border-color: {dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};"
        >
          🚫 색상 없음 (투명)
        </button>
      {/if}
      <div class="grid grid-cols-10 gap-1">
        {#each PALETTE as color}
          <button
            onmousedown={(e) => {
              e.preventDefault();
              if (activePopup === "textColor") applyStyleDirect({ color });
              else applyFormat("hiliteColor", color);
              activePopup = null;
            }}
            class="w-3.5 h-3.5 rounded-[3px] border border-black/10 hover:scale-[1.35] hover:z-10 transition-all cursor-pointer hover:shadow-md"
            style="background-color: {color};"
            title={color}
          ></button>
        {/each}
      </div>
    </div>
  {:else if activePopup === "link"}
    <div
      onmousedown={(e) => e.stopPropagation()}
      class="absolute top-full left-2 mt-1.5 z-50 p-2.5 w-[240px] flex flex-col gap-1.5 rounded-xl shadow-2xl border"
      style="background-color: {dark ? '#1e2028' : '#ffffff'}; border-color: {dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}; backdrop-filter: blur(16px);"
    >
      <input
        type="text"
        bind:value={linkUrl}
        onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertLink(); } }}
        placeholder="https:// URL 입력"
        class="w-full text-[10px] px-2 py-1.5 border rounded-md outline-none focus:border-amber-400 transition-colors"
        style="background-color: {dark ? '#2d333b' : '#fafafa'}; color: {dark ? '#e2e8f0' : '#374151'}; border-color: {dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};"
      />
      <input
        type="text"
        bind:value={linkText}
        onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertLink(); } }}
        placeholder="표시할 텍스트 (선택사항)"
        class="w-full text-[10px] px-2 py-1.5 border rounded-md outline-none focus:border-amber-400 transition-colors"
        style="background-color: {dark ? '#2d333b' : '#fafafa'}; color: {dark ? '#e2e8f0' : '#374151'}; border-color: {dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};"
      />
      <div class="flex gap-1.5 mt-1">
        <button onmousedown={(e) => { e.preventDefault(); activePopup = null; }} class="flex-1 font-bold py-1.5 rounded-md text-[10px] transition-all hover:scale-[1.02]" style="background-color: {dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}; color: {dark ? '#d1d5db' : '#374151'};">취소</button>
        <button onmousedown={(e) => { e.preventDefault(); insertLink(); }} class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 rounded-md text-[10px] transition-all hover:scale-[1.02] shadow-sm">적용</button>
      </div>
    </div>
  {:else if activePopup === "symbols"}
    <!-- ✨ 특수 기호 팝업 (메인 툴바 구조 이식, 아카이브 테마 적용) -->
    <div
      onmousedown={(e) => e.stopPropagation()}
      class="absolute top-full right-2 mt-1.5 z-50 rounded-xl shadow-2xl border overflow-hidden"
      style="background-color: {dark ? '#1e2028' : '#ffffff'}; border-color: {dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}; backdrop-filter: blur(16px);"
    >
      <!-- 카테고리 탭 네비게이션 -->
      <div class="flex items-center gap-1 border-b px-2 py-1.5 w-[320px]"
        style="background-color: {dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}; border-color: {dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};"
      >
        {#each SYM_PAGES as _, i}
          <button
            onmousedown={(e) => { e.preventDefault(); symPage = i; }}
            class="w-[18px] h-[18px] flex items-center justify-center rounded-md text-[9px] font-bold transition-all duration-150 {symPage === i ? 'shadow-sm' : 'hover:scale-[1.1]'}"
            style="{symPage === i
              ? `background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white;`
              : `background-color: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}; color: ${dark ? '#9ca3af' : '#6b7280'};`
            }"
          >
            {i + 1}
          </button>
        {/each}
        <div class="flex-1"></div>
        <span class="text-[9px] font-bold pr-0.5" style="color: {dark ? '#fbbf24' : '#d97706'};">{SYM_PAGES[symPage].label}</span>
      </div>
      <!-- 기호 그리드 -->
      <div class="grid grid-cols-10 gap-0.5 p-2">
        {#each SYM_PAGES[symPage].syms as sym}
          <button
            onmousedown={(e) => { e.preventDefault(); insertSymbol(sym); }}
            class="w-[26px] h-[26px] flex items-center justify-center text-[12px] rounded-lg cursor-pointer transition-all duration-150 hover:scale-[1.15]"
            style="color: {dark ? '#e2e8f0' : '#374151'}; background-color: transparent;"
            onmouseenter={(e) => { e.currentTarget.style.backgroundColor = dark ? 'rgba(251,191,36,0.15)' : 'rgba(251,191,36,0.2)'; e.currentTarget.style.color = dark ? '#fbbf24' : '#b45309'; }}
            onmouseleave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = dark ? '#e2e8f0' : '#374151'; }}
            title={sym}
          >
            {sym}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
