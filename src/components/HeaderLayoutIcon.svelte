<script>
  /** @type {{variant: 'classic' | 'modern'}} */
  let { variant } = $props();
</script>
<!-- Miniature window layouts make the choice recognizable without generic radio icons. -->
<svg width="23" height="20" viewBox="0 0 26 22" fill="none" aria-hidden="true">
  <rect x="1.5" y="2" width="23" height="18" rx="3" stroke="currentColor" stroke-width="1.3"/>
  {#if variant === 'classic'}
    <path d="M2 9h22" stroke="currentColor" stroke-width="1.1" opacity=".5"/>
    <rect x="5" y="5" width="2" height="2" rx=".6" fill="currentColor"/>
    <rect x="9" y="5" width="2" height="2" rx=".6" fill="currentColor"/>
    <path d="M15 6h5M5 13h15M5 16h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  {:else}
    <path d="M5 6h8M20 6h1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="5" y="10" width="7" height="4" rx="1.2" fill="currentColor" opacity=".22"/>
    <rect x="14" y="10" width="7" height="4" rx="1.2" fill="currentColor" opacity=".22"/>
    <path d="M5 17h15" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
  {/if}
</svg>
