<script>
  import { onMount, onDestroy, flushSync, tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { slide } from "svelte/transition";
  import { Search, LayoutGrid, List, X, RotateCcw, Trash2, Star, StarOff, Copy, Check, CheckSquare, Square, Plus, Palette, ChevronDown, ChevronUp, GripVertical, Paintbrush } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listen } from "@tauri-apps/api/event";
  import { archiveState } from "../lib/archiveStore.svelte.js";
  import { editable } from "../lib/editable.js";
  import { clampFontSizeHtml, STABLE_MAX_PT } from "../lib/fontSize.js";
  import ArchiveToolbar from "./ArchiveToolbar.svelte";
  // ✨ [Compatibility] appState를 import하지 않습니다.
  // 아카이브 창에서 appState.init()이 호출되면 windowLabel="archive"로 세팅되어
  // performSave()가 유령 데이터를 생성하기 때문입니다.
  // 복원 로직은 archiveStore.restoreToTinyNote()가 독립적으로 처리합니다.

  // 날짜 포맷 함수
  function formatDate(timestamp) {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
  }

  // ✨ [Resilience] HTML 태그를 제거하여 순수 텍스트만 추출하는 유틸리티
  function stripHtml(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.innerText || temp.textContent || '').trim();
  }

  // 아카이브 전용 컬러 팔레트 (테마 이름에 매칭)
  const themeColorsLight = {
    white: "#ffffff", amber: "#fef3c7", blue: "#dbeafe",
    green: "#dcfce7", rose: "#ffe4e6", purple: "#f3e8ff", slate: "#f1f5f9"
  };
  const themeColorsDark = {
    white: "#2d333b", amber: "#78350f", blue: "#1e3a8a",
    green: "#14532d", rose: "#881337", purple: "#4c1d95", slate: "#1e293b"
  };
  let currentThemeColors = $derived(archiveState.globalSettings.isDarkMode ? themeColorsDark : themeColorsLight);

  // 카드 배경색(테마 색상) — 접힘 페이드 그라데이션이 카드 배경으로 자연스럽게 녹아들도록 사용
  function cardBg(note) {
    return currentThemeColors[note.themeColor] || currentThemeColors.amber;
  }

  // 아카이브 내부 토스트 (앱 전체 토스트 시스템과 독립)
  let toastMessage = $state("");
  let toastTimer = null;
  function showToast(msg) {
    toastMessage = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMessage = ""; }, 2500);
  }

  // 삭제 확인용 자체 모달 (브라우저 confirm() 대신 Tidy Task 스타일 유지)
  let showDeleteModal = $state(false);
  let pendingDeleteId = $state(null);

  // ✨ 서식 툴바 접기/펼치기 상태
  let showToolbar = $state(false);

  let unlistenArchiveUpdate;

  onMount(async () => {
    if (!archiveState.isReady) await archiveState.init();

    // ✨ [Phase 2: 결함 E 해결] 다른 창(Tiny Note)에서 아카이빙 시 실시간 목록 업데이트
    // 왜 init() 대신 refreshFromDisk()인가:
    //   init()은 tauriStore 인스턴스 재생성, globalSettings 로드 등 무거운 초기화를 포함하고,
    //   진행 중인 로컬 편집 상태(모달에서 수정 중인 내용 등)를 소멸시킬 수 있습니다.
    //   refreshFromDisk()는 archivedNotes 키만 갱신하여 안전합니다.
    unlistenArchiveUpdate = await listen('archive-updated', async () => {
      await archiveState.refreshFromDisk();
      // 왜 tick() + setTimeout 조합인가:
      //   refreshFromDisk() → notes 갱신 → $effect → displayNotes 갱신 → Svelte DOM 업데이트
      //   → dndzone items 감지 → DOM 재배치 순서로 여러 비동기 단계를 거칩니다.
      //   tick()은 Svelte의 DOM 업데이트 완료만 보장하고,
      //   dndzone의 DOM 조작은 그 이후 별도 타이밍에 발생합니다.
      //   따라서 여러 시점에서 재계산하여 모든 타이밍을 커버합니다.
      await tick();
      recalcMasonry();
      setTimeout(recalcMasonry, 100);
      setTimeout(recalcMasonry, 300);
    });

    // 테마 색상 팝오버는 바깥을 클릭하면 닫히도록 처리
    document.addEventListener('mousedown', handleDocMousedown);
  });

  // 색상 팝오버/토글 버튼 영역(.archive-color-pop) 바깥을 누르면 팝오버를 닫습니다.
  function handleDocMousedown(e) {
    if (colorPopoverId !== null && !e.target.closest('.archive-color-pop')) {
      colorPopoverId = null;
    }
  }

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
    if (unlistenArchiveUpdate) unlistenArchiveUpdate();
    // 디바운스 대기 중이던 본문 저장 타이머 정리
    for (const t of contentTimers.values()) clearTimeout(t);
    document.removeEventListener('mousedown', handleDocMousedown);
  });

  let searchQuery = $state("");
  let viewMode = $state("grid"); // 'grid' or 'list'

  // ═══════════════════════════════════════════════════════════
  // ✨ [Feature] 드래그 재정렬 (svelte-dnd-action) + 북마크 상단 고정
  //   - displayNotes: dndzone이 직접 관리하는 표시 목록(로컬 $state)
  //   - 평상시엔 $effect로 소스(archiveState.notes)에서 재동기화하고,
  //     드래그 중에는 dnd가 관리하도록 동기화를 멈춰 튐 현상을 방지합니다.
  // ═══════════════════════════════════════════════════════════
  const flipDurationMs = 260;
  let dragDisabled = $state(true);
  let isDragging = $state(false);
  let displayNotes = $state([]);

  // 북마크 우선(안정 정렬로 배열 순서 보존) + 검색 필터
  function computeDisplay() {
    // ✨ 안정 정렬: 그룹(북마크 여부) 내에서는 archiveState.notes의 배열 순서를 그대로 유지
    //   → 수동 드래그 순서가 보존되고, 북마크만 항상 상단에 고정됩니다.
    const base = [...archiveState.notes].sort((a, b) =>
      a.bookmarked === b.bookmarked ? 0 : a.bookmarked ? -1 : 1
    );
    if (!searchQuery) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (n) => (n.title || "").toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q)
    );
  }

  // 소스/검색어 변경 시 표시 목록 재동기화 (드래그 중에는 건너뜀)
  $effect(() => {
    // 의존성 추적을 위해 명시적으로 참조
    const _notes = archiveState.notes;
    const _q = searchQuery;
    if (!isDragging) displayNotes = computeDisplay();
  });

  // ✨ [Masonry Fix] displayNotes가 변경될 때 전체 카드의 gridRowEnd를 일괄 재계산
  //   왜 필요한가: dndzone이 items 변경 시 DOM을 재배치하는데,
  //   새 카드의 gridRowEnd가 아직 설정되지 않은 상태에서 기존 카드와 겹침이 발생합니다.
  //   개별 ResizeObserver에만 의존하면 dndzone의 DOM 조작 타이밍과 충돌합니다.
  let masonryRef = $state(null);

  // ✨ 2-Pass 메이슨리 재계산:
  //   1단계: 모든 카드의 gridRowEnd를 제거하여 자연 콘텐츠 높이로 복원
  //   2단계: 강제 reflow 후 정확한 높이 기반으로 span 설정
  //   왜 2-Pass인가: 기존 gridRowEnd 값이 남아있으면 카드 높이가
  //   grid-auto-rows에 의해 왜곡되어 잘못된 span을 계산할 수 있습니다.
  function recalcMasonry() {
    if (!masonryRef || viewMode !== 'grid') return;
    const children = Array.from(masonryRef.children);
    // Pass 1: gridRowEnd 제거 → 콘텐츠 자연 높이로 복원
    for (const child of children) {
      child.style.gridRowEnd = '';
    }
    // 강제 reflow (브라우저가 높이를 다시 계산하도록 강제)
    void masonryRef.offsetHeight;
    // Pass 2: 정확한 높이 기반으로 span 설정
    for (const child of children) {
      const h = child.getBoundingClientRect().height;
      if (h <= 0) continue;
      const span = Math.max(1, Math.ceil((h + ROW_GAP) / ROW_UNIT));
      child.style.gridRowEnd = `span ${span}`;
    }
  }

  // displayNotes 변경 시 다중 시점에서 재계산
  //   왜 tick() + 다중 시점인가: Svelte DOM 업데이트(tick), dndzone DOM 조작(rAF 이후),
  //   contenteditable innerHTML 갱신(비동기) 등이 서로 다른 타이밍에 발생하므로
  //   한 번의 재계산으로는 모든 케이스를 커버할 수 없습니다.
  $effect(() => {
    const _dn = displayNotes;
    const _vm = viewMode;
    tick().then(() => {
      recalcMasonry();
      requestAnimationFrame(recalcMasonry);
    });
  });

  // 검색 중이거나 선택 모드에서는 드래그 재정렬을 막습니다(순서 꼬임/클릭 충돌 방지).
  let dndDisabledByContext = $derived(!!searchQuery || isSelectionMode);

  // ✨ 그립 핸들에서만 드래그를 시작(카드 본문 클릭=편집과 충돌 방지) — TodoList 패턴 이식
  function dragHandle(node) {
    const down = () => {
      if (dndDisabledByContext) return;
      flushSync(() => {
        isDragging = true;
        dragDisabled = false;
      });
    };
    node.addEventListener("mousedown", down);
    node.addEventListener("touchstart", down, { passive: true });
    return {
      destroy() {
        node.removeEventListener("mousedown", down);
        node.removeEventListener("touchstart", down);
      }
    };
  }

  function handleDndConsider(e) {
    isDragging = true;
    displayNotes = e.detail.items;
  }
  async function handleDndFinalize(e) {
    displayNotes = e.detail.items;
    dragDisabled = true;
    // 새 순서를 디스크에 영속(완료까지 기다린 뒤 isDragging 해제 → 재동기화 튐 방지)
    await archiveState.reorderNotes(e.detail.items.map((n) => n.id));
    isDragging = false;
  }

  // ── 그리드 메이슨리: 카드 높이를 측정해 grid-row span으로 빈 공간을 최소화 ──
  const ROW_UNIT = 8;  // grid-auto-rows(px)
  const ROW_GAP = 12;  // 카드 세로 간격(px)
  function masonrySpan(node) {
    // 개별 카드의 높이 변화를 감지하여 gridRowEnd를 업데이트합니다.
    // 왜 recalcMasonry()도 호출하는가:
    //   한 카드의 높이 변화가 다른 카드의 위치에 영향을 미칠 수 있으므로,
    //   개별 카드 업데이트 후 전체 재계산이 필요합니다.
    const apply = () => {
      const h = node.getBoundingClientRect().height;
      if (h <= 0) return;
      const span = Math.max(1, Math.ceil((h + ROW_GAP) / ROW_UNIT));
      node.style.gridRowEnd = `span ${span}`;
    };
    // 즉시 적용: action 실행 시 노드는 이미 DOM에 삽입된 상태이므로
    // getBoundingClientRect()가 강제 reflow를 트리거하여 정확한 높이를 반환합니다.
    apply();
    const ro = new ResizeObserver(() => {
      apply();
      // 높이 변화 후 전체 메이슨리도 재계산 (다른 카드 위치 보정)
      requestAnimationFrame(recalcMasonry);
    });
    ro.observe(node);
    return { destroy() { ro.disconnect(); } };
  }

  async function toggleBookmark(id) {
    await archiveState.toggleBookmark(id);
  }

  // ✨ [Integrity] 브라우저 confirm 대신 앱 디자인 일관성을 유지하는 자체 모달 사용
  function requestDelete(id) {
    pendingDeleteId = id;
    showDeleteModal = true;
  }

  async function confirmDelete() {
    if (pendingDeleteId !== null) {
      await archiveState.removeNote(pendingDeleteId);
      showToast("🗑️ 노트가 삭제되었어요.");
    }
    showDeleteModal = false;
    pendingDeleteId = null;
  }

  function cancelDelete() {
    showDeleteModal = false;
    pendingDeleteId = null;
  }

  async function restoreNote(id) {
    const note = archiveState.getNote(id);
    if (!note) return;

    // ✨ [Compatibility] appState 인스턴스를 직접 사용하지 않고
    // 독립적으로 LazyStore를 조작하는 전용 함수를 호출합니다.
    const success = await archiveState.restoreToTinyNote(note);
    if (success) {
      await archiveState.removeNote(id);
      showToast("✨ 노트를 꺼냈어요! 새 Tiny Note로 열립니다.");
    } else {
      showToast("⚠️ 빈 노트 슬롯이 없어요. 정리 후 다시 시도해주세요.");
    }
  }

  async function handleClose() {
    await getCurrentWindow().close();
  }

  // ✨ [Feature] 클립보드 빠른 복사
  async function copyNoteContent(note) {
    try {
      const text = stripHtml(note.content);
      await navigator.clipboard.writeText(text);
      showToast("📋 텍스트가 복사되었어요.");
    } catch (e) {
      showToast("⚠️ 복사에 실패했어요.");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ✨ [Feature] 펼치기/접기 + 인라인 편집
  //   - 접힘 상태에서는 COLLAPSED_MAX 높이로 클램프하고, 넘칠 때만 펼치기 토글 노출
  //   - 본문/제목은 항상 편집 가능(클릭 즉시 편집). 포커스되면 자동으로 펼쳐져 글자가 잘리지 않음
  // ═══════════════════════════════════════════════════════════
  const COLLAPSED_MAX = 80; // 접힘 상태 본문 최대 높이(px) — CSS .archive-clamp의 max-height와 반드시 동일

  let expandedIds = $state(new SvelteSet()); // 사용자가 수동으로 펼친 노트
  let overflowIds = $state(new SvelteSet());  // 접힘 기준 높이를 초과해 토글이 필요한 노트
  let focusedId = $state(null);                // 현재 편집(포커스) 중인 노트

  // 열림 판정: 수동으로 펼쳤거나, 편집 중이면 열림(잘림 방지)
  function isOpen(id) {
    return expandedIds.has(id) || focusedId === id;
  }

  function toggleExpand(id) {
    if (expandedIds.has(id)) expandedIds.delete(id);
    else expandedIds.add(id);
  }

  // ✨ 본문 높이를 관찰해 접힘 기준 초과 여부를 반응형으로 갱신하는 액션
  // 왜 scrollHeight 기준인가: max-height로 클램프해도 scrollHeight는 전체 콘텐츠 높이를
  //   보고하므로, 열림/접힘 상태와 무관하게 "접었을 때 넘치는지"를 일관되게 판정할 수 있습니다.
  function measureOverflow(node, id) {
    const measure = () => {
      if (node.scrollHeight > COLLAPSED_MAX + 6) overflowIds.add(id);
      else overflowIds.delete(id);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    requestAnimationFrame(measure);
    return {
      update() { measure(); },
      destroy() { ro.disconnect(); overflowIds.delete(id); }
    };
  }

  // ── 편집 저장 파이프라인 (모두 updateNote → _safeModify → 디스크 영속 + 타 창 동기화) ──
  let contentTimers = new Map();   // 노트별 디바운스 타이머
  let pendingContent = new Map();  // 노트별 최신 본문 버퍼

  // 본문 입력은 디바운스 저장(타자마다 디스크 IO 방지)
  function queueContentSave(id, html) {
    pendingContent.set(id, html);
    clearTimeout(contentTimers.get(id));
    contentTimers.set(id, setTimeout(() => flushContent(id), 500));
  }
  // blur 시 즉시 flush
  function flushContent(id) {
    clearTimeout(contentTimers.get(id));
    contentTimers.delete(id);
    if (pendingContent.has(id)) {
      const html = pendingContent.get(id);
      pendingContent.delete(id);
      archiveState.updateNote(id, { content: html });
    }
  }
  // 제목은 짧으므로 blur/change 시점에 저장
  function saveTitle(id, title) {
    archiveState.updateNote(id, { title });
  }

  // ✨ 카드 포커스 진입/이탈로 편집 대상 추적 (선택 모드에서는 편집 비활성)
  function handleCardFocusIn(id) {
    if (isSelectionMode) return;
    focusedId = id;
  }
  function handleCardFocusOut(id, e) {
    // 카드 내부로 포커스가 이동한 경우(예: 제목→본문)는 유지
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (focusedId === id) focusedId = null;
    flushContent(id); // 카드를 벗어나면 미저장 본문 확정
  }

  // ── 테마 색상 인라인 팝오버 (기존 편집 모달의 색상 기능 대체) ──
  let colorPopoverId = $state(null);
  async function setNoteColor(id, colorKey) {
    await archiveState.updateNote(id, { themeColor: colorKey });
    colorPopoverId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // ✨ [Feature] 선택 모드 (다중 선택 삭제)
  // ═══════════════════════════════════════════════════════════
  let isSelectionMode = $state(false);
  let selectedIds = $state(new Set());

  // 선택된 노트 수 (반응형)
  let selectedCount = $derived(selectedIds.size);

  // 선택 모드 진입/해제
  function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    // 선택 모드에서는 인라인 편집이 비활성화되므로, 진입 시 편집 포커스/팝오버를 정리합니다.
    focusedId = null;
    colorPopoverId = null;
    if (!isSelectionMode) {
      // [Traceability] 선택 모드 해제 시 선택 상태 완전 초기화
      selectedIds = new Set();
    }
  }

  // 개별 노트 선택/해제 토글
  function toggleSelect(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds = next;
  }

  // 전체 선택 (현재 필터링된 노트 기준)
  function selectAll() {
    selectedIds = new Set(displayNotes.map(n => n.id));
  }

  // 전체 해제
  function deselectAll() {
    selectedIds = new Set();
  }

  // 선택 삭제 요청 (삭제 확인 모달 띄우기)
  // 왜 pendingDeleteId를 'multi'로 세팅하는가:
  //   기존 단일 삭제 모달과 동일한 UI를 재사용하되, 분기 판정을 위해 마커를 사용합니다.
  function requestBulkDelete() {
    if (selectedCount === 0) return;
    pendingDeleteId = 'multi';
    showDeleteModal = true;
  }

  // 기존 confirmDelete를 단일/다중 분기 처리하도록 확장
  async function confirmDeleteExtended() {
    if (pendingDeleteId === 'multi') {
      // [Efficiency] 다중 삭제: removeNotes()로 단일 save() 호출
      await archiveState.removeNotes([...selectedIds]);
      showToast(`🗑️ ${selectedCount}개의 노트가 삭제되었어요.`);
      selectedIds = new Set();
      isSelectionMode = false;
    } else if (pendingDeleteId !== null) {
      // 기존 단일 삭제 로직 유지
      await archiveState.removeNote(pendingDeleteId);
      showToast("🗑️ 노트가 삭제되었어요.");
    }
    showDeleteModal = false;
    pendingDeleteId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // ✨ [Feature] 아카이브 내 Tiny Note 직접 추가
  // ═══════════════════════════════════════════════════════════
  let showAddModal = $state(false);
  let addTitle = $state("");
  let addContent = $state("");
  let addThemeColor = $state("amber");

  function openAddModal() {
    addTitle = "";
    addContent = "";
    addThemeColor = "amber";
    showAddModal = true;
  }

  async function saveNewNote() {
    const cleanText = stripHtml(addContent);
    if (!cleanText && !addTitle.trim()) {
      showToast("⚠️ 제목이나 내용을 입력해주세요.");
      return;
    }
    
    // ✨ [TCREI: Integrity] sourceLabel 충돌 방지를 위한 마커 부착
    await archiveState.addNote({
      title: addTitle || '제목 없음',
      content: addContent,
      themeColor: addThemeColor,
      isDarkMode: false, // 생성 시점엔 라이트 모드로 통일 (Tiny Note 로직)
      sourceLabel: `archive-created-${Date.now()}`
    });
    
    showToast("✨ 새 노트가 추가되었어요.");
    showAddModal = false;
  }

  function cancelAdd() {
    showAddModal = false;
  }
</script>

<!-- ✨ [Integrity] 삭제 확인 모달 (Tidy Task 디자인 일관성 유지) -->
{#if showDeleteModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
    onclick={cancelDelete}
    onkeydown={(e) => { if (e.key === 'Escape') cancelDelete(); }}
    role="dialog"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="rounded-2xl shadow-xl p-5 w-[260px] border"
      style="
        background-color: {archiveState.globalSettings.isDarkMode ? '#1e2028' : '#ffffff'};
        border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : '#fef3c7'};
      "
      onclick={(e) => e.stopPropagation()}
    >
      <p class="text-[13px] font-bold mb-1" style="color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#1f2937'};">
        {pendingDeleteId === 'multi' ? `${selectedCount}개의 노트를 삭제할까요?` : '정말 삭제할까요?'}
      </p>
      <p class="text-[11px] mb-4" style="color: {archiveState.globalSettings.isDarkMode ? '#9ca3af' : '#6b7280'};">삭제하면 되돌릴 수 없어요.</p>
      <div class="flex gap-2">
        <button
          onclick={cancelDelete}
          class="flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all"
          style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}; color: {archiveState.globalSettings.isDarkMode ? '#d1d5db' : '#374151'};"
        >아니오</button>
        <button
          onclick={confirmDeleteExtended}
          class="flex-1 py-1.5 rounded-lg text-[12px] font-bold bg-red-500 hover:bg-red-600 active:scale-95 text-white transition-all"
        >예, 삭제</button>
      </div>
    </div>
  </div>
{/if}

<!-- ✨ [Integrity] 새 노트 추가 모달 -->
{#if showAddModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    onclick={cancelAdd}
    onkeydown={(e) => { if (e.key === 'Escape') cancelAdd(); }}
    role="dialog"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="rounded-2xl shadow-xl flex flex-col overflow-hidden w-[300px] border transition-colors"
      style="
        background-color: {archiveState.globalSettings.isDarkMode ? '#1e2028' : '#fdfaf3'};
        border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(251,191,36,0.3)'};
      "
      onclick={(e) => e.stopPropagation()}
    >
      <!-- 모달 헤더 (테마 색상 반영) -->
      <div class="px-4 py-2 border-b flex items-center justify-between"
           style="background-color: {currentThemeColors[addThemeColor] || currentThemeColors.amber}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};">
        <span class="text-[13px] font-bold" style="color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#1f2937'}">✨ 새 노트 추가</span>
        <button onclick={cancelAdd} class="p-1 rounded-full hover:bg-black/10 transition-colors" style="color: {archiveState.globalSettings.isDarkMode ? '#9ca3af' : '#6b7280'}">
          <X size={14} />
        </button>
      </div>
      
      <!-- 추가 폼 -->
      <div class="p-4 flex flex-col gap-3">
        <div>
          <span class="text-[11px] font-bold block mb-1 opacity-70">제목</span>
          <input 
            type="text" 
            bind:value={addTitle}
            maxlength="10"
            placeholder="제목 입력 (최대 10자)"
            class="w-full border rounded-lg px-3 py-1.5 text-[13px] outline-none transition-all focus:ring-2 focus:ring-amber-400/50"
            style="background-color: {archiveState.globalSettings.isDarkMode ? '#2d333b' : '#ffffff'}; color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#374151'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'};"
          />
        </div>

        <div>
          <span class="text-[11px] font-bold block mb-1 opacity-70">내용</span>
          <div 
            contenteditable="true"
            bind:innerHTML={addContent}
            class="w-full border rounded-lg px-3 py-2 text-[12px] outline-none transition-all focus:ring-2 focus:ring-amber-400/50 min-h-[80px] max-h-[150px] overflow-y-auto"
            style="background-color: {archiveState.globalSettings.isDarkMode ? '#2d333b' : '#ffffff'}; color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#374151'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'};"
          ></div>
        </div>

        <!-- 테마 색상 팔레트 -->
        <div>
          <span class="text-[11px] font-bold block mb-1.5 opacity-70">테마 색상</span>
          <div class="flex gap-2 justify-center">
            {#each Object.entries(currentThemeColors) as [colorKey, colorHex]}
              <button 
                onclick={() => addThemeColor = colorKey}
                class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 {addThemeColor === colorKey ? 'scale-110 shadow-sm border-black/30' : 'border-black/5'}"
                style="background-color: {colorHex};"
                title={colorKey}
              >
                {#if addThemeColor === colorKey}
                  <div class="w-full h-full flex items-center justify-center text-black/50">
                    <Check size={12} strokeWidth={3} />
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- 모달 푸터 -->
      <div class="px-4 py-3 flex gap-2 border-t" style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};">
        <button 
          onclick={cancelAdd}
          class="flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all"
          style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}; color: {archiveState.globalSettings.isDarkMode ? '#d1d5db' : '#374151'};"
        >취소</button>
        <button 
          onclick={saveNewNote}
          class="flex-1 py-1.5 rounded-lg text-[12px] font-bold bg-amber-500 hover:bg-amber-600 active:scale-95 text-white transition-all flex items-center justify-center gap-1"
        >
          <Plus size={14} strokeWidth={2.5} /> 추가
        </button>
      </div>
    </div>
  </div>
{/if}

<div 
  class="flex flex-col h-screen w-screen overflow-hidden rounded-lg border shadow-2xl transition-colors duration-300"
  style="
    font-family: {archiveState.globalSettings.fontFamily};
    background-color: {archiveState.globalSettings.isDarkMode ? '#1e2028' : '#fdfaf3'};
    color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#374151'};
    border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(251,191,36,0.5)'};
  "
>
  
  <!-- Header (타이틀바) -->
  <div 
    data-tauri-drag-region 
    class="flex items-center justify-between px-3 h-[42px] shrink-0 w-full select-none shadow-sm z-10 relative rounded-t-lg"
    style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);"
  >
    <div class="flex items-center gap-2 pointer-events-none text-white" data-tauri-drag-region>
      <span class="text-[15px] font-bold drop-shadow-sm">📦 tiny note 아카이브</span>
      <!-- ✨ [Traceability] 보관 건수 뱃지 -->
      {#if archiveState.notes.length > 0}
        <span class="text-[10px] bg-white/30 px-1.5 py-0.5 rounded-full font-bold tabular-nums">{archiveState.notes.length}</span>
      {/if}
    </div>
    
    <button
      onclick={handleClose}
      class="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/20 transition-colors pointer-events-auto"
      title="닫기"
    >
      <X size={16} strokeWidth={2.5} />
    </button>
  </div>


  <!-- Search & View Toggle -->
  <div class="flex items-center justify-between px-4 py-3 border-b shrink-0 transition-colors"
       style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(251,191,36,0.5)'};">
    <!-- Search Bar -->
    <div class="relative flex-1 max-w-[200px]">
      <Search size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2" style="color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(245,158,11,0.6)'};" />
      <input 
        type="text" 
        bind:value={searchQuery}
        placeholder="노트 검색..." 
        class="w-full border rounded-full py-1.5 pl-8 pr-3 text-[12px] outline-none transition-all"
        style="
          background-color: {archiveState.globalSettings.isDarkMode ? '#2d333b' : '#ffffff'};
          color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#374151'};
          border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : '#fde68a'};
        "
      />
    </div>

    <!-- Toggle Buttons + 선택 모드 버튼 -->
    <div class="flex items-center gap-1.5">
      <div class="flex items-center rounded-lg p-1 border transition-colors"
           style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(0,0,0,0.2)' : '#fffbeb'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.05)' : '#fef3c7'};">
        <button 
          onclick={() => viewMode = 'grid'}
          class="p-1.5 rounded-md transition-all flex items-center justify-center {viewMode === 'grid' ? (archiveState.globalSettings.isDarkMode ? 'bg-amber-600/30 text-amber-400' : 'bg-white shadow-sm text-amber-600') : (archiveState.globalSettings.isDarkMode ? 'text-gray-400 hover:text-amber-400' : 'text-amber-400 hover:text-amber-600')}"
          title="포스트잇 뷰"
        >
          <LayoutGrid size={14} strokeWidth={2.5} />
        </button>
        <button 
          onclick={() => viewMode = 'list'}
          class="p-1.5 rounded-md transition-all flex items-center justify-center {viewMode === 'list' ? (archiveState.globalSettings.isDarkMode ? 'bg-amber-600/30 text-amber-400' : 'bg-white shadow-sm text-amber-600') : (archiveState.globalSettings.isDarkMode ? 'text-gray-400 hover:text-amber-400' : 'text-amber-400 hover:text-amber-600')}"
          title="리스트 뷰"
        >
          <List size={14} strokeWidth={2.5} />
        </button>
      </div>

      <!-- ✨ 선택 모드 진입/해제 토글 버튼 (비활성=빈 체크, 활성=채운 체크+앰버 강조) -->
      <button
        onclick={toggleSelectionMode}
        class="p-1.5 rounded-lg border transition-all {isSelectionMode ? (archiveState.globalSettings.isDarkMode ? 'bg-amber-500/25 text-amber-400 border-amber-500/50 shadow-sm shadow-amber-500/10' : 'bg-amber-100 text-amber-600 border-amber-400 shadow-sm shadow-amber-200/50') : (archiveState.globalSettings.isDarkMode ? 'text-gray-500 hover:text-gray-300 border-transparent' : 'text-gray-400 hover:text-gray-600 border-transparent')}"
        title={isSelectionMode ? '선택 모드 해제' : '선택 모드'}
      >
        {#if isSelectionMode}
          <CheckSquare size={14} strokeWidth={2.5} />
        {:else}
          <Square size={14} strokeWidth={2} />
        {/if}
      </button>

      <!-- ✨ [Feature] 새 노트 추가 버튼 -->
      <button
        onclick={openAddModal}
        class="p-1.5 ml-0.5 rounded-lg border transition-all {archiveState.globalSettings.isDarkMode ? 'bg-amber-600/30 text-amber-400 border-amber-500/40 hover:bg-amber-600/50' : 'bg-amber-50 text-amber-600 border-amber-300 hover:bg-amber-100'}"
        title="새 노트 추가"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>

      <!-- ✨ 서식 툴바 토글 버튼 -->
      <button
        onclick={() => showToolbar = !showToolbar}
        class="p-1.5 rounded-lg border transition-all {showToolbar ? (archiveState.globalSettings.isDarkMode ? 'bg-amber-500/25 text-amber-400 border-amber-500/50 shadow-sm' : 'bg-amber-100 text-amber-600 border-amber-300 shadow-sm') : (archiveState.globalSettings.isDarkMode ? 'text-gray-500 hover:text-gray-300 border-transparent' : 'text-gray-400 hover:text-gray-600 border-transparent')}"
        title={showToolbar ? '서식 툴바 숨기기' : '서식 툴바 보기'}
      >
        {#if showToolbar}
          <ChevronUp size={14} strokeWidth={2.5} />
        {:else}
          <Paintbrush size={14} strokeWidth={2} />
        {/if}
      </button>
    </div>
  </div>

  <!-- ✨ [Full Toolbar] 서식 툴바 (접기/펼치기, 검색바 아래 배치) -->
  {#if showToolbar}
    <div class="relative z-50">
      <ArchiveToolbar />
    </div>
  {/if}

  <!-- ✨ [Feature] 선택 모드 액션 바 (선택 모드 활성 시에만 표시) -->
  {#if isSelectionMode}
    <div class="flex items-center justify-between px-4 py-2 border-b shrink-0 transition-colors"
         style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(245,158,11,0.08)' : '#fffbeb'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(251,191,36,0.3)'};">
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-bold" style="color: {archiveState.globalSettings.isDarkMode ? '#fde68a' : '#b45309'};">
          {selectedCount}개 선택됨
        </span>
        <button onclick={selectAll} class="text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors hover:bg-amber-500/10" style="color: {archiveState.globalSettings.isDarkMode ? '#fbbf24' : '#d97706'};">
          전체 선택
        </button>
        {#if selectedCount > 0}
          <button onclick={deselectAll} class="text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors hover:bg-gray-500/10" style="color: {archiveState.globalSettings.isDarkMode ? '#9ca3af' : '#6b7280'};">
            선택 해제
          </button>
        {/if}
      </div>
      <div class="flex items-center gap-1.5">
        <button 
          onclick={requestBulkDelete}
          disabled={selectedCount === 0}
          class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all {selectedCount > 0 ? 'bg-red-500 hover:bg-red-600 active:scale-95 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}"
        >
          <Trash2 size={12} /> 삭제
        </button>
        <button onclick={toggleSelectionMode} class="text-[11px] font-bold px-2 py-1 rounded-lg transition-colors" style="color: {archiveState.globalSettings.isDarkMode ? '#9ca3af' : '#6b7280'};">
          완료
        </button>
      </div>
    </div>
  {/if}

  <!-- Main Content Area -->
  <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
    
    {#if displayNotes.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-amber-500/50 gap-2">
        <span class="text-4xl opacity-50">📭</span>
        <p class="text-[12px] font-bold">
          {searchQuery ? '검색 결과가 없습니다.' : '보관된 노트가 없습니다.'}
        </p>
      </div>
    {:else}
      
      {#if viewMode === 'grid'}
        <!-- Post-it Grid View (메이슨리 패킹 + 드래그 재정렬) -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={masonryRef}
          class="archive-masonry"
          use:dndzone={{ items: displayNotes, flipDurationMs, dragDisabled, dropTargetStyle: {}, morphDisabled: true, type: 'archive-notes' }}
          onconsider={handleDndConsider}
          onfinalize={handleDndFinalize}
        >
          {#each displayNotes as note (note.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              animate:flip={{ duration: flipDurationMs, easing: cubicOut }}
              use:masonrySpan
              class="flex flex-col rounded-xl p-3 shadow-sm border relative group transition-shadow hover:shadow-md {isSelectionMode ? 'cursor-pointer' : ''} {focusedId === note.id ? 'ring-2 ring-amber-400/70' : ''}"
              style="background-color: {cardBg(note)}; border-color: {isSelectionMode && selectedIds.has(note.id) ? (archiveState.globalSettings.isDarkMode ? '#fbbf24' : '#f59e0b') : 'rgba(0,0,0,0.05)'};"
              onclick={() => { if (isSelectionMode) toggleSelect(note.id); }}
              onfocusout={(e) => handleCardFocusOut(note.id, e)}
            >
              <!-- Bookmark Pin -->
              {#if note.bookmarked}
                <div class="absolute -top-1.5 -right-1.5 bg-yellow-400 text-white rounded-full p-1 shadow-sm border-2 border-white z-10">
                  <Star size={10} fill="currentColor" />
                </div>
              {/if}

              <!-- ✨ 제목 행: (드래그 핸들) + 선택 모드 체크박스 + 제목(인라인 편집) -->
              <div class="flex items-start gap-1.5 mb-1.5">
                {#if !isSelectionMode}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    use:dragHandle
                    class="shrink-0 mt-[2px] opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing {dndDisabledByContext ? 'pointer-events-none' : ''}"
                    style="color: {archiveState.globalSettings.isDarkMode ? '#6b7280' : '#9ca3af'};"
                    title="드래그하여 순서 변경"
                    role="button"
                    tabindex="-1"
                    aria-label="드래그 핸들"
                  >
                    <GripVertical size={13} />
                  </div>
                {/if}
                {#if isSelectionMode}
                  <div class="shrink-0 mt-[2px]">
                    {#if selectedIds.has(note.id)}
                      <CheckSquare size={14} class="text-amber-500" fill="rgba(245,158,11,0.15)" />
                    {:else}
                      <Square size={14} style="color: {archiveState.globalSettings.isDarkMode ? '#6b7280' : '#9ca3af'}" />
                    {/if}
                  </div>
                  <h3 class="font-bold text-[12px] truncate flex-1" style="color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#1f2937'};">{note.title || '제목 없음'}</h3>
                {:else}
                  <!-- 제목 클릭 즉시 편집 -->
                  <input
                    type="text"
                    value={note.title}
                    maxlength="10"
                    placeholder="제목 없음"
                    onfocus={() => handleCardFocusIn(note.id)}
                    onchange={(e) => saveTitle(note.id, e.currentTarget.value)}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                    class="flex-1 min-w-0 bg-transparent border-none outline-none font-bold text-[12px] rounded px-0.5 focus:bg-black/5"
                    style="color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#1f2937'};"
                    title="클릭하여 제목 편집"
                  />
                {/if}
              </div>

              <!-- ✨ 본문: Tiny Note와 동일 규격(.rte-faithful)으로 렌더 + 클릭 즉시 편집 -->
              <div class="relative">
                {#if isSelectionMode}
                  <div class="text-[11px] rte-faithful archive-clamp" style="color: {archiveState.globalSettings.isDarkMode ? '#cbd5e1' : '#4b5563'};">{@html clampFontSizeHtml(note.content, STABLE_MAX_PT)}</div>
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    contenteditable="true"
                    spellcheck="false"
                    use:editable={{ html: clampFontSizeHtml(note.content, STABLE_MAX_PT), onUpdate: (v) => queueContentSave(note.id, v), onSave: () => flushContent(note.id) }}
                    use:measureOverflow={note.id}
                    onfocus={() => handleCardFocusIn(note.id)}
                    class="text-[11px] rte-faithful outline-none rounded {isOpen(note.id) ? '' : 'archive-clamp'} focus:bg-black/5"
                    style="color: {archiveState.globalSettings.isDarkMode ? '#cbd5e1' : '#4b5563'};"
                    role="textbox"
                    tabindex="0"
                  ></div>
                {/if}

                <!-- 접힘 페이드 (넘칠 때 & 닫혀 있을 때) -->
                {#if overflowIds.has(note.id) && !isOpen(note.id)}
                  <div class="pointer-events-none absolute inset-x-0 bottom-0 h-6" style="background: linear-gradient(to bottom, transparent, {cardBg(note)});"></div>
                {/if}
              </div>

              <!-- 펼치기/접기 토글 (편집 중이 아니고 접힘 기준 초과 시) -->
              {#if overflowIds.has(note.id) && focusedId !== note.id}
                <button
                  onclick={(e) => { e.stopPropagation(); toggleExpand(note.id); }}
                  class="mt-1 self-start flex items-center gap-0.5 text-[10px] font-bold rounded-md px-1.5 py-0.5 transition-colors {archiveState.globalSettings.isDarkMode ? 'text-amber-300 hover:bg-white/10' : 'text-amber-600 hover:bg-black/5'}"
                >
                  {#if expandedIds.has(note.id)}
                    <ChevronUp size={12} /> 접기
                  {:else}
                    <ChevronDown size={12} /> 펼치기
                  {/if}
                </button>
              {/if}

              <!-- 하단 액션 행 -->
              <div class="flex items-center justify-between mt-2 pt-2 border-t border-black/5 relative">
                <span class="text-[9px] font-medium" style="color: #6b7280;">{formatDate(note.archivedAt)}</span>

                {#if !isSelectionMode}
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-1 py-0.5 rounded-lg backdrop-blur-sm"
                     style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'};">
                  <button onclick={() => toggleBookmark(note.id)} class="p-1 rounded-md {note.bookmarked ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}" title="북마크">
                    {#if note.bookmarked} <Star size={12} fill="currentColor" /> {:else} <StarOff size={12} /> {/if}
                  </button>
                  <button onclick={() => copyNoteContent(note)} class="p-1 hover:bg-gray-50 text-gray-400 hover:text-gray-600 rounded-md" title="복사">
                    <Copy size={12} />
                  </button>
                  <button onmousedown={(e) => e.preventDefault()} onclick={() => colorPopoverId = colorPopoverId === note.id ? null : note.id} class="archive-color-pop p-1 hover:bg-amber-50 text-gray-400 hover:text-amber-500 rounded-md" title="테마 색상">
                    <Palette size={12} />
                  </button>
                  <button onclick={() => restoreNote(note.id)} class="p-1 hover:bg-blue-50 text-gray-400 hover:text-blue-500 rounded-md" title="꺼내기">
                    <RotateCcw size={12} />
                  </button>
                  <button onclick={() => requestDelete(note.id)} class="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-md" title="삭제">
                    <Trash2 size={12} />
                  </button>
                </div>
                {/if}

                <!-- 테마 색상 팝오버 -->
                {#if colorPopoverId === note.id}
                  <div class="archive-color-pop absolute bottom-full right-0 mb-1 z-30 p-1.5 rounded-lg shadow-xl border flex gap-1"
                       style="background-color: {archiveState.globalSettings.isDarkMode ? '#1e2028' : '#ffffff'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};">
                    {#each Object.entries(currentThemeColors) as [colorKey, colorHex]}
                      <button
                        onclick={() => setNoteColor(note.id, colorKey)}
                        class="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 {note.themeColor === colorKey ? 'border-black/40' : 'border-black/5'}"
                        style="background-color: {colorHex};"
                        title={colorKey}
                        aria-label={colorKey}
                      ></button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>

      {:else}
        <!-- List View (드래그 재정렬) -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flex flex-col gap-2"
          use:dndzone={{ items: displayNotes, flipDurationMs, dragDisabled, dropTargetStyle: {}, type: 'archive-notes' }}
          onconsider={handleDndConsider}
          onfinalize={handleDndFinalize}
        >
          {#each displayNotes as note (note.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              animate:flip={{ duration: flipDurationMs, easing: cubicOut }}
              class="relative p-2.5 rounded-xl border shadow-sm hover:shadow-md transition-shadow group {isSelectionMode ? 'cursor-pointer' : ''} {focusedId === note.id ? 'ring-2 ring-amber-400/70' : ''}"
              style="background-color: {archiveState.globalSettings.isDarkMode ? '#2d333b' : '#ffffff'}; border-color: {isSelectionMode && selectedIds.has(note.id) ? (archiveState.globalSettings.isDarkMode ? '#fbbf24' : '#f59e0b') : (archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')};"
              onclick={() => { if (isSelectionMode) toggleSelect(note.id); }}
              onfocusout={(e) => handleCardFocusOut(note.id, e)}
            >
              <div class="flex items-start gap-2 w-full">
                <!-- ✨ 드래그 핸들 (hover 시 표시, 선택 모드 제외) -->
                {#if !isSelectionMode}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    use:dragHandle
                    class="shrink-0 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing {dndDisabledByContext ? 'pointer-events-none' : ''}"
                    style="color: {archiveState.globalSettings.isDarkMode ? '#6b7280' : '#9ca3af'};"
                    title="드래그하여 순서 변경"
                    role="button"
                    tabindex="-1"
                    aria-label="드래그 핸들"
                  >
                    <GripVertical size={14} />
                  </div>
                {/if}
                <!-- ✨ 선택 모드 체크박스 -->
                {#if isSelectionMode}
                  <div class="shrink-0 mt-1">
                    {#if selectedIds.has(note.id)}
                      <CheckSquare size={16} class="text-amber-500" fill="rgba(245,158,11,0.15)" />
                    {:else}
                      <Square size={16} style="color: {archiveState.globalSettings.isDarkMode ? '#6b7280' : '#9ca3af'}" />
                    {/if}
                  </div>
                {/if}
                <!-- Color Indicator -->
                <div class="w-1.5 self-stretch rounded-full shrink-0" style="background-color: {cardBg(note)};"></div>

                <div class="flex flex-col flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    {#if note.bookmarked}
                      <Star size={11} class="text-yellow-400 shrink-0" fill="currentColor" />
                    {/if}
                    {#if isSelectionMode}
                      <h3 class="font-bold text-[12px] truncate" style="color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#1f2937'};">{note.title || '제목 없음'}</h3>
                    {:else}
                      <input
                        type="text"
                        value={note.title}
                        maxlength="10"
                        placeholder="제목 없음"
                        onfocus={() => handleCardFocusIn(note.id)}
                        onchange={(e) => saveTitle(note.id, e.currentTarget.value)}
                        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                        class="flex-1 min-w-0 bg-transparent border-none outline-none font-bold text-[12px] rounded px-0.5 focus:bg-black/5"
                        style="color: {archiveState.globalSettings.isDarkMode ? '#e2e8f0' : '#1f2937'};"
                        title="클릭하여 제목 편집"
                      />
                    {/if}
                  </div>

                  <!-- 본문: 충실 렌더 + 인라인 편집 + 접기/펼치기 -->
                  <div class="relative mt-0.5">
                    {#if isSelectionMode}
                      <div class="text-[10px] rte-faithful archive-clamp" style="color: {archiveState.globalSettings.isDarkMode ? '#9ca3af' : '#6b7280'};">{@html clampFontSizeHtml(note.content, STABLE_MAX_PT)}</div>
                    {:else}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        contenteditable="true"
                        spellcheck="false"
                        use:editable={{ html: clampFontSizeHtml(note.content, STABLE_MAX_PT), onUpdate: (v) => queueContentSave(note.id, v), onSave: () => flushContent(note.id) }}
                        use:measureOverflow={note.id}
                        onfocus={() => handleCardFocusIn(note.id)}
                        class="text-[10px] rte-faithful outline-none rounded {isOpen(note.id) ? '' : 'archive-clamp'} focus:bg-black/5"
                        style="color: {archiveState.globalSettings.isDarkMode ? '#9ca3af' : '#6b7280'};"
                        role="textbox"
                        tabindex="0"
                      ></div>
                    {/if}

                    {#if overflowIds.has(note.id) && !isOpen(note.id)}
                      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-5" style="background: linear-gradient(to bottom, transparent, {archiveState.globalSettings.isDarkMode ? '#2d333b' : '#ffffff'});"></div>
                    {/if}
                  </div>

                  {#if overflowIds.has(note.id) && focusedId !== note.id}
                    <button
                      onclick={(e) => { e.stopPropagation(); toggleExpand(note.id); }}
                      class="mt-1 self-start flex items-center gap-0.5 text-[10px] font-bold rounded-md px-1.5 py-0.5 transition-colors {archiveState.globalSettings.isDarkMode ? 'text-amber-300 hover:bg-white/10' : 'text-amber-600 hover:bg-black/5'}"
                    >
                      {#if expandedIds.has(note.id)}
                        <ChevronUp size={12} /> 접기
                      {:else}
                        <ChevronDown size={12} /> 펼치기
                      {/if}
                    </button>
                  {/if}

                  <!-- ✨ 하단 행: 날짜 (좌) + 호버 시 플로팅 액션 (우) -->
                  <div class="flex items-center justify-between mt-1.5 pt-1 relative">
                    <span class="text-[9px] font-medium" style="color: {archiveState.globalSettings.isDarkMode ? '#6b7280' : '#9ca3af'};">{formatDate(note.archivedAt)}</span>

                    {#if !isSelectionMode}
                    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-1 py-0.5 rounded-lg"
                         style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.85)'}; backdrop-filter: blur(4px);">
                      <button onclick={() => toggleBookmark(note.id)} class="p-1 rounded-md transition-colors {note.bookmarked ? 'text-yellow-500' : (archiveState.globalSettings.isDarkMode ? 'text-gray-500 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-500')}" title="북마크">
                        {#if note.bookmarked} <Star size={12} fill="currentColor" /> {:else} <StarOff size={12} /> {/if}
                      </button>
                      <button onclick={() => copyNoteContent(note)} class="p-1 rounded-md transition-colors {archiveState.globalSettings.isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}" title="복사">
                        <Copy size={12} />
                      </button>
                      <button onmousedown={(e) => e.preventDefault()} onclick={() => colorPopoverId = colorPopoverId === note.id ? null : note.id} class="archive-color-pop p-1 rounded-md transition-colors {archiveState.globalSettings.isDarkMode ? 'text-gray-500 hover:text-amber-400' : 'text-gray-400 hover:text-amber-500'}" title="테마 색상">
                        <Palette size={12} />
                      </button>
                      <button onclick={() => restoreNote(note.id)} class="p-1 rounded-md transition-colors {archiveState.globalSettings.isDarkMode ? 'text-gray-500 hover:text-blue-400' : 'text-gray-400 hover:text-blue-500'}" title="꺼내기">
                        <RotateCcw size={12} />
                      </button>
                      <button onclick={() => requestDelete(note.id)} class="p-1 rounded-md transition-colors {archiveState.globalSettings.isDarkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}" title="삭제">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {/if}

                    <!-- 테마 색상 팝오버 -->
                    {#if colorPopoverId === note.id}
                      <div class="archive-color-pop absolute bottom-full right-0 mb-1 z-30 p-1.5 rounded-lg shadow-xl border flex gap-1"
                           style="background-color: {archiveState.globalSettings.isDarkMode ? '#1e2028' : '#ffffff'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};">
                        {#each Object.entries(currentThemeColors) as [colorKey, colorHex]}
                          <button
                            onclick={() => setNoteColor(note.id, colorKey)}
                            class="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 {note.themeColor === colorKey ? 'border-black/40' : 'border-black/5'}"
                            style="background-color: {colorHex};"
                            title={colorKey}
                            aria-label={colorKey}
                          ></button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    {/if}
  </div>

  <!-- ✨ 토스트 알림 -->
  {#if toastMessage}
    <div class="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none z-50">
      <div class="px-3 py-1.5 rounded-full shadow-lg border text-[10px] font-bold text-center backdrop-blur-sm"
           style="background-color: {archiveState.globalSettings.isDarkMode ? 'rgba(30,32,40,0.95)' : 'rgba(255,255,255,0.95)'}; color: {archiveState.globalSettings.isDarkMode ? '#fde68a' : '#b45309'}; border-color: {archiveState.globalSettings.isDarkMode ? 'rgba(251,191,36,0.3)' : '#fde68a'};">
        {toastMessage}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Custom Scrollbar */
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(245, 158, 11, 0.2);
    border-radius: 10px;
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(245, 158, 11, 0.4);
  }
  
  /* ✨ [Compatibility] Tiny Note 편집기(.note-editor)와 동일 규격으로 렌더링하여
     문단 줄바꿈과 인라인 폰트 크기가 아카이브에서도 그대로 보이도록 합니다.
     (기존 display:inline 규칙이 문단을 한 줄로 붙이고, font-size:inherit가 큰 글씨를
      정규화하지 못해 잘리던 버그를 근본 해결) */
  .rte-faithful {
    line-height: 1.6;
    font-weight: 500;
    word-break: break-word;
    overflow-wrap: anywhere;
    white-space: normal;
    min-height: 1.2em;
    padding: 2px 2px 4px;
  }
  /* 편집기가 생성한 문단(div/p)은 반드시 블록 유지 → 줄바꿈 보존 */
  :global(.rte-faithful p), :global(.rte-faithful div) {
    margin: 0;
    min-height: 1.2em;
  }
  :global(.rte-faithful a) {
    color: #3b82f6;
    text-decoration: underline;
    cursor: pointer;
  }
  /* 본문이 완전히 비었을 때만 표시되는 안내 */
  .rte-faithful:empty::before {
    content: '내용을 입력하세요';
    opacity: 0.4;
    pointer-events: none;
  }

  /* 접힘 상태: 지정 높이로 클램프(넘치는 부분은 하단 페이드로 가림) — COLLAPSED_MAX와 동일 */
  .archive-clamp {
    max-height: 80px;
    overflow: hidden;
  }

  /* ✨ [Masonry] 그리드 메이슨리 패킹 — 카드 높이만큼 grid-row를 span하여 빈 공간 최소화
     (grid-auto-rows는 JS의 ROW_UNIT(8px), column-gap은 ROW_GAP(12px)과 반드시 동일해야 함) */
  .archive-masonry {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 12px;
    grid-auto-rows: 8px;
    align-items: start;
  }
</style>
