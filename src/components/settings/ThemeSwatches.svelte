<script>
  // 테마 색 방울 — 15가지 테마를 한눈에 보고 한 번에 고릅니다.
  // (예전의 펼침 목록은 눌러서 열어야 색이 보였습니다)
  // 방울 하나는 그 테마의 바탕 · 구역 · 강조색 세 줄입니다. 고른 방울에는 테두리와 체크가 붙습니다.
  import { tick } from 'svelte';
  import { Check } from 'lucide-svelte';
  import { THEME_GROUPS, TIDY_THEMES } from '../../lib/themes.js';

  /** @type {{ value: string }} */
  let { value = $bindable() } = $props();

  /** @type {HTMLDivElement | undefined} */
  let group = $state();
  const groupLabel = Object.fromEntries(THEME_GROUPS.map((entry) => [entry.id, entry.label]));
  // 고른 테마가 이 목록에 없으면(Tiny Note 전용 테마 등) 첫 방울이 Tab으로 들어오는 자리가 됩니다.
  const focusableId = $derived(TIDY_THEMES.some((theme) => theme.id === value) ? value : TIDY_THEMES[0].id);

  // 고르는 묶음(radiogroup)의 키보드 규칙: 방향키로 옮기면 곧바로 고릅니다.
  /** @param {KeyboardEvent} event @param {number} index */
  function handleKeydown(event, index) {
    const last = TIDY_THEMES.length - 1;
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next < 0) return;
    event.preventDefault();
    value = TIDY_THEMES[next].id;
    tick().then(() => /** @type {HTMLElement | null | undefined} */ (group?.querySelector(`[data-theme-id="${value}"]`))?.focus());
  }
</script>

<div bind:this={group} class="swatches" role="radiogroup" aria-label="테마 색상">
  {#each TIDY_THEMES as theme, index (theme.id)}
    <button
      type="button"
      role="radio"
      class="swatch"
      data-theme-id={theme.id}
      aria-checked={value === theme.id}
      aria-label={theme.label}
      title="{theme.label} · {groupLabel[theme.group]}"
      tabindex={focusableId === theme.id ? 0 : -1}
      style="--c1:{theme.tidy.bg}; --c2:{theme.tidy.section}; --c3:{theme.tidy.accent};"
      onclick={() => { value = theme.id; }}
      onkeydown={(event) => handleKeydown(event, index)}
    >
      <span class="blob"></span>
      <span class="check" aria-hidden="true"><Check size={9} strokeWidth={4} /></span>
    </button>
  {/each}
</div>

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 8px 0;
    justify-items: center;
  }
  .swatch {
    position: relative;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    transition: transform 0.16s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .swatch:hover {
    transform: scale(1.1);
  }
  .swatch:focus-visible {
    outline: 2px solid var(--st-accent);
    outline-offset: 3px;
  }
  .blob {
    display: block;
    width: 100%;
    height: 100%;
    border: 1.5px solid rgba(15, 23, 42, 0.14);
    border-radius: 50%;
    background: linear-gradient(90deg, var(--c1) 0 36%, var(--c2) 36% 66%, var(--c3) 66% 100%);
  }
  .swatch[aria-checked='true'] .blob {
    border-color: var(--c3);
    box-shadow: 0 0 0 2px var(--st-card), 0 0 0 4px var(--c3);
  }
  .check {
    position: absolute;
    right: -4px;
    bottom: -4px;
    display: grid;
    place-items: center;
    width: 15px;
    height: 15px;
    border: 1.5px solid var(--st-card);
    border-radius: 50%;
    background: var(--c3);
    color: #fff;
    opacity: 0;
    transform: scale(0.5);
  }
  .swatch[aria-checked='true'] .check {
    opacity: 1;
    transform: scale(1);
    transition: transform 0.24s cubic-bezier(0.3, 1.5, 0.5, 1), opacity 0.12s;
  }
  @media (prefers-reduced-motion: reduce) {
    .swatch,
    .swatch[aria-checked='true'] .check {
      transition: none;
    }
  }
</style>
