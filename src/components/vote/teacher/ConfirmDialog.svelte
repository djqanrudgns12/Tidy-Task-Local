<script lang="ts">
  // 확인창. 투표 단계(mouseOnly)에서는 버튼에 키보드 초점이 가지 않아 학생의 Enter가 확인으로 들어가지 않습니다.
  import { onMount } from 'svelte';
  let { title, detail = '', ok, danger = false, mouseOnly = false, onok, oncancel } = $props<{
    title: string; detail?: string; ok: string; danger?: boolean; mouseOnly?: boolean; onok: () => void; oncancel: () => void;
  }>();
  let cancelBtn = $state<HTMLButtonElement>();
  onMount(() => {
    // 평소에는 안전한 쪽(취소)에 초점을 둡니다.
    if (!mouseOnly) cancelBtn?.focus();
  });
  const tab = $derived(mouseOnly ? -1 : 0);
</script>

<div class="vt-scrim" role="presentation" onpointerup={(e) => { if (e.target === e.currentTarget) oncancel(); }}>
  <div class="vt-confirm vt-card vt-pop-in" role="alertdialog" aria-label={title}>
    <h2>{title}</h2>
    {#if detail}<p>{detail}</p>{/if}
    <div class="vt-confirm-actions">
      <button class="vt-btn" bind:this={cancelBtn} tabindex={tab} onclick={oncancel}>취소</button>
      <button class="vt-btn" class:primary={!danger} class:danger-fill={danger} tabindex={tab} onclick={onok}>{ok}</button>
    </div>
  </div>
</div>

<style>
  .vt-scrim {
    position: absolute;
    inset: 0;
    z-index: 55;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--vt-ink) 28%, transparent);
  }
  .vt-confirm {
    width: min(460px, calc(100% - 40px));
    padding: 26px 26px 20px;
  }
  .vt-confirm h2 {
    margin: 0;
    font-size: 19px;
    line-height: 1.45;
    word-break: keep-all;
  }
  .vt-confirm p {
    margin: 8px 0 0;
    color: var(--vt-muted);
    font-size: 14.5px;
    font-weight: 700;
    line-height: 1.55;
  }
  .vt-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 22px;
  }
</style>
