<script lang="ts">
  // ② 내용(PRD 4절): 제목 · 후보/의견 목록(끌어서 순서 = 기호) · 여러 줄 붙여넣기 · 기호 추첨 · 찬반 안건.
  import { tick } from 'svelte';
  import { dndzone } from 'svelte-dnd-action';
  import { Plus, Shuffle, X, Type, Users, ListChecks } from 'lucide-svelte';
  import StepHeading from './StepHeading.svelte';
  import ItemRow from './ItemRow.svelte';
  import LotteryOverlay from './LotteryOverlay.svelte';
  import { LIMITS, nameLimit, itemNoun, withJosa } from '../../../lib/vote/model.js';
  import { addItem, removeItem, setGender, chooseValue, pasteNames, renumber, repairItems } from '../../../lib/vote/assign.js';
  import { drawNumbers } from '../../../lib/vote/lottery.js';
  import { titlePlaceholder } from '../../../lib/vote/templates.js';
  import { randomId } from '../../../lib/vote/random.js';
  let { config, seed, audio, reduced, showProblems, problems, onchange } = $props<{
    config: any; seed: string; audio: any; reduced: boolean; showProblems: boolean; problems: any[]; onchange: (c: any) => void;
  }>();
  const yesno = $derived(config.type === 'yesno');
  const noun = $derived(itemNoun(config.type));
  const titleProblem = $derived(showProblems ? problems.find((p: any) => p.field === 'title') : null);
  const listProblem = $derived(showProblems ? problems.find((p: any) => p.field === 'items' || p.field === 'agendas') : null);
  let note = $state('');
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  function say(text: string) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = ''), 4000);
  }

  const setItems = (items: any[]) => onchange({ ...config, items: repairItems(renumber(items), config.type, seed) });
  function patchItem(id: string, patch: any) {
    onchange({ ...config, items: config.items.map((it: any) => (it.id === id ? { ...it, ...patch } : it)) });
  }
  async function add() {
    if (config.items.length >= LIMITS.itemsMax) return;
    setItems(addItem(config.items, config.type));
    await tick();
    const inputs = document.querySelectorAll<HTMLInputElement>('.vt-row-name');
    inputs[inputs.length - 1]?.focus();
  }
  async function focusNext(index: number) {
    if (index === config.items.length - 1) await add();
    else document.querySelectorAll<HTMLInputElement>('.vt-row-name')[index + 1]?.focus();
  }
  function paste(text: string) {
    const r = pasteNames(config.items, config.type, text, LIMITS.itemsMax, nameLimit(config.type));
    setItems(r.items);
    say(r.dropped.length ? `숫자키가 1~9라 9${config.type === 'opinion' ? '개' : '명'}까지예요 · 넣지 못한 이름: ${r.dropped.join(', ')}` : `${text.split(/\r?\n|\t/).filter((s) => s.trim()).length}개를 한 번에 넣었어요`);
  }
  function choose(id: string, field: 'character' | 'color' | 'pattern', value: string) {
    const r = chooseValue(config.items, id, field, value);
    onchange({ ...config, items: r.items });
    if (r.swappedWith) say(`${r.swappedWith}번 ${withJosa(noun, '과/와')} ${field === 'character' ? '캐릭터를' : field === 'color' ? '색을' : '무늬를'} 바꿨어요`);
  }

  // ── 끌어서 순서 바꾸기(손잡이를 잡을 때만) ──
  let dragDisabled = $state(true);
  let dndItems = $state<any[]>([]);
  let dragging = false;
  $effect(() => {
    const src = config.items;
    if (!dragging) dndItems = src.map((it: any) => ({ ...it }));
  });
  function consider(e: CustomEvent<{ items: any[] }>) {
    dragging = true;
    dndItems = e.detail.items;
  }
  function finalize(e: CustomEvent<{ items: any[] }>) {
    dragging = false;
    dragDisabled = true;
    setItems(e.detail.items.map((it: any) => config.items.find((x: any) => x.id === it.id) ?? it));
  }

  // ── 기호 추첨 ──
  let lottery = $state<{ items: any[]; before: any[] } | null>(null);
  function draw() {
    const before = lottery?.before ?? config.items;
    lottery = { items: drawNumbers(before).items, before };
  }

  // ── 찬반 안건 ──
  const setAgendas = (agendas: any[]) => onchange({ ...config, agendas });
  async function addAgenda() {
    if (config.agendas.length >= LIMITS.agendasMax) return;
    setAgendas([...config.agendas, { id: randomId('a', 6), text: '' }]);
    await tick();
    const inputs = document.querySelectorAll<HTMLInputElement>('.vt-agenda input');
    inputs[inputs.length - 1]?.focus();
  }
</script>

<section class="vt-step">
  <StepHeading step={1} title={yesno ? '투표 제목과 안건을 정해요' : config.type === 'opinion' ? '투표 제목과 항목을 정해요' : '투표 제목과 후보를 정해요'} />
  <div class="vt-step-panel vt-title-panel">
    <label class="vt-field">
      <span class="vt-field-label"><Type size={17} aria-hidden="true" />투표 제목</span>
      <input class="vt-input vt-title-input" value={config.title} maxlength={LIMITS.titleMax} placeholder={titlePlaceholder(config.type)} aria-invalid={!!titleProblem}
        oninput={(e) => onchange({ ...config, title: (e.currentTarget as HTMLInputElement).value })} />
      {#if titleProblem}<p class="vt-problem">{titleProblem.message}</p>{/if}
    </label>
  </div>

  <div class="vt-step-panel vt-list-panel">
  {#if yesno}
    <div class="vt-list-head">
      <h2><ListChecks size={19} aria-hidden="true" />안건 <small>{config.agendas.length} / {LIMITS.agendasMax}</small></h2>
    </div>
    <ul class="vt-agendas">
      {#each config.agendas as agenda, i (agenda.id)}
        {@const bad = showProblems && problems.some((p: any) => p.itemId === agenda.id)}
        <li class="vt-agenda">
          <span class="vt-agenda-no">{i + 1}</span>
          <input class="vt-input" value={agenda.text} maxlength={LIMITS.agendaMax} placeholder="예: 쉬는 시간에 교실에서 공놀이를 해도 될까요?" aria-label={`${i + 1}번 안건`} aria-invalid={bad}
            oninput={(e) => setAgendas(config.agendas.map((a: any) => (a.id === agenda.id ? { ...a, text: (e.currentTarget as HTMLInputElement).value } : a)))}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void addAgenda(); } }} />
          <button class="vt-row-remove" aria-label={`${i + 1}번 안건 지우기`} disabled={config.agendas.length <= 1} onclick={() => setAgendas(config.agendas.filter((a: any) => a.id !== agenda.id))}><X size={17} /></button>
          {#if bad}<p class="vt-problem">{i + 1}번 안건을 적어 주세요</p>{/if}
        </li>
      {/each}
    </ul>
    <button class="vt-btn vt-add" disabled={config.agendas.length >= LIMITS.agendasMax} onclick={addAgenda}><Plus size={17} />안건 추가</button>
    {#if config.agendas.length >= LIMITS.agendasMax}<p class="vt-hint">안건은 5개까지 넣을 수 있어요</p>{/if}
  {:else}
    <div class="vt-list-head">
      <h2><Users size={19} aria-hidden="true" />{noun} <small>{config.items.length} / {LIMITS.itemsMax}</small></h2>
      <button class="vt-btn" disabled={config.items.length < 2 || config.items.some((it: any) => !it.name.trim())} onclick={draw} title="기호(번호)를 무작위로 정해요"><Shuffle size={16} />기호 추첨</button>
    </div>
    <ul class="vt-items" use:dndzone={{ items: dndItems, flipDurationMs: reduced ? 0 : 150, dragDisabled, dropTargetStyle: { outline: 'none' } }} onconsider={consider} onfinalize={finalize}>
      {#each dndItems as item, i (item.id)}
        <li>
          <ItemRow {item} items={config.items} type={config.type} {problems} {showProblems}
            onpatch={(p) => patchItem(item.id, p)}
            ongender={(g) => onchange({ ...config, items: setGender(config.items, item.id, g, seed) })}
            onchoose={(field, value) => choose(item.id, field, value)}
            onremove={() => setItems(removeItem(config.items, item.id))}
            onpaste={paste}
            onenter={() => void focusNext(i)}
            onhandle={() => (dragDisabled = false)} />
        </li>
      {/each}
    </ul>
    <div class="vt-list-foot">
      <button class="vt-btn vt-add" disabled={config.items.length >= LIMITS.itemsMax} onclick={add}><Plus size={17} />{noun} 추가</button>
      <p class="vt-hint">{config.items.length >= LIMITS.itemsMax ? `최대 9${config.type === 'opinion' ? '개' : '명'}` : '여러 줄 붙여넣기 가능'}</p>
    </div>
  {/if}
  {#if listProblem}<p class="vt-problem">{listProblem.message}</p>{/if}
  {#if note}<p class="vt-note" role="status">{note}</p>{/if}
  </div>
</section>

{#if lottery}
  <LotteryOverlay items={lottery.items} type={config.type} {reduced} {audio}
    onaccept={() => { setItems(lottery?.items ?? config.items); lottery = null; say('기호를 새로 정했어요'); }}
    onretry={draw}
    onclose={() => (lottery = null)} />
{/if}

<style>
  .vt-step {
    width: min(1040px, 100%);
    margin: 0 auto;
    display:grid;
    gap:10px;
  }
  .vt-field {
    display: grid;
    gap: 7px;
  }
  .vt-field-label {
    display:flex;
    align-items:center;
    gap:7px;
    color: var(--vt-ink);
    font-size: 16px;
    font-weight: 700;
  }
  .vt-title-input {
    height: 46px;
    font-size: 18px;
    font-weight: 700;
  }
  .vt-title-panel .vt-field { grid-template-columns:110px minmax(0,1fr); align-items:center; }
  .vt-title-panel .vt-problem { grid-column:2; }
  .vt-title-panel .vt-title-input { height:46px; font-size:18px; }
  .vt-list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .vt-list-head h2 {
    display:flex;
    align-items:center;
    gap:7px;
    margin: 0;
    font-size: 18px;
  }
  .vt-list-head h2 small {
    margin-left: 6px;
    color: var(--vt-muted);
    font-size: 14px;
  }
  .vt-items,
  .vt-agendas {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .vt-list-foot {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .vt-add {
    margin-top: 12px;
  }
  .vt-list-foot .vt-add {
    margin-top: 0;
  }
  .vt-hint {
    margin: 0;
    color: var(--vt-muted);
    font-size: 14px;
    font-weight: 600;
  }
  .vt-agenda {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding:10px 12px;
    border:1px solid var(--vt-line);
    border-radius:15px;
    background:color-mix(in srgb,var(--vt-card) 75%,var(--vt-soft));
  }
  .vt-agenda .vt-problem {
    grid-column: 2 / -1;
  }
  .vt-agenda-no {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--vt-soft);
    font-weight: 900;
  }
  .vt-agenda input {
    height: 50px;
    font-size: 17px;
  }
  .vt-row-remove {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--vt-muted);
  }
  .vt-note {
    margin: 14px 0 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--vt-soft);
    font-size: 14px;
    font-weight: 800;
  }
  @container (max-width: 760px) { .vt-agenda { gap:7px; padding:8px; } .vt-title-panel .vt-field { grid-template-columns:1fr; } .vt-title-panel .vt-problem { grid-column:1; } }
</style>
