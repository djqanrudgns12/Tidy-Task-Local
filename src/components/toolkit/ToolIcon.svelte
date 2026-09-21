<script lang="ts">
  let { kind, size = 32 } = $props<{ kind: string; size?: number }>();
  const colors: Record<string, [string, string]> = {
    timer: ['#e3effb', '#426f9e'],
    picker: ['#f1e7fa', '#8661a4'],
    noticeboard: ['#e5f1e6', '#4c8064'],
    tournament: ['#fff0d3', '#a9782c'],
    'focus-bell': ['#fbe6de', '#b96e53'],
    roster: ['#e0f1f0', '#47817e'],
    external: ['#e6eafb', '#646eaa'],
    settings: ['#3d5878', '#ffffff'],
  };
  const palette = $derived(colors[kind] ?? colors.settings);
</script>

<svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" class="toolkit-art-icon">
  {#if kind !== 'settings'}
  <rect x="2" y="3" width="36" height="36" rx="11" fill="#243b53" opacity=".09" />
  <rect x="2" y="1.5" width="36" height="36" rx="11" fill={palette[0]} />
  <path d="M12 3.5h16" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".8" />
  {/if}
  <g stroke={palette[1]} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    {#if kind === 'timer'}
      <path d="M17 7h6m-3 0v3m8 2 2-2" />
      <circle cx="20" cy="22" r="11" fill="#fffdf8" />
      <path d="M20 14v8l5 3" /><circle cx="20" cy="22" r="1.4" fill={palette[1]} stroke="none" />
      <path d="M13 22h1m12 0h1m-7 7v1" opacity=".5" />
    {:else if kind === 'picker'}
      <rect x="10" y="10" width="21" height="22" rx="5" fill="#fffdf8" transform="rotate(-9 20 21)" />
      <g fill={palette[1]} stroke="none"><circle cx="15" cy="16" r="1.8" /><circle cx="25" cy="15" r="1.8" /><circle cx="20" cy="21" r="1.8" /><circle cx="16" cy="27" r="1.8" /><circle cx="26" cy="26" r="1.8" /></g>
    {:else if kind === 'noticeboard'}
      <path d="M20 12c-4-3-8-3-12-2v21c4-1 8-1 12 2 4-3 8-3 12-2V10c-4-1-8-1-12 2Z" fill="#fffdf8" />
      <path d="M20 12v21m-8-17 4 1m-4 4 4 1m8-5 4-1m-4 6 4-1" />
      <path d="M27 10v7l2-1 2 1v-7" fill="#d4a452" stroke="none" />
    {:else if kind === 'tournament'}
      <path d="M13 12H8v5c0 4 3 6 7 6m12-11h5v5c0 4-3 6-7 6" />
      <path d="M13 9h14v10a7 7 0 0 1-14 0V9Z" fill="#f6d47c" />
      <path d="M20 26v5m-6 1h12" /><path d="m20 13 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4Z" fill="#fffdf8" stroke="none" />
    {:else if kind === 'focus-bell'}
      <path d="M17 30a3 3 0 0 0 6 0m-3-21V7" />
      <path d="M11 26c3-3 2-7 3-11a6 6 0 0 1 12 0c1 4 0 8 3 11H11Z" fill="#fff3cf" />
      <path d="M9 12 7 16m24-4 2 4m-15-1c-1 1-1 3-1 5" />
    {:else if kind === 'roster'}
      <circle cx="14" cy="15" r="4" fill="#fffdf8" /><circle cx="27" cy="16" r="3.5" fill="#b2d8d1" />
      <path d="M22 30v-3a7 7 0 0 0-14 0v3h14Z" fill="#fffdf8" /><path d="M25 23c5-1 8 2 8 6v1h-7" fill="#b2d8d1" />
    {:else if kind === 'external'}
      <path d="M11 14h7l3 3h10v13H9V16a2 2 0 0 1 2-2Z" fill="#fffdf8" />
      <path d="m20 22 10-11m-7 0h7v7" stroke-width="2.4" />
    {:else}
      <path d="m17 8-.8 4-2.4 1.4-3.8-1.3-3 5.2 3 2.7v2.8l-3 2.7 3 5.2 3.8-1.3 2.4 1.4.8 4h6l.8-4 2.4-1.4 3.8 1.3 3-5.2-3-2.7V20l3-2.7-3-5.2-3.8 1.3-2.4-1.4L23 8h-6Z M24.5 21.5a4.5 4.5 0 1 0-9 0 4.5 4.5 0 1 0 9 0Z" fill="currentColor" fill-rule="evenodd" stroke="none" transform="translate(0 -1.5)" />
    {/if}
  </g>
</svg>
