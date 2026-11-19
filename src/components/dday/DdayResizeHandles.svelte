<script lang="ts">
  // D-Day 컨트롤 패널·데스크톱 위젯 공용 8방향 뷰포트 리사이즈 히트존.
  // 왜 container-type: size 요소 바깥(형제)에 두는가:
  //   container: size 내부에 position: fixed를 두면 바깥 투명 여백이 아니라 카드 안쪽에 붙어
  //   상단 우측 버튼이나 창 테두리 입력을 가로채기 때문입니다 (ThermometerDisplay·TimerApp 동일 원리).
  // 왜 모서리에서 5px 드래그 임계치를 두는가:
  //   단순 클릭·더블클릭 시 Windows 모달 리사이즈 루프가 이벤트를 삼키는 것을 막기 위함입니다.
  import { getCurrentWindow } from '@tauri-apps/api/window';

  type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>['startResizeDragging']>[0];
  type EdgeDirection = Extract<ResizeDirection, 'North' | 'South' | 'East' | 'West'>;
  type CornerDirection = Extract<ResizeDirection, 'NorthWest' | 'NorthEast' | 'SouthWest' | 'SouthEast'>;

  let {
    native = false,
    debugShow = false,
    disabled = false,
    edgeSize = 5,
    cornerSize = 12,
    onResizeStart,
    onError,
  }: {
    native?: boolean;
    debugShow?: boolean;
    disabled?: boolean;
    edgeSize?: number;
    cornerSize?: number;
    onResizeStart?: () => void;
    onError?: (msg: string) => void;
  } = $props();

  const edges: { direction: EdgeDirection; className: string }[] = [
    { direction: 'North', className: 'dd-edge-n' },
    { direction: 'South', className: 'dd-edge-s' },
    { direction: 'West', className: 'dd-edge-w' },
    { direction: 'East', className: 'dd-edge-e' },
  ];

  const corners: { direction: CornerDirection; className: string }[] = [
    { direction: 'NorthWest', className: 'dd-corner-nw' },
    { direction: 'NorthEast', className: 'dd-corner-ne' },
    { direction: 'SouthWest', className: 'dd-corner-sw' },
    { direction: 'SouthEast', className: 'dd-corner-se' },
  ];

  let cornerDrag: {
    pointerId: number;
    dir: CornerDirection;
    sx: number;
    sy: number;
    moved: boolean;
  } | null = null;

  function resizeEdge(e: PointerEvent, direction: EdgeDirection) {
    if (!native || disabled || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    onResizeStart?.();
    void getCurrentWindow()
      .startResizeDragging(direction)
      .catch(() => onError?.('창 크기 조절을 시작하지 못했어요.'));
  }

  function cornerDown(e: PointerEvent, dir: CornerDirection) {
    if (!native || disabled || e.button !== 0 || !e.isPrimary) return;
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
    if (!native || disabled) return;
    if (Math.hypot(e.screenX - cornerDrag.sx, e.screenY - cornerDrag.sy) < 5) return;
    const dir = cornerDrag.dir;
    cornerDrag.moved = true;
    onResizeStart?.();
    try {
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    } catch {}
    void getCurrentWindow()
      .startResizeDragging(dir)
      .catch(() => onError?.('창 크기 조절을 시작하지 못했어요.'));
  }

  function cornerUp(e: PointerEvent) {
    if (!cornerDrag || cornerDrag.pointerId !== e.pointerId) return;
    cornerDrag = null;
    try {
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    } catch {}
  }

  function cancelCorner(e: PointerEvent) {
    if (cornerDrag && cornerDrag.pointerId === e.pointerId) cornerDrag = null;
  }
</script>

{#if (native || debugShow) && !disabled}
  {#each edges as edge}
    <div
      class="dd-resize-edge {edge.className}"
      class:debug-show={debugShow}
      style="--dd-edge: {edgeSize}px; --dd-corner: {cornerSize}px;"
      aria-hidden="true"
      data-no-drag
      onpointerdown={(e) => resizeEdge(e, edge.direction)}
    ></div>
  {/each}

  {#each corners as corner}
    <div
      class="dd-resize-corner {corner.className}"
      class:debug-show={debugShow}
      style="--dd-corner: {cornerSize}px;"
      aria-hidden="true"
      data-no-drag
      onpointerdown={(e) => cornerDown(e, corner.direction)}
      onpointermove={cornerMove}
      onpointerup={cornerUp}
      onpointercancel={cancelCorner}
      onlostpointercapture={cancelCorner}
    ></div>
  {/each}
{/if}

<style>
  .dd-resize-edge {
    position: fixed;
    z-index: 60;
    background: transparent;
    touch-action: none;
  }
  .dd-edge-n {
    top: 0;
    left: var(--dd-corner, 12px);
    right: var(--dd-corner, 12px);
    height: var(--dd-edge, 5px);
    cursor: ns-resize;
  }
  .dd-edge-s {
    bottom: 0;
    left: var(--dd-corner, 12px);
    right: var(--dd-corner, 12px);
    height: var(--dd-edge, 5px);
    cursor: ns-resize;
  }
  .dd-edge-w {
    left: 0;
    top: var(--dd-corner, 12px);
    bottom: var(--dd-corner, 12px);
    width: var(--dd-edge, 5px);
    cursor: ew-resize;
  }
  .dd-edge-e {
    right: 0;
    top: var(--dd-corner, 12px);
    bottom: var(--dd-corner, 12px);
    width: var(--dd-edge, 5px);
    cursor: ew-resize;
  }

  .dd-resize-corner {
    position: fixed;
    z-index: 65;
    width: var(--dd-corner, 12px);
    height: var(--dd-corner, 12px);
    background: transparent;
    touch-action: none;
  }
  .dd-resize-edge.debug-show {
    background: rgba(79, 70, 229, 0.22);
  }
  .dd-resize-corner.debug-show {
    background: rgba(225, 29, 72, 0.28);
  }
  .dd-corner-nw {
    top: 0;
    left: 0;
    cursor: nwse-resize;
  }
  .dd-corner-ne {
    top: 0;
    right: 0;
    cursor: nesw-resize;
  }
  .dd-corner-sw {
    bottom: 0;
    left: 0;
    cursor: nesw-resize;
  }
  .dd-corner-se {
    bottom: 0;
    right: 0;
    cursor: nwse-resize;
  }
</style>
