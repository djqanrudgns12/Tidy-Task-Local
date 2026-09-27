<script lang="ts">
  import { onMount } from "svelte";
  import { Check, ListOrdered, Search, Shuffle, UsersRound, X } from "lucide-svelte";
  import type { Snapshot } from "../../lib/classroom/repository.js";
  import type { Entry } from "../../lib/tournament/engine.js";
  import {
    rosterCandidates, assignRosterEntry, sequentialRosterSlots,
    randomRosterSlots, shuffleSlots,
  } from "../../lib/tournament/rosterSelection.js";
  import "./roster-picker.css";

  let { roster, size, replacing = false, onapply, onclose }: {
    roster: Snapshot;
    size: number;
    replacing?: boolean;
    onapply: (slots: (Entry | null)[]) => Promise<boolean>;
    onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let classId = $state("");
  let source = $state("students");
  let query = $state("");
  let slots = $state<(Entry | null)[]>([]);
  let activeSlot = $state(-1);
  let saving = $state(false);
  let feedback = $state("");
  let saveError = $state("");
  const classroom = $derived(roster.classes.find((c) => c.id === classId));
  const candidates = $derived(rosterCandidates(classroom, source));
  const selected = $derived(new Set(slots.filter((entry) => entry !== null).map((entry) => entry.id)));
  const count = $derived(selected.size);
  const unit = $derived(source === "students" ? "명" : "개 모둠");
  const filtered = $derived(candidates.filter((entry) =>
    entry.name.normalize("NFC").toLocaleLowerCase().includes(query.normalize("NFC").trim().toLocaleLowerCase()),
  ));
  const full = $derived(count === size && (activeSlot < 0 || !slots[activeSlot]));

  function resetSelection() {
    query = "";
    activeSlot = -1;
    saveError = "";
    // An oversized class starts unselected so the teacher can choose who participates.
    slots = candidates.length <= size ? sequentialRosterSlots(candidates, size) : Array(size).fill(null);
    feedback = !candidates.length
      ? `등록된 ${source === "students" ? "학생이" : "모둠이"} 없어요. 다른 학급 또는 참가 단위를 선택해 주세요.`
      : candidates.length > size
        ? `${size}강에 참가할 ${source === "students" ? "학생" : "모둠"}을 골라 주세요.`
        : "명단을 순서대로 넣었어요. 선택과 자리를 바꿀 수 있어요.";
  }
  onMount(() => {
    classId = roster.classes.some((c) => c.id === roster.defaultClassId)
      ? roster.defaultClassId! : roster.classes[0]?.id ?? "";
    resetSelection();
    dialog.showModal();
  });

  function remove(index: number) {
    const entry = slots[index];
    slots = slots.map((value, i) => i === index ? null : value);
    activeSlot = -1;
    saveError = "";
    feedback = `${entry?.name} 선택을 취소했어요.`;
  }
  function choose(entry: Entry) {
    const index = slots.findIndex((value) => value?.id === entry.id);
    if (index >= 0) return remove(index);
    const target = activeSlot >= 0 ? activeSlot : slots.indexOf(null);
    try {
      slots = assignRosterEntry($state.snapshot(slots), entry, target);
      activeSlot = -1;
      saveError = "";
      feedback = `${entry.name} → ${target + 1}번 자리`;
    } catch (e) { feedback = (e as Error).message; }
  }
  function chooseSlot(index: number) {
    if (activeSlot === index) { activeSlot = -1; return; }
    if (activeSlot >= 0 && slots[activeSlot]) {
      const next = [...slots];
      [next[activeSlot], next[index]] = [next[index], next[activeSlot]];
      feedback = `${activeSlot + 1}번과 ${index + 1}번 자리를 바꿨어요.`;
      slots = next;
      activeSlot = -1;
    } else {
      activeSlot = index;
      feedback = `${index + 1}번 자리에 넣을 ${source === "students" ? "학생" : "모둠"}을 명단에서 고르세요.`;
    }
  }
  function randomSelection() {
    slots = randomRosterSlots(candidates, size);
    activeSlot = -1;
    saveError = "";
    feedback = `전체 명단에서 ${Math.min(size, candidates.length)}${unit}을 랜덤으로 골라 배정했어요.`;
  }
  function orderSelection() {
    slots = sequentialRosterSlots(candidates.filter((entry) => selected.has(entry.id)), size);
    activeSlot = -1;
    feedback = `${source === "students" ? "번호" : "명단"}순으로 자리를 배정했어요.`;
  }
  function shuffleSelection() {
    slots = shuffleSlots($state.snapshot(slots));
    activeSlot = -1;
    feedback = "선택한 참가자들의 대진을 섞었어요.";
  }
  function close() {
    if (!saving) {
      dialog.close();
      onclose();
    }
  }
  async function apply() {
    if (saving || !count) return;
    saving = true;
    saveError = "";
    try {
      if (await onapply($state.snapshot(slots))) {
        dialog.close();
        onclose();
      }
      else saveError = "저장하지 못했어요. 선택은 유지했으니 다시 적용해 주세요.";
    } catch (e) { saveError = (e as Error).message; }
    finally { saving = false; }
  }
</script>

<dialog class="tn-roster-picker" bind:this={dialog} aria-labelledby="tn-roster-title" aria-describedby="tn-roster-description"
  oncancel={(e) => { e.preventDefault(); close(); }}>
  <div class="tn-rp-layout">
    <header class="tn-rp-heading">
      <div>
        <span class="tn-eyebrow"><UsersRound size={16} /> 학급 명단 불러오기</span>
        <h2 id="tn-roster-title">참가자 선택 · 자리 배정</h2>
        <p id="tn-roster-description">{size}강 · 최대 {size}{unit}까지 선택할 수 있어요.</p>
      </div>
      <button class="tn-rp-close" aria-label="명단 불러오기 취소" disabled={saving} onclick={close}><X size={20} /></button>
    </header>
    {#if roster.classes.length}
      <div class="tn-rp-sources">
        <label>학급<select bind:value={classId} disabled={saving} onchange={resetSelection}>
          {#each roster.classes as c}<option value={c.id}>{c.name}</option>{/each}
        </select></label>
        <label>참가 단위<select bind:value={source} disabled={saving} onchange={resetSelection}>
          <option value="students">학생</option><option value="groups">모둠</option>
        </select></label>
        <span class="tn-rp-capacity" class:complete={count === size}><strong>{count} / {size}</strong> 선택</span>
      </div>
      <div class="tn-rp-body">
        <section class="tn-rp-list" aria-label="학급 참가자 명단">
          <div class="tn-rp-panel-heading"><h3>{source === "students" ? "학생" : "모둠"} 명단</h3><span>전체 {candidates.length}{unit}</span></div>
          <label class="tn-rp-search"><Search size={17} /><input type="search" aria-label="이름 또는 번호 검색" placeholder={source === "students" ? "이름 또는 번호 검색" : "모둠 이름 검색"} bind:value={query} disabled={saving} /></label>
          <div class="tn-rp-list-actions">
            <button disabled={saving || !candidates.length} onclick={randomSelection}><Shuffle size={15} /> 랜덤으로 {Math.min(size, candidates.length)}{unit} 선택</button>
            <button disabled={saving || !count} onclick={() => { slots = Array(size).fill(null); activeSlot = -1; saveError = ""; feedback = "선택을 모두 취소했어요."; }}>선택 모두 취소</button>
          </div>
          <div class="tn-rp-students">
            {#each filtered as entry (entry.id)}
              {@const assignedIndex = slots.findIndex((value) => value?.id === entry.id)}
              <button class="tn-rp-student" class:chosen={assignedIndex >= 0} aria-pressed={assignedIndex >= 0}
                aria-label={`${entry.name}${assignedIndex >= 0 ? `, ${assignedIndex + 1}번 배정, 선택 취소` : ", 선택"}`}
                disabled={saving || (full && assignedIndex < 0)} onclick={() => choose(entry)}>
                <span class="tn-rp-check">{#if assignedIndex >= 0}<Check size={15} />{/if}</span>
                <span class="tn-rp-name">{entry.name}</span>
                {#if assignedIndex >= 0}<small>{assignedIndex + 1}번</small>{/if}
              </button>
            {:else}<p class="tn-rp-empty">{candidates.length ? "검색 결과가 없어요." : `등록된 ${source === "students" ? "학생이" : "모둠이"} 없어요. 학급 명단에서 먼저 등록해 주세요.`}</p>{/each}
          </div>
          <p class="tn-rp-tip"><span class="tn-rp-tip-full">{full ? "모두 골랐어요. 선택을 취소하거나 배정된 자리를 눌러 다른 참가자로 바꾸세요." : "명단을 누르면 빈자리에 순서대로 들어가요. 다시 누르면 선택이 취소돼요."}</span><span class="tn-rp-tip-compact">{full ? "선택 취소 또는 자리 지정 후 교체" : "눌러서 선택 · 다시 눌러 취소"}</span></p>
        </section>
        <section class="tn-rp-preview" aria-label={`${size}강 자리 배정 미리보기`}>
          <div class="tn-rp-panel-heading"><h3>{size}강 대진 미리보기</h3><span>{size - count}자리 남음</span></div>
          <div class="tn-rp-arrange-actions">
            <button disabled={saving || count < 2} onclick={orderSelection}><ListOrdered size={16} /> {source === "students" ? "번호" : "명단"}순 배정</button>
            <button disabled={saving || count < 2} onclick={shuffleSelection}><Shuffle size={16} /> 대진 섞기</button>
          </div>
          <p class="tn-rp-tip"><span class="tn-rp-tip-full">자리를 먼저 누르면 직접 배정할 수 있어요. 배정된 자리와 다른 자리를 차례로 누르면 서로 바뀌어요.</span><span class="tn-rp-tip-compact">자리 지정 · 두 자리 눌러 교환</span></p>
          <div class="tn-rp-matches">
            {#each Array(size / 2) as _, match}
              <div class="tn-rp-match"><span>{match + 1}경기 <small>{match < size / 4 ? "왼쪽" : "오른쪽"}</small></span>
                {#each [match * 2, match * 2 + 1] as index}
                  <div class="tn-rp-seat" class:target={activeSlot === index}>
                    <button class="tn-rp-seat-select" disabled={saving} aria-pressed={activeSlot === index}
                      aria-label={`${index + 1}번 자리, ${slots[index]?.name ?? "빈자리"}, 배정할 자리 선택`} onclick={() => chooseSlot(index)}>
                      <span class="tn-rp-seat-number">{index + 1}</span><span class:empty={!slots[index]}>{slots[index]?.name ?? "참가자 선택"}</span>
                    </button>
                    {#if slots[index]}<button class="tn-rp-seat-remove" aria-label={`${index + 1}번 ${slots[index]?.name} 선택 취소`} disabled={saving} onclick={() => remove(index)}><X size={15} /></button>{/if}
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </section>
      </div>
    {:else}<p class="tn-rp-empty">등록된 학급이 없어요. 툴킷의 학급 명단에서 먼저 등록해 주세요.</p>{/if}
    <footer class="tn-rp-footer">
      <div><p role={saveError ? "alert" : "status"}>{saveError || feedback}</p>
        {#if count}<small>{replacing ? "적용하면 기존 참가자와 배치를 교체해요. " : ""}{count < size ? `빈 ${size - count}자리는 부전승으로 진행해요.` : "대진표에 표시된 자리 그대로 적용해요."}</small>{/if}
      </div>
      <div class="tn-rp-footer-actions"><button class="tn-secondary" disabled={saving} onclick={close}>취소</button>
        <button class="tn-primary" disabled={saving || !count} onclick={apply}><Check size={17} /> {saving ? "저장 중…" : `${count}${unit} 대진표에 적용`}</button>
      </div>
    </footer>
  </div>
</dialog>
