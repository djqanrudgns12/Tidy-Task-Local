<script lang="ts">
  // 8방향 테두리 리사이즈와 대각선 모서리 더블클릭 전체화면을 전담하는 투명 뷰포트 손잡이입니다.
  // 왜 모서리 mousedown에서 곧장 startResizeDragging을 부르지 않는가:
  //   Windows OS 모달 리사이즈 루프가 두 번째 클릭(dblclick)을 삼켜 모서리 더블클릭이 씹히기 때문입니다.
  //   5px 이상 실제로 끌었을 때만 크기 조절을 시작해, 더블클릭과 드래그가 서로 방해하지 않게 합니다.
  import { getCurrentWindow } from '@tauri-apps/api/window';

  type CornerDirection = 'NorthWest' | 'NorthEast' | 'SouthWest' | 'SouthEast';
  type EdgeDirection = 'North' | 'South' | 'East' | 'West';

  let {
    native,
    fullscreen,
    maximized,
    snugWidget,
    onToggleFullscreen,
    onError,
  }: {
    native: boolean;
    fullscreen: boolean;
    maximized: boolean;
    snugWidget: boolean;
    onToggleFullscreen: () => void;
    onError?: (message: string) => void;
  } = $props();

  const edges: { direction: EdgeDirection; className: string }[] = [
    { direction: 'North', className: 'edge-north' },
    { direction: 'South', className: 'edge-south' },
    { direction: 'East', className: 'edge-east' },
    { direction: 'West', className: 'edge-west' },
  ];

  const corners: { direction: CornerDirection; className: string }[] = [
    { direction: 'NorthWest', className: 'north-west' },
    { direction: 'NorthEast', className: 'north-east' },
    { direction: 'SouthWest', className: 'south-west' },
    { direction: 'SouthEast', className: 'south-east' },
  ];

  let cornerDrag: {
    pointerId: number;
    dir: CornerDirection;
    sx: number;
    sy: number;
    moved: boolean;
  } | null = null;
  let lastTap: { dir: CornerDirection; at: number; sx: number; sy: number } | null = null;
  let lastTrigger: { dir: CornerDirection; at: number } | null = null;

  function triggerFullscreen(dir: CornerDirection, source: 'tap' | 'dblclick') {
    const now = performance.now();
    // 같은 더블클릭 제스처에서 cornerUp(2번째 탭)과 브라우저 dblclick이 연달아 들어올 때 1번만 전환합니다.
    if (source === 'dblclick' && lastTrigger && lastTrigger.dir === dir && now - lastTrigger.at < 120) {
      return;
    }
    if (lastTrigger && now - lastTrigger.at < 60) return;
    lastTrigger = { dir, at: now };
    lastTap = null;
    onToggleFullscreen();
  }

  function resizeEdge(e: PointerEvent, direction: EdgeDirection) {
    if (!native || e.button !== 0 || !e.isPrimary || fullscreen || maximized) return;
    e.preventDefault();
    e.stopPropagation();
    void getCurrentWindow()
      .startResizeDragging(direction)
      .catch(() => onError?.('창 크기 조절을 시작하지 못했어요.'));
  }

  function cornerDown(e: PointerEvent, dir: CornerDirection) {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    cornerDrag = {
      pointerId: e.pointerId,
      dir,
      sx: e.screenX,
      sy: e.screenY,
      moved: false,
    };
  }

  function cornerMove(e: PointerEvent) {
    if (!cornerDrag || cornerDrag.pointerId !== e.pointerId || cornerDrag.moved) return;
    if (!native || fullscreen || maximized) return;
    if (Math.hypot(e.screenX - cornerDrag.sx, e.screenY - cornerDrag.sy) < 5) return;
    const dir = cornerDrag.dir;
    cornerDrag.moved = true;
    lastTap = null;
    try {
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    } catch {}
    void getCurrentWindow()
      .startResizeDragging(dir)
      .catch(() => onError?.('창 크기 조절을 시작하지 못했어요.'));
  }

  function cornerUp(e: PointerEvent, dir: CornerDirection) {
    if (!cornerDrag || cornerDrag.pointerId !== e.pointerId) return;
    const wasMoved = cornerDrag.moved;
    cornerDrag = null;
    try {
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    } catch {}
    if (wasMoved) return;
    const now = performance.now();
    if (
      lastTap &&
      lastTap.dir === dir &&
      now - lastTap.at <= 340 &&
      Math.hypot(e.screenX - lastTap.sx, e.screenY - lastTap.sy) <= 14
    ) {
      triggerFullscreen(dir, 'tap');
    } else {
      lastTap = { dir, at: now, sx: e.screenX, sy: e.screenY };
    }
  }

  function cancelCorner(e: PointerEvent) {
    if (cornerDrag && cornerDrag.pointerId === e.pointerId) cornerDrag = null;
  }
</script>

{#if native && !fullscreen && !maximized}
  {#each edges as edge}
    <div
      class="timer-resize-edge {edge.className}"
      class:snug={snugWidget}
      aria-hidden="true"
      onpointerdown={(event) => resizeEdge(event, edge.direction)}
    ></div>
  {/each}
{/if}

{#if !maximized}
  {#each corners as corner}
    <button
      type="button"
      class="timer-resize-corner {corner.className}"
      class:snug={snugWidget}
      class:fullscreen
      tabindex="-1"
      aria-hidden="true"
      title={fullscreen ? '더블클릭: 전체화면 종료' : '드래그: 크기 조절 · 더블클릭: 전체화면'}
      onpointerdown={(event) => cornerDown(event, corner.direction)}
      onpointermove={cornerMove}
      onpointerup={(event) => cornerUp(event, corner.direction)}
      onpointercancel={cancelCorner}
      onlostpointercapture={cancelCorner}
      ondblclick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        triggerFullscreen(corner.direction, 'dblclick');
      }}
    >
      {#if !fullscreen}<i class="corner-arc" aria-hidden="true"></i>{/if}
    </button>
  {/each}
{/if}
