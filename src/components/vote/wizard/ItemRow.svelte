<script lang="ts">
  import { untrack } from 'svelte';
  import { GripVertical, X, MessageSquarePlus } from 'lucide-svelte';
  import Keycap from '../common/Keycap.svelte';
  import Sticker from '../common/Sticker.svelte';
  import ItemPicker from './ItemPicker.svelte';
  import { nameLimit, LIMITS } from '../../../lib/vote/model.js';
  import { paletteOf } from '../../../lib/vote/palette.js';
  let { item, items, type, problems, showProblems, onpatch, ongender, onchoose, onremove, onpaste, onenter, onhandle } = $props<{
    item: any; items: any[]; type: string; problems: any[]; showProblems: boolean;
    onpatch: (patch: any) => void; ongender: (g: 'm' | 'f') => void; onchoose: (field: 'character' | 'color' | 'pattern', value: string) => void;
    onremove: () => void; onpaste: (text: string) => void; onenter: () => void; onhandle: () => void;
  }>();
  let picker = $state<'character' | 'color' | 'pattern' | null>(null);
  let pickerAnchor = $state<HTMLButtonElement>();
  let introOpen = $state(untrack(() => !!item.intro?.trim()));
  const mine = $derived(problems.filter((p: any) => p.itemId === item.id && (showProblems || p.warning)));
  const nameBad = $derived(mine.some((p: any) => p.field === 'name' && !p.warning));
  const genderBad = $derived(mine.some((p: any) => p.field === 'gender'));
  const c = $derived(paletteOf(item.color));
  function togglePicker(kind: 'character' | 'color' | 'pattern', anchor: HTMLButtonElement) {
    pickerAnchor = anchor;
    picker = picker === kind ? null : kind;
  }
  function paste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (/[\r\n\t]/.test(text.trim())) { e.preventDefault(); onpaste(text); }
  }
</script>

<div class="vt-row vt-c" style:--c-bg={c.bg} style:--c-line={c.line} style:--c-ink={c.ink} data-type={type}>
  <div class="vt-row-main">
    <button class="vt-row-handle" tabindex="-1" aria-label={`${item.number}번 순서 끌어서 바꾸기`} title="끌어서 순서 바꾸기" onpointerdown={onhandle}><GripVertical size={19} /></button>
    <Keycap label={item.number} size={36} />
    <input class="vt-input vt-row-name" value={item.name} maxlength={nameLimit(type)} placeholder={type === 'opinion' ? '항목 이름을 적어 주세요' : '후보 이름을 적어 주세요'}
      aria-label={`${item.number}번 ${type === 'opinion' ? '항목' : '후보'} 이름`} aria-invalid={nameBad}
      oninput={(e) => onpatch({ name: (e.currentTarget as HTMLInputElement).value })}
      onpaste={paste}
      onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onenter(); } }} />
  </div>

  <div class="vt-row-details">
    {#if type === 'candidate'}
      <div class="vt-row-choice">
        <span class="vt-row-label">캐릭터</span>
        <div class="vt-seg" role="radiogroup" aria-label={`${item.number}번 캐릭터 유형`} aria-invalid={genderBad}>
          <button role="radio" aria-checked={item.gender === 'm'} onclick={() => ongender('m')}>남자</button>
          <button role="radio" aria-checked={item.gender === 'f'} onclick={() => ongender('f')}>여자</button>
        </div>
        <span class="vt-row-anchor">
          <button class="vt-row-art" aria-label={`${item.number}번 캐릭터 그림 고르기`} disabled={!item.gender} title={item.gender ? '캐릭터 그림 바꾸기' : '남자 또는 여자를 먼저 골라 주세요'}
            aria-haspopup="dialog" aria-expanded={picker === 'character'} onclick={(e) => togglePicker('character', e.currentTarget)}><Sticker {item} type="candidate" size={34} placeholder={!item.gender} /></button>
          {#if picker === 'character'}<ItemPicker kind="character" {item} {items} {type} anchor={pickerAnchor} onchoose={(v) => { onchoose('character', v); picker = null; }} onclose={() => (picker = null)} />{/if}
        </span>
      </div>
    {:else}
      <div class="vt-row-choice">
        <span class="vt-row-label">무늬</span>
        <span class="vt-row-anchor">
          <button class="vt-row-art" aria-label={`${item.number}번 무늬 고르기`} aria-haspopup="dialog" aria-expanded={picker === 'pattern'} onclick={(e) => togglePicker('pattern', e.currentTarget)}><Sticker {item} type="opinion" size={34} /></button>
          {#if picker === 'pattern'}<ItemPicker kind="pattern" {item} {items} {type} anchor={pickerAnchor} onchoose={(v) => { onchoose('pattern', v); picker = null; }} onclose={() => (picker = null)} />{/if}
        </span>
      </div>
    {/if}
    <div class="vt-row-choice">
      <span class="vt-row-label">색</span>
      <span class="vt-row-anchor">
        <button class="vt-row-color" aria-label={`${item.number}번 색 고르기`} aria-haspopup="dialog" aria-expanded={picker === 'color'} style:background={c.bg} style:border-color={c.line} onclick={(e) => togglePicker('color', e.currentTarget)}><i style:background={c.ink}></i></button>
        {#if picker === 'color'}<ItemPicker kind="color" {item} {items} {type} anchor={pickerAnchor} onchoose={(v) => { onchoose('color', v); picker = null; }} onclose={() => (picker = null)} />{/if}
      </span>
    </div>
    <button class="vt-row-intro-toggle" aria-label={`${item.number}번 한 줄 설명 ${introOpen ? '접기' : '추가'}`} title="한 줄 설명(선택)" aria-expanded={introOpen} onclick={() => (introOpen = !introOpen)}><MessageSquarePlus size={17} aria-hidden="true" /></button>
  </div>
  <button class="vt-row-remove" aria-label={`${item.number}번 지우기`} title="지우기" onclick={onremove}><X size={18} /></button>
  {#if introOpen}
    <label class="vt-row-intro-field"><span class="vt-row-label">한 줄 설명 <small>선택</small></span>
      <input class="vt-input vt-row-intro" value={item.intro} maxlength={LIMITS.introMax} placeholder={type === 'opinion' ? '항목을 간단히 소개해 주세요' : '공약을 간단히 적어 주세요'}
        aria-label={`${item.number}번 한 줄 소개`} oninput={(e) => onpatch({ intro: (e.currentTarget as HTMLInputElement).value })} />
    </label>
  {/if}
  {#if mine.length}<p class="vt-row-problems">{#each mine as p}<span class="vt-problem" class:warning={p.warning}>{p.message}</span>{/each}</p>{/if}
</div>

<style>
  .vt-row { display:grid; grid-template-columns:minmax(0,1fr) auto 32px; align-items:center; gap:8px 12px; min-width:0; padding:10px 12px; border:1px solid var(--vt-line); border-left:4px solid var(--cline); border-radius:14px; background:var(--vt-card); }
  .vt-row-main { display:grid; grid-template-columns:24px 36px minmax(0, 1fr); align-items:center; gap:8px; min-width:0; }
  .vt-row .vt-row-name { min-width:0; height:44px; font-size:17px; font-weight:700; }
  .vt-row-details { display:flex; align-items:center; gap:12px; }
  .vt-row-choice { display:flex; align-items:center; gap:6px; min-height:40px; }
  .vt-row-label { color:var(--vt-muted); font-size:14px; font-weight:700; white-space:nowrap; }
  .vt-row-label small { font-size:12px; font-weight:500; }
  .vt-row-intro-field { display:grid; grid-column:1 / -1; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:9px; min-width:0; padding-top:8px; border-top:1px solid var(--vt-line); }
  .vt-row .vt-row-intro { min-width:0; height:40px; font-size:15px; }
  .vt-row-handle, .vt-row-remove { display:grid; place-items:center; width:40px; height:40px; border:0; border-radius:10px; background:transparent; color:var(--vt-muted); }
  .vt-row-handle { width:24px; cursor:grab; touch-action:none; }
  .vt-row-remove { width:32px; }
  .vt-row-handle:hover, .vt-row-remove:hover { background:var(--vt-soft); color:var(--vt-ink); }
  .vt-row-remove:hover { color:var(--vt-danger); }
  .vt-row-anchor { position:relative; display:inline-flex; }
  .vt-row-art { display:grid; place-items:center; width:40px; height:40px; padding:2px; border:1px solid var(--vt-line); border-radius:11px; background:var(--vt-card); }
  .vt-row-art:hover:not(:disabled) { background:var(--vt-soft); }
  .vt-row-art:disabled { opacity:1; cursor:default; }
  .vt-row-color { display:grid; place-items:center; width:34px; height:34px; border:3px solid; border-radius:50%; }
  .vt-row-color i { width:11px; height:11px; border-radius:50%; }
  .vt-seg { display:inline-flex; gap:2px; padding:3px; border-radius:12px; background:var(--vt-soft); }
  .vt-seg[aria-invalid='true'] { box-shadow:0 0 0 2px var(--vt-danger); }
  .vt-seg button { min-width:48px; height:38px; padding:0 8px; border:0; border-radius:9px; background:transparent; color:var(--vt-muted); font-size:14px; font-weight:700; }
  .vt-seg button[aria-checked='true'] { background:var(--vt-action); color:var(--vt-on-action); }
  .vt-row-intro-toggle { display:grid; place-items:center; width:32px; height:36px; border:1px solid var(--vt-line); border-radius:9px; background:var(--vt-card); color:var(--vt-muted); }
  .vt-row-intro-toggle:hover, .vt-row-intro-toggle[aria-expanded='true'] { background:var(--vt-soft); color:var(--vt-accent); }
  .vt-row-problems { grid-column:1 / -1; margin:0; font-size:14px; line-height:1.45; }
  .vt-row-problems { display:flex; flex-wrap:wrap; gap:4px 12px; }
  @container (max-width: 760px) { .vt-row { grid-template-columns:minmax(0,1fr) 32px; padding:10px; } .vt-row-main { grid-column:1; grid-row:1; } .vt-row-remove { grid-column:2; grid-row:1; } .vt-row-details { grid-column:1 / -1; grid-row:2; flex-wrap:wrap; gap:7px 15px; } }
</style>
