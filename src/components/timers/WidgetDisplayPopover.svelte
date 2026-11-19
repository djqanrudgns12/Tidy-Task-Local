<script lang="ts">
  import { ArrowUpRight, Minus, Plus, RotateCcw, SlidersHorizontal, Type, X } from 'lucide-svelte';
  import {
    DISPLAY_PRESET_RESET,
    NOTE_SCALE_MAX,
    NOTE_SCALE_MIN,
    NOTE_SCALE_PRESETS,
    TITLE_SCALE_MAX,
    TITLE_SCALE_MIN,
    TITLE_SCALE_PRESETS,
    displayPresetLabel,
    stepDisplayScale,
    type TimerDisplayPreferences,
  } from '../../lib/timers/timerDisplayPreferences.js';

  let {
    displayPrefs,
    compactSheet = false,
    onchange,
    onreset,
    onopenfull,
    onclose,
  } = $props<{
    displayPrefs: TimerDisplayPreferences;
    compactSheet?: boolean;
    onchange: (patch: Partial<TimerDisplayPreferences>) => void;
    onreset: () => void;
    onopenfull: () => void;
    onclose: () => void;
  }>();

  const isCustom = $derived(
    displayPrefs.titleScale !== DISPLAY_PRESET_RESET.titleScale ||
      displayPrefs.noteScale !== DISPLAY_PRESET_RESET.noteScale ||
      displayPrefs.noteAlign !== DISPLAY_PRESET_RESET.noteAlign ||
      displayPrefs.layoutFocus !== DISPLAY_PRESET_RESET.layoutFocus,
  );

  function step(key: 'titleScale' | 'noteScale', delta: number) {
    const next = stepDisplayScale(key, displayPrefs[key], delta);
    if (next !== displayPrefs[key]) onchange({ [key]: next });
  }
</script>

<div
  class="widget-display-popover"
  class:compact-sheet={compactSheet}
  role="dialog"
  aria-label="위젯 글자와 화면 조절"
  data-no-drag
>
  <header class="widget-popover-head">
    <div class="widget-popover-title">
      <Type size={14} />
      <strong>글자와 화면</strong>
      <span class="display-shared-badge">공통</span>
    </div>
    <div class="widget-popover-head-actions">
      {#if isCustom}
        <button
          type="button"
          class="display-reset-btn"
          title="기본값(자동)으로 되돌리기"
          onclick={onreset}><RotateCcw size={12} /><span>기본값</span></button
        >
      {/if}
      <button
        type="button"
        class="widget-popover-close"
        aria-label="글자 조절 창 닫기"
        title="닫기 (Esc)"
        onclick={onclose}><X size={14} /></button
      >
    </div>
  </header>

  <div class="widget-popover-body">
    <div class="display-scale-card">
      <div class="display-scale-head">
        <strong>제목 크기</strong>
        <div class="display-stepper">
          <button
            type="button"
            aria-label="위젯 제목 크기 줄이기"
            disabled={displayPrefs.titleScale <= TITLE_SCALE_MIN}
            onclick={() => step('titleScale', -5)}><Minus size={12} /></button
          >
          <span class:custom={displayPrefs.titleScale !== 100}>{displayPrefs.titleScale}%</span>
          <button
            type="button"
            aria-label="위젯 제목 크기 키우기"
            disabled={displayPrefs.titleScale >= TITLE_SCALE_MAX}
            onclick={() => step('titleScale', 5)}><Plus size={12} /></button
          >
        </div>
      </div>
      <div class="display-chip-row" role="group" aria-label="위젯 제목 크기 빠른 선택">
        {#each TITLE_SCALE_PRESETS as preset}
          <button
            type="button"
            class:selected={displayPrefs.titleScale === preset}
            aria-pressed={displayPrefs.titleScale === preset}
            onclick={() => onchange({ titleScale: preset })}
            >{displayPresetLabel(preset)}</button
          >
        {/each}
      </div>
    </div>

    <div class="display-scale-card">
      <div class="display-scale-head">
        <strong>설명 크기</strong>
        <div class="display-stepper">
          <button
            type="button"
            aria-label="위젯 설명 크기 줄이기"
            disabled={displayPrefs.noteScale <= NOTE_SCALE_MIN}
            onclick={() => step('noteScale', -5)}><Minus size={12} /></button
          >
          <span class:custom={displayPrefs.noteScale !== 100}>{displayPrefs.noteScale}%</span>
          <button
            type="button"
            aria-label="위젯 설명 크기 키우기"
            disabled={displayPrefs.noteScale >= NOTE_SCALE_MAX}
            onclick={() => step('noteScale', 5)}><Plus size={12} /></button
          >
        </div>
      </div>
      <div class="display-chip-row" role="group" aria-label="위젯 설명 크기 빠른 선택">
        {#each NOTE_SCALE_PRESETS as preset}
          <button
            type="button"
            class:selected={displayPrefs.noteScale === preset}
            aria-pressed={displayPrefs.noteScale === preset}
            onclick={() => onchange({ noteScale: preset })}
            >{displayPresetLabel(preset)}</button
          >
        {/each}
      </div>
    </div>

    <div class="display-option-row">
      <span>설명 정렬</span>
      <div class="display-segmented" role="radiogroup" aria-label="위젯 설명 정렬">
        {#each [['auto', '자동'], ['center', '가운데'], ['left', '왼쪽']] as [val, label]}
          <button
            type="button"
            role="radio"
            aria-checked={displayPrefs.noteAlign === val}
            class:selected={displayPrefs.noteAlign === val}
            onclick={() => onchange({ noteAlign: val as TimerDisplayPreferences['noteAlign'] })}
            >{label}</button
          >
        {/each}
      </div>
    </div>

    <div class="display-option-row">
      <span>화면 비중</span>
      <div class="display-segmented" role="radiogroup" aria-label="위젯 화면 비중">
        {#each [['balanced', '균형'], ['note', '설명 강조'], ['timer', '시계 강조']] as [val, label]}
          <button
            type="button"
            role="radio"
            aria-checked={displayPrefs.layoutFocus === val}
            class:selected={displayPrefs.layoutFocus === val}
            onclick={() =>
              onchange({ layoutFocus: val as TimerDisplayPreferences['layoutFocus'] })}
            >{label}</button
          >
        {/each}
      </div>
    </div>
  </div>

  <footer class="widget-popover-foot">
    <button type="button" class="widget-popover-full-btn" onclick={onopenfull}>
      <SlidersHorizontal size={13} />
      <span>소리·시간 전체 설정</span>
      <ArrowUpRight size={13} />
    </button>
  </footer>
</div>
