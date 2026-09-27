<script lang="ts">
  // 설정을 바꾸는 동안 학생 화면의 핵심 정보가 읽히도록 보여 주는 구성 미리보기.
  import Sticker from '../common/Sticker.svelte';
  import { paletteOf } from '../../../lib/vote/palette.js';
  let { config } = $props<{ config: any }>();
  const yesno = $derived(config.type === 'yesno');
  const entries = $derived([...config.items].sort((a: any, b: any) => a.number - b.number));
  const firstAgenda = $derived(config.agendas[0]?.text?.trim() || '안건을 적어 주세요');
</script>

<div class="vt-preview-board" aria-label="학생 화면 구성 미리보기">
  <div class="vt-preview-top">
    <strong>{yesno ? firstAgenda : config.title.trim() || '투표 제목을 적어 주세요'}</strong>
    <p>{yesno ? '찬성 또는 반대의 번호를 누릅니다' : `고르고 싶은 ${config.type === 'opinion' ? '항목' : '후보'}의 번호를 누릅니다`}</p>
  </div>
  {#if yesno}
    <div class="vt-preview-choices">
      <div class="vt-preview-choice yes"><b>1</b><span class="vt-preview-symbol">○</span><strong>찬성</strong></div>
      <div class="vt-preview-choice no"><b>2</b><span class="vt-preview-symbol">×</span><strong>반대</strong></div>
    </div>
  {:else if entries.length}
    <div class="vt-preview-list">
      {#each entries as item (item.id)}
        {@const color = paletteOf(item.color)}
        <div class="vt-preview-item" style:--preview-bg={color.bg} style:--preview-line={color.line}>
          <b class="vt-preview-number">{item.number}</b>
          <Sticker {item} type={config.type} size={48} placeholder={config.type === 'candidate' && !item.gender} />
          <span><strong>{item.name.trim() || `${config.type === 'opinion' ? '항목' : '후보'} 이름`}</strong>{#if item.intro?.trim()}<small>{item.intro}</small>{/if}</span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="vt-preview-empty">{config.type === 'opinion' ? '항목' : '후보'}를 추가하면 여기에 보여요.</p>
  {/if}
  <div class="vt-preview-guide">
    <span>키보드 숫자키로 투표</span>
    {#if config.rules.allowAbstain}<span><b>0</b> 기권</span>{/if}
  </div>
</div>

<style>
  .vt-preview-board { display:grid; flex:none; align-content:start; gap:10px; min-width:0; padding:14px; border:1px solid var(--vt-line); border-radius:16px; background:var(--vt-card); }
  .vt-preview-top { display:grid; gap:6px; text-align:center; }
  .vt-preview-top strong { overflow-wrap:anywhere; font-size:clamp(19px, 1.7cqi, 24px); line-height:1.35; }
  .vt-preview-top p { margin:0; color:var(--vt-muted); font-size:14px; font-weight:600; line-height:1.5; word-break:keep-all; }
  .vt-preview-list { display:grid; gap:6px; max-height:min(28dvh, 240px); overflow:auto; padding:3px; }
  .vt-preview-item { display:flex; align-items:center; gap:10px; min-width:0; min-height:60px; padding:6px 9px; border:1px solid var(--preview-line); border-radius:12px; background:color-mix(in srgb, var(--preview-bg) 58%, var(--vt-card)); }
  .vt-preview-number { display:grid; place-items:center; flex:none; width:32px; height:36px; border-radius:10px; background:var(--vt-card); font-size:20px; font-variant-numeric:tabular-nums; }
  .vt-preview-item > span:last-child { display:grid; gap:2px; min-width:0; }
  .vt-preview-item strong { overflow:hidden; font-size:16px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
  .vt-preview-item small { overflow:hidden; color:var(--vt-muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .vt-preview-choices { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
  .vt-preview-choice { display:grid; justify-items:center; align-content:center; gap:8px; min-height:178px; border:1px solid; border-radius:18px; }
  .vt-preview-choice.yes { color:#1f6e57; background:#d7f4e9; border-color:#9dddc4; }
  .vt-preview-choice.no { color:#96491a; background:#ffdfcc; border-color:#f4b68f; }
  .vt-preview-choice b { justify-self:start; margin-left:14px; padding:3px 9px; border-radius:9px; background:#fff; font-size:18px; }
  .vt-preview-symbol { font-family:Arial,sans-serif; font-size:62px; line-height:1; }
  .vt-preview-choice strong { font-size:22px; }
  .vt-preview-empty { margin:0; padding:30px 14px; border:1px dashed var(--vt-line); border-radius:14px; color:var(--vt-muted); text-align:center; font-size:15px; }
  .vt-preview-guide { display:flex; justify-content:center; flex-wrap:wrap; gap:8px 16px; padding-top:13px; border-top:1px solid var(--vt-line); color:var(--vt-muted); font-size:13px; font-weight:700; }
  .vt-preview-guide b { display:inline-grid; place-items:center; width:22px; height:22px; margin-right:3px; border:1px solid var(--vt-line); border-radius:6px; background:var(--vt-card); color:var(--vt-ink); }
</style>
