<script lang="ts">
  import { Minus, Plus, Lock, LockOpen, Trash2, Sparkles } from 'lucide-svelte';
  import GroupSymbol from '../scoreboard/GroupSymbol.svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import { PALETTE, cleanLabel } from '../../lib/scoreboard/model.js';
  import {
    GROUP_MAX,
    GROUP_MIN,
    MAX_GROUP_NAME_CHARS,
    recommendAllocations,
    computeRemainderOptions,
    resolveGroupName,
    canAddGroup,
    canRemoveGroup,
    parseCustomNames,
    type GroupSlot,
    type BaseIntent,
  } from '../../lib/group-picker/allocation.js';

  const COLOR_MAP = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

  let {
    presentCount,
    isCustomMode,
    customLines,
    baseIntent,
    capacities,
    locks,
    pinnedFloors,
    groupPool,
    rosterGroups = [],
    keepTotal,
    hasOnePersonDueToSmallN = false,
    disabled = false,
    onApplyRecommendation,
    onSwitchMode,
    onSetGroupCount,
    onSetTargetSize,
    onSelectRemainder,
    onStepGroup,
    onToggleLock,
    onRenameGroup,
    onAddGroup,
    onRemoveGroup,
    onAutoBalance,
    onToggleKeepTotal,
    onUpdateCustomLines,
  } = $props<{
    presentCount: number;
    isCustomMode: boolean;
    customLines: string[];
    baseIntent: BaseIntent;
    capacities: number[];
    locks: (number | null)[];
    pinnedFloors: number[];
    groupPool: GroupSlot[];
    rosterGroups?: { id: string; name: string }[];
    keepTotal: boolean;
    hasOnePersonDueToSmallN?: boolean;
    disabled?: boolean;
    onApplyRecommendation: (groupCount: number) => void;
    onSwitchMode: (mode: 'byGroups' | 'bySize') => void;
    onSetGroupCount: (count: number) => void;
    onSetTargetSize: (size: number) => void;
    onSelectRemainder: (kind: 'absorb' | 'extra') => void;
    onStepGroup: (index: number, delta: 1 | -1, allowOnePerson?: boolean) => { needsConfirm?: boolean };
    onToggleLock: (index: number) => void;
    onRenameGroup: (index: number, nextName: string) => void;
    onAddGroup: () => void;
    onRemoveGroup: (index: number) => void;
    onAutoBalance: () => void;
    onToggleKeepTotal: (v: boolean) => void;
    onUpdateCustomLines: (lines: string[]) => void;
  }>();

  let editingIdx = $state<number | null>(null);
  let editingText = $state('');
  let confirmOnePersonIdx = $state<number | null>(null);
  let customText = $state('');
  let editingCustom = $state(false);

  const recs = $derived(recommendAllocations(presentCount));
  const remInfo = $derived(
    baseIntent.mode === 'bySize' && presentCount >= 4
      ? computeRemainderOptions(presentCount, baseIntent.targetSize)
      : null,
  );
  const currentSum = $derived(capacities.reduce((a: number, b: number) => a + b, 0));
  const sumMatches = $derived(presentCount >= 2 && currentSum === presentCount);
  const diff = $derived(presentCount - currentSum);
  const compactRows = $derived(capacities.length >= 7);
  const parsedCustom = $derived(parseCustomNames(customText));

  function openCustomEditor() {
    customText = customLines.join('\n');
    editingCustom = true;
  }

  function applyCustomEditor() {
    onUpdateCustomLines(parsedCustom.names);
    editingCustom = false;
  }

  function startEditName(index: number, curName: string) {
    editingIdx = index;
    editingText = curName;
  }

  function commitEditName(index: number) {
    if (editingIdx !== index) return;
    const cleaned = cleanLabel(editingText, MAX_GROUP_NAME_CHARS);
    editingIdx = null;
    if (cleaned) onRenameGroup(index, cleaned);
  }

  function tryStepMinus(index: number) {
    const res = onStepGroup(index, -1, false);
    if (res?.needsConfirm) confirmOnePersonIdx = index;
    else confirmOnePersonIdx = null;
  }
</script>

<aside class="gp-sidebar" aria-label="모둠 인원 배정 설정">
  {#if isCustomMode}
    <div class="gp-custom-editor">
      <div class="gp-rule-row">
        <span class="gp-section-title" style="margin:0">직접 입력 명단 ({customLines.length}명)</span>
        {#if !editingCustom && customLines.length > 0}
          <button type="button" class="gp-text-btn" {disabled} onclick={openCustomEditor}>명단 고치기</button>
        {/if}
      </div>
      {#if editingCustom || customLines.length === 0}
        <textarea
          aria-label="참여자 이름 목록 입력"
          placeholder="한 줄에 한 명씩, 또는 쉼표(,)로 구분해 붙여넣으세요"
          bind:value={customText}
        ></textarea>
        {#if parsedCustom.over50}
          <div class="gp-sum-alert" style="font-size:11px; padding:6px 8px">
            <span>입력된 {parsedCustom.totalCount}명 중 최대 50명까지만 적용할 수 있어요.</span>
            <button
              type="button"
              class="gp-auto-fix-btn"
              onclick={() => { customText = parsedCustom.names.join('\n'); }}
            >앞 50명만 남기기</button>
          </div>
        {/if}
        <div class="gp-rule-row">
          <span style="font-size:11px; color:var(--gp-muted)">
            {parsedCustom.names.length}명 인식됨
            {#if parsedCustom.duplicateNames.length > 0}
              · 동명이인은 ①·②로 자동 구분돼요
            {/if}
          </span>
          <button type="button" class="gp-pill-btn active" style="height:30px" onclick={applyCustomEditor}>목록 적용</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if recs.length > 0}
    <div>
      <p class="gp-section-title">스마트 추천 조합</p>
      <div class="gp-rec-chips">
        {#each recs as rec (rec.id)}
          {@const active = baseIntent.mode === 'byGroups' && capacities.length === rec.groupCount && capacities.every((c: number, i: number) => c === rec.capacities[i])}
          <button
            type="button"
            class="gp-rec-chip"
            class:active
            {disabled}
            onclick={() => onApplyRecommendation(rec.groupCount)}
          >{rec.label}</button>
        {/each}
      </div>
    </div>
  {/if}

  <div>
    <div class="gp-seg" role="tablist" aria-label="배분 기준">
      <button
        type="button"
        role="tab"
        aria-selected={baseIntent.mode === 'byGroups'}
        class:active={baseIntent.mode === 'byGroups'}
        {disabled}
        onclick={() => onSwitchMode('byGroups')}
      >모둠 수 기준</button>
      <button
        type="button"
        role="tab"
        aria-selected={baseIntent.mode === 'bySize'}
        class:active={baseIntent.mode === 'bySize'}
        disabled={disabled || presentCount < 4}
        onclick={() => onSwitchMode('bySize')}
      >한 모둠 인원</button>
    </div>
  </div>

  {#if baseIntent.mode === 'byGroups'}
    <div class="gp-global-stepper">
      <span>전체 모둠 수</span>
      <div class="gp-step-ctrl">
        <button
          type="button"
          class="gp-round-btn"
          aria-label="모둠 수 줄이기"
          disabled={disabled || capacities.length <= GROUP_MIN}
          onclick={() => onSetGroupCount(capacities.length - 1)}
        ><Minus size={14} /></button>
        <span class="gp-val">{capacities.length}개</span>
        <button
          type="button"
          class="gp-round-btn"
          aria-label="모둠 수 늘리기"
          disabled={disabled || capacities.length >= Math.min(GROUP_MAX, Math.max(2, Math.floor(presentCount / (presentCount < 4 ? 1 : 2))))}
          onclick={() => onSetGroupCount(capacities.length + 1)}
        ><Plus size={14} /></button>
      </div>
    </div>
  {:else}
    <div class="gp-global-stepper">
      <span>한 모둠 목표</span>
      <div class="gp-step-ctrl">
        <button
          type="button"
          class="gp-round-btn"
          aria-label="목표 인원 줄이기"
          disabled={disabled || baseIntent.targetSize <= 2}
          onclick={() => onSetTargetSize(baseIntent.targetSize - 1)}
        ><Minus size={14} /></button>
        <span class="gp-val">{baseIntent.targetSize}명</span>
        <button
          type="button"
          class="gp-round-btn"
          aria-label="목표 인원 늘리기"
          disabled={disabled || baseIntent.targetSize >= Math.max(2, Math.floor(presentCount / 2))}
          onclick={() => onSetTargetSize(baseIntent.targetSize + 1)}
        ><Plus size={14} /></button>
      </div>
    </div>

    {#if remInfo && remInfo.hasRemainder}
      <div class="gp-rem-cards" role="radiogroup" aria-label="남은 인원 처리 선택">
        {#each remInfo.options as opt (opt.kind)}
          <button
            type="button"
            class="gp-rem-card"
            role="radio"
            aria-checked={baseIntent.remainderChoice === opt.kind || (remInfo.options.length === 1)}
            class:active={baseIntent.remainderChoice === opt.kind || (remInfo.options.length === 1)}
            {disabled}
            onclick={() => onSelectRemainder(opt.kind === 'extra' ? 'extra' : 'absorb')}
          >
            <small>{opt.badge}</small>
            <span>{opt.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}

  {#if capacities.length >= 2}
    <div class="gp-group-section">
      <div class="gp-sidebar-row-foot">
        <span class="gp-section-title" style="margin:0">모둠별 정원 (이름 더블클릭 편집)</span>
      </div>

      <div class="gp-group-list" class:compact={compactRows}>
        {#each capacities as cap, idx (idx)}
          {@const slot = groupPool[idx]}
          {@const locked = locks[idx] != null}
          {@const colorHex = COLOR_MAP[slot?.color ?? 'mint'] ?? '#4FC2A0'}
          {@const gName = resolveGroupName(slot, idx, rosterGroups)}
          {@const removable = canRemoveGroup({ capacities, locks, pinnedFloors, index: idx })}

          <div class="gp-group-row" class:locked>
            <GroupSymbol symbol={slot?.symbol ?? 'star'} color={colorHex} size={16} />
            {#if editingIdx === idx}
              <input
                class="gp-gname-input"
                maxlength={MAX_GROUP_NAME_CHARS}
                bind:value={editingText}
                aria-label={`${idx + 1}모둠 이름 입력`}
                onkeydown={(e) => {
                  if (e.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter') { e.preventDefault(); commitEditName(idx); }
                  if (e.key === 'Escape') { e.preventDefault(); editingIdx = null; }
                }}
                onblur={() => commitEditName(idx)}
              />
            {:else}
              <button
                type="button"
                class="gp-gname-btn"
                title={`${gName} · 더블클릭해서 이름 바꾸기`}
                ondblclick={() => !disabled && startEditName(idx, gName)}
              >{gName}</button>
            {/if}

            <button
              type="button"
              class="gp-mini-icon-btn"
              class:locked
              {disabled}
              aria-label={locked ? `${gName} 정원 잠금 풀기` : `${gName} 정원 잠그기`}
              title={locked ? '잠금 풀기' : '이 모둠 인원수 고정'}
              onclick={() => onToggleLock(idx)}
            >
              {#if locked}<Lock size={13} />{:else}<LockOpen size={13} />{/if}
            </button>

            <button
              type="button"
              class="gp-round-btn"
              aria-label={`${gName} 인원 빼기`}
              disabled={disabled || locked || cap <= Math.max(1, pinnedFloors[idx] ?? 0)}
              onclick={() => tryStepMinus(idx)}
            ><Minus size={12} /></button>

            <span class="gp-val">{cap}</span>

            <button
              type="button"
              class="gp-round-btn"
              aria-label={`${gName} 인원 더하기`}
              disabled={disabled || locked}
              onclick={() => { confirmOnePersonIdx = null; onStepGroup(idx, 1, true); }}
            ><Plus size={12} /></button>

            {#if capacities.length > GROUP_MIN}
              <button
                type="button"
                class="gp-mini-icon-btn"
                aria-label={`${gName} 삭제`}
                disabled={disabled || !removable}
                title={removable ? '모둠 삭제' : '잠금이 없어야 삭제할 수 있어요'}
                onclick={() => onRemoveGroup(idx)}
              ><Trash2 size={12} /></button>
            {/if}
          </div>

          {#if confirmOnePersonIdx === idx}
            <div class="gp-one-person-confirm" role="alert">
              <span>{gName}을 <strong>1인 모둠</strong>으로 줄일까요? 혼자 남을 수 있어요.</span>
              <div style="display:flex; gap:6px; justify-content:flex-end">
                <button type="button" class="gp-pill-btn" style="height:26px; font-size:11px" onclick={() => (confirmOnePersonIdx = null)}>취소</button>
                <button
                  type="button"
                  class="gp-pill-btn active"
                  style="height:26px; font-size:11px"
                  onclick={() => {
                    onStepGroup(idx, -1, true);
                    confirmOnePersonIdx = null;
                  }}
                >1명 허용</button>
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <div class="gp-sidebar-row-foot">
        <button
          type="button"
          class="gp-text-btn"
          disabled={disabled || !canAddGroup({ capacities, locks, pinnedFloors, n: presentCount })}
          onclick={onAddGroup}
        >+ 모둠 추가</button>
        <div style="display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; color:var(--gp-muted)">
          <span>합계 유지</span>
          <ToolkitSwitch checked={keepTotal} label="한 모둠 인원을 바꿀 때 전체 합계 유지" {disabled} onchange={onToggleKeepTotal} />
        </div>
      </div>
    </div>
  {/if}

  <div class="gp-sum-footer">
    {#if presentCount < 2}
      <div class="gp-sum-alert">
        <span>최소 2명 이상이어야 모둠을 나눌 수 있어요 (현재 {presentCount}명)</span>
      </div>
    {:else if sumMatches}
      <div class="gp-sum-quiet">
        <span>참여 {presentCount}명 · 배분 완료</span>
        {#if hasOnePersonDueToSmallN}
          <span style="display:block; margin-top:2px; font-size:11px; color:var(--gp-accent)">
            <Sparkles size={11} style="display:inline; vertical-align:-1px" /> 인원이 적어 1인 모둠이 포함돼요
          </span>
        {/if}
      </div>
    {:else}
      <div class="gp-sum-alert" role="status">
        <span>
          배정 합계 {currentSum}명 ≠ 참여 {presentCount}명
          ({diff > 0 ? `${diff}명 부족` : `${Math.abs(diff)}명 초과`})
        </span>
        <button type="button" class="gp-auto-fix-btn" {disabled} onclick={onAutoBalance}>
          {locks.some((l: number | null) => l != null) ? '잠금 제외 자동 맞추기' : '나머지 자동 맞추기'}
        </button>
      </div>
    {/if}
  </div>
</aside>
