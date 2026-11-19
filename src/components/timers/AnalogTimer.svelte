<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { pointAt, sectorPath, pointerAngle, advanceAngle } from '../../lib/timers/geometry.js';
  let { remaining, range, editable, density = 'full', onset } = $props<{
    remaining: number;
    range: number;
    editable: boolean;
    density?: 'full' | 'minimal';
    onset: (ms: number) => void;
  }>();
  let svg: SVGSVGElement;
  let preview = $state<number | null>(null);
  let gesture: { pointer: number; angle: number; previous: number } | null = null;
  let gestureActive = $state(false);
  let animFrame = 0;
  let initializedAngle = false;
  const angle = $derived(preview ?? (remaining / (range * 60000)) * 360);
  let displayAngle = $state(untrack(() => (remaining / (range * 60000)) * 360));

  // 정지·준비 상태에서 ±1분/±10초·프리셋 등으로 시간이 바뀔 때만 바늘·부채꼴을 160ms 부드럽게 보간합니다.
  $effect(() => {
    const target = angle;
    const instant = !initializedAngle || !editable || gestureActive;
    initializedAngle = true;
    cancelAnimationFrame(animFrame);
    animFrame = 0;
    if (instant || Math.abs(target - untrack(() => displayAngle)) < 0.4) {
      displayAngle = target;
      return;
    }
    const from = untrack(() => displayAngle);
    const start = performance.now();
    const duration = 160;
    const stepFrame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      displayAngle = from + (target - from) * eased;
      if (t < 1) {
        animFrame = requestAnimationFrame(stepFrame);
      } else {
        animFrame = 0;
        displayAngle = target;
      }
    };
    animFrame = requestAnimationFrame(stepFrame);
  });

  const shownAngle = $derived(gestureActive || !editable ? angle : displayAngle);
  const tip = $derived(pointAt(shownAngle, 84));
  function down(e: PointerEvent) {
    if (!editable || e.button !== 0 || !e.isPrimary) return;
    const p = coords(e);
    if (!p || Math.hypot(p.x - tip.x, p.y - tip.y) > 30) return;
    e.preventDefault();
    gesture = { pointer: e.pointerId, angle, previous: pointerAngle(p.x, p.y) };
    gestureActive = true;
    preview = angle;
    svg.setPointerCapture(e.pointerId);
  }
  function coords(e: PointerEvent) {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : null;
  }
  function move(e: PointerEvent) {
    if (!gesture || gesture.pointer !== e.pointerId) return;
    const p = coords(e);
    if (!p || Math.hypot(p.x - 150, p.y - 150) < 25) return;
    const a = pointerAngle(p.x, p.y);
    gesture.angle = advanceAngle(gesture.angle, gesture.previous, a);
    gesture.previous = a;
    preview = (Math.round((gesture.angle / 360) * range) / range) * 360;
  }
  function cancel() {
    gesture = null;
    gestureActive = false;
    preview = null;
  }
  function up(e: PointerEvent) {
    if (!gesture) return;
    const ms = Math.round(((preview ?? angle) / 360) * range) * 60000;
    gesture = null;
    gestureActive = false;
    preview = null;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    onset(ms);
  }
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cancel();
      return;
    }
    if (!editable) return;
    const v =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? range * 60000
          : e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? remaining + 60000
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
              ? remaining - 60000
              : null;
    if (v != null) {
      e.preventDefault();
      onset(Math.max(0, Math.min(range * 60000, v)));
    }
  }
  $effect(() => {
    range;
    editable;
    cancel();
  });
  onMount(() => {
    const observer = new ResizeObserver(cancel);
    observer.observe(svg);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animFrame);
    };
  });
</script>

<svelte:window onblur={cancel} />
<svg
  bind:this={svg}
  class="analog-clock"
  viewBox="0 0 300 300"
  role="slider"
  tabindex="0"
  aria-label="타이머 바늘, 방향키로 1분씩 설정"
  aria-valuemin="0"
  aria-valuemax={range}
  aria-valuenow={Math.round(((preview ?? angle) / 360) * range)}
  aria-disabled={!editable}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={cancel}
  onlostpointercapture={cancel}
  onkeydown={keys}
>
  <circle cx="150" cy="150" r="146" fill="var(--tk-panel)" stroke="var(--tk-line)" stroke-width="1.5" />
  <circle cx="150" cy="150" r="135" fill="var(--analog-face-bg, #ffffff)" />
  <path d={sectorPath(shownAngle / 360)} fill="var(--analog-sector-fill, var(--tk-peach))" />
  {#each Array(range).fill(0) as _, i}
    {@const major = i % 5 === 0}
    {@const p = pointAt((i / range) * 360, major ? (density === 'minimal' ? 114 : 120) : 124)}
    {@const q = pointAt((i / range) * 360, 130)}
    <line
      x1={p.x}
      y1={p.y}
      x2={q.x}
      y2={q.y}
      stroke={major ? 'var(--tk-muted)' : 'var(--tk-line)'}
      stroke-width={major ? (density === 'minimal' ? 3.4 : 2.6) : 1.2}
      stroke-linecap="round"
    />
  {/each}
  {#if density !== 'minimal'}
    {#each Array(range / 5).fill(0) as _, i}
      {@const p = pointAt((i / (range / 5)) * 360, 99)}
      <text
        x={p.x}
        y={p.y}
        dy=".35em"
        text-anchor="middle"
        fill="var(--tk-ink)"
        font-size="19"
        font-weight="650">{i * 5}</text
      >
    {/each}
  {/if}
  <line
    x1="150"
    y1="150"
    x2={tip.x}
    y2={tip.y}
    stroke="var(--tk-accent)"
    stroke-width={density === 'minimal' ? 6 : 4.5}
    stroke-linecap="round"
  />
  <circle cx="150" cy="150" r={density === 'minimal' ? 11 : 10} fill="var(--tk-accent)" /><circle
    cx="150"
    cy="150"
    r="3.5"
    fill="var(--analog-face-bg, #ffffff)"
  />
  {#if editable}
    <circle
      cx={tip.x}
      cy={tip.y}
      r="5.5"
      fill="var(--analog-face-bg, #ffffff)"
      stroke="var(--tk-accent)"
      stroke-width="2.5"
    />
    <!-- 바늘 끝 조작 반경에만 드래그 예외를 두어, 바늘을 돌릴 때는 시간 조절이 되고 다이얼 나머지를 잡으면 위젯 창이 끌리게 합니다. -->
    <circle cx={tip.x} cy={tip.y} r="30" fill="transparent" data-no-drag />
  {/if}
</svg>
