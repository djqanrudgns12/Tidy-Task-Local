<script lang="ts">
  import { Lock, LockOpen, Undo2, Redo2, RotateCcw, Copy, Download, Save, ArrowLeft } from 'lucide-svelte';
  import GroupSymbol from '../scoreboard/GroupSymbol.svelte';
  import { PALETTE, cleanLabel } from '../../lib/scoreboard/model.js';
  import { resolveDeepBadgeHex } from '../../lib/group-picker/recolor.js';
  import { fitGrid } from '../../lib/scoreboard/layout.js';
  import { fitFontSize } from '../../lib/scoreboard/fitText.js';
  import { formatStudentLabel, MAX_GROUP_NAME_CHARS } from '../../lib/group-picker/allocation.js';
  import { avatarForStudent } from '../../lib/group-picker/assets.js';

  const COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  let {
    groups,
    studentMap,
    allStudents,
    classAvatarMap = {},
    isCustomMode,
    sortOrder,
    alwaysShowNumber,
    fontFamily,
    fontEpoch = 0,
    canUndo,
    canRedo,
    brokenAssets = new Set<string>(),
    onBackToSetup,
    onChangeSort,
    onUndo,
    onRedo,
    onRerollUnlocked,
    onSwapStudents,
    onMoveStudent,
    onToggleLock,
    onRenameGroup,
    onCopyPng,
    onSavePng,
    onOpenBridge,
    onMarkBroken,
  } = $props<{
    groups: { index: number; name: string; color: string; symbol: string; studentIds: string[]; locked: boolean }[];
    studentMap: Record<string, { id: string; name: string; number?: number; gender?: string }>;
    allStudents: any[];
    classAvatarMap?: Record<string, { id: string; fullSrc: string; src: string; portraitSrc: string }>;
    isCustomMode: boolean;
    sortOrder: 'number' | 'order';
    alwaysShowNumber: boolean;
    fontFamily: string;
    fontEpoch?: number;
    canUndo: boolean;
    canRedo: boolean;
    brokenAssets?: Set<string>;
    onBackToSetup: () => void;
    onChangeSort: (v: 'number' | 'order') => void;
    onUndo: () => void;
    onRedo: () => void;
    onRerollUnlocked: () => void;
    onSwapStudents: (aId: string, bId: string) => void;
    onMoveStudent: (studentId: string, toGroupIndex: number) => void;
    onToggleLock: (groupIndex: number) => void;
    onRenameGroup: (groupIndex: number, name: string) => void;
    onCopyPng: () => void;
    onSavePng: () => void;
    onOpenBridge: () => void;
    onMarkBroken: (src: string) => void;
  }>();

  let gridW = $state(960);
  let gridH = $state(540);
  let selectedId = $state<string | null>(null);
  let editingGroupIdx = $state<number | null>(null);
  let editingName = $state('');

  // 포인터 드래그 (>5px 이동 시 드래그 활성화, 클릭-클릭과 공존)
  let dragState = $state<{
    studentId: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
    hoverStudentId: string | null;
    hoverGroupIdx: number | null;
  } | null>(null);

  const grid = $derived(fitGrid(Math.max(1, groups.length), Math.max(240, gridW), Math.max(200, gridH), { gap: 14 }));
  const unlockedCount = $derived(groups.filter((g: any) => !g.locked).length);
  const headBandH = $derived(gridW >= 1200 ? 60 : gridW >= 860 ? 52 : 44);
  const headSymbolPx = $derived(gridW >= 1400 ? 30 : gridW >= 900 ? 26 : 21);

  /** 카드별 가용 폭·높이와 멤버 수에 맞춘 균등 타일 cols × rows · 아바타 · 글꼴 크기 계산 */
  function tileLayoutFor(ids: string[]) {
    void fontEpoch;
    const count = Math.max(1, ids.length);
    const innerW = Math.max(120, grid.cardW - 26);
    const innerH = Math.max(96, grid.cardH - headBandH - 22);
    const gap = gridW < 860 ? 6 : 8;
    const maxCols = innerW >= 340 ? Math.min(3, count) : innerW >= 200 ? Math.min(2, count) : 1;

    let bestCols = 1;
    let bestScore = -Infinity;
    for (let c = 1; c <= maxCols; c++) {
      const r = Math.ceil(count / c);
      const cw = (innerW - (c - 1) * gap) / c;
      const ch = (innerH - (r - 1) * gap) / r;
      if (cw < 96) continue;
      const effH = Math.max(32, Math.min(76, ch));
      const sc = Math.min(cw / 145, effH / 48) * 100 + effH;
      if (sc > bestScore) {
        bestScore = sc;
        bestCols = c;
      }
    }

    const tRows = Math.max(1, Math.ceil(count / bestCols));
    const cellW = Math.max(88, (innerW - (bestCols - 1) * gap) / bestCols);
    const rawCellH = Math.floor((innerH - (tRows - 1) * gap) / tRows);
    const chipH = Math.max(gridW < 860 ? 34 : 44, Math.min(76, rawCellH));
    const avatarPx = Math.max(20, Math.min(50, Math.round(chipH * 0.68), Math.round(cellW * 0.24)));
    const maxFontPx = Math.min(34, Math.max(15, Math.round(chipH * 0.50)));
    const minFontPx = gridW < 860 ? 10.5 : 15;
    const chromeW = gridW < 860 ? 25 : 32;
    const textAvail = Math.max(28, cellW - avatarPx - chromeW);

    return {
      tCols: bestCols,
      chipH,
      avatarPx,
      maxFontPx,
      minFontPx,
      textAvail,
    };
  }

  /** 카드 내 학생 정렬(뽑힌순 vs 번호순) */
  function orderedIds(ids: string[]) {
    if (sortOrder === 'order') return ids;
    return [...ids].sort((a, b) => {
      const sa = studentMap[a];
      const sb = studentMap[b];
      const na = Number(sa?.number) || 99999;
      const nb = Number(sb?.number) || 99999;
      if (na !== nb) return na - nb;
      return String(sa?.name ?? '').localeCompare(String(sb?.name ?? ''), 'ko');
    });
  }

  function fontSizeFor(label: string, tl: ReturnType<typeof tileLayoutFor>) {
    return fitFontSize(label, {
      family: fontFamily,
      weight: 800,
      avail: tl.textAvail,
      max: tl.maxFontPx,
      min: Math.min(tl.minFontPx, tl.maxFontPx),
    }).size;
  }

  function handleChipPointerDown(e: PointerEvent, studentId: string) {
    if (e.button !== 0 || editingGroupIdx != null) return;
    dragState = {
      studentId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      hoverStudentId: null,
      hoverGroupIdx: null,
    };
  }

  function handleWindowPointerMove(e: PointerEvent) {
    if (!dragState) return;
    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    const active = dragState.active || dist > 5;
    if (!active) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const studentEl = el?.closest('[data-gp-student]');
    const groupEl = el?.closest('[data-gp-group]');
    const hoverStudentId = studentEl?.getAttribute('data-gp-student') ?? null;
    const rawGIdx = groupEl?.getAttribute('data-gp-group');
    const hoverGroupIdx = rawGIdx != null ? Number(rawGIdx) : null;

    dragState = {
      ...dragState,
      x: e.clientX,
      y: e.clientY,
      active: true,
      hoverStudentId: hoverStudentId && hoverStudentId !== dragState.studentId ? hoverStudentId : null,
      hoverGroupIdx,
    };
  }

  function handleWindowPointerUp() {
    if (!dragState) return;
    const finished = dragState;
    dragState = null;
    if (!finished.active) return;

    selectedId = null;
    if (finished.hoverStudentId && finished.hoverStudentId !== finished.studentId) {
      onSwapStudents(finished.studentId, finished.hoverStudentId);
      return;
    }
    if (finished.hoverGroupIdx != null) {
      onMoveStudent(finished.studentId, finished.hoverGroupIdx);
    }
  }

  function handleChipClick(studentId: string) {
    if (!selectedId) {
      selectedId = studentId;
      return;
    }
    if (selectedId === studentId) {
      selectedId = null;
      return;
    }
    const first = selectedId;
    selectedId = null;
    onSwapStudents(first, studentId);
  }

  function handleGroupZoneClick(groupIndex: number) {
    if (!selectedId) return;
    const sid = selectedId;
    selectedId = null;
    onMoveStudent(sid, groupIndex);
  }

  function commitGroupRename(idx: number) {
    if (editingGroupIdx !== idx) return;
    const cleaned = cleanLabel(editingName, MAX_GROUP_NAME_CHARS);
    editingGroupIdx = null;
    if (cleaned) onRenameGroup(idx, cleaned);
  }
</script>

<svelte:window
  onpointermove={handleWindowPointerMove}
  onpointerup={handleWindowPointerUp}
  onpointercancel={handleWindowPointerUp}
  onkeydown={(e) => {
    if (e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
    if (e.key === 'Escape' && (selectedId != null || editingGroupIdx != null)) {
      selectedId = null;
      editingGroupIdx = null;
      e.preventDefault();
    }
  }}
/>

<div class="gp-result-wrap">
  <div class="gp-result-bar">
    <div class="gp-toolbar-group">
      <button type="button" class="gp-pill-btn" onclick={onBackToSetup}>
        <ArrowLeft size={14} /> 설정 바꾸기
      </button>
      <div class="gp-seg" style="width:168px" role="tablist" aria-label="학생 정렬 기준">
        <button
          type="button"
          role="tab"
          aria-selected={sortOrder === 'number'}
          class:active={sortOrder === 'number'}
          onclick={() => onChangeSort('number')}
        >번호순</button>
        <button
          type="button"
          role="tab"
          aria-selected={sortOrder === 'order'}
          class:active={sortOrder === 'order'}
          onclick={() => onChangeSort('order')}
        >뽑힌순</button>
      </div>
    </div>

    <span class="gp-result-hint gp-hide-narrow">
      {#if selectedId}
        바꿀 <strong>친구</strong>(맞바꾸기) 또는 <strong>다른 모둠 카드</strong>(이동)를 눌러 주세요 · Esc 취소
      {:else}
        학생을 끌어놓거나 두 번 눌러 맞바꾸기 · 모둠 카드로 끌어 이동
      {/if}
    </span>

    <div class="gp-toolbar-group">
      <button type="button" class="gp-pill-btn" disabled={!canUndo} title="되돌리기 (Ctrl+Z)" onclick={onUndo}>
        <Undo2 size={14} /> <span class="gp-hide-narrow">되돌리기</span>
      </button>
      <button type="button" class="gp-pill-btn" disabled={!canRedo} title="다시 하기 (Ctrl+Y)" onclick={onRedo}>
        <Redo2 size={14} /> <span class="gp-hide-narrow">다시 하기</span>
      </button>
      <button
        type="button"
        class="gp-pill-btn active"
        disabled={unlockedCount < 1}
        title={unlockedCount === 0 ? '모든 모둠이 잠겨 있어요' : unlockedCount < groups.length ? '잠긴 모둠은 남기고 나머지만 다시 뽑아요' : '전체 모둠 다시 뽑기'}
        onclick={onRerollUnlocked}
      >
        <RotateCcw size={14} />
        {unlockedCount < groups.length ? `잠금 제외 다시 뽑기` : '다시 뽑기'}
      </button>
    </div>
  </div>

  <div
    class="gp-result-grid"
    bind:clientWidth={gridW}
    bind:clientHeight={gridH}
    style:grid-template-columns={`repeat(${grid.cols}, minmax(0, 1fr))`}
    style:grid-auto-rows="minmax(0, 1fr)"
  >
    {#each groups as grp, gi (grp.index)}
      {@const colorHex = COLOR_MAP[grp.color] ?? '#4FC2A0'}
      {@const deepHex = resolveDeepBadgeHex(grp.color)}
      {@const displayIds = orderedIds(grp.studentIds)}
      {@const tl = tileLayoutFor(displayIds)}
      {@const isDropHover = dragState?.active && dragState.hoverGroupIdx === grp.index && !grp.studentIds.includes(dragState.studentId)}

      <div
        class="gp-result-card"
        class:locked={grp.locked}
        class:drop-target={isDropHover}
        style:--g-color={colorHex}
        style:--g-deep={deepHex}
        style:--card-idx={gi}
        data-gp-group={grp.index}
      >
        <!-- 시안 1A: OKLab Deep 컬러 헤더 밴드 + 흰 심볼 + 확대 모둠명 + 반투명 인원 필 -->
        <div class="gp-result-card-head" style:min-height={`${headBandH}px`}>
          <div class="gp-result-card-title">
            <GroupSymbol symbol={grp.symbol} color="#ffffff" size={headSymbolPx} />
            {#if editingGroupIdx === grp.index}
              <input
                class="gp-gname-input gp-result-head-input"
                maxlength={MAX_GROUP_NAME_CHARS}
                bind:value={editingName}
                aria-label={`${grp.index + 1}모둠 이름 수정`}
                onkeydown={(e) => {
                  if (e.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter') { e.preventDefault(); commitGroupRename(grp.index); }
                  if (e.key === 'Escape') { e.preventDefault(); editingGroupIdx = null; }
                }}
                onblur={() => commitGroupRename(grp.index)}
              />
            {:else}
              <button
                type="button"
                class="gp-result-name-btn"
                class:xl={gridW >= 1200}
                title={`${grp.name} · 더블클릭해 이름 수정`}
                ondblclick={() => {
                  editingGroupIdx = grp.index;
                  editingName = grp.name;
                }}
              >{grp.name}</button>
            {/if}
          </div>

          <div class="gp-result-head-actions">
            <span class="gp-result-count-pill">{grp.studentIds.length}명</span>
            <button
              type="button"
              class="gp-mini-icon-btn gp-result-lock-btn"
              class:locked={grp.locked}
              title={grp.locked ? '이 모둠 잠금 풀기' : '이 모둠 구성 잠그기 (부분 재추첨 제외)'}
              aria-label={grp.locked ? `${grp.name} 잠금 풀기` : `${grp.name} 잠그기`}
              onclick={(e) => {
                e.stopPropagation();
                onToggleLock(grp.index);
              }}
            >
              {#if grp.locked}<Lock size={15} />{:else}<LockOpen size={15} />{/if}
            </button>
          </div>
        </div>

        <div
          class="gp-members-wrap"
          style:--t-cols={tl.tCols}
          style:--chip-h={`${tl.chipH}px`}
          style:--avatar-px={`${tl.avatarPx}px`}
        >
          {#each displayIds as sid (sid)}
            {@const st = studentMap[sid]}
            {#if st}
              {@const label = formatStudentLabel(st, allStudents, alwaysShowNumber)}
              {@const av = avatarForStudent(st, classAvatarMap)}
              {@const isBroken = !av.src || brokenAssets.has(av.src)}
              <button
                type="button"
                class="gp-member-chip"
                class:selected={selectedId === sid || dragState?.hoverStudentId === sid}
                data-gp-student={sid}
                style:--g-color={colorHex}
                style:--g-deep={deepHex}
                style:font-size={`${fontSizeFor(label, tl).toFixed(1)}px`}
                onpointerdown={(e) => handleChipPointerDown(e, sid)}
                onclick={(e) => {
                  e.stopPropagation();
                  handleChipClick(sid);
                }}
              >
                {#if !isBroken}
                  <img
                    class="gp-member-avatar"
                    src={av.src}
                    alt=""
                    draggable="false"
                    onerror={() => onMarkBroken(av.src)}
                  />
                {/if}
                <span>{label}</span>
              </button>
            {/if}
          {/each}
          {#if selectedId && !grp.studentIds.includes(selectedId)}
            <button
              type="button"
              class="gp-move-here-btn"
              onclick={() => handleGroupZoneClick(grp.index)}
            >+ 여기로 옮기기</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="gp-result-footer">
    <div class="gp-toolbar-group">
      <button type="button" class="gp-pill-btn" onclick={onCopyPng}>
        <Copy size={14} /> 이미지 복사
      </button>
      <button type="button" class="gp-pill-btn" onclick={onSavePng}>
        <Download size={14} /> PNG 저장
      </button>
    </div>

    <button type="button" class="gp-primary-cta" style="height:42px; font-size:14.5px; padding:0 20px; min-width:auto" onclick={onOpenBridge}>
      <Save size={16} />
      {isCustomMode ? '모둠 점수판에 반영 →' : '학급 명단 · 점수판에 반영 →'}
    </button>
  </div>
</div>

{#if dragState?.active}
  {@const st = studentMap[dragState.studentId]}
  {#if st}
    <div class="gp-flight-layer" aria-hidden="true">
      <div
        class="gp-flying-ticket"
        style:transform={`translate3d(${dragState.x}px, ${dragState.y}px, 0) translate(-50%, -50%) scale(1.06)`}
      >
        {formatStudentLabel(st, allStudents, alwaysShowNumber)}
      </div>
    </div>
  {/if}
{/if}
