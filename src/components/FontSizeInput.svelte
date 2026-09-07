<script>
  import { onMount, onDestroy } from "svelte";
  import { ChevronDown } from "lucide-svelte";
  import { FONT_SIZE_PRESETS } from "../lib/fontSize.js";

  // ✨ [공용] 편집 가능한 글자 크기 콤보박스 (Svelte 5 runes)
  //   - 숫자 직접 입력(Enter 적용) + ▾ 클릭 시 프리셋 목록
  //   - max로 상한을 두면 입력/목록이 상한을 넘지 못함(Tidy Task·아카이브는 40, Tiny Note는 무제한)
  //   - onBeforeInteract: 입력창 포커스로 편집기 선택이 사라지기 전에 saveSelection을 호출하기 위한 훅
  //   - boxClass/boxStyle: 각 툴바의 "글꼴 박스"와 외형을 통일하기 위해 컨테이너 스타일을 주입받습니다.
  /** @type {{ value?: number, max?: number, dark?: boolean, boxClass?: string, boxStyle?: string, onApply?: (pt: number) => void, onBeforeInteract?: () => void }} */
  let {
    value = 12,
    max = Infinity,
    dark = false,
    boxClass = "bg-black/5 rounded h-[22px] text-gray-700",
    boxStyle = "",
    onApply,
    onBeforeInteract
  } = $props();

  let open = $state(false);
  let text = $state("");
  let inputEl = $state(null);
  let rootEl = $state(null);
  let lastApplied = null; // Enter+blur 이중 적용 방지용

  // ✨ 팝업은 position:fixed로 띄웁니다.
  // 왜: 툴바 컨테이너가 overflow-hidden/overflow-x-auto라서 일반 absolute 팝업은 잘립니다.
  //     트리거의 화면 좌표를 계산해 fixed로 렌더하면 어떤 클리핑/창 경계도 벗어납니다.
  let coords = $state({ left: 0, top: 0, bottom: 0, openUp: false });
  let popupEl = $state(null);

  // ✨ 팝업을 document.body로 포탈합니다.
  // 왜: 플로팅 툴바 루트에는 transform이 걸려 있어, 그 자손의 position:fixed 기준이
  //     뷰포트가 아닌 그 요소가 되고 overflow:hidden으로 다시 잘립니다. body로 옮기면
  //     어떤 transform/overflow 조상과도 무관하게 뷰포트 기준으로 안전하게 뜹니다.
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { if (node.parentNode) node.parentNode.removeChild(node); } };
  }

  function toggleList() {
    if (open) { open = false; return; }
    const r = rootEl.getBoundingClientRect();
    const LIST_MAX = 240;
    const spaceBelow = window.innerHeight - r.bottom;
    // 아래 공간이 부족하고 위쪽 공간이 더 넓으면 위로 펼침
    const openUp = spaceBelow < LIST_MAX && r.top > spaceBelow;
    coords = {
      left: Math.max(4, Math.min(r.left, window.innerWidth - 72)),
      top: r.bottom + 4,
      bottom: window.innerHeight - r.top + 4,
      openUp
    };
    open = true;
  }
  function closeList() { open = false; }

  const presets = $derived(FONT_SIZE_PRESETS.filter((p) => p <= max));

  // 입력창에 포커스가 없을 때만 외부 value를 표시에 반영(타이핑 중 덮어쓰기 방지)
  $effect(() => {
    if (inputEl && document.activeElement === inputEl) return;
    text = String(value);
  });

  function beforeInteract() {
    lastApplied = null; // 새 상호작용마다 초기화 → 같은 값 재적용 허용
    onBeforeInteract?.();
  }

  function apply(pt) {
    let n = pt;
    if (isNaN(n)) return;
    n = Math.round(n * 2) / 2; // 0.5pt 단위 허용
    if (n < 1) n = 1;
    if (n > max) n = max;
    text = String(n);
    if (n !== lastApplied) {
      lastApplied = n;
      onApply?.(n);
    }
  }

  function commitInput() {
    const n = parseFloat(text);
    if (isNaN(n)) {
      text = String(value); // 잘못된 입력이면 원복
      return;
    }
    apply(n);
  }

  function selectPreset(p) {
    open = false;
    apply(p);
  }

  function onDocDown(e) {
    if (!open) return;
    // 트리거(rootEl) 또는 포탈된 팝업(popupEl) 내부 클릭은 닫지 않습니다.
    if (rootEl && rootEl.contains(e.target)) return;
    if (popupEl && popupEl.contains(e.target)) return;
    open = false;
  }
  // 왜 별도 핸들러인가: 팝업 내부의 스크롤(휠/스크롤바 드래그)이
  // window scroll 이벤트로 버블링되면 closeList가 호출되어 팝업이 닫힙니다.
  // 팝업 내부 스크롤은 무시하고, 외부 스크롤만 닫기로 처리합니다.
  function onScrollCheck(e) {
    if (!open) return;
    if (popupEl && popupEl.contains(e.target)) return;
    closeList();
  }
  onMount(() => {
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("resize", closeList);
    window.addEventListener("scroll", onScrollCheck, true);
  });
  onDestroy(() => {
    document.removeEventListener("mousedown", onDocDown);
    window.removeEventListener("resize", closeList);
    window.removeEventListener("scroll", onScrollCheck, true);
  });
</script>

<div bind:this={rootEl} class="relative shrink-0">
  <!-- 컨테이너 외형은 각 툴바의 글꼴 박스와 동일하게 boxClass/boxStyle로 주입받아 통일성 확보 -->
  <div class="flex items-center gap-0.5 px-1 {boxClass}" style={boxStyle}>
    <input
      bind:this={inputEl}
      bind:value={text}
      inputmode="decimal"
      onmousedown={(e) => {
        // 왜 preventDefault인가: input 클릭 시 브라우저가 contenteditable의
        // selection을 해제하는 것을 방지합니다. selection을 먼저 저장한 후,
        // 비동기적으로 input에 포커스를 줍니다.
        e.preventDefault();
        e.stopPropagation();
        beforeInteract();
        inputEl?.focus();
      }}
      onkeydown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitInput(); inputEl?.blur(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); apply((parseFloat(text) || value) + 1); }
        else if (e.key === "ArrowDown") { e.preventDefault(); apply((parseFloat(text) || value) - 1); }
      }}
      onblur={commitInput}
      class="w-[26px] bg-transparent border-none outline-none text-[10px] text-center tabular-nums"
      style="color: inherit;"
      title="글자 크기 — 직접 입력하거나 ▾로 선택"
    />
    <span class="text-[9px] opacity-70 select-none" style="color: inherit;">pt</span>
    <button
      type="button"
      onmousedown={(e) => { e.preventDefault(); beforeInteract(); toggleList(); }}
      class="flex items-center justify-center w-3.5 shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      title="크기 선택"
      aria-label="글자 크기 목록 열기"
    >
      <ChevronDown size={11} style="color: inherit;" />
    </button>
  </div>

  {#if open}
    <div
      bind:this={popupEl}
      use:portal
      class="fs-list fixed z-[9999] w-[64px] max-h-[240px] overflow-y-auto rounded-lg shadow-xl border py-1"
      style="
        left: {coords.left}px;
        {coords.openUp ? `bottom: ${coords.bottom}px;` : `top: ${coords.top}px;`}
        background-color: {dark ? '#1e2028' : '#ffffff'};
        border-color: {dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
      "
    >
      {#each presets as p}
        <button
          type="button"
          onmousedown={(e) => { e.preventDefault(); selectPreset(p); }}
          class="w-full text-left px-2.5 py-1 text-[11px] transition-colors {Math.round(value) === p
            ? dark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'
            : dark ? 'text-gray-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-100'}"
        >
          {p} pt
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .fs-list::-webkit-scrollbar { width: 6px; }
  .fs-list::-webkit-scrollbar-thumb { background-color: rgba(120, 120, 120, 0.4); border-radius: 6px; }
</style>
