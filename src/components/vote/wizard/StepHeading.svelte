<script lang="ts">
  import { WIZARD_STEPS } from './steps.js';
  let { step, title, lead = '' } = $props<{ step: number; title: string; lead?: string }>();
  const info = $derived(WIZARD_STEPS[step]);
  const Icon = $derived(info.icon);
</script>

<div class="vt-step-heading">
  <span class="vt-heading-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.8} /></span>
  <div class="vt-heading-copy">
    <span class="vt-step-eyebrow">{step + 1}단계 · {info.label}</span>
    <h1 class="vt-step-title">{title}</h1>
    {#if lead}<p class="vt-step-lead">{lead}</p>{/if}
  </div>
</div>
