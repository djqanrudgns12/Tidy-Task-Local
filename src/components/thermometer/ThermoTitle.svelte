<script lang="ts">
  // 온도계 이름을 그 자리에서 바로 고치는 칸(관리 창 제목 줄 · 미니 온도계 공용).
  // 평소에는 글자처럼 보이고, 누르면 바로 입력 칸이 됩니다. 글자를 칠 때마다 저장하므로
  // 다른 창(미니 온도계 ↔ 관리 창)에도 곧바로 비칩니다. Enter·바깥 누르기로 끝, Esc는 고치기 전 이름으로 되돌립니다.
  import { Pencil } from 'lucide-svelte';
  import { cleanLabel } from '../../lib/scoreboard/model.js';
  import { LIMITS } from '../../lib/thermometer/model.js';

  let { value, label, onrename, class: className = '' } = $props<{
    value: string;
    label: string;
    onrename: (title: string) => void;
    class?: string;
  }>();

  let editing = $state(false);
  let draft = $state('');
  let original = '';
  let field = $state<HTMLInputElement>();
  // 고치는 동안에는 저장값이 아니라 친 글자를 그대로 보여 줍니다.
  // 저장값(앞뒤 빈칸을 다듬은 값)으로 칸을 덮으면 커서가 튀고 한글 조합이 끊깁니다.
  const shown = $derived(editing ? draft : value);

  function begin() {
    original = value;
    draft = value;
    editing = true;
  }
  // 글자 위를 누르면 그 자리에 커서가 놓이고, 연필(칸 옆)을 누르면 이름 전체를 골라 바로 새로 쓸 수 있게 합니다.
  // 누르는 그 순간에 처리합니다 — 화면 그리기 뒤로 미루면 그사이 친 글자까지 통째로 골라 버립니다.
  function pickAll(e: MouseEvent) {
    if (!field || e.target === field) return;
    e.preventDefault();
    field.focus();
    field.select();
  }
  function input(e: Event) {
    draft = (e.currentTarget as HTMLInputElement).value;
    // 다 지운 순간은 저장하지 않습니다(빈 이름은 없음 — renameThermometer도 빈 글은 무시).
    const clean = cleanLabel(draft, LIMITS.title);
    if (clean && clean !== value) onrename(clean);
  }
  function finish() {
    if (!editing) return;
    editing = false;
    // 비운 채로 끝내면 고치기 전 이름으로 돌아갑니다(마지막으로 저장된 한두 글자가 남지 않게).
    if (!cleanLabel(draft, LIMITS.title) && value !== original) onrename(original);
  }
  function keydown(e: KeyboardEvent) {
    // 한글 조합 중의 Enter·Esc는 조합을 끝내는 키라 여기서 처리하지 않습니다.
    if (e.isComposing) return;
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      draft = original;
      if (value !== original) onrename(original);
      input.blur();
    }
  }
</script>

<!-- label로 감싸 연필 아이콘을 눌러도 칸으로 들어갑니다. data-no-drag: 미니 온도계의 "빈 곳 끌어 옮기기"가 이 칸을 잡지 않게.
     label의 마우스 처리는 보조(연필을 누르면 전체 선택)일 뿐이고, 키보드는 안의 입력 칸이 그대로 받습니다. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<label class="thermo-title {className}" class:editing data-no-drag title={editing ? '' : '눌러서 이름 바꾸기'}
  onmousedown={pickAll} onclick={(e) => { if (e.target !== field) e.preventDefault(); }}>
  <input bind:this={field} value={shown} maxlength={LIMITS.title} aria-label={label} spellcheck="false" autocomplete="off"
    onfocus={begin} oninput={input} onblur={finish} onkeydown={keydown} />
  <Pencil size={14} aria-hidden="true" />
</label>

<style>
  .thermo-title {
    --thermo-title-accent: var(--th-accent, var(--td-accent, var(--tk-accent)));
    display: inline-flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
    border-radius: 8px;
    cursor: text;
    transition: background-color 0.15s;
  }
  .thermo-title:hover:not(.editing) {
    background: color-mix(in srgb, var(--thermo-title-accent) 9%, transparent);
  }
  input {
    field-sizing: content;
    flex: 0 1 auto;
    width: auto;
    min-width: 1.5em;
    max-width: 100%;
    height: 1.45em;
    margin: 0;
    padding: 0 4px;
    border: 0;
    border-radius: 7px;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-overflow: ellipsis;
    cursor: text;
    user-select: text;
  }
  /* 고치는 중: 밑줄(안쪽 그림자라 부모의 overflow:hidden에 잘리지 않음)과 밝은 바탕으로 "지금 입력 중"을 알립니다.
     툴킷 공용 초점 테두리(.tk-root … :focus-visible, 3px 바깥 테두리)는 부모에 잘리고 밑줄과 겹쳐 여기서 끕니다. */
  .thermo-title input:focus-visible {
    outline: none;
  }
  input:focus {
    background: var(--tk-panel);
    box-shadow: inset 0 -2px 0 var(--thermo-title-accent);
  }
  /* 연필은 자리를 늘 차지하되 가리키거나 키보드로 들어왔을 때만 보입니다(나타날 때 옆 칸이 밀리지 않게). */
  .thermo-title :global(svg) {
    flex: none;
    margin-right: 4px;
    color: var(--thermo-title-accent);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .thermo-title:hover :global(svg) {
    opacity: 0.7;
  }
  .thermo-title.editing :global(svg) {
    opacity: 0;
  }
  @supports not (field-sizing: content) {
    input { width: 8em; }
  }
  @media (prefers-reduced-motion: reduce) {
    .thermo-title, .thermo-title :global(svg) { transition: none; }
  }
</style>
