<script>
  import MealIcon from "./MealIcon.svelte";
  let { kind = "meal" } = $props();
</script>

{#if kind === "meal"}<MealIcon size={22} />{:else}
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {#if kind === "school"}
      <path
        d="M4 10 12 5l8 5v10H4Z"
        fill="currentColor"
        fill-opacity=".1"
      /><path
        d="M2.5 10.5 12 4l9.5 6.5M9.5 20v-6h5v6M7 11h.01M17 11h.01M12 2v2"
      />
    {:else if kind === "allergy"}
      <path
        d="M12 3 20 6v5c0 5-4.5 8.5-8 10-3.5-1.5-8-5-8-10V6Z"
        fill="currentColor"
        fill-opacity=".1"
      /><path
        d="M12 16V9m0 4c-3 0-4-2-4-4 3 0 4 2 4 4Zm0-2c0-3 2-4 4-4 0 3-2 4-4 4Z"
      />
    {:else if kind === "style"}
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="4"
        fill="currentColor"
        fill-opacity=".1"
      /><path d="M3 9h18M8 9v11" /><circle
        cx="15"
        cy="14.5"
        r="2.5"
        fill="currentColor"
        fill-opacity=".2"
      />
    {:else if kind === "options"}
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        fill="currentColor"
        fill-opacity=".1"
        stroke="none"
      /><path d="M6 8h12M6 16h12" /><circle
        cx="9"
        cy="8"
        r="2.5"
        fill="var(--meal-surface)"
      /><circle cx="15" cy="16" r="2.5" fill="var(--meal-surface)" />
    {:else}
      <path d="M5 5h14v16H5Z" fill="currentColor" fill-opacity=".1" /><path
        d="M9 3h6v4H9ZM8.5 11h7M8.5 15h4M8.5 18h7"
      />
    {/if}
  </svg>{/if}
