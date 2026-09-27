<script lang="ts">
  // 커스텀 점수판 만들기(PRD 9.1): 이름 → 항목 붙여넣기(한 줄에 하나) → 만들기, 클릭 3번 이하.
  // 입력 중인 내용은 0.5초 멈추면 초안으로 저장되어, 창을 닫았다 열어도 이어서 씁니다.
  import { onMount, onDestroy } from 'svelte';
  import { Sparkles, Minus, Plus } from 'lucide-svelte';
  import { parseItems, itemIssues, TEMPLATES } from '../../lib/scoreboard/items.js';
  import { PALETTE, LIMITS } from '../../lib/scoreboard/model.js';
  import { scoreText } from '../../lib/scoreboard/steps.js';

  let {
    draft = null,
    canCancel = false,
    full = false,
    oncreate,
    oncancel,
    ondraft,
  } = $props<{
    draft?: { title: string; lines: string[]; startScore: number } | null;
    canCancel?: boolean;
    full?: boolean;
    oncreate: (input: { title: string; names: string[]; startScore: number }) => void;
    oncancel?: () => void;
    ondraft: (draft: { title: string; lines: string[]; startScore: number } | null) => void;
  }>();

  let title = $state('');
  let text = $state('');
  let startScore = $state(0);
  let numberCount = $state(10);
  let pendingTemplate = $state<string | null>(null);
  let titleInput = $state<HTMLInputElement>();

  const names = $derived(parseItems(text));
  const issues = $derived(itemIssues(names));
  const canCreate = $derived(!full && !issues.errors.length);

  onMount(() => {
    if (draft) {
      title = draft.title;
      text = draft.lines.join('\n');
      startScore = draft.startScore;
    }
    titleInput?.focus();
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  function changed() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(saveDraft, 500);
  }
  function saveDraft() {
    if (!dirty) return;
    dirty = false;
    const empty = !title.trim() && !text.trim() && !startScore;
    ondraft(empty ? null : { title, lines: text.split('\n').slice(0, 80), startScore: Number(startScore) || 0 });
  }
  onDestroy(() => {
    clearTimeout(timer);
    saveDraft();
  });

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    text = t.make(numberCount).join('\n');
    pendingTemplate = null;
    changed();
  }
  function template(id: string) {
    if (text.trim()) pendingTemplate = id;
    else applyTemplate(id);
  }
  function create() {
    if (!canCreate) return;
    clearTimeout(timer);
    dirty = false;
    oncreate({ title, names, startScore: Number(startScore) || 0 });
  }
  function keys(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      create();
    }
  }
</script>

<!-- Ctrl+Enter(만들기)는 어느 입력칸에서 눌러도 되도록 폼 전체에서 받습니다. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="sb-create" role="form" aria-label="새 점수판 만들기" onkeydown={keys}>
  <div class="sb-create-form">
    <h2><Sparkles size={20} />새 점수판 만들기</h2>
    <label class="sb-field"><span>이름</span><input bind:this={titleInput} bind:value={title} oninput={changed} maxlength={LIMITS.boardTitle} placeholder="새 점수판" /></label>
    <label class="sb-field grow"><span>항목 <small>한 줄에 하나씩 · 엑셀에서 붙여넣어도 돼요</small></span>
      <textarea bind:value={text} oninput={changed} rows="8" placeholder={'청팀\n백팀\n홍팀'} spellcheck="false"></textarea></label>
    <div class="sb-templates" aria-label="빠른 채우기">
      <span>빠른 채우기</span>
      {#each TEMPLATES as t (t.id)}
        {#if t.id === 'numbers'}
          <span class="sb-chip-group"><button class="sb-chip" onclick={() => template(t.id)}>번호 1~{numberCount}</button><button class="sb-chip mini" aria-label="번호 개수 줄이기" onclick={() => (numberCount = Math.max(2, numberCount - 1))}><Minus size={12} /></button><button class="sb-chip mini" aria-label="번호 개수 늘리기" onclick={() => (numberCount = Math.min(LIMITS.items, numberCount + 1))}><Plus size={12} /></button></span>
        {:else}<button class="sb-chip" onclick={() => template(t.id)}>{t.label}</button>{/if}
      {/each}
    </div>
    {#if pendingTemplate}<p class="sb-inline-confirm" role="alert">지금 입력한 항목을 바꿀까요? <button class="sb-chip" onclick={() => applyTemplate(pendingTemplate ?? '')}>바꾸기</button><button class="sb-chip" onclick={() => (pendingTemplate = null)}>취소</button></p>{/if}
    <label class="sb-field inline"><span>시작 점수</span><input class="sb-num-input" type="number" bind:value={startScore} oninput={changed} min={-LIMITS.score} max={LIMITS.score} /></label>
    {#each issues.errors as m}<p class="sb-issue error">{m}</p>{/each}
    {#each issues.notices as m}<p class="sb-issue">{m}</p>{/each}
    {#if full}<p class="sb-issue error">점수판은 {LIMITS.boards}개까지 만들 수 있어요. 새로 만들려면 하나를 지워 주세요.</p>{/if}
    <div class="sb-create-actions">
      {#if canCancel}<button class="sb-tool-btn" onclick={() => { dirty = false; ondraft(null); oncancel?.(); }}>취소</button>{/if}
      <button class="sb-tool-btn primary big" disabled={!canCreate} onclick={create} title="Ctrl+Enter">점수판 만들기{#if names.length}<small>{names.length}개</small>{/if}</button>
    </div>
  </div>
  <div class="sb-create-preview" aria-label="미리보기">
    <p class="sb-preview-title">미리보기 <small>{names.length ? `${Math.min(names.length, LIMITS.items)}개` : '항목을 입력하면 여기에 보여요'}</small></p>
    <div class="sb-preview-grid">
      {#each names.slice(0, LIMITS.items) as n, i}
        <div class="sb-preview-card" style:--pc={PALETTE[i % PALETTE.length].color}><span>{[...n].slice(0, LIMITS.itemName).join('')}</span><b>{scoreText(Number(startScore) || 0)}</b></div>
      {/each}
    </div>
  </div>
</div>
