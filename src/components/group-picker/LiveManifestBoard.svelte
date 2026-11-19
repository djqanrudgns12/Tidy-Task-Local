<script lang="ts">
  import GroupSymbol from '../scoreboard/GroupSymbol.svelte';
  import { PALETTE } from '../../lib/scoreboard/model.js';
  import { fitGrid } from '../../lib/scoreboard/layout.js';
  import { formatStudentLabel } from '../../lib/group-picker/allocation.js';

  const COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  let {
    phase,
    theater = false,
    groups,
    capacities,
    activeGroupIndex = -1,
    committedIds = new Set<string>(),
    studentMap = {},
    allStudents = [],
    alwaysShowNumber = false,
  } = $props<{
    phase: 'idle' | 'running' | 'settled';
    theater?: boolean;
    groups: { index: number; name: string; color: string; symbol: string; studentIds: string[] }[];
    capacities: number[];
    activeGroupIndex?: number;
    committedIds?: Set<string>;
    studentMap?: Record<string, { id: string; name: string; number?: number }>;
    allStudents?: any[];
    alwaysShowNumber?: boolean;
  }>();

  let boardW = $state(320);
  let boardH = $state(420);

  // fitGrid를 이용해 스크롤 없이 6~12모둠 전부가 한 화면 안에 들어가도록 열 수를 자동 계산
  const grid = $derived(
    fitGrid(Math.max(1, groups.length), Math.max(180, boardW - 20), Math.max(180, boardH - 46), { gap: 8 }),
  );
  const totalCommitted = $derived(committedIds.size);
  const totalCap = $derived(capacities.reduce((a: number, b: number) => a + b, 0));
  const roomyCards = $derived(groups.length <= 6);
  const compactBoard = $derived(boardH > 0 && boardH < 455);
  const orderedCommitted = $derived<string[]>(Array.from(committedIds as Iterable<string>));

  const maxSlotsInGroup = $derived(
    Math.max(1, ...groups.map((g: any) => (phase === 'idle' ? (capacities[g.index] ?? 0) : g.studentIds.length))),
  );
  const useGridSlots = $derived(!compactBoard && (roomyCards || phase === 'running'));
  const slotCols = $derived(
    compactBoard ? 3 : !roomyCards ? 2 : maxSlotsInGroup >= 7 ? 3 : 2,
  );
  const slotRows = $derived(Math.max(1, Math.ceil(maxSlotsInGroup / slotCols)));

  // 교실 3.5~5m 실측 판독 규격 (PRD §2.3) + 고정 2열 그리드 셀 폭·높이 정확 정합(줄넘김/잘림 0%)
  const chipFontPx = $derived.by(() => {
    if (compactBoard || boardW < 235) {
      return groups.length >= 6 ? 12.5 : 14;
    }
    if (theater && boardW >= 420) {
      const cellW = Math.max(64, (grid.cardW - 30) / slotCols);
      const cellH = Math.max(24, (grid.cardH - 56) / slotRows);
      const byCellW = Math.floor((cellW - 10) / 4.15);
      const byCellH = Math.round(cellH * 0.44);
      const floorPx = roomyCards ? 18 : 15;
      return Math.min(34, Math.max(floorPx, Math.min(byCellW, byCellH)));
    }
    if (theater && boardW >= 300) {
      return roomyCards ? 18 : 15;
    }
    return roomyCards ? 15.5 : 13.5;
  });
</script>

<section
  class="gp-manifest"
  class:theater
  class:compact-board={compactBoard}
  aria-label="실시간 모둠 현황"
  bind:clientWidth={boardW}
  bind:clientHeight={boardH}
>
  <div class="gp-manifest-head">
    <span>실시간 모둠 현황</span>
    <span style="color:var(--gp-accent)">{phase === 'idle' ? `총 ${groups.length}모둠` : `${totalCommitted} / ${totalCap}명 확정`}</span>
  </div>

  <div
    class="gp-manifest-grid"
    class:roomy={roomyCards}
    style:grid-template-columns={`repeat(${groups.length >= 7 ? Math.max(2, grid.cols) : Math.min(2, grid.cols)}, minmax(0, 1fr))`}
  >
    {#each groups as grp (grp.index)}
      {@const colorHex = COLOR_MAP[grp.color] ?? '#4FC2A0'}
      {@const slotCount = phase === 'idle' ? (capacities[grp.index] ?? 0) : grp.studentIds.length}
      {@const memberSet = new Set(grp.studentIds)}
      {@const committedMembers = phase === 'idle' ? [] : orderedCommitted.filter((sid: string) => memberSet.has(sid))}
      {@const fillPct = slotCount > 0 ? Math.round((committedMembers.length / slotCount) * 100) : 0}
      {@const isGroupActive = phase === 'running' && grp.index === activeGroupIndex && committedMembers.length < slotCount}
      {@const isGroupDone = phase === 'running' && slotCount > 0 && committedMembers.length >= slotCount}
      <div
        class="gp-manifest-card"
        class:roomy={roomyCards}
        class:active-group={isGroupActive}
        class:done-group={isGroupDone}
        style:--g-color={colorHex}
      >
        <div class="gp-manifest-card-title" class:large={!compactBoard && theater && boardW >= 430} data-gp-group-header={grp.index}>
          <span>
            <GroupSymbol symbol={grp.symbol} color={colorHex} size={!compactBoard && theater && boardW >= 430 ? 20 : roomyCards ? 16 : 14} />
            <span style="overflow:hidden; text-overflow:ellipsis">{grp.name}</span>
          </span>
          <span style="display:inline-flex; align-items:center; gap:5px; color:var(--gp-muted); font-size:12.5px">
            {#if isGroupDone && !compactBoard}
              <span class="gp-done-pill" style:--g-color={colorHex}>완료</span>
            {/if}
            {phase === 'idle' ? `${slotCount}명` : `${committedMembers.length}/${slotCount}`}
          </span>
        </div>

        <div
          class="gp-manifest-slots"
          class:grid-slots={useGridSlots}
          style:--slot-cols={slotCols}
        >
          {#each Array.from({ length: slotCount }) as _, sIdx (sIdx)}
            {@const sid = committedMembers[sIdx]}
            {@const st = sid ? studentMap[sid] : null}
            {@const chipLabel = st ? formatStudentLabel(st, allStudents, alwaysShowNumber) : '?'}
            {@const chipPx = chipLabel.length >= 5 && boardW < 500 ? Math.min(chipFontPx, 16) : chipFontPx}
            <span
              class="gp-slot-chip"
              class:roomy={roomyCards && !compactBoard}
              class:filled={Boolean(st)}
              style:--g-color={colorHex}
              style:font-size={st ? `${chipPx}px` : undefined}
              data-gp-slot={`${grp.index}-${sIdx}`}
            >
              {chipLabel}
            </span>
          {/each}
        </div>

        {#if roomyCards && !compactBoard}
          <div class="gp-manifest-bar" aria-hidden="true">
            <span style={`width:${phase === 'idle' ? 0 : fillPct}%`}></span>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>
