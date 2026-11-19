<script lang="ts">
  import { X, RotateCcw } from 'lucide-svelte';
  import { formatStudentLabel } from '../../lib/group-picker/allocation.js';

  let {
    open,
    students,
    excludedIds,
    onClose,
    onChangeExcluded,
  } = $props<{
    open: boolean;
    students: { id: string; number?: number; name: string; gender?: string }[];
    excludedIds: string[];
    onClose: () => void;
    onChangeExcluded: (nextExcludedIds: string[]) => void;
  }>();

  let dialogEl = $state<HTMLDialogElement>();
  let localExcluded = $state<Set<string>>(new Set());

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      localExcluded = new Set(excludedIds);
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  const presentCount = $derived(students.filter((s: any) => !localExcluded.has(s.id)).length);

  function toggleStudent(id: string) {
    const next = new Set(localExcluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    localExcluded = next;
  }

  function apply() {
    onChangeExcluded([...localExcluded]);
    onClose();
  }
</script>

<dialog
  class="gp-dialog"
  bind:this={dialogEl}
  aria-labelledby="gp-absence-title"
  oncancel={(e) => {
    e.preventDefault();
    onClose();
  }}
>
  <div class="gp-dialog-inner">
    <header class="gp-dialog-head">
      <h2 id="gp-absence-title">결석 · 참여 학생 관리</h2>
      <button type="button" class="gp-icon-btn" aria-label="닫기" onclick={onClose}><X size={18} /></button>
    </header>

    <div class="gp-rule-row">
      <span style="font-size:13px; font-weight:700; color:var(--gp-muted)">
        전체 {students.length}명 중 <strong style="color:var(--gp-ink)">{presentCount}명</strong> 참여 · 제외 {students.length - presentCount}명
      </span>
      <button
        type="button"
        class="gp-text-btn"
        disabled={localExcluded.size === 0}
        onclick={() => (localExcluded = new Set())}
      ><RotateCcw size={13} /> 모두 출석으로</button>
    </div>

    <div class="gp-dialog-body">
      <div class="gp-check-grid">
        {#each students as st (st.id)}
          {@const absent = localExcluded.has(st.id)}
          <button
            type="button"
            class="gp-student-toggle"
            class:absent
            aria-pressed={!absent}
            onclick={() => toggleStudent(st.id)}
          >
            <input type="checkbox" checked={!absent} tabindex="-1" aria-hidden="true" style="pointer-events:none" />
            <span style="overflow:hidden; text-overflow:ellipsis">
              {formatStudentLabel(st, students, true)}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <footer class="gp-dialog-foot">
      <span style="font-size:11.5px; color:var(--gp-muted)">결석 해제 시 원래 정원 비율이 자동으로 복원됩니다.</span>
      <div class="gp-toolbar-group">
        <button type="button" class="gp-pill-btn" onclick={onClose}>취소</button>
        <button type="button" class="gp-pill-btn active" onclick={apply}>적용하기</button>
      </div>
    </footer>
  </div>
</dialog>
