<script>
  import {
    Calendar,
    Flag,
    Puzzle,
    Snowflake,
    Sparkles,
    Sprout,
    Star,
    Trophy,
  } from 'lucide-svelte';
  import { resolveToneColor } from '../../lib/dday/ddayModel.js';

  /** @type {{ icon?: string, tone?: string, accent?: string, size?: number, dark?: boolean }} */
  let {
    icon = 'flag',
    tone = 'accent',
    accent = '#d97706',
    size = 26,
    dark = false,
  } = $props();

  const iconComponent = $derived.by(() => {
    switch (icon) {
      case 'puzzle': return Puzzle;
      case 'snow': return Snowflake;
      case 'sparkle': return Sparkles;
      case 'sprout': return Sprout;
      case 'star': return Star;
      case 'trophy': return Trophy;
      case 'cal': return Calendar;
      default: return Flag;
    }
  });

  const color = $derived(resolveToneColor(tone, accent));
</script>

<span
  class="dday-bubble"
  data-scheme={dark ? 'dark' : 'light'}
  style="--dd-tone: {color}; --dd-size: {size}px;"
  aria-hidden="true"
>
  {#if iconComponent}
    {@const Icon = iconComponent}
    <Icon size={Math.max(10, Math.round(size * 0.5))} strokeWidth={2.2} />
  {/if}
</span>

<style>
  .dday-bubble {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--dd-size, 26px);
    height: var(--dd-size, 26px);
    border-radius: 37%;
    background: color-mix(in srgb, var(--dd-tone) 15%, #ffffff);
    color: color-mix(in srgb, var(--dd-tone) 84%, #111827);
    transition: background-color 150ms ease, color 150ms ease;
  }

  .dday-bubble[data-scheme='dark'] {
    background: color-mix(in srgb, var(--dd-tone) 24%, #1f2430);
    color: color-mix(in srgb, var(--dd-tone) 82%, #ffffff);
  }
</style>
