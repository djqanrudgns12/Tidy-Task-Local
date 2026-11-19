<script lang="ts">
  import { X, Plus, Trash2, Info } from 'lucide-svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import { formatStudentLabel } from '../../lib/group-picker/allocation.js';
  import { filterActiveRules } from '../../lib/group-picker/solver.js';

  let {
    open,
    isCustomMode,
    allStudents,
    presentStudents,
    groupNames,
    genderBalance,
    avoidRecentRepeat,
    apartPairs,
    pinnedByGroup,
    onClose,
    onApply,
  } = $props<{
    open: boolean;
    isCustomMode: boolean;
    allStudents: any[];
    presentStudents: any[];
    groupNames: string[];
    genderBalance: boolean;
    avoidRecentRepeat: boolean;
    apartPairs: [string, string][];
    pinnedByGroup: Record<string, number>;
    onClose: () => void;
    onApply: (next: {
      genderBalance: boolean;
      avoidRecentRepeat: boolean;
      apartPairs: [string, string][];
      pinnedByGroup: Record<string, number>;
    }) => void;
  }>();

  let dialogEl = $state<HTMLDialogElement>();
  let localGender = $state(false);
  let localRecent = $state(true);
  let localApart = $state<[string, string][]>([]);
  let localPinned = $state<Record<string, number>>({});

  let pairA = $state('');
  let pairB = $state('');
  let pinStudentId = $state('');
  let pinGroupIdx = $state(0);

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      localGender = genderBalance;
      localRecent = avoidRecentRepeat;
      localApart = apartPairs.map((p: [string, string]) => [...p]);
      localPinned = { ...pinnedByGroup };
      pairA = presentStudents[0]?.id ?? '';
      pairB = presentStudents[1]?.id ?? '';
      pinStudentId = presentStudents[0]?.id ?? '';
      pinGroupIdx = 0;
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  const knownGenderCount = $derived(
    presentStudents.filter((s: any) => s.gender === 'male' || s.gender === 'female').length,
  );
  const canUseGender = $derived(!isCustomMode && knownGenderCount >= 2);
  const ruleSummary = $derived(
    filterActiveRules({
      participants: presentStudents,
      groupCount: groupNames.length,
      apartPairs: localApart,
      pinnedByGroup: localPinned,
    }),
  );

  const studentLabel = (sid: string) => {
    const st = allStudents.find((s: any) => s.id === sid);
    return st ? formatStudentLabel(st, allStudents, true) : '삭제/미등록 학생';
  };

  function addApartPair() {
    if (!pairA || !pairB || pairA === pairB) return;
    const [a, b] = pairA < pairB ? [pairA, pairB] : [pairB, pairA];
    if (localApart.some(([x, y]) => x === a && y === b)) return;
    localApart = [...localApart, [a, b]];
  }

  function removeApartPair(idx: number) {
    localApart = localApart.filter((_, i) => i !== idx);
  }

  function addPinnedRule() {
    if (!pinStudentId) return;
    localPinned = { ...localPinned, [pinStudentId]: pinGroupIdx };
  }

  function removePinnedRule(sid: string) {
    const next = { ...localPinned };
    delete next[sid];
    localPinned = next;
  }

  function submit() {
    onApply({
      genderBalance: canUseGender ? localGender : false,
      avoidRecentRepeat: localRecent,
      apartPairs: localApart,
      pinnedByGroup: localPinned,
    });
    onClose();
  }
</script>

<dialog
  class="gp-dialog"
  bind:this={dialogEl}
  aria-labelledby="gp-constraints-title"
  oncancel={(e) => {
    e.preventDefault();
    onClose();
  }}
>
  <div class="gp-dialog-inner">
    <header class="gp-dialog-head">
      <div>
        <h2 id="gp-constraints-title">교사용 배정 조건 설정</h2>
        <span style="font-size:11.5px; color:var(--gp-muted)">학생 화면(무대)에는 조건 내용이 표시되지 않습니다.</span>
      </div>
      <button type="button" class="gp-icon-btn" aria-label="닫기" onclick={onClose}><X size={18} /></button>
    </header>

    <div class="gp-dialog-body">
      {#if ruleSummary.dormantCount > 0}
        <div class="gp-banner" style="border-radius:12px">
          <span><Info size={14} style="display:inline; vertical-align:-2px; margin-right:4px" />결석 학생이 포함된 조건 {ruleSummary.dormantCount}개는 오늘 건너뛰어요.</span>
        </div>
      {/if}

      <div class="gp-rule-card">
        <div class="gp-rule-row">
          <div>
            <strong style="font-size:13.5px">남녀 성별 균형 맞추기</strong>
            <div style="font-size:11.5px; color:var(--gp-muted)">
              {#if isCustomMode}
                직접 입력 명단에서는 성별 정보가 없어 비활성화돼요.
              {:else if knownGenderCount < 2}
                학급 명단에 성별이 등록된 학생이 2명 미만이에요.
              {:else}
                비균등 정원에서도 앞 모둠 쏠림 없이 고르게 배정해요.
              {/if}
            </div>
          </div>
          <ToolkitSwitch
            checked={canUseGender && localGender}
            label="남녀 성별 균형 맞추기"
            disabled={!canUseGender}
            onchange={(v) => (localGender = v)}
          />
        </div>

        <div class="gp-rule-row" style="padding-top:6px; border-top:1px solid var(--tk-line)">
          <div>
            <strong style="font-size:13.5px">직전 결과와 겹침 줄이기</strong>
            <div style="font-size:11.5px; color:var(--gp-muted)">최근 뽑았던 친구끼리 가급적 다른 모둠으로 섞어요.</div>
          </div>
          <ToolkitSwitch
            checked={localRecent}
            label="직전 결과와 겹침 줄이기"
            onchange={(v) => (localRecent = v)}
          />
        </div>
      </div>

      <div class="gp-rule-card">
        <strong style="font-size:13.5px">같은 모둠 제외 (떨어뜨려 놓기)</strong>
        <div style="display:flex; gap:6px; align-items:center">
          <select class="gp-gname-input" style="height:32px" aria-label="첫 번째 학생" bind:value={pairA}>
            {#each presentStudents as s (s.id)}<option value={s.id}>{formatStudentLabel(s, allStudents, true)}</option>{/each}
          </select>
          <span style="font-size:12px; font-weight:800">↔</span>
          <select class="gp-gname-input" style="height:32px" aria-label="두 번째 학생" bind:value={pairB}>
            {#each presentStudents as s (s.id)}<option value={s.id}>{formatStudentLabel(s, allStudents, true)}</option>{/each}
          </select>
          <button type="button" class="gp-pill-btn active" style="height:32px" disabled={!pairA || !pairB || pairA === pairB} onclick={addApartPair}>
            <Plus size={14} /> 추가
          </button>
        </div>

        {#if localApart.length > 0}
          <div class="gp-tag-list">
            {#each localApart as [a, b], idx (`${a}|${b}`)}
              <span class="gp-tag">
                {studentLabel(a)} ↔ {studentLabel(b)}
                <button type="button" class="gp-mini-icon-btn" style="width:18px;height:18px" aria-label="규칙 삭제" onclick={() => removeApartPair(idx)}>
                  <Trash2 size={11} />
                </button>
              </span>
            {/each}
          </div>
        {/if}
      </div>

      <div class="gp-rule-card">
        <strong style="font-size:13.5px">특정 모둠 사전 고정 (비밀 유지 · 공개 순서는 무작위 섞기)</strong>
        <div style="display:flex; gap:6px; align-items:center">
          <select class="gp-gname-input" style="height:32px" aria-label="고정할 학생" bind:value={pinStudentId}>
            {#each presentStudents as s (s.id)}<option value={s.id}>{formatStudentLabel(s, allStudents, true)}</option>{/each}
          </select>
          <span style="font-size:12px; font-weight:800">→</span>
          <select class="gp-gname-input" style="height:32px" aria-label="고정할 모둠" bind:value={pinGroupIdx}>
            {#each groupNames as name, idx (idx)}<option value={idx}>{name}</option>{/each}
          </select>
          <button type="button" class="gp-pill-btn active" style="height:32px" disabled={!pinStudentId} onclick={addPinnedRule}>
            <Plus size={14} /> 지정
          </button>
        </div>

        {#if Object.keys(localPinned).length > 0}
          <div class="gp-tag-list">
            {#each Object.entries(localPinned) as [sid, gi] (sid)}
              <span class="gp-tag">
                {studentLabel(sid)} → {groupNames[gi] ?? `${gi + 1}모둠`}
                <button type="button" class="gp-mini-icon-btn" style="width:18px;height:18px" aria-label="지정 해제" onclick={() => removePinnedRule(sid)}>
                  <Trash2 size={11} />
                </button>
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <footer class="gp-dialog-foot">
      <button
        type="button"
        class="gp-text-btn"
        onclick={() => {
          localGender = false;
          localRecent = false;
          localApart = [];
          localPinned = {};
        }}
      >조건 모두 지우기</button>
      <div class="gp-toolbar-group">
        <button type="button" class="gp-pill-btn" onclick={onClose}>취소</button>
        <button type="button" class="gp-pill-btn active" onclick={submit}>적용하기</button>
      </div>
    </footer>
  </div>
</dialog>
