<script lang="ts">
  import { onDestroy } from 'svelte';
  import { PALETTE } from '../../lib/scoreboard/model.js';
  import { SHARED_URLS } from '../../lib/group-picker/assets.js';
  import { TICKET_FLIGHT_MS, bezierQuad, easeOutCubic } from '../../lib/group-picker/choreography/suspense.js';

  const COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  type FlightRequest = {
    key: string;
    label: string;
    colorId: string;
    groupIndex: number;
    slotIndex: number;
    fromX: number;
    fromY: number;
  };

  type ActiveFlight = FlightRequest & {
    startedAt: number;
    x: number;
    y: number;
    scale: number;
    rotDeg: number;
    opacity: number;
    accent: string;
  };

  let flights = $state<ActiveFlight[]>([]);
  let rafId = 0;

  /** 목표 슬롯이 현황판 가시 영역 안쪽이면 슬롯으로, 밖이거나 미발견 시 해당 모둠 헤더로 폴백 착지(PRD §2.5). */
  function resolveDestinationRect(groupIndex: number, slotIndex: number): DOMRect | null {
    const manifestEl = document.querySelector('.gp-manifest');
    const mRect = manifestEl?.getBoundingClientRect();
    const slotEl = document.querySelector(`[data-gp-slot="${groupIndex}-${slotIndex}"]`);
    const sRect = slotEl?.getBoundingClientRect();

    if (sRect && sRect.width > 0 && sRect.height > 0) {
      if (
        !mRect ||
        (sRect.top >= mRect.top - 4 &&
          sRect.bottom <= mRect.bottom + 4 &&
          sRect.left >= mRect.left - 4 &&
          sRect.right <= mRect.right + 4)
      ) {
        return sRect;
      }
    }

    const headerEl = document.querySelector(`[data-gp-group-header="${groupIndex}"]`);
    const hRect = headerEl?.getBoundingClientRect();
    if (hRect && hRect.width > 0 && hRect.height > 0) return hRect;
    return mRect && mRect.width > 0 ? mRect : null;
  }

  export function launchFlight(req: FlightRequest) {
    if (flights.some((f) => f.key === req.key)) return;
    const accent = COLOR_MAP[req.colorId] ?? '#4FC2A0';
    flights = [
      ...flights,
      {
        ...req,
        startedAt: performance.now(),
        x: req.fromX,
        y: req.fromY,
        scale: 1,
        rotDeg: 0,
        opacity: 1,
        accent,
      },
    ];
    if (!rafId) tickFlights(performance.now());
  }

  export function clearFlights() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    flights = [];
  }

  function tickFlights(now: number) {
    if (!flights.length) {
      rafId = 0;
      return;
    }
    const next: ActiveFlight[] = [];
    for (const f of flights) {
      const u = (now - f.startedAt) / TICKET_FLIGHT_MS;
      if (u >= 1) continue;

      // 매 rAF 마다 출발/도착 DOM rect 재샘플링 -> 창 리사이즈/시어터 전환 시에도 0px 착지 오차
      const rect = resolveDestinationRect(f.groupIndex, f.slotIndex);
      if (!rect) continue;

      const endX = rect.left + rect.width / 2;
      const endY = rect.top + rect.height / 2;
      const ctrlX = (f.fromX + endX) / 2;
      const hudRect = document.querySelector('.gp-hud-band')?.getBoundingClientRect();
      const hudBottom = hudRect ? hudRect.bottom : 96;
      const ctrlY = Math.max(hudBottom + 18, Math.min(f.fromY, endY) - 68);
      const e = easeOutCubic(u);
      const pt = bezierQuad(
        { x: f.fromX, y: f.fromY },
        { x: ctrlX, y: ctrlY },
        { x: endX, y: endY },
        e,
      );
      const ptPrev = bezierQuad(
        { x: f.fromX, y: f.fromY },
        { x: ctrlX, y: ctrlY },
        { x: endX, y: endY },
        Math.max(0, e - 0.03),
      );
      const dx = pt.x - ptPrev.x;
      const dy = pt.y - ptPrev.y;
      const horiz = Math.max(0.5, Math.abs(dx));
      const slopeDeg = (Math.atan2(dy, horiz) * 180) / Math.PI;
      const dirSign = dx < 0 ? -1 : 1;
      const rotDeg = Math.max(-14, Math.min(14, slopeDeg * 0.28 * dirSign));

      let scale = 1;
      let opacity = 1;
      if (u < 0.25) {
        scale = 0.9 + (u / 0.25) * 0.28;
      } else if (u <= 0.68) {
        scale = 1.18 - ((u - 0.25) / 0.43) * 0.18;
      } else {
        // u > 0.68: 칩 슬롯 안쪽으로 자연스럽게 수축·소멸(0.86 착지 시 직전 칩을 가리지 않음)
        const sp = (u - 0.68) / 0.32;
        scale = 1 - sp * 0.48;
        opacity = 1 - sp;
      }

      next.push({
        ...f,
        x: pt.x,
        y: pt.y,
        scale,
        rotDeg,
        opacity: Math.max(0, opacity),
      });
    }
    flights = next;
    if (next.length) rafId = requestAnimationFrame(tickFlights);
    else rafId = 0;
  }

  onDestroy(clearFlights);
</script>

{#if flights.length > 0}
  <div class="gp-flight-layer" aria-hidden="true">
    {#each flights as f (f.key)}
      <div
        class="gp-flying-ticket"
        style:--ticket-accent={f.accent}
        style:--ticket-bg={`url("${SHARED_URLS['gp-ticket-cream']}")`}
        style:transform={`translate3d(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${f.rotDeg.toFixed(1)}deg) scale(${f.scale.toFixed(3)})`}
        style:opacity={f.opacity}
      >
        <span>{f.label}</span>
      </div>
    {/each}
  </div>
{/if}
