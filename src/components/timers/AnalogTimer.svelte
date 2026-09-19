<script lang="ts">
  import { onMount } from 'svelte';
  import { pointAt, sectorPath, pointerAngle, advanceAngle } from '../../lib/timers/geometry.js';
  let { remaining, range, editable, onset } = $props<{
    remaining: number;
    range: number;
    editable: boolean;
    onset: (ms: number) => void;
  }>();
  let svg: SVGSVGElement;
  let preview = $state<number | null>(null);
  let gesture: { pointer: number; angle: number; previous: number } | null = null;
  const angle = $derived(preview ?? (remaining / (range * 60000)) * 360),
    tip = $derived(pointAt(angle, 84));
  function down(e: PointerEvent) {
    if (!editable || e.button !== 0 || !e.isPrimary) return;
    const p = coords(e);
    if (!p || Math.hypot(p.x - tip.x, p.y - tip.y) > 30) return;
    e.preventDefault();
    gesture = { pointer: e.pointerId, angle, previous: pointerAngle(p.x, p.y) };
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
    preview = null;
  }
  function up(e: PointerEvent) {
    if (!gesture) return;
    const ms = Math.round(((preview ?? angle) / 360) * range) * 60000;
    gesture = null;
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
    return () => observer.disconnect();
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
  <circle cx="150" cy="150" r="146" fill="#fff0cb" stroke="#ecdba8" stroke-width="1.5" />
  <circle cx="150" cy="150" r="135" fill="white" />
  <path d={sectorPath(angle / 360)} fill="var(--tk-peach)" />
  {#each Array(range).fill(0) as _, i}
    {@const major = i % 5 === 0}
    {@const p = pointAt((i / range) * 360, major ? 120 : 124)}
    {@const q = pointAt((i / range) * 360, 130)}
    <line
      x1={p.x}
      y1={p.y}
      x2={q.x}
      y2={q.y}
      stroke={major ? '#526a65' : '#b8c6be'}
      stroke-width={major ? 2.6 : 1.2}
      stroke-linecap="round"
    />
  {/each}
  {#each Array(range / 5).fill(0) as _, i}
    {@const p = pointAt((i / (range / 5)) * 360, 99)}
    <text
      x={p.x}
      y={p.y}
      dy=".35em"
      text-anchor="middle"
      fill="#304b47"
      font-size="19"
      font-weight="650">{i * 5}</text
    >
  {/each}
  <line
    x1="150"
    y1="150"
    x2={tip.x}
    y2={tip.y}
    stroke="#287768"
    stroke-width="4.5"
    stroke-linecap="round"
  />
  <circle cx="150" cy="150" r="10" fill="#287768" /><circle
    cx="150"
    cy="150"
    r="3.5"
    fill="white"
  />
  {#if editable}<circle
      cx={tip.x}
      cy={tip.y}
      r="5.5"
      fill="white"
      stroke="#287768"
      stroke-width="2.5"
    />{/if}
</svg>
