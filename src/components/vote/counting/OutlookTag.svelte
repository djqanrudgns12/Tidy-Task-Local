<script lang="ts">
  import type { OutlookTag } from '../../../lib/vote/outlook.js';
  let { status = null, reduced = false } = $props<{ status?: OutlookTag | null; reduced?: boolean }>();
</script>

{#if status}
  {#key status.kind + status.label}
    <span class="vt-outlook-tag" class:still={reduced} data-outlook={status.kind} title={status.detail} aria-label={`${status.label}. ${status.detail}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        {#if status.kind === 'certain'}<path d="m2 6 2.5 2.5L10 3" />
        {:else if status.kind === 'close'}<path d="M2 4h8M2 8h8" />
        {:else}<path d="m2 8 3-3 2 2 3-4M7 3h3v3" />{/if}
      </svg>
      {status.label}
    </span>
  {/key}
{/if}

<style>
  .vt-outlook-tag { --tag-ink: #855711; --tag-bg: #fff0cb; display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 5px; min-height: 32px; padding: 5px 9px; border: 1px solid color-mix(in srgb, var(--tag-ink) 28%, var(--tag-bg)); border-radius: 8px; background: var(--tag-bg); color: var(--tag-ink); font-size: 15px; font-weight: 900; line-height: 1.2; white-space: nowrap; vertical-align: middle; box-sizing: border-box; box-shadow: 0 1px 2px #00000009; animation: outlook-in 240ms cubic-bezier(.2,0,0,1) both; }
  .vt-outlook-tag svg { flex: none; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  [data-outlook='ahead'] { --tag-ink: #245992; --tag-bg: #e2eeff; }
  [data-outlook='likely'] { --tag-ink: #704295; --tag-bg: #f0e4fb; }
  [data-outlook='certain'] { --tag-ink: #ffffff; --tag-bg: #276752; border-color: #276752; }
  :global(.vt-root[data-scheme='dark']) .vt-outlook-tag { --tag-ink: #ffe1a1; --tag-bg: #574322; }
  :global(.vt-root[data-scheme='dark']) [data-outlook='ahead'] { --tag-ink: #c5dfff; --tag-bg: #294969; }
  :global(.vt-root[data-scheme='dark']) [data-outlook='likely'] { --tag-ink: #e7cafa; --tag-bg: #503763; }
  :global(.vt-root[data-scheme='dark']) [data-outlook='certain'] { --tag-ink: #113e30; --tag-bg: #a8dec4; border-color: #a8dec4; }
  @keyframes outlook-in { from { opacity: .45; transform: translateY(2px) scale(.97); } to { opacity: 1; transform: none; } }
  .still { animation: none; }
  @media (prefers-reduced-motion: reduce) { .vt-outlook-tag { animation: none; } }
  @media (forced-colors: active) { .vt-outlook-tag { border-color: CanvasText; } }
</style>
