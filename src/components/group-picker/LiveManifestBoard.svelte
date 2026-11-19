<script lang="ts">
  import GroupSymbol from '../scoreboard/GroupSymbol.svelte';
  import { PALETTE } from '../../lib/scoreboard/model.js';
  import { resolveDeepBadgeHex } from '../../lib/group-picker/recolor.js';
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

  // fitGrid + 3모둠 1열·좁은 창 1열 반응형 열 수로 빈 구멍 0% 제거
  const grid = $derived(
    fitGrid(Math.max(1, groups.length), Math.max(180, boardW - 20), Math.max(180, boardH - 54), { gap: 8 }),
  );
  const cardCols = $derived.by(() => {
    if (groups.length === 1) return 1;
    if (groups.length === 2) return 1;
    if (groups.length === 3 && boardH >= 360) return 1;
    if (boardW < 280) return groups.length >= 7 ? 2 : 1;
    return groups.length >= 7 ? Math.max(2, grid.cols) : Math.min(2, grid.cols);
  });
  const cardRows = $derived(Math.max(1, Math.ceil(groups.length / Math.max(1, cardCols))));
  const estCardW = $derived(Math.max(110, (Math.max(180, boardW - 20) - (cardCols - 1) * 8) / cardCols));
  const estCardH = $derived(Math.max(66, (Math.max(220, boardH - 56) - (cardRows - 1) * 8) / cardRows));

  const totalCommitted = $derived(committedIds.size);
  const totalCap = $derived(capacities.reduce((a: number, b: number) => a + b, 0));
  const roomyCards = $derived(groups.length <= 6);
  const compactBoard = $derived(
    (boardH > 0 && boardH < 430 && groups.length >= 6) ||
    (boardH > 0 && boardH < 520 && groups.length >= 5),
  );
  const orderedCommitted = $derived<string[]>(Array.from(committedIds as Iterable<string>));

  const maxSlotsInGroup = $derived(
    Math.max(1, ...groups.map((g: any) => (phase === 'idle' ? (capacities[g.index] ?? 0) : g.studentIds.length))),
  );
  const slotCols = $derived.by(() => {
    if (compactBoard && maxSlotsInGroup >= 5) return 3;
    if (compactBoard) return 2;
    if (estCardW < 185) return 2;
    if (maxSlotsInGroup >= 7) return 3;
    return 2;
  });
  const slotRows = $derived(Math.max(1, Math.ceil(maxSlotsInGroup / slotCols)));

  // 전 폭·idle/theater 통합 셀 크기 비례 폰트 공식 (하단 빈 여백 ZERO + 줄바꿈 0%)
  const chipFontPx = $derived.by(() => {
    const headBandH = compactBoard ? 26 : roomyCards ? 38 : 30;
    const cellW = Math.max(54, (estCardW - 22 - (slotCols - 1) * 5) / slotCols);
    const cellH = Math.max(20, (estCardH - headBandH - 14 - (slotRows - 1) * 4) / slotRows);
    const byCellW = Math.floor((cellW - 8) / 4.05);
    const byCellH = Math.round(cellH * 0.46);
    const minPx = compactBoard ? 11.5 : groups.length >= 9 ? 12.5 : boardW < 235 ? 13.5 : 15;
    const maxPx = theater ? 32 : 21;
    return Math.min(maxPx, Math.max(minPx, Math.min(byCellW, byCellH)));
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
    <span class="gp-manifest-status-pill">{phase === 'idle' ? `총 ${groups.length}모둠` : `${totalCommitted} / ${totalCap}명 확정`}</span>
  </div>

  <div
    class="gp-manifest-grid"
    class:roomy={roomyCards}
    style:grid-template-columns={`repeat(${cardCols}, minmax(0, 1fr))`}
  >
    {#each groups as grp (grp.index)}
      {@const colorHex = COLOR_MAP[grp.color] ?? '#4FC2A0'}
      {@const deepHex = resolveDeepBadgeHex(grp.color)}
      {@const slotCount = phase === 'idle' ? (capacities[grp.index] ?? 0) : grp.studentIds.length}
      {@const memberSet = new Set(grp.studentIds)}
      {@const committedMembers = phase === 'idle' ? [] : orderedCommitted.filter((sid: string) => memberSet.has(sid))}
      {@const isGroupActive = phase === 'running' && grp.index === activeGroupIndex && committedMembers.length < slotCount}
      {@const isGroupDone = phase === 'running' && slotCount > 0 && committedMembers.length >= slotCount}
      <div
        class="gp-manifest-card"
        class:roomy={roomyCards}
        class:active-group={isGroupActive}
        class:done-group={isGroupDone}
        style:--g-color={colorHex}
        style:--g-deep={deepHex}
      >
        <!-- 시안 1A: 상단 OKLab Deep 컬러 헤더 밴드 + 흰 심볼/글자 -->
        <div
          class="gp-manifest-card-head"
          class:large={!compactBoard && theater && boardW >= 380}
          data-gp-group-header={grp.index}
        >
          <span class="gp-manifest-card-title-text">
            <GroupSymbol
              symbol={grp.symbol}
              color="#ffffff"
              size={!compactBoard && theater && boardW >= 380 ? 20 : roomyCards ? 17 : 14}
            />
            <span>{grp.name}</span>
          </span>
          <span class="gp-manifest-card-count">
            {#if isGroupDone && !compactBoard}
              <span class="gp-done-pill">완료</span>
            {/if}
            {phase === 'idle' ? `${slotCount}명` : `${committedMembers.length}/${slotCount}`}
          </span>
        </div>

        <div class="gp-manifest-card-body">
          <div
            class="gp-manifest-slots grid-slots"
            style:--slot-cols={slotCols}
          >
            {#each Array.from({ length: slotCount }) as _, sIdx (sIdx)}
              {@const sid = committedMembers[sIdx]}
              {@const st = sid ? studentMap[sid] : null}
              {@const chipLabel = st ? formatStudentLabel(st, allStudents, alwaysShowNumber) : '?'}
              {@const chipPx = chipLabel.length >= 5 && boardW < 460 ? Math.min(chipFontPx, theater ? 16.5 : 14) : chipFontPx}
              <span
                class="gp-slot-chip"
                class:roomy={roomyCards && !compactBoard}
                class:filled={Boolean(st)}
                style:--g-color={colorHex}
                style:--g-deep={deepHex}
                style:font-size={`${(st ? chipPx : Math.max(13, Math.round(chipFontPx * 0.92))).toFixed(1)}px`}
                data-gp-slot={`${grp.index}-${sIdx}`}
              >
                {chipLabel}
              </span>
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>
</section>
